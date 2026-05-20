/* Run: npx tsx src/lib/rulebook.test.ts */
import { strict as assert } from "node:assert";
import {
  computeRulebookWeights,
  computeStaticCoreAllocation,
  computeSchdDividendReinvest,
  computeQqqiWeeklyPlan,
  computeTqqqHardExitPlan,
  computeCrisisTriggerPlan,
  computeAnnualRebalancePlan,
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

// ── computeRulebookWeights ────────────────────────────────────────────────────
test("QLD core weight uses (SCHD + QLD), not total portfolio", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 40 },  // would dilute total-basis QLD weight
    { ticker: "QQQI", valueCAD: 10 },
  ]);
  assert.equal(w.coreCAD, 100);
  assert.equal(w.totalCAD, 150);
  assert.ok(close(w.qldCoreWeightPct, 30), `expected 30, got ${w.qldCoreWeightPct}`);
  assert.ok(close(w.schdCoreWeightPct, 70));
});

test("SGOV/QQQI weights use TOTAL portfolio, not core", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 5 },
    { ticker: "QQQI", valueCAD: 5 },
  ]);
  assert.ok(close(w.sgovTotalWeightPct, (5 / 110) * 100));
  assert.ok(close(w.jepqTotalWeightPct, (5 / 110) * 100));
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

test("SGOV target flag flips below 8% total weight", () => {
  const below = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 7 },   // 7/107 = 6.5% < 8
  ]);
  const ok = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 10 },  // 10/110 = 9.1% ≥ 8
  ]);
  assert.equal(below.sgovBelowTarget, true);
  assert.equal(ok.sgovBelowTarget, false);
});

test("SGOV floor flag flips below 5% total weight", () => {
  const breach = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 4 },   // 4/104 = 3.85% < 5
  ]);
  const safe = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 6 },   // 6/106 = 5.66% ≥ 5
  ]);
  assert.equal(breach.sgovBelowFloor, true);
  assert.equal(safe.sgovBelowFloor, false);
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
    { ticker: "QLD",  valueCAD: 29 },  // 29.0% exactly (FP-fragile)
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

test("Case B eligibility requires TQQQ=0 in addition to W<29", () => {
  const blockedByTqqq = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 75 },
    { ticker: "QLD",  valueCAD: 25 },
    { ticker: "TQQQ", valueCAD: 1 },
  ]);
  const eligible = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 75 },
    { ticker: "QLD",  valueCAD: 25 },
  ]);
  assert.equal(blockedByTqqq.caseBEligible, false);
  assert.equal(eligible.caseBEligible, true);
});

test("v4.4.2: growth bucket 37.5% triggers SOFT exit (≥34, <38)", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 100 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "TQQQ", valueCAD: 30 },  // growth bucket 60/160 = 37.5%
  ]);
  assert.equal(w.hardExit, false, "37.5% must not trigger Emergency cap");
  assert.equal(w.softExit, true, "37.5% must trigger Soft Exit (v4.4.2 reintroduced)");
  const wHard = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 100 },
    { ticker: "QLD",  valueCAD: 35 },
    { ticker: "TQQQ", valueCAD: 35 },  // 70/170 = 41.2% → emergency cap
  ]);
  assert.equal(wHard.softExit, false, "hard supersedes soft");
  assert.equal(wHard.hardExit, true);
});

test("QQQI at-cap flag triggers ≥5% total weight (v4.4.2)", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "QQQI", valueCAD: 6 },   // 6 / 106 = 5.66%
  ]);
  assert.equal(w.jepqAtCap, true);
});

// ── computeStaticCoreAllocation (v4.3.1) ────────────────────────────────────
test("v4.3.1 static core: SCHD 70 / QLD 30 (normal)", () => {
  const a = computeStaticCoreAllocation(100, false);
  assert.ok(close(a.schdBuyCAD, 70));
  assert.ok(close(a.qldBuyCAD, 30));
  assert.equal(a.tqqqBuyCAD, 0);
  assert.equal(a.overlayActive, false);
});

test("v4.3.1 static core: SCHD 70 / TQQQ 30 / QLD 0 (overlay)", () => {
  const a = computeStaticCoreAllocation(100, true);
  assert.ok(close(a.schdBuyCAD, 70));
  assert.equal(a.qldBuyCAD, 0, "QLD must be 0 during overlay");
  assert.ok(close(a.tqqqBuyCAD, 30));
  assert.equal(a.overlayActive, true);
});

test("v4.3.1 static core: no shortfall logic — overshoot does NOT reduce buy", () => {
  // Even when SCHD is heavily underweight, the split stays 70/30 (no Method B shortfall fill).
  const a = computeStaticCoreAllocation(100, false);
  assert.ok(close(a.schdBuyCAD, 70));
  assert.ok(close(a.qldBuyCAD, 30));
});

test("v4.3.1 static core: zero contribution → zero buys", () => {
  const a = computeStaticCoreAllocation(0, false);
  assert.equal(a.schdBuyCAD, 0);
  assert.equal(a.qldBuyCAD, 0);
  assert.equal(a.tqqqBuyCAD, 0);
});

