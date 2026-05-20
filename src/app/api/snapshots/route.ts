import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getFxRate, getHistory } from "@/lib/price";
import {
  computePortfolioValueCAD,
  deriveCashLedgerRowsFromExistingRecords,
  deriveOpeningCashLedgerRows,
  deriveOpeningTransactionsFromCurrentHoldings,
  type EngineCashLedgerRow,
  type EngineCashTransactionInput,
  type EngineCurrency,
  type EngineCurrentCashBalanceInput,
  type EngineCurrentHoldingInput,
  type EngineTransaction,
  type MarketPricePoint,
} from "@/lib/portfolio/engine";

export const dynamic = "force-dynamic";

const VALID_RANGES = ["3m", "6m", "1y", "3y", "5y", "all"] as const;
type Range = typeof VALID_RANGES[number];

const FX_FALLBACK = 1.35;

type LegacySnapshot = {
  date: Date;
  totalCAD: { toString(): string };
  costBasisCAD: { toString(): string };
  cashCAD: { toString(): string };
};

type DividendTxn = {
  date: Date;
  price: { toString(): string };
  quantity: { toString(): string };
  holding: { currency: string };
};

type CashTxn = {
  id: string;
  portfolioId: string;
  date: Date;
  action: string;
  amount: { toString(): string };
  currency: string;
};

function rangeToSince(range: Range): Date | undefined {
  const now = new Date();
  let since: Date | undefined;

  if (range === "3m") {
    since = new Date(now);
    since.setMonth(since.getMonth() - 3);
  } else if (range === "6m") {
    since = new Date(now);
    since.setMonth(since.getMonth() - 6);
  } else if (range === "1y") {
    since = new Date(now);
    since.setFullYear(since.getFullYear() - 1);
  } else if (range === "3y") {
    since = new Date(now);
    since.setFullYear(since.getFullYear() - 3);
  } else if (range === "5y") {
    since = new Date(now);
    since.setFullYear(since.getFullYear() - 5);
  }

  return since;
}

