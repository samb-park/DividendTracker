import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const uiCardPath = join(root, "src/components/ui-card.tsx");
assert.equal(existsSync(uiCardPath), true, "Unified Card component should exist at src/components/ui-card.tsx");

const uiCardSource = readFileSync(uiCardPath, "utf8");
const dashboardSource = readFileSync(join(root, "src/components/dashboard-client.tsx"), "utf8");
const dividendIncomeSource = readFileSync(join(root, "src/components/dividend-income-chart.tsx"), "utf8");
const performanceSource = readFileSync(join(root, "src/components/performance-chart.tsx"), "utf8");
const upcomingSource = readFileSync(join(root, "src/components/upcoming-dividends.tsx"), "utf8");
const allocationSource = readFileSync(join(root, "src/components/allocation-bars.tsx"), "utf8");
const chartTokensSource = readFileSync(join(root, "src/lib/chart-tokens.ts"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

assert.match(uiCardSource, /export function Card\(/, "Card component should export a named Card function");
assert.match(uiCardSource, /cn\(/, "Card component should use cn() for class merging");
assert.match(uiCardSource, /border border-border bg-card/, "Card component should centralize the default card chrome");

for (const [name, source] of [
  ["dashboard-client", dashboardSource],
  ["dividend-income-chart", dividendIncomeSource],
  ["performance-chart", performanceSource],
  ["upcoming-dividends", upcomingSource],
  ["allocation-bars", allocationSource],
] as const) {
  assert.match(source, /import \{ Card \} from "\.\/ui-card"/, `${name} should import the shared Card component`);
}

assert.doesNotMatch(
  `${dashboardSource}\n${dividendIncomeSource}\n${performanceSource}\n${upcomingSource}`,
  /<div[^>]+className="[^"]*border border-border bg-card p-4[^"]*"/,
  "Visible overview card wrappers should use Card instead of repeating border/bg/padding classes",
);

assert.match(chartTokensSource, /ALLOCATION_COLORS/, "Allocation colors should live in chart tokens, not only inside AllocationBars");
assert.doesNotMatch(allocationSource, /const COLORS = \[/, "AllocationBars should use shared chart tokens instead of a local COLORS array");
assert.match(packageJson, /src\/components\/ui-card\.test\.ts/, "npm test should include the Card/tokens regression test");

console.log("ui card/tokens tests passed");
