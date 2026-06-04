import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { yahooFinance } from "@/lib/price";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/market/quotes?symbols=^GSPC,^IXIC,AAPL
// Batch real-time(ish) quotes. Yahoo free tier is typically delayed, so every
// successful quote is labelled status="delayed" — we never present it as live.
// Symbols that fail return status="no_data" instead of a fabricated number.
// ---------------------------------------------------------------------------

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string | null;
  /** "delayed" = real but delayed data; "no_data" = source returned nothing */
  status: "delayed" | "no_data";
}

interface QuotesResponse {
  asOf: string;
  source: string;
  quotes: MarketQuote[];
}

interface CachedQuote {
  data: MarketQuote;
  fetchedAt: number;
}

const cache = new Map<string, CachedQuote>();
const TTL = 60 * 1000; // 60s

const MAX_SYMBOLS = 40;

async function fetchOne(symbol: string): Promise<MarketQuote> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < TTL) return cached.data;

  try {
    const q = await yahooFinance.quote(symbol);
    const price = q?.regularMarketPrice;
    if (q == null || price == null) {
      return { symbol, name: symbol, price: null, change: null, changePercent: null, currency: null, status: "no_data" };
    }
    const data: MarketQuote = {
      symbol,
      name: q.shortName || q.longName || symbol,
      price,
      change: q.regularMarketChange ?? null,
      changePercent: q.regularMarketChangePercent ?? null,
      currency: q.currency ?? null,
      status: "delayed",
    };
    cache.set(symbol, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return { symbol, name: symbol, price: null, change: null, changePercent: null, currency: null, status: "no_data" };
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("symbols")?.trim();
  if (!raw) {
    return NextResponse.json({ error: "symbols query param is required" }, { status: 400 });
  }

  const symbols = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    )
  ).slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "No valid symbols" }, { status: 400 });
  }

  const quotes = await Promise.all(symbols.map(fetchOne));

  const body: QuotesResponse = {
    asOf: new Date().toISOString(),
    source: "Yahoo Finance (delayed)",
    quotes,
  };
  return NextResponse.json(body);
}
