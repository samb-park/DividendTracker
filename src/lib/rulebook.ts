// SANGBONG INVESTMENT RULEBOOK v4.4.2 calculation helpers.
// Pure functions; all CAD-normalized inputs; all output is JSON-serializable.
//
// Rule references (v4.4.2):
//  - Core         = SCHD + QLD
//  - Satellite    = SGOV + QQQI (IAUM retired in v4.4.2)
//  - Overlay      = TQQQ (crisis-only)
//  - QLD weight   = QLD / (SCHD + QLD)            ← Core basis
//  - Growth bucket= (QLD + TQQQ) / TotalPortfolio ← Total basis (Soft 34%, Hard/Emergency 38%)
//  - SGOV weight  = SGOV / TotalPortfolio         ← Total basis (target 8%, crisis floor 5%, buffer 3%)
//  - QQQI weight  = QQQI / TotalPortfolio         ← Total basis (cap 5%, TFSA-only)
//  - Scenarios    : Base 6%, Pessimistic 4%, Worst 2%  (no optimistic)
//  - Contribution : STATIC 70/30 SCHD/QLD. During TQQQ overlay (TQQQ > 0): SCHD 70 / TQQQ 30 / QLD 0.
//  - SCHD dividend reinvestment: 70/30 SCHD/QLD (overlay-aware). NEVER routed to SGOV or QQQI.
//  - Crisis (§6.1) judged on MONTH-END close. Emergency cap (§10) and TQQQ exit ladder (§6.2) judged on DAILY close.
//  - No Method B. No NDX trigger. QQQI never funds crisis / rebalance / SGOV refill / QLD or TQQQ buys.

export const RULEBOOK_TICKERS = {
  CORE: ["SCHD", "QLD"] as const,
  RESERVE: ["SGOV", "QQQI"] as const,
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
  // §6.2 TQQQ exit ladder (v4.4.2: 34% Soft Exit reintroduced; 38% Emergency cap retained)
  SOFT_EXIT_GROWTH_BUCKET_PCT: 34,    // sell HALF of TQQQ (proceeds: SGOV 8% → SCHD)
  HARD_EXIT_GROWTH_BUCKET_PCT: 38,    // §10 Emergency cap: sell ALL TQQQ + QLD to 30%
  // SGOV (v4.4.2)
  SGOV_TARGET_PCT: 8,                 // §8 normal target / Hard Exit + rebalance refill ceiling
  SGOV_FLOOR_PCT:  5,                 // §8 crisis floor — only §6.1 may pierce
  SGOV_DEPLOYABLE_BUFFER_PCT: 3,      // §8 deployable buffer = target − floor
  // QQQI (v4.4.2 — replaces legacy IAUM slot)
  QQQI_MAX_PCT: 5,
  // Weekly contributions
  QQQI_WEEKLY_BUY_CAD: 25,
  SGOV_WEEKLY_REFILL_CAD: 50,
  CORE_WEEKLY_CAD: 350,
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
  jepqCAD: number;             // v4.4.2 (replaces IAUM)
  tqqqCAD: number;             // overlay asset; 0 when no holding
  // Core basis
  qldCoreWeightPct: number;    // QLD / (SCHD + QLD) × 100
  schdCoreWeightPct: number;
  // Total basis
  growthBucketPct: number;     // (QLD + TQQQ) / Total × 100
  sgovTotalWeightPct: number;
  jepqTotalWeightPct: number;
  tqqqTotalWeightPct: number;
  // Trigger flags
  inDeadband: boolean;          // 29 ≤ QLD core W ≤ 31 → no annual rebal action
  caseAEligible: boolean;       // QLD core W > 31 (regardless of overlay)
  caseBEligible: boolean;       // QLD core W < 29 AND TQQQ = 0
  hardExit: boolean;            // growth bucket ≥ 38 → Emergency cap (daily close)
  softExit: boolean;            // growth bucket ≥ 34 (and not hard) → sell half TQQQ (v4.4.2 reintroduced)
  crisisT1: boolean;            // 20 < core W ≤ 25 (month-end close gate)
  crisisT2: boolean;            // core W ≤ 20      (month-end close gate)
  cycleArmable: boolean;        // TQQQ=0 AND growth bucket ≥ 30  (cycle reset condition met)
  sgovBelowTarget: boolean;     // SGOV total W < 8
  sgovBelowFloor: boolean;      // SGOV total W < 5  (warning state)
  jepqAtCap: boolean;           // QQQI total W ≥ 5 (hard cap)
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
  const jepqCAD = findValue(holdings, "QQQI");
  const tqqqCAD = findValue(holdings, "TQQQ");
  const allCAD  = holdings.reduce((s, h) => s + (isFinite(h.valueCAD) ? h.valueCAD : 0), 0);
  const coreCAD = schdCAD + qldCAD;

  const qldCoreWeightPct  = pct(qldCAD, coreCAD);
  const schdCoreWeightPct = pct(schdCAD, coreCAD);
  const growthBucketPct   = pct(qldCAD + tqqqCAD, allCAD);
  const sgovTotalWeightPct = pct(sgovCAD, allCAD);
  const jepqTotalWeightPct = pct(jepqCAD, allCAD);
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
    jepqCAD,
    tqqqCAD,
    qldCoreWeightPct,
    schdCoreWeightPct,
    growthBucketPct,
    sgovTotalWeightPct,
    jepqTotalWeightPct,
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
    jepqAtCap:       jepqTotalWeightPct >= RULEBOOK_TARGETS.QQQI_MAX_PCT,
  };
}

