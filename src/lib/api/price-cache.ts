import { prisma } from "@/lib/db";
import { getQuote, getMultipleQuotes } from "./yahoo-finance";
import type { QuoteData } from "@/types";
import { Prisma } from "@prisma/client";

const CACHE_TTL_MINUTES = 15;

export async function getCachedQuote(ticker: string): Promise<QuoteData | null> {
  // Check cache first
  const cached = await prisma.priceCache.findUnique({
    where: { ticker },
  });

  if (cached) {
    const cacheAge = (Date.now() - cached.updatedAt.getTime()) / 1000 / 60;

    if (cacheAge < CACHE_TTL_MINUTES) {
      return {
        ticker: cached.ticker,
        price: Number(cached.price),
        previousClose: cached.previousClose ? Number(cached.previousClose) : undefined,
        currency: cached.currency,
        dividendYield: cached.dividendYield ? Number(cached.dividendYield) : undefined,
        name: cached.name || undefined,
        logoUrl: cached.logoUrl || undefined,
        fiftyTwoWeekHigh: cached.fiftyTwoWeekHigh ? Number(cached.fiftyTwoWeekHigh) : undefined,
        fiftyTwoWeekLow: cached.fiftyTwoWeekLow ? Number(cached.fiftyTwoWeekLow) : undefined,
        cached: true,
      };
    }
  }

  // Fetch fresh data
  const quote = await getQuote(ticker);

  if (!quote) {
    return null;
  }

  // Update cache
  await prisma.priceCache.upsert({
    where: { ticker },
    update: {
      price: new Prisma.Decimal(quote.price),
      currency: quote.currency,
      dividendYield: quote.dividendYield
        ? new Prisma.Decimal(quote.dividendYield)
        : null,
      previousClose: quote.previousClose
        ? new Prisma.Decimal(quote.previousClose)
        : null,
      name: quote.name || null,
      logoUrl: quote.logoUrl || null,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh
        ? new Prisma.Decimal(quote.fiftyTwoWeekHigh)
        : null,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow
        ? new Prisma.Decimal(quote.fiftyTwoWeekLow)
        : null,
    },
    create: {
      ticker,
      price: new Prisma.Decimal(quote.price),
      currency: quote.currency,
      dividendYield: quote.dividendYield
        ? new Prisma.Decimal(quote.dividendYield)
        : null,
      previousClose: quote.previousClose
        ? new Prisma.Decimal(quote.previousClose)
        : null,
      name: quote.name || null,
      logoUrl: quote.logoUrl || null,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh
        ? new Prisma.Decimal(quote.fiftyTwoWeekHigh)
        : null,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow
        ? new Prisma.Decimal(quote.fiftyTwoWeekLow)
        : null,
    },
  });

  return { ...quote, cached: false };
}

export async function refreshPricesForHoldings(): Promise<void> {
  const holdings = await prisma.holding.findMany({
    select: { ticker: true },
    distinct: ["ticker"],
  });

  const tickers = holdings.map((h) => h.ticker);
  await refreshPricesForTickers(tickers);
}

export async function refreshPricesForTickers(tickers: string[]): Promise<void> {
  if (tickers.length === 0) return;

  const quotes = await getMultipleQuotes(tickers);

  // Update cache for all fetched quotes
  for (const [ticker, quote] of quotes) {
    await prisma.priceCache.upsert({
      where: { ticker },
      update: {
        price: new Prisma.Decimal(quote.price),
        currency: quote.currency,
        dividendYield: quote.dividendYield
          ? new Prisma.Decimal(quote.dividendYield)
          : null,
        previousClose: quote.previousClose
          ? new Prisma.Decimal(quote.previousClose)
          : null,
        name: quote.name || null,
        logoUrl: quote.logoUrl || null,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh
          ? new Prisma.Decimal(quote.fiftyTwoWeekHigh)
          : null,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow
          ? new Prisma.Decimal(quote.fiftyTwoWeekLow)
          : null,
      },
      create: {
        ticker,
        price: new Prisma.Decimal(quote.price),
        currency: quote.currency,
        dividendYield: quote.dividendYield
          ? new Prisma.Decimal(quote.dividendYield)
          : null,
        previousClose: quote.previousClose
          ? new Prisma.Decimal(quote.previousClose)
          : null,
        name: quote.name || null,
        logoUrl: quote.logoUrl || null,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh
          ? new Prisma.Decimal(quote.fiftyTwoWeekHigh)
          : null,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow
          ? new Prisma.Decimal(quote.fiftyTwoWeekLow)
          : null,
      },
    });
  }
}

