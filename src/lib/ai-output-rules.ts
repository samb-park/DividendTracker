// Shared output rules for all AI prompts (briefing / insights / projection / chat).
// Goal: human-readable Korean output. No raw DB field names. No markdown bold.
//
// Cache key version: bump RULEBOOK_PROMPT_VERSION whenever the guardrails or
// structure constants change so that previously cached AI outputs are invalidated.
export const RULEBOOK_PROMPT_VERSION = "v4.1.10-3";

/**
 * Common output rules that every AI system prompt must include.
 * Enforces: friendly labels, no field-name leak, no markdown bold, plain text sections.
 */
export const AI_OUTPUT_RULES = `
출력 규칙 (반드시 준수):
1. 절대로 내부 필드명을 그대로 출력하지 말 것. 다음 단어들이 출력에 등장하면 안 됨:
   coreCAD, qldCoreWeightPct, schdCoreWeightPct, sgovTotalWeightPct, iaumTotalWeightPct,
   methodBPlan, schdBuyCAD, qldBuyCAD, unallocatedCAD, sgovReserveCAD, weeklyContribCAD,
   flags, qldEmergencyCap, qldCrisisTier1, qldCrisisTier2, sgovNeedsRefill, iaumAtCap,
   depositedThisYear, annualIncomeCAD, annualDivCAD, totalValueCAD, returnPct, currentPct,
   diffPct, contribFrequency, divGrowthPct, divYieldPct, totalContribCAD, monthlyDivCAD,
   carryover, rrspRoomEstimate, fxRate, contributions, accountSummaries, holdings,
   growthBucketPct, tqqqCAD, tqqqTotalWeightPct, hardExit, softExit, crisisT1, crisisT2,
   caseAEligible, caseBEligible, inDeadband, cycleArmable, sgovBelowTarget, sgovBelowFloor,
   tqqqSaleCAD, qldSaleCAD, sgovRefillCAD, sgovDeltaCAD, sgovSaleCAD, tqqqBuyCAD, qldBuyCAD,
   postGrowthBucketPct, postQldCoreWeightPct, postSgovTotalWeightPct,
   tqqqExitPlan, crisisTriggerPlan, annualRebalancePlan.
2. 위 필드 대신 다음 한국어 라벨을 사용:
   coreCAD → "코어 평가금액"
   qldCoreWeightPct → "QLD 코어 비중"
   schdCoreWeightPct → "SCHD 코어 비중"
   sgovTotalWeightPct → "SGOV 전체 비중"
   iaumTotalWeightPct → "IAUM 전체 비중"
   schdBuyCAD → "이번 주 SCHD 매수금액"
   qldBuyCAD → "이번 주 QLD 매수금액"
   sgovReserveCAD → "이번 주 SGOV 보충금액"
   unallocatedCAD → "미할당 금액"
   weeklyContribCAD → "주간 납입금"
   depositedThisYear → "올해 납입액"
   annualIncomeCAD → "연소득"
   annualDivCAD → "연배당"
   monthlyDivCAD → "월배당"
   growthBucketPct → "성장 버킷 비중"
   tqqqCAD → "TQQQ 평가금액"
   tqqqTotalWeightPct → "TQQQ 전체 비중"
   hardExit → "Hard Exit 신호"
   softExit → "Soft Exit 신호"
   crisisT1 → "위기 1단계 신호"
   crisisT2 → "위기 2단계 신호"
   caseAEligible → "Case A 적용 가능"
   caseBEligible → "Case B 적용 가능"
   inDeadband → "데드밴드 구간"
   cycleArmable → "사이클 재무장 가능"
   sgovBelowTarget → "SGOV 목표 미달"
   sgovBelowFloor → "SGOV 위기 바닥 침범"
   tqqqSaleCAD → "TQQQ 매도금액"
   qldSaleCAD → "QLD 매도금액"
   sgovRefillCAD → "SGOV 보충금액"
   sgovDeltaCAD → "SGOV 변동금액"
   sgovSaleCAD → "SGOV 매도금액"
   tqqqBuyCAD → "TQQQ 매수금액"
   postGrowthBucketPct → "매도 후 성장 버킷"
   postQldCoreWeightPct → "매도 후 QLD 코어 비중"
   postSgovTotalWeightPct → "매도 후 SGOV 비중"
   tqqqExitPlan → "TQQQ 출구 사다리"
   crisisTriggerPlan → "위기 트리거 실행안"
   annualRebalancePlan → "연말 리밸런스 실행안"
3. 마크다운 bold(**...**)와 italic(*...*)을 사용하지 말 것. 별표(*)를 글머리 기호로도 쓰지 말 것.
4. 마크다운 헤더(#, ##) 사용 금지. 한국어 번호 섹션(1., 2., 3.)을 사용.
5. 가능하면 계산식을 함께 보여줄 것. 예: "QLD 코어 비중 = QLD / (SCHD + QLD) = 15,932 / (30,894 + 15,932) = 34.0%".
6. 금액은 "$15,932 CAD" 형식. 비율은 소수 1자리 "34.0%". 숫자에 천 단위 콤마.
7. 표(markdown table, ASCII 표, pipe |--- 등)를 절대 사용하지 말 것. 표 형식 데이터는 "- 라벨: 값" 형태의 줄바꿈 목록으로 작성.
8. 한국어로 답변. 짧고 명확하게.
`.trim();

