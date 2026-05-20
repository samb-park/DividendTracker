export interface AllocationHolding {
  ticker: string;
  currency: "USD" | "CAD";
  marketValue: number;
  isCashEquivalent?: boolean;
}

export interface AllocationPreferences {
  excludeCashEquivalentsByDefault?: boolean;
  nearTargetTopPriorityPct?: number;
}

export interface AllocationContext extends AllocationHolding {
  currentValueCAD: number;
  currentPct: number;
  targetPct: number;
  gapPct: number;
  shortfallCAD: number;
  excluded: boolean;
}

export interface AllocationPlan {
  contexts: AllocationContext[];
  totalEligibleValueCAD: number;
  postTotalValueCAD: number;
  allocCADByTicker: Record<string, number>;
  gapCADByTicker: Record<string, number>;
  postPctByTicker: Record<string, number>;
}

const DEFAULT_NEAR_TARGET_TOP_PRIORITY = 70;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeNearTargetTopPriority(value?: number) {
  return clamp(value ?? DEFAULT_NEAR_TARGET_TOP_PRIORITY, 50, 100);
}

export function getAllocationPreferences(raw: unknown): Required<AllocationPreferences> {
  const source = (raw && typeof raw === "object") ? raw as AllocationPreferences : {};
  return {
    excludeCashEquivalentsByDefault: Boolean(source.excludeCashEquivalentsByDefault),
    nearTargetTopPriorityPct: normalizeNearTargetTopPriority(source.nearTargetTopPriorityPct),
  };
}

export function getEligibleHoldings<T extends { isCashEquivalent?: boolean }>(
  holdings: T[],
  excludeCashEquivalents: boolean
) {
  if (!excludeCashEquivalents) return holdings;
  return holdings.filter((holding) => !holding.isCashEquivalent);
}

export function buildAllocationPlan(params: {
  holdings: AllocationHolding[];
  investTargets: Record<string, number>;
  contributionCAD: number;
  fxRate: number;
  excludeCashEquivalents: boolean;
  excludedTickers?: string[];
  nearTargetTopPriorityPct?: number;
}): AllocationPlan {
  const {
    holdings,
    investTargets,
    contributionCAD,
    fxRate,
    excludeCashEquivalents,
    excludedTickers,
    nearTargetTopPriorityPct,
  } = params;
  const excludedSet = new Set(excludedTickers ?? []);

  normalizeNearTargetTopPriority(nearTargetTopPriorityPct);
  const totalEligibleValueCAD = holdings.reduce((sum, holding) => {
    if ((excludeCashEquivalents && holding.isCashEquivalent) || excludedSet.has(holding.ticker)) return sum;
    return sum + (holding.currency === "USD" ? holding.marketValue * fxRate : holding.marketValue);
  }, 0);
  const postTotalValueCAD = totalEligibleValueCAD + contributionCAD;

  const totalEligibleTargetPct = holdings.reduce((sum, holding) => {
    if ((excludeCashEquivalents && holding.isCashEquivalent) || excludedSet.has(holding.ticker)) return sum;
    return sum + (investTargets[holding.ticker] ?? 0);
  }, 0);

  const contexts: AllocationContext[] = holdings.map((holding) => {
    const currentValueCAD = holding.currency === "USD" ? holding.marketValue * fxRate : holding.marketValue;
    const excluded = Boolean((excludeCashEquivalents && holding.isCashEquivalent) || excludedSet.has(holding.ticker));
    const currentPct = !excluded && totalEligibleValueCAD > 0
      ? (currentValueCAD / totalEligibleValueCAD) * 100
      : 0;
    const rawTargetPct = investTargets[holding.ticker] ?? 0;
    const targetPct = !excluded && totalEligibleTargetPct > 0 && totalEligibleTargetPct !== 100
      ? (rawTargetPct / totalEligibleTargetPct) * 100
      : rawTargetPct;
    const gapPct = !excluded ? Math.max(0, targetPct - currentPct) : 0;
    const shortfallCAD = !excluded
      ? Math.max(0, postTotalValueCAD * (targetPct / 100) - currentValueCAD)
      : 0;
    return {
      ...holding,
      currentValueCAD,
      currentPct,
      targetPct,
      gapPct,
      shortfallCAD,
      excluded,
    };
  });

  const allocCADByTicker: Record<string, number> = {};
  const gapCADByTicker: Record<string, number> = {};
  const postPctByTicker: Record<string, number> = {};

  for (const context of contexts) {
    allocCADByTicker[context.ticker] = 0;
    gapCADByTicker[context.ticker] = context.shortfallCAD;
    postPctByTicker[context.ticker] = !context.excluded && postTotalValueCAD > 0
      ? (context.currentValueCAD / postTotalValueCAD) * 100
      : 0;
  }

  if (contributionCAD <= 0) {
    return { contexts, totalEligibleValueCAD, postTotalValueCAD, allocCADByTicker, gapCADByTicker, postPctByTicker };
  }

  // shortfall 비례 분배
  const totalShortfall = contexts.reduce(
    (sum, c) => sum + (c.excluded ? 0 : c.shortfallCAD),
    0
  );
  if (totalShortfall > 0) {
    for (const context of contexts) {
      if (!context.excluded && context.shortfallCAD > 0) {
        allocCADByTicker[context.ticker] = (context.shortfallCAD / totalShortfall) * contributionCAD;
      }
    }
  }

  for (const context of contexts) {
    const allocCAD = allocCADByTicker[context.ticker] ?? 0;
    postPctByTicker[context.ticker] = !context.excluded && postTotalValueCAD > 0
      ? ((context.currentValueCAD + allocCAD) / postTotalValueCAD) * 100
      : 0;
  }

  return { contexts, totalEligibleValueCAD, postTotalValueCAD, allocCADByTicker, gapCADByTicker, postPctByTicker };
}
