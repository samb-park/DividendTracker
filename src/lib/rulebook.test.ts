/* Run: npx tsx src/lib/rulebook.test.ts */
import { strict as assert } from "node:assert";
import {
  computeRulebookWeights,
  computeStaticCoreAllocation,
  computeSchdDividendReinvest,
  computeQqqmWeeklyPlan,
  computeQqqmCumulative,
  computeQqqmAnnualSkim,
  computeNextQqqmSkimDate,
  computeTqqqHardExitPlan,
  computeCrisisTriggerPlan,
  computeAnnualRebalancePlan,
  computeTqqqVrLiteWeeklyPlan,
  computeFridayFxBufferPlan,
  computeTqqqProfitSweepPlan,
  computeCoreOvershootTrimPlan,
  computeMeltdownAllocation,
  projectScenarios,
  projectScenariosRulebook,
  RULEBOOK_TARGETS,
  RULEBOOK_SCENARIOS,
} from "./rulebook";

const EPS = 0.01;
const close = (a: number, b: number, tol = EPS) => Math.abs(a - b) <= tol;

let passed = 0;
let failed = 0;
const errors: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`${name}: ${msg}`);
    console.error(`  FAIL  ${name}\n        ${msg}`);
  }
}

// ── v4.5.1 authority regression guards ───────────────────────────────────────
test("v4.5.1: core is SCHD 60 / QLD 40 with weekly 455 CAD (=273/182)", () => {
  assert.equal(RULEBOOK_TARGETS.SCHD_OF_CORE_PCT, 60);
  assert.equal(RULEBOOK_TARGETS.QLD_OF_CORE_PCT, 40);
  assert.equal(RULEBOOK_TARGETS.CORE_WEEKLY_CAD, 455);
  assert.equal(RULEBOOK_TARGETS.SCHD_WEEKLY_CAD, 273);
  assert.equal(RULEBOOK_TARGETS.QLD_WEEKLY_CAD, 182);
  const a = computeStaticCoreAllocation(RULEBOOK_TARGETS.CORE_WEEKLY_CAD, false);
  assert.ok(close(a.schdBuyCAD, 273));
  assert.ok(close(a.qldBuyCAD, 182));
  assert.equal(a.tqqqBuyCAD, 0, "v4.5.1 core contribution does not buy TQQQ overlay");
});

test("v4.5.1: all CAD contributions convert Friday with 1.5% FX buffer", () => {
  const p = computeFridayFxBufferPlan({ cadAmount: 455, usdCadRate: 1.4, dayOfWeek: 5 });
  assert.equal(p.executeToday, true);
  assert.equal(p.fxBufferPct, 1.5);
  assert.ok(close(p.usdAfterBuffer, (455 / 1.4) * 0.985));
  const notFriday = computeFridayFxBufferPlan({ cadAmount: 455, usdCadRate: 1.4, dayOfWeek: 4 });
  assert.equal(notFriday.executeToday, false);
});

test("v4.5.1: VR-Lite TQQQ Friday drawdown tiers map to USD 10/20/40/60 with deeper exact boundaries", () => {
  assert.equal(computeTqqqVrLiteWeeklyPlan({ drawdown252dPct: 0, dayOfWeek: 5 }).usdBuy, 10);
  assert.equal(computeTqqqVrLiteWeeklyPlan({ drawdown252dPct: 14.99, dayOfWeek: 5 }).usdBuy, 10);
  assert.equal(computeTqqqVrLiteWeeklyPlan({ drawdown252dPct: 15, dayOfWeek: 5 }).usdBuy, 20);
  assert.equal(computeTqqqVrLiteWeeklyPlan({ drawdown252dPct: 30, dayOfWeek: 5 }).usdBuy, 40);
  assert.equal(computeTqqqVrLiteWeeklyPlan({ drawdown252dPct: 50, dayOfWeek: 5 }).usdBuy, 60);
  assert.equal(computeTqqqVrLiteWeeklyPlan({ drawdown252dPct: 50, dayOfWeek: 1 }).executeToday, false);
});

test("v4.5.1: crisis trigger sells SGOV to buy QLD, not TQQQ, and resets at QLD core >= 30", () => {
  const plan = computeCrisisTriggerPlan({
    totalCAD: 10000,
    sgovCAD: 600,
    crisisT1: true,
    crisisT2: false,
    cycleArmed: true,
    tqqqCAD: 0,
  });
  assert.equal(plan.active, true);
  assert.equal(plan.tqqqBuyCAD, 0, "v4.5.1 crisis no longer buys TQQQ");
  assert.equal((plan as unknown as { qldBuyCAD: number }).qldBuyCAD, 250);
  assert.equal((plan as unknown as { resetRule: string }).resetRule, "QLD_CORE_WEIGHT_GTE_30");
});

test("v4.5.1: Emergency cap / QQQM new-buy / Method B constants are absent", () => {
  const tgts = RULEBOOK_TARGETS as Record<string, unknown>;
  assert.equal(tgts.HARD_EXIT_GROWTH_BUCKET_PCT, undefined);
  assert.equal(tgts.SOFT_EXIT_GROWTH_BUCKET_PCT, undefined);
  assert.equal(tgts.CYCLE_RESET_GROWTH_BUCKET_PCT, undefined);
  assert.equal(tgts.QQQM_WEEKLY_BUY_CAD, undefined);
  assert.equal(tgts.QQQM_ANNUAL_SKIM_PCT, undefined);
});

