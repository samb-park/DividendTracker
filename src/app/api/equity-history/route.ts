import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCachedQuotes, getCachedFxRate } from "@/lib/market/cache";

interface EquityPoint {
  date: string;
  equity: number;
  netDeposits: number;
}

/**
 * Equity 히스토리 계산
 * - 각 날짜별로 해당 시점의 포지션 가치 + 현금을 계산
 * - 현재 시세를 사용 (과거 시세 데이터가 없으므로)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const period = searchParams.get("period") || "inception"; // 15d, 1m, 3m, 6m, 1y, inception

    // 기간 계산
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "15d":
        startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
        break;
      case "1m":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "3m":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "6m":
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case "1y":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        // inception: 첫 거래일부터
        const firstTx = await prisma.transaction.findFirst({
          where: accountId ? { accountId } : {},
          orderBy: { settlementDate: "asc" },
        });
        startDate = firstTx ? new Date(firstTx.settlementDate) : new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    }

    // 거래 데이터 가져오기
    const where = accountId ? { accountId } : {};
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { settlementDate: "asc" },
    });

    if (transactions.length === 0) {
      return NextResponse.json([]);
    }

    // 모든 심볼 추출
    const symbols = [...new Set(
      transactions
        .filter(tx => tx.symbolMapped)
        .map(tx => tx.symbolMapped as string)
    )];

    // 현재 시세 가져오기
    const quotes = await getCachedQuotes(symbols);
    const fxRate = await getCachedFxRate();

    // X축 간격 결정
    const daysDiff = Math.ceil((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    let intervalDays = 1;
    if (period === "6m" || period === "1y" || (period === "inception" && daysDiff > 90)) {
      intervalDays = 7; // 1주
    }

    // 각 날짜별 equity 계산
    const equityHistory: EquityPoint[] = [];
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= now) {
      // 해당 날짜까지의 거래로 포지션과 현금 계산
      const asOfDate = new Date(currentDate);
      asOfDate.setHours(23, 59, 59, 999);

      // 해당 날짜까지의 포지션 계산
      const positions = new Map<string, { qty: number; cost: number; currency: string }>();
      let cashCad = 0;
      let cashUsd = 0;

      for (const tx of transactions) {
        if (new Date(tx.settlementDate) > asOfDate) break;

        const symbol = tx.symbolMapped || tx.symbol || "";
        const qty = tx.quantity || 0;
        const price = tx.price || 0;
        const netAmount = tx.netAmount || 0;

        // 포지션 업데이트
        if (symbol && ["Buy", "Sell", "REI", "CON", "WDR", "DIS", "DEP", "TFI", "TFO"].includes(tx.action)) {
          const existing = positions.get(symbol) || { qty: 0, cost: 0, currency: tx.currency };

          switch (tx.action) {
            case "Buy":
              existing.qty += qty;
              existing.cost += Math.abs(qty * price) + Math.abs(tx.commission || 0);
              break;
            case "REI":
              existing.qty += qty;
              if (price > 0) {
                existing.cost += Math.abs(qty * price);
              } else if (netAmount) {
                existing.cost += Math.abs(netAmount);
              }
              break;
            case "Sell":
              if (existing.qty > 0) {
                const avgCost = existing.cost / existing.qty;
                existing.qty -= Math.abs(qty);
                existing.cost = existing.qty * avgCost;
              }
              break;
            case "CON":
              existing.qty += qty;
              if (tx.cadEquivalent) {
                existing.cost += tx.cadEquivalent;
              }
              break;
            case "WDR":
              if (existing.qty > 0) {
                const avgCost = existing.cost / existing.qty;
                existing.qty -= Math.abs(qty);
                existing.cost = existing.qty * avgCost;
              }
              break;
            case "DIS":
              existing.qty += qty;
              break;
            case "DEP":
            case "TFI":
              // 현물 입금 (주식 이전 입금)
              existing.qty += qty;
              if (tx.cadEquivalent) {
                existing.cost += tx.cadEquivalent;
              }
              break;
            case "TFO":
              // 현물 출금 (주식 이전 출금)
              if (existing.qty > 0) {
                const avgCost = existing.cost / existing.qty;
                existing.qty -= Math.abs(qty);
                existing.cost = existing.qty * avgCost;
              }
              break;
          }

          positions.set(symbol, existing);
        }

        // 현금 업데이트
        if (netAmount !== 0) {
          if (tx.currency === "CAD") {
            cashCad += netAmount;
          } else {
            cashUsd += netAmount;
          }
        }
      }

      // 현재 시세로 시장 가치 계산
      let marketValueCad = 0;
      let marketValueUsd = 0;

      for (const [symbol, pos] of positions) {
        if (pos.qty > 0.0001) {
          const quote = quotes.get(symbol);
          const currentPrice = quote?.price || 0;
          const marketValue = pos.qty * currentPrice;

          if (pos.currency === "CAD" || symbol.endsWith(".TO")) {
            marketValueCad += marketValue;
          } else {
            marketValueUsd += marketValue;
          }
        }
      }

      // Total equity (CAD)
      const totalEquity = marketValueCad + marketValueUsd * fxRate + cashCad + cashUsd * fxRate;

      // Net deposits 계산 (해당 날짜까지의 누적)
      // 입금: CON (Contribution), TFI (Transfer In), DEP (Deposit)
      // 출금: WDR (Withdrawal), TFO (Transfer Out)
      const DEPOSIT_ACTIONS = ["CON", "TFI", "DEP"];
      const WITHDRAWAL_ACTIONS = ["WDR", "TFO"];

      let netDepositsCad = 0;
      for (const tx of transactions) {
        if (new Date(tx.settlementDate) > asOfDate) break;

        // 입금 (CON, TFI, DEP)
        // cadEquivalent: 현물 이전 시 CAD 환산 가치
        // netAmount: 현금 입출금 금액
        // 같은 거래에서 둘 다 값이 있는 경우는 없으므로 합산이 안전
        if (DEPOSIT_ACTIONS.includes(tx.action)) {
          const cadEquiv = tx.cadEquivalent ?? 0;
          const netAmt = tx.netAmount ?? 0;
          netDepositsCad += cadEquiv + netAmt;
        }
        // 출금 (WDR, TFO)
        else if (WITHDRAWAL_ACTIONS.includes(tx.action)) {
          const cadEquiv = tx.cadEquivalent ?? 0;
          const netAmt = tx.netAmount ?? 0;
          netDepositsCad -= Math.abs(cadEquiv) + Math.abs(netAmt);
        }
      }

      equityHistory.push({
        date: currentDate.toISOString().split("T")[0],
        equity: Math.round(totalEquity * 100) / 100,
        netDeposits: Math.round(netDepositsCad * 100) / 100,
      });

      // 다음 날짜로
      currentDate.setDate(currentDate.getDate() + intervalDays);
    }

    return NextResponse.json(equityHistory);
  } catch (error) {
    console.error("Equity history API error:", error);
    return NextResponse.json(
      { error: "Equity 히스토리 조회 실패" },
      { status: 500 }
    );
  }
}
