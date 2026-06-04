"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { MarketQuote } from "@/app/api/market/quotes/route";

interface QuotesState {
  quotes: MarketQuote[];
  asOf: string | null;
  loading: boolean;
  error: string | null;
  /** true when a refresh failed but stale (previously-fetched) quotes are still shown */
  stale: boolean;
}

/**
 * Polls /api/market/quotes for a fixed set of symbols. Returns real (delayed)
 * quotes; failed symbols come back with status "no_data" and are never faked.
 */
export function useQuotes(symbols: string[], refreshMs = 60_000): QuotesState {
  const key = symbols.join(",");
  const [state, setState] = useState<QuotesState>({
    quotes: [],
    asOf: null,
    loading: true,
    error: null,
    stale: false,
  });
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(key)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { quotes: MarketQuote[]; asOf: string };
      if (!aliveRef.current) return;
      setState({ quotes: data.quotes ?? [], asOf: data.asOf ?? null, loading: false, error: null, stale: false });
    } catch (e) {
      if (!aliveRef.current) return;
      // Keep last good quotes but flag them stale so the UI can warn (no silent staleness).
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "fetch failed", stale: s.quotes.length > 0 }));
    }
  }, [key]);

  useEffect(() => {
    aliveRef.current = true;
    setState((s) => ({ ...s, loading: true }));
    load();
    const id = setInterval(load, refreshMs);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
    };
  }, [load, refreshMs]);

  return state;
}
