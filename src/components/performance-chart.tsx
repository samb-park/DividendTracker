"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface SeriesPoint {
  date: string;
  valueCAD: number;
}

interface PerformanceResponse {
  portfolio: SeriesPoint[];
  spy: SeriesPoint[];
  baseR: SeriesPoint[];
  v0: number;
  t0: string | null;
  t1: string | null;
  totalContribInWindow: number;
  valueChangePct: number | null;
  xirrPct: number | null;
  maxDrawdownPct: number | null;
  ticker: string;
  ratePercent: BaseRate;
}

const RANGES = ["3m", "6m", "1y", "all"] as const;
type Range = (typeof RANGES)[number];

const BENCHMARK_TICKERS = ["SPY", "QQQ", "VOO"] as const;
type BenchmarkTicker = (typeof BENCHMARK_TICKERS)[number];

const BASE_RATES = [2, 4, 6] as const;
type BaseRate = (typeof BASE_RATES)[number];

function formatCurrency(value: number): string {
  return `C$${value.toLocaleString("en-CA", { maximumFractionDigits: 0 })}`;
}

function formatCompactCAD(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `C$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `C$${(value / 1_000).toFixed(0)}K`;
  return `C$${value.toFixed(0)}`;
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function PerformanceChart() {
  const [range, setRange] = useState<Range>("1y");
  const [ticker, setTicker] = useState<BenchmarkTicker>("SPY");
  const [baseRate, setBaseRate] = useState<BaseRate>(6);
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ range, ticker, rate: String(baseRate) });

    setLoading(true);
    setFetchError(false);
    fetch(`/api/benchmarks?${params.toString()}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`benchmark request failed: ${r.status}`);
        return r.json();
      })
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetchError(true);
        setData(null);
        setLoading(false);
      });

    return () => controller.abort();
  }, [range, ticker, baseRate]);

  const chartData = useMemo(() => {
    if (!data) return [];

    const spyByDate = new Map(data.spy.map((point) => [point.date, point.valueCAD]));
    const baseByDate = new Map(data.baseR.map((point) => [point.date, point.valueCAD]));
    const firstDate = data.portfolio[0]?.date;
    const lastDate = data.portfolio.at(-1)?.date;
    const spanYears = firstDate && lastDate
      ? (new Date(`${lastDate}T00:00:00.000Z`).getTime() - new Date(`${firstDate}T00:00:00.000Z`).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      : 0;

    return data.portfolio.map((point) => ({
      date: (range === "all" || spanYears >= 1) ? point.date.slice(0, 7) : point.date.slice(5),
      fullDate: point.date,
      portfolio: point.valueCAD,
      benchmark: spyByDate.get(point.date) ?? null,
      baseR: baseByDate.get(point.date) ?? null,
    }));
  }, [data, range]);

  const hasSufficientData = chartData.length >= 2;
  const valueChangeClass = data?.valueChangePct != null && data.valueChangePct >= 0 ? "text-positive" : "text-negative";
  const xirrClass = data?.xirrPct != null && data.xirrPct >= 0 ? "text-positive" : "text-negative";

  return (
    <div className="border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-accent text-xs tracking-wide">&#9654; PERFORMANCE</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as Range)}
            className="btn-retro btn-retro-primary text-[10px] h-7 px-2 bg-card"
            aria-label="Performance range"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>{r.toUpperCase()}</option>
            ))}
          </select>
          <select
            value={ticker}
            onChange={(event) => setTicker(event.target.value as BenchmarkTicker)}
            className="btn-retro text-[10px] h-7 px-2 bg-card"
            aria-label="Benchmark ticker"
          >
            {BENCHMARK_TICKERS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <select
            value={baseRate}
            onChange={(event) => setBaseRate(Number(event.target.value) as BaseRate)}
            className="btn-retro text-[10px] h-7 px-2 bg-card"
            aria-label="Base rate"
          >
            {BASE_RATES.map((rate) => (
              <option key={rate} value={rate}>BASE {rate}%</option>
            ))}
          </select>
        </div>
      </div>

      {data && hasSufficientData && (
        <div className="grid grid-cols-3 gap-px bg-border border border-border mb-4">
          <div className="bg-card p-2" title="Window value change net of deposits and withdrawals inside the selected range">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">VALUE CHANGE</div>
            <div className={`text-sm font-medium tabular-nums ${valueChangeClass}`}>
              {formatPct(data.valueChangePct)}
            </div>
          </div>
          <div className="bg-card p-2" title="Lifetime money-weighted return; not recalculated by range">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">XIRR</div>
            <div className={`text-sm font-medium tabular-nums ${xirrClass}`}>
              {formatPct(data.xirrPct)}
            </div>
          </div>
          <div className="bg-card p-2" title="Maximum peak-to-trough decline over the selected range">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">MAX DD</div>
            <div className={`text-sm font-medium tabular-nums ${data.maxDrawdownPct !== null && data.maxDrawdownPct < -5 ? "text-negative" : "text-muted-foreground"}`}>
              {formatPct(data.maxDrawdownPct)}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-36 flex items-center justify-center text-muted-foreground text-xs">LOADING...</div>
      ) : fetchError ? (
        <div className="h-36 flex flex-col items-center justify-center text-xs space-y-2 border border-dashed border-border">
          <span className="text-negative">FAILED TO LOAD PERFORMANCE DATA</span>
          <button className="btn-retro text-[10px] px-3 py-1" onClick={() => { setFetchError(false); setLoading(true); setData(null); }}>RETRY</button>
        </div>
      ) : !hasSufficientData ? (
        <div className="h-36 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-1 border border-dashed border-border">
          <span>NOT ENOUGH DATA YET</span>
          {data?.t0 && (
            <span className="text-[10px] text-primary">ANCHOR {data.t0} / {formatCurrency(data.v0)}</span>
          )}
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-4 mb-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-px bg-primary" style={{ height: 2 }} />
              PORTFOLIO
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 border-t border-dashed border-accent" />
              {ticker}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-px" style={{ height: 2, backgroundColor: "hsl(196,80%,60%)" }} />
              BASE {baseRate}%
            </span>
          </div>
          <div className="h-48 lg:h-72 chart-touch-zone">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" hide />
                <YAxis
                  width={54}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCompactCAD}
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
                    if (name === "portfolio") return [formatCurrency(value), "Portfolio"];
                    if (name === "benchmark") return [formatCurrency(value), ticker];
                    if (name === "baseR") return [formatCurrency(value), `Base ${baseRate}%`];
                    return [value, name];
                  }}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate ?? label}
                />
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.8}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  stroke="hsl(var(--accent))"
                  strokeWidth={1.2}
                  dot={false}
                  strokeDasharray="4 2"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="baseR"
                  stroke="hsl(196,80%,60%)"
                  strokeWidth={1.2}
                  dot={false}
                  connectNulls
                />
                <ReferenceLine y={data?.v0 ?? chartData[0]?.portfolio} stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} strokeOpacity={0.4} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
