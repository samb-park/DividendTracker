"use client";

import { useCallback, useEffect, useState } from "react";
import type { PocketGroup } from "@/lib/pocket-types";

const ACTIVE_KEY = "dt-pocket-active-group-v1";

type GroupInput = {
  name: string;
  color?: string | null;
  icon?: string | null;
  accounts?: string[];
  tickers?: string[];
};
type GroupPatch = Partial<
  Pick<PocketGroup, "name" | "color" | "icon" | "accounts" | "tickers" | "sortOrder">
>;

/** Pull a human-readable error message out of a failed JSON response. */
async function errorOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    /* non-JSON body */
  }
  return `Request failed (${res.status})`;
}

/**
 * Server-backed pocket groups. The groups themselves live in the
 * DB (synced across devices); only the *active selection* is kept in
 * localStorage so the chosen view sticks per device without a round-trip.
 *
 * Mutations are optimistic for snappiness but RECONCILE with the server: on any
 * failure they re-fetch so the UI can never silently diverge from the DB.
 */
export function usePocketGroups() {
  const [groups, setGroups] = useState<PocketGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveIdState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_KEY);
      if (raw) setActiveIdState(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/pocket-groups", { cache: "no-store" });
      if (res.ok) setGroups((await res.json()) as PocketGroup[]);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const createGroup = useCallback(
    async (input: GroupInput): Promise<{ group: PocketGroup | null; error: string | null }> => {
      try {
        const res = await fetch("/api/pocket-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) return { group: null, error: await errorOf(res) };
        const g = (await res.json()) as PocketGroup;
        setGroups((prev) => [...prev, g]);
        return { group: g, error: null };
      } catch {
        return { group: null, error: "Network error" };
      }
    },
    []
  );

  const updateGroup = useCallback(
    async (id: string, patch: GroupPatch): Promise<{ error: string | null }> => {
      const prevGroups = groups;
      // Optimistic — reconcile with the server's canonical row on success,
      // and roll back (via re-fetch) on any failure so state never diverges.
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
      try {
        const res = await fetch(`/api/pocket-groups/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const error = await errorOf(res);
          setGroups(prevGroups);
          refresh();
          return { error };
        }
        const g = (await res.json()) as PocketGroup;
        setGroups((prev) => prev.map((x) => (x.id === id ? g : x)));
        return { error: null };
      } catch {
        setGroups(prevGroups);
        refresh();
        return { error: "Network error" };
      }
    },
    [groups, refresh]
  );

  const reorderGroups = useCallback(
    async (orderedIds: string[]): Promise<{ error: string | null }> => {
      const prevGroups = groups;
      // Optimistic: reindex the in-memory list immediately so the UI (and the
      // swipe pager, which derives its order from `groups`) reorders with no wait.
      const byId = new Map(groups.map((g) => [g.id, g]));
      const next = orderedIds
        .map((id, i) => {
          const g = byId.get(id);
          return g ? { ...g, sortOrder: i } : null;
        })
        .filter((g): g is PocketGroup => g !== null);
      // Only commit a COMPLETE reorder (every current group mapped exactly once),
      // matching the server's all-or-nothing validation.
      if (next.length !== groups.length) return { error: "Stale group set" };
      setGroups(next);
      try {
        const res = await fetch("/api/pocket-groups/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: orderedIds }),
        });
        if (!res.ok) {
          const error = await errorOf(res);
          setGroups(prevGroups);
          refresh();
          return { error };
        }
        setGroups((await res.json()) as PocketGroup[]); // reconcile to canonical rows
        return { error: null };
      } catch {
        setGroups(prevGroups);
        refresh();
        return { error: "Network error" };
      }
    },
    [groups, refresh]
  );

  const deleteGroup = useCallback(
    async (id: string): Promise<{ error: string | null }> => {
      const prevGroups = groups;
      setGroups((prev) => prev.filter((g) => g.id !== id));
      try {
        const res = await fetch(`/api/pocket-groups/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const error = await errorOf(res);
          setGroups(prevGroups);
          refresh();
          return { error };
        }
        return { error: null };
      } catch {
        setGroups(prevGroups);
        refresh();
        return { error: "Network error" };
      }
    },
    [groups, refresh]
  );

  return { groups, loaded, activeId, setActiveId, refresh, createGroup, updateGroup, deleteGroup, reorderGroups };
}
