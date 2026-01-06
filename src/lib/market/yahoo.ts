import YahooFinance from 'yahoo-finance2';

// v3: 클래스 인스턴스 생성
const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
});

export interface QuoteResult {
  symbol: string;
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  currency: string;
  regularMarketTime: Date;
}

// Rate limit 방지를 위한 딜레이
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 글로벌 요청 큐 (모든 요청을 순차 처리)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // 최소 500ms 간격

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }

  lastRequestTime = Date.now();
}

/**
 * 단일 종목 시세 조회 (재시도 로직 포함)
 */
export async function getQuote(
  symbol: string,
  retries = 3
): Promise<QuoteResult | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // 글로벌 rate limit 대기
      await waitForRateLimit();

      // Rate limit 재시도 시 추가 대기
      if (attempt > 0) {
        await delay(2000 * attempt); // 2초, 4초, 6초...
      }

      const quote = await yahooFinance.quote(symbol);

      return {
        symbol: quote.symbol,
        regularMarketPrice: quote.regularMarketPrice || 0,
        regularMarketPreviousClose: quote.regularMarketPreviousClose || 0,
        currency: quote.currency || 'USD',
        regularMarketTime: quote.regularMarketTime
          ? new Date(quote.regularMarketTime)
          : new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Rate limit 에러인 경우 재시도
      if (errorMessage.includes('Too Many Requests') && attempt < retries - 1) {
        console.log(
          `Rate limited for ${symbol}, retrying in ${2000 * (attempt + 1)}ms...`
        );
        continue;
      }

      console.error(`Failed to fetch quote for ${symbol}:`, errorMessage);
      return null;
    }
  }
  return null;
}

/**
 * 복수 종목 시세 조회
 */
export async function getQuotes(
  symbols: string[]
): Promise<Map<string, QuoteResult>> {
  const results = new Map<string, QuoteResult>();

  // 순차적으로 조회 (getQuote에서 rate limit 처리)
  for (const symbol of symbols) {
    const quote = await getQuote(symbol);
    if (quote) {
      results.set(symbol, quote);
    }
  }

  return results;
}

/**
 * USD/CAD 환율 조회
 */
export async function getUsdCadRate(): Promise<number> {
  try {
    // 글로벌 rate limit 대기
    await waitForRateLimit();

    // CAD=X는 1 USD = X CAD를 의미
    const quote = await yahooFinance.quote('CAD=X');
    return quote.regularMarketPrice || 1.35;
  } catch (error) {
    console.error('Failed to fetch USD/CAD rate:', error);
    return 1.35; // 기본값
  }
}

export interface DividendInfo {
  symbol: string;
  price: number;
  currency: string;
  dividendYield: number | null; // As percentage (e.g., 3.74 for 3.74%)
  trailingAnnualDividendRate: number | null; // Annual dividend per share
  dividendDate: Date | null; // Next dividend date if available
}

/**
 * 종목 배당 정보 조회
 */
export async function getDividendInfo(
  symbol: string
): Promise<DividendInfo | null> {
  try {
    await waitForRateLimit();

    const quote = await yahooFinance.quote(symbol);

    return {
      symbol: quote.symbol,
      price: quote.regularMarketPrice || 0,
      currency: quote.currency || 'USD',
      dividendYield: quote.dividendYield || null,
      trailingAnnualDividendRate: quote.trailingAnnualDividendRate || null,
      dividendDate: quote.dividendDate ? new Date(quote.dividendDate) : null,
    };
  } catch (error) {
    console.error(`Failed to fetch dividend info for ${symbol}:`, error);
    return null;
  }
}

/**
 * 복수 종목 배당 정보 조회
 */
export async function getDividendInfoBatch(
  symbols: string[]
): Promise<Map<string, DividendInfo>> {
  const results = new Map<string, DividendInfo>();

  for (const symbol of symbols) {
    const info = await getDividendInfo(symbol);
    if (info) {
      results.set(symbol, info);
    }
  }

  return results;
}
/**
 * 종목 배당 히스토리 조회 (최근 1년)
 */
export async function getDividendHistory(
  symbol: string
): Promise<{ date: Date; amount: number }[]> {
  try {
    await waitForRateLimit();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 1);

    const result = await yahooFinance.historical(symbol, {
      period1: startDate.toISOString().split('T')[0],
      period2: endDate.toISOString().split('T')[0],
      events: 'dividends',
    });

    return result.map((item: any) => ({
      date: new Date(item.date),
      amount: item.dividends || 0,
    }));
  } catch (error) {
    console.error(`Failed to fetch dividend history for ${symbol}:`, error);
    return [];
  }
}
