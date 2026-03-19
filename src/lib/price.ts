import YahooFinance from "yahoo-finance2";

export const yahooFinance = new YahooFinance();

/** Fields present in Yahoo Finance quote responses but not in the library's TypeScript types */
interface QuoteExtra {
  dividendRate?: number | null;
  dividendYield?: number | null;
  trailingAnnualDividendRate?: number | null;
  trailingAnnualDividendYield?: number | null;
  exDividendDate?: Date | number | string | null;
  dividendDate?: Date | number | string | null;
  payoutRatio?: number | null;
}

interface PriceData {
  ticker: string;
  name: string;
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  week52High: number;
  week52Low: number;
  fromHighPct: number;
  fromLowPct: number;
  dividendRate: number | null;
  dividendYield: number | null;
  trailingAnnualDividendRate: number | null;
  trailingAnnualDividendYield: number | null;
  exDividendDate: string | null;
  dividendDate: string | null;
  payoutRatio: number | null;
  fetchedAt: number;
}

const cache = new Map<string, PriceData>();
const TTL = 5 * 60 * 1000; // 5 minutes

type PriceError = "not_found" | "network";
const errorCache = new Map<string, { reason: PriceError; time: number }>();

export function getPriceError(ticker: string): PriceError | null {
  const e = errorCache.get(ticker);
  if (!e || Date.now() - e.time > TTL) return null;
  return e.reason;
}

export async function getPrice(ticker: string): Promise<PriceData | null> {
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < TTL) return cached;

  try {
    const quote = await yahooFinance.quote(ticker);
    if (!quote) return null;
    const q = quote as typeof quote & QuoteExtra;

    const data: PriceData = {
      ticker,
      name: quote.longName || quote.shortName || ticker,
      price: quote.regularMarketPrice ?? 0,
      currency: quote.currency ?? "USD",
      change: quote.regularMarketChange ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
      week52High: quote.fiftyTwoWeekHigh ?? 0,
      week52Low: quote.fiftyTwoWeekLow ?? 0,
      fromHighPct:
        quote.fiftyTwoWeekHigh && quote.regularMarketPrice
          ? ((quote.regularMarketPrice - quote.fiftyTwoWeekHigh) /
              quote.fiftyTwoWeekHigh) *
            100
          : 0,
      fromLowPct:
        quote.fiftyTwoWeekLow && quote.regularMarketPrice
          ? ((quote.regularMarketPrice - quote.fiftyTwoWeekLow) /
              quote.fiftyTwoWeekLow) *
            100
          : 0,
      dividendRate: q.dividendRate
        || q.trailingAnnualDividendRate
        // Fallback: compute from yield × price when explicit rate is unavailable
        || (q.dividendYield && quote.regularMarketPrice
          ? Math.round(quote.regularMarketPrice * (q.dividendYield / 100) * 10000) / 10000
          : (q.trailingAnnualDividendYield && quote.regularMarketPrice
            ? Math.round(quote.regularMarketPrice * q.trailingAnnualDividendYield * 10000) / 10000
            : null)),
      dividendYield: q.dividendYield
        ? q.dividendYield  // Yahoo quote returns dividendYield already as % (e.g. 3.58)
        : (q.trailingAnnualDividendYield
          ? q.trailingAnnualDividendYield * 100  // decimal → %
          : null),
      trailingAnnualDividendRate: q.trailingAnnualDividendRate || null,
      trailingAnnualDividendYield: q.trailingAnnualDividendYield
        ? q.trailingAnnualDividendYield * 100
        : null,
      exDividendDate: q.exDividendDate ? new Date(q.exDividendDate as string).toISOString().split("T")[0] : null,
      dividendDate: q.dividendDate ? new Date(q.dividendDate as string).toISOString().split("T")[0] : null,
      payoutRatio: q.payoutRatio ? Math.round(q.payoutRatio * 100) : null,
      fetchedAt: Date.now(),
    };

    cache.set(ticker, data);
    return data;
  } catch (e: unknown) {
    const msg = String(e instanceof Error ? e.message : e).toLowerCase();
    const reason: PriceError = (
      msg.includes("not found") ||
      msg.includes("no fundamentals") ||
      msg.includes("validation") ||
      msg.includes("404") ||
      msg.includes("invalid symbol")
    ) ? "not_found" : "network";
    errorCache.set(ticker, { reason, time: Date.now() });
    return null;
  }
}

// --- History cache (30-min TTL) ---
const historyCache = new Map<string, { data: { date: string; close: number }[]; fetchedAt: number }>();
const HISTORY_TTL = 30 * 60 * 1000;

// --- FX rate (USDCAD) with 5-min cache ---
let fxCache: { rate: number; fetchedAt: number } | null = null;

export async function getFxRate(): Promise<{ rate: number; fallback: boolean }> {
  if (fxCache && Date.now() - fxCache.fetchedAt < TTL) return { rate: fxCache.rate, fallback: false };

  try {
    const quote = await yahooFinance.quote("USDCAD=X");
    const rate = quote?.regularMarketPrice;
    if (rate && rate > 0) {
      fxCache = { rate, fetchedAt: Date.now() };
      return { rate, fallback: false };
    }
  } catch {
    // fall through to fallback
  }

  const fallbackRate = fxCache?.rate ?? parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35");
  return { rate: fallbackRate, fallback: true };
}

export async function getCompanyName(ticker: string): Promise<string> {
  try {
    const quote = await yahooFinance.quote(ticker);
    return quote?.longName || quote?.shortName || ticker;
  } catch {
    return ticker;
  }
}

export async function getHistory(
  ticker: string,
  range: string,
  from?: string
): Promise<{ date: string; close: number }[]> {
  const cacheKey = `${ticker}-${range}-${from ?? ""}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < HISTORY_TTL) return cached.data;

  const now = new Date();
  let period1: Date;
  let interval: "1d" | "1wk";

  if (from) {
    period1 = new Date(from);
    const daysDiff = (now.getTime() - period1.getTime()) / 86400000;
    interval = daysDiff > 180 ? "1wk" : "1d";
  } else {
    const intervalMap: Record<string, "1d" | "1wk"> = {
      "1m": "1d", "3m": "1d", "6m": "1wk", "1y": "1wk",
    };
    interval = intervalMap[range] ?? "1d";
    period1 = new Date(now);
    switch (range) {
      case "1m": period1.setMonth(period1.getMonth() - 1); break;
      case "3m": period1.setMonth(period1.getMonth() - 3); break;
      case "6m": period1.setMonth(period1.getMonth() - 6); break;
      case "1y": period1.setFullYear(period1.getFullYear() - 1); break;
      default: period1.setMonth(period1.getMonth() - 3);
    }
  }

  const result = await yahooFinance.chart(ticker, {
    period1,
    period2: now,
    interval,
  });

  const data = (result.quotes ?? [])
    .filter((q) => q.close != null)
    .map((q) => ({
      date: new Date(q.date).toISOString().split("T")[0],
      close: Math.round(q.close! * 100) / 100,
    }));

  historyCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}
