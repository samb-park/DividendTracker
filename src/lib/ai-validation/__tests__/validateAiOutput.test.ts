/* Run: npx tsx src/lib/ai-validation/__tests__/validateAiOutput.test.ts */
import { strict as assert } from "node:assert";

import { validateAiOutput, type ViolationCode } from "../validateAiOutput";

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

function expectPass(text: string) {
  const r = validateAiOutput("ai/test", text, text);
  assert.equal(
    r.ok,
    true,
    `expected pass, got violations: ${r.violations.map((v) => v.code).join(", ")}`,
  );
  assert.equal(r.violations.length, 0);
}

function expectViolation(text: string, code: ViolationCode) {
  const r = validateAiOutput("ai/test", text, text);
  assert.equal(r.ok, false, `expected violation ${code}, but passed`);
  assert.ok(
    r.violations.some((v) => v.code === code),
    `expected ${code}, got: ${r.violations.map((v) => v.code).join(", ")}`,
  );
}

// ── Pass cases ───────────────────────────────────────────────────────────────
test("empty string passes", () => {
  const r = validateAiOutput("ai/test", "", "");
  assert.equal(r.ok, true);
  assert.equal(r.violations.length, 0);
});

test("normal briefing text passes", () => {
  expectPass(
    "QLD 코어 비중이 33% (코어 기준)이므로 §5 정적 70/30 기준으로 진행합니다. SCHD/QLD 모두 정상.",
  );
});

test("rulebook status summary passes", () => {
  expectPass(
    "성장 버킷 비중 32% (total 기준), Soft Exit 임계 (34%) 미만. SGOV 전체 비중 7.5% (total 기준)로 §8 보충 권장.",
  );
});

test("data-only QLD total weight reporting passes (no action verb)", () => {
  // "QLD 전체 비중" is just reported; no action verb in window → not a violation.
  expectPass(
    "QLD 전체 비중은 18% (total 기준)이고 코어 비중은 33% (core 기준)입니다.",
  );
});

// ── SCHD_SELL ────────────────────────────────────────────────────────────────
test("SCHD_SELL detects '30%를 매도'", () => {
  expectViolation("SCHD 30%를 매도하고 SGOV로 갈아타세요.", "SCHD_SELL");
});

test("SCHD_SELL detects 'SCHD를 매도'", () => {
  expectViolation(
    "이번 주에는 SCHD를 매도하고 QQQI으로 옮기는 것이 좋습니다.",
    "SCHD_SELL",
  );
});

test("SCHD_SELL detects 'sell SCHD' (English)", () => {
  expectViolation("You should sell SCHD this week to free up cash.", "SCHD_SELL");
});

// ── QQQI_CRISIS_BUY ──────────────────────────────────────────────────────────
test("QQQI_CRISIS_BUY detects crisis-driven QQQI source", () => {
  expectViolation(
    "위기 T1 트리거 발동 시 QQQI에서 자금을 빼서 TQQQ 매수.",
    "QQQI_CRISIS_BUY",
  );
});

test("QQQI_CRISIS_BUY detects QQQI 매도 → QLD", () => {
  expectViolation("QQQI 매도 후 QLD 매수를 권장합니다.", "QQQI_CRISIS_BUY");
});

test("LEGACY_INCOME_TICKER detects any legacy ticker mention", () => {
  const legacy = ["JE", "PQ"].join("");
  expectViolation(`${legacy} 신규 매수는 더 이상 허용되지 않습니다.`, "LEGACY_INCOME_TICKER");
});

test("QQQI_CAP_WARNING detects QQQI > 5% cap", () => {
  expectViolation("QQQI 전체 비중이 5.01%로 5% 캡을 초과했습니다.", "QQQI_CAP_WARNING");
});

test("QQQI_AUTO_ROUTING detects distribution auto routing", () => {
  expectViolation("QQQI 분배금을 SCHD와 QLD로 자동 라우팅합니다.", "QQQI_AUTO_ROUTING");
});

test("QQQI_FUNDED_BY_CORE_SALE detects core/overlay sale to buy QQQI", () => {
  expectViolation("QLD를 일부 매도하여 QQQI를 매수합니다.", "QQQI_FUNDED_BY_CORE_SALE");
});

// ── SGOV_RETURN_ASSET ────────────────────────────────────────────────────────
test("SGOV_RETURN_ASSET detects yield maximisation", () => {
  expectViolation(
    "SGOV의 yield를 극대화하면 추가 수익이 발생합니다.",
    "SGOV_RETURN_ASSET",
  );
});

test("SGOV_RETURN_ASSET passes pure yield reporting", () => {
  expectPass("SGOV 수익률은 약 4% 수준이며 예비자산으로 활용됩니다.");
});

