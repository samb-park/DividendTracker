"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDate, formatCurrency } from "@/lib/utils";

interface Account {
  id: string;
  name: string | null;
  accountNumber: string | null;
  accountType: string;
  baseCurrency: "CAD" | "USD";
  currentContributionRoom: number | null;
  isActive: boolean;
  _count?: {
    transactions: number;
  };
}

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

const quickLinks = [
  { title: "Add transaction", description: "Record buys, dividends, deposits, and withdrawals.", href: "/transactions" },
  { title: "Manage accounts", description: "Update account details and contribution room.", href: "/accounts" },
  { title: "Settings", description: "Prepare preferences, theme, and future broker connections.", href: "/settings" },
];

export default function HomePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [accountsRes, txRes] = await Promise.all([
          fetch("/api/accounts"),
          fetch("/api/transactions?page=1&limit=5"),
        ]);
        const accountsData = await accountsRes.json();
        const txData = await txRes.json();
        setAccounts(accountsData || []);
        setTransactions(txData.transactions || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const metrics = useMemo(() => {
    const activeAccounts = accounts.filter((a) => a.isActive).length;
    const totalTransactions = accounts.reduce((sum, acc) => sum + (acc._count?.transactions || 0), 0);
    const trackedRoom = accounts.reduce((sum, acc) => sum + (acc.currentContributionRoom || 0), 0);
    const registeredAccounts = accounts.filter((a) => ["TFSA", "RRSP", "FHSA"].includes(a.accountType)).length;

    return { activeAccounts, totalTransactions, trackedRoom, registeredAccounts };
  }, [accounts]);

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 md:p-7 bg-gradient-to-br from-emerald-50 via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-[#0a8043] uppercase mb-2">Mobile Board</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white">DividendTracker</h1>
          <p className="mt-3 text-sm md:text-base text-gray-600 dark:text-slate-400 max-w-2xl">
            A clean, mobile-first board for accounts, transactions, contribution room, and dividend-focused portfolio tracking.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <MetricCard label="Active accounts" value={loading ? "—" : String(metrics.activeAccounts)} />
            <MetricCard label="Transactions" value={loading ? "—" : String(metrics.totalTransactions)} />
            <MetricCard label="Tracked room" value={loading ? "—" : `${metrics.trackedRoom}`} />
            <MetricCard label="Registered accts" value={loading ? "—" : String(metrics.registeredAccounts)} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quickLinks.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-slate-700 hover:shadow-md transition-all"
          >
            <div className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{card.title}</div>
            <div className="text-sm text-gray-600 dark:text-slate-400">{card.description}</div>
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">Accounts</div>
              <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">Current account overview</div>
            </div>
            <Link href="/accounts" className="text-sm text-emerald-700 dark:text-emerald-300 hover:underline">Open</Link>
          </div>
          <div className="p-4 space-y-3">
            {loading ? (
              <EmptyText text="Loading accounts..." />
            ) : accounts.length === 0 ? (
              <EmptyText text="No accounts yet. Create your first account to start tracking." />
            ) : (
              accounts.slice(0, 4).map((acc) => (
                <div key={acc.id} className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4 bg-gray-50/60 dark:bg-slate-950/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{acc.name || acc.accountType}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                        {acc.accountType}
                        {acc.accountNumber ? ` · ${acc.accountNumber}` : ""}
                        {` · ${acc.baseCurrency}`}
                      </div>
                    </div>
                    <span className={`text-[11px] px-2.5 py-1 rounded-full border ${acc.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20" : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"}`}>
                      {acc.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-400 dark:text-slate-500">Transactions</div>
                      <div className="font-semibold text-gray-900 dark:text-white">{acc._count?.transactions || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 dark:text-slate-500">Contribution room</div>
                      <div className="font-semibold text-gray-900 dark:text-white">{acc.currentContributionRoom ?? "—"}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">Recent activity</div>
              <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">Latest transaction history</div>
            </div>
            <Link href="/transactions" className="text-sm text-emerald-700 dark:text-emerald-300 hover:underline">Open</Link>
          </div>
          <div className="p-4 space-y-3">
            {loading ? (
              <EmptyText text="Loading transactions..." />
            ) : transactions.length === 0 ? (
              <EmptyText text="No transactions yet. Add your first buy, dividend, or deposit." />
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4 bg-gray-50/60 dark:bg-slate-950/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{tx.normalizedSymbol || tx.symbol || tx.description}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{tx.account.name || tx.account.accountType} · {formatDate(tx.settlementDate)}</div>
                    </div>
                    <span className="text-[11px] px-2.5 py-1 rounded-full border bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                      {tx.action === "REINVEST" ? "DRIP" : tx.action}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-gray-600 dark:text-slate-400">{tx.description}</div>
                  <div className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
                    {tx.netAmount == null ? "—" : `${tx.currency} ${formatCurrency(tx.netAmount)}`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-6 text-sm text-gray-500 dark:text-slate-400 text-center">{text}</div>;
}
