import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { auth } from "@/auth";

const yahooFinance = new YahooFinance();

interface YahooSearchQuote {
  isYahooFinance?: boolean;
  quoteType?: string;
  symbol?: string;
  longname?: string;
  shortname?: string;
  exchDisp?: string;
  exchange?: string;
}

interface YahooSearchResult {
  quotes?: YahooSearchQuote[];
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return NextResponse.json([]);

  try {
    const results = await yahooFinance.search(q, {}, { validateResult: false }) as YahooSearchResult;
    const quotes = (results?.quotes ?? [])
      .filter((r) => r.isYahooFinance && r.symbol && r.quoteType && ["EQUITY", "ETF"].includes(r.quoteType))
      .slice(0, 8)
      .map((r) => ({
        symbol: r.symbol,
        name: r.longname || r.shortname || r.symbol,
        type: r.quoteType,
        exchange: r.exchDisp || r.exchange,
      }));
    return NextResponse.json(quotes);
  } catch {
    return NextResponse.json([]);
  }
}
