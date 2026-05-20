"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import ReactECharts from "echarts-for-react";
import { formatPerformanceAxisLabel } from "@/lib/performance-axis";
import { computePerformanceMetrics, type PerformanceContributionEventCAD, type PerformanceMetricRange } from "@/lib/performance-metrics";
import {
  SUPPORTED_BENCHMARKS,
  normalizeBenchmarkSeries,
  type BenchmarkTicker,
} from "@/lib/performance-benchmark";
import {
  BASE_RATE_OPTIONS,
  buildProjectedPortfolioSeriesForRate,
  getActiveBaseRateOptions,
  getProjectionSelectionLabel,
  type BaseRateId,
  type PerformanceProjectionAssumptions,
  type ProjectionSelection,
} from "@/lib/performance-projection";
import { useCurrency } from "@/lib/currency-context";
import { useThemeTokens } from "@/lib/use-theme-tokens";
import { Card } from "./ui-card";

interface Snapshot {
  date: string;
  totalCAD: number;
  costBasisCAD: number;
  cashCAD: number;
  cumulativeDividendCAD?: number;
}

const RANGES = ["3m", "6m", "1y", "3y", "5y", "all"] as const;
type Range = PerformanceMetricRange;

interface BenchmarkPoint {
  date: string;
  value: number;
}

interface ProjectionResponse {
  assumptions?: PerformanceProjectionAssumptions;
  error?: string;
}

const PROJECTION_OPTIONS: Array<{ id: ProjectionSelection; label: string }> = [
  ...BASE_RATE_OPTIONS.map((option) => ({ id: option.id, label: option.label })),
  { id: "all", label: "ALL" },
];
const PORTFOLIO_LINE_COLOR = "#4ADE80";
const PORTFOLIO_LINE_WIDTH = 2;
const BASE_LINE_COLOR = "#FB923C";
const BASE_LINE_DASH = [8, 4];
const BASE_LINE_WIDTH = 1.5;
const BENCHMARK_LINE_COLOR = "#22D3EE";
const BENCHMARK_LINE_DASH = [6, 4];
const BENCHMARK_LINE_WIDTH = 1.5;

interface TooltipParam {
  value?: number | null;
  data?: number | null;
  payload?: {
    fullDate?: string;
    date?: string;
  };
  axisValue?: string;
  name?: string;
  seriesName?: string;
  marker?: string;
}

