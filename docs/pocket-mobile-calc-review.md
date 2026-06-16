# /pocket — 모바일 최적화 리뷰 + 배당 계산 정확성 검증

작성: 2026-06-09 · 보완 대상: [pocket-uiux-review.md](pocket-uiux-review.md) (2026-06-08, 4-관점 종합)
이번 리뷰는 ① 기존 문서에 없던 **모바일 사용성 관점** ② **계산 로직 수학 검증**(코드 추적 + DB 실데이터 대조)에 집중.

> 기존 리뷰 P0/P1 18개 항목은 **전부 미수정 상태** 확인 (06-08 이후 src 변경 커밋 없음).

---

## A. 배당 계산 검증 — 발견된 버그

### [높음] H1. 빈도 감지가 전체 히스토리 평균 → QLD run-rate 정확히 ½로 과소 (실데이터 확인)
- `src/lib/dividend-utils.ts:10-18` — `detectFrequency()`가 수년치 지급 간격 **단순 평균**으로 판정. QLD는 과거 불규칙 이력 탓에 평균 6.34개월 → 반기(freq=2) 오판. 실제는 분기 지급(ex 2025-12-24 → 2026-03-25 → 2026-06-25).
- 영향: QLD 139.52주 기준 NET 연간 $3.32 표시 (정답 $6.64). Hero D/W/M/Y, Dividend 도넛, YIELD 모두 동반 과소.
- 수정: 최근 12~18개월 간격만 사용 or **중앙값(median)** 판정 — 특별배당 왜곡도 함께 방어.

### [높음] H2. `nextFutureDate()` 월말 오버플로 — 날짜 드리프트 + 회차 건너뜀
- `src/lib/pocket-dividend-dates.ts:28-33` — `setUTCMonth(+interval)`이 31일 앵커에서 오버플로(1/31+1M=3/3). 시뮬레이션: 월배당 ex 5/31 → 임박한 6/30 회차를 건너뛰고 7/1 표시.
- 영향: Upcoming 추정 날짜 수일 어긋남, 월말 지급 종목은 다음 회차 미표시 가능. cron 알림(`/api/cron/dividend-events`)도 동일 함수 사용.
- 수정: 원래 day-of-month 기억 후 매 스텝 `min(day, 말일)` 클램프.

### [중간] H3. `netFactor`가 미 국채 ETF(QII 면제) 무시 — SGOV에 15% 잘못 가정 (실데이터 확인)
- `src/lib/dividend-withholding.ts:33` — "US+TFSA → 0.85" 일괄. 실데이터: SGOV는 TFSA/RRSP 퍼셰어 동일(0.298…) = 원천징수 0. SCHD는 정확히 15% 공제 확인(모델 맞음).
- 영향: 현재 SGOV는 RRSP만이라 hero 무영향. 단 `/api/dividend-income`(route.ts:193-194)의 gross 역산(`net/0.85`)이 과거 TFSA SGOV gross를 ~17.6% 과대 표시.
- 수정: QII ETF 예외 목록(SGOV/BIL/USFR 등).

### [중간] H4. 캐나다(.TO) 티커 가드 소실 (잠재)
- `src/lib/nasdaq-dividend.ts:36-37,99-100` — `isCanadian` 계산만 하고 `void`로 버림. .TO를 떼고 미국 상장 페이지를 조회 → USD 금액이 CAD로 라벨(`pocket-dividend-dates.ts:79`) → ~28% 과소. 현재 보유 전부 USD 상장이라 무영향, .TO 재보유 시 즉시 발현.
- 수정: isCanadian이면 이 소스 스킵 → Yahoo 폴백.

### [낮음]
- **L1.** 클라이언트 FX fallback `?? 1.39` 하드코딩(서버 1.35와 불일치, 경고 없음) — `history-view.tsx:135`, `cash-flow-view.tsx:116`, `transaction-view.tsx:125`
- **L2.** 티커 그룹 필터가 Received/Trades/Cash엔 미적용(계좌만) — 의도 설계(`history-tab.tsx:15-16`)지만 탭 간 모수 불일치, UI 표시 권장
- **L3.** 도넛 % 개별 반올림 → 합 ≠ 100% 가능(`pocket-donut.tsx:21-24`) — largest-remainder 보정
- **L4.** 소스 "estimated" 미래 행이 시계 아이콘 없이 확정처럼 표시(`pocket-dividend-dates.ts:83-86`)
- **L5.** Trades "All" 합계 무부호 합산(기존 P0-2와 동일)

### 정확성 확인된 항목 ✓
D/W/M/Y 분할(÷365/52/12/1), SCHD 원천징수(TFSA 0.85 = 브로커 실수령 완벽 일치, RRSP 1.0), 월배당 4종 빈도 검출, FX 양방향 변환·서버 fallback 경고, Received 합산(DRIP 중복 없음, 연/월 경계 off-by-one 없음), YIELD 분자/분모 통화 일치, 도넛 top6+Other·중심값, 다계좌 동일 티커 합산.

---

## B. 모바일 최적화 — 신규 발견 (기존 문서 미포함분)

### P1
- **M1. 헤더 피커 탭 타깃 21~34px** (44px 미달) — `pocket.css:191-198,1076-1077` 가장 자주 누르는 컨트롤. padding 확대+음수 margin으로 시각 변화 0 가능.
- **M2. 시트+iOS 키보드 충돌** — `group-manager.tsx:314` autoFocus로 키보드가 시트 하단 절반을 가림. visualViewport 처리 전무.
- **M3. 다크모드 콜드런치 흰 화면 플래시** — manifest `background_color: #ffffff` + iOS 스플래시 이미지 없음.
- **M4. SwipePager 전 페이지 eager 마운트** — `swipe-pager.tsx:199-203` Trades 최대 13페이지×연간 전체 행 렌더. active±1만 렌더 권장.
- **M5. 설치형 PWA에 수동 새로고침 수단 없음** — pull-to-refresh 차단 + 리로드 버튼 없음 → stale 데이터 복구 불가(에러 시에만 Retry).

### P2
- M6. 핀치줌 차단(`userScalable:false`, WCAG 1.4.4) · M7. 탭 재진입마다 전체 refetch+텍스트 로딩(레이아웃 시프트) · M8. manifest 아이콘 maskable 부재/사이즈 불일치 · M9. 오프라인 완전 빈 페이지(navigation만 network-first 권장) · M10. 가로 페이징 중 세로 스크롤 동시 발생(preventDefault 없음) · M11. 시스템 back과 비통합(시트 열림 시 back=앱 이탈) · M12. 가로모드 무대응 · M13. 금액 long-press 복사 불가(user-select:none 전면) · M14. Activity 모드 스위치 30px

### 잘 된 점 ✓
safe-area 4면 일관 처리, standalone 탭바 인셋, 오버스크롤 차단 설계, 테마 무플래시 부트스트랩, 순수 #000 OLED 다크, 시스템 폰트(웹폰트 0).

---

## C. 권장 수정 순서

**계산 (정확성 — 우선)**: H1 빈도 median → H2 월말 클램프 → H4 .TO 가드 복원(한 줄) → H3 QII 예외 → L1 fallback 통일
**모바일 quick wins**: M1 히트영역 44px → M2 autoFocus 제거(한 단어) → M6 userScalable 제거 → M8 manifest 아이콘 → M4 lazy 렌더
**기존 문서 P0**: D/W/M/Y 캡션+통화기호, Trades All 합계 — 여전히 최우선 후보
