// RULEBOOK_VERSION: 4.4.2
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { yahooFinance } from "@/lib/price";
import {
  computePortfolioValueCAD,
  type EngineCashLedgerRow,
  type EngineCurrency,
  type EngineTransaction,
  type MarketPricePoint,
} from "@/lib/portfolio/engine";

export const dynamic = "force-dynamic";

const DEFAULT_FX_RATE = 1.35;
const DRIFT_ALERT_THRESHOLD = 0.005; // 0.5% migration threshold; tighten after P7/backfill.
const JEPQ_INVARIANT_WINDOW_MS = 24 * 60 * 60 * 1000;
const AUTO_BUY_WINDOW_MS = 5 * 60 * 1000;
const AUTO_BUY_AMOUNT_TOLERANCE = 0.02;

type DecimalLike = { toString(): string } | null | undefined;
type AlertPayload = {
  type: "ENGINE_LEGACY_DRIFT" | "JEPQ_AUTO_BUY_VIOLATION";
  userId: string;
  severity: "warning";
  message: string;
  details: Record<string, string | number | boolean | null>;
};

type PortfolioWithHoldings = Awaited<ReturnType<typeof prisma.portfolio.findMany>>[number] & {
  holdings: Array<{
    ticker: string;
    currency: string;
    quantity: DecimalLike;
    avgCost: DecimalLike;
    isActive: boolean;
  }>;
};

type TransactionRow = {
  id: string;
  action: "BUY" | "SELL" | "DIVIDEND";
  date: Date;
  quantity: DecimalLike;
  price: DecimalLike;
  commission: DecimalLike;
  source: string | null;
  holding: {
    ticker: string;
    currency: string;
    portfolioId: string;
  };
};

async function getFxRate(): Promise<number> {
  try {
    const q = await yahooFinance.quote("USDCAD=X", { fields: ["regularMarketPrice"] });
    return q.regularMarketPrice ?? parseFloat(process.env.DEFAULT_FX_RATE ?? String(DEFAULT_FX_RATE));
  } catch {
    return parseFloat(process.env.DEFAULT_FX_RATE ?? String(DEFAULT_FX_RATE));
  }
}

