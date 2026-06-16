import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const rulebook = readFileSync(join(process.cwd(), "src/lib/rulebook.ts"), "utf8");
const aiRules = readFileSync(join(process.cwd(), "src/lib/ai-output-rules.ts"), "utf8");
const projectionRoute = readFileSync(join(process.cwd(), "src/app/api/ai/projection/route.ts"), "utf8");

assert.match(schema, /model\s+Transaction[\s\S]*\breason\s+String\?/);
assert.match(schema, /enum\s+AccountType[\s\S]*TFSA[\s\S]*RRSP[\s\S]*NON_REG/);
assert.doesNotMatch(schema, /model\s+Position\b/);
assert.doesNotMatch(schema, /model\s+DailyAuditResult\b/);

assert.match(rulebook, /v4\.5\.1/);
assert.match(rulebook, /TQQQ[\s\S]{0,180}TFSA/);
assert.match(rulebook, /profit[\s\S]{0,120}SGOV|SGOV[\s\S]{0,120}profit/i);
assert.doesNotMatch(rulebook, /TQQQ profit sweep sells 100% of profit to Core 60\/40 only/);

assert.match(aiRules, /v4\.5\.1/);
assert.match(aiRules, /TFSA 전용/);
assert.match(aiRules, /TQQQ profit > cost: profit 100% 매도 → SGOV/);
assert.doesNotMatch(aiRules, /TQQQ profit > cost: profit 100% 매도 → Core 60\/40/);

assert.match(projectionRoute, /TQQQ profit sweep → SGOV/);
assert.doesNotMatch(projectionRoute, /TQQQ profit sweep → Core 60\/40/);

console.log("rulebook v4.5.1 source tests passed");
