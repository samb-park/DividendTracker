---
name: api-integration
description: Guide Questrade API and Yahoo Finance2 integration patterns including rate limiting, caching, error handling, and data normalization. Activates when working on broker sync, stock data fetching, or external API calls.
---

# API Integration Skill

Patterns for integrating Questrade API and Yahoo Finance2 in DividendTracker, covering authentication, rate limits, caching, and error handling.

## When This Skill Activates

- Keywords: "Questrade", "Yahoo Finance", "broker sync", "stock data", "API rate limit"
- Tasks: Fetching dividend history, syncing positions, refreshing prices
- Issues: API errors, stale data, timeout handling

## Yahoo Finance2 Patterns

### Basic Usage

```typescript
import yahooFinance from 'yahoo-finance2';

// Fetch dividend history for a ticker
export async function getDividendHistory(ticker: string, startDate: Date) {
  try {
    const result = await yahooFinance.historical(ticker, {
      period1: startDate,
      events: 'dividends',
    });
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes('No fundamentals')) {
      return []; // ETF or stock with no dividend history
    }
    throw error;
  }
}

// Get current quote
export async function getQuote(ticker: string) {
  const quote = await yahooFinance.quote(ticker, {
    fields: ['regularMarketPrice', 'currency', 'longName', 'trailingAnnualDividendRate'],
  });
  return quote;
}
```

### Rate Limiting Strategy

```typescript
import pLimit from 'p-limit';

const limit = pLimit(3); // Max 3 concurrent Yahoo Finance requests

export async function fetchMultipleQuotes(tickers: string[]) {
  const results = await Promise.all(
    tickers.map((ticker) => limit(() => getQuote(ticker)))
  );
  return results;
}

// Add delay between batch requests
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await sleep(delay);
    return fetchWithBackoff(fn, retries - 1, delay * 2);
  }
}
```

### Caching Strategy

```typescript
// Cache stock quotes for 15 minutes in Next.js
export async function getCachedQuote(ticker: string) {
  const res = await fetch(`/api/quotes/${ticker}`, {
    next: { revalidate: 900 }, // 15 min
  });
  return res.json();
}

// Server-side: use unstable_cache for longer-lived data
import { unstable_cache } from 'next/cache';

export const getCachedDividendHistory = unstable_cache(
  async (ticker: string) => getDividendHistory(ticker, new Date('2020-01-01')),
  ['dividend-history'],
  { revalidate: 3600, tags: [`dividend-${ticker}`] } // 1 hour
);
```

### Data Normalization

```typescript
// Normalize Yahoo Finance dividend data
interface NormalizedDividend {
  date: Date;
  amount: number;
  currency: string;
  ticker: string;
}

export function normalizeYahooDividend(
  raw: YahooHistoricalRow,
  ticker: string,
  currency = 'CAD'
): NormalizedDividend {
  return {
    date: new Date(raw.date),
    amount: raw.dividends ?? 0,
    currency,
    ticker: ticker.toUpperCase(),
  };
}
```

## Questrade API Patterns

### OAuth Token Refresh

```typescript
// Questrade uses short-lived access tokens (30 min)
// Refresh tokens valid for 30 days

interface QuestradeTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function getValidToken(userId: string): Promise<string> {
  const stored = await getStoredTokens(userId); // from encrypted DB

  if (stored.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return stored.accessToken; // still valid (5 min buffer)
  }

  // Refresh
  const refreshed = await refreshQuestradeToken(stored.refreshToken);
  await saveTokens(userId, refreshed); // re-encrypt and save
  return refreshed.accessToken;
}
```

### Fetching Positions

```typescript
export async function getQuestradePositions(userId: string) {
  const token = await getValidToken(userId);
  const apiUrl = await getQuestradeApiUrl(userId); // changes per token refresh

  const res = await fetch(`${apiUrl}/v1/accounts/{accountId}/positions`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    // Token expired mid-request, force refresh
    await invalidateToken(userId);
    throw new Error('Token expired, please retry');
  }

  if (!res.ok) throw new Error(`Questrade API error: ${res.status}`);

  return res.json();
}
```

### Sync Job Pattern

```typescript
// Cron-triggered sync (app/api/cron/sync/route.ts)
export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { questradeConnected: true },
    select: { id: true },
  });

  // Process users sequentially to avoid rate limits
  for (const user of users) {
    try {
      await syncUserPortfolio(user.id);
      await sleep(2000); // 2s between users
    } catch (error) {
      console.error(`Sync failed for user ${user.id}:`, error);
      // Continue with next user, don't fail entire job
    }
  }

  return Response.json({ synced: users.length });
}
```

## Error Handling Reference

| Error | Cause | Handling |
|-------|-------|----------|
| `No fundamentals data` | Ticker has no dividends | Return empty array |
| `HTTPError 429` | Yahoo Finance rate limit | Exponential backoff |
| `Ticker not found` | Delisted or invalid symbol | Mark as inactive in DB |
| `401 Unauthorized` | Expired Questrade token | Refresh token and retry once |
| `Network timeout` | Slow external API | 10s timeout, retry with backoff |

## Environment Variables

```env
# Questrade
QUESTRADE_CLIENT_ID=<from Questrade app registration>
CRON_SECRET=<random secret for cron job auth>

# Encryption (for storing Questrade tokens)
ENCRYPTION_KEY=<64-char hex>
```
