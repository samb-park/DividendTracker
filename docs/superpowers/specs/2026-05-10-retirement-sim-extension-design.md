# Retirement Simulation Extension — Design (v4.1.10 Phase 2)

**Date:** 2026-05-10
**Goal:** Python 외부 시뮬과 같은 은퇴 후 cashflow를 DividendTracker projection에 재현. 룰북 [10]/[11]/[16] 의미적 통합.

## Motivation

현재 `projectScenariosRulebook`은 적립 단계만 시뮬. 사용자가 외부 Python으로 돌린 은퇴 후 인출 시나리오(60-71 RRSP 멜트다운 + 65세 IAUM 청산 + 배당 소비 + 펜션 합산)를 앱이 재현하지 못해 두 결과가 직접 비교 불가. AI narrative는 추가로 `$890K 연배당` 같은 hallucination 출력.

## Scope

룰북 위반 없이 룰북 [10]/[11]/[16]을 시뮬에 반영. 룰북 [11]은 "참고용, 강제 아님" 이지만 시뮬 default로 사용.

In-scope:
- 60~71세 RRSP 멜트다운 인출 (SCHD 우선 차감)
- 65세부터 배당 소비 모드 (재투자 중단)
- 65세부터 펜션 cashflow 합산 (portfolio 영향 X)
- Projection 표 컬럼 확장 (인출, 월 가용)
- AI narrative guard 강화 (수치 인용 금지)

Out-of-scope:
- 인플레이션 조정 (실질가치 보기)
- 세금 계산 (T1032 pension splitting 등)
- 72세+ RRIF 의무 인출
- CPP/OAS 70세 연기 시나리오
- Settings UI 입력 필드 (룰북 [11] 그대로 하드코딩)

## Design

### 룰북 상수 (rulebook.ts)

```typescript
// Retirement phase parameters (rulebook [10] / [11] / [16])
RRSP_MELTDOWN_START_AGE: 60
RRSP_MELTDOWN_END_AGE:   71
RRSP_MELTDOWN_ANNUAL_CAD: 40000        // [11] 30-50K 중간값
DIVIDEND_CONSUMPTION_AGE: 65           // [10] IAUM exit과 동일
PENSION_START_AGE:        65           // [16] HOOPP 시작
PENSION_MONTHLY_CAD:      7781         // [16] 가구 합산 추정값
```

### 시뮬 흐름 (per-year loop)

기존 priority order [14] 유지. 추가 단계 삽입 위치는 IAUM 65 exit 직후 (대략 step 6과 7 사이).

순서:
1. Contribution + Method B (기존)
2. DCA growth (기존)
3. Hard / Soft / Crisis / Annual Rebal (기존)
4. **NEW (a) RRSP 멜트다운**: `RRSP_MELTDOWN_START_AGE ≤ age ≤ RRSP_MELTDOWN_END_AGE` → SCHD에서 40K 차감. SCHD가 부족하면 QLD에서 잔여 차감 (방어).
5. 65 IAUM exit (기존)
6. **NEW (b) 배당 소비**: `age ≥ DIVIDEND_CONSUMPTION_AGE` → 배당 yield 계산 결과를 `dividendConsumedCAD`로 분리, portfolio에 더하지 않음. (60~64는 기존처럼 재투자 = portfolio 성장 일부.)
7. **NEW (c) 펜션 합산**: `age ≥ PENSION_START_AGE` → `pensionCAD = PENSION_MONTHLY_CAD × 12 = 93372`. Portfolio 평가에는 영향 없음, cashflow tracking만.
8. Dividend snapshot (기존)
9. Cycle reset (기존)

### Type 확장 (ProjectionYearPointV2)

```typescript
withdrawalCAD: number          // RRSP 멜트다운, 60-71만 > 0
dividendConsumedCAD: number    // 65+ 배당 소비분 (gross, 세전)
pensionCAD: number             // 65+ 펜션 연간 합산
monthlyCashflowCAD: number     // (withdrawal + dividendConsumed + pension) / 12
```

`ProjectionScenarioV2.triggerCounts`에 추가:
```typescript
withdrawalYears: number        // 60-71 사이 인출 발생 횟수
```

### SCHD 매도 invariant 예외 처리

룰북 §15 "SCHD 매도 절대 금지"는 매매 메커니즘(Method B / Exit / Rebal / Crisis) 한정. **RRSP 멜트다운은 룰북 [11]에서 명시한 인출**이므로 SCHD 우선 차감 OK. 다만 시뮬 명확화를 위해 인출은 `withdrawalCAD` 항목으로 분리 tracking, "SCHD 매도"가 아닌 "withdrawal"로 라벨링.

### API 변경 (projection/route.ts)

