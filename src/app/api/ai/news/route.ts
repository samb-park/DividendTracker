import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { callOpenAI } from "@/lib/openai";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

const yahooFinance = new YahooFinance();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Predefined topic expansion map for common ETFs/tickers
const TOPIC_MAP: Record<string, string[]> = {
  // US Dividend ETFs
  SCHD: ["dividend ETF", "S&P 500 dividend stocks", "US dividend"],
  VIG: ["dividend growth ETF", "US dividend"],
  DVY: ["high dividend ETF", "US dividend"],
  // Nasdaq / Tech
  QLD: ["Nasdaq 100", "tech stocks", "leveraged ETF"],
  TQQQ: ["Nasdaq 100", "tech stocks", "leveraged ETF"],
  QQQ: ["Nasdaq 100", "tech stocks"],
  QQQM: ["Nasdaq 100", "tech stocks"],
  // S&P 500
  VOO: ["S&P 500", "US index fund"],
  SPY: ["S&P 500", "US market"],
  IVV: ["S&P 500", "US market"],
  "VFV.TO": ["S&P 500", "Canada ETF"],
  "VSP.TO": ["S&P 500", "Canada ETF hedged"],
  // Canadian market
  "XIU.TO": ["TSX 60", "Canada stocks", "Canadian market"],
  "XIC.TO": ["TSX composite", "Canada stocks"],
  "VCN.TO": ["Canada stocks", "TSX"],
  "VDY.TO": ["Canadian dividend", "TSX dividend"],
  "XEI.TO": ["Canadian dividend", "TSX dividend"],
  "CDZ.TO": ["Canadian dividend growth", "TSX dividend"],
  // Canadian banks
  "ZEB.TO": ["Canadian banks", "TSX banks", "Canada financials"],
  "TD.TO": ["Canadian banks", "Canada financials"],
  "RY.TO": ["Canadian banks", "Canada financials"],
  "BNS.TO": ["Canadian banks", "Canada financials"],
  "BMO.TO": ["Canadian banks", "Canada financials"],
  "CM.TO": ["Canadian banks", "Canada financials"],
  // REITs
  "ZRE.TO": ["Canadian REIT", "real estate"],
  VNQ: ["US REIT", "real estate"],
  O: ["dividend REIT", "real estate income"],
  // Bonds
  "ZAG.TO": ["Canadian bonds", "fixed income"],
  AGG: ["US bonds", "fixed income"],
  BND: ["US bonds", "fixed income"],
};

export interface NewsItem {
  id: string;
  source: string;
  title: string;
  koreanTitle: string;
  description: string;
  link: string;
  publishedAt: string | null;
  topics: string[];
}

export interface InterestProfile {
  topics: Record<string, number>;
  tickers: Record<string, number>;
}

async function fetchNewsForTerms(terms: string[], perTerm = 2): Promise<Omit<NewsItem, "koreanTitle" | "description">[]> {
  const items: Omit<NewsItem, "koreanTitle" | "description">[] = [];
  const seen = new Set<string>();

  await Promise.allSettled(terms.map(async (term) => {
    try {
      const res = await yahooFinance.search(term, { newsCount: perTerm, quotesCount: 0 });
      for (const item of res.news ?? []) {
        if (!item.title || seen.has(item.title)) continue;
        seen.add(item.title);
        items.push({
          id: Buffer.from(item.title).toString("base64").slice(0, 16),
          source: term,
          title: item.title,
          link: (item as { link?: string }).link ?? "",
          publishedAt: (item as { providerPublishTime?: Date }).providerPublishTime?.toISOString() ?? null,
          topics: TOPIC_MAP[term] ?? [],
        });
      }
    } catch { /* ignore */ }
  }));

  return items;
}

async function translateAndDescribe(items: Omit<NewsItem, "koreanTitle" | "description">[]): Promise<NewsItem[]> {
  if (items.length === 0) return [];

  const numbered = items.map((n, i) => `${i + 1}. [${n.source}] ${n.title}`).join("\n");
  const prompt = `다음 뉴스 헤드라인들을 투자자 관점으로 처리해주세요.
각 항목에 대해 JSON 배열로 반환: [{"i":1,"k":"한글 제목","d":"투자 관점 1줄 설명 (30자 이내)"}]
번호 순서 그대로, JSON만 반환하세요.

${numbered}`;

  try {
    const raw = await callOpenAI("", [
      { role: "system", content: "뉴스 번역 및 요약 전문가. JSON만 반환." },
      { role: "user", content: prompt },
    ], 800);

    const jsonStr = raw.match(/\[[\s\S]*\]/)?.[0] ?? "[]";
    const parsed = JSON.parse(jsonStr) as { i: number; k: string; d: string }[];
    const map = new Map(parsed.map(p => [p.i, p]));

    return items.map((item, i) => ({
      ...item,
      koreanTitle: map.get(i + 1)?.k ?? item.title,
      description: map.get(i + 1)?.d ?? "",
    }));
  } catch {
    return items.map(item => ({ ...item, koreanTitle: item.title, description: "" }));
  }
}

