import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAllCachedPrices } from "@/lib/api/price-cache";
import {
  calculateExpectedAnnualDividend,
  getYtdDividends,
} from "@/lib/calculations/dividends";
import Decimal from "decimal.js";
import type { AccountSummary, DashboardData } from "@/types";

export async function GET() {
  try {
    const [accounts, prices, ytdDividends, expectedDividends] = await Promise.all([
      prisma.account.findMany({
        include: {
          holdings: true,
          _count: { select: { transactions: true } },
        },
      }),
      getAllCachedPrices(),
      getYtdDividends(),
      calculateExpectedAnnualDividend(),
    ]);

    // Calculate per-account summaries
    const accountSummaries: AccountSummary[] = accounts.map((account) => {
      let totalCost = new Decimal(0);
      let totalValue = new Decimal(0);

      for (const holding of account.holdings) {
        const qty = new Decimal(holding.quantity.toString());
        const cost = new Decimal(holding.avgCost.toString());
        const priceData = prices.get(holding.ticker);
        const currentPrice = priceData
          ? new Decimal(priceData.price)
          : cost;

        totalCost = totalCost.add(qty.mul(cost));
        totalValue = totalValue.add(qty.mul(currentPrice));
      }

      const pl = totalValue.sub(totalCost);
      const plPercent = totalCost.gt(0)
        ? pl.div(totalCost).mul(100)
        : new Decimal(0);

      return {
        id: account.id,
        name: account.name,
        broker: account.broker,
        currency: account.currency,
        holdingsCount: account.holdings.length,
        totalCost: totalCost.toFixed(2),
        totalValue: totalValue.toFixed(2),
        profitLoss: pl.toFixed(2),
        profitLossPercent: plPercent.toFixed(2),
      };
    });

    // Portfolio totals (by currency)
    const totals = {
      CAD: { cost: new Decimal(0), value: new Decimal(0) },
      USD: { cost: new Decimal(0), value: new Decimal(0) },
    };

    for (const summary of accountSummaries) {
      const currency = summary.currency as "CAD" | "USD";
      // Only add to totals if currency is CAD or USD
      if (totals[currency]) {
        totals[currency].cost = totals[currency].cost.add(summary.totalCost);
        totals[currency].value = totals[currency].value.add(summary.totalValue);
      }
    }

    const response: DashboardData = {
      accounts: accountSummaries,
      totals: {
        CAD: {
          cost: totals.CAD.cost.toFixed(2),
          value: totals.CAD.value.toFixed(2),
          pl: totals.CAD.value.sub(totals.CAD.cost).toFixed(2),
        },
        USD: {
          cost: totals.USD.cost.toFixed(2),
          value: totals.USD.value.toFixed(2),
          pl: totals.USD.value.sub(totals.USD.cost).toFixed(2),
        },
      },
      ytdDividends: `CAD ${ytdDividends.CAD} / USD ${ytdDividends.USD}`,
      expectedAnnualDividend: `CAD ${expectedDividends.CAD} / USD ${expectedDividends.USD}`,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