// ── Static Core allocation (v4.3.1) ──────────────────────────────────────────
// Fixed 70/30 split. No Method B, no shortfall logic, no no-sell carry-over.
// During TQQQ overlay (tqqqActive=true → TQQQ > 0), QLD allocation moves to TQQQ:
//   normal : SCHD 70 / QLD 30
//   overlay: SCHD 70 / TQQQ 30 / QLD 0
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
  return {
    contributionCAD: C,
    overlayActive,
    schdBuyCAD: schdBuy,
    qldBuyCAD:  overlayActive ? 0 : growthBuy,
    tqqqBuyCAD: overlayActive ? growthBuy : 0,
  };
}

// ── SCHD dividend reinvestment (v4.4.2) ─────────────────────────────────────
// Rulebook §5 — every SCHD dividend must reinvest as 70/30 static.
//   dividend × 0.70 → SCHD
//   dividend × 0.30 → QLD  (or TQQQ when overlay active)
// Routing to SGOV / QQQI is strictly forbidden.
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
  const D = Math.max(0, isFinite(dividendCAD) ? dividendCAD : 0);
  const schdPct = RULEBOOK_TARGETS.SCHD_OF_CORE_PCT / 100;
  const qldPct  = RULEBOOK_TARGETS.QLD_OF_CORE_PCT  / 100;
  const schdBuy = D * schdPct;
  const growthBuy = D * qldPct;
  return {
    dividendCAD: D,
    overlayActive,
    schdBuyCAD: schdBuy,
    qldBuyCAD:  overlayActive ? 0 : growthBuy,
    tqqqBuyCAD: overlayActive ? growthBuy : 0,
  };
}

// ── §6.2 Soft Exit — growth bucket ≥ 34% → sell HALF of TQQQ (v4.4.2 reintroduced) ───
// Proceeds order: SGOV refill up to 8% of total, remainder → SCHD. SCHD never sold.
// Soft Exit is judged on the SAME daily-close basis as the §10 Emergency cap.
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
  if (!args.softExit || args.tqqqCAD <= 0) return inactive;
  const sale = args.tqqqCAD / 2;
  const sgovGap = Math.max(0, (RULEBOOK_TARGETS.SGOV_TARGET_PCT / 100) * args.totalCAD - args.sgovCAD);
  const sgovRefill = Math.min(sale, sgovGap);
  const schdBuy = Math.max(0, sale - sgovRefill);
  const postTqqq = args.tqqqCAD - sale;
  const postGrowthBucketPct = args.totalCAD > 0
    ? ((args.qldCAD + postTqqq) / args.totalCAD) * 100
    : 0;
  return { active: true, tqqqSaleCAD: sale, sgovRefillCAD: sgovRefill, schdBuyCAD: schdBuy, postGrowthBucketPct };
}

