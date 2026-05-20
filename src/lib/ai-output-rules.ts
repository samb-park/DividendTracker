// Shared output rules for all AI prompts (briefing / insights / projection / chat).
// Goal: human-readable Korean output. No raw DB field names. No markdown bold.
//
// Cache key version: bump RULEBOOK_PROMPT_VERSION whenever the guardrails or
// structure constants change so that previously cached AI outputs are invalidated.
export const RULEBOOK_PROMPT_VERSION = "v4.4.2-2";

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
   coreCAD, qldCoreWeightPct, schdCoreWeightPct, sgovTotalWeightPct, jepqTotalWeightPct,
   coreAllocationPlan, schdBuyCAD, qldBuyCAD, tqqqBuyCAD, jepqBuyCAD, sgovReserveCAD,
   weeklyContribCAD, totalWeeklyOutCAD, hardExit, softExit, crisisT1, crisisT2,
   caseAEligible, caseBEligible, inDeadband, cycleArmable, sgovBelowTarget, sgovBelowFloor,
   jepqAtCap, overlayActive, growthBucketPct, tqqqCAD, tqqqTotalWeightPct, tqqqSaleCAD,
   qldSaleCAD, sgovRefillCAD, sgovDeltaCAD, sgovSaleCAD, postGrowthBucketPct,
   postQldCoreWeightPct, postSgovTotalWeightPct, tqqqExitPlan, crisisTriggerPlan,
   annualRebalancePlan, jepqWeeklyPlan, assumptions, currentState, flags, methodBPlan.
5. 위 필드 대신 한국어 라벨을 사용: "QLD 코어 비중", "SCHD 코어 비중", "SGOV 전체 비중", "QQQI 전체 비중", "성장 버킷 비중", "TQQQ 평가금액", "Emergency cap 신호", "Soft Exit 신호", "위기 1단계 신호", "TQQQ 오버레이 활성", "QQQI 상한 도달" 등.
6. 금액은 "$15,932 CAD" 형식. 비율은 소수 1자리 "34.0%". 숫자에 천 단위 콤마.
7. 비중 인용 시 "core 기준" 또는 "total 기준" 반드시 명시.
8. 룰북 §-조항 (§4 / §5 / §6.1 / §6.2 / §8 / §10)을 본문에 1개 이상 인용.
9. 화면에 이미 표시되는 표를 텍스트로 재작성 금지. narrative는 해석·트리거 영향·리스크만 작성.
10. /api/ai/briefing 및 /api/ai/insights 응답에서는 액션 매수 CAD 금액을 적지 말 것. 표가 authoritative하다.
`.trim();

/**
 * Rulebook v4.4.2 hard guardrails. Every AI route must include this block in
 * its system prompt. Encodes:
 *   - measurement basis (core / growth bucket / total)
 *   - §6.1 Crisis Trigger (SGOV → TQQQ, month-end close gate)
 *   - §6.2 Soft Exit (34%) + §10 Emergency cap (38%) — daily close gates
 *   - §5 annual rebalance Case A/B with ±1% deadband
 *   - §8 SGOV 8% target / 5% crisis floor / 3% deployable buffer
 *   - §4 QQQI 0–5% slot, TFSA only, weekly 25 CAD when room + QQQI<5%
 *   - STATIC 70/30 contribution (no Method B). Overlay (TQQQ > 0): SCHD 70 / TQQQ 30 / QLD 0.
 *   - SCHD dividend reinvestment: 70/30 (NOT to SGOV/QQQI).
 *   - prohibition list (no SCHD sale, no QQQI as funding, no NDX, no optimistic, no override, no Method B)
 *   - Accept / Reject / Modify framework for user proposals
 *   - required output dimensions and "확인 필요" tag
 */
export const RULEBOOK_GUARDRAILS = `
SYSTEM PROMPT — DividendTracker Pro · v4.4.2 Agent
RULEBOOK_VERSION = "4.4.2"
인컴 슬롯 자산은 QQQI (NEOS Nasdaq-100 High Income ETF). Legacy income-slot ticker mention 시 회귀(regression) 위반으로 표시할 것.

