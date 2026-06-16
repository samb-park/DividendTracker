// SANGBONG INVESTMENT RULEBOOK v4.5.1 calculation helpers.
// Pure functions; all CAD-normalized inputs; all output is JSON-serializable.
//
// Rule references (v4.5.1):
//  - Core         = SCHD + QLD  (weekly Core = 455 CAD = SCHD 273 / QLD 182)
//  - SGOV         = passive reserve, target 5%, allowed 0–8%; crisis can drain to 0
//  - TQQQ         = VR-Lite only (Friday 252d drawdown tiers; Monday buy)
//  - QLD weight   = QLD / (SCHD + QLD)            ← Core basis
//  - SGOV/QQQM/TQQQ weights use TotalPortfolio basis
//  - Scenarios    : Base 6%, Pessimistic 4%, Worst 2%  (no optimistic)
//  - Contribution : STATIC 60/40 SCHD/QLD. No TQQQ overlay. No Method B.
//  - SCHD dividend reinvestment: 60/40 SCHD/QLD. NEVER routed to SGOV / QQQM / QQQI / TQQQ.
//  - Crisis (§6.1) judged on MONTH-END close: SGOV → QLD, reset when QLD core weight ≥ 30%.
//  - Removed: Soft Exit, Emergency cap, QQQM new-buy/weekly accumulation/12-31 skim.
//  - Legacy QQQM / QQQI / JEPQ / IAUM positions are hold-only unless explicitly changed.

export const RULEBOOK_TICKERS = {
  CORE: ["SCHD", "QLD"] as const,
  RESERVE: ["SGOV"] as const,                 // passive reserve, base 5%, max 8%, min 0%
  SATELLITE: [] as const,                     // v4.5.1: no active satellite new buys
  OVERLAY: ["TQQQ"] as const,                  // VR-Lite / legacy holding, not Core overlay
  LEGACY: ["QQQM", "QQQI", "JEPQ", "IAUM"] as const, // hold-only; isNonCoreTicker true; no rulebook gating
} as const;

/** True when the ticker is a Non-Core asset (reserve, satellite, or legacy income/gold slot). */
export function isNonCoreTicker(ticker: string): boolean {
  const t = (ticker ?? "").toUpperCase();
  return (
    (RULEBOOK_TICKERS.RESERVE as readonly string[]).includes(t) ||
    (RULEBOOK_TICKERS.SATELLITE as readonly string[]).includes(t) ||
    (RULEBOOK_TICKERS.LEGACY as readonly string[]).includes(t)
  );
}

export const RULEBOOK_TARGETS = {
  SCHD_OF_CORE_PCT: 60,
  QLD_OF_CORE_PCT:  40,
  // §5 annual rebalance deadband
  REBAL_HIGH_PCT: 31,   // W > 31% → Case A
  REBAL_LOW_PCT:  29,   // W < 29% → no-action in v4.5.1
  // §6.1 crisis triggers (core basis)
  CRISIS_T1_PCT: 25,    // core W ≤ 25% → 2.5% total → QLD
  CRISIS_T2_PCT: 20,    // core W ≤ 20% → additional 2.5% total → QLD
  CRISIS_T1_BUY_PCT_OF_TOTAL: 2.5,
  CRISIS_T2_BUY_PCT_OF_TOTAL: 2.5,
  CRISIS_RESET_QLD_CORE_WEIGHT_PCT: 30,
  // SGOV (v4.5.1) — base 5% / max 8% / min 0% (no floor)
  SGOV_BASE_TARGET_PCT: 5,            // §8 base target
  SGOV_MAX_PCT: 8,                    // §8 ceiling
  SGOV_MIN_PCT: 0,                    // §8 NO hard floor — crisis may exhaust SGOV to 0
  // TQQQ VR-Lite (v4.5.1): Friday decision using 252d drawdown; Monday buy from TFSA SGOV only.
  TQQQ_VR_TIER1_DD_PCT: 0,
  TQQQ_VR_TIER2_DD_PCT: 15,
  TQQQ_VR_TIER3_DD_PCT: 30,
  TQQQ_VR_TIER4_DD_PCT: 50,
  TQQQ_VR_TIER1_USD: 10,
  TQQQ_VR_TIER2_USD: 20,
  TQQQ_VR_TIER3_USD: 40,
  TQQQ_VR_TIER4_USD: 60,
  FX_BUFFER_PCT: 1.5,
  FX_CONVERSION_DAY_OF_WEEK: 5,
  // Weekly contributions (v4.5.1 — Core = 455 = SCHD 273 / QLD 182)
  CORE_WEEKLY_CAD: 455,
  SCHD_WEEKLY_CAD: 273,
  QLD_WEEKLY_CAD: 182,
  // Retirement phase (rulebook [10] / [11] / [16])
  RRSP_MELTDOWN_START_AGE: 60,
  RRSP_MELTDOWN_END_AGE:   71,
  RRSP_MELTDOWN_ANNUAL_CAD: 40000,
  DIVIDEND_CONSUMPTION_AGE: 65,
  PENSION_START_AGE:        65,
  PENSION_MONTHLY_CAD:      7781,
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
  qqqmCAD: number;             // legacy hold-only
  tqqqCAD: number;             // overlay asset; 0 when no holding
  // Core basis
  qldCoreWeightPct: number;    // QLD / (SCHD + QLD) × 100
  schdCoreWeightPct: number;
  // Total basis
  growthBucketPct: number;     // (QLD + TQQQ) / Total × 100
  sgovTotalWeightPct: number;
  qqqmTotalWeightPct: number;
  tqqqTotalWeightPct: number;
  // Trigger flags
  inDeadband: boolean;          // 29 ≤ QLD core W ≤ 31 → no annual rebal action
  caseAEligible: boolean;       // QLD core W > 31 (regardless of overlay)
  caseBEligible: boolean;       // QLD core W < 29 (no-action in v4.5.1)
  hardExit: boolean;            // v4.5.1 removed; always false
  softExit: boolean;            // v4.5.1 removed; always false
  crisisT1: boolean;            // 20 < core W ≤ 25 (month-end close gate)
  crisisT2: boolean;            // core W ≤ 20      (month-end close gate)
  cycleArmable: boolean;        // QLD core weight ≥ 30 (cycle reset condition met)
  sgovBelowTarget: boolean;     // SGOV total W < 5 (base 5% target — sub-base means low reserve)
  sgovAboveMax: boolean;        // SGOV total W > 8 (above ceiling)
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
  const qqqmCAD = findValue(holdings, "QQQM");
  const tqqqCAD = findValue(holdings, "TQQQ");
  const allCAD  = holdings.reduce((s, h) => s + (isFinite(h.valueCAD) ? h.valueCAD : 0), 0);
  const coreCAD = schdCAD + qldCAD;

  const qldCoreWeightPct  = pct(qldCAD, coreCAD);
  const schdCoreWeightPct = pct(schdCAD, coreCAD);
  const growthBucketPct   = pct(qldCAD + tqqqCAD, allCAD);
  const sgovTotalWeightPct = pct(sgovCAD, allCAD);
  const qqqmTotalWeightPct = pct(qqqmCAD, allCAD);
  const tqqqTotalWeightPct = pct(tqqqCAD, allCAD);

  // v4.5.1 abolished the prior Soft Exit / Emergency cap growth-bucket exits.
  const hardExit = false;
  const softExit = false;
  const crisisT2 = qldCoreWeightPct <= RULEBOOK_TARGETS.CRISIS_T2_PCT && coreCAD > 0;
  const crisisT1 = !crisisT2
    && qldCoreWeightPct <= RULEBOOK_TARGETS.CRISIS_T1_PCT
    && coreCAD > 0;
  // FP-safe boundaries: at SCHD=71 / QLD=29 the calc yields 28.9999…, which
  // silently flipped Case B true and deadband false before the tolerance fix. Use a
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
    && qldCoreWeightPct < RULEBOOK_TARGETS.REBAL_LOW_PCT - FP_EPS;
  const cycleArmable = qldCoreWeightPct >= RULEBOOK_TARGETS.CRISIS_RESET_QLD_CORE_WEIGHT_PCT;

  return {
    totalCAD: allCAD,
    coreCAD,
    schdCAD,
    qldCAD,
    sgovCAD,
    qqqmCAD,
    tqqqCAD,
    qldCoreWeightPct,
    schdCoreWeightPct,
    growthBucketPct,
    sgovTotalWeightPct,
    qqqmTotalWeightPct,
    tqqqTotalWeightPct,
    inDeadband,
    caseAEligible,
    caseBEligible,
    hardExit,
    softExit,
    crisisT1,
    crisisT2,
    cycleArmable,
    sgovBelowTarget: sgovTotalWeightPct < RULEBOOK_TARGETS.SGOV_BASE_TARGET_PCT,
    sgovAboveMax:   sgovTotalWeightPct > RULEBOOK_TARGETS.SGOV_MAX_PCT,
  };
}