export async function getInterestProfile(userId: string): Promise<InterestProfile> {
  const setting = await prisma.setting.findUnique({ where: { key: `${userId}:news_interests` } });
  if (!setting?.value) return { topics: {}, tickers: {} };
  try { return JSON.parse(setting.value) as InterestProfile; } catch { return { topics: {}, tickers: {} }; }
}

export async function saveInterestProfile(userId: string, profile: InterestProfile): Promise<void> {
  const key = `${userId}:news_interests`;
  await prisma.setting.upsert({
    where: { key },
    update: { value: JSON.stringify(profile) },
    create: { key, value: JSON.stringify(profile) },
  });
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

  // User's top holdings
  const holdings = await prisma.holding.findMany({
    where: { quantity: { gt: 0 }, portfolio: { userId } },
    select: { ticker: true },
    distinct: ["ticker"],
  });
  const holdingTickers = holdings.map(h => h.ticker).slice(0, 6);
  if (holdingTickers.length === 0) return NextResponse.json({ items: [], summary: null, cached: false });

  // Top interest topics from accumulated profile
  const interests = await getInterestProfile(userId);
  const topInterestTopics = Object.entries(interests.topics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);

  // Fetch news: holdings + interest topics
  const searchTerms = [...new Set([...holdingTickers, ...topInterestTopics])];
  const items = await fetchNewsForTerms(searchTerms, 2);

  if (items.length === 0) return NextResponse.json({ items: [], cached: false });

  const topItems = items.slice(0, 10);
  const translatedItems = await translateAndDescribe(topItems);

  const result = { items: translatedItems, generatedAt: new Date().toISOString() };

  await Promise.all([
    prisma.setting.upsert({ where: { key: cacheKey }, update: { value: JSON.stringify(result) }, create: { key: cacheKey, value: JSON.stringify(result) } }),
    prisma.setting.upsert({ where: { key: tsCacheKey }, update: { value: String(Date.now()) }, create: { key: tsCacheKey, value: String(Date.now()) } }),
  ]);

  return NextResponse.json({ ...result, cached: false });
}

// POST: record click + return related news
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { source, title } = await req.json() as { source: string; title: string };

  // Update interest profile
  const profile = await getInterestProfile(userId);

  // Record ticker click
  profile.tickers[source] = (profile.tickers[source] ?? 0) + 1;

  // Record expanded topic clicks
  const expandedTopics = TOPIC_MAP[source] ?? [];
  if (expandedTopics.length === 0) {
    // Use AI to extract topics for unknown tickers
    try {
      const aiTopics = await callOpenAI("", [
        { role: "system", content: "Extract 2-3 broad investment topics/categories for this news. Reply with comma-separated terms only, no explanation." },
        { role: "user", content: `Ticker: ${source}\nNews: ${title}` },
      ], 50);
      aiTopics.split(",").map(t => t.trim()).filter(Boolean).forEach(t => {
        profile.topics[t] = (profile.topics[t] ?? 0) + 1;
      });
    } catch { /* ignore */ }
  } else {
    expandedTopics.forEach(t => {
      profile.topics[t] = (profile.topics[t] ?? 0) + 1;
    });
  }

  await saveInterestProfile(userId, profile);

  // Fetch related news on expanded topics
  const relatedTerms = expandedTopics.length > 0 ? expandedTopics : [source];
  const related = await fetchNewsForTerms(relatedTerms, 3);

  // Filter out the clicked item and deduplicate
  const relatedFiltered = related.filter(r => r.title !== title).slice(0, 8);

  // AI summary of related
  let relatedSummary = "";
  if (relatedFiltered.length > 0) {
    try {
      const headlines = relatedFiltered.map(n => `[${n.source}] ${n.title}`).join("\n");
      relatedSummary = await callOpenAI("", [
        { role: "system", content: "캐나다 배당 투자 전문 어시스턴트." },
        { role: "user", content: `"${title}" 관련 뉴스들을 2-3줄로 한국어 요약:\n${headlines}` },
      ], 200);
    } catch { /* ignore */ }
  }

  return NextResponse.json({ related: relatedFiltered, relatedSummary, topics: expandedTopics });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  await prisma.setting.deleteMany({
    where: { key: { in: [`${userId}:ai_news_cache`, `${userId}:ai_news_cache_ts`] } },
  });
  return NextResponse.json({ ok: true });
}
