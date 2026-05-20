import { strict as assert } from "node:assert";
import { buildV0AnchoredBaseRateBenchmark } from "../baseRateBenchmark";
import { buildV0AnchoredSpyBenchmark } from "../spyBenchmark";

const EPS = 1e-6;
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

const flatFx = [
  { date: "2026-01-01", rate: 1 },
  { date: "2026-01-02", rate: 1 },
  { date: "2026-01-03", rate: 1 },
  { date: "2026-01-04", rate: 1 },
  { date: "2026-01-05", rate: 1 },
  { date: "2027-01-01", rate: 1 },
];

test("SPY benchmark starts from V0 and follows price return when no window contributions exist", () => {
  const out = buildV0AnchoredSpyBenchmark({
    v0CAD: 1000,
    dates: ["2026-01-01", "2026-01-02"],
    contributions: [],
    pricesUSD: [
      { date: "2026-01-01", close: 100 },
      { date: "2026-01-02", close: 110 },
    ],
    fxRates: flatFx,
  });

  assert.ok(close(out[0].valueCAD, 1000));
  assert.ok(close(out[1].valueCAD, 1100), `expected 1100, got ${out[1].valueCAD}`);
});

test("base rate benchmark compounds V0 by 6 percent over 365 days when no window contributions exist", () => {
  const out = buildV0AnchoredBaseRateBenchmark({
    v0CAD: 1000,
    dates: ["2026-01-01", "2027-01-01"],
    contributions: [],
    ratePercent: 6,
  });

  assert.ok(close(out[0].valueCAD, 1000));
  assert.ok(close(out[1].valueCAD, 1000 * Math.pow(1.06, 365 / 365.25)));
});

test("V0 zero does not divide by zero and returns zero with no window contributions", () => {
  const out = buildV0AnchoredSpyBenchmark({
    v0CAD: 0,
    dates: ["2026-01-01", "2026-01-02"],
    contributions: [],
    pricesUSD: [
      { date: "2026-01-01", close: 100 },
      { date: "2026-01-02", close: 110 },
    ],
    fxRates: flatFx,
  });

  assert.equal(out[0].valueCAD, 0);
  assert.equal(out[1].valueCAD, 0);
  assert.ok(Number.isFinite(out[1].valueCAD));
});

test("SPY and base rate benchmarks match manual formulas with three window contributions", () => {
  const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"];
  const contributions = [
    { date: "2026-01-02", amountCAD: 100 },
    { date: "2026-01-04", amountCAD: 50 },
    { date: "2026-01-05", amountCAD: 25 },
  ];
  const pricesUSD = [
    { date: "2026-01-01", close: 100 },
    { date: "2026-01-02", close: 102 },
    { date: "2026-01-03", close: 101 },
    { date: "2026-01-04", close: 104 },
    { date: "2026-01-05", close: 105 },
  ];

  const spy = buildV0AnchoredSpyBenchmark({
    v0CAD: 1000,
    dates,
    contributions,
    pricesUSD,
    fxRates: flatFx,
  });
  const base = buildV0AnchoredBaseRateBenchmark({
    v0CAD: 1000,
    dates,
    contributions,
    ratePercent: 6,
  });

  const expectedSpyShares = 1000 / 100 + 100 / 102 + 50 / 104 + 25 / 105;
  const expectedSpyValue = expectedSpyShares * 105;
  const expectedBaseValue =
    1000 * Math.pow(1.06, 4 / 365.25) +
    100 * Math.pow(1.06, 3 / 365.25) +
    50 * Math.pow(1.06, 1 / 365.25) +
    25;

  assert.ok(close(spy.at(-1)!.valueCAD, expectedSpyValue));
  assert.ok(close(base.at(-1)!.valueCAD, expectedBaseValue));
});

test("portfolio, SPY, and base rate series all share V0 at t0", () => {
  const v0CAD = 1234.56;
  const dates = ["2026-01-01", "2026-01-02"];
  const portfolio = [
    { date: dates[0], valueCAD: v0CAD },
    { date: dates[1], valueCAD: 1250 },
  ];
  const spy = buildV0AnchoredSpyBenchmark({
    v0CAD,
    dates,
    contributions: [{ date: dates[1], amountCAD: 10 }],
    pricesUSD: [
      { date: dates[0], close: 100 },
      { date: dates[1], close: 101 },
    ],
    fxRates: flatFx,
  });
  const base = buildV0AnchoredBaseRateBenchmark({
    v0CAD,
    dates,
    contributions: [{ date: dates[1], amountCAD: 10 }],
    ratePercent: 4,
  });

  assert.equal(portfolio[0].valueCAD, v0CAD);
  assert.ok(close(spy[0].valueCAD, v0CAD));
  assert.ok(close(base[0].valueCAD, v0CAD));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
