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
  Legend,
} from "recharts";

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

export default function DividendsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("all");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [dividends, setDividends] = useState<DividendData[]>([]);
  const [dividendsBySymbol, setDividendsBySymbol] = useState<DividendBySymbol[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchSymbols();
    fetchDividends();
    fetchDividendsBySymbol();
  }, [selectedAccount]);

  useEffect(() => {
    fetchDividends();
  }, [selectedSymbol]);

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  }

  async function fetchSymbols() {
    try {
      const accountParam =
        selectedAccount !== "all" ? `&accountId=${selectedAccount}` : "";
      const res = await fetch(`/api/dividends?type=symbols${accountParam}`);
      const data = await res.json();
      setSymbols(data);
    } catch (error) {
      console.error("Failed to fetch symbols:", error);
    }
  }

  async function fetchDividends() {
    setLoading(true);
    try {
      let url = "/api/dividends?months=12";
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
      let url = "/api/dividends?type=bySymbol&months=12";
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

  // Monthly chart data preparation (USD and CAD separated)
  const chartData = dividends.reduce(
    (acc, div) => {
      const existing = acc.find((d) => d.month === div.month);
      if (existing) {
        if (div.currency === "USD") {
          existing.USD = (existing.USD || 0) + div.totalAmount;
        } else {
          existing.CAD = (existing.CAD || 0) + div.totalAmount;
        }
      } else {
        acc.push({
          month: div.month,
          USD: div.currency === "USD" ? div.totalAmount : 0,
          CAD: div.currency === "CAD" ? div.totalAmount : 0,
        });
      }
      return acc;
    },
    [] as { month: string; USD: number; CAD: number }[]
  ).sort((a, b) => a.month.localeCompare(b.month));

  // Total dividends calculation
  const totalUSD = dividends
    .filter((d) => d.currency === "USD")
    .reduce((sum, d) => sum + d.totalAmount, 0);
  const totalCAD = dividends
    .filter((d) => d.currency === "CAD")
    .reduce((sum, d) => sum + d.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Account tabs */}
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">
            12-month total (USD)
          </div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(totalUSD)}
          </div>
        </div>

        <div className="bg-white rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">
            12-month total (CAD)
          </div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(totalCAD)}
          </div>
        </div>
      </div>

      {/* Symbol filter + Chart */}
      <div className="bg-white rounded-lg">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-wider text-[#5f6368] uppercase">Monthly dividends</h3>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-[150px] px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="all">All symbols</option>
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              Loading...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              No dividend data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickFormatter={(v) => v.substring(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name,
                  ]}
                />
                <Legend />
                <Bar dataKey="USD" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="CAD" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
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
