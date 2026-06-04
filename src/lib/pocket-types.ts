/** Shared types for the /pocket dividend run-rate surface (no server imports). */

export interface TickerRunRate {
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
  tickers: TickerRunRate[];
}

export type Basis = "net" | "gross";
export type ThemePref = "system" | "light" | "dark";
