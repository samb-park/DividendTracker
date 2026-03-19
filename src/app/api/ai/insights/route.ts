import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  callOpenAI,
  buildPortfolioContext,
  checkAndIncrementAiCalls,
  getCachedAiResult,
  saveAiResult,
  getRemainingAiCalls,
} from "@/lib/openai";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "당신은 캐나다 세금최적화 및 배당 투자 전문 어시스턴트입니다. " +
  "다음 영역을 중점적으로 분석하세요: " +
  "1) 계좌 배치 최적화 (US ETF는 RRSP, 캐나다 ETF는 TFSA 우선), " +
  "2) 납입한도 활용 전략 (TFSA/RRSP/FHSA 우선순위), " +
  "3) 배당 삭감 위험 (배당 수익률이 비정상적으로 높은 종목), " +
  "4) 포트폴리오 집중도 위험. " +
  "전략적 인사이트 3-4개를 한국어로, 각 2-3문장으로 제공하세요. 구체적인 수치와 행동 지침을 포함하세요.";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const remaining = await getRemainingAiCalls(userId);
  const cached = await getCachedAiResult(userId, "ai_insights");
  if (cached) return NextResponse.json({ result: cached, cached: true, remaining });

  const { allowed, remaining: remainingAfter } = await checkAndIncrementAiCalls(userId);
  if (!allowed) return NextResponse.json({ error: "Daily AI call limit reached", remaining: 0 }, { status: 429 });

  const context = await buildPortfolioContext(userId);
  const result = await callOpenAI("", [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `다음 포트폴리오의 전략적 최적화 방안을 분석해주세요:\n${context}` },
  ], 600);

  await saveAiResult(userId, "ai_insights", result);
  return NextResponse.json({ result, cached: false, remaining: remainingAfter });
}
