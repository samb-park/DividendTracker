// SANGBONG INVESTMENT RULEBOOK v4.1.10 calculation helpers.
// Pure functions; all CAD-normalized inputs; all output is JSON-serializable.
//
// Rule references (v4.1.10):
//  - Core         = SCHD + QLD (excluding SGOV, IAUM, TQQQ)
//  - QLD weight   = QLD / (SCHD + QLD)            ← Core basis
//  - Growth bucket= (QLD + TQQQ) / TotalPortfolio ← Total basis
//  - SGOV weight  = SGOV / TotalPortfolio         ← Total basis (target 8%, crisis floor 5%)
//  - IAUM weight  = IAUM / TotalPortfolio         ← Total basis (cap 5%)
//  - Scenarios    : Base 6%, Pessimistic 4%, Worst 2%  (no optimistic)
//  - TQQQ         : Overlay-only (per §15). Starts at 0; bought via §6.1 crisis trigger, sold via §6.2 exit ladder.

export const RULEBOOK_TICKERS = {
  CORE: ["SCHD", "QLD"] as const,
  RESERVE: ["SGOV", "IAUM"] as const,
  OVERLAY: ["TQQQ"] as const,
} as const;

/** True when the ticker is a Non-Core (reserve) asset such as SGOV or IAUM. */
export function isNonCoreTicker(ticker: string): boolean {
  const t = (ticker ?? "").toUpperCase();
  return (RULEBOOK_TICKERS.RESERVE as readonly string[]).includes(t);
}

export const RULEBOOK_TARGETS = {
  SCHD_OF_CORE_PCT: 70,
  QLD_OF_CORE_PCT:  30,
  // §5 annual rebalance deadband
  REBAL_HIGH_PCT: 31,   // W > 31% → Case A
  REBAL_LOW_PCT:  29,   // W < 29% AND TQQQ=0 → Case B
  // §6.1 crisis triggers (core basis)
  CRISIS_T1_PCT: 25,    // core W ≤ 25% → 2.5% total → TQQQ
  CRISIS_T2_PCT: 20,    // core W ≤ 20% → additional 2.5% total → TQQQ
  CRISIS_T1_BUY_PCT_OF_TOTAL: 2.5,
  CRISIS_T2_BUY_PCT_OF_TOTAL: 2.5,
  CYCLE_RESET_GROWTH_BUCKET_PCT: 30,  // TQQQ=0 AND growth bucket ≥ 30% → cycle re-armed
  // §6.2 TQQQ exit ladder (growth-bucket basis)
  SOFT_EXIT_GROWTH_BUCKET_PCT: 34,    // sell HALF of TQQQ
  HARD_EXIT_GROWTH_BUCKET_PCT: 38,    // sell ALL TQQQ + QLD to 30%
  // SGOV
  SGOV_TARGET_PCT: 8,                 // §8 normal target / Soft & Hard Exit refill ceiling
  SGOV_FLOOR_PCT:  5,                 // §8 crisis floor — only §6.1 may pierce
  // IAUM
  IAUM_MAX_PCT: 5,
  // Weekly contributions ([3])
  IAUM_WEEKLY_BUY_CAD: 25,
  SGOV_WEEKLY_REFILL_CAD: 50,
  CORE_WEEKLY_CAD: 350,
} as const;

export const RULEBOOK_SCENARIOS = [
  { id: "base",        label: "BASE",        cagrPct: 6 },
  { id: "pessimistic", label: "PESSIMISTIC", cagrPct: 4 },
  { id: "worst",       label: "WORST",       cagrPct: 2 },
] as const;

export type RulebookScenarioId = typeof RULEBOOK_SCENARIOS[number]["id"];

export interface RulebookHoldingValue {
  ticker: string;
  valueCAD: number;
}

export interface RulebookWeights {
  totalCAD: number;
  coreCAD: number;             // SCHD + QLD
  schdCAD: number;
  qldCAD: number;
  sgovCAD: number;
  iaumCAD: number;
  tqqqCAD: number;             // overlay asset; 0 when no holding
  // Core basis
  qldCoreWeightPct: number;    // QLD / (SCHD + QLD) × 100
  schdCoreWeightPct: number;
  // Total basis
  growthBucketPct: number;     // (QLD + TQQQ) / Total × 100
  sgovTotalWeightPct: number;
  iaumTotalWeightPct: number;
  tqqqTotalWeightPct: number;
  // Trigger flags
  inDeadband: boolean;          // 29 ≤ QLD core W ≤ 31 → no annual rebal action
  caseAEligible: boolean;       // QLD core W > 31 (regardless of overlay)
  caseBEligible: boolean;       // QLD core W < 29 AND TQQQ = 0
  hardExit: boolean;            // growth bucket ≥ 38
  softExit: boolean;            // growth bucket ≥ 34 (and not hard)
  crisisT1: boolean;            // 20 < core W ≤ 25
  crisisT2: boolean;            // core W ≤ 20
  cycleArmable: boolean;        // TQQQ=0 AND growth bucket ≥ 30  (cycle reset condition met)
  sgovBelowTarget: boolean;     // SGOV total W < 8
  sgovBelowFloor: boolean;      // SGOV total W < 5  (warning state)
  iaumAtCap: boolean;
}

