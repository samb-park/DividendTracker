"use client";

import { useCallback, useEffect, useState } from "react";
import type { Basis, ThemePref } from "@/lib/pocket-types";

const EXCLUDED_KEY = "dt-pocket-excluded-v1";
const BASIS_KEY = "dt-pocket-basis-v1";
const THEME_KEY = "dt-pocket-theme";

/**
 * Persisted EXCLUSION set (not inclusion): default empty → every held ticker is
 * shown, and a newly-bought ticker appears automatically instead of being
 * silently dropped. The user deselects what they don't want counted.
 * SSR-safe: server + first client paint use defaults, storage applied in effect.
 */
export function useExcluded() {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXCLUDED_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr)) setExcluded(new Set(arr.filter((x): x is string => typeof x === "string")));
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: Set<string>) => {
    try {
      localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore quota */
    }
  }, []);

  const toggle = useCallback(
    (ticker: string) => {
      setExcluded((prev) => {
        const next = new Set(prev);
        if (next.has(ticker)) next.delete(ticker);
        else next.add(ticker);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  return { excluded, toggle, hydrated };
}

export function useBasis(): [Basis, (b: Basis) => void] {
  const [basis, setBasisState] = useState<Basis>("net");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BASIS_KEY);
      if (raw === "net" || raw === "gross") setBasisState(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const setBasis = useCallback((b: Basis) => {
    setBasisState(b);
    try {
      localStorage.setItem(BASIS_KEY, b);
    } catch {
      /* ignore */
    }
  }, []);

  return [basis, setBasis];
}

function resolveMode(pref: ThemePref): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function applyMode(mode: "light" | "dark") {
  const root = document.getElementById("pocket-root");
  if (root) root.setAttribute("data-pocket-mode", mode);
}

export function usePocketTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPrefState] = useState<ThemePref>("system");

  // Load saved preference and reconcile the attribute with it.
  useEffect(() => {
    let initial: ThemePref = "system";
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === "system" || raw === "light" || raw === "dark") initial = raw;
    } catch {
      /* ignore */
    }
    setPrefState(initial);
    applyMode(resolveMode(initial));
  }, []);

  // Track OS theme while in "system" mode.
  useEffect(() => {
    if (pref !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem(THEME_KEY, p);
    } catch {
      /* ignore */
    }
    applyMode(resolveMode(p));
  }, []);

  return [pref, setPref];
}