export function PerformanceChart() {
  const [range, setRange] = useState<Range>("1y");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [contributionEventsCAD, setContributionEventsCAD] = useState<PerformanceContributionEventCAD[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkPoint[]>([]);
  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkTicker>("SPY");
  const [selectedProjection, setSelectedProjection] = useState<ProjectionSelection>("6");
  const [benchmarkError, setBenchmarkError] = useState(false);
  const [projectionAssumptions, setProjectionAssumptions] = useState<PerformanceProjectionAssumptions | null>(null);
  const [projectionError, setProjectionError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const [rangeDropOpen, setRangeDropOpen] = useState(false);
  const [benchmarkDropOpen, setBenchmarkDropOpen] = useState(false);
  const [projectionDropOpen, setProjectionDropOpen] = useState(false);
  const rangeDropRef = useRef<HTMLDivElement>(null);
  const benchmarkDropRef = useRef<HTMLDivElement>(null);
  const projectionDropRef = useRef<HTMLDivElement>(null);
  const tokens = useThemeTokens();
  const { displayCurrency, convertAmount, formatMoney } = useCurrency();

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rangeDropRef.current && !rangeDropRef.current.contains(target)) setRangeDropOpen(false);
      if (benchmarkDropRef.current && !benchmarkDropRef.current.contains(target)) setBenchmarkDropOpen(false);
      if (projectionDropRef.current && !projectionDropRef.current.contains(target)) setProjectionDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (range === "all" && allLoaded) return;
    setLoading(true);
    setFetchError(false);
    fetch(`/api/snapshots?range=${range}`)
      .then((r) => r.json())
      .then((d) => {
        setSnapshots(d.snapshots ?? []);
        setContributionEventsCAD(d.contributionEventsCAD ?? []);
        if (range === "all") setAllLoaded(true);
        setLoading(false);
      })
      .catch(() => { setFetchError(true); setLoading(false); });
  }, [range, allLoaded]);

  useEffect(() => {
    setBenchmarkError(false);
    fetch(`/api/benchmarks?range=${range}&ticker=${selectedBenchmark}`)
      .then((r) => r.json())
      .then((d) => {
        const prices = d.prices ?? [];
        setBenchmark(prices);
        setBenchmarkError(prices.length === 0);
      })
      .catch(() => { setBenchmark([]); setBenchmarkError(true); });
  }, [range, selectedBenchmark]);

  useEffect(() => {
    if (projectionAssumptions) {
      setProjectionError(false);
      return;
    }

    let aborted = false;
    setProjectionError(false);
    fetch("/api/ai/projection", { method: "POST" })
      .then((r) => r.json() as Promise<ProjectionResponse>)
      .then((d) => {
        if (aborted) return;
        if (d.error || !d.assumptions) {
          setProjectionError(true);
          return;
        }
        setProjectionAssumptions(d.assumptions);
      })
      .catch(() => {
        if (!aborted) setProjectionError(true);
      });

    return () => {
      aborted = true;
    };
  }, [selectedProjection, projectionAssumptions]);

  const projectionInputs = useMemo(() => ({
    ...(projectionAssumptions ?? {}),
    contributionEventsCAD,
  }), [projectionAssumptions, contributionEventsCAD]);

  const { xirr, mdd, valueChange, chartData } = useMemo(() => {
    if (snapshots.length < 2) return { xirr: null, mdd: null, valueChange: null, chartData: [] };

    const { xirr, mdd, valueChange } = computePerformanceMetrics(snapshots, range, contributionEventsCAD);
    const portfolioBase = snapshots[0].totalCAD;
    const normalizedBenchmark = normalizeBenchmarkSeries(snapshots, benchmark);
    const projectedSeriesByRate = Object.fromEntries(
      BASE_RATE_OPTIONS.map((option) => [
        option.id,
        buildProjectedPortfolioSeriesForRate(snapshots, projectionInputs, option.cagrPct),
      ]),
    ) as Record<BaseRateId, Array<number | null>>;

    const chartData = snapshots.map((s, index) => {
      const normalizedPortfolio = portfolioBase > 0 ? (s.totalCAD / portfolioBase) * 100 : null;
      const benchmarkNorm = normalizedBenchmark[index] ?? null;
      const baseRate2 = projectedSeriesByRate["2"][index];
      const baseRate4 = projectedSeriesByRate["4"][index];
      const baseRate6 = projectedSeriesByRate["6"][index];
      const baseRate8 = projectedSeriesByRate["8"][index];
      const baseRate10 = projectedSeriesByRate["10"][index];
      const baseRate12 = projectedSeriesByRate["12"][index];
      const baseBand = baseRate2 != null && baseRate12 != null ? baseRate12 - baseRate2 : null;
      return {
        date: s.date,
        fullDate: s.date,
        total: Math.round(convertAmount(s.totalCAD, "CAD")),
        cost: Math.round(convertAmount(s.costBasisCAD, "CAD")),
        gain: Math.round(convertAmount(s.totalCAD - s.costBasisCAD, "CAD")),
        portfolioNorm: normalizedPortfolio,
        benchmarkNorm,
        benchmarkCAD: benchmark[index]?.value != null ? Math.round(convertAmount(benchmark[index]?.value ?? 0, "CAD")) : null,
        baseRate2: baseRate2 != null ? Math.round(convertAmount(baseRate2, "CAD")) : null,
        baseRate4: baseRate4 != null ? Math.round(convertAmount(baseRate4, "CAD")) : null,
        baseRate6: baseRate6 != null ? Math.round(convertAmount(baseRate6, "CAD")) : null,
        baseRate8: baseRate8 != null ? Math.round(convertAmount(baseRate8, "CAD")) : null,
        baseRate10: baseRate10 != null ? Math.round(convertAmount(baseRate10, "CAD")) : null,
        baseRate12: baseRate12 != null ? Math.round(convertAmount(baseRate12, "CAD")) : null,
        baseBand: baseBand != null ? Math.round(convertAmount(baseBand, "CAD")) : null,
      };
    });

    return { xirr, mdd, valueChange, chartData };

  }, [snapshots, benchmark, range, contributionEventsCAD, projectionInputs, convertAmount]);

  const hasSufficientData = snapshots.length >= 2;
  const lastSnapshot = snapshots[snapshots.length - 1];
  const showBenchmark = true;
  const activeProjectionOptions = getActiveBaseRateOptions(selectedProjection);
  const showProjection = activeProjectionOptions.length > 0;
  const activeBenchmarkLabel = selectedBenchmark;
  const selectedBenchmarkLabel = selectedBenchmark;
  const selectedProjectionLabel = getProjectionSelectionLabel(selectedProjection);
  const projectionLegendItems = activeProjectionOptions.map((option) => ({
    ...option,
    color: selectedProjection === "all" ? option.color : BASE_LINE_COLOR,
    dash: selectedProjection === "all" ? option.dash : BASE_LINE_DASH,
    width: selectedProjection === "all" ? option.width : BASE_LINE_WIDTH,
    label: `BASE ${option.label}`,
  }));

  const option = useMemo(() => {
    if (chartData.length === 0) return {};
    const grid = { left: 4, right: 8, top: 4, bottom: 24, containLabel: false };
    const xAxisDates = chartData.map((d) => d.fullDate);
    const tooltip = {
      trigger: "axis" as const,
      backgroundColor: tokens.card,
      borderColor: tokens.border,
      borderWidth: 1,
      textStyle: {
        color: tokens.foreground,
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: 11,
      },
      extraCssText: "border-radius:0",
      formatter: (params: TooltipParam | TooltipParam[]) => {
        const items = Array.isArray(params) ? params : [params];
        const firstPayload = items[0]?.payload ?? {};
        const label = firstPayload.fullDate ?? firstPayload.date ?? items[0]?.axisValue ?? items[0]?.name ?? "";
        let html = `<div style="color:${tokens.mutedForeground};margin-bottom:4px">${label}</div>`;
        for (const p of items) {
          const val = typeof p.value === "number" ? p.value : p.data;
          if (val == null) continue;
          const name = p.seriesName;
          let text = "";
          if (name === "Portfolio") text = `${val.toFixed(1)}`;
          else if (showProjection && name === activeBenchmarkLabel) continue;
          else if (name === activeBenchmarkLabel) text = `${val.toFixed(1)}`;
          else if (name?.startsWith("BASE")) text = formatMoney(val, displayCurrency);
          else if (name === "Portfolio Value") text = formatMoney(val, displayCurrency);
          else if (name === "Cost Basis") text = formatMoney(val, displayCurrency);
          else text = `${val}`;
          html += `<div>${p.marker}${name}: ${text}</div>`;
        }
        return html;
      },
    };

    const xAxis = {
      type: "category" as const,
      data: xAxisDates,
      axisLabel: {
        show: true,
        formatter: (value: string, index: number) => formatPerformanceAxisLabel(value, index, xAxisDates, range),
        color: tokens.mutedForeground,
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: 10,
        hideOverlap: true,
        margin: 8,
      },
      axisLine: { lineStyle: { color: tokens.border } },
      splitLine: { show: false },
      axisTick: { show: false },
    };

    const yAxis = {
      type: "value" as const,
      scale: true,
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: tokens.border, type: [2, 4] as unknown as string } },
      axisLine: { show: false },
      axisTick: { show: false },
    };

    const tooltipWithConfine = { ...tooltip, confine: true, axisPointer: { type: "line" as const, lineStyle: { color: tokens.mutedForeground, width: 0.5, type: [2, 2] as unknown as string } } };

    if (showBenchmark && !showProjection) {
      return {
        backgroundColor: "transparent",
        animation: false,
        grid,
        tooltip: tooltipWithConfine,
        xAxis,
        yAxis,
        series: [
          {
            type: "line",
            name: "Portfolio",
            data: chartData.map((d) => d.portfolioNorm),
            color: PORTFOLIO_LINE_COLOR,
            lineStyle: { width: PORTFOLIO_LINE_WIDTH },
            symbol: "none",
            connectNulls: true,
            emphasis: { disabled: true },
            markLine: {
              silent: true,
              symbol: "none",
              data: [{ yAxis: 100, lineStyle: { color: tokens.mutedForeground, width: 0.5, opacity: 0.4 } }],
              label: { show: false },
            },
          },
          {
            type: "line",
            name: activeBenchmarkLabel ?? "Benchmark",
            data: chartData.map((d) => d.benchmarkNorm),
            color: BENCHMARK_LINE_COLOR,
            lineStyle: { width: BENCHMARK_LINE_WIDTH, type: BENCHMARK_LINE_DASH as unknown as string },
            symbol: "none",
            connectNulls: true,
            emphasis: { disabled: true },
          },
        ],
      };
    }

    if (showProjection) {
      return {
        backgroundColor: "transparent",
        animation: false,
        grid,
        tooltip: tooltipWithConfine,
        xAxis,
        yAxis,
        series: [
          {
            type: "line",
            name: "Portfolio Value",
            data: chartData.map((d) => d.total),
            color: PORTFOLIO_LINE_COLOR,
            lineStyle: { width: PORTFOLIO_LINE_WIDTH },
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
          ...(selectedProjection === "all" ? [
            {
              type: "line",
              name: "baseBandFloor",
              data: chartData.map((d) => d.baseRate2),
              stack: "baseBand",
              lineStyle: { opacity: 0 },
              symbol: "none",
              silent: true,
              tooltip: { show: false },
            },
            {
              type: "line",
              name: "baseBand",
              data: chartData.map((d) => d.baseBand),
              stack: "baseBand",
              lineStyle: { opacity: 0 },
              symbol: "none",
              silent: true,
              tooltip: { show: false },
              areaStyle: { color: "#B388FF", opacity: 0.08 },
            },
          ] : []),
          ...(showBenchmark ? [{
            type: "line",
            name: activeBenchmarkLabel ?? "Benchmark",
            data: chartData.map((d) => d.benchmarkCAD),
            color: BENCHMARK_LINE_COLOR,
            lineStyle: { width: BENCHMARK_LINE_WIDTH, type: BENCHMARK_LINE_DASH as unknown as string },
            symbol: "none",
            connectNulls: true,
            emphasis: { disabled: true },
          }] : []),
          ...projectionLegendItems.map((item) => ({
            type: "line" as const,
            name: item.label,
            data: chartData.map((d) => d[item.dataKey]),
            color: item.color,
            lineStyle: { width: item.width, type: item.dash as unknown as string },
            symbol: "none",
            connectNulls: true,
            emphasis: { disabled: true },
          })),
        ],
      };
    }

    return {
      backgroundColor: "transparent",
      animation: false,
      grid,
      tooltip: tooltipWithConfine,
      xAxis,
      yAxis,
      series: [
        {
          type: "line",
          name: "Cost Basis",
          data: chartData.map((d) => d.cost),
          color: tokens.border,
          lineStyle: { width: 1, type: [4, 2] as unknown as string },
          symbol: "none",
          areaStyle: { color: "transparent" },
          emphasis: { disabled: true },
        },
        {
          type: "line",
          name: "Portfolio Value",
          data: chartData.map((d) => d.total),
          color: PORTFOLIO_LINE_COLOR,
          lineStyle: { width: PORTFOLIO_LINE_WIDTH },
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
          markLine: {
            silent: true,
            symbol: "none",
            data: [
              {
                yAxis: chartData[0]?.cost ?? 0,
                lineStyle: { color: tokens.mutedForeground, width: 0.5, opacity: 0.4 },
              },
            ],
            label: { show: false },
          },
        },
      ],
    };
  }, [chartData, selectedProjection, showBenchmark, showProjection, activeBenchmarkLabel, projectionLegendItems, tokens, range, displayCurrency, formatMoney]);

  return (
    <Card>
      <div className="flex flex-col items-start gap-2 mb-4">
        <div className="text-accent text-xs tracking-wide shrink-0">&#9654; PERFORMANCE</div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative shrink-0" ref={benchmarkDropRef}>
            <button
              type="button"
              className="btn-retro btn-retro-primary text-[10px] inline-flex w-[4.5rem] items-center justify-between gap-1.5"
              onClick={() => setBenchmarkDropOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={benchmarkDropOpen}
              aria-label="Benchmark selector"
              title="Select performance benchmark"
            >
              <span className="text-left">{selectedBenchmarkLabel}</span>
              <span className="text-muted-foreground">▾</span>
            </button>
            {benchmarkDropOpen && (
              <div className="absolute top-full left-0 mt-0.5 z-50 bg-card border border-border min-w-full">
                {SUPPORTED_BENCHMARKS.map((benchmarkOption) => (
                  <button
                    key={benchmarkOption.ticker}
                    type="button"
                    className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-border/30 ${selectedBenchmark === benchmarkOption.ticker ? "text-accent" : ""}`}
                    onClick={() => { setSelectedBenchmark(benchmarkOption.ticker); setBenchmarkDropOpen(false); }}
                    title={`Compare portfolio against ${benchmarkOption.label}`}
                  >
                    {benchmarkOption.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative shrink-0" ref={projectionDropRef}>
            <button
              type="button"
              className="btn-retro btn-retro-primary text-[10px] inline-flex w-[4.5rem] items-center justify-between gap-1.5"
              onClick={() => setProjectionDropOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={projectionDropOpen}
              aria-label="Projection selector"
              title="Select projected overlay"
            >
              <span className="text-left">{selectedProjectionLabel}</span>
              <span className="text-muted-foreground">▾</span>
            </button>
            {projectionDropOpen && (
              <div className="absolute top-full left-0 mt-0.5 z-50 bg-card border border-border min-w-full">
                {PROJECTION_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-border/30 ${selectedProjection === option.id ? "text-accent" : ""}`}
                    onClick={() => { setSelectedProjection(option.id); setProjectionDropOpen(false); }}
                    title={option.id === "all" ? "Overlay all BASE projection scenarios" : `Overlay ${option.label} projection`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative shrink-0" ref={rangeDropRef}>
            <button
              className="btn-retro btn-retro-primary text-[10px] inline-flex w-[4.5rem] items-center justify-between gap-1.5"
              onClick={() => setRangeDropOpen(v => !v)}
            >
              <span className="text-left">{range.toUpperCase()}</span>
              <span className="text-muted-foreground">▾</span>
            </button>
            {rangeDropOpen && (
              <div className="absolute top-full right-0 mt-0.5 z-50 bg-card border border-border min-w-full">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-border/30 ${range === r ? "text-accent" : ""}`}
                    onClick={() => { setRange(r); setRangeDropOpen(false); }}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics row */}
      {hasSufficientData && (
        <div className="grid grid-cols-3 gap-px bg-border border border-border mb-4">
          <div className="bg-card p-2" title="외부 투입 자금 기준 연환산 수익률">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">XIRR <span className="opacity-50">?</span></div>
            <div className={`text-sm font-medium tabular-nums ${xirr !== null && xirr >= 0 ? "text-positive" : "text-negative"}`}>
              {xirr !== null ? `${xirr >= 0 ? "+" : ""}${(xirr * 100).toFixed(2)}%` : "—"}
            </div>
          </div>
          <div className="bg-card p-2" title="Portfolio Value Change — total portfolio value change in CAD from first to last visible snapshot. Includes deposits/withdrawals and cash; not price-only or total-return performance.">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">VALUE CHANGE</div>
            <div className={`text-sm font-medium tabular-nums ${valueChange !== null && valueChange >= 0 ? "text-positive" : "text-negative"}`}>
              {valueChange !== null ? `${valueChange >= 0 ? "+" : ""}${valueChange.toFixed(2)}%` : "—"}
            </div>
          </div>
          <div className="bg-card p-2" title="Maximum Drawdown — largest peak-to-trough decline over the selected period. Values below −5% are highlighted.">
            <div className="text-[10px] text-muted-foreground tracking-wide mb-1">MAX DD <span className="opacity-50">?</span></div>
            <div className={`text-sm font-medium tabular-nums ${mdd !== null && mdd < -5 ? "text-negative" : "text-muted-foreground"}`}>
              {mdd !== null ? `${mdd.toFixed(2)}%` : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="h-36 flex items-center justify-center text-muted-foreground text-xs">LOADING...</div>
      ) : fetchError ? (
        <div className="h-36 flex flex-col items-center justify-center text-xs space-y-2 border border-dashed border-border">
          <span className="text-negative">FAILED TO LOAD PERFORMANCE DATA</span>
          <button className="btn-retro text-[10px] px-3 py-1" onClick={() => { setFetchError(false); setLoading(true); setAllLoaded(false); }}>RETRY</button>
        </div>
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[10px] text-muted-foreground">
            {showBenchmark && showProjection ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-px" style={{ backgroundColor: PORTFOLIO_LINE_COLOR, height: PORTFOLIO_LINE_WIDTH }} />
                  PORTFOLIO VALUE
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: BENCHMARK_LINE_COLOR, borderTopWidth: BENCHMARK_LINE_WIDTH }} />
                  {activeBenchmarkLabel}
                </span>
                {projectionLegendItems.map((item) => (
                  <span key={item.id} className="flex items-center gap-1.5">
                    <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: item.color }} />
                    {item.label}
                  </span>
                ))}
                {(benchmarkError || projectionError) ? (
                  <span className="ml-auto text-[9px] text-negative">DATA UNAVAILABLE</span>
                ) : (
                  <span className="ml-auto text-[9px] opacity-60">CAD TRAJECTORY</span>
                )}
              </>
            ) : showBenchmark ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-px" style={{ backgroundColor: PORTFOLIO_LINE_COLOR, height: PORTFOLIO_LINE_WIDTH }} />
                  PORTFOLIO
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: BENCHMARK_LINE_COLOR, borderTopWidth: BENCHMARK_LINE_WIDTH }} />
                  {activeBenchmarkLabel}
                </span>
                {benchmarkError ? (
                  <span className="ml-auto text-[9px] text-negative">{activeBenchmarkLabel} DATA UNAVAILABLE</span>
                ) : (
                  <span className="ml-auto text-[9px] opacity-60">DCA SHADOW · NORMALIZED</span>
                )}
              </>
            ) : showProjection ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-px" style={{ backgroundColor: PORTFOLIO_LINE_COLOR, height: PORTFOLIO_LINE_WIDTH }} />
                  PORTFOLIO VALUE
                </span>
                {projectionLegendItems.map((item) => (
                  <span key={item.id} className="flex items-center gap-1.5">
                    <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: item.color }} />
                    {item.label}
                  </span>
                ))}
                {projectionError ? (
                  <span className="ml-auto text-[9px] text-negative">PROJECTION DATA UNAVAILABLE</span>
                ) : (
                  <span className="ml-auto text-[9px] opacity-60">CAD TRAJECTORY</span>
                )}
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-px" style={{ backgroundColor: PORTFOLIO_LINE_COLOR, height: PORTFOLIO_LINE_WIDTH }} />
                  PORTFOLIO VALUE
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 border-t border-dashed border-border" />
                  COST BASIS
                </span>
              </>
            )}
          </div>
          <div className="h-48 lg:h-72 chart-touch-zone">
            <ReactECharts option={option} notMerge={true} style={{ height: "100%", width: "100%" }} />
          </div>
        </div>
      )}
    </Card>
  );
}