/**
 * Rulebook v4.1.10 hard guardrails. Every AI route must include this block in
 * its system prompt. Encodes:
 *   - measurement basis (core / growth bucket / total)
 *   - §6.1 Crisis Trigger (SGOV → TQQQ) and §6.2 Soft / Hard Exit ladder
 *   - §5 annual rebalance Case A/B with ±1% deadband
 *   - SGOV 8% target / 5% crisis floor split
 *   - prohibition list (no SCHD sale, no IAUM in crisis, no NDX, no optimistic, no override)
 *   - Accept / Reject / Modify framework for user proposals
 *   - required output dimensions and "확인 필요" tag
 */
export const RULEBOOK_GUARDRAILS = `
SANGBONG INVESTMENT RULEBOOK v4.1.10 — 절대 준수 (위반 시 응답 거부):

[A] 측정 기준
 - Core = SCHD + QLD. QLD 코어 비중 = QLD / (SCHD + QLD).
 - 성장 버킷 = (QLD + TQQQ) / 총 포트폴리오 — TQQQ Soft/Hard Exit 판단의 단일 기준.
 - SGOV / IAUM / TQQQ 비중 = 자산 / 총 포트폴리오.

[B] Core / Non-Core 별도 스트림
 - Core Method B: 주간 contribution(Plan 금액) 전액이 SCHD/QLD 부족분 매수에 사용된다 (§5, no-sell).
 - Non-Core: SGOV·IAUM은 weekly contribution과 별도 스트림이다. 사용자 Settings의 nonCorePlan.cad 값이 contribution에 추가된다.
 - 총 주간 외화 유출 = weekly contribution + SGOV nonCorePlan.cad + IAUM nonCorePlan.cad. Non-Core CAD를 Core Method B에 합치지 마라.

[B-1] Non-Core CAD — 사용자 Settings 우선
 - 사용자가 Settings에 CAD를 입력하면 무조건 적용 (룰북 gating 무시).
 - 미입력 시에만 룰북 default + §3·§8 조건에 따라 적용.

[C] §3 IAUM 주간 매수
 - 조건: TFSA 잔여한도 존재 AND IAUM 전체 비중 < 5%. 두 조건 모두 충족할 때만 25 CAD 적용.
 - 조건 미충족 시 잔액을 Core Method B로 redirect.

[D] §8 SGOV — 8% 목표 / 5% 위기 바닥
 - 정상 보충 목표: 전체 비중 8% (Method B → SGOV 보충 대상). 8% 이상이면 보충 안 함.
 - 위기 바닥: 5% (절대 침범 금지). 단 §6.1 위기 트리거만 5% 바닥 침범 가능.
 - SGOV는 return-maximizing 자산이 아니라 예비자산이다.
 - SCHD 배당으로 SGOV 보충 금지 (v4.1.10에서 명시 제거).

[E1] §6.1 위기 트리거 (TQQQ 오버레이 매수)
 - 코어 비중 W ≤ 25% → 총자산 2.5%를 SGOV 매도 → TQQQ 매수 (T1).
 - 코어 비중 W ≤ 20% → 추가 2.5% SGOV → TQQQ (T2 — T1과 같은 거래일 동시 실행 가능).
 - 매수 자산은 반드시 TQQQ (QLD 아님).
 - 사이클 데드존: TQQQ=0 AND 성장 버킷 ≥ 30% 두 조건 만족 전까지 재발동 금지.

[E2] §6.2 TQQQ 출구 사다리
 - 성장 버킷 ≥ 34% → 다음 거래일 TQQQ의 절반 매도 (Soft). proceeds: SGOV 8% → SCHD.
 - 성장 버킷 ≥ 38% → 다음 거래일 TQQQ 전량 + QLD를 30%까지 매도 (Hard). proceeds: SGOV 8% → SCHD.
 - SCHD는 어떤 단계에서도 매도 금지.

[F] §5 Method B (no-sell core)
 - SCHD/QLD는 절대 매도 금지. 부족분만 매수. SCHD 매도 제안 시 무조건 Reject.

[F1] §5 연말 리밸런스 (Dec 31 양방향, ±1% 데드밴드)
 - W > 31%: QLD를 30%까지 매도 → SGOV 8% → SCHD (Case A).
 - W < 29% AND TQQQ = 0: SGOV를 5% 바닥까지만 매도 → QLD 매수 (Case B).
 - 29 ≤ W ≤ 31: 무행동.
 - TQQQ > 0이면 Case B 발동 금지 (Case A는 무관).

[G] 금지 사항
 - SCHD 매도 절대 금지 (모든 메커니즘).
 - IAUM을 QLD/TQQQ 매수에 사용 금지.
 - SCHD 배당으로 SGOV 보충 금지.
 - NDX 기반 trigger 재도입 금지.
 - IAUM을 5% fixed target 취급 금지.
 - SGOV를 수익 극대화 자산 취급 금지.
 - Optimistic 시나리오 생성 금지 (BASE 6% / PESS 4% / WORST 2%).
 - 시장 전망·뉴스·심리·예측을 이유로 룰북을 override 금지.
 - 계좌 배치(RRSP/TFSA) 강제 제안 금지 — 사용자 자율.

[H] 사용자 제안 평가 — Accept / Reject / Modify
 - Accept: 룰북 일치 → 그대로 수용.
 - Modify: 의도는 일치하나 수치/순서가 어긋남 → 룰북 기준 수정안 제시.
 - Reject: 룰북 충돌 → 거부 사유와 §-조항 명시.

[I] 출력 형식 — 모든 수치/제안은 다음을 명시
 1) Core weight, 2) 성장 버킷, 3) Total weight (필요 시), 4) Contribution source,
 5) Trigger 적용 여부 (Hard/Soft/Crisis/Case A/B), 6) 룰북 §-조항.

[J] 확인 필요 표시
 - 시장 가격/환율/세금/계좌 room 미확인 시 "(확인 필요)" 명시. 추측 금지.

[K] 섹션 역할 분리
 - 화면에 이미 "현재 포트폴리오 표" + "이번 주 실행안 표" + "Rulebook Status 표"가 authoritative하게 표시된다.
 - PROJECTION narrative = 미래·시나리오·트리거 영향. 표를 다시 풀어 쓰지 마라.

[L] 수치 인용 절대 금지
 - 화면 표에 이미 모든 CAD 금액과 percent 수치가 표시된다.
 - narrative 텍스트에 절대로 CAD 금액(예: $123,456 CAD), percent (예: 30.4%), 시나리오 절대값을 다시 적지 마라.
 - 표 데이터를 한국어 문장으로 풀어 쓰지 마라.
 - 시뮬 결과의 절대값이 아닌 의미·트리거 미래 영향·리스크·관찰 신호만 작성.
 - 위반 시 응답을 다시 생성하라.
`.trim();

