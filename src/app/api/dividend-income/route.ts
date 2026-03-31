import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { yahooFinance } from "@/lib/price";
import { detectFrequency } from "@/lib/dividend-utils";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

interface DivData {
  exDivDate: string;
  amountPerShare: number;
  frequency: number;
  currency: string;
}

interface DividendEvent {
  date: string;
  amount: number;
}

// 1-hour in-memory cache
const cache = new Map<string, { data: DivData; fetchedAt: number }>();
const historyCache = new Map<string, { data: { currency: string; events: DividendEvent[] }; fetchedAt: number }>();
const TTL = 60 * 60 * 1000;

interface DividendItem {
  ticker: string;
  amount: number;
  net: number;
  currency: string;
  accountType: string;
  isCanadianEligible?: boolean; // CAD dividend in non-registered account (may qualify for DTC)
}


// Heuristic: US-listed tickers have no exchange suffix (e.g. AAPL, VTI)
// Canadian tickers use .TO, .V, etc. Foreign ADRs in USD may have different rates.
function isUSListed(ticker: string): boolean {
  return !ticker.includes(".");
}

function netFactor(accountType: string, currency: string, ticker: string): number {
  // Only apply US 15% NRA withholding if the stock is US-listed (heuristic: no exchange suffix)
  const applyUSWithholding = currency === "USD" && isUSListed(ticker);
  if (accountType === "RRSP") {
    // Canada-US treaty Art XXI(7): US-listed stocks exempt from NRA withholding
    if (applyUSWithholding) return 1.0;
    if (currency === "CAD") return 1.0; // domestic dividends: no foreign withholding
    return 0.85; // non-US foreign holdings (ADRs, EU stocks): treaty may not apply
  }
  if (accountType === "TFSA") return applyUSWithholding ? 0.85 : 1.0; // TFSA not treaty-exempt
  if (accountType === "FHSA") return applyUSWithholding ? 0.85 : 1.0; // FHSA not treaty-exempt
  if (accountType === "RESP") return applyUSWithholding ? 0.85 : 1.0; // RESP not treaty-exempt
  return 1.0; // Margin/Cash — return gross (personal tax handled separately)
}

function computeSharesHeldAtDate(
  transactions: Array<{ action: "BUY" | "SELL" | "DIVIDEND"; quantity: unknown; date: Date }>,
  cutoff: Date
): number {
  return transactions.reduce((sum, txn) => {
    if (txn.date > cutoff) return sum;
    const qty = parseFloat(String(txn.quantity ?? "0")) || 0;
    if (txn.action === "BUY") return sum + qty;
    if (txn.action === "SELL") return sum - qty;
    return sum;
  }, 0);
}

