# Retirement Simulation Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `projectScenariosRulebook` 시뮬에 RRSP 멜트다운 인출(60-71), 배당 소비 모드(65+), 펜션 cashflow 합산(65+)을 추가하고, projection-card UI에 "인출"/"월 가용" 컬럼을 표시. AI narrative의 수치 hallucination을 system prompt로 차단.

**Architecture:** 룰북 [10]/[11]/[16]을 시뮬에 명시 반영. `projectScenariosRulebook` per-year loop의 priority order에 4단계 추가 (RRSP 멜트다운 → IAUM 65 exit (기존) → 배당 소비 분기 → 펜션 합산). 새 필드 `withdrawalCAD`/`dividendConsumedCAD`/`pensionCAD`/`monthlyCashflowCAD`를 ProjectionYearPointV2에 추가. UI는 기존 데스크탑 표에 컬럼 2개 추가, 모바일 1줄.

**Tech Stack:** TypeScript / Next.js 16 / Prisma / `tsx` (no jest, `npx tsx src/lib/rulebook.test.ts` 직접 실행).

**Spec doc:** `docs/superpowers/specs/2026-05-10-retirement-sim-extension-design.md` (commit `63ee8cb`).

---

## File Structure

| Path | Responsibility | Action |
|---|---|---|
| `src/lib/rulebook.ts` | 룰북 상수, 시뮬 로직 | Modify (+ retirement-phase constants + 3 sim steps + 4 fields) |
| `src/lib/rulebook.test.ts` | 룰북 테스트 | Modify (+ 7 retirement tests) |
| `src/lib/types/ai-projection.ts` | API response types | Modify (+ 4 fields on ProjectionYearV2) |
| `src/lib/ai-output-rules.ts` | AI 가드레일 + prompt cache version | Modify (+ [L] 수치 인용 금지 + bump v4.1.10-1 → v4.1.10-2) |
| `src/app/api/ai/projection/route.ts` | Projection API | Modify (narrative system prompt에 [L] 룰 추가 + projTable 격리) |
| `src/components/projection-card.tsx` | Projection UI | Modify (+ 인출/월 가용 컬럼) |

No new files.

---

## Task 1: Retirement-phase 상수 + 시뮬 로직 (rulebook.ts)

**Files:**
- Modify: `src/lib/rulebook.ts`
- Test: `src/lib/rulebook.test.ts`

### Step 1: Write 7 failing tests

`src/lib/rulebook.test.ts`의 base helper `baseProjectionInput`를 그대로 사용. 새 테스트 7개를 `console.log` 직전에 append.

- [ ] **Add new tests to `rulebook.test.ts`:**

