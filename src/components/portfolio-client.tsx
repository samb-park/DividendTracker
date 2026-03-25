"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { HoldingsTable } from "./holdings-table";
import { mergeHoldings } from "@/lib/utils";
import type { Portfolio, HoldingSummary } from "@/lib/types";

export function PortfolioClient({ initialPortfolios, fxRate: initialFxRate }: { initialPortfolios: Portfolio[]; fxRate: number; }) {
  const [portfolios] = useState(initialPortfolios);
  const [activeTab, setActiveTab] = useState<"all" | string>("all");
  const [, setHoldingSummaries] = useState<HoldingSummary[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<"CAD" | "USD">("CAD");
  const [fxRate, setFxRate] = useState(initialFxRate);
  const [detailOpen, setDetailOpen] = useState(false);
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

  return (
    <div className={`transition-[padding] duration-200 ${detailOpen ? "md:pr-[29rem] lg:pr-[33rem] xl:pr-[50%]" : ""}`}>
      {/* Account selector + currency toggle */}
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
          allPortfolios={isAllMode ? portfolios.map((p) => ({ id: p.id, name: p.name })) : undefined}
          selectedPortfolioId={displayPortfolioId}
          onPortfolioChange={(id) => { setActiveTab(id); setHoldingSummaries([]); }}
        />
      ) : (
        <div className="text-muted-foreground text-xs py-12 text-center border border-dashed border-border">
          NO PORTFOLIOS — CREATE ONE IN SETTINGS
        </div>
      )}
    </div>
  );
}
