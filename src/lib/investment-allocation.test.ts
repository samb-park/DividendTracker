import test from "node:test";
import assert from "node:assert/strict";
import { buildAllocationPlan } from "./investment-allocation";

test("excludes cash equivalent holdings from ratio denominator when requested", () => {
  const plan = buildAllocationPlan({
    holdings: [
      { ticker: "VFV", currency: "CAD", marketValue: 700, isCashEquivalent: false },
      { ticker: "CASH", currency: "CAD", marketValue: 300, isCashEquivalent: true },
    ],
    investTargets: { VFV: 100 },
    contributionCAD: 0,
    fxRate: 1.35,
    excludeCashEquivalents: true,
  });

  const vfv = plan.contexts.find((c) => c.ticker === "VFV");
  const cash = plan.contexts.find((c) => c.ticker === "CASH");
  assert.equal(plan.totalEligibleValueCAD, 700);
  assert.equal(vfv?.currentPct, 100);
  assert.equal(cash?.excluded, true);
});

test("all contribution goes to the most underweight ticker regardless of gap size", () => {
  // SCHD 30000 (target 70%), QLD 9500 (target 30%)
  // postTotal = 42100, SCHD target 29470 (surplus), QLD target 12630 (shortfall 3130)
  const plan = buildAllocationPlan({
    holdings: [
      { ticker: "SCHD", currency: "USD", marketValue: 30000 },
      { ticker: "QLD", currency: "USD", marketValue: 9500 },
    ],
    investTargets: { SCHD: 70, QLD: 30 },
    contributionCAD: 770,
    fxRate: 1,
    excludeCashEquivalents: false,
  });

  assert.equal(plan.allocCADByTicker.SCHD, 0);
  assert.equal(plan.allocCADByTicker.QLD, 770);
});

test("excluded ticker is ignored; only underweight gets contribution", () => {
  const plan = buildAllocationPlan({
    holdings: [
      { ticker: "AAA", currency: "CAD", marketValue: 400 },
      { ticker: "BBB", currency: "CAD", marketValue: 570 },
      { ticker: "CCC", currency: "CAD", marketValue: 30 },
    ],
    investTargets: { AAA: 60, BBB: 40 },
    contributionCAD: 100,
    fxRate: 1.35,
    excludeCashEquivalents: false,
    excludedTickers: ["CCC"],
  });

  assert.equal(plan.contexts.find((c) => c.ticker === "CCC")?.excluded, true);
  assert.equal(plan.allocCADByTicker.CCC, 0);
  assert.equal(plan.allocCADByTicker.AAA, 100);
});

test("normalizes targets when excluded tickers cause sum to be under 100%", () => {
  const plan = buildAllocationPlan({
    holdings: [
      { ticker: "SCHD", currency: "USD", marketValue: 500 },
      { ticker: "QLD", currency: "USD", marketValue: 300 },
      { ticker: "SGOV", currency: "USD", marketValue: 200, isCashEquivalent: true },
    ],
    investTargets: { SCHD: 50, QLD: 30, SGOV: 20 },
    contributionCAD: 0,
    fxRate: 1.4,
    excludeCashEquivalents: true,
  });

  const schd = plan.contexts.find((c) => c.ticker === "SCHD")!;
  const qld = plan.contexts.find((c) => c.ticker === "QLD")!;
  assert.ok(Math.abs(schd.currentPct + qld.currentPct - 100) < 0.01);
  assert.ok(Math.abs(schd.targetPct + qld.targetPct - 100) < 0.01);
  assert.ok(Math.abs(schd.targetPct - 62.5) < 0.01);
  assert.ok(Math.abs(qld.targetPct - 37.5) < 0.01);
});
