"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface YearRow {
  year: number;
  annualDPS: number;
  growthPct: number | null;
}

interface TickerData {
  ticker: string;
  history: YearRow[];
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function DividendGrowthChart() {
  const [data, setData] = useState<TickerData[]>([]);
  const [cuts, setCuts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dividend-growth")
      .then((r) => r.json())
      .then((d) => {
        setData(d.tickers ?? []);
        setCuts(d.cuts ?? []);
        if (d.tickers?.length > 0) setSelected(d.tickers[0].ticker);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const current = useMemo(
    () => data.find((d) => d.ticker === selected),
    [data, selected]
  );

  // Compute CAGR if we have at least 2 years
  const cagr = useMemo(() => {
    if (!current || current.history.length < 2) return null;
    const first = current.history[0];
    const last = current.history[current.history.length - 1];
    const years = last.year - first.year;
    if (years <= 0 || first.annualDPS <= 0) return null;
    return (Math.pow(last.annualDPS / first.annualDPS, 1 / years) - 1) * 100;
  }, [current]);

  if (loading) {
    return <div className="text-muted-foreground text-xs text-center py-12">LOADING...</div>;
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

      {/* Ticker selector */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {data.map((d) => {
          const hasCut = cuts.includes(d.ticker);
          return (
            <button
              key={d.ticker}
              className={`btn-retro text-xs px-2 py-0.5 relative ${selected === d.ticker ? "btn-retro-primary" : ""} ${hasCut ? "border-negative/60" : ""}`}
              onClick={() => setSelected(d.ticker)}
            >
              {d.ticker}
              {hasCut && <span className="ml-1 text-negative text-[9px]">▼</span>}
            </button>
          );
        })}
      </div>

      {current && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-px bg-border border border-border mb-5">
            <div className="bg-card p-2">
              <div className="text-[10px] text-muted-foreground tracking-wide mb-1">LATEST DPS</div>
              <div className="text-sm font-medium tabular-nums text-primary">
                ${fmt(current.history[current.history.length - 1]?.annualDPS ?? 0)}
              </div>
            </div>
            <div className="bg-card p-2">
              <div className="text-[10px] text-muted-foreground tracking-wide mb-1">CAGR</div>
              <div className={`text-sm font-medium tabular-nums ${cagr !== null && cagr >= 0 ? "text-positive" : "text-negative"}`}>
                {cagr !== null ? `${cagr >= 0 ? "+" : ""}${fmt(cagr)}%` : "—"}
              </div>
            </div>
            <div className="bg-card p-2">
              <div className="text-[10px] text-muted-foreground tracking-wide mb-1">YRS OF DATA</div>
              <div className="text-sm font-medium tabular-nums">{current.history.length}</div>
            </div>
          </div>

          {/* Chart */}
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={current.history} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="year"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="dps"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${fmt(v, 2)}`}
                />
                <YAxis
                  yAxisId="growth"
                  orientation="right"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "inherit" }}
                  formatter={(value: number, name: string) => {
                    if (name === "annualDPS") return [`$${fmt(value)}`, "Annual DPS"];
                    if (name === "growthPct") return [`${value >= 0 ? "+" : ""}${fmt(value)}%`, "YoY Growth"];
                    return [value, name];
                  }}
                />
                <Bar yAxisId="dps" dataKey="annualDPS" maxBarSize={32} radius={[2, 2, 0, 0]}>
                  {current.history.map((row, i) => (
                    <Cell
                      key={i}
                      fill={
                        row.growthPct === null
                          ? "hsl(var(--primary))"
                          : row.growthPct >= 0
                          ? "hsl(var(--primary))"
                          : "hsl(var(--negative))"
                      }
                    />
                  ))}
                </Bar>
                <Line
                  yAxisId="growth"
                  dataKey="growthPct"
                  type="monotone"
                  stroke="hsl(var(--accent))"
                  strokeWidth={1.5}
                  dot={{ r: 2, fill: "hsl(var(--accent))" }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Year table */}
          <div className="mt-5 overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>YEAR</th>
                  <th className="text-right">ANNUAL DPS</th>
                  <th className="text-right">YoY GROWTH</th>
                </tr>
              </thead>
              <tbody>
                {[...current.history].reverse().map((row) => (
                  <tr key={row.year}>
                    <td className="text-muted-foreground text-xs">{row.year}</td>
                    <td className="text-right tabular-nums text-primary">${fmt(row.annualDPS)}</td>
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
