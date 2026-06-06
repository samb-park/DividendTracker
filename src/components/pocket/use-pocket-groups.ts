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

/**
 * Server-backed pocket groups ("포트폴리오"). The groups themselves live in the
 * DB (synced across devices); only the *active selection* is kept in
 * localStorage so the chosen view sticks per device without a round-trip.
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

  const createGroup = useCallback(async (input: GroupInput): Promise<PocketGroup | null> => {
    try {
      const res = await fetch("/api/pocket-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const g = (await res.json()) as PocketGroup;
      setGroups((prev) => [...prev, g]);
      return g;
    } catch {
      return null;
    }
  }, []);

  const updateGroup = useCallback(async (id: string, patch: GroupPatch): Promise<void> => {
    // Optimistic — reconcile with the server's canonical row on success.
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    try {
      const res = await fetch(`/api/pocket-groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const g = (await res.json()) as PocketGroup;
        setGroups((prev) => prev.map((x) => (x.id === id ? g : x)));
      }
    } catch {
      /* keep optimistic state */
    }
  }, []);

  const deleteGroup = useCallback(async (id: string): Promise<void> => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    try {
      await fetch(`/api/pocket-groups/${id}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }, []);

  return { groups, loaded, activeId, setActiveId, refresh, createGroup, updateGroup, deleteGroup };
}
