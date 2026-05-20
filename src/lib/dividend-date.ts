export function toLocalNoonDate(dateStr: string): Date {
  const dateOnly = dateStr.split("T")[0];
  return new Date(`${dateOnly}T12:00:00`);
}

export function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function projectDividendMonthsFromAnchor({
  anchorDate,
  frequency,
  year,
}: {
  anchorDate: string;
  frequency: number;
  year: number;
}): string[] {
  if (!anchorDate || !Number.isFinite(frequency) || frequency <= 0) return [];

  const intervalMonths = 12 / frequency;
  const yearStart = new Date(`${year}-01-01T00:00:00`);
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00`);
  const cur = toLocalNoonDate(anchorDate);

  while (cur >= yearStart) {
    cur.setMonth(cur.getMonth() - intervalMonths);
  }

  const months: string[] = [];
  while (cur < yearEnd) {
    cur.setMonth(cur.getMonth() + intervalMonths);
    if (cur >= yearStart && cur < yearEnd) {
      months.push(monthKeyFromDate(cur));
    }
  }

  return months;
}
