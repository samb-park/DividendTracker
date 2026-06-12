"use client";

import { useCallback, useEffect, useState } from "react";
import type { Basis, ThemePref } from "@/lib/pocket-types";

const EXCLUDED_KEY = "dt-pocket-excluded-v1";
const EXCLUDED_ACCOUNTS_KEY = "dt-pocket-accounts-excluded-v1";
const BASIS_KEY = "dt-pocket-basis-v1";
const THEME_KEY = "dt-pocket-theme";

/**
 * Persisted EXCLUSION set (not inclusion): default empty → everything is shown,
 * and a newly-added item (ticker or account) appears automatically instead of
 * being silently dropped. The user deselects what they don't want counted.
 * SSR-safe: server + first client paint use defaults, storage applied in effect.
 */
function useExcludedSet(storageKey: string) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr)) setExcluded(new Set(arr.filter((x): x is string => typeof x === "string")));
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, [storageKey]);

  const toggle = useCallback(
    (value: string) => {
      setExcluded((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          /* ignore quota */
        }
        return next;
      });
    },
    [storageKey]
  );

  return { excluded, toggle, hydrated };
}

/** Excluded ticker symbols. */
export function useExcluded() {
  return useExcludedSet(EXCLUDED_KEY);
}

/** Excluded account types (e.g. exclude TFSA to view RRSP-only). */
export function useExcludedAccounts() {
  return useExcludedSet(EXCLUDED_ACCOUNTS_KEY);
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
  // Keep the theme-color meta in sync so iOS Safari's overscroll area matches.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "dark" ? "#0d0d0d" : "#f3f0e8");
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
