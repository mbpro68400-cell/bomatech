#!/usr/bin/env bash
# Loads demo data into the local Supabase instance.
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"

echo "→ Seeding demo data into $DB_URL"
psql "$DB_URL" < "$(dirname "$0")/../database/seeds/demo_data.sql"
echo "✓ Done"
