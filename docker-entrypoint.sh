#!/bin/sh
set -e

# Set HOME to a writable directory for npx/npm cache
export HOME=${HOME:-/app/data}
mkdir -p "$HOME"

echo "Ensuring database schema is up to date..."
if [ -d "./prisma/migrations" ] && [ "$(ls -A ./prisma/migrations)" ]; then
  node ./node_modules/prisma/build/index.js migrate deploy
else
  echo "No migrations found, using db push for initial setup..."
  node ./node_modules/prisma/build/index.js db push --skip-generate
fi

echo "Starting application..."
exec "$@"
