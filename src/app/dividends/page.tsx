"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatNumberTrim } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
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

interface DividendData {
  month: string;
  totalAmount: number;
  currency: string;
}

interface DividendBySymbol {
  symbol: string;
  totalAmount: number;
  currency: string;
  count: number;
}

// Yahoo Finance based projection
interface YahooProjection {
  symbol: string;
  currency: string;
  quantity: number;
  price: number;
  marketValue: number;
  dividendYield: number | null;
  annualDividendPerShare: number | null;
  projectedAnnualDividend: number;
  projectedQuarterlyDividend: number;
  projectedMonthlyDividend: number;
}

interface YahooProjectionSummary {
  projections: YahooProjection[];
  totalProjectedAnnual: number;
  totalProjectedMonthly: number;
  year: number;
}

interface MonthlyYahooProjection {
  month: string;
  totalAmount: number;
  currency: string;
}

type CurrencyView = "cad" | "usd";
type DataTab = "bySymbol" | "projected";

export default function DividendsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [currencyView, setCurrencyView] = useState<CurrencyView>("cad");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("all");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [dividends, setDividends] = useState<DividendData[]>([]);
  const [dividendsBySymbol, setDividendsBySymbol] = useState<DividendBySymbol[]>([]);
  const [yahooProjections, setYahooProjections] = useState<YahooProjectionSummary | null>(null);
  const [yahooMonthlyProjections, setYahooMonthlyProjections] = useState<MonthlyYahooProjection[]>([]);
  const [projectedSymbols, setProjectedSymbols] = useState<string[]>([]);
  const [selectedProjectedSymbol, setSelectedProjectedSymbol] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [fxRate] = useState(1.35); // CAD/USD exchange rate
  const [dataTab, setDataTab] = useState<DataTab>("bySymbol");

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchYahooProjections();
  }, [selectedAccount]);

  useEffect(() => {
    if (dataTab === "projected") {
      fetchYahooMonthlyProjections();
    }
  }, [selectedAccount, selectedProjectedSymbol, dataTab]);

  useEffect(() => {
    fetchYears();
  }, [selectedAccount]);

  useEffect(() => {
    if (selectedYear) {
      fetchSymbols();
    }
  }, [selectedAccount, selectedYear]);

  useEffect(() => {
    if (selectedYear) {
      fetchDividends();
      fetchDividendsBySymbol();
    }
  }, [selectedAccount, selectedYear, selectedSymbol]);

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  }

  async function fetchYears() {
    try {
      const accountParam = selectedAccount !== "all" ? `&accountId=${selectedAccount}` : "";
      const res = await fetch(`/api/dividends?type=years${accountParam}`);
      const data = await res.json();
      setAvailableYears(data);
      // Set current year or most recent year as default
      const currentYear = new Date().getFullYear();
      if (data.includes(currentYear)) {
        setSelectedYear(currentYear);
      } else if (data.length > 0) {
        setSelectedYear(data[0]);
      }
    } catch (error) {
      console.error("Failed to fetch years:", error);
    }
  }

  async function fetchSymbols() {
    try {
      let url = `/api/dividends?type=symbols&year=${selectedYear}`;
      if (selectedAccount !== "all") {
        url += `&accountId=${selectedAccount}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setSymbols(data);
      // Reset selected symbol if it's not in the new list
      if (selectedSymbol !== "all" && !data.includes(selectedSymbol)) {
        setSelectedSymbol("all");
      }
    } catch (error) {
      console.error("Failed to fetch symbols:", error);
    }
  }

  async function fetchDividends() {
    setLoading(true);
    try {
      let url = `/api/dividends?year=${selectedYear}`;
      if (selectedAccount !== "all") {
        url += `&accountId=${selectedAccount}`;
      }
      if (selectedSymbol !== "all") {
        url += `&symbol=${selectedSymbol}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      setDividends(data);
    } catch (error) {
      console.error("Failed to fetch dividends:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDividendsBySymbol() {
    try {
      let url = `/api/dividends?type=bySymbol&year=${selectedYear}`;
      if (selectedAccount !== "all") {
        url += `&accountId=${selectedAccount}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      setDividendsBySymbol(data);
    } catch (error) {
      console.error("Failed to fetch dividends by symbol:", error);
    }
  }

  async function fetchYahooProjections() {
    try {
      const accountParam = selectedAccount !== "all" ? `&accountId=${selectedAccount}` : "";
      const res = await fetch(`/api/dividends?type=yahooProjected${accountParam}`);
      const data = await res.json();
      setYahooProjections(data);
      // Set projected symbols from yahoo projections
      if (data.projections) {
        setProjectedSymbols(data.projections.map((p: YahooProjection) => p.symbol));
      }
    } catch (error) {
      console.error("Failed to fetch yahoo projections:", error);
    }
  }

  async function fetchYahooMonthlyProjections() {
    try {
      let url = `/api/dividends?type=yahooMonthlyProjected`;
      if (selectedAccount !== "all") {
        url += `&accountId=${selectedAccount}`;
      }
      if (selectedProjectedSymbol !== "all") {
        url += `&symbol=${selectedProjectedSymbol}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setYahooMonthlyProjections(data);
    } catch (error) {
      console.error("Failed to fetch yahoo monthly projections:", error);
    }
  }

  // Chart data - 12 months for selected year, single value based on currency view
  const chartData = (() => {
    const months: { month: string; monthLabel: string; amount: number }[] = [];

    // Create all 12 months
    for (let m = 0; m < 12; m++) {
      const monthStr = `${selectedYear}-${String(m + 1).padStart(2, "0")}`;
      const monthLabel = new Date(selectedYear, m, 1).toLocaleDateString("en-CA", { month: "short" });
      months.push({ month: monthStr, monthLabel, amount: 0 });
    }

    // Fill in data based on currency view (combined CAD or USD)
    for (const div of dividends) {
      const monthData = months.find((d) => d.month === div.month);
      if (monthData) {
        if (currencyView === "cad") {
          // Convert to CAD for combined view
          if (div.currency === "USD") {
            monthData.amount += div.totalAmount * fxRate;
          } else {
            monthData.amount += div.totalAmount;
          }
        } else {
          // Convert to USD for combined view
          if (div.currency === "CAD") {
            monthData.amount += div.totalAmount / fxRate;
          } else {
            monthData.amount += div.totalAmount;
          }
        }
      }
    }

    return months;
  })();

  // Chart data for projections - actual payment months from Yahoo Finance + historical schedule
  const projectionChartData = (() => {
    const currentYear = new Date().getFullYear();
    const months: { month: string; monthLabel: string; amount: number }[] = [];

    // Create all 12 months
    for (let m = 0; m < 12; m++) {
      const monthStr = `${currentYear}-${String(m + 1).padStart(2, "0")}`;
      const monthLabel = new Date(currentYear, m, 1).toLocaleDateString("en-CA", { month: "short" });
      months.push({ month: monthStr, monthLabel, amount: 0 });
    }

    // Fill in data from yahooMonthlyProjections based on currency view
    for (const proj of yahooMonthlyProjections) {
      const monthData = months.find((d) => d.month === proj.month);
      if (monthData) {
        if (currencyView === "cad") {
          if (proj.currency === "USD") {
            monthData.amount += proj.totalAmount * fxRate;
          } else {
            monthData.amount += proj.totalAmount;
          }
        } else {
          if (proj.currency === "CAD") {
            monthData.amount += proj.totalAmount / fxRate;
          } else {
            monthData.amount += proj.totalAmount;
          }
        }
      }
    }

    return months;
  })();

  // Total projected amount from Yahoo Finance
  const totalProjectedAmount = (() => {
    if (!yahooProjections?.projections) return 0;

    let total = 0;
    for (const proj of yahooProjections.projections) {
      if (currencyView === "cad") {
        if (proj.currency === "USD") {
          total += proj.projectedAnnualDividend * fxRate;
        } else {
          total += proj.projectedAnnualDividend;
        }
      } else {
        if (proj.currency === "CAD") {
          total += proj.projectedAnnualDividend / fxRate;
        } else {
          total += proj.projectedAnnualDividend;
        }
      }
    }
    return total;
  })();

  // Calculate projected monthly average from actual payment months
  const projectedMonthlyAverage = (() => {
    const monthsWithPayments = projectionChartData.filter(m => m.amount > 0).length;
    const totalFromChart = projectionChartData.reduce((sum, m) => sum + m.amount, 0);
    return monthsWithPayments > 0 ? totalFromChart / 12 : 0;
  })();

  // Total dividends calculation based on currency view
  const totalAmount = (() => {
    const totalUSD = dividends
      .filter((d) => d.currency === "USD")
      .reduce((sum, d) => sum + d.totalAmount, 0);
    const totalCAD = dividends
      .filter((d) => d.currency === "CAD")
      .reduce((sum, d) => sum + d.totalAmount, 0);

    if (currencyView === "cad") {
      return totalCAD + totalUSD * fxRate;
    } else {
      return totalUSD + totalCAD / fxRate;
    }
  })();

  // Get currency label for display
  const getCurrencyLabel = () => {
    return currencyView === "cad" ? "CAD" : "USD";
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length > 0 && payload[0].value > 0) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
          <div className="text-gray-500 mb-1">{label} {selectedYear}</div>
          <div className="font-medium text-[#0a8043]">
            {formatCurrency(payload[0].value)}
            <span className="text-gray-400 text-xs ml-1">{getCurrencyLabel()}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const currencyViews: { value: CurrencyView; label: string }[] = [
    { value: "cad", label: "CAD" },
    { value: "usd", label: "USD" },
  ];

  // 월별 평균 계산
  const monthlyAverage = totalAmount / 12;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Total dividends header with account select */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs md:text-sm text-gray-500 mb-1">
            Total dividends ({selectedYear})
          </div>
          <div className="text-3xl md:text-4xl font-bold text-gray-900">
            {formatCurrency(totalAmount)}
            <span className="text-sm md:text-base font-normal text-gray-400 ml-2">{getCurrencyLabel()}</span>
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

      {/* Chart Card */}
      <div className="bg-white rounded-2xl p-3 md:p-5 shadow-sm border border-gray-100">
        {/* Chart header */}
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <div className="flex items-center gap-3">
            {/* 범례 */}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#16a34a]" />
              <span className="text-[10px] md:text-xs text-gray-500 font-medium">Monthly</span>
            </div>
          </div>
          {/* 월 평균 */}
          <div className="text-right">
            <div className="text-[10px] text-gray-400">Avg/month</div>
            <div className="text-xs md:text-sm font-semibold text-[#0a8043]">
              ${formatNumberTrim(dataTab === "bySymbol" ? monthlyAverage : projectedMonthlyAverage)}
            </div>
          </div>
        </div>

        {/* Filters: Symbol, Year, Currency */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {dataTab === "bySymbol" ? (
            <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
              <SelectTrigger variant="compact">
                <SelectValue placeholder="All symbols" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All symbols</SelectItem>
                {symbols.map((symbol) => (
                  <SelectItem key={symbol} value={symbol}>
                    {symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={selectedProjectedSymbol} onValueChange={setSelectedProjectedSymbol}>
              <SelectTrigger variant="compact">
                <SelectValue placeholder="All symbols" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All symbols</SelectItem>
                {projectedSymbols.map((symbol) => (
                  <SelectItem key={symbol} value={symbol}>
                    {symbol.replace(".TO", "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {dataTab === "bySymbol" && (
            <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
              <SelectTrigger variant="compact">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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

        {loading ? (
          <div className="h-[200px] md:h-[280px] flex items-center justify-center text-gray-500">
            Loading...
          </div>
        ) : dataTab === "bySymbol" ? (
          <div className="h-[200px] md:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="12%">
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16a34a" stopOpacity={1} />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal={true} vertical={false} strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickFormatter={(v) => `$${v}`}
                axisLine={false}
                tickLine={false}
                orientation="right"
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] md:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projectionChartData} barCategoryGap="12%">
              <defs>
                <linearGradient id="projBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16a34a" stopOpacity={1} />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal={true} vertical={false} strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickFormatter={(v) => `$${v}`}
                axisLine={false}
                tickLine={false}
                orientation="right"
                width={40}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length > 0 && payload[0].value && Number(payload[0].value) > 0) {
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                        <div className="text-gray-500 mb-1">{label} (Projected)</div>
                        <div className="font-medium text-[#0a8043]">
                          {formatCurrency(Number(payload[0].value))}
                          <span className="text-gray-400 text-xs ml-1">{getCurrencyLabel()}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="amount" fill="url(#projBarGradient)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}

        {/* Summary bar */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4 md:gap-6">
            <div>
              <div className="text-[10px] text-gray-400">
                {dataTab === "bySymbol" ? "YTD Total" : "Est. Annual"}
              </div>
              <div className="text-xs md:text-sm font-medium text-gray-700">
                ${formatNumberTrim(dataTab === "bySymbol" ? totalAmount : totalProjectedAmount)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400">
                {dataTab === "bySymbol" ? "Payments" : "Symbols"}
              </div>
              <div className="text-xs md:text-sm font-medium text-gray-700">
                {dataTab === "bySymbol" ? dividends.length : yahooProjections?.projections.length || 0}
              </div>
            </div>
          </div>
          <div className="px-2 py-1 rounded-full text-[10px] md:text-xs font-medium bg-green-50 text-[#0a8043]">
            {getCurrencyLabel()}
          </div>
        </div>
      </div>

      {/* Data section with tabs */}
      <div>
        <div className="border-b border-gray-200 mb-4 flex gap-4">
          <button
            onClick={() => setDataTab("bySymbol")}
            className={`pb-2 text-xs font-semibold tracking-wider transition-colors ${
              dataTab === "bySymbol"
                ? "text-[#0a8043] border-b-[3px] border-[#0a8043]"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            BY SYMBOL
          </button>
          <button
            onClick={() => setDataTab("projected")}
            className={`pb-2 text-xs font-semibold tracking-wider transition-colors ${
              dataTab === "projected"
                ? "text-[#0a8043] border-b-[3px] border-[#0a8043]"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            PROJECTED
          </button>
        </div>
        {/* By Symbol Tab Content */}
        {dataTab === "bySymbol" && (
          dividendsBySymbol.length === 0 ? (
            <div className="text-gray-500 text-sm">No dividend data</div>
          ) : (
            <>
              {/* 모바일 카드 뷰 */}
              <div className="md:hidden space-y-2">
                {dividendsBySymbol.map((div, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-gray-900 tracking-tight">
                          {div.symbol.replace(".TO", "")}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          div.currency === "CAD"
                            ? "bg-red-50 text-red-600 border border-red-100"
                            : "bg-blue-50 text-blue-600 border border-blue-100"
                        }`}>
                          {div.currency}
                        </span>
                      </div>
                      <div className="text-lg font-bold text-[#0a8043]">
                        ${formatNumberTrim(div.totalAmount)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{div.count} payments</span>
                      <span>~${formatNumberTrim(div.totalAmount / div.count)}/payment</span>
                    </div>
                  </div>
                ))}
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
                        Payments
                      </th>
                      <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                        Total amount
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                        Currency
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dividendsBySymbol.map((div, idx) => (
                      <tr
                        key={idx}
                        className={idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"}
                      >
                        <td className="py-3 px-4 font-medium text-sm text-[#202124]">{div.symbol}</td>
                        <td className="py-3 px-4 text-right text-sm text-[#202124]">{div.count}</td>
                        <td className="py-3 px-4 text-right text-sm text-green-600 font-medium">
                          {formatCurrency(div.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-sm text-[#5f6368]">
                          {div.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}

        {/* Projected Tab Content - Yahoo Finance based */}
        {dataTab === "projected" && yahooProjections && yahooProjections.projections.length > 0 && (
          <>
            {/* Summary Card */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 mb-4 border border-green-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Est. monthly dividend</div>
                  <div className="text-2xl font-bold text-[#0a8043]">
                    ${formatNumberTrim(totalProjectedAmount / 12)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">Est. annual total</div>
                  <div className="text-lg font-semibold text-gray-700">
                    ${formatNumberTrim(totalProjectedAmount)}
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-green-200/50 text-[10px] text-gray-500">
                Based on Yahoo Finance dividend data ({getCurrencyLabel()})
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-2">
              {yahooProjections.projections.map((proj, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-gray-900 tracking-tight">
                        {proj.symbol.replace(".TO", "")}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        proj.currency === "CAD"
                          ? "bg-red-50 text-red-600 border border-red-100"
                          : "bg-blue-50 text-blue-600 border border-blue-100"
                      }`}>
                        {proj.currency}
                      </span>
                    </div>
                    {proj.dividendYield && proj.dividendYield > 0 ? (
                      <div className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                        {proj.dividendYield.toFixed(2)}% yield
                      </div>
                    ) : (
                      <div className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                        No dividend
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-gray-400">Shares</div>
                      <div className="font-medium text-gray-700">{formatNumberTrim(proj.quantity)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Annual/Share</div>
                      <div className="font-medium text-gray-700">
                        {proj.annualDividendPerShare ? `$${proj.annualDividendPerShare.toFixed(2)}` : '-'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-400">Est. Annual</div>
                      <div className="font-bold text-[#0a8043]">${formatNumberTrim(proj.projectedAnnualDividend)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8eaed]">
                    <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Symbol
                    </th>
                    <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Shares
                    </th>
                    <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Price
                    </th>
                    <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Yield
                    </th>
                    <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Annual/Share
                    </th>
                    <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Est. Annual
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {yahooProjections.projections.map((proj, idx) => (
                    <tr
                      key={idx}
                      className={idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-[#202124]">
                            {proj.symbol.replace(".TO", "")}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            proj.currency === "CAD"
                              ? "bg-red-50 text-red-600"
                              : "bg-blue-50 text-blue-600"
                          }`}>
                            {proj.currency}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-[#202124]">
                        {formatNumberTrim(proj.quantity)}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-[#202124]">
                        ${formatNumberTrim(proj.price)}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-[#5f6368]">
                        {proj.dividendYield ? `${proj.dividendYield.toFixed(2)}%` : '-'}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-[#202124]">
                        {proj.annualDividendPerShare ? `$${proj.annualDividendPerShare.toFixed(2)}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-green-600 font-medium">
                        ${formatNumberTrim(proj.projectedAnnualDividend)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
