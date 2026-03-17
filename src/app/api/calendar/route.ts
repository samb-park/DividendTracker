import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import yahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

export interface DividendCalendarEvent {
  ticker: string;
  name: string;
  exDividendDate: string | null;   // ISO string
  paymentDate: string | null;       // ISO string
  amountPerShare: number | null;    // per-period amount
  annualDividend: number | null;
  frequency: number | null;         // 1=annual, 2=semi, 4=quarterly, 12=monthly
  dividendYield: number | null;
  currency: string;
  portfolios: string[];
}

// 1-hour in-memory cache
const cache = new Map<string, { data: Omit<DividendCalendarEvent, "portfolios">; fetchedAt: number }>();
const TTL = 60 * 60 * 1000;

function detectFrequency(
  annualRate: number | null | undefined,
  trailingRate: number | null | undefined
): number | null {
  if (!annualRate || annualRate <= 0) return null;
  // trailingAnnualDividendRate is the sum of the last 4 payments
  // dividendRate is usually the projected annual rate
  // We infer frequency from ratio if available, else default 4 (quarterly)
  if (trailingRate && trailingRate > 0) {
    const perPayment = trailingRate / 4; // assume 4 payments trailing
    const ratio = annualRate / perPayment;
    if (ratio >= 10) return 12;  // monthly
    if (ratio >= 3.5) return 4;  // quarterly
    if (ratio >= 1.5) return 2;  // semi-annual
    return 1;                     // annual
  }
  return 4; // default quarterly
}

export async function GET() {
  const holdings = await prisma.holding.findMany({
    include: { portfolio: true },
  });

  // Group holdings by ticker, collect portfolio names
  const tickerMap = new Map<string, string[]>();
  for (const h of holdings) {
    if (!tickerMap.has(h.ticker)) tickerMap.set(h.ticker, []);
    tickerMap.get(h.ticker)!.push(h.portfolio.name);
  }

  const events: DividendCalendarEvent[] = [];

  for (const [ticker, portfolios] of tickerMap.entries()) {
    const cached = cache.get(ticker);
    if (cached && Date.now() - cached.fetchedAt < TTL) {
      events.push({ ...cached.data, portfolios });
      continue;
    }

    try {
      const summary = await yahooFinance.quoteSummary(ticker, {
        modules: ["calendarEvents", "summaryDetail", "price"],
      });

      const cal = summary.calendarEvents;
      const detail = summary.summaryDetail;
      const price = summary.price;

      const annualDividend = (detail as any)?.dividendRate ?? null;
      const trailingRate = (detail as any)?.trailingAnnualDividendRate ?? null;
      const frequency = detectFrequency(annualDividend, trailingRate);
      const amountPerShare =
        annualDividend && frequency ? annualDividend / frequency : null;

      const data: Omit<DividendCalendarEvent, "portfolios"> = {
        ticker,
        name: (price as any)?.longName || (price as any)?.shortName || ticker,
        exDividendDate: (cal as any)?.exDividendDate
          ? new Date((cal as any).exDividendDate).toISOString()
          : null,
        paymentDate: (cal as any)?.dividendDate
          ? new Date((cal as any).dividendDate).toISOString()
          : null,
        amountPerShare,
        annualDividend,
        frequency,
        dividendYield: (detail as any)?.dividendYield ?? null,
        currency: (price as any)?.currency ?? "USD",
      };

      cache.set(ticker, { data, fetchedAt: Date.now() });
      events.push({ ...data, portfolios });
    } catch {
      // Non-dividend stock or fetch error — still include with nulls
      events.push({
        ticker,
        name: ticker,
        exDividendDate: null,
        paymentDate: null,
        amountPerShare: null,
        annualDividend: null,
        frequency: null,
        dividendYield: null,
        currency: "USD",
        portfolios,
      });
    }
  }

  // Filter to only dividend-paying stocks
  const dividendStocks = events.filter((e) => e.annualDividend && e.annualDividend > 0);

  return NextResponse.json(dividendStocks);
}
