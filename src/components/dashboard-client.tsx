"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { HoldingsTable } from "./holdings-table";
import { PortfolioCharts } from "./portfolio-charts";
import { AllocationBars } from "./allocation-bars";
import { DividendIncomeChart } from "./dividend-income-chart";
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
  const [divAnnual, setDivAnnual] = useState<number | null>(null);
  const [divMonthly, setDivMonthly] = useState<number | null>(null);
  const [divShowMonthly, setDivShowMonthly] = useState(false);

  useEffect(() => {
    fetch("/api/fx").then((r) => r.json()).then((d) => {
      if (d.rate) setFxRate(d.rate);
      if (d.fallback) setFxFallback(true);
    }).catch(() => setFxFallback(true));
  }, []);

  useEffect(() => {
    setHoldingSummaries([]);
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
          >
            <span className="flex-1 text-left">
              {selectedPortfolioId === "all"
                ? "ALL"
                : portfolios.find((p) => p.id === selectedPortfolioId)?.name ?? "ALL"}
            </span>
            <span className="text-muted-foreground">▾</span>
          </button>
          {acctDropdownOpen && (
            <div className="absolute top-full left-0 mt-0.5 z-50 bg-card border border-border min-w-full">
              <button
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-border/30 ${selectedPortfolioId === "all" ? "text-accent" : ""}`}
                onClick={() => { setSelectedPortfolioId("all"); setAcctDropdownOpen(false); }}
              >
                ALL
              </button>
              {portfolios.map((p) => (
                <button
                  key={p.id}
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
      {fxFallback && (
        <div className="text-[10px] text-negative/70 text-right -mt-3 mb-2">
          FX rate unavailable — using fallback
        </div>
      )}

      {/* Loading state */}
      {loadingData && holdingSummaries.length === 0 && (
        <div className="text-muted-foreground text-xs text-center py-12 tracking-wide">LOADING...</div>
      )}

      {/* Summary grid */}
      {holdingSummaries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-px border border-border bg-border mb-6">
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
          <div className="bg-card p-3 cursor-pointer select-none" onClick={() => setDivShowMonthly((v) => !v)}>
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">
              {divShowMonthly ? "DIV / MONTH" : "DIV / YEAR"}
            </div>
            <div className="text-xs font-medium tabular-nums truncate text-primary">
              {divAnnual !== null ? `${currencySymbol}${fmt(divShowMonthly ? (divMonthly ?? 0) : divAnnual)}` : "—"}
            </div>
          </div>
        </div>
      )}

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