// ── Static Core allocation (v4.5.1) ───────────────────────────────
// Fixed 60/40 split. No Method B, no shortfall logic, no TQQQ overlay.
// v4.5.1: Core weekly = 455 CAD = SCHD 273 / QLD 182.
export interface StaticCoreAllocation {
  contributionCAD: number;
  overlayActive: boolean;
  schdBuyCAD: number;
  qldBuyCAD: number;
  tqqqBuyCAD: number;
}

export function computeStaticCoreAllocation(
  contributionCAD: number,
  overlayActive: boolean,
): StaticCoreAllocation {
  const C = Math.max(0, isFinite(contributionCAD) ? contributionCAD : 0);
  const schdPct = RULEBOOK_TARGETS.SCHD_OF_CORE_PCT / 100;
  const qldPct  = RULEBOOK_TARGETS.QLD_OF_CORE_PCT  / 100;
  const schdBuy = C * schdPct;
  const growthBuy = C * qldPct;
  void overlayActive;
  return {
    contributionCAD: C,
    overlayActive: false,
    schdBuyCAD: schdBuy,
    qldBuyCAD: growthBuy,
    tqqqBuyCAD: 0,
  };
}

// ── SCHD dividend reinvestment (v4.5.1) ──────────────────────────────────
// Rulebook §5 — every SCHD dividend must reinvest as 60/40 static.
//   dividend × 0.60 → SCHD
//   dividend × 0.40 → QLD
// Routing to SGOV / QQQM / QQQI is strictly forbidden.
export interface SchdDividendReinvestPlan {
  dividendCAD: number;
  overlayActive: boolean;
  schdBuyCAD: number;
  qldBuyCAD: number;
  tqqqBuyCAD: number;
}

export function computeSchdDividendReinvest(
  dividendCAD: number,
  overlayActive: boolean,
): SchdDividendReinvestPlan {
  void overlayActive; // v4.5.1: overlay removed; param kept for call-site compatibility
  const D = Math.max(0, isFinite(dividendCAD) ? dividendCAD : 0);
  const schdPct = RULEBOOK_TARGETS.SCHD_OF_CORE_PCT / 100;
  const qldPct  = RULEBOOK_TARGETS.QLD_OF_CORE_PCT  / 100;
  const schdBuy = D * schdPct;
  const growthBuy = D * qldPct;
  return {
    dividendCAD: D,
    overlayActive: false,
    schdBuyCAD: schdBuy,
    qldBuyCAD: growthBuy,
    tqqqBuyCAD: 0,
  };
}

export interface FridayFxBufferPlan {
  cadAmount: number;
  usdCadRate: number;
  dayOfWeek: number;
  executeToday: boolean;
  fxBufferPct: number;
  usdBeforeBuffer: number;
  usdAfterBuffer: number;
}

export function computeFridayFxBufferPlan(args: {
  cadAmount: number;
  usdCadRate: number;
  /** 0=Sunday ... 5=Friday ... 6=Saturday */
  dayOfWeek: number;
}): FridayFxBufferPlan {
  const cad = Math.max(0, Number.isFinite(args.cadAmount) ? args.cadAmount : 0);
  const rate = Math.max(0, Number.isFinite(args.usdCadRate) ? args.usdCadRate : 0);
  const usdBeforeBuffer = rate > 0 ? cad / rate : 0;
  const fxBufferPct = RULEBOOK_TARGETS.FX_BUFFER_PCT;
  return {
    cadAmount: cad,
    usdCadRate: rate,
    dayOfWeek: args.dayOfWeek,
    executeToday: args.dayOfWeek === RULEBOOK_TARGETS.FX_CONVERSION_DAY_OF_WEEK,
    fxBufferPct,
    usdBeforeBuffer,
    usdAfterBuffer: usdBeforeBuffer * (1 - fxBufferPct / 100),
  };
}

