import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

import { auth } from "@/auth";
import {
  buildPortfolioContext,
  callOpenAIWithMeta,
  getCachedAiResult,
  saveAiResult,
} from "@/lib/openai";
import {
  AI_OUTPUT_RULES,
  BRIEFING_STRUCTURE,
  RULEBOOK_GUARDRAILS,
  RULEBOOK_PROMPT_VERSION,
  sanitizeAiOutput,
} from "@/lib/ai-output-rules";
import { checkAiThrottle } from "@/lib/ai-throttle";
import { recordAiCall } from "@/lib/audit/aiCallLog";
import { ensureCurrentRulebookVersion } from "@/lib/audit/rulebookVersionOnce";
import { validateAiOutput } from "@/lib/ai-validation/validateAiOutput";

export const dynamic = "force-dynamic";

const ROUTE = "ai/briefing";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const yahooFinance = new YahooFinance();

function buildSystemPrompt(profile?: { age?: number; retirementAge?: number; yearsToRetirement?: number; annualIncomeCAD?: number; rrspRoomEstimate?: number }): string {
  const notes: string[] = [];
  if (profile?.retirementAge && profile?.yearsToRetirement !== undefined)
    notes.push(`${profile.retirementAge}세 은퇴 목표 (${profile.yearsToRetirement}년 남음)`);
  if (profile?.annualIncomeCAD)
    notes.push(`연소득 $${profile.annualIncomeCAD.toLocaleString()} CAD, RRSP 추정 한도 ~$${profile.rrspRoomEstimate?.toLocaleString()}`);
  const profileNote = notes.length > 0 ? `\n투자자 정보: ${notes.join(" / ")}. 은퇴 시점과 소득에 맞춘 TFSA/RRSP 전략을 우선시할 것.` : "";

  return [
    "당신은 캐나다 배당 투자 전문 어시스턴트입니다. SANGBONG INVESTMENT RULEBOOK v4.4.2 기준으로만 응답하세요.",
    "[섹션 역할] 이 응답은 'BRIEFING' = 오늘 상태가 어떤가에 대한 짧은 status 요약. 화면에 이미 '현재 포트폴리오 표'와 '실행안 표 (정적 70/30)'가 authoritative하게 표시되고 있으므로, 이 텍스트에서는 SCHD/QLD/TQQQ/SGOV/QQQI 매수 CAD 금액을 다시 적지 마세요. 상태 평가만.",
    "포트폴리오 데이터의 'rulebook' 섹션은 서버에서 미리 계산한 룰북 기준값입니다. 그 값을 그대로 사용하고, 영문 필드명은 한국어 라벨로 바꾸세요. 임의로 다시 계산하지 마세요.",
    "",
    RULEBOOK_GUARDRAILS,
    "",
    "캐나다 세제 메모: TFSA 연 $7,000 납입 한도, RRSP 소득공제, 미국 배당이 TFSA로 들어오면 15% 원천징수, RRSP는 면제." + profileNote,
    "뉴스는 사실 요약 1-2문장만 언급하고, 룰북을 변경·override 하는 근거로 사용하지 마세요.",
    "",
    AI_OUTPUT_RULES,
    "",
    BRIEFING_STRUCTURE,
    "",
    "각 섹션은 2-3문장. 짧고 명확하게. 마크다운 별표(**) 사용하지 말 것. 모든 비중에는 'core' / 'total' 중 어느 기준인지 명시. 매수 액션 금액은 절대 텍스트로 적지 말 것 (표가 답).",
  ].join("\n");
}

