"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import ReactECharts from "echarts-for-react";
import { formatPerformanceAxisLabel } from "@/lib/performance-axis";
import { computePerformanceMetrics, type PerformanceContributionEventCAD, type PerformanceMetricRange } from "@/lib/performance-metrics";
import {
  SUPPORTED_BENCHMARKS,
  buildCashflowAdjustedBenchmarkSeries,
  type BenchmarkTicker,
} from "@/lib/performance-benchmark";
import {
  BASE_RATE_OPTIONS,
  buildCashflowAdjustedBaselineReturnSeriesForRate,
  getActiveBaseRateOptions,
  getProjectionSelectionLabel,
  type BaseRateId,
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
  const [range, setRange] = useState<Range>("all");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [contributionEventsCAD, setContributionEventsCAD] = useState<PerformanceContributionEventCAD[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkPoint[]>([]);
  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkTicker>("SPY");
  const [selectedProjection, setSelectedProjection] = useState<ProjectionSelection>("6");
  const [benchmarkError, setBenchmarkError] = useState(false);
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

  const { xirr, mdd, valueChange, chartData } = useMemo(() => {
    if (snapshots.length < 2) return { xirr: null, mdd: null, valueChange: null, chartData: [] };

    // ALL range: clip to >= 2025-05-21 (frontend-only display cutoff).
    // 다른 range (3m/6m/1y/3y/5y) 는 백엔드에서 이미 range filter 적용됨 → 그대로 사용.
    const ALL_RANGE_START_DATE = "2025-05-21";
    const effectiveSnapshots = range === "all"
      ? snapshots.filter((s) => {
          const raw = s.date as unknown;
          const iso = raw instanceof Date
            ? raw.toISOString().slice(0, 10)
            : typeof raw === "string"
              ? raw.slice(0, 10)
              : "";
          return iso >= ALL_RANGE_START_DATE;
        })
      : snapshots;
    if (effectiveSnapshots.length < 2) return { xirr: null, mdd: null, valueChange: null, chartData: [] };

    const { xirr, mdd, valueChange } = computePerformanceMetrics(effectiveSnapshots, range, contributionEventsCAD);
    const baselinePortfolioValueCAD = effectiveSnapshots[0].totalCAD;
    const cashflowAdjustedBenchmarkCAD = buildCashflowAdjustedBenchmarkSeries(
      effectiveSnapshots,
      benchmark,
      baselinePortfolioValueCAD,
      contributionEventsCAD,
    );
    const projectedSeriesByRate = Object.fromEntries(
      BASE_RATE_OPTIONS.map((option) => [
        option.id,
        buildCashflowAdjustedBaselineReturnSeriesForRate(
          effectiveSnapshots,
          baselinePortfolioValueCAD,
          contributionEventsCAD,
          option.cagrPct,
        ),
      ]),
    ) as Record<BaseRateId, Array<number | null>>;

    const rawChartData = effectiveSnapshots.map((s, index) => {
      const benchmarkValueCAD = cashflowAdjustedBenchmarkCAD[index] ?? null;
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
        benchmarkCAD: benchmarkValueCAD != null ? Math.round(convertAmount(benchmarkValueCAD, "CAD")) : null,
        baseRate2: baseRate2 != null ? Math.round(convertAmount(baseRate2, "CAD")) : null,
        baseRate4: baseRate4 != null ? Math.round(convertAmount(baseRate4, "CAD")) : null,
        baseRate6: baseRate6 != null ? Math.round(convertAmount(baseRate6, "CAD")) : null,
        baseRate8: baseRate8 != null ? Math.round(convertAmount(baseRate8, "CAD")) : null,
        baseRate10: baseRate10 != null ? Math.round(convertAmount(baseRate10, "CAD")) : null,
        baseRate12: baseRate12 != null ? Math.round(convertAmount(baseRate12, "CAD")) : null,
        baseBand: baseBand != null ? Math.round(convertAmount(baseBand, "CAD")) : null,
      };
    });

    // ── Relative-return normalization (2026-05-21) ────────────────────────────
    // Chart is rendered as percentage return from the period's first valid
    // value. Each series normalizes against ITS OWN first valid value so all
    // three (Portfolio / Benchmark / BASE) converge at 0% on the leftmost
    // visible day. The raw CAD numbers are preserved on each chartData row
    // for the tooltip and any callers that need them — only the *Pct fields
    // are wired into ECharts series.data.
    //   pct = ((current / firstValid) - 1) * 100
    const pickFirstValid = (key: keyof typeof rawChartData[number]): number | null => {
      for (const d of rawChartData) {
        const v = d[key];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
      }
      return null;
    };
    const firstTotal     = pickFirstValid("total");
    const firstBenchmark = pickFirstValid("benchmarkCAD");
    const firstBase2     = pickFirstValid("baseRate2");
    const firstBase4     = pickFirstValid("baseRate4");
    const firstBase6     = pickFirstValid("baseRate6");
    const firstBase8     = pickFirstValid("baseRate8");
    const firstBase10    = pickFirstValid("baseRate10");
    const firstBase12    = pickFirstValid("baseRate12");
    const toPct = (value: number | null, first: number | null): number | null => {
      // value <= 0 is treated as missing (broken-anchor days at the start of a
      // range have totalCAD = 0 and benchmarkCAD = 0; they would otherwise show
      // as -100% and bury the chart in a negative spike before any real data).
      if (first == null || first <= 0) return null;
      if (value == null || !Number.isFinite(value) || value <= 0) return null;
      return ((value / first) - 1) * 100;
    };

    // Portfolio cashflow-adjusted return (TWR — Time-Weighted Return).
    // Raw totalCAD normalize 는 deposit/withdrawal 자체가 "수익률" 처럼 보이는
    // jump 를 만듭니다 (예: $30k → $40k 인데 그 중 $8k 가 입금이면 raw +33%,
    // 실제 투자 수익은 ~+6.67%). TWR 은 일별 수익률을 cashflow 제거 후 계산해서
    // 누적 곱으로 표시하므로 입금/인출 효과를 분리합니다.
    //   r_i  = (V_i - C_i) / V_{i-1} - 1            (C_i = day i 의 contribution CAD)
    //   TWR  = ∏(1 + r_i) − 1
    // 이 계산은 chart 표시용으로만 사용. XIRR / VALUE CHANGE / MAX DD 는 그대로.
    const contribByDate = new Map<string, number>();
    for (const e of contributionEventsCAD) {
      const k = e.date.slice(0, 10);
      contribByDate.set(k, (contribByDate.get(k) ?? 0) + e.amountCAD);
    }
    const portfolioTWRPct: Array<number | null> = [];
    {
      let prevValue: number | null = null;
      let cumReturn = 1;
      for (const s of effectiveSnapshots) {
        const v = s.totalCAD;
        if (v == null || !Number.isFinite(v) || v <= 0) {
          portfolioTWRPct.push(null);
          continue;
        }
        if (prevValue == null || prevValue <= 0) {
          // 첫 funded day → TWR 의 anchor. 이후 일별 수익률 누적.
          prevValue = v;
          cumReturn = 1;
          portfolioTWRPct.push(0);
          continue;
        }
        const c = contribByDate.get(s.date.slice(0, 10)) ?? 0;
        const dailyReturn = (v - c) / prevValue - 1;
        cumReturn *= (1 + dailyReturn);
        portfolioTWRPct.push((cumReturn - 1) * 100);
        prevValue = v;
      }
    }

    // Delta (=차감) helper — value - firstValid. Null/non-finite stays null,
    // but unlike toPct we DO allow 0/negative deltas (portfolio can drop below
    // its starting value). This is what powers the "lines start at 0" view.
    const toDelta = (value: number | null, first: number | null): number | null => {
      if (first == null) return null;
      if (value == null || !Number.isFinite(value)) return null;
      return value - first;
    };

    const normalized = rawChartData.map((d, idx) => {
      const totalPct      = toPct(d.total, firstTotal);
      const portfolioReturnPct = portfolioTWRPct[idx] ?? null;
      const benchmarkPct  = toPct(d.benchmarkCAD, firstBenchmark);
      const baseRate2Pct  = toPct(d.baseRate2, firstBase2);
      const baseRate4Pct  = toPct(d.baseRate4, firstBase4);
      const baseRate6Pct  = toPct(d.baseRate6, firstBase6);
      const baseRate8Pct  = toPct(d.baseRate8, firstBase8);
      const baseRate10Pct = toPct(d.baseRate10, firstBase10);
      const baseRate12Pct = toPct(d.baseRate12, firstBase12);
      const baseBandPct = baseRate2Pct != null && baseRate12Pct != null
        ? baseRate12Pct - baseRate2Pct
        : null;
      // Delta fields (CAD - baseline CAD). Used by the chart so all 3 lines
      // visually anchor at 0 on the leftmost x. Raw CAD is still kept on the
      // row for tooltip display.
      const totalDelta       = toDelta(d.total, firstTotal);
      const benchmarkDelta   = toDelta(d.benchmarkCAD, firstBenchmark);
      const baseRate2Delta   = toDelta(d.baseRate2, firstBase2);
      const baseRate4Delta   = toDelta(d.baseRate4, firstBase4);
      const baseRate6Delta   = toDelta(d.baseRate6, firstBase6);
      const baseRate8Delta   = toDelta(d.baseRate8, firstBase8);
      const baseRate10Delta  = toDelta(d.baseRate10, firstBase10);
      const baseRate12Delta  = toDelta(d.baseRate12, firstBase12);
      const baseBandDelta = baseRate2Delta != null && baseRate12Delta != null
        ? baseRate12Delta - baseRate2Delta
        : null;
      return {
        ...d,
        totalPct,
        portfolioReturnPct,
        benchmarkPct,
        baseRate2Pct,
        baseRate4Pct,
        baseRate6Pct,
        baseRate8Pct,
        baseRate10Pct,
        baseRate12Pct,
        baseBandPct,
        totalDelta,
        benchmarkDelta,
        baseRate2Delta,
        baseRate4Delta,
        baseRate6Delta,
        baseRate8Delta,
        baseRate10Delta,
        baseRate12Delta,
        baseBandDelta,
      };
    });

    // Trim leading rows where Portfolio is still in the broken-anchor null
    // region. Once we slice from the first index whose totalPct is finite, the
    // x-axis (chartData.map(d => d.fullDate)) AUTOMATICALLY starts at that
    // date too — so the leftmost visible point on the chart is the first day
    // Portfolio has a real value, and at that point totalPct = 0 by construction.
    // benchmarkPct / baseRate*Pct are also 0 at that same index (they all
    // anchor on their respective first-valid value, which for cashflow-adjusted
    // series happens to align with the first funded portfolio day).
    const firstValidPortfolioIdx = normalized.findIndex((d) => typeof d.portfolioReturnPct === "number" && Number.isFinite(d.portfolioReturnPct));
    const chartData = firstValidPortfolioIdx > 0 ? normalized.slice(firstValidPortfolioIdx) : normalized;

    return { xirr, mdd, valueChange, chartData };

  }, [snapshots, benchmark, range, contributionEventsCAD, convertAmount]);

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
        fontSize: 10,
      },
      // padding/border-radius=0 keeps the touch popup tight so it doesn't
      // dominate the small mobile chart height.
      extraCssText: "border-radius:0;padding:6px 8px",
      formatter: (params: TooltipParam | TooltipParam[]) => {
        const items = Array.isArray(params) ? params : [params];
        const firstItem = items[0];
        const dataIndex = (firstItem as unknown as { dataIndex?: number })?.dataIndex;
        const row = typeof dataIndex === "number" ? chartData[dataIndex] : undefined;
        const label = row?.fullDate ?? row?.date ?? firstItem?.axisValue ?? firstItem?.name ?? "";
        // Tooltip shows ABSOLUTE asset value at the hovered date (not the
        // delta/growth-rate the chart line geometry represents). Each row keeps
        // the raw display-currency amounts (total, cost, benchmarkCAD,
        // baseRate2..12) — we look them up by series name.
        let html = `<div style="color:${tokens.mutedForeground};margin-bottom:4px;font-size:9px">${label}</div>`;
        for (const p of items) {
          const name = p.seriesName;
          if (name === "baseBandFloor" || name === "baseBand") continue;
          let assetValue: number | null = null;
          if (row) {
            if (name === "Portfolio Value") assetValue = row.total;
            else if (name === "Cost Basis") assetValue = row.cost;
            else if (name === activeBenchmarkLabel) assetValue = row.benchmarkCAD ?? null;
            else if (name?.startsWith("BASE")) {
              const rate = name.replace("BASE ", "").replace("%", "");
              const v = row[`baseRate${rate}` as keyof typeof row];
              if (typeof v === "number") assetValue = v;
            }
          }
          if (assetValue == null || !Number.isFinite(assetValue)) continue;
          // Shorten "Portfolio Value" → "Portfolio" to save horizontal space.
          const shortName = name === "Portfolio Value" ? "Portfolio" : (name ?? "");
          const valueText = formatMoney(assetValue, displayCurrency);
          html += `<div style="margin-top:1px;line-height:1.3">${p.marker}${shortName} ${valueText}</div>`;
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

    // Y-axis: CAD DELTA from each series' baseline. All lines start at 0 on
    // the leftmost x (totalDelta=0, benchmarkDelta=0, baseRate*Delta=0) and
    // rise/fall from there. yAxisMin clamps to 0 unless any series drops below
    // baseline (negative delta), in which case it expands downward so the
    // negative portion stays visible.
    const baseRateDeltaKeys: Array<keyof (typeof chartData)[number]> = activeProjectionOptions
      .map((opt) => (`${opt.dataKey}Delta`) as keyof (typeof chartData)[number]);
    const visibleDeltaValues: number[] = [];
    for (const d of chartData) {
      if (typeof d.totalDelta === "number" && Number.isFinite(d.totalDelta)) visibleDeltaValues.push(d.totalDelta);
      if (showBenchmark && typeof d.benchmarkDelta === "number" && Number.isFinite(d.benchmarkDelta)) {
        visibleDeltaValues.push(d.benchmarkDelta);
      }
      if (showProjection) {
        for (const key of baseRateDeltaKeys) {
          const v = d[key];
          if (typeof v === "number" && Number.isFinite(v)) visibleDeltaValues.push(v);
        }
      }
    }
    // Y-axis bottom is locked to 0 for every range (3m/6m/1y/3y/5y/all) so the
    // chart visually anchors the baseline at the bottom in all views. Series
    // values below 0 (drawdown vs. baseline) will be clipped off the bottom —
    // ECharts won't render the portion under the axis. This trades drawdown
    // visibility for cross-range visual consistency.
    const yAxisMin = 0;
    const maxDelta = visibleDeltaValues.length > 0 ? Math.max(...visibleDeltaValues) : 0;
    const yAxisMax = maxDelta > 0 ? Math.ceil(maxDelta * 1.05) : 1;

    const yAxis = {
      type: "value" as const,
      min: yAxisMin,
      max: yAxisMax,
      scale: false,
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
            name: "Portfolio Value",
            data: chartData.map((d) => d.totalDelta),
            color: PORTFOLIO_LINE_COLOR,
            lineStyle: { width: PORTFOLIO_LINE_WIDTH },
            symbol: "none",
            connectNulls: true,
            emphasis: { disabled: true },
            markLine: {
              silent: true,
              symbol: "none",
              data: [{ yAxis: 0, lineStyle: { color: tokens.mutedForeground, width: 0.5, opacity: 0.4 } }],
              label: { show: false },
            },
          },
          {
            type: "line",
            name: activeBenchmarkLabel ?? "Benchmark",
            data: chartData.map((d) => d.benchmarkDelta),
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
            data: chartData.map((d) => d.totalDelta),
            color: PORTFOLIO_LINE_COLOR,
            lineStyle: { width: PORTFOLIO_LINE_WIDTH },
            symbol: "none",
            emphasis: { disabled: true },
            // origin: 0 anchors the area fill base at the 0 (baseline) line so
            // positive deltas (gain over baseline) fill upward and negative
            // deltas (loss vs baseline) fill downward.
            areaStyle: {
              origin: 0,
              color: tokens.primaryAlpha(0.18),
            },
            markLine: {
              silent: true,
              symbol: "none",
              data: [{ yAxis: 0, lineStyle: { color: tokens.mutedForeground, width: 0.5, opacity: 0.4 } }],
              label: { show: false },
            },
          },
          ...(selectedProjection === "all" ? [
            {
              type: "line",
              name: "baseBandFloor",
              data: chartData.map((d) => d.baseRate2Delta),
              stack: "baseBand",
              lineStyle: { opacity: 0 },
              symbol: "none",
              silent: true,
              tooltip: { show: false },
            },
            {
              type: "line",
              name: "baseBand",
              data: chartData.map((d) => d.baseBandDelta),
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
            data: chartData.map((d) => d.benchmarkDelta),
            color: BENCHMARK_LINE_COLOR,
            lineStyle: { width: BENCHMARK_LINE_WIDTH, type: BENCHMARK_LINE_DASH as unknown as string },
            symbol: "none",
            connectNulls: true,
            emphasis: { disabled: true },
          }] : []),
          ...projectionLegendItems.map((item) => ({
            type: "line" as const,
            name: item.label,
            data: chartData.map((d) => d[`${item.dataKey}Delta` as keyof typeof d]),
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
          // Uniform translucent fill anchored at axis start (=yAxis.min=0)
          // so the area visibly reaches the 0 baseline.
          areaStyle: {
            origin: "start" as const,
            color: tokens.primaryAlpha(0.18),
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
                {benchmarkError ? (
                  <span className="ml-auto text-[9px] text-negative">DATA UNAVAILABLE</span>
                ) : (
                  <span className="ml-auto text-[9px] opacity-60">SAME CASHFLOW BASIS</span>
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
                  <span className="ml-auto text-[9px] opacity-60">SAME CASHFLOW BASIS</span>
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
                <span className="ml-auto text-[9px] opacity-60">SAME CASHFLOW BASIS</span>
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