test("v4.4.2: Method B helper must not exist (regression guard)", () => {
  // Static import surface check: importing computeMethodBAllocation above would
  // error at module-load. v4.4.2 retains the v4.3.1 Method-B-removed invariant.
  // SOFT_EXIT_GROWTH_BUCKET_PCT IS reintroduced in v4.4.2 (was undefined in v4.3.1).
  const tgts = RULEBOOK_TARGETS as Record<string, unknown>;
  assert.equal(tgts.SOFT_EXIT_GROWTH_BUCKET_PCT, 34,
    "v4.4.2 reintroduces SOFT_EXIT_GROWTH_BUCKET_PCT = 34");
  assert.equal(tgts.IAUM_MAX_PCT, undefined, "IAUM_MAX_PCT removed in v4.4.2 (replaced by QQQI_MAX_PCT)");
  assert.equal(tgts.IAUM_WEEKLY_BUY_CAD, undefined, "IAUM_WEEKLY_BUY_CAD removed in v4.4.2");
});

// ── computeQqqiWeeklyPlan (§4 — v4.4.2) ────────────────────────────────────
test("§4 QQQI weekly: 25 CAD applied when TFSA room AND QQQI<5%", () => {
  const p = computeQqqiWeeklyPlan(true, 3.2);
  assert.equal(p.qqqiBuyCAD, 25);
  assert.equal(p.redirectedToCoreCAD, 0);
  assert.equal(p.tfsaRoomExists, true);
  assert.equal(p.qqqiBelowCap, true);
});

test("§4 QQQI weekly: redirected to Core (70/30) when TFSA room missing", () => {
  const p = computeQqqiWeeklyPlan(false, 3.2);
  assert.equal(p.qqqiBuyCAD, 0);
  assert.equal(p.redirectedToCoreCAD, 25);
  assert.ok(p.reason.includes("TFSA"));
});

test("§4 QQQI weekly: redirected when QQQI ≥ 5% (soft stop) even if TFSA room exists", () => {
  const p = computeQqqiWeeklyPlan(true, 5.0);
  assert.equal(p.qqqiBuyCAD, 0);
  assert.equal(p.redirectedToCoreCAD, 25);
  assert.equal(p.qqqiBelowCap, false);
  assert.ok(p.reason.includes("5%"));
});

test("§4 QQQI weekly: not forced to 5% target (4.99% still applies 25 CAD)", () => {
  const p = computeQqqiWeeklyPlan(true, 4.99);
  assert.equal(p.qqqiBuyCAD, 25);
});

// ── computeSchdDividendReinvest (§5 v4.4.2) ────────────────────────────────
test("v4.4.2 SCHD dividend reinvest: 70/30 SCHD/QLD (normal)", () => {
  const r = computeSchdDividendReinvest(100, false);
  assert.ok(close(r.schdBuyCAD, 70));
  assert.ok(close(r.qldBuyCAD, 30));
  assert.equal(r.tqqqBuyCAD, 0);
  assert.equal(r.overlayActive, false);
});

test("v4.4.2 SCHD dividend reinvest: 70/30 SCHD/TQQQ during overlay (QLD = 0)", () => {
  const r = computeSchdDividendReinvest(100, true);
  assert.ok(close(r.schdBuyCAD, 70));
  assert.equal(r.qldBuyCAD, 0, "QLD must be 0 during overlay");
  assert.ok(close(r.tqqqBuyCAD, 30));
});

test("v4.4.2 SCHD dividend never routes to SGOV or QQQI (output shape check)", () => {
  // The return type has no sgovBuyCAD / jepqBuyCAD fields. This guarantees the
  // helper cannot accidentally route dividends to satellites.
  const r = computeSchdDividendReinvest(100, false) as unknown as Record<string, unknown>;
  assert.equal(r.sgovBuyCAD, undefined);
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
  assert.equal(scenarios.find(s => s.id === "base")?.cagrPct, 6);
  assert.equal(scenarios.find(s => s.id === "pessimistic")?.cagrPct, 4);
  assert.equal(scenarios.find(s => s.id === "worst")?.cagrPct, 2);
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

test("RULEBOOK_TARGETS exposes documented v4.4.2 thresholds", () => {
  assert.equal(RULEBOOK_TARGETS.SCHD_OF_CORE_PCT, 70);
  assert.equal(RULEBOOK_TARGETS.QLD_OF_CORE_PCT, 30);
  assert.equal(RULEBOOK_TARGETS.REBAL_HIGH_PCT, 31);
  assert.equal(RULEBOOK_TARGETS.REBAL_LOW_PCT, 29);
  assert.equal(RULEBOOK_TARGETS.CRISIS_T1_PCT, 25);
  assert.equal(RULEBOOK_TARGETS.CRISIS_T2_PCT, 20);
  assert.equal(RULEBOOK_TARGETS.SOFT_EXIT_GROWTH_BUCKET_PCT, 34);
  assert.equal(RULEBOOK_TARGETS.HARD_EXIT_GROWTH_BUCKET_PCT, 38);
  assert.equal(RULEBOOK_TARGETS.SGOV_TARGET_PCT, 8);
  assert.equal(RULEBOOK_TARGETS.SGOV_FLOOR_PCT, 5);
  assert.equal(RULEBOOK_TARGETS.SGOV_DEPLOYABLE_BUFFER_PCT, 3);
  assert.equal(RULEBOOK_TARGETS.QQQI_MAX_PCT, 5);
  assert.equal(RULEBOOK_TARGETS.QQQI_WEEKLY_BUY_CAD, 25);
});

// ── v4.3.1 SGOV weekly contribution boundary tests ──────────────────────────
test("v4.3.1: SGOV at 6% of total → sgovBelowTarget=true (refill needed)", () => {
  // 6 / 100 = 6.0% < 8%
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 64 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 6 },
  ]);
  assert.ok(close(w.sgovTotalWeightPct, 6));
  assert.equal(w.sgovBelowTarget, true);
});

