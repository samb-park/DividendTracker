import { prisma } from "@/lib/db";

export interface CashBalance {
  currency: string;
  balance: number;
  accountId?: string;
}

/**
 * 계좌별 현금 잔액 계산
 * 모든 트랜잭션의 netAmount 합계
 */
export async function calculateCashBalances(
  accountId?: string | null,
  asOfDate?: Date
): Promise<CashBalance[]> {
  const where: {
    settlementDate?: { lte: Date };
    accountId?: string;
  } = {};

  if (accountId) {
    where.accountId = accountId;
  }

  if (asOfDate) {
    where.settlementDate = { lte: asOfDate };
  }

  // 통화별로 그룹핑하여 합계
  const results = await prisma.transaction.groupBy({
    by: ["currency", "accountId"],
    where,
    _sum: {
      netAmount: true,
    },
  });

  return results.map((r) => ({
    currency: r.currency,
    balance: r._sum.netAmount || 0,
    accountId: r.accountId,
  }));
}

/**
 * 통화별 총 현금 잔액 (전체 계좌)
 */
export async function calculateTotalCashByCurrency(asOfDate?: Date): Promise<Record<string, number>> {
  const balances = await calculateCashBalances(null, asOfDate);

  const totals: Record<string, number> = { CAD: 0, USD: 0 };

  for (const b of balances) {
    totals[b.currency] = (totals[b.currency] || 0) + b.balance;
  }

  return totals;
}