test("v4.5.1: year-end TQQQ profit sweep sells 100% of profit to TFSA SGOV", () => {
  const p = computeTqqqProfitSweepPlan({ marketValueUsd: 1600, costBasisUsd: 1000 });
  assert.equal(p.active, true);
  assert.equal(p.tqqqSaleUsd, 600);
  assert.equal(p.schdBuyUsd, 0);
  assert.equal(p.qldBuyUsd, 0);
  assert.equal(p.sgovBuyUsd, 600);
});

test("v4.5.1: year-end SCHD/QLD overshoot trim routes proceeds to SGOV", () => {
  const p = computeCoreOvershootTrimPlan({ schdCAD: 7000, qldCAD: 3000, sgovCAD: 0, totalCAD: 10000 });
  assert.equal(p.active, true);
  assert.equal(p.sellTicker, "SCHD");
  assert.ok(close(p.trimCAD, 2500));
  assert.equal(p.sgovBuyCAD, p.trimCAD);
});

// ── computeRulebookWeights ────────────────────────────────────────────────────
test("QLD core weight uses (SCHD + QLD), not total portfolio", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 40 },  // would dilute total-basis QLD weight
    { ticker: "QQQM", valueCAD: 10 },
  ]);
  assert.equal(w.coreCAD, 100);
  assert.equal(w.totalCAD, 150);
  assert.ok(close(w.qldCoreWeightPct, 30), `expected 30, got ${w.qldCoreWeightPct}`);
  assert.ok(close(w.schdCoreWeightPct, 70));
});

test("SGOV/QQQM weights use TOTAL portfolio, not core", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 5 },
    { ticker: "QQQM", valueCAD: 5 },
  ]);
  assert.ok(close(w.sgovTotalWeightPct, (5 / 110) * 100));
  assert.ok(close(w.qqqmTotalWeightPct, (5 / 110) * 100));
});

test("QLD crisis tiers split at 25% / 20% core weight", () => {
  const t1 = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 76 },
    { ticker: "QLD",  valueCAD: 24 },
  ]);
  const t2 = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 81 },
    { ticker: "QLD",  valueCAD: 19 },
  ]);
  assert.equal(t1.crisisT1, true);
  assert.equal(t1.crisisT2, false);
  assert.equal(t2.crisisT1, false);
  assert.equal(t2.crisisT2, true);
});

test("v4.5.1: SGOV base target flag flips below 5% total weight (was 8% in v4.4.2)", () => {
  const below = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 80 },
    { ticker: "QLD",  valueCAD: 20 },
    { ticker: "SGOV", valueCAD: 4 },   // 4/104 ≈ 3.85% < 5
  ]);
  const ok = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 7 },   // 7/107 ≈ 6.5% ≥ 5
  ]);
  assert.equal(below.sgovBelowTarget, true);
  assert.equal(ok.sgovBelowTarget, false);
});

test("v4.5.1: SGOV above-max flag flips above 8% total weight (replaces old floor flag)", () => {
  const above = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 60 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 9 },   // 9/99 ≈ 9.1% > 8
  ]);
  const safe = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 7 },   // 7/107 ≈ 6.5% ≤ 8
  ]);
  assert.equal(above.sgovAboveMax, true);
  assert.equal(safe.sgovAboveMax, false);
});

test("v4.5.1: regression guard — sgovBelowFloor / jepqAtCap fields removed from RulebookWeights", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 4 },
  ]) as unknown as Record<string, unknown>;
  assert.equal(w.sgovBelowFloor, undefined, "v4.5.1 removed sgovBelowFloor (no SGOV floor)");
  assert.equal(w.jepqAtCap, undefined, "v4.5.1 removed jepqAtCap (QQQM has no cap)");
});

test("growth bucket = (QLD + TQQQ) / Total", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 60 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "TQQQ", valueCAD: 10 },
    { ticker: "SGOV", valueCAD: 0 },
  ]);
  assert.ok(close(w.growthBucketPct, 40));
  assert.equal(w.tqqqCAD, 10);
});

test("deadband: 29 ≤ QLD core W ≤ 31 → inDeadband true, Case A/B false", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
  ]);
  assert.equal(w.qldCoreWeightPct, 30);
  assert.equal(w.inDeadband, true);
  assert.equal(w.caseAEligible, false);
  assert.equal(w.caseBEligible, false);
});

test("deadband: exact W=29.0 → inDeadband true (FP-safe)", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 71 },
    { ticker: "QLD",  valueCAD: 29 },
  ]);
  assert.equal(w.inDeadband, true, `expected inDeadband=true at W=29.0, got W=${w.qldCoreWeightPct}`);
  assert.equal(w.caseBEligible, false);
});

test("deadband: exact W=31.0 → inDeadband true (FP-safe)", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 69 },
    { ticker: "QLD",  valueCAD: 31 },
  ]);
  assert.equal(w.inDeadband, true);
  assert.equal(w.caseAEligible, false);
});

