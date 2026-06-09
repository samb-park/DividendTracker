"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RunRateResponse, TickerAgg, PositionRunRate, Basis } from "@/lib/pocket-types";
import { ACCT_LABELS, ACCT_PORTFOLIO_PREFIX, type PortfolioOption } from "@/lib/pocket-types";
import { useBasis, useEventFilter, usePocketTheme } from "./use-pocket-prefs";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";
import { PageDots, setActiveDots } from "./page-dots";
import { usePocketGroups } from "./use-pocket-groups";
import { usePocketSync } from "./use-pocket-sync";
import { PocketHero } from "./pocket-hero";
import { PocketSettings } from "./pocket-settings";
import { PocketTabBar, type PocketTab } from "./pocket-tabbar";
import { GroupManager } from "./group-manager";
import { ChartsView } from "./charts-view";
import { PortfolioPicker } from "./portfolio-picker";
import { PortfolioPickerButton } from "./portfolio-picker-button";
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
  onOpenPicker,
}: {
  derivedByPortfolio: Derived[];
  portfolioOrder: (string | null)[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  ready: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpenPicker: () => void;
}) {
  const pagerRef = useRef<SwipePagerHandle>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const items = useMemo(() => portfolioOrder.map((id) => id ?? "all"), [portfolioOrder]);
  const activeIndex = Math.max(0, portfolioOrder.indexOf(activeId));
  const activeName = derivedByPortfolio[activeIndex]?.portfolioName ?? "All";
  // Picking a portfolio (root sheet) changes activeId externally → scroll the pager
  // to it. Idempotent: a swipe-settle change targets the index we're already on, and
  // native scroll makes a same-position set a no-op. Gated on `ready` so it can't
  // fire with a stale activeIndex before portfolioOrder is complete.
  useEffect(() => {
    if (ready) pagerRef.current?.scrollToIndex(activeIndex);
  }, [activeIndex, ready]);
  return (
    <div className="pk-dividends">
      {/* FIXED header: "Dividends" + the active portfolio name as a TAPPABLE picker.
          Swiping still pages portfolios (name live-updates via nameRef); tapping the
          name opens the picker sheet. Only the content below slides. */}
      <div className="pk-dividends-head">
        <h1 className="pk-title">Dividends</h1>
        <PortfolioPickerButton name={activeName} onOpen={onOpenPicker} ref={nameRef} />
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
      {/* Page dots DOCKED below the scroll region, just above the tab bar — they
          make the portfolio swipe discoverable and are tappable. */}
      <PageDots
        ref={dotsRef}
        count={items.length}
        activeIndex={activeIndex}
        onSelect={(i) => pagerRef.current?.scrollToIndex(i)}
        ariaLabel="Portfolios"
        itemLabel={(i) => `Show ${derivedByPortfolio[i]?.portfolioName ?? "All"}`}
      />
    </div>
  );
}

