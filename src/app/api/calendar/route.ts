import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();

export const dynamic = "force-dynamic";

export interface DividendCalendarEvent {
  ticker: string;
  name: string;
  exDividendDate: string | null;   // ISO string — most recent ex-div
  paymentDate: string | null;       // estimated: exDivDate + ~15 days
  amountPerShare: number | null;    // most recent per-period amount
  annualDividend: number | null;
  frequency: number | null;         // 1=annual, 2=semi, 4=quarterly, 12=monthly
  dividendYield: number | null;
  currency: string;
  portfolios: string[];
  sharesHeld: number;
}

// 1-hour in-memory cache
const cache = new Map<string, { data: Omit<DividendCalendarEvent, "portfolios" | "sharesHeld">; fetchedAt: number }>();
const TTL = 60 * 60 * 1000;

/** Detect dividend frequency from historical payment spacing */
function detectFrequencyFromHistory(
  dividends: Array<{ date: string | Date; amount: number }>
): number {
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

export async function GET() {
  const holdings = await prisma.holding.findMany({
    include: { portfolio: true },
  });

  // Group holdings by ticker, collect portfolio names and shares (only qty > 0)
  const tickerMap = new Map<string, string[]>();
  const tickerShares = new Map<string, number>();
  for (const h of holdings) {
    const qty = parseFloat(h.quantity?.toString() ?? "0") || 0;
    if (qty <= 0) continue;
    if (!tickerMap.has(h.ticker)) tickerMap.set(h.ticker, []);
    tickerMap.get(h.ticker)!.push(h.portfolio.name);
    tickerShares.set(h.ticker, (tickerShares.get(h.ticker) ?? 0) + qty);
  }

  const events: DividendCalendarEvent[] = [];

  // 18 months back to capture at least 4 dividends for quarterly payers
  const period1 = new Date();
  period1.setMonth(period1.getMonth() - 18);
  const period1Str = period1.toISOString().split("T")[0];

  for (const [ticker, portfolios] of tickerMap.entries()) {
    const sharesHeld = tickerShares.get(ticker) ?? 0;

    const cached = cache.get(ticker);
    if (cached && Date.now() - cached.fetchedAt < TTL) {
      events.push({ ...cached.data, portfolios, sharesHeld });
      continue;
    }

    try {
      const chart = await yahooFinance.chart(ticker, {
        period1: period1Str,
        interval: "1mo",
      });

      const dividendMap = chart.events?.dividends ?? {};
      const dividends = Object.values(dividendMap)
        .map((d) => ({ date: new Date(d.date).toISOString(), amount: d.amount }))
        .sort((a, b) => a.date.localeCompare(b.date));

      if (dividends.length === 0) {
        // Non-dividend stock — skip (don't add to events)
        continue;
      }

      const frequency = detectFrequencyFromHistory(dividends);
      const lastDiv = dividends[dividends.length - 1];
      const amountPerShare = lastDiv.amount;
      const exDividendDate = lastDiv.date;
      const annualDividend = amountPerShare * frequency;

      // Estimate payment date ~15 days after ex-div
      const payDate = new Date(exDividendDate);
      payDate.setDate(payDate.getDate() + 15);
      const paymentDate = payDate.toISOString();

      const currentPrice = chart.meta?.regularMarketPrice ?? null;
      const dividendYield = currentPrice && currentPrice > 0
        ? annualDividend / currentPrice
        : null;

      const name =
        (chart.meta as any)?.longName ||
        chart.meta?.shortName ||
        ticker;

      const currency = chart.meta?.currency ?? "USD";

      const data: Omit<DividendCalendarEvent, "portfolios" | "sharesHeld"> = {
        ticker,
        name,
        exDividendDate,
        paymentDate,
        amountPerShare,
        annualDividend,
        frequency,
        dividendYield,
        currency,
      };

      cache.set(ticker, { data, fetchedAt: Date.now() });
      events.push({ ...data, portfolios, sharesHeld });
    } catch {
      // Non-dividend stock or fetch error — skip
    }
  }

  return NextResponse.json(events);
}
