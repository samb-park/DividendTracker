// Shared server-side data fetcher for v2 pages and API routes.
import { prisma } from "@/lib/db";
import { getPrice, getFxRate } from "@/lib/price";
import {
  buildV2AllocationPlan,
  type V2AllocationResult,
  type V2Holding,
  type V2RedistributionRule,
  type V2ReserveEntry,
  type V2TargetEntry,
} from "@/lib/v2-allocation";

function toNum(d: unknown): number {
  if (d === null || d === undefined) return 0;
  if (typeof d === "number") return d;
  const s = typeof d === "string" ? d : (d as { toString(): string }).toString();
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export interface V2AllocationData extends V2AllocationResult {
  fxFallback: boolean;
  contributionAmount: number;
  contributionCurrency: "CAD" | "USD";
  contributionFrequency: "weekly" | "biweekly" | "monthly";
  redistribution: V2RedistributionRule;
  lastComputedAt: string;
}

export async function fetchV2Allocation(uid: string): Promise<V2AllocationData> {
  const [holdingsRaw, settings, fx] = await Promise.all([
    prisma.holding.findMany({
      where: { quantity: { gt: 0 }, portfolio: { userId: uid } },
      select: { ticker: true, currency: true, quantity: true },
    }),
    prisma.setting.findMany({ where: { key: { startsWith: `${uid}:investment:` } } }),
    getFxRate(),
  ]);

  const aggregated = new Map<string, { ticker: string; currency: "CAD" | "USD"; shares: number }>();
  for (const h of holdingsRaw) {
    const t = h.ticker.toUpperCase();
    const shares = toNum(h.quantity);
    const prev = aggregated.get(t);
    if (prev) prev.shares += shares;
    else aggregated.set(t, { ticker: t, currency: h.currency as "CAD" | "USD", shares });
  }

  const targets: Record<string, V2TargetEntry> = {};
  const reserves: Record<string, V2ReserveEntry> = {};
  let contributionAmount = 0;
  let contributionCurrency: "CAD" | "USD" = "CAD";
  let contributionFrequency: "weekly" | "biweekly" | "monthly" = "weekly";
  let redistribution: V2RedistributionRule = { rule: "shortfall_proportional" };

  const targetPrefix = `${uid}:investment:target:`;
  const reservePrefix = `${uid}:investment:reserve:`;
  const contributionKey = `${uid}:investment:contribution`;
  const redistributionKey = `${uid}:investment:redistribution_rule`;

  for (const s of settings) {
    try {
      if (s.key === contributionKey) {
        const c = JSON.parse(s.value) as {
          amount: number;
          currency: "CAD" | "USD";
          frequency?: "weekly" | "biweekly" | "monthly";
        };
        contributionAmount = toNum(c.amount);
        contributionCurrency = c.currency;
        if (c.frequency) contributionFrequency = c.frequency;
      } else if (s.key === redistributionKey) {
        const r = JSON.parse(s.value);
        if (r?.rule === "even") redistribution = { rule: "even" };
        else if (r?.rule === "priority")
          redistribution = {
            rule: "priority",
            priorityList: Array.isArray(r.priorityList) ? r.priorityList : [],
          };
        else redistribution = { rule: "shortfall_proportional" };
      } else if (s.key.startsWith(targetPrefix)) {
        const ticker = s.key.slice(targetPrefix.length).toUpperCase();
        targets[ticker] = JSON.parse(s.value);
      } else if (s.key.startsWith(reservePrefix)) {
        const ticker = s.key.slice(reservePrefix.length).toUpperCase();
        reserves[ticker] = JSON.parse(s.value);
      }
    } catch {
      // skip malformed settings
    }
  }

  const fxRate = fx.rate;
  // Convert weekly amount to CAD. If user picked biweekly/monthly we still compute "this period" amount.
  // For v2 we treat the stored amount as the amount per chosen frequency.
  // For allocation we use "this period" — UI labels it as Weekly Contribution but stores amount/currency.
  const contributionCAD =
    contributionCurrency === "USD" ? contributionAmount * fxRate : contributionAmount;

  const tickerList = Array.from(aggregated.keys());
  const priceResults = await Promise.all(
    tickerList.map(async (t) => {
      try {
        const p = await getPrice(t);
        return [t, p?.price ?? null] as const;
      } catch {
        return [t, null] as const;
      }
    }),
  );
  const priceMap = new Map<string, number | null>(priceResults);

  const v2Holdings: V2Holding[] = tickerList.map((t) => {
    const a = aggregated.get(t)!;
    return {
      ticker: t,
      currency: a.currency,
      shares: a.shares,
      price: priceMap.get(t) ?? null,
    };
  });

  const result = buildV2AllocationPlan({
    holdings: v2Holdings,
    targets,
    reserves,
    contributionCAD,
    fxRate,
    redistribution,
  });

  return {
    ...result,
    fxFallback: fx.fallback,
    contributionAmount,
    contributionCurrency,
    contributionFrequency,
    redistribution,
    lastComputedAt: new Date().toISOString(),
  };
}

export async function fetchV2Settings(uid: string) {
  const [settings, holdings] = await Promise.all([
    prisma.setting.findMany({ where: { key: { startsWith: `${uid}:investment:` } } }),
    prisma.holding.findMany({
      where: { quantity: { gt: 0 }, portfolio: { userId: uid } },
      select: { ticker: true },
      distinct: ["ticker"],
    }),
  ]);

  const targets: Record<string, V2TargetEntry> = {};
  const reserves: Record<string, V2ReserveEntry> = {};
  let contribution: { frequency: "weekly" | "biweekly" | "monthly"; amount: number; currency: "CAD" | "USD"; cashAvailableCAD?: number } | null = null;
  let redistribution: V2RedistributionRule = { rule: "shortfall_proportional" };

  const targetPrefix = `${uid}:investment:target:`;
  const reservePrefix = `${uid}:investment:reserve:`;

  for (const s of settings) {
    try {
      if (s.key === `${uid}:investment:contribution`) contribution = JSON.parse(s.value);
      else if (s.key === `${uid}:investment:redistribution_rule`) {
        const r = JSON.parse(s.value);
        if (r?.rule === "even") redistribution = { rule: "even" };
        else if (r?.rule === "priority")
          redistribution = { rule: "priority", priorityList: Array.isArray(r.priorityList) ? r.priorityList : [] };
        else redistribution = { rule: "shortfall_proportional" };
      } else if (s.key.startsWith(targetPrefix)) {
        const ticker = s.key.slice(targetPrefix.length).toUpperCase();
        targets[ticker] = JSON.parse(s.value);
      } else if (s.key.startsWith(reservePrefix)) {
        const ticker = s.key.slice(reservePrefix.length).toUpperCase();
        reserves[ticker] = JSON.parse(s.value);
      }
    } catch {
      // skip
    }
  }

  return {
    contribution,
    targets,
    reserves,
    redistribution,
    tickers: Array.from(new Set(holdings.map((h) => h.ticker.toUpperCase()))).sort(),
  };
}

export type V2SettingsData = Awaited<ReturnType<typeof fetchV2Settings>>;
