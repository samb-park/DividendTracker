/* Run: npx tsx src/lib/ai-output-rules.test.ts */
import { strict as assert } from "node:assert";
import { sanitizeAiOutput, RULEBOOK_GUARDRAILS, RULEBOOK_PROMPT_VERSION, BRIEFING_STRUCTURE, INSIGHT_STRUCTURE, PROJECTION_STRUCTURE } from "./ai-output-rules";

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

test("strips markdown bold (**text**)", () => {
  assert.equal(sanitizeAiOutput("이번 주는 **SCHD** 매수 권장"), "이번 주는 SCHD 매수 권장");
});

test("strips markdown bold __text__", () => {
  assert.equal(sanitizeAiOutput("__중요__: 매도 금지"), "중요: 매도 금지");
});

test("normalizes leading asterisk bullets to dashes", () => {
  const input = "요약\n* 첫째\n* 둘째";
  const out = sanitizeAiOutput(input);
  assert.ok(out.includes("- 첫째"), `got: ${out}`);
  assert.ok(out.includes("- 둘째"));
});

test("strips markdown headers (#, ##)", () => {
  assert.equal(sanitizeAiOutput("# 제목\n## 부제목"), "제목\n부제목");
});

test("replaces leaked field names with Korean labels", () => {
  const input = "현재 coreCAD = 49,750. qldCoreWeightPct = 44.3%. schdBuyCAD: 300.";
  const out = sanitizeAiOutput(input);
  assert.ok(!out.includes("coreCAD"), `coreCAD leaked: ${out}`);
  assert.ok(!out.includes("qldCoreWeightPct"), `qldCoreWeightPct leaked: ${out}`);
  assert.ok(!out.includes("schdBuyCAD"), `schdBuyCAD leaked: ${out}`);
  assert.ok(out.includes("코어 평가금액"));
  assert.ok(out.includes("QLD 코어 비중"));
  assert.ok(out.includes("이번 주 SCHD 매수금액"));
});

test("does not corrupt regular Korean output", () => {
  const input = [
    "1. 현재 포트폴리오 상태",
    "코어 평가금액은 $49,750 CAD입니다.",
    "QLD 코어 비중 = 44.3%로 긴급 매도 신호 도달.",
    "",
    "2. 이번 주 실행안",
    "이번 주 SCHD 매수금액: $300 CAD",
  ].join("\n");
  const out = sanitizeAiOutput(input);
  assert.equal(out, input);
});

test("strips inline single-asterisk emphasis between non-words", () => {
  assert.equal(sanitizeAiOutput("이것은 *중요한* 메시지"), "이것은 중요한 메시지");
});

test("preserves arithmetic asterisks (10 * 5)", () => {
  // Single * surrounded by spaces and digits is arithmetic, not emphasis — keep it.
  const out = sanitizeAiOutput("계산: 10 * 5 = 50");
  assert.equal(out, "계산: 10 * 5 = 50");
});

test("flattens markdown tables to dash-list lines", () => {
  const input = [
    "이번 주 실행안:",
    "| 자산 | 이번 주 매수 |",
    "|------|-------------:|",
    "| SCHD | $300 |",
    "| QLD | $0 |",
    "| SGOV | $50 |",
    "",
    "끝.",
  ].join("\n");
  const out = sanitizeAiOutput(input);
  // The pipe-rows should be gone.
  assert.ok(!out.includes("|------"), `separator leaked: ${out}`);
  assert.ok(!out.includes("| SCHD |"), `pipe row leaked: ${out}`);
  // The data should be preserved as dash-list lines.
  assert.ok(out.includes("자산: SCHD"), `expected dash-list, got: ${out}`);
  assert.ok(out.includes("이번 주 매수: $300"));
  assert.ok(out.includes("자산: QLD"));
  assert.ok(out.includes("자산: SGOV"));
  assert.ok(out.includes("끝."));
});

test("does not mangle text containing single pipes", () => {
  const input = "참고: 사용자 ID = abc | 시작일 2026-01-01";
  // No table separator → leave alone.
  assert.equal(sanitizeAiOutput(input), input);
});

