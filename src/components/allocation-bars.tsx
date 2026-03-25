"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { fmt } from "@/lib/utils";
import type { HoldingSummary } from "@/lib/types";

const COLORS = [
  "hsl(142, 69%, 58%)",
  "hsl(38, 92%, 55%)",
  "hsl(196, 80%, 60%)",
  "hsl(270, 60%, 65%)",
  "hsl(0, 70%, 70%)",
  "hsl(180, 60%, 50%)",
  "hsl(60, 70%, 55%)",
  "hsl(320, 60%, 65%)",
];

function tickerColor(ticker: string): string {
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface BarEntry {
  ticker: string;
  value: number;
  color: string;
}

function toDisplay(value: number, currency: "USD" | "CAD", displayCurrency: "CAD" | "USD", fxRate: number) {
  if (displayCurrency === "CAD") return currency === "USD" ? value * fxRate : value;
  return currency === "CAD" ? value / fxRate : value;
}

function HorizontalBar({ entries, total }: { entries: BarEntry[]; total: number }) {
  if (total <= 0) return null;
  return (
    <div className="flex h-4 w-full overflow-hidden rounded-[2px] mb-3">
      {entries.map((e) => (
        <div
          key={e.ticker}
          style={{
            width: `${(e.value / total) * 100}%`,
            backgroundColor: e.color,
            minWidth: e.value / total > 0.005 ? 2 : 0,
          }}
        />
      ))}
    </div>
  );
}

function BarLegend({
  entries,
  total,
  showPct,
  currencySymbol,
}: {
  entries: BarEntry[];
  total: number;
  showPct: boolean;
  currencySymbol: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {entries.map((e) => (
        <div key={e.ticker} className="flex items-center gap-2 text-[11px] min-w-0">
          <span
            className="flex-shrink-0 inline-block w-2.5 h-2.5 rounded-[1px]"
            style={{ backgroundColor: e.color }}
          />
          <span className="font-medium truncate">{e.ticker}</span>
          <span className="ml-auto text-muted-foreground tabular-nums flex-shrink-0">
            {showPct
              ? `${((e.value / total) * 100).toFixed(2)}%`
              : `${currencySymbol}${fmt(e.value)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

interface SectorMap {
  [ticker: string]: string;
}

type AllocTab = "HOLDINGS" | "SECTORS" | "DIVIDENDS";

export function AllocationBars({
  holdings,
  fxRate,
  displayCurrency,
}: {
  holdings: HoldingSummary[];
  fxRate: number;
  displayCurrency: "CAD" | "USD";
}) {
  const [activeTab, setActiveTab] = useState<AllocTab>("HOLDINGS");
  const [allocShowPct, setAllocShowPct] = useState(true);
  const [divShowPct, setDivShowPct] = useState(true);
  const [sectorMap, setSectorMap] = useState<SectorMap>({});
  const [sectorLoading, setSectorLoading] = useState(true);
  const [sectorError, setSectorError] = useState(false);
  const [investTargets, setInvestTargets] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/sector")
        .then(r => r.json())
        .then((d: { sectors: { ticker: string; sector: string }[] }) => {
          const map: SectorMap = {};
          for (const item of d.sectors ?? []) map[item.ticker] = item.sector;
          setSectorMap(map);
          setSectorLoading(false);
        })
        .catch(() => { setSectorError(true); setSectorLoading(false); }),
      fetch("/api/settings/investment")
        .then(r => r.json())
        .then(d => {
          const t: Record<string, number> = {};
          for (const [ticker, val] of Object.entries(d.targets ?? {})) {
            t[ticker] = (val as { pct: number }).pct;
          }
          setInvestTargets(t);
        })
        .catch(() => {}),
    ]);
  }, []);

  const currencySymbol = displayCurrency === "CAD" ? "C$" : "$";

  // Portfolio Allocation by market value
  const allocEntries = useMemo((): BarEntry[] => {
    return holdings
      .map((h) => ({
        ticker: h.ticker,
        value: toDisplay(h.marketValue, h.currency, displayCurrency, fxRate),
        color: tickerColor(h.ticker),
      }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [holdings, displayCurrency, fxRate]);

  const allocTotal = allocEntries.reduce((s, e) => s + e.value, 0);

  // Dividend Distribution by annual payout
  const divEntries = useMemo((): BarEntry[] => {
    return holdings
      .map((h) => ({
        ticker: h.ticker,
        value: toDisplay(h.annualDividend ?? 0, h.currency, displayCurrency, fxRate),
        color: tickerColor(h.ticker),
      }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [holdings, displayCurrency, fxRate]);

  const divTotal = divEntries.reduce((s, e) => s + e.value, 0);

  if (allocEntries.length === 0) return null;

  // Sector data (computed once, used in SECTORS tab)
  const sectorValues = new Map<string, number>();
  for (const h of holdings) {
    const sector = sectorMap[h.ticker] ?? "Other";
    const val = toDisplay(h.marketValue, h.currency, displayCurrency, fxRate);
    sectorValues.set(sector, (sectorValues.get(sector) ?? 0) + val);
  }
  const sectorEntries: BarEntry[] = Array.from(sectorValues.entries())
    .map(([sector, value]) => ({ ticker: sector, value, color: tickerColor(sector) }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
  const sectorTotal = sectorEntries.reduce((s, e) => s + e.value, 0);

  const hasSectorTargets = Object.keys(investTargets).length > 0;
  const sectorGaps = hasSectorTargets ? sectorEntries.map(e => {
    const tickersInSector = holdings.filter(h => (sectorMap[h.ticker] ?? "Other") === e.ticker);
    const targetPct = tickersInSector.reduce((s, h) => s + (investTargets[h.ticker] ?? 0), 0);
    const currentPct = sectorTotal > 0 ? (e.value / sectorTotal) * 100 : 0;
    return { sector: e.ticker, currentPct, targetPct, gap: currentPct - targetPct };
  }) : null;

  const TABS: AllocTab[] = ["HOLDINGS", "SECTORS", "DIVIDENDS"];

  return (
    <div className="mb-6 w-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`btn-retro text-[10px] px-4 py-3 border-0 border-r border-b-0 border-border ${activeTab === t ? "btn-retro-primary" : ""}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="border border-border border-t-0 bg-card p-4">
        {/* HOLDINGS tab */}
        {activeTab === "HOLDINGS" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] text-muted-foreground">By Position Size</div>
              <div className="flex gap-1">
                <button
                  className={`btn-retro text-[10px] px-2.5 py-1 ${allocShowPct ? "btn-retro-primary" : ""}`}
                  onClick={() => setAllocShowPct(true)}
                >
                  %
                </button>
                <button
                  className={`btn-retro text-[10px] px-2.5 py-1 ${!allocShowPct ? "btn-retro-primary" : ""}`}
                  onClick={() => setAllocShowPct(false)}
                >
                  {displayCurrency === "CAD" ? "CA$" : "US$"}
                </button>
              </div>
            </div>
            <HorizontalBar entries={allocEntries} total={allocTotal} />
            <BarLegend entries={allocEntries} total={allocTotal} showPct={allocShowPct} currencySymbol={currencySymbol} />
            <div className="flex justify-end mt-3">
              <Link href="/portfolio" replace className="text-[10px] text-muted-foreground hover:text-primary transition-colors tracking-wide">
                PORTFOLIO ›
              </Link>
            </div>
          </>
        )}

        {/* SECTORS tab */}
        {activeTab === "SECTORS" && (
          sectorError ? (
            <div className="text-[10px] text-negative py-4">SECTOR DATA UNAVAILABLE</div>
          ) : sectorLoading ? (
            <div className="text-[10px] text-muted-foreground py-4 text-center">LOADING SECTOR DATA...</div>
          ) : sectorEntries.length === 0 ? (
            <div className="text-[10px] text-muted-foreground py-4 text-center">NO SECTOR DATA</div>
          ) : (
            <>
              <HorizontalBar entries={sectorEntries} total={sectorTotal} />
              {hasSectorTargets ? (
                // Gap bar chart: current vs target per sector
                <div className="space-y-3 mt-3">
                  {sectorEntries.map((e) => {
                    const gap = sectorGaps?.find(g => g.sector === e.ticker);
                    const currentPct = sectorTotal > 0 ? (e.value / sectorTotal) * 100 : 0;
                    const targetPct = gap?.targetPct ?? 0;
                    const gapVal = gap?.gap ?? 0;
                    const barColor = gapVal > 2 ? "hsl(45,100%,60%)" : gapVal < -2 ? "hsl(210,80%,60%)" : "hsl(142,69%,58%)";
                    return (
                      <div key={e.ticker}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="flex items-center gap-1.5 text-[11px]">
                            <span className="inline-block w-2 h-2 rounded-[1px] shrink-0" style={{ backgroundColor: e.color }} />
                            <span className="truncate">{e.ticker}</span>
                          </span>
                          <span className="text-[10px] tabular-nums ml-2 shrink-0" style={{ color: barColor }}>
                            {currentPct.toFixed(1)}%
                            {targetPct > 0 && (
                              <span className="ml-1 text-muted-foreground">
                                {gapVal >= 0 ? "+" : ""}{gapVal.toFixed(1)}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="relative h-1.5 bg-border overflow-visible">
                          <div
                            style={{ width: `${Math.min(currentPct, 100)}%`, backgroundColor: barColor }}
                            className="absolute h-full transition-all"
                          />
                          {targetPct > 0 && (
                            <div
                              style={{ left: `${Math.min(targetPct, 100)}%` }}
                              className="absolute top-[-2px] h-[calc(100%+4px)] w-px bg-muted-foreground opacity-60"
                              title={`Target: ${targetPct.toFixed(1)}%`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-[9px] text-muted-foreground/50 text-right mt-1">
                    bar = current · line = target
                  </div>
                </div>
              ) : (
                // No targets: simple list
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
                  {sectorEntries.map((e) => {
                    const currentPct = sectorTotal > 0 ? (e.value / sectorTotal) * 100 : 0;
                    return (
                      <div key={e.ticker} className="flex items-center gap-2 text-[11px] min-w-0">
                        <span className="flex-shrink-0 inline-block w-2.5 h-2.5 rounded-[1px]" style={{ backgroundColor: e.color }} />
                        <span className="font-medium truncate">{e.ticker}</span>
                        <span className="ml-auto text-muted-foreground tabular-nums flex-shrink-0">
                          {currentPct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )
        )}

        {/* DIVIDENDS tab */}
        {activeTab === "DIVIDENDS" && (
          divTotal === 0 ? (
            <div className="text-[10px] text-muted-foreground py-4 text-center">NO DIVIDEND DATA</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] text-muted-foreground">By Annual Payout</div>
                <div className="flex gap-1">
                  <button
                    className={`btn-retro text-[10px] px-2.5 py-1 ${divShowPct ? "btn-retro-primary" : ""}`}
                    onClick={() => setDivShowPct(true)}
                  >
                    %
                  </button>
                  <button
                    className={`btn-retro text-[10px] px-2.5 py-1 ${!divShowPct ? "btn-retro-primary" : ""}`}
                    onClick={() => setDivShowPct(false)}
                  >
                    {displayCurrency === "CAD" ? "CA$" : "US$"}
                  </button>
                </div>
              </div>
              <HorizontalBar entries={divEntries} total={divTotal} />
              <BarLegend entries={divEntries} total={divTotal} showPct={divShowPct} currencySymbol={currencySymbol} />
              <div className="flex justify-between items-center mt-3">
                <span className="text-[10px] text-muted-foreground">
                  ANNUAL: <span className="text-primary tabular-nums">{currencySymbol}{fmt(divTotal)}</span>
                </span>
                <Link href="/calendar" replace className="text-[10px] text-muted-foreground hover:text-primary transition-colors tracking-wide">
                  CALENDAR ›
                </Link>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
