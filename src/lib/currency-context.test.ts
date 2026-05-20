import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const currencySource = read("src/lib/currency-context.tsx");
assert.match(currencySource, /createContext/, "currency context must use React Context");
assert.match(currencySource, /CurrencyProvider/, "CurrencyProvider must be exported");
assert.match(currencySource, /useCurrency/, "useCurrency hook must be exported");
assert.match(currencySource, /convertAmount/, "currency conversion helper must be exposed");
assert.match(currencySource, /formatMoney/, "currency formatting helper must be exposed");
assert.match(currencySource, /fxSource/, "currency context must track the FX rate source");

const fxRoutePath = "src/app/api/fx/route.ts";
assert.equal(existsSync(join(root, fxRoutePath)), true, "/api/fx route must exist for client-side rate refresh");
const fxRouteSource = read(fxRoutePath);
assert.match(fxRouteSource, /frankfurter\.app/, "FX route must use a named live source, not only DEFAULT_FX_RATE");
assert.match(fxRouteSource, /DEFAULT_FX_RATE/, "FX route must keep DEFAULT_FX_RATE fallback");
assert.match(fxRouteSource, /source/, "FX route response must include rate source");
assert.match(fxRouteSource, /fallback/, "FX route response must mark fallback status");

const dashboardSource = read("src/components/dashboard-client.tsx");
assert.match(dashboardSource, /CurrencyProvider/, "DashboardClient must mount CurrencyProvider");
assert.match(dashboardSource, /useCurrency\(\)/, "Dashboard content must consume useCurrency");
assert.doesNotMatch(dashboardSource, /useState<\"CAD\" \| \"USD\">/, "currency state must not be local to dashboard content");
assert.match(dashboardSource, /<PerformanceChart\s*\/>/, "PerformanceChart should consume global currency context directly");
assert.match(dashboardSource, /fxSource/, "Dashboard must display or consume the FX source");
assert.match(dashboardSource, /FX:/, "Dashboard must display FX source beside the currency toggle, not in the Performance chart");
assert.match(dashboardSource, /setFxRate, setFxFallback, setFxSource/, "FX refresh effect must include stable currency setters in its dependency array");
assert.match(dashboardSource, /\/api\/fx/, "Dashboard must refresh FX from /api/fx");

const performanceSource = read("src/components/performance-chart.tsx");
assert.match(performanceSource, /useCurrency\(\)/, "Performance chart must use global currency context");
assert.match(performanceSource, /convertAmount\(/, "Performance chart must convert CAD values for USD mode");
assert.match(performanceSource, /formatMoney\(/, "Performance chart tooltip must use shared formatter");

console.log("currency context tests passed");
