import assert from "node:assert/strict";
import {
  computeShadowPortfolio,
  computeXIRR,
  type ShadowContribution,
  type ShadowMarketPoint,
} from "./performance-shadow";

const flatFx: ShadowMarketPoint[] = [
  { date: "2024-01-01", value: 1 },
  { date: "2024-02-01", value: 1 },
  { date: "2025-12-31", value: 1 },
];

{
  const contributions: ShadowContribution[] = [
    { date: "2024-01-01", amountCAD: 100 },
    { date: "2024-02-01", amountCAD: 100 },
  ];
  const prices: ShadowMarketPoint[] = [
    { date: "2024-01-01", value: 100 },
    { date: "2024-02-01", value: 200 },
    { date: "2025-12-31", value: 300 },
  ];

  const series = computeShadowPortfolio({
    contributions,
    prices,
    fxRates: flatFx,
    dividends: [],
    valuationDates: ["2025-12-31"],
  });

  assert.equal(Math.round(series[0].valueCAD * 100) / 100, 450);

  const buyAndHoldShares = 200 / 100;
  const buyAndHoldValue = buyAndHoldShares * 300;
  assert.equal(buyAndHoldValue, 600);
  assert.notEqual(series[0].valueCAD, buyAndHoldValue, "DCA shadow benchmark must not equal upfront buy-and-hold when prices trend");
}

{
  const contributions: ShadowContribution[] = [
    { date: "2024-01-01", amountCAD: 100 },
  ];
  const prices: ShadowMarketPoint[] = [
    { date: "2024-01-01", value: 100 },
    { date: "2024-06-01", value: 100 },
    { date: "2024-12-31", value: 110 },
  ];
  const dividends = [{ date: "2024-06-01", amount: 10 }];

  const series = computeShadowPortfolio({
    contributions,
    prices,
    fxRates: flatFx,
    dividends,
    valuationDates: ["2024-12-31"],
  });

  assert.equal(Math.round(series[0].valueCAD * 100) / 100, 121, "DRIP should reinvest dividend into additional shares");
  assert.ok(series[0].shares > 1, `DRIP should increase benchmark shadow shares on distribution date, got ${series[0].shares}`);
}

{
  const xirr = computeXIRR([{ date: "2025-01-01", amount: -1000 }], 1100, "2026-01-01");
  assert.ok(xirr !== null);
  assert.ok(Math.abs(xirr - 0.1) < 0.0001, `single lump sum XIRR should return decimal 0.10, got ${xirr}`);
}

{
  const monthlyDeposits = Array.from({ length: 12 }, (_, index) => ({
    date: `2025-${String(index + 1).padStart(2, "0")}-01`,
    amount: -100,
  }));
  const xirr = computeXIRR(monthlyDeposits, 1268, "2026-01-01");
  assert.ok(xirr !== null);
  assert.ok(xirr > 0.10 && xirr < 0.13, `monthly DCA XIRR should be money-weighted and reasonable, got ${xirr}`);
}

{
  const xirr = computeXIRR([
    { date: "2025-01-01", amount: -1000 },
    { date: "2025-06-01", amount: -500 },
  ], 0, "2026-01-01");
  assert.equal(xirr, null, "all-negative XIRR input must return null on convergence failure");
}

{
  const series = computeShadowPortfolio({
    contributions: [{ date: "2025-01-01", amountCAD: 1000 }],
    prices: [
      { date: "2025-01-01", value: 100 },
      { date: "2026-01-01", value: 125 },
    ],
    fxRates: [
      { date: "2025-01-01", value: 1 },
      { date: "2026-01-01", value: 1 },
    ],
    dividends: [],
    valuationDates: ["2025-01-01", "2026-01-01"],
  });

  assert.equal(series[0].shares, 10);
  assert.equal(series[1].valueCAD, 1250, "single-deposit SPY shadow should match buy-and-hold for the same raw-close series");
}

console.log("performance shadow tests passed");
