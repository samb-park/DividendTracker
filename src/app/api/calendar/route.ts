import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { yahooFinance, getPrice } from "@/lib/price";
import { detectFrequency } from "@/lib/dividend-utils";
import { getNasdaqDividend } from "@/lib/nasdaq-dividend";
import { auth } from "@/auth";

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


export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holdings = await prisma.holding.findMany({
    where: { portfolio: { userId: session.user.id } },
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

  // 18 months back for Yahoo fallback
  const period1 = new Date();
  period1.setMonth(period1.getMonth() - 18);
  const period1Str = period1.toISOString().split("T")[0];

  const tickers = Array.from(tickerMap.keys());

  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const cached = cache.get(ticker);
      if (cached && Date.now() - cached.fetchedAt < TTL) {
        return { ticker, data: cached.data };
      }

      // Always fetch price for yield calculation
      const priceData = await getPrice(ticker);
      const currentPrice = priceData?.price ?? null;

      // --- Primary: Nasdaq ---
      const nasdaq = await getNasdaqDividend(ticker);

      let exDividendDate: string | null = null;
      let paymentDate: string | null = null;
      let amountPerShare: number | null = null;
      let annualDividend: number | null = null;
      let frequency: number | null = null;
      let name: string = ticker;
      let currency: string = "USD";

      if (nasdaq && nasdaq.history.length > 0) {
        exDividendDate = nasdaq.exDividendDate;
        amountPerShare = nasdaq.amount;
        frequency = detectFrequency(nasdaq.history);
        annualDividend = amountPerShare != null && frequency != null ? amountPerShare * frequency : null;

        // Payment date from Nasdaq, else estimate +15 days
        if (nasdaq.paymentDate) {
          paymentDate = new Date(nasdaq.paymentDate).toISOString();
        } else if (exDividendDate) {
          const pd = new Date(exDividendDate);
          pd.setDate(pd.getDate() + 15);
          paymentDate = pd.toISOString();
        }

        // Still use Yahoo quote for name/currency/price
        name = priceData?.name ?? ticker;
        currency = priceData?.currency ?? "USD";
      } else {
        // --- Fallback: Yahoo Finance chart ---
        const chart = await yahooFinance.chart(ticker, {
          period1: period1Str,
          interval: "1mo",
        });

        const dividendMap = chart.events?.dividends ?? {};
        const dividends = Object.values(dividendMap)
          .map((d) => { const item = d as { date: number | string; amount: number }; return { date: new Date(item.date).toISOString(), amount: item.amount }; })
          .sort((a, b) => a.date.localeCompare(b.date));

        if (dividends.length === 0) return null;

        frequency = detectFrequency(dividends);
        const lastDiv = dividends[dividends.length - 1];
        amountPerShare = lastDiv.amount;
        annualDividend = amountPerShare * frequency;

        const quoteExDiv = priceData?.exDividendDate ?? null;
        const today = new Date().toISOString().split("T")[0];
        exDividendDate = quoteExDiv && quoteExDiv >= today ? quoteExDiv : lastDiv.date;

        if (priceData?.dividendDate) {
          paymentDate = priceData.dividendDate;
        } else if (exDividendDate) {
          const pd = new Date(exDividendDate);
          pd.setDate(pd.getDate() + 15);
          paymentDate = pd.toISOString();
        }

        name = (chart.meta as { longName?: string })?.longName || chart.meta?.shortName || ticker;
        currency = chart.meta?.currency ?? "USD";
      }

      const dividendYield = currentPrice && currentPrice > 0 && annualDividend != null
        ? annualDividend / currentPrice
        : null;

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
      return { ticker, data };
    })
  );

  const events: DividendCalendarEvent[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const { ticker, data } = result.value;
    events.push({
      ...data,
      portfolios: tickerMap.get(ticker) ?? [],
      sharesHeld: tickerShares.get(ticker) ?? 0,
    });
  }

  return NextResponse.json(events);
}
