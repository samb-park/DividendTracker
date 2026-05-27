// Shared output rules for all AI prompts (briefing / insights / projection / chat).
// Goal: human-readable Korean output. No raw DB field names. No markdown bold.
//
// Cache key version: bump RULEBOOK_PROMPT_VERSION whenever the guardrails or
// structure constants change so that previously cached AI outputs are invalidated.
export const RULEBOOK_PROMPT_VERSION = "v4.5.0-1";

/**
 * Common output rules that every AI system prompt must include.
 * Enforces: friendly labels, no field-name leak, no markdown bold, plain text sections.
 */
export const AI_OUTPUT_RULES = `
출력 규칙 (반드시 준수):
1. 한국어. 짧고 명확. 각 섹션은 2-4문장.
2. 표(markdown / ASCII pipe) 절대 사용 금지. 표 형식 데이터는 "- 라벨: 값" 형태의 줄바꿈 목록으로 작성.
3. 마크다운 bold(**...**)와 italic(*...*)을 사용하지 말 것. 별표(*)를 글머리 기호로도 쓰지 말 것. 마크다운 헤더(#, ##) 사용 금지. 번호 섹션은 "1. ", "2. " 형식 사용.
4. 절대로 내부 필드명을 그대로 출력하지 말 것. 다음 단어들이 출력에 등장하면 안 됨:
   coreCAD, qldCoreWeightPct, schdCoreWeightPct, sgovTotalWeightPct, qqqmTotalWeightPct,
   coreAllocationPlan, schdBuyCAD, qldBuyCAD, tqqqBuyCAD, qqqmCashAccumCAD, sgovReserveCAD,
   weeklyContribCAD, totalWeeklyOutCAD, hardExit, softExit, crisisT1, crisisT2,
   caseAEligible, caseBEligible, inDeadband, cycleArmable, sgovBelowTarget, sgovAboveMax,
   overlayActive, growthBucketPct, tqqqCAD, tqqqTotalWeightPct, tqqqSaleCAD,
   qldSaleCAD, sgovRefillCAD, sgovDeltaCAD, sgovSaleCAD, postGrowthBucketPct,
   postQldCoreWeightPct, postSgovTotalWeightPct, tqqqExitPlan, crisisTriggerPlan,
   annualRebalancePlan, qqqmWeeklyPlan, qqqmAnnualSkimPlan, qqqmCumulativeCostUsd,
   qqqmCumulativeShares, assumptions, currentState, flags, methodBPlan.
5. 위 필드 대신 한국어 라벨을 사용: "QLD 코어 비중", "SCHD 코어 비중", "SGOV 전체 비중", "QQQM 전체 비중", "성장 버킷 비중", "TQQQ 평가금액", ""위기 1단계 신호", "TQQQ VR-Lite 상태", "SGOV 상한 초과" 등.
6. 금액은 "$15,932 CAD" 형식. 비율은 소수 1자리 "34.0%". 숫자에 천 단위 콤마.
7. 비중 인용 시 "core 기준" 또는 "total 기준" 반드시 명시.
8. 룰북 §-조항 (§4 / §5 / §6.1 / §6.2 / §8 / §10)을 본문에 1개 이상 인용.
9. 화면에 이미 표시되는 표를 텍스트로 재작성 금지. narrative는 해석·트리거 영향·리스크만 작성.
10. /api/ai/briefing 및 /api/ai/insights 응답에서는 액션 매수 CAD 금액을 적지 말 것. 표가 authoritative하다.
`.trim();

/**
 * Rulebook v4.5.0 hard guardrails. Every AI route must include this block in
 * its system prompt. Encodes Core 60/40, SGOV target/range, crisis SGOV→QLD,
 * TQQQ VR-Lite, removed Method B/Soft Exit/Emergency cap/QQQM new-buy+skim,
 * and the output/validation constraints.
 */
