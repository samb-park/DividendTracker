import { strict as assert } from "node:assert";

import {
  buildTqqqTfsaIsolationAlert,
  validateTQQQAccount,
  type Position,
} from "./portfolio-validator";

const positions: Position[] = [
  { symbol: "SCHD", account: "RRSP", quantity: 10, marketValue: 800 },
  { symbol: "TQQQ", account: "TFSA", quantity: 2, marketValue: 120 },
  { symbol: "TQQQ", account: "RRSP", quantity: 1, marketValue: 60 },
  { symbol: "TQQQ", account: "NON_REG", quantity: 1, marketValue: 60 },
];

const violations = validateTQQQAccount(positions);

assert.equal(violations.length, 2);
assert.deepEqual(
  violations.map((violation) => violation.rule),
  ["TQQQ_TFSA_ONLY", "TQQQ_TFSA_ONLY"],
);
assert.deepEqual(
  violations.map((violation) => violation.severity),
  ["CRITICAL", "CRITICAL"],
);
assert.ok(violations[0].message.includes("RRSP"));
assert.ok(violations[1].message.includes("NON_REG"));
assert.equal(validateTQQQAccount([{ symbol: "TQQQ", account: "TFSA" }]).length, 0);
assert.equal(validateTQQQAccount([{ symbol: "tqqq", account: "TFSA" }]).length, 0);

const alert = buildTqqqTfsaIsolationAlert("user-1", positions);
assert.ok(alert);
assert.equal(alert?.type, "TQQQ_TFSA_ONLY");
assert.equal(alert?.severity, "critical");
assert.equal(alert?.userId, "user-1");
assert.equal(alert?.details.violationCount, 2);
assert.ok(alert?.message.includes("TFSA only"));

console.log("portfolio-validator tests passed");
