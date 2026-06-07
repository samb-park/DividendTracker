"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ACCT_LABELS, type Basis, type PositionRunRate, type TickerAgg } from "@/lib/pocket-types";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";
import { PageDots, setActiveDots } from "./page-dots";
import { PocketDonut, type DonutSlice } from "./pocket-donut";
import { useSectors } from "./use-sectors";

const CHART_TYPES = ["holding", "account", "group", "sector"] as const;
type ChartType = (typeof CHART_TYPES)[number];
const SUBTITLES: Record<ChartType, string> = {
  holding: "By holding",
  account: "By account",
  group: "By group",
  sector: "By sector",
};

function Centered({ children }: { children: ReactNode }) {
  return <div className="pk-donut-empty">{children}</div>;
}

/**
 * Charts = a FIXED "Charts" title + a live subtitle (which breakdown) above a
 * swipeable pager of donut pages. Same fixed-header + docked-dots pattern as
 * DividendsPager. All four datasets are derived client-side from the run-rate
 * (per the global net/gross basis); only the by-sector page needs the async
 * /api/sector join (prefetched via useSectors).
 */
export function ChartsPager({
  positions,
  allTickerAggs,
  derivedByPortfolio,
  basis,
  loading,
}: {
  positions: PositionRunRate[];
  allTickerAggs: TickerAgg[];
  derivedByPortfolio: { annualUSD: number; portfolioName: string }[];
  basis: Basis;
  loading: boolean;
}) {
  const pagerRef = useRef<SwipePagerHandle>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLSpanElement>(null);
  const [activeType, setActiveType] = useState<ChartType>("holding");
  const activeIndex = Math.max(0, CHART_TYPES.indexOf(activeType));
  const sectors = useSectors();

  const holdingSlices = useMemo<DonutSlice[]>(
    () => allTickerAggs.map((t) => ({ label: t.ticker, value: basis === "net" ? t.netAnnualUSD : t.grossAnnualUSD })),
    [allTickerAggs, basis]
  );
  const accountSlices = useMemo<DonutSlice[]>(() => {
    const map = new Map<string, number>();
    for (const p of positions) {
      const v = basis === "net" ? p.netAnnualUSD : p.grossAnnualUSD;
      map.set(p.accountType, (map.get(p.accountType) ?? 0) + v);
    }
    return [...map.entries()].map(([acct, value]) => ({ label: ACCT_LABELS[acct] ?? acct, value }));
  }, [positions, basis]);
  const groupSlices = useMemo<DonutSlice[]>(
    // index 0 is the "All" universe — exclude it; each annualUSD is already basis-correct
    () => derivedByPortfolio.slice(1).map((d) => ({ label: d.portfolioName, value: d.annualUSD })),
    [derivedByPortfolio]
  );
  const sectorSlices = useMemo<DonutSlice[]>(() => {
    if (!sectors.map) return [];
    const map = new Map<string, number>();
    for (const t of allTickerAggs) {
      const sec = sectors.map[t.ticker] ?? "Other";
      map.set(sec, (map.get(sec) ?? 0) + (basis === "net" ? t.netAnnualUSD : t.grossAnnualUSD));
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  }, [allTickerAggs, basis, sectors.map]);

  const renderPage = (type: string) => {
    if (loading) return <Centered><p className="pk-note">Loading…</p></Centered>;
    if (type === "holding")
      return <PocketDonut slices={holdingSlices} centerLabel="per year" emptyText="No dividend holdings yet." />;
    if (type === "account")
      return <PocketDonut slices={accountSlices} centerLabel="per year" emptyText="No dividend data yet." />;
    if (type === "group") {
      const n = groupSlices.filter((s) => s.value > 0).length;
      if (n === 0)
        return <Centered><p className="pk-note">No portfolio groups yet — add them in Settings.</p></Centered>;
      return (
        <PocketDonut
          slices={groupSlices}
          centerLabel={`${n} group${n === 1 ? "" : "s"}`}
          caption="Groups can overlap — relative shares, not a split of your portfolio."
          emptyText="No dividend data in your groups."
        />
      );
    }
    // sector
    if (sectors.loading) return <Centered><p className="pk-note">Loading sectors…</p></Centered>;
    if (sectors.error) return <Centered><p className="pk-note warn">Couldn’t load sectors.</p></Centered>;
    // All-ETF portfolios have no per-ticker sector (Yahoo classifies funds as "Other"),
    // which would render a meaningless 100%-Other ring — show an honest note instead.
    const realSectors = sectorSlices.filter((s) => s.label !== "Other" && s.value > 0);
    if (realSectors.length === 0)
      return <Centered><p className="pk-note">Sector data isn’t available for ETF/fund holdings.</p></Centered>;
    return <PocketDonut slices={sectorSlices} centerLabel="per year" emptyText="No sector data yet." />;
  };

  return (
    <div className="pk-charts">
      {/* FIXED header: "Charts" + the active breakdown (subtitle updates live as you swipe). */}
      <div className="pk-charts-head">
        <h1 className="pk-title">Charts</h1>
        <span className="pk-charts-sub" ref={subRef}>{SUBTITLES[activeType]}</span>
      </div>
      <div className="pk-paged-region">
        <SwipePager
          ref={pagerRef}
          items={[...CHART_TYPES]}
          activeIndex={activeIndex}
          pageClassName="pk-paged-page"
          dragSwipe
          onProgress={(f) => {
            const active = Math.max(0, Math.min(CHART_TYPES.length - 1, Math.round(f)));
            setActiveDots(dotsRef.current, active);
            if (subRef.current) subRef.current.textContent = SUBTITLES[CHART_TYPES[active]];
          }}
          onSettle={(i) => {
            const t = CHART_TYPES[i];
            if (t && t !== activeType) setActiveType(t);
          }}
          renderPage={renderPage}
        />
      </div>
      {/* Page dots DOCKED below the chart, just above the tab bar. */}
      <PageDots
        ref={dotsRef}
        count={CHART_TYPES.length}
        activeIndex={activeIndex}
        onSelect={(i) => pagerRef.current?.scrollToIndex(i)}
        ariaLabel="Chart types"
        itemLabel={(i) => SUBTITLES[CHART_TYPES[i]]}
      />
    </div>
  );
}
