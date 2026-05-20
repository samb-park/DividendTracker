import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getFxRate } from "@/lib/price";
import { isSupportedBenchmarkTicker } from "@/lib/performance-benchmark";
import { computeShadowPortfolio, type ShadowContribution, type ShadowMarketPoint } from "@/lib/performance-shadow";

export const dynamic = "force-dynamic";

const yf = new YahooFinance();

const cache = new Map<string, { data: { date: string; value: number }[]; fetchedAt: number }>();
const TTL = 60 * 60 * 1000; // 1 hour
const VALID_RANGES = ["3m", "6m", "1y", "3y", "5y", "all"] as const;
type Range = typeof VALID_RANGES[number];

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

function normalizeBoCObservations(payload: unknown): ShadowMarketPoint[] {
  const observations = (payload as { observations?: Array<{ d?: string; FXUSDCAD?: { v?: string } }> }).observations ?? [];
  return observations
    .map((observation) => ({ date: observation.d ?? "", value: parseFloat(observation.FXUSDCAD?.v ?? "") }))
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchBoCFxRates(startDate: string, endDate: string): Promise<ShadowMarketPoint[]> {
  const url = `https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?start_date=${startDate}&end_date=${endDate}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return [];
  return normalizeBoCObservations(await response.json());
}

function fallbackFxSeries(dates: string[], fallbackRate: number): ShadowMarketPoint[] {
  return dates.map((date) => ({ date, value: fallbackRate }));
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
    return NextResponse.json({ prices: [] });
  }
  const ticker = rawTicker;
  const cacheKey = `${userId}:${ticker}-${range}:shadow-v2-contrib-only`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TTL) {
    return NextResponse.json({ prices: cached.data, mode: "shadow-dca" });
  }

  try {
    const since = rangeToSince(range);
    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: {
        userId,
        ...(since ? { date: { gte: since } } : {}),
      },
      orderBy: { date: "asc" },
      select: { date: true, totalCAD: true },
    });

    if (snapshots.length === 0) return NextResponse.json({ prices: [], mode: "shadow-dca" });

    const valuationDates = snapshots.map((snapshot) => isoDate(snapshot.date));
    const firstValuationDate = valuationDates[0];
    const lastValuationDate = valuationDates[valuationDates.length - 1];

    const cashTransactions = await prisma.cashTransaction.findMany({
      where: {
        portfolio: { userId },
        date: { lte: new Date(`${lastValuationDate}T23:59:59.999Z`) },
      },
      select: { date: true, action: true, amount: true, currency: true },
      orderBy: { date: "asc" },
    });

    const liveFx = await getFxRate().catch(() => null);
    const fallbackFxRate = liveFx?.rate && Number.isFinite(liveFx.rate) ? liveFx.rate : 1.38;
    const rawContributions = cashTransactions.map((tx) => ({
      date: isoDate(tx.date),
      signedAmount: parseFloat(tx.amount.toString()) * (tx.action === "WITHDRAWAL" ? -1 : 1),
      currency: tx.currency,
    }));
    const firstContributionDate = rawContributions.map((tx) => tx.date).sort()[0] ?? firstValuationDate;
    const marketStartDate = firstContributionDate < firstValuationDate ? firstContributionDate : firstValuationDate;

    const chart = await yf.chart(ticker, {
      period1: marketStartDate,
      period2: lastValuationDate,
      interval: "1d",
    });

    const quotes = chart.quotes ?? [];
    const prices: ShadowMarketPoint[] = quotes
      .filter((q) => q.close != null)
      .map((q) => ({ date: isoDate(new Date(q.date)), value: q.close as number }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (prices.length === 0) {
      return NextResponse.json({ prices: [], mode: "shadow-dca" });
    }

    const dividendEvents = Object.values(chart.events?.dividends ?? {})
      .map((event) => {
        const item = event as { date: Date | number | string; amount: number };
        return { date: isoDate(new Date(item.date)), amount: Number(item.amount) };
      })
      .filter((event) => Number.isFinite(event.amount) && event.amount > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    const bocFx = await fetchBoCFxRates(marketStartDate, lastValuationDate).catch(() => []);
    const fxRates = bocFx.length > 0 ? bocFx : fallbackFxSeries([...new Set([...valuationDates, ...rawContributions.map((tx) => tx.date)])], fallbackFxRate);

    const fxByDate = new Map(fxRates.map((point) => [point.date, point.value]));
    const contributions: ShadowContribution[] = rawContributions.map((tx) => {
      const fx = tx.currency === "USD" ? (fxByDate.get(tx.date) ?? fallbackFxRate) : 1;
      return {
        date: tx.date,
        amountCAD: tx.signedAmount * fx,
      };
    });

    const shadow = computeShadowPortfolio({
      contributions,
      prices,
      fxRates,
      dividends: dividendEvents,
      valuationDates,
    });

    const data = shadow.map((point) => ({
      date: point.date,
      value: Math.round(point.valueCAD * 100) / 100,
    }));

    cache.set(cacheKey, { data, fetchedAt: Date.now() });
    return NextResponse.json({ prices: data, mode: "shadow-dca", fxSource: bocFx.length > 0 ? "BoC FXUSDCAD" : "fallback" });
  } catch {
    return NextResponse.json({ prices: [], mode: "shadow-dca" });
  }
}
