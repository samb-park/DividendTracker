/**
 * Single source of truth for US NRA dividend withholding ("net factor").
 *
 * Extracted from /api/dividend-income so every surface (income chart, calendar,
 * pocket run-rate) computes net dividends the same way. Do NOT reimplement this
 * inline elsewhere — import from here.
 */

/**
 * Heuristic: US-listed tickers have no exchange suffix (e.g. AAPL, VTI, SCHD).
 * Canadian tickers use .TO, .V, .CN, etc. Foreign ADRs in USD may differ.
 */
export function isUSListed(ticker: string): boolean {
  return !ticker.includes(".");
}

/**
 * Fraction of a GROSS dividend the holder actually receives after US 15% NRA
 * withholding, by account type. 1.0 = full gross (no withholding lost).
 *
 * - RRSP: US-listed exempt under Canada-US treaty Art. XXI(7) → 1.0.
 *         Non-US foreign holdings (ADRs/EU) → 0.85 (treaty may not apply).
 * - TFSA / FHSA / RESP: not treaty-exempt → 0.85 on US-listed, else 1.0.
 * - NON_REG / CASH (Margin): gross (1.0); personal tax handled separately.
 */
export function netFactor(accountType: string, currency: string, ticker: string): number {
  const applyUSWithholding = currency === "USD" && isUSListed(ticker);
  if (accountType === "RRSP") {
    if (applyUSWithholding) return 1.0;
    if (currency === "CAD") return 1.0;
    return 0.85;
  }
  if (accountType === "TFSA") return applyUSWithholding ? 0.85 : 1.0;
  if (accountType === "FHSA") return applyUSWithholding ? 0.85 : 1.0;
  if (accountType === "RESP") return applyUSWithholding ? 0.85 : 1.0;
  return 1.0; // Margin/Cash/NON_REG — gross
}
