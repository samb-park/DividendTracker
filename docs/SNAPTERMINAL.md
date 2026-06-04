# SnapTerminal — 고밀도 금융 터미널

미국주식 투자자를 위한 한국어 기반 Bloomberg 스타일 터미널. DividendTracker(개인
배당/은퇴 포트폴리오 추적기)에 **추가형 surface**로 구축되었으며, 기존 v1(모바일 탭)·
v2(그래프) 화면은 그대로 둔 채 `/terminal` 경로에서 독립적으로 동작한다.

접속: `https://dividend.buildwith.work/terminal` (로컬: `http://localhost:3000/terminal`)

---

## 1. 핵심 원칙 — 가짜 데이터 금지 (Real vs Fake 정책)

**이 프로젝트의 가장 강한 제약이다.** 데이터가 없을 때 그럴듯한 가짜 숫자로 채우지
않는다. 모든 패널은 다음 4가지 상태 중 하나로 데이터 신뢰도를 **명시적으로** 표시한다.

| 상태 | 의미 | UI 표기 |
|------|------|---------|
| 실데이터 | 정상 수신 | 값 + (필요시) 출처 배지 |
| `지연` (delayed) | 실제 데이터지만 지연됨 (예: Yahoo 무료 티어) | `DataBadge kind="delayed"` |
| `API 필요` (api_required) | 연동/키가 있어야 제공 가능 | `PanelEmpty kind="api_required"` |
| `데이터 없음` (no_data) | 소스가 빈 값/없음 반환 | `PanelEmpty kind="no_data"` |
| `오류` (error) | 요청 실패 | `PanelEmpty kind="error"` |

구현: `src/components/terminal/panel-state.tsx` (`<PanelEmpty>`, `<DataBadge>`).

**의도적으로 가짜를 만들지 않은 사례 (정직성 증거):**
- 실시간 호가(Level II), 옵션 체인/플로우, Vol Surface → 무료 실소스가 없어
  **항상 "API 필요"** 로만 표시. 목업 스크린샷의 숫자는 재현하지 않는다.
- 뉴스 패널: 백엔드가 감성/중요도 필드를 주지 않으므로 항목별로 만들어내지 않고
  헤더에 "감성·중요도: 백엔드 미제공" 한 줄로만 정직하게 표기.
- 섹터 패널: `/api/sector` 는 등락률을 주지 않으므로, 보유 종목의 실제 등락률
  (`/api/market/quotes`)을 섹터별 단순 평균으로 *유도*하고 "보유 종목 평균(시장 섹터
  지수 아님)"이라고 명시. 데이터 없는 종목은 0%로 강제하지 않고 평균에서 제외.

---

## 2. 실행 방법

### 로컬 개발
```bash
npm install
# .env 작성 (아래 4장 참고) — 최소 DATABASE_URL 필요
npm run dev          # http://localhost:3000/terminal
```

### 타입체크 / 빌드 / 테스트
```bash
npm run typecheck    # tsc --noEmit (배포 전 정합성 확인 — Next build는 타입에러로 안 깨짐)
npm run build        # 프로덕션 빌드
npm test             # 도메인 테스트 스위트
```

## 3. 배포 방법 (Docker Compose)
```bash
git pull
docker compose up -d --build          # 빌드 → prisma db push(자동) → 컨테이너 기동
docker logs dividendtracker --tail 50 | grep -iE "ready|error"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health   # 200 기대
```
도메인은 Cloudflare를 통해 `dividend.buildwith.work` 로 노출된다. (`DEPLOYMENT.md` 참고)

---

## 4. 필요한 API 키 / 환경변수

