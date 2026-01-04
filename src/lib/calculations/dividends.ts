import { prisma } from "@/lib/db";

export interface DividendSummary {
  month: string; // YYYY-MM
  totalAmount: number;
  currency: string;
}

export interface DividendBySymbol {
  symbol: string;
  totalAmount: number;
  currency: string;
  count: number;
}

/**
 * 월별 배당 합계 계산
 * @param months 최근 몇 개월 (기본 12개월)
 * @param accountId 계좌 ID (null이면 전체)
 * @param symbol 특정 심볼 필터 (null이면 전체)
 */
export async function calculateMonthlyDividends(
  months: number = 12,
  accountId?: string | null,
  symbol?: string | null
): Promise<DividendSummary[]> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);

  const where: {
    action: string;
    settlementDate: { gte: Date };
    netAmount: { not: null };
    accountId?: string;
    symbolMapped?: string;
    symbol?: string;
  } = {
    action: "DIV",
    settlementDate: { gte: startDate },
    netAmount: { not: null },
  };

  if (accountId) {
    where.accountId = accountId;
  }

  if (symbol) {
    where.symbolMapped = symbol;
  }

  const dividends = await prisma.transaction.findMany({
    where,
    select: {
      settlementDate: true,
      netAmount: true,
      currency: true,
    },
    orderBy: { settlementDate: "asc" },
  });

  // 월별로 그룹핑
  const monthlyMap = new Map<string, { CAD: number; USD: number }>();

  for (const div of dividends) {
    const month = div.settlementDate.toISOString().substring(0, 7); // YYYY-MM
    const existing = monthlyMap.get(month) || { CAD: 0, USD: 0 };
    existing[div.currency as "CAD" | "USD"] += div.netAmount || 0;
    monthlyMap.set(month, existing);
  }

  // 배열로 변환 (USD + CAD 합산하여 CAD 기준으로 반환)
  const results: DividendSummary[] = [];
  for (const [month, amounts] of monthlyMap) {
    // USD 배당은 별도로 표시하거나 합산 가능
    if (amounts.CAD > 0) {
      results.push({ month, totalAmount: amounts.CAD, currency: "CAD" });
    }
    if (amounts.USD > 0) {
      results.push({ month, totalAmount: amounts.USD, currency: "USD" });
    }
  }

  return results.sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * 심볼별 배당 합계
 */
export async function calculateDividendsBySymbol(
  months: number = 12,
  accountId?: string | null
): Promise<DividendBySymbol[]> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const where: {
    action: string;
    settlementDate: { gte: Date };
    netAmount: { not: null };
    accountId?: string;
  } = {
    action: "DIV",
    settlementDate: { gte: startDate },
    netAmount: { not: null },
  };

  if (accountId) {
    where.accountId = accountId;
  }

  const results = await prisma.transaction.groupBy({
    by: ["symbolMapped", "currency"],
    where,
    _sum: { netAmount: true },
    _count: { id: true },
  });

  return results
    .filter((r) => r.symbolMapped)
    .map((r) => ({
      symbol: r.symbolMapped!,
      totalAmount: r._sum.netAmount || 0,
      currency: r.currency,
      count: r._count.id,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

/**
 * 배당금이 있는 심볼 목록 가져오기
 */
export async function getDividendSymbols(accountId?: string | null): Promise<string[]> {
  const where: {
    action: string;
    symbolMapped: { not: null };
    accountId?: string;
  } = {
    action: "DIV",
    symbolMapped: { not: null },
  };

  if (accountId) {
    where.accountId = accountId;
  }

  const results = await prisma.transaction.findMany({
    where,
    select: { symbolMapped: true },
    distinct: ["symbolMapped"],
  });

  return results.map((r) => r.symbolMapped!).filter(Boolean).sort();
}
