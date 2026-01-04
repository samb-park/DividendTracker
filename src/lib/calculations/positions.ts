import { prisma } from "@/lib/db";

export interface Position {
  symbol: string;
  symbolMapped: string;
  quantity: number;
  avgCost: number;
  totalCost: number;
  currency: string;
  accountId: string;
}

// 수량에 영향을 주는 액션들
const QUANTITY_ACTIONS = ["Buy", "Sell", "REI", "CON", "WDR", "DIS"];

/**
 * 특정 계좌의 포지션 계산
 * @param accountId 계좌 ID (null이면 전체)
 * @param asOfDate 기준일 (기본: 현재)
 */
export async function calculatePositions(
  accountId?: string | null,
  asOfDate?: Date
): Promise<Position[]> {
  const where: {
    action: { in: string[] };
    quantity: { not: null };
    settlementDate?: { lte: Date };
    accountId?: string;
  } = {
    action: { in: QUANTITY_ACTIONS },
    quantity: { not: null },
  };

  if (accountId) {
    where.accountId = accountId;
  }

  if (asOfDate) {
    where.settlementDate = { lte: asOfDate };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { settlementDate: "asc" },
  });

  // 계좌+심볼별 포지션 계산
  const positionMap = new Map<
    string,
    {
      symbol: string;
      symbolMapped: string;
      quantity: number;
      totalCost: number;
      currency: string;
      accountId: string;
    }
  >();

  for (const tx of transactions) {
    const key = `${tx.accountId}:${tx.symbolMapped || tx.symbol}`;
    const existing = positionMap.get(key) || {
      symbol: tx.symbol || "",
      symbolMapped: tx.symbolMapped || tx.symbol || "",
      quantity: 0,
      totalCost: 0,
      currency: tx.currency,
      accountId: tx.accountId,
    };

    const qty = tx.quantity || 0;
    const price = tx.price || 0;
    const commission = tx.commission || 0;

    switch (tx.action) {
      case "Buy":
        // 매수: 수량 증가, 비용 증가
        existing.quantity += qty;
        existing.totalCost += Math.abs(qty * price) + Math.abs(commission);
        break;

      case "REI":
        // 배당 재투자: 수량 증가, netAmount를 비용으로 사용 (price가 0인 경우가 많음)
        existing.quantity += qty;
        if (price > 0) {
          existing.totalCost += Math.abs(qty * price);
        } else if (tx.netAmount) {
          // netAmount가 음수(지출)이면 그 절대값이 비용
          existing.totalCost += Math.abs(tx.netAmount);
        }
        break;

      case "Sell":
        // 매도: 수량 감소, 비용 비례 감소
        if (existing.quantity > 0) {
          const avgCost = existing.totalCost / existing.quantity;
          const soldQty = Math.abs(qty);
          existing.quantity -= soldQty;
          existing.totalCost = existing.quantity * avgCost;
        }
        break;

      case "CON":
        // 현물 이전 입금: 수량 증가, CAD Equivalent를 비용으로
        existing.quantity += qty;
        if (tx.cadEquivalent) {
          existing.totalCost += tx.cadEquivalent;
        }
        break;

      case "WDR":
        // 현물 이전 출금: 수량 감소, 비용 비례 감소
        if (existing.quantity > 0) {
          const avgCost = existing.totalCost / existing.quantity;
          const withdrawnQty = Math.abs(qty);
          existing.quantity -= withdrawnQty;
          existing.totalCost = existing.quantity * avgCost;
        }
        break;

      case "DIS":
        // 주식 분할: 무료 주식 추가 (비용 변동 없음)
        existing.quantity += qty;
        break;
    }

    positionMap.set(key, existing);
  }

  // 포지션 배열로 변환 (0 이상인 것만)
  const positions: Position[] = [];
  for (const data of positionMap.values()) {
    if (data.quantity > 0.0001) {
      positions.push({
        symbol: data.symbol,
        symbolMapped: data.symbolMapped,
        quantity: data.quantity,
        avgCost: data.totalCost / data.quantity,
        totalCost: data.totalCost,
        currency: data.currency,
        accountId: data.accountId,
      });
    }
  }

  return positions;
}

/**
 * 전체 계좌의 포지션을 심볼별로 합산
 */
export async function calculateAggregatedPositions(asOfDate?: Date): Promise<Position[]> {
  const allPositions = await calculatePositions(null, asOfDate);

  // 심볼별로 합산
  const aggregated = new Map<string, Position>();

  for (const pos of allPositions) {
    const key = pos.symbolMapped;
    const existing = aggregated.get(key);

    if (existing) {
      // 같은 통화인 경우만 합산
      if (existing.currency === pos.currency) {
        const totalQty = existing.quantity + pos.quantity;
        const totalCost = existing.totalCost + pos.totalCost;
        existing.quantity = totalQty;
        existing.totalCost = totalCost;
        existing.avgCost = totalCost / totalQty;
      }
    } else {
      aggregated.set(key, { ...pos });
    }
  }

  return Array.from(aggregated.values());
}
