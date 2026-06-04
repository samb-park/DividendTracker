/** Shared types for the /pocket dividend run-rate surface (no server imports). */

/** One aggregated position = a single (accountType, ticker) pairing. */
export interface PositionRunRate {
  accountType: string;
  ticker: string;
  name: string;
  shares: number;
  priceUSD: number | null; // null when live price unavailable (honest — never fabricated)
  marketValueUSD: number | null;
  grossAnnualUSD: number;
  netAnnualUSD: number;
  frequency: number | null; // null when no dividend schedule could be detected
  hasDividendData: boolean;
  priceUnavailable: boolean;
  currency: string; // native listing currency (USD/CAD)
}

export interface RunRateResponse {
  asOf: string;
  fx: { usdcad: number; fallback: boolean };
  accountTypes: string[]; // distinct account types the user holds (for the account filter)
  positions: PositionRunRate[];
}

/** Per-ticker rollup over the currently-selected accounts (computed client-side). */
export interface TickerAgg {
  ticker: string;
  name: string;
  grossAnnualUSD: number;
  netAnnualUSD: number;
  marketValueUSD: number | null;
  hasDividendData: boolean;
  priceUnavailable: boolean;
}

export type Basis = "net" | "gross";
export type ThemePref = "system" | "light" | "dark";
