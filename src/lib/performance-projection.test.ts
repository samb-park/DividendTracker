import assert from "node:assert/strict";
import {
  BASE_RATE_OPTIONS,
  buildProjectedPortfolioSeries,
  buildProjectedPortfolioSeriesForRate,
  getProjectionScenarioCagrPct,
} from "./performance-projection";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

function yearsBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.max(0, (end.getTime() - start.getTime()) / (DAYS_PER_YEAR * MS_PER_DAY));
}

function cashflowExpected(events: Array<{ date: string; amountCAD: number }>, snapshotDate: string, cagr: number): number {
  return events.reduce((sum, event) => {
    if (event.date > snapshotDate) return sum;
    return sum + event.amountCAD * Math.pow(1 + cagr, yearsBetween(event.date, snapshotDate));
  }, 0);
}

function weeklyScheduleExpected(anchorDate: string, snapshotDate: string, weeklyCAD: number, cagr: number): number {
  const events: Array<{ date: string; amountCAD: number }> = [];
  const start = new Date(`${anchorDate}T00:00:00Z`);
  const end = new Date(`${snapshotDate}T00:00:00Z`);
  for (let d = start; d <= end; d = new Date(d.getTime() + 7 * MS_PER_DAY)) {
    events.push({ date: d.toISOString().slice(0, 10), amountCAD: weeklyCAD });
  }
  return cashflowExpected(events, snapshotDate, cagr);
}

function anchorPlusCashflowsExpected(
  anchorDate: string,
  anchorValueCAD: number,
  events: Array<{ date: string; amountCAD: number }>,
  snapshotDate: string,
  cagr: number,
): number {
  return cashflowExpected([{ date: anchorDate, amountCAD: anchorValueCAD }, ...events], snapshotDate, cagr);
}

{
  const cagr = getProjectionScenarioCagrPct(
    { scenarioCagrsPct: [{ id: "base", cagrPct: 7.25 }] },
    "base",
  );

  assert.equal(cagr, 7.25);
}

{
  const cagr = getProjectionScenarioCagrPct({ scenarioCagrsPct: [] }, "worst");

  assert.equal(cagr, 2);
}

{
  const series = buildProjectedPortfolioSeries(
    [
      { date: "2026-01-01", totalCAD: 100_000 },
      { date: "2027-01-01", totalCAD: 110_000 },
    ],
    { scenarioCagrsPct: [{ id: "base", cagrPct: 6 }], annualContribCAD: 12_000 },
    "base",
  );

  const expected0 = 100_000;
  const expected1 = anchorPlusCashflowsExpected("2026-01-01", 100_000, [], "2027-01-01", 0.06)
    + weeklyScheduleExpected("2026-01-08", "2027-01-01", 12_000 / 52, 0.06);

  assert.ok(series[0] !== null && Math.abs(series[0] - expected0) < 0.01);
  assert.ok(series[1] !== null);
  assert.ok(Math.abs((series[1] ?? 0) - expected1) < 0.01);
  assert.ok(series[1]! > 112_000, "BASE must compound the first CAD portfolio value as the starting dollar anchor");
}

{
  const snapshots = [
    { date: "2026-01-01", totalCAD: 100_000 },
    { date: "2026-07-02", totalCAD: 112_000 },
    { date: "2027-01-01", totalCAD: 125_000 },
  ];
  const series = buildProjectedPortfolioSeries(
    snapshots,
    { scenarioCagrsPct: [{ id: "base", cagrPct: 6 }], weeklyContribCAD: 460 },
    "base",
  );

  assert.equal(series.length, snapshots.length);
  assert.ok(series[0] !== null && Math.abs(series[0] - 100_000) < 0.01);
  assert.ok(series[1] !== null && series[1] > series[0]! + 15_000, "BASE must curve upward with anchor growth plus compounded weekly contributions by mid-year");
  const expected = anchorPlusCashflowsExpected("2026-01-01", 100_000, [], "2027-01-01", 0.06)
    + weeklyScheduleExpected("2026-01-08", "2027-01-01", 460, 0.06);
  assert.ok(series[2] !== null);
  assert.ok(Math.abs(series[2]! - expected) < 0.01, `expected ~${expected}, got ${series[2]}`);
  assert.ok(series[2]! > 130_000, "BASE must include and grow the first portfolio snapshot as principal");
}