test("RULEBOOK_GUARDRAILS encodes the v4.4.6.1 hard rules", () => {
  // QQQM weekly cash accumulation rule (v4.4.6.1 — replaces QQQI satellite slot)
  assert.ok(
    RULEBOOK_GUARDRAILS.includes("QQQM") && RULEBOOK_GUARDRAILS.includes("45 CAD"),
    "QQQM weekly 45 CAD cash-accum rule missing",
  );
  assert.ok(RULEBOOK_GUARDRAILS.includes("Sangbong TFSA"), "QQQM Sangbong TFSA account constraint missing");
  assert.ok(RULEBOOK_GUARDRAILS.includes("TFSA 잔여"), "TFSA room condition missing");
  // Static 70/30 (Method B 폐지)
  assert.ok(
    RULEBOOK_GUARDRAILS.includes("Core 정적 70/30") || RULEBOOK_GUARDRAILS.includes("정적 70/30"),
    "Core static 70/30 wording missing",
  );
  // Core weekly 380 CAD
  assert.ok(RULEBOOK_GUARDRAILS.includes("380 CAD"), "Core weekly 380 CAD missing");
  assert.ok(RULEBOOK_GUARDRAILS.includes("266") && RULEBOOK_GUARDRAILS.includes("114"), "SCHD 266 / QLD 114 split missing");
  // BOTH Soft Exit (34%) AND Emergency cap (38%) present
  assert.ok(RULEBOOK_GUARDRAILS.includes("Growth bucket ≥ 34%"), "34% Soft Exit threshold required");
  assert.ok(RULEBOOK_GUARDRAILS.includes("Growth bucket ≥ 38%"), "38% Hard/Emergency threshold missing");
  assert.ok(RULEBOOK_GUARDRAILS.includes("Soft Exit"), "Soft Exit reference missing");
  // SCHD dividend reinvestment must be specified as 70/30
  assert.ok(RULEBOOK_GUARDRAILS.includes("SCHD 배당"), "SCHD dividend reinvestment rule missing");
  // SGOV v4.4.6.1: base 5% / max 8% / min 0% (no floor)
  assert.ok(RULEBOOK_GUARDRAILS.includes("base 5%") || RULEBOOK_GUARDRAILS.includes("baseline 5%") || RULEBOOK_GUARDRAILS.includes("바닥 없음"),
    "SGOV v4.4.6.1 base/max/min description missing");
  assert.ok(RULEBOOK_GUARDRAILS.includes("max 8%"), "SGOV max 8% missing");
  assert.ok(!RULEBOOK_GUARDRAILS.includes("가용 버퍼"), "v4.4.6.1: '가용 버퍼' (v4.4.2 term) must be removed");
  // QQQM 12/31 annual skim
  assert.ok(RULEBOOK_GUARDRAILS.includes("12/31"), "12/31 annual skim date missing");
  assert.ok(RULEBOOK_GUARDRAILS.includes("4%") && RULEBOOK_GUARDRAILS.includes("skim"), "QQQM 4% skim missing");
  // Annual rebalance
  assert.ok(RULEBOOK_GUARDRAILS.includes("Case A"), "annual rebal Case A missing");
  assert.ok(RULEBOOK_GUARDRAILS.includes("Case B"), "annual rebal Case B missing");
  assert.ok(RULEBOOK_GUARDRAILS.includes("성장 버킷"), "growth bucket reference missing");
  // Version
  assert.ok(RULEBOOK_GUARDRAILS.includes("v4.4.6.1"), "rulebook version stamp must be v4.4.6.1");
  assert.ok(!RULEBOOK_GUARDRAILS.includes("v4.3.1"), "stale v4.3.1 stamp must be removed");
  assert.ok(!RULEBOOK_GUARDRAILS.includes("v4.1.10"), "stale v4.1.10 stamp must be removed");
  // AI override block
  assert.ok(RULEBOOK_GUARDRAILS.includes("시장 전망"), "sentiment override block missing");
  assert.ok(RULEBOOK_GUARDRAILS.includes("override 금지"), "override prohibition missing");
  // Accept / Reject / Modify
  assert.ok(RULEBOOK_GUARDRAILS.includes("Accept"));
  assert.ok(RULEBOOK_GUARDRAILS.includes("Reject"));
  assert.ok(RULEBOOK_GUARDRAILS.includes("Modify"));
  // Prohibitions
  assert.ok(RULEBOOK_GUARDRAILS.includes("NDX 기반 trigger 재도입 금지"));
  assert.ok(RULEBOOK_GUARDRAILS.includes("Method B"), "Method B prohibition statement must be present");
  assert.ok(RULEBOOK_GUARDRAILS.includes("QQQM"), "QQQM rule presence required");
  assert.ok(RULEBOOK_GUARDRAILS.includes("Optimistic"));
  // QQQM specific prohibitions
  assert.ok(RULEBOOK_GUARDRAILS.includes("QQQM 분기") || RULEBOOK_GUARDRAILS.includes("분기 매도"),
    "QQQM quarterly profit-taking prohibition missing");
  // Daily vs month-end close
  assert.ok(RULEBOOK_GUARDRAILS.includes("MONTH-END") || RULEBOOK_GUARDRAILS.includes("Month-end"),
    "Crisis trigger month-end close requirement missing");
  // 확인 필요 tag
  assert.ok(RULEBOOK_GUARDRAILS.includes("확인 필요"));
});

test("RULEBOOK_PROMPT_VERSION exists and is non-empty (cache invalidation guard)", () => {
  assert.ok(typeof RULEBOOK_PROMPT_VERSION === "string");
  assert.ok(RULEBOOK_PROMPT_VERSION.length > 0);
});

