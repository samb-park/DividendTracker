"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import { PanelEmpty, DataBadge } from "../panel-state";
import { fmtPrice, fmtPct, toneClass } from "../format";
import { cn } from "@/lib/utils";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// Palette derived from the app's CSS tokens (echarts needs literal colours).
const C = {
  up: "#4ADE80", // primary / positive
  down: "#E87D7D", // negative
  sma50: "#F6A823", // accent amber
  sma200: "#47BFEB", // chart-3 blue
  rsi: "#A670DB", // chart-4 purple
  macd: "#47BFEB", // MACD line — chart-3 blue (same tone as sma200)
  signal: "#F6A823", // signal line — accent amber (same tone as sma50)
  bb: "#6b6b6b", // bollinger bands — muted grey (subtle)
  axis: "#3a3a3a",
  text: "#8a8a8a",
};

const RANGES = ["1m", "3m", "6m", "1y", "2y", "5y", "10y"] as const;
type Range = (typeof RANGES)[number];

const INTERVALS = [
  { value: "auto", label: "AUTO" },
  { value: "1d", label: "1D" },
  { value: "1wk", label: "1W" },
  { value: "1mo", label: "1M" },
] as const;
type Interval = (typeof INTERVALS)[number]["value"];

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
interface TechnicalResponse {
  ticker: string;
  currency: string;
  candles: Candle[];
  indicators: {
    sma50: (number | null)[];
    sma200: (number | null)[];
    rsi14: (number | null)[];
    macd: (number | null)[];
    signal: (number | null)[];
    histogram: (number | null)[];
    bbUpper: (number | null)[];
    bbMiddle: (number | null)[];
    bbLower: (number | null)[];
  };
  meta: {
    currentPrice: number;
    week52High: number;
    week52Low: number;
    fromHighPct: number;
    dividendYield: number | null;
  };
}

