import assert from "node:assert/strict";
import { formatPerformanceAxisLabel } from "./performance-axis";

type Range = "3m" | "6m" | "1y" | "3y" | "5y" | "all";

function dailyDates(start: string, count: number): string[] {
  const dates: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

function labels(dates: string[], range: Range): string[] {
  return dates.map((date, index) => formatPerformanceAxisLabel(date, index, dates, range));
}

function visibleLabels(dates: string[], range: Range): string[] {
  return labels(dates, range).filter(Boolean);
}

// Data span under 1 year: show monthly labels even when all data is in the same year.
// Regression for the chart only showing "2026" on a short same-year history.
{
  const dates = dailyDates("2026-05-10", 210);
  const all = labels(dates, "1y");
  const visible = all.filter(Boolean);

  assert.deepEqual(visible, ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  assert.equal(all[1], "");
}

// Data span under 1 year: monthly boundaries only, not every daily tick.
{
  const dates = dailyDates("2026-01-15", 181);
  const visible = visibleLabels(dates, "6m");

  assert.deepEqual(visible, ["Jan 2026", "Feb", "Mar", "Apr", "May", "Jun", "Jul"]);
  assert.ok(visible.length <= 7);
}

// Data span of 1 year or more: show yearly labels, not monthly labels.
{
  const dates = dailyDates("2025-11-15", 366);
  const visible = visibleLabels(dates, "1y");

  assert.deepEqual(visible, ["2025", "2026"]);
  assert.ok(!visible.includes("Jan 2026"));
  assert.ok(!visible.includes("Mar"));
}

// Multi-year data: prefer annual year markers only.
{
  const dates = dailyDates("2022-06-15", 1300);
  const visible = visibleLabels(dates, "all");

  assert.deepEqual(visible, ["2022", "2023", "2024", "2025", "2026"]);
  assert.ok(visible.length <= 5);
}

console.log("performance-axis tests passed");
