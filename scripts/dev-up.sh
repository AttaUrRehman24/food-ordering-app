#!/usr/bin/env bash
# =============================================================================
# Plate&Go — one-file local setup & run
# =============================================================================
# Usage:
#   chmod +x scripts/dev-up.sh
#   ./scripts/dev-up.sh              # full: infra + migrate + seed + start all
#   ./scripts/dev-up.sh infra        # docker compose only
#   ./scripts/dev-up.sh migrate      # run TypeORM migrations
#   ./scripts/dev-up.sh seed         # admin (on identity boot) + catalog food seed
#   ./scripts/dev-up.sh start        # start all app processes
#   ./scripts/dev-up.sh stop         # stop app processes (not docker)
#   ./scripts/dev-up.sh status       # health check ports
#   ./scripts/dev-up.sh help
#
# Prerequisites: Node 20+, npm, Docker (or Colima), git
# Docs: README.md | docs/SETUP.md | docs/API.md
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LOG_DIR="${ROOT}/.dev-logs"
mkdir -p "$LOG_DIR"

export OTEL_SDK_DISABLED="${OTEL_SDK_DISABLED:-true}"
export CATALOG_SEED_ON_BOOT="${CATALOG_SEED_ON_BOOT:-false}"
export NX_DAEMON=false

load_env() {
  if [[ ! -f .env ]]; then
    echo "==> Creating .env from .env.example"
    cp .env.example .env
    echo "    Edit .env for SMTP (optional) and secrets, then re-run."
  fi
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  unset SERVICE_NAME HTTP_PORT GRPC_PORT || true
}

ensure_deps() {
  if [[ ! -d node_modules ]]; then
    echo "==> npm install"
    npm install
  fi
}

cmd_infra() {
  echo "==> Starting Docker infra (Postgres, Redis, Kafka, MinIO)"
  if command -v colima >/dev/null 2>&1; then
    if ! colima status >/dev/null 2>&1; then
      echo "    Starting Colima..."
      colima start --cpu 4 --memory 8 || true
    fi
  fi
  npm run infra:up
  echo "    Waiting for Postgres..."
  for i in $(seq 1 30); do
    if docker exec food-ordering-postgres pg_isready -U food >/dev/null 2>&1; then
      echo "    Postgres ready"
      return 0
    fi
    sleep 2
  done
  echo "WARN: Postgres health check timed out — continuing anyway"
}

cmd_migrate() {
  load_env
  echo "==> Running migrations"
  npm run identity:migration:run
  npm run catalog:migration:run
  npm run cart:migration:run
  npm run order:migration:run
  npm run notification:migration:run
}

cmd_seed() {
  load_env
  export CATALOG_SEED_RESET="${CATALOG_SEED_RESET:-true}"
  export CATALOG_SEED_PRODUCT_COUNT="${CATALOG_SEED_PRODUCT_COUNT:-36}"
  echo "==> Seeding catalog (food menu, PKR)"
  npm run catalog:seed
  echo "    Admin user is seeded when Identity starts (ADMIN_* in .env)"
}

start_one() {
  local name="$1"
  local port="$2"
  local tsconfig="apps/${name}/tsconfig.app.json"
  local main="apps/${name}/src/main.ts"
  if [[ "$name" == "web" ]]; then
    echo "    starting web → :3000"
    nohup npm run serve:web >"${LOG_DIR}/web.log" 2>&1 &
    echo $! >"${LOG_DIR}/web.pid"
    return
  fi
  echo "    starting ${name} → :${port}"
  nohup ./node_modules/.bin/ts-node --transpile-only -r tsconfig-paths/register \
    -P "$tsconfig" "$main" >"${LOG_DIR}/${name}.log" 2>&1 &
  echo $! >"${LOG_DIR}/${name}.pid"
}

cmd_stop() {
  echo "==> Stopping app processes"
  if [[ -d "$LOG_DIR" ]]; then
    for pidfile in "$LOG_DIR"/*.pid; do
      [[ -f "$pidfile" ]] || continue
      pid="$(cat "$pidfile" 2>/dev/null || true)"
      if [[ -n "${pid}" ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$pidfile"
    done
  fi
  pkill -f 'apps/(identity|catalog|cart|order|notification|realtime|gateway)/src/main.ts' 2>/dev/null || true
  pkill -f 'next dev apps/web' 2>/dev/null || true
  echo "    Done (Docker infra left running — npm run infra:down to stop)"
}

cmd_start() {
  load_env
  ensure_deps
  cmd_stop
  sleep 1
  echo "==> Starting services"
  start_one identity 3002
  start_one catalog 3003
  start_one cart 3004
  start_one order 3005
  start_one notification 3006
  start_one realtime 3007
  start_one gateway 3001
  start_one web 3000
  echo "    Waiting for gateway..."
  for i in $(seq 1 40); do
    if curl -sf http://localhost:3001/health/live >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  cmd_status
  cat <<EOF

==> Plate&Go is up
  Web:     http://localhost:3000
  API:     http://localhost:3001/v1
  Swagger: http://localhost:3001/api/docs
  Admin:   admin@foodordering.local / ChangeMe_Admin_Seed_Only
  Logs:    ${LOG_DIR}/

EOF
}

cmd_status() {
  echo "==> Health"
  for pair in "3000:web" "3001:gateway" "3002:identity" "3003:catalog" "3004:cart" "3005:order" "3006:notification" "3007:realtime"; do
    port="${pair%%:*}"
    name="${pair##*:}"
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${port}/health/live" 2>/dev/null || echo 000)"
    if [[ "$port" == "3000" ]]; then
      code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000/" 2>/dev/null || echo 000)"
    fi
    printf "  %-14s :%s  %s\n" "$name" "$port" "$code"
  done
}

cmd_help() {
  sed -n '2,20p' "$0"
}

cmd_all() {
  ensure_deps
  load_env
  cmd_infra
  cmd_migrate
  cmd_seed
  cmd_start
}

ACTION="${1:-all}"
case "$ACTION" in
  all) migrate_first=1; cmd_all ;;
  infra) cmd_infra ;;
  migrate) load_env; ensure_deps; cmd_migrate ;;
  seed) load_env; ensure_deps; cmd_seed ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  help|-h|--help) cmd_help ;;
  *) echo "Unknown action: $ACTION"; cmd_help; exit 1 ;;
esac
