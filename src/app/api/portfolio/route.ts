import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { TransactionAction } from "@prisma/client";

type HoldingMap = Record<string, {
  symbol: string;
  quantity: number;
  netInvested: number;
  transactions: number;
}>;

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    const accountWhere: any = { userId: user.id, isActive: true };
    if (accountId && accountId !== "combined") {
      accountWhere.id = accountId;
    }

    const accounts = await prisma.account.findMany({
      where: accountWhere,
      orderBy: [{ createdAt: "asc" }],
    });

    const transactions = await prisma.transaction.findMany({
      where: {
        account: { userId: user.id },
        accountId: accountId && accountId !== "combined" ? accountId : undefined,
        normalizedSymbol: { not: null },
      },
      orderBy: [{ settlementDate: "desc" }],
      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountType: true,
          },
        },
      },
    });

    const holdings: HoldingMap = {};

    for (const tx of transactions) {
      const symbol = tx.normalizedSymbol || tx.symbol;
      if (!symbol) continue;

      if (!holdings[symbol]) {
        holdings[symbol] = {
          symbol,
          quantity: 0,
          netInvested: 0,
          transactions: 0,
        };
      }

      holdings[symbol].transactions += 1;

      if (tx.action === TransactionAction.BUY || tx.action === TransactionAction.REINVEST) {
        holdings[symbol].quantity += tx.quantity || 0;
        holdings[symbol].netInvested += tx.netAmount || tx.grossAmount || 0;
      } else if (tx.action === TransactionAction.SELL) {
        holdings[symbol].quantity -= tx.quantity || 0;
        holdings[symbol].netInvested -= tx.netAmount || 0;
      }
    }

    const holdingList = Object.values(holdings)
      .filter((h) => h.quantity !== 0)
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    return NextResponse.json({
      accounts,
      holdings: holdingList,
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
