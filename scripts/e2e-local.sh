#!/usr/bin/env bash
# One-shot local completion-gate runner for Layer 5.
#
# Stands up the whole stack against a DISPOSABLE Postgres database, runs the
# Playwright browse + auth e2e (with the capture-only magic-link seam), and
# verifies the standalone web Docker image serves both locales. Everything is
# torn down on exit. Intended for a real terminal (heavy builds); it logs to a
# file so its output never floods an agent session.
#
# Usage:  bash scripts/e2e-local.sh
# Requires: Docker running, a local Postgres reachable as the current OS user.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOG="${E2E_LOG:-$ROOT/scripts/.e2e-run.log}"
: >"$LOG"
exec > >(tee -a "$LOG") 2>&1

DB_NAME="kitvera_e2e"
CONTAINER="kitvera-web-e2e"
IMAGE="kitvera-web-e2e"
CAPTURE_FILE="/tmp/kitvera-captured-magic-links.jsonl"
API_PID=""

# --- Environment (disposable/local only; test secrets are 32-byte base64url) ---
export NODE_ENV=development
export PORT=3000
DB_USER="$(id -un)"
export DATABASE_URL="postgresql://${DB_USER}@localhost:5432/${DB_NAME}?schema=public"
export CORS_ORIGIN="http://localhost:3001"
export PUBLIC_WEB_ORIGIN="http://localhost:3001"
export CATALOGUE_CURSOR_SIGNING_SECRET="YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE"
export AUTH_MAGIC_LINK_HASH_SECRET="YmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmI"
export AUTH_SESSION_HASH_SECRET="Y2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2M"
export AUTH_CSRF_HASH_SECRET="ZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGQ"
export AUTH_SOURCE_IP_HASH_SECRET="ZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWU"
export E2E_MAGIC_LINK_CAPTURE_FILE="$CAPTURE_FILE"

step() { echo ""; echo "=== $* ==="; }
fail() { echo "!!! FAILED: $*"; exit 1; }

cleanup() {
  step "TEARDOWN"
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$ROOT/.dockerignore" 2>/dev/null || true
  dropdb --if-exists "$DB_NAME" 2>/dev/null || true
  echo "teardown done"
}
trap cleanup EXIT

wait_http() { # url label max_seconds
  local url="$1" label="$2" max="${3:-40}" i=0
  while [ "$i" -lt "$max" ]; do
    if curl -sf -o /dev/null "$url"; then echo "$label up ($url)"; return 0; fi
    sleep 1; i=$((i + 1))
  done
  return 1
}

# --- 1. Fresh disposable database -------------------------------------------
step "1/9 recreate disposable database ($DB_NAME)"
dropdb --if-exists "$DB_NAME" || true
createdb "$DB_NAME" || fail "createdb"
rm -f "$CAPTURE_FILE"

# --- 2. Build API (also runs shared build + prisma generate) ----------------
step "2/9 build API"
pnpm --filter @marketplace/api build || fail "api build"

# --- 3. Migrate + seed -------------------------------------------------------
step "3/9 migrate + seed"
pnpm --filter @marketplace/api exec prisma migrate deploy || fail "migrate deploy"
node "$ROOT/apps/api/prisma/seed-e2e.mjs" || fail "seed"

# --- 4. Serve API on :3000 ---------------------------------------------------
step "4/9 start API"
API_ENTRY="$ROOT/apps/api/dist/main.js"
[ -f "$API_ENTRY" ] || API_ENTRY="$ROOT/apps/api/dist/src/main.js"
[ -f "$API_ENTRY" ] || fail "API entry not found under apps/api/dist"
node "$API_ENTRY" &
API_PID=$!
wait_http "http://localhost:3000/v1/categories?locale=vi" "API" 40 || fail "API health"

# --- 5. Build web standalone Docker image (also = i18n Docker gate) ----------
step "5/9 docker build web image"
cp apps/web/.dockerignore .dockerignore
docker build --file apps/web/Dockerfile --tag "$IMAGE" . || fail "docker build web"

# --- 6. Serve web container on :3001 ----------------------------------------
step "6/9 start web container"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -p 3001:3000 \
  -e API_ORIGIN="http://host.docker.internal:3000" "$IMAGE" || fail "docker run web"
wait_http "http://localhost:3001/vi" "web" 60 || { docker logs "$CONTAINER" | tail -40; fail "web health"; }

# --- 7. i18n gate: both locales serve localized HTML, not a 500 -------------
step "7/9 i18n check (/vi and /en)"
vi_ok=$(curl -s http://localhost:3001/vi | grep -c 'lang="vi"' || true)
en_ok=$(curl -s http://localhost:3001/en | grep -c 'lang="en"' || true)
echo "vi lang match=$vi_ok  en lang match=$en_ok"
[ "$vi_ok" -ge 1 ] && [ "$en_ok" -ge 1 ] || fail "i18n locale rendering"
echo "i18n Docker gate: PASS"

# --- 8. Install browser ------------------------------------------------------
step "8/9 install chromium"
pnpm --filter @marketplace/web exec playwright install chromium || fail "playwright install"

# --- 9. Run e2e (browse across viewports + auth on one viewport) ------------
step "9/9 playwright e2e"
E2E_BASE_URL="http://localhost:3001" \
  pnpm --filter @marketplace/web exec playwright test
PW=$?

echo ""
echo "=== RESULT ==="
if [ "$PW" -eq 0 ]; then
  echo "E2E: PASS   i18n Docker gate: PASS"
  echo "GATE_OVERALL: PASS"
else
  echo "E2E: FAIL (playwright exit $PW)   i18n Docker gate: PASS"
  echo "GATE_OVERALL: FAIL"
fi
exit "$PW"