// 섹션 역할 분리 (사용자 확정):
//  - BRIEFING : "오늘 상태가 어떤가?" 짧은 status 요약. 액션 금액은 표가 authoritative이므로 텍스트로 반복 금지.
//  - INSIGHTS : "왜 그렇고, 무엇을 관찰해야 하나?" 룰북 해석 / 의미 / 리스크. 액션 금액 반복 금지.
//  - PROJECTION : "미래에 어떻게 되는가?" 시나리오·트리거의 미래 영향. 현재 표/Method B 표를 다시 풀어쓰지 마라.
export const BRIEFING_STRUCTURE = `
다음 3개 섹션을 그대로 사용 (섹션 제목과 번호 동일하게). 액션 매수 금액(SCHD/QLD/SGOV/IAUM CAD)은 적지 마라 — 표가 authoritative다:
1. 현재 포트폴리오 상태
2. 룰북 기준 판단
3. 주의할 점
`.trim();

export const INSIGHT_STRUCTURE = `
다음 4개 섹션을 그대로 사용 (섹션 제목과 번호 동일하게). 분석·해석 중심. 액션 매수 금액은 적지 마라:
1. 핵심 인사이트
2. 왜 그런 판단인지 (룰북 기준 해석)
3. 다음에 관찰할 신호
4. 확인 필요 항목
`.trim();

