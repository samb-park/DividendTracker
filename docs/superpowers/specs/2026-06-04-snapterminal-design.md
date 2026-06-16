# SnapTerminal — Bloomberg-style 고밀도 금융 터미널 (설계)

날짜: 2026-06-04
브랜치: feat/rulebook-v4-5-0-sync
상태: 설계 확정, 1차 슬라이스 구현 시작

## 1. 목표 (사용자 요구 요약)

미국주식 투자자를 위한 한국어 기반 고밀도 금융 터미널 UI를 만든다. 첨부된
"SnapTerminal" 목업처럼 상단 글로벌 메뉴 + 명령창 + 지수 스트립, 좌/중/우 3패널의
드래그/리사이즈 가능한 박스 레이아웃, 실제로 화면이 전환되는 내부 탭(시장·모니터·차트·
뉴스·포트·옵션·주문·AI)을 갖춘다. 시장 데이터·뉴스/번역·AI 어시스턴트·차트·포트폴리오·
로그인/개인설정·모바일 모드까지 포함하는 것이 최종 비전.

## 2. 핵심 결정 (확정)

### 2.1 기존 앱을 대체하지 않는다 — 추가형 surface

DividendTracker는 사용자의 **실사용 개인 은퇴 투자 도구**(기계적 룰북 시스템, 단일
사용자)다. v1(모바일 탭)·v2(그래프)는 절대 건드리지 않는다. SnapTerminal은
`src/app/terminal/` 아래 **독립된 새 surface**로 만들고, 기존 백엔드 API를 재사용한다.

근거: 동작 중인 도구를 교체하는 것은 비가역적 위험. 추가형이 안전하고, 데이터 백엔드가
이미 존재하므로 비용도 낮다.

### 2.2 가짜 데이터 절대 금지 (가장 강한 제약)

사용자 요구사항이 3회 반복: 데이터가 없으면 가짜 숫자로 채우지 말 것. 목업 스크린샷의
Level II / Options Flow / Vol Surface / Cross Asset Matrix / Scenario Lab 의
숫자들은 **조작된 예시**이며 절대 재현하지 않는다.

규칙: 실제 데이터 소스가 없는 패널은 **반드시** 다음 4상태 중 하나로 표시한다.
- `LOADING` — 불러오는 중
- `DELAYED` — 지연 데이터 (예: Yahoo 무료, 캐시됨)
- `API_REQUIRED` — 연동/키 필요 ("API 필요")
- `NO_DATA` — 데이터 없음

공유 프리미티브 `<PanelState>` 가 이 4상태를 표준 렌더링한다. 백엔드 없는 모든 패널은
이걸 쓴다. 가짜 숫자로 채우지 않는다.

### 2.3 인증 — 단일 사용자 모드로 이미 해결됨

`src/auth.ts` 의 `auth()` 는 `getSingleUserSession()` 을 무조건 반환한다. 따라서
기존 데이터 API(`/api/technical`, `/api/price`, `/api/market`, `/api/fx`, `/api/sector`,
`/api/search`, `/api/ai/*`)는 로그인 없이도 이 배포에서 동작한다. "비로그인도 실제
시장 데이터" 요구는 단일 사용자 모드에서 자동 충족. 1차 슬라이스에 인증 작업 불필요.

### 2.4 디자인 시스템 — 이미 터미널 미학