export interface TqqqVrLiteWeeklyPlan {
  executeToday: boolean;
  drawdown252dPct: number;
  usdBuy: number;
  reason: string;
  mondayBuy: true;
}

export function computeTqqqVrLiteWeeklyPlan(args: {
  drawdown252dPct: number;
  /** 0=Sunday ... 5=Friday ... 6=Saturday */
  dayOfWeek: number;
}): TqqqVrLiteWeeklyPlan {
  const dd = Math.max(0, Number.isFinite(args.drawdown252dPct) ? args.drawdown252dPct : 0);
  let usdBuy: number = RULEBOOK_TARGETS.TQQQ_VR_TIER1_USD;
  if (dd >= RULEBOOK_TARGETS.TQQQ_VR_TIER4_DD_PCT) usdBuy = RULEBOOK_TARGETS.TQQQ_VR_TIER4_USD;
  else if (dd >= RULEBOOK_TARGETS.TQQQ_VR_TIER3_DD_PCT) usdBuy = RULEBOOK_TARGETS.TQQQ_VR_TIER3_USD;
  else if (dd >= RULEBOOK_TARGETS.TQQQ_VR_TIER2_DD_PCT) usdBuy = RULEBOOK_TARGETS.TQQQ_VR_TIER2_USD;
  const executeToday = args.dayOfWeek === RULEBOOK_TARGETS.FX_CONVERSION_DAY_OF_WEEK;
  return {
    executeToday,
    drawdown252dPct: dd,
    usdBuy: executeToday ? usdBuy : 0,
    reason: executeToday ? "friday-252d-drawdown" : "wait-for-friday",
    mondayBuy: true,
  };
}

// ── Retired Soft Exit compatibility helper (v4.5.1 removed) ───
// Kept for response-shape compatibility; always inactive.
export interface TqqqSoftExitPlan {
  active: boolean;
  tqqqSaleCAD: number;
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
}): TqqqSoftExitPlan {
  const inactive: TqqqSoftExitPlan = {
    active: false, tqqqSaleCAD: 0, sgovRefillCAD: 0, schdBuyCAD: 0, postGrowthBucketPct: 0,
  };
  void args;
  return inactive;
  const sale = 0;
  const sgovGap = Math.max(0, (RULEBOOK_TARGETS.SGOV_MAX_PCT / 100) * args.totalCAD - args.sgovCAD);
  const sgovRefill = Math.min(sale, sgovGap);
  const schdBuy = Math.max(0, sale - sgovRefill);
  const postTqqq = args.tqqqCAD - sale;
  const postGrowthBucketPct = args.totalCAD > 0
    ? ((args.qldCAD + postTqqq) / args.totalCAD) * 100
    : 0;
  return { active: true, tqqqSaleCAD: sale, sgovRefillCAD: sgovRefill, schdBuyCAD: schdBuy, postGrowthBucketPct };
}

// ── Retired Emergency cap compatibility helper (v4.5.1 removed) ───
// Kept for response-shape compatibility; always inactive.
export interface TqqqExitPlan {
  active: boolean;
  tqqqSaleCAD: number;
  qldSaleCAD: number;
  sgovRefillCAD: number;
  schdBuyCAD: number;
  postGrowthBucketPct: number;
}

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
  void args;
  return inactive;

  const tqqqSale = 0;
  const coreCAD = args.schdCAD + args.qldCAD;
  const targetRatio = RULEBOOK_TARGETS.QLD_OF_CORE_PCT / 100;
  // (Q - x) / (Core - x) = 0.30 → x = (Q - 0.30·Core) / 0.70
  const qldSale = Math.max(0, (args.qldCAD - targetRatio * coreCAD) / (1 - targetRatio));

  const proceeds = tqqqSale + qldSale;
  if (proceeds <= 0) return inactive;

  const sgovTargetCAD = (RULEBOOK_TARGETS.SGOV_MAX_PCT / 100) * Math.max(0, args.totalCAD);
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

// ── §6.1 Crisis Trigger — buy QLD with SGOV proceeds ────────────────────────
// Tier sizes (rulebook [6.1]):
//   T1 (core W ≤ 25%) : 2.5% of total → QLD
//   T2 (core W ≤ 20%) : additional 2.5% → QLD (cumulative 5% when both fire same day)
// Cycle gating: each tier may only fire once per cycle. Cycle resets when
//   QLD core weight ≥ 30% (caller passes `cycleArmed`).
// SCHD never sold. QQQM never sold.
// v4.5.1: SGOV may be exhausted to 0% (NO floor). Sale capped only by available SGOV.
export interface CrisisTriggerPlan {
  active: boolean;
  tier: "T1" | "T2" | null;
  sgovSaleCAD: number;
  tqqqBuyCAD: number;
  qldBuyCAD: number;
  postSgovTotalWeightPct: number;
  resetRule: string;
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
    active: false, tier: null, sgovSaleCAD: 0, tqqqBuyCAD: 0, qldBuyCAD: 0, postSgovTotalWeightPct: 0,
    resetRule: "QLD_CORE_WEIGHT_GTE_30", reason,
  });
  if (!args.crisisT1 && !args.crisisT2) return inactive("no-crisis");
  if (!args.cycleArmed) return inactive("cycle-not-armed");

  const tierPctTotal = args.crisisT2
    ? (RULEBOOK_TARGETS.CRISIS_T1_BUY_PCT_OF_TOTAL + RULEBOOK_TARGETS.CRISIS_T2_BUY_PCT_OF_TOTAL)
    : RULEBOOK_TARGETS.CRISIS_T1_BUY_PCT_OF_TOTAL;
  const requested = (tierPctTotal / 100) * Math.max(0, args.totalCAD);
  const sgovSale  = Math.min(Math.max(0, args.sgovCAD), requested);
  const qldBuy    = sgovSale;
  const postSgov  = args.sgovCAD - sgovSale;
  const postTotal = args.totalCAD;  // proceeds chained → total unchanged
  const postSgovPct = postTotal > 0 ? (postSgov / postTotal) * 100 : 0;
  return {
    active: sgovSale > 0,
    tier: args.crisisT2 ? "T2" : "T1",
    sgovSaleCAD: sgovSale,
    tqqqBuyCAD: 0,
    qldBuyCAD: qldBuy,
    postSgovTotalWeightPct: postSgovPct,
    resetRule: "QLD_CORE_WEIGHT_GTE_30",
    reason: sgovSale > 0 ? "applied" : "sgov-empty",
  };
}