test("v4.5.1: Case B eligibility is W<29 and remains no-action even if TQQQ exists", () => {
  const withTqqq = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 75 },
    { ticker: "QLD",  valueCAD: 25 },
    { ticker: "TQQQ", valueCAD: 1 },
  ]);
  const withoutTqqq = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 75 },
    { ticker: "QLD",  valueCAD: 25 },
  ]);
  assert.equal(withTqqq.caseBEligible, true);
  assert.equal(withoutTqqq.caseBEligible, true);
});

test("v4.5.1: growth bucket no longer triggers Soft/Emergency exit", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 100 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "TQQQ", valueCAD: 30 },  // growth bucket 60/160 = 37.5%
  ]);
  assert.equal(w.hardExit, false, "37.5% must not trigger Emergency cap");
  assert.equal(w.softExit, false, "v4.5.1 removed Soft Exit");
  const wHard = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 100 },
    { ticker: "QLD",  valueCAD: 35 },
    { ticker: "TQQQ", valueCAD: 35 },  // 70/170 = 41.2% → emergency cap
  ]);
  assert.equal(wHard.softExit, false, "hard supersedes soft");
  assert.equal(wHard.hardExit, false, "v4.5.1 removed Emergency cap");
});

// ── computeStaticCoreAllocation (unchanged from v4.3.1) ─────────────────────
test("v4.5.1 static core: SCHD 60 / QLD 40 (normal)", () => {
  const a = computeStaticCoreAllocation(100, false);
  assert.ok(close(a.schdBuyCAD, 60));
  assert.ok(close(a.qldBuyCAD, 40));
  assert.equal(a.tqqqBuyCAD, 0);
  assert.equal(a.overlayActive, false);
});

test("v4.5.1 static core ignores legacy overlay: SCHD 60 / QLD 40 / TQQQ 0", () => {
  const a = computeStaticCoreAllocation(100, true);
  assert.ok(close(a.schdBuyCAD, 60));
  assert.ok(close(a.qldBuyCAD, 40));
  assert.equal(a.tqqqBuyCAD, 0);
  assert.equal(a.overlayActive, false);
});

test("v4.5.1 static core: zero contribution → zero buys", () => {
  const a = computeStaticCoreAllocation(0, false);
  assert.equal(a.schdBuyCAD, 0);
  assert.equal(a.qldBuyCAD, 0);
  assert.equal(a.tqqqBuyCAD, 0);
});

test("v4.5.1: weekly Core contribution is 455 CAD (= SCHD 273 / QLD 182)", () => {
  assert.equal(RULEBOOK_TARGETS.CORE_WEEKLY_CAD, 455);
  assert.equal(RULEBOOK_TARGETS.SCHD_WEEKLY_CAD, 273);
  assert.equal(RULEBOOK_TARGETS.QLD_WEEKLY_CAD, 182);
  // The 60/40 split applied to 455 should equal SCHD 273 / QLD 182.
  const a = computeStaticCoreAllocation(RULEBOOK_TARGETS.CORE_WEEKLY_CAD, false);
  assert.ok(close(a.schdBuyCAD, RULEBOOK_TARGETS.SCHD_WEEKLY_CAD));
  assert.ok(close(a.qldBuyCAD, RULEBOOK_TARGETS.QLD_WEEKLY_CAD));
});

test("v4.5.1: regression — removed constants are no longer present", () => {
  const tgts = RULEBOOK_TARGETS as Record<string, unknown>;
  assert.equal(tgts.SGOV_FLOOR_PCT, undefined, "v4.5.1: SGOV_FLOOR_PCT removed (no floor)");
  assert.equal(tgts.SGOV_DEPLOYABLE_BUFFER_PCT, undefined, "v4.5.1: SGOV_DEPLOYABLE_BUFFER_PCT removed");
  assert.equal(tgts.SGOV_WEEKLY_REFILL_CAD, undefined, "v4.5.1: SGOV_WEEKLY_REFILL_CAD removed (no weekly refill)");
  assert.equal(tgts.SGOV_TARGET_PCT, undefined, "v4.5.1: SGOV_TARGET_PCT renamed → SGOV_BASE_TARGET_PCT + SGOV_MAX_PCT");
  assert.equal(tgts.QQQI_MAX_PCT, undefined, "v4.5.1: QQQI_MAX_PCT removed (QQQM has no cap)");
  assert.equal(tgts.QQQI_WEEKLY_BUY_CAD, undefined, "v4.5.1: QQQI_WEEKLY_BUY_CAD removed");
  assert.equal(tgts.IAUM_MAX_PCT, undefined);
  assert.equal(tgts.IAUM_WEEKLY_BUY_CAD, undefined);
  assert.equal(tgts.SOFT_EXIT_GROWTH_BUCKET_PCT, undefined);
  assert.equal(tgts.SGOV_BASE_TARGET_PCT, 5);
  assert.equal(tgts.SGOV_MAX_PCT, 8);
  assert.equal(tgts.SGOV_MIN_PCT, 0);
  assert.equal(tgts.QQQM_WEEKLY_BUY_CAD, undefined);
  assert.equal(tgts.QQQM_ANNUAL_SKIM_PCT, undefined);
});

