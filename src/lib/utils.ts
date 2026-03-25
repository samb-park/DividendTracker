import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Holding } from "./types";

export function mergeHoldings(portfolios: { holdings: Holding[] }[]): Holding[] {
  const map = new Map<string, Holding>();
  for (const p of portfolios) {
    for (const h of p.holdings) {
      const existing = map.get(h.ticker);
      if (existing) {
        const existingQty = existing.quantity != null ? parseFloat(existing.quantity) : 0;
        const existingCost = existing.avgCost != null ? parseFloat(existing.avgCost) : 0;
        const newQty = h.quantity != null ? parseFloat(h.quantity) : 0;
        const newCost = h.avgCost != null ? parseFloat(h.avgCost) : 0;
        const totalQty = existingQty + newQty;
        const weightedAvgCost = totalQty > 0
          ? (existingQty * existingCost + newQty * newCost) / totalQty
          : 0;
        map.set(h.ticker, {
          ...existing,
          allHoldingIds: [...(existing.allHoldingIds ?? [existing.id]), h.id],
          quantity: totalQty.toString(),
          avgCost: weightedAvgCost.toString(),
          transactions: [...(existing.transactions ?? []), ...(h.transactions ?? [])],
        });
      } else {
        map.set(h.ticker, { ...h, allHoldingIds: [h.id], transactions: [...(h.transactions ?? [])] });
      }
    }
  }
  return Array.from(map.values());
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-CA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export function fmtCurrency(n: number, currency: "USD" | "CAD" = "USD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

export function fmtPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
