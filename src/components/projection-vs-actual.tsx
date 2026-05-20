"use client";

/**
 * Projection vs Actual — compares actual portfolio snapshots against the
 * rulebook's BASE / PESS / WORST projection trajectories.
 *
 * Data sources (existing endpoints, no backend changes):
 *  - GET  /api/snapshots?range=all   → daily PortfolioSnapshot rows
 *  - POST /api/ai/projection         → assumptions (CAGR / contribution / dividend)
 *
 * Anchor model: the earliest snapshot is the projection start point. For each
 * later snapshot date we compute what the projection would have been —
 *   projected = anchor * (1 + cagr)^elapsed + annualContrib * elapsed
 * Then compare against the actual snapshot value.
 *
 * UI shows one scenario at a time via selector; defaults to BASE.
 */
import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { formatPerformanceAxisLabel } from "@/lib/performance-axis";
import { useThemeTokens } from "@/lib/use-theme-tokens";

interface Snapshot {
  date: string;
  totalCAD: number;
  costBasisCAD: number;
  cashCAD: number;
  cumulativeDividendCAD: number;
}

interface SnapshotsResponse {
  snapshots?: Snapshot[];
  data?: Snapshot[];
}

interface ScenarioCagr {
  id: string;
  label: string;
  cagrPct: number;
}

interface ProjectionAssumptions {
  scenarioCagrsPct: ScenarioCagr[];
  annualContribCAD?: number;
  divGrowthPct?: number;
  currentValueCAD?: number;
  currentAnnualDivCAD?: number;
}

interface ProjectionResponse {
  assumptions?: ProjectionAssumptions;
  error?: string;
}

type ScenarioId = "base" | "pessimistic" | "worst";

interface EChartTooltipParam {
  marker?: string;
  seriesName?: string;
  name?: string;
  axisValue?: string | number;
  value?: number | string;
}

const SCENARIOS: { id: ScenarioId; label: string; fallback: number }[] = [
  { id: "base", label: "BASE", fallback: 6 },
  { id: "pessimistic", label: "PESS", fallback: 4 },
  { id: "worst", label: "WORST", fallback: 2 },
];

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function statusFor(diffPct: number): { label: string; cls: string } {
  if (diffPct > 2) return { label: "Ahead", cls: "text-positive" };
  if (diffPct >= -2) return { label: "On track", cls: "text-muted-foreground" };
  return { label: "Behind", cls: "text-negative" };
}

