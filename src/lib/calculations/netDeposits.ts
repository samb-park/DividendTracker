import { prisma } from '@/lib/db';

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

  // CON (입금) & TFI (이체 입금)
  const depositTransactions = await prisma.transaction.findMany({
    where: { ...baseWhere, action: { in: ['CON', 'TFI'] } },
    select: { netAmount: true, cadEquivalent: true },
  });

  // WDR (출금) & TFO (이체 출금)
  const withdrawalTransactions = await prisma.transaction.findMany({
    where: { ...baseWhere, action: { in: ['WDR', 'TFO'] } },
    select: { netAmount: true, cadEquivalent: true },
  });

  // 합계 계산
  let totalNetDeposits = 0;

  // 입금 추가
  for (const tx of depositTransactions) {
    if (tx.cadEquivalent) {
      totalNetDeposits += tx.cadEquivalent;
    } else if (tx.netAmount) {
      totalNetDeposits += tx.netAmount;
    }
  }

  // 출금 빼기
  for (const tx of withdrawalTransactions) {
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
