import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { callOpenAI } from "@/lib/openai";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

const yahooFinance = new YahooFinance();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface NewsItem {
  ticker: string;
  title: string;
  link: string;
  publishedAt: string | null;
}

interface CachedNews {
  summary: string;
  items: NewsItem[];
  generatedAt: string;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  // Check cache
  const cacheKey = `${userId}:ai_news_cache`;
  const tsCacheKey = `${userId}:ai_news_cache_ts`;
  const [cached, cachedTs] = await Promise.all([
    prisma.setting.findUnique({ where: { key: cacheKey } }),
    prisma.setting.findUnique({ where: { key: tsCacheKey } }),
  ]);
  if (cached?.value && cachedTs?.value) {
    const age = Date.now() - parseInt(cachedTs.value, 10);
    if (age < CACHE_TTL_MS) {
      return NextResponse.json({ ...JSON.parse(cached.value), cached: true });
    }
  }

  // Get user's top tickers
  const holdings = await prisma.holding.findMany({
    where: { quantity: { gt: 0 }, portfolio: { userId } },
    select: { ticker: true, quantity: true },
    orderBy: { quantity: "desc" },
  });
  const tickers = [...new Set(holdings.map(h => h.ticker))].slice(0, 6);
  if (tickers.length === 0) return NextResponse.json({ summary: null, items: [], cached: false });

  // Fetch news from Yahoo Finance
  const newsItems: NewsItem[] = [];
  await Promise.allSettled(tickers.map(async (ticker) => {
    try {
      const res = await yahooFinance.search(ticker, { newsCount: 2, quotesCount: 0 });
      for (const item of res.news ?? []) {
        if (item.title) {
          newsItems.push({
            ticker,
            title: item.title,
            link: (item as { link?: string }).link ?? "",
            publishedAt: (item as { providerPublishTime?: Date }).providerPublishTime?.toISOString() ?? null,
          });
        }
      }
    } catch { /* ignore */ }
  }));

  if (newsItems.length === 0) return NextResponse.json({ summary: null, items: [], cached: false });

  // AI summarize
  const headlines = newsItems.map(n => `[${n.ticker}] ${n.title}`).join("\n");
  const prompt = `다음은 내 포트폴리오 종목들의 최신 뉴스 헤드라인입니다:\n${headlines}\n\n각 종목별로 투자자 관점에서 핵심만 1-2줄로 한국어 요약해주세요. 중요도 순으로 정렬하고, 전체 3-5개 항목으로 압축하세요.`;

  let summary = "";
  try {
    summary = await callOpenAI("", [
      { role: "system", content: "캐나다 배당 투자 전문 어시스턴트. 뉴스를 간결하고 실용적으로 요약." },
      { role: "user", content: prompt },
    ], 400);
  } catch {
    summary = newsItems.slice(0, 5).map(n => `• [${n.ticker}] ${n.title}`).join("\n");
  }

  const result: CachedNews = {
    summary,
    items: newsItems.slice(0, 10),
    generatedAt: new Date().toISOString(),
  };

  // Save cache
  await Promise.all([
    prisma.setting.upsert({ where: { key: cacheKey }, update: { value: JSON.stringify(result) }, create: { key: cacheKey, value: JSON.stringify(result) } }),
    prisma.setting.upsert({ where: { key: tsCacheKey }, update: { value: String(Date.now()) }, create: { key: tsCacheKey, value: String(Date.now()) } }),
  ]);

  return NextResponse.json({ ...result, cached: false });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  await prisma.setting.deleteMany({ where: { key: { in: [`${userId}:ai_news_cache`, `${userId}:ai_news_cache_ts`] } } });
  return NextResponse.json({ ok: true });
}
