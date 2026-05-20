export type EngineCurrency = "CAD" | "USD";
export type EngineTransactionAction = "BUY" | "SELL" | "DIVIDEND";
export type EngineCashLedgerEventType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "DRIP"
  | "FX_CONVERT"
  | "FEE"
  | "ADJUSTMENT";

export interface EngineTransaction {
  id: string;
  portfolioId: string;
  ticker: string;
  currency: EngineCurrency;
  action: EngineTransactionAction;
  date: string | Date;
  quantity: number;
  price: number;
  commission: number;
}

export interface EngineCashLedgerRow {
  id: string;
  portfolioId: string;
  date: string | Date;
  currency: EngineCurrency;
  amount: number;
  eventType: EngineCashLedgerEventType;
  ticker: string | null;
}

export interface EngineCashTransactionInput {
  id: string;
  portfolioId: string;
  date: string | Date;
  currency: EngineCurrency;
  action: "DEPOSIT" | "WITHDRAWAL";
  amount: number;
}

export interface EngineCurrentHoldingInput {
  portfolioId: string;
  ticker: string;
  currency: EngineCurrency;
  quantity: number;
  avgCost: number;
}

export interface EngineCurrentCashBalanceInput {
  portfolioId: string;
  cashCAD: number;
  cashUSD: number;
}

export interface MarketPricePoint {
  date: string | Date;
  ticker: string;
  close: number;
  currency: EngineCurrency;
}

export interface FxRatePoint {
  date: string | Date;
  usdCad: number;
}

export interface PortfolioValueCADInput {
  date: string | Date;
  portfolioIds: string[];
  transactions: EngineTransaction[];
  ledgerRows: EngineCashLedgerRow[];
  prices: MarketPricePoint[];
  fxRates: FxRatePoint[];
}

export interface PortfolioValueCADPoint {
  date: string;
  totalCAD: number;
  marketValueCAD: number;
  cashCAD: number;
}

export interface IncomeDistributionAutoBuyViolation {
  ticker: string;
  dividendTransactionId: string;
  buyTransactionId: string;
  date: string;
  message: string;
}

function dateKey(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function isOnOrBefore(value: string | Date, cutoff: string | Date): boolean {
  return dateKey(value) <= dateKey(cutoff);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function latestFxRateOnOrBefore(fxRates: FxRatePoint[], date: string | Date): number {
  const candidates = fxRates
    .filter((rate) => isOnOrBefore(rate.date, date))
    .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
  return candidates[0]?.usdCad ?? 1;
}

function latestPriceOnOrBefore(
  prices: MarketPricePoint[],
  ticker: string,
  date: string | Date,
): MarketPricePoint | null {
  const normalizedTicker = ticker.toUpperCase();
  const candidates = prices
    .filter((point) => point.ticker.toUpperCase() === normalizedTicker && isOnOrBefore(point.date, date))
    .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
  return candidates[0] ?? null;
}

export function computeCashBalance(
  ledgerRows: EngineCashLedgerRow[],
  portfolioId: string,
  currency: EngineCurrency,
  date: string | Date,
): number {
  const total = ledgerRows
    .filter((row) => row.portfolioId === portfolioId)
    .filter((row) => row.currency === currency)
    .filter((row) => isOnOrBefore(row.date, date))
    .reduce((sum, row) => sum + row.amount, 0);

  return roundMoney(total);
}

export function deriveCashLedgerRowsFromExistingRecords(args: {
  cashTransactions: EngineCashTransactionInput[];
  transactions: EngineTransaction[];
}): EngineCashLedgerRow[] {
  const cashRows: EngineCashLedgerRow[] = args.cashTransactions.map((cashTransaction) => ({
    id: `cash:${cashTransaction.id}`,
    portfolioId: cashTransaction.portfolioId,
    date: cashTransaction.date,
    currency: cashTransaction.currency,
    amount: roundMoney(cashTransaction.amount * (cashTransaction.action === "WITHDRAWAL" ? -1 : 1)),
    eventType: cashTransaction.action,
    ticker: null,
  }));

  const transactionRows: EngineCashLedgerRow[] = args.transactions.map((transaction) => {
    const gross = transaction.quantity * transaction.price;
    const commission = transaction.commission || 0;
    let amount = 0;
    let eventType: EngineCashLedgerEventType = transaction.action;

    if (transaction.action === "BUY") {
      amount = -(gross + commission);
    } else if (transaction.action === "SELL") {
      amount = gross - commission;
    } else {
      amount = gross;
      eventType = "DIVIDEND";
    }

    return {
      id: `tx:${transaction.id}`,
      portfolioId: transaction.portfolioId,
      date: transaction.date,
      currency: transaction.currency,
      amount: roundMoney(amount),
      eventType,
      ticker: transaction.ticker,
    };
  }).filter((row) => Number.isFinite(row.amount) && row.amount !== 0);

  return [...cashRows, ...transactionRows]
    .filter((row) => Number.isFinite(row.amount) && row.amount !== 0)
    .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)) || a.id.localeCompare(b.id));
}

