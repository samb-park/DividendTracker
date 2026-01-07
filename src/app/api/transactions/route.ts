import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// 트랜잭션 목록 조회 (페이지네이션 + 필터)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type");
    const accountId = searchParams.get("accountId");

    // Server-side dividend aggregation (10K 레코드 대신 집계된 결과만 반환)
    if (type === "dividendSummary") {
      const results = await prisma.transaction.groupBy({
        by: ["symbolMapped"],
        where: {
          action: "DIV",
          netAmount: { gt: 0 },
          symbolMapped: { not: null },
          ...(accountId ? { accountId } : {}),
        },
        _sum: { cadEquivalent: true, netAmount: true },
        _count: { id: true },
      });

      const dividends = results
        .filter((r) => r.symbolMapped)
        .map((r) => ({
          symbol: r.symbolMapped!,
          totalAmount: r._sum.cadEquivalent || r._sum.netAmount || 0,
          currency: "CAD",
          paymentCount: r._count.id,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      const totalReceived = dividends.reduce((sum, d) => sum + d.totalAmount, 0);

      return NextResponse.json({
        dividends: dividends.slice(0, 5), // Top 5
        totalReceived,
      });
    }

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const year = searchParams.get("year");
    const action = searchParams.get("action");
    const symbol = searchParams.get("symbol");
    const search = searchParams.get("search");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // 필터 조건 구성
    const where: Record<string, unknown> = {};

    if (accountId) {
      where.accountId = accountId;
    }

    if (year) {
      const yearNum = parseInt(year);
      where.settlementDate = {
        gte: new Date(`${yearNum}-01-01`),
        lt: new Date(`${yearNum + 1}-01-01`),
      };
    }

    if (action) {
      where.action = action;
    }

    if (symbol) {
      where.OR = [{ symbol }, { symbolMapped: symbol }];
    }

    if (search) {
      where.description = { contains: search };
    }

    if (!year && (startDate || endDate)) {
      where.settlementDate = {};
      if (startDate) {
        (where.settlementDate as Record<string, Date>).gte = new Date(startDate);
      }
      if (endDate) {
        (where.settlementDate as Record<string, Date>).lte = new Date(endDate);
      }
    }

    // 총 개수
    const total = await prisma.transaction.count({ where });

    // 트랜잭션 조회
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { settlementDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        account: {
          select: {
            accountNumber: true,
            accountType: true,
            nickname: true,
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

// 트랜잭션 통계 (필터용)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type } = body;

    if (type === "actions") {
      // 고유 액션 목록
      const actions = await prisma.transaction.findMany({
        select: { action: true },
        distinct: ["action"],
      });
      return NextResponse.json(actions.map((a) => a.action));
    }

    if (type === "symbols") {
      // 고유 심볼 목록
      const symbols = await prisma.transaction.findMany({
        select: { symbolMapped: true },
        distinct: ["symbolMapped"],
        where: { symbolMapped: { not: null } },
      });
      return NextResponse.json(
        symbols.map((s) => s.symbolMapped).filter(Boolean)
      );
    }

    if (type === "years") {
      // 고유 연도 목록
      const transactions = await prisma.transaction.findMany({
        select: { settlementDate: true },
        orderBy: { settlementDate: "desc" },
      });
      const yearsSet = new Set<number>();
      for (const tx of transactions) {
        if (tx.settlementDate) {
          yearsSet.add(new Date(tx.settlementDate).getFullYear());
        }
      }
      return NextResponse.json(Array.from(yearsSet).sort((a, b) => b - a));
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
