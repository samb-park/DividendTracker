import { prisma } from '@/lib/db';

export interface NetDepositsResult {
  totalNetDeposits: number;
  accountId?: string;
}

// Questrade 입금 액션 타입
const DEPOSIT_ACTIONS = ['CON', 'TFI', 'DEP'];
// Questrade 출금 액션 타입
const WITHDRAWAL_ACTIONS = ['WDR', 'TFO'];
// 모든 입출금 액션
const ALL_DEPOSIT_WITHDRAWAL_ACTIONS = [...DEPOSIT_ACTIONS, ...WITHDRAWAL_ACTIONS];

/**
 * 순입금액 계산 (최적화: 단일 groupBy 쿼리 사용)
 * - CON: 입금 (현금 입금 + 현물 이전)
 * - TFI: 이체 입금 (Transfer In)
 * - DEP: 입금 (Deposit)
 * - WDR: 출금 (현금 출금 + 현물 이전)
 * - TFO: 이체 출금 (Transfer Out)
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
    action: { in: ALL_DEPOSIT_WITHDRAWAL_ACTIONS },
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
  // groupBy는 필드별 합계를 따로 구하므로, cadEquivalent와 netAmount를 합산해야 함
  // - cadEquivalent: 현물 이전 시 CAD 환산 가치
  // - netAmount: 현금 입출금 금액
  // 같은 거래가 두 필드 모두 값을 가지는 경우는 없으므로 합산이 안전함
  let totalNetDeposits = 0;

  for (const r of results) {
    // 두 필드 모두 합산 (null은 0으로 처리)
    const cadEquiv = r._sum.cadEquivalent ?? 0;
    const netAmt = r._sum.netAmount ?? 0;
    const amount = cadEquiv + netAmt;

    if (DEPOSIT_ACTIONS.includes(r.action)) {
      totalNetDeposits += amount;
    } else if (WITHDRAWAL_ACTIONS.includes(r.action)) {
      // WDR, TFO - 출금
      totalNetDeposits -= Math.abs(amount);
    }
  }

  return {
    totalNetDeposits,
    accountId: accountId || undefined,
  };
}
