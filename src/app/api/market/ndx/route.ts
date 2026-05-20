import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const revalidate = 300;

const yahooFinance = new YahooFinance();

// RULEBOOK v4.1.8: NDX-based tier triggers are forbidden. Endpoint still returns NDX price/drawdown
// for read-only display purposes, but `tier` is hard-coded to 0 so no caller can branch on it.
export async function GET() {
  try {
    const quote = await yahooFinance.quote("^NDX");
    const price = quote?.regularMarketPrice;
    const high52w = quote?.fiftyTwoWeekHigh;

    if (price == null || high52w == null || high52w === 0) {
      return NextResponse.json(
        { error: "Failed to fetch NDX data" },
        { status: 500 }
      );
    }

    const drawdownPct = ((price - high52w) / high52w) * 100;

    return NextResponse.json({
      price,
      high52w,
      drawdownPct,
      tier: 0,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch NDX data" },
      { status: 500 }
    );
  }
}
