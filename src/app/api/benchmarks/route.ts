import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSupportedBenchmarkTicker } from "@/lib/performance-benchmark";

export const dynamic = "force-dynamic";

const yf = new YahooFinance();

const cache = new Map<string, { data: { date: string; value: number }[]; fetchedAt: number }>();
const TTL = 60 * 60 * 1000; // 1 hour
const VALID_RANGES = ["3m", "6m", "1y", "3y", "5y", "all"] as const;
type Range = typeof VALID_RANGES[number];

interface MarketPoint {
  date: string;
  value: number;
}

function rangeToSince(range: Range): Date | undefined {
  if (range === "all") return undefined;
  const d = new Date();
  if (range === "3m") d.setMonth(d.getMonth() - 3);
  else if (range === "6m") d.setMonth(d.getMonth() - 6);
  else if (range === "1y") d.setFullYear(d.getFullYear() - 1);
  else if (range === "3y") d.setFullYear(d.getFullYear() - 3);
  else if (range === "5y") d.setFullYear(d.getFullYear() - 5);
  return d;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function valueOnOrBefore(points: MarketPoint[], targetDate: string): number | null {
  let candidate: number | null = null;
  for (const point of points) {
    if (point.date > targetDate) break;
    candidate = point.value;
  }
  return candidate;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const rawRange = searchParams.get("range") ?? "1y";
  const range = VALID_RANGES.includes(rawRange as Range) ? rawRange as Range : "1y";
  const rawTicker = (searchParams.get("ticker") ?? "SPY").toUpperCase();
  if (!isSupportedBenchmarkTicker(rawTicker)) {
    return NextResponse.json({ prices: [], mode: "price-return" });
  }
  const ticker = rawTicker;
  const cacheKey = `${userId}:${ticker}-${range}:price-return-v1`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TTL) {
    return NextResponse.json({ prices: cached.data, mode: "price-return" });
  }

  try {
    const since = rangeToSince(range);
    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: {
        userId,
        ...(since ? { date: { gte: since } } : {}),
      },
      orderBy: { date: "asc" },
      select: { date: true },
    });

    if (snapshots.length === 0) return NextResponse.json({ prices: [], mode: "price-return" });

    const valuationDates = snapshots.map((snapshot) => isoDate(snapshot.date));
    const firstValuationDate = valuationDates[0];
    const lastValuationDate = valuationDates[valuationDates.length - 1];
    const marketStartDate = addDays(firstValuationDate, -10);
    const marketEndDate = addDays(lastValuationDate, 1);

    const chart = await yf.chart(ticker, {
      period1: marketStartDate,
      period2: marketEndDate,
      interval: "1d",
    });

    const quotes = chart.quotes ?? [];
    const prices: MarketPoint[] = quotes
      .filter((q) => q.close != null)
      .map((q) => ({ date: isoDate(new Date(q.date)), value: q.close as number }))
      .filter((point) => Number.isFinite(point.value) && point.value > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (prices.length === 0) {
      return NextResponse.json({ prices: [], mode: "price-return" });
    }

    const data = valuationDates.flatMap((date) => {
      const value = valueOnOrBefore(prices, date);
      return value == null ? [] : [{ date, value: Math.round(value * 100) / 100 }];
    });

    cache.set(cacheKey, { data, fetchedAt: Date.now() });
    return NextResponse.json({ prices: data, mode: "price-return" });
  } catch {
    return NextResponse.json({ prices: [], mode: "price-return" });
  }
}