// ── §5 Annual Rebalance (Dec 31) — v4.5.1 Core 60/40 ──────────
// Case A: QLD/SCHD overshoot trim proceeds → SGOV.
// Case B: W < 29 → NO ACTION.
// Deadband: no action. SCHD is never sold except explicit year-end overshoot trim.
export interface AnnualRebalancePlan {
  action: "deadband" | "case_a" | "case_b" | "case_b_no_room";
  qldSaleCAD: number;
  qldBuyCAD: number;
  sgovDeltaCAD: number;     // + = refill (Case A), − = drain (Case B; not used in v4.4.2+)
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
    const sgovRefill = qldSale;
    const schdBuy = 0;
    const postQld = args.qldCAD - qldSale;
    const postCore = coreCAD - qldSale;
    return {
      action: "case_a",
      qldSaleCAD: qldSale,
      qldBuyCAD: 0,
      sgovDeltaCAD: sgovRefill,
      schdBuyCAD: schdBuy,
      postQldCoreWeightPct: postCore > 0 ? (postQld / postCore) * 100 : 0,
    };
  }

  // Case B (v4.5.1 — NO ACTION).
  return noop;
}

// v4.5.1: TQQQ profit stays inside TFSA and routes to SGOV, not Core.
export interface TqqqProfitSweepPlan {
  active: boolean;
  tqqqSaleUsd: number;
  schdBuyUsd: number;
  qldBuyUsd: number;
  sgovBuyUsd: number;
}

export function computeTqqqProfitSweepPlan(args: {
  marketValueUsd: number;
  costBasisUsd: number;
}): TqqqProfitSweepPlan {
  const market = Math.max(0, Number.isFinite(args.marketValueUsd) ? args.marketValueUsd : 0);
  const cost = Math.max(0, Number.isFinite(args.costBasisUsd) ? args.costBasisUsd : 0);
  const profit = Math.max(0, market - cost);
  return {
    active: profit > 0,
    tqqqSaleUsd: profit,
    schdBuyUsd: 0,
    qldBuyUsd: 0,
    sgovBuyUsd: profit,
  };
}

export interface CoreOvershootTrimPlan {
  active: boolean;
  sellTicker: "SCHD" | "QLD" | null;
  trimCAD: number;
  sgovBuyCAD: number;
  postSchdCoreWeightPct: number;
  postQldCoreWeightPct: number;
}

export function computeCoreOvershootTrimPlan(args: {
  schdCAD: number;
  qldCAD: number;
  sgovCAD: number;
  totalCAD: number;
}): CoreOvershootTrimPlan {
  void args.sgovCAD;
  void args.totalCAD;
  const schd = Math.max(0, args.schdCAD);
  const qld = Math.max(0, args.qldCAD);
  const core = schd + qld;
  const inactive = (postSchd = core > 0 ? (schd / core) * 100 : 0, postQld = core > 0 ? (qld / core) * 100 : 0): CoreOvershootTrimPlan => ({
    active: false,
    sellTicker: null,
    trimCAD: 0,
    sgovBuyCAD: 0,
    postSchdCoreWeightPct: postSchd,
    postQldCoreWeightPct: postQld,
  });
  if (core <= 0) return inactive();
  const schdTarget = RULEBOOK_TARGETS.SCHD_OF_CORE_PCT / 100;
  const qldTarget = RULEBOOK_TARGETS.QLD_OF_CORE_PCT / 100;
  const schdExcess = Math.max(0, (schd - schdTarget * core) / (1 - schdTarget));
  const qldExcess = Math.max(0, (qld - qldTarget * core) / (1 - qldTarget));
  if (schdExcess <= 0 && qldExcess <= 0) return inactive();
  const sellTicker = schdExcess >= qldExcess ? "SCHD" as const : "QLD" as const;
  const trimCAD = sellTicker === "SCHD" ? schdExcess : qldExcess;
  const postSchd = schd - (sellTicker === "SCHD" ? trimCAD : 0);
  const postQld = qld - (sellTicker === "QLD" ? trimCAD : 0);
  const postCore = postSchd + postQld;
  return {
    active: trimCAD > 0,
    sellTicker,
    trimCAD,
    sgovBuyCAD: trimCAD,
    postSchdCoreWeightPct: postCore > 0 ? (postSchd / postCore) * 100 : 0,
    postQldCoreWeightPct: postCore > 0 ? (postQld / postCore) * 100 : 0,
  };
}

// ── §11 RRSP Meltdown — SCHD-first withdrawal helper ─────────────────────────
// Rulebook [11]: RRSP 멜트다운 60-71세, 연 30-50K. SCHD 인-카인드 선호.
// 이 helper는 매매 메커니즘이 아니라 인출 (distribution) 이므로 §15 "SCHD 매도 금지"의 예외.
// SCHD가 부족하면 QLD에서 잔여를 차감. 둘 다 부족하면 unmet으로 surface.
export interface MeltdownAllocation {
  fromSchd: number;
  fromQld: number;
  totalWithdrawn: number;
  unmet: number;
}

export function computeMeltdownAllocation(
  schdCAD: number,
  qldCAD: number,
  requestedCAD: number,
): MeltdownAllocation {
  const safeSchd = Math.max(0, schdCAD);
  const safeQld  = Math.max(0, qldCAD);
  const safeReq  = Math.max(0, requestedCAD);
  const fromSchd = Math.min(safeSchd, safeReq);
  const remaining = safeReq - fromSchd;
  const fromQld = Math.min(safeQld, remaining);
  const totalWithdrawn = fromSchd + fromQld;
  return {
    fromSchd,
    fromQld,
    totalWithdrawn,
    unmet: Math.max(0, safeReq - totalWithdrawn),
  };
}