function pct(numerator: number, denominator: number): number {
  if (!isFinite(denominator) || denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function findValue(holdings: RulebookHoldingValue[], ticker: string): number {
  const t = ticker.toUpperCase();
  return holdings
    .filter(h => h.ticker.toUpperCase() === t)
    .reduce((sum, h) => sum + (isFinite(h.valueCAD) ? h.valueCAD : 0), 0);
}

export function computeRulebookWeights(holdings: RulebookHoldingValue[]): RulebookWeights {
  const schdCAD = findValue(holdings, "SCHD");
  const qldCAD  = findValue(holdings, "QLD");
  const sgovCAD = findValue(holdings, "SGOV");
  const iaumCAD = findValue(holdings, "IAUM");
  const tqqqCAD = findValue(holdings, "TQQQ");
  const allCAD  = holdings.reduce((s, h) => s + (isFinite(h.valueCAD) ? h.valueCAD : 0), 0);
  const coreCAD = schdCAD + qldCAD;

  const qldCoreWeightPct  = pct(qldCAD, coreCAD);
  const schdCoreWeightPct = pct(schdCAD, coreCAD);
  const growthBucketPct   = pct(qldCAD + tqqqCAD, allCAD);
  const sgovTotalWeightPct = pct(sgovCAD, allCAD);
  const iaumTotalWeightPct = pct(iaumCAD, allCAD);
  const tqqqTotalWeightPct = pct(tqqqCAD, allCAD);

  const hardExit = growthBucketPct >= RULEBOOK_TARGETS.HARD_EXIT_GROWTH_BUCKET_PCT;
  const softExit = !hardExit && growthBucketPct >= RULEBOOK_TARGETS.SOFT_EXIT_GROWTH_BUCKET_PCT;
  const crisisT2 = qldCoreWeightPct <= RULEBOOK_TARGETS.CRISIS_T2_PCT && coreCAD > 0;
  const crisisT1 = !crisisT2
    && qldCoreWeightPct <= RULEBOOK_TARGETS.CRISIS_T1_PCT
    && coreCAD > 0;
  // FP-safe boundaries: at SCHD=71 / QLD=29 the calc yields 28.9999…, which
  // silently flipped Case B true and deadband false in v4.1.10 pre-fix. Use a
  // 1e-9 tolerance for the inclusive deadband bounds.
  const FP_EPS = 1e-9;
  const inDeadband =
    coreCAD > 0
    && qldCoreWeightPct >= RULEBOOK_TARGETS.REBAL_LOW_PCT - FP_EPS
    && qldCoreWeightPct <= RULEBOOK_TARGETS.REBAL_HIGH_PCT + FP_EPS;
  const caseAEligible = coreCAD > 0
    && qldCoreWeightPct > RULEBOOK_TARGETS.REBAL_HIGH_PCT + FP_EPS;
  const caseBEligible =
    coreCAD > 0
    && qldCoreWeightPct < RULEBOOK_TARGETS.REBAL_LOW_PCT - FP_EPS
    && tqqqCAD <= 0;
  const cycleArmable =
    tqqqCAD <= 0
    && growthBucketPct >= RULEBOOK_TARGETS.CYCLE_RESET_GROWTH_BUCKET_PCT;

  return {
    totalCAD: allCAD,
    coreCAD,
    schdCAD,
    qldCAD,
    sgovCAD,
    iaumCAD,
    tqqqCAD,
    qldCoreWeightPct,
    schdCoreWeightPct,
    growthBucketPct,
    sgovTotalWeightPct,
    iaumTotalWeightPct,
    tqqqTotalWeightPct,
    inDeadband,
    caseAEligible,
    caseBEligible,
    hardExit,
    softExit,
    crisisT1,
    crisisT2,
    cycleArmable,
    sgovBelowTarget: sgovTotalWeightPct < RULEBOOK_TARGETS.SGOV_TARGET_PCT,
    sgovBelowFloor:  sgovTotalWeightPct < RULEBOOK_TARGETS.SGOV_FLOOR_PCT,
    iaumAtCap:       iaumTotalWeightPct >= RULEBOOK_TARGETS.IAUM_MAX_PCT,
  };
}

// ── Method B (no-sell) Core allocation ───────────────────────────────────────
export interface MethodBAllocation {
  contributionCAD: number;
  schdValueCAD: number;
  qldValueCAD: number;
  targetCoreCAD: number;
  targetSchdCAD: number;
  targetQldCAD: number;
  schdShortCAD: number;        // never negative (no-sell)
  qldShortCAD: number;         // never negative (no-sell)
  schdBuyCAD: number;
  qldBuyCAD: number;
  unallocatedCAD: number;      // when both at/above target → carries to next week
}

export function computeMethodBAllocation(
  schdValueCAD: number,
  qldValueCAD: number,
  contributionCAD: number,
): MethodBAllocation {
  const C = Math.max(0, isFinite(contributionCAD) ? contributionCAD : 0);
  const S = Math.max(0, isFinite(schdValueCAD) ? schdValueCAD : 0);
  const Q = Math.max(0, isFinite(qldValueCAD) ? qldValueCAD : 0);
  const targetCore = S + Q + C;
  const targetSchd = (RULEBOOK_TARGETS.SCHD_OF_CORE_PCT / 100) * targetCore;
  const targetQld  = (RULEBOOK_TARGETS.QLD_OF_CORE_PCT  / 100) * targetCore;
  const schdShort = Math.max(0, targetSchd - S);   // no-sell clamp
  const qldShort  = Math.max(0, targetQld  - Q);
  const totalShort = schdShort + qldShort;

  let schdBuy = 0;
  let qldBuy = 0;
  let unallocated = 0;

  if (totalShort <= 0 || C <= 0) {
    unallocated = C;
  } else if (totalShort >= C) {
    // proportional shortfall
    schdBuy = (schdShort / totalShort) * C;
    qldBuy  = (qldShort  / totalShort) * C;
  } else {
    // contribution exceeds total shortfall — fill shortfalls, leave the rest unallocated
    schdBuy = schdShort;
    qldBuy  = qldShort;
    unallocated = C - totalShort;
  }

  return {
    contributionCAD: C,
    schdValueCAD: S,
    qldValueCAD: Q,
    targetCoreCAD: targetCore,
    targetSchdCAD: targetSchd,
    targetQldCAD:  targetQld,
    schdShortCAD: schdShort,
    qldShortCAD:  qldShort,
    schdBuyCAD: schdBuy,
    qldBuyCAD:  qldBuy,
    unallocatedCAD: unallocated,
  };
}

// ── §6.2 Soft Exit — growth bucket ≥ 34% → sell HALF of TQQQ ─────────────────
// Proceeds order (rulebook [6.2]):
//   1) SGOV refill up to 8% of total
//   2) remainder → SCHD
// SCHD is never sold.
export interface TqqqExitPlan {
  active: boolean;
  tqqqSaleCAD: number;
  qldSaleCAD: number;          // 0 for Soft, > 0 for Hard
  sgovRefillCAD: number;
  schdBuyCAD: number;
  postGrowthBucketPct: number;
}

export function computeTqqqSoftExitPlan(args: {
  schdCAD: number;
  qldCAD: number;
  tqqqCAD: number;
  sgovCAD: number;
  totalCAD: number;
  softExit: boolean;
}): TqqqExitPlan {
  const inactive: TqqqExitPlan = {
    active: false, tqqqSaleCAD: 0, qldSaleCAD: 0, sgovRefillCAD: 0, schdBuyCAD: 0, postGrowthBucketPct: 0,
  };
  if (!args.softExit || args.tqqqCAD <= 0) return inactive;
  const sale = args.tqqqCAD / 2;
  const sgovGap = Math.max(0, (RULEBOOK_TARGETS.SGOV_TARGET_PCT / 100) * args.totalCAD - args.sgovCAD);
  const sgovRefill = Math.min(sale, sgovGap);
  const schdBuy = Math.max(0, sale - sgovRefill);
  const postTqqq = args.tqqqCAD - sale;
  const postTotal = args.totalCAD;  // proceeds reinvested → total unchanged
  const postGrowthBucketPct = postTotal > 0 ? ((args.qldCAD + postTqqq) / postTotal) * 100 : 0;
  return { active: true, tqqqSaleCAD: sale, qldSaleCAD: 0, sgovRefillCAD: sgovRefill, schdBuyCAD: schdBuy, postGrowthBucketPct };
}

// ── §6.2 Hard Exit — growth bucket ≥ 38% → all TQQQ + QLD to 30% core ───────
// Sequence (rulebook [6.2]):
//   1) Sell all TQQQ
//   2) Sell QLD down to 30% of core
//   3) Refill SGOV to 8% of total (combined proceeds)
//   4) Remainder → SCHD
// SCHD never sold. With TQQQ=0 this degrades to a Case-A-style QLD unwind.
export function computeTqqqHardExitPlan(args: {
  schdCAD: number;
  qldCAD: number;
  tqqqCAD: number;
  sgovCAD: number;
  totalCAD: number;
  hardExit: boolean;
}): TqqqExitPlan {
  const inactive: TqqqExitPlan = {
    active: false, tqqqSaleCAD: 0, qldSaleCAD: 0, sgovRefillCAD: 0, schdBuyCAD: 0, postGrowthBucketPct: 0,
  };
  if (!args.hardExit) return inactive;

  const tqqqSale = Math.max(0, args.tqqqCAD);
  const coreCAD = args.schdCAD + args.qldCAD;
  const targetRatio = RULEBOOK_TARGETS.QLD_OF_CORE_PCT / 100;
  // (Q - x) / (Core - x) = 0.30 → x = (Q - 0.30·Core) / 0.70
  const qldSale = Math.max(0, (args.qldCAD - targetRatio * coreCAD) / (1 - targetRatio));

  const proceeds = tqqqSale + qldSale;
  if (proceeds <= 0) return inactive;

  const sgovTargetCAD = (RULEBOOK_TARGETS.SGOV_TARGET_PCT / 100) * Math.max(0, args.totalCAD);
  const sgovGap = Math.max(0, sgovTargetCAD - Math.max(0, args.sgovCAD));
  const sgovRefill = Math.min(proceeds, sgovGap);
  const schdBuy = Math.max(0, proceeds - sgovRefill);

  // Post-state: TQQQ=0, QLD reduced, SGOV refilled inside total (no total change).
  const postTqqq = 0;
  const postQld = args.qldCAD - qldSale;
  const postTotal = args.totalCAD;
  const postGrowthBucketPct = postTotal > 0 ? ((postQld + postTqqq) / postTotal) * 100 : 0;

  return { active: true, tqqqSaleCAD: tqqqSale, qldSaleCAD: qldSale, sgovRefillCAD: sgovRefill, schdBuyCAD: schdBuy, postGrowthBucketPct };
}

// ── §6.1 Crisis Trigger — buy TQQQ with SGOV proceeds ────────────────────────
// Tier sizes (rulebook [6.1]):
//   T1 (core W ≤ 25%) : 2.5% of total → TQQQ
//   T2 (core W ≤ 20%) : additional 2.5% → TQQQ (cumulative 5% when both fire same day)
// Cycle gating: each tier may only fire once per cycle. Cycle resets when
//   TQQQ=0 AND growth bucket ≥ 30% (caller passes `cycleArmed`).
// SCHD never sold. Crisis is the ONLY mechanism that may pierce SGOV 5% floor.
export interface CrisisTriggerPlan {
  active: boolean;
  tier: "T1" | "T2" | null;
  sgovSaleCAD: number;
  tqqqBuyCAD: number;
  postSgovTotalWeightPct: number;
  reason: string;
}

export function computeCrisisTriggerPlan(args: {
  totalCAD: number;
  sgovCAD: number;
  crisisT1: boolean;
  crisisT2: boolean;
  cycleArmed: boolean;
  tqqqCAD: number;
}): CrisisTriggerPlan {
  const inactive = (reason: string): CrisisTriggerPlan => ({
    active: false, tier: null, sgovSaleCAD: 0, tqqqBuyCAD: 0, postSgovTotalWeightPct: 0, reason,
  });
  if (!args.crisisT1 && !args.crisisT2) return inactive("no-crisis");
  if (!args.cycleArmed) return inactive("cycle-not-armed");

  const tierPctTotal = args.crisisT2
    ? (RULEBOOK_TARGETS.CRISIS_T1_BUY_PCT_OF_TOTAL + RULEBOOK_TARGETS.CRISIS_T2_BUY_PCT_OF_TOTAL)
    : RULEBOOK_TARGETS.CRISIS_T1_BUY_PCT_OF_TOTAL;
  const requested = (tierPctTotal / 100) * Math.max(0, args.totalCAD);
  const sgovSale  = Math.min(Math.max(0, args.sgovCAD), requested);
  const tqqqBuy   = sgovSale;
  const postSgov  = args.sgovCAD - sgovSale;
  const postTotal = args.totalCAD;  // proceeds chained → total unchanged
  const postSgovPct = postTotal > 0 ? (postSgov / postTotal) * 100 : 0;
  return {
    active: sgovSale > 0,
    tier: args.crisisT2 ? "T2" : "T1",
    sgovSaleCAD: sgovSale,
    tqqqBuyCAD: tqqqBuy,
    postSgovTotalWeightPct: postSgovPct,
    reason: sgovSale > 0 ? "applied" : "sgov-empty",
  };
}

// ── §5 Annual Rebalance (Dec 31) — bidirectional with ±1% deadband ──────────
// Case A: W > 31  → QLD sale to 30% (same proceeds order as Hard Exit but TQQQ untouched).
// Case B: W < 29 AND TQQQ = 0 → SGOV → QLD, capped by SGOV 5% floor.
//   E_under  = 0.30·(S+Q) − Q
//   X_need   = E_under / 0.70
//   X_avail  = max(0, SGOV − 0.05·Total)
//   X        = min(X_need, X_avail)
// Deadband (29 ≤ W ≤ 31): no action.
export interface AnnualRebalancePlan {
  action: "deadband" | "case_a" | "case_b" | "case_b_no_room";
  qldSaleCAD: number;
  qldBuyCAD: number;
  sgovDeltaCAD: number;     // + = refill (Case A), − = drain (Case B)
  schdBuyCAD: number;
  postQldCoreWeightPct: number;
}

export function computeAnnualRebalancePlan(args: {
  schdCAD: number;
  qldCAD: number;
  tqqqCAD: number;
  sgovCAD: number;
  totalCAD: number;
  caseAEligible: boolean;
  caseBEligible: boolean;
}): AnnualRebalancePlan {
  const coreCAD = args.schdCAD + args.qldCAD;
  const noop: AnnualRebalancePlan = {
    action: "deadband", qldSaleCAD: 0, qldBuyCAD: 0, sgovDeltaCAD: 0, schdBuyCAD: 0,
    postQldCoreWeightPct: coreCAD > 0 ? (args.qldCAD / coreCAD) * 100 : 0,
  };
  if (!args.caseAEligible && !args.caseBEligible) return noop;

  if (args.caseAEligible) {
    const targetRatio = RULEBOOK_TARGETS.QLD_OF_CORE_PCT / 100;
    const qldSale = Math.max(0, (args.qldCAD - targetRatio * coreCAD) / (1 - targetRatio));
    if (qldSale <= 0) return { ...noop, action: "deadband" };
    const sgovTargetCAD = (RULEBOOK_TARGETS.SGOV_TARGET_PCT / 100) * Math.max(0, args.totalCAD);
    const sgovGap = Math.max(0, sgovTargetCAD - Math.max(0, args.sgovCAD));
    const sgovRefill = Math.min(qldSale, sgovGap);
    const schdBuy = Math.max(0, qldSale - sgovRefill);
    const postQld = args.qldCAD - qldSale;
    const postCore = coreCAD - sgovRefill;
    return {
      action: "case_a",
      qldSaleCAD: qldSale,
      qldBuyCAD: 0,
      sgovDeltaCAD: sgovRefill,
      schdBuyCAD: schdBuy,
      postQldCoreWeightPct: postCore > 0 ? (postQld / postCore) * 100 : 0,
    };
  }

  // Case B
  const eUnder = Math.max(0, (RULEBOOK_TARGETS.QLD_OF_CORE_PCT / 100) * coreCAD - args.qldCAD);
  if (eUnder <= 0) return noop;
  const xNeed = eUnder / (1 - RULEBOOK_TARGETS.QLD_OF_CORE_PCT / 100);
  const sgovFloorCAD = (RULEBOOK_TARGETS.SGOV_FLOOR_PCT / 100) * Math.max(0, args.totalCAD);
  const xAvail = Math.max(0, args.sgovCAD - sgovFloorCAD);
  if (xAvail <= 0) return { ...noop, action: "case_b_no_room" };
  const x = Math.min(xNeed, xAvail);
  const postQld = args.qldCAD + x;
  const postCore = coreCAD + x;  // SGOV moves into core
  return {
    action: "case_b",
    qldSaleCAD: 0,
    qldBuyCAD: x,
    sgovDeltaCAD: -x,
    schdBuyCAD: 0,
    postQldCoreWeightPct: postCore > 0 ? (postQld / postCore) * 100 : 0,
  };
}

// ── §7 IAUM weekly buy (carve-out from weekly contribution) ─────────────────
// Rule: 주간 25 CAD, 단 (TFSA room 존재) AND (IAUM < 5% of total) 일 때만.
// 조건 미충족이면 25 CAD는 IAUM이 아니라 Core Method B로 redirect.
// IAUM은 forced allocation이 아니므로 5% 보정 매수도 절대 금지.
export interface IaumWeeklyPlan {
  iaumBuyCAD: number;          // 0 또는 25
  redirectedToCoreCAD: number; // IAUM 미적용 시 25 (Method B로 재투입)
  reason: string;              // 한국어 사유 ("적용" / "TFSA room 없음" / "IAUM ≥ 5%")
  tfsaRoomExists: boolean;
  iaumBelowCap: boolean;
}

export function computeIaumWeeklyPlan(
  tfsaRoomExists: boolean,
  iaumTotalWeightPct: number,
): IaumWeeklyPlan {
  const cap = RULEBOOK_TARGETS.IAUM_WEEKLY_BUY_CAD;
  const iaumBelowCap = iaumTotalWeightPct < RULEBOOK_TARGETS.IAUM_MAX_PCT;
  const conditionsMet = tfsaRoomExists && iaumBelowCap;
  let reason = "적용";
  if (!tfsaRoomExists) reason = "TFSA 잔여한도 없음 → Method B로 재투입";
  else if (!iaumBelowCap) reason = "IAUM 전체 비중 ≥ 5% (상한 도달) → Method B로 재투입";
  return {
    iaumBuyCAD:           conditionsMet ? cap : 0,
    redirectedToCoreCAD:  conditionsMet ? 0   : cap,
    reason,
    tfsaRoomExists,
    iaumBelowCap,
  };
}

// ── Three-scenario forward projection (rulebook-fixed CAGR) ──────────────────
export interface ProjectionYearPoint {
  year: number;
  yearsFromNow: number;
  portfolioCAD: number;
  annualDivCAD: number;
  monthlyDivCAD: number;
  totalContribCAD: number;
}

export interface ProjectionScenario {
  id: RulebookScenarioId;
  label: string;
  cagrPct: number;
  points: ProjectionYearPoint[];
}

// ── Rulebook-based per-asset projection (v2) ───────────────────────────────────
// Year-by-year simulation that actually applies §5 Method B, §6 SGOV refill,
// §7 IAUM gating, §10 emergency cap, §9 annual rebalance, and the age-65
// IAUM exit. Per-asset CAD evolves over time so that QLD core weight, SGOV
// total weight, and IAUM total weight can be tracked against the rulebook
// thresholds in every projected year.
//
// Per-asset CAGR model (assumption — document as 모델 한계):
//   SCHD CAGR = scenario CAGR (0.06 / 0.04 / 0.02)
//   QLD  CAGR = scenario CAGR × 1.5 (rough leverage proxy; 2x daily-reset decays)
//   SGOV CAGR = 0.04 (T-bill / cash-equivalent)
//   IAUM CAGR = 0.02 (long-term real gold)
//
// Yields (annual dividend / price) for each asset are caller-provided, then
// SCHD yield grows by safeDivGrowth each year (dividend growth assumption).
// QLD / SGOV / IAUM yields stay flat in this simple model.
export interface ProjectionStartStateV2 {
  schdCAD: number;
  qldCAD: number;
  sgovCAD: number;
  iaumCAD: number;
  schdYieldPct: number;   // e.g. 3.5
  qldYieldPct: number;    // e.g. 0.5
  sgovYieldPct: number;   // e.g. 4.5
  // IAUM yield = 0 (gold pays no dividend)
}

export interface ProjectionInputV2 {
  start: ProjectionStartStateV2;
  /** Plan amount (Core only) per week, CAD. Distributed via Method B to SCHD/QLD. */
  coreWeeklyCAD: number;
  /** Settings nonCorePlan.cad for SGOV (per Plan period). 0 if not set. */
  sgovWeeklyCAD: number;
  /** Settings nonCorePlan.cad for IAUM (per Plan period). 0 if not set. */
  iaumWeeklyCAD: number;
  /** Whether TFSA room remains; assumed constant for projection horizon (model 한계). */
  tfsaRoomExists: boolean;
  /** User's current age, for age-65 IAUM exit. Null → no exit modelled. */
  currentAge: number | null;
  /** Annual dividend growth rate %, capped 0-20. */
  divGrowthPct: number;
  /** Years-from-now to surface in the output table (e.g. [1, 5, 10, 20]). */
  yearPoints: number[];
  /** Maximum projection horizon in years. */
  maxYears: number;
  // ── Optional refinements (defaults match prior behaviour) ────────────────
  /** When SGOV/IAUM gating fails, redirect that contribution into Core Method B. Default: true (rulebook §7). */
  redirectGatedToCore?: boolean;
  /** Effective dividend-growth factor applied to QLD yield each year (multiplied by safeDivGrowth). Default 0.5. */
  qldDivGrowthFactor?: number;
  /** DCA timing factor for new contributions: 0 = end-of-year (no growth), 0.5 = mid-year average, 1 = start-of-year (full growth). Default 0.5. */
  dcaContributionFactor?: number;
  /** Withholding tax % to subtract from annualDiv for net-of-tax display. Default 0 (gross). 15 = typical US-ETF in TFSA. */
  taxWithholdPct?: number;
}

export interface ProjectionYearPointV2 {
  year: number;
  yearsFromNow: number;
  schdCAD: number;
  qldCAD: number;
  sgovCAD: number;
  iaumCAD: number;
  totalCAD: number;
  qldCoreWeightPct: number;
  sgovTotalWeightPct: number;
  iaumTotalWeightPct: number;
  /** Net-of-withholding-tax annual dividend (taxWithholdPct subtracted). */
  annualDivCAD: number;
  /** Gross annual dividend (before withholding tax). */
  annualDivGrossCAD: number;
  monthlyDivCAD: number;
  totalContribCAD: number;
  emergencyCapApplied: boolean;
  annualRebalanceApplied: boolean;
  iaumExited: boolean;
}

export interface ProjectionScenarioV2 {
  id: RulebookScenarioId;
  label: string;
  cagrPct: number;
  points: ProjectionYearPointV2[];
  /** Total times each rulebook trigger fired across the horizon. */
  triggerCounts: {
    emergencyCap: number;
    annualRebalance: number;
    iaumExited: boolean;
  };
}

const SGOV_FIXED_CAGR = 0.04;
const IAUM_FIXED_CAGR = 0.02;
const QLD_LEVERAGE_FACTOR = 1.5;

export function projectScenariosRulebook(input: ProjectionInputV2): ProjectionScenarioV2[] {
  const startYear = new Date().getFullYear();
  const safeDivGrowth = Math.max(0, Math.min(20, input.divGrowthPct)) / 100;
  const yearPointsClean = Array.from(new Set(
    input.yearPoints.filter(y => Number.isFinite(y) && y > 0 && y <= input.maxYears),
  )).sort((a, b) => a - b);

  // Optional knobs with defaults preserving prior behaviour where useful.
  const redirectGated = input.redirectGatedToCore ?? true;
  const qldDgFactor = Math.max(0, Math.min(1, input.qldDivGrowthFactor ?? 0.5));
  const dcaFactor = Math.max(0, Math.min(1, input.dcaContributionFactor ?? 0.5));
  const taxWithhold = Math.max(0, Math.min(50, input.taxWithholdPct ?? 0)) / 100;

  return RULEBOOK_SCENARIOS.map(scen => {
    const SCHD_CAGR = scen.cagrPct / 100;
    const QLD_CAGR = SCHD_CAGR * QLD_LEVERAGE_FACTOR;

    let schdCAD = Math.max(0, input.start.schdCAD);
    let qldCAD  = Math.max(0, input.start.qldCAD);
    let sgovCAD = Math.max(0, input.start.sgovCAD);
    let iaumCAD = Math.max(0, input.start.iaumCAD);
    let schdYld = Math.max(0, input.start.schdYieldPct) / 100;
    let qldYld  = Math.max(0, input.start.qldYieldPct)  / 100;
    const sgovYld = Math.max(0, input.start.sgovYieldPct) / 100;  // T-bill rate; held flat
    let cumContrib = 0;
    let emergencyCount = 0;
    let rebalanceCount = 0;
    let iaumExitedEver = false;

    const points: ProjectionYearPointV2[] = [];

    for (let y = 1; y <= input.maxYears; y++) {
      let emergencyCapApplied = false;
      let annualRebalanceApplied = false;
      let iaumExited = false;

      // (1) Annual contribution amounts. Non-Core gated by §6/§7 conditions.
      let annualCore = Math.max(0, input.coreWeeklyCAD * 52);
      const totalForGate = schdCAD + qldCAD + sgovCAD + iaumCAD;
      const sgovPctOfTotal = totalForGate > 0 ? sgovCAD / totalForGate : 1;
      const iaumPctOfTotal = totalForGate > 0 ? iaumCAD / totalForGate : 1;
      const sgovPlanned = Math.max(0, input.sgovWeeklyCAD * 52);
      const iaumPlanned = Math.max(0, input.iaumWeeklyCAD * 52);
      const sgovGated = !(sgovPctOfTotal < 0.05);
      const iaumGated = !(iaumPctOfTotal < 0.05 && input.tfsaRoomExists);
      const annualSGOV = sgovGated ? 0 : sgovPlanned;
      const annualIAUM = iaumGated ? 0 : iaumPlanned;
      // §6/§7 redirect: when Non-Core is gated and the option is on, fold the planned
      // amount back into Core Method B so the user's total weekly outflow keeps deploying.
      if (redirectGated) {
        if (sgovGated) annualCore += sgovPlanned;
        if (iaumGated) annualCore += iaumPlanned;
      }
      cumContrib += annualCore + annualSGOV + annualIAUM;

      // (2) §5 Method B for Core — proportional shortfall to 70/30.
      const postCorePool = schdCAD + qldCAD + annualCore;
      const targetSchd = postCorePool * 0.70;
      const targetQld  = postCorePool * 0.30;
      const schdShort = Math.max(0, targetSchd - schdCAD);
      const qldShort  = Math.max(0, targetQld  - qldCAD);
      const totalShort = schdShort + qldShort;
      let schdBuy = 0;
      let qldBuy = 0;
      if (totalShort >= annualCore && totalShort > 0) {
        schdBuy = annualCore * (schdShort / totalShort);
        qldBuy  = annualCore * (qldShort  / totalShort);
      } else if (totalShort > 0) {
        schdBuy = schdShort;
        qldBuy  = qldShort;
        const leftover = annualCore - schdShort - qldShort;
        schdBuy += leftover * 0.70;
        qldBuy  += leftover * 0.30;
      } else {
        schdBuy = annualCore * 0.70;
        qldBuy  = annualCore * 0.30;
      }

      // (3) DCA-aware growth: existing balance grows full year, contributions average mid-year.
      // Closed form: end_of_year = start_of_year × (1+r) + contrib × (1 + r × dcaFactor)
      //   dcaFactor = 1   → start-of-year (legacy: full year on contributions)
      //   dcaFactor = 0.5 → mid-year average (DCA approximation)
      //   dcaFactor = 0   → end-of-year (no growth on contributions)
      schdCAD = schdCAD * (1 + SCHD_CAGR) + schdBuy * (1 + SCHD_CAGR * dcaFactor);
      qldCAD  = qldCAD  * (1 + QLD_CAGR)  + qldBuy  * (1 + QLD_CAGR  * dcaFactor);
      sgovCAD = sgovCAD * (1 + SGOV_FIXED_CAGR) + annualSGOV * (1 + SGOV_FIXED_CAGR * dcaFactor);
      iaumCAD = iaumCAD * (1 + IAUM_FIXED_CAGR) + annualIAUM * (1 + IAUM_FIXED_CAGR * dcaFactor);

      // (4) §10 Emergency cap (QLD core ≥ 38% → sell QLD to 30%).
      let coreCAD = schdCAD + qldCAD;
      let qldCoreWeight = coreCAD > 0 ? qldCAD / coreCAD : 0;
      if (qldCoreWeight >= 0.38) {
        const sale = Math.max(0, (qldCAD - 0.30 * coreCAD) / 0.70);
        const totalAll = schdCAD + qldCAD + sgovCAD + iaumCAD;
        const sgovGap = Math.max(0, totalAll * 0.05 - sgovCAD);
        const sgovRefill = Math.min(sale, sgovGap);
        const schdAdd = sale - sgovRefill;
        qldCAD  -= sale;
        sgovCAD += sgovRefill;
        schdCAD += schdAdd;
        emergencyCapApplied = true;
        emergencyCount++;
      }

      // (5) §9 Annual rebalance (Dec 31). Same proceeds order.
      coreCAD = schdCAD + qldCAD;
      qldCoreWeight = coreCAD > 0 ? qldCAD / coreCAD : 0;
      if (!emergencyCapApplied && qldCoreWeight > 0.30) {
        const sale = Math.max(0, (qldCAD - 0.30 * coreCAD) / 0.70);
        const totalAll = schdCAD + qldCAD + sgovCAD + iaumCAD;
        const sgovGap = Math.max(0, totalAll * 0.05 - sgovCAD);
        const sgovRefill = Math.min(sale, sgovGap);
        const schdAdd = sale - sgovRefill;
        qldCAD  -= sale;
        sgovCAD += sgovRefill;
        schdCAD += schdAdd;
        annualRebalanceApplied = true;
        rebalanceCount++;
      }

      // (6) Age-65 IAUM exit → buy QLD with proceeds (per business rule).
      const ageThisYear = input.currentAge != null ? input.currentAge + y : null;
      if (ageThisYear === 65 && iaumCAD > 0) {
        qldCAD += iaumCAD;
        iaumCAD = 0;
        iaumExited = true;
        iaumExitedEver = true;
      }

      // (7) Dividend yield growth.
      //   SCHD: full safeDivGrowth
      //   QLD : safeDivGrowth × qldDgFactor (default half — QLD is growth-tilted, modest div bump)
      //   SGOV: held flat (rate-sensitive, hard to project)
      schdYld = schdYld * (1 + safeDivGrowth);
      qldYld  = qldYld  * (1 + safeDivGrowth * qldDgFactor);

      // (8) Dividend snapshot — gross then net of withholding.
      coreCAD = schdCAD + qldCAD;
      const totalCAD = schdCAD + qldCAD + sgovCAD + iaumCAD;
      const annualDivGross = schdCAD * schdYld + qldCAD * qldYld + sgovCAD * sgovYld;
      const annualDivNet = annualDivGross * (1 - taxWithhold);

      if (yearPointsClean.includes(y)) {
        points.push({
          year: startYear + y,
          yearsFromNow: y,
          schdCAD: Math.round(schdCAD),
          qldCAD:  Math.round(qldCAD),
          sgovCAD: Math.round(sgovCAD),
          iaumCAD: Math.round(iaumCAD),
          totalCAD: Math.round(totalCAD),
          qldCoreWeightPct:   coreCAD > 0 ? Math.round((qldCAD  / coreCAD)  * 1000) / 10 : 0,
          sgovTotalWeightPct: totalCAD > 0 ? Math.round((sgovCAD / totalCAD) * 1000) / 10 : 0,
          iaumTotalWeightPct: totalCAD > 0 ? Math.round((iaumCAD / totalCAD) * 1000) / 10 : 0,
          annualDivCAD:       Math.round(annualDivNet),
          annualDivGrossCAD:  Math.round(annualDivGross),
          monthlyDivCAD:      Math.round(annualDivNet / 12),
          totalContribCAD: Math.round(cumContrib),
          emergencyCapApplied,
          annualRebalanceApplied,
          iaumExited,
        });
      }
    }

    return {
      id: scen.id,
      label: scen.label,
      cagrPct: scen.cagrPct,
      points,
      triggerCounts: {
        emergencyCap: emergencyCount,
        annualRebalance: rebalanceCount,
        iaumExited: iaumExitedEver,
      },
    };
  });
}

export function projectScenarios(params: {
  currentValueCAD: number;
  currentAnnualDivCAD: number;
  divYieldPct: number;
  divGrowthPct: number;        // capped to safe range by caller; unused in worst case
  annualContribCAD: number;
  yearPoints: number[];        // years-from-now to surface in tables (e.g. [1,5,10,20])
  maxYears: number;
}): ProjectionScenario[] {
  const startYear = new Date().getFullYear();
  const safeDivGrowth = Math.max(0, Math.min(20, params.divGrowthPct));   // never optimistic
  const yearPointsClean = Array.from(new Set(
    params.yearPoints.filter(y => Number.isFinite(y) && y > 0 && y <= params.maxYears),
  )).sort((a, b) => a - b);

  return RULEBOOK_SCENARIOS.map(scen => {
    let pv = Math.max(0, params.currentValueCAD);
    let div = Math.max(0, params.currentAnnualDivCAD);
    let cumContrib = 0;
    const cagr = scen.cagrPct / 100;
    const dg = safeDivGrowth / 100;
    const yld = Math.max(0, params.divYieldPct) / 100;
    const points: ProjectionYearPoint[] = [];

    for (let y = 1; y <= params.maxYears; y++) {
      const contrib = Math.max(0, params.annualContribCAD);
      cumContrib += contrib;
      pv = (pv + contrib) * (1 + cagr);
      div = div * (1 + dg) + contrib * yld;

      if (yearPointsClean.includes(y)) {
        points.push({
          year: startYear + y,
          yearsFromNow: y,
          portfolioCAD: Math.round(pv),
          annualDivCAD: Math.round(div),
          monthlyDivCAD: Math.round(div / 12),
          totalContribCAD: Math.round(cumContrib),
        });
      }
    }

    return {
      id: scen.id,
      label: scen.label,
      cagrPct: scen.cagrPct,
      points,
    };
  });
}
