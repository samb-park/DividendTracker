import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  buildV0AnchoredBaseRateBenchmark,
  type BenchmarkPoint,
  type ContributionEvent,
} from "@/lib/benchmarks/baseRateBenchmark";
import {
  buildV0AnchoredSpyBenchmark,
  convertUsdToCadByDate,
  type FxRatePoint,
  type PricePointUSD,
} from "@/lib/benchmarks/spyBenchmark";
import {
  computeMaxDrawdownPct,
  computeWindowValueChangePct,
  computeXirrPct,
  sumContributionsInWindow,
  type DatedCashFlow,
  type PortfolioValuePoint,
} from "@/lib/metrics/valueChange";

export const dynamic = "force-dynamic";

const yf = new YahooFinance();
const TTL = 60 * 60 * 1000;
const VALID_RANGES = ["3m", "6m", "1y", "all"] as const;
const VALID_BASE_RATES = [2, 4, 6] as const;
type Range = (typeof VALID_RANGES)[number];
type BaseRate = (typeof VALID_BASE_RATES)[number];

interface SnapshotRow {
  date: Date;
  totalCAD: { toString(): string } | number;
}

interface CashTransactionRow {
  date: Date;
  action: "DEPOSIT" | "WITHDRAWAL" | string;
  amount: { toString(): string } | number;
  currency: "CAD" | "USD" | string;
}

interface PerformanceBenchmarkResponse {
  portfolio: PortfolioValuePoint[];
  spy: BenchmarkPoint[];
  baseR: BenchmarkPoint[];
  prices: { date: string; value: number }[];
  v0: number;
  t0: string | null;
  t1: string | null;
  totalContribInWindow: number;
  valueChangePct: number | null;
  xirrPct: number | null;
  maxDrawdownPct: number | null;
  ticker: string;
  ratePercent: BaseRate;
}

const cache = new Map<string, { data: PerformanceBenchmarkResponse; fetchedAt: number }>();

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return dateOnly(d);
}

function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

function rangeToStartDate(range: Range, now = new Date()): string | null {
  if (range === "all") return null;

  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (range === "3m") d.setUTCMonth(d.getUTCMonth() - 3);
  if (range === "6m") d.setUTCMonth(d.getUTCMonth() - 6);
  if (range === "1y") d.setUTCFullYear(d.getUTCFullYear() - 1);
  return dateOnly(d);
}

function parseRange(raw: string | null): Range {
  return VALID_RANGES.includes(raw as Range) ? (raw as Range) : "1y";
}

function parseBaseRate(raw: string | null): BaseRate {
  const n = Number(raw ?? "6");
  return VALID_BASE_RATES.includes(n as BaseRate) ? (n as BaseRate) : 6;
}

function parseTicker(raw: string | null): string {
  const ticker = (raw ?? "SPY").trim().toUpperCase().replace(/[^A-Z0-9.=-]/g, "").slice(0, 16);
  return ticker || "SPY";
}

