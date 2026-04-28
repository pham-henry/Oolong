#!/bin/sh
set -e

echo "▶ Syncing database schema..."
# db push is idempotent: creates tables on first run, no-ops on subsequent runs.
# It does not require committed migration files, keeping the demo setup simple.
npx prisma db push --schema /app/server/prisma/schema.prisma --accept-data-loss

if [ "${SEED_DB:-false}" = "true" ]; then
  echo "▶ Seeding database..."
  cd /app/server && npx prisma db seed
fi

echo "▶ Starting server on port ${PORT:-5000}..."
exec node /app/server/dist/index.js