| 변수 | 필수 | 용도 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 연결 (포트폴리오/설정/스냅샷) |
| `DIVIDENDTRACKER_SINGLE_USER_ID` | 권장 | 단일 사용자 모드 고정 User.id (기본 `sangbong`) |
| `CRON_SECRET` | 권장 | `/api/cron/*` Bearer 토큰 (`openssl rand -hex 32`) |
| `DEFAULT_FX_RATE` | 선택 | `/api/fx` 실패 시 USD/CAD 폴백 (기본 1.35) |
| `AI_PROVIDER` | 선택 | `hermes` / `openrouter` / `openai` / `github` 중 선택 |
| `HERMES_API_KEY` (또는 `AI_API_KEY`) | 선택 | hermes 게이트웨이 토큰 |
| `AI_ENDPOINT` | 선택 | hermes OpenAI 호환 엔드포인트 URL |
| `AI_MODEL` | 선택 | 사용할 모델명 (예: `hermes-agent`, `openai/gpt-5.5`) |
| `OPENROUTER_API_KEY` | 선택 | OpenRouter 사용 시 |
| `OPENAI_API_KEY` | 선택 | OpenAI 직접 사용 시 |
| `GITHUB_TOKEN` | 선택 | GitHub Models 사용 시 |

> 시장 데이터(주가/지수/환율/차트)는 **키 없이** 동작한다(Yahoo Finance + Frankfurter).
> AI 키가 전혀 없으면 뉴스는 **번역 없이 실제 헤드라인**만 보이고, AI 어시스턴트는
> "API 필요" 상태로 표시된다(가짜 답변 생성 안 함).

### AI 설정 방법 (Gemini 포함)
AI 호출은 **OpenAI 호환 Chat Completions** 규격이다 (`src/lib/openai.ts`
`resolveAiProviderConfig()`). 우선순위: `AI_PROVIDER` 명시 → openrouter → openai → github.

- **자체 게이트웨이(hermes)**: `AI_PROVIDER=hermes`, `AI_ENDPOINT`, `AI_MODEL`,
  `HERMES_API_KEY` 설정. (홈랩 OpenAI 호환 서버)
- **Gemini**: 현재 *네이티브 Gemini provider 는 미구현*. Gemini를 쓰려면 (a) OpenRouter의
  `google/gemini-*` 모델을 `OPENROUTER_API_KEY` + `AI_MODEL` 로 사용하거나, (b) Gemini의
  OpenAI 호환 엔드포인트를 `AI_PROVIDER=openai` + `OPENAI_API_KEY` + `AI_ENDPOINT`(호환 URL)
  로 지정한다. 네이티브 Gemini 어댑터는 후속 슬라이스 항목.

---

## 5. 데이터 제공자

| 제공자 | 용도 | 비고 |
|--------|------|------|
| Yahoo Finance (`yahoo-finance2`) | 시세/지수/환율/캔들/지표/뉴스 헤드라인/펀더멘털 | 무료 = **지연** 데이터. 5~30분 캐시 |
| Frankfurter (`api.frankfurter.app`) | USD/CAD 환율 | 실패 시 `DEFAULT_FX_RATE` 폴백(명시) |
| AI 게이트웨이 (OpenAI 호환) | 뉴스 한국어 번역/분석, AI 어시스턴트 | 키 없으면 비활성(정직 상태) |

### 패널별 데이터 소스
| 패널 | 소스 | 상태 |
|------|------|------|
| 지수 스트립 / 시장개요 / 관심종목 | `/api/market/quotes` (신규) | 실(지연) |
| 캔들 차트 (+SMA/RSI/MACD/BB, 1M~10Y, 1D/1W/1M) | `/api/technical` | 실(지연) |
| 펀더멘털 | `/api/price/[ticker]` | 실(지연) |
| 섹터 | `/api/sector` + `/api/market/quotes` | 실(유도, 표기) |
| 뉴스 + 한국어 번역 | `/api/ai/news` | 실(AI 키 시 번역) |
| AI 어시스턴트 | `/api/ai/chat`, `/api/ai/insights` | AI 키 필요 |
| 포트폴리오 | `/api/v2/allocation`, `/api/snapshots`, `/api/dividend-income`, `/api/sector` | 실(보유) |
| 옵션 / 주문 / Level II / Vol | — | **API 필요**(가짜 없음) |