```typescript
// ── Retirement phase tests (rulebook [10] / [11] / [16]) ─────────────────────
test("projection: 60-71세 RRSP 멜트다운 인출 40K/년 적용", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 58,
    yearPoints: [1, 2, 3, 12, 13, 14, 15],  // ages 59,60,61,70,71,72,73
    maxYears: 15,
  }));
  const base = out.find(s => s.id === "base")!;
  const at60 = base.points.find(p => p.yearsFromNow === 2)!;  // age 60
  const at65 = base.points.find(p => p.yearsFromNow === 7);   // skipped (not in yearPoints)
  const at70 = base.points.find(p => p.yearsFromNow === 12)!; // age 70
  const at71 = base.points.find(p => p.yearsFromNow === 13)!; // age 71
  const at72 = base.points.find(p => p.yearsFromNow === 14)!; // age 72 — out of meltdown
  assert.equal(at60.withdrawalCAD, 40000);
  assert.equal(at70.withdrawalCAD, 40000);
  assert.equal(at71.withdrawalCAD, 40000);
  assert.equal(at72.withdrawalCAD, 0);
});

test("projection: 60세 이전에는 인출 없음", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 50,
    yearPoints: [1, 5],   // ages 51, 55
    maxYears: 5,
  }));
  const base = out.find(s => s.id === "base")!;
  for (const p of base.points) assert.equal(p.withdrawalCAD, 0);
});

test("projection: 65세부터 배당 재투자 중단 (dividendConsumedCAD > 0)", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 60,
    yearPoints: [4, 5, 6],  // ages 64, 65, 66
    maxYears: 10,
  }));
  const base = out.find(s => s.id === "base")!;
  const at64 = base.points.find(p => p.yearsFromNow === 4)!;
  const at65 = base.points.find(p => p.yearsFromNow === 5)!;
  const at66 = base.points.find(p => p.yearsFromNow === 6)!;
  assert.equal(at64.dividendConsumedCAD, 0, "before 65 dividends reinvested");
  assert.ok(at65.dividendConsumedCAD > 0, "from 65 dividends consumed");
  assert.ok(at66.dividendConsumedCAD > 0);
});

test("projection: 65세부터 펜션 합산 93,372/year", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 60,
    yearPoints: [4, 5, 10],  // ages 64, 65, 70
    maxYears: 10,
  }));
  const base = out.find(s => s.id === "base")!;
  const at64 = base.points.find(p => p.yearsFromNow === 4)!;
  const at65 = base.points.find(p => p.yearsFromNow === 5)!;
  const at70 = base.points.find(p => p.yearsFromNow === 10)!;
  assert.equal(at64.pensionCAD, 0);
  assert.equal(at65.pensionCAD, 7781 * 12);   // 93372
  assert.equal(at70.pensionCAD, 7781 * 12);
});

test("projection: 60-64 인출만, 펜션/배당소비 0", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 58,
    yearPoints: [2, 3, 6],  // ages 60, 61, 64
    maxYears: 6,
  }));
  const base = out.find(s => s.id === "base")!;
  const at60 = base.points.find(p => p.yearsFromNow === 2)!;
  const at64 = base.points.find(p => p.yearsFromNow === 6)!;
  assert.equal(at60.withdrawalCAD, 40000);
  assert.equal(at60.pensionCAD, 0);
  assert.equal(at60.dividendConsumedCAD, 0);
  assert.equal(at64.withdrawalCAD, 40000);
  assert.equal(at64.pensionCAD, 0);
  assert.equal(at64.dividendConsumedCAD, 0);
});

test("projection: monthlyCashflowCAD = (withdrawal + divConsumed + pension) / 12", () => {
  const out = projectScenariosRulebook(baseProjectionInput({
    currentAge: 60,
    yearPoints: [5],   // age 65
    maxYears: 6,
  }));
  const at65 = out.find(s => s.id === "base")!.points[0];
  const expected = Math.round((at65.withdrawalCAD + at65.dividendConsumedCAD + at65.pensionCAD) / 12);
  assert.equal(at65.monthlyCashflowCAD, expected);
});

test("projection: SCHD 우선 인출, SCHD 부족시 QLD 보조", () => {
  // Start with very low SCHD so meltdown forces QLD draw
  const out = projectScenariosRulebook(baseProjectionInput({
    start: {
      schdCAD: 10000, qldCAD: 80000, sgovCAD: 5000, iaumCAD: 0, tqqqCAD: 0,
      schdYieldPct: 3.5, qldYieldPct: 0.5, sgovYieldPct: 4.5,
    },
    coreWeeklyCAD: 0,  // no contributions to muddy the test
    sgovWeeklyCAD: 0,
    iaumWeeklyCAD: 0,
    currentAge: 60,
    yearPoints: [1],
    maxYears: 1,
  }));
  const y1 = out.find(s => s.id === "base")!.points[0];
  // 60세 → meltdown 40K. SCHD 10K(+ growth ~600) ≈ 10.6K → fully drained, ~29.4K from QLD.
  // After full year: SCHD ≈ 0 (post-meltdown), QLD significantly reduced.
  assert.ok(y1.schdCAD < 2000, `SCHD should be fully drained, got ${y1.schdCAD}`);
  assert.equal(y1.withdrawalCAD, 40000);
});
```

- [ ] **Run tests — expect 7 failures (new fields not defined)**

```bash
cd /mnt/fast_data/docker/apps/DividendTracker && npx tsx src/lib/rulebook.test.ts 2>&1 | tail -25
```

Expected: TypeScript errors about missing fields on `ProjectionYearPointV2`, OR test failures (`undefined === 40000`).

