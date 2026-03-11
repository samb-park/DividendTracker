#!/bin/sh
set -e

# Set HOME to a writable directory for npx/npm cache
export HOME=${HOME:-/app/data}
mkdir -p "$HOME"

echo "Ensuring database schema is up to date..."
node ./node_modules/prisma/build/index.js db push

echo "Starting application..."
exec "$@"