`projectScenariosRulebook` 호출 시 `currentAge` 이미 전달됨. 추가 인풋 없음.

응답 객체에 새 필드들 자동 surface (시나리오 points에 포함).

### UI 변경 (projection-card.tsx)

**데스크탑 표**:
- "인출" 컬럼 추가 (`withdrawalCAD > 0`이면 표시, 그 외 "—")
- "월 가용" 컬럼 추가 (`monthlyCashflowCAD`, 65+에서만 > 0; 60~64는 인출만 ÷ 12)
- 기존 "연배당", "월배당" 컬럼은 65+에서 의미 변경 → 라벨을 "(소비)" 표기로 보강

**모바일 compact view**:
- "월 가용" 1줄 추가 (65+ 행만 표시)

### AI guard 강화 (ai-output-rules.ts)

`narrativeSystemPrompt`에 새 룰 추가 (projection/route.ts 590라인 근처):

```
[L] 수치 인용 절대 금지
 - 화면 표에 이미 모든 CAD/percent 수치가 표시되어 있다.
 - narrative 텍스트에 절대로 CAD 금액(예: $123,456 CAD), percent (예: 30.4%), 시나리오 절대값을 재인용하지 마라.
 - 의미/맥락/트리거 미래 영향/리스크 평가만 작성.
 - 위반 시 응답 즉시 재생성하라 (서버는 raw 숫자를 보내지 않을 수도 있다).
```

`projTable` (route.ts 483라인)도 narrative 프롬프트에서 제거하거나 markdown table로 격리 — AI가 표 데이터를 텍스트로 변환하려 시도하지 않도록.

### `RULEBOOK_PROMPT_VERSION` bump

`v4.1.10-1` → `v4.1.10-2` (캐시 자동 무효화).

## Architecture

기존 `projectScenariosRulebook` 한 함수에 단계 추가. 새 함수 분리 없음 (state 전파가 복잡해짐). 단, **단계별 함수 추출**도 가능한 옵션:
- `applyRrspMeltdown(state, age)`
- `applyDividendConsumption(state, age, yields)`
- `applyPensionCashflow(state, age)`

선택: **inline 추가** (현재 1 함수 1 책임, 단계 9개 → 12개로). 별도 함수 추출은 후속 리팩토링.

## Testing

`rulebook.test.ts`에 추가:
1. `projection: 60-71세 RRSP 멜트다운 인출 적용` — `withdrawalCAD === 40000` for age 60-71, 0 otherwise.
2. `projection: 65세부터 배당 재투자 중단` — `point[65+].dividendConsumedCAD > 0`, portfolio에 더해지지 않음.
3. `projection: 65세부터 펜션 합산` — `point[65+].pensionCAD === 93372`.
4. `projection: 60-64 인출만, 펜션/배당 소비 0` — 60-64 row의 `pensionCAD === 0`, `dividendConsumedCAD === 0`.
5. `projection: monthlyCashflowCAD = sum / 12` — 합산 식 검증.
6. `projection: SCHD 차감 우선, QLD 보조` — 시작 SCHD 작게 (예: 10K), 인출 40K → SCHD 0, QLD 30K 차감.
7. `projection: 70세 BASE 시나리오 결과 ≈ Python 시뮬 (3M±20%)` — golden test.

## Risks

1. **SCHD 인출 시 No-Sell invariant 충돌 인식 오해**: 룰북 §15 ("SCHD 매도 금지")와 [11] ("멜트다운 RRSP 인출, SCHD 인-카인드") 가 의미상 분리됨을 코드/주석으로 명확히. 인출은 매매가 아니라 distribution.
2. **펜션 7,781이 가구 합산**: 사용자(Sangbong) 단독 포트폴리오가 아닌 가구 cashflow. 합산은 정보용임을 라벨에 명시 ("가구 합산 추정").
3. **AI hallucination 가드 효과**: System prompt 한 줄만으로 부족할 수 있음. 검증 후 sanitizer 수치 검증 추가 여부 결정.
4. **세금 미반영**: 위 모든 cashflow는 세전. UI에 "(세전)" 표기 필수.
5. **인플레 미반영**: 25년 명목값. UI에 "(명목)" 표기 필수.
6. **기존 60+ 시뮬 결과 변경**: 사용자가 이전에 봤던 적립-only projection 결과와 다르게 보일 것. 의도된 동작 — 룰북 [10]/[11]/[16] 반영.

## Out-of-scope (별도 task 후속)

- 실질가치 (인플레 조정) 토글
- 세후 cashflow 계산 (T1032 pension splitting)
- 72세+ RRIF 의무 인출 (5.40%~)
- CPP/OAS 70세 연기 옵션
- Settings UI 입력 필드 (현재는 룰북 default 하드코딩)
- Sanitizer의 자동 수치 검증
