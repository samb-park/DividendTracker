"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, formatCurrency, formatNumber } from "@/lib/utils";

interface Account {
  id: string;
  name: string | null;
  accountNumber: string | null;
  accountType: string;
  broker?: string;
  isActive: boolean;
}

interface Holding {
  symbol: string;
  quantity: number;
  netInvested: number;
  transactions: number;
}

interface PortfolioTransaction {
  id: string;
  action: string;
  description: string;
  normalizedSymbol: string | null;
  symbol: string | null;
  settlementDate: string;
  netAmount: number | null;
  quantity: number | null;
  price: number | null;
  currency: string;
  account: {
    id: string;
    name: string | null;
    accountType: string;
  };
}

export default function PortfolioPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [selectedScope, setSelectedScope] = useState<string>("combined");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(scope: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/portfolio?accountId=${scope}`);
      const data = await res.json();
      setAccounts(data.accounts || []);
      setHoldings(data.holdings || []);
      setTransactions(data.transactions || []);
      setSelectedSymbol((prev) => {
        if (!data.holdings?.length) return null;
        if (prev && data.holdings.some((h: Holding) => h.symbol === prev)) return prev;
        return data.holdings[0].symbol;
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(selectedScope);
  }, [selectedScope]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedScope) || null,
    [accounts, selectedScope]
  );

  const symbolTransactions = useMemo(() => {
    if (!selectedSymbol) return [];
    return transactions.filter((tx) => (tx.normalizedSymbol || tx.symbol) === selectedSymbol);
  }, [transactions, selectedSymbol]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 md:p-7">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-[#0a8043] uppercase mb-2">Portfolio</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white">Portfolio</h1>
          <p className="mt-3 text-sm md:text-base text-gray-600 dark:text-slate-400 max-w-2xl">
            View your combined portfolio or drill into a single account, then inspect holdings and their related transactions.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-800">
          <div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">Scope</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setSelectedScope("combined")} className={`px-4 py-2 text-sm rounded-xl border ${selectedScope === "combined" ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20" : "bg-white dark:bg-slate-950 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700"}`}>
              Combined
            </button>
            {accounts.map((account) => (
              <button key={account.id} onClick={() => setSelectedScope(account.id)} className={`px-4 py-2 text-sm rounded-xl border ${selectedScope === account.id ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20" : "bg-white dark:bg-slate-950 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700"}`}>
                {account.name || account.accountType}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 md:p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {selectedScope === "combined" ? "Combined holdings" : `${selectedAccount?.name || selectedAccount?.accountType || "Account"} holdings`}
            </div>
            {loading ? (
              <div className="text-sm text-gray-500 dark:text-slate-400">Loading portfolio...</div>
            ) : holdings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-8 text-center text-gray-500 dark:text-slate-400">
                No holdings are available yet. Sync Questrade transactions first.
              </div>
            ) : (
              holdings.map((holding) => (
                <button key={holding.symbol} onClick={() => setSelectedSymbol(holding.symbol)} className={`w-full text-left rounded-2xl border p-4 transition-colors ${selectedSymbol === holding.symbol ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10" : "border-gray-100 bg-gray-50/60 dark:border-slate-800 dark:bg-slate-950/60"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{holding.symbol}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Transactions: {holding.transactions}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{formatNumber(holding.quantity)}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Qty</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-gray-600 dark:text-slate-400">Net invested: {formatCurrency(holding.netInvested)}</div>
                </button>
              ))
            )}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-900 dark:text-white">{selectedSymbol ? `${selectedSymbol} activity` : "Select a symbol"}</div>
            {!selectedSymbol ? (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-8 text-center text-gray-500 dark:text-slate-400">
                Choose a holding to inspect its transaction history.
              </div>
            ) : symbolTransactions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-8 text-center text-gray-500 dark:text-slate-400">
                No transactions found for this symbol.
              </div>
            ) : (
              symbolTransactions.map((tx) => (
                <div key={tx.id} className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4 bg-white dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{tx.action === "REINVEST" ? "DRIP" : tx.action}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{tx.account.name || tx.account.accountType} · {formatDate(tx.settlementDate)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{tx.netAmount == null ? "—" : formatCurrency(tx.netAmount)}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{tx.currency}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-gray-600 dark:text-slate-400">{tx.description}</div>
                  <div className="mt-3 text-xs text-gray-500 dark:text-slate-400">
                    Qty: {tx.quantity == null ? "—" : formatNumber(tx.quantity)}{tx.price == null ? "" : ` · Price: ${formatCurrency(tx.price)}`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
