"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { HoldingsTable } from "./holdings-table";
import { AllocationBars } from "./allocation-bars";
import { DividendIncomeChart } from "./dividend-income-chart";
import { PerformanceChart } from "./performance-chart";
import { UpcomingDividends } from "./upcoming-dividends";
import { SkeletonBlock } from "./skeleton";
import { Card } from "./ui-card";
import { fmt, mergeHoldings } from "@/lib/utils";
import { CurrencyProvider, useCurrency } from "@/lib/currency-context";
import type { Portfolio, HoldingSummary } from "@/lib/types";
// Trigger / NDX-based recommendation banner was removed from Overview by user
// request — Overview is a summary screen, not an execution-recommendation
// surface. The actual rulebook trigger calculations still live in
// src/lib/rulebook.ts and are surfaced through AI Assistance / Rulebook Status.

export function DashboardClient({ initialPortfolios, fxRate: initialFxRate }: { initialPortfolios: Portfolio[]; fxRate: number }) {
  return (
    <CurrencyProvider initialFxRate={initialFxRate}>
      <DashboardContent initialPortfolios={initialPortfolios} />
    </CurrencyProvider>
  );
}

function DashboardContent({ initialPortfolios }: { initialPortfolios: Portfolio[] }) {
  const [portfolios] = useState(initialPortfolios);
  const [holdingSummaries, setHoldingSummaries] = useState<HoldingSummary[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const { displayCurrency, setDisplayCurrency, fxRate, setFxRate, fxFallback, setFxFallback, fxSource, setFxSource, currencySymbol, convertAmount } = useCurrency();
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
  const [divViewMode, setDivViewMode] = useState<0 | 1 | 2 | 3>(0); // 0=annual$, 1=annual%, 2=monthly$, 3=monthly%
  const [openPnLShowPct, setOpenPnLShowPct] = useState(false);
  const [todayPnLShowPct, setTodayPnLShowPct] = useState(false);
  const [incomeGoal, setIncomeGoal] = useState<{ annualTarget: number; currency: "CAD" | "USD" } | null>(null);
  useEffect(() => {
    Promise.all([
      fetch("/api/settings/investment").then(r => r.json()).catch(() => ({})),
      fetch("/api/fx").then(r => r.json()).catch(() => ({ fallback: true })),
    ]).then(([inv, fx]) => {
      if (inv.incomeGoal) setIncomeGoal(inv.incomeGoal);
      if (typeof fx.rate === "number" && Number.isFinite(fx.rate) && fx.rate > 0) setFxRate(fx.rate);
      setFxFallback(Boolean(fx.fallback));
      if (typeof fx.source === "string" && fx.source.trim()) setFxSource(fx.source);
    }).catch(() => {});
  }, [setFxRate, setFxFallback, setFxSource]);

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
    return convertAmount(value, currency);
  }, [convertAmount]);

  const totalCash = useMemo(() => {
    return displayPortfolios.reduce((sum, p) => {
      const cad = parseFloat(p.cashCAD ?? "0") || 0;
      const usd = parseFloat(p.cashUSD ?? "0") || 0;
      return sum + toDisplay(cad, "CAD") + toDisplay(usd, "USD");
    }, 0);
  }, [displayPortfolios, toDisplay]);

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
      <div className="flex items-center gap-2 mb-5">
        <div className="relative" ref={acctDropdownRef}>
          <button
            className="rounded-full bg-card border border-border text-xs px-3.5 py-1.5 flex items-center gap-1.5 hover:bg-muted/40 transition-colors"
            onClick={() => setAcctDropdownOpen((v) => !v)}
            aria-label="Select portfolio"
            aria-haspopup="listbox"
            aria-expanded={acctDropdownOpen}
          >
            <span className="text-left">
              {selectedPortfolioId === "all"
                ? "All accounts"
                : portfolios.find((p) => p.id === selectedPortfolioId)?.name ?? "All accounts"}
            </span>
            <span className="text-muted-foreground" aria-hidden="true">▾</span>
          </button>
          {acctDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 z-50 rounded-lg bg-card border border-border shadow-sm overflow-hidden min-w-full" role="listbox" aria-label="Portfolio">
              <button
                role="option"
                aria-selected={selectedPortfolioId === "all"}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/40 ${selectedPortfolioId === "all" ? "text-accent" : ""}`}
                onClick={() => { setSelectedPortfolioId("all"); setAcctDropdownOpen(false); }}
              >
                All accounts
              </button>
              {portfolios.map((p) => (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={selectedPortfolioId === p.id}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/40 ${selectedPortfolioId === p.id ? "text-accent" : ""}`}
                  onClick={() => { setSelectedPortfolioId(p.id); setAcctDropdownOpen(false); }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:inline-flex rounded-full border border-border bg-muted/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            FX: {fxFallback ? "fallback" : fxSource.replace(/\s+USD\/CAD$/i, "")}
          </span>
          <div className="relative" ref={curDropdownRef}>
          <button
            className="rounded-full bg-card border border-border text-xs px-3.5 py-1.5 flex items-center gap-1.5 hover:bg-muted/40 transition-colors"
            onClick={() => setCurDropdownOpen((v) => !v)}
            aria-label="Select display currency"
            aria-haspopup="listbox"
            aria-expanded={curDropdownOpen}
          >
            <span className="text-left">{displayCurrency}</span>
            <span className="text-muted-foreground" aria-hidden="true">▾</span>
          </button>
          {curDropdownOpen && (
            <div className="absolute top-full right-0 mt-1.5 z-50 rounded-lg bg-card border border-border shadow-sm overflow-hidden min-w-full" role="listbox" aria-label="Display currency">
              {(["CAD", "USD"] as const).map((c) => (
                <button
                  key={c}
                  role="option"
                  aria-selected={displayCurrency === c}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/40 ${displayCurrency === c ? "text-accent" : ""}`}
                  onClick={() => { setDisplayCurrency(c); setCurDropdownOpen(false); }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
      {fxFallback && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-600/30 bg-yellow-900/5 text-yellow-500/90 text-xs px-3.5 py-2.5 mb-4">
          <span aria-hidden="true">⚠</span>
          <span>FX rate unavailable — using fallback rate. Currency conversions may be inaccurate.</span>
        </div>
      )}

      {/* 2-col grid on lg+ */}
      <div className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-6 lg:items-start">
        {/* Left column */}
        <div className="space-y-5">
          {/* Loading skeleton */}
          {loadingData && holdingSummaries.length === 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="space-y-2.5">
                  <SkeletonBlock className="h-3 w-20" />
                  <SkeletonBlock className="h-5 w-24" />
                </Card>
              ))}
            </div>
          )}

          {/* Empty state — no holdings loaded yet */}
          {!loadingData && holdingSummaries.length === 0 && allHoldings.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 sm:p-10 text-center">
              <div className="text-sm font-medium mb-4">Getting started</div>
              <div className="text-xs text-muted-foreground space-y-2 max-w-xs mx-auto text-left">
                <div className="flex gap-2"><span className="text-muted-foreground/60">1.</span><span>Go to <span className="text-foreground">Settings</span> → create a portfolio</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground/60">2.</span><span>Add stocks via the <span className="text-foreground">Holdings</span> tab</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground/60">3.</span><span>Or import automatically via <span className="text-foreground">Settings → Broker Sync</span></span></div>
              </div>
            </div>
          )}

          {/* Summary grid — Claude-style soft cards */}
          {holdingSummaries.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
              <Card>
                <div className="text-[11px] text-muted-foreground mb-1.5">Total assets</div>
                <div className="text-base sm:text-lg font-medium tabular-nums truncate">
                  {currencySymbol}{fmt(totalValue)}
                  <span className="text-[10px] font-normal text-muted-foreground/60 ml-1">{displayCurrency}</span>
                </div>
              </Card>
              <Card>
                <div className="text-[11px] text-muted-foreground mb-1.5">Market value</div>
                <div className="text-base sm:text-lg font-medium tabular-nums truncate">{currencySymbol}{fmt(holdingsValue)}</div>
              </Card>
              <Card>
                <div className="text-[11px] text-muted-foreground mb-1.5">Cash</div>
                <div className={`text-base sm:text-lg font-medium tabular-nums truncate ${totalCash <= 0 ? "text-muted-foreground/40" : ""}`}>
                  {currencySymbol}{fmt(totalCash)}
                </div>
              </Card>
              <button
                type="button"
                onClick={() => setOpenPnLShowPct((v) => !v)}
                className="rounded-lg border border-border bg-card p-4 text-left hover:bg-muted/30 active:bg-muted/50 transition-colors"
              >
                <div className="text-[11px] text-muted-foreground mb-1.5">Open P&amp;L</div>
                <div className={`text-base sm:text-lg font-medium tabular-nums truncate ${openPnL >= 0 ? "text-positive" : "text-negative"}`}>
                  {openPnLShowPct
                    ? `${openPnL >= 0 ? "+" : ""}${openPnLPct.toFixed(2)}%`
                    : `${openPnL >= 0 ? "+" : ""}${currencySymbol}${fmt(Math.abs(openPnL))}`}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setTodayPnLShowPct((v) => !v)}
                className="rounded-lg border border-border bg-card p-4 text-left hover:bg-muted/30 active:bg-muted/50 transition-colors"
              >
                <div className="text-[11px] text-muted-foreground mb-1.5">Today&apos;s P&amp;L</div>
                <div className={`text-base sm:text-lg font-medium tabular-nums truncate ${todayPnL >= 0 ? "text-positive" : "text-negative"}`}>
                  {todayPnLShowPct
                    ? `${todayPnL >= 0 ? "+" : ""}${todayPnLPct.toFixed(2)}%`
                    : `${todayPnL >= 0 ? "+" : ""}${currencySymbol}${fmt(Math.abs(todayPnL))}`}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDivViewMode((v) => ((v + 1) % 4) as 0 | 1 | 2 | 3)}
                className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-left hover:bg-primary/10 active:bg-primary/15 transition-colors"
              >
                <div className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                  {divViewMode >= 2 ? "Monthly dividend" : "Annual dividend"}
                  <span aria-hidden="true">▾</span>
                </div>
                <div className="text-base sm:text-lg font-semibold tabular-nums truncate text-primary">
                  {divAnnual === null ? "—"
                    : divViewMode === 0 ? `${currencySymbol}${fmt(divAnnual)}`
                    : divViewMode === 1 ? `${holdingsValue > 0 ? ((divAnnual / holdingsValue) * 100).toFixed(2) : "0.00"}% yield`
                    : divViewMode === 2 ? `${currencySymbol}${fmt(divMonthly ?? 0)}`
                    : `${holdingsValue > 0 ? ((divAnnual / holdingsValue) * 100 / 12).toFixed(2) : "0.00"}%`}
                </div>
              </button>
            </div>
          )}

          {/* Income Goal progress */}
          {incomeGoal && divAnnual !== null && (() => {
            const goalInDisplay = toDisplay(incomeGoal.annualTarget, incomeGoal.currency);
            const pct = Math.min((divAnnual / goalInDisplay) * 100, 100);

            return (
              <Card>
                <div className="text-[11px] text-muted-foreground mb-2.5">Income goal</div>
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Income goal progress"
                  className="h-1.5 bg-muted/50 rounded-full overflow-hidden mb-2"
                >
                  <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-positive" : "bg-primary"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {currencySymbol}{fmt(divAnnual)} / {currencySymbol}{fmt(goalInDisplay)}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] tabular-nums min-w-0">
                    {pct >= 100 ? (
                      <span className="text-positive shrink-0 font-medium">Goal reached</span>
                    ) : (
                      <>
                        <span className="text-primary/80 shrink-0 font-medium">{pct.toFixed(0)}%</span>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* Performance chart */}
          <PerformanceChart />
        </div>

        {/* Right column */}
        <div className="space-y-5 mt-5 lg:mt-0">
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

          {/* Upcoming ex-dividend dates */}
          {holdingSummaries.length > 0 && (
            <UpcomingDividends fxRate={fxRate} displayCurrency={displayCurrency} />
          )}
        </div>
      </div>

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
