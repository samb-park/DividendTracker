"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Transaction {
  id: string;
  action: string;
  description: string;
  normalizedSymbol: string | null;
  symbol: string | null;
  settlementDate: string;
  netAmount: number | null;
  currency: string;
  account: {
    id: string;
    name: string | null;
    accountType: string;
  };
}

interface MonthGroup {
  key: string;
  label: string;
  total: number;
  transactions: Transaction[];
}

export default function CalendarPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDividends() {
      setLoading(true);
      try {
        const res = await fetch("/api/transactions?action=DIVIDEND&limit=200");
        const data = await res.json();
        setTransactions(data.transactions || []);
      } finally {
        setLoading(false);
      }
    }
    fetchDividends();
  }, []);

  const totalDividends = useMemo(
    () => transactions.reduce((sum, tx) => sum + (tx.netAmount || 0), 0),
    [transactions]
  );

  const uniqueSymbols = useMemo(() => {
    const symbols = new Set(
      transactions
        .map((tx) => tx.normalizedSymbol || tx.symbol)
        .filter(Boolean)
    );
    return symbols.size;
  }, [transactions]);

  const monthGroups = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    for (const tx of transactions) {
      const d = new Date(tx.settlementDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    }
    const sorted = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sorted.map((key): MonthGroup => {
      const [year, month] = key.split("-");
      const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
        "en-US",
        { month: "long", year: "numeric" }
      );
      const txs = groups[key].sort(
        (a, b) => new Date(b.settlementDate).getTime() - new Date(a.settlementDate).getTime()
      );
      const total = txs.reduce((sum, tx) => sum + (tx.netAmount || 0), 0);
      return { key, label, total, transactions: txs };
    });
  }, [transactions]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Hero header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 md:p-7">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-[#0a8043] uppercase mb-2">
            Calendar
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white">
            Dividend Calendar
          </h1>
          <p className="mt-3 text-sm md:text-base text-gray-600 dark:text-slate-400 max-w-2xl">
            Track every dividend payment across your accounts, grouped by month.
          </p>

          {/* Summary cards */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-3">
            <SummaryCard label="Total received" value={formatCurrency(totalDividends)} />
            <SummaryCard label="Dividend events" value={String(transactions.length)} />
            <SummaryCard label="Unique symbols" value={String(uniqueSymbols)} />
          </div>
        </div>
      </div>

      {/* Monthly grouped list */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm p-8 text-center text-sm text-gray-500 dark:text-slate-400">
          Loading dividend history...
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-8 text-center text-gray-500 dark:text-slate-400">
          No dividend transactions yet. Once your accounts receive dividends they will appear here.
        </div>
      ) : (
        monthGroups.map((group) => (
          <div
            key={group.key}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden"
          >
            {/* Month header */}
            <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">
                  {group.label}
                </div>
                <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                  {group.transactions.length} dividend{group.transactions.length !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(group.total)}
                </div>
              </div>
            </div>

            {/* Dividend events */}
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {group.transactions.map((tx) => (
                <div key={tx.id} className="p-4 md:p-5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {tx.normalizedSymbol || tx.symbol || "—"}
                      </span>
                      <span className="px-2 py-0.5 text-[11px] font-medium rounded-full border bg-green-50 text-green-700 border-green-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20">
                        {tx.currency}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {tx.account.name || tx.account.accountType} &middot; {formatDate(tx.settlementDate)}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-slate-400 mt-1 truncate">
                      {tx.description}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-green-600 dark:text-emerald-400">
                      {tx.netAmount != null ? formatCurrency(tx.netAmount) : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}