test("v4.3.1: SGOV at 7% of total → sgovBelowTarget=true", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 63 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 7 },
  ]);
  assert.ok(close(w.sgovTotalWeightPct, 7));
  assert.equal(w.sgovBelowTarget, true);
});

test("v4.3.1: SGOV at 7.99% of total → sgovBelowTarget=true (just below cutoff)", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 62.01 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 7.99 },
  ]);
  assert.ok(w.sgovTotalWeightPct < 8 && w.sgovTotalWeightPct > 7.98,
    `expected ~7.99%, got ${w.sgovTotalWeightPct}`);
  assert.equal(w.sgovBelowTarget, true);
});

test("v4.3.1: SGOV at exactly 8% of total → sgovBelowTarget=false (redirect to Core)", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 62 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 8 },
  ]);
  assert.ok(close(w.sgovTotalWeightPct, 8));
  assert.equal(w.sgovBelowTarget, false, "at 8% the weekly SGOV buy must stop");
});

// ── v4.3.1 deployable buffer = max(0, SGOV − 5%·Total) ──────────────────────
test("v4.3.1: SGOV deployable buffer = max(0, SGOV − 5%·Total) — derived from FLOOR", () => {
  // SGOV=8, Total=100 → buffer = 8 − 5 = 3 (max 3% per rulebook).
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 62 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 8 },
  ]);
  const floorCAD = (RULEBOOK_TARGETS.SGOV_FLOOR_PCT / 100) * w.totalCAD;
  const buffer = Math.max(0, w.sgovCAD - floorCAD);
  assert.ok(close(buffer, 3, 0.01), `buffer should be ~3, got ${buffer}`);
});

test("v4.3.1: crisis cannot push SGOV below 5% floor when buffer is the constraint", () => {
  // SGOV=8 of total 100 → buffer = 3. T2 requested = 5% of 100 = 5. Sale capped at 5 by min(sgov, requested).
  // Then post-SGOV = 3 (below 5% floor — allowed only by §6.1).
  // This test asserts the function NEVER yields a sale > sgov holding (no negative SGOV).
  const plan = computeCrisisTriggerPlan({
    totalCAD: 100, sgovCAD: 8,
    crisisT1: false, crisisT2: true, cycleArmed: true, tqqqCAD: 0,
  });
  assert.ok(plan.sgovSaleCAD <= 8, "sale must not exceed SGOV holding");
  assert.ok(plan.sgovSaleCAD >= 0, "sale must not be negative");
});

test("RULEBOOK_SCENARIOS contains exactly 3 fixed CAGRs", () => {
  assert.equal(RULEBOOK_SCENARIOS.length, 3);
  const cagrs = RULEBOOK_SCENARIOS.map(s => s.cagrPct).sort((a, b) => a - b);
  assert.deepEqual(cagrs, [2, 4, 6]);
});

// ── projectScenariosRulebook (rulebook-based, per-asset) ─────────────────────
const baseProjectionInput = (overrides: Partial<Parameters<typeof projectScenariosRulebook>[0]> = {}) => ({
  start: {
    schdCAD: 35000,
    qldCAD: 15000,
    sgovCAD: 2500,
    jepqCAD: 0,
    tqqqCAD: 0,
    schdYieldPct: 3.5,
    qldYieldPct: 0.5,
    sgovYieldPct: 4.5, jepqYieldPct: 0,
  },
  coreWeeklyCAD: 350,
  sgovWeeklyCAD: 50,
  jepqWeeklyCAD: 25,
  tfsaRoomExists: true,
  currentAge: 40,
  divGrowthPct: 7,
  yearPoints: [1, 5, 10, 20],
  maxYears: 25,
  ...overrides,
});

test("projectScenariosRulebook: returns 3 scenarios with distinct CAGRs", () => {
  const out = projectScenariosRulebook(baseProjectionInput());
  assert.equal(out.length, 3);
  const ids = out.map(s => s.id).sort();
  assert.deepEqual(ids, ["base", "pessimistic", "worst"]);
});

test("projectScenariosRulebook: scenarios diverge in totalCAD over time", () => {
  const out = projectScenariosRulebook(baseProjectionInput());
  const base20 = out.find(s => s.id === "base")!.points.at(-1)!.totalCAD;
  const pess20 = out.find(s => s.id === "pessimistic")!.points.at(-1)!.totalCAD;
  const worst20 = out.find(s => s.id === "worst")!.points.at(-1)!.totalCAD;
  assert.ok(base20 > pess20, `base ${base20} should beat pess ${pess20}`);
  assert.ok(pess20 > worst20, `pess ${pess20} should beat worst ${worst20}`);
});

test("projectScenariosRulebook: SCHD never decreases — no SCHD sale rule", () => {
  const out = projectScenariosRulebook(baseProjectionInput());
  for (const s of out) {
    let prev = -1;
    for (const p of s.points) {
      assert.ok(p.schdCAD >= prev, `SCHD must never decrease (${s.id} year ${p.year}: ${p.schdCAD} after ${prev})`);
      prev = p.schdCAD;
    }
  }
});

