"use client";

import { useEffect, useMemo, useState } from "react";

const FALLBACK = {
  primary: "142 69% 58%",
  accent: "38 92% 55%",
  border: "0 0% 18%",
  card: "0 0% 7%",
  foreground: "45 20% 88%",
  mutedForeground: "0 0% 50%",
  negative: "0 70% 70%",
  positive: "142 69% 58%",
} as const;

export interface ThemeTokens {
  primary: string;
  primaryAlpha: (a: number) => string;
  accent: string;
  border: string;
  card: string;
  foreground: string;
  mutedForeground: string;
  negative: string;
  positive: string;
}

function read(name: keyof typeof FALLBACK): string {
  if (typeof window === "undefined") return FALLBACK[name];
  const cssName =
    name === "mutedForeground" ? "--muted-foreground" : `--${name}`;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(cssName)
    .trim();
  return v || FALLBACK[name];
}

function build(): ThemeTokens {
  const primary = read("primary");
  return {
    primary: `hsl(${primary})`,
    primaryAlpha: (a) => `hsl(${primary} / ${a})`,
    accent: `hsl(${read("accent")})`,
    border: `hsl(${read("border")})`,
    card: `hsl(${read("card")})`,
    foreground: `hsl(${read("foreground")})`,
    mutedForeground: `hsl(${read("mutedForeground")})`,
    negative: `hsl(${read("negative")})`,
    positive: `hsl(${read("positive")})`,
  };
}

export function useThemeTokens(): ThemeTokens {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick((t) => t + 1);
    const obs = new MutationObserver(() => setTick((t) => t + 1));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  return useMemo(build, [tick]);
}
