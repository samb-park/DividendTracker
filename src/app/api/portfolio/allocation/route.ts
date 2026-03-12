import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { TransactionAction } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    const accountWhere: Record<string, unknown> = { userId: user.id, isActive: true };
    if (accountId && accountId !== "combined") accountWhere.id = accountId;

    const transactions = await prisma.transaction.findMany({
      where: {
        account: accountId && accountId !== "combined"
          ? { id: accountId, userId: user.id }
          : { userId: user.id },
        normalizedSymbol: { not: null },
      },
      orderBy: [{ settlementDate: "desc" }],
    });

    const holdings: Record<string, { symbol: string; quantity: number; netInvested: number }> = {};
    for (const tx of transactions) {
      const symbol = tx.normalizedSymbol || tx.symbol;
      if (!symbol) continue;
      if (!holdings[symbol]) holdings[symbol] = { symbol, quantity: 0, netInvested: 0 };
      if (tx.action === TransactionAction.BUY || tx.action === TransactionAction.REINVEST) {
        holdings[symbol].quantity += tx.quantity || 0;
        holdings[symbol].netInvested += tx.netAmount || tx.grossAmount || 0;
      } else if (tx.action === TransactionAction.SELL) {
        holdings[symbol].quantity -= tx.quantity || 0;
        holdings[symbol].netInvested -= tx.netAmount || 0;
      }
    }

    const activeHoldings = Object.values(holdings).filter((h) => h.quantity > 0);

    const cachedPrices = await prisma.priceCache.findMany({
      where: { symbol: { in: activeHoldings.map((h) => h.symbol) } },
    });
    const priceMap: Record<string, number> = {};
    for (const p of cachedPrices) {
      priceMap[p.symbol] = p.price;
    }

    const withValues = activeHoldings.map((h) => ({
      ...h,
      price: priceMap[h.symbol] || null,
      marketValue: priceMap[h.symbol] ? h.quantity * priceMap[h.symbol] : null,
    }));

    const totalMarketValue = withValues.reduce((sum, h) => sum + (h.marketValue || 0), 0);

    const targets = await prisma.portfolioTarget.findMany({
      where: { userId: user.id, isActive: true },
    });

    const targetMap: Record<string, number> = {};
    for (const t of targets) {
      targetMap[t.symbol] = t.targetWeight;
    }

    const allSymbols = new Set([
      ...withValues.map((h) => h.symbol),
      ...targets.map((t) => t.symbol),
    ]);

    const allocation = Array.from(allSymbols)
      .map((symbol) => {
        const holding = withValues.find((h) => h.symbol === symbol);
        const currentWeight = totalMarketValue > 0 && holding?.marketValue
          ? (holding.marketValue / totalMarketValue) * 100
          : 0;
        const targetWeight = targetMap[symbol] || 0;
        const gap = targetWeight - currentWeight;
        const gapAmount = totalMarketValue > 0 ? (gap / 100) * totalMarketValue : 0;

        return {
          symbol,
          currentWeight: Math.round(currentWeight * 100) / 100,
          targetWeight,
          gap: Math.round(gap * 100) / 100,
          gapAmount: Math.round(gapAmount * 100) / 100,
          marketValue: holding?.marketValue || 0,
          quantity: holding?.quantity || 0,
        };
      })
      .sort((a, b) => b.gap - a.gap);

    return NextResponse.json({
      allocation,
      totalMarketValue,
      totalTargetWeight: targets.reduce((sum, t) => sum + t.targetWeight, 0),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to load allocation" }, { status: 500 });
  }
}
