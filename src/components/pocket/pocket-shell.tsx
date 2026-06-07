"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RunRateResponse, TickerAgg, PositionRunRate, Basis, EventFilter } from "@/lib/pocket-types";
import { useBasis, useEventFilter, usePocketTheme } from "./use-pocket-prefs";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";
import { PageDots, setActiveDots } from "./page-dots";
import { usePocketGroups } from "./use-pocket-groups";
import { usePocketSync } from "./use-pocket-sync";
import { PocketHero } from "./pocket-hero";
import { PocketSettings } from "./pocket-settings";
import { PocketTabBar, type PocketTab } from "./pocket-tabbar";
import { GroupManager } from "./group-manager";
import { UpcomingEvents, UPCOMING_FILTER_OPTS } from "./upcoming-list";
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

const UPCOMING_FILTERS: EventFilter[] = UPCOMING_FILTER_OPTS.map((o) => o.value);

/**
 * Upcoming swipe cycles the event FILTER (all/ex/pay) of the ACTIVE portfolio —
 * NOT the portfolio. The All/Ex/Pay segment is a FIXED header (it does not slide);
 * swiping the list below changes which segment is active (settle → setEventFilter),
 * and tapping a segment drives the pager via scrollToIndex. Same fixed-header +
 * sub-region pager pattern as History. Its own SwipePager instance → own
 * align/settle, independent of the Dividends portfolio pager.
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
  const segRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, UPCOMING_FILTERS.indexOf(eventFilter));
  return (
    <div className="pk-upcoming">
      {/* Page dots float above the tab bar (fixed) — mark the three filter pages
          and that you can swipe between them, consistent with every other pager. */}
      <PageDots
        ref={dotsRef}
        count={UPCOMING_FILTERS.length}
        activeIndex={idx}
        onSelect={(i) => pagerRef.current?.scrollToIndex(i)}
        ariaLabel="Event filter"
        itemLabel={(i) => UPCOMING_FILTER_OPTS[i].label}
      />
      {/* FIXED header: title + All/Ex/Pay segment. The white pill slides 1:1 with
          the swipe (onProgress sets --seg-progress on every frame); tapping a
          segment drives the pager. The pill is the active indicator. */}
      <div className="pk-upcoming-head">
        <h1 className="pk-title">Upcoming</h1>
        <div className="pk-seg pk-seg-anim" ref={segRef} role="group" aria-label="Event filter">
          <span className="pk-seg-pill" aria-hidden />
          {UPCOMING_FILTER_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="pk-seg-btn"
              data-active={eventFilter === o.value}
              aria-pressed={eventFilter === o.value}
              onClick={() => pagerRef.current?.scrollToIndex(UPCOMING_FILTERS.indexOf(o.value))}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pk-paged-region">
        <SwipePager
          ref={pagerRef}
          items={UPCOMING_FILTERS}
          activeIndex={idx}
          ready={hydrated}
          pageClassName="pk-paged-page"
          dragSwipe
          onProgress={(f) => {
            segRef.current?.style.setProperty("--seg-progress", String(f));
            setActiveDots(dotsRef.current, Math.round(f));
          }}
          onSettle={(i) => {
            const f = UPCOMING_FILTERS[i];
            if (f !== eventFilter) setEventFilter(f);
          }}
          renderPage={(f) => (
            <UpcomingEvents tickers={included} basis={basis} filter={f as EventFilter} loading={loading} />
          )}
        />
      </div>
    </div>
  );
}

/**
 * Dividends = a FIXED "Dividends" title + a sub-region pager over portfolios.
 * Swiping pages the whole per-portfolio block together (name + AVG/USD + D/W/M/Y),
 * while the title stays put — same fixed-header pattern as History/Upcoming. The
 * hero stays vertically centered: each .pk-paged-page is height:100% of the
 * region's inset:0 track, so the hero spacers (direct children) still grow.
 */
