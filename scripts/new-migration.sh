#!/usr/bin/env bash
# Creates a migration by diffing the live dev database (DIRECT_URL) against prisma/schema.prisma.
# Used instead of `prisma migrate dev`, whose shadow-database replay can't run our role/RLS migrations.
#   npm run db:new-migration -- add_attendance
set -euo pipefail
name="${1:?usage: npm run db:new-migration -- <name>}"
set -a; [ -f .env ] && . ./.env; set +a
dir="prisma/migrations/$(date -u +%Y%m%d%H%M%S)_${name}"
mkdir -p "$dir"
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script > "$dir/migration.sql"
# Hand-written indexes Prisma can't model (pg_trgm GIN, partial uniques) must never be dropped by a diff.
python3 - "$dir/migration.sql" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
s = re.sub(r'-- DropIndex\nDROP INDEX "(?:[a-z_]+_trgm|timetable_entries_teacher_slot)";\n\n?', '', s)
open(p, 'w').write(s)
PY
echo "Created $dir/migration.sql — review it, add RLS/grants for new tables, then run: npx prisma migrate deploy"