// ── §6.2 Hard Exit — growth bucket ≥ 38% → all TQQQ + QLD to 30% core ───────
// v4.3.1: the 34% Soft Exit was removed. Hard Exit at 38% is the only TQQQ exit.
// Proceeds order:
//   1) Sell all TQQQ
//   2) Sell QLD down to 30% of core
//   3) Refill SGOV to 8% of total (combined proceeds)
//   4) Remainder → SCHD
// SCHD is never sold.
export interface TqqqExitPlan {
  active: boolean;
  tqqqSaleCAD: number;
  qldSaleCAD: number;
  sgovRefillCAD: number;
  schdBuyCAD: number;
  postGrowthBucketPct: number;
}

// ── §6.2 Hard Exit (continued) ───────────────────────────────────────────────
// With TQQQ=0 this degrades to a Case-A-style QLD unwind.
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

  // Case B (v4.4.2 — NO ACTION). Earlier rulebook versions sold SGOV to buy QLD;
  // v4.4.2 explicitly says QLD < 29% → no action (SCHD/QLD long-term protection).
  // Returns "deadband" so downstream consumers treat it as no-op while UI can
  // still surface caseBEligible flag for awareness.
  return noop;
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

// ── §4 QQQI weekly buy (v4.4.2 — replaces legacy IAUM slot) ─────────────────
// Rule: 주간 25 CAD, 단 (TFSA room 존재) AND (QQQI < 5% of total) 일 때만.
// 조건 미충족이면 25 CAD는 QQQI이 아니라 Core (static 70/30) 로 redirect.
// QQQI는 hard cap 5%만 존재 (target 0–5%). 보정 매수 금지. crisis/rebalance/SGOV refill 자금원 사용 금지.
// QQQI distribution은 자동 라우팅 없음 — 기본은 TFSA USD cash 누적 (수동 처리).
export interface JepqWeeklyPlan {
  jepqBuyCAD: number;          // 0 또는 25
  redirectedToCoreCAD: number; // QQQI 미적용 시 25 (Core static 70/30 으로 재투입)
  reason: string;              // 한국어 사유 ("적용" / "TFSA room 없음" / "QQQI ≥ 5%")
  tfsaRoomExists: boolean;
  jepqBelowCap: boolean;
}

export interface QqqiWeeklyPlan {
  qqqiBuyCAD: number;
  redirectedToCoreCAD: number;
  reason: string;
  tfsaRoomExists: boolean;
  qqqiBelowCap: boolean;
}

export function computeJepqWeeklyPlan(
  tfsaRoomExists: boolean,
  jepqTotalWeightPct: number,
): JepqWeeklyPlan {
  const cap = RULEBOOK_TARGETS.QQQI_WEEKLY_BUY_CAD;
  const jepqBelowCap = jepqTotalWeightPct < RULEBOOK_TARGETS.QQQI_MAX_PCT;
  const conditionsMet = tfsaRoomExists && jepqBelowCap;
  let reason = "적용";
  if (!tfsaRoomExists) reason = "TFSA 잔여한도 없음 → Core (70/30) 로 재투입";
  else if (!jepqBelowCap) reason = "QQQI 전체 비중 ≥ 5% (hard cap 도달) → Core (70/30) 로 재투입";
  return {
    jepqBuyCAD:           conditionsMet ? cap : 0,
    redirectedToCoreCAD:  conditionsMet ? 0   : cap,
    reason,
    tfsaRoomExists,
    jepqBelowCap,
  };
}

