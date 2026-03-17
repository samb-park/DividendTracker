import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

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
  fetchedAt: number;
}

const cache = new Map<string, PriceData>();
const TTL = 5 * 60 * 1000; // 5 minutes

export async function getPrice(ticker: string): Promise<PriceData | null> {
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < TTL) return cached;

  try {
    const quote = await yahooFinance.quote(ticker);
    if (!quote) return null;

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
      dividendRate: (quote as any).dividendRate
        || (quote as any).trailingAnnualDividendRate
        || null,
      dividendYield: (quote as any).dividendYield
        ? (quote as any).dividendYield  // Yahoo quote returns dividendYield already as % (e.g. 3.58)
        : ((quote as any).trailingAnnualDividendYield
          ? (quote as any).trailingAnnualDividendYield * 100  // decimal → %
          : null),
      trailingAnnualDividendRate: (quote as any).trailingAnnualDividendRate || null,
      trailingAnnualDividendYield: (quote as any).trailingAnnualDividendYield
        ? (quote as any).trailingAnnualDividendYield * 100
        : null,
      exDividendDate: (quote as any).exDividendDate ? new Date((quote as any).exDividendDate).toISOString().split("T")[0] : null,
      dividendDate: (quote as any).dividendDate ? new Date((quote as any).dividendDate).toISOString().split("T")[0] : null,
      fetchedAt: Date.now(),
    };

    cache.set(ticker, data);
    return data;
  } catch {
    return null;
  }
}

// --- FX rate (USDCAD) with 5-min cache ---
let fxCache: { rate: number; fetchedAt: number } | null = null;

export async function getFxRate(): Promise<number> {
  if (fxCache && Date.now() - fxCache.fetchedAt < TTL) return fxCache.rate;

  try {
    const quote = await yahooFinance.quote("USDCAD=X");
    const rate = quote?.regularMarketPrice;
    if (rate && rate > 0) {
      fxCache = { rate, fetchedAt: Date.now() };
      return rate;
    }
  } catch {
    // fall through to fallback
  }

  const fallback = parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35");
  return fxCache?.rate ?? fallback;
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

  return (result.quotes ?? [])
    .filter((q: any) => q.close != null)
    .map((q: any) => ({
      date: new Date(q.date).toISOString().split("T")[0],
      close: Math.round(q.close * 100) / 100,
    }));
}