### Step 2: Add retirement-phase constants to `RULEBOOK_TARGETS`

Open `src/lib/rulebook.ts`. Find `RULEBOOK_TARGETS` (around line 25). Append before the closing `} as const;`:

- [ ] **Add constants:**

```typescript
  // Retirement phase (rulebook [10] / [11] / [16])
  RRSP_MELTDOWN_START_AGE: 60,
  RRSP_MELTDOWN_END_AGE:   71,
  RRSP_MELTDOWN_ANNUAL_CAD: 40000,        // [11] 30-50K 중간값
  DIVIDEND_CONSUMPTION_AGE: 65,           // [10] IAUM exit과 같은 시점
  PENSION_START_AGE:        65,           // [16] HOOPP 시작
  PENSION_MONTHLY_CAD:      7781,         // [16] 가구 합산 추정값
```

### Step 3: Extend `ProjectionYearPointV2`

Find `ProjectionYearPointV2` interface (around line 510 area). Add 4 new fields:

- [ ] **Add fields:**

```typescript
  // Retirement phase fields ([10] / [11] / [16])
  withdrawalCAD: number;        // RRSP 멜트다운 (60-71)
  dividendConsumedCAD: number;  // 65+ 배당 소비 (gross, 세전)
  pensionCAD: number;           // 65+ 펜션 연간 합산 (가구 합산 추정)
  monthlyCashflowCAD: number;   // (withdrawal + dividendConsumed + pension) / 12
```

### Step 4: Modify the per-year loop in `projectScenariosRulebook`

Find the `for (let y = 1; y <= input.maxYears; y++) {` block. We need:

1. New local vars at the top of the loop body (after `let iaumExited = false;`):

```typescript
      let withdrawalCAD = 0;
      let dividendConsumedCAD = 0;
      let pensionCAD = 0;
```

2. **NEW (a) RRSP 멜트다운**: Insert between the existing "Annual rebalance" block and "65 IAUM exit" block:

```typescript
      // (Z-a) RRSP 멜트다운 인출 (룰북 [11], 60-71세, SCHD 우선)
      const meltdownAgeNow = input.currentAge != null ? input.currentAge + y : null;
      if (meltdownAgeNow != null
          && meltdownAgeNow >= RULEBOOK_TARGETS.RRSP_MELTDOWN_START_AGE
          && meltdownAgeNow <= RULEBOOK_TARGETS.RRSP_MELTDOWN_END_AGE) {
        const requested = RULEBOOK_TARGETS.RRSP_MELTDOWN_ANNUAL_CAD;
        const fromSchd = Math.min(schdCAD, requested);
        const remaining = requested - fromSchd;
        const fromQld = Math.min(qldCAD, remaining);
        schdCAD -= fromSchd;
        qldCAD  -= fromQld;
        withdrawalCAD = fromSchd + fromQld;
      }
```

3. **NEW (b) 배당 소비 분기**: The existing dividend snapshot calculates `annualDivGross = schdCAD*schdYld + qldCAD*qldYld + sgovCAD*sgovYld`. After that line, add:

```typescript
      // (Z-b) 배당 소비 모드 (룰북 [10], 65세부터)
      const consumptionAgeNow = input.currentAge != null ? input.currentAge + y : null;
      if (consumptionAgeNow != null && consumptionAgeNow >= RULEBOOK_TARGETS.DIVIDEND_CONSUMPTION_AGE) {
        dividendConsumedCAD = Math.round(annualDivGross);
        // Note: 시뮬은 단순화 — 65 이전엔 yield-driven implicit reinvestment (no portfolio bump because the
        // CAGR proxy is already net total return). 65+에서는 dividendConsumedCAD를 별도 cashflow로 분리.
      }
```

4. **NEW (c) 펜션 합산**: Right after (b):

```typescript
      // (Z-c) 펜션 cashflow 합산 (룰북 [16], 65세부터, 가구 합산 추정)
      const pensionAgeNow = input.currentAge != null ? input.currentAge + y : null;
      if (pensionAgeNow != null && pensionAgeNow >= RULEBOOK_TARGETS.PENSION_START_AGE) {
        pensionCAD = RULEBOOK_TARGETS.PENSION_MONTHLY_CAD * 12;
      }
```

