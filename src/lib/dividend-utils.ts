/** Shared dividend utilities */

/** Detect dividend payment frequency from historical payment spacing */
export function detectFrequency(
  dividends: Array<{ date: string | Date; amount: number }>
): number {
  if (dividends.length < 2) return 4;
  const dates = dividends.map((d) => new Date(d.date).getTime());
  const spacings: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const monthDiff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24 * 30.5);
    spacings.push(monthDiff);
  }
  const avg = spacings.reduce((a, b) => a + b, 0) / spacings.length;
  if (avg <= 1.5) return 12;
  if (avg <= 4) return 4;
  if (avg <= 8) return 2;
  return 1;
}
