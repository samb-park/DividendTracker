"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate, formatCurrency, formatPercent } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

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

interface DashboardData {
  dividendHistory: Array<{ month: string; amount: number }>;
  income: {
    receivedThisYear: number;
    receivedThisMonth: number;
    receivedLast12Months: number;
    projectedAnnual: number;
  };
  portfolioSummary: {
    totalMarketValue: number;
    totalInvested: number;
    totalReturn: number;
    totalReturnAmount: number;
  };
  dividendTarget: {
    targetAnnual: number | null;
    targetMonthly: number | null;
    receivedThisYear: number;
    progressPercent: number | null;
  };
  holdingsCount: number;
  accountsCount: number;
  totalTransactions: number;
}

const quickLinks = [
  { title: "Add transaction", description: "Record buys, dividends, deposits, and withdrawals.", href: "/transactions" },
  { title: "Manage accounts", description: "Update account details and contribution room.", href: "/accounts" },
  { title: "Set targets", description: "Define target weights and contribution goals.", href: "/settings/targets" },
];
export default function HomePage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [dashRes, txRes] = await Promise.all([
          fetch("/api/dashboard"),
          fetch("/api/transactions?page=1&limit=5"),
        ]);
        const dashData = await dashRes.json();
        const txData = await txRes.json();
        setDashboard(dashData);
        setTransactions(txData.transactions || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const portfolio = dashboard?.portfolioSummary;
  const income = dashboard?.income;
  const target = dashboard?.dividendTarget;
  const history = dashboard?.dividendHistory || [];

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Hero Section */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 md:p-7 bg-gradient-to-br from-emerald-50 via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-[#0a8043] uppercase mb-2">Portfolio Overview</div>
          <div className="text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white">
            {loading ? "\u2014" : formatCurrency(portfolio?.totalMarketValue ?? 0)}
          </div>
          <p className="mt-2 text-sm md:text-base text-gray-600 dark:text-slate-400">Total market value</p>

          <div className="flex flex-wrap items-center gap-4 mt-4">
            <ReturnBadge label="Return" loading={loading} value={portfolio?.totalReturn ?? 0} formatter={formatPercent} />
            <ReturnBadge label="P&amp;L" loading={loading} value={portfolio?.totalReturnAmount ?? 0} formatter={formatCurrency} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-wide">Invested</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {loading ? "\u2014" : formatCurrency(portfolio?.totalInvested ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </section>
      {/* Metric Cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Accounts" value={loading ? "\u2014" : String(dashboard?.accountsCount ?? 0)} />
        <MetricCard label="Holdings" value={loading ? "\u2014" : String(dashboard?.holdingsCount ?? 0)} />
        <MetricCard label="This month" value={loading ? "\u2014" : formatCurrency(income?.receivedThisMonth ?? 0)} accent />
        <MetricCard label="This year" value={loading ? "\u2014" : formatCurrency(income?.receivedThisYear ?? 0)} accent />
      </section>

      {/* Dividend Income Chart */}
      <DividendChart loading={loading} income={income} history={history} />

      {/* Target Progress */}
      <TargetProgress target={target} />

      {/* Quick Actions */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quickLinks.map((card) => (
          <Link key={card.href} href={card.href} className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-slate-700 hover:shadow-md transition-all">
            <div className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{card.title}</div>
            <div className="text-sm text-gray-600 dark:text-slate-400">{card.description}</div>
          </Link>
        ))}
      </section>

      {/* Recent Activity */}
      <RecentActivity loading={loading} transactions={transactions} />
    </div>
  );
}
function ReturnBadge({ label, loading, value, formatter }: { label: string; loading: boolean; value: number; formatter: (v: number) => string }) {
  const color = value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-wide">{label}</span>
      <span className={"text-sm font-semibold " + color}>
        {loading ? "\u2014" : formatter(value)}
      </span>
    </div>
  );
}
function DividendChart({ loading, income, history }: { loading: boolean; income: DashboardData["income"] | undefined; history: DashboardData["dividendHistory"] }) {
  const subtitle = !loading && income
    ? "Last 12 months \u00b7 " + formatCurrency(income.receivedLast12Months) + " received"
    : "Last 12 months";

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">Dividend Income</div>
          <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 dark:text-slate-500">Projected annual</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            {loading ? "\u2014" : formatCurrency(income?.projectedAnnual ?? 0)}
          </div>
        </div>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-gray-400 dark:text-slate-500">Loading chart...</div>
        ) : history.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center">
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-6 text-sm text-gray-500 dark:text-slate-400 text-center">
              No dividend data yet. Dividends will appear here as they are recorded.
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={history} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => "$" + v} />
              <Tooltip
                contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", fontSize: "13px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                formatter={(value: number) => [formatCurrency(value), "Dividends"]}
                labelStyle={{ fontWeight: 600 }}
                cursor={{ fill: "rgba(10, 128, 67, 0.06)" }}
              />
              <Bar dataKey="amount" fill="#0a8043" radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
function TargetProgress({ target }: { target: DashboardData["dividendTarget"] | undefined }) {
  if (!target || target.targetAnnual == null) return null;

  const pct = target.progressPercent ?? 0;
  const remaining = Math.max(0, (target.targetAnnual ?? 0) - target.receivedThisYear);

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">Annual Dividend Target</div>
          <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {formatCurrency(target.receivedThisYear)} of {formatCurrency(target.targetAnnual!)} goal
          </div>
        </div>
        <Link href="/settings/targets" className="text-sm text-emerald-700 dark:text-emerald-300 hover:underline">Edit</Link>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{pct.toFixed(1)}%</span>
          <span className="text-xs text-gray-400 dark:text-slate-500">{formatCurrency(remaining)} remaining</span>
        </div>
        <div className="w-full h-3 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-[#0a8043] rounded-full transition-all duration-500" style={{ width: Math.min(100, pct) + "%" }} />
        </div>
        {target.targetMonthly != null && (
          <div className="mt-3 text-xs text-gray-500 dark:text-slate-400">Monthly target: {formatCurrency(target.targetMonthly)}</div>
        )}
      </div>
    </section>
  );
}
function RecentActivity({ loading, transactions }: { loading: boolean; transactions: Transaction[] }) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">Recent Activity</div>
          <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">Latest transaction history</div>
        </div>
        <Link href="/transactions" className="text-sm text-emerald-700 dark:text-emerald-300 hover:underline">View all</Link>
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
                  <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{tx.account.name || tx.account.accountType} &middot; {formatDate(tx.settlementDate)}</div>
                </div>
                <span className="text-[11px] px-2.5 py-1 rounded-full border bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">{tx.action === "REINVEST" ? "DRIP" : tx.action}</span>
              </div>
              <div className="mt-3 text-sm text-gray-600 dark:text-slate-400">{tx.description}</div>
              <div className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
                {tx.netAmount == null ? "\u2014" : tx.currency + " " + formatCurrency(tx.netAmount)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
function MetricCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const valueColor = accent ? "text-[#0a8043]" : "text-gray-900 dark:text-white";
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">{label}</div>
      <div className={"mt-2 text-2xl font-semibold " + valueColor}>{value}</div>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-6 text-sm text-gray-500 dark:text-slate-400 text-center">{text}</div>;
}
