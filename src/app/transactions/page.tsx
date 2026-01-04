"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

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
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState<string>("");

  // Filter options
  const [actions, setActions] = useState<string[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);

  useEffect(() => {
    fetchAccounts();
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [pagination.page, accountFilter, actionFilter]);

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
      const [actionsRes, symbolsRes] = await Promise.all([
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
      ]);

      setActions(await actionsRes.json());
      setSymbols(await symbolsRes.json());
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
      if (actionFilter !== "all") {
        params.set("action", actionFilter);
      }
      if (symbolFilter) {
        params.set("symbol", symbolFilter);
      }
      if (searchFilter) {
        params.set("search", searchFilter);
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

  function handleSearch() {
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchTransactions();
  }

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
    <div className="space-y-6">
      {/* Account tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setAccountFilter("all")}
          className={`px-4 py-3 rounded-lg border transition-colors ${
            accountFilter === "all"
              ? "border-gray-300 bg-white"
              : "border-gray-200 bg-gray-50 hover:bg-white"
          }`}
        >
          All accounts
        </button>
        {accounts.map((acc) => (
          <button
            key={acc.id}
            onClick={() => setAccountFilter(acc.id)}
            className={`px-4 py-3 rounded-lg border transition-colors ${
              accountFilter === acc.id
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

      {/* Filters */}
      <div className="bg-white rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="all">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>

          <select
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">All symbols</option>
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search description..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />

          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Search
          </button>
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
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8eaed]">
                    <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Date
                    </th>
                    <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Account
                    </th>
                    <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Action
                    </th>
                    <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Symbol
                    </th>
                    <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Qty
                    </th>
                    <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Price
                    </th>
                    <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Net amount
                    </th>
                    <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                      Currency
                    </th>
                    <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368] max-w-[200px]">
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
                      <td className="py-3 px-4 text-sm text-[#202124] whitespace-nowrap">
                        {formatDate(tx.settlementDate)}
                      </td>
                      <td className="py-3 px-4 text-sm text-[#5f6368]">
                        {tx.account.accountType}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 text-xs rounded font-medium ${getActionStyle(
                            tx.action
                          )}`}
                        >
                          {tx.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-sm text-[#202124]">
                        {tx.symbolMapped || tx.symbol || "-"}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-[#202124]">
                        {tx.quantity ? formatNumber(tx.quantity) : "-"}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-[#202124]">
                        {tx.price ? formatCurrency(tx.price) : "-"}
                      </td>
                      <td
                        className={`py-3 px-4 text-right text-sm font-medium ${
                          (tx.netAmount || 0) >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {tx.netAmount
                          ? formatCurrency(tx.netAmount)
                          : "-"}
                      </td>
                      <td className="py-3 px-4 text-sm text-[#5f6368]">
                        {tx.currency}
                      </td>
                      <td className="py-3 px-4 max-w-[200px] truncate text-xs text-[#5f6368]">
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