export async function getAllCachedPrices(): Promise<Map<string, QuoteData>> {
  const cached = await prisma.priceCache.findMany();

  return new Map(
    cached.map((c) => [
      c.ticker,
      {
        ticker: c.ticker,
        price: Number(c.price),
        previousClose: c.previousClose ? Number(c.previousClose) : undefined,
        currency: c.currency,
        dividendYield: c.dividendYield ? Number(c.dividendYield) : undefined,
        name: c.name || undefined,
        logoUrl: c.logoUrl || undefined,
        fiftyTwoWeekHigh: c.fiftyTwoWeekHigh ? Number(c.fiftyTwoWeekHigh) : undefined,
        fiftyTwoWeekLow: c.fiftyTwoWeekLow ? Number(c.fiftyTwoWeekLow) : undefined,
        cached: true,
      },
    ])
  );
}

export async function getPricesForTickers(
  tickers: string[]
): Promise<Map<string, QuoteData>> {
  if (tickers.length === 0) return new Map();

  const cached = await prisma.priceCache.findMany({
    where: { ticker: { in: tickers } },
  });

  const result = new Map<string, QuoteData>();
  const staleOrMissing: string[] = [];
  const now = Date.now();

  // Check cache and find stale/missing tickers
  for (const ticker of tickers) {
    const cachedItem = cached.find((c) => c.ticker === ticker);
    if (cachedItem) {
      const cacheAge = (now - cachedItem.updatedAt.getTime()) / 1000 / 60;
      if (cacheAge < CACHE_TTL_MINUTES) {
        result.set(ticker, {
          ticker: cachedItem.ticker,
          price: Number(cachedItem.price),
          previousClose: cachedItem.previousClose
            ? Number(cachedItem.previousClose)
            : undefined,
          currency: cachedItem.currency,
          dividendYield: cachedItem.dividendYield
            ? Number(cachedItem.dividendYield)
            : undefined,
          name: cachedItem.name || undefined,
          logoUrl: cachedItem.logoUrl || undefined,
          fiftyTwoWeekHigh: cachedItem.fiftyTwoWeekHigh
            ? Number(cachedItem.fiftyTwoWeekHigh)
            : undefined,
          fiftyTwoWeekLow: cachedItem.fiftyTwoWeekLow
            ? Number(cachedItem.fiftyTwoWeekLow)
            : undefined,
          cached: true,
        });
        continue;
      }
    }
    staleOrMissing.push(ticker);
  }

  // Fetch fresh data for stale/missing tickers
  if (staleOrMissing.length > 0) {
    const freshQuotes = await getMultipleQuotes(staleOrMissing);

    for (const [ticker, quote] of freshQuotes) {
      // Update cache
      await prisma.priceCache.upsert({
        where: { ticker },
        update: {
          price: new Prisma.Decimal(quote.price),
          currency: quote.currency,
          dividendYield: quote.dividendYield
            ? new Prisma.Decimal(quote.dividendYield)
            : null,
          previousClose: quote.previousClose
            ? new Prisma.Decimal(quote.previousClose)
            : null,
          name: quote.name || null,
          logoUrl: quote.logoUrl || null,
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh
            ? new Prisma.Decimal(quote.fiftyTwoWeekHigh)
            : null,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow
            ? new Prisma.Decimal(quote.fiftyTwoWeekLow)
            : null,
        },
        create: {
          ticker,
          price: new Prisma.Decimal(quote.price),
          currency: quote.currency,
          dividendYield: quote.dividendYield
            ? new Prisma.Decimal(quote.dividendYield)
            : null,
          previousClose: quote.previousClose
            ? new Prisma.Decimal(quote.previousClose)
            : null,
          name: quote.name || null,
          logoUrl: quote.logoUrl || null,
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh
            ? new Prisma.Decimal(quote.fiftyTwoWeekHigh)
            : null,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow
            ? new Prisma.Decimal(quote.fiftyTwoWeekLow)
            : null,
        },
      });

      result.set(ticker, { ...quote, cached: false });
    }
  }

  return result;
}
