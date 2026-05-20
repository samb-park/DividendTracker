import assert from "node:assert/strict";
import {
  SUPPORTED_BENCHMARKS,
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
  const missingFirstVisibleDate = normalizeBenchmarkSeries(snapshots, [
    { date: "2026-01-03", value: 200 },
    { date: "2026-01-04", value: 240 },
  ]);

  assert.deepEqual(missingFirstVisibleDate, [null, 100, 120]);
}

{
  const unavailable = normalizeBenchmarkSeries(snapshots, []);
  assert.deepEqual(unavailable, [null, null, null]);
}

console.log("performance-benchmark tests passed");