test("BRIEFING_STRUCTURE: status-only role, no execution-action section", () => {
  assert.ok(BRIEFING_STRUCTURE.includes("현재 포트폴리오 상태"));
  assert.ok(BRIEFING_STRUCTURE.includes("룰북 기준 판단"));
  assert.ok(BRIEFING_STRUCTURE.includes("주의할 점"));
  assert.ok(!BRIEFING_STRUCTURE.includes("이번 주 실행안"), "BRIEFING should not include execution section (Method B 표가 authoritative)");
  assert.ok(BRIEFING_STRUCTURE.includes("적지 마라") || BRIEFING_STRUCTURE.includes("표가 authoritative"), "BRIEFING should explicitly forbid action amounts");
});

test("INSIGHT_STRUCTURE: analysis-only role, no '다음 액션' wording", () => {
  assert.ok(INSIGHT_STRUCTURE.includes("핵심 인사이트"));
  assert.ok(INSIGHT_STRUCTURE.includes("왜 그런 판단인지"));
  assert.ok(INSIGHT_STRUCTURE.includes("다음에 관찰할 신호"));
  assert.ok(INSIGHT_STRUCTURE.includes("확인 필요 항목"));
  assert.ok(!INSIGHT_STRUCTURE.includes("다음 액션"), "INSIGHTS should drop '다음 액션' to avoid execution duplication");
});

test("PROJECTION_STRUCTURE: future-focused, no execution + no current-state duplication", () => {
  assert.ok(PROJECTION_STRUCTURE.includes("시나리오별 예상 결과"));
  assert.ok(PROJECTION_STRUCTURE.includes("Rebalancing / Trigger 미래 영향"));
  assert.ok(PROJECTION_STRUCTURE.includes("확인 필요 항목"));
  assert.ok(!PROJECTION_STRUCTURE.includes("이번 주 실행안"), "PROJECTION narrative should not include execution section");
  assert.ok(!PROJECTION_STRUCTURE.includes("1. 현재 포트폴리오 상태"), "PROJECTION narrative should not duplicate current-state table content");
});

test("RULEBOOK_GUARDRAILS forbids re-explaining authoritative tables", () => {
  assert.ok(RULEBOOK_GUARDRAILS.includes("화면에 이미 표시되는 표"), "guardrails must mention displayed tables");
  assert.ok(RULEBOOK_GUARDRAILS.includes("표를 텍스트로 재작성 금지"), "must forbid table re-explanation");
});

test("v4.4.6.1-1: prompt includes self-check and no table restatement rules", () => {
  assert.ok(RULEBOOK_GUARDRAILS.includes("[자체 검증"), "self-check section missing");
  assert.ok(RULEBOOK_GUARDRAILS.includes("화면에 이미 표시되는 표"), "no table restatement rule missing");
  assert.ok(RULEBOOK_GUARDRAILS.includes("매수 CAD 금액을 narrative에서 반복하지"), "action amount repetition guard missing");
  // v4.4.6.1 prompt version
  assert.equal(RULEBOOK_PROMPT_VERSION, "v4.4.6.1-1", "RULEBOOK_PROMPT_VERSION must be v4.4.6.1-1");
});

test("flags fields are mapped", () => {
  const input = "qldEmergencyCap=true, sgovNeedsRefill=true, iaumAtCap=false";
  const out = sanitizeAiOutput(input);
  assert.ok(!out.includes("qldEmergencyCap"));
  assert.ok(!out.includes("sgovNeedsRefill"));
  assert.ok(!out.includes("iaumAtCap"));
  assert.ok(out.includes("QLD 긴급 매도 신호"));
  assert.ok(out.includes("SGOV 보충 필요"));
  assert.ok(out.includes("IAUM 상한 도달"));
});

test("v4.4.6.1: QQQM field labels added to sanitizer map", () => {
  const input = "qqqmCAD=$5000, qqqmTotalWeightPct=2.5, qqqmCumulativeCostUsd=$3107, qqqmCumulativeShares=15";
  const out = sanitizeAiOutput(input);
  assert.ok(!out.includes("qqqmCAD"), `qqqmCAD leaked: ${out}`);
  assert.ok(!out.includes("qqqmTotalWeightPct"), `qqqmTotalWeightPct leaked: ${out}`);
  assert.ok(!out.includes("qqqmCumulativeCostUsd"));
  assert.ok(out.includes("QQQM 평가금액"));
  assert.ok(out.includes("QQQM 전체 비중"));
  assert.ok(out.includes("QQQM 누적 USD 원가"));
  assert.ok(out.includes("QQQM 누적 주식수"));
});

test("v4.4.6.1: sgovAboveMax label maps; deprecated jepqAtCap still mapped (legacy)", () => {
  const above = sanitizeAiOutput("sgovAboveMax=true");
  assert.ok(above.includes("SGOV 상한 초과"));
  const legacy = sanitizeAiOutput("jepqAtCap=false");
  assert.ok(legacy.includes("QQQI 상한 도달"), "legacy QQQI label kept with (deprecated) marker");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}
