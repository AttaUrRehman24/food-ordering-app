# Manual setup guide (without one-file script)

Use this when you want full control. For the automated path see [`scripts/dev-up.sh`](../scripts/dev-up.sh) and the [root README](../README.md).

Related: [API docs](API.md) · [Documentation index](README.md) · [`.env.example`](../.env.example)

---

## 1. Prerequisites

| Tool | Notes |
|------|--------|
| Node.js **20+** | `node -v` |
| npm 10+ | Comes with Node |
| Docker | Docker Desktop **or** Colima (`colima start --cpu 4 --memory 8`) |
| Git | Clone the repo |

Optional: Gmail App Password for real OTP email (`SMTP_*`).

---

## 2. Install dependencies

```bash
cd FoodDeliveryApp
cp .env.example .env
npm install
```

Edit `.env` before first run (see [§4 Environment variables](#4-environment-variables)).

---

## 3. Start infrastructure

```bash
npm run infra:up
# optional observability stack:
# npm run infra:observability
```

Wait until healthy:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
```

Expected: `food-ordering-postgres`, `redis`, `kafka`, `minio` — healthy.

Stop infra later: `npm run infra:down`.

---

## 4. Environment variables

Copy from [`.env.example`](../.env.example). **Do not set** `SERVICE_NAME`, `HTTP_PORT`, or `GRPC_PORT` in `.env` when running multiple services — each app uses its own defaults.

### Core

| Variable | Example | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | Runtime mode |
| `DATABASE_URL` | `postgres://food:food@localhost:5432/food_ordering` | Shared Postgres |
| `REDIS_URL` | `redis://localhost:6379` | Cache / OTP / cart / rate limits |
| `KAFKA_BROKERS` | `localhost:9092` | Event bus |
| `KAFKA_CLIENT_ID` | `food-ordering-local` | Kafka client id |
| `TYPEORM_LOGGING` | `false` | SQL logging |

### Auth / JWT

| Variable | Example | Purpose |
|----------|---------|---------|
| `JWT_ACCESS_TTL_SECONDS` | `900` | Access token TTL |
| `JWT_REFRESH_TTL_SECONDS` | `2592000` | Refresh TTL |
| `JWT_PUBLIC_KEY_PATH` | (optional) | Override path to RS256 public key |
| `ADMIN_EMAIL` | `admin@foodordering.local` | Seeded admin |
| `ADMIN_PASSWORD` | `ChangeMe_Admin_Seed_Only` | Seeded admin password |
| `ADMIN_PHONE` | `+10000000000` | Seeded admin phone |
| `ADMIN_NAME` | `"System Admin"` | Seeded admin name (quote if spaces) |

### Catalog / media

| Variable | Example | Purpose |
|----------|---------|---------|
| `CATALOG_SEED_PRODUCT_COUNT` | `36` | Food menu size (cycles if larger) |
| `CATALOG_SEED_BATCH_SIZE` | `50` | Insert batch size |
| `CATALOG_SEED_ON_BOOT` | `false` | Auto-seed when catalog starts |
| `CATALOG_SEED_RESET` | `true` | Truncate products before seed |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO |
| `S3_BUCKET` | `food-ordering-media` | Bucket |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `minioadmin` | MinIO creds |
| `S3_PUBLIC_BASE_URL` | `http://localhost:9000` | Public URL prefix |

### gRPC / gateway

| Variable | Example | Purpose |
|----------|---------|---------|
| `IDENTITY_GRPC_URL` | `localhost:50051` | Gateway → identity |
| `CATALOG_GRPC_URL` | `localhost:50052` | Gateway / cart / order → catalog |
| `CART_GRPC_URL` | `localhost:50053` | Gateway / order → cart |
| `ORDER_GRPC_URL` | `localhost:50054` | Gateway → order |
| `CORS_ORIGINS` | `http://localhost:3000` | Browser origin allowlist |
| `REALTIME_WS_URL` | `http://localhost:3007` | Gateway WS proxy target |
| `REQUEST_BODY_LIMIT` | `64kb` | JSON body limit |

### Notification (OTP email)

| Variable | Example | Purpose |
|----------|---------|---------|
| `SMTP_HOST` | `smtp.gmail.com` | SMTP host |
| `SMTP_PORT` | `587` | Port |
| `SMTP_SECURE` | `false` | TLS upgrade |
| `SMTP_USER` | your Gmail | Auth user |
| `SMTP_PASS` | App Password | **Not** normal Gmail password |
| `SMTP_FROM` | `"FoodApp <you@gmail.com>"` | From header |

### Web

| Variable | Example | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001/v1` | Browser API base |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001/ws` | Browser WS |

### Observability / realtime caps

| Variable | Example | Purpose |
|----------|---------|---------|
| `OTEL_SDK_DISABLED` | `true` | Disable OTel locally |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | Collector |
| `WS_MAX_CONNECTIONS_PER_USER` | `5` | Realtime limit |
| `WS_MAX_CONNECTIONS_PER_IP` | `20` | Realtime limit |

---

## 5. Migrations

```bash
set -a && source .env && set +a
npm run identity:migration:run
npm run catalog:migration:run
npm run cart:migration:run
npm run order:migration:run
npm run notification:migration:run
```

---

## 6. Seed data

```bash
# Food catalog (PKR + images). Resets products when CATALOG_SEED_RESET=true
export CATALOG_SEED_RESET=true CATALOG_SEED_PRODUCT_COUNT=36
npm run catalog:seed

# Admin user is created the first time Identity boots (ADMIN_* vars)
```

---

## 7. Start applications (manual order)

Do **not** set shared `GRPC_PORT` in `.env`. From repo root, with `.env` loaded:

```bash
set -a && source .env && set +a
export OTEL_SDK_DISABLED=true CATALOG_SEED_ON_BOOT=false
unset SERVICE_NAME HTTP_PORT GRPC_PORT

# Terminals (or background processes):
npm run serve:identity      # :3002 / gRPC :50051
npm run serve:catalog       # :3003 / :50052
npm run serve:cart          # :3004 / :50053
npm run serve:order         # :3005 / :50054
npm run serve:notification  # :3006
npm run serve:realtime      # :3007
npm run serve:gateway       # :3001 + Swagger
npm run serve:web           # :3000
```

Or via ts-node (same as `scripts/dev-up.sh start`):

```bash
./node_modules/.bin/ts-node --transpile-only -r tsconfig-paths/register \
  -P apps/gateway/tsconfig.app.json apps/gateway/src/main.ts
```

---

## 8. Verify

```bash
curl -s http://localhost:3001/health/live
curl -s 'http://localhost:3001/v1/catalog/products?page=1&limit=1'
open http://localhost:3001/api/docs
open http://localhost:3000
```

Login admin: `admin@foodordering.local` / `ChangeMe_Admin_Seed_Only`.

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Failed to fetch` in browser | Gateway down — restart `serve:gateway`; check CORS |
| `EADDRINUSE` | Kill old `main.ts` / next processes; unset shared `GRPC_PORT` |
| OTP not in inbox | Set `SMTP_*`; else read `notifications` table / notification logs |
| Empty admin orders | Place an order as a **customer**, then open `/admin/orders` |
| Nx daemon errors | `npx nx reset` or `NX_DAEMON=false` |

Logs when using one-file script: `.dev-logs/*.log`.
