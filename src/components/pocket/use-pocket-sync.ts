"use client";

import { useEffect, useRef, useState } from "react";

/** Throttle window: skip the on-open sync if Questrade synced this recently. */
const MAX_AGE_SEC = 300; // 5 min

/**
 * Fire ONE opportunistic Questrade sync when /pocket opens. The server throttles
 * (skips if recently synced) and a distributed lock guards the single-use refresh
 * token, so this is safe to call on every visit. Non-blocking: pocket renders with
 * current data immediately; `onSynced` runs only when a real sync actually pulled
 * fresh data, so the caller can silently refresh. Errors (no token, lock, offline)
 * are swallowed — a background sync must never disrupt the view.
 */
export function usePocketSync(onSynced: () => void): { syncing: boolean } {
  const [syncing, setSyncing] = useState(false);
  const ran = useRef(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        const res = await fetch("/api/questrade/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxAgeSec: MAX_AGE_SEC }),
        });
        if (res.ok) {
          const data = (await res.json()) as { skipped?: boolean };
          if (!cancelled && !data.skipped) onSyncedRef.current();
        }
      } catch {
        /* offline / no token / lock — ignore */
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { syncing };
}
