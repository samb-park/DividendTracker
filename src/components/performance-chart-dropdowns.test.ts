import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getActiveBaseRateOptions,
  getProjectionSelectionLabel,
  type ProjectionSelection,
} from "../lib/performance-projection";

const chartSource = readFileSync(join(process.cwd(), "src/components/performance-chart.tsx"), "utf8");
const dashboardSource = readFileSync(join(process.cwd(), "src/components/dashboard-client.tsx"), "utf8");
const projectionSource = readFileSync(join(process.cwd(), "src/lib/performance-projection.ts"), "utf8");
const benchmarkRouteSource = readFileSync(join(process.cwd(), "src/app/api/benchmarks/route.ts"), "utf8");
const snapshotsRouteSource = readFileSync(join(process.cwd(), "src/app/api/snapshots/route.ts"), "utf8");
const cashTransactionsRouteSource = readFileSync(join(process.cwd(), "src/app/api/cash-transactions/route.ts"), "utf8");
const questradeSyncSource = readFileSync(join(process.cwd(), "src/lib/questrade-sync.ts"), "utf8");
const schemaSource = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const source = `${chartSource}\n${projectionSource}`;
const cashActionEnum = schemaSource.match(/enum CashAction\s*\{([\s\S]*?)\}/)?.[1] ?? "";

assert.match(
  source,
  /useState<BenchmarkTicker>\("SPY"\)/,
  "Performance benchmark dropdown should default to SPY",
);

assert.match(
  chartSource,
  /useState<ProjectionSelection>\("6"\)/,
  "Performance BASE dropdown should default to 6%",
);

for (const label of ["2%", "4%", "6%", "8%", "10%", "12%", "ALL"]) {
  assert.match(source, new RegExp(`label: "${label}"`), `BASE dropdown should include numeric-only ${label} option`);
}

assert.doesNotMatch(
  source,
  />\s*NONE\s*</,
  "Performance dropdown menus should not render a NONE option",
);

assert.doesNotMatch(
  source,
  /label: "[^"]*(WORST|PESSIMISTIC|BASE)[^"]*"/,
  "BASE dropdown labels should not include reason text such as WORST/PESSIMISTIC/BASE",
);

assert.match(source, /baseRate2/, "Chart data should expose BASE 2% line");
assert.match(source, /baseRate4/, "Chart data should expose BASE 4% line");
assert.match(source, /baseRate6/, "Chart data should expose BASE 6% line");
assert.match(source, /baseRate8/, "Chart data should expose BASE 8% line");
assert.match(source, /baseRate10/, "Chart data should expose BASE 10% line");
assert.match(source, /baseRate12/, "Chart data should expose BASE 12% line");

for (const color of ["#FF4444", "#FFD700", "#FF9500", "#00D9C0", "#B388FF", "#F472B6"]) {
  assert.match(source, new RegExp(color.replace("#", "#")), `ALL visualization should include requested color ${color}`);
}

for (const dash of ["[5, 5]", "[8, 4]", "[10, 3]", "[12, 4]", "[14, 3]", "[16, 4]"]) {
  assert.match(source.replace(/\s/g, ""), new RegExp(dash.replace(/[\[\] ]/g, "")), `ALL visualization should include requested dash ${dash}`);
}

