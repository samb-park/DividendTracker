import { strict as assert } from "node:assert";
import { computePerformanceYAxisDomain } from "../performanceDomain";

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

test("uses visible series values instead of forcing zero into the domain", () => {
  const domain = computePerformanceYAxisDomain(
    [
      { portfolio: 44_000, benchmark: 45_000, baseR: 44_500 },
      { portfolio: 51_000, benchmark: 49_000, baseR: 47_000 },
    ],
    ["portfolio", "benchmark", "baseR"],
  );

  assert.deepEqual(domain, [42_000, 53_000]);
});

test("expands nearly flat series around their center", () => {
  const domain = computePerformanceYAxisDomain(
    [
      { portfolio: 50_000, benchmark: 50_010, baseR: 49_990 },
      { portfolio: 50_005, benchmark: 50_000, baseR: 50_015 },
    ],
    ["portfolio", "benchmark", "baseR"],
  );

  assert.deepEqual(domain, [48_000, 52_000]);
});

test("never returns a negative lower bound", () => {
  const domain = computePerformanceYAxisDomain(
    [
      { portfolio: 100, benchmark: 120, baseR: 140 },
      { portfolio: 180, benchmark: 200, baseR: 190 },
    ],
    ["portfolio", "benchmark", "baseR"],
  );

  assert.deepEqual(domain, [0, 1_000]);
});

test("ignores null and non-finite values", () => {
  const domain = computePerformanceYAxisDomain(
    [
      { portfolio: null, benchmark: Number.NaN, baseR: 45_000 },
      { portfolio: 45_500, benchmark: Number.POSITIVE_INFINITY, baseR: null },
    ],
    ["portfolio", "benchmark", "baseR"],
  );

  assert.deepEqual(domain, [43_000, 47_000]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
