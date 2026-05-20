---
name: deploy
description: DividendTracker Docker Compose 배포 자동화. "배포해줘", "올려줘", "반영해줘", "docker 재시작", "compose up", "서버에 올려" 요청 시 반드시 이 스킬을 사용할 것. 빌드 → 마이그레이션 확인 → compose up → health check 순서로 실행한다. 코드 변경 후에는 항상 이 스킬로 배포를 완료해야 한다.
---

# DividendTracker 배포 스킬

## 프로젝트 경로

```
/mnt/fast_data/docker/apps/DividendTracker/
```

## 표준 배포 절차

코드 변경 후 항상 이 순서로 실행한다:

```bash
# 1. 프로젝트 디렉토리
cd /mnt/fast_data/docker/apps/DividendTracker

# 2. docker compose 빌드 + 재시작
docker compose up --build -d

# 3. 컨테이너 상태 확인
docker compose ps

# 4. 앱 로그 확인 (에러 여부)
docker compose logs app --tail=50

# 5. Health check
curl -sf http://localhost:3000/api/health && echo "✓ Health OK" || echo "✗ Health FAILED"
```

## 마이그레이션 포함 배포

Prisma 스키마(`schema.prisma`)가 변경된 경우:

```bash
cd /mnt/fast_data/docker/apps/DividendTracker

# 마이그레이션 먼저 적용
docker compose exec app npx prisma migrate deploy

# 마이그레이션 상태 확인
docker compose exec app npx prisma migrate status

# 그 다음 앱 재시작
docker compose up --build -d
```

**주의**: `DROP TABLE`, `DROP COLUMN` 같은 파괴적 마이그레이션은 실행 전 사용자 확인 필수.

## 배포 확인 체크리스트

- [ ] `docker compose ps` → app, db 모두 `Up` 상태
- [ ] `curl http://localhost:3000/api/health` → 200 응답
- [ ] `docker compose logs app --tail=20` → 에러 없음
- [ ] TypeScript 빌드 에러 없음 (빌드 로그 확인)

## 빠른 재시작 (코드 무변경)

```bash
cd /mnt/fast_data/docker/apps/DividendTracker
docker compose restart app
```

## 롤백

```bash
cd /mnt/fast_data/docker/apps/DividendTracker
docker compose down
git revert HEAD --no-edit
docker compose up --build -d
```

## 주의사항

- `docker compose down -v` 절대 실행 금지 (DB 데이터 삭제됨)
- `docker compose down`은 안전 (DB volume은 유지됨)
- 배포 실패 시: 빌드 에러 → developer에게 로그 전달 후 수정 요청