function DividendsPager({
  derivedByPortfolio,
  portfolioOrder,
  activeId,
  setActiveId,
  ready,
  loading,
  error,
  onRetry,
}: {
  derivedByPortfolio: Derived[];
  portfolioOrder: (string | null)[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  ready: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const pagerRef = useRef<SwipePagerHandle>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const items = useMemo(() => portfolioOrder.map((id) => id ?? "all"), [portfolioOrder]);
  const activeIndex = Math.max(0, portfolioOrder.indexOf(activeId));
  const activeName = derivedByPortfolio[activeIndex]?.portfolioName ?? "All";
  return (
    <div className="pk-dividends">
      {/* Page dots float in a pill just ABOVE the tab bar (CSS position:fixed, so
          this leaves the flow and the title below renders at the top). They make
          the portfolio swipe discoverable and are tappable. */}
      <PageDots
        ref={dotsRef}
        count={items.length}
        activeIndex={activeIndex}
        onSelect={(i) => pagerRef.current?.scrollToIndex(i)}
        ariaLabel="Portfolios"
        itemLabel={(i) => `Show ${derivedByPortfolio[i]?.portfolioName ?? "All"}`}
      />
      {/* FIXED header: "Dividends" + active portfolio name. Only the content
          below slides; the title + name stay put. */}
      <div className="pk-dividends-head">
        <h1 className="pk-title">Dividends</h1>
        <span className="pk-hero-pf" ref={nameRef}>{activeName}</span>
      </div>
      <div className="pk-paged-region">
        <SwipePager
          ref={pagerRef}
          items={items}
          activeIndex={activeIndex}
          ready={ready}
          pageClassName="pk-paged-page"
          onProgress={(f) => {
            // Live, in sync with the swiping content (round at the midpoint, not the
            // 120ms settle): light up the toward-dot AND swap the header name so the
            // fixed title's portfolio label changes with the page, not after it.
            const active = Math.max(0, Math.min(items.length - 1, Math.round(f)));
            setActiveDots(dotsRef.current, active);
            const nm = nameRef.current;
            if (nm) nm.textContent = derivedByPortfolio[active]?.portfolioName ?? "All";
          }}
          onSettle={(i) => {
            const id = portfolioOrder[i];
            if (id !== activeId) setActiveId(id);
          }}
          renderPage={(_item, i) => {
            const d = derivedByPortfolio[i];
            if (!d) return null;
            return (
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
                onRetry={onRetry}
              />
            );
          }}
        />
      </div>
    </div>
  );
}

export function PocketShell() {
  const [data, setData] = useState<RunRateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [tab, setTab] = useState<PocketTab>("dividends");
  const [managing, setManaging] = useState(false);
  const [eventFilter, setEventFilter, eventFilterHydrated] = useEventFilter();

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

  return (
    <>
      {/* Registers the push-only SW on every /pocket load (the installed PWA
          launches here), so Web Push can arm. No-op without serviceWorker. */}
      <PwaRegister />
      {/* Dividends/Upcoming/History are all FIXED-HEADER + sub-region pagers: a fixed
          title above a .pk-paged-region whose abspos .pk-track gives each .pk-paged-page
          a DEFINITE height (height:100%), so the Dividends hero spacers (direct children)
          still center via the explicit-size path — NOT flex-grow across a scroll boundary.
          Settings keeps the plain scrolling .pk-screen (base rule, no data-tab match). */}
      <div className="pk-screen" data-tab={tab}>
        {syncing && (
          <div
            className="pk-syncbar"
            role="status"
            aria-live="polite"
          >
            <span className="pk-sync-spin" aria-hidden>
              ⟳
            </span>
            Syncing Questrade…
          </div>
        )}

        {/* Dividends — fixed "Dividends" title + a sub-region pager over portfolios.
            Swiping pages the per-portfolio block (name + AVG/USD + D/W/M/Y) together;
            the title stays put. The hero stays vertically centered inside .pk-paged-page. */}
        {tab === "dividends" && (
          <DividendsPager
            derivedByPortfolio={derivedByPortfolio}
            portfolioOrder={portfolioOrder}
            activeId={activeId}
            setActiveId={setActiveId}
            ready={groupsLoaded}
            loading={loading}
            error={error}
            onRetry={() => load()}
          />
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