// ── Legacy QQQM weekly plan (v4.5.1) ─────────────────────────────
// QQQM is hold-only: no new buys, no weekly cash accumulation, no redirects, no skim.
// QQQM distribution: TFSA USD cash, no auto-routing.
export interface QqqmWeeklyPlan {
  qqqmCashAccumCAD: number;    // always 0 in v4.5.1
  redirectedToCoreCAD: number; // always 0 in v4.5.1
  reason: string;              // 한국어 사유 ("적용" / "TFSA 잔여한도 없음")
  tfsaRoomExists: boolean;
}

export function computeQqqmWeeklyPlan(tfsaRoomExists: boolean): QqqmWeeklyPlan {
  void tfsaRoomExists;
  return {
    qqqmCashAccumCAD: 0,
    redirectedToCoreCAD: 0,
    reason: "v4.5.1: QQQM 신규 매수 없음",
    tfsaRoomExists: false,
  };
}

// ── QQQM cumulative cost USD / shares (v4.5.1) ────────────────────────────
// Derived live from Transaction table (no QqqmPosition denormalisation).
// SELL is prohibited so we only sum BUY rows. DIVIDEND is irrelevant (TFSA USD cash).
// Cost-basis is cumulative AND IS NEVER REDUCED BY SKIM.
export interface QqqmCumulative {
  cumulativeCostUsd: number;
  cumulativeShares: number;
}

export interface QqqmTransactionLike {
  action: "BUY" | "SELL" | "DIVIDEND" | string;
  ticker?: string;
  quantity: number;
  price: number;
  commission?: number;
}

export function computeQqqmCumulative(transactions: QqqmTransactionLike[]): QqqmCumulative {
  let cost = 0;
  let shares = 0;
  for (const tx of transactions) {
    if (tx.action !== "BUY") continue;
    if (tx.ticker && tx.ticker.toUpperCase() !== "QQQM") continue;
    const q = Number(tx.quantity);
    const p = Number(tx.price);
    const c = Number(tx.commission ?? 0);
    if (!isFinite(q) || !isFinite(p)) continue;
    cost += q * p + (isFinite(c) ? c : 0);
    shares += q;
  }
  return { cumulativeCostUsd: cost, cumulativeShares: shares };
}

// ── Legacy QQQM annual skim compatibility helper (v4.5.1 removed) ───────────
// Always returns ineligible; kept only so historical callers do not break.
export interface QqqmAnnualSkimResult {
  eligible: boolean;
  reason: string;
  vUsd: number;
  pUsdAvg: number;
  skimAmountUsd: number;
  // Post-skim allocation guidance (CAD): caller converts USD→CAD via FX before
  // distributing. SGOV refill is given as CAD gap when caller passes totalCAD/sgovCAD;
  // otherwise 0.
  sgovRefillCadCap: number;
}

export function computeQqqmAnnualSkim(args: {
  cumulativeCostUsd: number;
  cumulativeShares: number;
  closeUsd: number;
  // Optional: total/SGOV/fx context for callers that want a CAD SGOV-refill ceiling.
  totalCAD?: number;
  sgovCAD?: number;
  fxUsdToCad?: number;
}): QqqmAnnualSkimResult {
  const safeShares = Math.max(0, args.cumulativeShares);
  const safeCost   = Math.max(0, args.cumulativeCostUsd);
  const safeClose  = Math.max(0, args.closeUsd);
  const vUsd       = safeShares * safeClose;
  const pUsdAvg    = safeShares > 0 ? safeCost / safeShares : 0;
  void args.totalCAD;
  void args.sgovCAD;
  void args.fxUsdToCad;
  return {
    eligible: false,
    reason: "v4.5.1-removed",
    vUsd,
    pUsdAvg,
    skimAmountUsd: 0,
    sgovRefillCadCap: 0,
  };
}

// ── Legacy QQQM next-skim-date helper (not used by v4.5.1 advice) ──────────────
// Returns the 12/31 of (this year or next, whichever is upcoming).
// Trading-day fallback: weekday-only approximation (no holiday calendar exists):
//   12/31 Mon–Fri → 12/31, isPostponed=false.
//   12/31 Sat     → 12/30, isPostponed=true, reason "weekend-12-30".
//   12/31 Sun     → 12/29, isPostponed=true, reason "weekend-12-29".
export interface NextQqqmSkimDate {
  nextSkimDateISO: string;      // YYYY-MM-DD
  isPostponed: boolean;
  postponeReason: "weekend-12-30" | "weekend-12-29" | null;
  daysUntilSkim: number;        // calendar days from `today` to the returned date (≥ 0)
}