function decimalToNumber(value: DecimalLike): number {
  const parsed = parseFloat(value?.toString() ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateKey(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function computeLegacySnapshotValueCAD(portfolios: PortfolioWithHoldings[], priceCache: Map<string, number>, fxRate: number) {
  let marketValueCAD = 0;
  let costBasisCAD = 0;
  let cashCAD = 0;

  for (const portfolio of portfolios) {
    cashCAD += decimalToNumber(portfolio.cashCAD) || 0;
    cashCAD += (decimalToNumber(portfolio.cashUSD) || 0) * fxRate;

    for (const holding of portfolio.holdings) {
      if (!holding.isActive) continue;
      const quantity = decimalToNumber(holding.quantity);
      if (quantity <= 0) continue;

      const price = priceCache.get(holding.ticker.toUpperCase());
      if (!price) continue;

      const marketValue = quantity * price;
      marketValueCAD += holding.currency === "USD" ? marketValue * fxRate : marketValue;

      const cost = quantity * decimalToNumber(holding.avgCost);
      costBasisCAD += holding.currency === "USD" ? cost * fxRate : cost;
    }
  }

  return {
    totalCAD: roundMoney(marketValueCAD + cashCAD),
    costBasisCAD: roundMoney(costBasisCAD),
    cashCAD: roundMoney(cashCAD),
  };
}

function transactionCostBasisCAD(transactions: EngineTransaction[], date: Date | string, fxRate: number): number {
  const byTicker = new Map<string, { quantity: number; costCAD: number }>();
  const cutoff = dateKey(date);

  for (const transaction of transactions) {
    if (dateKey(transaction.date) > cutoff) continue;

    const key = `${transaction.portfolioId}:${transaction.ticker.toUpperCase()}`;
    const current = byTicker.get(key) ?? { quantity: 0, costCAD: 0 };
    const transactionFxRate = transaction.currency === "USD" ? fxRate : 1;
    const grossCAD = transaction.quantity * transaction.price * transactionFxRate;
    const commissionCAD = transaction.commission * transactionFxRate;

    if (transaction.action === "BUY") {
      current.quantity += transaction.quantity;
      current.costCAD += grossCAD + commissionCAD;
    } else if (transaction.action === "SELL" && current.quantity > 0) {
      const soldQuantity = Math.min(transaction.quantity, current.quantity);
      const averageCostCAD = current.costCAD / current.quantity;
      current.quantity -= soldQuantity;
      current.costCAD -= averageCostCAD * soldQuantity;
    }

    if (current.quantity <= 0.000001) byTicker.delete(key);
    else byTicker.set(key, current);
  }

  return roundMoney(Array.from(byTicker.values()).reduce((sum, position) => sum + position.costCAD, 0));
}

function toEngineTransactions(transactions: TransactionRow[]): EngineTransaction[] {
  return transactions.map((transaction) => ({
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
}

function createMarketPricePoints(
  transactions: EngineTransaction[],
  priceCache: Map<string, number>,
  date: Date,
): MarketPricePoint[] {
  const transactionPricePoints: MarketPricePoint[] = transactions.map((transaction) => ({
    date: transaction.date,
    ticker: transaction.ticker,
    close: transaction.price,
    currency: transaction.currency,
  }));
  const currentPricePoints: MarketPricePoint[] = Array.from(priceCache.entries()).map(([ticker, close]) => ({
    date,
    ticker,
    close,
    currency: transactions.find((transaction) => transaction.ticker.toUpperCase() === ticker)?.currency ?? "USD",
  }));
  return [...transactionPricePoints, ...currentPricePoints];
}

async function quoteMissingTickers(tickers: string[], priceCache: Map<string, number>) {
  await Promise.all(
    tickers.map(async (ticker) => {
      const normalizedTicker = ticker.toUpperCase();
      if (priceCache.has(normalizedTicker)) return;
      try {
        const quote = await yahooFinance.quote(normalizedTicker, { fields: ["regularMarketPrice"] });
        const price = quote.regularMarketPrice ?? null;
        if (price) priceCache.set(normalizedTicker, price);
      } catch {
        // Keep the cron resilient; engine will skip tickers with no price point.
      }
    }),
  );
}

function buildDriftAlertPayload(
  userId: string,
  engineValueCAD: number,
  legacyValueCAD: number,
): { driftPercent: number; alertPayload: AlertPayload | null } {
  const denominator = Math.abs(legacyValueCAD);
  const driftPercent = denominator > 0 ? (engineValueCAD - legacyValueCAD) / denominator : 0;
  if (Math.abs(driftPercent) <= DRIFT_ALERT_THRESHOLD) {
    return { driftPercent, alertPayload: null };
  }

  return {
    driftPercent,
    alertPayload: {
      type: "ENGINE_LEGACY_DRIFT",
      userId,
      severity: "warning",
      message: "PortfolioSnapshot engine cache drift exceeds the 0.5% migration threshold.",
      details: {
        engineValueCAD: roundMoney(engineValueCAD),
        legacyValueCAD: roundMoney(legacyValueCAD),
        driftPct: roundMoney(driftPercent * 100),
        thresholdPct: 0.5,
      },
    },
  };
}

function buildJepqAutoBuyViolationAlerts(userId: string, transactions: TransactionRow[], now: Date): AlertPayload[] {
  const oneDayAgo = new Date(now.getTime() - JEPQ_INVARIANT_WINDOW_MS);
  const recentJepqTransactions = transactions.filter(
    (transaction) =>
      transaction.holding.ticker.toUpperCase() === "JEPQ" &&
      transaction.date >= oneDayAgo &&
      transaction.date <= now,
  );
  const dividends = recentJepqTransactions.filter((transaction) => transaction.action === "DIVIDEND");
  const buys = recentJepqTransactions.filter((transaction) => transaction.action === "BUY");

  return dividends.flatMap((dividend) => {
    const dividendNetAmount = Math.max(
      0,
      decimalToNumber(dividend.price) * decimalToNumber(dividend.quantity),
    );

    return buys
      .filter((buy) => buy.holding.portfolioId === dividend.holding.portfolioId)
      .filter((buy) => buy.date.getTime() >= dividend.date.getTime())
      .filter((buy) => buy.date.getTime() - dividend.date.getTime() <= AUTO_BUY_WINDOW_MS)
      .filter((buy) => {
        const buyGross = decimalToNumber(buy.price) * decimalToNumber(buy.quantity) + decimalToNumber(buy.commission);
        const tolerance = Math.max(1, dividendNetAmount * AUTO_BUY_AMOUNT_TOLERANCE);
        return Math.abs(buyGross - dividendNetAmount) <= tolerance;
      })
      .map((buy) => ({
        type: "JEPQ_AUTO_BUY_VIOLATION" as const,
        userId,
        severity: "warning" as const,
        message: "JEPQ DIVIDEND appears to be followed by an automatic BUY; distributions must stay as USD cash.",
        details: {
          ticker: "JEPQ",
          dividendTransactionId: dividend.id,
          buyTransactionId: buy.id,
          dividendAt: dividend.date.toISOString(),
          buyAt: buy.date.toISOString(),
          dividendNetAmount: roundMoney(dividendNetAmount),
          buyGrossAmount: roundMoney(decimalToNumber(buy.price) * decimalToNumber(buy.quantity) + decimalToNumber(buy.commission)),
          source: buy.source,
        },
      }));
  });
}

async function writeOptionalDriftFields(input: {
  userId: string;
  date: Date;
  engineValueCAD: number;
  legacyValueCAD: number;
  driftPercent: number;
  driftAlertSent: boolean;
}) {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "PortfolioSnapshot"
       SET "engineValueCAD" = $1,
           "legacyValueCAD" = $2,
           "driftPct" = $3,
           "driftAlertSent" = $4
       WHERE "userId" = $5 AND "date" = $6`,
      input.engineValueCAD,
      input.legacyValueCAD,
      input.driftPercent,
      input.driftAlertSent,
      input.userId,
      input.date,
    );
  } catch (error) {
    console.warn("PortfolioSnapshot drift columns unavailable; skipped optional drift field write", error);
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [users, fxRate] = await Promise.all([
    prisma.user.findMany({
      where: { approved: true },
      select: { id: true },
    }),
    getFxRate(),
  ]);

  const allHoldings = await prisma.holding.findMany({
    where: {
      portfolio: { userId: { in: users.map((u) => u.id) } },
      isActive: true,
      quantity: { gt: 0 },
    },
    select: { ticker: true, currency: true },
  });

  const priceCache = new Map<string, number>();
  await quoteMissingTickers([...new Set(allHoldings.map((h) => h.ticker))], priceCache);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const now = new Date();
  const alertPayloads: AlertPayload[] = [];

  const results = await Promise.all(
    users.map(async (user) => {
      try {
        const [portfolios, transactions, cashLedgerRows] = await Promise.all([
          prisma.portfolio.findMany({
            where: { userId: user.id },
            include: { holdings: true },
          }) as Promise<PortfolioWithHoldings[]>,
          prisma.transaction.findMany({
            where: { holding: { portfolio: { userId: user.id } } },
            orderBy: { date: "asc" },
            select: {
              id: true,
              action: true,
              date: true,
              quantity: true,
              price: true,
              commission: true,
              withholdingTax: true,
              source: true,
              holding: { select: { ticker: true, currency: true, portfolioId: true } },
            },
          }) as Promise<TransactionRow[]>,
          prisma.cashLedger.findMany({
            where: { portfolio: { userId: user.id } },
            orderBy: { date: "asc" },
            select: { id: true, portfolioId: true, date: true, currency: true, amount: true, eventType: true, ticker: true },
          }),
        ]);

        await quoteMissingTickers(
          Array.from(new Set(transactions.map((transaction) => transaction.holding.ticker))),
          priceCache,
        );

        const legacySnapshotValue = computeLegacySnapshotValueCAD(portfolios, priceCache, fxRate);
        const engineTransactions = toEngineTransactions(transactions);
        const engineCashLedgerRows: EngineCashLedgerRow[] = cashLedgerRows.map((row) => ({
          id: row.id,
          portfolioId: row.portfolioId,
          date: row.date,
          currency: row.currency as EngineCurrency,
          amount: decimalToNumber(row.amount),
          eventType: row.eventType,
          ticker: row.ticker,
        }));
        const hasLedgerRows = cashLedgerRows.length > 0;

        let snapshotValue = legacySnapshotValue;
        let usedEngine = false;
        let driftPercent = 0;
        let driftAlertPayload: AlertPayload | null = null;

        if (hasLedgerRows) {
          try {
            const enginePoint = computePortfolioValueCAD({
              date: today,
              portfolioIds: portfolios.map((portfolio) => portfolio.id),
              transactions: engineTransactions,
              ledgerRows: engineCashLedgerRows,
              prices: createMarketPricePoints(engineTransactions, priceCache, today),
              fxRates: [{ date: today, usdCad: fxRate }],
            });
            snapshotValue = {
              totalCAD: enginePoint.totalCAD,
              costBasisCAD: transactionCostBasisCAD(engineTransactions, today, fxRate),
              cashCAD: enginePoint.cashCAD,
            };
            usedEngine = true;
            const driftReport = buildDriftAlertPayload(user.id, enginePoint.totalCAD, legacySnapshotValue.totalCAD);
            driftPercent = driftReport.driftPercent;
            driftAlertPayload = driftReport.alertPayload;
          } catch (engineError) {
            console.warn("cron snapshot engine valuation failed; falling back to legacy current-state valuation", engineError);
          }
        }

        await prisma.portfolioSnapshot.upsert({
          where: { userId_date: { userId: user.id, date: today } },
          update: {
            totalCAD: snapshotValue.totalCAD,
            costBasisCAD: snapshotValue.costBasisCAD,
            cashCAD: snapshotValue.cashCAD,
          },
          create: {
            userId: user.id,
            date: today,
            totalCAD: snapshotValue.totalCAD,
            costBasisCAD: snapshotValue.costBasisCAD,
            cashCAD: snapshotValue.cashCAD,
          },
        });

        const jepqAlerts = buildJepqAutoBuyViolationAlerts(user.id, transactions, now);
        if (usedEngine) {
          if (driftAlertPayload) alertPayloads.push(driftAlertPayload);
          alertPayloads.push(...jepqAlerts);
          await writeOptionalDriftFields({
            userId: user.id,
            date: today,
            engineValueCAD: snapshotValue.totalCAD,
            legacyValueCAD: legacySnapshotValue.totalCAD,
            driftPercent,
            driftAlertSent: Boolean(driftAlertPayload),
          });
        }

        return {
          userId: user.id,
          totalCAD: snapshotValue.totalCAD.toFixed(2),
          costBasisCAD: snapshotValue.costBasisCAD.toFixed(2),
          cashCAD: snapshotValue.cashCAD.toFixed(2),
        };
      } catch (e: unknown) {
        return {
          userId: user.id,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  if (alertPayloads.length > 0) {
    console.warn("cron snapshot alerts", JSON.stringify({ alerts: alertPayloads }));
  }

  return NextResponse.json({
    ok: true,
    date: today.toISOString().slice(0, 10),
    users: results,
  });
}
