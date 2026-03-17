import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

const yahooFinance = new YahooFinance();

// 1-hour in-memory cache (shared with calendar route conceptually)
const cache = new Map<string, { data: DivData; fetchedAt: number }>();
const TTL = 60 * 60 * 1000;

interface DivData {
  exDivDate: string;
  amountPerShare: number;
  frequency: number;
  currency: string;
}

interface DividendItem {
  ticker: string;
  amount: number;
  net: number;
  currency: string;
  accountType: string;
}

function detectFrequency(dividends: Array<{ date: string | Date; amount: number }>): number {
  if (dividends.length < 2) return 4;
  const dates = dividends.map((d) => new Date(d.date).getTime());
  const spacings: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const monthDiff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24 * 30.5);
    spacings.push(monthDiff);
  }
  const avg = spacings.reduce((a, b) => a + b, 0) / spacings.length;
  if (avg <= 1.5) return 12;
  if (avg <= 4) return 4;
  if (avg <= 8) return 2;
  return 1;
}

function parseAccountType(portfolioName: string): string {
  const match = portfolioName.match(/^(RRSP|TFSA|FHSA|RESP|Margin|Cash)/i);
  return match ? match[1].toUpperCase() : "MARGIN";
}

function netFactor(accountType: string, currency: string): number {
  if (accountType === "RRSP") return 1.0; // Canada-US treaty Article XXI(7) exempts RRSP
  if (accountType === "TFSA") return currency === "USD" ? 0.85 : 1.0; // TFSA not treaty-exempt
  if (accountType === "FHSA") return currency === "USD" ? 0.85 : 1.0; // FHSA not treaty-exempt
  if (accountType === "RESP") return currency === "USD" ? 0.85 : 1.0; // RESP not treaty-exempt
  return 1.0; // Margin/Cash — return gross (personal tax handled separately)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "future";
  const year = parseInt(searchParams.get("year") ?? new Date().getFullYear().toString(), 10);
  const portfolioId = searchParams.get("portfolioId") ?? "all";

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
        ...(portfolioId !== "all" && { holding: { portfolioId } }),
      },
      include: { holding: { include: { portfolio: true } } },
    });

    for (const txn of txns) {
      const monthKey = txn.date.toISOString().slice(0, 7);
      if (!monthMap.has(monthKey)) continue;

      // For DIVIDEND transactions: quantity=1, price=netAmount (actual received)
      const amount = parseFloat(txn.price.toString()) * parseFloat(txn.quantity.toString());
      const currency = txn.holding.currency;
      const accountType = parseAccountType(txn.holding.portfolio.name);

      monthMap.get(monthKey)!.items.push({
        ticker: txn.holding.ticker,
        amount,
        net: amount, // actual received — already post-withholding from broker
        currency,
        accountType,
      });
    }
  } else {
    // Future mode: project dividends using Yahoo Finance data
    const holdingsQuery = await prisma.holding.findMany({
      where: portfolioId !== "all" ? { portfolioId } : {},
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

      const accountType = parseAccountType(h.portfolio.name);
      const factor = netFactor(accountType, divData.currency);
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
