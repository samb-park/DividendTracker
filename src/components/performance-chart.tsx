"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface Snapshot {
  date: string;
  totalCAD: number;
  costBasisCAD: number;
  cashCAD: number;
}

const RANGES = ["3m", "6m", "1y", "all"] as const;
type Range = (typeof RANGES)[number];

interface BenchmarkPoint {
  date: string;
  value: number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function computeMDD(values: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (v - peak) / peak : 0;
    if (dd < mdd) mdd = dd;
  }
  return mdd * 100; // as percentage
}

function computeCAGR(start: number, end: number, days: number): number | null {
  if (start <= 0 || days < 30) return null;
  const years = days / 365.25;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

export function PerformanceChart() {
  const [range, setRange] = useState<Range>("1y");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkPoint[]>([]);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allLoaded, setAllLoaded] = useState(false);

  useEffect(() => {
    if (range === "all" && allLoaded) return;
    setLoading(true);
    fetch(`/api/snapshots?range=${range}`)
      .then((r) => r.json())
      .then((d) => {
        setSnapshots(d.snapshots ?? []);
        if (range === "all") setAllLoaded(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [range, allLoaded]);

  useEffect(() => {
    if (!showBenchmark) return;
    fetch(`/api/benchmarks?range=${range}`)
      .then((r) => r.json())
      .then((d) => setBenchmark(d.prices ?? []))
      .catch(() => setBenchmark([]));
  }, [range, showBenchmark]);

  const { cagr, mdd, totalReturn, chartData } = useMemo(() => {
    if (snapshots.length < 2) return { cagr: null, mdd: null, totalReturn: null, chartData: [] };

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const days =
      (new Date(last.date).getTime() - new Date(first.date).getTime()) /
      (1000 * 60 * 60 * 24);

    const cagr = computeCAGR(first.totalCAD, last.totalCAD, days);
    const mdd = computeMDD(snapshots.map((s) => s.totalCAD));
    const totalReturn = first.totalCAD > 0
      ? ((last.totalCAD - first.totalCAD) / first.totalCAD) * 100
      : null;

    // Build benchmark lookup by date
    const benchMap = new Map(benchmark.map((b) => [b.date, b.value]));

    // Normalize portfolio to 100 for benchmark overlay
    const portfolioBase = first.totalCAD;

    const chartData = snapshots.map((s) => {
      const normalizedPortfolio = portfolioBase > 0 ? (s.totalCAD / portfolioBase) * 100 : null;
      const spyValue = benchMap.get(s.date) ?? null;
      return {
        date: s.date.slice(5), // MM-DD
        fullDate: s.date,
        total: Math.round(s.totalCAD),
        cost: Math.round(s.costBasisCAD),
        gain: Math.round(s.totalCAD - s.costBasisCAD),
        portfolioNorm: normalizedPortfolio,
        spyNorm: spyValue,
      };
    });

    return { cagr, mdd, totalReturn, chartData };
  }, [snapshots, benchmark]);

  const hasSufficientData = snapshots.length >= 2;
  const lastSnapshot = snapshots[snapshots.length - 1];

  return (
    <div className="border border-border bg-card p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-accent tracking-wide">PERFORMANCE</div>
          <button
            onClick={() => setShowBenchmark((v) => !v)}
            className={`btn-retro text-[10px] px-2 py-0.5 ${showBenchmark ? "btn-retro-primary" : ""}`}
            title="Toggle SPY benchmark overlay"
          >
            SPY
          </button>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`btn-retro text-[10px] px-2 py-0.5 ${range === r ? "btn-retro-primary" : ""}`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics row */}
      {hasSufficientData && (
        <div className="grid grid-cols-3 gap-px bg-border border border-border mb-4">
          <div className="bg-card p-2">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">CAGR</div>
            <div className={`text-sm font-medium tabular-nums ${cagr !== null && cagr >= 0 ? "text-positive" : "text-negative"}`}>
              {cagr !== null ? `${cagr >= 0 ? "+" : ""}${cagr.toFixed(2)}%` : "—"}
            </div>
          </div>
          <div className="bg-card p-2">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">TOTAL RETURN</div>
            <div className={`text-sm font-medium tabular-nums ${totalReturn !== null && totalReturn >= 0 ? "text-positive" : "text-negative"}`}>
              {totalReturn !== null ? `${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(2)}%` : "—"}
            </div>
          </div>
          <div className="bg-card p-2">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">MAX DRAWDOWN</div>
            <div className={`text-sm font-medium tabular-nums ${mdd !== null && mdd < -5 ? "text-negative" : "text-muted-foreground"}`}>
              {mdd !== null ? `${mdd.toFixed(2)}%` : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="h-36 flex items-center justify-center text-muted-foreground text-xs">LOADING...</div>
      ) : !hasSufficientData ? (
        <div className="h-36 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-1 border border-dashed border-border">
          <span>NOT ENOUGH DATA YET</span>
          <span className="text-[10px]">Daily snapshots will accumulate over time</span>
          {lastSnapshot && (
            <span className="text-[10px] text-primary">1 snapshot: {lastSnapshot.date} — C${lastSnapshot.totalCAD.toLocaleString("en-CA", { maximumFractionDigits: 0 })}</span>
          )}
        </div>
      ) : (
        <div>
          {showBenchmark && (
            <div className="flex items-center gap-4 mb-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-px bg-primary" style={{ height: 2 }} />
                PORTFOLIO
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 border-t border-dashed border-accent" />
                SPY
              </span>
              <span className="ml-auto text-[9px] opacity-60">NORMALIZED TO 100</span>
            </div>
          )}
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              {showBenchmark ? (
                <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v.toFixed(0)}`}
                  />
                  <Tooltip
                    cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "3 3" }}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      fontSize: 11,
                      fontFamily: "inherit",
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === "portfolioNorm") return [`${value.toFixed(1)}`, "Portfolio"];
                      if (name === "spyNorm") return [`${value.toFixed(1)}`, "SPY"];
                      return [value, name];
                    }}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate ?? label}
                  />
                  <Line
                    type="monotone"
                    dataKey="portfolioNorm"
                    stroke="hsl(var(--primary))"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="spyNorm"
                    stroke="hsl(var(--accent))"
                    strokeWidth={1}
                    dot={false}
                    strokeDasharray="4 2"
                    connectNulls
                  />
                  <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} strokeOpacity={0.4} />
                </ComposedChart>
              ) : (
                <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${fmt(v)}`}
                  />
                  <Tooltip
                    cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "3 3" }}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      fontSize: 11,
                      fontFamily: "inherit",
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === "total") return [`C$${value.toLocaleString("en-CA")}`, "Portfolio"];
                      if (name === "cost") return [`C$${value.toLocaleString("en-CA")}`, "Cost Basis"];
                      return [value, name];
                    }}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate ?? label}
                  />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    stroke="hsl(var(--border))"
                    strokeWidth={1}
                    fill="transparent"
                    dot={false}
                    strokeDasharray="4 2"
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--primary))"
                    strokeWidth={1.5}
                    fill="url(#totalGrad)"
                    dot={false}
                  />
                  <ReferenceLine
                    y={chartData[0]?.cost}
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={0.5}
                    strokeOpacity={0.4}
                  />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
