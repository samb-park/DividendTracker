import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const revalidate = 300;

const yahooFinance = new YahooFinance();

function getNdxTier(drawdownPct: number): number {
  if (drawdownPct <= -30) return 3;
  if (drawdownPct <= -20) return 2;
  if (drawdownPct <= -10) return 1;
  return 0;
}

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
    const tier = getNdxTier(drawdownPct);

    return NextResponse.json({
      price,
      high52w,
      drawdownPct,
      tier,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch NDX data" },
      { status: 500 }
    );
  }
}
