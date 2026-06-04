"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunRateResponse, TickerAgg } from "@/lib/pocket-types";
import { useExcluded, useExcludedAccounts, useBasis, usePocketTheme } from "./use-pocket-prefs";
import { PocketHero } from "./pocket-hero";
import { PocketSettings } from "./pocket-settings";
import { PocketTabBar, type PocketTab } from "./pocket-tabbar";
import { TickerPicker } from "./ticker-picker";
import { AccountChips } from "./account-chips";

export function PocketShell() {
  const [data, setData] = useState<RunRateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [tab, setTab] = useState<PocketTab>("dividends");
  const [editing, setEditing] = useState(false);

  const { excluded, toggle } = useExcluded();
  const { excluded: excludedAccounts, toggle: toggleAccount } = useExcludedAccounts();
  const [basis, setBasis] = useBasis();
  const [themePref, setThemePref] = usePocketTheme();

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

  // Per-ticker rollup over the currently-selected accounts (for the picker + headline).
  const tickerAggs = useMemo<TickerAgg[]>(() => {
    const active = positions.filter((p) => !excludedAccounts.has(p.accountType));
    const map = new Map<string, TickerAgg>();
    for (const p of active) {
      const lowConf = p.hasDividendData && !p.frequencyConfident;
      const e = map.get(p.ticker);
      if (e) {
        e.grossAnnualUSD += p.grossAnnualUSD;
        e.netAnnualUSD += p.netAnnualUSD;
        if (p.marketValueUSD != null) e.marketValueUSD = (e.marketValueUSD ?? 0) + p.marketValueUSD;
        e.hasDividendData = e.hasDividendData || p.hasDividendData;
        e.priceUnavailable = e.priceUnavailable || p.priceUnavailable;
        e.lowConfidence = e.lowConfidence || lowConf;
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
        });
      }
    }
    return [...map.values()].sort((a, b) => b.netAnnualUSD - a.netAnnualUSD);
  }, [positions, excludedAccounts]);

  const derived = useMemo(() => {
    const included = tickerAggs.filter((t) => !excluded.has(t.ticker));
    const pick = (t: TickerAgg) => (basis === "net" ? t.netAnnualUSD : t.grossAnnualUSD);

    // Headline income counts every included holding — dividend is known from
    // shares × per-share even when the live price is missing.
    const annualUSD = included.reduce((s, t) => s + pick(t), 0);

    // AVG% (value-weighted yield) over the PRICED subset so numerator/denominator
    // stay consistent; missing prices are surfaced as a note.
    const priced = included.filter((t) => t.marketValueUSD != null);
    const totalValueUSD = priced.reduce((s, t) => s + (t.marketValueUSD ?? 0), 0);
    const yieldAnnual = priced.reduce((s, t) => s + pick(t), 0);
    const avgYieldPct = totalValueUSD > 0 ? (yieldAnnual / totalValueUSD) * 100 : 0;

    return {
      annualUSD,
      totalValueUSD,
      avgYieldPct,
      isEmpty: positions.length === 0,
      allExcluded: positions.length > 0 && included.length === 0,
      priceGap: included.some((t) => t.priceUnavailable),
      freqGuess: included.some((t) => t.lowConfidence),
      fxFallback: data?.fx.fallback ?? false,
    };
  }, [tickerAggs, excluded, basis, positions, data]);

  return (
    <div className="pk-screen">
      {tab === "dividends" ? (
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
      ) : (
        <>
          <PocketSettings
            onEdit={() => setEditing(true)}
            basis={basis}
            setBasis={setBasis}
            themePref={themePref}
            setThemePref={setThemePref}
          />
          <div className="pk-bottom-clearance" />
        </>
      )}

      <PocketTabBar active={tab} onChange={setTab} />

      {editing && (
        <>
          <div className="pk-sheet-scrim" onClick={() => setEditing(false)} />
          <div className="pk-sheet" role="dialog" aria-modal="true" aria-label="Select accounts and tickers">
            <div className="pk-sheet-grip" />
            <div className="pk-sheet-head">
              <span className="pk-sheet-title">Accounts · Tickers</span>
              <button type="button" className="pk-sheet-done" onClick={() => setEditing(false)}>
                Done
              </button>
            </div>
            <AccountChips accountTypes={accountTypes} excluded={excludedAccounts} onToggle={toggleAccount} />
            <TickerPicker tickers={tickerAggs} excluded={excluded} basis={basis} onToggle={toggle} />
          </div>
        </>
      )}
    </div>
  );
}
