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
  frequencyConfident: boolean; // false when <2 history records → frequency is a guess (annual may be inflated)
  hasDividendData: boolean;
  priceUnavailable: boolean;
  currency: string; // native listing currency (USD/CAD)
  nextExDate: string | null; // YYYY-MM-DD, next (future) ex-dividend date
  nextPayDate: string | null; // YYYY-MM-DD, next (future) payment date
  dateConfirmed: boolean; // true = confirmed upcoming date; false = rolled-forward estimate
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
  lowConfidence: boolean; // any contributing position annualized from <2 dividend records
  nextExDate: string | null;
  nextPayDate: string | null;
  dateConfirmed: boolean;
  perPaymentNetUSD: number; // expected NET amount of the next single payment (USD)
  perPaymentGrossUSD: number; // expected GROSS amount of the next single payment (USD)
}

export type Basis = "net" | "gross";
export type EventFilter = "all" | "ex" | "pay";
export type HistoryMode = "dividends" | "transactions";
export type TxnFilter = "all" | "buy" | "sell" | "div";

/** A row from GET /api/transactions/calendar (all actions, date desc). */
export interface TransactionRow {
  id: string;
  action: "BUY" | "SELL" | "DIVIDEND";
  date: string; // YYYY-MM-DD
  ticker: string;
  quantity: number;
  price: number;
  commission: number;
  total: number; // quantity × price (native currency; for DIVIDEND, price=net so total=net)
  currency: string;
}
export type ThemePref = "system" | "light" | "dark";

/** A user-defined ticker group ("포트폴리오") persisted server-side. */
export interface PocketGroup {
  id: string;
  name: string;
  color: string | null; // hex accent, e.g. "#0a8043"
  icon: string | null; // optional emoji label
  accounts: string[]; // account-type scope (e.g. ["RRSP"]); empty = all accounts
  tickers: string[]; // held ticker symbols included in this group
  sortOrder: number;
}

/** Preset accent colors for pocket groups (first = default for a new group). */
export const POCKET_GROUP_COLORS = [
  "#0a8043", // brand green
  "#2563eb", // blue
  "#7c3aed", // purple
  "#db2777", // pink
  "#dc2626", // red
  "#f59e0b", // amber
  "#0891b2", // cyan
  "#64748b", // slate
] as const;
