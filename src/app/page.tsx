"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface Account {
  id: string;
  accountNumber: string;
  accountType: string;
  nickname: string | null;
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

interface EquityPoint {
  date: string;
  equity: number;
  netDeposits: number;
}

type Period = "15d" | "1m" | "3m" | "6m" | "1y" | "inception";
type CurrencyView = "cad" | "usd" | "combined_cad" | "combined_usd";

export default function HomePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [equityHistory, setEquityHistory] = useState<EquityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("inception");
  const [currencyView, setCurrencyView] = useState<CurrencyView>("combined_cad");

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

      setSummary(portfolioData.summary);
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

  // Total P&L 계산
  const totalPnL = (summary?.totalEquityCad || 0) - (summary?.netDeposits || 0);

  // 시장 가치 계산
  const marketValue = (summary?.totalMarketValueCad || 0) +
    (summary?.totalMarketValueUsd || 0) * (summary?.fxRate || 1);

  // 현금 계산
  const totalCash = (summary?.totalCashCad || 0) +
    (summary?.totalCashUsd || 0) * (summary?.fxRate || 1);

  // X축 포맷
  const formatXAxis = (date: string) => {
    const d = new Date(date);
    if (selectedPeriod === "15d" || selectedPeriod === "1m" || selectedPeriod === "3m") {
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  // 차트 최소값 (여유 공간)
  const minEquity = equityHistory.length > 0
    ? Math.min(...equityHistory.map(d => d.equity)) * 0.95
    : 0;
  const maxEquity = equityHistory.length > 0
    ? Math.max(...equityHistory.map(d => d.equity)) * 1.05
    : 10000;

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
              {acc.accountType} - {acc.accountNumber}
            </div>
            <div className="text-xs text-gray-500">Self-directed</div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      ) : (
        <>
          {/* Total Equity 헤더 */}
          <div>
            <div className="text-sm text-gray-500 mb-1">
              Total equity (Combined in CAD)
            </div>
            <div className="text-4xl font-bold text-gray-900">
              {formatCurrency(summary?.totalEquityCad || 0)}
            </div>
          </div>

          {/* Equity 차트 */}
          <div className="bg-white rounded-lg p-4">
            {equityHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={equityHistory}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickFormatter={formatXAxis}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[minEquity, maxEquity]}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickFormatter={(v) => v.toLocaleString()}
                    axisLine={false}
                    tickLine={false}
                    orientation="right"
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Equity"]}
                    labelFormatter={(label) => new Date(label).toLocaleDateString("en-CA")}
                  />
                  <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400">
                데이터가 없습니다
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
                    {formatCurrency(summary?.totalTodayPnLCad || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Open P&amp;L</span>
                  <span className={`font-medium ${(summary?.totalOpenPnLCad || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {(summary?.totalOpenPnLCad || 0) >= 0 ? "+" : ""}
                    {formatCurrency(summary?.totalOpenPnLCad || 0)}
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
                    {formatCurrency(summary?.totalEquityCad || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Market value</span>
                  <span className="font-medium">
                    {formatCurrency(marketValue)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Cash</span>
                  <span className="font-medium">
                    {formatCurrency(totalCash)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dotted border-gray-200">
                  <span className="text-gray-600">Buying power</span>
                  <span className="font-medium">
                    {formatCurrency(Math.max(0, totalCash))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
