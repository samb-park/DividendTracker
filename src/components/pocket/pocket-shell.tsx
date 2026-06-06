"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RunRateResponse, TickerAgg, PositionRunRate, Basis, EventFilter } from "@/lib/pocket-types";
import { useBasis, useEventFilter, usePocketTheme } from "./use-pocket-prefs";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";
import { usePocketGroups } from "./use-pocket-groups";
import { usePocketSync } from "./use-pocket-sync";
import { PocketHero } from "./pocket-hero";
import { PocketSettings } from "./pocket-settings";
import { PocketTabBar, type PocketTab } from "./pocket-tabbar";
import { GroupManager } from "./group-manager";
import { UpcomingList } from "./upcoming-list";
import { HistoryTab } from "./history-tab";
import { PwaRegister } from "@/components/pwa-register";

/** Roll (account × ticker) positions up to per-ticker USD aggregates. */
function rollupTickers(list: PositionRunRate[]): TickerAgg[] {
  const map = new Map<string, TickerAgg>();
  for (const p of list) {
    const lowConf = p.hasDividendData && !p.frequencyConfident;
    const freq = p.frequency || 0;
    const ppNet = freq > 0 ? p.netAnnualUSD / freq : 0;
    const ppGross = freq > 0 ? p.grossAnnualUSD / freq : 0;
    const e = map.get(p.ticker);
    if (e) {
      e.grossAnnualUSD += p.grossAnnualUSD;
      e.netAnnualUSD += p.netAnnualUSD;
      if (p.marketValueUSD != null) e.marketValueUSD = (e.marketValueUSD ?? 0) + p.marketValueUSD;
      e.hasDividendData = e.hasDividendData || p.hasDividendData;
      e.priceUnavailable = e.priceUnavailable || p.priceUnavailable;
      e.lowConfidence = e.lowConfidence || lowConf;
      e.perPaymentNetUSD += ppNet;
      e.perPaymentGrossUSD += ppGross;
      if (!e.nextExDate && p.nextExDate) e.nextExDate = p.nextExDate;
      if (!e.nextPayDate && p.nextPayDate) e.nextPayDate = p.nextPayDate;
      e.dateConfirmed = e.dateConfirmed || p.dateConfirmed;
    } else {
      map.set(p.ticker, {
        ticker: p.ticker,
        name: p.name,
        grossAnnualUSD: p.grossAnnualUSD,
        netAnnualUSD: p.netAnnualUSD,
        marketValueUSD: p.marketValueUSD,
        hasDividendData: p.hasDividendData,
        priceUnavailable: p.priceUnavailable,
        lowConfidence: lowConf,
        nextExDate: p.nextExDate,
        nextPayDate: p.nextPayDate,
        dateConfirmed: p.dateConfirmed,
        perPaymentNetUSD: ppNet,
        perPaymentGrossUSD: ppGross,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.netAnnualUSD - a.netAnnualUSD);
}

/** Per-portfolio figures — one set per page in the pager. */
type Derived = {
  included: TickerAgg[];
  annualUSD: number;
  totalValueUSD: number;
  avgYieldPct: number;
  isEmpty: boolean;
  allExcluded: boolean;
  priceGap: boolean;
  freqGuess: boolean;
  fxFallback: boolean;
  portfolioName: string;
};

/** Pure: roll a portfolio's included tickers up to the figures PocketHero renders. */
function computeDerived(
  included: TickerAgg[],
  basis: Basis,
  positionsCount: number,
  fxFallback: boolean,
  portfolioName: string
): Derived {
  const pick = (t: TickerAgg) => (basis === "net" ? t.netAnnualUSD : t.grossAnnualUSD);
  const annualUSD = included.reduce((s, t) => s + pick(t), 0);
  const priced = included.filter((t) => t.marketValueUSD != null);
  const totalValueUSD = priced.reduce((s, t) => s + (t.marketValueUSD ?? 0), 0);
  const yieldAnnual = priced.reduce((s, t) => s + pick(t), 0);
  const avgYieldPct = totalValueUSD > 0 ? (yieldAnnual / totalValueUSD) * 100 : 0;
  return {
    included,
    annualUSD,
    totalValueUSD,
    avgYieldPct,
    isEmpty: positionsCount === 0,
    allExcluded: positionsCount > 0 && included.length === 0,
    priceGap: included.some((t) => t.priceUnavailable),
    freqGuess: included.some((t) => t.lowConfidence),
    fxFallback,
    portfolioName,
  };
}

const UPCOMING_FILTERS: EventFilter[] = ["all", "ex", "pay"];

/**
 * Upcoming swipe cycles the event FILTER (all/ex/pay) of the ACTIVE portfolio —
 * NOT the portfolio. Each page renders that portfolio's events filtered; the
 * per-page .pk-seg segment is the live indicator (active by construction) and
 * tapping it drives the pager via scrollToIndex. Its own SwipePager instance →
 * its own align/settle, independent of the Dividends portfolio pager.
 */
function UpcomingPager({
  included,
  basis,
  loading,
  eventFilter,
  setEventFilter,
  hydrated,
}: {
  included: TickerAgg[];
  basis: Basis;
  loading: boolean;
  eventFilter: EventFilter;
  setEventFilter: (f: EventFilter) => void;
  hydrated: boolean;
}) {
  const pagerRef = useRef<SwipePagerHandle>(null);
  const idx = Math.max(0, UPCOMING_FILTERS.indexOf(eventFilter));
  return (
    <SwipePager
      ref={pagerRef}
      items={UPCOMING_FILTERS}
      activeIndex={idx}
      ready={hydrated}
      pageClassName="pk-page"
      onSettle={(i) => {
        const f = UPCOMING_FILTERS[i];
        if (f !== eventFilter) setEventFilter(f);
      }}
      renderPage={(f) => (
        <UpcomingList
          tickers={included}
          basis={basis}
          filter={f as EventFilter}
          setFilter={(nf) => pagerRef.current?.scrollToIndex(UPCOMING_FILTERS.indexOf(nf))}
          loading={loading}
        />
      )}
    />
  );
}

export function PocketShell() {
  const [data, setData] = useState<RunRateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [tab, setTab] = useState<PocketTab>("dividends");
  const [managing, setManaging] = useState(false);
  const [eventFilter, setEventFilter, eventFilterHydrated] = useEventFilter();

  // Dividends + Upcoming both render full-screen pages (CSS .pk-screen[data-tab] +
  // syncbar-float); only Dividends rides the portfolio pager below.
  const isPagerTab = tab === "dividends" || tab === "upcoming";
  const trackRef = useRef<HTMLDivElement>(null);

  const [basis, setBasis] = useBasis();
  const [themePref, setThemePref] = usePocketTheme();
  const groupsApi = usePocketGroups();
  const { groups, loaded: groupsLoaded, activeId, setActiveId } = groupsApi;

  // `silent` refresh skips the skeleton flash — used after a background sync.
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/dividends/run-rate", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as RunRateResponse);
    } catch {
      if (!opts?.silent) setError(true);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Opportunistic Questrade sync on open; silently refresh once fresh data lands.
  const { syncing } = usePocketSync(useCallback(() => load({ silent: true }), [load]));

  const positions = useMemo(() => data?.positions ?? [], [data]);
  const accountTypes = useMemo(() => data?.accountTypes ?? [], [data]);

  // Every held ticker across all accounts — the "All" view and the group editor.
  const allTickerAggs = useMemo<TickerAgg[]>(() => rollupTickers(positions), [positions]);

  // Pager order: All → each group. Native snap clamps at the ends (no wrap).
  const portfolioOrder = useMemo<(string | null)[]>(() => [null, ...groups.map((g) => g.id)], [groups]);

  // A stored selection whose group was deleted (or never existed) falls back to "All".
  useEffect(() => {
    if (groupsLoaded && activeId && !groups.some((g) => g.id === activeId)) {
      setActiveId(null);
    }
  }, [groupsLoaded, activeId, groups, setActiveId]);

  // One figure-set per portfolio page (account ∩ ticker; "All" = everything).
  const derivedByPortfolio = useMemo<Derived[]>(
    () =>
      portfolioOrder.map((id) => {
        const g = id == null ? null : groups.find((x) => x.id === id) ?? null;
        const included = g
          ? rollupTickers(
              positions.filter(
                (p) =>
                  (g.accounts.length === 0 || g.accounts.includes(p.accountType)) &&
                  g.tickers.includes(p.ticker)
              )
            )
          : allTickerAggs;
        return computeDerived(included, basis, positions.length, data?.fx.fallback ?? false, g?.name ?? "All");
      }),
    [portfolioOrder, groups, positions, allTickerAggs, basis, data]
  );

  // Page → activeId: settle-debounced (no IntersectionObserver — it flips mid-momentum).
  // Round by the real content width, never 100vw (which ignores safe-area + scrollbar).
  const settleTimer = useRef<number | null>(null);
  const onTrackScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const w = el.clientWidth || 1;
      const i = Math.max(0, Math.min(portfolioOrder.length - 1, Math.round(el.scrollLeft / w)));
      const next = portfolioOrder[i];
      if (next !== activeId) setActiveId(next);
    }, 120);
  }, [portfolioOrder, activeId, setActiveId]);

  // activeId → page: align ONCE per Dividends-tab entry, instantly, before paint.
  // The Dividends track is the ONLY consumer of this machinery now (Upcoming has its
  // own SwipePager instance keyed on the event filter), so the portfolio settle can
  // never fire on Upcoming. activeId changes only via swipe while mounted → no reactive
  // scrollTo fighting momentum (the Settings selector lives on a non-pager tab).
  const didInitScroll = useRef(false);
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el || tab !== "dividends" || didInitScroll.current) return;
    const i = portfolioOrder.indexOf(activeId);
    el.scrollLeft = Math.max(0, i) * el.clientWidth;
    didInitScroll.current = true;
  }, [tab, portfolioOrder, activeId]);
  useEffect(() => {
    if (tab !== "dividends") didInitScroll.current = false;
  }, [tab]);

  return (
    <>
      {/* Registers the push-only SW on every /pocket load (the installed PWA
          launches here), so Web Push can arm. No-op without serviceWorker. */}
      <PwaRegister />
      {/* Dividends/Upcoming = a native horizontal scroll-snap pager. .pk-screen is the
          positioning context; .pk-track is position:absolute inset:0 so its height is
          DEFINITE — each .pk-page inherits it via height:100% and reproduces the proven
          .pk-screen shape (overflow-y:auto column, hero spacers as DIRECT children, zero
          wrappers). That's the explicit-size path, NOT flex-grow across a scroll boundary,
          so the iOS spacer-collapse regression cannot recur. History/Settings keep the
          plain scrolling .pk-screen (the base rule, since they don't match the override). */}
      <div className="pk-screen" data-tab={tab}>
        {syncing && (
          <div
            className={`pk-syncbar${isPagerTab ? " pk-syncbar-float" : ""}`}
            role="status"
            aria-live="polite"
          >
            <span className="pk-sync-spin" aria-hidden>
              ⟳
            </span>
            Syncing Questrade…
          </div>
        )}

        {/* Dividends portfolio pager — FROZEN: the verified-good hero-centering
            track stays inline. .pk-track is position:absolute inset:0 (definite
            height); each .pk-page is height:100% and PocketHero's spacers are its
            DIRECT children. Do not wrap PocketHero or migrate it onto SwipePager. */}
        {tab === "dividends" && (
          <div className="pk-track" ref={trackRef} onScroll={onTrackScroll}>
            {portfolioOrder.map((id, i) => {
              const d = derivedByPortfolio[i];
              return (
                <div className="pk-page" key={id ?? "all"}>
                  <PocketHero
                    annualUSD={d.annualUSD}
                    totalValueUSD={d.totalValueUSD}
                    avgYieldPct={d.avgYieldPct}
                    loading={loading}
                    error={error}
                    isEmpty={d.isEmpty}
                    allExcluded={d.allExcluded}
                    priceGap={d.priceGap}
                    freqGuess={d.freqGuess}
                    fxFallback={d.fxFallback}
                    portfolioName={d.portfolioName}
                    onRetry={() => load()}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Upcoming — its OWN SwipePager: swipe cycles the event filter (all/ex/pay)
            of the active portfolio. Separate tab branch → remounts on entry → its
            align/settle are independent of the Dividends portfolio pager. */}
        {tab === "upcoming" && (
          <UpcomingPager
            included={derivedByPortfolio[Math.max(0, portfolioOrder.indexOf(activeId))]?.included ?? []}
            basis={basis}
            loading={loading}
            eventFilter={eventFilter}
            setEventFilter={setEventFilter}
            hydrated={eventFilterHydrated}
          />
        )}

        {tab === "history" && <HistoryTab basis={basis} fxRate={data?.fx?.usdcad ?? null} />}

        {tab === "settings" && (
          <PocketSettings
            groups={groups}
            activeId={activeId}
            onSelect={setActiveId}
            onReorder={groupsApi.reorderGroups}
            onEdit={() => setManaging(true)}
            basis={basis}
            setBasis={setBasis}
            themePref={themePref}
            setThemePref={setThemePref}
          />
        )}
      </div>

      <PocketTabBar active={tab} onChange={setTab} />

      {managing && (
        <GroupManager
          groups={groups}
          loading={!groupsLoaded}
          allTickers={allTickerAggs}
          basis={basis}
          accountTypes={accountTypes}
          onClose={() => setManaging(false)}
          onCreate={groupsApi.createGroup}
          onUpdate={groupsApi.updateGroup}
          onDelete={groupsApi.deleteGroup}
        />
      )}
    </>
  );
}
