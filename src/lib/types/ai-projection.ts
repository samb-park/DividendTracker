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

// Rulebook-based projection point (v4.4.6.1). Per-asset CAD evolves year-by-year
// through static 70/30 contribution / SGOV (base 5% / max 8% / no floor) / QQQM gating (TFSA only) /
// Soft Exit (34%) / Emergency cap (38%) / Crisis (SGOV→TQQQ, month-end) / Case A/B annual rebal /
// QQQM 12/31 annual skim (4% if USD-profitable).
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

// v4.4.6.1 — Static 70/30 Core allocation. Overlay (TQQQ > 0) moves the 30% to TQQQ.
// Satellite streams: SGOV (user-settings only) + QQQM (TFSA only, weekly 45 CAD CAD-accum, no cap).
export interface CoreAllocationPlan {
  weeklyContribCAD: number;
  coreContribCAD: number;
  schdBuyCAD: number;
  qldBuyCAD: number;
  tqqqBuyCAD: number;
  overlayActive: boolean;
  sgovReserveCAD: number;
  /** Weekly CAD accumulation toward quarterly NG batch (user handles externally). */
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
 * v4.4.6.1 §4 — QQQM annual skim eligibility report (12/31 only, USD-profitable check).
 * Server-side computed once per AI call; UI renders eligibility + next-skim-date row.
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

// v4.4.2 — three event-driven plans.
//
// TqqqExitPlanOut: §6.2 Soft (growth bucket ≥ 34%, half TQQQ) / §10 Emergency cap (≥ 38%, all TQQQ + QLD to 30% core).
// Proceeds order: SGOV → 8% of total → SCHD.
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

// CrisisTriggerPlanOut: §6.1 (core W ≤25 → T1, ≤20 → T2). SGOV → TQQQ buy.
// Only mechanism that may pierce SGOV 5% floor. Cycle-gated by `cycleArmable`.
export interface CrisisTriggerPlanOut {
  active: boolean;
  tier?: "T1" | "T2";
  sgovSaleCAD?: number;
  tqqqBuyCAD?: number;
  postSgovTotalWeightPct?: number;
  reason?: string;
}

// AnnualRebalancePlanOut: §5 Dec-31 rebalance with ±1% deadband.
//   Case A (W >31): QLD sale → SGOV 8% → SCHD.
//   Case B (W <29 AND TQQQ=0): SGOV (above 5% floor) → QLD.
//   case_b_no_room: Case B eligible but SGOV at/below 5% floor → no action.
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
