import assert from "node:assert/strict";

import { computePerformanceDeltaAxisDomain } from "./performance-chart-axis";

{
  const domain = computePerformanceDeltaAxisDomain([0, 50, 100]);

  assert.deepEqual(
    domain,
    { min: 0, max: 105 },
    "positive selected-range deltas should keep the 0 baseline at the bottom",
  );
}

{
  const domain = computePerformanceDeltaAxisDomain([0, -25, 10]);

  assert.deepEqual(
    domain,
    { min: -27, max: 11 },
    "mixed selected-range deltas should keep 0 inside the y-axis domain",
  );
}

{
  const domain = computePerformanceDeltaAxisDomain([0, -25, -10]);

  assert.deepEqual(
    domain,
    { min: -27, max: 0 },
    "negative selected-range deltas should still expose the y=0 x-axis crossing",
  );
}

{
  const domain = computePerformanceDeltaAxisDomain([]);

  assert.deepEqual(
    domain,
    { min: 0, max: 1 },
    "empty delta data should still produce a valid 0-based chart domain",
  );
}

console.log("performance-chart-axis tests passed");
