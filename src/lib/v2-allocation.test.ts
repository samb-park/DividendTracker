/* Run: npx tsx src/lib/v2-allocation.test.ts */
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
  { ticker: "SCHD", currency: "USD", shares: 100, price: 27 },        // 2700 USD ≈ 3645 CAD
  { ticker: "QLD",  currency: "USD", shares: 50,  price: 90 },        // 4500 USD ≈ 6075 CAD
  { ticker: "VFV",  currency: "CAD", shares: 30,  price: 130 },       // 3900 CAD
  { ticker: "SGOV", currency: "USD", shares: 10,  price: 100 },       // 1000 USD ≈ 1350 CAD (excluded)
  { ticker: "IAUM", currency: "USD", shares: 20,  price: 30 },        // 600 USD  ≈ 810 CAD  (excluded)
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
  reserves: {
    SGOV: { targetPct: 5, plannedWeeklyCAD: 50, active: true },
    IAUM: { targetPct: 5, plannedWeeklyCAD: 25, active: true },
  },
  contributionCAD: 200,
  fxRate,
  redistribution: { rule: "shortfall_proportional" },
  ...overrides,
});

console.log("v2-allocation tests");
console.log("--------------------");

test("1. SGOV<5% & IAUM<5% — both get planned amount, no overflow to normal", () => {
  // total ≈ 3645+6075+3900+1350+810 = 15780 CAD; 5% = 789. SGOV=1350>789 (above!), IAUM=810>789 (just above)
  // Use smaller excluded shares so they're both below 5%
  const holdings = baseHoldings().map((h) => {
    if (h.ticker === "SGOV") return { ...h, shares: 1 };  // 100 USD = 135 CAD
    if (h.ticker === "IAUM") return { ...h, shares: 1 };  // 30 USD = 40.5 CAD
    return h;
  });
  const result = buildV2AllocationPlan(baseInput({ holdings }));
  const sgov = result.excludedRows.find((r) => r.ticker === "SGOV")!;
  const iaum = result.excludedRows.find((r) => r.ticker === "IAUM")!;
  assert.equal(sgov.status, "below_target");
  assert.equal(iaum.status, "below_target");
  assert.ok(sgov.actualSuggestedCAD >= 50 - EPS, `SGOV should get >=50, got ${sgov.actualSuggestedCAD}`);
  assert.ok(iaum.actualSuggestedCAD >= 25 - EPS, `IAUM should get >=25, got ${iaum.actualSuggestedCAD}`);
  // Normal contribution = 200 - 75 = 125
  const normalSum = result.normalRows.reduce((s, r) => s + r.suggestedContributionCAD, 0);
  assert.ok(close(normalSum, 125, 0.5), `normal sum should ≈125, got ${normalSum}`);
});

test("2. SGOV ≥ 5%, IAUM < 5% — SGOV planned redirected to IAUM", () => {
  // SGOV value=1350, total=15780 → 8.55% (above 5%)
  // IAUM value=810, total=15780 → 5.13% — actually slightly above. use IAUM smaller.
  const holdings = baseHoldings().map((h) => h.ticker === "IAUM" ? { ...h, shares: 1 } : h);
  // Now IAUM=40.5 CAD, total≈15010.5, IAUM%≈0.27% (well below 5%)
  // SGOV=1350, SGOV%≈9% (above 5%)
  const result = buildV2AllocationPlan(baseInput({ holdings }));
  const sgov = result.excludedRows.find((r) => r.ticker === "SGOV")!;
  const iaum = result.excludedRows.find((r) => r.ticker === "IAUM")!;
  assert.equal(sgov.status, "above_target");
  assert.equal(iaum.status, "below_target");
  assert.ok(sgov.actualSuggestedCAD < EPS, `SGOV should get 0, got ${sgov.actualSuggestedCAD}`);
  // IAUM gets its own 25 + redistributed 50 from SGOV (capped by gap)
  assert.ok(iaum.actualSuggestedCAD > 25, `IAUM should get >25 after redistribution, got ${iaum.actualSuggestedCAD}`);
  assert.ok(iaum.reservedFromTickers.includes("SGOV"), "IAUM should show SGOV as source");
  assert.ok(sgov.reallocatedToTickers.includes("IAUM"), "SGOV should show IAUM as target");
});

test("3. IAUM ≥ 5%, SGOV < 5% — IAUM planned redirected to SGOV", () => {
  const holdings = baseHoldings().map((h) => h.ticker === "SGOV" ? { ...h, shares: 1 } : h);
  // SGOV=135 CAD, IAUM=810. total≈14515.5. SGOV≈0.93%, IAUM≈5.58%
  const result = buildV2AllocationPlan(baseInput({ holdings }));
  const sgov = result.excludedRows.find((r) => r.ticker === "SGOV")!;
  const iaum = result.excludedRows.find((r) => r.ticker === "IAUM")!;
  assert.equal(iaum.status, "above_target");
  assert.equal(sgov.status, "below_target");
  assert.ok(iaum.actualSuggestedCAD < EPS);
  assert.ok(sgov.actualSuggestedCAD > 50);
  assert.ok(sgov.reservedFromTickers.includes("IAUM"));
});

test("4. Both ≥ 5% — overflow goes entirely to normal group", () => {
  // baseHoldings has SGOV=1350, IAUM=810, total=15780 → SGOV=8.55%, IAUM=5.13%; both above 5%
  const result = buildV2AllocationPlan(baseInput());
  const sgov = result.excludedRows.find((r) => r.ticker === "SGOV")!;
  const iaum = result.excludedRows.find((r) => r.ticker === "IAUM")!;
  assert.ok(sgov.actualSuggestedCAD < EPS);
  assert.ok(iaum.actualSuggestedCAD < EPS);
  // Full 200 should go to normal
  const normalSum = result.normalRows.reduce((s, r) => s + r.suggestedContributionCAD, 0);
  assert.ok(close(normalSum, 200, 0.5), `normal sum should ≈200, got ${normalSum}`);
});

