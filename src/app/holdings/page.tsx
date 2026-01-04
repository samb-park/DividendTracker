"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

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
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("inception");
  const [currencyView, setCurrencyView] = useState<CurrencyView>("combined_cad");
  const [showNetDeposits, setShowNetDeposits] = useState(true);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedAccount, selectedPeriod]);

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
    { value: "combined_cad", label: "Combined in CAD" },
    { value: "combined_usd", label: "Combined in USD" },
    { value: "cad", label: "CAD" },
    { value: "usd", label: "USD" },
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

  const sortedPositions = filteredPositions.sort(
    (a, b) => b.marketValue - a.marketValue
  );

  return (
    <div className="space-y-6">
      {/* 계좌 선택 탭 */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedAccount("all")}
          className={`px-4 py-3 rounded-lg border transition-colors ${
            selectedAccount === "all"
              ? "border-gray-300 bg-white"
              : "border-gray-200 bg-gray-50 hover:bg-white"
          }`}
        >
          All accounts
        </button>
        {accounts.map((acc) => (
          <button
            key={acc.id}
            onClick={() => setSelectedAccount(acc.id)}
            className={`px-4 py-3 rounded-lg border transition-colors ${
              selectedAccount === acc.id
                ? "border-green-500 bg-white"
                : "border-gray-200 bg-gray-50 hover:bg-white"
            }`}
          >
            <div className="font-medium">
              {acc.accountType}
            </div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading...</div>
        </div>
      ) : (
        <>
          {/* Total Equity 헤더 */}
          <div>
            <div className="text-sm text-gray-500 mb-1">
              Total equity ({currencyView === "combined_cad" ? "Combined in CAD" :
                           currencyView === "combined_usd" ? "Combined in USD" :
                           currencyView === "cad" ? "CAD only" : "USD only"})
            </div>
            <div className="text-4xl font-bold text-gray-900">
              {formatCurrency(displayValues.totalEquity)}
            </div>
          </div>

          {/* Equity 차트 */}
          <div className="bg-white rounded-lg p-4">
            {/* Net Deposits 토글 */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setShowNetDeposits(!showNetDeposits)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  showNetDeposits
                    ? "border-blue-500 text-blue-600 bg-blue-50"
                    : "border-gray-200 text-gray-500 bg-gray-50 hover:bg-white"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${showNetDeposits ? "bg-blue-500" : "bg-gray-300"}`} />
                Net deposits
              </button>
            </div>
            {equityHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={equityHistory}>
                  <XAxis
                    dataKey="date"
                    hide={true}
                  />
                  <YAxis
                    domain={[minEquity, maxEquity]}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickFormatter={(v) => v.toLocaleString()}
                    axisLine={false}
                    tickLine={false}
                    orientation="right"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <CartesianGrid horizontal={true} vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                  {showNetDeposits && (
                    <Line
                      type="monotone"
                      dataKey="netDeposits"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Net Deposits"
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                    name="Equity"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400">
                No data available
              </div>
            )}
          </div>

          {/* 기간 선택 버튼 */}
          <div className="flex gap-2 flex-wrap">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setSelectedPeriod(p.value)}
                className={`px-4 py-2 rounded-full border text-sm transition-colors ${
                  selectedPeriod === p.value
                    ? "border-gray-400 bg-white font-medium"
                    : "border-gray-200 bg-gray-50 hover:bg-white text-gray-600"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 통화 선택 + 요약 */}
          <div>
            {/* 통화 탭 */}
            <div className="flex gap-2 mb-6">
              {currencyViews.map((cv) => (
                <button
                  key={cv.value}
                  onClick={() => setCurrencyView(cv.value)}
                  className={`px-4 py-2 rounded-full border text-sm transition-colors ${
                    currencyView === cv.value
                      ? "border-green-500 text-green-600 bg-white font-medium"
                      : "border-gray-200 bg-gray-50 hover:bg-white text-gray-600"
                  }`}
                >
                  {cv.label}
                </button>
              ))}
            </div>

            {/* 요약 그리드 */}
            <div className="grid grid-cols-2 gap-x-16 gap-y-4">
              {/* 왼쪽 컬럼 */}
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Today&apos;s P&amp;L</span>
                  <span className="font-medium">
                    {formatCurrency(displayValues.todayPnL)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Open P&amp;L</span>
                  <span className={`font-medium ${displayValues.openPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {displayValues.openPnL >= 0 ? "+" : ""}
                    {formatCurrency(displayValues.openPnL)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Total P&amp;L</span>
                  <span className={`font-medium ${totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {totalPnL >= 0 ? "+" : ""}
                    {formatCurrency(totalPnL)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Net deposits</span>
                  <span className="font-medium">
                    {formatCurrency(summary?.netDeposits || 0)}
                  </span>
                </div>
              </div>

              {/* 오른쪽 컬럼 */}
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Total equity</span>
                  <span className="font-medium">
                    {formatCurrency(displayValues.totalEquity)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Market value</span>
                  <span className="font-medium">
                    {formatCurrency(displayValues.marketValue)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Cash</span>
                  <span className="font-medium">
                    {formatCurrency(displayValues.cash)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Buying power</span>
                  <span className="font-medium">
                    {formatCurrency(Math.max(0, displayValues.cash))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* POSITIONS / ORDERS 탭 - Questrade 스타일 */}
          <div className="border-b border-gray-200">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab("positions")}
                className={`pb-2 text-xs font-semibold tracking-wider transition-colors ${
                  activeTab === "positions"
                    ? "text-[#0a8043] border-b-[3px] border-[#0a8043]"
                    : "text-[#5f6368] hover:text-[#3c4043]"
                }`}
              >
                POSITIONS
              </button>
              <button
                onClick={() => setActiveTab("orders")}
                className={`pb-2 text-xs font-semibold tracking-wider transition-colors ${
                  activeTab === "orders"
                    ? "text-[#0a8043] border-b-[3px] border-[#0a8043]"
                    : "text-[#5f6368] hover:text-[#3c4043]"
                }`}
              >
                ORDERS
              </button>
            </div>
          </div>

          {/* 포지션 테이블 - Questrade 스타일 */}
          {activeTab === "positions" && (
            <div className="overflow-hidden">
              {sortedPositions.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-gray-500">No positions</div>
                </div>
              ) : (
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
                        Currency
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPositions.map((pos, idx) => (
                      <tr
                        key={idx}
                        className={idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"}
                      >
                        {/* Symbol */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#202124] text-sm">
                            {pos.symbolMapped}
                          </div>
                          <div className="text-xs text-[#5f6368] truncate max-w-[200px]">
                            {pos.symbol !== pos.symbolMapped ? pos.symbol : ""}
                          </div>
                        </td>

                        {/* Today's P&L */}
                        <td className="py-3 px-4 text-right">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm bg-[#e8f5e9] text-[#5f6368]">
                            {formatCurrency(0)}
                          </span>
                        </td>

                        {/* Open P&L */}
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm ${
                              pos.openPnL >= 0
                                ? "bg-[#e8f5e9] text-[#137333]"
                                : "bg-[#fce8e6] text-[#c5221f]"
                            }`}
                          >
                            {pos.openPnL >= 0 ? "+" : ""}
                            {formatCurrency(pos.openPnL)}
                          </span>
                        </td>

                        {/* Open qty */}
                        <td className="py-3 px-4 text-right text-sm text-[#202124]">
                          {formatNumber(pos.quantity, 4)}
                        </td>

                        {/* Avg price */}
                        <td className="py-3 px-4 text-right text-sm text-[#202124]">
                          {formatCurrency(pos.avgCost)}
                        </td>

                        {/* Symbol price */}
                        <td className="py-3 px-4 text-right text-sm text-[#202124]">
                          {formatCurrency(pos.currentPrice)}
                        </td>

                        {/* Market value */}
                        <td className="py-3 px-4 text-right text-sm text-[#202124]">
                          {formatCurrency(pos.marketValue)}
                        </td>

                        {/* Currency */}
                        <td className="py-3 px-4 text-right text-sm text-[#5f6368]">
                          {pos.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
