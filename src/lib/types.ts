export interface Transaction {
  id: string;
  action: "BUY" | "SELL" | "DIVIDEND";
  quantity: string;
  price: string;
  commission: string;
  date: string;
}

export interface Holding {
  id: string;
  ticker: string;
  name: string | null;
  currency: "USD" | "CAD";
  quantity: string | null;
  avgCost: string | null;
  transactions: Transaction[];
}

export interface Portfolio {
  id: string;
  name: string;
  cashCAD: string | null;
  cashUSD: string | null;
  holdings: Holding[];
}

export interface HoldingSummary {
  ticker: string;
  name?: string | null;
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  dayChange: number;
  annualDividend?: number; // trailing annual dividend income in native currency
  currency: "USD" | "CAD";
}