test("projectScenariosRulebook: per-asset values sum to totalCAD", () => {
  const out = projectScenariosRulebook(baseProjectionInput());
  for (const s of out) {
    for (const p of s.points) {
      const sum = p.schdCAD + p.qldCAD + p.sgovCAD + p.jepqCAD + p.tqqqCAD;
      assert.ok(Math.abs(sum - p.totalCAD) <= 1, `sum ${sum} vs total ${p.totalCAD} (${s.id} year ${p.year})`);
    }
  }
});

test("projectScenariosRulebook: Case A or Hard Exit fires when QLD overshoots in Base 6%", () => {
  // Start with QLD already at 35% core (close to cap) and let it grow at 1.5x cagr.
  const out = projectScenariosRulebook(baseProjectionInput({
    start: {
      schdCAD: 32500,
      qldCAD: 17500,  // 35% of core 50000
      sgovCAD: 2500,
      jepqCAD: 0,
      tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, jepqYieldPct: 0,
    },
    yearPoints: [1, 2, 3, 5, 10, 20],
  }));
  const base = out.find(s => s.id === "base")!;
  // Across the full 25-year horizon, Case A or Hard Exit must fire at least once.
  // Asserting on triggerCounts (not yearPoints sampling) avoids missing fires that land
  // outside the surfaced rows.
  assert.ok(base.triggerCounts.caseA > 0 || base.triggerCounts.hardExit > 0,
    `expected Case A or Hard Exit to fire at least once, got counts=${JSON.stringify(base.triggerCounts)}`);
});

test("v4.4.2: age-65 IAUM exit removed — projection points have no iaumExited field", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 60,
    yearPoints: [1, 5, 6, 7, 10],
    maxYears: 10,
  }));
  const base = out.find(s => s.id === "base")!;
  // No point should carry iaumExited (field removed in v4.4.2)
  for (const p of base.points) {
    assert.equal((p as unknown as Record<string, unknown>).iaumExited, undefined,
      "iaumExited field must not exist on projection points in v4.4.2");
  }
  // triggerCounts should also drop iaumExited
  const tc = base.triggerCounts as unknown as Record<string, unknown>;
  assert.equal(tc.iaumExited, undefined, "triggerCounts.iaumExited removed in v4.4.2");
});

test("projectScenariosRulebook: SGOV gating — when SGOV ≥ 8% of total, weekly SGOV stops", () => {
  // Start SGOV already at ~28.6% of total → above 8% target. Annual SGOV contribution should be 0.
  const out = projectScenariosRulebook(baseProjectionInput({
    start: {
      schdCAD: 7000, qldCAD: 3000, sgovCAD: 4000, jepqCAD: 0, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, jepqYieldPct: 0,
    },
    yearPoints: [1],
    maxYears: 1,
  }));
  const base = out.find(s => s.id === "base")!;
  const y1 = base.points[0];
  // sgov starts at 4000, grows by 4% only (no contribution since gated). Approx 4160.
  assert.ok(y1.sgovCAD < 4500, `SGOV should be near 4160 (no contrib gated), got ${y1.sgovCAD}`);
});

test("projectScenariosRulebook: QQQI gating — when no TFSA room, QQQI contribution stops", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    tfsaRoomExists: false,
    yearPoints: [1, 5],
    maxYears: 5,
  }));
  const base = out.find(s => s.id === "base")!;
  const y5 = base.points.at(-1)!;
  // QQQI stays at start value 0 + grows from 0 = 0. Even with weekly 25 set, gating blocks.
  assert.equal(y5.jepqCAD, 0, "QQQI should remain 0 when TFSA room missing");
});

test("projectScenariosRulebook: gated SGOV/IAUM redirects to Core when option is on", () => {
  // Start with SGOV already > 8% so SGOV gating kicks in.
  const inputWithRedirect = baseProjectionInput({
    start: {
      schdCAD: 7000, qldCAD: 3000, sgovCAD: 4000, jepqCAD: 0, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, jepqYieldPct: 0,
    },
    redirectGatedToCore: true,
    yearPoints: [1, 2, 3],
    maxYears: 3,
  });
  const inputNoRedirect = baseProjectionInput({
    start: {
      schdCAD: 7000, qldCAD: 3000, sgovCAD: 4000, jepqCAD: 0, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, jepqYieldPct: 0,
    },
    redirectGatedToCore: false,
    yearPoints: [1, 2, 3],
    maxYears: 3,
  });
  const withRedirect = projectScenariosRulebook(inputWithRedirect).find(s => s.id === "base")!.points.at(-1)!;
  const noRedirect   = projectScenariosRulebook(inputNoRedirect).find(s => s.id === "base")!.points.at(-1)!;
  // With redirect on, gated SGOV CAD flows back to Core → SCHD+QLD higher.
  const coreWith = withRedirect.schdCAD + withRedirect.qldCAD;
  const coreWithout = noRedirect.schdCAD + noRedirect.qldCAD;
  assert.ok(coreWith > coreWithout, `redirected core ${coreWith} should beat un-redirected ${coreWithout}`);
});