export function computeQqqiWeeklyPlan(
  tfsaRoomExists: boolean,
  qqqiTotalWeightPct: number,
): QqqiWeeklyPlan {
  const p = computeJepqWeeklyPlan(tfsaRoomExists, qqqiTotalWeightPct);
  return {
    qqqiBuyCAD: p.jepqBuyCAD,
    redirectedToCoreCAD: p.redirectedToCoreCAD,
    reason: p.reason,
    tfsaRoomExists: p.tfsaRoomExists,
    qqqiBelowCap: p.jepqBelowCap,
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

// ── Rulebook-based per-asset projection (v2 — v4.4.2) ───────────────────────
// Year-by-year simulation that applies §5 static 70/30 contribution, §6 SGOV
// refill, §4 QQQI gating, §9 annual rebalance, §6.2 Soft Exit (34%), §10 Emergency
// cap (38%). Per-asset CAD evolves over time so that QLD core weight, SGOV
// total weight, and QQQI total weight can be tracked against the rulebook
// thresholds in every projected year.
//
// Per-asset CAGR model (assumption — document as 모델 한계):
//   SCHD CAGR = scenario CAGR (0.06 / 0.04 / 0.02)
//   QLD  CAGR = scenario CAGR × 1.5 (rough leverage proxy; 2x daily-reset decays)
//   SGOV CAGR = 0.04 (T-bill / cash-equivalent)
//   QQQI CAGR = scenario CAGR (TFSA covered-call ETF, similar to broad equity)
//
// Yields (annual dividend / price) for each asset are caller-provided, then
// SCHD yield grows by safeDivGrowth each year (dividend growth assumption).
// QLD / SGOV / QQQI yields stay flat in this simple model.
export interface ProjectionStartStateV2 {
  schdCAD: number;
  qldCAD: number;
  sgovCAD: number;
  jepqCAD: number;        // v4.4.2 (replaces IAUM)
  tqqqCAD: number;        // overlay; typically 0 outside crisis cycle
  schdYieldPct: number;   // e.g. 3.5
  qldYieldPct: number;    // e.g. 0.5
  sgovYieldPct: number;   // e.g. 4.5
  jepqYieldPct: number;   // e.g. 8.0 (covered-call yield; modelled constant)
}

export interface ProjectionInputV2 {
  start: ProjectionStartStateV2;
  /** Plan amount (Core only) per week, CAD. Distributed static 70/30 to SCHD/QLD (overlay: SCHD/TQQQ). */
  coreWeeklyCAD: number;
  /** Settings nonCorePlan.cad for SGOV (per Plan period). 0 if not set. */
  sgovWeeklyCAD: number;
  /** Settings nonCorePlan.cad for QQQI (per Plan period). 0 if not set. */
  jepqWeeklyCAD: number;
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
  /** When SGOV/QQQI gating fails, redirect that contribution into Core static 70/30 (overlay-aware). Default: true. */
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
  jepqCAD: number;             // v4.4.2
  tqqqCAD: number;
  totalCAD: number;
  qldCoreWeightPct: number;
  growthBucketPct: number;     // (QLD + TQQQ) / Total × 100
  sgovTotalWeightPct: number;
  jepqTotalWeightPct: number;
  /** Net-of-withholding-tax annual dividend (taxWithholdPct subtracted). */
  annualDivCAD: number;
  /** Gross annual dividend (before withholding tax). */
  annualDivGrossCAD: number;
  monthlyDivCAD: number;
  totalContribCAD: number;
  // v4.4.2 priority-order event flags
  hardExitApplied: boolean;
  softExitApplied: boolean;    // §6.2 sell-half TQQQ (reintroduced)
  crisisT1Applied: boolean;
  crisisT2Applied: boolean;
  caseAApplied: boolean;
  caseBApplied: boolean;
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
    let jepqCAD = Math.max(0, input.start.jepqCAD);
    let tqqqCAD = Math.max(0, input.start.tqqqCAD ?? 0);
    const schdYld = Math.max(0, input.start.schdYieldPct) / 100;
    const qldYld  = Math.max(0, input.start.qldYieldPct)  / 100;
    const sgovYld = Math.max(0, input.start.sgovYieldPct) / 100;
    const jepqYld = Math.max(0, input.start.jepqYieldPct) / 100;
    let cumContrib = 0;

    // Cycle gating state (in-memory; per scenario)
    let cycleArmed = tqqqCAD <= 0;
    let t1Fired = false;
    let t2Fired = false;
    const counts = { hardExit: 0, softExit: 0, crisisT1: 0, crisisT2: 0, caseA: 0, caseB: 0 };

    const points: ProjectionYearPointV2[] = [];

    for (let y = 1; y <= input.maxYears; y++) {
      let hardExitApplied = false;
      let softExitApplied = false;
      let crisisT1Applied = false;
      let crisisT2Applied = false;
      let caseAApplied = false;
      let caseBApplied = false;
      let withdrawalCAD = 0;
      let dividendConsumedCAD = 0;
      let pensionCAD = 0;

      // (0) §11 RRSP Meltdown — 60-71세, runs FIRST per rulebook [14] priority #1 (법률/세무 출금 의미적 유사).
      //     SCHD 우선 인출, SCHD 부족시 QLD 보조. SCHD 매도 금지 invariant의 예외 (distribution, not trading).
      const meltdownAgeNow = input.currentAge != null ? input.currentAge + y : null;
      if (meltdownAgeNow != null
          && meltdownAgeNow >= RULEBOOK_TARGETS.RRSP_MELTDOWN_START_AGE
          && meltdownAgeNow <= RULEBOOK_TARGETS.RRSP_MELTDOWN_END_AGE) {
        const m = computeMeltdownAllocation(schdCAD, qldCAD, RULEBOOK_TARGETS.RRSP_MELTDOWN_ANNUAL_CAD);
        schdCAD -= m.fromSchd;
        qldCAD  -= m.fromQld;
        withdrawalCAD = m.totalWithdrawn;
      }

      // (1) Annual contribution amounts — SGOV gated by 8% target (§8), QQQI by TFSA + 5% cap (§4)
      let annualCore = Math.max(0, input.coreWeeklyCAD * 52);
      const totalForGate = schdCAD + qldCAD + sgovCAD + jepqCAD + tqqqCAD;
      const sgovPctOfTotal = totalForGate > 0 ? sgovCAD / totalForGate : 1;
      const jepqPctOfTotal = totalForGate > 0 ? jepqCAD / totalForGate : 1;
      const sgovPlanned = Math.max(0, input.sgovWeeklyCAD * 52);
      const jepqPlanned = Math.max(0, input.jepqWeeklyCAD * 52);
      const sgovGated = !(sgovPctOfTotal < RULEBOOK_TARGETS.SGOV_TARGET_PCT / 100);
      const jepqGated = !(jepqPctOfTotal < RULEBOOK_TARGETS.QQQI_MAX_PCT / 100 && input.tfsaRoomExists);
      const annualSGOV = sgovGated ? 0 : sgovPlanned;
      const annualQQQI = jepqGated ? 0 : jepqPlanned;
      if (redirectGated) {
        if (sgovGated) annualCore += sgovPlanned;
        if (jepqGated) annualCore += jepqPlanned;
      }
      cumContrib += annualCore + annualSGOV + annualQQQI;

      // (2) Static 70/30 — overlay-aware (TQQQ > 0 at start of year ⇒ SCHD 70 / TQQQ 30 / QLD 0).
      const overlayActive = tqqqCAD > 0;
      const schdBuy  = annualCore * (RULEBOOK_TARGETS.SCHD_OF_CORE_PCT / 100);
      const growthBuy = annualCore * (RULEBOOK_TARGETS.QLD_OF_CORE_PCT  / 100);
      const qldBuy  = overlayActive ? 0 : growthBuy;
      const tqqqBuy = overlayActive ? growthBuy : 0;

      // (3) DCA growth (mid-year average by default)
      schdCAD = schdCAD * (1 + SCHD_CAGR) + schdBuy * (1 + SCHD_CAGR * dcaFactor);
      qldCAD  = qldCAD  * (1 + QLD_CAGR)  + qldBuy  * (1 + QLD_CAGR  * dcaFactor);
      sgovCAD = sgovCAD * (1 + SGOV_FIXED_CAGR) + annualSGOV * (1 + SGOV_FIXED_CAGR * dcaFactor);
      // QQQI: covered-call ETF; proxy growth = scenario CAGR (held in TFSA so no withholding model needed).
      jepqCAD = jepqCAD * (1 + SCHD_CAGR) + annualQQQI * (1 + SCHD_CAGR * dcaFactor);
      // TQQQ: leveraged-Nasdaq proxy growth + overlay contributions (if any).
      tqqqCAD = tqqqCAD * (1 + SCHD_CAGR * TQQQ_LEVERAGE_FACTOR) + tqqqBuy * (1 + SCHD_CAGR * TQQQ_LEVERAGE_FACTOR * dcaFactor);

      // (4) Recompute weights for rulebook decisions
      const totalNow = schdCAD + qldCAD + sgovCAD + jepqCAD + tqqqCAD;
      const w = computeRulebookWeights([
        { ticker: "SCHD", valueCAD: schdCAD },
        { ticker: "QLD",  valueCAD: qldCAD },
        { ticker: "SGOV", valueCAD: sgovCAD },
        { ticker: "QQQI", valueCAD: jepqCAD },
        { ticker: "TQQQ", valueCAD: tqqqCAD },
      ]);

      // (5) Priority order per rulebook v4.4.2: Emergency cap (38%) → Soft Exit (34%) → Crisis → Annual Rebal
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

      // Crisis trigger (independent — cycle gating prevents repeat within a cycle)
      if (w.crisisT2 && cycleArmed && !t2Fired) {
        const plan = computeCrisisTriggerPlan({
          totalCAD: totalNow, sgovCAD, crisisT1: false, crisisT2: true, cycleArmed, tqqqCAD,
        });
        if (plan.active) {
          sgovCAD -= plan.sgovSaleCAD;
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
          tqqqCAD += plan.tqqqBuyCAD;
          t1Fired = true;
          crisisT1Applied = true;
          counts.crisisT1++;
        }
      }

      // Annual rebalance (Dec 31) — only when no Emergency cap / Soft Exit fired this year
      if (!hardExitApplied && !softExitApplied) {
        const w2 = computeRulebookWeights([
          { ticker: "SCHD", valueCAD: schdCAD },
          { ticker: "QLD",  valueCAD: qldCAD },
          { ticker: "SGOV", valueCAD: sgovCAD },
          { ticker: "QQQI", valueCAD: jepqCAD },
          { ticker: "TQQQ", valueCAD: tqqqCAD },
        ]);
        const reb = computeAnnualRebalancePlan({
          schdCAD, qldCAD, tqqqCAD, sgovCAD,
          totalCAD: schdCAD + qldCAD + sgovCAD + jepqCAD + tqqqCAD,
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
          qldCAD += reb.qldBuyCAD;
          sgovCAD += reb.sgovDeltaCAD;  // negative
          caseBApplied = true;
          counts.caseB++;
        }
      }

      // (6) v4.4.2: no age-based QQQI exit. Legacy age-65 IAUM → QLD exit removed.

      // (7) Dividend snapshot (TQQQ pays effectively 0).
      // Yield is held CONSTANT — dividend dollars grow via balance × yield (CAGR captures
      // total return; multiplying yield by (1+divGrowth) on top compounds with CAGR and
      // produces unrealistic 90%+ yield-of-balance figures in 20yr horizons.
      const coreCAD = schdCAD + qldCAD;
      const totalCAD = schdCAD + qldCAD + sgovCAD + jepqCAD + tqqqCAD;
      const annualDivGross = schdCAD * schdYld + qldCAD * qldYld + sgovCAD * sgovYld + jepqCAD * jepqYld;
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

      // (9) Cycle reset: TQQQ=0 AND growth bucket ≥ 30 → re-arm
      const growthBucketPctNow = totalCAD > 0 ? ((qldCAD + tqqqCAD) / totalCAD) * 100 : 0;
      if (tqqqCAD <= 0 && growthBucketPctNow >= RULEBOOK_TARGETS.CYCLE_RESET_GROWTH_BUCKET_PCT) {
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
          jepqCAD: Math.round(jepqCAD),
          tqqqCAD: Math.round(tqqqCAD),
          totalCAD: Math.round(totalCAD),
          qldCoreWeightPct:   coreCAD > 0 ? Math.round((qldCAD / coreCAD) * 1000) / 10 : 0,
          growthBucketPct:    Math.round(growthBucketPctNow * 10) / 10,
          sgovTotalWeightPct: totalCAD > 0 ? Math.round((sgovCAD / totalCAD) * 1000) / 10 : 0,
          jepqTotalWeightPct: totalCAD > 0 ? Math.round((jepqCAD / totalCAD) * 1000) / 10 : 0,
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