async function getDividendEvents(ticker: string, year: number): Promise<{ currency: string; events: DividendEvent[] }> {
  const cacheKey = `${ticker}:${year}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TTL) return cached.data;

  const chart = await yahooFinance.chart(ticker, {
    period1: `${year - 1}-10-01`,
    period2: `${year + 1}-03-31`,
    interval: "1mo",
  });

  const dividendMap = chart.events?.dividends ?? {};
  const events = Object.values(dividendMap)
    .map((d) => {
      const item = d as { date: Date | number | string; amount: number };
      return { date: new Date(item.date).toISOString().slice(0, 10), amount: item.amount };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const data = { currency: chart.meta?.currency ?? "USD", events };
  historyCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

function findMatchingDividendEvent(events: DividendEvent[], paymentDate: Date): DividendEvent | null {
  const paymentTs = paymentDate.getTime();
  const maxLagMs = 120 * 86400000;

  let best: DividendEvent | null = null;
  let bestLag = Number.POSITIVE_INFINITY;

  for (const event of events) {
    const eventTs = new Date(event.date).getTime();
    const lag = paymentTs - eventTs;
    if (lag < 0 || lag > maxLagMs) continue;
    if (lag < bestLag) {
      best = event;
      bestLag = lag;
    }
  }

  return best;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "future";
  const year = parseInt(searchParams.get("year") ?? new Date().getFullYear().toString(), 10);
  const portfolioId = searchParams.get("portfolioId") ?? "all";

  // Return years that have actual dividend data
  if (mode === "years") {
    const txns = await prisma.transaction.findMany({
      where: {
        action: "DIVIDEND",
        holding: {
          portfolio: { userId: session.user.id },
          ...(portfolioId !== "all" ? { portfolioId } : {}),
        },
      },
      select: { date: true },
    });
    const years = [...new Set(txns.map((t) => t.date.getFullYear()))].sort((a, b) => b - a);
    return NextResponse.json({ years });
  }

  const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
  const endOfYear = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  // Initialize month map for the full year
  const monthMap = new Map<string, { items: DividendItem[] }>();
  for (let m = 1; m <= 12; m++) {
    monthMap.set(`${year}-${String(m).padStart(2, "0")}`, { items: [] });
  }

  if (mode === "past") {
    const txns = await prisma.transaction.findMany({
      where: {
        action: "DIVIDEND",
        date: { gte: startOfYear, lt: endOfYear },
        holding: {
          portfolio: { userId: session.user.id },
          ...(portfolioId !== "all" ? { portfolioId } : {}),
        },
      },
      include: {
        holding: {
          include: {
            portfolio: true,
            transactions: {
              select: { action: true, quantity: true, date: true },
              orderBy: { date: "asc" },
            },
          },
        },
      },
    });

    const dividendHistoryByTicker = new Map<string, { currency: string; events: DividendEvent[] } | null>();

    for (const txn of txns) {
      const monthKey = txn.date.toISOString().slice(0, 7);
      if (!monthMap.has(monthKey)) continue;

      // For DIVIDEND transactions: quantity=1, price=netAmount (actual received)
      const netAmount = parseFloat(txn.price.toString()) * parseFloat(txn.quantity.toString());
      let grossAmount = netAmount;
      let currency = txn.holding.currency;
      const accountType = txn.holding.portfolio.accountType ?? "NON_REG";
      const ticker = txn.holding.ticker;
      const factor = netFactor(accountType, currency, ticker);

      if (!dividendHistoryByTicker.has(ticker)) {
        try {
          dividendHistoryByTicker.set(ticker, await getDividendEvents(ticker, year));
        } catch {
          dividendHistoryByTicker.set(ticker, null);
        }
      }

      const dividendHistory = dividendHistoryByTicker.get(ticker);
      const matchedEvent = dividendHistory ? findMatchingDividendEvent(dividendHistory.events, txn.date) : null;
      if (matchedEvent) {
        const sharesHeld = computeSharesHeldAtDate(txn.holding.transactions, new Date(matchedEvent.date));
        if (sharesHeld > 0) {
          grossAmount = matchedEvent.amount * sharesHeld;
          currency = dividendHistory?.currency ?? currency;
        }
      }

      // Gross should never be below the actual cash received.
      // If the event match underestimates the payout, fall back to reversing withholding.
      const estimatedGrossFromWithholding = factor > 0 && factor < 1 ? netAmount / factor : netAmount;
      grossAmount = Math.max(grossAmount, estimatedGrossFromWithholding, netAmount);

      monthMap.get(monthKey)!.items.push({
        ticker,
        amount: grossAmount,
        net: netAmount, // actual received — already post-withholding from broker
        currency,
        accountType,
        isCanadianEligible: currency === "CAD" && accountType === "NON_REG",
      });
    }
  } else {
    // Future mode: project dividends using Yahoo Finance data
    const holdingsQuery = await prisma.holding.findMany({
      where: {
        portfolio: { userId: session.user.id },
        ...(portfolioId !== "all" ? { portfolioId } : {}),
      },
      include: { portfolio: true },
    });

    const activeHoldings = holdingsQuery.filter(h => {
      const qty = parseFloat(h.quantity?.toString() ?? "0") || 0;
      return qty > 0;
    });

    // Fetch Yahoo Finance dividend data per unique ticker (with caching)
    const period1 = new Date();
    period1.setMonth(period1.getMonth() - 18);
    const period1Str = period1.toISOString().split("T")[0];

    const tickerDataCache = new Map<string, DivData | null>();

    for (const h of activeHoldings) {
      const qty = parseFloat(h.quantity?.toString() ?? "0") || 0;
      if (qty <= 0) continue;

      const ticker = h.ticker;
      let divData: DivData | null = null;

      if (tickerDataCache.has(ticker)) {
        divData = tickerDataCache.get(ticker)!;
      } else {
        const appCached = cache.get(ticker);
        if (appCached && Date.now() - appCached.fetchedAt >= TTL) cache.delete(ticker);
        if (appCached && Date.now() - appCached.fetchedAt < TTL) {
          divData = appCached.data;
          tickerDataCache.set(ticker, divData);
        } else {
          try {
            const chart = await yahooFinance.chart(ticker, {
              period1: period1Str,
              interval: "1mo",
            });

            const dividendMap = chart.events?.dividends ?? {};
            const dividends = Object.values(dividendMap)
              .map((d) => {
                const item = d as { date: Date | number | string; amount: number };
                return { date: new Date(item.date).toISOString(), amount: item.amount };
              })
              .sort((a, b) => a.date.localeCompare(b.date));

            if (dividends.length === 0) {
              tickerDataCache.set(ticker, null);
              continue;
            }

            const frequency = detectFrequency(dividends);
            const lastDiv = dividends[dividends.length - 1];
            const currency = chart.meta?.currency ?? "USD";

            divData = {
              exDivDate: lastDiv.date,
              amountPerShare: lastDiv.amount,
              frequency,
              currency,
            };

            cache.set(ticker, { data: divData, fetchedAt: Date.now() });
            tickerDataCache.set(ticker, divData);
          } catch {
            tickerDataCache.set(ticker, null);
            continue;
          }
        }
      }

      if (!divData) continue;

      const accountType = h.portfolio.accountType ?? "NON_REG";
      const factor = netFactor(accountType, divData.currency, ticker);
      const grossAmount = divData.amountPerShare * qty;
      const netAmount = grossAmount * factor;

      // Project payment dates (ex-div + 15 days) for the target year
      const intervalMonths = 12 / divData.frequency;
      const base = new Date(divData.exDivDate);
      base.setDate(base.getDate() + 15); // estimated payment date

      const yearStart = new Date(`${year}-01-01`);
      const yearEnd = new Date(`${year + 1}-01-01`);

      // Walk back to find first occurrence before yearStart
      const cur = new Date(base);
      while (cur >= yearStart) {
        cur.setMonth(cur.getMonth() - intervalMonths);
      }

      // Walk forward through the year collecting payment dates
      while (cur < yearEnd) {
        cur.setMonth(cur.getMonth() + intervalMonths);
        if (cur >= yearStart && cur < yearEnd) {
          const monthKey = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
          if (monthMap.has(monthKey)) {
            monthMap.get(monthKey)!.items.push({
              ticker,
              amount: grossAmount,
              net: netAmount,
              currency: divData.currency,
              accountType,
              isCanadianEligible: divData.currency === "CAD" && accountType === "NON_REG",
            });
          }
        }
      }
    }
  }

  const months = Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    items: data.items,
  }));

  return NextResponse.json({ months });
}
