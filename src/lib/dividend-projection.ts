export interface DividendProjectionItem {
  ticker: string;
  amount: number;
  net: number;
  currency: string;
  accountType: string;
  isCanadianEligible?: boolean;
}

export interface DividendProjectionApiData {
  months: Array<{ month: string; items: DividendProjectionItem[] }>;
}

export type DividendMonthSource = "received" | "projected" | "empty";

export interface DividendProjectionMonth {
  month: string;
  items: DividendProjectionItem[];
  source: DividendMonthSource;
}

export function buildDividendIncomeProjectionMonths({
  year,
  actual,
  projected,
  currentYear = new Date().getFullYear(),
  currentMonth = new Date().getMonth() + 1,
}: {
  year: number;
  actual: DividendProjectionApiData | null | undefined;
  projected: DividendProjectionApiData | null | undefined;
  currentYear?: number;
  currentMonth?: number;
}): DividendProjectionMonth[] {
  const actualByMonth = new Map((actual?.months ?? []).map((month) => [month.month, month.items]));
  const projectedByMonth = new Map((projected?.months ?? []).map((month) => [month.month, month.items]));

  return Array.from({ length: 12 }, (_, index) => {
    const monthNumber = index + 1;
    const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
    const actualItems = actualByMonth.get(month) ?? [];
    if (actualItems.length > 0) {
      return { month, items: actualItems, source: "received" as const };
    }

    const isFutureMonth = year > currentYear || (year === currentYear && monthNumber > currentMonth);
    const projectedItems = projectedByMonth.get(month) ?? [];
    if (isFutureMonth && projectedItems.length > 0) {
      return { month, items: projectedItems, source: "projected" as const };
    }

    return { month, items: [], source: "empty" as const };
  });
}

export function summarizeDividendProjection(
  months: DividendProjectionMonth[],
  itemValue: (item: DividendProjectionItem) => number,
) {
  let receivedTotal = 0;
  let projectedTotal = 0;

  for (const month of months) {
    const monthTotal = month.items.reduce((sum, item) => sum + itemValue(item), 0);
    if (month.source === "received") receivedTotal += monthTotal;
    if (month.source === "projected") projectedTotal += monthTotal;
  }

  const fullYearTotal = receivedTotal + projectedTotal;
  return {
    receivedTotal,
    projectedTotal,
    fullYearTotal,
    projectedMonthlyAvg: fullYearTotal / 12,
  };
}
