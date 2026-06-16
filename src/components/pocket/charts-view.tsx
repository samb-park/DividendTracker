"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Basis, TickerAgg } from "@/lib/pocket-types";
import { PocketDonut, type DonutSlice } from "./pocket-donut";
import { Panel } from "./terminal/panel";

const METRICS = ["dividend", "value"] as const;
type Metric = (typeof METRICS)[number];

/** DIVIDEND ↔ VALUE segmented toggle — MDD MetricToggle look. */
function MetricToggle({ value, onChange }: { value: Metric; onChange: (m: Metric) => void }) {
  const opts: { v: Metric; label: string }[] = [
    { v: "dividend", label: "DIVIDEND" },
    { v: "value", label: "VALUE" },
  ];
  return (
    <span className="inline-flex border border-border-bright">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide pointer-coarse:min-h-9 pointer-coarse:px-3",
            value === o.v ? "bg-panel-header text-text-hi" : "text-text-low hover:text-text-mid",
          )}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/**
 * Charts = MDD ALLOCATION panel: a DIVIDEND/VALUE metric toggle in the panel header
 * over the distribution donut (+ its legend). Single vertical-scroll screen — the
 * old swipe pager is gone (MDD shows one allocation, toggled, not swiped).
 */
export function ChartsView({
  included,
  portfolioName,
  basis,
  loading,
  onOpenPicker,
}: {
  included: TickerAgg[];
  portfolioName: string;
  basis: Basis;
  loading: boolean;
  onOpenPicker: () => void;
}) {
  const [metric, setMetric] = useState<Metric>("dividend");

  const slices = useMemo<DonutSlice[]>(
    () =>
      included.map((t) => ({
        label: t.ticker,
        value:
          metric === "dividend"
            ? basis === "net"
              ? t.netAnnualUSD
              : t.grossAnnualUSD
            : t.marketValueUSD ?? 0,
      })),
    [included, metric, basis],
  );

  return (
    <>
      <div className="pk-charts-head">
        <h1 className="pk-title">Charts</h1>
        <button
          type="button"
          className="pk-charts-pf"
          onClick={onOpenPicker}
          aria-label={`Portfolio: ${portfolioName}. Tap to change.`}
        >
          <span className="pk-charts-pf-name">{portfolioName}</span>
          <span className="pk-charts-caret" aria-hidden>
            ▾
          </span>
        </button>
      </div>

      <Panel
        title="ALLOCATION"
        titleRight={<MetricToggle value={metric} onChange={setMetric} />}
        loading={loading}
        className="mt-3"
      >
        <PocketDonut
          slices={slices}
          centerLabel={metric === "dividend" ? "per year" : "market value"}
          emptyText={
            metric === "dividend"
              ? "No dividend holdings here yet."
              : "No live prices for these holdings yet."
          }
        />
      </Panel>
    </>
  );
}
