// v2 cockpit allocation logic. Independent of src/lib/investment-allocation.ts.
// All inputs are plain numbers; all CAD-normalized; all output is JSON-serializable.

export interface V2Holding {
  ticker: string;
  currency: "CAD" | "USD";
  shares: number;
  price: number | null;
  isCashEquivalent?: boolean;
}

export interface V2TargetEntry {
  pct: number;
  excluded?: boolean;
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
  plannedWeeklyCAD: number;
  active: boolean;
  baseAllocCAD: number;
  redistributedInCAD: number;
  redistributedOutCAD: number;
  actualSuggestedCAD: number;
  reservedFromTickers: string[];
  reallocatedToTickers: string[];
  postValueCAD: number;
  postReservePct: number;
  status: V2ExcludedStatus;
  missingPrice: boolean;
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

  // Step 3: per-excluded reserve allocation
  let overflowCAD = 0;
  const excAlloc: Record<string, number> = {};       // realized base alloc
  const excGapCAD: Record<string, number> = {};       // remaining gap (CAD) until target
  const excActive: Record<string, boolean> = {};
  const excReserveTargetPct: Record<string, number> = {};
  const excPlannedCAD: Record<string, number> = {};
  const reservedFromTickers: Record<string, string[]> = {};
  const reallocatedToTickers: Record<string, string[]> = {};

  for (const c of excludedCls) {
    reservedFromTickers[c.h.ticker] = [];
    reallocatedToTickers[c.h.ticker] = [];
    excAlloc[c.h.ticker] = 0;
  }

  // Validate reserve target sum (excluded ticker reserve targets are in % of total portfolio)
  const reserveTargetSum = excludedCls.reduce((s, c) => {
    const r = input.reserves[c.h.ticker];
    return s + (r?.targetPct ?? 0);
  }, 0);
  if (reserveTargetSum > 100 + EPS) {
    warnings.push(`reserve target sum (${reserveTargetSum.toFixed(2)}%) exceeds 100% of portfolio`);
  }

  // Compute base allocation per excluded ticker
  for (const c of excludedCls) {
    const t = c.h.ticker;
    const r = input.reserves[t];
    const cfg: V2ReserveEntry = r
      ? { targetPct: r.targetPct, plannedWeeklyCAD: Math.max(0, r.plannedWeeklyCAD), active: !!r.active }
      : { targetPct: 0, plannedWeeklyCAD: 0, active: false };
    excActive[t] = cfg.active;
    excReserveTargetPct[t] = cfg.targetPct;
    excPlannedCAD[t] = cfg.plannedWeeklyCAD;

    if (!cfg.active) {
      // inactive ticker: planned amount becomes overflow (note: usually 0 if user didn't set planned for inactive)
      overflowCAD += cfg.plannedWeeklyCAD;
      excGapCAD[t] = Math.max(0, (cfg.targetPct / 100) * totalValueCAD - c.valueCAD);
      continue;
    }

    const reserveTargetCAD = (cfg.targetPct / 100) * totalValueCAD;
    const gapCAD = Math.max(0, reserveTargetCAD - c.valueCAD);
    excGapCAD[t] = gapCAD;

    if (gapCAD <= EPS) {
      // already at/above target — full planned amount becomes overflow
      overflowCAD += cfg.plannedWeeklyCAD;
      excAlloc[t] = 0;
    } else {
      const take = Math.min(cfg.plannedWeeklyCAD, gapCAD);
      excAlloc[t] = take;
      overflowCAD += cfg.plannedWeeklyCAD - take;
    }
  }

  // Track which tickers contributed to overflow (for "reallocatedTo" trail)
  const overflowSourceTickers = excludedCls
    .filter((c) => {
      const t = c.h.ticker;
      const planned = excPlannedCAD[t] ?? 0;
      return planned > 0 && (excPlannedCAD[t] - excAlloc[t]) > EPS;
    })
    .map((c) => c.h.ticker);

  // Step 4: redistribute overflow within excluded group
  const remainingGap = (t: string) => Math.max(0, excGapCAD[t] - excAlloc[t]);

