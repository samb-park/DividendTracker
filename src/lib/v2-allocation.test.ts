/* Run: npx tsx src/lib/v2-allocation.test.ts
 *
 * Core / Non-Core model (v4.1.8 settings):
 *   - excluded=false  → Core. Eligible for main contribution via target % shortfall.
 *   - excluded=true   → Non-Core. Excluded from main contribution. May have a self-managed
 *                       budget (nonCorePlan) for informational tracking only.
 *   - Legacy reserve config (plannedWeeklyCAD/active/redistribution) is preserved in storage
 *     but no longer flows into the contribution plan.
 */
import { strict as assert } from "node:assert";
import {
  buildV2AllocationPlan,
  type V2AllocationInput,
  type V2Holding,
} from "./v2-allocation";

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

const baseHoldings = (): V2Holding[] => [
  { ticker: "SCHD", currency: "USD", shares: 100, price: 27 },
  { ticker: "QLD",  currency: "USD", shares: 50,  price: 90 },
  { ticker: "VFV",  currency: "CAD", shares: 30,  price: 130 },
  { ticker: "SGOV", currency: "USD", shares: 10,  price: 100 },
  { ticker: "IAUM", currency: "USD", shares: 20,  price: 30 },
];
const fxRate = 1.35;

const baseInput = (overrides: Partial<V2AllocationInput> = {}): V2AllocationInput => ({
  holdings: baseHoldings(),
  targets: {
    SCHD: { pct: 30 },
    QLD:  { pct: 40 },
    VFV:  { pct: 30 },
    SGOV: { pct: 0, excluded: true },
    IAUM: { pct: 0, excluded: true },
  },
  reserves: {},
  contributionCAD: 200,
  fxRate,
  redistribution: { rule: "shortfall_proportional" },
  ...overrides,
});

console.log("v2-allocation tests (Core / Non-Core model)");
console.log("--------------------");

test("Non-Core (excluded) tickers receive zero from main contribution", () => {
  const result = buildV2AllocationPlan(baseInput());
  for (const row of result.excludedRows) {
    assert.equal(row.actualSuggestedCAD, 0, `${row.ticker} should be 0, got ${row.actualSuggestedCAD}`);
    assert.equal(row.baseAllocCAD, 0);
    assert.equal(row.redistributedInCAD, 0);
    assert.equal(row.redistributedOutCAD, 0);
    assert.deepEqual(row.reservedFromTickers, []);
    assert.deepEqual(row.reallocatedToTickers, []);
  }
});

test("Core (non-excluded) tickers receive the full contribution via shortfall", () => {
  const result = buildV2AllocationPlan(baseInput());
  const normalSum = result.normalRows.reduce((s, r) => s + r.suggestedContributionCAD, 0);
  assert.ok(close(normalSum, 200, 0.5), `core sum should ≈200, got ${normalSum}`);
});

test("Core regression: SCHD/QLD only — Contribution Plan calculates only those tickers", () => {
  const input = baseInput({
    holdings: [
      { ticker: "SCHD", currency: "USD", shares: 0, price: 27 },
      { ticker: "QLD",  currency: "USD", shares: 0, price: 90 },
      { ticker: "SGOV", currency: "USD", shares: 0, price: 100 },
    ],
    targets: {
      SCHD: { pct: 70 },
      QLD:  { pct: 30 },
      SGOV: { pct: 0, excluded: true },
    },
    contributionCAD: 100,
  });
  const result = buildV2AllocationPlan(input);
  assert.equal(result.normalRows.length, 2);
  assert.equal(result.excludedRows.length, 1);
  // SCHD shortfall vs QLD shortfall — both shares=0 so target ratio prevails
  const schd = result.normalRows.find((r) => r.ticker === "SCHD")!;
  const qld  = result.normalRows.find((r) => r.ticker === "QLD")!;
  assert.ok(close(schd.suggestedContributionCAD, 70, 0.5));
  assert.ok(close(qld.suggestedContributionCAD, 30, 0.5));
  // Non-Core SGOV gets 0 from main contribution
  const sgov = result.excludedRows.find((r) => r.ticker === "SGOV")!;
  assert.equal(sgov.actualSuggestedCAD, 0);
});