5. **NEW (d) monthlyCashflowCAD 계산**: Right after (c):

```typescript
      const totalAnnualCashflow = withdrawalCAD + dividendConsumedCAD + pensionCAD;
      const monthlyCashflowCAD = Math.round(totalAnnualCashflow / 12);
```

6. Add the 4 new fields to the `points.push({...})` object inside `if (yearPointsClean.includes(y))`:

```typescript
          withdrawalCAD: Math.round(withdrawalCAD),
          dividendConsumedCAD: Math.round(dividendConsumedCAD),
          pensionCAD: Math.round(pensionCAD),
          monthlyCashflowCAD,
```

### Step 5: Run tests — expect PASS

```bash
cd /mnt/fast_data/docker/apps/DividendTracker && npx tsx src/lib/rulebook.test.ts 2>&1 | tail -20
```

Expected: 57 (prior) + 7 (new) = 64 passed, 0 failed.

### Step 6: Commit

```bash
git add src/lib/rulebook.ts src/lib/rulebook.test.ts
git commit -m "$(cat <<'EOF'
rulebook v4.1.10: retirement phase — meltdown / div consumption / pension

Add per-year retirement-phase simulation to projectScenariosRulebook:
- 60-71 RRSP meltdown 40K/year (SCHD-first, QLD-backup), rulebook [11]
- 65+ dividend consumption mode (no reinvestment), rulebook [10]
- 65+ pension cashflow +93,372/year (household estimate), rulebook [16]
- monthlyCashflowCAD field for UI display

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: API types sync (ProjectionYearV2)

**Files:**
- Modify: `src/lib/types/ai-projection.ts`

The new fields added in Task 1's internal `ProjectionYearPointV2` need to surface to the shared client type `ProjectionYearV2` in `src/lib/types/ai-projection.ts`.

### Step 1: Update `ProjectionYearV2`

Find `ProjectionYearV2` interface (lines ~19-36 area). Add 4 new fields right after `iaumExited: boolean;`:

- [ ] **Add fields:**

```typescript
  // Retirement phase ([10] / [11] / [16])
  withdrawalCAD: number;
  dividendConsumedCAD: number;
  pensionCAD: number;
  monthlyCashflowCAD: number;
```

### Step 2: Run typecheck

```bash
cd /mnt/fast_data/docker/apps/DividendTracker && npx tsc --noEmit 2>&1 | grep -E "(types/ai-projection|projection-card)" | head -10
```

Expected: 0 errors in these files. UI may reference the new fields but only if Task 4 has run — if so, fields will be present.

### Step 3: Commit

```bash
git add src/lib/types/ai-projection.ts
git commit -m "$(cat <<'EOF'
api types: surface retirement-phase fields on ProjectionYearV2

