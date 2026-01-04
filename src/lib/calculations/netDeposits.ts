import { prisma } from "@/lib/db";

export interface NetDepositsResult {
  totalNetDeposits: number;
  accountId?: string;
}

/**
 * 순입금액 계산
 * - CON: 입금 (현금 입금 + 현물 이전)
 * - WDR: 출금 (현금 출금 + 현물 이전)
 */
export async function calculateNetDeposits(
  accountId?: string | null,
  asOfDate?: Date
): Promise<NetDepositsResult> {
  const baseWhere: {
    settlementDate?: { lte: Date };
    accountId?: string;
  } = {};

  if (accountId) {
    baseWhere.accountId = accountId;
  }

  if (asOfDate) {
    baseWhere.settlementDate = { lte: asOfDate };
  }

  // CON (입금) 거래 가져오기
  const conTransactions = await prisma.transaction.findMany({
    where: { ...baseWhere, action: "CON" },
    select: { netAmount: true, cadEquivalent: true },
  });

  // WDR (출금) 거래 가져오기
  const wdrTransactions = await prisma.transaction.findMany({
    where: { ...baseWhere, action: "WDR" },
    select: { netAmount: true, cadEquivalent: true },
  });

  // 합계 계산
  let totalNetDeposits = 0;

  // CON: 입금 추가
  for (const tx of conTransactions) {
    if (tx.cadEquivalent) {
      totalNetDeposits += tx.cadEquivalent;
    } else if (tx.netAmount) {
      totalNetDeposits += tx.netAmount;
    }
  }

  // WDR: 출금 빼기
  for (const tx of wdrTransactions) {
    if (tx.cadEquivalent) {
      totalNetDeposits -= tx.cadEquivalent;
    } else if (tx.netAmount) {
      totalNetDeposits -= Math.abs(tx.netAmount);
    }
  }

  return {
    totalNetDeposits,
    accountId: accountId || undefined,
  };
}
