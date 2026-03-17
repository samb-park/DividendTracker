"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { HoldingsTable } from "./holdings-table";
import { PortfolioCharts } from "./portfolio-charts";
import { DividendIncomeChart } from "./dividend-income-chart";

interface Transaction {
  id: string;
  action: "BUY" | "SELL" | "DIVIDEND";
  quantity: string;
  price: string;
  commission: string;
  date: string;
}

interface Holding {
  id: string;
  ticker: string;
  name: string | null;
  currency: "USD" | "CAD";
  quantity: string | null;
  avgCost: string | null;
  transactions: Transaction[];
}

interface Portfolio {
  id: string;
  name: string;
  cashCAD: string | null;
  cashUSD: string | null;
  holdings: Holding[];
}

interface HoldingSummary {
  ticker: string;
  name?: string | null;
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  dayChange: number;
  currency: "USD" | "CAD";
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function mergeHoldings(portfolios: Portfolio[]): Holding[] {
  const map = new Map<string, Holding>();
  for (const p of portfolios) {
    for (const h of p.holdings) {
      const existing = map.get(h.ticker);
      if (existing) {
        const existingQty = existing.quantity != null ? parseFloat(existing.quantity) : 0;
        const existingCost = existing.avgCost != null ? parseFloat(existing.avgCost) : 0;
        const newQty = h.quantity != null ? parseFloat(h.quantity) : 0;
        const newCost = h.avgCost != null ? parseFloat(h.avgCost) : 0;
        const totalQty = existingQty + newQty;
        const weightedAvgCost = totalQty > 0
          ? (existingQty * existingCost + newQty * newCost) / totalQty
          : 0;
        map.set(h.ticker, {
          ...existing,
          quantity: totalQty.toString(),
          avgCost: weightedAvgCost.toString(),
          transactions: [...existing.transactions, ...h.transactions],
        });
      } else {
        map.set(h.ticker, { ...h, transactions: [...h.transactions] });
      }
    }
  }
  return Array.from(map.values());
}

export function PortfolioClient({ initialPortfolios, fxRate: initialFxRate }: { initialPortfolios: Portfolio[]; fxRate: number; }) {
  const [portfolios, setPortfolios] = useState(initialPortfolios);
  const [activeTab, setActiveTab] = useState<"all" | string>("all");
  const [divAnnual, setDivAnnual] = useState<number | null>(null);
  const [divMonthly, setDivMonthly] = useState<number | null>(null);
  const [divShowMonthly, setDivShowMonthly] = useState(false);
  const [acctDropdownOpen, setAcctDropdownOpen] = useState(false);
  const [curDropdownOpen, setCurDropdownOpen] = useState(false);
  const acctDropdownRef = useRef<HTMLDivElement>(null);
  const curDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (acctDropdownRef.current && !acctDropdownRef.current.contains(e.target as Node)) {
        setAcctDropdownOpen(false);
      }
      if (curDropdownRef.current && !curDropdownRef.current.contains(e.target as Node)) {
        setCurDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const [holdingSummaries, setHoldingSummaries] = useState<HoldingSummary[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<"CAD" | "USD">("CAD");
  const [fxRate, setFxRate] = useState(initialFxRate);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    fetch("/api/fx").then((r) => r.json()).then((d) => { if (d.rate) setFxRate(d.rate); }).catch(() => {});
  }, []);

  const isAllMode = activeTab === "all";
  const activePortfolio = isAllMode ? null : portfolios.find((p) => p.id === activeTab) ?? null;

  const displayHoldings = useMemo(() => {
    if (isAllMode) return mergeHoldings(portfolios);
    return activePortfolio?.holdings ?? [];
  }, [isAllMode, activePortfolio, portfolios]);

  const displayPortfolioId = isAllMode ? "all" : activePortfolio?.id ?? "";

  // Convert a value in its native currency to display currency
  const toDisplay = useCallback((value: number, currency: "USD" | "CAD") => {
    if (displayCurrency === "CAD") {
      return currency === "USD" ? value * fxRate : value;
    } else {
      return currency === "CAD" ? value / fxRate : value;
    }
  }, [displayCurrency, fxRate]);

  const currencySymbol = displayCurrency === "CAD" ? "C$" : "$";

  // Cash from relevant portfolios
  const totalCash = useMemo(() => {
    const sources = isAllMode ? portfolios : activePortfolio ? [activePortfolio] : [];
    return sources.reduce((sum, p) => {
      const cad = parseFloat(p.cashCAD ?? "0") || 0;
      const usd = parseFloat(p.cashUSD ?? "0") || 0;
      return sum + toDisplay(cad, "CAD") + toDisplay(usd, "USD");
    }, 0);
  }, [isAllMode, portfolios, activePortfolio, toDisplay]);

  // Cash in CAD for chart (chart uses CAD as base, USD * fxRate)
  const totalCashCAD = useMemo(() => {
    const sources = isAllMode ? portfolios : activePortfolio ? [activePortfolio] : [];
    return sources.reduce((sum, p) => {
      const cad = parseFloat(p.cashCAD ?? "0") || 0;
      const usd = parseFloat(p.cashUSD ?? "0") || 0;
      return sum + cad + usd * fxRate;
    }, 0);
  }, [isAllMode, portfolios, activePortfolio, fxRate]);

  const holdingsValue = holdingSummaries.reduce((s, h) => s + toDisplay(h.marketValue, h.currency), 0);
  const totalValue = holdingsValue + totalCash;
  const totalCostBasis = holdingSummaries.reduce((s, h) => s + toDisplay(h.costBasis ?? h.marketValue - h.unrealizedPnL, h.currency), 0);
  const openPnL = holdingsValue - totalCostBasis;
  const openPnLPct = totalCostBasis > 0 ? (openPnL / totalCostBasis) * 100 : 0;
  const todayPnL = holdingSummaries.reduce((s, h) => s + toDisplay(h.dayChange ?? 0, h.currency), 0);
  const todayPnLPct = holdingsValue > 0 ? (todayPnL / (holdingsValue - todayPnL)) * 100 : 0;

  return (
    <div className={`transition-[padding] duration-200 ${detailOpen ? "md:pr-[29rem] lg:pr-[33rem] xl:pr-[50%]" : ""}`}>
      {/* Portfolio tabs + currency toggle */}
      <div className="flex items-center gap-2 mb-6 border-b border-border pb-3">
        <div className="relative" ref={acctDropdownRef}>
          <button
            className="btn-retro btn-retro-primary text-xs flex items-center gap-1.5"
            onClick={() => setAcctDropdownOpen((v) => !v)}
          >
            <span className="flex-1 text-left">
              {isAllMode
                ? "ALL"
                : portfolios.find((p) => p.id === activeTab)?.name ?? "ALL"}
            </span>
            <span className="text-muted-foreground">▾</span>
          </button>
          {acctDropdownOpen && (
            <div className="absolute top-full left-0 mt-0.5 z-50 bg-card border border-border min-w-full">
              <button
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-border/30 ${isAllMode ? "text-accent" : ""}`}
                onClick={() => { setActiveTab("all"); setHoldingSummaries([]); setAcctDropdownOpen(false); }}
              >
                ALL
              </button>
              {portfolios.map((p) => (
                <button
                  key={p.id}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-border/30 ${activeTab === p.id ? "text-accent" : ""}`}
                  onClick={() => { setActiveTab(p.id); setHoldingSummaries([]); setAcctDropdownOpen(false); }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto relative" ref={curDropdownRef}>
          <button
            className="btn-retro btn-retro-primary text-xs flex items-center gap-1.5"
            onClick={() => setCurDropdownOpen((v) => !v)}
          >
            <span className="flex-1 text-left">{displayCurrency}</span>
            <span className="text-muted-foreground">▾</span>
          </button>
          {curDropdownOpen && (
            <div className="absolute top-full right-0 mt-0.5 z-50 bg-card border border-border min-w-full">
              {(["CAD", "USD"] as const).map((c) => (
                <button
                  key={c}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-border/30 ${displayCurrency === c ? "text-accent" : ""}`}
                  onClick={() => { setDisplayCurrency(c); setCurDropdownOpen(false); }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>


      {/* P&L Line Chart */}
      {holdingSummaries.length > 0 && (
        <PortfolioCharts
          holdings={holdingSummaries}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          holdingsWithTransactions={displayHoldings as any}
          fxRate={fxRate}
          totalCashCAD={totalCashCAD}
        />
      )}

      {/* Summary bar between chart and positions */}
      {holdingSummaries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-px border border-border bg-border mb-6">
          <div className="bg-card p-3">
            <div className="text-[10px] text-muted-foreground tracking-widest mb-1">TOTAL ASSETS</div>
            <div className="text-sm font-medium tabular-nums">{currencySymbol}{fmt(totalValue)}</div>
          </div>
          <div className="bg-card p-3">
            <div className="text-[10px] text-muted-foreground tracking-widest mb-1">MARKET VALUE</div>
            <div className="text-sm font-medium tabular-nums">{currencySymbol}{fmt(holdingsValue)}</div>
          </div>
          {totalCash > 0 && (
            <div className="bg-card p-3">
              <div className="text-[10px] text-muted-foreground tracking-widest mb-1">CASH</div>
              <div className="text-sm font-medium tabular-nums">{currencySymbol}{fmt(totalCash)}</div>
            </div>
          )}
          <div className="bg-card p-3">
            <div className="text-[10px] text-muted-foreground tracking-widest mb-1">OPEN P&amp;L</div>
            <div className={`text-sm font-medium tabular-nums ${openPnL >= 0 ? "text-positive" : "text-negative"}`}>
              {openPnL >= 0 ? "+" : ""}{currencySymbol}{fmt(Math.abs(openPnL))}
              <span className="text-xs ml-1">({openPnL >= 0 ? "+" : ""}{openPnLPct.toFixed(2)}%)</span>
            </div>
          </div>
          <div className="bg-card p-3">
            <div className="text-[10px] text-muted-foreground tracking-widest mb-1">TODAY&apos;S P&amp;L</div>
            <div className={`text-sm font-medium tabular-nums ${todayPnL >= 0 ? "text-positive" : "text-negative"}`}>
              {todayPnL >= 0 ? "+" : ""}{currencySymbol}{fmt(Math.abs(todayPnL))}
              <span className="text-xs ml-1">({todayPnL >= 0 ? "+" : ""}{todayPnLPct.toFixed(2)}%)</span>
            </div>
          </div>
          <div className="bg-card p-3 cursor-pointer select-none" onClick={() => setDivShowMonthly((v) => !v)}>
            <div className="text-[10px] text-muted-foreground tracking-widest mb-1">
              {divShowMonthly ? "DIV / MONTH" : "DIV / YEAR"}
            </div>
            <div className="text-sm font-medium tabular-nums text-primary">
              {divAnnual !== null ? `${currencySymbol}${fmt(divShowMonthly ? (divMonthly ?? 0) : divAnnual)}` : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Hidden — fetch dividend data for summary tile only */}
      <div className="hidden">
        <DividendIncomeChart
          selectedPortfolioId={isAllMode ? "all" : activeTab}
          fxRate={fxRate}
          displayCurrency={displayCurrency}
          onCurrentYearSummary={(annual, monthly) => {
            setDivAnnual(annual);
            setDivMonthly(monthly);
          }}
        />
      </div>

      {/* Holdings table */}
      {displayHoldings.length > 0 || portfolios.length > 0 ? (
        <HoldingsTable
          key={displayPortfolioId}
          portfolioId={displayPortfolioId}
          initialHoldings={displayHoldings}
          onHoldingsChange={setHoldingSummaries}
          onDetailOpen={setDetailOpen}
          readOnly={isAllMode}
          displayCurrency={displayCurrency}
        />
      ) : (
        <div className="text-muted-foreground text-xs py-12 text-center border border-dashed border-border">
          NO PORTFOLIOS — CREATE ONE IN SETTINGS
        </div>
      )}
    </div>
  );
}
