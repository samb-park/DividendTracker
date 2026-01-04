#!/bin/sh
set -e

echo "Running database migrations..."
node -e "const { execSync } = require('child_process'); execSync('node node_modules/prisma/build/index.js db push --skip-generate', { stdio: 'inherit' });"

echo "Starting application..."
exec "$@"
