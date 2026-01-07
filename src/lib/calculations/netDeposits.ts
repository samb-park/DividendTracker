import { prisma } from '@/lib/db';

export interface NetDepositsResult {
  totalNetDeposits: number;
  accountId?: string;
}

/**
 * 순입금액 계산 (최적화: 단일 groupBy 쿼리 사용)
 * - CON: 입금 (현금 입금 + 현물 이전)
 * - TFI: 이체 입금
 * - WDR: 출금 (현금 출금 + 현물 이전)
 * - TFO: 이체 출금
 */
export async function calculateNetDeposits(
  accountId?: string | null,
  asOfDate?: Date
): Promise<NetDepositsResult> {
  const baseWhere: {
    action: { in: string[] };
    settlementDate?: { lte: Date };
    accountId?: string;
  } = {
    action: { in: ['CON', 'TFI', 'WDR', 'TFO'] },
  };

  if (accountId) {
    baseWhere.accountId = accountId;
  }

  if (asOfDate) {
    baseWhere.settlementDate = { lte: asOfDate };
  }

  // 단일 쿼리로 모든 입출금 집계 (N+1 문제 해결)
  const results = await prisma.transaction.groupBy({
    by: ['action'],
    where: baseWhere,
    _sum: {
      cadEquivalent: true,
      netAmount: true,
    },
  });

  // 합계 계산
  let totalNetDeposits = 0;

  for (const r of results) {
    const amount = r._sum.cadEquivalent || r._sum.netAmount || 0;
    if (['CON', 'TFI'].includes(r.action)) {
      totalNetDeposits += amount;
    } else {
      // WDR, TFO - 출금
      totalNetDeposits -= Math.abs(amount);
    }
  }

  return {
    totalNetDeposits,
    accountId: accountId || undefined,
  };
}
