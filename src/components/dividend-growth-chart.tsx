"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { fmt } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface YearRow {
  year: number;
  annualDPS: number;
  growthPct: number | null;
}

interface TickerData {
  ticker: string;
  history: YearRow[];
  streak: number;
  shares: number;
  currency: string;
}

export function DividendGrowthChart() {
  const [data, setData] = useState<TickerData[]>([]);
  const [cuts, setCuts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [fxRate, setFxRate] = useState(1.35);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setError(false);
    setLoading(true);
    fetch("/api/fx").then(r => r.json()).then(d => { if (d.rate) setFxRate(d.rate); }).catch(() => {});
    fetch("/api/dividend-growth")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        setData(d.tickers ?? []);
        setCuts(d.cuts ?? []);
        setSelected("__portfolio__");
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Portfolio aggregate: for each year, sum DPS × shares across all tickers (USD→CAD via fxRate)
  const portfolioHistory = useMemo((): YearRow[] => {
    const yearMap = new Map<number, number>();
    for (const t of data) {
      if (!t.shares || t.shares <= 0) continue;
      for (const row of t.history) {
        const divCAD = row.annualDPS * t.shares * (t.currency === "USD" ? fxRate : 1);
        yearMap.set(row.year, (yearMap.get(row.year) ?? 0) + divCAD);
      }
    }
    const sorted = Array.from(yearMap.entries())
      .map(([year, annualDPS]) => ({ year, annualDPS }))
      .sort((a, b) => a.year - b.year);
    return sorted.map((row, i) => {
      const prev = sorted[i - 1];
      const growthPct = prev && prev.annualDPS > 0
        ? ((row.annualDPS - prev.annualDPS) / prev.annualDPS) * 100
        : null;
      return { ...row, growthPct };
    });
  }, [data, fxRate]);

  const isPortfolio = selected === "__portfolio__";

  const currentHistory = useMemo(
    () => isPortfolio ? portfolioHistory : (data.find((d) => d.ticker === selected)?.history ?? []),
    [isPortfolio, portfolioHistory, data, selected]
  );

  // Compute CAGR if we have at least 2 years
  const cagr = useMemo(() => {
    if (currentHistory.length < 2) return null;
    const first = currentHistory[0];
    const last = currentHistory[currentHistory.length - 1];
    const years = last.year - first.year;
    if (years <= 0 || first.annualDPS <= 0) return null;
    return (Math.pow(last.annualDPS / first.annualDPS, 1 / years) - 1) * 100;
  }, [currentHistory]);

  if (loading) {
    return <div className="text-muted-foreground text-xs text-center py-12">LOADING...</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 border border-dashed border-border text-xs">
        <span className="text-negative">FAILED TO LOAD</span>
        <button className="btn-retro text-[10px] px-3 py-1" onClick={load}>RETRY</button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground text-xs text-center py-12 border border-dashed border-border">
        NO DIVIDEND HISTORY FOUND
      </div>
    );
  }

  return (
    <div>
      {/* Dividend cut warning banner */}
      {cuts.length > 0 && (
        <div className="mb-4 px-3 py-2 border border-negative/40 bg-negative/5 text-negative text-[10px] tracking-wide">
          ⚠ DIVIDEND CUT DETECTED: {cuts.join(", ")} — latest year DPS below prior year
        </div>
      )}

      {/* Ticker selector dropdown */}
      <div className="relative mb-6" ref={dropRef}>
        <button
          className="btn-retro btn-retro-primary text-xs flex items-center gap-2 min-w-[8rem]"
          onClick={() => setDropOpen(v => !v)}
        >
          <span className="flex-1 text-left">
            {isPortfolio ? "PORTFOLIO" : selected ?? "—"}
            {!isPortfolio && selected && cuts.includes(selected) && <span className="ml-1 text-negative text-[9px]">▼</span>}
          </span>
          <span className="text-muted-foreground">▾</span>
        </button>
        {dropOpen && (
          <div className="absolute top-full left-0 mt-0.5 z-50 bg-card border border-border min-w-full max-h-60 overflow-y-auto">
            <button
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-border/30 ${isPortfolio ? "text-accent" : ""}`}
              onClick={() => { setSelected("__portfolio__"); setDropOpen(false); }}
            >
              PORTFOLIO
            </button>
            <div className="border-t border-border/50" />
            {data.map((d) => {
              const hasCut = cuts.includes(d.ticker);
              return (
                <button
                  key={d.ticker}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-border/30 ${selected === d.ticker ? "text-accent" : ""} ${hasCut ? "text-negative/80" : ""}`}
                  onClick={() => { setSelected(d.ticker); setDropOpen(false); }}
                >
                  {d.ticker}{hasCut && <span className="ml-1 text-[9px]">▼ CUT</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {currentHistory.length > 0 && (
        <>
          {/* Summary row */}
          {(() => {
            const streak = isPortfolio ? null : data.find(d => d.ticker === selected)?.streak ?? null;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border mb-5">
                <div className="bg-card p-2">
                  <div className="text-[10px] text-muted-foreground tracking-wide mb-1 truncate">
                    {isPortfolio ? "ANNUAL DIV" : "LATEST DPS"}
                  </div>
                  <div className="text-sm font-medium tabular-nums text-primary truncate">
                    {isPortfolio ? "C$" : "$"}{fmt(currentHistory[currentHistory.length - 1]?.annualDPS ?? 0)}
                  </div>
                </div>
                <div className="bg-card p-2">
                  <div className="text-[10px] text-muted-foreground tracking-wide mb-1">DIV CAGR</div>
                  <div className={`text-sm font-medium tabular-nums ${cagr !== null && cagr >= 0 ? "text-positive" : "text-negative"}`}>
                    {cagr !== null ? `${cagr >= 0 ? "+" : ""}${fmt(cagr)}%` : "—"}
                  </div>
                </div>
                <div className="bg-card p-2">
                  <div className="text-[10px] text-muted-foreground tracking-wide mb-1">STREAK</div>
                  <div className={`text-sm font-medium tabular-nums ${streak !== null && streak > 0 ? "text-positive" : "text-muted-foreground"}`}>
                    {streak !== null ? (streak > 0 ? `${streak}Y ↑` : "—") : "—"}
                  </div>
                </div>
                <div className="bg-card p-2">
                  <div className="text-[10px] text-muted-foreground tracking-wide mb-1">YRS DATA</div>
                  <div className="text-sm font-medium tabular-nums">{currentHistory.length}</div>
                </div>
              </div>
            );
          })()}

          {/* Chart */}
          <div className="h-52 lg:h-80 chart-touch-zone">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={currentHistory} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="year"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "inherit" }}
                  formatter={(value: number) => [`${value >= 0 ? "+" : ""}${fmt(value)}%`, "YoY Growth"]}
                />
                <Line
                  dataKey="growthPct"
                  type="monotone"
                  stroke="hsl(var(--accent))"
                  strokeWidth={1.5}
                  dot={{ r: 2, fill: "hsl(var(--accent))" }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {isPortfolio && (
            <div className="text-[9px] text-muted-foreground/50 mt-1 text-right">
              USD holdings converted at current FX rate ({fmt(fxRate, 4)})
            </div>
          )}

          {/* Year table */}
          <div className="mt-5 overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>YEAR</th>
                  <th className="text-right">YoY GROWTH</th>
                </tr>
              </thead>
              <tbody>
                {[...currentHistory].reverse().map((row) => (
                  <tr key={row.year}>
                    <td className="text-muted-foreground text-xs">{row.year}</td>
                    <td className={`text-right tabular-nums text-xs ${row.growthPct === null ? "text-muted-foreground" : row.growthPct >= 0 ? "text-positive" : "text-negative"}`}>
                      {row.growthPct === null
                        ? "—"
                        : `${row.growthPct >= 0 ? "+" : ""}${fmt(row.growthPct)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
