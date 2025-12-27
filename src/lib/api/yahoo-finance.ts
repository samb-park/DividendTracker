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