export function computeNextQqqmSkimDate(today: Date): NextQqqmSkimDate {
  // Use UTC consistently to avoid TZ off-by-one errors.
  const y = today.getUTCFullYear();
  // Build candidate 12/31 of this year. If we are already past it, roll to next year.
  let year = y;
  const dec31ThisYear = new Date(Date.UTC(y, 11, 31));
  if (today.getTime() > dec31ThisYear.getTime()) {
    year = y + 1;
  }

  const dec31 = new Date(Date.UTC(year, 11, 31));
  const dow = dec31.getUTCDay(); // 0 = Sun, 6 = Sat
  let chosen = dec31;
  let isPostponed = false;
  let postponeReason: "weekend-12-30" | "weekend-12-29" | null = null;

  if (dow === 6) {
    chosen = new Date(Date.UTC(year, 11, 30));
    isPostponed = true;
    postponeReason = "weekend-12-30";
  } else if (dow === 0) {
    chosen = new Date(Date.UTC(year, 11, 29));
    isPostponed = true;
    postponeReason = "weekend-12-29";
  }

  const ms = chosen.getTime() - today.getTime();
  const daysUntilSkim = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  return {
    nextSkimDateISO: chosen.toISOString().slice(0, 10),
    isPostponed,
    postponeReason,
    daysUntilSkim,
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

// ── Rulebook-based per-asset projection (v2 — v4.5.1) ─────────────────────
// Year-by-year simulation that applies §5 static 60/40 contribution, SGOV user stream,
// §6.1 crisis SGOV→QLD, and year-end rebalance. Soft Exit/Emergency cap/QQQM skim are removed.
//
// Per-asset CAGR model (assumption — document as 모델 한계):
//   SCHD CAGR = scenario CAGR (0.06 / 0.04 / 0.02)
//   QLD  CAGR = scenario CAGR × 1.5 (rough leverage proxy; 2x daily-reset decays)
//   SGOV CAGR = 0.04 (T-bill / cash-equivalent)
//   QQQM CAGR = scenario CAGR (NASDAQ-100 broad equity; modelled like SCHD).
//
// Yields (annual dividend / price) for each asset are caller-provided. SCHD
// yield grows by safeDivGrowth each year; QLD / SGOV / QQQM stay flat.
// v4.5.1: QQQM yield default is 0.7% (broad equity), NOT the 8% covered-call.
export interface ProjectionStartStateV2 {
  schdCAD: number;
  qldCAD: number;
  sgovCAD: number;
  qqqmCAD: number;        // legacy hold-only
  tqqqCAD: number;        // VR-Lite/legacy holding
  schdYieldPct: number;   // e.g. 3.5
  qldYieldPct: number;    // e.g. 0.5
  sgovYieldPct: number;   // e.g. 4.5
  qqqmYieldPct: number;   // e.g. 0.7 (broad-equity yield; modelled constant)
}

export interface ProjectionInputV2 {
  start: ProjectionStartStateV2;
  /** Plan amount (Core only) per week, CAD. Distributed static 60/40 to SCHD/QLD. */
  coreWeeklyCAD: number;
  /** Settings nonCorePlan.cad for SGOV (per Plan period). 0 if not set. */
  sgovWeeklyCAD: number;
  /** Legacy compatibility only; ignored in v4.5.1 because QQQM new buys are removed. */
  qqqmWeeklyCAD: number;
  /** Whether TFSA room remains; assumed constant for projection horizon (model 한계). */
  tfsaRoomExists: boolean;
  /** User's current age; used by §11 RRSP meltdown / §10 dividend consumption / §16 pension. */
  currentAge: number | null;
  /** Annual dividend growth rate %, capped 0-20. */
  divGrowthPct: number;
  /** Years-from-now to surface in the output table (e.g. [1, 5, 10, 20]). */
  yearPoints: number[];
  /** Maximum projection horizon in years. */
  maxYears: number;
  // ── Optional refinements (defaults match prior behaviour) ────────────────
  /** Legacy compatibility; only SGOV gating can redirect. QQQM input is ignored. */
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
  qqqmCAD: number;             // v4.5.1
  tqqqCAD: number;
  totalCAD: number;
  qldCoreWeightPct: number;
  growthBucketPct: number;     // (QLD + TQQQ) / Total × 100
  sgovTotalWeightPct: number;
  qqqmTotalWeightPct: number;
  /** Net-of-withholding-tax annual dividend (taxWithholdPct subtracted). */
  annualDivCAD: number;
  /** Gross annual dividend (before withholding tax). */
  annualDivGrossCAD: number;
  monthlyDivCAD: number;
  totalContribCAD: number;
  // v4.5.1 priority-order event flags
  hardExitApplied: boolean;
  softExitApplied: boolean;    // §6.2 sell-half TQQQ
  crisisT1Applied: boolean;
  crisisT2Applied: boolean;
  caseAApplied: boolean;
  caseBApplied: boolean;
  qqqmSkimApplied: boolean;    // legacy compatibility; v4.5.1 QQQM skim removed
  // Retirement phase fields ([10] / [11] / [16])
  withdrawalCAD: number;
  dividendConsumedCAD: number;
  pensionCAD: number;
  monthlyCashflowCAD: number;
}

export interface ProjectionScenarioV2 {
  id: RulebookScenarioId;
  label: string;
  cagrPct: number;
  points: ProjectionYearPointV2[];
  /** Total times each rulebook trigger fired across the horizon. */
  triggerCounts: {
    hardExit: number;
    softExit: number;
    crisisT1: number;
    crisisT2: number;
    caseA: number;
    caseB: number;
    qqqmSkim: number;
  };
}

const SGOV_FIXED_CAGR = 0.04;
const QLD_LEVERAGE_FACTOR = 1.5;
const TQQQ_LEVERAGE_FACTOR = 3;   // 3× SCHD CAGR proxy for leveraged Nasdaq overlay

export function projectScenariosRulebook(input: ProjectionInputV2): ProjectionScenarioV2[] {
  const startYear = new Date().getFullYear();
  const yearPointsClean = Array.from(new Set(
    input.yearPoints.filter(y => Number.isFinite(y) && y > 0 && y <= input.maxYears),
  )).sort((a, b) => a - b);

  // Optional knobs with defaults preserving prior behaviour where useful.
  const redirectGated = input.redirectGatedToCore ?? true;
  const dcaFactor = Math.max(0, Math.min(1, input.dcaContributionFactor ?? 0.5));
  const taxWithhold = Math.max(0, Math.min(50, input.taxWithholdPct ?? 0)) / 100;

  return RULEBOOK_SCENARIOS.map(scen => {
    const SCHD_CAGR = scen.cagrPct / 100;
    const QLD_CAGR = SCHD_CAGR * QLD_LEVERAGE_FACTOR;

    let schdCAD = Math.max(0, input.start.schdCAD);
    let qldCAD  = Math.max(0, input.start.qldCAD);
    let sgovCAD = Math.max(0, input.start.sgovCAD);
    let qqqmCAD = Math.max(0, input.start.qqqmCAD);
    let tqqqCAD = Math.max(0, input.start.tqqqCAD ?? 0);
    const schdYld = Math.max(0, input.start.schdYieldPct) / 100;
    const qldYld  = Math.max(0, input.start.qldYieldPct)  / 100;
    const sgovYld = Math.max(0, input.start.sgovYieldPct) / 100;
    const qqqmYld = Math.max(0, input.start.qqqmYieldPct) / 100;
    let cumContrib = 0;

    // Cycle gating state (in-memory; per scenario)
    let cycleArmed = tqqqCAD <= 0;
    let t1Fired = false;
    let t2Fired = false;
    const counts = { hardExit: 0, softExit: 0, crisisT1: 0, crisisT2: 0, caseA: 0, caseB: 0, qqqmSkim: 0 };

    const points: ProjectionYearPointV2[] = [];

    for (let y = 1; y <= input.maxYears; y++) {
      let hardExitApplied = false;
      let softExitApplied = false;
      let crisisT1Applied = false;
      let crisisT2Applied = false;
      let caseAApplied = false;
      let caseBApplied = false;
      const qqqmSkimApplied = false;
      let withdrawalCAD = 0;
      let dividendConsumedCAD = 0;
      let pensionCAD = 0;

      // (0) §11 RRSP Meltdown — 60-71세, runs FIRST per rulebook [14] priority #1.
      const meltdownAgeNow = input.currentAge != null ? input.currentAge + y : null;
      if (meltdownAgeNow != null
          && meltdownAgeNow >= RULEBOOK_TARGETS.RRSP_MELTDOWN_START_AGE
          && meltdownAgeNow <= RULEBOOK_TARGETS.RRSP_MELTDOWN_END_AGE) {
        const m = computeMeltdownAllocation(schdCAD, qldCAD, RULEBOOK_TARGETS.RRSP_MELTDOWN_ANNUAL_CAD);
        schdCAD -= m.fromSchd;
        qldCAD  -= m.fromQld;
        withdrawalCAD = m.totalWithdrawn;
      }

      // (1) Annual contribution amounts.
      //   - SGOV gated by 5% base target (above target → contribution stops).
      //   - QQQM new buys removed; legacy holding grows only by market return.
      let annualCore = Math.max(0, input.coreWeeklyCAD * 52);
      const totalForGate = schdCAD + qldCAD + sgovCAD + qqqmCAD + tqqqCAD;
      const sgovPctOfTotal = totalForGate > 0 ? sgovCAD / totalForGate : 1;
      const sgovPlanned = Math.max(0, input.sgovWeeklyCAD * 52);
      void input.qqqmWeeklyCAD;
      void input.tfsaRoomExists;
      const sgovGated = !(sgovPctOfTotal < RULEBOOK_TARGETS.SGOV_BASE_TARGET_PCT / 100);
      const annualSGOV = sgovGated ? 0 : sgovPlanned;
      const annualQQQM = 0;
      if (redirectGated) {
        if (sgovGated) annualCore += sgovPlanned;
      }
      cumContrib += annualCore + annualSGOV + annualQQQM;

      // (2) Static 60/40 — no TQQQ overlay.
      const schdBuy  = annualCore * (RULEBOOK_TARGETS.SCHD_OF_CORE_PCT / 100);
      const growthBuy = annualCore * (RULEBOOK_TARGETS.QLD_OF_CORE_PCT  / 100);
      const qldBuy  = growthBuy;
      const tqqqBuy = 0;

      // (3) DCA growth (mid-year average by default)
      schdCAD = schdCAD * (1 + SCHD_CAGR) + schdBuy * (1 + SCHD_CAGR * dcaFactor);
      qldCAD  = qldCAD  * (1 + QLD_CAGR)  + qldBuy  * (1 + QLD_CAGR  * dcaFactor);
      sgovCAD = sgovCAD * (1 + SGOV_FIXED_CAGR) + annualSGOV * (1 + SGOV_FIXED_CAGR * dcaFactor);
      // QQQM: broad equity proxy growth = scenario CAGR (held in TFSA so no withholding model needed).
      qqqmCAD = qqqmCAD * (1 + SCHD_CAGR) + annualQQQM * (1 + SCHD_CAGR * dcaFactor);
      // TQQQ: leveraged-Nasdaq proxy growth + overlay contributions (if any).
      tqqqCAD = tqqqCAD * (1 + SCHD_CAGR * TQQQ_LEVERAGE_FACTOR) + tqqqBuy * (1 + SCHD_CAGR * TQQQ_LEVERAGE_FACTOR * dcaFactor);

      // (4) Recompute weights for rulebook decisions
      const totalNow = schdCAD + qldCAD + sgovCAD + qqqmCAD + tqqqCAD;
      const w = computeRulebookWeights([
        { ticker: "SCHD", valueCAD: schdCAD },
        { ticker: "QLD",  valueCAD: qldCAD },
        { ticker: "SGOV", valueCAD: sgovCAD },
        { ticker: "QQQM", valueCAD: qqqmCAD },
        { ticker: "TQQQ", valueCAD: tqqqCAD },
      ]);

      // (5) Priority order per rulebook v4.5.1: Crisis → Annual Rebal.
      // QQQM is NEVER touched by any of these.
      if (w.hardExit) {
        const plan = computeTqqqHardExitPlan({
          schdCAD, qldCAD, tqqqCAD, sgovCAD, totalCAD: totalNow, hardExit: true,
        });
        if (plan.active) {
          tqqqCAD -= plan.tqqqSaleCAD;
          qldCAD  -= plan.qldSaleCAD;
          sgovCAD += plan.sgovRefillCAD;
          schdCAD += plan.schdBuyCAD;
          hardExitApplied = true;
          counts.hardExit++;
        }
      } else if (w.softExit) {
        const plan = computeTqqqSoftExitPlan({
          schdCAD, qldCAD, tqqqCAD, sgovCAD, totalCAD: totalNow, softExit: true,
        });
        if (plan.active) {
          tqqqCAD -= plan.tqqqSaleCAD;
          sgovCAD += plan.sgovRefillCAD;
          schdCAD += plan.schdBuyCAD;
          softExitApplied = true;
          counts.softExit++;
        }
      }

      // Crisis trigger (independent — cycle gating prevents repeat within a cycle).
      // v4.5.1: SGOV may exhaust to 0 (no floor).
      if (w.crisisT2 && cycleArmed && !t2Fired) {
        const plan = computeCrisisTriggerPlan({
          totalCAD: totalNow, sgovCAD, crisisT1: false, crisisT2: true, cycleArmed, tqqqCAD,
        });
        if (plan.active) {
          sgovCAD -= plan.sgovSaleCAD;
          qldCAD += plan.qldBuyCAD;
          tqqqCAD += plan.tqqqBuyCAD;
          t1Fired = true; t2Fired = true;
          crisisT2Applied = true;
          counts.crisisT2++;
        }
      } else if (w.crisisT1 && cycleArmed && !t1Fired) {
        const plan = computeCrisisTriggerPlan({
          totalCAD: totalNow, sgovCAD, crisisT1: true, crisisT2: false, cycleArmed, tqqqCAD,
        });
        if (plan.active) {
          sgovCAD -= plan.sgovSaleCAD;
          qldCAD += plan.qldBuyCAD;
          tqqqCAD += plan.tqqqBuyCAD;
          t1Fired = true;
          crisisT1Applied = true;
          counts.crisisT1++;
        }
      }

      // (5.5) v4.5.1: QQQM 신규 매수/연 skim 없음. Existing QQQM remains hold-only.

      // Annual rebalance (Dec 31)
      if (true) {
        const w2 = computeRulebookWeights([
          { ticker: "SCHD", valueCAD: schdCAD },
          { ticker: "QLD",  valueCAD: qldCAD },
          { ticker: "SGOV", valueCAD: sgovCAD },
          { ticker: "QQQM", valueCAD: qqqmCAD },
          { ticker: "TQQQ", valueCAD: tqqqCAD },
        ]);
        const reb = computeAnnualRebalancePlan({
          schdCAD, qldCAD, tqqqCAD, sgovCAD,
          totalCAD: schdCAD + qldCAD + sgovCAD + qqqmCAD + tqqqCAD,
          caseAEligible: w2.caseAEligible,
          caseBEligible: w2.caseBEligible,
        });
        if (reb.action === "case_a") {
          qldCAD  -= reb.qldSaleCAD;
          sgovCAD += reb.sgovDeltaCAD;
          schdCAD += reb.schdBuyCAD;
          caseAApplied = true;
          counts.caseA++;
        } else if (reb.action === "case_b") {
          // v4.5.1: Case B is no-action. Defensive fallthrough — should never hit.
          qldCAD += reb.qldBuyCAD;
          sgovCAD += reb.sgovDeltaCAD;
          caseBApplied = true;
          counts.caseB++;
        }
      }

      // (6) v4.5.1: no age-based QQQM exit.

      // (7) Dividend snapshot (TQQQ pays effectively 0).
      const coreCAD = schdCAD + qldCAD;
      const totalCAD = schdCAD + qldCAD + sgovCAD + qqqmCAD + tqqqCAD;
      const annualDivGross = schdCAD * schdYld + qldCAD * qldYld + sgovCAD * sgovYld + qqqmCAD * qqqmYld;
      const annualDivNet = annualDivGross * (1 - taxWithhold);

      // §10 65+ Dividend Consumption Mode — disable reinvestment, track as cashflow only.
      const consumptionAgeNow = input.currentAge != null ? input.currentAge + y : null;
      if (consumptionAgeNow != null && consumptionAgeNow >= RULEBOOK_TARGETS.DIVIDEND_CONSUMPTION_AGE) {
        dividendConsumedCAD = Math.round(annualDivGross);
      }

      // §16 65+ Pension Cashflow — household estimate, portfolio 영향 없음, tracking only.
      const pensionAgeNow = input.currentAge != null ? input.currentAge + y : null;
      if (pensionAgeNow != null && pensionAgeNow >= RULEBOOK_TARGETS.PENSION_START_AGE) {
        pensionCAD = RULEBOOK_TARGETS.PENSION_MONTHLY_CAD * 12;
      }

      const totalAnnualCashflow = withdrawalCAD + dividendConsumedCAD + pensionCAD;
      const monthlyCashflowCAD = Math.round(totalAnnualCashflow / 12);

      // (9) Cycle reset: QLD core weight ≥ 30 → re-arm
      const growthBucketPctNow = totalCAD > 0 ? ((qldCAD + tqqqCAD) / totalCAD) * 100 : 0;
      const qldCoreResetPct = coreCAD > 0 ? (qldCAD / coreCAD) * 100 : 0;
      if (qldCoreResetPct >= RULEBOOK_TARGETS.CRISIS_RESET_QLD_CORE_WEIGHT_PCT) {
        cycleArmed = true;
        t1Fired = false;
        t2Fired = false;
      } else if (tqqqCAD > 0) {
        cycleArmed = false;
      }

      if (yearPointsClean.includes(y)) {
        points.push({
          year: startYear + y,
          yearsFromNow: y,
          schdCAD: Math.round(schdCAD),
          qldCAD:  Math.round(qldCAD),
          sgovCAD: Math.round(sgovCAD),
          qqqmCAD: Math.round(qqqmCAD),
          tqqqCAD: Math.round(tqqqCAD),
          totalCAD: Math.round(totalCAD),
          qldCoreWeightPct:   coreCAD > 0 ? Math.round((qldCAD / coreCAD) * 1000) / 10 : 0,
          growthBucketPct:    Math.round(growthBucketPctNow * 10) / 10,
          sgovTotalWeightPct: totalCAD > 0 ? Math.round((sgovCAD / totalCAD) * 1000) / 10 : 0,
          qqqmTotalWeightPct: totalCAD > 0 ? Math.round((qqqmCAD / totalCAD) * 1000) / 10 : 0,
          annualDivCAD:       Math.round(annualDivNet),
          annualDivGrossCAD:  Math.round(annualDivGross),
          monthlyDivCAD:      Math.round(annualDivNet / 12),
          totalContribCAD: Math.round(cumContrib),
          hardExitApplied,
          softExitApplied,
          crisisT1Applied,
          crisisT2Applied,
          caseAApplied,
          caseBApplied,
          qqqmSkimApplied,
          withdrawalCAD: Math.round(withdrawalCAD),
          dividendConsumedCAD: Math.round(dividendConsumedCAD),
          pensionCAD: Math.round(pensionCAD),
          monthlyCashflowCAD,
        });
      }
    }

    return {
      id: scen.id,
      label: scen.label,
      cagrPct: scen.cagrPct,
      points,
      triggerCounts: {
        hardExit: counts.hardExit,
        softExit: counts.softExit,
        crisisT1: counts.crisisT1,
        crisisT2: counts.crisisT2,
        caseA: counts.caseA,
        caseB: counts.caseB,
        qqqmSkim: counts.qqqmSkim,
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
