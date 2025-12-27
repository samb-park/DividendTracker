import { NextRequest, NextResponse } from "next/server";
import {
  getHistoricalPrices,
  type ChartPeriod,
} from "@/lib/api/yahoo-finance";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") || "1W") as ChartPeriod;

    const prices = await getHistoricalPrices(ticker, period);

    // Format for frontend
    const formattedPrices = prices.map((p) => ({
      date: p.date.toISOString(),
      close: p.close,
    }));

    return NextResponse.json(formattedPrices);
  } catch (error) {
    console.error("Failed to fetch historical prices:", error);
    return NextResponse.json(
      { error: "Failed to fetch historical prices" },
      { status: 500 }
    );
  }
}
