import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getMultipleHistoricalPrices,
  type ChartPeriod,
} from "@/lib/api/yahoo-finance";
import Decimal from "decimal.js";

export interface PortfolioChartPoint {
  date: string;
  totalValue: number;
  totalCost: number;
}

// Exchange rate for USD to CAD conversion
const USD_TO_CAD = 1.35;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") || "1M") as ChartPeriod;

    // Get all holdings with quantities and average cost
    const holdings = await prisma.holding.findMany({
      select: {
        ticker: true,
        quantity: true,
        avgCost: true,
        currency: true,
      },
    });

    if (holdings.length === 0) {
      return NextResponse.json([]);
    }

    // Get unique tickers
    const tickers = [...new Set(holdings.map((h) => h.ticker))];

    // Fetch historical prices for all tickers
    const historicalData = await getMultipleHistoricalPrices(tickers, period);

    if (historicalData.size === 0) {
      return NextResponse.json([]);
    }

    // Create a map of ticker -> quantity and cost (aggregated across accounts)
    const tickerData = new Map<string, { quantity: Decimal; totalCost: Decimal; currency: string }>();
    for (const holding of holdings) {
      const existing = tickerData.get(holding.ticker);
      const qty = new Decimal(holding.quantity.toString());
      const cost = qty.mul(new Decimal(holding.avgCost.toString()));
      if (existing) {
        existing.quantity = existing.quantity.add(qty);
        existing.totalCost = existing.totalCost.add(cost);
      } else {
        tickerData.set(holding.ticker, {
          quantity: qty,
          totalCost: cost,
          currency: holding.currency,
        });
      }
    }

    // Calculate total cost basis (constant line)
    let totalCostBasis = new Decimal(0);
    for (const [, data] of tickerData) {
      let cost = data.totalCost;
      // Convert USD to CAD
      if (data.currency === "USD") {
        cost = cost.mul(USD_TO_CAD);
      }
      totalCostBasis = totalCostBasis.add(cost);
    }

    // Group all dates from all tickers
    const allDatesMap = new Map<string, Map<string, number>>();

    for (const [ticker, prices] of historicalData) {
      for (const price of prices) {
        const dateKey = price.date.toISOString();
        if (!allDatesMap.has(dateKey)) {
          allDatesMap.set(dateKey, new Map());
        }
        allDatesMap.get(dateKey)!.set(ticker, price.close);
      }
    }

    // Calculate portfolio value for each date
    const chartData: PortfolioChartPoint[] = [];
    const sortedDates = Array.from(allDatesMap.keys()).sort();

    // Keep track of last known prices for tickers that might not have data for every date
    const lastKnownPrices = new Map<string, number>();

    for (const dateKey of sortedDates) {
      const pricesForDate = allDatesMap.get(dateKey)!;

      // Update last known prices
      for (const [ticker, price] of pricesForDate) {
        lastKnownPrices.set(ticker, price);
      }

      // Calculate total portfolio value
      let totalValue = new Decimal(0);
      let hasAllTickers = true;

      for (const [ticker, data] of tickerData) {
        const price = pricesForDate.get(ticker) ?? lastKnownPrices.get(ticker);
        if (price !== undefined) {
          let value = data.quantity.mul(price);
          // Convert USD to CAD
          if (data.currency === "USD") {
            value = value.mul(USD_TO_CAD);
          }
          totalValue = totalValue.add(value);
        } else {
          hasAllTickers = false;
        }
      }

      // Only include data points where we have prices for most tickers
      if (hasAllTickers || lastKnownPrices.size >= tickerData.size * 0.5) {
        chartData.push({
          date: dateKey,
          totalValue: totalValue.toNumber(),
          totalCost: totalCostBasis.toNumber(),
        });
      }
    }

    return NextResponse.json(chartData);
  } catch (error) {
    console.error("Failed to fetch portfolio chart data:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio chart data" },
      { status: 500 }
    );
  }
}
