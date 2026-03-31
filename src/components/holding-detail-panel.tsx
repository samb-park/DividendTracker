"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { AddTransactionDialog } from "./add-transaction-dialog";
import { X } from "lucide-react";
import { fmt, fmtPct } from "@/lib/utils";
import { COLOR_ACTUAL, COLOR_PROJECTED } from "@/lib/chart-tokens";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Transaction {
  id: string;
  action: "BUY" | "SELL" | "DIVIDEND";
  quantity: string;
  price: string;
  commission: string;
  date?: string;
  notes?: string | null;
}

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  week52High: number;
  week52Low: number;
  fromHighPct: number;
  fromLowPct: number;
  dividendRate: number | null;
  dividendYield: number | null;
  trailingAnnualDividendRate: number | null;
  trailingAnnualDividendYield: number | null;
  exDividendDate: string | null;
  dividendDate: string | null;
  payoutRatio: number | null;
}

interface HoldingRow {
  holding: {
    id: string;
    allHoldingIds?: string[];
    ticker: string;
    name: string | null;
    currency: "USD" | "CAD";
    quantity: string | null;
    avgCost: string | null;
    transactions: Transaction[];
  };
  shares: number;
  avgCost: number;
  costBasis: number;
  price: PriceData | null;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
}

type DetailTab = "transactions" | "dividends";

interface InvestmentSettings {
  contribution: { frequency: "weekly" | "biweekly" | "monthly"; amount: number; currency: "USD" | "CAD" } | null;
  target: { pct: number } | null;
}

function convertCurrency(amount: number, from: "USD" | "CAD", to: "USD" | "CAD", fxRate: number) {
  if (from === to) return amount;
  return from === "USD" ? amount * fxRate : amount / fxRate;
}