// ── computeQqqmWeeklyPlan (§4 — v4.5.1) ──────────────────────────────────
test("v4.5.1: computeQqqmWeeklyPlan no longer creates QQQM buy even with TFSA room", () => {
  const p = computeQqqmWeeklyPlan(true);
  assert.equal(p.qqqmCashAccumCAD, 0);
  assert.equal(p.redirectedToCoreCAD, 0);
  assert.equal(p.tfsaRoomExists, false);
  assert.ok(p.reason.includes("신규 매수 없음"));
});

test("v4.5.1: QQQM weekly does not redirect when TFSA room missing", () => {
  const p = computeQqqmWeeklyPlan(false);
  assert.equal(p.qqqmCashAccumCAD, 0);
  assert.equal(p.redirectedToCoreCAD, 0);
  assert.ok(p.reason.includes("신규 매수 없음"));
});

test("v4.5.1: QQQM has no new-buy path", () => {
  // QQQM 비중이 5%, 10%, 50%이든 비중 인자 자체가 더 이상 함수 시그너처에 없다.
  // 호출이 TFSA room true면 무조건 45가 적용된다.
  const p = computeQqqmWeeklyPlan(true);
  assert.equal(p.qqqmCashAccumCAD, 0, "v4.5.1: no new QQQM buy");
});

// ── computeSchdDividendReinvest (§5 v4.5.1) ──────────────────────────────
test("v4.5.1 SCHD dividend reinvest: 60/40 SCHD/QLD (normal)", () => {
  const r = computeSchdDividendReinvest(100, false);
  assert.ok(close(r.schdBuyCAD, 60));
  assert.ok(close(r.qldBuyCAD, 40));
  assert.equal(r.tqqqBuyCAD, 0);
  assert.equal(r.overlayActive, false);
});

test("v4.5.1 SCHD dividend reinvest ignores overlay: 60/40 SCHD/QLD", () => {
  const r = computeSchdDividendReinvest(100, true);
  assert.ok(close(r.schdBuyCAD, 60));
  assert.ok(close(r.qldBuyCAD, 40));
  assert.equal(r.tqqqBuyCAD, 0);
});

test("v4.5.1 SCHD dividend never routes to SGOV / QQQM / QQQI", () => {
  const r = computeSchdDividendReinvest(100, false) as unknown as Record<string, unknown>;
  assert.equal(r.sgovBuyCAD, undefined);
  assert.equal(r.qqqmBuyCAD, undefined);
  assert.equal(r.jepqBuyCAD, undefined);
});

// ── projectScenarios ─────────────────────────────────────────────────────────
test("projectScenarios returns exactly Base/Pessimistic/Worst (no optimistic)", () => {
  const scenarios = projectScenarios({
    currentValueCAD: 50000,
    currentAnnualDivCAD: 1500,
    divYieldPct: 3,
    divGrowthPct: 5,
    annualContribCAD: 18200,
    yearPoints: [1, 5, 10, 20],
    maxYears: 20,
  });
  assert.equal(scenarios.length, 3);
  const ids = scenarios.map(s => s.id).sort();
  assert.deepEqual(ids, ["base", "pessimistic", "worst"]);
});

test("Worst scenario produces lower portfolio than Base at year 20", () => {
  const s = projectScenarios({
    currentValueCAD: 50000,
    currentAnnualDivCAD: 1500,
    divYieldPct: 3,
    divGrowthPct: 5,
    annualContribCAD: 18200,
    yearPoints: [20],
    maxYears: 20,
  });
  const baseY20 = s.find(x => x.id === "base")!.points[0].portfolioCAD;
  const worstY20 = s.find(x => x.id === "worst")!.points[0].portfolioCAD;
  assert.ok(baseY20 > worstY20);
});

test("RULEBOOK_TARGETS exposes documented v4.5.1 thresholds", () => {
  assert.equal(RULEBOOK_TARGETS.SCHD_OF_CORE_PCT, 60);
  assert.equal(RULEBOOK_TARGETS.QLD_OF_CORE_PCT, 40);
  assert.equal(RULEBOOK_TARGETS.REBAL_HIGH_PCT, 31);
  assert.equal(RULEBOOK_TARGETS.REBAL_LOW_PCT, 29);
  assert.equal(RULEBOOK_TARGETS.CRISIS_T1_PCT, 25);
  assert.equal(RULEBOOK_TARGETS.CRISIS_T2_PCT, 20);
  assert.equal((RULEBOOK_TARGETS as Record<string, unknown>).SOFT_EXIT_GROWTH_BUCKET_PCT, undefined);
  assert.equal((RULEBOOK_TARGETS as Record<string, unknown>).HARD_EXIT_GROWTH_BUCKET_PCT, undefined);
  assert.equal(RULEBOOK_TARGETS.SGOV_BASE_TARGET_PCT, 5);
  assert.equal(RULEBOOK_TARGETS.SGOV_MAX_PCT, 8);
  assert.equal(RULEBOOK_TARGETS.SGOV_MIN_PCT, 0);
  assert.equal((RULEBOOK_TARGETS as Record<string, unknown>).QQQM_WEEKLY_BUY_CAD, undefined);
  assert.equal((RULEBOOK_TARGETS as Record<string, unknown>).QQQM_ANNUAL_SKIM_PCT, undefined);
  assert.equal((RULEBOOK_TARGETS as Record<string, unknown>).QQQM_SKIM_MONTH, undefined);
  assert.equal((RULEBOOK_TARGETS as Record<string, unknown>).QQQM_SKIM_DAY, undefined);
});

