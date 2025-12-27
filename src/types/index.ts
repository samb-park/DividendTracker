// Broker types
export const BROKERS = [
  "WEALTHSIMPLE",
  "QUESTRADE",
  "INTERACTIVE_BROKERS",
  "TD_DIRECT",
  "OTHER",
] as const;
export type Broker = (typeof BROKERS)[number];

// Currency types
export const CURRENCIES = ["CAD", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

// Transaction types
export const TRANSACTION_TYPES = [
  "BUY",
  "SELL",
  "DIVIDEND_CASH",
  "DIVIDEND_DRIP",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "SPLIT",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

// Dividend frequency types
export const DIVIDEND_FREQUENCIES = [
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUAL",
  "ANNUAL",
  "IRREGULAR",
] as const;
export type DividendFrequency = (typeof DIVIDEND_FREQUENCIES)[number];

// API Response types
export interface AccountWithCounts {
  id: string;
  broker: string;
  name: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    holdings: number;
    transactions: number;
  };
}

export interface HoldingWithPrice {
  id: string;
  accountId: string;
  ticker: string;
  quantity: string;
  avgCost: string;
  currency: string;
  currentPrice?: string;
  marketValue?: string;
  profitLoss?: string;
  profitLossPercent?: string;
  dividendYield?: string;
  name?: string;
  logoUrl?: string;
  weight?: string;
  fiftyTwoWeekHigh?: string;
  fiftyTwoWeekLow?: string;
  dailyChange?: string;
  dailyChangePercent?: string;
  previousClose?: string;
}

export interface AccountSummary {
  id: string;
  name: string;
  broker: string;
  currency: string;
  holdingsCount: number;
  totalCost: string;
  totalValue: string;
  profitLoss: string;
  profitLossPercent: string;
}

export interface DashboardData {
  accounts: AccountSummary[];
  totals: {
    CAD: { cost: string; value: string; pl: string };
    USD: { cost: string; value: string; pl: string };
  };
  ytdDividends: string;
  expectedAnnualDividend: string;
  lastUpdated: string;
}

export interface QuoteData {
  ticker: string;
  price: number;
  previousClose?: number;
  currency: string;
  dividendYield?: number;
  name?: string;
  logoUrl?: string;
  exchange?: string;
  cached?: boolean;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
}

export interface ImportPreview {
  rowNumber: number;
  ticker: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  tradeDate: string;
  note?: string;
  isValid: boolean;
  error?: string;
}

export interface ImportPreviewResponse {
  preview: ImportPreview[];
  totalRows: number;
  validRows: number;
  errors: string[];
  columns: string[];
}

// Questrade API types
export interface QuestradeAccount {
  type: string; // e.g., "TFSA", "RRSP", "Margin"
  number: string;
  status: string;
  isPrimary: boolean;
  isBilling: boolean;
  clientAccountType: string;
}

export interface QuestradePosition {
  symbol: string;
  symbolId: number;
  openQuantity: number;
  closedQuantity: number;
  currentMarketValue: number;
  currentPrice: number;
  averageEntryPrice: number;
  closedPnl: number;
  openPnl: number;
  totalCost: number;
  isRealTime: boolean;
  isUnderReorg: boolean;
}

export interface QuestradeBalance {
  currency: string;
  cash: number;
  marketValue: number;
  totalEquity: number;
  buyingPower: number;
  maintenanceExcess: number;
  isRealTime: boolean;
}

export interface QuestradeActivity {
  tradeDate: string;
  transactionDate: string;
  settlementDate: string;
  action: string; // "Buy", "Sell", "Dividends", etc.
  symbol: string;
  symbolId: number;
  description: string;
  currency: string;
  quantity: number;
  price: number;
  grossAmount: number;
  commission: number;
  netAmount: number;
  type: string;
}

// Portfolio snapshot for historical tracking
export interface PortfolioSnapshot {
  id: string;
  date: string;
  totalValue: string;
  totalCost: string;
  currency: string;
}

// Portfolio summary for header display
export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  profitLoss: number;
  profitLossPercent: number;
  dailyChange: number;
  dailyChangePercent: number;
  currency: string;
}
