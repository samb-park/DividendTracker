---
name: orchestrator
description: DividendTracker 개발 워크플로우 오케스트레이터. "기능 추가해줘", "버그 수정해줘", "구현해줘", "만들어줘", "배당 캘린더 개선", "새 화면 추가" 등 개발 작업 전반에서 반드시 이 스킬을 사용할 것. feature/bugfix/financial/security 유형을 자동 감지하여 에이전트 팀(Developer, Designer, QA, Security, DevOps)을 구성하고 Plan → 구현 → 검증 → 배포 파이프라인을 실행한다. 단순 질문이나 설명 요청에는 트리거하지 말 것.
---

# DividendTracker 개발 오케스트레이터

오케스트레이터(리더)로서 작업 유형을 파악하고 적합한 에이전트 팀을 구성하여 전체 개발 파이프라인을 조율한다.

**실행 모드**: 에이전트 팀 (Agent Tool 병렬 호출)
**아키텍처**: Pipeline + Fan-out/Fan-in
**모든 Agent 호출**: `model: "opus"` 필수

---

## 워크플로우 유형 감지

| 유형 | 키워드/상황 | 팀 구성 |
|------|-----------|---------|
| `feature` | 기능 추가, 새 화면, 새 API, 새 컴포넌트 | Plan → Developer + Designer → QA + Security → DevOps |
| `bugfix` | 버그, 오류, 에러, 안 됨, 깨짐, 이상함 | Developer + QA 분석 → 수정 → QA 검증 → DevOps |
| `financial` | 계산 검토, TFSA/RRSP/FHSA, ACB, 배당률, 투자 로직 | DataAnalyst + Investor + TaxSpecialist |
| `security` | 보안, 인증, 취약점, 토큰, 권한 | Security + QA → Developer → DevOps |
| `deploy` | 배포만, 올려줘, 반영해줘 | DevOps (deploy 스킬) |

---

## Phase 1: 준비 (오케스트레이터 단독)

워크스페이스 설정 및 작업 범위 파악:

```
1. 워크스페이스 생성: /tmp/dt_workspace/
2. 요구사항 정리: /tmp/dt_workspace/00_requirements.md
   - 무엇을 구현할지 (사용자 요청 원문 + 해석)
   - 영향받는 파일 목록 (git status + 코드 탐색)
   - 기술적 제약 (Prisma, NextAuth, Yahoo Finance API 등)
3. 작업 유형 결정 (위 표 참조)
```

---

## Phase 2: 팀 실행

### 2-A. Feature 워크플로우

**Step 1 — Plan** (서브에이전트, 순차):
```
Agent(subagent_type="Plan", model="opus"):
  - 00_requirements.md 읽기
  - API 라우트 설계, 컴포넌트 구조, Prisma 쿼리 계획
  - 출력: /tmp/dt_workspace/01_plan.md
```

**Step 2 — 구현** (에이전트 팀, 병렬):
```
Agent(subagent_type="developer", model="opus", run_in_background=true):
  역할: API 라우트, 서버 로직, Prisma 쿼리, 타입 정의
  참조: 01_plan.md
  출력: 코드 직접 수정 + /tmp/dt_workspace/02_dev_notes.md

Agent(subagent_type="designer", model="opus", run_in_background=true):
  역할: React 컴포넌트, Tailwind CSS, Recharts, 반응형, 빈 상태
  참조: 01_plan.md (API shape 확인)
  출력: 코드 직접 수정 + /tmp/dt_workspace/02_design_notes.md
```

두 에이전트 완료 대기 → 결과 확인 후 다음 단계.

**Step 3 — 검증** (에이전트 팀, 병렬):
```
Agent(subagent_type="qa-tester", model="opus", run_in_background=true):
  역할: 엣지케이스, 경계 조건, 빈 상태, 금융 계산 정확성
  참조: 02_dev_notes.md + 02_design_notes.md
  출력: /tmp/dt_workspace/03_qa.md

Agent(subagent_type="security-officer", model="opus", run_in_background=true):
  역할: userId 스코핑, OWASP A01/A03/A07, 입력 검증
  참조: 02_dev_notes.md
  출력: /tmp/dt_workspace/03_security.md
```

**Step 4 — 배포** (devops, 순차):
```
Agent(subagent_type="devops", model="opus"):
  역할: deploy 스킬 실행 (빌드 → 마이그레이션 → compose up → health check)
  참조: 02_dev_notes.md (마이그레이션 필요 여부)
  출력: 배포 결과 보고
```

---

### 2-B. Bugfix 워크플로우