export function deriveOpeningTransactionsFromCurrentHoldings(args: {
  anchorDate: string | Date;
  holdings: EngineCurrentHoldingInput[];
  transactions: EngineTransaction[];
}): EngineTransaction[] {
  const anchorKey = dateKey(args.anchorDate);
  const postAnchorNetQuantity = new Map<string, number>();

  for (const transaction of args.transactions) {
    if (dateKey(transaction.date) < anchorKey) continue;
    if (transaction.action !== "BUY" && transaction.action !== "SELL") continue;
    const key = `${transaction.portfolioId}:${transaction.ticker.toUpperCase()}`;
    const signedQuantity = transaction.action === "BUY" ? transaction.quantity : -transaction.quantity;
    postAnchorNetQuantity.set(key, (postAnchorNetQuantity.get(key) ?? 0) + signedQuantity);
  }

  return args.holdings.flatMap((holding) => {
    const ticker = holding.ticker.toUpperCase();
    const key = `${holding.portfolioId}:${ticker}`;
    const openingQuantity = roundQuantity(holding.quantity - (postAnchorNetQuantity.get(key) ?? 0));
    if (!Number.isFinite(openingQuantity) || Math.abs(openingQuantity) <= 0.000001) return [];

    return [{
      id: `opening:${holding.portfolioId}:${ticker}`,
      portfolioId: holding.portfolioId,
      ticker,
      currency: holding.currency,
      action: "BUY" as const,
      date: args.anchorDate,
      quantity: openingQuantity,
      price: Number.isFinite(holding.avgCost) ? holding.avgCost : 0,
      commission: 0,
    }];
  });
}

