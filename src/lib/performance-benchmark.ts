export type BenchmarkTicker = "SPY" | "QLD" | "QQQ";

export interface BenchmarkOption {
  ticker: BenchmarkTicker;
  label: string;
}

export interface SnapshotPoint {
  date: string;
  totalCAD: number;
}

export interface BenchmarkPoint {
  date: string;
  value: number;
}

export interface PerformanceCashflowCAD {
  date: string;
  amountCAD: number;
}

export const SUPPORTED_BENCHMARKS: BenchmarkOption[] = [
  { ticker: "SPY", label: "SPY" },
  { ticker: "QLD", label: "QLD" },
  { ticker: "QQQ", label: "QQQ" },
];

export function isSupportedBenchmarkTicker(value: string): value is BenchmarkTicker {
  return SUPPORTED_BENCHMARKS.some((benchmark) => benchmark.ticker === value);
}

function dateKey(value: string): string {
  return value.slice(0, 10);
}

function normalizedBenchmarkPoints(benchmark: BenchmarkPoint[]): BenchmarkPoint[] {
  return benchmark
    .map((point) => ({
      date: dateKey(point.date),
      value: Number(point.value),
    }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function valueOnOrBefore(points: BenchmarkPoint[], targetDate: string): number | null {
  let candidate: number | null = null;
  for (const point of points) {
    if (point.date > targetDate) break;
    candidate = point.value;
  }
  return candidate;
}

function normalizedCashflows(
  cashflows: PerformanceCashflowCAD[],
  firstSnapshotDate: string,
): PerformanceCashflowCAD[] {
  return cashflows
    .map((cashflow) => ({
      date: dateKey(cashflow.date),
      amountCAD: Number(cashflow.amountCAD),
    }))
    .filter((cashflow) => (
      cashflow.date > firstSnapshotDate
      && Number.isFinite(cashflow.amountCAD)
      && cashflow.amountCAD !== 0
    ))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeBenchmarkSeries(
  snapshots: SnapshotPoint[],
  benchmark: BenchmarkPoint[],
): Array<number | null> {
  const benchMap = new Map(benchmark.map((b) => [b.date, b.value]));

  let benchmarkBase: number | null = null;
  for (const snapshot of snapshots) {
    const value = benchMap.get(snapshot.date);
    if (value != null && value > 0) {
      benchmarkBase = value;
      break;
    }
  }

  return snapshots.map((snapshot) => {
    const value = benchMap.get(snapshot.date) ?? null;
    return value != null && benchmarkBase != null && benchmarkBase > 0
      ? (value / benchmarkBase) * 100
      : null;
  });
}

export function alignBenchmarkSeriesToPortfolioBaseline(
  snapshots: SnapshotPoint[],
  benchmark: BenchmarkPoint[],
  baselinePortfolioValueCAD: number,
): Array<number | null> {
  const baseline = Number(baselinePortfolioValueCAD);
  if (!Number.isFinite(baseline) || baseline < 0) return snapshots.map(() => null);

  return normalizeBenchmarkSeries(snapshots, benchmark).map((normalizedValue) => (
    normalizedValue == null ? null : baseline * (normalizedValue / 100)
  ));
}

export function buildCashflowAdjustedBenchmarkSeries(
  snapshots: SnapshotPoint[],
  benchmark: BenchmarkPoint[],
  baselinePortfolioValueCAD: number,
  cashflows: PerformanceCashflowCAD[],
): Array<number | null> {
  if (snapshots.length === 0) return [];

  const baseline = Number(baselinePortfolioValueCAD);
  if (!Number.isFinite(baseline) || baseline < 0) return snapshots.map(() => null);

  const firstSnapshotDate = dateKey(snapshots[0].date);
  const benchmarkPoints = normalizedBenchmarkPoints(benchmark);
  const contributionEvents = normalizedCashflows(cashflows, firstSnapshotDate);
  if (benchmarkPoints.length === 0) return snapshots.map(() => null);

  let shares: number | null = null;
  let nextContributionIndex = 0;

  return snapshots.map((snapshot) => {
    const snapshotDate = dateKey(snapshot.date);
    const currentPrice = valueOnOrBefore(benchmarkPoints, snapshotDate);
    if (currentPrice == null || currentPrice <= 0) return null;

    if (shares == null) {
      shares = baseline / currentPrice;
    }

    while (
      nextContributionIndex < contributionEvents.length
      && contributionEvents[nextContributionIndex].date <= snapshotDate
    ) {
      const contribution = contributionEvents[nextContributionIndex];
      const contributionPrice = valueOnOrBefore(benchmarkPoints, contribution.date);
      if (contributionPrice != null && contributionPrice > 0) {
        shares += contribution.amountCAD / contributionPrice;
        if (shares < 0) shares = 0;
      }
      nextContributionIndex += 1;
    }

    return shares * currentPrice;
  });
}
