import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth-helper";
import { getPricesForTickers } from "@/lib/api/price-cache";
import Decimal from "decimal.js";

// GET: Retrieve portfolio snapshots for chart
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "1M";

    // Calculate start date based on period
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "1D":
        startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
        break;
      case "1W":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "1M":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "3M":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "YTD":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case "1Y":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case "5Y":
        startDate = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
        },
      },
      orderBy: { date: "asc" },
    });

    const formattedSnapshots = snapshots.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      totalValue: s.totalValue.toString(),
      totalCost: s.totalCost.toString(),
      currency: s.currency,
    }));

    return NextResponse.json(formattedSnapshots);
  } catch (error) {
    console.error("Failed to fetch portfolio snapshots:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio snapshots" },
      { status: 500 }
    );
  }
}

// POST: Save current portfolio value as a snapshot
export async function POST() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all holdings for the user
    const holdings = await prisma.holding.findMany({
      where: {
        account: { userId },
      },
    });

    if (holdings.length === 0) {
      return NextResponse.json(
        { error: "No holdings to snapshot" },
        { status: 400 }
      );
    }

    // Get prices for all tickers
    const uniqueTickers = [...new Set(holdings.map((h) => h.ticker))];
    const prices = await getPricesForTickers(uniqueTickers);

    // Calculate total value and cost (in CAD)
    // Using a simple exchange rate for USD -> CAD conversion
    const USD_TO_CAD = 1.35;
    let totalValue = new Decimal(0);
    let totalCost = new Decimal(0);

    for (const holding of holdings) {
      const qty = new Decimal(holding.quantity.toString());
      const avgCost = new Decimal(holding.avgCost.toString());
      const priceData = prices.get(holding.ticker);

      const cost = qty.mul(avgCost);
      const value = priceData ? qty.mul(priceData.price) : cost;

      // Convert to CAD if USD
      const multiplier = holding.currency === "USD" ? USD_TO_CAD : 1;
      totalCost = totalCost.add(cost.mul(multiplier));
      totalValue = totalValue.add(value.mul(multiplier));
    }

    // Create or update today's snapshot (upsert)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snapshot = await prisma.portfolioSnapshot.upsert({
      where: { userId_date: { userId, date: today } },
      update: {
        totalValue: totalValue.toDecimalPlaces(2),
        totalCost: totalCost.toDecimalPlaces(2),
      },
      create: {
        userId,
        date: today,
        totalValue: totalValue.toDecimalPlaces(2),
        totalCost: totalCost.toDecimalPlaces(2),
        currency: "CAD",
      },
    });

    return NextResponse.json({
      id: snapshot.id,
      date: snapshot.date.toISOString(),
      totalValue: snapshot.totalValue.toString(),
      totalCost: snapshot.totalCost.toString(),
      currency: snapshot.currency,
    });
  } catch (error) {
    console.error("Failed to create portfolio snapshot:", error);
    return NextResponse.json(
      { error: "Failed to create portfolio snapshot" },
      { status: 500 }
    );
  }
}
