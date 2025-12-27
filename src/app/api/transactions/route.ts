import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createTransactionSchema,
  transactionFilterSchema,
} from "@/lib/validations/transaction";
import { syncHoldingsForAccount } from "@/lib/calculations/holdings";

export async function GET(request: NextRequest) {
  try {
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

    const where: Record<string, unknown> = {};
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
    const body = await request.json();
    const validated = createTransactionSchema.parse(body);

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
