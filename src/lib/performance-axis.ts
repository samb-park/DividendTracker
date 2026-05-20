export type PerformanceRange = "3m" | "6m" | "1y" | "3y" | "5y" | "all";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ONE_YEAR_DAYS = 365;

function parseDate(value: string): Date | null {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthLabel(date: Date, includeYear: boolean): string {
  const month = MONTH_LABELS[date.getUTCMonth()];
  return includeYear ? `${month} ${date.getUTCFullYear()}` : month;
}

function isFirstVisiblePointOfMonth(index: number, dates: string[]): boolean {
  if (index === 0) return true;
  const current = parseDate(dates[index]);
  const previous = parseDate(dates[index - 1]);
  if (!current || !previous) return false;

  return current.getUTCFullYear() !== previous.getUTCFullYear()
    || current.getUTCMonth() !== previous.getUTCMonth();
}

function isFirstVisiblePointOfYear(index: number, dates: string[]): boolean {
  if (index === 0) return true;
  const current = parseDate(dates[index]);
  const previous = parseDate(dates[index - 1]);
  if (!current || !previous) return false;

  return current.getUTCFullYear() !== previous.getUTCFullYear();
}

function daySpan(dates: string[]): number {
  if (dates.length < 2) return 0;
  const first = parseDate(dates[0]);
  const last = parseDate(dates[dates.length - 1]);
  if (!first || !last) return 0;
  return Math.max(0, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Sparse X-axis labels for the DividendTracker performance chart.
 *
 * ECharts calls this for every category. Returning an empty string keeps the
 * daily data points available for the line/tooltip while only showing useful
 * month/year markers on the axis.
 *
 * Label granularity is based on the actual data span, not the selected range:
 * - under 1 year: monthly labels
 * - 1 year or more: yearly labels
 */
export function formatPerformanceAxisLabel(
  value: string,
  index: number,
  dates: string[],
  _range: PerformanceRange,
): string {
  const date = parseDate(value);
  if (!date || dates.length === 0) return "";

  const span = daySpan(dates);

  if (span >= ONE_YEAR_DAYS) {
    if (!isFirstVisiblePointOfYear(index, dates)) return "";
    return String(date.getUTCFullYear());
  }

  if (!isFirstVisiblePointOfMonth(index, dates)) return "";
  return monthLabel(date, date.getUTCMonth() === 0);
}