test("5. No excluded tickers — entire contribution to normal", () => {
  const holdings = baseHoldings().filter((h) => h.ticker !== "SGOV" && h.ticker !== "IAUM");
  const input = baseInput({
    holdings,
    targets: { SCHD: { pct: 30 }, QLD: { pct: 40 }, VFV: { pct: 30 } },
    reserves: {},
  });
  const result = buildV2AllocationPlan(input);
  assert.equal(result.excludedRows.length, 0);
  assert.equal(result.normalRows.length, 3);
  const normalSum = result.normalRows.reduce((s, r) => s + r.suggestedContributionCAD, 0);
  assert.ok(close(normalSum, 200, 0.5));
});

test("6. Single normal ticker — gets full contribution", () => {
  const input = baseInput({
    holdings: [{ ticker: "SCHD", currency: "USD", shares: 100, price: 27 }],
    targets: { SCHD: { pct: 100 } },
    reserves: {},
  });
  const result = buildV2AllocationPlan(input);
  assert.equal(result.normalRows.length, 1);
  assert.ok(close(result.normalRows[0].suggestedContributionCAD, 200, 0.5));
  assert.ok(close(result.normalRows[0].normalizedTargetPct, 100, 0.5));
});

test("7. Normal target sum != 100 — normalized + warning", () => {
  const input = baseInput({
    targets: {
      SCHD: { pct: 50 },
      QLD: { pct: 50 },
      VFV: { pct: 50 },                  // sum = 150
      SGOV: { pct: 0, excluded: true },
      IAUM: { pct: 0, excluded: true },
    },
  });
  const result = buildV2AllocationPlan(input);
  assert.ok(result.warnings.some((w) => w.includes("normalized to 100%")));
  for (const r of result.normalRows) assert.ok(close(r.normalizedTargetPct, 33.333, 0.1));
});

test("8. Contribution = 0 — no allocation, but rows still computed", () => {
  const result = buildV2AllocationPlan(baseInput({ contributionCAD: 0 }));
  for (const r of result.normalRows) assert.equal(r.suggestedContributionCAD, 0);
  for (const r of result.excludedRows) assert.equal(r.actualSuggestedCAD, 0);
  assert.ok(result.totalValueCAD > 0);
});

test("9. fxRate = 0 (invalid) — falls back to 1.0 with warning", () => {
  const result = buildV2AllocationPlan(baseInput({ fxRate: 0 }));
  assert.equal(result.fxRate, 1);
  assert.ok(result.warnings.some((w) => w.toLowerCase().includes("fx rate invalid")));
});

test("10. ticker price = null — valueCAD=0 + missingPrice flag + warning", () => {
  const holdings = baseHoldings().map((h) => h.ticker === "SCHD" ? { ...h, price: null } : h);
  const result = buildV2AllocationPlan(baseInput({ holdings }));
  const schd = result.normalRows.find((r) => r.ticker === "SCHD")!;
  assert.equal(schd.valueCAD, 0);
  assert.equal(schd.missingPrice, true);
  assert.ok(result.warnings.some((w) => w.includes("missing price for SCHD")));
});

test("11. Empty holdings (new account) — zeros + no crash", () => {
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
  // No allocation occurred — total alloc must be 0
  assert.equal(result.excludedTotalAllocatedCAD, 0);
});

test("12. Negative contribution — clamped to 0 + warning", () => {
  const result = buildV2AllocationPlan(baseInput({ contributionCAD: -100 }));
  assert.equal(result.contributionCAD, 0);
  assert.ok(result.warnings.some((w) => w.includes("negative")));
});

test("13. Reserve target sum > 100% — warning emitted", () => {
  const result = buildV2AllocationPlan(
    baseInput({
      reserves: {
        SGOV: { targetPct: 60, plannedWeeklyCAD: 50, active: true },
        IAUM: { targetPct: 60, plannedWeeklyCAD: 25, active: true },
      },
    }),
  );
  assert.ok(result.warnings.some((w) => w.includes("exceeds 100%")));
});

test("14. Planned excluded sum > weekly contribution — scaled down + warning", () => {
  const result = buildV2AllocationPlan(
    baseInput({
      contributionCAD: 50,           // less than 75 planned
      // Use IAUM=below target so allocation actually applies
      holdings: baseHoldings().map((h) => h.ticker === "IAUM" ? { ...h, shares: 1 } : h)
        .map((h) => h.ticker === "SGOV" ? { ...h, shares: 1 } : h),
    }),
  );
  assert.ok(result.warnings.some((w) => w.includes("scaling down")));
  const totalAlloc = result.excludedRows.reduce((s, r) => s + r.actualSuggestedCAD, 0)
    + result.normalRows.reduce((s, r) => s + r.suggestedContributionCAD, 0);
  assert.ok(totalAlloc <= 50 + EPS, `total alloc ${totalAlloc} should not exceed contribution 50`);
});

test("15. Inactive excluded ticker — status=inactive, no allocation", () => {
  const result = buildV2AllocationPlan(
    baseInput({
      reserves: {
        SGOV: { targetPct: 5, plannedWeeklyCAD: 50, active: false },
        IAUM: { targetPct: 5, plannedWeeklyCAD: 25, active: true },
      },
    }),
  );
  const sgov = result.excludedRows.find((r) => r.ticker === "SGOV")!;
  assert.equal(sgov.status, "inactive");
  assert.equal(sgov.actualSuggestedCAD, 0);
});

test("16. Total allocation never exceeds contribution (invariant)", () => {
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