assert.match(source, /baseBand/, "ALL visualization should include band fill between BASE 2% and BASE 12%");
assert.match(chartSource, /const PORTFOLIO_LINE_COLOR = "#4ADE80"/, "Portfolio Value line should use green-400 on dark background");
assert.match(chartSource, /const PORTFOLIO_LINE_WIDTH = 2/, "Portfolio Value line width should be 2px");
assert.match(chartSource, /const BASE_LINE_COLOR = "#FB923C"/, "BASE line should use orange-400 on dark background");
assert.match(chartSource, /const BASE_LINE_DASH = \[8, 4\]/, "BASE dash should use 8 4 pattern");
assert.match(chartSource, /const BASE_LINE_WIDTH = 1\.5/, "BASE line width should be 1.5px");
assert.match(chartSource, /const BENCHMARK_LINE_COLOR = "#22D3EE"/, "Benchmark line should use visible cyan on dark background");
assert.match(chartSource, /const BENCHMARK_LINE_DASH = \[6, 4\]/, "Benchmark dash should use wider 6 4 pattern");
assert.match(chartSource, /const BENCHMARK_LINE_WIDTH = 1\.5/, "Benchmark line width should be 1.5px");
assert.match(chartSource, /title="외부 투입 자금 기준 연환산 수익률"/, "XIRR tooltip must describe ExternalDeposit-only money-weighted return");
assert.doesNotMatch(chartSource, /Uses first visible portfolio value as the initial cash outflow/, "XIRR tooltip must not describe snapshot principal as a cashflow");
assert.match(chartSource, /xirr \* 100/, "XIRR UI must convert decimal XIRR to percentage display");
assert.match(chartSource, /PORTFOLIO_LINE_COLOR/, "Legend chips must use the same portfolio color constant as chart series");
assert.match(chartSource, /BASE_LINE_COLOR/, "Legend chips must use the same BASE color constant as chart series");
assert.match(
  chartSource,
  /baselinePortfolioValueCAD/,
  "Performance chart should capture the first visible portfolio value as the range baseline",
);
assert.match(
  chartSource,
  /buildCashflowAdjustedBenchmarkSeries/,
  "SPY/QLD/QQQ overlays must use the first visible portfolio value plus selected-range cashflows",
);
assert.match(
  snapshotsRouteSource,
  /contributionEventsFromCashTxns\(cashTxns\)/,
  "Performance cashflow overlays must be sourced from CashTransaction records only",
);
assert.doesNotMatch(
  snapshotsRouteSource,
  /contributionEventsFromCashTxns\(transactions|contributionEventsFromCashTxns\(engineLedgerRows|contributionEventsFromCashTxns\(ledgerRows/,
  "Performance cashflow overlays must not source BUY/SELL/DIVIDEND/DRIP/FX ledger or transaction rows",
);
assert.match(
  cashActionEnum,
  /\bDEPOSIT\b/,
  "CashTransaction action enum must include external deposits",
);
assert.match(
  cashActionEnum,
  /\bWITHDRAWAL\b/,
  "CashTransaction action enum must include external withdrawals",
);
assert.doesNotMatch(
  cashActionEnum,
  /\b(BUY|SELL|DIVIDEND|DRIP|FX_CONVERT|FEE|ADJUSTMENT)\b/,
  "CashTransaction action enum must not include internal trade, dividend, FX, fee, or adjustment events",
);
assert.match(
  cashTransactionsRouteSource,
  /\["DEPOSIT",\s*"WITHDRAWAL"\]\.includes\(action as string\)/,
  "Manual cashflow API must reject actions other than external DEPOSIT/WITHDRAWAL",
);
assert.match(
  questradeSyncSource,
  /function mapCashAction[\s\S]*type === "Deposits"[\s\S]*type === "Withdrawals"[\s\S]*return null;/,
  "Questrade sync must map only broker deposits/withdrawals into CashTransaction records",
);
assert.match(
  questradeSyncSource,
  /function mapAction[\s\S]*action === "Buy"[\s\S]*action === "Sell"[\s\S]*DIVIDEND/,
  "Questrade BUY/SELL/DIVIDEND activity must stay in Transaction records, not CashTransaction records",
);
assert.match(
  benchmarkRouteSource,
  /mode: "price-return"/,
  "Benchmark API must return raw ticker price-return points, not a contribution-weighted shadow portfolio",
);
assert.doesNotMatch(
  benchmarkRouteSource,
  /computeShadowPortfolio|shadow-dca/,
  "Benchmark API must not feed the chart with precomputed shadow-DCA values; the chart computes cashflow adjustment from raw prices",
);
assert.match(
  benchmarkRouteSource,
  /transaction\.findMany/,
  "Benchmark API must include the same transaction event dates used by /api/snapshots for the selected range",
);
assert.match(
  benchmarkRouteSource,
  /cashTransaction\.findMany/,
  "Benchmark API must include the same cash event dates used by /api/snapshots for the selected range",
);
assert.match(
  chartSource,
  /buildCashflowAdjustedBaselineReturnSeriesForRate/,
  "BASE overlays must start from the first visible portfolio value and compound selected-range cashflows",
);
assert.match(
  chartSource,
  /SAME CASHFLOW BASIS/,
  "Legend must identify benchmark and BASE overlays as same-cashflow comparisons",
);

assert.doesNotMatch(chartSource, /endpointMarkPoint/, "Chart should not render right-side endpoint markPoint labels");
assert.doesNotMatch(chartSource, /endpointLabel/, "Chart should not keep endpoint label formatter helpers");
assert.doesNotMatch(chartSource, /markPoint:\s*endpointMarkPoint/, "Portfolio and BASE series should not attach endpoint markPoint labels");
assert.doesNotMatch(chartSource, /Zoom on BASE band/, "Y-axis zoom toggle should be removed");
assert.doesNotMatch(chartSource, /type\s+YAxisMode/, "Y-axis mode type should be removed");
assert.doesNotMatch(chartSource, /useState<YAxisMode>/, "Y-axis mode state should be removed");
assert.doesNotMatch(chartSource, /setYAxisMode/, "Y-axis mode handler should be removed");
assert.doesNotMatch(dashboardSource, /tabs=\{\["PERFORMANCE",\s*"EQUITY"\]/, "Overview should not render a Performance/Equity tab group");
assert.doesNotMatch(dashboardSource, /useState<"PERFORMANCE"\s*\|\s*"EQUITY">/, "Overview should not keep Performance/Equity tab state");
assert.doesNotMatch(dashboardSource, />\s*Equity\s*</, "Overview should not render an Equity tab label");

const projectionSelections: ProjectionSelection[] = ["6", "all", "2", "all", "8", "6"];
const expectedLabels = ["6%", "ALL", "2%", "ALL", "8%", "6%"];
assert.deepEqual(
  projectionSelections.map((selection) => getProjectionSelectionLabel(selection)),
  expectedLabels,
  "BASE dropdown label must follow every controlled state transition including ALL back to numeric options",
);

assert.deepEqual(
  getActiveBaseRateOptions("all").map((option) => option.label),
  ["2%", "4%", "6%", "8%", "10%", "12%"],
  "ALL selection should render every BASE projection line",
);

for (const selection of ["2", "4", "6", "8", "10", "12"] satisfies ProjectionSelection[]) {
  assert.deepEqual(
    getActiveBaseRateOptions(selection).map((option) => option.label),
    [`${selection}%`],
    `Numeric BASE selection ${selection}% should render only its matching line after leaving ALL mode`,
  );
}

assert.match(
  chartSource,
  /getProjectionSelectionLabel\(selectedProjection\)/,
  "Performance chart button label should be derived from the same controlled projection state helper",
);
assert.match(
  chartSource,
  /getActiveBaseRateOptions\(selectedProjection\)/,
  "Performance chart line visibility should be derived from the same controlled projection state helper",
);

assert.match(
  chartSource,
  /buildCashflowAdjustedBaselineReturnSeriesForRate\(\s*snapshots,\s*baselinePortfolioValueCAD,\s*contributionEventsCAD,\s*option\.cagrPct,\s*\)/,
  "Performance chart BASE series must use selected-range portfolio baseline, cashflows, and fixed return rate",
);

assert.match(
  chartSource,
  /<ReactECharts[^>]+notMerge=\{true\}/,
  "ECharts must not merge old ALL-mode series when switching back to a numeric BASE option",
);

console.log("performance-chart dropdown tests passed");
