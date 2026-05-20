/* Run: npx tsx src/lib/ai-throttle.test.ts */
import { strict as assert } from "node:assert";
import { checkAiThrottle, resetAiThrottle } from "./ai-throttle";

let passed = 0;
let failed = 0;
const errors: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`${name}: ${msg}`);
    console.error(`  FAIL  ${name}\n        ${msg}`);
  }
}

console.log("ai-throttle tests");
console.log("--------------------");

test("first call within window is allowed", () => {
  resetAiThrottle();
  const r = checkAiThrottle("u1");
  assert.equal(r.allowed, true);
  assert.equal(r.count, 1);
  assert.equal(r.retryAfterSec, 0);
});

test("limit blocks once reached", () => {
  resetAiThrottle();
  // default limit is 30; spam 30 then expect 31st blocked
  for (let i = 0; i < 30; i++) {
    const r = checkAiThrottle("u2");
    assert.equal(r.allowed, true, `attempt ${i + 1} should be allowed`);
  }
  const blocked = checkAiThrottle("u2");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.equal(blocked.count, 30);
});

test("different users have independent windows", () => {
  resetAiThrottle();
  for (let i = 0; i < 30; i++) checkAiThrottle("a");
  const blockedA = checkAiThrottle("a");
  assert.equal(blockedA.allowed, false);

  const allowedB = checkAiThrottle("b");
  assert.equal(allowedB.allowed, true);
  assert.equal(allowedB.count, 1);
});

test("resetAiThrottle clears specific user only", () => {
  resetAiThrottle();
  for (let i = 0; i < 30; i++) checkAiThrottle("x");
  for (let i = 0; i < 30; i++) checkAiThrottle("y");
  resetAiThrottle("x");
  assert.equal(checkAiThrottle("x").allowed, true);
  assert.equal(checkAiThrottle("y").allowed, false);
});

test("perMinute reflects active limit value", () => {
  resetAiThrottle();
  const r = checkAiThrottle("z");
  assert.equal(r.perMinute, 30); // default
});

console.log("--------------------");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nErrors:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
