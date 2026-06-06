"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from "react";
import type { RunRateResponse, TickerAgg, PositionRunRate } from "@/lib/pocket-types";
import { useBasis, useEventFilter, usePocketTheme } from "./use-pocket-prefs";
import { usePocketGroups } from "./use-pocket-groups";
import { usePocketSync } from "./use-pocket-sync";
import { PocketHero } from "./pocket-hero";
import { PocketSettings } from "./pocket-settings";
import { PocketTabBar, type PocketTab } from "./pocket-tabbar";
import { GroupManager } from "./group-manager";
import { UpcomingList } from "./upcoming-list";
import { HistoryTab } from "./history-tab";

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

/** Detect a horizontal swipe, ignoring vertical scroll gestures. */
function useHorizontalSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: ReactTouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: ReactTouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      // horizontal-dominant flick only (so vertical scrolling is never hijacked)
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (dx < 0) onLeft();
        else onRight();
      }
    },
  };
}

export function PocketShell() {
  const [data, setData] = useState<RunRateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [tab, setTab] = useState<PocketTab>("dividends");
  const [managing, setManaging] = useState(false);
  const [eventFilter, setEventFilter] = useEventFilter();

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

  // Every held ticker across all accounts — the "전체" view and the group editor.
  const allTickerAggs = useMemo<TickerAgg[]>(() => rollupTickers(positions), [positions]);

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeId) ?? null,
    [groups, activeId]
  );

  // Swipe order: 전체 → each group → wrap. Swipe left = next, right = previous.
  const portfolioOrder = useMemo<(string | null)[]>(() => [null, ...groups.map((g) => g.id)], [groups]);
  const cyclePortfolio = useCallback(
    (dir: 1 | -1) => {
      if (portfolioOrder.length <= 1) return;
      const i = portfolioOrder.indexOf(activeId);
      const cur = i < 0 ? 0 : i;
      const next = (cur + dir + portfolioOrder.length) % portfolioOrder.length;
      setActiveId(portfolioOrder[next]);
    },
    [portfolioOrder, activeId, setActiveId]
  );
  const swipe = useHorizontalSwipe(
    () => cyclePortfolio(1),
    () => cyclePortfolio(-1)
  );

  // A stored selection whose group was deleted (or never existed) falls back to "전체".
  useEffect(() => {
    if (groupsLoaded && activeId && !groups.some((g) => g.id === activeId)) {
      setActiveId(null);
    }
  }, [groupsLoaded, activeId, groups, setActiveId]);

  const derived = useMemo(() => {
    // A portfolio scopes BOTH accounts and tickers (account ∩ ticker); "전체" = all.
    const included = activeGroup
      ? rollupTickers(
          positions.filter(
            (p) =>
              (activeGroup.accounts.length === 0 || activeGroup.accounts.includes(p.accountType)) &&
              activeGroup.tickers.includes(p.ticker)
          )
        )
      : allTickerAggs;
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
      isEmpty: positions.length === 0,
      allExcluded: positions.length > 0 && included.length === 0,
      priceGap: included.some((t) => t.priceUnavailable),
      freqGuess: included.some((t) => t.lowConfidence),
      fxFallback: data?.fx.fallback ?? false,
    };
  }, [positions, activeGroup, allTickerAggs, basis, data]);

  return (
    <>
      <div className="pk-screen">
        {syncing && (
          <div className="pk-syncbar" role="status" aria-live="polite">
            <span className="pk-sync-spin" aria-hidden>
              ⟳
            </span>
            Questrade 동기화 중…
          </div>
        )}

        {tab === "dividends" && (
          <div className="pk-swipe" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
            <PocketHero
              annualUSD={derived.annualUSD}
              totalValueUSD={derived.totalValueUSD}
              avgYieldPct={derived.avgYieldPct}
              loading={loading}
              error={error}
              isEmpty={derived.isEmpty}
              allExcluded={derived.allExcluded}
              priceGap={derived.priceGap}
              freqGuess={derived.freqGuess}
              fxFallback={derived.fxFallback}
              portfolioName={activeGroup?.name ?? "전체"}
              onRetry={() => load()}
            />
          </div>
        )}

        {tab === "upcoming" && (
          <div className="pk-swipe" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
            <UpcomingList
              tickers={derived.included}
              basis={basis}
              filter={eventFilter}
              setFilter={setEventFilter}
              loading={loading}
            />
          </div>
        )}

        {tab === "history" && <HistoryTab basis={basis} fxRate={data?.fx?.usdcad ?? null} />}

        {tab === "settings" && (
          <PocketSettings
            groups={groups}
            activeId={activeId}
            onSelect={setActiveId}
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
