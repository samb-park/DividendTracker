import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  callOpenAI,
  buildPortfolioContext,
  getCachedAiResult,
  saveAiResult,
} from "@/lib/openai";
import { AI_OUTPUT_RULES, INSIGHT_STRUCTURE, RULEBOOK_GUARDRAILS, RULEBOOK_PROMPT_VERSION, sanitizeAiOutput } from "@/lib/ai-output-rules";
import { checkAiThrottle } from "@/lib/ai-throttle";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = [
  "당신은 캐나다 세금최적화 및 배당 투자 전문 어시스턴트입니다. SANGBONG & HAERAN INVESTMENT RULEBOOK v4.1.8 기준으로만 응답하세요.",
  "[섹션 역할] 이 응답은 'INSIGHTS' = 분석/해석/리스크 중심. BRIEFING이 상태 요약을 담당하고 Method B 표가 액션 금액을 담당하므로, 이 텍스트에서는 매수 CAD 금액을 다시 적지 말고, 룰북 기준 해석·리스크·관찰 신호에만 집중하세요.",
  "포트폴리오 데이터의 'rulebook' 섹션 값을 그대로 활용하고, 영문 필드명은 한국어 라벨로 바꾸세요. 서버 계산을 임의로 다시 하지 마세요.",
  "",
  RULEBOOK_GUARDRAILS,
  "",
  "계좌 배치 원칙: 미국 배당 ETF(SCHD 등)는 RRSP, 성장형(QLD 등)은 TFSA, 캐나다 ETF는 TFSA 우선. IAUM은 TFSA 전용.",
  "",
  "RRSP 세금 계산: 한계세율 (온타리오) 소득 $57,375 이하 20.05%, ~$100,392 26.3%, ~$116,000 33.9%, ~$165,430 37.9%, 그 이상 43.4%. 연소득과 올해 RRSP 납입액으로 환급 예상액(CAD)을 계산.",
  "",
  AI_OUTPUT_RULES,
  "",
  INSIGHT_STRUCTURE,
  "",
  "각 섹션은 2-3문장. % 비중·세금 환급·리스크 평가에는 수치 포함 가능하나, 매수 액션 CAD 금액(SCHD/QLD/SGOV/IAUM 이번 주 매수)은 텍스트로 반복하지 말 것. 비중에는 'core' 또는 'total' 기준 명시. 마크다운 별표(**) 사용 금지.",
].join("\n");

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force) {
    const cached = await getCachedAiResult(userId, `ai_insights_${RULEBOOK_PROMPT_VERSION}`);
    if (cached) return NextResponse.json({ result: cached, cached: true });
  }

  const throttle = checkAiThrottle(userId);
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: `AI 요청이 너무 많습니다. ${throttle.retryAfterSec}초 후 다시 시도하세요.` },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSec) } },
    );
  }

  const context = await buildPortfolioContext(userId);
  let raw: string;
  try {
    raw = await callOpenAI("", [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `다음 포트폴리오의 전략적 최적화 방안을 분석해주세요. 사용자에게 보여줄 답변에는 절대로 영문 필드명을 노출하지 마세요. 데이터:\n${context}` },
    ], 600);
  } catch (err) {
    console.error("AI insights error:", err);
    return NextResponse.json({ error: "AI 인사이트를 생성할 수 없습니다. 잠시 후 다시 시도해주세요.", cached: false });
  }

  const result = sanitizeAiOutput(raw);
  await saveAiResult(userId, `ai_insights_${RULEBOOK_PROMPT_VERSION}`, result);
  return NextResponse.json({ result, cached: false });
}
