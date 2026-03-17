import yahooFinance from "yahoo-finance2";

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
      fetchedAt: Date.now(),
    };

    cache.set(ticker, data);
    return data;
  } catch {
    return null;
  }
}

export async function getCompanyName(ticker: string): Promise<string> {
  try {
    const quote = await yahooFinance.quote(ticker);
    return quote?.longName || quote?.shortName || ticker;
  } catch {
    return ticker;
  }
}
