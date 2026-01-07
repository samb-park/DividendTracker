import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePositions } from '@/lib/calculations/positions';
import { calculateCashBalances } from '@/lib/calculations/cash';
import { calculateNetDeposits } from '@/lib/calculations/netDeposits';
import { getCachedQuotes, getCachedFxRate } from '@/lib/market/cache';

export interface PositionWithMarket {
  symbol: string;
  symbolMapped: string;
  quantity: number;
  avgCost: number;
  totalCost: number;
  currentPrice: number;
  previousClose: number;
  marketValue: number;
  openPnL: number;
  openPnLPercent: number;
  todayPnL: number;
  todayPnLPercent: number;
  currency: string;
  accountId: string;
  // 52-week data
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHighChangePercent: number | null;
}

export interface PortfolioSummary {
  account: {
    id: string;
    accountNumber: string;
    accountType: string;
    nickname: string | null;
  } | null;
  positions: PositionWithMarket[];
  cashBalances: { currency: string; balance: number }[];
  summary: {
    totalMarketValueCad: number;
    totalMarketValueUsd: number;
    totalCashCad: number;
    totalCashUsd: number;
    totalEquityCad: number;
    totalOpenPnLCad: number;
    totalTodayPnLCad: number;
    netDeposits: number;
    fxRate: number;
    firstTransactionDate: string | null;
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    // 계좌 정보
    let account = null;
    if (accountId) {
      account = await prisma.account.findUnique({
        where: { id: accountId },
      });
    }

    // First Transaction Date (for CAGR)
    const firstTx = await prisma.transaction.findFirst({
      where: accountId ? { accountId } : {},
      orderBy: { settlementDate: 'asc' },
      select: { settlementDate: true },
    });
    const firstTransactionDate = firstTx
      ? firstTx.settlementDate.toISOString()
      : null;

    // 포지션 계산
    const positions = await calculatePositions(accountId);

    // 시세 조회에 필요한 심볼 목록
    const symbols = [...new Set(positions.map((p) => p.symbolMapped))];
    const quotes = await getCachedQuotes(symbols);
    const fxRate = await getCachedFxRate();

    // 포지션에 시세 정보 추가 및 총계 계산
    let totalMarketValueCad = 0;
    let totalMarketValueUsd = 0;
    let totalCostCad = 0;
    let totalCostUsd = 0;
    let totalTodayPnLCad = 0;

    const positionsWithMarket: PositionWithMarket[] = positions.map((pos) => {
      const quote = quotes.get(pos.symbolMapped);
      const currentPrice = quote?.price || 0;
      const previousClose = quote?.previousClose || currentPrice;

      const marketValue = pos.quantity * currentPrice;
      const openPnL = marketValue - pos.totalCost;
      const openPnLPercent =
        pos.totalCost > 0 ? (openPnL / pos.totalCost) * 100 : 0;

      const todayPnL = pos.quantity * (currentPrice - previousClose);
      const todayPnLPercent =
        previousClose > 0
          ? ((currentPrice - previousClose) / previousClose) * 100
          : 0;

      // CAD 환산
      const isCad = pos.currency === 'CAD' || pos.symbolMapped.endsWith('.TO');
      if (isCad) {
        totalMarketValueCad += marketValue;
        totalCostCad += pos.totalCost;
        totalTodayPnLCad += todayPnL;
      } else {
        totalMarketValueUsd += marketValue;
        totalCostUsd += pos.totalCost;
        totalTodayPnLCad += todayPnL * fxRate;
      }

      return {
        ...pos,
        currentPrice,
        previousClose,
        marketValue,
        openPnL,
        openPnLPercent,
        todayPnL,
        todayPnLPercent,
        fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: quote?.fiftyTwoWeekLow ?? null,
        fiftyTwoWeekHighChangePercent: quote?.fiftyTwoWeekHighChangePercent ?? null,
      };
    });

    // 현금 잔액
    const cashBalances = await calculateCashBalances(accountId);
    let totalCashCad = 0;
    let totalCashUsd = 0;

    for (const cash of cashBalances) {
      if (cash.currency === 'CAD') {
        totalCashCad += cash.balance;
      } else {
        totalCashUsd += cash.balance;
      }
    }

    // 순입금액
    const netDepositsResult = await calculateNetDeposits(accountId);

    // 총 자산 (CAD 기준)
    const totalEquityCad =
      totalMarketValueCad +
      totalMarketValueUsd * fxRate +
      totalCashCad +
      totalCashUsd * fxRate;

    const totalOpenPnLCad =
      totalMarketValueCad -
      totalCostCad +
      (totalMarketValueUsd - totalCostUsd) * fxRate;

    const response: PortfolioSummary = {
      account,
      positions: positionsWithMarket,
      cashBalances: cashBalances.map((c) => ({
        currency: c.currency,
        balance: c.balance,
      })),
      summary: {
        totalMarketValueCad,
        totalMarketValueUsd,
        totalCashCad,
        totalCashUsd,
        totalEquityCad,
        totalOpenPnLCad,
        totalTodayPnLCad,
        netDeposits: netDepositsResult.totalNetDeposits,
        fxRate,
        firstTransactionDate,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Portfolio API error:', error);
    return NextResponse.json(
      { error: '포트폴리오 조회 실패' },
      { status: 500 }
    );
  }
}
