// v2 cockpit allocation logic. Independent of src/lib/investment-allocation.ts.
// All inputs are plain numbers; all CAD-normalized; all output is JSON-serializable.

export interface V2Holding {
  ticker: string;
  currency: "CAD" | "USD";
  shares: number;
  price: number | null;
  isCashEquivalent?: boolean;
}

export type NonCoreFrequency = "weekly" | "biweekly" | "monthly";

export interface V2NonCorePlan {
  frequency: NonCoreFrequency;
  cad: number;
}

export interface V2TargetEntry {
  pct: number;
  excluded?: boolean;
  /** When excluded=true, optional self-managed budget (frequency + CAD per period). Informational only — does NOT draw from the main weekly contribution. */
  nonCorePlan?: V2NonCorePlan;
}

export interface V2ReserveEntry {
  targetPct: number;
  plannedWeeklyCAD: number;
  active: boolean;
}

export type V2RedistributionRule =
  | { rule: "shortfall_proportional" }
  | { rule: "even" }
  | { rule: "priority"; priorityList: string[] };

export interface V2AllocationInput {
  holdings: V2Holding[];
  targets: Record<string, V2TargetEntry>;
  reserves: Record<string, V2ReserveEntry>;
  contributionCAD: number;
  fxRate: number;
  redistribution: V2RedistributionRule;
}

export interface V2NormalRow {
  ticker: string;
  currency: "CAD" | "USD";
  shares: number;
  priceLocal: number | null;
  valueCAD: number;
  currentPctOfNormal: number;
  rawTargetPct: number;
  normalizedTargetPct: number;
  suggestedContributionCAD: number;
  postValueCAD: number;
  postPctOfNormal: number;
  driftPct: number;
  postDriftPct: number;
  missingPrice: boolean;
}

export type V2ExcludedStatus = "below_target" | "at_target" | "above_target" | "inactive";

export interface V2ExcludedRow {
  ticker: string;
  currency: "CAD" | "USD";
  shares: number;
  priceLocal: number | null;
  valueCAD: number;
  currentReservePct: number;
  reserveTargetPct: number;
  /** @deprecated legacy field — Non-Core no longer draws from main contribution. Kept for backward-compat display. */
  plannedWeeklyCAD: number;
  /** @deprecated legacy field — kept for backward-compat. */
  active: boolean;
  /** @deprecated always 0 under Non-Core manual mode. */
  baseAllocCAD: number;
  /** @deprecated always 0 under Non-Core manual mode. */
  redistributedInCAD: number;
  /** @deprecated always 0 under Non-Core manual mode. */
  redistributedOutCAD: number;
  /** Always 0 for Non-Core (excluded) tickers under the new manual-budget model. */
  actualSuggestedCAD: number;
  /** @deprecated always empty under Non-Core manual mode. */
  reservedFromTickers: string[];
  /** @deprecated always empty under Non-Core manual mode. */
  reallocatedToTickers: string[];
  postValueCAD: number;
  postReservePct: number;
  status: V2ExcludedStatus;
  missingPrice: boolean;
  /** User-defined self-managed budget (frequency + CAD). Informational; not deployed from main contribution. */
  nonCorePlan?: V2NonCorePlan;
  /** True when legacy reserve config (plannedWeeklyCAD>0 / active=true) exists; signals UI to show a migration hint. */
  hasLegacyReserveConfig: boolean;
}

export interface V2AllocationResult {
  totalValueCAD: number;
  normalGroupValueCAD: number;
  excludedGroupValueCAD: number;
  postTotalValueCAD: number;
  postNormalGroupValueCAD: number;
  postExcludedGroupValueCAD: number;
  contributionCAD: number;
  fxRate: number;
  normalRows: V2NormalRow[];
  excludedRows: V2ExcludedRow[];
  excludedTotalAllocatedCAD: number;
  normalTotalAllocatedCAD: number;
  warnings: string[];
}

const EPS = 0.005;

function toCAD(h: V2Holding, fxRate: number): { value: number; missing: boolean } {
  if (h.price == null || !isFinite(h.price)) return { value: 0, missing: true };
  if (!isFinite(h.shares) || h.shares <= 0) return { value: 0, missing: false };
  const v = h.shares * h.price * (h.currency === "USD" ? fxRate : 1);
  return { value: v, missing: false };
}

function safeDiv(a: number, b: number): number {
  if (!isFinite(b) || Math.abs(b) <= EPS) return 0;
  return a / b;
}

function upper(t: string) {
  return t.toUpperCase();
}

