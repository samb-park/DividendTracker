"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCAD } from "./format";

type RangeId = "1m" | "3m" | "6m" | "1y" | "all";

export interface V2GraphPoint {
  date: string;
  totalCAD: number;
  costBasisCAD: number;
  cashCAD: number;
}

export interface V2GraphProps {
  initialRange: RangeId;
  initialSeries: V2GraphPoint[];
  fxRate: number;
}

const RANGES: { id: RangeId; label: string }[] = [
  { id: "1m", label: "1M" },
  { id: "3m", label: "3M" },
  { id: "6m", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "ALL" },
];

export function V2GraphClient({ initialRange, initialSeries }: V2GraphProps) {
  const [range, setRange] = useState<RangeId>(initialRange);
  const [series, setSeries] = useState<V2GraphPoint[]>(initialSeries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRangeChange = async (next: RangeId) => {
    if (next === range) return;
    setRange(next);
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/v2/history?range=${next}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as { series: V2GraphPoint[] };
      setSeries(json.series ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const empty = series.length === 0;

  const stats = useMemo(() => {
    if (series.length === 0) return null;
    const first = series[0];
    const last = series[series.length - 1];
    const change = last.totalCAD - first.totalCAD;
    const pct = first.totalCAD > 0 ? (change / first.totalCAD) * 100 : 0;
    return { first, last, change, pct };
  }, [series]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Portfolio</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums sm:text-3xl">
            {stats ? fmtCAD(stats.last.totalCAD) : "—"}
          </div>
          {stats ? (
            <div
              className={`mt-1 text-xs tabular-nums ${
                stats.change >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {stats.change >= 0 ? "+" : ""}
              {fmtCAD(stats.change)} ({stats.change >= 0 ? "+" : ""}
              {stats.pct.toFixed(2)}%) over {RANGES.find((r) => r.id === range)?.label}
            </div>
          ) : null}
        </div>
        <RangePicker value={range} onChange={onRangeChange} disabled={loading} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        {empty && !loading ? (
          <EmptyState />
        ) : (
          <div className="h-72 sm:h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={series}
                margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <defs>
                  <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(v: number) => fmtCAD(v, { compact: true })}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="totalCAD"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  strokeLinecap="round"
                  fill="url(#totalGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {loading ? (
          <div className="mt-2 text-center text-[11px] text-muted-foreground">Loading…</div>
        ) : null}
        {error ? (
          <div className="mt-2 text-center text-[11px] text-destructive">{error}</div>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Source: daily PortfolioSnapshot. Per-ticker / normal-vs-excluded split chart will land in a follow-up
        when split-history reconstruction is enabled.
      </p>
    </div>
  );
}

function RangePicker({
  value,
  onChange,
  disabled,
}: {
  value: RangeId;
  onChange: (r: RangeId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-full bg-muted/50 p-0.5 text-[11px]">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(r.id)}
          className={`rounded-full px-2.5 py-1 transition-colors disabled:opacity-50 ${
            value === r.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-2 text-center sm:h-96">
      <div className="text-sm text-muted-foreground">No portfolio history yet.</div>
      <div className="text-[11px] text-muted-foreground">
        A daily snapshot is recorded by cron — once a few days accumulate, the trend will appear here.
      </div>
    </div>
  );
}

interface RechartsTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload?: V2GraphPoint }>;
  label?: string | number;
}

function ChartTooltip(props: RechartsTooltipProps) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-border bg-card/95 px-3 py-2 shadow-md backdrop-blur">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{p.date}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">{fmtCAD(p.totalCAD)}</div>
      <div className="text-[10px] text-muted-foreground tabular-nums">
        cash {fmtCAD(p.cashCAD, { compact: true })} · cost {fmtCAD(p.costBasisCAD, { compact: true })}
      </div>
    </div>
  );
}
