import assert from "node:assert/strict";

import {
  computeCashBalance,
  computePortfolioValueCAD,
  computePosition,
  deriveCashLedgerRowsFromExistingRecords,
  deriveOpeningCashLedgerRows,
  deriveOpeningTransactionsFromCurrentHoldings,
  detectIncomeDistributionAutoBuyViolations,
  type EngineCashLedgerRow,
  type EngineTransaction,
  type FxRatePoint,
  type MarketPricePoint,
} from "./engine";

const portfolioId = "tfsa";

function tx(overrides: Partial<EngineTransaction> = {}): EngineTransaction {
  return {
    id: "tx-default",
    portfolioId,
    ticker: "SCHD",
    currency: "CAD",
    action: "BUY",
    date: "2026-06-01",
    quantity: 0,
    price: 0,
    commission: 0,
    ...overrides,
  };
}

function ledger(overrides: Partial<EngineCashLedgerRow> = {}): EngineCashLedgerRow {
  return {
    id: "ledger-default",
    portfolioId,
    date: "2026-06-01",
    currency: "CAD",
    amount: 0,
    eventType: "DEPOSIT",
    ticker: null,
    ...overrides,
  };
}

function price(overrides: Partial<MarketPricePoint> = {}): MarketPricePoint {
  return {
    date: "2026-06-30",
    ticker: "SCHD",
    close: 80,
    currency: "CAD",
    ...overrides,
  };
}

function fx(overrides: Partial<FxRatePoint> = {}): FxRatePoint {
  return {
    date: "2026-06-30",
    usdCad: 1.35,
    ...overrides,
  };
}

function testCadDepositAndBuyLeavesCashRemainder() {
  const rows: EngineCashLedgerRow[] = [
    ledger({ id: "deposit", date: "2026-06-01", amount: 460, eventType: "DEPOSIT" }),
    ledger({ id: "buy", date: "2026-06-02", amount: -322, eventType: "BUY", ticker: "SCHD" }),
  ];

  assert.equal(computeCashBalance(rows, portfolioId, "CAD", "2026-06-30"), 138);
}

function testDividendAndExplicitDripOnlyChangesPositionThroughBuys() {
  const transactions: EngineTransaction[] = [
    tx({ id: "initial-schd", date: "2026-06-01", ticker: "SCHD", action: "BUY", quantity: 10, price: 80 }),
    tx({ id: "schd-div", date: "2026-06-27", ticker: "SCHD", action: "DIVIDEND", quantity: 10, price: 3 }),
    tx({ id: "drip-schd", date: "2026-06-30", ticker: "SCHD", action: "BUY", quantity: 0.25, price: 84 }),
    tx({ id: "drip-qld", date: "2026-06-30", ticker: "QLD", action: "BUY", quantity: 0.09, price: 100 }),
  ];
  const rows: EngineCashLedgerRow[] = [
    ledger({ id: "schd-div-cash", date: "2026-06-27", amount: 30, eventType: "DIVIDEND", ticker: "SCHD" }),
    ledger({ id: "drip-schd-cash", date: "2026-06-30", amount: -21, eventType: "BUY", ticker: "SCHD" }),
    ledger({ id: "drip-qld-cash", date: "2026-06-30", amount: -9, eventType: "BUY", ticker: "QLD" }),
  ];

  assert.equal(computeCashBalance(rows, portfolioId, "CAD", "2026-06-30"), 0);
  assert.equal(computePosition(transactions, portfolioId, "SCHD", "2026-06-30"), 10.25);
  assert.equal(computePosition(transactions, portfolioId, "QLD", "2026-06-30"), 0.09);
}

function testQqqiDistributionAccumulatesUsdCashWithoutPositionChange() {
  const transactions: EngineTransaction[] = [
    tx({ id: "qqqi-div", ticker: "QQQI", currency: "USD", action: "DIVIDEND", date: "2026-06-15", quantity: 10, price: 1 }),
  ];
  const rows: EngineCashLedgerRow[] = [
    ledger({ id: "qqqi-cash", date: "2026-06-15", currency: "USD", amount: 10, eventType: "DIVIDEND", ticker: "QQQI" }),
  ];

  assert.equal(computeCashBalance(rows, portfolioId, "USD", "2026-06-30"), 10);
  assert.equal(computePosition(transactions, portfolioId, "QQQI", "2026-06-30"), 0);
}

