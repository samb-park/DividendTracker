import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

const yf = new YahooFinance();

// 1-hour cache
const cache = new Map<string, { data: YearlyDiv[]; fetchedAt: number }>();
const TTL = 60 * 60 * 1000;

interface YearlyDiv {
  year: number;
  annualDPS: number; // annual dividend per share
}

async function getDividendHistory(ticker: string): Promise<YearlyDiv[]> {
  const cached = cache.get(ticker);
  if (cached) {
    if (Date.now() - cached.fetchedAt < TTL) return cached.data;
    cache.delete(ticker); // evict expired entry
  }

  try {
    const since = new Date();
    since.setFullYear(since.getFullYear() - 10);

    const chart = await yf.chart(ticker, {
      period1: since.toISOString().split("T")[0],
      interval: "1mo",
    });

    const dividendMap = chart.events?.dividends ?? {};
    const dividends = Object.values(dividendMap)
      .map((d) => {
        const item = d as { date: Date | number | string; amount: number };
        return { year: new Date(item.date).getFullYear(), amount: item.amount };
      });

    // Group by year, sum dividends
    const byYear = new Map<number, number>();
    for (const d of dividends) {
      byYear.set(d.year, (byYear.get(d.year) ?? 0) + d.amount);
    }

    const sorted: YearlyDiv[] = Array.from(byYear.entries())
      .map(([year, annualDPS]) => ({ year, annualDPS }))
      .sort((a, b) => a.year - b.year);

    // Drop current year if incomplete (less than 8 months into the year)
    const now = new Date();
    const currentYear = now.getFullYear();
    const monthsElapsed = now.getMonth() + 1;
    const result = sorted.filter(d => d.year < currentYear || (d.year === currentYear && monthsElapsed >= 8));

    cache.set(ticker, { data: result, fetchedAt: Date.now() });
    return result;
  } catch {
    return [];
  }
}

function computeStreak(history: YearlyDiv[]): number {
  let streak = 0;
  for (let i = history.length - 1; i > 0; i--) {
    if (history[i].annualDPS > history[i - 1].annualDPS) streak++;
    else break;
  }
  return streak;
}

export async function GET() {
  const holdings = await prisma.holding.findMany({
    where: { quantity: { gt: 0 } },
    select: { ticker: true, quantity: true, currency: true },
  });

  // Aggregate shares per ticker (multiple accounts may hold the same ticker)
  const sharesMap = new Map<string, { shares: number; currency: string }>();
  for (const h of holdings) {
    const qty = parseFloat(h.quantity?.toString() ?? "0") || 0;
    const existing = sharesMap.get(h.ticker);
    sharesMap.set(h.ticker, { shares: (existing?.shares ?? 0) + qty, currency: h.currency });
  }

  const tickers = [...sharesMap.keys()];

  const results = await Promise.all(
    tickers.map(async (ticker) => {
      const history = await getDividendHistory(ticker);
      // Calculate YoY growth rates
      const withGrowth = history.map((row, i) => {
        const prev = history[i - 1];
        const growthPct = prev && prev.annualDPS > 0
          ? ((row.annualDPS - prev.annualDPS) / prev.annualDPS) * 100
          : null;
        return { ...row, growthPct };
      });
      const info = sharesMap.get(ticker)!;
      return { ticker, history: withGrowth, streak: computeStreak(history), shares: info.shares, currency: info.currency };
    })
  );

  // Filter to tickers that actually have dividend history
  const filtered = results.filter((r) => r.history.length > 0);

  // Flag tickers with a dividend cut in the most recent year
  const cuts = filtered
    .filter((r) => {
      const last = r.history[r.history.length - 1];
      return last?.growthPct !== null && (last?.growthPct ?? 0) < 0;
    })
    .map((r) => r.ticker);

  return NextResponse.json({ tickers: filtered, cuts });
}