test("Toggling Core → Non-Core excludes ticker from contribution immediately", () => {
  // Same holdings, two scenarios: VFV as Core then VFV as Non-Core.
  const inputCore = baseInput({
    targets: {
      SCHD: { pct: 30 }, QLD: { pct: 40 }, VFV: { pct: 30 },
      SGOV: { pct: 0, excluded: true }, IAUM: { pct: 0, excluded: true },
    },
  });
  const inputNonCore = baseInput({
    targets: {
      SCHD: { pct: 50 }, QLD: { pct: 50 },
      VFV:  { pct: 0, excluded: true },
      SGOV: { pct: 0, excluded: true }, IAUM: { pct: 0, excluded: true },
    },
  });
  const aCore = buildV2AllocationPlan(inputCore);
  const aNonCore = buildV2AllocationPlan(inputNonCore);
  const vfvCore = aCore.normalRows.find((r) => r.ticker === "VFV");
  const vfvNonCore = aNonCore.excludedRows.find((r) => r.ticker === "VFV");
  assert.ok(vfvCore && vfvCore.suggestedContributionCAD >= 0);
  assert.ok(vfvNonCore && vfvNonCore.actualSuggestedCAD === 0);
});

test("Non-Core → Core toggle puts the ticker back into contribution", () => {
  const result = buildV2AllocationPlan(baseInput({
    targets: {
      SCHD: { pct: 50 }, QLD: { pct: 30 }, SGOV: { pct: 20 }, // SGOV now Core
    },
    holdings: baseHoldings().filter((h) => h.ticker === "SCHD" || h.ticker === "QLD" || h.ticker === "SGOV"),
  }));
  assert.equal(result.excludedRows.length, 0);
  assert.equal(result.normalRows.length, 3);
  const sgov = result.normalRows.find((r) => r.ticker === "SGOV")!;
  assert.ok(sgov.suggestedContributionCAD >= 0);
});

test("Legacy reserve config preserves in storage but does NOT allocate", () => {
  // Mimics existing user data: excluded ticker with plannedWeeklyCAD set in old reserve config.
  const result = buildV2AllocationPlan(baseInput({
    reserves: {
      SGOV: { targetPct: 5, plannedWeeklyCAD: 50, active: true },
      IAUM: { targetPct: 5, plannedWeeklyCAD: 25, active: true },
    },
  }));
  const sgov = result.excludedRows.find((r) => r.ticker === "SGOV")!;
  const iaum = result.excludedRows.find((r) => r.ticker === "IAUM")!;
  // Allocation must be 0 (not 50/25) under new model
  assert.equal(sgov.actualSuggestedCAD, 0);
  assert.equal(iaum.actualSuggestedCAD, 0);
  // Legacy fields round-trip without crashing
  assert.equal(sgov.plannedWeeklyCAD, 50);
  assert.equal(iaum.plannedWeeklyCAD, 25);
  assert.equal(sgov.active, true);
  assert.equal(iaum.active, true);
  // hasLegacyReserveConfig flag set so UI can hint the user
  assert.equal(sgov.hasLegacyReserveConfig, true);
  assert.equal(iaum.hasLegacyReserveConfig, true);
  assert.ok(result.warnings.some((w) => w.includes("legacy reserve config")));
});

test("nonCorePlan (frequency + cad) round-trips into V2ExcludedRow", () => {
  const result = buildV2AllocationPlan(baseInput({
    targets: {
      SCHD: { pct: 70 }, QLD: { pct: 30 },
      SGOV: { pct: 0, excluded: true, nonCorePlan: { frequency: "weekly", cad: 50 } },
      IAUM: { pct: 0, excluded: true, nonCorePlan: { frequency: "monthly", cad: 250 } },
    },
  }));
  const sgov = result.excludedRows.find((r) => r.ticker === "SGOV")!;
  const iaum = result.excludedRows.find((r) => r.ticker === "IAUM")!;
  assert.deepEqual(sgov.nonCorePlan, { frequency: "weekly", cad: 50 });
  assert.deepEqual(iaum.nonCorePlan, { frequency: "monthly", cad: 250 });
  // Plan does NOT cause main-contribution allocation
  assert.equal(sgov.actualSuggestedCAD, 0);
  assert.equal(iaum.actualSuggestedCAD, 0);
});