function cashDeltaByPortfolioCurrency(args: {
  cashTransactions: EngineCashTransactionInput[];
  transactions: EngineTransaction[];
  anchorDate: string | Date;
}): Map<string, number> {
  const anchorKey = dateKey(args.anchorDate);
  const deltas = new Map<string, number>();
  const add = (portfolioId: string, currency: EngineCurrency, amount: number) => {
    const key = `${portfolioId}:${currency}`;
    deltas.set(key, (deltas.get(key) ?? 0) + amount);
  };

  for (const cashTransaction of args.cashTransactions) {
    if (dateKey(cashTransaction.date) < anchorKey) continue;
    add(
      cashTransaction.portfolioId,
      cashTransaction.currency,
      cashTransaction.amount * (cashTransaction.action === "WITHDRAWAL" ? -1 : 1),
    );
  }

  for (const transaction of args.transactions) {
    if (dateKey(transaction.date) < anchorKey) continue;
    const gross = transaction.quantity * transaction.price;
    const commission = transaction.commission || 0;
    if (transaction.action === "BUY") add(transaction.portfolioId, transaction.currency, -(gross + commission));
    if (transaction.action === "SELL") add(transaction.portfolioId, transaction.currency, gross - commission);
    if (transaction.action === "DIVIDEND") add(transaction.portfolioId, transaction.currency, gross);
  }

  return deltas;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function deriveOpeningCashLedgerRows(args: {
  anchorDate: string | Date;
  currentCashBalances: EngineCurrentCashBalanceInput[];
  cashTransactions: EngineCashTransactionInput[];
  transactions: EngineTransaction[];
}): EngineCashLedgerRow[] {
  const deltas = cashDeltaByPortfolioCurrency({
    cashTransactions: args.cashTransactions,
    transactions: args.transactions,
    anchorDate: args.anchorDate,
  });

  return args.currentCashBalances.flatMap((balance) => {
    const rows: EngineCashLedgerRow[] = [];
    for (const currency of ["CAD", "USD"] as const) {
      const currentCash = currency === "CAD" ? balance.cashCAD : balance.cashUSD;
      const openingCash = roundMoney(currentCash - (deltas.get(`${balance.portfolioId}:${currency}`) ?? 0));
      if (!Number.isFinite(openingCash) || Math.abs(openingCash) <= 0.000001) continue;
      rows.push({
        id: `opening-cash:${balance.portfolioId}:${currency}`,
        portfolioId: balance.portfolioId,
        date: args.anchorDate,
        currency,
        amount: openingCash,
        eventType: "ADJUSTMENT",
        ticker: null,
      });
    }
    return rows;
  });
}

export function computePosition(
  transactions: EngineTransaction[],
  portfolioId: string,
  ticker: string,
  date: string | Date,
): number {
  const normalizedTicker = ticker.toUpperCase();
  const total = transactions
    .filter((transaction) => transaction.portfolioId === portfolioId)
    .filter((transaction) => transaction.ticker.toUpperCase() === normalizedTicker)
    .filter((transaction) => isOnOrBefore(transaction.date, date))
    .reduce((sum, transaction) => {
      if (transaction.action === "BUY") return sum + transaction.quantity;
      if (transaction.action === "SELL") return sum - transaction.quantity;
      return sum;
    }, 0);

  return Math.round((total + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function computePortfolioValueCAD(input: PortfolioValueCADInput): PortfolioValueCADPoint {
  const { date, portfolioIds, transactions, ledgerRows, prices, fxRates } = input;
  const portfolioIdSet = new Set(portfolioIds);
  const usdCad = latestFxRateOnOrBefore(fxRates, date);

  const cashCADNative = portfolioIds.reduce(
    (sum, id) => sum + computeCashBalance(ledgerRows, id, "CAD", date),
    0,
  );
  const cashUSDNative = portfolioIds.reduce(
    (sum, id) => sum + computeCashBalance(ledgerRows, id, "USD", date),
    0,
  );
  const cashCAD = roundMoney(cashCADNative + cashUSDNative * usdCad);

  const tickers = Array.from(
    new Set(
      transactions
        .filter((transaction) => portfolioIdSet.has(transaction.portfolioId))
        .filter((transaction) => isOnOrBefore(transaction.date, date))
        .map((transaction) => transaction.ticker.toUpperCase()),
    ),
  );

  const marketValueCAD = roundMoney(
    tickers.reduce((sum, ticker) => {
      const quantity = portfolioIds.reduce(
        (positionSum, id) => positionSum + computePosition(transactions, id, ticker, date),
        0,
      );
      if (quantity === 0) return sum;

      const marketPrice = latestPriceOnOrBefore(prices, ticker, date);
      if (!marketPrice) return sum;

      const value = quantity * marketPrice.close;
      return sum + (marketPrice.currency === "USD" ? value * usdCad : value);
    }, 0),
  );

  return {
    date: dateKey(date),
    totalCAD: roundMoney(cashCAD + marketValueCAD),
    marketValueCAD,
    cashCAD,
  };
}

export function detectIncomeDistributionAutoBuyViolations(
  transactions: EngineTransaction[],
  ticker: string,
): IncomeDistributionAutoBuyViolation[] {
  const normalizedTicker = ticker.toUpperCase();
  const dividendTransactions = transactions.filter(
    (transaction) =>
      transaction.ticker.toUpperCase() === normalizedTicker && transaction.action === "DIVIDEND",
  );
  const buyTransactions = transactions.filter(
    (transaction) => transaction.ticker.toUpperCase() === normalizedTicker && transaction.action === "BUY",
  );

  return dividendTransactions.flatMap((dividendTransaction) =>
    buyTransactions
      .filter(
        (buyTransaction) =>
          buyTransaction.portfolioId === dividendTransaction.portfolioId &&
          dateKey(buyTransaction.date) === dateKey(dividendTransaction.date),
      )
      .map((buyTransaction) => ({
        ticker: normalizedTicker,
        dividendTransactionId: dividendTransaction.id,
        buyTransactionId: buyTransaction.id,
        date: dateKey(dividendTransaction.date),
        message: `${normalizedTicker} dividend must not create an automatic BUY; keep distribution as USD cash only.`,
      })),
  );
}
