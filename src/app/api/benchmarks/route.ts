import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

const yf = new YahooFinance();

const cache = new Map<string, { data: { date: string; value: number }[]; fetchedAt: number }>();
const TTL = 60 * 60 * 1000; // 1 hour

function rangeToStartDate(range: string): string {
  const d = new Date();
  if (range === "3m") d.setMonth(d.getMonth() - 3);
  else if (range === "6m") d.setMonth(d.getMonth() - 6);
  else if (range === "1y") d.setFullYear(d.getFullYear() - 1);
  else d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") ?? "1y";
  const ticker = searchParams.get("ticker") ?? "SPY";
  const cacheKey = `${ticker}-${range}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TTL) {
    return NextResponse.json({ prices: cached.data });
  }

  try {
    const startDate = rangeToStartDate(range);
    const result = await yf.chart(ticker, {
      period1: startDate,
      interval: "1d",
    });

    const quotes = result.quotes ?? [];
    const prices = quotes
      .filter((q) => q.close != null)
      .map((q) => ({
        date: new Date(q.date).toISOString().split("T")[0],
        close: q.close as number,
      }));

    if (prices.length === 0) {
      return NextResponse.json({ prices: [] });
    }

    // Normalize to 100 at start
    const base = prices[0].close;
    const normalized = prices.map((p) => ({
      date: p.date,
      value: (p.close / base) * 100,
    }));

    cache.set(cacheKey, { data: normalized, fetchedAt: Date.now() });
    return NextResponse.json({ prices: normalized });
  } catch {
    return NextResponse.json({ prices: [] });
  }
}
