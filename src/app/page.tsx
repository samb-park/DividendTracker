"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Account {
  id: string;
  accountNumber: string;
  accountType: string;
  nickname: string | null;
}

interface Position {
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
}

interface PortfolioSummary {
  totalMarketValueCad: number;
  totalMarketValueUsd: number;
  totalCashCad: number;
  totalCashUsd: number;
  totalEquityCad: number;
  totalOpenPnLCad: number;
  totalTodayPnLCad: number;
  netDeposits: number;
  fxRate: number;
}

interface DividendSummary {
  symbol: string;
  totalAmount: number;
  currency: string;
  paymentCount: number;
}

interface YahooProjection {
  symbol: string;
  currency: string;
  quantity: number;
  price: number;
  marketValue: number;
  dividendYield: number | null;
  projectedAnnualDividend: number;
}

interface YahooProjectionSummary {
  projections: YahooProjection[];
  totalProjectedAnnual: number;
  totalProjectedMonthly: number;
  year: number;
}

export default function HomePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [dividends, setDividends] = useState<DividendSummary[]>([]);
  const [yahooProjections, setYahooProjections] = useState<YahooProjectionSummary | null>(null);
  const [totalReceivedDividends, setTotalReceivedDividends] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedAccount]);

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const accountParam = selectedAccount !== "all" ? `accountId=${selectedAccount}` : "";
      const [portfolioRes, transactionsRes, yahooRes] = await Promise.all([
        fetch(`/api/portfolio${accountParam ? `?${accountParam}` : ""}`),
        fetch(`/api/transactions?type=DIV&limit=10000${accountParam ? `&${accountParam}` : ""}`),
        fetch(`/api/dividends?type=yahooProjected${accountParam ? `&${accountParam}` : ""}`),
      ]);

      const portfolioData = await portfolioRes.json();
      const transactionsData = await transactionsRes.json();
      const yahooData = await yahooRes.json();

      setSummary(portfolioData.summary);
      setPositions(portfolioData.positions || []);
      setYahooProjections(yahooData);

      // Define fxRate early for use in calculations
      const currentFxRate = portfolioData.summary?.fxRate || 1.44;

      // 배당금 요약 (DIV 트랜잭션에서 추출)
      const divMap = new Map<string, DividendSummary>();
      const divTransactions = transactionsData.transactions || [];
      let totalDivReceived = 0;
      for (const tx of divTransactions) {
        if (tx.action !== "DIV" || !tx.symbolMapped || tx.netAmount <= 0) continue;

        // Calculate CAD value for total
        const amountCad = tx.currency === "USD" ? tx.netAmount * currentFxRate : tx.netAmount;
        totalDivReceived += amountCad;

        const key = tx.symbolMapped;
        const existing = divMap.get(key);
        if (existing) {
          existing.totalAmount += amountCad; // Accumulate in CAD for consistent sorting
          existing.paymentCount++;
        } else {
          divMap.set(key, {
            symbol: tx.symbolMapped,
            totalAmount: amountCad, // Store in CAD
            currency: "CAD", // Normalized to CAD
            paymentCount: 1,
          });
        }
      }
      setDividends(Array.from(divMap.values()).sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5));
      setTotalReceivedDividends(totalDivReceived);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }

  const fxRate = summary?.fxRate || 1.44;

  const totalPnL = (summary?.totalEquityCad || 0) - (summary?.netDeposits || 0);

  // 포트폴리오 가중 평균 배당 수익률 계산
  const weightedDividendYield = (() => {
    if (!yahooProjections?.projections || yahooProjections.projections.length === 0) return 0;

    let totalMarketValue = 0;
    let weightedYield = 0;

    for (const proj of yahooProjections.projections) {
      if (proj.dividendYield && proj.dividendYield > 0) {
        // CAD로 환산
        const marketValueCad = proj.currency === "USD" ? proj.marketValue * fxRate : proj.marketValue;
        totalMarketValue += marketValueCad;
        weightedYield += (proj.dividendYield / 100) * marketValueCad;
      }
    }

    return totalMarketValue > 0 ? (weightedYield / totalMarketValue) * 100 : 0;
  })();

  // 연간 예상 배당금 (CAD로 환산)
  const projectedAnnualDividendCad = (() => {
    if (!yahooProjections?.projections) return 0;

    let total = 0;
    for (const proj of yahooProjections.projections) {
      if (proj.currency === "USD") {
        total += proj.projectedAnnualDividend * fxRate;
      } else {
        total += proj.projectedAnnualDividend;
      }
    }
    return total;
  })();

  // CAGR Calculation (Lifetime)
  const cagr = (() => {
    // 1. Determine Start Date (First Transaction Date)
    const firstTxDateStr = (summary as any)?.firstTransactionDate;
    if (!firstTxDateStr) return 0;

    const startDate = new Date(firstTxDateStr);
    const endDate = new Date();

    // 2. Calculate Years Active
    const years = (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years < 0.1) return 0;

    // 3. Get Start and End Values
    const startValue = summary?.netDeposits || 0;
    const endValue = summary?.totalEquityCad || 0;

    if (startValue <= 0 || endValue <= 0) return 0;

    // 4. Calculate CAGR: (End / Start) ^ (1 / n) - 1
    return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
  })();

  // 1. Capital Return (Price Appreciation Only)
  // Capital Gain % = Total Open PnL / Total Cost
  // Total Cost = Market Value - Open PnL
  const capitalReturnPercent = (() => {
    const marketVal = summary?.totalMarketValueCad || 0;
    const openPnl = summary?.totalOpenPnLCad || 0;
    const cost = marketVal - openPnl;
    if (cost <= 0) return 0;
    return (openPnl / cost) * 100;
  })();

  // 2. Total Net Return (Real Total Return)
  // (Total Equity - Net Deposits) / Net Deposits
  // This includes Dividends (Cash) + Capital Gains
  const totalNetReturnPercent = (() => {
    const equity = summary?.totalEquityCad || 0;
    const deposits = summary?.netDeposits || 0;
    if (deposits <= 0) return 0;
    return ((equity - deposits) / deposits) * 100;
  })();

  // 포지션 합산 (같은 심볼)
  const aggregatedPositions = (() => {
    const map = new Map<string, Position>();
    for (const pos of positions) {
      const key = pos.symbolMapped;
      const existing = map.get(key);
      if (existing) {
        const totalQty = existing.quantity + pos.quantity;
        const totalCost = existing.totalCost + pos.totalCost;
        const totalMarketValue = existing.marketValue + pos.marketValue;
        const totalOpenPnL = existing.openPnL + pos.openPnL;
        const totalTodayPnL = existing.todayPnL + pos.todayPnL;
        map.set(key, {
          ...existing,
          quantity: totalQty,
          totalCost,
          avgCost: totalCost / totalQty,
          marketValue: totalMarketValue,
          openPnL: totalOpenPnL,
          openPnLPercent: totalCost > 0 ? (totalOpenPnL / totalCost) * 100 : 0,
          todayPnL: totalTodayPnL,
        });
      } else {
        map.set(key, { ...pos });
      }
    }
    return Array.from(map.values());
  })();

  // Top 5 holdings (CAD 환산 기준)
  const topHoldings = aggregatedPositions
    .map(pos => ({
      ...pos,
      marketValueCad: pos.currency === "USD" ? pos.marketValue * fxRate : pos.marketValue,
    }))
    .sort((a, b) => b.marketValueCad - a.marketValueCad)
    .slice(0, 5);

  // 자산 배분 데이터 (파이차트용)
  const totalMarketValueCad = aggregatedPositions.reduce((sum, pos) => {
    return sum + (pos.currency === "USD" ? pos.marketValue * fxRate : pos.marketValue);
  }, 0);

  const allocationData = topHoldings.map((pos) => ({
    name: pos.symbolMapped.replace(".TO", ""),
    value: pos.marketValueCad,
    percent: totalMarketValueCad > 0 ? (pos.marketValueCad / totalMarketValueCad) * 100 : 0,
  }));

  // 나머지 합산
  const othersValue = totalMarketValueCad - topHoldings.reduce((sum, pos) => sum + pos.marketValueCad, 0);
  if (othersValue > 0) {
    allocationData.push({
      name: "Others",
      value: othersValue,
      percent: (othersValue / totalMarketValueCad) * 100,
    });
  }

  const COLORS = ["#0a8043", "#16a34a", "#22c55e", "#4ade80", "#86efac", "#d1d5db"];

  if (loading) {
    return (
      <div className="space-y-4 md:space-y-6">
        {/* Header skeleton */}
        <div className="bg-gradient-to-r from-[#0a8043] to-[#16a34a] rounded-xl p-4 md:p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <Skeleton className="h-3 w-20 bg-white/20 mb-2" />
              <Skeleton className="h-10 w-48 bg-white/20" />
            </div>
            <Skeleton className="h-10 w-24 bg-white/20 rounded-md" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-white/20">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <Skeleton className="h-2.5 w-16 bg-white/20 mb-1" />
                <Skeleton className="h-5 w-24 bg-white/20" />
              </div>
            ))}
          </div>
        </div>
        {/* Cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-gray-100">
              <Skeleton className="h-4 w-32 mb-4" />
              <div className="space-y-3">
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="flex justify-between">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }



  return (
    <div className="space-y-4 md:space-y-6">
      {/* 상단 그린 배너 - 핵심 메트릭 포함 */}
      <div
        className="bg-gradient-to-r from-[#0a8043] to-[#16a34a] rounded-xl p-4 md:p-5 text-white cursor-pointer transition-all hover:shadow-lg"
        onClick={() => setShowDetails(!showDetails)}
      >
        {/* 메인 메트릭 - Total Equity + Account Select */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-white/70 uppercase tracking-wide mb-1">Total Equity</div>
            <div className="text-3xl md:text-4xl font-bold">
              {formatCurrency(summary?.totalEquityCad || 0)}
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={selectedAccount} onValueChange={(v) => {
              if (v) setSelectedAccount(v);
            }}>
              <SelectTrigger
                className="w-[100px] md:w-[120px] bg-white/20 border-white/30 text-white hover:bg-white/30"
                onClick={(e) => e.stopPropagation()}
              >
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.accountType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 서브 메트릭 그리드 - 1행 (Always Visible) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 pt-3 border-t border-white/20">
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">Today&apos;s P&amp;L</div>
            <div className="text-sm font-bold">
              {(summary?.totalTodayPnLCad || 0) >= 0 ? "+" : ""}{formatCurrency(summary?.totalTodayPnLCad || 0)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">Net Deposits</div>
            <div className="text-sm font-bold">{formatCurrency(summary?.netDeposits || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">Dividend Yield</div>
            <div className="text-sm font-bold">
              {weightedDividendYield.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">Total Return</div>
            <div className="text-sm font-bold">
              {totalNetReturnPercent >= 0 ? "+" : ""}{totalNetReturnPercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* 서브 메트릭 그리드 - 2행 (Collapsible Details) */}
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 transition-all duration-300 overflow-hidden ${showDetails ? "pt-2 mt-2 border-t border-white/20 opacity-100 max-h-[500px]" : "max-h-0 opacity-0"}`}>
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">CAD Cash</div>
            <div className="text-sm font-bold">{formatCurrency(summary?.totalCashCad || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">USD Cash</div>
            <div className="text-sm font-bold">${formatNumber(summary?.totalCashUsd || 0, 2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">Est. Annual Div</div>
            <div className="text-sm font-bold">
              {formatCurrency(projectedAnnualDividendCad)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">Total Dividends</div>
            <div className="text-sm font-bold">
              {formatCurrency(totalReceivedDividends)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">FX Rate</div>
            <div className="text-sm font-bold">1 USD = {fxRate.toFixed(4)} CAD</div>
          </div>
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-wide">CAGR (All Time)</div>
            <div className="text-sm font-bold">
              {cagr !== 0 ? (cagr >= 0 ? "+" + cagr.toFixed(2) + "%" : cagr.toFixed(2) + "%") : "N/A"}
            </div>
          </div>
        </div>

        {/* Toggle Indicator */}
        <div className="flex justify-center mt-2 opacity-50">
          {showDetails ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
        </div>
      </div>

      {/* 2열 레이아웃: 자산배분 + Top Holdings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 자산 배분 파이차트 */}
        <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Asset Allocation</h2>
          <div className="flex items-center gap-4">
            <div className="w-[120px] h-[120px] md:w-[140px] md:h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocationData}
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="90%"
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {allocationData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5">
              {allocationData.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    <span className="text-gray-700 font-medium">{item.name}</span>
                  </div>
                  <span className="text-gray-500">{item.percent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Holdings */}
        <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Top Holdings</h2>
            <Link href="/holdings" className="text-[#0a8043] hover:bg-[#0a8043]/10 p-1 rounded-full transition-colors">
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-2">
            {topHoldings.map((pos) => {
              const isPositive = pos.openPnL >= 0;
              return (
                <div key={pos.symbolMapped} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">
                      {pos.symbolMapped.replace(".TO", "")}
                    </span>
                    <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${pos.currency === "CAD"
                      ? "bg-red-50 text-red-600"
                      : "bg-blue-50 text-blue-600"
                      }`}>
                      {pos.currency}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] ${isPositive ? "text-green-600" : "text-red-500"}`}>
                      {isPositive ? "+" : ""}{pos.openPnLPercent.toFixed(1)}%
                    </span>
                    <span className="text-xs font-medium text-gray-900">
                      ${formatNumber(pos.marketValue, 0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Dividend Payers */}
      <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Top Dividend Payers</h2>
          <Link href="/dividends" className="text-[#0a8043] hover:bg-[#0a8043]/10 p-1 rounded-full transition-colors">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="space-y-2">
          {dividends.length > 0 ? (
            dividends.map((div) => (
              <div key={div.symbol} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-700">
                    {div.symbol.replace(".TO", "")}
                  </span>
                  <span className="text-[9px] text-gray-400">
                    {div.paymentCount} payments
                  </span>
                </div>
                <span className="text-xs font-medium text-green-600">
                  +${formatNumber(div.totalAmount, 2)}
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-400">No dividend data</div>
          )}
        </div>
      </div>

    </div>
  );
}
