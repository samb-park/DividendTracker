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

export function AllocationBars({
  holdings,
  fxRate,
  displayCurrency,
}: {
  holdings: HoldingSummary[];
  fxRate: number;
  displayCurrency: "CAD" | "USD";
}) {
  const [allocShowPct, setAllocShowPct] = useState(true);
  const [divShowPct, setDivShowPct] = useState(true);
  const [sectorMap, setSectorMap] = useState<SectorMap>({});
  const [sectorError, setSectorError] = useState(false);

  useEffect(() => {
    fetch("/api/sector")
      .then((r) => r.json())
      .then((d: { sectors: { ticker: string; sector: string }[] }) => {
        const map: SectorMap = {};
        for (const item of d.sectors ?? []) map[item.ticker] = item.sector;
        setSectorMap(map);
      })
      .catch(() => { setSectorError(true); });
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

  return (
    <div className="space-y-4 mb-6">
      {/* Portfolio Allocation */}
      <div className="border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-accent text-xs tracking-wide">&#9654; PORTFOLIO ALLOCATION</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">By Position Size</div>
          </div>
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
        <BarLegend
          entries={allocEntries}
          total={allocTotal}
          showPct={allocShowPct}
          currencySymbol={currencySymbol}
        />
        <div className="flex justify-end mt-3">
          <Link
            href="/portfolio"
            replace
            className="text-[10px] text-muted-foreground hover:text-primary transition-colors tracking-wide flex items-center gap-1"
          >
            PORTFOLIO ›
          </Link>
        </div>
      </div>

      {/* Sector Allocation */}
      {sectorError && (
        <div className="border border-border bg-card p-4">
          <div className="text-accent text-xs tracking-wide mb-2">&#9654; SECTOR ALLOCATION</div>
          <div className="text-[10px] text-negative">SECTOR DATA UNAVAILABLE</div>
        </div>
      )}
      {!sectorError && Object.keys(sectorMap).length > 0 && (() => {
        // Group holdings by sector, sum market value
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
        if (sectorEntries.length === 0) return null;
        return (
          <div className="border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-accent text-xs tracking-wide">&#9654; SECTOR ALLOCATION</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">By Market Value</div>
              </div>
            </div>
            <HorizontalBar entries={sectorEntries} total={sectorTotal} />
            <BarLegend
              entries={sectorEntries}
              total={sectorTotal}
              showPct={true}
              currencySymbol={currencySymbol}
            />
          </div>
        );
      })()}

      {/* Dividend Distribution */}
      {divTotal > 0 && (
        <div className="border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-accent text-xs tracking-wide">&#9654; DIVIDEND DISTRIBUTION</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">By Annual Payout</div>
            </div>
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
          <BarLegend
            entries={divEntries}
            total={divTotal}
            showPct={divShowPct}
            currencySymbol={currencySymbol}
          />
          <div className="flex justify-between items-center mt-3">
            <span className="text-[10px] text-muted-foreground">
              ANNUAL: <span className="text-primary tabular-nums">{currencySymbol}{fmt(divTotal)}</span>
            </span>
            <Link
              href="/calendar"
              replace
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors tracking-wide flex items-center gap-1"
            >
              CALENDAR ›
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
