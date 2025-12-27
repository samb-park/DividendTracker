import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPricesForTickers } from "@/lib/api/price-cache";
import Decimal from "decimal.js";
import type { HoldingWithPrice } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const aggregate = searchParams.get("aggregate") === "true";

    const where = accountId ? { accountId } : {};

    const holdings = await prisma.holding.findMany({
      where,
      include: {
        account: { select: { name: true, broker: true } },
      },
      orderBy: [{ ticker: "asc" }],
    });

    // Get unique tickers and fetch prices (from cache or fresh)
    const uniqueTickers = [...new Set(holdings.map((h) => h.ticker))];
    const prices = await getPricesForTickers(uniqueTickers);

    // If aggregate mode, combine same tickers across accounts
    if (aggregate && !accountId) {
      const aggregatedMap = new Map<
        string,
        { quantity: Decimal; totalCost: Decimal; currency: string }
      >();

      for (const holding of holdings) {
        const qty = new Decimal(holding.quantity.toString());
        const avgCost = new Decimal(holding.avgCost.toString());
        const totalCost = qty.mul(avgCost);

        const existing = aggregatedMap.get(holding.ticker);
        if (existing) {
          existing.quantity = existing.quantity.add(qty);
          existing.totalCost = existing.totalCost.add(totalCost);
        } else {
          aggregatedMap.set(holding.ticker, {
            quantity: qty,
            totalCost,
            currency: holding.currency,
          });
        }
      }

      // Calculate total portfolio value for weight calculation
      let totalPortfolioValue = new Decimal(0);
      const holdingsWithValue: Array<{
        ticker: string;
        data: { quantity: Decimal; totalCost: Decimal; currency: string };
        marketValue: Decimal | undefined;
      }> = [];

      for (const [ticker, data] of aggregatedMap) {
        const priceData = prices.get(ticker);
        const marketValue = priceData
          ? data.quantity.mul(priceData.price)
          : undefined;
        if (marketValue) {
          totalPortfolioValue = totalPortfolioValue.add(marketValue);
        }
        holdingsWithValue.push({ ticker, data, marketValue });
      }

      const enrichedHoldings: HoldingWithPrice[] = [];

      for (const { ticker, data, marketValue } of holdingsWithValue) {
        const priceData = prices.get(ticker);
        const avgCost = data.quantity.gt(0)
          ? data.totalCost.div(data.quantity)
          : new Decimal(0);

        let profitLoss: Decimal | undefined;
        let profitLossPercent: Decimal | undefined;
        let weight: Decimal | undefined;

        if (marketValue) {
          profitLoss = marketValue.sub(data.totalCost);
          profitLossPercent = data.totalCost.gt(0)
            ? profitLoss.div(data.totalCost).mul(100)
            : new Decimal(0);
          if (totalPortfolioValue.gt(0)) {
            weight = marketValue.div(totalPortfolioValue).mul(100);
          }
        }

        enrichedHoldings.push({
          id: ticker, // Use ticker as ID for aggregated view
          accountId: "all",
          ticker,
          quantity: data.quantity.toFixed(4),
          avgCost: avgCost.toFixed(2),
          currency: data.currency,
          currentPrice: priceData?.price.toFixed(2),
          marketValue: marketValue?.toFixed(2),
          profitLoss: profitLoss?.toFixed(2),
          profitLossPercent: profitLossPercent?.toFixed(2),
          dividendYield: priceData?.dividendYield?.toFixed(2),
          name: priceData?.name,
          weight: weight?.toFixed(2),
          fiftyTwoWeekHigh: priceData?.fiftyTwoWeekHigh?.toFixed(2),
          fiftyTwoWeekLow: priceData?.fiftyTwoWeekLow?.toFixed(2),
        });
      }

      // Sort by ticker
      enrichedHoldings.sort((a, b) => a.ticker.localeCompare(b.ticker));

      return NextResponse.json(enrichedHoldings);
    }

    // Non-aggregate mode: return individual holdings
    // First calculate total portfolio value
    let totalPortfolioValue = new Decimal(0);
    const holdingsData = holdings.map((holding) => {
      const priceData = prices.get(holding.ticker);
      const qty = new Decimal(holding.quantity.toString());
      const marketValue = priceData ? qty.mul(priceData.price) : undefined;
      if (marketValue) {
        totalPortfolioValue = totalPortfolioValue.add(marketValue);
      }
      return { holding, priceData, qty, marketValue };
    });

    const enrichedHoldings: HoldingWithPrice[] = holdingsData.map(
      ({ holding, priceData, qty, marketValue }) => {
        const avgCost = new Decimal(holding.avgCost.toString());
        const totalCost = qty.mul(avgCost);

        let profitLoss: Decimal | undefined;
        let profitLossPercent: Decimal | undefined;
        let weight: Decimal | undefined;

        if (marketValue) {
          profitLoss = marketValue.sub(totalCost);
          profitLossPercent = totalCost.gt(0)
            ? profitLoss.div(totalCost).mul(100)
            : new Decimal(0);
          if (totalPortfolioValue.gt(0)) {
            weight = marketValue.div(totalPortfolioValue).mul(100);
          }
        }

        return {
          id: holding.id,
          accountId: holding.accountId,
          ticker: holding.ticker,
          quantity: qty.toFixed(4),
          avgCost: avgCost.toFixed(2),
          currency: holding.currency,
          currentPrice: priceData?.price.toFixed(2),
          marketValue: marketValue?.toFixed(2),
          profitLoss: profitLoss?.toFixed(2),
          profitLossPercent: profitLossPercent?.toFixed(2),
          dividendYield: priceData?.dividendYield?.toFixed(2),
          name: priceData?.name,
          weight: weight?.toFixed(2),
          fiftyTwoWeekHigh: priceData?.fiftyTwoWeekHigh?.toFixed(2),
          fiftyTwoWeekLow: priceData?.fiftyTwoWeekLow?.toFixed(2),
        };
      }
    );

    return NextResponse.json(enrichedHoldings);
  } catch (error) {
    console.error("Failed to fetch holdings:", error);
    return NextResponse.json(
      { error: "Failed to fetch holdings" },
      { status: 500 }
    );
  }
}
