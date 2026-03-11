"use client";

import { useEffect, useMemo, useState } from "react";

interface Account {
  id: string;
  name: string | null;
  accountNumber: string | null;
  accountType: string;
  broker?: string;
  isActive: boolean;
  _count?: { transactions: number };
}

export default function PortfolioPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string>("combined");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/accounts");
      setAccounts(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selected) || null,
    [accounts, selected]
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 md:p-7">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-[#0a8043] uppercase mb-2">Portfolio</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white">Portfolio</h1>
          <p className="mt-3 text-sm md:text-base text-gray-600 dark:text-slate-400 max-w-2xl">
            Combined and account-level portfolio views will live here. Accounts synced from Questrade will appear here first.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-800">
          <div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">Scope</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setSelected("combined")}
              className={`px-4 py-2 text-sm rounded-xl border ${selected === "combined" ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20" : "bg-white dark:bg-slate-950 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700"}`}
            >
              Combined
            </button>
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => setSelected(account.id)}
                className={`px-4 py-2 text-sm rounded-xl border ${selected === account.id ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20" : "bg-white dark:bg-slate-950 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700"}`}
              >
                {account.name || account.accountType}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 md:p-5">
          {loading ? (
            <div className="text-sm text-gray-500 dark:text-slate-400">Loading portfolio...</div>
          ) : accounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-8 text-center text-gray-500 dark:text-slate-400">
              No portfolio accounts yet. Connect Questrade or add accounts in Settings.
            </div>
          ) : selected === "combined" ? (
            <div className="space-y-3">
              <div className="text-sm font-medium text-gray-900 dark:text-white">Combined accounts</div>
              {accounts.map((account) => (
                <div key={account.id} className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4 bg-gray-50/60 dark:bg-slate-950/60">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{account.name || account.accountType}</div>
                  <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    {account.accountType}{account.accountNumber ? ` · ${account.accountNumber}` : ""}{account.broker ? ` · ${account.broker}` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : selectedAccount ? (
            <div className="space-y-3">
              <div className="text-sm font-medium text-gray-900 dark:text-white">{selectedAccount.name || selectedAccount.accountType}</div>
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-8 text-center text-gray-500 dark:text-slate-400">
                Holdings for this account will appear here after transaction sync is added.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
