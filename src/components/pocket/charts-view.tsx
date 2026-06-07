"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import type { Basis, TickerAgg } from "@/lib/pocket-types";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";
import { PageDots, setActiveDots } from "./page-dots";
import { PocketDonut, type DonutSlice } from "./pocket-donut";

const METRICS = ["dividend", "value"] as const;
type Metric = (typeof METRICS)[number];
const METRIC_LABELS: Record<Metric, string> = { dividend: "Dividend", value: "Value" };

function Centered({ children }: { children: ReactNode }) {
  return <div className="pk-donut-empty">{children}</div>;
}

/**
 * Charts = a FIXED "Charts" title + a live "Metric · Portfolio" subtitle, above a
 * swipeable 2-donut pager for the Dividends-selected portfolio:
 *   • Dividend — annual run-rate per holding (center = the Dividends "Y" total)
 *   • Value    — market value per holding   (center = the Dividends "VALUE" total)
 * The portfolio (All / a group) mirrors the shared Dividends selection (activeId);
 * this branch remounts on tab entry so it always reflects it. Swiping switches the
 * METRIC only. Same net/gross basis as the rest of /pocket.
 */
export function ChartsView({
  included,
  portfolioName,
  basis,
  loading,
}: {
  included: TickerAgg[];
  portfolioName: string;
  basis: Basis;
  loading: boolean;
}) {
  const pagerRef = useRef<SwipePagerHandle>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLSpanElement>(null);
  const [activeMetric, setActiveMetric] = useState<Metric>("dividend");
  const activeIndex = Math.max(0, METRICS.indexOf(activeMetric));

  const dividendSlices = useMemo<DonutSlice[]>(
    () => included.map((t) => ({ label: t.ticker, value: basis === "net" ? t.netAnnualUSD : t.grossAnnualUSD })),
    [included, basis]
  );
  // Value = each holding's market value; holdings with no live price (null) drop out
  // (→ 0, filtered by the donut), so the center sums to the Dividends VALUE total.
  const valueSlices = useMemo<DonutSlice[]>(
    () => included.map((t) => ({ label: t.ticker, value: t.marketValueUSD ?? 0 })),
    [included]
  );

  const sub = (m: Metric) => `${METRIC_LABELS[m]} · ${portfolioName}`;

  const renderPage = (metric: string) => {
    if (loading) return <Centered><p className="pk-note">Loading…</p></Centered>;
    if (metric === "value")
      return <PocketDonut slices={valueSlices} centerLabel="market value" emptyText="No live prices for these holdings yet." />;
    return <PocketDonut slices={dividendSlices} centerLabel="per year" emptyText="No dividend holdings here yet." />;
  };

  return (
    <div className="pk-charts">
      {/* FIXED header: "Charts" + the active metric · the mirrored portfolio name.
          The subtitle's metric updates live as you swipe; the portfolio is ambient. */}
      <div className="pk-charts-head">
        <h1 className="pk-title">Charts</h1>
        <span className="pk-charts-sub" ref={subRef}>{sub(activeMetric)}</span>
      </div>
      <div className="pk-paged-region">
        <SwipePager
          ref={pagerRef}
          items={[...METRICS]}
          activeIndex={activeIndex}
          pageClassName="pk-paged-page"
          dragSwipe
          onProgress={(f) => {
            const active = Math.max(0, Math.min(METRICS.length - 1, Math.round(f)));
            setActiveDots(dotsRef.current, active);
            if (subRef.current) subRef.current.textContent = sub(METRICS[active]);
          }}
          onSettle={(i) => {
            const m = METRICS[i];
            if (m && m !== activeMetric) setActiveMetric(m);
          }}
          renderPage={renderPage}
        />
      </div>
      {/* Two docked dots — Dividend / Value — just above the tab bar. */}
      <PageDots
        ref={dotsRef}
        count={METRICS.length}
        activeIndex={activeIndex}
        onSelect={(i) => pagerRef.current?.scrollToIndex(i)}
        ariaLabel="Chart metric"
        itemLabel={(i) => METRIC_LABELS[METRICS[i]]}
      />
    </div>
  );
}