function toNumber(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPoint(point: BenchmarkPoint): BenchmarkPoint {
  return { date: point.date, valueCAD: roundCurrency(point.valueCAD) };
}

function emptyResponse(ticker: string, ratePercent: BaseRate): PerformanceBenchmarkResponse {
  return {
    portfolio: [],
    spy: [],
    baseR: [],
    prices: [],
    v0: 0,
    t0: null,
    t1: null,
    totalContribInWindow: 0,
    valueChangePct: null,
    xirrPct: null,
    maxDrawdownPct: null,
    ticker,
    ratePercent,
  };
}

async function fetchHistory(ticker: string, from: string, to: string): Promise<PricePointUSD[]> {
  const result = await yf.chart(ticker, {
    period1: parseDate(from),
    period2: parseDate(addDays(to, 1)),
    interval: "1d",
  });

  return (result.quotes ?? [])
    .filter((quote) => quote.close != null && quote.date != null)
    .map((quote) => ({
      date: dateOnly(new Date(quote.date)),
      close: Number(quote.close),
    }))
    .filter((point) => Number.isFinite(point.close) && point.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchFxRates(from: string, to: string, fallbackRate: number): Promise<FxRatePoint[]> {
  try {
    const history = await fetchHistory("USDCAD=X", from, to);
    if (history.length > 0) {
      return history.map((point) => ({ date: point.date, rate: point.close }));
    }
  } catch {
    // Use the configured fallback below when Yahoo FX history is unavailable.
  }

  return [
    { date: from, rate: fallbackRate },
    { date: to, rate: fallbackRate },
  ];
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const userId = session.user.id;
  const range = parseRange(searchParams.get("range"));
  const ticker = parseTicker(searchParams.get("ticker"));
  const ratePercent = parseBaseRate(searchParams.get("rate"));
  const cacheKey = `${userId}-${range}-${ticker}-${ratePercent}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const [snapshotsRaw, cashTxRaw] = await Promise.all([
      prisma.portfolioSnapshot.findMany({
        where: { userId },
        orderBy: { date: "asc" },
        select: { date: true, totalCAD: true },
      }),
      prisma.cashTransaction.findMany({
        where: { portfolio: { userId } },
        orderBy: { date: "asc" },
        select: { date: true, action: true, amount: true, currency: true },
      }),
    ]) as [SnapshotRow[], CashTransactionRow[]];

    const snapshots: PortfolioValuePoint[] = snapshotsRaw.map((snapshot: SnapshotRow) => ({
      date: dateOnly(snapshot.date),
      valueCAD: toNumber(snapshot.totalCAD),
    }));

    if (snapshots.length === 0) {
      const data = emptyResponse(ticker, ratePercent);
      cache.set(cacheKey, { data, fetchedAt: Date.now() });
      return NextResponse.json(data);
    }

    const requestedStart = rangeToStartDate(range);
    const latestSnapshot = snapshots.at(-1)!;
    const firstSnapshot = snapshots[0];
    let t0: string;

    if (!requestedStart) {
      t0 = firstSnapshot.date;
    } else if (latestSnapshot.date < requestedStart) {
      t0 = latestSnapshot.date;
    } else {
      const previousOrExact = snapshots.filter((snapshot: PortfolioValuePoint) => snapshot.date <= requestedStart).at(-1);
      const firstAfterStart = snapshots.find((snapshot: PortfolioValuePoint) => snapshot.date >= requestedStart);
      t0 = previousOrExact ? requestedStart : (firstAfterStart?.date ?? firstSnapshot.date);
    }

    const t1 = latestSnapshot.date;
    const anchorSnapshot = snapshots.filter((snapshot: PortfolioValuePoint) => snapshot.date <= t0).at(-1) ?? snapshots.find((snapshot: PortfolioValuePoint) => snapshot.date >= t0) ?? firstSnapshot;
    const portfolio: PortfolioValuePoint[] = [
      { date: t0, valueCAD: roundCurrency(anchorSnapshot.valueCAD) },
      ...snapshots
        .filter((snapshot: PortfolioValuePoint) => snapshot.date > t0 && snapshot.date <= t1)
        .map((snapshot: PortfolioValuePoint) => ({ date: snapshot.date, valueCAD: roundCurrency(snapshot.valueCAD) })),
    ];

    const dates = portfolio.map((point) => point.date);
    const fallbackFxRate = Number(process.env.DEFAULT_FX_RATE ?? "1.35") || 1.35;
    const earliestCashDate = cashTxRaw[0] ? dateOnly(cashTxRaw[0].date) : t0;
    const priceStart = addDays(t0, -10);
    const fxStart = addDays(minDate(t0, earliestCashDate), -10);
    const [pricesUSD, fxRates] = await Promise.all([
      fetchHistory(ticker, priceStart, t1).catch(() => []),
      fetchFxRates(fxStart, t1, fallbackFxRate),
    ]);

    const allContributions: ContributionEvent[] = cashTxRaw
      .map((tx: CashTransactionRow) => {
        const date = dateOnly(tx.date);
        const sign = tx.action === "WITHDRAWAL" ? -1 : 1;
        const amount = sign * toNumber(tx.amount);
        const amountCAD = tx.currency === "USD"
          ? convertUsdToCadByDate(amount, date, fxRates, fallbackFxRate)
          : amount;
        return { date, amountCAD };
      })
      .filter((event) => event.date <= t1);

    const windowContributions = allContributions.filter((event: ContributionEvent) => event.date > t0 && event.date <= t1);
    const spy = buildV0AnchoredSpyBenchmark({
      v0CAD: anchorSnapshot.valueCAD,
      dates,
      contributions: windowContributions,
      pricesUSD,
      fxRates,
    }).map(roundPoint);
    const baseR = buildV0AnchoredBaseRateBenchmark({
      v0CAD: anchorSnapshot.valueCAD,
      dates,
      contributions: windowContributions,
      ratePercent,
    }).map(roundPoint);
    const terminalValue = latestSnapshot.valueCAD;
    const xirrCashflows: DatedCashFlow[] = [
      ...allContributions.map((event) => ({ date: event.date, amountCAD: -event.amountCAD })),
      { date: t1, amountCAD: terminalValue },
    ];

    const data: PerformanceBenchmarkResponse = {
      portfolio,
      spy,
      baseR,
      prices: spy.map((point) => ({ date: point.date, value: point.valueCAD })),
      v0: roundCurrency(anchorSnapshot.valueCAD),
      t0,
      t1,
      totalContribInWindow: roundCurrency(sumContributionsInWindow(windowContributions, t0, t1)),
      valueChangePct: computeWindowValueChangePct({ portfolio, contributions: windowContributions, t0, t1 }),
      xirrPct: computeXirrPct(xirrCashflows),
      maxDrawdownPct: computeMaxDrawdownPct(portfolio),
      ticker,
      ratePercent,
    };

    cache.set(cacheKey, { data, fetchedAt: Date.now() });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(emptyResponse(ticker, ratePercent));
  }
}
