import type { BenchmarkPoint, ContributionEvent } from "./baseRateBenchmark";

export interface PricePointUSD {
  date: string;
  close: number;
}

export interface FxRatePoint {
  date: string;
  rate: number;
}

export interface SpyBenchmarkInput {
  v0CAD: number;
  dates: string[];
  contributions: ContributionEvent[];
  pricesUSD: PricePointUSD[];
  fxRates: FxRatePoint[];
}

interface DatedValue {
  date: string;
  value: number;
}

function sanitizeNumber(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getOnOrBefore(points: DatedValue[], date: string): number | null {
  let value: number | null = null;
  for (const point of points) {
    if (point.date > date) break;
    value = point.value;
  }
  return value;
}

function getOnOrAfter(points: DatedValue[], date: string): number | null {
  for (const point of points) {
    if (point.date >= date) return point.value;
  }
  return null;
}

function getSeriesValue(points: DatedValue[], date: string): number | null {
  return getOnOrBefore(points, date) ?? getOnOrAfter(points, date);
}

function getContributionValue(points: DatedValue[], date: string): number | null {
  return getOnOrAfter(points, date) ?? getOnOrBefore(points, date);
}

function buildFxLookup(fxRates: FxRatePoint[]): DatedValue[] {
  return fxRates
    .map((point) => ({ date: point.date, value: point.rate }))
    .filter((point) => sanitizeNumber(point.value) !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildPriceCADSeries(pricesUSD: PricePointUSD[], fxRates: FxRatePoint[]): DatedValue[] {
  const fx = buildFxLookup(fxRates);
  return pricesUSD
    .map((point) => {
      const close = sanitizeNumber(point.close);
      const rate = getSeriesValue(fx, point.date);
      if (close === null || rate === null) return null;
      return { date: point.date, value: close * rate };
    })
    .filter((point): point is DatedValue => point !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildV0AnchoredSpyBenchmark(input: SpyBenchmarkInput): BenchmarkPoint[] {
  const dates = [...input.dates].sort();
  if (dates.length === 0) return [];

  const t0 = dates[0];
  const v0CAD = Math.max(0, Number.isFinite(input.v0CAD) ? input.v0CAD : 0);
  const pricesCAD = buildPriceCADSeries(input.pricesUSD, input.fxRates);
  const t0Price = getSeriesValue(pricesCAD, t0);
  let shares = v0CAD > 0 && t0Price !== null ? v0CAD / t0Price : 0;
  let contributionIndex = 0;
  const contributions = input.contributions
    .filter((event) => Number.isFinite(event.amountCAD))
    .sort((a, b) => a.date.localeCompare(b.date));

  return dates.map((date, index) => {
    while (contributionIndex < contributions.length) {
      const event = contributions[contributionIndex];
      if (event.date <= t0) {
        contributionIndex++;
        continue;
      }
      if (event.date > date) break;

      const contributionPrice = getContributionValue(pricesCAD, event.date);
      if (contributionPrice !== null) {
        shares += event.amountCAD / contributionPrice;
      }
      contributionIndex++;
    }

    if (index === 0) return { date, valueCAD: v0CAD };

    const priceCAD = getSeriesValue(pricesCAD, date);
    return { date, valueCAD: priceCAD === null ? 0 : shares * priceCAD };
  });
}

export function convertUsdToCadByDate(
  amountUSD: number,
  date: string,
  fxRates: FxRatePoint[],
  fallbackRate: number,
): number {
  const fx = buildFxLookup(fxRates);
  const rate = getSeriesValue(fx, date) ?? fallbackRate;
  return amountUSD * rate;
}
