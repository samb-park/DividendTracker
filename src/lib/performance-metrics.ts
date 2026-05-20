import { computeXIRR, type XirrCashflow } from "./performance-shadow";

export type PerformanceMetricRange = "3m" | "6m" | "1y" | "3y" | "5y" | "all";

export interface PerformanceMetricSnapshot {
  date: string;
  totalCAD: number;
}

export interface PerformanceContributionEventCAD {
  date: string;
  amountCAD: number;
}

export interface PerformanceMetrics {
  xirr: number | null;
  mdd: number | null;
  valueChange: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

export function computeMDD(values: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (v - peak) / peak : 0;
    if (dd < mdd) mdd = dd;
  }
  return mdd * 100;
}

function actualYearsBetween(startDate: string, endDate: string): number | null {
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00Z`).getTime();
  const end = new Date(`${endDate.slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / (DAYS_PER_YEAR * MS_PER_DAY);
}

export function getPerformanceMetricYears(
  range: PerformanceMetricRange,
  startDate: string,
  endDate: string,
): number | null {
  void range;
  return actualYearsBetween(startDate, endDate);
}

export function computeCAGR(start: number, end: number, years: number | null): number | null {
  if (start <= 0 || end <= 0 || years === null || years <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

function buildPortfolioXirrCashflows(
  snapshots: PerformanceMetricSnapshot[],
  contributionEventsCAD: PerformanceContributionEventCAD[],
): XirrCashflow[] {
  const last = snapshots[snapshots.length - 1];
  const endDate = last.date.slice(0, 10);
  const validEvents = contributionEventsCAD
    .map((event) => ({ date: event.date.slice(0, 10), amountCAD: Number(event.amountCAD) }))
    .filter((event) => Number.isFinite(event.amountCAD) && event.amountCAD !== 0 && event.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  return validEvents.map((event) => ({ date: event.date, amount: -event.amountCAD }));
}

function totalContributionsThrough(
  contributionEventsCAD: PerformanceContributionEventCAD[],
  endDate: string,
): number {
  return contributionEventsCAD
    .map((event) => ({ date: event.date.slice(0, 10), amountCAD: Number(event.amountCAD) }))
    .filter((event) => Number.isFinite(event.amountCAD) && event.date <= endDate.slice(0, 10))
    .reduce((sum, event) => sum + event.amountCAD, 0);
}

export function computePerformanceMetrics(
  snapshots: PerformanceMetricSnapshot[],
  range: PerformanceMetricRange,
  contributionEventsCAD: PerformanceContributionEventCAD[] = [],
): PerformanceMetrics {
  if (snapshots.length < 2) return { xirr: null, mdd: null, valueChange: null };

  const last = snapshots[snapshots.length - 1];
  const totalContribCAD = totalContributionsThrough(contributionEventsCAD, last.date);
  const valueChange = totalContribCAD > 0
    ? ((last.totalCAD - totalContribCAD) / totalContribCAD) * 100
    : null;
  void range;
  const xirr = computeXIRR(buildPortfolioXirrCashflows(snapshots, contributionEventsCAD), Number(last.totalCAD), last.date);
  const mdd = computeMDD(snapshots.map((snapshot) => snapshot.totalCAD));

  return { xirr, mdd, valueChange };
}
