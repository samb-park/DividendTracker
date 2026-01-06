#!/bin/sh
set -e

# Initialize database if it doesn't exist
if [ ! -f /app/data/questrade.db ]; then
  echo "Initializing database..."
  cp /app/init.db /app/data/questrade.db
fi

echo "Starting application..."
# Ensure database schema is up to date
npx prisma db push --skip-generate

exec "$@"