function testBuySellPositionReconstruction() {
  const transactions: EngineTransaction[] = [
    tx({ id: "buy1", ticker: "SCHD", action: "BUY", date: "2026-06-01", quantity: 10, price: 80 }),
    tx({ id: "buy2", ticker: "SCHD", action: "BUY", date: "2026-06-10", quantity: 5, price: 82 }),
    tx({ id: "sell1", ticker: "SCHD", action: "SELL", date: "2026-06-20", quantity: 3, price: 83 }),
    tx({ id: "div", ticker: "SCHD", action: "DIVIDEND", date: "2026-06-27", quantity: 12, price: 0.5 }),
  ];

  assert.equal(computePosition(transactions, portfolioId, "SCHD", "2026-06-30"), 12);
}

function testCadUsdFxPortfolioValuation() {
  const transactions: EngineTransaction[] = [
    tx({ id: "schd-buy", ticker: "SCHD", currency: "USD", action: "BUY", date: "2026-06-01", quantity: 10, price: 80 }),
    tx({ id: "qld-buy", ticker: "QLD", currency: "USD", action: "BUY", date: "2026-06-01", quantity: 2, price: 100 }),
  ];
  const rows: EngineCashLedgerRow[] = [
    ledger({ id: "cad-cash", currency: "CAD", amount: 100, eventType: "DEPOSIT" }),
    ledger({ id: "usd-cash", currency: "USD", amount: 10, eventType: "DEPOSIT" }),
  ];
  const prices: MarketPricePoint[] = [
    price({ ticker: "SCHD", close: 81, currency: "USD" }),
    price({ ticker: "QLD", close: 110, currency: "USD" }),
  ];
  const fxRates: FxRatePoint[] = [fx({ usdCad: 1.4 })];

  const point = computePortfolioValueCAD({
    date: "2026-06-30",
    portfolioIds: [portfolioId],
    transactions,
    ledgerRows: rows,
    prices,
    fxRates,
  });

  assert.equal(point.cashCAD, 114);
  assert.equal(point.totalCAD, 1556);
}

function testDerivesLedgerFromExistingTransactionsWhenCashLedgerTableIsUnavailable() {
  const transactions: EngineTransaction[] = [
    tx({ id: "buy-schd", date: "2026-06-02", ticker: "SCHD", currency: "CAD", action: "BUY", quantity: 2, price: 80, commission: 1 }),
    tx({ id: "div-schd", date: "2026-06-15", ticker: "SCHD", currency: "CAD", action: "DIVIDEND", quantity: 1, price: 3, commission: 0 }),
    tx({ id: "sell-schd", date: "2026-06-20", ticker: "SCHD", currency: "CAD", action: "SELL", quantity: 1, price: 90, commission: 1 }),
  ];

  const rows = deriveCashLedgerRowsFromExistingRecords({
    cashTransactions: [
      { id: "deposit-1", portfolioId, date: "2026-06-01", currency: "CAD", action: "DEPOSIT", amount: 200 },
      { id: "withdraw-1", portfolioId, date: "2026-06-25", currency: "CAD", action: "WITHDRAWAL", amount: 10 },
    ],
    transactions,
  });

  assert.deepEqual(
    rows.map((row) => ({ id: row.id, amount: row.amount, eventType: row.eventType, ticker: row.ticker })),
    [
      { id: "cash:deposit-1", amount: 200, eventType: "DEPOSIT", ticker: null },
      { id: "tx:buy-schd", amount: -161, eventType: "BUY", ticker: "SCHD" },
      { id: "tx:div-schd", amount: 3, eventType: "DIVIDEND", ticker: "SCHD" },
      { id: "tx:sell-schd", amount: 89, eventType: "SELL", ticker: "SCHD" },
      { id: "cash:withdraw-1", amount: -10, eventType: "WITHDRAWAL", ticker: null },
    ],
  );

  assert.equal(computeCashBalance(rows, portfolioId, "CAD", "2026-06-30"), 121);
}