**Step 1 — 분석** (병렬):
```
Agent(subagent_type="qa-tester", model="opus", run_in_background=true):
  역할: 버그 재현 단계 확정, 영향 범위 파악, 회귀 위험 목록
  출력: /tmp/dt_workspace/bug_repro.md

Agent(subagent_type="developer", model="opus", run_in_background=true):
  역할: 코드에서 원인 파악, 수정 방법 설계
  출력: /tmp/dt_workspace/bug_analysis.md
```

**Step 2 — 수정** (developer):
```
Agent(subagent_type="developer", model="opus"):
  역할: bug_analysis.md 기반으로 수정 구현
```

**Step 3 — 검증** (qa-tester):
```
Agent(subagent_type="qa-tester", model="opus"):
  역할: 수정 확인 + 회귀 테스트
```

**Step 4 — 배포** (devops):
```
Agent(subagent_type="devops", model="opus")
```

---

### 2-C. Financial Review 워크플로우

**병렬 검토** (코드 미수정, 분석만):
```
Agent(subagent_type="data-analyst", model="opus", run_in_background=true):
  역할: 계산 공식 정확성, 엣지케이스 (0주, 음수 수익률, 통화 전환)
  출력: /tmp/dt_workspace/fin_data.md

Agent(subagent_type="investor", model="opus", run_in_background=true):
  역할: 투자자 실사용 시나리오, 표시 방식 적합성
  출력: /tmp/dt_workspace/fin_investor.md

Agent(subagent_type="tax-specialist", model="opus", run_in_background=true):
  역할: TFSA/RRSP/FHSA 규정, ACB 계산, CRA 요구사항
  출력: /tmp/dt_workspace/fin_tax.md
```

오케스트레이터가 3개 분석 통합 → 사용자에게 보고.

---

## Phase 3: 데이터 흐름

```
/tmp/dt_workspace/
├── 00_requirements.md     # 오케스트레이터 작성 → 전체 팀 참조
├── 01_plan.md             # Plan 에이전트 → Developer, Designer
├── 02_dev_notes.md        # Developer → QA, Security, DevOps
├── 02_design_notes.md     # Designer → QA
├── 03_qa.md               # QA → 오케스트레이터
├── 03_security.md         # Security → 오케스트레이터
└── final_report.md        # 오케스트레이터 최종 종합
```

에이전트는 위 경로에서 이전 산출물을 읽고, 자신의 출력을 약속된 경로에 저장한다.

---

## Phase 4: 에러 핸들링

| 상황 | 처리 |
|------|------|
| 에이전트 1개 실패 | 1회 재시도 → 실패 시 해당 파트 건너뛰고 보고서에 명시 |
| 빌드 실패 | devops가 에러 로그 캡처 → developer에게 전달 → 수정 후 재배포 |
| 검증 이슈 발견 | QA/Security → developer에게 수정 요청 → 수정 후 재검증 |
| 데이터 충돌 (에이전트 간 의견 불일치) | 양쪽 의견 모두 보고서 포함, 사용자 판단 요청 |

---

## Phase 5: 최종 보고

```markdown
## 작업 완료 보고

**유형**: {feature/bugfix/financial/security/deploy}
**완료 단계**: Phase {1-4}

### 구현 내용
- 변경 파일: {파일 목록}
- 주요 변경사항: {설명}

### 검증 결과
- QA: {통과 ✓ | 이슈 ✗: 내용}
- Security: {통과 ✓ | 이슈 ✗: 내용}

### 배포 상태
- {성공 ✓ | 실패 ✗: 이유}
- Health check: {통과/실패}

### 미해결 이슈
- {있으면 목록, 없으면 없음}
```

---

## 팀 규모 가이드

| 작업 크기 | 팀원 수 | 예시 |
|----------|---------|------|
| 간단한 버그 (1-2 파일) | 2명 | Developer + DevOps |
| 중간 기능 (3-5 파일) | 3-4명 | Developer + Designer + QA + DevOps |
| 복잡한 기능 (5+ 파일) | 4-5명 | 풀팀 |
| 투자 로직 검토 | 3명 | DataAnalyst + Investor + TaxSpecialist |

---

## 테스트 시나리오

### 정상 흐름 (Feature)
```
입력: "배당 캘린더에 월별 필터 추가해줘"
Phase 1: calendar-client.tsx, /api/transactions/calendar 확인 → 요구사항 정리
Phase 2: Designer(필터 UI) + Developer(API 쿼리) 병렬 구현
Phase 3: QA(빈 달 엣지케이스) + Security(userId 스코핑) 병렬 검증
Phase 4: DevOps docker compose up → health check 통과
결과: 기능 구현 + 배포 완료 보고
```

### 에러 흐름 (빌드 실패)
```
Phase 4에서 docker compose build 실패 (TypeScript 에러)
처리: devops → 에러 로그 캡처 → developer에게 전달 → developer 수정 → 재배포
결과: 최종 성공 또는 실패 사유 포함 보고
```
