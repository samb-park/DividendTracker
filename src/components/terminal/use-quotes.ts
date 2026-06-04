"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { MarketQuote } from "@/app/api/market/quotes/route";

interface QuotesState {
  quotes: MarketQuote[];
  asOf: string | null;
  loading: boolean;
  error: string | null;
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
      setState({ quotes: data.quotes ?? [], asOf: data.asOf ?? null, loading: false, error: null });
    } catch (e) {
      if (!aliveRef.current) return;
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "fetch failed" }));
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
