"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
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

interface Transaction {
  id: string;
  transactionDate: string;
  settlementDate: string;
  action: string;
  symbol: string | null;
  symbolMapped: string | null;
  description: string;
  quantity: number | null;
  price: number | null;
  netAmount: number | null;
  currency: string;
  activityType: string;
  account: {
    accountNumber: string;
    accountType: string;
    nickname: string | null;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function TransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filter state
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("");

  // Filter options
  const [actions, setActions] = useState<string[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);

  useEffect(() => {
    fetchAccounts();
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [pagination.page, accountFilter, yearFilter, actionFilter, symbolFilter]);

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  }

  async function fetchFilterOptions() {
    try {
      const [actionsRes, symbolsRes, yearsRes] = await Promise.all([
        fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "actions" }),
        }),
        fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "symbols" }),
        }),
        fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "years" }),
        }),
      ]);

      setActions(await actionsRes.json());
      setSymbols(await symbolsRes.json());
      setYears(await yearsRes.json());
    } catch (error) {
      console.error("Failed to fetch filter options:", error);
    }
  }

  async function fetchTransactions() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", pagination.page.toString());
      params.set("limit", pagination.limit.toString());

      if (accountFilter !== "all") {
        params.set("accountId", accountFilter);
      }
      if (yearFilter !== "all") {
        params.set("year", yearFilter);
      }
      if (actionFilter !== "all") {
        params.set("action", actionFilter);
      }
      if (symbolFilter) {
        params.set("symbol", symbolFilter);
      }

      const res = await fetch(`/api/transactions?${params.toString()}`);
      const data = await res.json();

      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setAccountFilter("all");
    setYearFilter("all");
    setActionFilter("all");
    setSymbolFilter("");
    setPagination((prev) => ({ ...prev, page: 1 }));
  }

  const hasActiveFilters = accountFilter !== "all" || yearFilter !== "all" || actionFilter !== "all" || symbolFilter !== "";

  function getActionStyle(action: string): string {
    switch (action) {
      case "Buy":
        return "bg-blue-100 text-blue-700";
      case "Sell":
        return "bg-red-100 text-red-700";
      case "DIV":
      case "REI":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger variant="compact">
              <SelectValue placeholder="ACC" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ACC</SelectItem>
              {accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.accountType}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger variant="compact">
              <SelectValue placeholder="YR" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">YR</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger variant="compact">
              <SelectValue placeholder="ACT" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ACT</SelectItem>
              {actions.map((action) => (
                <SelectItem key={action} value={action}>
                  {action}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={symbolFilter || "all"} onValueChange={(value) => setSymbolFilter(value === "all" ? "" : value)}>
            <SelectTrigger variant="compact">
              <SelectValue placeholder="SYM" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">SYM</SelectItem>
              {symbols.map((symbol) => (
                <SelectItem key={symbol} value={symbol}>
                  {symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Transactions table */}
      <div>
        <div className="border-b border-gray-200 mb-4 flex justify-between items-center">
          <span className="pb-2 text-xs font-semibold tracking-wider text-[#0a8043] border-b-[3px] border-[#0a8043] inline-block">
            TRANSACTIONS
          </span>
          <span className="text-sm text-gray-500">{pagination.total} total</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-500">No transactions</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-[#e8eaed]">
                    <th className="w-24 text-left py-2.5 px-3 text-xs font-normal text-[#5f6368]">
                      Date
                    </th>
                    <th className="w-16 text-left py-2.5 px-3 text-xs font-normal text-[#5f6368]">
                      Account
                    </th>
                    <th className="w-14 text-left py-2.5 px-3 text-xs font-normal text-[#5f6368]">
                      Action
                    </th>
                    <th className="w-16 text-left py-2.5 px-3 text-xs font-normal text-[#5f6368]">
                      Symbol
                    </th>
                    <th className="w-20 text-right py-2.5 px-3 text-xs font-normal text-[#5f6368]">
                      Qty
                    </th>
                    <th className="w-20 text-right py-2.5 px-3 text-xs font-normal text-[#5f6368]">
                      Price
                    </th>
                    <th className="w-24 text-right py-2.5 px-3 text-xs font-normal text-[#5f6368]">
                      Amount
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-normal text-[#5f6368]">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, idx) => (
                    <tr
                      key={tx.id}
                      className={idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"}
                    >
                      <td className="py-3 px-3 text-sm text-[#202124] whitespace-nowrap">
                        {formatDate(tx.settlementDate)}
                      </td>
                      <td className="py-3 px-3 text-sm text-[#5f6368]">
                        {tx.account.accountType}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 text-xs rounded font-medium ${getActionStyle(
                            tx.action
                          )}`}
                        >
                          {tx.action}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-sm text-[#202124]">
                        {tx.symbolMapped || tx.symbol || "-"}
                      </td>
                      <td className="py-3 px-3 text-right text-sm text-[#202124]">
                        {tx.quantity ? formatNumber(tx.quantity) : "-"}
                      </td>
                      <td className="py-3 px-3 text-right text-sm text-[#202124]">
                        {tx.price ? formatCurrency(tx.price) : "-"}
                      </td>
                      <td
                        className={`py-3 px-3 text-right text-sm font-medium ${
                          (tx.netAmount || 0) >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {tx.netAmount
                          ? formatCurrency(tx.netAmount)
                          : "-"}
                      </td>
                      <td className="py-3 px-3 truncate text-xs text-[#5f6368]">
                        {tx.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 mt-4">
              <div className="text-sm text-gray-500">
                {(pagination.page - 1) * pagination.limit + 1} -{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
                of {pagination.total}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