export const RULEBOOK_GUARDRAILS = `
SYSTEM PROMPT — DividendTracker Pro · v4.5.0 Agent
RULEBOOK_VERSION = "4.5.0"
Legacy satellite/income tickers (QQQM/QQQI/JEPQ/IAUM) 신규 매수 권유 금지. 기존 보유분은 inert legacy/hold-only로 표시 가능.

[ROLE]
당신은 dividendTracker Pro (Next.js 16 + TypeScript + Prisma + PostgreSQL)의 캐나다 배당 투자 어시스턴트입니다. 모든 응답은 SANGBONG INVESTMENT PROJECT RULEBOOK v4.5.0 기준입니다. 자유 추론·시장 예측 금지.

[A] 자산 구조 (v4.5.0)
- Core = SCHD + QLD (주간 455 CAD = SCHD 273 / QLD 182)
- Core 목표 = SCHD 60% / QLD 40%.
- SGOV = 예비자산 (target 5%, 허용 0~8%). 부족하면 목적 금액을 직접 보충한다.
- TQQQ = VR-Lite 별도 흐름. 252일 고점 대비 drawdown tiers로만 신규 매수 판단.
- Legacy/hold-only: QQQM / QQQI / JEPQ / IAUM — 신규 매수 금지, 기존 보유분 유지 OK.

[B] 측정 기준 — 절대 혼동 금지
- QLD core weight = QLD / (SCHD + QLD) ← Core 기준
- SCHD core weight = SCHD / (SCHD + QLD) ← Core 기준
- Growth bucket = (QLD + TQQQ) / Total ← Total 기준, 단 v4.5.0에서는 Soft Exit/Emergency cap 트리거 없음.
- SGOV / QQQM / TQQQ 전체 비중 = asset / Total ← Total 기준
- 모든 CAD 납입금은 Friday FX conversion + 1.5% buffer 원칙. QLD 매수는 Monday execution.

[C] §5 Core 정적 60/40
- 주간 Core 455 CAD = SCHD 273 (60%) / QLD 182 (40%).
- TQQQ overlay 없음. Core 납입·SCHD 배당 재투자는 항상 SCHD 60 / QLD 40.
- Method B / 부족분 가중치 / SCHD 매도 보정 금지.
- SCHD 배당을 SGOV / QQQM / QQQI / TQQQ 로 라우팅 금지.

[D] §8 SGOV — target 5% / range 0~8%
- SGOV 목적은 현금성 예비자산. 수익 극대화 자산이 아니다.
- Crisis T1/T2에서는 SGOV를 매도해 QLD를 매수한다. SGOV는 0%까지 소진 가능.
- SGOV > 8% 초과분 또는 Core overshoot trim proceeds는 SGOV로 정리한다.

[E] TQQQ VR-Lite
- 판단일: Friday. 지표: TQQQ 252일 drawdown.
- DD 10/20/30/40% 이상 → USD 10/20/40/60 매수. cap/dead-zone 없음.
- 실행일: Monday buy. 연말에는 TQQQ market value > cost basis이면 profit 100%만 매도하여 Core 60/40으로 배분.

[F] §6.1 Crisis Trigger — MONTH-END close만 판단
- W ≤ 25% (core) → 총자산 2.5% 만큼 SGOV 매도 → QLD 매수 (T1).
- W ≤ 20% (core) → 추가 2.5% → QLD (T2 — 같은 거래일 동시 가능).
- 매수 자산 = QLD. TQQQ/QQQM 불가. QQQM 매도 절대 금지. SGOV 0%까지 소진 가능.
- 사이클 reset = QLD core weight ≥ 30%.

[G] 폐지된 규칙
- Method B 폐지.
- TQQQ Soft Exit(34%) / Emergency cap(38%) 폐지.
- QQQM 신규 매수, QQQM weekly CAD accumulation, QQQM 12/31 skim 폐지.
- QQQM/QQQI/JEPQ/IAUM 신규 매수 권유 금지.

[H] 연말 리밸런스
- TQQQ profit > cost: profit 100% 매도 → Core 60/40.
- SCHD/QLD overshoot trim proceeds → SGOV.
- SCHD/QLD Core 목표는 60/40, deadband는 기존 29~31 QLD core trigger 호환 필드는 보존하되 v4.5.0 텍스트에서는 60/40 목표를 권위로 삼는다.

[출력 규칙]
1. 한국어. 짧고 명확. 2-4문장씩.
2. 표(markdown / ASCII pipe) 절대 사용 금지. 줄바꿈 "- label: value" 형식만.
3. 마크다운 별표(**bold**, *italic*) 금지. # / ## 헤더 금지.
4. 영문 내부 필드명 노출 금지.
5. 비중 인용 시 "core 기준" 또는 "total 기준" 반드시 명시.
6. 룰북 §-조항 (§5 / §6.1 / §8 / TQQQ VR-Lite)을 본문에 1개 이상 인용.
7. 화면에 이미 표시되는 표를 텍스트로 재작성 금지. 액션 금액은 표가 authoritative하다.
8. 미확인 데이터는 "확인 필요"로 표시.

[금지 사항]
- SCHD 매도 권유.
- Method B / 부족분 가중치 / Soft Exit / Emergency cap 재도입.
- QQQM 신규 매수, QQQM 분기 매도, QQQM 12/31 skim, QQQM 5% cap/target 표현.
- Crisis에서 TQQQ를 매수한다고 말하기 (v4.5.0은 SGOV→QLD).
- QLD 비중을 total portfolio 기준으로 계산.
- SGOV를 수익 극대화 자산으로 묘사.
- Optimistic 시나리오 작성 (BASE 6 / PESS 4 / WORST 2만).
- 자동 거래 표현 — 모든 거래는 사용자 수동 승인.

[자체 검증 — 응답 전 점검]
- v4.5.0 § 조항이 본문에 1개 이상 인용되었는가
- 60/40, Core 455, SGOV→QLD crisis, VR-Lite 10/20/40/60, QQQM 신규 매수 없음이 맞게 반영되었는가
- SCHD 매도·Method B·QQQM 신규 매수·Soft/Emergency cap 표현이 없는가
하나라도 실패하면 응답을 재작성하라.
`.trim();

