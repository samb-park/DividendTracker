import assert from "node:assert/strict";

import { buildPerformanceValuationDates } from "./performance-range";

{
  const dates = buildPerformanceValuationDates({
    snapshots: [{ date: "2026-03-04" }],
    transactions: [],
    cashTransactions: [],
    since: new Date("2026-02-22T00:00:00.000Z"),
  });

  assert.deepEqual(
    dates,
    ["2026-02-22", "2026-03-04"],
    "selected ranges should include the exact range boundary before the first later snapshot date",
  );
}

{
  const dates = buildPerformanceValuationDates({
    snapshots: [{ date: "2026-03-04" }],
    transactions: [{ date: "2026-02-20" }, { date: "2026-04-01" }],
    cashTransactions: [{ date: "2026-03-15" }],
    since: new Date("2026-02-22T00:00:00.000Z"),
  });

  assert.deepEqual(
    dates,
    ["2026-02-22", "2026-03-04", "2026-03-15", "2026-04-01"],
    "selected ranges should drop pre-boundary events while keeping boundary, snapshots, and later events",
  );
}

{
  const dates = buildPerformanceValuationDates({
    snapshots: [{ date: "2026-03-04" }, { date: "2026-03-04" }],
    transactions: [{ date: "2026-03-01" }],
    cashTransactions: [{ date: "2026-02-25" }],
  });

  assert.deepEqual(
    dates,
    ["2026-02-25", "2026-03-01", "2026-03-04"],
    "all ranges should keep the existing sorted unique valuation dates without adding a boundary",
  );
}

console.log("performance-range tests passed");
