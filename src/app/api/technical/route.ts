import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { yahooFinance, getPrice } from "@/lib/price";
import { sma, rsi, detectSignals } from "@/lib/technical-indicators";
import type { Signal } from "@/lib/technical-indicators";

// ---------------------------------------------------------------------------
// OHLCV + Technical indicators cache (30-min TTL)
// ---------------------------------------------------------------------------

interface CachedResult {
  data: TechnicalResponse;
  fetchedAt: number;
}

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TechnicalResponse {
  ticker: string;
  currency: string;
  candles: Candle[];
  indicators: {
    sma50: (number | null)[];
    sma200: (number | null)[];
    rsi14: (number | null)[];
  };
  signals: Signal[];
  meta: {
    currentPrice: number;
    week52High: number;
    week52Low: number;
    fromHighPct: number;
    dividendYield: number | null;
    payoutRatio: number | null;
  };
}

const cache = new Map<string, CachedResult>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const VALID_RANGES = new Set(["1m", "3m", "6m", "1y", "2y", "5y"]);

// ---------------------------------------------------------------------------
// GET /api/technical?ticker=AAPL&range=1y
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  const range = searchParams.get("range") ?? "1y";

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }
  if (!VALID_RANGES.has(range)) {
    return NextResponse.json(
      { error: `Invalid range. Use one of: ${[...VALID_RANGES].join(", ")}` },
      { status: 400 }
    );
  }

  // Check cache
  const cacheKey = `${ticker}-${range}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    // Determine interval and start date
    const intervalMap: Record<string, "1d" | "1wk"> = {
      "1m": "1d",
      "3m": "1d",
      "6m": "1wk",
      "1y": "1wk",
      "2y": "1wk",
      "5y": "1wk",
    };
    const interval = intervalMap[range] ?? "1wk";

    const now = new Date();
    const period1 = new Date(now);
    switch (range) {
      case "1m":
        period1.setMonth(period1.getMonth() - 1);
        break;
      case "3m":
        period1.setMonth(period1.getMonth() - 3);
        break;
      case "6m":
        period1.setMonth(period1.getMonth() - 6);
        break;
      case "1y":
        period1.setFullYear(period1.getFullYear() - 1);
        break;
      case "2y":
        period1.setFullYear(period1.getFullYear() - 2);
        break;
      case "5y":
        period1.setFullYear(period1.getFullYear() - 5);
        break;
    }

    // Fetch OHLCV from Yahoo Finance
    const [chartResult, priceData] = await Promise.all([
      yahooFinance.chart(ticker, {
        period1,
        period2: now,
        interval,
      }),
      getPrice(ticker),
    ]);

    if (!priceData) {
      return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
    }

    const quotes = chartResult.quotes ?? [];

    // Build candles array — require open+close, fallback high/low to close
    const candles: Candle[] = (quotes)
      .filter((q) => q.open != null && q.close != null)
      .map((q) => ({
        date: new Date(q.date).toISOString().split("T")[0],
        open: Math.round(q.open! * 100) / 100,
        high: Math.round((q.high ?? q.close!) * 100) / 100,
        low: Math.round((q.low ?? q.close!) * 100) / 100,
        close: Math.round(q.close! * 100) / 100,
        volume: q.volume ?? 0,
      }));

    if (candles.length === 0) {
      return NextResponse.json(
        { error: "No price data available for this ticker/range" },
        { status: 404 }
      );
    }

    // Extract arrays for indicator calculations
    const closes = candles.map((c) => c.close);
    const dates = candles.map((c) => c.date);

    // Calculate indicators
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const rsi14 = rsi(closes, 14);

    // Detect signals
    const signals = detectSignals(dates, closes, sma50, sma200, rsi14);

    const data: TechnicalResponse = {
      ticker,
      currency: priceData.currency,
      candles,
      indicators: {
        sma50,
        sma200,
        rsi14,
      },
      signals,
      meta: {
        currentPrice: priceData.price,
        week52High: priceData.week52High,
        week52Low: priceData.week52Low,
        fromHighPct: priceData.fromHighPct,
        dividendYield: priceData.dividendYield,
        payoutRatio: priceData.payoutRatio,
      },
    };

    cache.set(cacheKey, { data, fetchedAt: Date.now() });
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[technical] Error for ${ticker}:`, msg);
    return NextResponse.json(
      { error: "Failed to fetch technical data" },
      { status: 500 }
    );
  }
}