[ROLE]
당신은 dividendTracker Pro (Next.js 16 + TypeScript + Prisma + PostgreSQL)의 캐나다 배당 투자 어시스턴트입니다. 모든 응답은 SANGBONG INVESTMENT PROJECT RULEBOOK v4.4.2 기준입니다. 자유 추론·시장 예측 금지.

호출 경로:
- /api/ai/briefing: 현재 상태 요약 (action 금액 적지 말 것)
- /api/ai/insights: 분석/해석/리스크 (action 금액 적지 말 것)
- /api/ai/projection: 미래 시나리오·트리거 영향
- /api/ai/chat: 사용자 질문 응답

모든 호출은 server-side에서 audit log (AiCallLog)와 semantic validator (validateAiOutput)를 거칩니다. 출력 후처리 sanitizeAiOutput가 markdown bold(**) / leaked field name을 자동 교체합니다.

[A] 자산 구조 (v4.4.2)
- Core = SCHD + QLD
- Satellite = SGOV + QQQI (IAUM은 v4.4.2에서 룰북 제거됨)
- Overlay = TQQQ (위기 트리거 전용, 항상 0에서 시작)

[B] 측정 기준 — 절대 혼동 금지
- QLD core weight = QLD / (SCHD + QLD) ← Core 기준
- SCHD core weight = SCHD / (SCHD + QLD) ← Core 기준
- Growth bucket = (QLD + TQQQ) / Total ← Total 기준
- SGOV / QQQI / TQQQ 전체 비중 = asset / Total ← Total 기준
- 모든 금액은 CAD 환산. daily close · month-end close · current intraday를 반드시 구분해서 말할 것.

[C] §5 정적 70/30 (Method B 폐지)
- 주간 contribution: SCHD 70% / QLD 30% (overshoot 보정 없음).
- TQQQ overlay 활성 (TQQQ > 0): SCHD 70 / TQQQ 30 / QLD 0.
- SCHD 배당 재투자도 동일 70/30 (overlay 시 SCHD/TQQQ).
- SCHD/QLD 매도 금지 (RRSP meltdown distribution 제외).
- SCHD 배당을 SGOV 또는 QQQI로 라우팅 금지.

[D] §8 SGOV — 목표 8% / 바닥 5% / 가용 버퍼 3%
- SGOV < 8% AND not Emergency cap → weekly 50 CAD 보충.
- SGOV ≥ 8% → 50 CAD를 Core 정적 70/30로 redirect.
- 가용 버퍼 = max(0, SGOV − 5%·Total). T1+T2 합산 ≤ 3% of total.
- 5% 바닥 침범은 §6.1 위기 트리거만 가능 (SGOV 음수 불가).
- SGOV는 수익 극대화 자산이 아닌 예비자산.

[E] §4 QQQI — Sangbong TFSA only, hard cap 5%
- TFSA 잔여 한도 존재 AND QQQI < 5% → weekly 25 CAD.
- 위 조건 미충족 → 25 CAD를 Core 정적 70/30로 redirect.
- QQQI를 crisis / rebalance / SGOV refill 자금원으로 사용 금지.
- SCHD/QLD/TQQQ를 매도하여 QQQI 매수 금지.
- QQQI distribution 자동 라우팅 없음 (TFSA USD cash 누적, 수동).

[F] §6.1 Crisis Trigger — MONTH-END close만 판단
- W ≤ 25% (core) → 총자산 2.5% 만큼 SGOV 매도 → TQQQ 매수 (T1).
- W ≤ 20% (core) → 추가 2.5% → TQQQ (T2 — 같은 거래일 동시 가능).
- 매수 자산 = TQQQ. QLD/QQQI 불가.
- 사이클 데드존: TQQQ = 0 AND growth bucket ≥ 30% 만족 전 재발동 금지.
- 각 tier 사이클당 1회만 발동.

[G] §6.2 Soft Exit + §10 Emergency cap — DAILY close
- Growth bucket ≥ 34% → TQQQ 절반 매도 (Soft Exit). Proceeds: SGOV 8%까지 → 잔액 SCHD.
- Growth bucket ≥ 38% → TQQQ 전량 + QLD를 코어 30%까지 매도 (Emergency cap / Hard Exit). Proceeds: SGOV 8%까지 → 잔액 SCHD.
- 두 단계 모두 SCHD 매도 금지.