export function ProjectionVsActual() {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [projection, setProjection] = useState<ProjectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ScenarioId>("base");
  const tokens = useThemeTokens();

  useEffect(() => {
    let aborted = false;
    Promise.all([
      fetch("/api/snapshots?range=all").then((r) => r.json() as Promise<SnapshotsResponse>),
      fetch("/api/ai/projection", { method: "POST" }).then((r) => r.json() as Promise<ProjectionResponse>),
    ])
      .then(([snap, proj]) => {
        if (aborted) return;
        if (proj?.error) {
          setError(proj.error);
          setLoading(false);
          return;
        }
        setSnapshots(snap.snapshots ?? snap.data ?? []);
        setProjection(proj);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, []);

  const MIN_TRACKING_DAYS = 10;
  const elapsedDaysSpan =
    snapshots && snapshots.length >= 2
      ? Math.floor(
          (new Date(snapshots[snapshots.length - 1].date).getTime() -
            new Date(snapshots[0].date).getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : 0;

  const insufficient =
    !snapshots ||
    snapshots.length < 2 ||
    elapsedDaysSpan < MIN_TRACKING_DAYS ||
    !projection?.assumptions;

  const computed = useMemo(() => {
    if (insufficient || !snapshots || !projection?.assumptions) return null;
    const a = projection.assumptions;
    const cagrFor = (id: ScenarioId): number => {
      const fb = SCENARIOS.find((s) => s.id === id)?.fallback ?? 0;
      return (a.scenarioCagrsPct.find((s) => s.id === id)?.cagrPct ?? fb) / 100;
    };
    const annualContribCAD = a.annualContribCAD ?? 0;
    const divGrowthPct = (a.divGrowthPct ?? 0) / 100;
    const currentAnnualDiv = a.currentAnnualDivCAD ?? 0;

    const anchor = snapshots[0];
    const anchorDate = new Date(anchor.date);
    const anchorValue = anchor.totalCAD;
    const latest = snapshots[snapshots.length - 1];
    const latestDate = new Date(latest.date);
    const elapsedYrs =
      (latestDate.getTime() - anchorDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const elapsedDays = Math.round(elapsedYrs * 365.25);

    const projectedAt = (d: Date, cagr: number): number => {
      const yrs = (d.getTime() - anchorDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return anchorValue * Math.pow(1 + cagr, yrs) + annualContribCAD * yrs;
    };

    const rows = SCENARIOS.map((s) => {
      const cagr = cagrFor(s.id);
      const projected = projectedAt(latestDate, cagr);
      const actual = latest.totalCAD;
      const diff = actual - projected;
      const diffPct = projected > 0 ? (diff / projected) * 100 : 0;
      return {
        id: s.id,
        label: s.label,
        cagrPct: cagr * 100,
        projected,
        actual,
        diff,
        diffPct,
        status: statusFor(diffPct),
      };
    });

    const dates = snapshots.map((s) => s.date);
    const actualSeries = snapshots.map((s) => s.totalCAD);
    const projectedSeriesBy: Record<ScenarioId, number[]> = {
      base: snapshots.map((s) => projectedAt(new Date(s.date), cagrFor("base"))),
      pessimistic: snapshots.map((s) => projectedAt(new Date(s.date), cagrFor("pessimistic"))),
      worst: snapshots.map((s) => projectedAt(new Date(s.date), cagrFor("worst"))),
    };

    // Dividend comparison for active scenario only.
    const projDivBase = currentAnnualDiv * Math.pow(1 + divGrowthPct, elapsedYrs);
    const actualDivApprox = currentAnnualDiv;
    const divDiff = actualDivApprox - projDivBase;
    const divDiffPct = projDivBase > 0 ? (divDiff / projDivBase) * 100 : 0;

    return {
      anchor,
      latest,
      elapsedDays,
      dates,
      actualSeries,
      projectedSeriesBy,
      rows,
      div: { projDivBase, actualDivApprox, divDiff, divDiffPct },
    };
  }, [insufficient, snapshots, projection]);

  const option = useMemo(() => {
    if (!computed) return {};
    const grid = { left: 4, right: 4, top: 4, bottom: 24, containLabel: false };
    const xAxisDates = computed.dates;
    const projected = computed.projectedSeriesBy[active];
    const scenarioLabel = SCENARIOS.find((s) => s.id === active)?.label ?? "BASE";

    return {
      backgroundColor: "transparent",
      animation: false,
      grid,
      tooltip: {
        trigger: "axis" as const,
        confine: true,
        backgroundColor: tokens.card,
        borderColor: tokens.border,
        borderWidth: 1,
        textStyle: {
          color: tokens.foreground,
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 11,
        },
        extraCssText: "border-radius:0",
        axisPointer: {
          type: "line" as const,
          lineStyle: { color: tokens.mutedForeground, width: 0.5, type: [2, 2] as [number, number] },
        },
        formatter: (params: EChartTooltipParam | EChartTooltipParam[]) => {
          const items = Array.isArray(params) ? params : [params];
          const label = items[0]?.axisValue ?? items[0]?.name ?? "";
          let html = `<div style="color:${tokens.mutedForeground};margin-bottom:4px">${label}</div>`;
          for (const p of items) {
            if (p.value == null) continue;
            html += `<div>${p.marker ?? ""}${p.seriesName ?? ""}: C$${Number(p.value).toLocaleString("en-CA", { maximumFractionDigits: 0 })}</div>`;
          }
          return html;
        },
      },
      xAxis: {
        type: "category" as const,
        data: xAxisDates,
        axisLabel: {
          show: true,
          formatter: (value: string, index: number) =>
            formatPerformanceAxisLabel(value, index, xAxisDates, "all"),
          color: tokens.mutedForeground,
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 10,
          hideOverlap: true,
          margin: 8,
        },
        axisLine: { lineStyle: { color: tokens.border } },
        splitLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value" as const,
        scale: true,
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: tokens.border, type: [2, 4] as [number, number] } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: "line",
          name: "Actual",
          data: computed.actualSeries,
          color: tokens.primary,
          lineStyle: { width: 1.5 },
          symbol: "none",
          emphasis: { disabled: true },
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0.05, color: tokens.primaryAlpha(0.3) },
                { offset: 0.95, color: tokens.primaryAlpha(0) },
              ],
            },
          },
        },
        {
          type: "line",
          name: `Projected ${scenarioLabel}`,
          data: projected,
          color: tokens.accent,
          lineStyle: { width: 1, type: [4, 2] as [number, number] },
          symbol: "none",
          emphasis: { disabled: true },
        },
      ],
    };
  }, [computed, active, tokens]);

  if (loading) {
    return (
      <div className="border border-border bg-card">
        <div className="px-4 py-2 border-b border-border text-accent text-xs tracking-wide">
          &#9654; PROJECTION VS ACTUAL
        </div>
        <div className="h-36 flex items-center justify-center text-muted-foreground text-xs">
          LOADING...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-border bg-card">
        <div className="px-4 py-2 border-b border-border text-accent text-xs tracking-wide">
          &#9654; PROJECTION VS ACTUAL
        </div>
        <div className="p-6 text-center text-xs text-negative">{error}</div>
      </div>
    );
  }

  if (insufficient || !computed) {
    return (
      <div className="border border-border bg-card">
        <div className="px-4 py-2 border-b border-border text-accent text-xs tracking-wide">
          &#9654; PROJECTION VS ACTUAL
        </div>
        <div className="p-6 text-center text-xs text-muted-foreground">
          Need at least {MIN_TRACKING_DAYS} days of snapshot history.
        </div>
      </div>
    );
  }

  const activeRow = computed.rows.find((r) => r.id === active)!;
  const scenarioLabel = SCENARIOS.find((s) => s.id === active)?.label ?? "BASE";

  return (
    <div className="border border-border bg-card">
      <div className="px-3 sm:px-4 py-2 border-b border-border flex items-center justify-between gap-2">
        <div className="text-accent text-xs tracking-wide truncate">
          &#9654; PROJECTION VS ACTUAL
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`px-2 py-0.5 text-[10px] border whitespace-nowrap ${
                active === s.id
                  ? "border-accent text-accent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
        {/* Chart */}
        <div>
          <div className="flex items-center gap-4 mb-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 bg-primary" style={{ height: 2 }} />
              ACTUAL
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 border-t border-dashed border-accent" />
              {scenarioLabel} {activeRow.cagrPct.toFixed(1)}%
            </span>
            <span className="ml-auto text-[9px] opacity-60">{computed.elapsedDays}D</span>
          </div>
          <div className="h-44 sm:h-56 lg:h-72 chart-touch-zone">
            <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />
          </div>
        </div>

        {/* Comparison table — fits one screen, no overflow */}
        <table className="w-full text-[10px] sm:text-[11px] tabular-nums border border-border">
          <thead>
            <tr className="text-muted-foreground border-b border-border bg-muted/30">
              <th className="text-left  py-1 sm:py-1.5 px-1.5 sm:px-2 font-normal">Scenario</th>
              <th className="text-right py-1 sm:py-1.5 px-1.5 sm:px-2 font-normal">Proj.</th>
              <th className="text-right py-1 sm:py-1.5 px-1.5 sm:px-2 font-normal">Actual</th>
              <th className="text-right py-1 sm:py-1.5 px-1.5 sm:px-2 font-normal">Diff</th>
              <th className="text-left  py-1 sm:py-1.5 px-1.5 sm:px-2 font-normal hidden sm:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="py-1 sm:py-1.5 px-1.5 sm:px-2">
                {activeRow.label}
                <span className="ml-1 text-[9px] text-muted-foreground">{activeRow.cagrPct.toFixed(1)}%</span>
              </td>
              <td className="text-right py-1 sm:py-1.5 px-1.5 sm:px-2">${fmt(activeRow.projected)}</td>
              <td className="text-right py-1 sm:py-1.5 px-1.5 sm:px-2">${fmt(activeRow.actual)}</td>
              <td className={`text-right py-1 sm:py-1.5 px-1.5 sm:px-2 ${activeRow.diff >= 0 ? "text-positive" : "text-negative"}`}>
                {activeRow.diff >= 0 ? "+" : "−"}${fmt(Math.abs(activeRow.diff))}
                <span className="ml-1 text-[9px] opacity-70">
                  ({activeRow.diffPct >= 0 ? "+" : ""}{activeRow.diffPct.toFixed(1)}%)
                </span>
              </td>
              <td className={`py-1 sm:py-1.5 px-1.5 sm:px-2 hidden sm:table-cell ${activeRow.status.cls}`}>
                {activeRow.status.label}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Status pill (mobile only — replaces hidden Status column) */}
        <div className={`sm:hidden text-[10px] ${activeRow.status.cls}`}>
          Status: {activeRow.status.label}
        </div>

        {/* Dividend comparison — compact 4-stat row */}
        <div className="border border-border bg-muted/20 p-2.5 sm:p-3">
          <div className="text-[10px] text-muted-foreground mb-2">Annual dividend (TTM vs projected)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-[10px] sm:text-[11px] tabular-nums">
            <div>
              <div className="text-[9px] text-muted-foreground mb-0.5">Proj. ({scenarioLabel})</div>
              <div className="font-medium">${fmt(computed.div.projDivBase)}</div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground mb-0.5">Actual (TTM)</div>
              <div className="font-medium">${fmt(computed.div.actualDivApprox)}</div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground mb-0.5">Diff</div>
              <div className={`font-medium ${computed.div.divDiff >= 0 ? "text-positive" : "text-negative"}`}>
                {computed.div.divDiff >= 0 ? "+" : "−"}${fmt(Math.abs(computed.div.divDiff))}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground mb-0.5">Diff %</div>
              <div className={`font-medium ${computed.div.divDiff >= 0 ? "text-positive" : "text-negative"}`}>
                {computed.div.divDiffPct >= 0 ? "+" : ""}{computed.div.divDiffPct.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-muted-foreground">
          Short-term tracking can be noisy.
        </div>
      </div>
    </div>
  );
}