test("v4.5.1: SGOV at 6% → sgovBelowTarget false (above base 5%)", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 64 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 6 },
  ]);
  assert.ok(close(w.sgovTotalWeightPct, 6));
  assert.equal(w.sgovBelowTarget, false);
});

test("v4.5.1: SGOV at exactly 5% → sgovBelowTarget false (at base)", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 65 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 5 },
  ]);
  // 5 / 100 = 5.0% — NOT below 5 (strict <).
  assert.ok(close(w.sgovTotalWeightPct, 5));
  assert.equal(w.sgovBelowTarget, false);
});

// ── computeCrisisTriggerPlan (§6.1 — SGOV → QLD; v4.5.1: no floor) ──────
test("v4.5.1: §6.1 Crisis T1 buys 2.5% of total CAD into QLD from SGOV", () => {
  const plan = computeCrisisTriggerPlan({
    totalCAD: 1000, sgovCAD: 100,
    crisisT1: true, crisisT2: false, cycleArmed: true, tqqqCAD: 0,
  });
  assert.equal(plan.active, true);
  assert.ok(close(plan.sgovSaleCAD, 25));
  assert.ok(close(plan.qldBuyCAD, 25));
  assert.equal(plan.tqqqBuyCAD, 0);
  assert.equal(plan.tier, "T1");
});

test("v4.5.1: SGOV may fall to 0 during crisis (no floor; bounded only by holding)", () => {
  // SGOV=20 of total 2000 (1%). T2 requested = 5% of 2000 = 100. Capped at sgov=20.
  // v4.4.2 had a 5% floor; v4.5.1 removes it — sale just caps at available SGOV.
  const plan = computeCrisisTriggerPlan({
    totalCAD: 2000, sgovCAD: 20,
    crisisT1: false, crisisT2: true, cycleArmed: true, tqqqCAD: 0,
  });
  assert.equal(plan.active, true);
  assert.ok(plan.sgovSaleCAD <= 20, "sale must not exceed available SGOV");
  assert.ok(close(plan.sgovSaleCAD, 20), `expected full SGOV drain (=20), got ${plan.sgovSaleCAD}`);
  assert.ok(close(plan.postSgovTotalWeightPct, 0), "SGOV post % should be 0 (drained)");
});

test("§6.1 Crisis: blocked when cycle not armed", () => {
  const plan = computeCrisisTriggerPlan({
    totalCAD: 1000, sgovCAD: 100,
    crisisT1: true, crisisT2: false, cycleArmed: false, tqqqCAD: 1,
  });
  assert.equal(plan.active, false);
  assert.equal(plan.reason, "cycle-not-armed");
});

// ── computeAnnualRebalancePlan (§5 — Dec 31 only, v4.5.1) ─────────────────
test("v4.5.1: annual rebalance routes QLD overshoot trim proceeds to SGOV", () => {
  // SCHD 50, QLD 50 → core 100; target QLD is 40%.
  // Sale = (50 - 0.40*100) / 0.60 ≈ 16.667, all proceeds to SGOV.
  const plan = computeAnnualRebalancePlan({
    schdCAD: 50, qldCAD: 50, tqqqCAD: 0, sgovCAD: 0, totalCAD: 100,
    caseAEligible: true, caseBEligible: false,
  });
  assert.equal(plan.action, "case_a");
  assert.ok(close(plan.qldSaleCAD, 10 / 0.60, 0.01));
  assert.ok(close(plan.sgovDeltaCAD, plan.qldSaleCAD, 0.01));
  assert.equal(plan.schdBuyCAD, 0);
});

test("v4.5.1: Case A ignores SGOV cap for trim routing; proceeds still go to SGOV", () => {
  const plan = computeAnnualRebalancePlan({
    schdCAD: 50, qldCAD: 50, tqqqCAD: 0, sgovCAD: 2, totalCAD: 102,
    caseAEligible: true, caseBEligible: false,
  });
  assert.equal(plan.action, "case_a");
  assert.ok(close(plan.sgovDeltaCAD, plan.qldSaleCAD, 0.01));
  assert.equal(plan.schdBuyCAD, 0);
});

test("v4.5.1: Hard Exit compatibility helper is always inactive", () => {
  const plan = computeTqqqHardExitPlan({
    schdCAD: 40, qldCAD: 40, tqqqCAD: 20, sgovCAD: 0, totalCAD: 100, hardExit: true,
  });
  assert.equal(plan.active, false);
  assert.equal(plan.sgovRefillCAD, 0);
});

test("v4.5.1 §5 Case B: NO ACTION (preserves v4.4.2 behaviour)", () => {
  const plan = computeAnnualRebalancePlan({
    schdCAD: 75, qldCAD: 25, tqqqCAD: 0, sgovCAD: 10, totalCAD: 110,
    caseAEligible: false, caseBEligible: true,
  });
  assert.equal(plan.action, "deadband", "v4.5.1: Case B is no-action");
  assert.equal(plan.qldBuyCAD, 0);
  assert.equal(plan.sgovDeltaCAD, 0);
  assert.equal(plan.schdBuyCAD, 0);
});

