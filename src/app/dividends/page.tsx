"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
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

type CurrencyView = "combined_cad" | "combined_usd" | "USD" | "CAD";

export default function DividendsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [currencyView, setCurrencyView] = useState<CurrencyView>("combined_cad");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("all");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [dividends, setDividends] = useState<DividendData[]>([]);
  const [dividendsBySymbol, setDividendsBySymbol] = useState<DividendBySymbol[]>([]);
  const [loading, setLoading] = useState(true);
  const [fxRate] = useState(1.35); // CAD/USD exchange rate

  useEffect(() => {
    fetchAccounts();
  }, []);

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

  // Chart data - 12 months for selected year, single value based on currency view
  const chartData = (() => {
    const months: { month: string; monthLabel: string; amount: number }[] = [];

    // Create all 12 months
    for (let m = 0; m < 12; m++) {
      const monthStr = `${selectedYear}-${String(m + 1).padStart(2, "0")}`;
      const monthLabel = new Date(selectedYear, m, 1).toLocaleDateString("en-CA", { month: "short" });
      months.push({ month: monthStr, monthLabel, amount: 0 });
    }

    // Fill in data based on currency view
    for (const div of dividends) {
      const monthData = months.find((d) => d.month === div.month);
      if (monthData) {
        if (currencyView === "combined_cad") {
          // Convert to CAD for combined view
          if (div.currency === "USD") {
            monthData.amount += div.totalAmount * fxRate;
          } else {
            monthData.amount += div.totalAmount;
          }
        } else if (currencyView === "combined_usd") {
          // Convert to USD for combined view
          if (div.currency === "CAD") {
            monthData.amount += div.totalAmount / fxRate;
          } else {
            monthData.amount += div.totalAmount;
          }
        } else if (currencyView === div.currency) {
          monthData.amount += div.totalAmount;
        }
      }
    }

    return months;
  })();

  // Total dividends calculation based on currency view
  const totalAmount = (() => {
    const totalUSD = dividends
      .filter((d) => d.currency === "USD")
      .reduce((sum, d) => sum + d.totalAmount, 0);
    const totalCAD = dividends
      .filter((d) => d.currency === "CAD")
      .reduce((sum, d) => sum + d.totalAmount, 0);

    if (currencyView === "combined_cad") {
      return totalCAD + totalUSD * fxRate;
    } else if (currencyView === "combined_usd") {
      return totalUSD + totalCAD / fxRate;
    } else {
      return dividends
        .filter((d) => d.currency === currencyView)
        .reduce((sum, d) => sum + d.totalAmount, 0);
    }
  })();

  // Get currency label for display
  const getCurrencyLabel = () => {
    if (currencyView === "combined_cad") return "CAD";
    if (currencyView === "combined_usd") return "USD";
    return currencyView;
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
    { value: "combined_cad", label: "Combined (CAD)" },
    { value: "combined_usd", label: "Combined (USD)" },
    { value: "CAD", label: "CAD" },
    { value: "USD", label: "USD" },
  ];

  return (
    <div className="space-y-6">
      {/* Account tabs */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => setSelectedAccount("all")}
          className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
            selectedAccount === "all"
              ? "bg-[#0a8043] text-white shadow-md shadow-[#0a8043]/20"
              : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
          }`}
        >
          All
        </button>
        {accounts.map((acc) => (
          <button
            key={acc.id}
            onClick={() => setSelectedAccount(acc.id)}
            className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
              selectedAccount === acc.id
                ? "bg-[#0a8043] text-white shadow-md shadow-[#0a8043]/20"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            {acc.accountType}
          </button>
        ))}
      </div>

      {/* Total dividends header */}
      <div>
        <div className="text-sm text-gray-500 mb-1">
          Total dividends ({selectedYear})
        </div>
        <div className="text-4xl font-bold text-gray-900">
          {formatCurrency(totalAmount)}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg p-4">
        {/* Symbol filter */}
        <div className="flex items-center gap-2 mb-4">
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
        </div>

        {loading ? (
          <div className="h-[300px] flex items-center justify-center text-gray-500">
            Loading...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} barCategoryGap="15%">
              <CartesianGrid horizontal={true} vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v) => `$${v}`}
                axisLine={false}
                tickLine={false}
                orientation="right"
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Year selection - last 5 years as buttons, older in dropdown */}
      <div className="flex gap-2 flex-wrap items-center">
        {availableYears.slice(0, 5).map((year) => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            className={`px-4 py-2 rounded-full border text-sm transition-colors ${
              selectedYear === year
                ? "border-gray-400 bg-white font-medium"
                : "border-gray-200 bg-gray-50 hover:bg-white text-gray-600"
            }`}
          >
            {year}
          </button>
        ))}
        {availableYears.length > 5 && (
          <Select
            value={availableYears.slice(5).includes(selectedYear) ? String(selectedYear) : ""}
            onValueChange={(value) => setSelectedYear(Number(value))}
          >
            <SelectTrigger variant="compact">
              <SelectValue placeholder="More..." />
            </SelectTrigger>
            <SelectContent>
              {availableYears.slice(5).map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Currency view selection */}
      <div className="flex gap-2 flex-wrap">
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

      {/* Dividends by symbol table */}
      <div>
        <div className="border-b border-gray-200 mb-4">
          <span className="pb-2 text-xs font-semibold tracking-wider text-[#0a8043] border-b-[3px] border-[#0a8043] inline-block">
            DIVIDENDS BY SYMBOL
          </span>
        </div>
        {dividendsBySymbol.length === 0 ? (
          <div className="text-gray-500">No dividend data</div>
        ) : (
          <div className="overflow-x-auto">
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
        )}
      </div>
    </div>
  );
}