test("nonCorePlan absent → undefined on row (no crash)", () => {
  const result = buildV2AllocationPlan(baseInput());
  for (const row of result.excludedRows) {
    assert.equal(row.nonCorePlan, undefined);
  }
});

test("All-Core portfolio: full contribution distributed across Core", () => {
  const result = buildV2AllocationPlan(baseInput({
    holdings: baseHoldings().filter((h) => h.ticker !== "SGOV" && h.ticker !== "IAUM"),
    targets: { SCHD: { pct: 30 }, QLD: { pct: 40 }, VFV: { pct: 30 } },
  }));
  assert.equal(result.excludedRows.length, 0);
  const total = result.normalRows.reduce((s, r) => s + r.suggestedContributionCAD, 0);
  assert.ok(close(total, 200, 0.5));
});

test("All-Non-Core portfolio: zero allocation, contribution undeployed", () => {
  const result = buildV2AllocationPlan(baseInput({
    targets: {
      SCHD: { pct: 0, excluded: true },
      QLD:  { pct: 0, excluded: true },
      VFV:  { pct: 0, excluded: true },
      SGOV: { pct: 0, excluded: true },
      IAUM: { pct: 0, excluded: true },
    },
  }));
  assert.equal(result.normalRows.length, 0);
  for (const row of result.excludedRows) {
    assert.equal(row.actualSuggestedCAD, 0);
  }
});

test("fxRate=0 fallback still works", () => {
  const result = buildV2AllocationPlan(baseInput({ fxRate: 0 }));
  assert.equal(result.fxRate, 1);
  assert.ok(result.warnings.some((w) => w.toLowerCase().includes("fx rate invalid")));
});

test("missing price → valueCAD=0 + missingPrice flag + warning", () => {
  const holdings = baseHoldings().map((h) => h.ticker === "SCHD" ? { ...h, price: null } : h);
  const result = buildV2AllocationPlan(baseInput({ holdings }));
  const schd = result.normalRows.find((r) => r.ticker === "SCHD")!;
  assert.equal(schd.valueCAD, 0);
  assert.equal(schd.missingPrice, true);
  assert.ok(result.warnings.some((w) => w.includes("missing price for SCHD")));
});

test("Empty holdings — no crash, zeros everywhere", () => {
  const result = buildV2AllocationPlan({
    holdings: [],
    targets: {},
    reserves: {},
    contributionCAD: 100,
    fxRate: 1.35,
    redistribution: { rule: "shortfall_proportional" },
  });
  assert.equal(result.totalValueCAD, 0);
  assert.equal(result.normalRows.length, 0);
  assert.equal(result.excludedRows.length, 0);
  assert.equal(result.contributionCAD, 100);
  assert.equal(result.excludedTotalAllocatedCAD, 0);
});

test("Negative contribution clamped to 0 + warning", () => {
  const result = buildV2AllocationPlan(baseInput({ contributionCAD: -100 }));
  assert.equal(result.contributionCAD, 0);
  assert.ok(result.warnings.some((w) => w.includes("negative")));
});

test("Total allocation never exceeds contribution (invariant)", () => {
  for (const cont of [50, 100, 200, 500, 1000]) {
    const r = buildV2AllocationPlan(baseInput({ contributionCAD: cont }));
    const total =
      r.excludedRows.reduce((s, x) => s + x.actualSuggestedCAD, 0) +
      r.normalRows.reduce((s, x) => s + x.suggestedContributionCAD, 0);
    assert.ok(total <= cont + EPS, `contribution=${cont}, total alloc=${total}`);
  }
});

console.log("--------------------");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nErrors:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
