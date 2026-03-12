import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { TransactionAction } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    const [dividendTransactions, allTransactions, accounts, portfolioSettings, priceCache] = await Promise.all([
      prisma.transaction.findMany({
        where: { account: { userId: user.id }, action: TransactionAction.DIVIDEND, settlementDate: { gte: twelveMonthsAgo } },
        orderBy: { settlementDate: "asc" },
      }),
      prisma.transaction.findMany({
        where: { account: { userId: user.id }, normalizedSymbol: { not: null }, action: { in: [TransactionAction.BUY, TransactionAction.SELL, TransactionAction.REINVEST] } },
      }),
      prisma.account.findMany({ where: { userId: user.id, isActive: true } }),
      prisma.portfolioSettings.findFirst({ where: { userId: user.id } }),
      prisma.priceCache.findMany(),
    ]);

    const monthlyMap = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyMap.set(d.toISOString().slice(0, 7), 0);
    }
    for (const tx of dividendTransactions) {
      const key = new Date(tx.settlementDate).toISOString().slice(0, 7);
      if (monthlyMap.has(key)) monthlyMap.set(key, (monthlyMap.get(key) || 0) + Math.abs(Number(tx.netAmount || 0)));
    }
    const dividendHistory = Array.from(monthlyMap.entries()).map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }));

    const receivedThisYear = dividendTransactions.filter((tx) => new Date(tx.settlementDate) >= startOfYear).reduce((s, tx) => s + Math.abs(Number(tx.netAmount || 0)), 0);
    const receivedThisMonth = dividendTransactions.filter((tx) => new Date(tx.settlementDate) >= startOfMonth).reduce((s, tx) => s + Math.abs(Number(tx.netAmount || 0)), 0);
    const receivedLast12Months = dividendTransactions.reduce((s, tx) => s + Math.abs(Number(tx.netAmount || 0)), 0);

    const income = {
      receivedThisYear: Math.round(receivedThisYear * 100) / 100,
      receivedThisMonth: Math.round(receivedThisMonth * 100) / 100,
      receivedLast12Months: Math.round(receivedLast12Months * 100) / 100,
      projectedAnnual: Math.round(receivedLast12Months * 100) / 100,
    };

    const priceLookup = new Map<string, number>();
    for (const pc of priceCache) priceLookup.set(pc.symbol, Number(pc.price));
    const holdingsMap = new Map<string, { quantity: number; invested: number }>();
    for (const tx of allTransactions) {
      const sym = tx.normalizedSymbol || tx.symbol;
      if (!sym) continue;
      const h = holdingsMap.get(sym) || { quantity: 0, invested: 0 };
      if (tx.action === TransactionAction.BUY || tx.action === TransactionAction.REINVEST) {
        h.quantity += Number(tx.quantity || 0);
        h.invested += Math.abs(Number(tx.netAmount || tx.grossAmount || 0));
      } else if (tx.action === TransactionAction.SELL) { h.quantity -= Number(tx.quantity || 0); }
      holdingsMap.set(sym, h);
    }

    let totalMarketValue = 0, totalInvested = 0, holdingsCount = 0;
    for (const [sym, h] of holdingsMap.entries()) {
      if (h.quantity <= 0.0001) continue;
      holdingsCount++;
      totalMarketValue += h.quantity * (priceLookup.get(sym) || 0);
      totalInvested += h.invested;
    }
    const totalReturnAmount = totalMarketValue - totalInvested;
    const totalReturn = totalInvested > 0 ? ((totalMarketValue - totalInvested) / totalInvested) * 100 : 0;

    const targetAnnual = portfolioSettings?.targetAnnualDividend ? Number(portfolioSettings.targetAnnualDividend) : null;
    const targetMonthly = portfolioSettings?.targetMonthlyDividend ? Number(portfolioSettings.targetMonthlyDividend) : null;
    const progressPercent = targetAnnual && targetAnnual > 0 ? Math.round((receivedThisYear / targetAnnual) * 10000) / 100 : null;
    const totalTransactions = await prisma.transaction.count({ where: { account: { userId: user.id } } });

    return NextResponse.json({
      dividendHistory,
      income,
      portfolioSummary: { totalMarketValue: Math.round(totalMarketValue * 100) / 100, totalInvested: Math.round(totalInvested * 100) / 100, totalReturn: Math.round(totalReturn * 100) / 100, totalReturnAmount: Math.round(totalReturnAmount * 100) / 100 },
      dividendTarget: { targetAnnual, targetMonthly, receivedThisYear: Math.round(receivedThisYear * 100) / 100, progressPercent },
      holdingsCount,
      accountsCount: accounts.length,
      totalTransactions,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
