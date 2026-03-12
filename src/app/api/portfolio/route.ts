import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { TransactionAction } from "@prisma/client";
import yahooFinance from "yahoo-finance2";

type HoldingMap = Record<string, {
  symbol: string;
  quantity: number;
  netInvested: number;
  transactions: number;
}>;

async function getLatestPrice(symbol: string) {
  const cached = await prisma.priceCache.findUnique({ where: { symbol } });
  const now = new Date();
  if (cached && cached.expiresAt > now) {
    return { price: cached.price, currency: cached.currency };
  }

  const quote = await yahooFinance.quote(symbol) as any;
  const price = Number(quote.regularMarketPrice || 0);
  const quoteCurrency = typeof quote.currency === "string" ? quote.currency : "USD";
  const rawCurrency = quoteCurrency.toUpperCase();
  const currency: "CAD" | "USD" = rawCurrency === "CAD" ? "CAD" : "USD";

  await prisma.priceCache.upsert({
    where: { symbol },
    update: {
      price,
      previousClose: quote.regularMarketPreviousClose ? Number(quote.regularMarketPreviousClose) : null,
      currency,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    },
    create: {
      symbol,
      price,
      previousClose: quote.regularMarketPreviousClose ? Number(quote.regularMarketPreviousClose) : null,
      currency,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    },
  });

  return { price, currency };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    const accountWhere: any = { userId: user.id, isActive: true };
    if (accountId && accountId !== "combined") accountWhere.id = accountId;

    const accounts = await prisma.account.findMany({ where: accountWhere, orderBy: [{ createdAt: "asc" }] });

    const transactions = await prisma.transaction.findMany({
      where: {
        account: { userId: user.id },
        accountId: accountId && accountId !== "combined" ? accountId : undefined,
        normalizedSymbol: { not: null },
      },
      orderBy: [{ settlementDate: "desc" }],
      include: {
        account: {
          select: { id: true, name: true, accountType: true },
        },
      },
    });

    const holdings: HoldingMap = {};
    for (const tx of transactions) {
      const symbol = tx.normalizedSymbol || tx.symbol;
      if (!symbol) continue;
      if (!holdings[symbol]) holdings[symbol] = { symbol, quantity: 0, netInvested: 0, transactions: 0 };
      holdings[symbol].transactions += 1;
      if (tx.action === TransactionAction.BUY || tx.action === TransactionAction.REINVEST) {
        holdings[symbol].quantity += tx.quantity || 0;
        holdings[symbol].netInvested += tx.netAmount || tx.grossAmount || 0;
      } else if (tx.action === TransactionAction.SELL) {
        holdings[symbol].quantity -= tx.quantity || 0;
        holdings[symbol].netInvested -= tx.netAmount || 0;
      }
    }

    const rawHoldings = Object.values(holdings).filter((h) => h.quantity !== 0).sort((a, b) => a.symbol.localeCompare(b.symbol));
    const withPrices = await Promise.all(rawHoldings.map(async (holding) => {
      try {
        const latest = await getLatestPrice(holding.symbol);
        const marketValue = holding.quantity * latest.price;
        return {
          ...holding,
          price: latest.price,
          quoteCurrency: latest.currency,
          marketValue,
        };
      } catch {
        return {
          ...holding,
          price: null,
          quoteCurrency: null,
          marketValue: null,
        };
      }
    }));

    const totalMarketValue = withPrices.reduce((sum, h) => sum + (h.marketValue || 0), 0);
    const holdingList = withPrices.map((h) => ({
      ...h,
      weight: totalMarketValue > 0 && h.marketValue ? (h.marketValue / totalMarketValue) * 100 : 0,
    }));

    return NextResponse.json({
      accounts,
      holdings: holdingList,
      totalMarketValue,
      transactions,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to load portfolio" }, { status: 500 });
  }
}
