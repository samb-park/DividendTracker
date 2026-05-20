import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildPortfolioContext, callOpenAIWithMeta } from "@/lib/openai";
import {
  AI_OUTPUT_RULES,
  RULEBOOK_GUARDRAILS,
  RULEBOOK_PROMPT_VERSION,
  sanitizeAiOutput,
} from "@/lib/ai-output-rules";
import { checkAiThrottle } from "@/lib/ai-throttle";
import { recordAiCall } from "@/lib/audit/aiCallLog";
import { ensureCurrentRulebookVersion } from "@/lib/audit/rulebookVersionOnce";
import { validateAiOutput } from "@/lib/ai-validation/validateAiOutput";

export const dynamic = "force-dynamic";

const ROUTE = "ai/chat";

interface ChatMessage { role: string; content: string; }

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Per-user salted hash of the user's chat message. The salt is the cuid in
 * session.user.id, which is server-issued and unguessable — sufficient to
 * prevent cross-user hash collisions and rainbow-table lookups while keeping
 * the raw message out of storage.
 */
function userQueryHashOf(userId: string, trimmedMessage: string): string {
  return sha256Hex(`${userId}:${trimmedMessage}`);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { message, history = [] } = (await req.json()) as { message: string; history?: ChatMessage[] };
  if (!message?.trim()) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const trimmedMessage = message.trim();
  const userQueryHash = userQueryHashOf(userId, trimmedMessage);

  // Fire-and-forget: register the active rulebook version on first AI call of
  // this process. Memoised internally; never blocks the route.
  void ensureCurrentRulebookVersion();

  const throttle = checkAiThrottle(userId);
  if (!throttle.allowed) {
    void recordAiCall({
      userId,
      route: ROUTE,
      provider: "n/a",
      model: "n/a",
      rulebookVersion: RULEBOOK_PROMPT_VERSION,
      systemPromptHash: "n/a",
      userQueryHash,
      status: "throttled",
      httpStatus: 429,
      durationMs: 0,
    });
    return NextResponse.json(
      { error: `AI 요청이 너무 많습니다. ${throttle.retryAfterSec}초 후 다시 시도하세요.` },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSec) } },
    );
  }

  const context = await buildPortfolioContext(userId);
  const parsed = JSON.parse(context) as { investorProfile?: { age?: number; retirementAge?: number; yearsToRetirement?: number; annualIncomeCAD?: number; rrspRoomEstimate?: number } };
  const profile = parsed.investorProfile;
  const notes: string[] = [];
  if (profile?.retirementAge && profile?.yearsToRetirement !== undefined)
    notes.push(`${profile.retirementAge}세 은퇴 목표 (${profile.yearsToRetirement}년 남음)`);
  if (profile?.annualIncomeCAD)
    notes.push(`연소득 $${profile.annualIncomeCAD.toLocaleString()} CAD (RRSP 추정 한도 ~$${profile.rrspRoomEstimate?.toLocaleString()})`);
  const profileNote = notes.length > 0 ? ` 투자자 정보: ${notes.join(", ")}. 이를 바탕으로 맞춤 조언.` : "";

  const systemPrompt = [
    "캐나다 배당 투자 전문 어시스턴트. TFSA/RRSP/FHSA/NON_REG 계좌 전문가. SANGBONG INVESTMENT RULEBOOK v4.4.2 기준으로만 응답하세요.",
    "포트폴리오 데이터의 'rulebook' 섹션 값을 그대로 활용하고, 영문 필드명은 한국어 라벨로 바꾸세요.",
    "",
    RULEBOOK_GUARDRAILS,
    "",
    "사용자 메시지가 행동 제안(매수·매도·비중 변경 등)을 담고 있으면 반드시 'Accept' / 'Reject' / 'Modify' 중 하나로 분류하고, 분류 사유와 룰북 §-조항을 답변에 포함하세요. 룰북과 충돌하면 무조건 Reject.",
    "시장 전망·뉴스·심리·예측을 이유로 룰북을 수정·override 하지 마세요.",
    "",
    AI_OUTPUT_RULES,
    "",
    `간결하게 답변 (3-5문장). 비중은 항상 'core' 또는 'total' 기준 명시. 마크다운 별표 금지.${profileNote}`,
    "포트폴리오 데이터:",
    context,
  ].join("\n");

  const systemPromptHash = sha256Hex(systemPrompt);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6),
    { role: "user", content: trimmedMessage },
  ];

  const callStarted = Date.now();
  const result = await callOpenAIWithMeta(messages, { maxTokens: 400 });
  const durationMs = Date.now() - callStarted;

  if (!result.ok) {
    console.error("AI chat error:", result.error.message);
    void recordAiCall({
      userId,
      route: ROUTE,
      provider: result.meta.provider,
      model: result.meta.model,
      rulebookVersion: RULEBOOK_PROMPT_VERSION,
      systemPromptHash,
      userQueryHash,
      contextSizeChars: context.length,
      status: "upstream_error",
      httpStatus: result.error.httpStatus ?? 500,
      durationMs,
      upstreamDurationMs: result.meta.upstreamDurationMs,
      errorMessage: result.error.message,
    });
    return NextResponse.json({ error: "AI 응답을 생성할 수 없습니다. 잠시 후 다시 시도해주세요." });
  }

  const reply = sanitizeAiOutput(result.content);
  const validation = validateAiOutput(ROUTE, result.rawResponse, reply, {
    rulebookVersion: RULEBOOK_PROMPT_VERSION,
  });

  void recordAiCall({
    userId,
    route: ROUTE,
    provider: result.meta.provider,
    model: result.meta.model,
    rulebookVersion: RULEBOOK_PROMPT_VERSION,
    systemPromptHash,
    userQueryHash,
    contextSizeChars: context.length,
    status: "ok",
    httpStatus: result.meta.httpStatus,
    durationMs,
    upstreamDurationMs: result.meta.upstreamDurationMs,
    promptTokens: result.meta.promptTokens,
    completionTokens: result.meta.completionTokens,
    totalTokens: result.meta.totalTokens,
    // recordAiCall enforces AI_AUDIT_STORE_RAW=true to actually persist this.
    rawResponse: result.rawResponse,
    sanitizedResponse: reply,
    validatedAt: new Date(),
    validationStatus: validation.ok ? "pass" : "violation",
    violationCodes: validation.violations.map((v) => v.code),
    errorMessage: validation.ok
      ? undefined
      : validation.violations.map((v) => `${v.code}: ${v.reason}`).join("; "),
  });

  return NextResponse.json({ reply });
}
