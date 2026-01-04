import { prisma } from "@/lib/db";
import { getQuote, getQuotes, getUsdCadRate, QuoteResult } from "./yahoo";

const PRICE_CACHE_TTL = 60 * 60 * 1000; // 1시간 (rate limit 방지)
const FX_CACHE_TTL = 60 * 60 * 1000; // 1시간

export interface CachedQuote {
  symbol: string;
  price: number;
  previousClose: number;
  currency: string;
}

/**
 * 캐시된 시세 조회 (없으면 새로 가져옴)
 */
export async function getCachedQuote(symbol: string): Promise<CachedQuote | null> {
  // 캐시 확인
  const cached = await prisma.priceCache.findUnique({
    where: { symbol },
  });

  if (cached && new Date(cached.expiresAt) > new Date()) {
    return {
      symbol: cached.symbol,
      price: cached.price,
      previousClose: cached.previousClose || cached.price,
      currency: cached.currency,
    };
  }

  // 새로 조회
  const quote = await getQuote(symbol);
  if (!quote) return null;

  // 캐시 저장
  try {
    await prisma.priceCache.upsert({
      where: { symbol },
      create: {
        symbol,
        price: quote.regularMarketPrice,
        previousClose: quote.regularMarketPreviousClose,
        currency: quote.currency,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + PRICE_CACHE_TTL),
      },
      update: {
        price: quote.regularMarketPrice,
        previousClose: quote.regularMarketPreviousClose,
        currency: quote.currency,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + PRICE_CACHE_TTL),
      },
    });
  } catch {
    // 캐시 저장 실패해도 계속
  }

  return {
    symbol: quote.symbol,
    price: quote.regularMarketPrice,
    previousClose: quote.regularMarketPreviousClose,
    currency: quote.currency,
  };
}

/**
 * 복수 종목 캐시 시세 조회
 */
export async function getCachedQuotes(
  symbols: string[]
): Promise<Map<string, CachedQuote>> {
  const results = new Map<string, CachedQuote>();
  const toFetch: string[] = [];

  // 캐시 확인
  const cached = await prisma.priceCache.findMany({
    where: {
      symbol: { in: symbols },
      expiresAt: { gt: new Date() },
    },
  });

  for (const c of cached) {
    results.set(c.symbol, {
      symbol: c.symbol,
      price: c.price,
      previousClose: c.previousClose || c.price,
      currency: c.currency,
    });
  }

  // 캐시에 없는 것 찾기
  for (const s of symbols) {
    if (!results.has(s)) {
      toFetch.push(s);
    }
  }

  // 새로 조회
  if (toFetch.length > 0) {
    const freshQuotes = await getQuotes(toFetch);

    for (const [symbol, quote] of freshQuotes) {
      // 캐시 저장
      try {
        await prisma.priceCache.upsert({
          where: { symbol },
          create: {
            symbol,
            price: quote.regularMarketPrice,
            previousClose: quote.regularMarketPreviousClose,
            currency: quote.currency,
            fetchedAt: new Date(),
            expiresAt: new Date(Date.now() + PRICE_CACHE_TTL),
          },
          update: {
            price: quote.regularMarketPrice,
            previousClose: quote.regularMarketPreviousClose,
            currency: quote.currency,
            fetchedAt: new Date(),
            expiresAt: new Date(Date.now() + PRICE_CACHE_TTL),
          },
        });
      } catch {
        // 무시
      }

      results.set(symbol, {
        symbol: quote.symbol,
        price: quote.regularMarketPrice,
        previousClose: quote.regularMarketPreviousClose,
        currency: quote.currency,
      });
    }
  }

  return results;
}

/**
 * 캐시된 환율 조회
 */
export async function getCachedFxRate(): Promise<number> {
  const cached = await prisma.fxCache.findUnique({
    where: { pair: "USDCAD" },
  });

  if (cached && new Date(cached.expiresAt) > new Date()) {
    return cached.rate;
  }

  // 새로 조회
  const rate = await getUsdCadRate();

  // 캐시 저장
  try {
    await prisma.fxCache.upsert({
      where: { pair: "USDCAD" },
      create: {
        pair: "USDCAD",
        rate,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + FX_CACHE_TTL),
      },
      update: {
        rate,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + FX_CACHE_TTL),
      },
    });
  } catch {
    // 무시
  }

  return rate;
}
