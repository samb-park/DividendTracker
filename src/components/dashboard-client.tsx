"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { HoldingsTable } from "./holdings-table";
import { PortfolioCharts } from "./portfolio-charts";
import { AllocationBars } from "./allocation-bars";
import { DividendIncomeChart } from "./dividend-income-chart";
import { PerformanceChart } from "./performance-chart";
import { SkeletonBlock } from "./skeleton";
import { fmt, mergeHoldings } from "@/lib/utils";
import type { Portfolio, HoldingSummary } from "@/lib/types";

export function DashboardClient({ initialPortfolios, fxRate: initialFxRate }: { initialPortfolios: Portfolio[]; fxRate: number }) {
  const [portfolios] = useState(initialPortfolios);
  const [holdingSummaries, setHoldingSummaries] = useState<HoldingSummary[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState<"CAD" | "USD">("CAD");
  const [fxRate, setFxRate] = useState(initialFxRate);
  const [fxFallback, setFxFallback] = useState(false);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<"all" | string>("all");
  const [acctDropdownOpen, setAcctDropdownOpen] = useState(false);
  const [curDropdownOpen, setCurDropdownOpen] = useState(false);
  const acctDropdownRef = useRef<HTMLDivElement>(null);
  const curDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (acctDropdownRef.current && !acctDropdownRef.current.contains(e.target as Node)) {
        setAcctDropdownOpen(false);
      }
      if (curDropdownRef.current && !curDropdownRef.current.contains(e.target as Node)) {
        setCurDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAcctDropdownOpen(false);
        setCurDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  const [divAnnual, setDivAnnual] = useState<number | null>(null);
  const [divMonthly, setDivMonthly] = useState<number | null>(null);
  const [divShowMonthly, setDivShowMonthly] = useState(false);
  const [incomeGoal, setIncomeGoal] = useState<{ annualTarget: number; currency: "CAD" | "USD" } | null>(null);
  const [divPortfolioCagr, setDivPortfolioCagr] = useState<number | null>(null);
  const [growthTickers, setGrowthTickers] = useState<Array<{ ticker: string; history: Array<{ year: number; annualDPS: number }> }>>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/investment").then(r => r.json()).catch(() => ({})),
      fetch("/api/fx").then(r => r.json()).catch(() => ({ fallback: true })),
      fetch("/api/dividend-growth").then(r => r.json()).catch(() => ({ tickers: [] })),
    ]).then(([inv, fx, growth]) => {
      if (inv.incomeGoal) setIncomeGoal(inv.incomeGoal);
      if (fx.rate) setFxRate(fx.rate);
      if (fx.fallback) setFxFallback(true);
      setGrowthTickers(growth.tickers ?? []);
    });
  }, []);

  // Compute market-value-weighted portfolio dividend CAGR
  // Re-runs when holdingSummaries (prices) load so weights reflect actual position sizes
  useEffect(() => {
    if (!growthTickers.length) return;

    const cadValueByTicker: Record<string, number> = {};
    for (const s of holdingSummaries) {
      cadValueByTicker[s.ticker] = s.currency === "USD" ? s.marketValue * fxRate : s.marketValue;
    }

    let weightedSum = 0;
    let totalWeight = 0;
    for (const t of growthTickers) {
      const h = t.history.filter((r: { annualDPS: number }) => r.annualDPS > 0);
      if (h.length < 3) continue;
      const first = h[0];
      const last = h[h.length - 1];
      const years = last.year - first.year;
      if (years <= 0 || first.annualDPS <= 0) continue;
      const cagr = (Math.pow(last.annualDPS / first.annualDPS, 1 / years) - 1) * 100;
      const weight = cadValueByTicker[t.ticker] ?? 1; // equal weight fallback before prices load
      weightedSum += cagr * weight;
      totalWeight += weight;
    }
    if (totalWeight > 0) {
      setDivPortfolioCagr(weightedSum / totalWeight);
    }
  }, [growthTickers, holdingSummaries, fxRate]);

  useEffect(() => {
    setHoldingSummaries([]);
    setLoadingData(true);
  }, [selectedPortfolioId]);

  const displayPortfolios = useMemo(() =>
    selectedPortfolioId === "all" ? portfolios : portfolios.filter(p => p.id === selectedPortfolioId),
    [portfolios, selectedPortfolioId]
  );

  const allHoldings = useMemo(() => mergeHoldings(displayPortfolios), [displayPortfolios]);

  const toDisplay = useCallback((value: number, currency: "USD" | "CAD") => {
    if (displayCurrency === "CAD") {
      return currency === "USD" ? value * fxRate : value;
    } else {
      return currency === "CAD" ? value / fxRate : value;
    }
  }, [displayCurrency, fxRate]);

  const currencySymbol = displayCurrency === "CAD" ? "C$" : "$";

  const totalCash = useMemo(() => {
    return displayPortfolios.reduce((sum, p) => {
      const cad = parseFloat(p.cashCAD ?? "0") || 0;
      const usd = parseFloat(p.cashUSD ?? "0") || 0;
      return sum + toDisplay(cad, "CAD") + toDisplay(usd, "USD");
    }, 0);
  }, [displayPortfolios, toDisplay]);

  const totalCashCAD = useMemo(() => {
    return displayPortfolios.reduce((sum, p) => {
      const cad = parseFloat(p.cashCAD ?? "0") || 0;
      const usd = parseFloat(p.cashUSD ?? "0") || 0;
      return sum + cad + usd * fxRate;
    }, 0);
  }, [displayPortfolios, fxRate]);

  const holdingsValue = holdingSummaries.reduce((s, h) => s + toDisplay(h.marketValue, h.currency), 0);
  const totalValue = holdingsValue + totalCash;
  const totalCostBasis = holdingSummaries.reduce((s, h) => s + toDisplay(h.costBasis ?? h.marketValue - h.unrealizedPnL, h.currency), 0);
  const openPnL = holdingsValue - totalCostBasis;
  const openPnLPct = totalCostBasis > 0 ? (openPnL / totalCostBasis) * 100 : 0;
  const todayPnL = holdingSummaries.reduce((s, h) => s + toDisplay(h.dayChange ?? 0, h.currency), 0);
  const todayPnLPct = holdingsValue > 0 ? (todayPnL / (holdingsValue - todayPnL)) * 100 : 0;

  const onDivSummary = useCallback((annual: number, monthly: number) => {
    setDivAnnual(annual);
    setDivMonthly(monthly);
  }, []);

  const handleHoldingsChange = useCallback((rows: HoldingSummary[]) => {
    setHoldingSummaries(rows);
    setLoadingData(false);
  }, []);

  return (
    <div>
      {/* Account selector + currency toggle */}
      <div className="flex items-center gap-2 mb-6 border-b border-border pb-3">
        <div className="relative" ref={acctDropdownRef}>
          <button
            className="btn-retro btn-retro-primary text-xs flex items-center gap-1.5"
            onClick={() => setAcctDropdownOpen((v) => !v)}
            aria-label="Select portfolio"
            aria-haspopup="listbox"
            aria-expanded={acctDropdownOpen}
          >
            <span className="flex-1 text-left">
              {selectedPortfolioId === "all"
                ? "ALL"
                : portfolios.find((p) => p.id === selectedPortfolioId)?.name ?? "ALL"}
            </span>
            <span className="text-muted-foreground" aria-hidden="true">▾</span>
          </button>
          {acctDropdownOpen && (
            <div className="absolute top-full left-0 mt-0.5 z-50 bg-card border border-border min-w-full" role="listbox" aria-label="Portfolio">
              <button
                role="option"
                aria-selected={selectedPortfolioId === "all"}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-border/30 ${selectedPortfolioId === "all" ? "text-accent" : ""}`}
                onClick={() => { setSelectedPortfolioId("all"); setAcctDropdownOpen(false); }}
              >
                ALL
              </button>
              {portfolios.map((p) => (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={selectedPortfolioId === p.id}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-border/30 ${selectedPortfolioId === p.id ? "text-accent" : ""}`}
                  onClick={() => { setSelectedPortfolioId(p.id); setAcctDropdownOpen(false); }}
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
            aria-label="Select display currency"
            aria-haspopup="listbox"
            aria-expanded={curDropdownOpen}
          >
            <span className="flex-1 text-left">{displayCurrency}</span>
            <span className="text-muted-foreground" aria-hidden="true">▾</span>
          </button>
          {curDropdownOpen && (
            <div className="absolute top-full right-0 mt-0.5 z-50 bg-card border border-border min-w-full" role="listbox" aria-label="Display currency">
              {(["CAD", "USD"] as const).map((c) => (
                <button
                  key={c}
                  role="option"
                  aria-selected={displayCurrency === c}
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
      {fxFallback && (
        <div className="text-[10px] text-negative/70 text-right -mt-3 mb-2">
          FX rate unavailable — using fallback
        </div>
      )}

      {/* Loading skeleton */}
      {loadingData && holdingSummaries.length === 0 && (
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-3 gap-px bg-border border border-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card p-3 space-y-2">
                <SkeletonBlock className="h-2.5 w-16" />
                <SkeletonBlock className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — no holdings loaded yet */}
      {!loadingData && holdingSummaries.length === 0 && allHoldings.length === 0 && (
        <div className="border border-dashed border-border p-8 text-center mb-6">
          <div className="text-accent text-xs tracking-wide mb-3">▶ GETTING STARTED</div>
          <div className="text-xs text-muted-foreground space-y-1.5">
            <div>1. Go to <span className="text-foreground">SETTINGS</span> → create a portfolio</div>
            <div>2. Add stocks via the <span className="text-foreground">HOLDINGS</span> tab</div>
            <div>3. Or import automatically via <span className="text-foreground">SETTINGS → BROKER SYNC</span></div>
          </div>
        </div>
      )}

      {/* Summary grid */}
      {holdingSummaries.length > 0 && (
        <div className="grid grid-cols-3 gap-px border border-border bg-border mb-6">
          <div className="bg-card p-3">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">TOTAL ASSETS</div>
            <div className="text-xs font-medium tabular-nums truncate">{currencySymbol}{fmt(totalValue)}</div>
          </div>
          <div className="bg-card p-3">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">MARKET VALUE</div>
            <div className="text-xs font-medium tabular-nums truncate">{currencySymbol}{fmt(holdingsValue)}</div>
          </div>
          {totalCash > 0 && (
            <div className="bg-card p-3">
              <div className="text-[10px] text-muted-foreground tracking-wide mb-1">CASH</div>
              <div className="text-xs font-medium tabular-nums truncate">{currencySymbol}{fmt(totalCash)}</div>
            </div>
          )}
          <div className="bg-card p-3">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">OPEN P&amp;L</div>
            <div className={`text-xs font-medium tabular-nums truncate ${openPnL >= 0 ? "text-positive" : "text-negative"}`}>
              {openPnL >= 0 ? "+" : ""}{currencySymbol}{fmt(Math.abs(openPnL))}
            </div>
            <div className={`text-[10px] tabular-nums ${openPnL >= 0 ? "text-positive" : "text-negative"}`}>
              ({openPnL >= 0 ? "+" : ""}{openPnLPct.toFixed(2)}%)
            </div>
          </div>
          <div className="bg-card p-3">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">TODAY&apos;S P&amp;L</div>
            <div className={`text-xs font-medium tabular-nums truncate ${todayPnL >= 0 ? "text-positive" : "text-negative"}`}>
              {todayPnL >= 0 ? "+" : ""}{currencySymbol}{fmt(Math.abs(todayPnL))}
            </div>
            <div className={`text-[10px] tabular-nums ${todayPnL >= 0 ? "text-positive" : "text-negative"}`}>
              ({todayPnL >= 0 ? "+" : ""}{todayPnLPct.toFixed(2)}%)
            </div>
          </div>
          <div className="bg-card p-3 cursor-pointer select-none hover:bg-border/20 active:bg-border/40 transition-colors" onClick={() => setDivShowMonthly((v) => !v)} role="button" aria-label={`Toggle between annual and monthly dividend view. Currently showing ${divShowMonthly ? "monthly" : "annual"}`}>
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">
              {divShowMonthly ? "DIV / MONTH" : "DIV / YEAR"}
            </div>
            <div className="text-xs font-medium tabular-nums truncate text-primary">
              {divAnnual !== null ? `${currencySymbol}${fmt(divShowMonthly ? (divMonthly ?? 0) : divAnnual)}` : "—"}
            </div>
            {divAnnual !== null && holdingsValue > 0 && (
              <div className="text-[10px] tabular-nums text-primary/70">
                {((divAnnual / holdingsValue) * 100).toFixed(2)}% yield
              </div>
            )}
            {incomeGoal && divAnnual !== null && (() => {
              const goalInDisplay = incomeGoal.currency === displayCurrency
                ? incomeGoal.annualTarget
                : displayCurrency === "CAD"
                  ? incomeGoal.annualTarget * fxRate
                  : incomeGoal.annualTarget / fxRate;
              const pct = Math.min((divAnnual / goalInDisplay) * 100, 100);
              return (
                <div className="mt-1.5">
                  <div className="h-1 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                    {pct.toFixed(0)}% of {currencySymbol}{fmt(goalInDisplay)} goal
                  </div>
                  {/* Prediction: years to reach goal at current dividend CAGR */}
                  {divPortfolioCagr !== null && divPortfolioCagr > 0 && divAnnual !== null && divAnnual < goalInDisplay && (() => {
                    const yearsToGoal = Math.log(goalInDisplay / divAnnual) / Math.log(1 + divPortfolioCagr / 100);
                    const targetYear = new Date().getFullYear() + Math.ceil(yearsToGoal);
                    return (
                      <div className="text-[10px] text-primary/80 mt-0.5 tabular-nums">
                        ≈ {Math.ceil(yearsToGoal)} yrs at {divPortfolioCagr.toFixed(1)}% div CAGR → {targetYear}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* CAGR / MDD Performance chart (snapshot-based) */}
      <PerformanceChart />

      {/* Total Equity line chart */}
      {holdingSummaries.length > 0 && (
        <PortfolioCharts
          holdings={holdingSummaries}
          holdingsWithTransactions={allHoldings}
          fxRate={fxRate}
          totalCashCAD={totalCashCAD}
        />
      )}

      {/* Allocation + Dividend Distribution horizontal bars */}
      {holdingSummaries.length > 0 && (
        <AllocationBars
          holdings={holdingSummaries}
          fxRate={fxRate}
          displayCurrency={displayCurrency}
        />
      )}

      {/* Dividend Income Chart */}
      <DividendIncomeChart
        selectedPortfolioId={selectedPortfolioId}
        fxRate={fxRate}
        displayCurrency={displayCurrency}
        onCurrentYearSummary={onDivSummary}
      />

      {/* Hidden table just to fetch prices and compute summaries */}
      <div style={{ position: "absolute", visibility: "hidden", height: 0, overflow: "hidden" }}>
        <HoldingsTable
          portfolioId="all"
          initialHoldings={allHoldings}
          onHoldingsChange={handleHoldingsChange}
          readOnly
          displayCurrency={displayCurrency}
        />
      </div>
    </div>
  );
}