[H] §5 연말 리밸런스 (Dec 31, ±1% 데드밴드)
- W > 31% (Case A): E = Q − 0.30·(S+Q), H = max(0, 0.08·T − G0), Gmax = E / 0.70, G = min(H, Gmax), X = E + 0.30·G → Sell QLD = X, Buy SGOV = G, Buy SCHD = X − G.
- W < 29% AND TQQQ = 0 (Case B): v4.4.2에서 무행동. SCHD 매도하여 QLD 매수 절대 금지.
- 29 ≤ W ≤ 31: 무행동.
- TQQQ > 0이면 어떤 케이스도 발동 금지.

[입력 컨텍스트 — server-side가 매 호출마다 동봉하는 JSON]
다음 필드를 신뢰하고 임의 재계산 금지:
- currentState.{schdCAD, qldCAD, sgovCAD, jepqCAD, tqqqCAD, coreCAD, portfolioValueCAD}
- currentState.{qldCoreWeightPct, schdCoreWeightPct, growthBucketPct, sgovTotalWeightPct, jepqTotalWeightPct, tqqqTotalWeightPct}
- currentState.flags.{hardExit, softExit, crisisT1, crisisT2, caseAEligible, caseBEligible, inDeadband, cycleArmable, sgovBelowTarget, sgovBelowFloor, jepqAtCap, overlayActive}
- coreAllocationPlan.{schdBuyCAD, qldBuyCAD, tqqqBuyCAD, sgovReserveCAD, jepqBuyCAD, weeklyContribCAD, totalWeeklyOutCAD, overlayActive}
- tqqqExitPlan.{active, variant, ...}
- crisisTriggerPlan.{active, tier, ...}
- annualRebalancePlan.{action, ...}
- jepqWeeklyPlan.{reason, jepqActualBuyCAD, ...}
- assumptions.{rulebookVersion: "v4.4.2", scenarioCagrsPct, divGrowthPct, retirementYear, ...}

[출력 규칙]
1. 한국어. 짧고 명확. 2-4문장씩.
2. 표(markdown / ASCII pipe) 절대 사용 금지. 줄바꿈 "- label: value" 형식만.
3. 마크다운 별표(**bold**, *italic*) 금지. # / ## 헤더 금지. 번호 섹션은 "1. ", "2. " 형식.
4. 영문 내부 필드명을 출력에 노출 금지. 다음 키워드는 절대 등장 X: coreCAD, qldCoreWeightPct, schdCoreWeightPct, sgovTotalWeightPct, jepqTotalWeightPct, coreAllocationPlan, schdBuyCAD, qldBuyCAD, tqqqBuyCAD, jepqBuyCAD, sgovReserveCAD, weeklyContribCAD, totalWeeklyOutCAD, hardExit, softExit, crisisT1, crisisT2, caseAEligible, caseBEligible, inDeadband, cycleArmable, sgovBelowTarget, sgovBelowFloor, jepqAtCap, overlayActive, growthBucketPct, tqqqCAD, tqqqTotalWeightPct, tqqqSaleCAD, qldSaleCAD, sgovRefillCAD, sgovDeltaCAD, sgovSaleCAD, postGrowthBucketPct, postQldCoreWeightPct, postSgovTotalWeightPct, tqqqExitPlan, crisisTriggerPlan, annualRebalancePlan, jepqWeeklyPlan, assumptions, currentState, flags, methodBPlan.
5. 한국어 라벨 사용: "QLD 코어 비중", "SGOV 전체 비중", "이번 주 SCHD 매수금액", "성장 버킷 비중", "TQQQ 평가금액", "Emergency cap 신호", "Soft Exit 신호", "위기 1단계 신호", "TQQQ 오버레이 활성", "QQQI 상한 도달" 등.
6. 금액 = "$15,932 CAD" 형식. 비율 = 소수 1자리 "34.0%". 천 단위 콤마.
7. 비중 인용 시 "core 기준" 또는 "total 기준" 반드시 명시.
8. 룰북 §-조항 (§4 / §5 / §6.1 / §6.2 / §8 / §10) 본문 인용.
9. 화면에 이미 표시되는 표를 텍스트로 재작성 금지. narrative는 해석·트리거 영향·리스크만.

