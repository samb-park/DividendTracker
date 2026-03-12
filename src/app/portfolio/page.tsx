"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, formatCurrency, formatNumber } from "@/lib/utils";

interface Account { id: string; name: string | null; accountNumber: string | null; accountType: string; broker?: string; isActive: boolean; }
interface Holding { symbol: string; quantity: number; netInvested: number; transactions: number; price: number | null; quoteCurrency: string | null; marketValue: number | null; weight: number; }
interface PortfolioTransaction { id: string; action: string; description: string; normalizedSymbol: string | null; symbol: string | null; settlementDate: string; netAmount: number | null; quantity: number | null; price: number | null; currency: string; account: { id: string; name: string | null; accountType: string }; }
interface AllocationItem { symbol: string; currentWeight: number; targetWeight: number; gap: number; gapAmount: number; marketValue: number; quantity: number; }

type TabView = "holdings" | "allocation";

export default function PortfolioPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [selectedScope, setSelectedScope] = useState<string>("combined");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalMarketValue, setTotalMarketValue] = useState(0);
  const [activeTab, setActiveTab] = useState<TabView>("holdings");
  const [allocation, setAllocation] = useState<AllocationItem[]>([]);
  const [allocLoading, setAllocLoading] = useState(false);

  async function load(scope: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/portfolio?accountId=" + scope);
      const data = await res.json();
      setAccounts(data.accounts || []);
      setHoldings(data.holdings || []);
      setTransactions(data.transactions || []);
      setTotalMarketValue(data.totalMarketValue || 0);
      setSelectedSymbol((prev) => {
        if (!data.holdings?.length) return null;
        if (prev && data.holdings.some((h: Holding) => h.symbol === prev)) return prev;
        return data.holdings[0].symbol;
      });
    } finally { setLoading(false); }
  }

  async function loadAllocation(scope: string) {
    setAllocLoading(true);
    try {
      const res = await fetch("/api/portfolio/allocation?accountId=" + scope);
      const data = await res.json();
      setAllocation(data.allocation || []);
    } finally { setAllocLoading(false); }
  }

  useEffect(() => { load(selectedScope); }, [selectedScope]);
  useEffect(() => { if (activeTab === "allocation") loadAllocation(selectedScope); }, [activeTab, selectedScope]);

  const selectedAccount = useMemo(() => accounts.find((a) => a.id === selectedScope) || null, [accounts, selectedScope]);
  const selectedHolding = useMemo(() => holdings.find((h) => h.symbol === selectedSymbol) || null, [holdings, selectedSymbol]);
  const symbolTransactions = useMemo(() => {
    if (!selectedSymbol) return [];
    return transactions.filter((tx) => (tx.normalizedSymbol || tx.symbol) === selectedSymbol);
  }, [transactions, selectedSymbol]);

  const scopeLabel = selectedScope === "combined" ? "Combined" : (selectedAccount?.name || selectedAccount?.accountType || "Account");

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 md:p-7">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-[#0a8043] uppercase mb-2">Portfolio</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white">Portfolio</h1>
          <p className="mt-3 text-sm md:text-base text-gray-600 dark:text-slate-400 max-w-2xl">View your combined portfolio or drill into a single account.</p>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Scope" value={scopeLabel} />
            <SummaryCard label="Holdings" value={String(holdings.length)} />
            <SummaryCard label="Market value" value={formatCurrency(totalMarketValue)} />
            <SummaryCard label="Selected" value={selectedHolding?.symbol || "\u2014"} />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">Scope</div>
            <div className="flex gap-1">
              <TabBtn active={activeTab === "holdings"} onClick={() => setActiveTab("holdings")}>Holdings</TabBtn>
              <TabBtn active={activeTab === "allocation"} onClick={() => setActiveTab("allocation")}>Allocation</TabBtn>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ScopeBtn active={selectedScope === "combined"} onClick={() => setSelectedScope("combined")}>Combined</ScopeBtn>
            {accounts.map((a) => (
              <ScopeBtn key={a.id} active={selectedScope === a.id} onClick={() => setSelectedScope(a.id)}>{a.name || a.accountType}</ScopeBtn>
            ))}
          </div>
        </div>

        {activeTab === "holdings" ? (
          <div className="p-4 md:p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="text-sm font-medium text-gray-900 dark:text-white">{scopeLabel} holdings</div>
              {loading ? (
                <LoadingText>Loading portfolio...</LoadingText>
              ) : holdings.length === 0 ? (
                <EmptyCard>No holdings yet. Sync Questrade transactions first.</EmptyCard>
              ) : (
                holdings.map((h) => (
                  <button key={h.symbol} onClick={() => setSelectedSymbol(h.symbol)} className={"w-full text-left rounded-2xl border p-4 transition-colors " + (selectedSymbol === h.symbol ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10" : "border-gray-100 bg-gray-50/60 dark:border-slate-800 dark:bg-slate-950/60")}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{h.symbol}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Txns: {h.transactions}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{formatNumber(h.quantity)}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Qty</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                      <Stat label="Price" value={h.price == null ? "\u2014" : formatCurrency(h.price)} />
                      <Stat label="Value" value={h.marketValue == null ? "\u2014" : formatCurrency(h.marketValue)} />
                      <Stat label="Weight" value={h.weight ? h.weight.toFixed(1) + "%" : "\u2014"} />
                    </div>
                    <div className="mt-3 text-sm text-gray-600 dark:text-slate-400">Net invested: {formatCurrency(h.netInvested)}</div>
                  </button>
                ))
              )}
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium text-gray-900 dark:text-white">{selectedSymbol ? selectedSymbol + " detail" : "Select a symbol"}</div>
              {selectedHolding && (
                <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4 bg-gray-50/60 dark:bg-slate-950/60">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <StatBold label="Quantity" value={formatNumber(selectedHolding.quantity)} />
                    <StatBold label="Market value" value={selectedHolding.marketValue == null ? "\u2014" : formatCurrency(selectedHolding.marketValue)} />
                    <StatBold label="Price" value={selectedHolding.price == null ? "\u2014" : formatCurrency(selectedHolding.price)} />
                    <StatBold label="Weight" value={selectedHolding.weight ? selectedHolding.weight.toFixed(1) + "%" : "\u2014"} />
                  </div>
                </div>
              )}
              {!selectedSymbol ? (
                <EmptyCard>Choose a holding to see transactions.</EmptyCard>
              ) : symbolTransactions.length === 0 ? (
                <EmptyCard>No transactions for this symbol.</EmptyCard>
              ) : (
                symbolTransactions.map((tx) => (
                  <div key={tx.id} className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4 bg-white dark:bg-slate-950">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{tx.action === "REINVEST" ? "DRIP" : tx.action}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{tx.account.name || tx.account.accountType} &middot; {formatDate(tx.settlementDate)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{tx.netAmount == null ? "\u2014" : formatCurrency(tx.netAmount)}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{tx.currency}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-gray-600 dark:text-slate-400">{tx.description}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 md:p-5">
            <div className="text-sm font-medium text-gray-900 dark:text-white mb-4">Current vs Target Allocation</div>
            {allocLoading ? (
              <LoadingText>Loading allocation...</LoadingText>
            ) : allocation.length === 0 ? (
              <EmptyCard>No holdings or targets found. Add targets in Settings and sync your portfolio.</EmptyCard>
            ) : (
              <div className="space-y-3">
                {allocation.map((item) => {
                  const gapColor = item.gap > 0 ? "blue" : item.gap < 0 ? "amber" : "emerald";
                  const gapBg = gapColor === "blue" ? "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20" : gapColor === "amber" ? "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20";
                  const gapLabel = item.gap > 0 ? "+" + item.gap.toFixed(1) + "% underweight" : item.gap < 0 ? item.gap.toFixed(1) + "% overweight" : "On target";
                  const gapAmtColor = item.gapAmount > 0 ? "text-blue-600 dark:text-blue-400" : item.gapAmount < 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-white";

                  return (
                    <div key={item.symbol} className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4 bg-gray-50/60 dark:bg-slate-950/60">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{item.symbol}</div>
                        <div className={"text-xs px-2.5 py-1 rounded-full border " + gapBg}>{gapLabel}</div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 dark:text-slate-400">Current: {item.currentWeight.toFixed(1)}%</span>
                          <span className="text-gray-500 dark:text-slate-400">Target: {item.targetWeight.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden relative">
                          <div className="absolute h-full bg-emerald-500 rounded-full" style={{ width: Math.min(item.currentWeight, 100) + "%" }} />
                          {item.targetWeight > 0 && (
                            <div className="absolute h-full w-0.5 bg-gray-900 dark:bg-white" style={{ left: Math.min(item.targetWeight, 100) + "%" }} />
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs mt-2">
                          <div><span className="text-gray-400 dark:text-slate-500">Value</span><div className="font-medium text-gray-900 dark:text-white">{formatCurrency(item.marketValue)}</div></div>
                          <div><span className="text-gray-400 dark:text-slate-500">Qty</span><div className="font-medium text-gray-900 dark:text-white">{formatNumber(item.quantity)}</div></div>
                          <div><span className="text-gray-400 dark:text-slate-500">Gap</span><div className={"font-medium " + gapAmtColor}>{(item.gapAmount > 0 ? "+" : "") + formatCurrency(item.gapAmount)}</div></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={"px-3 py-1.5 text-xs rounded-lg border " + (active ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20" : "bg-white dark:bg-slate-950 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700")}>{children}</button>;
}

function ScopeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={"px-4 py-2 text-sm rounded-xl border " + (active ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20" : "bg-white dark:bg-slate-950 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700")}>{children}</button>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-gray-400 dark:text-slate-500">{label}</div><div className="font-medium text-gray-900 dark:text-white">{value}</div></div>;
}

function StatBold({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-gray-400 dark:text-slate-500">{label}</div><div className="font-semibold text-gray-900 dark:text-white">{value}</div></div>;
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-8 text-center text-gray-500 dark:text-slate-400">{children}</div>;
}

function LoadingText({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-gray-500 dark:text-slate-400">{children}</div>;
}
