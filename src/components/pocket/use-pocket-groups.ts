"use client";

import { useCallback, useEffect, useState } from "react";
import type { PocketGroup } from "@/lib/pocket-types";

const ACTIVE_KEY = "dt-pocket-active-group-v1";

type GroupInput = {
  name: string;
  color?: string | null;
  icon?: string | null;
  tickers?: string[];
};
type GroupPatch = Partial<Pick<PocketGroup, "name" | "color" | "icon" | "tickers" | "sortOrder">>;

/** Pull a human-readable error message out of a failed JSON response. */
async function errorOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    /* non-JSON body */
  }
  return `요청 실패 (${res.status})`;
}

/**
 * Server-backed pocket groups ("포트폴리오"). The groups themselves live in the
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
        return { group: null, error: "네트워크 오류" };
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
        return { error: "네트워크 오류" };
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
        return { error: "네트워크 오류" };
      }
    },
    [groups, refresh]
  );

  return { groups, loaded, activeId, setActiveId, refresh, createGroup, updateGroup, deleteGroup };
}
