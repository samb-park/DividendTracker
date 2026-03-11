# DividendTracker deployment notes

## Current state

- App container: `dividendtracker`
- App image: `dividend-app:postgres`
- Database container: `app-postgres`
- Database name: `dividendtracker`
- Database user: `dividendtracker`
- App runtime DB: PostgreSQL via `DATABASE_URL`

## Recommended compose workflow

Use the repo-local `.env` file:

```env
DATABASE_URL=postgresql://dividendtracker:<PASSWORD>@app-postgres:5432/dividendtracker?schema=public
```

Bring up / rebuild:

```bash
docker run --rm --network host hello-world >/dev/null 2>&1 || true
docker build -t dividend-app:postgres .
docker rm -f dividendtracker || true
docker run -d \
  --name dividendtracker \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e HOME=/app/data \
  --env-file .env \
  -v dividend_app-data:/app/data \
  --network homelab \
  dividend-app:postgres

docker network connect dividend_default dividendtracker || true
```

## Validation

Check logs:

```bash
docker logs -f dividendtracker
```

Expected line:

```text
Datasource "db": PostgreSQL database "dividendtracker", schema "public" at "app-postgres:5432"
```

API check from inside container:

```bash
docker exec dividendtracker node -e "fetch('http://127.0.0.1:3000/api/accounts').then(async r=>{console.log(r.status); console.log((await r.text()).slice(0,300))})"
```

## Legacy SQLite volume

Old volume:
- `dividend_sqlite-data`

It still contains the old `questrade.db` backup and can be kept briefly for rollback confidence.
If you no longer need rollback, remove it with:

```bash
docker volume rm dividend_sqlite-data
```

## Notes

- Startup uses `prisma db push --skip-generate`
- `.dockerignore` was added to avoid huge Docker build contexts
- Host-side port checks to `127.0.0.1:3000` may vary depending on the runtime/network environment; container-internal API checks are reliable
