import assert from "node:assert/strict";
import {
  SUPPORTED_BENCHMARKS,
  alignBenchmarkSeriesToPortfolioBaseline,
  buildCashflowAdjustedBenchmarkSeries,
  normalizeBenchmarkSeries,
  type BenchmarkPoint,
  type SnapshotPoint,
} from "./performance-benchmark";

const snapshots: SnapshotPoint[] = [
  { date: "2026-01-02", totalCAD: 1000 },
  { date: "2026-01-03", totalCAD: 1100 },
  { date: "2026-01-04", totalCAD: 1200 },
];

const qldPrices: BenchmarkPoint[] = [
  // Earlier API/range point must not be the chart anchor after visible snapshots are applied.
  { date: "2026-01-01", value: 50 },
  { date: "2026-01-02", value: 100 },
  { date: "2026-01-03", value: 125 },
  { date: "2026-01-04", value: 150 },
];

{
  assert.deepEqual(SUPPORTED_BENCHMARKS.map((b) => b.ticker), ["SPY", "QLD", "QQQ"]);
}

{
  const normalized = normalizeBenchmarkSeries(snapshots, qldPrices);
  assert.deepEqual(normalized, [100, 125, 150]);
}

{
  const aligned = alignBenchmarkSeriesToPortfolioBaseline(snapshots, qldPrices, 31_339);

  assert.deepEqual(
    aligned.map((value) => value == null ? null : Math.round(value)),
    [31_339, 39_174, 47_009],
    "benchmark chart values must apply selected-range benchmark return to the first visible portfolio value",
  );
}

{
  const adjusted = buildCashflowAdjustedBenchmarkSeries(
    snapshots,
    qldPrices,
    1_000,
    [{ date: "2026-01-03", amountCAD: 500 }],
  );

  assert.deepEqual(
    adjusted.map((value) => value == null ? null : Math.round(value)),
    [1_000, 1_750, 2_100],
    "benchmark cashflow comparison should buy additional shares on the cashflow date",
  );
}

{
  const adjusted = buildCashflowAdjustedBenchmarkSeries(
    snapshots,
    qldPrices,
    1_000,
    [],
  );

  assert.deepEqual(
    adjusted.map((value) => value == null ? null : Math.round(value)),
    [1_000, 1_250, 1_500],
    "benchmark cashflow comparison should match lump-sum baseline alignment when no cashflows occur",
  );
}

{
  const adjusted = buildCashflowAdjustedBenchmarkSeries(
    snapshots,
    [
      { date: "2026-01-02", value: 100 },
      { date: "2026-01-04", value: 150 },
    ],
    1_000,
    [{ date: "2026-01-03", amountCAD: 500 }],
  );

  assert.deepEqual(
    adjusted.map((value) => value == null ? null : Math.round(value)),
    [1_000, 1_500, 2_250],
    "cashflows on non-market dates should use the latest benchmark price on or before the cashflow date",
  );
}

{
  const missingFirstVisibleDate = normalizeBenchmarkSeries(snapshots, [
    { date: "2026-01-03", value: 200 },
    { date: "2026-01-04", value: 240 },
  ]);

  assert.deepEqual(missingFirstVisibleDate, [null, 100, 120]);
}

{
  const alignedMissingFirstVisibleDate = alignBenchmarkSeriesToPortfolioBaseline(snapshots, [
    { date: "2026-01-03", value: 200 },
    { date: "2026-01-04", value: 240 },
  ], 31_339);

  assert.deepEqual(
    alignedMissingFirstVisibleDate.map((value) => value == null ? null : Math.round(value)),
    [null, 31_339, 37_607],
    "benchmark line should start at the portfolio baseline on the first visible date with benchmark data",
  );
}

{
  const unavailable = normalizeBenchmarkSeries(snapshots, []);
  assert.deepEqual(unavailable, [null, null, null]);
}

console.log("performance-benchmark tests passed");