export function PocketShell() {
  const [data, setData] = useState<RunRateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [tab, setTab] = useState<PocketTab>("dividends");
  const [managing, setManaging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  // M5: manual refresh for the installed PWA (document pull-to-refresh is blocked
  // by design — overscroll containment). A deliberate downward pull that STARTS on
  // the fixed header band triggers a silent reload; a small "Refreshing…" status
  // (the existing syncbar pattern) is the only visible feedback. The header band
  // is outside every scroll region, so this can't collide with list scrolling or
  // the horizontal pagers (vertical-dominant + threshold guards the rest).
  const [refreshing, setRefreshing] = useState(false);
  const refreshBusy = useRef(false);
  const manualRefresh = useCallback(async () => {
    if (refreshBusy.current) return;
    refreshBusy.current = true;
    setRefreshing(true);
    try {
      await load({ silent: true });
    } finally {
      refreshBusy.current = false;
      setRefreshing(false);
    }
  }, [load]);
  const pullStart = useRef<{ x: number; y: number } | null>(null);
  const onPullStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    // Only arms when the touch starts in the header band (≈ safe-area + title row).
    pullStart.current = t.clientY < 140 ? { x: t.clientX, y: t.clientY } : null;
  }, []);
  const onPullMove = useCallback(
    (e: React.TouchEvent) => {
      const s = pullStart.current;
      if (!s) return;
      const t = e.touches[0];
      if (t.clientY - s.y > 70 && Math.abs(t.clientX - s.x) < 40) {
        pullStart.current = null; // one trigger per gesture
        manualRefresh();
      }
    },
    [manualRefresh]
  );
  const onPullEnd = useCallback(() => {
    pullStart.current = null;
  }, []);

  const positions = useMemo(() => data?.positions ?? [], [data]);
  const accountTypes = useMemo(() => data?.accountTypes ?? [], [data]);

  // Every held ticker across all accounts — the "All" view and the group editor.
  const allTickerAggs = useMemo<TickerAgg[]>(() => rollupTickers(positions), [positions]);

  // Built-in per-account portfolios (always-current, not editable): one per held
  // account type. Synthetic id "acct:<TYPE>" — dynamically all holdings in that account.
  const accountPortfolioIds = useMemo<string[]>(
    () => accountTypes.map((a) => ACCT_PORTFOLIO_PREFIX + a),
    [accountTypes]
  );

  // Pager/selection order: All → each built-in account → each group. Native snap
  // clamps at the ends (no wrap). Built-ins MUST live here too, or the Dividends
  // pager's indexOf(activeId) desyncs when a built-in account is selected.
  const portfolioOrder = useMemo<(string | null)[]>(
    () => [null, ...accountPortfolioIds, ...groups.map((g) => g.id)],
    [accountPortfolioIds, groups]
  );

  // A stored selection that no longer resolves (deleted group, or an account no
  // longer held) falls back to "All". Gate on `data` too so a valid "acct:*" id
  // isn't wrongly reset (then flashed) before accountTypes have loaded.
  useEffect(() => {
    if (!groupsLoaded || !data || !activeId) return;
    const valid = new Set(portfolioOrder.filter((x): x is string => x != null));
    if (!valid.has(activeId)) setActiveId(null);
  }, [groupsLoaded, data, activeId, portfolioOrder, setActiveId]);

  // One figure-set per portfolio page: null="All"=everything, "acct:<TYPE>"=all
  // holdings in that account (dynamic, no ticker list), else a group (account ∩ ticker).
  const derivedByPortfolio = useMemo<Derived[]>(
    () =>
      portfolioOrder.map((id) => {
        if (id == null)
          return computeDerived(allTickerAggs, basis, positions.length, data?.fx.fallback ?? false, "All");
        if (id.startsWith(ACCT_PORTFOLIO_PREFIX)) {
          const acct = id.slice(ACCT_PORTFOLIO_PREFIX.length);
          const included = rollupTickers(positions.filter((p) => p.accountType === acct));
          return computeDerived(included, basis, positions.length, data?.fx.fallback ?? false, ACCT_LABELS[acct] ?? acct);
        }
        const g = groups.find((x) => x.id === id) ?? null;
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

  // Built-in account portfolios as picker/Settings options (muted dot, "Account").
  const accountPortfolios = useMemo<PortfolioOption[]>(
    () => accountTypes.map((a) => ({ id: ACCT_PORTFOLIO_PREFIX + a, name: ACCT_LABELS[a] ?? a, kind: "account", color: "var(--pk-muted)" })),
    [accountTypes]
  );
  // The full unified portfolio list for the Charts picker (All + accounts + groups).
  const portfolioOptions = useMemo<PortfolioOption[]>(
    () => [
      { id: null, name: "All", kind: "all", color: null },
      ...accountPortfolios,
      ...groups.map((g) => ({ id: g.id, name: g.name, kind: "group" as const, color: g.color })),
    ],
    [accountPortfolios, groups]
  );
  // The currently-selected option, shown as Settings' single portfolio row (falls
  // back to "All" if a stored group id no longer resolves).
  const activePortfolio = portfolioOptions.find((o) => o.id === activeId) ?? portfolioOptions[0];

  // The portfolio currently selected on Dividends (shared with Charts + Activity).
  const activeIdx = Math.max(0, portfolioOrder.indexOf(activeId));
  const activeDerived = derivedByPortfolio[activeIdx];
  const activeName = activeDerived?.portfolioName ?? "All";
  // Account scope of the active selection for filtering Activity's history modes:
  // [] = all accounts (the "All" portfolio, or a group with no account scope), else
  // the held account type(s). Account-only (no ticker filter) keeps past-sold holdings.
  const activeAccounts = useMemo<string[]>(() => {
    if (activeId == null) return [];
    if (activeId.startsWith(ACCT_PORTFOLIO_PREFIX)) return [activeId.slice(ACCT_PORTFOLIO_PREFIX.length)];
    return groups.find((g) => g.id === activeId)?.accounts ?? [];
  }, [activeId, groups]);

  return (
    <>
      {/* Registers the push-only SW on every /pocket load (the installed PWA
          launches here), so Web Push can arm. No-op without serviceWorker. */}
      <PwaRegister />
      {/* Dividends/Charts/Activity are all FIXED-HEADER + sub-region pagers: a fixed
          title above a .pk-paged-region whose abspos .pk-track gives each .pk-paged-page
          a DEFINITE height (height:100%), so the Dividends hero spacers (direct children)
          still center via the explicit-size path — NOT flex-grow across a scroll boundary.
          Settings keeps the plain scrolling .pk-screen (base rule, no data-tab match). */}
      <div
        className="pk-screen"
        data-tab={tab}
        onTouchStart={onPullStart}
        onTouchMove={onPullMove}
        onTouchEnd={onPullEnd}
        onTouchCancel={onPullEnd}
      >
        {(syncing || refreshing) && (
          <div
            className="pk-syncbar"
            role="status"
            aria-live="polite"
          >
            <span className="pk-sync-spin" aria-hidden>
              ⟳
            </span>
            {syncing ? "Syncing Questrade…" : "Refreshing…"}
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
            // Gate the once-per-mount align on BOTH groups AND run-rate data: a stored
            // "acct:*" selection only enters portfolioOrder once accountTypes load, so
            // aligning on groupsLoaded alone would lock the pager on "All" (didInit) and
            // desync from Charts on a cold load.
            ready={groupsLoaded && !!data}
            loading={loading}
            error={error}
            onRetry={() => load()}
            onOpenPicker={() => setPickerOpen(true)}
          />
        )}

        {/* Charts — fixed "Charts" title + live metric + a tappable portfolio name,
            then a swipeable Dividend/Value donut pager. Mirrors the shared activeId
            (Dividends + the root PortfolioPicker both write it). Remounts on entry. */}
        {tab === "charts" && (
          <ChartsView
            included={activeDerived?.included ?? []}
            portfolioName={activeDerived?.portfolioName ?? "All"}
            basis={basis}
            loading={loading}
            onOpenPicker={() => setPickerOpen(true)}
          />
        )}

        {/* Activity — merged Upcoming + History. A 4-way switch (Upcoming / Received /
            Trades / Cash) picks the mode; each renders its own self-contained surface.
            Remounts on entry. Upcoming uses the active portfolio's events. */}
        {tab === "activity" && (
          <HistoryTab
            basis={basis}
            fxRate={data?.fx?.usdcad ?? null}
            // L1: only flag a REAL fallback (server said so) — while data is still
            // loading the views show their own loading state, not a warning.
            fxFallback={data?.fx?.fallback ?? false}
            // L2: a ticker-group portfolio is selected → the history modes
            // (account-scoped by design) show a tiny scope caption.
            groupScope={activeId != null && !activeId.startsWith(ACCT_PORTFOLIO_PREFIX)}
            upcomingIncluded={activeDerived?.included ?? []}
            loading={loading}
            eventFilter={eventFilter}
            setEventFilter={setEventFilter}
            eventFilterHydrated={eventFilterHydrated}
            portfolioName={activeName}
            activeAccounts={activeAccounts}
            onOpenPicker={() => setPickerOpen(true)}
          />
        )}

        {tab === "settings" && (
          <PocketSettings
            activePortfolio={activePortfolio}
            onOpenPicker={() => setPickerOpen(true)}
            onEdit={() => setManaging(true)}
            basis={basis}
            setBasis={setBasis}
            themePref={themePref}
            setThemePref={setThemePref}
          />
        )}
      </div>

      <PocketTabBar active={tab} onChange={setTab} />

      {/* Charts portfolio picker — rendered at root (NOT inside the tab) so its
          fixed sheet anchors to the viewport and paints above the tab bar. */}
      {pickerOpen && (
        <PortfolioPicker
          options={portfolioOptions}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {managing && (
        <GroupManager
          groups={groups}
          loading={!groupsLoaded}
          allTickers={allTickerAggs}
          basis={basis}
          accountTypes={accountTypes}
          onClose={() => setManaging(false)}
          onReorder={groupsApi.reorderGroups}
          onCreate={groupsApi.createGroup}
          onUpdate={groupsApi.updateGroup}
          onDelete={groupsApi.deleteGroup}
        />
      )}
    </>
  );
}
