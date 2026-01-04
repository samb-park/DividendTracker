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
 * Calculate monthly dividend totals
 * @param year Year filter (null for all years)
 * @param accountId Account ID (null for all)
 * @param symbol Symbol filter (null for all)
 */
export async function calculateMonthlyDividends(
  year?: number | null,
  accountId?: string | null,
  symbol?: string | null
): Promise<DividendSummary[]> {
  const where: {
    action: string;
    settlementDate?: { gte?: Date; lte?: Date };
    netAmount: { not: null };
    accountId?: string;
    symbolMapped?: string;
  } = {
    action: "DIV",
    netAmount: { not: null },
  };

  if (year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    where.settlementDate = { gte: startDate, lte: endDate };
  }

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

  // Group by month
  const monthlyMap = new Map<string, { CAD: number; USD: number }>();

  for (const div of dividends) {
    const month = div.settlementDate.toISOString().substring(0, 7); // YYYY-MM
    const existing = monthlyMap.get(month) || { CAD: 0, USD: 0 };
    existing[div.currency as "CAD" | "USD"] += div.netAmount || 0;
    monthlyMap.set(month, existing);
  }

  // Convert to array
  const results: DividendSummary[] = [];
  for (const [month, amounts] of monthlyMap) {
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
 * Calculate dividend totals by symbol
 */
export async function calculateDividendsBySymbol(
  year?: number | null,
  accountId?: string | null
): Promise<DividendBySymbol[]> {
  const where: {
    action: string;
    settlementDate?: { gte?: Date; lte?: Date };
    netAmount: { not: null };
    accountId?: string;
  } = {
    action: "DIV",
    netAmount: { not: null },
  };

  if (year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    where.settlementDate = { gte: startDate, lte: endDate };
  }

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
 * Get list of symbols with dividends
 */
export async function getDividendSymbols(
  accountId?: string | null,
  year?: number | null
): Promise<string[]> {
  const where: {
    action: string;
    symbolMapped: { not: null };
    accountId?: string;
    settlementDate?: { gte?: Date; lte?: Date };
  } = {
    action: "DIV",
    symbolMapped: { not: null },
  };

  if (accountId) {
    where.accountId = accountId;
  }

  if (year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    where.settlementDate = { gte: startDate, lte: endDate };
  }

  const results = await prisma.transaction.findMany({
    where,
    select: { symbolMapped: true },
    distinct: ["symbolMapped"],
  });

  return results.map((r) => r.symbolMapped!).filter(Boolean).sort();
}

/**
 * Get list of years with dividend data
 */
export async function getDividendYears(accountId?: string | null): Promise<number[]> {
  const where: {
    action: string;
    accountId?: string;
  } = {
    action: "DIV",
  };

  if (accountId) {
    where.accountId = accountId;
  }

  const results = await prisma.transaction.findMany({
    where,
    select: { settlementDate: true },
    orderBy: { settlementDate: "asc" },
  });

  const years = new Set<number>();
  for (const r of results) {
    years.add(r.settlementDate.getFullYear());
  }

  return Array.from(years).sort((a, b) => b - a); // Descending order
}