// ── OPTIMISTIC_SCENARIO ──────────────────────────────────────────────────────
test("OPTIMISTIC_SCENARIO detects 낙관 시나리오", () => {
  expectViolation(
    "낙관 시나리오에서는 CAGR 8%로 가정합니다.",
    "OPTIMISTIC_SCENARIO",
  );
});

test("OPTIMISTIC_SCENARIO detects English 'optimistic scenario'", () => {
  expectViolation(
    "In the optimistic scenario the portfolio grows faster.",
    "OPTIMISTIC_SCENARIO",
  );
});

// ── NDX_TRIGGER ──────────────────────────────────────────────────────────────
test("NDX_TRIGGER detects NDX-value-based trigger", () => {
  expectViolation(
    "NDX 값이 15000 이하로 떨어지면 매도 트리거가 발동됩니다.",
    "NDX_TRIGGER",
  );
});

// ── QLD_WRONG_BASIS ──────────────────────────────────────────────────────────
test("QLD_WRONG_BASIS detects total-basis sell decision", () => {
  expectViolation(
    "QLD 전체 비중이 18%이므로 매도가 필요합니다.",
    "QLD_WRONG_BASIS",
  );
});

// ── QQQI_FIXED_TARGET ────────────────────────────────────────────────────────
test("QQQI_FIXED_TARGET detects 5% target language", () => {
  expectViolation(
    "QQQI 5% 목표를 항상 맞추도록 매수합니다.",
    "QQQI_FIXED_TARGET",
  );
});

// ── AUTO_TRADE_LANGUAGE ──────────────────────────────────────────────────────
test("AUTO_TRADE_LANGUAGE detects 자동 매수 주문", () => {
  expectViolation("자동 매수 주문이 실행됩니다.", "AUTO_TRADE_LANGUAGE");
});

test("AUTO_TRADE_LANGUAGE detects English automatic buy", () => {
  expectViolation(
    "The system will automatically buy more SCHD next week.",
    "AUTO_TRADE_LANGUAGE",
  );
});

// ── Negative-expression false-positive avoidance ─────────────────────────────
test("'SCHD 매도 금지' passes (negation = 금지)", () => {
  expectPass("SCHD 매도 금지 (룰북 §15).");
});

test("'SCHD를 매도하지 마세요' passes (negation = 하지 마)", () => {
  expectPass(
    "SCHD를 매도하지 마세요. 룰북에 따라 SCHD는 매수만 가능합니다.",
  );
});

test("'낙관 시나리오는 사용하지 않음' passes (negation = 하지 않/않음)", () => {
  expectPass(
    "낙관 시나리오는 사용하지 않음. BASE 6 / PESS 4 / WORST 2 만 사용.",
  );
});

test("'NDX 기반 트리거 금지' passes (negation = 금지)", () => {
  expectPass("NDX 기반 트리거는 금지되어 있습니다.");
});

test("'자동 매수 금지' passes (negation = 금지)", () => {
  expectPass("자동 매수는 금지. 모든 거래는 수동 승인 필요.");
});

test("'QQQI 매수 → QLD 매도가 아닙니다' passes (negation = 안 됨)", () => {
  // Reversed-pattern false-positive: should not fire QQQI_CRISIS_BUY.
  expectPass("QQQI 매도 후 QLD 매수는 안 됨 (룰북 위반).");
});

// ── Multiple violations in a single output ──────────────────────────────────
test("multiple violations in one output", () => {
  const t =
    "SCHD를 매도하고 낙관 시나리오 (CAGR 8%) 기준으로 자동 매수합니다.";
  const r = validateAiOutput("ai/test", t, t);
  assert.equal(r.ok, false);
  const codes = r.violations.map((v) => v.code);
  assert.ok(codes.includes("SCHD_SELL"), `missing SCHD_SELL: ${codes.join(",")}`);
  assert.ok(
    codes.includes("OPTIMISTIC_SCENARIO"),
    `missing OPTIMISTIC_SCENARIO: ${codes.join(",")}`,
  );
  assert.ok(
    codes.includes("AUTO_TRADE_LANGUAGE"),
    `missing AUTO_TRADE_LANGUAGE: ${codes.join(",")}`,
  );
});

// ── Snippet + section + reason are populated ────────────────────────────────
test("violation contains code, section, reason, snippet", () => {
  const r = validateAiOutput(
    "ai/test",
    "SCHD를 매도하세요.",
    "SCHD를 매도하세요.",
  );
  assert.equal(r.violations.length, 1);
  const v = r.violations[0];
  assert.equal(v.code, "SCHD_SELL");
  assert.ok(v.section.length > 0);
  assert.ok(v.reason.length > 0);
  assert.ok(v.snippet && v.snippet.length > 0);
});

// ── Final summary ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const e of errors) console.error(` ! ${e}`);
  process.exit(1);
}