{
  assert.deepEqual(
    BASE_RATE_OPTIONS.map((option) => ({ id: option.id, label: option.label, cagrPct: option.cagrPct })),
    [
      { id: "2", label: "2%", cagrPct: 2 },
      { id: "4", label: "4%", cagrPct: 4 },
      { id: "6", label: "6%", cagrPct: 6 },
      { id: "8", label: "8%", cagrPct: 8 },
      { id: "10", label: "10%", cagrPct: 10 },
      { id: "12", label: "12%", cagrPct: 12 },
    ],
    "Performance BASE UI options should be numeric-only 2/4/6/8/10/12 visualization rates",
  );
}

{
  const snapshots = [
    { date: "2026-01-01", totalCAD: 100_000 },
    { date: "2027-01-01", totalCAD: 125_000 },
  ];
  const series8 = buildProjectedPortfolioSeriesForRate(snapshots, { weeklyContribCAD: 460 }, 8);
  const series10 = buildProjectedPortfolioSeriesForRate(snapshots, { weeklyContribCAD: 460 }, 10);
  const series12 = buildProjectedPortfolioSeriesForRate(snapshots, { weeklyContribCAD: 460 }, 12);
  const expected8 = anchorPlusCashflowsExpected("2026-01-01", 100_000, [], "2027-01-01", 0.08)
    + weeklyScheduleExpected("2026-01-08", "2027-01-01", 460, 0.08);
  const expected10 = anchorPlusCashflowsExpected("2026-01-01", 100_000, [], "2027-01-01", 0.10)
    + weeklyScheduleExpected("2026-01-08", "2027-01-01", 460, 0.10);

  assert.ok(series8[1] !== null && Math.abs(series8[1] - expected8) < 0.01, `expected 8% ~${expected8}, got ${series8[1]}`);
  assert.ok(series10[1] !== null && Math.abs(series10[1] - expected10) < 0.01, `expected 10% ~${expected10}, got ${series10[1]}`);
  assert.ok(series10[1]! > series8[1]!, "10% BASE visualization line should end above 8%");
  assert.ok(series12[1]! > series10[1]!, "12% BASE visualization line should end above 10%");
}

{
  const series = buildProjectedPortfolioSeriesForRate(
    [
      { date: "2025-01-01", totalCAD: 1_000 },
      { date: "2026-01-01", totalCAD: 0 },
    ],
    { contributionEventsCAD: [{ date: "2025-01-01", amountCAD: 1_000 }] },
    10,
  );
  const expected = 1_000 * Math.pow(1.10, yearsBetween("2025-01-01", "2026-01-01"));
  assert.ok(series[1] !== null);
  assert.ok(Math.abs(series[1]! - expected) < 0.01, `single contribution 10% expected ${expected}, got ${series[1]}`);
}

{
  const monthlyEvents = Array.from({ length: 12 }, (_, index) => ({
    date: `2025-${String(index + 1).padStart(2, "0")}-01`,
    amountCAD: 100,
  }));
  const series = buildProjectedPortfolioSeriesForRate(
    [
      { date: "2025-01-01", totalCAD: 0 },
      { date: "2026-01-01", totalCAD: 0 },
    ],
    { contributionEventsCAD: monthlyEvents },
    6,
  );
  const expected = cashflowExpected(monthlyEvents, "2026-01-01", 0.06);
  assert.ok(series[1] !== null);
  assert.ok(Math.abs(series[1]! - expected) < 0.01, `12 monthly contributions at 6% expected ${expected}, got ${series[1]}`);
}

