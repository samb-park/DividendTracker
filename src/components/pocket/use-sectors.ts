"use client";

import { useEffect, useState } from "react";

/** Module-level cache so swiping to the sector page (or re-entering the tab)
 *  never re-fetches. inflight de-dupes concurrent mounts; cleared on failure to
 *  allow a later retry. */
let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

function load(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/sector", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ sectors: { ticker: string; sector: string }[] }>;
      })
      .then((j) => {
        const map: Record<string, string> = {};
        for (const s of j.sectors ?? []) map[s.ticker] = s.sector;
        cache = map;
        return map;
      })
      .catch((e) => {
        inflight = null; // allow retry next mount
        throw e;
      });
  }
  return inflight;
}

/** ticker → sector map for the by-sector donut. Prefetched once when the Charts
 *  tab mounts (the pager renders all pages, so this fires immediately). */
export function useSectors(): { map: Record<string, string> | null; loading: boolean; error: boolean } {
  const [map, setMap] = useState<Record<string, string> | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cache) {
      setMap(cache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    load()
      .then((m) => {
        if (!cancelled) {
          setMap(m);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { map, loading, error };
}