기존 globals.css/tailwind가 이미: IBM Plex Mono 고정폭, 다크(#0d0d0d), green primary
(142 69% 58%) / amber accent (38 92% 55%), scanline 오버레이, 2px 라운드, `.text-positive`/
`.text-negative`. 목업은 이 미학의 **데스크톱 고밀도 레이아웃**일 뿐. 새 토큰 거의 불필요,
기존 CSS 변수 재사용.

## 3. 아키텍처

```
src/app/terminal/
  layout.tsx          # 터미널 셸: 상단바(메뉴+명령창+지수스트립) + 3패널 그리드
  page.tsx            # 탭 라우팅 상태, 중앙 콘텐츠 스왑
src/components/terminal/
  terminal-shell.tsx      # 클라이언트 셸 (탭 상태, 레이아웃 그리드)
  top-bar.tsx             # 브랜드 + 메뉴탭 + 명령/GO + 지수 스트립
  index-strip.tsx         # 지수 스트립 (실데이터)
  panel.tsx               # 패널 컨테이너 (제목바 + 본문 스크롤)
  panel-state.tsx         # <PanelState> 4상태 공유 프리미티브 (정직한 상태)
  panels/
    candle-chart-panel.tsx   # 캔들+거래량+SMA+RSI (실데이터: /api/technical)
    market-pulse-panel.tsx   # (후속) /api/market, /api/sector
    ...                      # 나머지 패널은 후속 슬라이스
src/app/api/market/indices/route.ts   # (신규) 지수 묶음 실시세 + 정직한 fallback
```

데이터 흐름: 클라이언트 패널 → 기존/신규 API 라우트 → yahoo-finance2 / Frankfurter
(캐시 TTL 존재) → JSON. 패널은 fetch 결과의 상태(성공/지연/실패)를 `<PanelState>`로 표현.

차트 렌더링: `echarts-for-react` (이미 설치, 미사용) 로 캔들스틱+거래량+RSI 서브차트.

## 4. 1차 슬라이스 (이번에 구현 — 패널 계약 확립)

목표: 셸 + 실데이터 패널 2~3개로 "패널 계약"을 증명한다. 그 다음 슬라이스에서 나머지를
병렬 확장.

1. **터미널 셸** (`/terminal`)
   - 상단바: 브랜드 + 메뉴탭(시장/모니터/차트/뉴스/포트/옵션/주문/AI) + 명령/GO + 지수 스트립
   - 좌/중/우 3패널 CSS 그리드, 각 패널 내부 스크롤, 반응형(화면 안 잘림)
   - 탭 클릭 시 **실제로** 중앙 콘텐츠 전환
2. **지수 스트립 (실데이터)**: 신규 `/api/market/indices` → ^GSPC/^IXIC/^DJI/^NDX 실시세
   + USD/CAD(getFxRate). 실패 시 정직한 fallback 표기.
3. **캔들 차트 패널 (실데이터)**: `/api/technical?ticker=&range=` 소비. echarts 캔들스틱
   + 거래량 + SMA50/200 + RSI 서브차트. range 전환(1m/3m/6m/1y/2y/5y) 실제 동작.
4. **`<PanelState>` 정직한 상태 프리미티브**: 백엔드 없는 패널(옵션/Level II/Vol 등)은
   "API 필요" 상태로 렌더 — 가짜 숫자 금지.

검증 기준(1차): `npm run typecheck` 통과, docker 배포 후 `/terminal` 진입 시 지수 스트립과
캔들 차트가 실제 데이터로 그려지고 range 전환이 동작, 백엔드 없는 패널은 "API 필요"로 표시.

## 5. 후속 슬라이스 (이번엔 보류 — 설계에만 기록)

- 차트 고도화: MACD + Bollinger Band + 인터벌(1D/1W/1M) + 10y → `/api/technical` 확장
- 뉴스+번역 패널: `/api/ai/news` 연동 (원문+한국어+감성+티커+중요도)
- AI 어시스턴트 패널: **hermes** 게이트웨이 경유(= 다중 모델 선택 게이트웨이로 추정,
  구현 전 확인 필요). 키 없으면 로컬 규칙 기반 요약 fallback.
- 시장 패널군: Sector Map(`/api/sector`), Watch Grid, Market Pulse
- 포트폴리오 패널: 기존 portfolio engine/holdings 재사용 (평가금액/손익/비중/섹터·국가·통화
  비중/배당예상/리밸런싱)
- 브로커 API 연동 구조: Alpaca / IBKR / 한국투자증권 (어댑터 인터페이스 + 키 보안 문서)
- 드래그앤드롭 + 리사이즈 + 패널 폭 조절 + **사용자별 레이아웃 저장**
- 한국 주식 + DART 공시
- 옵션 체인 / Level II / Vol Surface — 실제 소스 확보 전까지 "API 필요" 유지
- 모바일 터미널 모드
- 문서: README 실행/배포/API키/데이터 정책/보안 설계

각 후속 항목은 자체 슬라이스(설계→구현→검증→배포)로 진행.

## 6. 워크플로우 / 리스크

- 작업 순서(프로젝트 규칙): git pull → 구현 → typecheck → commit/push → docker compose up -d --build → health check
- 브랜드 컬러 #0a8043 계열(green) 유지, `any` 금지, Tailwind 사용, 인라인 스타일 지양
- 리스크: Yahoo 무료 API 레이트리밋/지연 → `DELAYED` 상태와 캐시 TTL로 정직하게 표기
- 리스크: echarts SSR → 패널은 `"use client"` + 동적 import 필요시 적용

## 7. 적대적 리뷰(2026-06-04) — 수정/보류

15-에이전트 리뷰 워크플로 결과 12건 제기 / 11건 확정.

**수정 완료:**
- (rule #1 가짜데이터) `getPrice`가 시세 누락 시 0으로 날조 → `regularMarketPrice == null`이면
  null 반환. 펀더멘털/캔들 헤더가 0.00 대신 정직 상태 표시. 52주값 0이면 "—".
- (런타임/누수) 레이아웃 훅: pointercancel 처리 + 언마운트 cleanup, localStorage는 드래그
  종료 시 1회만 저장(틱마다 쓰기 제거).
- (레이아웃) 우측 컬럼 펀더멘털 패널 flex-shrink-0 → flex-1 lg:min-h-0 (짧은 뷰포트 클립 방지).

**보류(낮은 우선순위 — 후속):**
- 접근성: 리사이저/관심종목 행 키보드 조작(tabIndex/onKeyDown/aria-value*). (작업지시상 a11y low)
- 정직성(real-but-stale): 폴링 실패 시 마지막 시세 유지 → `asOf`/신선도 배지 노출.
- 방어: `useQuotes` refreshMs 의존성(현재 영향 없음, 동적 symbols 시 useMemo 안정화).
```