---

## 6. 로그인 / 보안 설계

- **단일 사용자 모드**: `src/auth.ts` → `getSingleUserSession()` 가 고정 세션을 반환한다.
  이 배포는 1인용이므로 별도 로그인 없이 모든 데이터 API가 본인 기준으로 동작한다.
  ("비로그인도 실제 시장 데이터" 요구는 단일 사용자 모드에서 자동 충족.)
- **민감 키 저장**: AI 키 등은 DB(`Setting`)에 저장 시 `src/lib/crypto.ts` 로 암호화
  (`encrypt`/`decrypt`, `isEncrypted`). 환경변수 키는 컨테이너 env로만 주입하고 git에
  커밋하지 않는다(`.env` gitignore).
- **Cron 보호**: `/api/cron/*` 는 `CRON_SECRET` Bearer 토큰 필요.
- 멀티 유저로 확장 시: NextAuth(Google) 흐름을 `auth.ts`에 재도입하고 모든 쿼리에
  `userId` 필터를 적용하면 된다(기존 코드가 이미 `userId` 스코프 기준).

> 브로커 API 키처럼 거래 권한이 있는 자격증명은 반드시 (1) DB 암호화 저장, (2) 서버
> 사이드에서만 복호화/사용, (3) 클라이언트로 절대 전송 금지, (4) 읽기전용 스코프 우선,
> (5) 키 회전 가능하게 설계한다. (브로커 연동은 7장 — 아직 구조 단계)

---

## 7. 브로커 API 연동 (설계 / 현황)

**현황**: 주문/체결/실시간 호가는 무료 실소스가 없어 현재 "API 필요" 상태로만 표시.
기존 `Questrade` 동기화(`/api/questrade/*`)가 포트폴리오 데이터 소스로 존재한다.

**연동 설계(후속 슬라이스)**: 브로커별 어댑터 인터페이스를 두고 표준화한다.
```
interface BrokerAdapter {
  listPositions(): Promise<Position[]>
  listBalances(): Promise<Balance[]>
  // (선택) placeOrder(...), streamQuotes(...)
}
```
대상: Alpaca, Interactive Brokers, 한국투자증권 Open API. 키는 6장 보안 원칙대로
암호화 저장. 수동 입력/수정은 기존 v1 거래/보유 CRUD로 이미 가능.

---

## 8. 레이아웃 커스터마이징 (현황 / 예정)

- **현황**: 좌(관심종목·섹터)/중(탭 전환 화면)/우(펀더멘털·호가·옵션) 3패널 고정 그리드.
  각 패널 내부 스크롤 + 반응형(모바일에서 세로 스택)으로 화면이 잘리지 않는다.
- **예정(후속 슬라이스)**: 패널 드래그앤드롭 재배치, 박스 리사이즈, 좌/중/우 경계 폭
  드래그 조절, 사용자별 레이아웃 저장(localStorage 또는 `Setting` 테이블).

---

## 9. 구현 현황 / 로드맵

**구현됨**: 터미널 셸(상단 메뉴/명령창/GO/지수스트립 + 3패널 + 푸터), 탭 실제 화면전환,
실데이터 패널(지수·시장·관심종목·캔들+지표·펀더멘털·섹터·뉴스·AI·포트폴리오),
정직한 데이터 상태 시스템.

**보류(후속)**: 브로커 API 연동, 드래그앤드롭/리사이즈/레이아웃 저장, 한국주식+DART,
옵션체인/Level II/Vol(실소스 확보 시), 네이티브 Gemini 어댑터, 모바일 폴리시,
포트폴리오 그래프 크게보기 모드.

설계 문서: `docs/superpowers/specs/2026-06-04-snapterminal-design.md`
