import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth-helper";
import {
  createTransactionSchema,
  transactionFilterSchema,
} from "@/lib/validations/transaction";
import { syncHoldingsForAccount } from "@/lib/calculations/holdings";

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filters = transactionFilterSchema.parse({
      accountId: searchParams.get("accountId") || undefined,
      ticker: searchParams.get("ticker") || undefined,
      type: searchParams.get("type") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      limit: searchParams.get("limit") || 50,
      offset: searchParams.get("offset") || 0,
    });

    const where: Record<string, unknown> = {
      account: { userId },
    };
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.ticker) where.ticker = filters.ticker.toUpperCase();
    if (filters.type) where.type = filters.type;
    if (filters.from || filters.to) {
      where.tradeDate = {
        ...(filters.from && { gte: filters.from }),
        ...(filters.to && { lte: filters.to }),
      };
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { tradeDate: "desc" },
        take: filters.limit,
        skip: filters.offset,
        include: { account: { select: { name: true, broker: true, currency: true } } },
      }),
      prisma.transaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions,
      total,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = createTransactionSchema.parse(body);

    // Verify the account belongs to the user
    const account = await prisma.account.findFirst({
      where: { id: validated.accountId, userId },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const transaction = await prisma.transaction.create({
      data: {
        ...validated,
        tradeDate: new Date(validated.tradeDate),
      },
    });

    // Recalculate holdings for the affected account
    await syncHoldingsForAccount(validated.accountId);

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
