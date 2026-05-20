export interface PortfolioValuePoint {
  date: string;
  valueCAD: number;
}

export interface ContributionEvent {
  date: string;
  amountCAD: number;
}

export interface WindowValueChangeInput {
  portfolio: PortfolioValuePoint[];
  contributions: ContributionEvent[];
  t0: string;
  t1: string;
}

export interface DatedCashFlow {
  date: string;
  amountCAD: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

function dateToMs(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

export function sumContributionsInWindow(contributions: ContributionEvent[], t0: string, t1: string): number {
  return contributions.reduce((sum, event) => {
    if (event.date > t0 && event.date <= t1 && Number.isFinite(event.amountCAD)) {
      return sum + event.amountCAD;
    }
    return sum;
  }, 0);
}

export function computeWindowValueChangePct(input: WindowValueChangeInput): number | null {
  if (input.portfolio.length < 2) return null;

  const sortedPortfolio = [...input.portfolio].sort((a, b) => a.date.localeCompare(b.date));
  const start = sortedPortfolio.find((point) => point.date === input.t0) ?? sortedPortfolio[0];
  const end = sortedPortfolio.find((point) => point.date === input.t1) ?? sortedPortfolio.at(-1)!;
  const totalContribInWindow = sumContributionsInWindow(input.contributions, input.t0, input.t1);
  const invested = start.valueCAD + totalContribInWindow;

  if (invested === 0) return end.valueCAD === 0 ? 0 : null;
  return ((end.valueCAD - invested) / invested) * 100;
}

export function computeMaxDrawdownPct(portfolio: PortfolioValuePoint[]): number | null {
  if (portfolio.length === 0) return null;

  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const point of portfolio) {
    if (!Number.isFinite(point.valueCAD)) continue;
    if (point.valueCAD > peak) peak = point.valueCAD;
    const drawdown = peak > 0 ? (point.valueCAD - peak) / peak : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown * 100;
}

function npv(rate: number, cashflows: DatedCashFlow[]): number {
  const start = dateToMs(cashflows[0].date);
  return cashflows.reduce((sum, flow) => {
    const years = (dateToMs(flow.date) - start) / MS_PER_DAY / DAYS_PER_YEAR;
    return sum + flow.amountCAD / Math.pow(1 + rate, years);
  }, 0);
}

export function computeXirrPct(cashflows: DatedCashFlow[]): number | null {
  const sorted = cashflows
    .filter((flow) => Number.isFinite(flow.amountCAD))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  if (!sorted.some((flow) => flow.amountCAD < 0) || !sorted.some((flow) => flow.amountCAD > 0)) return null;
  if (dateToMs(sorted[0].date) === dateToMs(sorted.at(-1)!.date)) return null;

  let low = -0.999999;
  let high = 10;
  let lowValue = npv(low, sorted);
  let highValue = npv(high, sorted);

  for (let i = 0; i < 8 && Math.sign(lowValue) === Math.sign(highValue); i++) {
    high *= 10;
    highValue = npv(high, sorted);
  }

  if (Math.sign(lowValue) === Math.sign(highValue)) return null;

  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const midValue = npv(mid, sorted);
    if (Math.abs(midValue) < 1e-7) return mid * 100;

    if (Math.sign(midValue) === Math.sign(lowValue)) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
    }
  }

  return ((low + high) / 2) * 100;
}