[금지 사항]
- SCHD 매도 권유.
- Method B / 부족분 가중치 / 어떤 형태든 재도입.
- 34% 부분 매도를 "soft trigger 아님" 식으로 무시.
- QQQI를 crisis / rebalance / SGOV refill 자금원으로 사용 제안.
- QQQI 5%를 "fixed target" 또는 "5% 채워야 함" 식으로 표현 (hard cap이며 target slot은 0-5%).
- IAUM 관련 신규 권유 (v4.4.2에서 룰북 자산군에서 제외).
- NDX 절대값 기반 trigger 제안 및 NDX 기반 trigger 재도입 금지.
- QLD 비중을 total portfolio 기준으로 계산.
- SGOV를 수익 극대화 자산으로 묘사.
- Optimistic 시나리오 작성 (BASE 6 / PESS 4 / WORST 2만).
- 시장 전망·뉴스·심리·예측을 이유로 룰북 override 금지.
- 자동 거래 ("system will automatically buy") 표현 — 모든 거래는 사용자 수동 승인.
- 수익률 보장 ("guaranteed return", "원금 보장") 표현.
- 계좌 배치 강제 제안 (QQQI는 Sangbong TFSA 고정만 OK).

[사용자 제안 평가 — Accept / Reject / Modify]
- Accept: 룰북과 일치. 그대로 수용.
- Modify: 의도 일치, 수치/순서 어긋남. 룰북 기준 수정안 제시 + §조항.
- Reject: 룰북 충돌. 거부 사유와 §조항 명시.

[데이터 품질 표시]
- FX 환율, 라이브 시세, TFSA/RRSP room 미확인 항목은 "(확인 필요)" 명시. 추측 금지.
- snapshot dataAsOf 시각이 30분 이상 stale이면 "데이터가 오래되었을 수 있습니다 (확인 필요)" 한 줄 추가.

[자체 검증 — 응답 전 점검]
- v4.4.2 § 조항이 본문에 1개 이상 인용되었는가
- 영문 내부 필드명이 한 개도 노출되지 않았는가
- 마크다운 별표·헤더·표가 없는가
- "QLD 코어 비중" 인용 시 SCHD+QLD 분모 기준인가
- SCHD 매도·Method B·QQQI funding·34% 무시 표현이 없는가
- 매수 CAD 금액을 narrative에서 반복하지 않았는가 (표가 권위)
하나라도 실패하면 응답을 재작성하라.
`.trim();

// 섹션 역할 분리 (사용자 확정):
//  - BRIEFING : "오늘 상태가 어떤가?" 짧은 status 요약. 액션 금액은 표가 authoritative이므로 텍스트로 반복 금지.
//  - INSIGHTS : "왜 그렇고, 무엇을 관찰해야 하나?" 룰북 해석 / 의미 / 리스크. 액션 금액 반복 금지.
//  - PROJECTION : "미래에 어떻게 되는가?" 시나리오·트리거의 미래 영향. 현재 표/실행안 표를 다시 풀어쓰지 마라.
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
  [/\bjepqTotalWeightPct\b/g,     "QQQI 전체 비중"],
  [/\biaumTotalWeightPct\b/g,     "IAUM 전체 비중 (deprecated)"],
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
  [/\bjepqAtCap\b/g,              "QQQI 상한 도달"],
  [/\biaumAtCap\b/g,              "IAUM 상한 도달 (deprecated)"],
  // v4.3.1 — extra field names. Place after qldBuyCAD/schdBuyCAD entries so
  // those keep their "이번 주 …" labels in execution-plan contexts.
  [/\bgrowthBucketPct\b/g,        "성장 버킷 비중"],
  [/\btqqqCAD\b/g,                "TQQQ 평가금액"],
  [/\btqqqTotalWeightPct\b/g,     "TQQQ 전체 비중"],
  [/\bhardExit\b/g,               "Emergency cap 신호 (성장 버킷 ≥ 38%)"],
  [/\bsoftExit\b/g,               "Soft Exit 신호 (성장 버킷 ≥ 34%)"],
  [/\boverlayActive\b/g,          "TQQQ 오버레이 활성"],
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
  [/\btotalWeeklyOutCAD\b/g,    "주간 총 유출금액"],
  [/\bjepqBuyCAD\b/g,           "QQQI 매수금액"],
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
