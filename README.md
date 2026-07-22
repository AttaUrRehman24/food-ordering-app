# Food Order App — Food Ordering Platform

Professional single-vendor food ordering monorepo: NestJS microservices, Next.js storefront, TypeORM/Postgres, Redis, Kafka, MinIO, and a public REST gateway with full Swagger.

| | |
|---|---|
| **Web** | http://localhost:3000 |
| **API** | http://localhost:3001/v1 |
| **Swagger** | http://localhost:3001/api/docs |
| **Admin login** | `admin@foodordering.local` / `ChangeMe_Admin_Seed_Only` |

---

## Documentation map

| Document | Purpose | Short description | When to use |
|----------|---------|-------------------|-------------|
| **[docs/README.md](docs/README.md)** | Docs index | Hub linking every guide, app, lib, and infra README | Navigating all documentation |
| **[docs/SETUP.md](docs/SETUP.md)** | Manual setup | Env vars, migrations, seed, start services without one-file script | Full-control / CI setup |
| **[docs/API.md](docs/API.md)** | REST API guide | Scenarios, auth, checkout, admin; links to Swagger | Using or testing the API |
| **[docs/LOAD-TESTING.md](docs/LOAD-TESTING.md)** | Flow load tests | Variable concurrency register→order flows | Quick performance checks |
| **[docs/HIGH-CONCURRENCY.md](docs/HIGH-CONCURRENCY.md)** | 5M scale design | Kafka/outbox model + full Docker/Redis/Kafka/DB HTML report | Scale design & evidence |
| **[docs/HANDOVER.md](docs/HANDOVER.md)** | Company handover | Detailed handover letter (setup, docs map, test results) | Client / company transfer |
| **[docs/FOLDER-OVERVIEW.md](docs/FOLDER-OVERVIEW.md)** | Folder overview | Each folder: purpose + benefit of this setup | Explaining monorepo structure |
| **[docs/production-readiness.md](docs/production-readiness.md)** | Go-live checklist | Pre-production readiness | Before staging/prod |
| **[scripts/dev-up.sh](scripts/dev-up.sh)** | One-file bootstrap | Infra → migrate → seed → start all apps | Fastest local start |
| [infra/docker/README.md](infra/docker/README.md) | Docker Compose | Postgres, Redis, Kafka, MinIO | Local infrastructure |
| [infra/load/README.md](infra/load/README.md) | Load scripts | `load:flow` and `load:concurrency-report` | Load / concurrency tests |
| [infra/helm/README.md](infra/helm/README.md) | Helm / K8s | Horizontal scaling charts | Cluster deploy |
| [infra/runbooks/README.md](infra/runbooks/README.md) | Ops runbooks | Incident / DR procedures | Operations |

### Per-service READMEs

| App | README | Purpose | Short description | Port(s) |
|-----|--------|---------|-------------------|---------|
| Gateway (BFF + Swagger) | [apps/gateway/README.md](apps/gateway/README.md) | Public edge API | REST `/v1`, OpenAPI, WS proxy | 3001 |
| Identity | [apps/identity/README.md](apps/identity/README.md) | Auth | JWT, OTP, sessions, RBAC | 3002 / 50051 |
| Catalog | [apps/catalog/README.md](apps/catalog/README.md) | Menu | Products, PKR prices, seed | 3003 / 50052 |
| Cart | [apps/cart/README.md](apps/cart/README.md) | Cart | Redis-primary cart | 3004 / 50053 |
| Order | [apps/order/README.md](apps/order/README.md) | Orders | 202 + outbox → Kafka | 3005 / 50054 |
| Notification | [apps/notification/README.md](apps/notification/README.md) | Messaging | Email/SMS/push workers | 3006 |
| Realtime | [apps/realtime/README.md](apps/realtime/README.md) | Live updates | Order-status WebSocket | 3007 |
| Web (Next.js) | [apps/web/README.md](apps/web/README.md) | UI | Customer storefront + AdminLTE | 3000 |

Shared libraries: [libs/](libs/) — see [docs/README.md#libraries](docs/README.md#libraries) (purpose + short description per lib).

---

## Quick start (one file)

```bash
# Prerequisites: Node 20+, npm, Docker Desktop or Colima
cp .env.example .env          # first time only — edit SMTP_* for real OTP email
chmod +x scripts/dev-up.sh
./scripts/dev-up.sh           # or: npm run dev:up
```

What it does: starts Docker infra → runs all migrations → seeds food catalog (PKR) → starts every service + web.

```bash
./scripts/dev-up.sh status    # health codes
./scripts/dev-up.sh stop      # stop Node apps (Docker stays up)
./scripts/dev-up.sh help
```

Prefer step-by-step control? Use **[docs/SETUP.md](docs/SETUP.md)** (full env reference + manual commands).

---

## Architecture

```
Browser (Next.js :3000)
    │  REST + cookies
    ▼
API Gateway (:3001) ── Swagger /api/docs ── WS proxy /ws
    │ gRPC
    ├─ Identity (:50051 / HTTP :3002)
    ├─ Catalog  (:50052 / HTTP :3003)
    ├─ Cart     (:50053 / HTTP :3004)
    └─ Order    (:50054 / HTTP :3005)
Kafka → Notification (:3006), Realtime (:3007)
Postgres · Redis · MinIO
```

Currency for catalog/cart/orders: **PKR**.

---

## Default credentials

| Role | Identifier | Password |
|------|------------|----------|
| Admin | `admin@foodordering.local` | `ChangeMe_Admin_Seed_Only` |
| Customer | Register via UI or `POST /v1/auth/register` | — |

OTP is **email-only** (configure `SMTP_*` in `.env` for Gmail App Passwords).

---

## Ports

| Service | HTTP | gRPC |
|---------|------|------|
| web | 3000 | — |
| gateway | 3001 | — |
| identity | 3002 | 50051 |
| catalog | 3003 | 50052 |
| cart | 3004 | 50053 |
| order | 3005 | 50054 |
| notification | 3006 | — |
| realtime | 3007 | — |

Infra: Postgres `5432`, Redis `6379`, Kafka `9092`, MinIO `9000`/`9001`.

---

## Common npm scripts

```bash
npm run infra:up                 # Docker compose
npm run identity:migration:run   # (+ catalog/cart/order/notification)
npm run catalog:seed             # food menu (PKR) — resets when CATALOG_SEED_RESET=true
npm run serve:gateway            # one service
npm run serve:web
npm run dev:up | dev:stop | dev:status
```

---

## License

UNLICENSED — private project.