test("projectScenariosRulebook: DCA contribution factor reduces total growth on contributions", () => {
  // Compare full-start-of-year (factor 1) vs end-of-year (factor 0). Start-of-year gives more growth.
  const startOfYear = projectScenariosRulebook(baseProjectionInput({
    dcaContributionFactor: 1,
    yearPoints: [10],
    maxYears: 10,
  })).find(s => s.id === "base")!.points[0];
  const endOfYear = projectScenariosRulebook(baseProjectionInput({
    dcaContributionFactor: 0,
    yearPoints: [10],
    maxYears: 10,
  })).find(s => s.id === "base")!.points[0];
  assert.ok(startOfYear.totalCAD > endOfYear.totalCAD, "start-of-year DCA factor should produce higher totals");
  // Mid-year (0.5) should land between
  const midYear = projectScenariosRulebook(baseProjectionInput({
    dcaContributionFactor: 0.5,
    yearPoints: [10],
    maxYears: 10,
  })).find(s => s.id === "base")!.points[0];
  assert.ok(midYear.totalCAD > endOfYear.totalCAD && midYear.totalCAD < startOfYear.totalCAD,
    `mid-year ${midYear.totalCAD} should sit between end ${endOfYear.totalCAD} and start ${startOfYear.totalCAD}`);
});

test("projectScenariosRulebook: tax withholding produces lower net but unchanged gross", () => {
  const noTax = projectScenariosRulebook(baseProjectionInput({
    taxWithholdPct: 0,
    yearPoints: [10],
    maxYears: 10,
  })).find(s => s.id === "base")!.points[0];
  const withTax = projectScenariosRulebook(baseProjectionInput({
    taxWithholdPct: 15,
    yearPoints: [10],
    maxYears: 10,
  })).find(s => s.id === "base")!.points[0];
  // Gross should be (approximately) the same; net should drop ~15%.
  assert.ok(Math.abs(noTax.annualDivGrossCAD - withTax.annualDivGrossCAD) <= 1,
    `gross should match (no-tax ${noTax.annualDivGrossCAD} vs tax ${withTax.annualDivGrossCAD})`);
  const ratio = withTax.annualDivCAD / noTax.annualDivCAD;
  assert.ok(ratio > 0.84 && ratio < 0.86, `expected ~0.85 ratio, got ${ratio.toFixed(4)}`);
});

test("projectScenariosRulebook: yield held constant — dividend grows via balance × const yield only", () => {
  // Yield growth model removed (it compounded with CAGR and produced unrealistic
  // 90%+ yield-of-balance figures in 20yr horizons). qldDivGrowthFactor is now ignored.
  // Same balance → same dividend regardless of qldDivGrowthFactor setting.
  const a = projectScenariosRulebook(baseProjectionInput({
    qldDivGrowthFactor: 0,
    yearPoints: [10],
    maxYears: 10,
  })).find(s => s.id === "base")!.points[0];
  const b = projectScenariosRulebook(baseProjectionInput({
    qldDivGrowthFactor: 1,
    yearPoints: [10],
    maxYears: 10,
  })).find(s => s.id === "base")!.points[0];
  assert.equal(a.annualDivGrossCAD, b.annualDivGrossCAD,
    `qldDivGrowthFactor must NOT affect dividend (got ${a.annualDivGrossCAD} vs ${b.annualDivGrossCAD})`);
});

test("v4.4.2 projection: Case B NEVER fires (rulebook changed to no-action)", () => {
  // Start at 26% core (below 29% deadband floor) with zero contributions so QLD
  // drift keeps caseBEligible alive across the horizon. v4.4.2 mandates no
  // action — Case B trigger count must remain 0 and SGOV / QLD CAD do not move.
  const out = projectScenariosRulebook(baseProjectionInput({
    start: {
      schdCAD: 74000, qldCAD: 26000,
      sgovCAD: 8000, jepqCAD: 0, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, jepqYieldPct: 0,
    },
    coreWeeklyCAD: 0,
    sgovWeeklyCAD: 0,
    jepqWeeklyCAD: 0,
    yearPoints: [1, 2, 3, 5],
    maxYears: 5,
  }));
  const base = out.find(s => s.id === "base")!;
  assert.equal(base.triggerCounts.caseB, 0,
    `v4.4.2: Case B must NOT fire, got counts=${JSON.stringify(base.triggerCounts)}`);
});

test("projection: SGOV target 8% — sgovCAD below 8% triggers refill contribution", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    start: { schdCAD: 30000, qldCAD: 13000, sgovCAD: 1000, jepqCAD: 0, tqqqCAD: 0,
             schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, jepqYieldPct: 0 },
    sgovWeeklyCAD: 50, jepqWeeklyCAD: 0,
    yearPoints: [1], maxYears: 1,
  }));
  const y1 = out.find(s => s.id === "base")!.points[0];
  // SGOV starts 1000, total 44000 → 2.27% < 8 → SGOV contribution applied
  assert.ok(y1.sgovCAD > 3000, `expected SGOV refill (≥ ~3000), got ${y1.sgovCAD}`);
});

// ── computeTqqqHardExitPlan (§6.2 — full unwind when growth bucket ≥ 38, only TQQQ exit in v4.3.1) ────
test("§6.2 Hard Exit: inactive when growth bucket < 38", () => {
  const plan = computeTqqqHardExitPlan({
    schdCAD: 60, qldCAD: 30, tqqqCAD: 0, sgovCAD: 10, totalCAD: 100, hardExit: false,
  });
  assert.equal(plan.active, false);
});