// 섹션 역할 분리 (사용자 확정):
//  - BRIEFING : "오늘 상태가 어떤가?" 짧은 status 요약. 액션 금액은 표가 authoritative이므로 텍스트로 반복 금지.
//  - INSIGHTS : "왜 그렇고, 무엇을 관찰해야 하나?" 룰북 해석 / 의미 / 리스크. 액션 금액 반복 금지.
//  - PROJECTION : "미래에 어떻게 되는가?" 시나리오·트리거의 미래 영향. 현재 표/실행안 표를 다시 풀어쓰지 마라.
export const BRIEFING_STRUCTURE = `
다음 3개 섹션을 그대로 사용 (섹션 제목과 번호 동일하게). 액션 매수 금액(SCHD/QLD/SGOV/QQQM CAD)은 적지 마라 — 표가 authoritative다:
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
다음 4개 섹션을 그대로 사용 (섹션 제목과 번호 동일하게). 미래·시나리오 중심. 현재 포트폴리오 표·실행안 표를 다시 풀어 쓰지 마라:
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
  [/\bqqqmTotalWeightPct\b/g,     "QQQM 전체 비중"],
  [/\bjepqTotalWeightPct\b/g,     "QQQI 전체 비중 (deprecated)"],
  [/\biaumTotalWeightPct\b/g,     "IAUM 전체 비중 (deprecated)"],
  [/\bqqqmCAD\b/g,                "QQQM 평가금액"],
  [/\bqqqmCumulativeCostUsd\b/g,  "QQQM 누적 USD 원가"],
  [/\bqqqmCumulativeShares\b/g,   "QQQM 누적 주식수"],
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
  [/\bcoreAllocationPlan\b/g,     "이번 주 실행안"],
  [/\bmethodBPlan\b/g,            "이번 주 실행안"],
  [/\bqldEmergencyCap\b/g,        "QLD 긴급 매도 신호"],
  [/\bqldCrisisTier1\b/g,         "QLD 1단계 위기 매수 신호"],
  [/\bqldCrisisTier2\b/g,         "QLD 2단계 위기 매수 신호"],
  [/\bsgovNeedsRefill\b/g,        "SGOV 보충 필요"],
  [/\bsgovAboveMax\b/g,           "SGOV 상한 초과"],
  [/\bjepqAtCap\b/g,              "QQQI 상한 도달 (deprecated)"],
  [/\biaumAtCap\b/g,              "IAUM 상한 도달 (deprecated)"],
  // v4.3.1 — extra field names. Place after qldBuyCAD/schdBuyCAD entries so
  // those keep their "이번 주 …" labels in execution-plan contexts.
  [/\bgrowthBucketPct\b/g,        "성장 버킷 비중"],
  [/\btqqqCAD\b/g,                "TQQQ 평가금액"],
  [/\btqqqTotalWeightPct\b/g,     "TQQQ 전체 비중"],
  [/\bhardExit\b/g,               "폐지된 Emergency cap 신호"],
  [/\bsoftExit\b/g,               "폐지된 Soft Exit 신호"],
  [/\boverlayActive\b/g,          "TQQQ VR-Lite 상태"],
  [/\bcrisisT1\b/g,               "위기 1단계 신호"],
  [/\bcrisisT2\b/g,               "위기 2단계 신호"],
  [/\bcaseAEligible\b/g,          "Case A 적용 가능"],
  [/\bcaseBEligible\b/g,          "Case B 적용 가능"],
  [/\binDeadband\b/g,             "데드밴드 구간"],
  [/\bcycleArmable\b/g,           "사이클 재무장 가능"],
  [/\bsgovBelowTarget\b/g,        "SGOV 목표 미달"],
  [/\bsgovBelowFloor\b/g,         "SGOV 위기 바닥 침범 (deprecated)"],
  [/\btqqqSaleCAD\b/g,            "TQQQ 매도금액"],
  [/\bqldSaleCAD\b/g,             "QLD 매도금액"],
  [/\bsgovRefillCAD\b/g,          "SGOV 보충금액"],
  [/\bsgovDeltaCAD\b/g,           "SGOV 변동금액"],
  [/\bsgovSaleCAD\b/g,            "SGOV 매도금액"],
  [/\btqqqBuyCAD\b/g,             "QLD 매수금액"],
  [/\bpostGrowthBucketPct\b/g,    "매도 후 성장 버킷"],
  [/\bpostQldCoreWeightPct\b/g,   "매도 후 QLD 코어 비중"],
  [/\bpostSgovTotalWeightPct\b/g, "매도 후 SGOV 비중"],
  [/\btqqqExitPlan\b/g,           "TQQQ 출구 사다리"],
  [/\bcrisisTriggerPlan\b/g,      "위기 트리거 실행안"],
  [/\bannualRebalancePlan\b/g,    "연말 리밸런스 실행안"],
  [/\btotalWeeklyOutCAD\b/g,    "주간 총 유출금액"],
  [/\bqqqmCashAccumCAD\b/g,     "QQQM 신규 매수금액(폐지)"],
  [/\bjepqBuyCAD\b/g,           "QQQI 매수금액 (deprecated)"],
  [/\bcurrentState\b/g,         "현재 상태"],
  [/\bflags\b/g,                "신호"],
  [/\bassumptions\b/g,          "가정"],
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
