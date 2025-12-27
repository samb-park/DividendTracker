import YahooFinance from "yahoo-finance2";
import type { QuoteData, SearchResult } from "@/types";

const yahooFinance = new YahooFinance();

export async function getQuote(ticker: string): Promise<QuoteData | null> {
  try {
    const result = await yahooFinance.quote(ticker);

    // Handle the new API response format
    const quote = result as {
      symbol?: string;
      regularMarketPrice?: number;
      regularMarketPreviousClose?: number;
      currency?: string;
      trailingAnnualDividendYield?: number;
      shortName?: string;
      longName?: string;
      exchange?: string;
      fiftyTwoWeekHigh?: number;
      fiftyTwoWeekLow?: number;
    };

    if (!quote || !quote.regularMarketPrice) {
      return null;
    }

    return {
      ticker: quote.symbol || ticker,
      price: quote.regularMarketPrice,
      previousClose: quote.regularMarketPreviousClose,
      currency: quote.currency || "USD",
      dividendYield: quote.trailingAnnualDividendYield
        ? quote.trailingAnnualDividendYield * 100
        : undefined,
      name: quote.shortName || quote.longName,
      exchange: quote.exchange,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    };
  } catch (error) {
    console.error(`Failed to fetch quote for ${ticker}:`, error);
    return null;
  }
}

export async function searchTickers(query: string): Promise<SearchResult[]> {
  try {
    const results = await yahooFinance.search(query, {
      quotesCount: 10,
      newsCount: 0,
    });

    const quotes = (results as { quotes?: Array<{
      symbol?: string;
      quoteType?: string;
      shortname?: string;
      longname?: string;
      exchange?: string;
    }> }).quotes || [];

    return quotes
      .filter((q) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF"))
      .map((q) => ({
        symbol: q.symbol!,
        name: q.shortname || q.longname || q.symbol!,
        exchange: q.exchange,
        type: q.quoteType,
      }));
  } catch (error) {
    console.error(`Failed to search tickers for "${query}":`, error);
    return [];
  }
}

export async function getMultipleQuotes(
  tickers: string[]
): Promise<Map<string, QuoteData>> {
  const results = new Map<string, QuoteData>();

  // Fetch in batches to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (ticker) => {
        const quote = await getQuote(ticker);
        if (quote) {
          results.set(ticker, quote);
        }
      })
    );

    // Small delay between batches
    if (i + batchSize < tickers.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

export type ChartPeriod = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y";

export interface HistoricalPrice {
  date: Date;
  close: number;
}

export async function getHistoricalPrices(
  ticker: string,
  period: ChartPeriod
): Promise<HistoricalPrice[]> {
  try {
    const now = new Date();
    let startDate: Date;
    let interval: "1m" | "5m" | "15m" | "1h" | "1d" | "1wk" | "1mo";

    switch (period) {
      case "1D":
        startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
        interval = "5m";
        break;
      case "1W":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        interval = "1h";
        break;
      case "1M":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        interval = "1d";
        break;
      case "3M":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        interval = "1d";
        break;
      case "YTD":
        startDate = new Date(now.getFullYear(), 0, 1);
        interval = "1d";
        break;
      case "1Y":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        interval = "1d";
        break;
      case "5Y":
        startDate = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
        interval = "1wk";
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        interval = "1d";
    }

    const result = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: now,
      interval,
    });

    const chartResult = result as {
      quotes?: Array<{
        date: Date;
        close: number | null;
      }>;
    };

    if (!chartResult.quotes) {
      return [];
    }

    return chartResult.quotes
      .filter((q) => q.close !== null)
      .map((q) => ({
        date: q.date,
        close: q.close as number,
      }));
  } catch (error) {
    console.error(`Failed to fetch historical prices for ${ticker}:`, error);
    return [];
  }
}

export async function getMultipleHistoricalPrices(
  tickers: string[],
  period: ChartPeriod
): Promise<Map<string, HistoricalPrice[]>> {
  const results = new Map<string, HistoricalPrice[]>();

  // Fetch in batches to avoid rate limiting
  const batchSize = 3;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (ticker) => {
        const prices = await getHistoricalPrices(ticker, period);
        if (prices.length > 0) {
          results.set(ticker, prices);
        }
      })
    );

    // Small delay between batches
    if (i + batchSize < tickers.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}