test("§6.2 Hard Exit: sells ALL TQQQ + QLD to 30% core, refills SGOV to 8%, remainder → SCHD", () => {
  // Pre: SCHD 50, QLD 40, TQQQ 10, SGOV 0 → total 100, core 90, QLD core W = 44.4%, growth bucket = 50%
  // Step 1: sell all TQQQ (10). Core after TQQQ sale doesn't change (TQQQ outside core).
  // Step 2: QLD sale = (qld - 0.30 × core) / 0.70 = (40 - 27) / 0.70 = 18.57.
  // Total proceeds = 10 (TQQQ) + 18.57 (QLD) = 28.57.
  // SGOV gap to 8% (target) = 8. → 8 to SGOV, 20.57 to SCHD.
  const plan = computeTqqqHardExitPlan({
    schdCAD: 50, qldCAD: 40, tqqqCAD: 10, sgovCAD: 0, totalCAD: 100, hardExit: true,
  });
  assert.equal(plan.active, true);
  assert.ok(close(plan.tqqqSaleCAD, 10));
  assert.ok(close(plan.qldSaleCAD, (40 - 27) / 0.70, 0.01));
  assert.ok(close(plan.sgovRefillCAD, 8, 0.01));
  assert.ok(plan.schdBuyCAD > 0);
});

test("§6.2 Hard Exit with TQQQ=0: degrades to QLD-only sale (Case A-like)", () => {
  // No TQQQ, QLD overweight at 38% of core. Plan should still fire on hardExit flag.
  // Hard exit cleanup: only QLD sale needed, SGOV up to 8% then SCHD.
  // SCHD 62, QLD 38, total 100, core 100, QLD core = 38% (growth bucket = 38%)
  const plan = computeTqqqHardExitPlan({
    schdCAD: 62, qldCAD: 38, tqqqCAD: 0, sgovCAD: 0, totalCAD: 100, hardExit: true,
  });
  assert.equal(plan.active, true);
  assert.equal(plan.tqqqSaleCAD, 0);
  assert.ok(plan.qldSaleCAD > 0);
});

test("§6.2 Hard Exit: SCHD is never sold (post-exit invariant)", () => {
  const plan = computeTqqqHardExitPlan({
    schdCAD: 30, qldCAD: 50, tqqqCAD: 20, sgovCAD: 0, totalCAD: 100, hardExit: true,
  });
  assert.ok(plan.schdBuyCAD >= 0, `SCHD action must be buy-only, got ${plan.schdBuyCAD}`);
});

// ── computeCrisisTriggerPlan (§6.1 — SGOV → TQQQ when QLD core W is low) ────
test("§6.1 Crisis: inactive when both T1 and T2 false", () => {
  const plan = computeCrisisTriggerPlan({
    totalCAD: 1000, sgovCAD: 100,
    crisisT1: false, crisisT2: false, cycleArmed: true, tqqqCAD: 0,
  });
  assert.equal(plan.active, false);
});

test("§6.1 Crisis T1: buys 2.5% of total CAD into TQQQ from SGOV", () => {
  const plan = computeCrisisTriggerPlan({
    totalCAD: 1000, sgovCAD: 100,
    crisisT1: true, crisisT2: false, cycleArmed: true, tqqqCAD: 0,
  });
  assert.equal(plan.active, true);
  assert.ok(close(plan.sgovSaleCAD, 25));   // 2.5% of 1000
  assert.ok(close(plan.tqqqBuyCAD, 25));
  assert.equal(plan.tier, "T1");
});

test("§6.1 Crisis T2: buys cumulative 5% (both tiers same day) when W ≤ 20", () => {
  const plan = computeCrisisTriggerPlan({
    totalCAD: 1000, sgovCAD: 100,
    crisisT1: false, crisisT2: true, cycleArmed: true, tqqqCAD: 0,
  });
  assert.equal(plan.active, true);
  assert.ok(close(plan.sgovSaleCAD, 50));   // T1 + T2 = 5% of 1000
  assert.ok(close(plan.tqqqBuyCAD, 50));
  assert.equal(plan.tier, "T2");
});

test("§6.1 Crisis: blocked when cycle not armed (prior trigger not reset)", () => {
  const plan = computeCrisisTriggerPlan({
    totalCAD: 1000, sgovCAD: 100,
    crisisT1: true, crisisT2: false, cycleArmed: false, tqqqCAD: 1,
  });
  assert.equal(plan.active, false);
  assert.equal(plan.reason, "cycle-not-armed");
});

test("§6.1 Crisis: may pierce SGOV 5% floor (rule allows only here)", () => {
  // SGOV = 100 = 5.0% of 2000 total. Plan asks for 50. After: SGOV = 50 = 2.5% → below floor, allowed.
  const plan = computeCrisisTriggerPlan({
    totalCAD: 2000, sgovCAD: 100,
    crisisT1: false, crisisT2: true, cycleArmed: true, tqqqCAD: 0,
  });
  assert.equal(plan.active, true);
  assert.ok(plan.sgovSaleCAD <= 100, "sale must not exceed available SGOV");
});