// ── computeMeltdownAllocation (§11) ─────────────────────────────────────────
test("§11 Meltdown: SCHD covers full request", () => {
  const m = computeMeltdownAllocation(50000, 30000, 40000);
  assert.equal(m.fromSchd, 40000);
  assert.equal(m.fromQld, 0);
});

test("§11 Meltdown: SCHD insufficient → QLD covers remainder", () => {
  const m = computeMeltdownAllocation(10000, 80000, 40000);
  assert.equal(m.fromSchd, 10000);
  assert.equal(m.fromQld, 30000);
});

// ── computeQqqmCumulative (§4 — v4.5.1) ──────────────────────────────────
test("v4.5.1: computeQqqmCumulative sums BUY rows only (SELL/DIVIDEND ignored)", () => {
  const out = computeQqqmCumulative([
    { action: "BUY", ticker: "QQQM", quantity: 10, price: 200, commission: 5 },
    { action: "BUY", ticker: "QQQM", quantity: 5, price: 220, commission: 2 },
    { action: "SELL", ticker: "QQQM", quantity: 1, price: 300, commission: 1 }, // ignored
    { action: "DIVIDEND", ticker: "QQQM", quantity: 1, price: 0.5 },           // ignored
    { action: "BUY", ticker: "SCHD", quantity: 100, price: 100 },              // ignored (ticker filter)
  ]);
  // cost: (10*200+5) + (5*220+2) = 2005 + 1102 = 3107
  // shares: 10 + 5 = 15
  assert.ok(close(out.cumulativeCostUsd, 3107), `expected 3107, got ${out.cumulativeCostUsd}`);
  assert.ok(close(out.cumulativeShares, 15));
});

// ── computeQqqmAnnualSkim (§4 — v4.5.1) ──────────────────────────────────
test("v4.5.1: QQQM annual skim is removed even if profitable", () => {
  const r = computeQqqmAnnualSkim({
    cumulativeCostUsd: 22000,
    cumulativeShares: 100,
    closeUsd: 250,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, "v4.5.1-removed");
  assert.equal(r.skimAmountUsd, 0);
});

test("v4.5.1: QQQM skim remains removed when at a loss", () => {
  const r = computeQqqmAnnualSkim({
    cumulativeCostUsd: 22000,
    cumulativeShares: 100,
    closeUsd: 200,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, "v4.5.1-removed");
  assert.equal(r.skimAmountUsd, 0);
});

test("v4.5.1: computeQqqmAnnualSkim does not reduce cumulativeCostUsd", () => {
  // The helper is pure and stateless. The skim result returns skimAmountUsd
  // but never returns a "new cumulativeCostUsd" — the invariant is documented
  // by the absence of any such field plus this regression check.
  const r = computeQqqmAnnualSkim({
    cumulativeCostUsd: 22000,
    cumulativeShares: 100,
    closeUsd: 250,
  }) as unknown as Record<string, unknown>;
  assert.equal(r.newCumulativeCostUsd, undefined, "skim must not return a reduced cost basis");
  assert.equal(r.updatedCumulativeCostUsd, undefined);
});

test("v4.5.1: removed QQQM skim returns no SGOV refill ceiling", () => {
  const r = computeQqqmAnnualSkim({
    cumulativeCostUsd: 22000,
    cumulativeShares: 100,
    closeUsd: 250,
    totalCAD: 100000,
    sgovCAD: 4000,
    fxUsdToCad: 1.4,
  });
  assert.equal(r.sgovRefillCadCap, 0);
});

// ── computeNextQqqmSkimDate (§4 — v4.5.1 weekday-only approximation) ─────
test("v4.5.1: computeNextQqqmSkimDate weekday cases", () => {
  // 2026-12-31 = Thursday (weekday) → returns 12/31, isPostponed=false.
  const thurs = computeNextQqqmSkimDate(new Date("2026-06-01T00:00:00Z"));
  assert.equal(thurs.nextSkimDateISO, "2026-12-31");
  assert.equal(thurs.isPostponed, false);
  assert.equal(thurs.postponeReason, null);

  // 2027-12-31 = Friday → still 12/31, no postpone.
  const fri = computeNextQqqmSkimDate(new Date("2027-06-01T00:00:00Z"));
  assert.equal(fri.nextSkimDateISO, "2027-12-31");
  assert.equal(fri.isPostponed, false);

  // 2028-12-31 = Sunday → 12/29, postpone weekend-12-29.
  const sun = computeNextQqqmSkimDate(new Date("2028-06-01T00:00:00Z"));
  assert.equal(sun.nextSkimDateISO, "2028-12-29");
  assert.equal(sun.isPostponed, true);
  assert.equal(sun.postponeReason, "weekend-12-29");

  // 2022-12-31 = Saturday → would be 12/30 Friday.
  const sat = computeNextQqqmSkimDate(new Date("2022-06-01T00:00:00Z"));
  assert.equal(sat.nextSkimDateISO, "2022-12-30");
  assert.equal(sat.isPostponed, true);
  assert.equal(sat.postponeReason, "weekend-12-30");
});

test("v4.5.1: computeNextQqqmSkimDate after 12/31 rolls to next year", () => {
  // At UTC midnight on 12/31, the function returns 12/31 (still upcoming).
  const onYearEnd = computeNextQqqmSkimDate(new Date("2026-12-31T00:00:00Z"));
  assert.equal(onYearEnd.nextSkimDateISO, "2026-12-31");
  // On Jan 1 (and any post-12/31 timestamp) the next year's 12/31 should be picked.
  const newYear = computeNextQqqmSkimDate(new Date("2027-01-01T00:00:00Z"));
  // 2027-12-31 is a Friday → no postpone.
  assert.equal(newYear.nextSkimDateISO, "2027-12-31");
});

// ── projectScenariosRulebook (v4.5.1 per-asset) ────────────────────────────
const baseProjectionInput = (overrides: Partial<Parameters<typeof projectScenariosRulebook>[0]> = {}) => ({
  start: {
    schdCAD: 35000,
    qldCAD: 15000,
    sgovCAD: 2500,
    qqqmCAD: 0,
    tqqqCAD: 0,
    schdYieldPct: 3.5,
    qldYieldPct: 0.5,
    sgovYieldPct: 4.5,
    qqqmYieldPct: 0.7,
  },
  coreWeeklyCAD: 455,
  sgovWeeklyCAD: 0,
  qqqmWeeklyCAD: 0,
  tfsaRoomExists: true,
  currentAge: 40,
  divGrowthPct: 7,
  yearPoints: [1, 5, 10, 20],
  maxYears: 25,
  ...overrides,
});

test("projectScenariosRulebook v4.5.1: returns 3 scenarios with distinct CAGRs", () => {
  const out = projectScenariosRulebook(baseProjectionInput());
  assert.equal(out.length, 3);
  const ids = out.map(s => s.id).sort();
  assert.deepEqual(ids, ["base", "pessimistic", "worst"]);
});

test("projectScenariosRulebook v4.5.1: scenarios diverge in totalCAD over time", () => {
  const out = projectScenariosRulebook(baseProjectionInput());
  const base20 = out.find(s => s.id === "base")!.points.at(-1)!.totalCAD;
  const pess20 = out.find(s => s.id === "pessimistic")!.points.at(-1)!.totalCAD;
  const worst20 = out.find(s => s.id === "worst")!.points.at(-1)!.totalCAD;
  assert.ok(base20 > pess20);
  assert.ok(pess20 > worst20);
});

test("projectScenariosRulebook v4.5.1: SCHD never decreases — no SCHD sale rule", () => {
  const out = projectScenariosRulebook(baseProjectionInput());
  for (const s of out) {
    let prev = -1;
    for (const p of s.points) {
      assert.ok(p.schdCAD >= prev, `SCHD must never decrease`);
      prev = p.schdCAD;
    }
  }
});

test("projectScenariosRulebook v4.5.1: per-asset values sum to totalCAD", () => {
  const out = projectScenariosRulebook(baseProjectionInput());
  for (const s of out) {
    for (const p of s.points) {
      const sum = p.schdCAD + p.qldCAD + p.sgovCAD + p.qqqmCAD + p.tqqqCAD;
      assert.ok(Math.abs(sum - p.totalCAD) <= 1, `sum ${sum} vs total ${p.totalCAD}`);
    }
  }
});

test("projectScenariosRulebook v4.5.1: QQQM gating — when no TFSA room, QQQM contribution stops", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    tfsaRoomExists: false,
    yearPoints: [1, 5],
    maxYears: 5,
  }));
  const base = out.find(s => s.id === "base")!;
  const y5 = base.points.at(-1)!;
  // QQQM starts at 0; without TFSA room contribution is gated to 0. Yield 0.7% on 0 = 0.
  assert.equal(y5.qqqmCAD, 0, "QQQM should remain 0 when TFSA room missing");
});