export const PROJECTION_STRUCTURE = `
다음 4개 섹션을 그대로 사용 (섹션 제목과 번호 동일하게). 미래·시나리오 중심. 현재 포트폴리오 표·Method B 표를 다시 풀어 쓰지 마라:
1. 시나리오별 예상 결과
2. 룰북 기준 Projection 판단
3. Rebalancing / Trigger 미래 영향
4. 확인 필요 항목
`.trim();

/**
 * Server-side sanitizer applied to LLM output as a defense-in-depth layer.
 * Strips markdown emphasis and replaces any leaked DB field names with friendly labels.
 */
const FIELD_LABEL_MAP: Array<[RegExp, string]> = [
  [/\bcoreCAD\b/g,                "코어 평가금액"],
  [/\bqldCoreWeightPct\b/g,       "QLD 코어 비중"],
  [/\bschdCoreWeightPct\b/g,      "SCHD 코어 비중"],
  [/\bsgovTotalWeightPct\b/g,     "SGOV 전체 비중"],
  [/\biaumTotalWeightPct\b/g,     "IAUM 전체 비중"],
  [/\bschdBuyCAD\b/g,             "이번 주 SCHD 매수금액"],
  [/\bqldBuyCAD\b/g,              "이번 주 QLD 매수금액"],
  [/\bsgovReserveCAD\b/g,         "이번 주 SGOV 보충금액"],
  [/\bunallocatedCAD\b/g,         "미할당 금액"],
  [/\bweeklyContribCAD\b/g,       "주간 납입금"],
  [/\bdepositedThisYear\b/g,      "올해 납입액"],
  [/\bannualIncomeCAD\b/g,        "연소득"],
  [/\bannualDivCAD\b/g,           "연배당"],
  [/\bmonthlyDivCAD\b/g,          "월배당"],
  [/\btotalValueCAD\b/g,          "총 평가금액"],
  [/\bcurrentPct\b/g,             "현재 비중"],
  [/\bdiffPct\b/g,                "차이"],
  [/\btargetPct\b/g,              "목표 비중"],
  [/\bdivGrowthPct\b/g,           "배당 성장률"],
  [/\bdivYieldPct\b/g,            "배당 수익률"],
  [/\bportfolioCagrPct\b/g,       "예상 연수익률"],
  [/\bcontribFrequency\b/g,       "납입 주기"],
  [/\brrspRoomEstimate\b/g,       "RRSP 추정 한도"],
  [/\btfsaCarryover\b/g,          "TFSA 이월 한도"],
  [/\bmethodBPlan\b/g,            "이번 주 실행안"],
  [/\bqldEmergencyCap\b/g,        "QLD 긴급 매도 신호"],
  [/\bqldCrisisTier1\b/g,         "QLD 1단계 위기 매수 신호"],
  [/\bqldCrisisTier2\b/g,         "QLD 2단계 위기 매수 신호"],
  [/\bsgovNeedsRefill\b/g,        "SGOV 보충 필요"],
  [/\biaumAtCap\b/g,              "IAUM 상한 도달"],
  // v4.1.10 — new field names (Task 9). Order matters: place after the existing
  // qldBuyCAD/schdBuyCAD entries so those keep their "이번 주 …" labels in
  // Method-B contexts. The shared names below only kick in when the LLM leaks
  // raw plan-object keys that have no v4.1.8 equivalent.
  [/\bgrowthBucketPct\b/g,        "성장 버킷 비중"],
  [/\btqqqCAD\b/g,                "TQQQ 평가금액"],
  [/\btqqqTotalWeightPct\b/g,     "TQQQ 전체 비중"],
  [/\bhardExit\b/g,               "Hard Exit 신호"],
  [/\bsoftExit\b/g,               "Soft Exit 신호"],
  [/\bcrisisT1\b/g,               "위기 1단계 신호"],
  [/\bcrisisT2\b/g,               "위기 2단계 신호"],
  [/\bcaseAEligible\b/g,          "Case A 적용 가능"],
  [/\bcaseBEligible\b/g,          "Case B 적용 가능"],
  [/\binDeadband\b/g,             "데드밴드 구간"],
  [/\bcycleArmable\b/g,           "사이클 재무장 가능"],
  [/\bsgovBelowTarget\b/g,        "SGOV 목표 미달"],
  [/\bsgovBelowFloor\b/g,         "SGOV 위기 바닥 침범"],
  [/\btqqqSaleCAD\b/g,            "TQQQ 매도금액"],
  [/\bqldSaleCAD\b/g,             "QLD 매도금액"],
  [/\bsgovRefillCAD\b/g,          "SGOV 보충금액"],
  [/\bsgovDeltaCAD\b/g,           "SGOV 변동금액"],
  [/\bsgovSaleCAD\b/g,            "SGOV 매도금액"],
  [/\btqqqBuyCAD\b/g,             "TQQQ 매수금액"],
  [/\bpostGrowthBucketPct\b/g,    "매도 후 성장 버킷"],
  [/\bpostQldCoreWeightPct\b/g,   "매도 후 QLD 코어 비중"],
  [/\bpostSgovTotalWeightPct\b/g, "매도 후 SGOV 비중"],
  [/\btqqqExitPlan\b/g,           "TQQQ 출구 사다리"],
  [/\bcrisisTriggerPlan\b/g,      "위기 트리거 실행안"],
  [/\bannualRebalancePlan\b/g,    "연말 리밸런스 실행안"],
];