test("§6.1 Crisis: sale capped at available SGOV (cannot sell more than held)", () => {
  const plan = computeCrisisTriggerPlan({
    totalCAD: 2000, sgovCAD: 20,
    crisisT1: false, crisisT2: true, cycleArmed: true, tqqqCAD: 0,
  });
  assert.equal(plan.active, true);
  assert.ok(plan.sgovSaleCAD <= 20);
  assert.ok(close(plan.sgovSaleCAD, plan.tqqqBuyCAD), "buy equals SGOV sale (proceeds chained)");
});

// ── computeAnnualRebalancePlan (§5 — Dec 31 only, bidirectional with deadband) ─
test("§5 Deadband: 29 ≤ W ≤ 31 → no action (caseA=false, caseB=false)", () => {
  const plan = computeAnnualRebalancePlan({
    schdCAD: 70, qldCAD: 30, tqqqCAD: 0, sgovCAD: 10, totalCAD: 110,
    caseAEligible: false, caseBEligible: false,
  });
  assert.equal(plan.action, "deadband");
});

test("§5 Case A (W > 31): QLD sale to 30%, SGOV refill to 8% (v4.3.1), remainder → SCHD", () => {
  // SCHD 60, QLD 40 → core 100, total 100, SGOV 0
  // Sale = (40 - 30) / 0.70 = 14.286
  // v4.3.1: H = max(0, 0.08·T - G) = max(0, 8 - 0) = 8 → 8 to SGOV (target 8%), 6.286 to SCHD
  const plan = computeAnnualRebalancePlan({
    schdCAD: 60, qldCAD: 40, tqqqCAD: 0, sgovCAD: 0, totalCAD: 100,
    caseAEligible: true, caseBEligible: false,
  });
  assert.equal(plan.action, "case_a");
  assert.ok(close(plan.qldSaleCAD, 10 / 0.70, 0.01));
  assert.ok(close(plan.sgovDeltaCAD, 8, 0.01),
    `Case A must refill SGOV to 8% (v4.3.1), got ${plan.sgovDeltaCAD}`);
  assert.ok(plan.schdBuyCAD > 0);
});

test("v4.3.1: Case A SGOV refill = max(0, 0.08·T − G) — partial refill when SGOV non-zero", () => {
  // SCHD 60, QLD 40, SGOV 2, Total 102 → H = max(0, 0.08·102 − 2) = max(0, 6.16) = 6.16
  const plan = computeAnnualRebalancePlan({
    schdCAD: 60, qldCAD: 40, tqqqCAD: 0, sgovCAD: 2, totalCAD: 102,
    caseAEligible: true, caseBEligible: false,
  });
  assert.equal(plan.action, "case_a");
  const expectedRefill = Math.min(plan.qldSaleCAD, 0.08 * 102 - 2);
  assert.ok(close(plan.sgovDeltaCAD, expectedRefill, 0.01),
    `expected ~${expectedRefill}, got ${plan.sgovDeltaCAD}`);
});

test("v4.3.1: Hard Exit refills SGOV toward 8% (not 5%)", () => {
  // SCHD 40, QLD 40, TQQQ 20, SGOV 0, Total 100, growth bucket = 60/100 = 60% ≥ 38
  // Proceeds = TQQQ (20) + QLD sale to 30% of core.
  // SGOV target = 0.08 × 100 = 8. Refill = min(proceeds, 8).
  const plan = computeTqqqHardExitPlan({
    schdCAD: 40, qldCAD: 40, tqqqCAD: 20, sgovCAD: 0, totalCAD: 100, hardExit: true,
  });
  assert.equal(plan.active, true);
  assert.ok(close(plan.sgovRefillCAD, 8, 0.01),
    `Hard Exit must refill SGOV to 8% (v4.3.1), got ${plan.sgovRefillCAD}`);
});

test("v4.4.2 §5 Case B (W < 29 AND TQQQ=0): NO ACTION (changed from SGOV→QLD in earlier rulebook)", () => {
  // SCHD 75, QLD 25, total 110, SGOV 10. caseBEligible passed externally.
  // v4.4.2: explicit no-action. Plan returns deadband, no SGOV sale, no QLD buy.
  const plan = computeAnnualRebalancePlan({
    schdCAD: 75, qldCAD: 25, tqqqCAD: 0, sgovCAD: 10, totalCAD: 110,
    caseAEligible: false, caseBEligible: true,
  });
  assert.equal(plan.action, "deadband", "v4.4.2: Case B is no-action");
  assert.equal(plan.qldBuyCAD, 0);
  assert.equal(plan.sgovDeltaCAD, 0);
  assert.equal(plan.schdBuyCAD, 0);
});

test("v4.4.2 §5 Case B: SCHD never sold to buy QLD (regression guard)", () => {
  const plan = computeAnnualRebalancePlan({
    schdCAD: 75, qldCAD: 25, tqqqCAD: 0, sgovCAD: 5, totalCAD: 105,
    caseAEligible: false, caseBEligible: true,
  });
  assert.equal(plan.schdBuyCAD, 0);
  assert.equal(plan.action, "deadband");
});

test("§5 Case B: blocked when TQQQ > 0 (caller must pass caseBEligible=false)", () => {
  // Caller never sets caseBEligible=true with TQQQ>0. The function trusts caller.
  // If caseAEligible=false AND caseBEligible=false, action is 'deadband'.
  const plan = computeAnnualRebalancePlan({
    schdCAD: 75, qldCAD: 25, tqqqCAD: 1, sgovCAD: 10, totalCAD: 111,
    caseAEligible: false, caseBEligible: false,
  });
  assert.equal(plan.action, "deadband");
});

