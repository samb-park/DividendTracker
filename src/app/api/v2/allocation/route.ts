import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getPrice, getFxRate } from "@/lib/price";
import {
  buildV2AllocationPlan,
  type V2Holding,
  type V2RedistributionRule,
  type V2ReserveEntry,
  type V2TargetEntry,
} from "@/lib/v2-allocation";

export const dynamic = "force-dynamic";

function toNum(d: unknown): number {
  if (d === null || d === undefined) return 0;
  if (typeof d === "number") return d;
  const s = typeof d === "string" ? d : (d as { toString(): string }).toString();
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uid = session.user.id;

  // 1. holdings + portfolios (for cash)
  const holdings = await prisma.holding.findMany({
    where: { quantity: { gt: 0 }, portfolio: { userId: uid } },
    select: {
      ticker: true,
      currency: true,
      quantity: true,
    },
  });

  // Aggregate by ticker (in case same ticker in multiple portfolios)
  const aggregated = new Map<string, { ticker: string; currency: "CAD" | "USD"; shares: number }>();
  for (const h of holdings) {
    const t = h.ticker.toUpperCase();
    const prev = aggregated.get(t);
    const shares = toNum(h.quantity);
    if (prev) {
      prev.shares += shares;
    } else {
      aggregated.set(t, { ticker: t, currency: h.currency as "CAD" | "USD", shares });
    }
  }

  // 2. settings
  const [settings, fx] = await Promise.all([
    prisma.setting.findMany({ where: { key: { startsWith: `${uid}:investment:` } } }),
    getFxRate(),
  ]);

  const targets: Record<string, V2TargetEntry> = {};
  const reserves: Record<string, V2ReserveEntry> = {};
  let contributionAmount = 0;
  let contributionCurrency: "CAD" | "USD" = "CAD";
  let redistribution: V2RedistributionRule = { rule: "shortfall_proportional" };

  const targetPrefix = `${uid}:investment:target:`;
  const reservePrefix = `${uid}:investment:reserve:`;
  const contributionKey = `${uid}:investment:contribution`;
  const redistributionKey = `${uid}:investment:redistribution_rule`;

  for (const s of settings) {
    try {
      if (s.key === contributionKey) {
        const c = JSON.parse(s.value) as { amount: number; currency: "CAD" | "USD" };
        contributionAmount = toNum(c.amount);
        contributionCurrency = c.currency;
      } else if (s.key === redistributionKey) {
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
      // skip malformed
    }
  }

  const fxRate = fx.rate;
  const contributionCAD =
    contributionCurrency === "USD" ? contributionAmount * fxRate : contributionAmount;

  // 3. fetch prices in parallel
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

  return NextResponse.json({
    ...result,
    fxFallback: fx.fallback,
    contributionCurrency,
    contributionAmount,
    lastComputedAt: new Date().toISOString(),
  });
}
