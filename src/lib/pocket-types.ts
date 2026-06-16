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
  // true = source-DECLARED upcoming date; false = an estimate (either rolled
  // forward by the app or published by the source as its own "estimated" row).
  dateConfirmed: boolean;
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
  shares: number; // total shares across the selected accounts (banner "N sh × $rate")
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

/** Roll (account × ticker) positions up to per-ticker USD aggregates. */
export function rollupTickers(list: PositionRunRate[]): TickerAgg[] {
  const map = new Map<string, TickerAgg>();
  for (const p of list) {
    const lowConf = p.hasDividendData && !p.frequencyConfident;
    const freq = p.frequency || 0;
    const ppNet = freq > 0 ? p.netAnnualUSD / freq : 0;
    const ppGross = freq > 0 ? p.grossAnnualUSD / freq : 0;
    const e = map.get(p.ticker);
    if (e) {
      e.shares += p.shares;
      e.grossAnnualUSD += p.grossAnnualUSD;
      e.netAnnualUSD += p.netAnnualUSD;
      if (p.marketValueUSD != null) e.marketValueUSD = (e.marketValueUSD ?? 0) + p.marketValueUSD;
      e.hasDividendData = e.hasDividendData || p.hasDividendData;
      e.priceUnavailable = e.priceUnavailable || p.priceUnavailable;
      e.lowConfidence = e.lowConfidence || lowConf;
      e.perPaymentNetUSD += ppNet;
      e.perPaymentGrossUSD += ppGross;
      if (!e.nextExDate && p.nextExDate) e.nextExDate = p.nextExDate;
      if (!e.nextPayDate && p.nextPayDate) e.nextPayDate = p.nextPayDate;
      e.dateConfirmed = e.dateConfirmed || p.dateConfirmed;
    } else {
      map.set(p.ticker, {
        ticker: p.ticker,
        name: p.name,
        shares: p.shares,
        grossAnnualUSD: p.grossAnnualUSD,
        netAnnualUSD: p.netAnnualUSD,
        marketValueUSD: p.marketValueUSD,
        hasDividendData: p.hasDividendData,
        priceUnavailable: p.priceUnavailable,
        lowConfidence: lowConf,
        nextExDate: p.nextExDate,
        nextPayDate: p.nextPayDate,
        dateConfirmed: p.dateConfirmed,
        perPaymentNetUSD: ppNet,
        perPaymentGrossUSD: ppGross,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.netAnnualUSD - a.netAnnualUSD);
}

export type Basis = "net" | "gross";
// The "Activity" tab's modes — "upcoming" (future ex/pay) plus the three past-activity
// views. (Named HistoryMode for historical reasons; it now drives the merged tab.)
export type HistoryMode = "upcoming" | "dividends" | "transactions" | "cashflow";

/** A row from GET /api/cash-transactions?year=YYYY — a deposit/withdrawal tied to
 *  a brokerage account (portfolio). Used by the History → Cash Flow view to show
 *  per-account contributions ("불입") per year, in CAD. */
export interface CashFlowRow {
  id: string;
  date: string; // YYYY-MM-DD
  portfolioId: string;
  portfolioName: string;
  portfolioAccountType: string; // TFSA / RRSP / FHSA / NON_REG / CASH
  action: "DEPOSIT" | "WITHDRAWAL";
  amount: number; // native currency, always positive
  currency: "CAD" | "USD";
  notes: string | null;
}

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
  accountType: string; // TFSA/RRSP/FHSA/NON_REG/CASH — for portfolio (account-scope) filtering
}

/** Human labels for account types — shared by the group manager and the charts. */
export const ACCT_LABELS: Record<string, string> = {
  TFSA: "TFSA",
  RRSP: "RRSP",
  FHSA: "FHSA",
  NON_REG: "Non-Reg",
  CASH: "Cash",
};

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

/** Synthetic-id prefix for a built-in per-account portfolio (e.g. "acct:RRSP"). */
export const ACCT_PORTFOLIO_PREFIX = "acct:";

/** True if an account type is in the selected portfolio's scope. Empty scope = all. */
export const inAccountScope = (accountType: string, scope: string[]) =>
  scope.length === 0 || scope.includes(accountType);

/**
 * One selectable portfolio in the unified picker/order: the pinned "All" (id=null),
 * a built-in per-account portfolio (id="acct:<TYPE>", always-current, not editable),
 * or a user PocketGroup (id=group id). Color is for the row/legend dot only.
 */
export interface PortfolioOption {
  id: string | null;
  name: string;
  kind: "all" | "account" | "group";
  color: string | null;
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
