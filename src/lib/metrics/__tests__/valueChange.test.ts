import { strict as assert } from "node:assert";
import { computeWindowValueChangePct } from "../valueChange";

const EPS = 1e-9;
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

test("valueChangePct uses V0 plus cashflow inside the selected window", () => {
  const actual = computeWindowValueChangePct({
    portfolio: [
      { date: "2026-01-01", valueCAD: 1000 },
      { date: "2026-04-01", valueCAD: 1200 },
    ],
    contributions: [
      { date: "2026-01-01", amountCAD: 500 },
      { date: "2026-02-01", amountCAD: 100 },
      { date: "2026-03-01", amountCAD: 50 },
    ],
    t0: "2026-01-01",
    t1: "2026-04-01",
  });
  const expected = ((1200 - 1150) / 1150) * 100;

  assert.ok(close(actual!, expected), `expected ${expected}, got ${actual}`);
});

test("valueChangePct changes when range changes because V0 and in-window cashflows change", () => {
  const allRange = computeWindowValueChangePct({
    portfolio: [
      { date: "2026-01-01", valueCAD: 1000 },
      { date: "2026-06-01", valueCAD: 1200 },
    ],
    contributions: [{ date: "2026-02-01", amountCAD: 100 }],
    t0: "2026-01-01",
    t1: "2026-06-01",
  });
  const shortRange = computeWindowValueChangePct({
    portfolio: [
      { date: "2026-04-01", valueCAD: 1150 },
      { date: "2026-06-01", valueCAD: 1200 },
    ],
    contributions: [{ date: "2026-02-01", amountCAD: 100 }],
    t0: "2026-04-01",
    t1: "2026-06-01",
  });

  assert.notEqual(allRange, shortRange);
  assert.ok(close(allRange!, ((1200 - 1100) / 1100) * 100));
  assert.ok(close(shortRange!, ((1200 - 1150) / 1150) * 100));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
