"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunRateResponse } from "@/lib/pocket-types";
import { useExcluded, useBasis, usePocketTheme } from "./use-pocket-prefs";
import { PocketHero } from "./pocket-hero";
import { PocketSettings } from "./pocket-settings";
import { PocketTabBar, type PocketTab } from "./pocket-tabbar";
import { TickerPicker } from "./ticker-picker";

export function PocketShell() {
  const [data, setData] = useState<RunRateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [tab, setTab] = useState<PocketTab>("dividends");
  const [editing, setEditing] = useState(false);

  const { excluded, toggle } = useExcluded();
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

  const tickers = useMemo(() => data?.tickers ?? [], [data]);

  const derived = useMemo(() => {
    const included = tickers.filter((t) => !excluded.has(t.ticker));
    const pick = (t: (typeof included)[number]) => (basis === "net" ? t.netAnnualUSD : t.grossAnnualUSD);

    // Headline income counts every included holding — dividend is known from
    // shares × per-share even when the live price is missing.
    const annualUSD = included.reduce((s, t) => s + pick(t), 0);

    // AVG% (value-weighted yield) is computed only over the priced subset so the
    // numerator and denominator stay consistent; missing prices are surfaced as a note.
    const priced = included.filter((t) => t.marketValueUSD != null);
    const totalValueUSD = priced.reduce((s, t) => s + (t.marketValueUSD ?? 0), 0);
    const yieldAnnual = priced.reduce((s, t) => s + pick(t), 0);
    const avgYieldPct = totalValueUSD > 0 ? (yieldAnnual / totalValueUSD) * 100 : 0;

    return {
      annualUSD,
      totalValueUSD,
      avgYieldPct,
      isEmpty: tickers.length === 0,
      allExcluded: tickers.length > 0 && included.length === 0,
      priceGap: included.some((t) => t.priceUnavailable),
      fxFallback: data?.fx.fallback ?? false,
    };
  }, [tickers, excluded, basis, data]);

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
          fxFallback={derived.fxFallback}
          onEdit={() => setEditing(true)}
          onRetry={load}
        />
      ) : (
        <>
          <PocketSettings
            tickers={tickers}
            excluded={excluded}
            onToggle={toggle}
            basis={basis}
            setBasis={setBasis}
            themePref={themePref}
            setThemePref={setThemePref}
          />
          <div className="pk-bottom-clearance" />
        </>
      )}

      <PocketTabBar active={tab} onChange={setTab} />

      {editing && tab === "dividends" && (
        <>
          <div className="pk-sheet-scrim" onClick={() => setEditing(false)} />
          <div className="pk-sheet" role="dialog" aria-modal="true" aria-label="종목 선택">
            <div className="pk-sheet-grip" />
            <div className="pk-sheet-head">
              <span className="pk-sheet-title">종목 선택</span>
              <button type="button" className="pk-sheet-done" onClick={() => setEditing(false)}>
                완료
              </button>
            </div>
            <TickerPicker tickers={tickers} excluded={excluded} basis={basis} onToggle={toggle} />
          </div>
        </>
      )}
    </div>
  );
}