{
  const snapshots = [
    { date: "2025-01-01", totalCAD: 500_000 },
    { date: "2026-01-01", totalCAD: 0 },
  ];
  const externalDeposits = [
    { date: "2025-01-01", amountCAD: 1_000 },
    { date: "2025-07-01", amountCAD: 2_000 },
  ];
  const rate4 = buildProjectedPortfolioSeriesForRate(snapshots, { contributionEventsCAD: externalDeposits }, 4);
  const rate6 = buildProjectedPortfolioSeriesForRate(snapshots, { contributionEventsCAD: externalDeposits }, 6);
  const rate10 = buildProjectedPortfolioSeriesForRate(snapshots, { contributionEventsCAD: externalDeposits }, 10);

  const expected4 = cashflowExpected(externalDeposits, "2026-01-01", 0.04);
  const expected6 = cashflowExpected(externalDeposits, "2026-01-01", 0.06);
  const expected10 = cashflowExpected(externalDeposits, "2026-01-01", 0.10);

  assert.ok(rate4[1] !== null && Math.abs(rate4[1] - expected4) < 0.01, `4% BASE must use ExternalDeposit cash flows only; expected ${expected4}, got ${rate4[1]}`);
  assert.ok(rate6[1] !== null && Math.abs(rate6[1] - expected6) < 0.01, `6% BASE must use ExternalDeposit cash flows only; expected ${expected6}, got ${rate6[1]}`);
  assert.ok(rate10[1] !== null && Math.abs(rate10[1] - expected10) < 0.01, `10% BASE must use ExternalDeposit cash flows only; expected ${expected10}, got ${rate10[1]}`);
  assert.ok(rate4[1]! < rate6[1]! && rate6[1]! < rate10[1]!, "BASE dropdown r=4/6/10 must produce distinct values at the same date");
}

{
  const series = buildProjectedPortfolioSeries(
    [
      { date: "bad-date", totalCAD: 100_000 },
      { date: "2027-01-01", totalCAD: 110_000 },
    ],
    { annualContribCAD: 12_000 },
    "base",
  );

  assert.deepEqual(series, [null, null]);
}

{
  const events = [
    { date: "2026-01-01", amountCAD: 1_000 },
    { date: "2026-01-08", amountCAD: 460 },
    { date: "2026-01-15", amountCAD: 460 },
  ];
  const series = buildProjectedPortfolioSeriesForRate(
    [
      { date: "2026-01-01", totalCAD: 99_999 },
      { date: "2026-01-15", totalCAD: 110_000 },
    ],
    { weeklyContribCAD: 460, contributionEventsCAD: events },
    6,
  );
  const expected = cashflowExpected(events, "2026-01-15", 0.06);

  assert.ok(series[1] !== null);
  assert.ok(Math.abs(series[1]! - expected) < 0.01, `BASE must use actual ExternalDeposit cash flows only; expected ${expected}, got ${series[1]}`);
  assert.ok(series[1]! < 2_000, "BASE must not add the first portfolio snapshot as principal when actual contribution cash flows exist");
}

{
  const snapshots = [
    { date: "2026-01-01", totalCAD: 0 },
    { date: "2026-01-15", totalCAD: 0 },
  ];
  const allSeries = BASE_RATE_OPTIONS.map((option) => buildProjectedPortfolioSeriesForRate(snapshots, { weeklyContribCAD: 460 }, option.cagrPct));

  assert.equal(allSeries.length, 6);
  for (const series of allSeries) {
    assert.equal(series.length, snapshots.length);
    assert.ok(series[0] !== null, "rulebook fallback schedule should work without a positive portfolio anchor");
  }
  assert.ok(allSeries[5][1]! > allSeries[0][1]!, "12% visualization line should use the same schedule but higher compounding than 2%");
}

console.log("performance-projection tests passed");