Add withdrawalCAD, dividendConsumedCAD, pensionCAD, monthlyCashflowCAD
to the shared client type (matches ProjectionYearPointV2 from Task 1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: AI guard 강화 + cache version bump

**Files:**
- Modify: `src/lib/ai-output-rules.ts`
- Modify: `src/app/api/ai/projection/route.ts`

### Step 1: Bump version

Open `src/lib/ai-output-rules.ts` line 6:

- [ ] **Update:**

```typescript
export const RULEBOOK_PROMPT_VERSION = "v4.1.10-2";
```

### Step 2: Add [L] rule to RULEBOOK_GUARDRAILS

Find `RULEBOOK_GUARDRAILS` (the long backtick template literal). Right before the closing backtick (after `[K] 섹션 역할 분리...`), append:

- [ ] **Add new section [L]:**

```typescript

[L] 수치 인용 절대 금지
 - 화면 표에 이미 모든 CAD 금액과 percent 수치가 표시된다.
 - narrative 텍스트에 절대로 CAD 금액(예: $123,456 CAD), percent (예: 30.4%), 시나리오 절대값을 다시 적지 마라.
 - 표 데이터를 한국어 문장으로 풀어 쓰지 마라.
 - 시뮬 결과의 절대값이 아닌 의미·트리거 미래 영향·리스크·관찰 신호만 작성.
 - 위반 시 응답을 다시 생성하라.
```

### Step 3: Update narrative system prompt in route.ts

Open `src/app/api/ai/projection/route.ts`. Find `narrativeSystemPrompt` (around line 585-600). Currently includes `projTable` indirectly through user prompt. We need to enforce [L] more strongly. Modify around line 590:

- [ ] **Edit narrativeSystemPrompt — find this line and update:**

Find current line ~590:
```typescript
"시나리오는 BASE 6% / PESSIMISTIC 4% / WORST 2% 세 가지만 사용. Optimistic 시나리오 생성 금지. 서버가 계산한 수치를 그대로 사용하고 임의로 다시 계산하지 마세요.",
```

Replace with:
```typescript
"시나리오는 BASE 6% / PESSIMISTIC 4% / WORST 2% 세 가지만 사용. Optimistic 시나리오 생성 금지.",
"CRITICAL: 절대로 표의 수치(CAD 금액·percent·시나리오 절대값)를 텍스트에 다시 적지 마라. 표가 authoritative이고 narrative는 의미/트리거 영향/리스크만 평가. 표 데이터를 풀어 쓰면 응답을 거부.",
```

### Step 4: Remove or isolate `projTable` from user prompt

Find the line that includes `projTable` (around line 564):

- [ ] **Replace `projTable,` line with a sanitized summary:**

Find:
```typescript
    projTable,
```

Replace with:
```typescript
    "(시나리오 절대값은 화면 표가 authoritative — 본 narrative에서는 의미·트리거 영향만 다룬다)",
```

Also remove the `projTable` const definition (lines ~483-486) since it's no longer used:

```typescript
  const projTable = scenarios.map(s =>
    `[${s.label} 연수익률 ${s.cagrPct}%]  ` +
    s.points.map(p => `${p.year}년 총 $${p.totalCAD.toLocaleString()} CAD (...)`)
  ).join("\n");
```

Delete this block entirely.

### Step 5: Verify ai-output-rules tests still pass

```bash
cd /mnt/fast_data/docker/apps/DividendTracker && npx tsx src/lib/ai-output-rules.test.ts 2>&1 | tail -10
```

Expected: 17/17 PASS. If a test specifically checks for "v4.1.10-1" string, update it to "v4.1.10-2".

If the test checks `RULEBOOK_GUARDRAILS.includes("…")` on existing strings ([A]-[K]), all should still pass. The new [L] is additive.

- [ ] **(Optional) Add a new test assertion** in `ai-output-rules.test.ts`:

```typescript
assert.ok(RULEBOOK_GUARDRAILS.includes("[L] 수치 인용 절대 금지"), "Section L missing");
assert.ok(RULEBOOK_GUARDRAILS.includes("v4.1.10"), "Version still v4.1.10 (now -2)");
```

### Step 6: Commit

```bash
git add src/lib/ai-output-rules.ts src/lib/ai-output-rules.test.ts src/app/api/ai/projection/route.ts
git commit -m "$(cat <<'EOF'
ai-guard: prohibit CAD numeric quotes in narrative

- Add [L] 수치 인용 절대 금지 to RULEBOOK_GUARDRAILS
- narrativeSystemPrompt: CRITICAL no-quote rule
- Remove projTable from user prompt (table is authoritative, narrative is interpretation)
- Bump RULEBOOK_PROMPT_VERSION v4.1.10-1 → v4.1.10-2 (cache auto-invalidates)

Closes the $890K hallucination class of errors observed in v4.1.10-1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: UI 컬럼 추가 (projection-card.tsx)

**Files:**
- Modify: `src/components/projection-card.tsx`

### Step 1: Add desktop table columns

Find `<thead>` block (around line 114-126). Add 2 columns after "월배당":

- [ ] **Update thead:**

```tsx
                    <thead>
                      <tr className="text-muted-foreground border-b border-border bg-muted/30">
                        <th className="text-left  py-1.5 px-2 font-normal">연도</th>
                        <th className="text-right py-1.5 px-2 font-normal">총 평가</th>
                        <th className="text-right py-1.5 px-2 font-normal">SCHD</th>
                        <th className="text-right py-1.5 px-2 font-normal">QLD</th>
                        <th className="text-right py-1.5 px-2 font-normal">SGOV</th>
                        <th className="text-right py-1.5 px-2 font-normal">IAUM</th>
                        <th className="text-right py-1.5 px-2 font-normal">연배당</th>
                        <th className="text-right py-1.5 px-2 font-normal">월배당</th>
                        <th className="text-right py-1.5 px-2 font-normal">인출</th>
                        <th className="text-right py-1.5 px-2 font-normal">월 가용</th>
                        <th className="text-left  py-1.5 px-2 font-normal">이벤트</th>
                      </tr>
                    </thead>
```

### Step 2: Add desktop row cells

Find the `<tr>` map body (around line 136-152) for each projection row. Add 2 cells after `<td className="text-right py-1.5 px-2 text-positive/80">{fmtCAD(p.monthlyDivCAD)}</td>`:

- [ ] **Update tr body — insert 2 cells:**

```tsx
                            <td className="text-right py-1.5 px-2 text-positive">{fmtCAD(p.annualDivCAD)}</td>
                            <td className="text-right py-1.5 px-2 text-positive/80">{fmtCAD(p.monthlyDivCAD)}</td>
                            <td className="text-right py-1.5 px-2 text-amber-500">
                              {p.withdrawalCAD > 0 ? fmtCAD(p.withdrawalCAD) : "—"}
                            </td>
                            <td className="text-right py-1.5 px-2 text-primary">
                              {p.monthlyCashflowCAD > 0 ? fmtCAD(p.monthlyCashflowCAD) : "—"}
                            </td>
                            <td className="text-left  py-1.5 px-2 text-[10px] text-amber-500">{events.join(", ") || "—"}</td>
```

### Step 3: Add mobile cashflow line

Find the mobile compact `<ul>` (around line 159-202). Within the `<li>` block, after the "월배당" row (around line 191-194), add 1 more row before the "events" closing div:

- [ ] **Add mobile cashflow row:**

```tsx
                          <div className="flex items-baseline justify-between gap-1">
                            <span>월배당</span>
                            <span className="text-positive/80 tabular-nums truncate">{fmtCAD(p.monthlyDivCAD)}</span>
                          </div>
                          {p.monthlyCashflowCAD > 0 && (
                            <div className="flex items-baseline justify-between gap-1">
                              <span>월 가용</span>
                              <span className="text-primary tabular-nums truncate">{fmtCAD(p.monthlyCashflowCAD)}</span>
                            </div>
                          )}
                          {events.length > 0 && (
                            <div className="text-[9px] text-amber-500">{events.join(" / ")}</div>
                          )}
```

### Step 4: Update model assumption footer

Find the footer lines around 217-220. Update the model-limits line to mention retirement phase:

- [ ] **Update footer line:**

Find:
```tsx
              <div>* 매년 시뮬: Method B → §6.2 Hard Exit (성장 버킷 ≥ 38%) → §6.2 Soft Exit (≥ 34%) → §6.1 Crisis (T1/T2 cycle-gated) → §5 연말 리밸런스 (Case A/B, ±1% 데드밴드) → 65세 IAUM exit. SCHD 매도 절대 금지.</div>
```

Replace with:
```tsx
              <div>* 매년 시뮬: Method B → §6.2 Hard/Soft Exit → §6.1 Crisis (cycle-gated) → §5 연말 리밸런스 → §11 RRSP 멜트다운 (60-71, 40K/년, SCHD 우선) → §10 65세 IAUM exit → §10 배당 소비 (65+) → §16 펜션 합산 (65+, 가구 추정). SCHD 매도 금지 (멜트다운 인출은 예외, 룰북 [11]에서 명시).</div>
```

Also add a "세전·명목" 표기 line:

- [ ] **Add new footer line right after the model-limits line:**

```tsx
              <div>* 모든 CAD 수치는 세전·명목값. 인플레/세금/RRIF 의무 인출/CPP·OAS 연기는 미반영. 펜션 7,781은 가구 합산 추정값.</div>
```

### Step 5: Verify typecheck

```bash
cd /mnt/fast_data/docker/apps/DividendTracker && npx tsc --noEmit 2>&1 | grep "projection-card" | head -10
```

Expected: 0 errors.

### Step 6: Commit

```bash
git add src/components/projection-card.tsx
git commit -m "$(cat <<'EOF'
ui: projection table — withdrawal and monthly cashflow columns

- Desktop: '인출' and '월 가용' columns (60+ shows values, before 60 shows '—')
- Mobile: '월 가용' line shown when > 0 (65+ portfolio + dividend + pension)
- Footer: updated sim order with §11 meltdown / §10 consumption / §16 pension
- Footer: '세전·명목값' disclosure line

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Build, test, deploy verification

**Files:** (none modified)

### Step 1: Full test suite

- [ ] **Run all rulebook tests:**

```bash
cd /mnt/fast_data/docker/apps/DividendTracker
npx tsx src/lib/rulebook.test.ts
npx tsx src/lib/ai-output-rules.test.ts
npx tsx src/lib/v2-allocation.test.ts
```

Expected: 64 + 17 + 15 = 96 passed.

### Step 2: Typecheck affected files

- [ ] **Run typecheck:**

```bash
npx tsc --noEmit 2>&1 | grep -E "(rulebook|types/ai-projection|ai-output-rules|api/ai/projection|projection-card)" | head -20
```

Expected: 0 errors in these files.

### Step 3: Build

- [ ] **Run Next.js build:**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`.

### Step 4: Docker deploy

- [ ] **Build and deploy:**

```bash
docker compose up --build -d
docker compose ps
docker compose logs --tail 50 app 2>&1 | tail -20
```

Expected: container `Up (healthy)`, no startup errors.

### Step 5: Smoke check

- [ ] **Test projection API loads (auth gate OK):**

```bash
curl -sS -w "\nHTTP %{http_code}\n" -o /dev/null http://127.0.0.1:3000/api/ai/projection -X POST 2>&1
curl -sS -w "\nHTTP %{http_code}\n" -o /dev/null http://127.0.0.1:3000/api/health 2>&1
```

Expected: `/api/ai/projection` returns 401 (auth gate), `/api/health` returns 200.

### Step 6: Done — no commit needed

This task is verification only.

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Constants RRSP_MELTDOWN_START_AGE / END_AGE / ANNUAL_CAD / DIVIDEND_CONSUMPTION_AGE / PENSION_START_AGE / PENSION_MONTHLY_CAD → Task 1 Step 2.
- ✅ Per-year loop additions (3 steps: meltdown, dividend consumption, pension) → Task 1 Step 4.
- ✅ ProjectionYearPointV2 4 new fields → Task 1 Step 3.
- ✅ ProjectionYearV2 client type sync → Task 2 Step 1.
- ✅ AI guard [L] section → Task 3 Step 2.
- ✅ projTable removal → Task 3 Step 4.
- ✅ Cache version bump → Task 3 Step 1.
- ✅ UI desktop "인출"/"월 가용" columns → Task 4 Step 1-2.
- ✅ UI mobile "월 가용" line → Task 4 Step 3.
- ✅ UI footer 세전·명목 disclosure → Task 4 Step 4.
- ✅ Build/test/deploy → Task 5.
- ✅ SCHD-first withdrawal then QLD backup → Task 1 Step 4 (a) `fromSchd` then `fromQld`.
- ✅ 7 tests covering retirement phase → Task 1 Step 1.

**Placeholders:** none.

**Type consistency:** `ProjectionYearPointV2` fields (Task 1) === `ProjectionYearV2` fields (Task 2). `RULEBOOK_TARGETS.RRSP_MELTDOWN_*` used consistently in Task 1 Step 4 (a)/(b)/(c).

**Out-of-scope tasks NOT planned (per spec):**
- 인플레/세금 토글
- RRIF 의무 인출 (72+)
- CPP/OAS 연기
- Settings UI 입력 필드
- Sanitizer 자동 수치 검증 (only system prompt strengthening)

These can be follow-up plans.

---