function testDerivesOpeningStateFromCurrentHoldingsAndCash() {
  const anchorDate = "2026-04-14";
  const postAnchorTransactions: EngineTransaction[] = [
    tx({ id: "post-buy", portfolioId, ticker: "SCHD", currency: "CAD", action: "BUY", date: "2026-04-20", quantity: 2, price: 80, commission: 1 }),
    tx({ id: "post-sell", portfolioId, ticker: "QLD", currency: "CAD", action: "SELL", date: "2026-05-01", quantity: 1, price: 100, commission: 1 }),
    tx({ id: "post-div", portfolioId, ticker: "SCHD", currency: "CAD", action: "DIVIDEND", date: "2026-05-02", quantity: 1, price: 4, commission: 0 }),
  ];

  const openingTransactions = deriveOpeningTransactionsFromCurrentHoldings({
    anchorDate,
    holdings: [
      { portfolioId, ticker: "SCHD", currency: "CAD", quantity: 12, avgCost: 70 },
      { portfolioId, ticker: "QLD", currency: "CAD", quantity: 4, avgCost: 90 },
    ],
    transactions: postAnchorTransactions,
  });

  const allTransactions = [...openingTransactions, ...postAnchorTransactions];
  assert.equal(computePosition(allTransactions, portfolioId, "SCHD", "2026-05-20"), 12);
  assert.equal(computePosition(allTransactions, portfolioId, "QLD", "2026-05-20"), 4);
  assert.deepEqual(
    openingTransactions.map((transaction) => ({ ticker: transaction.ticker, quantity: transaction.quantity, price: transaction.price })),
    [
      { ticker: "SCHD", quantity: 10, price: 70 },
      { ticker: "QLD", quantity: 5, price: 90 },
    ],
  );

  const realRows = deriveCashLedgerRowsFromExistingRecords({
    cashTransactions: [
      { id: "deposit", portfolioId, date: "2026-04-16", currency: "CAD", action: "DEPOSIT", amount: 200 },
    ],
    transactions: postAnchorTransactions,
  });
  const openingRows = deriveOpeningCashLedgerRows({
    anchorDate,
    currentCashBalances: [{ portfolioId, cashCAD: 500, cashUSD: 0 }],
    cashTransactions: [{ id: "deposit", portfolioId, date: "2026-04-16", currency: "CAD", action: "DEPOSIT", amount: 200 }],
    transactions: postAnchorTransactions,
  });

  assert.equal(openingRows[0]?.amount, 358);
  assert.equal(computeCashBalance([...openingRows, ...realRows], portfolioId, "CAD", "2026-05-20"), 500);
}

function testJepqDistributionIsolationAndAutoBuyViolationDetection() {
  const validTransactions: EngineTransaction[] = [
    tx({ id: "jepq-div", ticker: "JEPQ", currency: "USD", action: "DIVIDEND", date: "2026-06-15", quantity: 10, price: 1 }),
  ];
  const rows: EngineCashLedgerRow[] = [
    ledger({ id: "jepq-cash", date: "2026-06-15", currency: "USD", amount: 10, eventType: "DIVIDEND", ticker: "JEPQ" }),
  ];

  assert.equal(computeCashBalance(rows, portfolioId, "USD", "2026-06-30"), 10);
  assert.equal(computePosition(validTransactions, portfolioId, "JEPQ", "2026-06-30"), 0);
  assert.deepEqual(detectIncomeDistributionAutoBuyViolations(validTransactions, "JEPQ"), []);

  const invalidTransactions = [
    ...validTransactions,
    tx({ id: "auto-buy", ticker: "JEPQ", currency: "USD", action: "BUY", date: "2026-06-15", quantity: 0.1, price: 100 }),
  ];

  assert.deepEqual(detectIncomeDistributionAutoBuyViolations(invalidTransactions, "JEPQ"), [
    {
      ticker: "JEPQ",
      dividendTransactionId: "jepq-div",
      buyTransactionId: "auto-buy",
      date: "2026-06-15",
      message: "JEPQ dividend must not create an automatic BUY; keep distribution as USD cash only.",
    },
  ]);
}

const tests = [
  testCadDepositAndBuyLeavesCashRemainder,
  testDividendAndExplicitDripOnlyChangesPositionThroughBuys,
  testQqqiDistributionAccumulatesUsdCashWithoutPositionChange,
  testBuySellPositionReconstruction,
  testCadUsdFxPortfolioValuation,
  testDerivesLedgerFromExistingTransactionsWhenCashLedgerTableIsUnavailable,
  testDerivesOpeningStateFromCurrentHoldingsAndCash,
  testJepqDistributionIsolationAndAutoBuyViolationDetection,
];

for (const run of tests) {
  run();
}

console.log("portfolio engine tests passed");