export function buildV2AllocationPlan(input: V2AllocationInput): V2AllocationResult {
  const warnings: string[] = [];
  const fxRate = isFinite(input.fxRate) && input.fxRate > 0 ? input.fxRate : 1;
  if (input.fxRate !== fxRate) warnings.push(`fx rate invalid (${input.fxRate}), using 1.0`);
  const contributionCAD = Math.max(0, isFinite(input.contributionCAD) ? input.contributionCAD : 0);
  if (input.contributionCAD < 0) warnings.push("contribution is negative; treating as 0");

  // Step 1: classify
  type Classified = { h: V2Holding; valueCAD: number; missingPrice: boolean; isExcluded: boolean };
  const classified: Classified[] = input.holdings.map((h) => {
    const t = upper(h.ticker);
    const targetEntry = input.targets[t];
    const isExcluded = !!targetEntry?.excluded;
    const { value, missing } = toCAD(h, fxRate);
    if (missing) warnings.push(`missing price for ${t}`);
    return { h: { ...h, ticker: t }, valueCAD: value, missingPrice: missing, isExcluded };
  });

  const normalCls = classified.filter((c) => !c.isExcluded);
  const excludedCls = classified.filter((c) => c.isExcluded);

  // Step 2: totals
  const normalGroupValueCAD = normalCls.reduce((s, c) => s + c.valueCAD, 0);
  const excludedGroupValueCAD = excludedCls.reduce((s, c) => s + c.valueCAD, 0);
  const totalValueCAD = normalGroupValueCAD + excludedGroupValueCAD;

  // Step 3: classify excluded as Non-Core (manual budget mode).
  // Non-Core does NOT draw from the main weekly contribution — actualSuggestedCAD is always 0.
  // The legacy reserve config (plannedWeeklyCAD / active / redistribution) is preserved
  // in storage for backward compatibility but no longer flows into the contribution plan.
  const excAlloc: Record<string, number> = {};
  const excReserveTargetPct: Record<string, number> = {};
  const excPlannedCAD: Record<string, number> = {};
  const excActive: Record<string, boolean> = {};
  const excHasLegacy: Record<string, boolean> = {};
  for (const c of excludedCls) {
    const t = c.h.ticker;
    const r = input.reserves[t];
    const cfg: V2ReserveEntry = r
      ? { targetPct: r.targetPct, plannedWeeklyCAD: Math.max(0, r.plannedWeeklyCAD), active: !!r.active }
      : { targetPct: 0, plannedWeeklyCAD: 0, active: false };
    excAlloc[t] = 0;                           // Non-Core: no contribution allocation
    excReserveTargetPct[t] = cfg.targetPct;
    excPlannedCAD[t] = cfg.plannedWeeklyCAD;   // displayed only
    excActive[t] = cfg.active;                 // displayed only
    excHasLegacy[t] = cfg.active && cfg.plannedWeeklyCAD > 0;
  }

  if (excludedCls.some((c) => excHasLegacy[c.h.ticker])) {
    warnings.push("legacy reserve config detected — Non-Core no longer draws from main contribution. Move planned amounts to the per-asset Non-Core budget.");
  }

  const actualExcludedSum = 0;
  const normalContributionCAD = Math.max(0, contributionCAD);

  // Step 6: distribute normalContributionCAD among normal tickers
  const rawTargetSum = normalCls.reduce(
    (s, c) => s + (input.targets[c.h.ticker]?.pct ?? 0),
    0,
  );

  const normalAllocCAD: Record<string, number> = {};
  for (const c of normalCls) normalAllocCAD[c.h.ticker] = 0;

  let normalizedFactor = 1;
  if (rawTargetSum > EPS) {
    if (Math.abs(rawTargetSum - 100) > 0.5) {
      warnings.push(`normal targets sum to ${rawTargetSum.toFixed(2)}%, normalized to 100%`);
    }
    normalizedFactor = 100 / rawTargetSum;
  } else if (normalCls.length > 0 && normalContributionCAD > EPS) {
    warnings.push("no normal targets defined; normal contribution undeployed");
  }

  if (rawTargetSum > EPS && normalContributionCAD > EPS) {
    const postNormalGroupValueCAD = normalGroupValueCAD + normalContributionCAD;

    const shortfallCAD: Record<string, number> = {};
    let totalShortfall = 0;
    for (const c of normalCls) {
      const rawT = input.targets[c.h.ticker]?.pct ?? 0;
      const normalizedT = rawT * normalizedFactor;
      const targetCAD = (normalizedT / 100) * postNormalGroupValueCAD;
      const sf = Math.max(0, targetCAD - c.valueCAD);
      shortfallCAD[c.h.ticker] = sf;
      totalShortfall += sf;
    }

    if (totalShortfall > EPS) {
      for (const c of normalCls) {
        normalAllocCAD[c.h.ticker] = (shortfallCAD[c.h.ticker] / totalShortfall) * normalContributionCAD;
      }
    } else {
      // Fallback: all normal at/above target — distribute by normalized target ratio
      for (const c of normalCls) {
        const rawT = input.targets[c.h.ticker]?.pct ?? 0;
        const normalizedT = rawT * normalizedFactor;
        normalAllocCAD[c.h.ticker] = (normalizedT / 100) * normalContributionCAD;
      }
    }
  }

  // Step 7: build rows
  const postExcludedGroupValueCAD =
    excludedGroupValueCAD + Object.values(excAlloc).reduce((s, v) => s + v, 0);
  const postNormalGroupValueCAD =
    normalGroupValueCAD + Object.values(normalAllocCAD).reduce((s, v) => s + v, 0);
  const postTotalValueCAD = postNormalGroupValueCAD + postExcludedGroupValueCAD;

  const normalRows: V2NormalRow[] = normalCls.map((c) => {
    const t = c.h.ticker;
    const rawTargetPct = input.targets[t]?.pct ?? 0;
    const normalizedTargetPct = rawTargetSum > EPS ? rawTargetPct * normalizedFactor : rawTargetPct;
    const suggestedContributionCAD = normalAllocCAD[t] ?? 0;
    const postValueCAD = c.valueCAD + suggestedContributionCAD;
    const currentPctOfNormal = safeDiv(c.valueCAD, normalGroupValueCAD) * 100;
    const postPctOfNormal = safeDiv(postValueCAD, postNormalGroupValueCAD) * 100;
    return {
      ticker: t,
      currency: c.h.currency,
      shares: c.h.shares,
      priceLocal: c.h.price,
      valueCAD: c.valueCAD,
      currentPctOfNormal,
      rawTargetPct,
      normalizedTargetPct,
      suggestedContributionCAD,
      postValueCAD,
      postPctOfNormal,
      driftPct: currentPctOfNormal - normalizedTargetPct,
      postDriftPct: postPctOfNormal - normalizedTargetPct,
      missingPrice: c.missingPrice,
    };
  });

  const excludedRows: V2ExcludedRow[] = excludedCls.map((c) => {
    const t = c.h.ticker;
    const planned = excPlannedCAD[t] ?? 0;
    const reserveTargetPct = excReserveTargetPct[t] ?? 0;
    const currentReservePct = safeDiv(c.valueCAD, totalValueCAD) * 100;
    // Non-Core no longer receives main-contribution allocation, so post-value === current value.
    const postValueCAD = c.valueCAD;
    const postReservePct = safeDiv(postValueCAD, postTotalValueCAD) * 100;
    const targetEntry = input.targets[t];
    const nonCorePlan = targetEntry?.nonCorePlan
      ? { frequency: targetEntry.nonCorePlan.frequency, cad: targetEntry.nonCorePlan.cad }
      : undefined;

    let status: V2ExcludedStatus;
    if (currentReservePct > reserveTargetPct + 0.05) status = "above_target";
    else if (currentReservePct >= reserveTargetPct - 0.05) status = "at_target";
    else status = "below_target";

    return {
      ticker: t,
      currency: c.h.currency,
      shares: c.h.shares,
      priceLocal: c.h.price,
      valueCAD: c.valueCAD,
      currentReservePct,
      reserveTargetPct,
      plannedWeeklyCAD: planned,
      active: !!excActive[t],
      baseAllocCAD: 0,
      redistributedInCAD: 0,
      redistributedOutCAD: 0,
      actualSuggestedCAD: 0,
      reservedFromTickers: [],
      reallocatedToTickers: [],
      postValueCAD,
      postReservePct,
      status,
      missingPrice: c.missingPrice,
      nonCorePlan,
      hasLegacyReserveConfig: !!excHasLegacy[t],
    };
  });

  return {
    totalValueCAD,
    normalGroupValueCAD,
    excludedGroupValueCAD,
    postTotalValueCAD,
    postNormalGroupValueCAD,
    postExcludedGroupValueCAD,
    contributionCAD,
    fxRate,
    normalRows,
    excludedRows,
    excludedTotalAllocatedCAD: actualExcludedSum,
    normalTotalAllocatedCAD: Object.values(normalAllocCAD).reduce((s, v) => s + v, 0),
    warnings,
  };
}
