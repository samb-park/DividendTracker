import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBootstrapUser } from "@/lib/bootstrap-user";
import { TransactionAction, CurrencyCode, TransactionSource } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const user = await ensureBootstrapUser();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const accountId = searchParams.get("accountId");
    const action = searchParams.get("action");
    const symbol = searchParams.get("symbol");
    const year = searchParams.get("year");

    const where: any = {
      account: {
        userId: user.id,
      },
    };

    if (accountId) where.accountId = accountId;
    if (action) where.action = action;
    if (symbol) {
      where.OR = [{ symbol }, { normalizedSymbol: symbol }];
    }
    if (year) {
      const yearNum = parseInt(year);
      where.settlementDate = {
        gte: new Date(`${yearNum}-01-01`),
        lt: new Date(`${yearNum + 1}-01-01`),
      };
    }

    const total = await prisma.transaction.count({ where });
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { settlementDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountNumber: true,
            accountType: true,
            baseCurrency: true,
          },
        },
      },
    });

    return NextResponse.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json({ error: "트랜잭션 조회 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureBootstrapUser();
    const body = await request.json();
    const { type } = body;

    if (type === "create") {
      const {
        accountId,
        transactionDate,
        settlementDate,
        action,
        symbol,
        description,
        quantity,
        price,
        grossAmount,
        commission,
        netAmount,
        currency,
        activityType,
        cadEquivalent,
        fxRateToCad,
        notes,
      } = body;

      if (!accountId || !transactionDate || !settlementDate || !action || !description || !currency) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      const account = await prisma.account.findFirst({
        where: { id: accountId, userId: user.id },
      });

      if (!account) {
        return NextResponse.json({ error: "Invalid account" }, { status: 404 });
      }

      const normalizedSymbol = symbol?.trim()?.toUpperCase() || null;
      const created = await prisma.transaction.create({
        data: {
          accountId,
          source: TransactionSource.manual,
          transactionDate: new Date(transactionDate),
          settlementDate: new Date(settlementDate),
          action: action as TransactionAction,
          activityType: activityType?.trim() || null,
          symbol: normalizedSymbol,
          normalizedSymbol,
          description: description.trim(),
          quantity: quantity ?? null,
          price: price ?? null,
          grossAmount: grossAmount ?? null,
          commission: commission ?? null,
          netAmount: netAmount ?? null,
          currency: currency as CurrencyCode,
          fxRateToCad: fxRateToCad ?? null,
          cadEquivalent: cadEquivalent ?? null,
          notes: notes?.trim() || null,
        },
      });

      return NextResponse.json(created);
    }

    if (type === "actions") {
      const actions = await prisma.transaction.findMany({
        where: { account: { userId: user.id } },
        select: { action: true },
        distinct: ["action"],
      });
      return NextResponse.json(actions.map((a) => a.action));
    }

    if (type === "symbols") {
      const symbols = await prisma.transaction.findMany({
        where: {
          account: { userId: user.id },
          normalizedSymbol: { not: null },
        },
        select: { normalizedSymbol: true },
        distinct: ["normalizedSymbol"],
      });
      return NextResponse.json(symbols.map((s) => s.normalizedSymbol).filter(Boolean));
    }

    if (type === "years") {
      const transactions = await prisma.transaction.findMany({
        where: { account: { userId: user.id } },
        select: { settlementDate: true },
        orderBy: { settlementDate: "desc" },
      });
      const yearsSet = new Set<number>();
      for (const tx of transactions) {
        yearsSet.add(new Date(tx.settlementDate).getFullYear());
      }
      return NextResponse.json(Array.from(yearsSet).sort((a, b) => b - a));
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (error) {
    console.error("Error in transactions API:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
