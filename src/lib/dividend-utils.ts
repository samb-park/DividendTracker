/** Shared dividend utilities */

/** Median of a non-empty number list (average of the two middles when even). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Detect dividend payment frequency from historical payment spacing.
 *
 * Judged on the MEDIAN spacing of payments within the last 18 months (falling
 * back to the median of the full history when fewer than 2 recent spacings
 * exist). A plain all-history average misclassifies tickers whose schedule
 * changed (e.g. QLD: irregular early history pushed the average to ~6.3 months
 * → semiannual, halving the run-rate, despite a clearly quarterly recent
 * cadence) and is skewed by one-off special dividends; the recent-window median
 * is robust to both.
 */
export function detectFrequency(
  dividends: Array<{ date: string | Date; amount: number }>,
  now: Date = new Date()
): number {
  if (dividends.length < 2) return 4;
  const dates = dividends
    .map((d) => new Date(d.date).getTime())
    .sort((a, b) => a - b);

  const MONTH_MS = 1000 * 60 * 60 * 24 * 30.5;
  const recentCutoff = now.getTime() - 18 * MONTH_MS;

  const allSpacings: number[] = [];
  const recentSpacings: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const monthDiff = (dates[i] - dates[i - 1]) / MONTH_MS;
    allSpacings.push(monthDiff);
    // A spacing is "recent" when its later payment falls inside the window.
    if (dates[i] >= recentCutoff) recentSpacings.push(monthDiff);
  }

  const typical = median(recentSpacings.length >= 2 ? recentSpacings : allSpacings);
  if (typical <= 1.5) return 12;
  if (typical <= 4) return 4;
  if (typical <= 8) return 2;
  return 1;
}
