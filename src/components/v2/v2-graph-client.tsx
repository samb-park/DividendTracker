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
  { id: "all", label: "All" },
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
    <div className="space-y-7">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="v2-fineprint">Portfolio</div>
          <div
            className="v2-tnum mt-0.5"
            style={{
              fontFamily:
                "'SF Pro Display', system-ui, -apple-system, Inter, sans-serif",
              fontSize: 32,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: "-0.4px",
              color: "hsl(var(--v2-ink-strong))",
            }}
          >
            {stats ? fmtCAD(stats.last.totalCAD) : "—"}
          </div>
          {stats ? (
            <div
              className="v2-tnum mt-1"
              style={{
                fontSize: 13,
                letterSpacing: "-0.18px",
                color:
                  stats.change >= 0
                    ? "hsl(var(--positive))"
                    : "hsl(var(--negative))",
              }}
            >
              {stats.change >= 0 ? "+" : ""}
              {fmtCAD(stats.change)} ({stats.change >= 0 ? "+" : ""}
              {stats.pct.toFixed(2)}%) · {RANGES.find((r) => r.id === range)?.label}
            </div>
          ) : null}
        </div>

        <div className="v2-segmented">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              data-active={range === r.id}
              onClick={() => onRangeChange(r.id)}
              disabled={loading}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="v2-card p-4 sm:p-6">
        {empty && !loading && !error ? (
          <EmptyState />
        ) : error ? (
          <StateBlock
            title="Couldn't load history"
            sub={error}
            tone="error"
          />
        ) : (
          <div className="h-72 w-full sm:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <defs>
                  <linearGradient id="v2TotalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--v2-action-blue))" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="hsl(var(--v2-action-blue))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="hsl(var(--v2-divider-soft))"
                  strokeDasharray="0"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{
                    fill: "hsl(var(--v2-ink-muted-48))",
                    fontSize: 11,
                    letterSpacing: -0.12,
                  }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--v2-divider-soft))" }}
                  minTickGap={32}
                />
                <YAxis
                  tick={{
                    fill: "hsl(var(--v2-ink-muted-48))",
                    fontSize: 11,
                    letterSpacing: -0.12,
                  }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(v: number) =>
                    new Intl.NumberFormat("en-CA", {
                      style: "currency",
                      currency: "CAD",
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(v)
                  }
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--v2-hairline))" }} />
                <Area
                  type="monotone"
                  dataKey="totalCAD"
                  stroke="hsl(var(--v2-action-blue))"
                  strokeWidth={2}
                  strokeLinecap="round"
                  fill="url(#v2TotalGrad)"
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {loading ? (
          <div className="v2-fineprint mt-3 text-center">Loading…</div>
        ) : null}
      </div>

      <p className="v2-fineprint">
        Per-ticker and normal-vs-excluded split charts will land in a follow-up release.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <StateBlock
      title="No portfolio history yet"
      sub="A daily snapshot is recorded automatically. Once a few days accumulate, the trend will appear here."
    />
  );
}

function StateBlock({
  title,
  sub,
  tone,
}: {
  title: string;
  sub?: string;
  tone?: "error";
}) {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-2 px-6 text-center sm:h-96">
      <div
        className="v2-display"
        style={{
          fontSize: 17,
          fontWeight: 600,
          color:
            tone === "error" ? "hsl(var(--negative))" : "hsl(var(--v2-ink-strong))",
        }}
      >
        {title}
      </div>
      {sub ? <div className="v2-caption max-w-md">{sub}</div> : null}
    </div>
  );
}

interface RechartsTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload?: V2GraphPoint }>;
}

function ChartTooltip(props: RechartsTooltipProps) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  if (!p) return null;
  return (
    <div
      style={{
        background: "hsla(var(--v2-canvas) / 0.95)",
        border: "1px solid hsl(var(--v2-hairline))",
        borderRadius: 11,
        padding: "10px 14px",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        color: "hsl(var(--v2-ink-strong))",
      }}
    >
      <div className="v2-fineprint" style={{ marginBottom: 4 }}>
        {p.date}
      </div>
      <div
        className="v2-tnum"
        style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.374px" }}
      >
        {fmtCAD(p.totalCAD)}
      </div>
      <div className="v2-fineprint v2-tnum mt-1">
        cash {fmtCAD(p.cashCAD)} · cost {fmtCAD(p.costBasisCAD)}
      </div>
    </div>
  );
}