/**
 * Detects markdown tables and converts them to plain "라벨: 값" lines so the
 * UI never shows raw pipe-table characters when the LLM ignores instructions.
 *
 * Heuristic: a markdown table block is 2+ consecutive lines starting with `|`
 * where the second line is a separator (`|---|---|` etc.).
 */
function flattenMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";
    const isTableHeader = /^\s*\|.*\|\s*$/.test(line);
    const isSeparator = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next);

    if (isTableHeader && isSeparator) {
      const splitRow = (row: string) =>
        row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(c => c.trim());
      const headers = splitRow(line);
      i += 2; // skip header + separator
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = splitRow(lines[i]);
        // Render as "header1: cell1 / header2: cell2 / ..."
        const parts: string[] = [];
        for (let c = 0; c < headers.length; c++) {
          const h = headers[c];
          const v = cells[c] ?? "";
          if (h && v) parts.push(`${h}: ${v}`);
          else if (v) parts.push(v);
        }
        if (parts.length > 0) out.push("- " + parts.join(" / "));
        i++;
      }
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

export function sanitizeAiOutput(text: string): string {
  if (!text) return text;
  let out = text;
  // Replace any markdown table block with plain "- header: cell / ..." lines.
  out = flattenMarkdownTables(out);
  // Strip markdown emphasis (**bold**, *italic*, __bold__).
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  out = out.replace(/__([^_\n]+)__/g, "$1");
  // Strip bare leading asterisk bullets, normalize to "- ".
  out = out.replace(/^[ \t]*\*[ \t]+/gm, "- ");
  // Strip residual single-char emphasis where adjacent to letters but not numerals.
  out = out.replace(/(?<![*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])/g, "$1");
  // Strip markdown headers (# / ##) to plain text.
  out = out.replace(/^#{1,6}[ \t]+/gm, "");
  // Replace leaked field names with Korean labels.
  for (const [pattern, label] of FIELD_LABEL_MAP) {
    out = out.replace(pattern, label);
  }
  return out.trim();
}
