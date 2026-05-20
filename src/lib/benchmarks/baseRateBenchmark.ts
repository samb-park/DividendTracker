export interface ContributionEvent {
  date: string;
  amountCAD: number;
}

export interface BenchmarkPoint {
  date: string;
  valueCAD: number;
}

export interface BaseRateBenchmarkInput {
  v0CAD: number;
  dates: string[];
  contributions: ContributionEvent[];
  ratePercent: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

function dateToMs(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

function daysBetween(startDate: string, endDate: string): number {
  return (dateToMs(endDate) - dateToMs(startDate)) / MS_PER_DAY;
}

function compound(rate: number, days: number): number {
  return Math.pow(1 + rate, days / DAYS_PER_YEAR);
}

export function buildV0AnchoredBaseRateBenchmark(input: BaseRateBenchmarkInput): BenchmarkPoint[] {
  const dates = [...input.dates].sort();
  if (dates.length === 0) return [];

  const t0 = dates[0];
  const v0CAD = Math.max(0, Number.isFinite(input.v0CAD) ? input.v0CAD : 0);
  const rate = Number.isFinite(input.ratePercent) ? input.ratePercent / 100 : 0;
  const contributions = input.contributions
    .filter((event) => Number.isFinite(event.amountCAD))
    .sort((a, b) => a.date.localeCompare(b.date));

  return dates.map((date) => {
    let valueCAD = v0CAD * compound(rate, daysBetween(t0, date));

    for (const event of contributions) {
      if (event.date <= t0) continue;
      if (event.date > date) break;
      valueCAD += event.amountCAD * compound(rate, daysBetween(event.date, date));
    }

    return { date, valueCAD };
  });
}