function dateKey(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function decimalToNumber(value: { toString(): string } | null | undefined): number {
  const parsed = parseFloat(value?.toString() ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function contributionEventsFromCashTxns(cashTxns: CashTxn[]) {
  return cashTxns.map((tx) => {
    const signedAmount = decimalToNumber(tx.amount) * (tx.action === "WITHDRAWAL" ? -1 : 1);
    const amountCAD = signedAmount * (tx.currency === "USD" ? FX_FALLBACK : 1);
    return {
      date: dateKey(tx.date),
      amountCAD: roundMoney(amountCAD),
    };
  }).filter((event) => Number.isFinite(event.amountCAD) && event.amountCAD !== 0);
}

function cumulativeDividendByDate(dividendTxns: DividendTxn[], valuationDate: string): number {
  return dividendTxns
    .filter((t) => dateKey(t.date) <= valuationDate)
    .reduce((sum, t) => {
      const amount = decimalToNumber(t.price) * decimalToNumber(t.quantity);
      return sum + (t.holding.currency === "USD" ? amount * FX_FALLBACK : amount);
    }, 0);
}

function legacySnapshotData(snapshots: LegacySnapshot[], dividendTxns: DividendTxn[]) {
  return snapshots.map((s) => {
    const snapshotDate = dateKey(s.date);
    return {
      date: snapshotDate,
      totalCAD: decimalToNumber(s.totalCAD),
      costBasisCAD: decimalToNumber(s.costBasisCAD),
      cashCAD: decimalToNumber(s.cashCAD),
      cumulativeDividendCAD: roundMoney(cumulativeDividendByDate(dividendTxns, snapshotDate)),
    };
  });
}

function valuationDatesFromSources(
  snapshots: LegacySnapshot[],
  transactions: EngineTransaction[],
  cashTxns: CashTxn[],
  since: Date | undefined,
): string[] {
  const sinceKey = since ? dateKey(since) : undefined;
  const snapshotDates = snapshots.map((snapshot) => dateKey(snapshot.date));
  const eventDates = [
    ...transactions.map((transaction) => dateKey(transaction.date)),
    ...cashTxns.map((cashTxn) => dateKey(cashTxn.date)),
  ].filter((date) => !sinceKey || date >= sinceKey);

  return Array.from(new Set([...snapshotDates, ...eventDates])).sort();
}

function transactionCostBasisCAD(transactions: EngineTransaction[], date: string): number {
  const byTicker = new Map<string, { quantity: number; costCAD: number }>();

  for (const transaction of transactions) {
    if (dateKey(transaction.date) > date) continue;

    const key = `${transaction.portfolioId}:${transaction.ticker.toUpperCase()}`;
    const current = byTicker.get(key) ?? { quantity: 0, costCAD: 0 };
    const fxRate = transaction.currency === "USD" ? FX_FALLBACK : 1;
    const grossCAD = transaction.quantity * transaction.price * fxRate;
    const commissionCAD = transaction.commission * fxRate;

    if (transaction.action === "BUY") {
      current.quantity += transaction.quantity;
      current.costCAD += grossCAD + commissionCAD;
    } else if (transaction.action === "SELL" && current.quantity > 0) {
      const soldQuantity = Math.min(transaction.quantity, current.quantity);
      const averageCostCAD = current.costCAD / current.quantity;
      current.quantity -= soldQuantity;
      current.costCAD -= averageCostCAD * soldQuantity;
    }

    if (current.quantity <= 0.000001) {
      byTicker.delete(key);
    } else {
      byTicker.set(key, current);
    }
  }

  return roundMoney(Array.from(byTicker.values()).reduce((sum, position) => sum + position.costCAD, 0));
}

async function pricePointsFromTransactions(
  transactions: EngineTransaction[],
  valuationDates: string[],
): Promise<MarketPricePoint[]> {
  const firstDate = valuationDates[0];
  const tickers = Array.from(new Set(transactions.map((transaction) => transaction.ticker.toUpperCase())));
  const transactionPricePoints: MarketPricePoint[] = transactions
    .filter((transaction) => transaction.action !== "DIVIDEND")
    .map((transaction) => ({
      date: transaction.date,
      ticker: transaction.ticker,
      close: transaction.price,
      currency: transaction.currency,
    }));

  const historyResults = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const currency = transactions.find((transaction) => transaction.ticker.toUpperCase() === ticker)?.currency ?? "USD";
      const history = await getHistory(ticker, "all", firstDate);
      return history.map((point) => ({
        date: point.date,
        ticker,
        close: point.close,
        currency,
      } satisfies MarketPricePoint));
    }),
  );

  return [
    ...transactionPricePoints,
    ...historyResults.flatMap((result) => result.status === "fulfilled" ? result.value : []),
  ];
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const rawRange = searchParams.get("range") ?? "1y";
  if (!VALID_RANGES.includes(rawRange as Range)) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }
  const range = rawRange as Range;
  const since = rangeToSince(range);

  const snapshotsQuery = prisma.portfolioSnapshot.findMany({
    where: {
      userId: session.user.id,
      ...(since ? { date: { gte: since } } : {}),
    },
    orderBy: { date: "asc" },
    select: { date: true, totalCAD: true, costBasisCAD: true, cashCAD: true },
  });

  const dividendTxnsQuery = prisma.transaction.findMany({
    where: {
      action: "DIVIDEND",
      holding: { portfolio: { userId: session.user.id } },
      ...(since ? { date: { gte: since } } : {}),
    },
    orderBy: { date: "asc" },
    select: { date: true, price: true, quantity: true, holding: { select: { currency: true } } },
  });

  const cashTxnsQuery = prisma.cashTransaction.findMany({
    where: {
      portfolio: { userId: session.user.id },
    },
    orderBy: { date: "asc" },
    select: { id: true, portfolioId: true, date: true, action: true, amount: true, currency: true },
  });

  try {
    const [snapshots, dividendTxns, cashTxns, portfolios, transactions] = await Promise.all([
      snapshotsQuery,
      dividendTxnsQuery,
      cashTxnsQuery,
      prisma.portfolio.findMany({
        where: { userId: session.user.id },
        select: {
          id: true,
          cashCAD: true,
          cashUSD: true,
          holdings: {
            select: {
              ticker: true,
              currency: true,
              quantity: true,
              avgCost: true,
            },
          },
        },
      }),
      prisma.transaction.findMany({
        where: { holding: { portfolio: { userId: session.user.id } } },
        orderBy: { date: "asc" },
        select: {
          id: true,
          action: true,
          date: true,
          quantity: true,
          price: true,
          commission: true,
          holding: { select: { ticker: true, currency: true, portfolioId: true } },
        },
      }),
    ]);

    const portfolioIds = portfolios.map((portfolio) => portfolio.id);
    const engineTransactions: EngineTransaction[] = transactions.map((transaction) => ({
      id: transaction.id,
      portfolioId: transaction.holding.portfolioId,
      ticker: transaction.holding.ticker,
      currency: transaction.holding.currency as EngineCurrency,
      action: transaction.action,
      date: transaction.date,
      quantity: decimalToNumber(transaction.quantity),
      price: decimalToNumber(transaction.price),
      commission: decimalToNumber(transaction.commission),
    }));
    const engineCashTxns: EngineCashTransactionInput[] = cashTxns.map((cashTxn) => ({
      id: cashTxn.id,
      portfolioId: cashTxn.portfolioId,
      date: cashTxn.date,
      currency: cashTxn.currency as EngineCurrency,
      action: cashTxn.action as "DEPOSIT" | "WITHDRAWAL",
      amount: decimalToNumber(cashTxn.amount),
    }));

    const preliminaryValuationDates = valuationDatesFromSources(snapshots, engineTransactions, cashTxns, since);
    const anchorDate = preliminaryValuationDates[0];
    const rangeEngineTransactions = anchorDate
      ? engineTransactions.filter((transaction) => dateKey(transaction.date) >= anchorDate)
      : engineTransactions;
    const rangeEngineCashTxns = anchorDate
      ? engineCashTxns.filter((cashTxn) => dateKey(cashTxn.date) >= anchorDate)
      : engineCashTxns;
    const currentHoldings: EngineCurrentHoldingInput[] = portfolios.flatMap((portfolio) =>
      portfolio.holdings.map((holding) => ({
        portfolioId: portfolio.id,
        ticker: holding.ticker,
        currency: holding.currency as EngineCurrency,
        quantity: decimalToNumber(holding.quantity),
        avgCost: decimalToNumber(holding.avgCost),
      })),
    );
    const currentCashBalances: EngineCurrentCashBalanceInput[] = portfolios.map((portfolio) => ({
      portfolioId: portfolio.id,
      cashCAD: decimalToNumber(portfolio.cashCAD),
      cashUSD: decimalToNumber(portfolio.cashUSD),
    }));

    const openingTransactions = anchorDate
      ? deriveOpeningTransactionsFromCurrentHoldings({
        anchorDate,
        holdings: currentHoldings,
        transactions: rangeEngineTransactions,
      })
      : [];
    const allEngineTransactions = [...openingTransactions, ...rangeEngineTransactions];

    let engineLedgerRows: EngineCashLedgerRow[] = [
      ...(anchorDate ? deriveOpeningCashLedgerRows({
        anchorDate,
        currentCashBalances,
        cashTransactions: rangeEngineCashTxns,
        transactions: rangeEngineTransactions,
      }) : []),
      ...deriveCashLedgerRowsFromExistingRecords({
        cashTransactions: rangeEngineCashTxns,
        transactions: rangeEngineTransactions,
      }),
    ];

    try {
      const ledgerRows = await prisma.cashLedger.findMany({
        where: { portfolio: { userId: session.user.id } },
        orderBy: { date: "asc" },
        select: { id: true, portfolioId: true, date: true, currency: true, amount: true, eventType: true, ticker: true },
      });
      if (ledgerRows.length > 0) {
        engineLedgerRows = ledgerRows.map((row) => ({
          id: row.id,
          portfolioId: row.portfolioId,
          date: row.date,
          currency: row.currency as EngineCurrency,
          amount: decimalToNumber(row.amount),
          eventType: row.eventType,
          ticker: row.ticker,
        }));
      }
    } catch {
      console.warn("/api/snapshots CashLedger unavailable; using derived Transaction/CashTransaction ledger");
    }

    const valuationDates = preliminaryValuationDates;

    if (valuationDates.length < 2 || portfolioIds.length === 0 || engineLedgerRows.length === 0) {
      return NextResponse.json({
        snapshots: legacySnapshotData(snapshots, dividendTxns),
        contributionEventsCAD: contributionEventsFromCashTxns(cashTxns),
      });
    }

    const prices = await pricePointsFromTransactions(allEngineTransactions, valuationDates);
    const { rate: usdCadRate } = await getFxRate();
    const fxRates = valuationDates.map((date) => ({ date, usdCad: usdCadRate || FX_FALLBACK }));
    const data = valuationDates.map((valuationDate) => {
      const point = computePortfolioValueCAD({
        date: valuationDate,
        portfolioIds,
        transactions: allEngineTransactions,
        ledgerRows: engineLedgerRows,
        prices,
        fxRates,
      });

      return {
        date: point.date,
        totalCAD: point.totalCAD,
        costBasisCAD: transactionCostBasisCAD(allEngineTransactions, valuationDate),
        cashCAD: point.cashCAD,
        cumulativeDividendCAD: roundMoney(cumulativeDividendByDate(dividendTxns, valuationDate)),
      };
    });

    return NextResponse.json({ snapshots: data, contributionEventsCAD: contributionEventsFromCashTxns(cashTxns) });
  } catch (error) {
    console.warn("/api/snapshots engine reconstruction failed; falling back to PortfolioSnapshot cache", error);
    const [snapshots, dividendTxns, cashTxns] = await Promise.all([snapshotsQuery, dividendTxnsQuery, cashTxnsQuery]);
    return NextResponse.json({
      snapshots: legacySnapshotData(snapshots, dividendTxns),
      contributionEventsCAD: contributionEventsFromCashTxns(cashTxns),
    });
  }
}
