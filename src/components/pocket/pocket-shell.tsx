"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunRateResponse, TickerAgg, PositionRunRate } from "@/lib/pocket-types";
import { useExcludedAccounts, useBasis, useEventFilter, usePocketTheme } from "./use-pocket-prefs";
import { usePocketGroups } from "./use-pocket-groups";
import { PocketHero } from "./pocket-hero";
import { PocketSettings } from "./pocket-settings";
import { PocketTabBar, type PocketTab } from "./pocket-tabbar";
import { PortfolioSelect } from "./portfolio-select";
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

export function PocketShell() {
  const [data, setData] = useState<RunRateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [tab, setTab] = useState<PocketTab>("dividends");
  const [managing, setManaging] = useState(false);
  const [eventFilter, setEventFilter] = useEventFilter();

  const { excluded: excludedAccounts, toggle: toggleAccount } = useExcludedAccounts();
  const [basis, setBasis] = useBasis();
  const [themePref, setThemePref] = usePocketTheme();
  const groupsApi = usePocketGroups();
  const { groups, loaded: groupsLoaded, activeId, setActiveId } = groupsApi;

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/dividends/run-rate", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as RunRateResponse);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const positions = useMemo(() => data?.positions ?? [], [data]);
  const accountTypes = useMemo(() => data?.accountTypes ?? [], [data]);

  // Per-ticker rollup over the currently-selected accounts (for headline + Upcoming).
  const tickerAggs = useMemo<TickerAgg[]>(
    () => rollupTickers(positions.filter((p) => !excludedAccounts.has(p.accountType))),
    [positions, excludedAccounts]
  );
  // Every held ticker (ignores the account filter) — for group membership editing.
  const allTickerAggs = useMemo<TickerAgg[]>(() => rollupTickers(positions), [positions]);

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeId) ?? null,
    [groups, activeId]
  );

  // A stored selection whose group was deleted (or never existed) falls back to "전체".
  useEffect(() => {
    if (groupsLoaded && activeId && !groups.some((g) => g.id === activeId)) {
      setActiveId(null);
    }
  }, [groupsLoaded, activeId, groups, setActiveId]);

  const derived = useMemo(() => {
    // Active group filters tickers to its membership; "전체" keeps the account view.
    const inView = (t: TickerAgg) => !activeGroup || activeGroup.tickers.includes(t.ticker);
    const included = tickerAggs.filter(inView);
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
  }, [tickerAggs, activeGroup, basis, positions, data]);

  const showPortfolioBar = tab === "dividends" || tab === "upcoming";

  return (
    <>
      <div className="pk-screen">
        {showPortfolioBar && (
          <PortfolioSelect groups={groups} activeId={activeId} onSelect={setActiveId} />
        )}

        {tab === "dividends" && (
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
            onRetry={load}
          />
        )}

        {tab === "upcoming" && (
          <UpcomingList
            tickers={derived.included}
            basis={basis}
            filter={eventFilter}
            setFilter={setEventFilter}
            loading={loading}
          />
        )}

        {tab === "history" && <HistoryTab basis={basis} fxRate={data?.fx?.usdcad ?? null} />}

        {tab === "settings" && (
          <PocketSettings
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
          allTickers={allTickerAggs}
          basis={basis}
          accountTypes={accountTypes}
          excludedAccounts={excludedAccounts}
          onToggleAccount={toggleAccount}
          onClose={() => setManaging(false)}
          onCreate={groupsApi.createGroup}
          onUpdate={groupsApi.updateGroup}
          onDelete={groupsApi.deleteGroup}
        />
      )}
    </>
  );
}
