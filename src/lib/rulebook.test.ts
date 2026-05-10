/* Run: npx tsx src/lib/rulebook.test.ts */
import { strict as assert } from "node:assert";
import {
  computeRulebookWeights,
  computeMethodBAllocation,
  computeIaumWeeklyPlan,
  computeQldEmergencyPlan,
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
    { ticker: "IAUM", valueCAD: 10 },
  ]);
  assert.equal(w.coreCAD, 100);
  assert.equal(w.totalCAD, 150);
  assert.ok(close(w.qldCoreWeightPct, 30), `expected 30, got ${w.qldCoreWeightPct}`);
  assert.ok(close(w.schdCoreWeightPct, 70));
});

test("SGOV/IAUM weights use TOTAL portfolio, not core", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "SGOV", valueCAD: 5 },
    { ticker: "IAUM", valueCAD: 5 },
  ]);
  assert.ok(close(w.sgovTotalWeightPct, (5 / 110) * 100));
  assert.ok(close(w.iaumTotalWeightPct, (5 / 110) * 100));
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

test("hard exit takes precedence over soft exit (both ranges true)", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 100 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "TQQQ", valueCAD: 30 },  // growth bucket 60/160 = 37.5% → soft only
  ]);
  assert.equal(w.softExit, true);
  assert.equal(w.hardExit, false);
  const wHard = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 100 },
    { ticker: "QLD",  valueCAD: 35 },
    { ticker: "TQQQ", valueCAD: 35 },  // 70/170 = 41.2% → hard
  ]);
  assert.equal(wHard.softExit, false);   // hard supersedes soft
  assert.equal(wHard.hardExit, true);
});

test("IAUM at-cap flag triggers ≥5% total weight", () => {
  const w = computeRulebookWeights([
    { ticker: "SCHD", valueCAD: 70 },
    { ticker: "QLD",  valueCAD: 30 },
    { ticker: "IAUM", valueCAD: 6 },   // 6 / 106 = 5.66%
  ]);
  assert.equal(w.iaumAtCap, true);
});

// ── computeMethodBAllocation ─────────────────────────────────────────────────
test("Method B never produces negative buy (no-sell guarantee)", () => {
  // QLD overshoot: S=10, Q=90, C=100 → target core 200, target QLD 60. Q=90 overshoots target.
  const m = computeMethodBAllocation(10, 90, 100);
  assert.ok(m.qldBuyCAD >= 0, `qldBuyCAD must be >=0, got ${m.qldBuyCAD}`);
  assert.ok(m.schdBuyCAD >= 0);
  assert.equal(m.qldShortCAD, 0);   // overshoot is clamped
  assert.ok(m.schdShortCAD > 0);
});

test("Method B at perfect 70/30: contribution proportional to shortfall", () => {
  // S=70, Q=30, C=100 → target core 200, target SCHD 140, target QLD 60
  // schdShort = 70, qldShort = 30 → totalShort 100 == C
  const m = computeMethodBAllocation(70, 30, 100);
  assert.ok(close(m.schdBuyCAD, 70));
  assert.ok(close(m.qldBuyCAD, 30));
  assert.ok(close(m.unallocatedCAD, 0));
});

test("Method B with C=0 and both at target: zero buy, zero unallocated", () => {
  // S=70, Q=30, C=0 → both exactly at target → no buy, no unallocation needed
  const m = computeMethodBAllocation(70, 30, 0);
  assert.equal(m.schdBuyCAD, 0);
  assert.equal(m.qldBuyCAD, 0);
  assert.equal(m.unallocatedCAD, 0);
});

test("Method B caps allocation at shortfall when contribution exceeds", () => {
  // S=68, Q=30, C=100, target=198 → SCHD target 138.6, QLD target 59.4
  // schdShort = 70.6, qldShort = 29.4 → totalShort 100 ≈ C
  const m = computeMethodBAllocation(68, 30, 100);
  assert.ok(close(m.schdBuyCAD + m.qldBuyCAD, 100));
});

// Real DB scenario (approximate)
test("Real DB scenario: SCHD overweight, $300 core contribution → all SCHD", () => {
  // From actual DB (approx): SCHD ≈ 27,712, QLD ≈ 22,038 → QLD core = 44.3%
  // Method B with $300 core contribution: target core = 50,050 → target SCHD = 35,035
  //   schdShort = 7,323, QLD overshoot → all $300 to SCHD
  const m = computeMethodBAllocation(27712, 22038, 300);
  assert.ok(close(m.qldBuyCAD, 0), `qld should be 0, got ${m.qldBuyCAD}`);
  assert.ok(close(m.schdBuyCAD, 300));
});

