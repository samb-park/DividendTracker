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

export const SUPPORTED_BENCHMARKS: BenchmarkOption[] = [
  { ticker: "SPY", label: "SPY" },
  { ticker: "QLD", label: "QLD" },
  { ticker: "QQQ", label: "QQQ" },
];

export function isSupportedBenchmarkTicker(value: string): value is BenchmarkTicker {
  return SUPPORTED_BENCHMARKS.some((benchmark) => benchmark.ticker === value);
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
