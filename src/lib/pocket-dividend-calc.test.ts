import assert from "node:assert/strict";
import { detectFrequency } from "./dividend-utils";
import { nextFutureDate, isDateConfirmed } from "./pocket-dividend-dates";
import { netFactor, isQIIExempt } from "./dividend-withholding";
import { roundPercentsTo100 } from "../components/pocket/pocket-donut";

// Fixed "now" so the recent-window / roll-forward logic is deterministic.
const NOW = new Date("2026-06-09T12:00:00Z");

// ---------------------------------------------------------------------------
// H1 — detectFrequency: recent-18-month MEDIAN, not all-history average
// ---------------------------------------------------------------------------

// QLD-like: irregular multi-year early history (which dragged the old average
// to ~6+ months → semiannual, halving the run-rate) but a clean quarterly
// cadence in the recent window.
const qldLike = [
  "2020-01-02",
  "2021-06-30",
  "2022-12-28",
  "2024-12-24",
  "2025-03-25",
  "2025-06-24",
  "2025-09-23",
  "2025-12-24",
  "2026-03-25",
].map((date) => ({ date, amount: 0.1 }));
assert.equal(detectFrequency(qldLike, NOW), 4, "QLD-like recent-quarterly history must be freq=4");

// Plain quarterly / monthly stay correct.
const quarterly = ["2025-09-23", "2025-12-24", "2026-03-25"].map((date) => ({ date, amount: 1 }));
assert.equal(detectFrequency(quarterly, NOW), 4);
const monthly = ["2026-01-30", "2026-02-27", "2026-03-31", "2026-04-30"].map((date) => ({ date, amount: 1 }));
assert.equal(detectFrequency(monthly, NOW), 12);

// Fewer than 2 recent spacings → fall back to median of the FULL history.
const staleSemi = ["2023-06-15", "2023-12-15", "2024-06-15"].map((date) => ({ date, amount: 1 }));
assert.equal(detectFrequency(staleSemi, NOW), 2, "stale history falls back to full-history median");

// <2 records → quarterly guess (unchanged contract).
assert.equal(detectFrequency([{ date: "2026-01-01", amount: 1 }], NOW), 4);

// Special-dividend outlier in the recent window must not flip the verdict.
const withSpecial = [
  "2025-03-25",
  "2025-06-24",
  "2025-07-02", // special
  "2025-09-23",
  "2025-12-24",
  "2026-03-25",
].map((date) => ({ date, amount: 1 }));
assert.equal(detectFrequency(withSpecial, NOW), 4, "special dividend must not distort the median");

// ---------------------------------------------------------------------------
// H2 — nextFutureDate: month-end clamp, no overflow drift, no skipped cycle
// ---------------------------------------------------------------------------

// Monthly anchored Jan 31 → with overflow it drifted (1/31+1mo=3/3...); the
// clamped walk lands on 6/30 (today is 6/9).
assert.equal(nextFutureDate("2026-01-31", 12, NOW), "2026-06-30");
// Monthly ex 5/31: the old code skipped the imminent 6/30 cycle (→7/1).
assert.equal(nextFutureDate("2026-05-31", 12, NOW), "2026-06-30");
// Quarterly end-of-month anchor 11/30 → 2/28 → 5/31 → 8/31 (stays month-end).
assert.equal(nextFutureDate("2025-11-30", 4, NOW), "2026-08-31");
// Non-month-end day is preserved exactly.
assert.equal(nextFutureDate("2026-01-15", 12, NOW), "2026-06-15");
// Already-future dates are returned untouched.
assert.equal(nextFutureDate("2026-06-25", 4, NOW), "2026-06-25");
// Anchor day survives an intermediate clamp (3/31 → 6/30 → 9/30 month-end).
assert.equal(nextFutureDate("2026-03-31", 4, new Date("2026-07-01T12:00:00Z")), "2026-09-30");
assert.equal(nextFutureDate(null, 12, NOW), null);
assert.equal(nextFutureDate("garbage", 12, NOW), null);

// ---------------------------------------------------------------------------
// H3 — netFactor: QII (US Treasury interest, IRC §871(k)) exempt everywhere
// ---------------------------------------------------------------------------

for (const t of ["SGOV", "BIL", "USFR", "SHV", "TFLO", "GBIL", "CLTL", "BILS", "XBIL", "TBIL"]) {
  assert.ok(isQIIExempt(t), `${t} must be QII-exempt`);
  for (const acct of ["TFSA", "FHSA", "RESP", "RRSP", "NON_REG"]) {
    assert.equal(netFactor(acct, "USD", t), 1.0, `${t} in ${acct} must have netFactor 1.0`);
  }
}
assert.ok(!isQIIExempt("SCHD"));
// Equity ETFs unchanged: TFSA 15% withheld, RRSP treaty-exempt, NON_REG gross.
assert.equal(netFactor("TFSA", "USD", "SCHD"), 0.85);
assert.equal(netFactor("FHSA", "USD", "SCHD"), 0.85);
assert.equal(netFactor("RRSP", "USD", "SCHD"), 1.0);
assert.equal(netFactor("NON_REG", "USD", "SCHD"), 1.0);
assert.equal(netFactor("TFSA", "CAD", "ZEB.TO"), 1.0);
// Gross back-calculation (net / factor) is identity for QII tickers.
assert.equal(100 / netFactor("TFSA", "USD", "SGOV"), 100);

// ---------------------------------------------------------------------------
// L3 — donut percents: largest-remainder, always sums to exactly 100
// ---------------------------------------------------------------------------

const cases: number[][] = [
  [0.405, 0.405, 0.19], // naive rounding gives 41+41+19 = 101
  [0.334, 0.333, 0.333], // naive gives 33+33+33 = 99
  [0.5, 0.5],
  [0.987, 0.009, 0.004], // sub-1% tail slices
  [1],
];
for (const fr of cases) {
  const pcts = roundPercentsTo100(fr);
  assert.equal(
    pcts.reduce((a, b) => a + b, 0),
    100,
    `percents for [${fr.join(",")}] must sum to 100, got [${pcts.join(",")}]`
  );
}
// The largest remainders win the leftover points.
assert.deepEqual(roundPercentsTo100([0.334, 0.333, 0.333]), [34, 33, 33]);
// A tiny positive slice may stay 0 (the UI shows "<1%" for it).
assert.equal(roundPercentsTo100([0.987, 0.009, 0.004])[2], 0);

// ---------------------------------------------------------------------------
// L4 — source-estimated future rows are NOT confirmed
// ---------------------------------------------------------------------------

assert.equal(isDateConfirmed({ dateUpcoming: true, sourceEstimated: false }), true);
assert.equal(isDateConfirmed({ dateUpcoming: true, sourceEstimated: true }), false, "source estimate ≠ confirmed");
assert.equal(isDateConfirmed({ dateUpcoming: false, sourceEstimated: false }), false);

console.log("pocket-dividend-calc.test.ts passed");