export function CandleChartPanel({ ticker }: { ticker: string }) {
  const [range, setRange] = useState<Range>("1y");
  const [intervalSel, setIntervalSel] = useState<Interval>("auto");
  const [data, setData] = useState<TechnicalResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "no_data" | "error">("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setData(null);
    const params = new URLSearchParams({ ticker, range });
    if (intervalSel !== "auto") params.set("interval", intervalSel);
    fetch(`/api/technical?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) return { kind: "no_data" as const };
        if (!res.ok) return { kind: "error" as const };
        return { kind: "ok" as const, body: (await res.json()) as TechnicalResponse };
      })
      .then((r) => {
        if (!alive) return;
        if (r.kind === "ok") {
          setData(r.body);
          setStatus("ok");
        } else {
          setStatus(r.kind);
        }
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [ticker, range, intervalSel]);

  const option = useMemo<EChartsOption | null>(() => {
    if (!data || data.candles.length === 0) return null;
    const dates = data.candles.map((c) => c.date);
    const ohlc = data.candles.map((c) => [c.open, c.close, c.low, c.high]);
    const volumes = data.candles.map((c) => ({
      value: c.volume,
      itemStyle: { color: c.close >= c.open ? `${C.up}66` : `${C.down}66` },
    }));
    // MACD histogram: green for positive, red for negative; null stays null
    // (honest gaps — no zero-fill where the indicator is undefined).
    const histogram = data.indicators.histogram.map((h) =>
      h == null
        ? null
        : { value: h, itemStyle: { color: h >= 0 ? `${C.up}99` : `${C.down}99` } }
    );

    // 4-grid stack (top→bottom, non-overlapping, ~3% bottom margin for date axis):
    //   price  top 8px  h 44%  (→ ~44%)
    //   volume top 55%  h 11%  (→ 66%)
    //   MACD   top 69%  h 16%  (→ 85%)
    //   RSI    top 88%  h 9%   (→ 97%)
    // gridIndex: 0=price, 1=volume, 2=MACD, 3=RSI.
    return {
      animation: false,
      backgroundColor: "transparent",
      textStyle: { color: C.text, fontFamily: "IBM Plex Mono, monospace", fontSize: 10 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: "#111",
        borderColor: C.axis,
        textStyle: { color: "#ddd", fontSize: 10 },
      },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      grid: [
        { left: 48, right: 12, top: 8, height: "44%" },
        { left: 48, right: 12, top: "55%", height: "11%" },
        { left: 48, right: 12, top: "69%", height: "16%" },
        { left: 48, right: 12, top: "88%", height: "9%" },
      ],
      xAxis: [
        { type: "category", data: dates, gridIndex: 0, boundaryGap: true, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { show: false }, splitLine: { show: false } },
        { type: "category", data: dates, gridIndex: 1, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { show: false }, splitLine: { show: false } },
        { type: "category", data: dates, gridIndex: 2, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { show: false }, splitLine: { show: false } },
        { type: "category", data: dates, gridIndex: 3, axisLine: { lineStyle: { color: C.axis } }, axisLabel: { color: C.text, fontSize: 9 }, splitLine: { show: false } },
      ],
      yAxis: [
        { scale: true, gridIndex: 0, splitLine: { lineStyle: { color: "#222" } }, axisLabel: { color: C.text, fontSize: 9 }, axisLine: { lineStyle: { color: C.axis } } },
        { scale: true, gridIndex: 1, splitNumber: 2, splitLine: { show: false }, axisLabel: { color: C.text, fontSize: 8 }, axisLine: { lineStyle: { color: C.axis } } },
        { scale: true, gridIndex: 2, splitNumber: 2, splitLine: { show: false }, axisLabel: { color: C.text, fontSize: 8 }, axisLine: { lineStyle: { color: C.axis } } },
        { min: 0, max: 100, gridIndex: 3, splitNumber: 2, splitLine: { lineStyle: { color: "#222" } }, axisLabel: { color: C.text, fontSize: 8 }, axisLine: { lineStyle: { color: C.axis } } },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1, 2, 3], start: 40, end: 100 },
      ],
      series: [
        {
          name: "Price",
          type: "candlestick",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: ohlc,
          itemStyle: { color: C.up, color0: C.down, borderColor: C.up, borderColor0: C.down },
        },
        {
          name: "BB Upper",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: data.indicators.bbUpper,
          showSymbol: false,
          lineStyle: { width: 1, color: C.bb, type: "dashed", opacity: 0.7 },
        },
        {
          name: "BB Middle",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: data.indicators.bbMiddle,
          showSymbol: false,
          lineStyle: { width: 1, color: C.bb, opacity: 0.5 },
        },
        {
          name: "BB Lower",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: data.indicators.bbLower,
          showSymbol: false,
          lineStyle: { width: 1, color: C.bb, type: "dashed", opacity: 0.7 },
        },
        {
          name: "SMA50",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: data.indicators.sma50,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 1, color: C.sma50 },
        },
        {
          name: "SMA200",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: data.indicators.sma200,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 1, color: C.sma200 },
        },
        {
          name: "Volume",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes,
        },
        {
          name: "MACD Hist",
          type: "bar",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: histogram,
        },
        {
          name: "MACD",
          type: "line",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.indicators.macd,
          showSymbol: false,
          lineStyle: { width: 1, color: C.macd },
        },
        {
          name: "Signal",
          type: "line",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.indicators.signal,
          showSymbol: false,
          lineStyle: { width: 1, color: C.signal },
        },
        {
          name: "RSI14",
          type: "line",
          xAxisIndex: 3,
          yAxisIndex: 3,
          data: data.indicators.rsi14,
          showSymbol: false,
          lineStyle: { width: 1, color: C.rsi },
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: C.axis, type: "dashed" },
            data: [{ yAxis: 70 }, { yAxis: 30 }],
          },
        },
      ],
    };
  }, [data]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 text-[11px]">
        <span className="text-sm font-bold text-foreground">{ticker}</span>
        {data && (
          <>
            <span className="tabular-nums text-foreground">{fmtPrice(data.meta.currentPrice)}</span>
            <span className={cn("tabular-nums", toneClass(data.meta.fromHighPct))}>
              52H {fmtPct(data.meta.fromHighPct)}
            </span>
            <span className="text-muted-foreground">
              52범위 {fmtPrice(data.meta.week52Low)}–{fmtPrice(data.meta.week52High)}
            </span>
          </>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <DataBadge kind="delayed" label="Yahoo 지연" />
          <span className="flex items-center gap-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase transition-colors",
                  range === r ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r}
              </button>
            ))}
          </span>
          <span className="h-3 w-px bg-border" />
          <span className="flex items-center gap-0.5">
            {INTERVALS.map((iv) => (
              <button
                key={iv.value}
                onClick={() => setIntervalSel(iv.value)}
                className={cn(
                  "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase transition-colors",
                  intervalSel === iv.value ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {iv.label}
              </button>
            ))}
          </span>
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {status === "loading" && <PanelEmpty kind="loading" />}
        {status === "no_data" && <PanelEmpty kind="no_data" message={`${ticker} 가격 데이터를 찾을 수 없습니다.`} />}
        {status === "error" && <PanelEmpty kind="error" message="차트 데이터를 불러오지 못했습니다." />}
        {status === "ok" && option && (
          <ReactECharts option={option} style={{ height: "100%", width: "100%" }} notMerge lazyUpdate />
        )}
      </div>
    </div>
  );
}