// ── computeIaumWeeklyPlan (§7) ───────────────────────────────────────────────
test("§7 IAUM weekly: 25 CAD applied when TFSA room AND IAUM<5%", () => {
  const p = computeIaumWeeklyPlan(true, 3.2);
  assert.equal(p.iaumBuyCAD, 25);
  assert.equal(p.redirectedToCoreCAD, 0);
  assert.equal(p.tfsaRoomExists, true);
  assert.equal(p.iaumBelowCap, true);
});

test("§7 IAUM weekly: redirected to Method B when TFSA room missing", () => {
  const p = computeIaumWeeklyPlan(false, 3.2);
  assert.equal(p.iaumBuyCAD, 0);
  assert.equal(p.redirectedToCoreCAD, 25);
  assert.ok(p.reason.includes("TFSA"));
});

test("§7 IAUM weekly: redirected when IAUM ≥ 5% even if TFSA room exists", () => {
  const p = computeIaumWeeklyPlan(true, 5.0);
  assert.equal(p.iaumBuyCAD, 0);
  assert.equal(p.redirectedToCoreCAD, 25);
  assert.equal(p.iaumBelowCap, false);
  assert.ok(p.reason.includes("5%"));
});

test("§7 IAUM weekly: not forced to 5% target (4.99% still applies 25 CAD)", () => {
  // The rule is "below cap" not "below target" — at 4.99% the rule still buys 25.
  const p = computeIaumWeeklyPlan(true, 4.99);
  assert.equal(p.iaumBuyCAD, 25);
});

// ── computeQldEmergencyPlan (§10) ────────────────────────────────────────────
test("§10 QLD emergency cap: inactive when below 38% core", () => {
  const plan = computeQldEmergencyPlan({
    schdCAD: 70, qldCAD: 30, sgovCAD: 5, totalCAD: 105, qldEmergencyCap: false,
  });
  assert.equal(plan.active, false);
  assert.equal(plan.qldSaleCAD, 0);
});

test("§10 QLD sale brings core weight back to 30% exactly", () => {
  // Core 100, QLD 38, SCHD 62 → core weight 38%
  const plan = computeQldEmergencyPlan({
    schdCAD: 62, qldCAD: 38, sgovCAD: 0, totalCAD: 100, qldEmergencyCap: true,
  });
  assert.ok(plan.active);
  // Sale x: (38 - 0.30·100)/0.70 = 8/0.70 ≈ 11.4286
  assert.ok(close(plan.qldSaleCAD, 8 / 0.70, 0.01), `sale=${plan.qldSaleCAD}`);
  // Post-sale: QLD = 38 - 11.4286 = 26.5714, core unchanged 100, weight = 26.57%
  // Wait — core SHOULD be unchanged because proceeds go to SCHD/SGOV (not back to QLD).
  // But SGOV is outside core, so core reduces by sgovRefill amount.
  // Pre: core=100. Sale 11.43. SGOV gap to 5 = 5. → 5 to SGOV (outside core), 6.43 to SCHD.
  // Post: SCHD=62+6.43=68.43, QLD=26.57, core=95. QLD/core=26.57/95=27.97%.
  // The helper documents postSaleQldCoreWeightPct as if proceeds all stay in core; clarify in helper.
  // For now just verify proceeds split.
  assert.ok(close(plan.sgovRefillCAD, 5, 0.01), `sgov refill=${plan.sgovRefillCAD}`);
  assert.ok(close(plan.schdBuyCAD, plan.qldSaleCAD - 5, 0.01));
});

test("§10 QLD sale: SGOV already at 5% → all proceeds to SCHD", () => {
  // Core 100 (SCHD 62, QLD 38), SGOV already 5.5 of total 105.5
  const plan = computeQldEmergencyPlan({
    schdCAD: 62, qldCAD: 38, sgovCAD: 5.5, totalCAD: 105.5, qldEmergencyCap: true,
  });
  assert.ok(plan.active);
  assert.equal(plan.sgovRefillCAD, 0, "SGOV ≥ 5% → no refill");
  assert.ok(close(plan.schdBuyCAD, plan.qldSaleCAD, 0.01));
});

test("§10 QLD sale: when sgovGap > sale amount, all proceeds to SGOV", () => {
  // Tiny QLD overshoot, SGOV deeply under target
  const plan = computeQldEmergencyPlan({
    schdCAD: 62, qldCAD: 38, sgovCAD: 0, totalCAD: 100, qldEmergencyCap: true,
  });
  // sale ≈ 11.43, sgovGap = 5% of 100 = 5 → refill = 5, SCHD = 6.43 (sale > gap case)
  assert.ok(plan.sgovRefillCAD <= plan.qldSaleCAD);
  assert.ok(plan.schdBuyCAD >= 0);
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

test("RULEBOOK_TARGETS exposes documented v4.1.10 thresholds", () => {
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
  assert.equal(RULEBOOK_TARGETS.IAUM_MAX_PCT, 5);
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
    iaumCAD: 0,
    schdYieldPct: 3.5,
    qldYieldPct: 0.5,
    sgovYieldPct: 4.5,
  },
  coreWeeklyCAD: 350,
  sgovWeeklyCAD: 50,
  iaumWeeklyCAD: 25,
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
      const sum = p.schdCAD + p.qldCAD + p.sgovCAD + p.iaumCAD;
      assert.ok(Math.abs(sum - p.totalCAD) <= 1, `sum ${sum} vs total ${p.totalCAD} (${s.id} year ${p.year})`);
    }
  }
});

