import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDividendIncomeProjectionMonths, summarizeDividendProjection } from "./dividend-projection";

const actual = {
  months: [
    { month: "2026-01", items: [{ ticker: "SCHD", amount: 10, net: 10, currency: "USD", accountType: "TFSA" }] },
    { month: "2026-05", items: [{ ticker: "QQQI", amount: 5, net: 4.25, currency: "USD", accountType: "TFSA" }] },
  ],
};
const projected = {
  months: [
    { month: "2026-05", items: [{ ticker: "QQQI", amount: 7, net: 5.95, currency: "USD", accountType: "TFSA" }] },
    { month: "2026-06", items: [{ ticker: "SCHD", amount: 11, net: 11, currency: "USD", accountType: "TFSA" }] },
    { month: "2026-12", items: [{ ticker: "QQQI", amount: 8, net: 6.8, currency: "USD", accountType: "TFSA" }] },
  ],
};

const months = buildDividendIncomeProjectionMonths({ year: 2026, actual, projected, currentYear: 2026, currentMonth: 5 });
assert.equal(months.length, 12);
assert.equal(months[0].source, "received");
assert.equal(months[4].source, "received", "current month should stay received when actual dividend exists");
assert.equal(months[4].items[0].amount, 5, "actual current-month item must not be overwritten by projection");
assert.equal(months[5].source, "projected", "future month should use projected data");
assert.equal(months[11].source, "projected", "December projected bar must be included");

const summary = summarizeDividendProjection(months, (item) => item.amount);
assert.equal(summary.receivedTotal, 15);
assert.equal(summary.projectedTotal, 19);
assert.equal(summary.fullYearTotal, 34);
assert.equal(summary.projectedMonthlyAvg, 34 / 12);

const chartSource = readFileSync("src/components/dividend-income-chart.tsx", "utf8");
assert.match(
  chartSource,
  /color:\s*d\.monthStr === selectedMonth[\s\S]*\? COLOR_SELECTED[\s\S]*:[\s\S]*d\.isProjected[\s\S]*\? COLOR_PROJECTED[\s\S]*:[\s\S]*COLOR_ACTUAL/,
  "projected bars must use COLOR_PROJECTED while received bars use COLOR_ACTUAL",
);
assert.match(chartSource, /backgroundColor:\s*COLOR_PROJECTED/, "legend must include projected color swatch");
assert.match(chartSource, /PROJECTED/, "tooltip or legend must expose PROJECTED label");
assert.match(chartSource, /RECEIVED TOTAL/, "summary must render received total separately");
assert.match(chartSource, /PROJECTED TOTAL/, "summary must render projected total separately");
assert.match(chartSource, /PROJECTED AVG \/ MONTH/, "summary must render projected average per month label");
assert.match(chartSource, /FULL YEAR TOTAL/, "summary must render received + projected full-year total");

console.log("dividend projection tests passed");