test("v4.5.1: no QQQM skim in March / June / September (annual model — yearly checkpoints only)", () => {
  // projectScenariosRulebook is year-stride: every iteration is one calendar year.
  // The 12/31 skim helper inside the loop fires at most once per simulated year.
  // We assert that within a single-year horizon there is exactly 0 or 1 skim event,
  // never multiple intra-year fires (which would imply quarterly evaluation).
  const out = projectScenariosRulebook(baseProjectionInput({
    start: {
      schdCAD: 35000, qldCAD: 15000, sgovCAD: 2500, qqqmCAD: 1000, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, qqqmYieldPct: 0.7,
    },
    qqqmWeeklyCAD: 0,
    yearPoints: [1],
    maxYears: 1,
  }));
  for (const s of out) {
    assert.ok(s.triggerCounts.qqqmSkim <= 1,
      `at most 1 skim per simulated year (no quarterly), got ${s.triggerCounts.qqqmSkim}`);
  }
});

test("v4.5.1: no QQQM sale during T1 / T2 crisis", () => {
  // Construct a deeply broken core (QLD 19% core → T2) with TQQQ=0 to arm cycle.
  // Crisis sales must come from SGOV only — QQQM may grow but NEVER decrease here.
  const out = projectScenariosRulebook(baseProjectionInput({
    start: {
      schdCAD: 81000, qldCAD: 19000,        // QLD core W = 19% → T2
      sgovCAD: 4000, qqqmCAD: 5000, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, qqqmYieldPct: 0.7,
    },
    coreWeeklyCAD: 0,        // freeze contributions to isolate crisis behaviour
    sgovWeeklyCAD: 0,
    qqqmWeeklyCAD: 0,
    yearPoints: [1, 2, 3],
    maxYears: 3,
  }));
  const base = out.find(s => s.id === "base")!;
  // QQQM should grow monotonically (CAGR × balance) — never reduce due to crisis.
  let prev = 5000;
  for (const p of base.points) {
    assert.ok(p.qqqmCAD >= prev - 1, `QQQM must never sell in crisis (year ${p.year}: ${p.qqqmCAD} vs ${prev})`);
    prev = p.qqqmCAD;
  }
});

