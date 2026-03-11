# DividendTracker

Dividend tracking app backed by Prisma.

## Database

This app now targets **PostgreSQL** via Prisma.

Set `DATABASE_URL` before running the container:

```env
DATABASE_URL=postgresql://appuser:YOUR_PASSWORD@app-postgres:5432/appdb?schema=public
```

## Docker

```bash
docker compose up -d --build
```

The container runs `prisma db push` on startup to ensure the schema exists.

## Migrating existing SQLite data to Postgres

If you have an existing SQLite-backed container with data, first copy the DB out:

```bash
docker cp dividendtracker:/app/data/questrade.db /tmp/questrade.db
```

Then run:

```bash
python3 scripts/migrate_sqlite_to_postgres.py
```

Optional environment overrides:

```bash
SQLITE_PATH=/tmp/questrade.db \
PG_CONTAINER=app-postgres \
PGUSER=appuser \
PGDATABASE=appdb \
python3 scripts/migrate_sqlite_to_postgres.py
```