// ── computeMeltdownAllocation (§11 — SCHD-first RRSP withdrawal) ─────────────
test("§11 Meltdown: SCHD covers full request → QLD untouched", () => {
  const m = computeMeltdownAllocation(50000, 30000, 40000);
  assert.equal(m.fromSchd, 40000);
  assert.equal(m.fromQld, 0);
  assert.equal(m.totalWithdrawn, 40000);
  assert.equal(m.unmet, 0);
});

test("§11 Meltdown: SCHD insufficient → QLD covers remainder", () => {
  const m = computeMeltdownAllocation(10000, 80000, 40000);
  assert.equal(m.fromSchd, 10000);
  assert.equal(m.fromQld, 30000);
  assert.equal(m.totalWithdrawn, 40000);
  assert.equal(m.unmet, 0);
});

test("§11 Meltdown: both depleted → unmet > 0", () => {
  const m = computeMeltdownAllocation(5000, 10000, 40000);
  assert.equal(m.fromSchd, 5000);
  assert.equal(m.fromQld, 10000);
  assert.equal(m.totalWithdrawn, 15000);
  assert.equal(m.unmet, 25000);
});

// ── Retirement phase projection tests (rulebook [10] / [11] / [16]) ──────────
test("projection: 60-71세 RRSP 멜트다운 인출 40K/년 적용", () => {
  // Retirement-realistic start so 12yr × 40K = 480K is feasible. baseProjectionInput's
  // 50K Core would deplete by year 6; that scenario is covered by the "unmet > 0" unit test.
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 58,
    start: {
      schdCAD: 700000, qldCAD: 300000, sgovCAD: 80000, jepqCAD: 0, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, jepqYieldPct: 0,
    },
    yearPoints: [1, 2, 3, 12, 13, 14, 15],
    maxYears: 15,
  }));
  const base = out.find(s => s.id === "base")!;
  const at60 = base.points.find(p => p.yearsFromNow === 2)!;
  const at70 = base.points.find(p => p.yearsFromNow === 12)!;
  const at71 = base.points.find(p => p.yearsFromNow === 13)!;
  const at72 = base.points.find(p => p.yearsFromNow === 14)!;
  assert.equal(at60.withdrawalCAD, 40000);
  assert.equal(at70.withdrawalCAD, 40000);
  assert.equal(at71.withdrawalCAD, 40000);
  assert.equal(at72.withdrawalCAD, 0);
});

test("projection: 60세 이전에는 인출 없음", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 50,
    yearPoints: [1, 5],
    maxYears: 5,
  }));
  const base = out.find(s => s.id === "base")!;
  for (const p of base.points) assert.equal(p.withdrawalCAD, 0);
});

test("projection: 65세부터 배당 재투자 중단 (dividendConsumedCAD > 0)", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 60,
    yearPoints: [4, 5, 6],
    maxYears: 10,
  }));
  const base = out.find(s => s.id === "base")!;
  const at64 = base.points.find(p => p.yearsFromNow === 4)!;
  const at65 = base.points.find(p => p.yearsFromNow === 5)!;
  const at66 = base.points.find(p => p.yearsFromNow === 6)!;
  assert.equal(at64.dividendConsumedCAD, 0, "before 65 dividends reinvested");
  assert.ok(at65.dividendConsumedCAD > 0, "from 65 dividends consumed");
  assert.ok(at66.dividendConsumedCAD > 0);
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
  const at70 = base.points.find(p => p.yearsFromNow === 10)!;
  assert.equal(at64.pensionCAD, 0);
  assert.equal(at65.pensionCAD, 7781 * 12);
  assert.equal(at70.pensionCAD, 7781 * 12);
});

test("projection: 60-64 인출만, 펜션/배당소비 0", () => {
  // Retirement-realistic start (same rationale as the prior 60-71 test).
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 58,
    start: {
      schdCAD: 700000, qldCAD: 300000, sgovCAD: 80000, jepqCAD: 0, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5, jepqYieldPct: 0,
    },
    yearPoints: [2, 3, 6],
    maxYears: 6,
  }));
  const base = out.find(s => s.id === "base")!;
  const at60 = base.points.find(p => p.yearsFromNow === 2)!;
  const at64 = base.points.find(p => p.yearsFromNow === 6)!;
  assert.equal(at60.withdrawalCAD, 40000);
  assert.equal(at60.pensionCAD, 0);
  assert.equal(at60.dividendConsumedCAD, 0);
  assert.equal(at64.withdrawalCAD, 40000);
  assert.equal(at64.pensionCAD, 0);
  assert.equal(at64.dividendConsumedCAD, 0);
});

test("projection: monthlyCashflowCAD = (withdrawal + divConsumed + pension) / 12", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 60,
    yearPoints: [5],
    maxYears: 6,
  }));
  const at65 = out.find(s => s.id === "base")!.points[0];
  const expected = Math.round((at65.withdrawalCAD + at65.dividendConsumedCAD + at65.pensionCAD) / 12);
  assert.equal(at65.monthlyCashflowCAD, expected);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}
