import assert from "node:assert/strict";
import {
  computePerformanceMetrics,
  getPerformanceMetricYears,
  type PerformanceMetricRange,
} from "./performance-metrics";

const ranges: PerformanceMetricRange[] = ["3m", "6m", "1y", "3y", "5y", "all"];
assert.deepEqual(ranges, ["3m", "6m", "1y", "3y", "5y", "all"]);

{
  const years = getPerformanceMetricYears("1y", "2026-01-01", "2026-02-04");

  assert.ok(years !== null);
  assert.ok(years > 0.09 && years < 0.10, `1Y visible metrics must use actual snapshot span, got ${years}`);
}

{
  const metrics = computePerformanceMetrics(
    [
      { date: "2025-01-01", totalCAD: 1000 },
      { date: "2026-01-01", totalCAD: 1100 },
    ],
    "all",
    [{ date: "2025-01-01", amountCAD: 1000 }],
  );

  assert.ok(metrics.xirr !== null);
  assert.ok(Math.abs(metrics.xirr - 0.1) < 0.0002, `ExternalDeposit-only XIRR should return decimal near 0.10, got ${metrics.xirr}`);
}

{
  const metrics = computePerformanceMetrics(
    [
      { date: "2024-01-01", totalCAD: 1000 },
      { date: "2025-01-01", totalCAD: 2100 },
      { date: "2026-01-01", totalCAD: 2200 },
    ],
    "all",
    [{ date: "2025-01-01", amountCAD: 1000 }],
  );

  assert.ok(metrics.valueChange !== null);
  assert.ok(metrics.xirr !== null, "XIRR should use actual deposit cashflows through t_end even when visible snapshots start earlier");
  assert.equal(Math.round(metrics.valueChange * 100) / 100, 120);
}

{
  const metrics = computePerformanceMetrics(
    [
      { date: "2024-01-01", totalCAD: 100 },
      { date: "2025-01-01", totalCAD: 120 },
      { date: "2026-01-01", totalCAD: 90 },
      { date: "2027-01-01", totalCAD: 130 },
    ],
    "3y",
    [],
  );

  assert.equal(metrics.valueChange, null);
  assert.equal(metrics.xirr, null, "XIRR remains null without ExternalDeposit cash flows instead of inventing snapshot principal");
  assert.equal(Math.round((metrics.mdd ?? 0) * 100) / 100, -25);
}

console.log("performance-metrics tests passed");