  let safetyCounter = 0;
  while (overflowCAD > EPS && safetyCounter++ < 20) {
    const underweight = excludedCls
      .map((c) => c.h.ticker)
      .filter((t) => excActive[t] && remainingGap(t) > EPS);

    if (underweight.length === 0) break;

    let progressed = false;

    if (input.redistribution.rule === "even") {
      const share = overflowCAD / underweight.length;
      for (const t of underweight) {
        const take = Math.min(share, remainingGap(t));
        if (take > EPS) {
          excAlloc[t] += take;
          overflowCAD -= take;
          progressed = true;
          for (const src of overflowSourceTickers) {
            if (src !== t && !reservedFromTickers[t].includes(src)) reservedFromTickers[t].push(src);
            if (src !== t && !reallocatedToTickers[src].includes(t)) reallocatedToTickers[src].push(t);
          }
        }
      }
    } else if (input.redistribution.rule === "priority") {
      const priorityList = input.redistribution.priorityList ?? [];
      const ordered = priorityList
        .map(upper)
        .filter((t) => underweight.includes(t))
        .concat(underweight.filter((t) => !priorityList.map(upper).includes(t)));
      for (const t of ordered) {
        if (overflowCAD <= EPS) break;
        const take = Math.min(overflowCAD, remainingGap(t));
        if (take > EPS) {
          excAlloc[t] += take;
          overflowCAD -= take;
          progressed = true;
          for (const src of overflowSourceTickers) {
            if (src !== t && !reservedFromTickers[t].includes(src)) reservedFromTickers[t].push(src);
            if (src !== t && !reallocatedToTickers[src].includes(t)) reallocatedToTickers[src].push(t);
          }
        }
      }
    } else {
      // shortfall_proportional (default)
      const totalRemainingGap = underweight.reduce((s, t) => s + remainingGap(t), 0);
      if (totalRemainingGap <= EPS) break;
      const snapshotOverflow = overflowCAD;
      for (const t of underweight) {
        const portion = (remainingGap(t) / totalRemainingGap) * snapshotOverflow;
        const take = Math.min(portion, remainingGap(t));
        if (take > EPS) {
          excAlloc[t] += take;
          overflowCAD -= take;
          progressed = true;
          for (const src of overflowSourceTickers) {
            if (src !== t && !reservedFromTickers[t].includes(src)) reservedFromTickers[t].push(src);
            if (src !== t && !reallocatedToTickers[src].includes(t)) reallocatedToTickers[src].push(t);
          }
        }
      }
    }

    if (!progressed) break;
  }

  // Step 5: scale-down if planned excluded sum exceeds contribution
  const plannedExcludedSum = excludedCls.reduce(
    (s, c) => s + (excActive[c.h.ticker] ? excPlannedCAD[c.h.ticker] : 0),
    0,
  );
  if (plannedExcludedSum > contributionCAD + EPS && plannedExcludedSum > EPS) {
    warnings.push(
      `planned excluded contributions (${plannedExcludedSum.toFixed(2)} CAD) exceed weekly total (${contributionCAD.toFixed(2)} CAD); scaling down`,
    );
    const scale = contributionCAD / plannedExcludedSum;
    for (const t of Object.keys(excAlloc)) {
      excAlloc[t] = excAlloc[t] * scale;
    }
    overflowCAD = 0;
  }

  const actualExcludedSum = Object.values(excAlloc).reduce((s, v) => s + v, 0);
  const normalContributionCAD = Math.max(0, contributionCAD - actualExcludedSum);

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
    const actual = excAlloc[t] ?? 0;
    const baseAlloc = excActive[t] ? Math.min(planned, Math.max(0, excGapCAD[t])) : 0;
    const redistributedIn = Math.max(0, actual - baseAlloc);
    const redistributedOut = Math.max(0, planned - actual);
    const reserveTargetPct = excReserveTargetPct[t] ?? 0;
    const currentReservePct = safeDiv(c.valueCAD, totalValueCAD) * 100;
    const postValueCAD = c.valueCAD + actual;
    const postReservePct = safeDiv(postValueCAD, postTotalValueCAD) * 100;

    let status: V2ExcludedStatus;
    if (!excActive[t]) status = "inactive";
    else if (currentReservePct > reserveTargetPct + 0.05) status = "above_target";
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
      baseAllocCAD: baseAlloc,
      redistributedInCAD: redistributedIn,
      redistributedOutCAD: redistributedOut,
      actualSuggestedCAD: actual,
      reservedFromTickers: reservedFromTickers[t] ?? [],
      reallocatedToTickers: reallocatedToTickers[t] ?? [],
      postValueCAD,
      postReservePct,
      status,
      missingPrice: c.missingPrice,
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
    normalTotalAllocatedCAD: normalContributionCAD - (overflowCAD > EPS ? overflowCAD : 0),
    warnings,
  };
}
