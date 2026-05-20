const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

export interface ShadowContribution {
  date: string;
  amountCAD: number;
}

export interface ShadowMarketPoint {
  date: string;
  value: number;
}

export interface ShadowDividendPoint {
  date: string;
  amount: number;
}

export interface ShadowPortfolioPoint {
  date: string;
  valueCAD: number;
  shares: number;
}

export interface XirrCashflow {
  date: string;
  amount: number;
}

function dateKey(value: string): string {
  return value.slice(0, 10);
}

function parseDate(value: string): Date | null {
  const date = new Date(`${dateKey(value)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MS_PER_DAY;
}

function sortedMarket(points: ShadowMarketPoint[]): ShadowMarketPoint[] {
  return points
    .map((point) => ({ date: dateKey(point.date), value: Number(point.value) }))
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function valueOnOrBefore(points: ShadowMarketPoint[], targetDate: string): number | null {
  let candidate: number | null = null;
  for (const point of points) {
    if (point.date > targetDate) break;
    candidate = point.value;
  }
  return candidate;
}

function groupContributions(contributions: ShadowContribution[]): Map<string, number> {
  const grouped = new Map<string, number>();
  for (const contribution of contributions) {
    const date = dateKey(contribution.date);
    const amountCAD = Number(contribution.amountCAD);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amountCAD) || amountCAD === 0) continue;
    grouped.set(date, (grouped.get(date) ?? 0) + amountCAD);
  }
  return grouped;
}

function groupDividends(dividends: ShadowDividendPoint[]): Map<string, number> {
  const grouped = new Map<string, number>();
  for (const dividend of dividends) {
    const date = dateKey(dividend.date);
    const amount = Number(dividend.amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount <= 0) continue;
    grouped.set(date, (grouped.get(date) ?? 0) + amount);
  }
  return grouped;
}

export function computeShadowPortfolio({
  contributions,
  prices,
  fxRates,
  dividends = [],
  valuationDates,
}: {
  contributions: ShadowContribution[];
  prices: ShadowMarketPoint[];
  fxRates: ShadowMarketPoint[];
  dividends?: ShadowDividendPoint[];
  valuationDates: string[];
}): ShadowPortfolioPoint[] {
  const normalizedPrices = sortedMarket(prices);
  const normalizedFx = sortedMarket(fxRates);
  const contributionsByDate = groupContributions(contributions);
  const dividendsByDate = groupDividends(dividends);
  const targetDates = valuationDates.map(dateKey).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));

  if (normalizedPrices.length === 0 || normalizedFx.length === 0 || targetDates.length === 0) {
    return targetDates.map((date) => ({ date, valueCAD: 0, shares: 0 }));
  }

  const timeline = Array.from(new Set([
    ...Array.from(contributionsByDate.keys()),
    ...Array.from(dividendsByDate.keys()),
    ...targetDates,
  ])).sort((a, b) => a.localeCompare(b));
  const valuationSet = new Set(targetDates);
  const output: ShadowPortfolioPoint[] = [];
  let shares = 0;

  for (const date of timeline) {
    const price = valueOnOrBefore(normalizedPrices, date);
    const fx = valueOnOrBefore(normalizedFx, date);

    if (price != null && fx != null) {
      const contributionCAD = contributionsByDate.get(date) ?? 0;
      if (contributionCAD !== 0) {
        shares += (contributionCAD / fx) / price;
        if (shares < 0) shares = 0;
      }

      const dividendPerShare = dividendsByDate.get(date) ?? 0;
      if (dividendPerShare > 0 && shares > 0) {
        const dividendUSD = shares * dividendPerShare;
        shares += dividendUSD / price;
      }
    }

    if (valuationSet.has(date)) {
      const valuationPrice = valueOnOrBefore(normalizedPrices, date);
      const valuationFx = valueOnOrBefore(normalizedFx, date);
      output.push({
        date,
        valueCAD: valuationPrice != null && valuationFx != null ? shares * valuationPrice * valuationFx : 0,
        shares,
      });
    }
  }

  const outputByDate = new Map(output.map((point) => [point.date, point]));
  return targetDates.map((date) => outputByDate.get(date) ?? { date, valueCAD: 0, shares });
}

function npv(cashflows: Array<XirrCashflow & { years: number }>, rate: number): number {
  return cashflows.reduce((sum, cashflow) => sum + cashflow.amount / Math.pow(1 + rate, cashflow.years), 0);
}

function npvDerivative(cashflows: Array<XirrCashflow & { years: number }>, rate: number): number {
  return cashflows.reduce((sum, cashflow) => {
    if (cashflow.years === 0) return sum;
    return sum - (cashflow.years * cashflow.amount) / Math.pow(1 + rate, cashflow.years + 1);
  }, 0);
}

export function computeXIRR(
  cashflows: XirrCashflow[],
  finalValue: number,
  finalDate: string,
): number | null {
  const parsedFinalDate = parseDate(finalDate);
  const parsedFinalValue = Number(finalValue);
  if (!parsedFinalDate || !Number.isFinite(parsedFinalValue) || parsedFinalValue <= 0) return null;

  const parsed = [
    ...cashflows.map((cashflow) => ({
      date: cashflow.date,
      parsedDate: parseDate(cashflow.date),
      amount: Number(cashflow.amount),
    })),
    { date: dateKey(finalDate), parsedDate: parsedFinalDate, amount: parsedFinalValue },
  ]
    .filter((cashflow): cashflow is XirrCashflow & { parsedDate: Date } => (
      !!cashflow.parsedDate && Number.isFinite(cashflow.amount) && cashflow.amount !== 0
    ))
    .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

  if (parsed.length < 2) return null;
  if (!parsed.some((cashflow) => cashflow.amount < 0) || !parsed.some((cashflow) => cashflow.amount > 0)) return null;

  const firstDate = parsed[0].parsedDate;
  const withYears = parsed.map((cashflow) => ({
    date: cashflow.date,
    amount: cashflow.amount,
    years: daysBetween(firstDate, cashflow.parsedDate) / DAYS_PER_YEAR,
  }));

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    if (rate <= -1) return null;
    const value = npv(withYears, rate);
    if (Math.abs(value) < 1e-7) return rate;

    const derivative = npvDerivative(withYears, rate);
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) return null;

    const nextRate = rate - value / derivative;
    if (!Number.isFinite(nextRate) || nextRate <= -1) return null;
    if (Math.abs(nextRate - rate) < 1e-7) return nextRate;
    rate = nextRate;
  }

  return null;
}