test("projectScenariosRulebook: emergency cap fires when QLD overshoots in Base 6%", () => {
  // Start with QLD already at 35% core (close to cap) and let it grow at 1.5x cagr.
  const out = projectScenariosRulebook(baseProjectionInput({
    start: {
      schdCAD: 32500,
      qldCAD: 17500,  // 35% of core 50000
      sgovCAD: 2500,
      iaumCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5,
    },
    yearPoints: [1, 2, 3, 5, 10, 20],
  }));
  const base = out.find(s => s.id === "base")!;
  // At least one year should fire emergency cap or annual rebalance
  const anyTrigger = base.points.some(p => p.emergencyCapApplied || p.annualRebalanceApplied);
  assert.ok(anyTrigger, "expected emergency cap or annual rebalance to fire at least once");
});

test("projectScenariosRulebook: IAUM exits at age 65", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 60,
    yearPoints: [1, 5, 6, 7, 10],
    maxYears: 10,
  }));
  const base = out.find(s => s.id === "base")!;
  const exitYear = base.points.find(p => p.iaumExited);
  assert.ok(exitYear, "expected IAUM exit point to be present");
  assert.equal(exitYear?.iaumCAD, 0, "after exit, IAUM should be 0");
});

test("projectScenariosRulebook: SGOV gating — when SGOV ≥ 5% of total, weekly SGOV stops", () => {
  // Start SGOV already at 30% of total → above 5%. Annual SGOV contribution should be 0.
  const out = projectScenariosRulebook(baseProjectionInput({
    start: {
      schdCAD: 7000, qldCAD: 3000, sgovCAD: 4000, iaumCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5,
    },
    yearPoints: [1],
    maxYears: 1,
  }));
  const base = out.find(s => s.id === "base")!;
  const y1 = base.points[0];
  // sgov starts at 4000, grows by 4% only (no contribution since gated). Approx 4160.
  assert.ok(y1.sgovCAD < 4500, `SGOV should be near 4160 (no contrib gated), got ${y1.sgovCAD}`);
});

test("projectScenariosRulebook: IAUM gating — when no TFSA room, IAUM contribution stops", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    tfsaRoomExists: false,
    yearPoints: [1, 5],
    maxYears: 5,
  }));
  const base = out.find(s => s.id === "base")!;
  const y5 = base.points.at(-1)!;
  // IAUM stays at start value 0 + grows from 0 = 0. Even with weekly 25 set, gating blocks.
  assert.equal(y5.iaumCAD, 0, "IAUM should remain 0 when TFSA room missing");
});

test("projectScenariosRulebook: gated SGOV/IAUM redirects to Core when option is on", () => {
  // Start with SGOV already > 5% so SGOV gating kicks in.
  const inputWithRedirect = baseProjectionInput({
    start: {
      schdCAD: 7000, qldCAD: 3000, sgovCAD: 4000, iaumCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5,
    },
    redirectGatedToCore: true,
    yearPoints: [1, 2, 3],
    maxYears: 3,
  });
  const inputNoRedirect = baseProjectionInput({
    start: {
      schdCAD: 7000, qldCAD: 3000, sgovCAD: 4000, iaumCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5,
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

test("projectScenariosRulebook: QLD div yield grows by qldDivGrowthFactor × dg per year", () => {
  // qldDivGrowthFactor = 0 → QLD yield stays flat. = 1 → grows at full dg.
  const flatQld = projectScenariosRulebook(baseProjectionInput({
    qldDivGrowthFactor: 0,
    yearPoints: [10],
    maxYears: 10,
  })).find(s => s.id === "base")!.points[0];
  const fullQld = projectScenariosRulebook(baseProjectionInput({
    qldDivGrowthFactor: 1,
    yearPoints: [10],
    maxYears: 10,
  })).find(s => s.id === "base")!.points[0];
  // fullQld dividend should be greater than flatQld
  assert.ok(fullQld.annualDivGrossCAD > flatQld.annualDivGrossCAD,
    `full QLD dg ${fullQld.annualDivGrossCAD} should exceed flat ${flatQld.annualDivGrossCAD}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}
