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

// Calculate period start date
function getPeriodStartDate(period: ChartPeriod): Date {
  const now = new Date();
  switch (period) {
    case "1D":
      return new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    case "1W":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "1M":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "3M":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "YTD":
      return new Date(now.getFullYear(), 0, 1);
    case "1Y":
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case "5Y":
      return new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") || "1M") as ChartPeriod;
    const periodStartDate = getPeriodStartDate(period);

    // Get all holdings with quantities and currency
    const holdings = await prisma.holding.findMany({
      select: {
        ticker: true,
        quantity: true,
        currency: true,
      },
    });

    if (holdings.length === 0) {
      return NextResponse.json([]);
    }

    // Get all transactions to calculate historical net deposits
    const transactions = await prisma.transaction.findMany({
      where: {
        type: { in: ["BUY", "SELL"] },
      },
      select: {
        tradeDate: true,
        type: true,
        quantity: true,
        price: true,
        account: {
          select: { currency: true },
        },
      },
      orderBy: { tradeDate: "asc" },
    });

    // Build cumulative net deposits over time
    // netDeposits[date] = cumulative amount invested up to that date
    const netDepositsHistory: { date: Date; amount: Decimal }[] = [];
    let cumulativeDeposit = new Decimal(0);

    for (const tx of transactions) {
      const txAmount = new Decimal(tx.quantity.toString()).mul(
        new Decimal(tx.price.toString())
      );
      // Convert USD to CAD
      let amount = txAmount;
      if (tx.account.currency === "USD") {
        amount = amount.mul(USD_TO_CAD);
      }

      if (tx.type === "BUY") {
        cumulativeDeposit = cumulativeDeposit.add(amount);
      } else if (tx.type === "SELL") {
        cumulativeDeposit = cumulativeDeposit.sub(amount);
      }

      netDepositsHistory.push({
        date: tx.tradeDate,
        amount: cumulativeDeposit,
      });
    }

    // Current total net deposits (for dates after last transaction)
    const currentNetDeposits = cumulativeDeposit;

    // Get unique tickers
    const tickers = [...new Set(holdings.map((h) => h.ticker))];

    // Fetch historical prices for all tickers
    const historicalData = await getMultipleHistoricalPrices(tickers, period);

    if (historicalData.size === 0) {
      return NextResponse.json([]);
    }

    // Create a map of ticker -> quantity and currency (aggregated across accounts)
    const tickerData = new Map<string, { quantity: Decimal; currency: string }>();
    for (const holding of holdings) {
      const existing = tickerData.get(holding.ticker);
      const qty = new Decimal(holding.quantity.toString());
      if (existing) {
        existing.quantity = existing.quantity.add(qty);
      } else {
        tickerData.set(holding.ticker, {
          quantity: qty,
          currency: holding.currency,
        });
      }
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

    // Helper to get net deposits for a specific date
    const getNetDepositsForDate = (targetDate: Date): Decimal => {
      // Find the last transaction before or on this date
      let result = new Decimal(0);
      for (const entry of netDepositsHistory) {
        if (entry.date <= targetDate) {
          result = entry.amount;
        } else {
          break;
        }
      }
      return result;
    };

    // Calculate portfolio value for each date
    const chartData: PortfolioChartPoint[] = [];
    const sortedDates = Array.from(allDatesMap.keys()).sort();

    // Keep track of last known prices for tickers that might not have data for every date
    const lastKnownPrices = new Map<string, number>();

    for (const dateKey of sortedDates) {
      const pricesForDate = allDatesMap.get(dateKey)!;
      const currentDate = new Date(dateKey);

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

      // Get net deposits for this date
      const netDepositsForDate = netDepositsHistory.length > 0
        ? getNetDepositsForDate(currentDate)
        : currentNetDeposits;

      // Only include data points where we have prices for most tickers
      if (hasAllTickers || lastKnownPrices.size >= tickerData.size * 0.5) {
        chartData.push({
          date: dateKey,
          totalValue: totalValue.toNumber(),
          totalCost: netDepositsForDate.toNumber(),
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