async function getTopHoldingNews(tickers: string[]): Promise<string> {
  const top = tickers.slice(0, 4);
  const results: string[] = [];

  await Promise.allSettled(
    top.map(async (ticker) => {
      try {
        const res = await yahooFinance.search(ticker, { newsCount: 2, quotesCount: 0 });
        for (const item of res.news ?? []) {
          if (item.title) results.push(`[${ticker}] ${item.title}`);
        }
      } catch {
        // ignore per-ticker failures
      }
    })
  );

  return results.slice(0, 6).join("\n");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  // Fire-and-forget: register the active rulebook version on first AI call of
  // this process. Memoised internally; never blocks the route.
  void ensureCurrentRulebookVersion();

  const cacheKey = `ai_briefing_${RULEBOOK_PROMPT_VERSION}`;
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force) {
    const cached = await getCachedAiResult(userId, cacheKey);
    if (cached) {
      void recordAiCall({
        userId,
        route: ROUTE,
        provider: "cache",
        model: "cache",
        rulebookVersion: RULEBOOK_PROMPT_VERSION,
        systemPromptHash: "cache",
        userQueryHash: null,
        contextSizeChars: null,
        cached: true,
        status: "ok",
        httpStatus: 200,
        durationMs: 0,
        sanitizedResponse: cached,
      });
      return NextResponse.json({ result: cached, cached: true });
    }
  }

  // Cost-protection safety net: per-user per-minute throttle. Only kicks in on
  // runaway click loops; normal user pace stays well under the limit.
  const throttle = checkAiThrottle(userId);
  if (!throttle.allowed) {
    void recordAiCall({
      userId,
      route: ROUTE,
      provider: "n/a",
      model: "n/a",
      rulebookVersion: RULEBOOK_PROMPT_VERSION,
      systemPromptHash: "n/a",
      userQueryHash: null,
      contextSizeChars: null,
      cached: false,
      status: "throttled",
      httpStatus: 429,
      durationMs: 0,
    });
    return NextResponse.json(
      { error: `AI 요청이 너무 많습니다. ${throttle.retryAfterSec}초 후 다시 시도하세요.` },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSec) } },
    );
  }

  const contextStr = await buildPortfolioContext(userId);
  const context = JSON.parse(contextStr) as { accounts?: { holdings?: { ticker: string }[] }[]; investorProfile?: { age?: number; retirementAge?: number; yearsToRetirement?: number; annualIncomeCAD?: number; rrspRoomEstimate?: number } };

  // Collect top tickers for news
  const tickers = Array.from(
    new Set(
      (context.accounts ?? []).flatMap((a) => (a.holdings ?? []).map((h) => h.ticker))
    )
  );
  const newsHeadlines = tickers.length > 0 ? await getTopHoldingNews(tickers) : "";

  const userPrompt = [
    `다음 포트폴리오를 분석해서 핵심 인사이트를 제공하세요:\n${contextStr}`,
    newsHeadlines ? `\n최근 관련 뉴스:\n${newsHeadlines}` : "",
  ]
    .filter(Boolean)
    .join("");

  const systemPrompt = buildSystemPrompt(context.investorProfile);
  const systemPromptHash = sha256Hex(systemPrompt);

  const callStarted = Date.now();
  const aiResult = await callOpenAIWithMeta(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt + "\n\n사용자에게 보여줄 답변에는 절대로 영문 필드명을 노출하지 마세요." },
    ],
    { maxTokens: 600 },
  );
  const durationMs = Date.now() - callStarted;

  if (!aiResult.ok) {
    console.error("AI briefing error:", aiResult.error.message);
    void recordAiCall({
      userId,
      route: ROUTE,
      provider: aiResult.meta.provider,
      model: aiResult.meta.model,
      rulebookVersion: RULEBOOK_PROMPT_VERSION,
      systemPromptHash,
      userQueryHash: null,
      contextSizeChars: contextStr.length,
      cached: false,
      status: "upstream_error",
      httpStatus: aiResult.error.httpStatus ?? 500,
      durationMs,
      upstreamDurationMs: aiResult.meta.upstreamDurationMs,
      errorMessage: aiResult.error.message,
    });
    return NextResponse.json({ error: "AI 브리핑을 생성할 수 없습니다. 잠시 후 다시 시도해주세요.", cached: false });
  }

  const sanitized = sanitizeAiOutput(aiResult.content);

  // Phase 2 — semantic validation (DRY-RUN MODE).
  //
  // We invoke the validator only on the successful upstream path (after
  // sanitize), record whether it flagged any violations, and keep going.
  // Dry-run means: do NOT block, do NOT skip saveAiResult, do NOT change
  // the user-facing response shape or status code. Cache-hit, throttled,
  // and upstream_error rows continue to leave validation fields NULL.
  const validation = validateAiOutput(ROUTE, aiResult.rawResponse, sanitized, {
    rulebookVersion: RULEBOOK_PROMPT_VERSION,
  });

  await saveAiResult(userId, cacheKey, sanitized);

  void recordAiCall({
    userId,
    route: ROUTE,
    provider: aiResult.meta.provider,
    model: aiResult.meta.model,
    rulebookVersion: RULEBOOK_PROMPT_VERSION,
    systemPromptHash,
    userQueryHash: null,
    contextSizeChars: contextStr.length,
    cached: false,
    status: "ok",
    httpStatus: aiResult.meta.httpStatus,
    durationMs,
    upstreamDurationMs: aiResult.meta.upstreamDurationMs,
    promptTokens: aiResult.meta.promptTokens,
    completionTokens: aiResult.meta.completionTokens,
    totalTokens: aiResult.meta.totalTokens,
    // recordAiCall enforces AI_AUDIT_STORE_RAW=true to actually persist this.
    rawResponse: aiResult.rawResponse,
    sanitizedResponse: sanitized,
    validatedAt: new Date(),
    validationStatus: validation.ok ? "pass" : "violation",
    violationCodes: validation.violations.map((v) => v.code),
    errorMessage: validation.ok
      ? undefined
      : validation.violations.map((v) => `${v.code}: ${v.reason}`).join("; "),
  });

  return NextResponse.json({ result: sanitized, cached: false });
}
