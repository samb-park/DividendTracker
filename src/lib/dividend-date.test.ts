import assert from "node:assert/strict";
import {
  monthKeyFromDate,
  projectDividendMonthsFromAnchor,
} from "./dividend-date";

const schdBoundary = {
  ticker: "SCHD",
  exDividendDate: "2026-06-27",
  paymentDate: "2026-07-03",
  frequency: 4,
};

const calendarIncomeMonth = monthKeyFromDate(new Date(`${schdBoundary.paymentDate}T12:00:00`));
const forecastMonths = projectDividendMonthsFromAnchor({
  anchorDate: schdBoundary.paymentDate,
  frequency: schdBoundary.frequency,
  year: 2026,
});

assert.equal(calendarIncomeMonth, "2026-07");
assert.ok(
  forecastMonths.includes(calendarIncomeMonth),
  `forecast months ${forecastMonths.join(",")} should include calendar income month ${calendarIncomeMonth}`,
);
assert.ok(
  !forecastMonths.includes("2026-06"),
  "pay-date based income projection must not group SCHD boundary payments into the ex-date month",
);

console.log("dividend date boundary tests passed");
