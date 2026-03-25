import { NextResponse } from "next/server";
import { auth } from "@/auth";
import YahooFinance from "yahoo-finance2";
import {
  callOpenAI,
  buildPortfolioContext,
  checkAndIncrementAiCalls,
  getCachedAiResult,
  saveAiResult,
  getRemainingAiCalls,
} from "@/lib/openai";

export const dynamic = "force-dynamic";

const yahooFinance = new YahooFinance();

function buildSystemPrompt(profile?: { age?: number; retirementAge?: number; yearsToRetirement?: number }): string {
  const retirementNote = (profile?.retirementAge && profile?.yearsToRetirement !== undefined)
    ? ` 투자자는 ${profile.retirementAge}세 은퇴 목표 (${profile.yearsToRetirement}년 남음). 은퇴 시점 기준 배당 성장 속도와 TFSA/RRSP 활용 전략을 우선시할 것.`
    : "";
  return `당신은 캐나다 배당 투자 전문 어시스턴트입니다. TFSA 연 $7,000 납입한도, RRSP 소득공제, US배당→TFSA 15% 원천징수 손실, RRSP는 면제.${retirementNote} 투자자 프로필(나이, 목표)이 있으면 그에 맞는 맞춤 조언을 포함하세요. 최신 뉴스가 있으면 포트폴리오에 미치는 영향을 언급하세요. 답변은 3-5개 핵심 인사이트를 한국어로, 각 2문장 이내로 간결하게.`;
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

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const remaining = await getRemainingAiCalls(userId);
  const cached = await getCachedAiResult(userId, "ai_briefing");
  if (cached) return NextResponse.json({ result: cached, cached: true, remaining });

  const { allowed, remaining: remainingAfter } = await checkAndIncrementAiCalls(userId);
  if (!allowed) return NextResponse.json({ error: "Daily AI call limit reached", remaining: 0 }, { status: 429 });

  const contextStr = await buildPortfolioContext(userId);
  const context = JSON.parse(contextStr) as { accounts?: { holdings?: { ticker: string }[] }[]; investorProfile?: { age?: number; retirementAge?: number; yearsToRetirement?: number } };

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

  const result = await callOpenAI("", [
    { role: "system", content: buildSystemPrompt(context.investorProfile) },
    { role: "user", content: userPrompt },
  ], 500);

  await saveAiResult(userId, "ai_briefing", result);
  return NextResponse.json({ result, cached: false, remaining: remainingAfter });
}
