"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatNumber, formatNumberTrim } from "@/lib/utils";
import { Settings2, ChevronDown, ChevronUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calculateWeeklyAllocation,
  loadPortfolioSettings,
  type PortfolioSettings,
  type AllocationSummary,
} from "@/lib/calculations/allocation";

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

interface PortfolioData {
  account: Account | null;
  positions: Position[];
  summary: PortfolioSummary;
}

interface EquityPoint {
  date: string;
  equity: number;
  netDeposits: number;
}

type Period = "15d" | "1m" | "3m" | "6m" | "1y" | "inception";
type CurrencyView = "cad" | "usd" | "combined_cad" | "combined_usd";

export default function HoldingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [equityHistory, setEquityHistory] = useState<EquityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"positions" | "orders">("positions");
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("15d");
  const [currencyView, setCurrencyView] = useState<CurrencyView>("combined_cad");
  const [showNetDeposits, setShowNetDeposits] = useState(true);
  const [expandedPosition, setExpandedPosition] = useState<number | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [portfolioSettings, setPortfolioSettings] = useState<PortfolioSettings | null>(null);
  const [allocationSummary, setAllocationSummary] = useState<AllocationSummary | null>(null);
  const [showAllocation, setShowAllocation] = useState(false);

  useEffect(() => {
    fetchAccounts();
    fetchPortfolioSettings();
  }, []);

  async function fetchPortfolioSettings() {
    let loadedFromApi = false;
    try {
      const res = await fetch("/api/settings/portfolio");
      if (res.ok) {
        const data = await res.json();
        // If API returns data, use it
        if (data.targets && data.targets.length > 0) {
          setPortfolioSettings(data);
          loadedFromApi = true;
        }
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }

    if (!loadedFromApi) {
      // Fallback to local storage if API failed or returned empty
      const local = loadPortfolioSettings();
      if (local) {
        setPortfolioSettings(local);
      }
    }
  }

  useEffect(() => {
    fetchData();
  }, [selectedAccount, selectedPeriod]);

  // Calculate allocation when portfolio or settings change
  useEffect(() => {
    if (portfolio && portfolioSettings && portfolioSettings.targets.length > 0) {
      try {
        const fxRate = portfolio.summary.fxRate || 1.38;
        const cashBalanceCad = (portfolio.summary.totalCashCad || 0) +
          (portfolio.summary.totalCashUsd || 0) * fxRate;

        const allocation = calculateWeeklyAllocation(
          portfolio.positions.map((p) => ({
            symbol: p.symbol,
            symbolMapped: p.symbolMapped,
            marketValue: p.marketValue,
            currency: p.currency,
          })),
          portfolioSettings,
          fxRate,
          cashBalanceCad
        );

        setAllocationSummary(allocation);
      } catch (error) {
        console.error("Allocation calculation error:", error);
        setAllocationSummary(null);
      }
    } else {
      setAllocationSummary(null);
    }
  }, [portfolio, portfolioSettings]);

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

      const [portfolioRes, equityRes] = await Promise.all([
        fetch(`/api/portfolio${accountParam ? `?${accountParam}` : ""}`),
        fetch(`/api/equity-history?period=${selectedPeriod}${accountParam ? `&${accountParam}` : ""}`),
      ]);

      const portfolioData = await portfolioRes.json();
      const equityData = await equityRes.json();

      setPortfolio(portfolioData);
      setEquityHistory(equityData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }

  const periods: { value: Period; label: string }[] = [
    { value: "15d", label: "15D" },
    { value: "1m", label: "1M" },
    { value: "3m", label: "3M" },
    { value: "6m", label: "6M" },
    { value: "1y", label: "1Y" },
    { value: "inception", label: "Since inception" },
  ];

  const currencyViews: { value: CurrencyView; label: string }[] = [
    { value: "combined_cad", label: "CAD" },
    { value: "combined_usd", label: "USD" },
  ];

  const summary = portfolio?.summary;
  const fxRate = summary?.fxRate || 1.35;

  // 통화 뷰에 따른 계산
  const getDisplayValues = () => {
    switch (currencyView) {
      case "combined_cad":
        // 모든 자산을 CAD로 환산
        return {
          totalEquity: (summary?.totalMarketValueCad || 0) + (summary?.totalMarketValueUsd || 0) * fxRate +
            (summary?.totalCashCad || 0) + (summary?.totalCashUsd || 0) * fxRate,
          marketValue: (summary?.totalMarketValueCad || 0) + (summary?.totalMarketValueUsd || 0) * fxRate,
          cash: (summary?.totalCashCad || 0) + (summary?.totalCashUsd || 0) * fxRate,
          openPnL: summary?.totalOpenPnLCad || 0,
          todayPnL: summary?.totalTodayPnLCad || 0,
        };
      case "combined_usd":
        // 모든 자산을 USD로 환산
        return {
          totalEquity: (summary?.totalMarketValueCad || 0) / fxRate + (summary?.totalMarketValueUsd || 0) +
            (summary?.totalCashCad || 0) / fxRate + (summary?.totalCashUsd || 0),
          marketValue: (summary?.totalMarketValueCad || 0) / fxRate + (summary?.totalMarketValueUsd || 0),
          cash: (summary?.totalCashCad || 0) / fxRate + (summary?.totalCashUsd || 0),
          openPnL: (summary?.totalOpenPnLCad || 0) / fxRate,
          todayPnL: (summary?.totalTodayPnLCad || 0) / fxRate,
        };
      case "cad":
        // CAD 자산만
        return {
          totalEquity: (summary?.totalMarketValueCad || 0) + (summary?.totalCashCad || 0),
          marketValue: summary?.totalMarketValueCad || 0,
          cash: summary?.totalCashCad || 0,
          openPnL: 0, // CAD 자산만의 P&L은 별도 계산 필요
          todayPnL: 0,
        };
      case "usd":
        // USD 자산만
        return {
          totalEquity: (summary?.totalMarketValueUsd || 0) + (summary?.totalCashUsd || 0),
          marketValue: summary?.totalMarketValueUsd || 0,
          cash: summary?.totalCashUsd || 0,
          openPnL: 0, // USD 자산만의 P&L은 별도 계산 필요
          todayPnL: 0,
        };
      default:
        return {
          totalEquity: summary?.totalEquityCad || 0,
          marketValue: 0,
          cash: 0,
          openPnL: 0,
          todayPnL: 0,
        };
    }
  };

  const displayValues = getDisplayValues();

  // Total P&L 계산 (combined_cad 기준)
  const totalPnL = (summary?.totalEquityCad || 0) - (summary?.netDeposits || 0);

  // 차트 Y축 범위 계산 - 현재 표시된 데이터 기준
  const showNetDepositsOnChart = showNetDeposits;
  const chartDomain = (() => {
    if (equityHistory.length === 0) {
      return { min: 0, max: 10000 };
    }
    const equityValues = equityHistory.map(d => d.equity);
    const netDepositsValues = showNetDepositsOnChart ? equityHistory.map(d => d.netDeposits) : [];
    const allValues = [...equityValues, ...netDepositsValues].filter(v => v > 0);

    if (allValues.length === 0) {
      return { min: 0, max: 10000 };
    }

    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const padding = (maxVal - minVal) * 0.05;

    return {
      min: Math.max(0, minVal - padding),
      max: maxVal + padding
    };
  })();
  const minEquity = chartDomain.min;
  const maxEquity = chartDomain.max;

  // 커스텀 툴팁 컴포넌트
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) => {
    if (active && payload && payload.length > 0) {
      const equity = payload.find(p => p.dataKey === "equity")?.value || 0;
      const netDeposits = payload.find(p => p.dataKey === "netDeposits")?.value || 0;
      const gain = equity - netDeposits;
      const gainPercent = netDeposits > 0 ? ((gain / netDeposits) * 100) : 0;

      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
          <div className="text-gray-500 mb-2">{label ? new Date(label).toLocaleDateString("en-CA") : ""}</div>
          <div className="flex justify-between gap-4 mb-1">
            <span className="text-gray-600">Equity:</span>
            <span className="font-medium">{formatCurrency(equity)}</span>
          </div>
          {showNetDepositsOnChart && (
            <>
              <div className="flex justify-between gap-4 mb-1">
                <span className="text-gray-600">Net deposits:</span>
                <span className="font-medium">{formatCurrency(netDeposits)}</span>
              </div>
              <div className="flex justify-between gap-4 pt-1 border-t border-gray-100">
                <span className="text-gray-600">Gain:</span>
                <span className={`font-medium ${gain >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {gain >= 0 ? "+" : ""}{formatCurrency(gain)} ({gainPercent >= 0 ? "+" : ""}{gainPercent.toFixed(2)}%)
                </span>
              </div>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  // 포지션 필터링 및 정렬
  const filteredPositions = [...(portfolio?.positions || [])].filter((pos) => {
    if (currencyView === "cad") {
      return pos.currency === "CAD" || pos.symbolMapped.endsWith(".TO");
    } else if (currencyView === "usd") {
      return pos.currency === "USD" && !pos.symbolMapped.endsWith(".TO");
    }
    return true; // combined_cad, combined_usd는 모든 포지션 표시
  });

  // "All" 계좌일 때 같은 심볼 합산
  const aggregatedPositions = selectedAccount === "all"
    ? (() => {
      const map = new Map<string, Position>();
      for (const pos of filteredPositions) {
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
    })()
    : filteredPositions;

  const sortedPositions = aggregatedPositions.sort(
    (a, b) => b.marketValue - a.marketValue
  );

  // 비중 계산을 위한 총 시장가치 (CAD로 환산)
  const totalMarketValueForWeight = sortedPositions.reduce((sum, pos) => {
    if (pos.currency === "USD") {
      return sum + pos.marketValue * fxRate;
    }
    return sum + pos.marketValue;
  }, 0);

  return (
    <div className="space-y-4 md:space-y-6">
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading...</div>
        </div>
      ) : (
        <>
          {/* Total Equity header with account select */}
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs md:text-sm text-gray-500 mb-1">
                Total equity ({currencyView === "combined_cad" ? "CAD" :
                  currencyView === "combined_usd" ? "USD" :
                    currencyView === "cad" ? "CAD" : "USD"})
              </div>
              <div className="text-3xl md:text-4xl font-bold text-gray-900">
                {formatCurrency(displayValues.totalEquity)}
              </div>
            </div>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-[100px] md:w-[120px]">
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

          {/* Equity 차트 */}
          <div className="bg-white rounded-2xl p-3 md:p-5 shadow-sm border border-gray-100">
            {/* 차트 헤더 - 범례 */}
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="flex items-center gap-4">
                {/* Equity 범례 */}
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-[#0a8043] rounded-full" />
                  <span className="text-[10px] md:text-xs text-gray-500 font-medium">Equity</span>
                </div>
                {/* Net deposits 토글 */}
                <button
                  onClick={() => setShowNetDeposits(!showNetDeposits)}
                  className={`flex items-center gap-1.5 transition-opacity ${showNetDeposits ? "opacity-100" : "opacity-50"
                    }`}
                >
                  <div className={`w-3 h-0.5 rounded-full ${showNetDeposits ? "bg-blue-500" : "bg-gray-300"}`} style={{ backgroundImage: showNetDeposits ? "repeating-linear-gradient(90deg, #3b82f6, #3b82f6 3px, transparent 3px, transparent 6px)" : "none" }} />
                  <span className="text-[10px] md:text-xs text-gray-500 font-medium">Deposits</span>
                </button>
              </div>
              {/* 현재 값 표시 */}
              {equityHistory.length > 0 && (
                <div className="text-right">
                  <div className="text-[10px] text-gray-400">Current</div>
                  <div className="text-xs md:text-sm font-semibold text-[#0a8043]">
                    ${formatNumber(equityHistory[equityHistory.length - 1]?.equity || 0, 0)}
                  </div>
                </div>
              )}
            </div>

            {/* Filters: Period, Currency */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as Period)}>
                <SelectTrigger variant="compact">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={currencyView} onValueChange={(value) => setCurrencyView(value as CurrencyView)}>
                <SelectTrigger variant="compact">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencyViews.map((cv) => (
                    <SelectItem key={cv.value} value={cv.value}>
                      {cv.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 차트 영역 */}
            {equityHistory.length > 0 ? (
              <div className="relative">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart
                    data={equityHistory}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0a8043" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#0a8043" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="depositsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.1} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      hide={true}
                    />
                    <YAxis
                      domain={[minEquity, maxEquity]}
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      axisLine={false}
                      tickLine={false}
                      orientation="right"
                      width={45}
                      tickCount={4}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    {showNetDeposits && (
                      <Area
                        type="monotone"
                        dataKey="netDeposits"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        fill="url(#depositsGradient)"
                        name="Net Deposits"
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke="#0a8043"
                      strokeWidth={2}
                      fill="url(#equityGradient)"
                      name="Equity"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
                No data available
              </div>
            )}

            {/* P&L 요약 바 */}
            {equityHistory.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4 md:gap-6">
                  <div>
                    <div className="text-[10px] text-gray-400">Net Deposits</div>
                    <div className="text-xs md:text-sm font-medium text-gray-700">
                      ${formatNumber(equityHistory[equityHistory.length - 1]?.netDeposits || 0, 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400">Total Gain</div>
                    <div className={`text-xs md:text-sm font-medium ${totalPnL >= 0 ? "text-[#0a8043]" : "text-red-500"}`}>
                      {totalPnL >= 0 ? "+" : "-"}${formatNumber(Math.abs(totalPnL), 0)}
                    </div>
                  </div>
                </div>
                <div className={`px-2 py-1 rounded-full text-[10px] md:text-xs font-medium ${totalPnL >= 0
                  ? "bg-green-50 text-[#0a8043]"
                  : "bg-red-50 text-red-500"
                  }`}>
                  {totalPnL >= 0 ? "+" : ""}{((totalPnL / (summary?.netDeposits || 1)) * 100).toFixed(1)}%
                </div>
              </div>
            )}
          </div>

          {/* 요약 섹션 */}
          <div>
            {/* 요약 그리드 - 데스크탑 항상 표시, 모바일 토글 */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out md:max-h-none md:opacity-100 ${showSummary ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0 md:max-h-none md:opacity-100"
              }`}>
              <div className="grid grid-cols-2 gap-x-4 md:gap-x-16 gap-y-2 md:gap-y-4">
                {/* 왼쪽 컬럼 */}
                <div className="space-y-2 md:space-y-4">
                  <div className="flex justify-between items-center py-1.5 md:py-2 border-b border-dotted border-gray-200">
                    <span className="text-xs md:text-base text-gray-600">Today&apos;s P&amp;L</span>
                    <span className="text-sm md:text-base font-medium text-gray-900">
                      ${formatNumber(displayValues.todayPnL, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 md:py-2 border-b border-dotted border-gray-200">
                    <span className="text-xs md:text-base text-gray-600">Open P&amp;L</span>
                    <span className={`text-sm md:text-base font-medium ${displayValues.openPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {displayValues.openPnL >= 0 ? "+" : "-"}${formatNumber(Math.abs(displayValues.openPnL), 2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 md:py-2 border-b border-dotted border-gray-200">
                    <span className="text-xs md:text-base text-gray-600">Total P&amp;L</span>
                    <span className={`text-sm md:text-base font-medium ${totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {totalPnL >= 0 ? "+" : "-"}${formatNumber(Math.abs(totalPnL), 2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 md:py-2 border-b border-dotted border-gray-200">
                    <span className="text-xs md:text-base text-gray-600">Net deposits</span>
                    <span className="text-sm md:text-base font-medium text-gray-900">
                      ${formatNumber(summary?.netDeposits || 0, 2)}
                    </span>
                  </div>
                </div>

                {/* 오른쪽 컬럼 */}
                <div className="space-y-2 md:space-y-4">
                  <div className="flex justify-between items-center py-1.5 md:py-2 border-b border-dotted border-gray-200">
                    <span className="text-xs md:text-base text-gray-600">Total equity</span>
                    <span className="text-sm md:text-base font-medium text-gray-900">
                      ${formatNumber(displayValues.totalEquity, 2)} <span className="text-gray-400 text-xs">{currencyView === "combined_cad" ? "CAD" : "USD"}</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 md:py-2 border-b border-dotted border-gray-200">
                    <span className="text-xs md:text-base text-gray-600">Market value</span>
                    <span className="text-sm md:text-base font-medium text-gray-900">
                      ${formatNumber(displayValues.marketValue, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 md:py-2 border-b border-dotted border-gray-200">
                    <span className="text-xs md:text-base text-gray-600">Cash</span>
                    <span className="text-sm md:text-base font-medium text-gray-900">
                      ${formatNumber(displayValues.cash, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 md:py-2 border-b border-dotted border-gray-200">
                    <span className="text-xs md:text-base text-gray-600">Buying power</span>
                    <span className="text-sm md:text-base font-medium text-gray-900">
                      ${formatNumber(Math.max(0, displayValues.cash), 2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* POSITIONS / ORDERS 탭 - Questrade 스타일 */}
          <div className="border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex gap-6">
                <button
                  onClick={() => setActiveTab("positions")}
                  className={`pb-2 text-xs font-semibold tracking-wider transition-colors ${activeTab === "positions"
                    ? "text-[#0a8043] border-b-[3px] border-[#0a8043]"
                    : "text-[#5f6368] hover:text-[#3c4043]"
                    }`}
                >
                  POSITIONS
                </button>
                <button
                  onClick={() => setActiveTab("orders")}
                  className={`pb-2 text-xs font-semibold tracking-wider transition-colors ${activeTab === "orders"
                    ? "text-[#0a8043] border-b-[3px] border-[#0a8043]"
                    : "text-[#5f6368] hover:text-[#3c4043]"
                    }`}
                >
                  ORDERS
                </button>
              </div>
              {/* Details toggle - mobile only */}
              <button
                onClick={() => setShowSummary(!showSummary)}
                className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className={`w-5 h-5 transition-transform duration-200 ${showSummary ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* 포지션 - 모바일: 카드 / 데스크탑: 테이블 */}
          {activeTab === "positions" && (
            <>
              {sortedPositions.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-gray-500">No positions</div>
                </div>
              ) : (
                <>
                  {/* 모바일 카드 뷰 - 세련된 금융 스타일 */}
                  <div className="md:hidden space-y-2">
                    {sortedPositions.map((pos, idx) => {
                      const isPositive = pos.openPnL >= 0;
                      const isExpanded = expandedPosition === idx;
                      const pnlPercent = pos.openPnLPercent;
                      // 비중 계산 (CAD로 환산)
                      const posValueCad = pos.currency === "USD" ? pos.marketValue * fxRate : pos.marketValue;
                      const weight = totalMarketValueForWeight > 0 ? (posValueCad / totalMarketValueForWeight) * 100 : 0;

                      // Allocation Data
                      const allocation = allocationSummary?.allocations.find(a => a.symbol === pos.symbol);
                      const hasAllocationTarget = allocation && allocation.targetWeight > 0;
                      const shouldBuy = allocation && allocation.weeklyBuyActual > 0;

                      return (
                        <div
                          key={idx}
                          className={`bg-white rounded-xl border transition-all duration-200 ${isExpanded
                            ? "border-gray-200 shadow-md"
                            : "border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200"
                            }`}
                        >
                          {/* 메인 카드 */}
                          <div
                            onClick={() => setExpandedPosition(isExpanded ? null : idx)}
                            className="px-3 py-2.5 cursor-pointer"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              {/* 심볼 + 통화 배지 + 비중 */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-900 tracking-tight">
                                  {pos.symbolMapped.replace(".TO", "")}
                                </span>
                                <span className={`px-1 py-0.5 rounded text-[9px] font-semibold ${pos.currency === "CAD"
                                  ? "bg-red-50 text-red-600 border border-red-100"
                                  : "bg-blue-50 text-blue-600 border border-blue-100"
                                  }`}>
                                  {pos.currency === "CAD" ? "CAD" : "USD"}
                                </span>
                                <span className="text-[9px] text-gray-400 font-medium">
                                  {weight.toFixed(1)}%
                                </span>
                                {shouldBuy && (
                                  <span className="bg-green-100 text-green-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                                    BUY
                                  </span>
                                )}
                              </div>
                              {/* P&L 배지 */}
                              <div className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${isPositive
                                ? "bg-green-50 text-green-700"
                                : "bg-red-50 text-red-600"
                                }`}>
                                {isPositive ? "+" : ""}{pnlPercent.toFixed(1)}%
                              </div>
                            </div>

                            {/* 수량 & 평균가 / 현재가 */}
                            <div className="flex items-end justify-between">
                              <div>
                                <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                                  {formatNumberTrim(pos.quantity)} shares
                                </div>
                                <div className="text-xs text-gray-600">
                                  <span className="text-gray-400">@</span> ${formatNumber(pos.avgCost, 2)}
                                  <span className="mx-1 text-gray-300">→</span>
                                  <span className="font-medium text-gray-900">${formatNumber(pos.currentPrice, 2)}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-base font-bold text-gray-900">
                                  ${formatNumber(pos.marketValue, 0)}
                                </div>
                                <div className={`text-[11px] font-medium ${isPositive ? "text-green-600" : "text-red-500"}`}>
                                  {isPositive ? "+" : ""}${formatNumberTrim(pos.openPnL)}
                                </div>
                              </div>
                            </div>

                            {/* Allocation Inline Info */}
                            {hasAllocationTarget && allocation && (
                              <div className="mt-2 pt-2 border-t border-dashed border-gray-100">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-500">Target</span>
                                    <span className="font-medium">{allocation.targetWeight}%</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-500">Gap</span>
                                    <span className={`font-medium ${allocation.gap > 0 ? "text-green-600" : "text-gray-500"}`}>
                                      {allocation.gap > 0 ? "+" : ""}{allocation.gap.toFixed(1)}%
                                    </span>
                                  </div>
                                  {shouldBuy && (
                                    <div className="font-bold text-[#0a8043]">
                                      +${allocation.weeklyBuyActual.toFixed(0)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 확장 영역 */}
                          <div
                            className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? "max-h-[400px]" : "max-h-0"
                              }`}
                          >
                            <div className="px-4 pb-4 border-t border-gray-100">
                              {/* 상세 그리드 */}
                              <div className="grid grid-cols-2 gap-3 pt-4">
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Quantity</div>
                                  <div className="text-sm font-semibold text-gray-900">{formatNumberTrim(pos.quantity)}</div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Avg Cost</div>
                                  <div className="text-sm font-semibold text-gray-900">${formatNumber(pos.avgCost, 2)}</div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Total Cost</div>
                                  <div className="text-sm font-semibold text-gray-900">${formatNumber(pos.totalCost, 2)}</div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Current Price</div>
                                  <div className="text-sm font-semibold text-gray-900">${formatNumber(pos.currentPrice, 2)}</div>
                                </div>
                              </div>

                              {/* P&L 섹션 */}
                              <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-gray-50 to-white border border-gray-100">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-xs text-gray-500">Open P&L</span>
                                  <span className={`text-sm font-bold ${isPositive ? "text-green-600" : "text-red-500"}`}>
                                    {isPositive ? "+" : ""}${formatNumber(pos.openPnL, 2)}
                                    <span className="text-xs font-medium ml-1">
                                      ({isPositive ? "+" : ""}{pos.openPnLPercent.toFixed(2)}%)
                                    </span>
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-gray-500">Today&apos;s Change</span>
                                  <span className={`text-sm font-bold ${pos.todayPnL >= 0 ? "text-green-600" : "text-red-500"}`}>
                                    {pos.todayPnL >= 0 ? "+" : ""}${formatNumber(pos.todayPnL, 2)}
                                    <span className="text-xs font-medium ml-1">
                                      ({pos.todayPnLPercent >= 0 ? "+" : ""}{pos.todayPnLPercent.toFixed(2)}%)
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 데스크탑 테이블 뷰 */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#e8eaed]">
                          <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                            Symbol
                          </th>
                          <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                            Today&apos;s P&amp;L
                          </th>
                          <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                            Open P&amp;L
                          </th>
                          <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                            Open qty
                          </th>
                          <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                            Avg price
                          </th>
                          <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                            Symbol price
                          </th>
                          <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                            Market value
                          </th>
                          <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                            Weight
                          </th>
                          <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                            Currency
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPositions.map((pos, idx) => {
                          const posValueCad = pos.currency === "USD" ? pos.marketValue * fxRate : pos.marketValue;
                          const weight = totalMarketValueForWeight > 0 ? (posValueCad / totalMarketValueForWeight) * 100 : 0;
                          return (
                            <tr
                              key={idx}
                              className={idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"}
                            >
                              <td className="py-3 px-4">
                                <div className="font-medium text-[#202124] text-sm">
                                  {pos.symbolMapped}
                                </div>
                                <div className="text-xs text-[#5f6368] truncate max-w-[200px]">
                                  {pos.symbol !== pos.symbolMapped ? pos.symbol : ""}
                                </div>
                              </td>

                              <td className="py-3 px-4 text-right">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm ${pos.todayPnL >= 0
                                  ? "bg-[#e8f5e9] text-[#137333]"
                                  : "bg-[#fce8e6] text-[#c5221f]"
                                  }`}>
                                  {pos.todayPnL >= 0 ? "+" : ""}
                                  {formatCurrency(pos.todayPnL)}
                                </span>
                              </td>

                              <td className="py-3 px-4 text-right">
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm ${pos.openPnL >= 0
                                    ? "bg-[#e8f5e9] text-[#137333]"
                                    : "bg-[#fce8e6] text-[#c5221f]"
                                    }`}
                                >
                                  {pos.openPnL >= 0 ? "+" : ""}
                                  {formatCurrency(pos.openPnL)}
                                </span>
                              </td>

                              <td className="py-3 px-4 text-right text-sm text-[#202124]">
                                {formatNumberTrim(pos.quantity)}
                              </td>

                              <td className="py-3 px-4 text-right text-sm text-[#202124]">
                                {formatCurrency(pos.avgCost)}
                              </td>

                              <td className="py-3 px-4 text-right text-sm text-[#202124]">
                                {formatCurrency(pos.currentPrice)}
                              </td>

                              <td className="py-3 px-4 text-right text-sm text-[#202124]">
                                {formatCurrency(pos.marketValue)}
                              </td>

                              <td className="py-3 px-4 text-right text-sm text-[#202124]">
                                {weight.toFixed(1)}%
                              </td>

                              <td className="py-3 px-4 text-right text-sm text-[#5f6368]">
                                {pos.currency}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* Orders tab (empty state) */}
          {activeTab === "orders" && (
            <div className="bg-white rounded-lg p-8">
              <div className="text-center text-gray-500">
                No orders
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