export function HoldingDetailPanel({
  row,
  readOnly,
  onClose,
  onRefresh,
  totalMarketValue = 0,
  displayCurrency,
  allocAmount = 0,
  gapAmount = 0,
  postAllocationPct,
  contribCAD = 0,
  fxRateForAlloc = 1.35,
  allPortfolios,
  selectedPortfolioId,
  onPortfolioChange,
}: {
  row: HoldingRow;
  readOnly: boolean;
  onClose: () => void;
  onRefresh: () => void;
  totalMarketValue?: number;
  displayCurrency?: "USD" | "CAD";
  allocAmount?: number;
  gapAmount?: number;
  postAllocationPct?: number;
  contribCAD?: number;
  fxRateForAlloc?: number;
  allPortfolios?: { id: string; name: string }[];
  selectedPortfolioId?: string;
  onPortfolioChange?: (id: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const curDropdownRef = useRef<HTMLDivElement>(null);
  const acctDropdownRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("transactions");
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [investPlan, setInvestPlan] = useState<InvestmentSettings | null>(null);
  const [deletingTxnId, setDeletingTxnId] = useState<string | null>(null);
  const [panelTxns, setPanelTxns] = useState<Transaction[]>([]);
  const [txnMenu, setTxnMenu] = useState<{ txn: Transaction; y: number } | null>(null);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [txnsLoading, setTxnsLoading] = useState(true);
  const [txnsError, setTxnsError] = useState(false);
  const [acctDropdownOpen, setAcctDropdownOpen] = useState(false);

  const fetchTxns = useCallback(async () => {
    setTxnsLoading(true);
    setTxnsError(false);
    try {
      const ids = row.holding.allHoldingIds ?? [row.holding.id];
      const param = ids.length > 1 ? `holdingIds=${ids.join(",")}` : `holdingId=${ids[0]}`;
      const res = await fetch(`/api/transactions?${param}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      if (Array.isArray(data)) {
        setPanelTxns(data.map((t: Record<string, unknown>) => ({
          id: String(t.id),
          action: t.action as "BUY" | "SELL" | "DIVIDEND",
          quantity: String(t.quantity),
          price: String(t.price),
          commission: String(t.commission),
          date: typeof t.date === "string" ? t.date.slice(0, 10) : undefined,
          notes: (t.notes as string | null | undefined) ?? null,
          source: (t.source as string | null | undefined) ?? null,
        })));
      }
    } catch {
      setTxnsError(true);
    } finally {
      setTxnsLoading(false);
    }
  }, [row.holding.id, row.holding.allHoldingIds?.join(",")]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { fetchTxns(); }, [fetchTxns]);

  // Lock body scroll while panel is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  const [fxRate, setFxRate] = useState(fxRateForAlloc);
  useEffect(() => { setFxRate(fxRateForAlloc); }, [fxRateForAlloc]);
  const [displayCur, setDisplayCur] = useState<"USD" | "CAD">(displayCurrency ?? row.holding.currency);
  const [curDropdownOpen, setCurDropdownOpen] = useState(false);

  useEffect(() => {
    if (displayCurrency) setDisplayCur(displayCurrency);
  }, [displayCurrency]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (curDropdownRef.current && !curDropdownRef.current.contains(e.target as Node)) {
        setCurDropdownOpen(false);
      }
      if (acctDropdownRef.current && !acctDropdownRef.current.contains(e.target as Node)) {
        setAcctDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(oneYearAgo);
  const [dateTo, setDateTo] = useState(today);

  const sym = displayCur === "CAD" ? "C$" : "$";
  const toDisp = (amount: number) => convertCurrency(amount, row.holding.currency, displayCur, fxRate);

  const buysSells = useMemo(() =>
    panelTxns.filter((t) => t.action !== "DIVIDEND"),
    [panelTxns]
  );

  const dividendTxns = useMemo(() =>
    panelTxns.filter((t) => t.action === "DIVIDEND"),
    [panelTxns]
  );

  const filterByDate = useCallback((txns: Transaction[]) =>
    txns.filter((txn) => {
      const d = txn.date?.slice(0, 10) ?? "";
      if (!d) return true;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    }), [dateFrom, dateTo]);

  const filteredTxns = useMemo(() => filterByDate(buysSells), [buysSells, filterByDate]);
  const filteredDivs = useMemo(() => filterByDate(dividendTxns), [dividendTxns, filterByDate]);

  const totalDivsReceived = useMemo(() =>
    filteredDivs.reduce((s, t) => s + parseFloat(t.price) * parseFloat(t.quantity), 0),
    [filteredDivs]
  );

  const totalDivsAllTime = useMemo(() =>
    dividendTxns.reduce((s, t) => s + parseFloat(t.price) * parseFloat(t.quantity), 0),
    [dividendTxns]
  );

  const actualDivs12m = useMemo(() => {
    const cutoff = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
    return dividendTxns
      .filter((t) => (t.date?.slice(0, 10) ?? "") >= cutoff)
      .reduce((s, t) => s + parseFloat(t.price) * parseFloat(t.quantity), 0);
  }, [dividendTxns]);

  const actualYieldOnCost = row.costBasis > 0 && actualDivs12m > 0
    ? (actualDivs12m / row.costBasis) * 100
    : null;

  const actualYield = row.marketValue > 0 && actualDivs12m > 0
    ? (actualDivs12m / row.marketValue) * 100
    : null;

  const hasReturn = row.marketValue > 0 || totalDivsAllTime > 0;
  const totalReturn = hasReturn && row.costBasis > 0
    ? (row.marketValue > 0 ? row.marketValue - row.costBasis : 0) + totalDivsAllTime
    : null;
  const totalReturnPct = totalReturn != null && row.costBasis > 0
    ? (totalReturn / row.costBasis) * 100
    : null;

  // Dividend CAGR from actual transactions
  const divCAGR = useMemo(() => {
    if (dividendTxns.length < 2) return null;
    const byYear: Record<number, number> = {};
    for (const t of dividendTxns) {
      const yr = parseInt(t.date?.slice(0, 4) ?? "0");
      if (yr > 2000) byYear[yr] = (byYear[yr] ?? 0) + parseFloat(t.price) * parseFloat(t.quantity);
    }
    const years = Object.keys(byYear).map(Number).sort();
    if (years.length < 2) return null;
    const n = years[years.length - 1] - years[0];
    if (n < 1) return null;
    const first = byYear[years[0]], last = byYear[years[years.length - 1]];
    if (first <= 0 || last <= 0) return null;
    return { cagr: (Math.pow(last / first, 1 / n) - 1) * 100, years: n };
  }, [dividendTxns]);

  // Dividend history chart data: group actual by month, project future months
  const divChartData = useMemo(() => {
    const p = row.price;
    const annualRate = p?.trailingAnnualDividendRate ?? p?.dividendRate ?? 0;

    // Group actual dividends by YYYY-MM
    const actualByMonth: Record<string, number> = {};
    for (const t of dividendTxns) {
      const mo = t.date?.slice(0, 7);
      if (mo) actualByMonth[mo] = (actualByMonth[mo] ?? 0) + parseFloat(t.price) * parseFloat(t.quantity);
    }

    // Build last 12 months
    const months: { month: string; label: string; amount: number; source: "actual" | "projected" }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en", { month: "short" });
      const isCurrentOrFuture = mo >= today.slice(0, 7);
      if (actualByMonth[mo] != null) {
        months.push({ month: mo, label, amount: actualByMonth[mo], source: "actual" });
      } else if (isCurrentOrFuture && annualRate > 0) {
        months.push({ month: mo, label, amount: Math.round((annualRate / 12) * row.shares * 100) / 100, source: "projected" });
      } else if (actualByMonth[mo] == null) {
        months.push({ month: mo, label, amount: 0, source: "actual" });
      }
    }

    return months;
  }, [dividendTxns, row.price, row.shares, today]);

  const hasActualDivChart = divChartData.some((d) => d.source === "actual" && d.amount > 0);
  const hasProjectedDivChart = divChartData.some((d) => d.source === "projected" && d.amount > 0);

  // Estimated annual dividend income
  const p = row.price;
  const annualDivRate = p?.trailingAnnualDividendRate ?? p?.dividendRate ?? 0;
  const estimatedAnnual = annualDivRate > 0 ? annualDivRate * row.shares : null;

  // Determine dividend frequency from actual transactions
  const divFrequency = useMemo(() => {
    if (dividendTxns.length < 2) return null;
    const sorted = [...dividendTxns].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    // Check last 4 divs for frequency pattern
    const recent = sorted.slice(-4);
    if (recent.length < 2) return null;
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const a = new Date(recent[i - 1].date ?? "");
      const b = new Date(recent[i].date ?? "");
      gaps.push((b.getTime() - a.getTime()) / 86400000);
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (avgGap < 20) return "WEEKLY";
    if (avgGap < 40) return "MONTHLY";
    if (avgGap < 100) return "QUARTERLY";
    if (avgGap < 200) return "SEMI-ANNUAL";
    return "ANNUAL";
  }, [dividendTxns]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!readOnly) return;
    Promise.all([
      fetch("/api/settings/investment").then(r => r.json()),
      fetch("/api/fx").then(r => r.json()),
    ]).then(([inv, fx]) => {
      setInvestPlan({
        contribution: inv.contribution ?? null,
        target: inv.targets?.[row.holding.ticker] ?? null,
      });
      if (fx.rate) setFxRate(fx.rate);
    });
  }, [readOnly, row.holding.ticker]);

  const deleteHolding = async () => {
    const res = await fetch(`/api/holdings/${row.holding.id}`, { method: "DELETE" });
    if (!res.ok) { alert("Failed to delete holding."); return; }
    onRefresh();
    onClose();
  };

  const deleteTxn = async (id: string) => {
    setDeletingTxnId(id);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (res.ok) { onRefresh(); fetchTxns(); }
    } finally {
      setDeletingTxnId(null);
    }
  };

  const updateTxn = async (id: string, data: Partial<{ action: string; date: string; quantity: string; price: string; commission: string; notes: string }>) => {
    const res = await fetch(`/api/transactions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) { onRefresh(); fetchTxns(); }
  };

  const startLongPress = (e: React.MouseEvent | React.TouchEvent, txn: Transaction) => {
    const y = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    longPressTimerRef.current = setTimeout(() => {
      setTxnMenu({ txn, y });
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  };

  // 52W range bar position
  const range52WPct = p && p.week52High > p.week52Low && !isNaN(p.week52High) && !isNaN(p.week52Low)
    ? ((p.price - p.week52Low) / (p.week52High - p.week52Low)) * 100
    : null;
  const range52WDotColor = range52WPct != null
    ? range52WPct <= 30 ? "hsl(142, 69%, 58%)"
    : range52WPct >= 75 ? "hsl(38, 92%, 55%)"
    : "hsl(var(--accent))"
    : "hsl(var(--accent))";

  const panel = (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Panel */}
      <div
        ref={panelRef}
        className="relative ml-auto w-full md:w-[28rem] lg:w-[32rem] xl:w-1/2 bg-background border-l border-border overflow-y-auto"
      >
      {/* Unified header — sticky */}
      <div className="sticky top-0 z-10 bg-background flex items-center justify-between px-4 border-b border-border safe-top" style={{ paddingBottom: "12px", paddingTop: "12px" }}>
        <div className="min-w-0">
          <div className="text-accent font-medium tracking-wide">{row.holding.ticker}</div>
          {row.holding.name && (
            <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{row.holding.name}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {row.holding.source !== "questrade" && (
            <AddTransactionDialog
              {...(allPortfolios
                ? { portfolios: allPortfolios }
                : { holdingId: row.holding.id })}
              ticker={row.holding.ticker}
              onAdd={() => { onRefresh(); fetchTxns(); }}
            />
          )}
          {allPortfolios && allPortfolios.length > 1 && (
            <div className="relative" ref={acctDropdownRef}>
              <button
                className="btn-retro btn-retro-primary text-[10px] px-2 py-0.5 flex items-center gap-1"
                onClick={() => setAcctDropdownOpen((v) => !v)}
              >
                <span className="flex-1 text-left truncate max-w-[5rem]">
                  {selectedPortfolioId === "all" || !selectedPortfolioId
                    ? "ALL"
                    : (allPortfolios.find(p => p.id === selectedPortfolioId)?.name ?? "ALL")}
                </span>
                <span className="text-muted-foreground">▾</span>
              </button>
              {acctDropdownOpen && (
                <div className="absolute top-full right-0 mt-0.5 z-[60] bg-card border border-border min-w-full">
                  <button
                    className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-border/30 ${(!selectedPortfolioId || selectedPortfolioId === "all") ? "text-accent" : ""}`}
                    onClick={() => { onPortfolioChange?.("all"); onClose(); setAcctDropdownOpen(false); }}
                  >
                    ALL
                  </button>
                  {allPortfolios.map(p => (
                    <button
                      key={p.id}
                      className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-border/30 ${selectedPortfolioId === p.id ? "text-accent" : ""}`}
                      onClick={() => { onPortfolioChange?.(p.id); onClose(); setAcctDropdownOpen(false); }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="relative" ref={curDropdownRef}>
            <button
              className="btn-retro btn-retro-primary text-[10px] px-2 py-0.5 flex items-center gap-1 min-w-[4.5rem]"
              onClick={() => setCurDropdownOpen((v) => !v)}
            >
              <span className="flex-1 text-left">{displayCur}</span>
              <span className="text-muted-foreground">▾</span>
            </button>
            {curDropdownOpen && (
              <div className="absolute top-full right-0 mt-0.5 z-[60] bg-card border border-border min-w-full">
                {(["CAD", "USD"] as const).map((c) => (
                  <button
                    key={c}
                    className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-border/30 ${displayCur === c ? "text-accent" : ""}`}
                    onClick={() => { setDisplayCur(c); setCurDropdownOpen(false); }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn-retro px-2 py-1 text-[10px] flex items-center gap-1" onClick={onClose}>
            <X size={12} />CLOSE
          </button>
        </div>
      </div>

      <div className="p-4">

        {/* Price info */}
        <div className="border border-border bg-card p-4 mb-3">
          <div className="text-[10px] text-muted-foreground tracking-wide mb-2">PRICE</div>
          {p ? (
            <>
              <div className="flex flex-wrap items-baseline gap-3 mb-3">
                <span className="text-2xl font-medium tabular-nums">{sym}{fmt(toDisp(p.price))}</span>
                <span className={`text-sm tabular-nums ${p.changePercent >= 0 ? "text-positive" : "text-negative"}`}>
                  {p.changePercent >= 0 ? "+" : ""}{sym}{fmt(toDisp(Math.abs(p.change)))} ({fmtPct(p.changePercent)})
                </span>
              </div>
              {/* 52W range bar */}
              {p.week52High > 0 && p.week52Low > 0 && range52WPct != null && (
                <div className="mb-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>52W L: {sym}{fmt(toDisp(p.week52Low))}</span>
                    <span>52W H: {sym}{fmt(toDisp(p.week52High))}</span>
                  </div>
                  <div className="relative h-1.5 bg-border rounded-full">
                    <div
                      className="absolute top-0 h-full bg-border rounded-full"
                      style={{ width: "100%" }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-background"
                      style={{ left: `calc(${Math.min(100, Math.max(0, range52WPct))}% - 5px)`, backgroundColor: range52WDotColor }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 text-center">
                    {range52WPct.toFixed(0)}% from low · {fmtPct(p.fromHighPct)} from high
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground text-xs">LOADING PRICE DATA...</div>
          )}
        </div>

        {/* Position summary */}
        <div className="border border-border bg-card p-4 mb-3">
          <div className="text-[10px] text-muted-foreground tracking-wide mb-3">POSITION</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <div className="text-[10px] text-muted-foreground">SHARES</div>
              <div className="tabular-nums">{Number.isInteger(row.shares) ? fmt(row.shares, 0) : fmt(row.shares, row.shares < 10 ? 4 : 2)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">WEIGHT</div>
              <div className="tabular-nums">
                {totalMarketValue > 0 ? `${((row.marketValue / totalMarketValue) * 100).toFixed(1)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">AVG COST</div>
              <div className="tabular-nums">{sym}{fmt(toDisp(row.avgCost))}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">DAY CHANGE</div>
              <div className={`tabular-nums ${p ? (p.changePercent >= 0 ? "text-positive" : "text-negative") : ""}`}>
                {p ? `${p.changePercent >= 0 ? "+" : ""}${sym}${fmt(toDisp(p.change * row.shares))}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">COST BASIS</div>
              <div className="tabular-nums">{sym}{fmt(toDisp(row.costBasis))}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">MKT VALUE</div>
              <div className="tabular-nums">{row.marketValue > 0 ? `${sym}${fmt(toDisp(row.marketValue))}` : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">PRICE RETURN</div>
              <div className={`tabular-nums ${row.unrealizedPnL >= 0 ? "text-positive" : "text-negative"}`}>
                {row.marketValue > 0 ? `${row.unrealizedPnL >= 0 ? "+" : ""}${sym}${fmt(Math.abs(toDisp(row.unrealizedPnL)))} (${fmtPct(row.unrealizedPnLPct)})` : "—"}
              </div>
            </div>
            {totalReturn != null && (
              <div>
                <div className="text-[10px] text-muted-foreground">TOTAL RETURN</div>
                <div className={`tabular-nums ${totalReturn >= 0 ? "text-positive" : "text-negative"}`}>
                  {totalReturn >= 0 ? "+" : ""}{sym}{fmt(Math.abs(toDisp(totalReturn)))}
                  {totalReturnPct != null && ` (${fmtPct(totalReturnPct)})`}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dividends summary card */}
        {(p?.dividendYield != null || estimatedAnnual != null || totalDivsAllTime > 0) && (
          <div className="border border-border bg-card p-4 mb-3">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-3">DIVIDENDS</div>

            {/* Group 1: Rate & Yield */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {p?.dividendYield != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground">IND. YIELD</div>
                  <div className="tabular-nums">{p.dividendYield.toFixed(2)}%</div>
                </div>
              )}
              {actualYield != null ? (
                <div>
                  <div className="text-[10px] text-muted-foreground">ACTUAL YIELD</div>
                  <div className="tabular-nums">{actualYield.toFixed(2)}%</div>
                </div>
              ) : p?.trailingAnnualDividendYield != null ? (
                <div>
                  <div className="text-[10px] text-muted-foreground">TRAIL. YIELD</div>
                  <div className="tabular-nums">{p.trailingAnnualDividendYield.toFixed(2)}%</div>
                </div>
              ) : null}
              {actualYieldOnCost != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground">YIELD ON COST</div>
                  <div className="tabular-nums">{actualYieldOnCost.toFixed(2)}%</div>
                </div>
              )}
              {divFrequency && (
                <div>
                  <div className="text-[10px] text-muted-foreground">FREQUENCY</div>
                  <div className="tabular-nums">{divFrequency}</div>
                </div>
              )}
              {estimatedAnnual != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground">EST. ANNUAL</div>
                  <div className="tabular-nums text-primary">{sym}{fmt(toDisp(estimatedAnnual))}</div>
                </div>
              )}
            </div>

            {/* Group 2: History */}
            {(actualDivs12m > 0 || totalDivsAllTime > 0 || divCAGR !== null) && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mt-3 pt-3 border-t border-border/50">
                {actualDivs12m > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">12M RECEIVED</div>
                    <div className="tabular-nums">{sym}{fmt(toDisp(actualDivs12m))}</div>
                  </div>
                )}
                {totalDivsAllTime > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">ALL-TIME DIVS</div>
                    <div className="tabular-nums text-primary">{sym}{fmt(toDisp(totalDivsAllTime))}</div>
                  </div>
                )}
                {totalDivsAllTime > 0 && row.costBasis > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">BASIS REDUCED</div>
                    <div className="tabular-nums text-positive">
                      {((totalDivsAllTime / row.costBasis) * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
                {totalDivsAllTime > 0 && row.costBasis > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">EFF. COST</div>
                    <div className="tabular-nums">
                      {sym}{fmt(toDisp(Math.max(0, row.costBasis - totalDivsAllTime)))}
                    </div>
                  </div>
                )}
                {divCAGR !== null && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">DIV CAGR ({divCAGR.years}Y)</div>
                    <div className={`tabular-nums ${divCAGR.cagr >= 0 ? "text-positive" : "text-negative"}`}>
                      {divCAGR.cagr >= 0 ? "+" : ""}{divCAGR.cagr.toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Group 3: Schedule */}
            {(p?.exDividendDate || p?.dividendDate || p?.payoutRatio != null) && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mt-3 pt-3 border-t border-border/50">
                {p?.exDividendDate && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">EX-DIV DATE</div>
                    <div className="tabular-nums">{p.exDividendDate}</div>
                  </div>
                )}
                {p?.dividendDate && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">PAY DATE</div>
                    <div className="tabular-nums">{p.dividendDate}</div>
                  </div>
                )}
                {p?.payoutRatio != null && (
                  <div>
                    <div className="text-[10px] text-muted-foreground">PAYOUT RATIO</div>
                    <div className="tabular-nums">{p.payoutRatio}%</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Investment Plan */}
        {readOnly && investPlan && investPlan.target && (
          <div className="border border-border bg-card p-4 mb-3">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-3">INVESTMENT PLAN</div>
            {(() => {
              const currentPct = totalMarketValue > 0 ? (row.marketValue / totalMarketValue) * 100 : 0;
              const targetPct = investPlan.target!.pct;
              const gapPct = Math.max(0, targetPct - currentPct);
              const gapNative = gapAmount > 0 ? gapAmount : 0;
              const reached = gapNative < 0.01;
              const gapDisplay = convertCurrency(gapNative, row.holding.currency, displayCur, fxRate);
              const FREQ_LABEL = { weekly: "WK", biweekly: "BW", monthly: "MO" } as const;
              const allocDisplay = convertCurrency(allocAmount, row.holding.currency, displayCur, fxRate);
              const postPct = postAllocationPct ?? (() => {
                const postMktValue = row.marketValue + allocAmount;
                const postTotal = totalMarketValue + contribCAD / fxRateForAlloc;
                return postTotal > 0 ? (postMktValue / postTotal) * 100 : 0;
              })();
              const contribDisplay = investPlan.contribution
                ? convertCurrency(investPlan.contribution.amount, investPlan.contribution.currency, displayCur, fxRate)
                : 0;
              const periods = (!reached && contribDisplay > 0) ? Math.ceil(gapDisplay / contribDisplay) : 0;
              const fl = investPlan.contribution ? FREQ_LABEL[investPlan.contribution.frequency] : "BW";
              const sharesToBuy = p && allocAmount > 0 ? allocAmount / p.price : null;
              return (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] text-muted-foreground">TARGET</div>
                    <div className="tabular-nums">{targetPct.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">GAP</div>
                    {reached ? (
                      <div className="tabular-nums text-positive">✓ REACHED</div>
                    ) : (
                      <div className="tabular-nums">-{gapPct.toFixed(1)}% ({sym}{fmt(gapDisplay)})</div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">FUNDS</div>
                    <div className="tabular-nums text-primary">{sym}{fmt(allocDisplay)}</div>
                  </div>
                  {sharesToBuy != null && sharesToBuy > 0 && (
                    <div>
                      <div className="text-[10px] text-muted-foreground">SHARES TO BUY</div>
                      <div className="tabular-nums text-primary">
                        {sharesToBuy < 1 ? sharesToBuy.toFixed(4) : sharesToBuy < 10 ? sharesToBuy.toFixed(2) : fmt(sharesToBuy, 0)}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] text-muted-foreground">POST %</div>
                    <div className="tabular-nums">{postPct.toFixed(2)}%</div>
                  </div>
                  {!reached && periods > 0 && (
                    <div className="col-span-2">
                      <div className="text-[10px] text-muted-foreground">TO FILL GAP</div>
                      <div className="tabular-nums text-primary">
                        {periods} {fl} ({sym}{fmt(contribDisplay)}/{fl})
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {!showHistory && (
          <button
            className="w-full text-[10px] text-muted-foreground hover:text-primary transition-colors py-2 text-center tracking-wide border border-dashed border-border mb-3"
            onClick={() => setShowHistory(true)}
          >
            ▾ SHOW TRANSACTION HISTORY
          </button>
        )}

        {showHistory && (<>
        {/* Tab bar */}
        <div className="flex gap-2 mb-3">
          <button
            className={`btn-retro text-xs ${activeTab === "transactions" ? "btn-retro-primary" : ""}`}
            onClick={() => setActiveTab("transactions")}
          >
            TRANSACTIONS
          </button>
          <button
            className={`btn-retro text-xs ${activeTab === "dividends" ? "btn-retro-primary" : ""}`}
            onClick={() => setActiveTab("dividends")}
          >
            DIV HISTORY
          </button>
        </div>

        {/* Transactions tab */}
        {activeTab === "transactions" && (
          <div className="border border-border bg-card p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] text-muted-foreground tracking-wide">
                {txnsLoading ? "LOADING..." : txnsError ? "FAILED TO LOAD" : `TRANSACTIONS (${filteredTxns.length}/${buysSells.length})`}
              </div>
              {txnsError && (
                <button className="btn-retro text-[9px] px-2 py-0.5" onClick={() => fetchTxns()}>RETRY</button>
              )}
            </div>
            {buysSells.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px]">
                <span className="text-muted-foreground">FROM</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="!w-auto !p-1 !text-[10px] tabular-nums"
                />
                <span className="text-muted-foreground">TO</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="!w-auto !p-1 !text-[10px] tabular-nums"
                />
              </div>
            )}
            {filteredTxns.length === 0 ? (
              <div className="text-muted-foreground text-xs text-center py-4">NO TRANSACTIONS</div>
            ) : (
              <div className="space-y-2">
                {[...filteredTxns].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).map((txn) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between text-xs border-b border-border pb-2 last:border-0 select-none cursor-default"
                    onMouseDown={(e) => row.holding.source !== "questrade" && startLongPress(e, txn)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={(e) => row.holding.source !== "questrade" && startLongPress(e, txn)}
                    onTouchEnd={cancelLongPress}
                    onTouchCancel={cancelLongPress}
                  >
                    <div className="flex items-center gap-2">
                      <span className={txn.action === "BUY" ? "text-positive" : "text-negative"}>
                        {txn.action}
                      </span>
                      <span className="tabular-nums">{(() => { const q = parseFloat(txn.quantity); return Number.isInteger(q) ? fmt(q, 0) : fmt(q, q < 10 ? 4 : 2); })()}</span>
                      <span className="text-muted-foreground">@</span>
                      <span className="tabular-nums">{sym}{fmt(toDisp(parseFloat(txn.price)))}</span>
                    </div>
                    <div className="text-right">
                      <div className="tabular-nums text-muted-foreground">
                        {sym}{fmt(toDisp(parseFloat(txn.quantity) * parseFloat(txn.price)))}
                      </div>
                      {txn.date && (
                        <div className="text-[10px] text-muted-foreground/60">{txn.date.slice(0, 10)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Long-press context menu */}
            {txnMenu && mounted && createPortal(
                <div className="fixed inset-0 z-[200]" onClick={() => setTxnMenu(null)}>
                  <div
                    className="absolute bg-card border border-border shadow-lg min-w-[160px]"
                    style={{ top: Math.min(txnMenu.y, window.innerHeight - 120), left: "50%", transform: "translateX(-50%)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-[10px] text-muted-foreground px-3 py-2 border-b border-border tracking-wide">
                      {txnMenu.txn.action} · {txnMenu.txn.date?.slice(0, 10)}
                    </div>
                    <button
                      className="w-full text-left px-3 py-2 text-xs hover:bg-border/30"
                      onClick={() => { setEditingTxn(txnMenu.txn); setTxnMenu(null); }}
                    >
                      EDIT
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 text-xs text-negative hover:bg-border/30"
                      disabled={deletingTxnId === txnMenu.txn.id}
                      onClick={async () => { const id = txnMenu.txn.id; setTxnMenu(null); await deleteTxn(id); }}
                    >
                      {deletingTxnId === txnMenu.txn.id ? "DELETING..." : "DELETE"}
                    </button>
                  </div>
                </div>,
                document.body
              )}
              {/* Edit form */}
              {editingTxn && mounted && createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={() => setEditingTxn(null)}>
                  <div className="bg-card border border-border p-4 w-[90vw] max-w-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="text-[10px] text-muted-foreground tracking-wide mb-3">EDIT — {editingTxn.action}</div>
                    <form
                      className="space-y-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        await updateTxn(editingTxn.id, {
                          action: fd.get("action") as string,
                          date: fd.get("date") as string,
                          quantity: fd.get("quantity") as string,
                          price: fd.get("price") as string,
                          commission: fd.get("commission") as string,
                          notes: fd.get("notes") as string,
                        });
                        setEditingTxn(null);
                      }}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1">ACTION</div>
                          <select name="action" defaultValue={editingTxn.action} className="text-xs w-full">
                            <option value="BUY">BUY</option>
                            <option value="SELL">SELL</option>
                          </select>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1">DATE</div>
                          <input name="date" type="date" defaultValue={editingTxn.date?.slice(0, 10)} className="text-xs w-full" required />
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1">QTY</div>
                          <input name="quantity" type="number" step="any" defaultValue={editingTxn.quantity} className="text-xs w-full" required />
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1">PRICE</div>
                          <input name="price" type="number" step="any" defaultValue={editingTxn.price} className="text-xs w-full" required />
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1">COMMISSION</div>
                          <input name="commission" type="number" step="any" defaultValue={editingTxn.commission} className="text-xs w-full" />
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1">NOTES</div>
                          <input name="notes" type="text" defaultValue={editingTxn.notes ?? ""} className="text-xs w-full" />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button type="submit" className="btn-retro btn-retro-primary text-xs flex-1">SAVE</button>
                        <button type="button" className="btn-retro text-xs flex-1" onClick={() => setEditingTxn(null)}>CANCEL</button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body
              )}
          </div>
        )}

        {/* Dividend History tab */}
        {activeTab === "dividends" && (
          <>
            {/* Dividend history bar chart */}
            {(hasActualDivChart || hasProjectedDivChart) && (
              <div className="border border-border bg-card p-4 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] text-muted-foreground tracking-wide">12-MONTH HISTORY</div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {hasActualDivChart && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-[1px]" style={{ backgroundColor: COLOR_ACTUAL }} />
                        ACTUAL
                      </span>
                    )}
                    {hasProjectedDivChart && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-[1px]" style={{ backgroundColor: COLOR_PROJECTED }} />
                        EST.
                      </span>
                    )}
                  </div>
                </div>
                <div className="chart-touch-zone">
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={divChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={14}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 0,
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                      }}
                      formatter={(value: number, _name: string, props: any) => [
                        `${sym}${fmt(toDisp(value))} ${props.payload.source === "projected" ? "(EST)" : ""}`,
                        "DIVIDEND",
                      ]}
                      labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                      cursor={{ fill: "hsl(var(--border) / 0.3)" }}
                    />
                    <Bar dataKey="amount" radius={[1, 1, 0, 0]}>
                      {divChartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.source === "projected" ? COLOR_PROJECTED : COLOR_ACTUAL}
                          opacity={entry.source === "projected" ? 0.7 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Dividend transactions list — toggled by clock icon */}
            <div className="border border-border bg-card p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[10px] text-muted-foreground tracking-wide">
                  RECEIVED ({dividendTxns.length})
                </div>
                {totalDivsAllTime > 0 && (
                  <span className="text-[10px] text-primary tabular-nums">{sym}{fmt(toDisp(totalDivsAllTime))}</span>
                )}
              </div>
              {dividendTxns.length > 0 && (
                <div className="flex items-center gap-2 mb-3 text-[10px]">
                  <span className="text-muted-foreground">FROM</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="!w-auto !p-1 !text-[10px] tabular-nums"
                  />
                  <span className="text-muted-foreground">TO</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="!w-auto !p-1 !text-[10px] tabular-nums"
                  />
                </div>
              )}
              {filteredDivs.length > 1 && (
                <div className="flex items-center justify-between text-xs mb-3 p-2 border border-primary/30 bg-primary/5">
                  <span className="text-muted-foreground">PERIOD TOTAL</span>
                  <span className="tabular-nums text-primary font-medium">{sym}{fmt(toDisp(totalDivsReceived))}</span>
                </div>
              )}
              {filteredDivs.length === 0 ? (
                <div className="text-muted-foreground text-xs text-center py-4">
                  {dividendTxns.length === 0 ? "NO DIVIDEND HISTORY" : "NO DIVIDENDS IN DATE RANGE"}
                </div>
              ) : (
                <div className="space-y-2">
                  {[...filteredDivs].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).map((txn) => (
                    <div key={txn.id} className="flex items-center justify-between text-xs border-b border-border pb-2 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-primary">DIV</span>
                        <span className="text-muted-foreground tabular-nums">{txn.date?.slice(0, 10) ?? "—"}</span>
                      </div>
                      <div className="tabular-nums text-primary">{sym}{fmt(toDisp(parseFloat(txn.price) * parseFloat(txn.quantity)))}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        </>)}

        {/* Delete button */}
        {!readOnly && (
          !confirmDelete ? (
            <button
              className="btn-retro text-xs text-negative border-negative/30 hover:border-negative w-full py-2"
              onClick={() => setConfirmDelete(true)}
            >
              DELETE HOLDING
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                className="btn-retro text-xs text-negative border-negative/30 hover:border-negative flex-1 py-2"
                onClick={deleteHolding}
              >
                CONFIRM DELETE
              </button>
              <button
                className="btn-retro text-xs flex-1 py-2"
                onClick={() => setConfirmDelete(false)}
              >
                CANCEL
              </button>
            </div>
          )
        )}
      </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(panel, document.body);
}
