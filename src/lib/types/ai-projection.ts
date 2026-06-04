// Shared client types for /api/ai/projection response. Mirrors the server
// payload built in src/app/api/ai/projection/route.ts. Keeping them here
// lets multiple components consume the same response without redeclaring
// near-identical interfaces.

// Legacy 6-field point shape — kept for backward compatibility on the projection
// table that doesn't show per-asset breakdown (e.g. mobile compact view).
export interface ProjectionYear {
  year: number;
  yearsFromNow: number;
  portfolioCAD: number;
  annualDivCAD: number;
  monthlyDivCAD: number;
  totalContribCAD: number;
}

// Rulebook-based projection point (v4.5.1). Per-asset CAD evolves year-by-year
// through static 60/40 contribution / SGOV target-range / TQQQ VR-Lite /
// Crisis (SGOV→QLD, month-end) / year-end rebalance.
export interface ProjectionYearV2 {
  year: number;
  yearsFromNow: number;
  schdCAD: number;
  qldCAD: number;
  sgovCAD: number;
  qqqmCAD: number;
  tqqqCAD: number;
  totalCAD: number;
  qldCoreWeightPct: number;
  growthBucketPct: number;
  sgovTotalWeightPct: number;
  qqqmTotalWeightPct: number;
  annualDivCAD: number;
  monthlyDivCAD: number;
  totalContribCAD: number;
  hardExitApplied: boolean;
  softExitApplied: boolean;
  crisisT1Applied: boolean;
  crisisT2Applied: boolean;
  caseAApplied: boolean;
  caseBApplied: boolean;
  qqqmSkimApplied: boolean;
  // Retirement phase ([10] / [11] / [16])
  withdrawalCAD: number;
  dividendConsumedCAD: number;
  pensionCAD: number;
  monthlyCashflowCAD: number;
}

export interface ProjectionScenario {
  id: "base" | "pessimistic" | "worst";
  label: string;
  cagrPct: number;
  points: ProjectionYearV2[];
  triggerCounts?: {
    hardExit: number;
    softExit: number;
    crisisT1: number;
    crisisT2: number;
    caseA: number;
    caseB: number;
    qqqmSkim: number;
  };
}

export interface ProjectionAssumptions {
  scenarioCagrsPct?: { id: string; label: string; cagrPct: number }[];
  portfolioCagrPct: number;
  divYieldPct: number;
  divGrowthPct: number;
  annualContribCAD: number;
  weeklyContribCAD?: number;
  contribFrequency: string;
  currentValueCAD: number;
  currentAnnualDivCAD: number;
  retirementYear: number | null;
  rulebookVersion?: string;
}

export interface CurrentState {
  portfolioValueCAD: number;
  coreCAD: number;
  schdCAD: number;
  qldCAD: number;
  sgovCAD: number;
  qqqmCAD: number;
  tqqqCAD: number;
  qldCoreWeightPct: number;
  schdCoreWeightPct: number;
  growthBucketPct: number;
  sgovTotalWeightPct: number;
  qqqmTotalWeightPct: number;
  tqqqTotalWeightPct: number;
  flags: {
    hardExit: boolean;
    softExit: boolean;
    crisisT1: boolean;
    crisisT2: boolean;
    caseAEligible: boolean;
    caseBEligible: boolean;
    inDeadband: boolean;
    cycleArmable: boolean;
    sgovBelowTarget: boolean;     // SGOV total W < 5 (base target)
    sgovAboveMax: boolean;        // SGOV total W > 8 (above ceiling)
    overlayActive: boolean;
  };
}

export type NonCoreSource = "user-settings" | "rulebook-default" | "rulebook-inactive";

// v4.5.1 — Static 60/40 Core allocation. No TQQQ overlay.
// Satellite stream: SGOV user-settings only. QQQM is hold-only/no-new-buy.
export interface CoreAllocationPlan {
  weeklyContribCAD: number;
  coreContribCAD: number;
  schdBuyCAD: number;
  qldBuyCAD: number;
  tqqqBuyCAD: number;
  overlayActive: boolean;
  sgovReserveCAD: number;
  /** v4.5.1: always 0; QQQM is hold-only/no-new-buy. */
  qqqmCashAccumCAD: number;
  sgovSource?: NonCoreSource;
  qqqmSource?: NonCoreSource;
  totalWeeklyOutCAD?: number;
}

export interface QqqmWeeklyPlan {
  qqqmRuleCashAccumCAD: number;
  qqqmActualCashAccumCAD: number;
  redirectedToCoreCAD: number;
  reason: string;
  tfsaRoomExists: boolean;
  account: string;
  weeklyDefaultCAD: number;
}

/**
 * v4.5.1 legacy compatibility object. QQQM annual skim is abolished; estimated amount is always 0.
 */
export interface QqqmAnnualSkimPlan {
  nextSkimDateISO: string;
  isPostponed: boolean;
  postponeReason: "weekend-12-30" | "weekend-12-29" | null;
  daysUntilSkim: number;
  cumulativeCostUsd: number;
  cumulativeShares: number;
  estimatedSkimAmountUsd: number;
  eligibilityHint: string;
  pUsdAvg: number;
  vUsd: number;
}

// v4.5.1: Soft Exit / Emergency cap abolished. Kept for response-shape compatibility; active should remain false.
export interface TqqqExitPlanOut {
  active: boolean;
  variant?: "soft" | "hard";
  tqqqSaleCAD?: number;
  qldSaleCAD?: number;
  sgovRefillCAD?: number;
  schdBuyCAD?: number;
  postGrowthBucketPct?: number;
  proceedsOrder?: string;
}

// CrisisTriggerPlanOut: §6.1 (core W ≤25 → T1, ≤20 → T2). SGOV → QLD buy.
// SGOV may exhaust to 0%; reset when QLD core weight ≥ 30%.
export interface CrisisTriggerPlanOut {
  active: boolean;
  tier?: "T1" | "T2";
  sgovSaleCAD?: number;
  tqqqBuyCAD?: number;
  qldBuyCAD?: number;
  postSgovTotalWeightPct?: number;
  reason?: string;
}

// AnnualRebalancePlanOut: §5 Dec-31 rebalance with ±1% deadband.
//   v4.5.1: Core target is 60/40; overshoot trim proceeds route to SGOV. Case B remains no-action.
export interface AnnualRebalancePlanOut {
  action: "deadband" | "case_a" | "case_b" | "case_b_no_room";
  qldSaleCAD?: number;
  qldBuyCAD?: number;
  sgovDeltaCAD?: number;
  schdBuyCAD?: number;
  postQldCoreWeightPct?: number;
}

export interface ProjectionApiResponse {
  projections?: ProjectionYear[];
  scenarios?: ProjectionScenario[];
  assumptions?: ProjectionAssumptions;
  currentState?: CurrentState;
  coreAllocationPlan?: CoreAllocationPlan;
  qqqmWeeklyPlan?: QqqmWeeklyPlan;
  qqqmAnnualSkimPlan?: QqqmAnnualSkimPlan;
  tqqqExitPlan?: TqqqExitPlanOut;
  crisisTriggerPlan?: CrisisTriggerPlanOut;
  annualRebalancePlan?: AnnualRebalancePlanOut;
  triggers?: { summary: string[] };
  narrative?: string;
  cached?: boolean;
  remaining?: number | null;
  error?: string;
}

export function nonCoreSourceLabel(s?: NonCoreSource): string {
  return s === "user-settings"
    ? "사용자 Settings"
    : s === "rulebook-default"
      ? "룰북 default"
      : "비활성";
}
