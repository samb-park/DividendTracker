import { prisma } from "@/lib/db";
import { getQuote, getQuotes, getUsdCadRate, QuoteResult } from "./yahoo";

const PRICE_CACHE_TTL = 60 * 60 * 1000; // 1시간 (rate limit 방지)
const FX_CACHE_TTL = 60 * 60 * 1000; // 1시간

export interface CachedQuote {
  symbol: string;
  price: number;
  previousClose: number;
  currency: string;
  // 52-week data (not cached in DB, only available from fresh quotes)
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHighChangePercent: number | null;
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
      fiftyTwoWeekHigh: null, // Not available from DB cache
      fiftyTwoWeekLow: null,
      fiftyTwoWeekHighChangePercent: null,
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
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    fiftyTwoWeekHighChangePercent: quote.fiftyTwoWeekHighChangePercent,
  };
}

/**
 * 복수 종목 캐시 시세 조회
 */
export async function getCachedQuotes(
  symbols: string[]
): Promise<Map<string, CachedQuote>> {
  const results = new Map<string, CachedQuote>();
  // 52W 데이터는 DB 캐시에 저장하지 않으므로, 항상 fresh 데이터 필요
  // 캐시된 가격 데이터를 먼저 읽고, fresh 데이터로 52W 정보 보강
  const cached = await prisma.priceCache.findMany({
    where: {
      symbol: { in: symbols },
      expiresAt: { gt: new Date() },
    },
  });

  const cachedMap = new Map<string, typeof cached[0]>();
  for (const c of cached) {
    cachedMap.set(c.symbol, c);
  }

  // 캐시에 없는 심볼 찾기
  const toFetch: string[] = [];
  for (const s of symbols) {
    if (!cachedMap.has(s)) {
      toFetch.push(s);
    }
  }

  // 캐시 안 된 심볼만 새로 조회
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
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        fiftyTwoWeekHighChangePercent: quote.fiftyTwoWeekHighChangePercent,
      });
    }
  }

  // 52W 데이터가 필요하지만 캐시에서 읽은 심볼들 처리
  // 캐시된 가격은 사용하되, 52W 데이터를 위해 fresh 조회 필요
  const symbolsNeedingFresh52W = symbols.filter(s => !results.has(s) && cachedMap.has(s));

  if (symbolsNeedingFresh52W.length > 0) {
    const fresh52WQuotes = await getQuotes(symbolsNeedingFresh52W);

    for (const s of symbolsNeedingFresh52W) {
      const cachedData = cachedMap.get(s)!;
      const freshQuote = fresh52WQuotes.get(s);

      results.set(s, {
        symbol: cachedData.symbol,
        price: cachedData.price,
        previousClose: cachedData.previousClose || cachedData.price,
        currency: cachedData.currency,
        // 52W 데이터는 fresh에서 가져옴
        fiftyTwoWeekHigh: freshQuote?.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: freshQuote?.fiftyTwoWeekLow ?? null,
        fiftyTwoWeekHighChangePercent: freshQuote?.fiftyTwoWeekHighChangePercent ?? null,
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