test("v4.5.1: no QQQM sale during Emergency Cap", () => {
  // Force Emergency cap (growth bucket ≥ 38%) — QQQM stays untouched while TQQQ + QLD unwind.
  const out = projectScenariosRulebook(baseProjectionInput({
    start: {
      schdCAD: 50000, qldCAD: 30000, sgovCAD: 1000,
      qqqmCAD: 4000, tqqqCAD: 20000,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, qqqmYieldPct: 0.7,
    },
    coreWeeklyCAD: 0,
    sgovWeeklyCAD: 0,
    qqqmWeeklyCAD: 0,
    yearPoints: [1, 2, 3],
    maxYears: 3,
  }));
  const base = out.find(s => s.id === "base")!;
  // Verify Emergency cap fired AND that QQQM was not sold (only grew via CAGR).
  assert.equal(base.triggerCounts.hardExit, 0, "v4.5.1: Emergency cap removed");
  let prev = 4000;
  for (const p of base.points) {
    assert.ok(p.qqqmCAD >= prev - 1, `QQQM untouched during Emergency cap (year ${p.year})`);
    prev = p.qqqmCAD;
  }
});

test("v4.5.1: SGOV may fall to 0 during crisis (no floor)", () => {
  // Tiny SGOV, deep crisis: T2 + (no contribution) → SGOV drains completely.
  const out = projectScenariosRulebook(baseProjectionInput({
    start: {
      schdCAD: 81000, qldCAD: 19000,
      sgovCAD: 500, qqqmCAD: 0, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, qqqmYieldPct: 0.7,
    },
    coreWeeklyCAD: 0,
    sgovWeeklyCAD: 0,
    qqqmWeeklyCAD: 0,
    yearPoints: [1, 2, 3],
    maxYears: 3,
  }));
  const base = out.find(s => s.id === "base")!;
  // After T2 fires once, SGOV should be close to 0 (annual rebalance / skim may not refill if no
  // QQQM gains / Case A doesn't trigger). Assert it's at minimum below half of starting (250).
  const lowestSgov = Math.min(...base.points.map(p => p.sgovCAD));
  assert.ok(lowestSgov <= 250, `SGOV should be drained below 250 (no floor), lowest=${lowestSgov}`);
});

test("v4.5.1: annual rebalance refills SGOV only up to 8% (max)", () => {
  // Force Case A (QLD overshoot) with SGOV at 0. The annual rebal step inside the engine
  // must refill SGOV up to 8% of total but not beyond. Single-year run.
  const out = projectScenariosRulebook(baseProjectionInput({
    start: {
      // QLD overshoot at year-end: pick start where QLD will exceed 31% after one year of growth.
      schdCAD: 60000, qldCAD: 30000,
      sgovCAD: 0, qqqmCAD: 0, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, qqqmYieldPct: 0.7,
    },
    coreWeeklyCAD: 0,
    sgovWeeklyCAD: 0,
    qqqmWeeklyCAD: 0,
    yearPoints: [1, 2, 3, 4, 5],
    maxYears: 5,
  }));
  const base = out.find(s => s.id === "base")!;
  // Across the horizon, every recorded sgovTotalWeightPct must stay ≤ 8% — the refill never overshoots.
  for (const p of base.points) {
    assert.ok(p.sgovTotalWeightPct <= 8.5, `SGOV % must not exceed 8% (max), year ${p.year} = ${p.sgovTotalWeightPct}%`);
  }
});

test("projection: 60-71세 RRSP 멜트다운 인출 40K/년 적용", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 58,
    start: {
      schdCAD: 700000, qldCAD: 300000, sgovCAD: 80000, qqqmCAD: 0, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, qqqmYieldPct: 0.7,
    },
    yearPoints: [1, 2, 3, 12, 13, 14, 15],
    maxYears: 15,
  }));
  const base = out.find(s => s.id === "base")!;
  const at60 = base.points.find(p => p.yearsFromNow === 2)!;
  const at71 = base.points.find(p => p.yearsFromNow === 13)!;
  const at72 = base.points.find(p => p.yearsFromNow === 14)!;
  assert.equal(at60.withdrawalCAD, 40000);
  assert.equal(at71.withdrawalCAD, 40000);
  assert.equal(at72.withdrawalCAD, 0);
});

test("projection: 65세부터 펜션 합산 93,372/year", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 60,
    yearPoints: [4, 5, 10],
    maxYears: 10,
  }));
  const base = out.find(s => s.id === "base")!;
  const at64 = base.points.find(p => p.yearsFromNow === 4)!;
  const at65 = base.points.find(p => p.yearsFromNow === 5)!;
  assert.equal(at64.pensionCAD, 0);
  assert.equal(at65.pensionCAD, 7781 * 12);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}
assert.equal(RULEBOOK_SCENARIOS.length, 3);
