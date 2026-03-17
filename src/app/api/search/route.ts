import { NextRequest, NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return NextResponse.json([]);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await (yahooFinance.search as any)(q) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes = (results?.quotes ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => r.quoteType === "EQUITY")
      .slice(0, 5)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({ symbol: r.symbol, name: r.longname || r.shortname || r.symbol }));
    return NextResponse.json(quotes);
  } catch {
    return NextResponse.json([]);
  }
}
