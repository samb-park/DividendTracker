import { NextRequest, NextResponse } from "next/server";

// 5분 캐싱 (시장 데이터는 자주 변하므로 짧은 TTL)
const CACHE_TTL = 5 * 60; // 5분

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: CACHE_TTL }, // Next.js 캐싱 활성화
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo returned ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
    }

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    const timestamps = result.timestamp || [];
    const lastIndex = timestamps.length - 1;

    const currentPrice = meta.regularMarketPrice || quote?.close?.[lastIndex];
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const change = currentPrice && previousClose ? currentPrice - previousClose : 0;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;

    return NextResponse.json({
      symbol: meta.symbol,
      shortName: meta.shortName || meta.symbol,
      longName: meta.longName || meta.shortName || meta.symbol,
      regularMarketPrice: currentPrice,
      regularMarketChange: change,
      regularMarketChangePercent: changePercent,
      regularMarketPreviousClose: previousClose,
      regularMarketOpen: quote?.open?.[lastIndex] || meta.regularMarketOpen,
      regularMarketDayHigh: meta.regularMarketDayHigh || quote?.high?.[lastIndex],
      regularMarketDayLow: meta.regularMarketDayLow || quote?.low?.[lastIndex],
      regularMarketVolume: meta.regularMarketVolume || quote?.volume?.[lastIndex],
      marketCap: meta.marketCap,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      trailingPE: meta.trailingPE,
      dividendYield: meta.dividendYield,
      currency: meta.currency,
    });
  } catch (error) {
    console.error("Quote API error:", error);
    return NextResponse.json({ error: "Failed to fetch quote" }, { status: 500 });
  }
}
