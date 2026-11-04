#!/usr/bin/env bash
# Vercel build (demo/dev only, decision D8). Vercel runs `npm run vercel-build` instead of `npm run build`.
# Prepares the database, then builds the app, so a deployment needs no manual commands:
#   1. apply migrations (owner connection, DIRECT_URL)
#   2. create/refresh the two runtime login roles (DB_APP_PASSWORD, DB_SYSTEM_PASSWORD)
#   3. load demo accounts when DEMO_SEED=true
#   4. next build
set -euo pipefail

for v in DATABASE_URL SYSTEM_DATABASE_URL DIRECT_URL DB_APP_PASSWORD DB_SYSTEM_PASSWORD CRON_SECRET; do
  if [ -z "${!v:-}" ]; then
    echo "✗ Missing environment variable $v. See README → Deployment." >&2
    exit 1
  fi
done

npx prisma generate
npx prisma migrate deploy
npx tsx scripts/db-setup-roles.ts

if [ "${DEMO_SEED:-}" = "true" ]; then
  npx tsx prisma/seed.ts
else
  echo "Skipping demo seed (DEMO_SEED is not 'true')."
fi

npx next build
