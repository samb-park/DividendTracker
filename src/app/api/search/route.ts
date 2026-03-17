import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return NextResponse.json([]);

  try {
    const results: any = await yahooFinance.search(q, {}, { validateResult: false });
    const quotes = (results?.quotes ?? [])
      .filter((r: any) => r.isYahooFinance && ["EQUITY", "ETF"].includes(r.quoteType))
      .slice(0, 8)
      .map((r: any) => ({
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
