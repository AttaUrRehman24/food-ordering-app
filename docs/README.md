# Documentation index

Central map for Food Order App docs. Start at the [root README](../README.md).

## Getting started

| Guide | Purpose | Short description | When to use | Key contents |
|-------|---------|-------------------|-------------|--------------|
| [../scripts/dev-up.sh](../scripts/dev-up.sh) | One-file bootstrap | Starts Docker infra, migrations, catalog seed, and all apps | Fastest local/demo path | `dev:up` · `status` · `stop` |
| [SETUP.md](SETUP.md) | Manual setup | Full control: every env var and command without the script | CI, debugging, custom runs | Prerequisites, `.env`, migrate, seed, serve |
| [API.md](API.md) | REST guide | Scenarios for auth, cart, orders, admin | API consumers / QA | Swagger links, role matrix, PKR |
| [LOAD-TESTING.md](LOAD-TESTING.md) | Flow load tests | Variable `CONCURRENCY` / `TOTAL` order flows | Performance smoke tests | `npm run load:flow` |
| [HIGH-CONCURRENCY.md](HIGH-CONCURRENCY.md) | 5M scale design | Architecture for millions of accepts + full infra report | Architects / DevOps / handover | Kafka, Docker/K8s, HTML reports |
| [HANDOVER.md](HANDOVER.md) | Client handover | Detailed letter: docs map, setup, credentials, test results | Project handover | Copy-ready message for the company |
| [HANDOVER-EMAIL.md](HANDOVER-EMAIL.md) | Sendable email | Full handover email including 5M clarifying questions | Email to stakeholders | Subject line + all sections |
| [FOLDER-OVERVIEW.md](FOLDER-OVERVIEW.md) | Folder map | Each folder name, purpose, and benefit of the setup | Architecture / onboarding | Top-level, apps, libs, infra, docs |
| [production-readiness.md](production-readiness.md) | Go-live checklist | Pre-prod readiness items | Staging / production | Security, ops, scale |
| [../.env.example](../.env.example) | Env template | All config keys with safe defaults | First clone | Copy to `.env` |

## API

- Interactive Swagger UI: http://localhost:3001/api/docs  
- OpenAPI JSON: http://localhost:3001/api/docs-json  
- Narrative + scenarios: [API.md](API.md)  
- Implementation notes: [apps/gateway/README.md](../apps/gateway/README.md)

## Applications

| Path | Purpose | Short description | Ports | Key contents |
|------|---------|-------------------|-------|--------------|
| [apps/gateway](../apps/gateway/README.md) | Public BFF | REST `/v1`, Swagger, CORS, rate limits, WS proxy | HTTP 3001 | Only client-facing HTTP API |
| [apps/identity](../apps/identity/README.md) | Auth | JWT, OTP email, sessions, RBAC | 3002 / gRPC 50051 | Register, login, refresh, admin seed |
| [apps/catalog](../apps/catalog/README.md) | Menu | Products, variants, PKR, images, seed | 3003 / gRPC 50052 | Public list + admin CRUD |
| [apps/cart](../apps/cart/README.md) | Cart | Redis-primary shopping cart | 3004 / gRPC 50053 | Add/update/remove line items |
| [apps/order](../apps/order/README.md) | Orders | 202 accept, idempotency, outbox → Kafka | 3005 / gRPC 50054 | Place/list/get, payment mock |
| [apps/notification](../apps/notification/README.md) | Messaging | Kafka workers; SMTP OTP/email | HTTP 3006 | Delivery tracking, DLQs |
| [apps/realtime](../apps/realtime/README.md) | Live WS | Order status WebSocket fan-out | HTTP 3007 | JWT-authenticated WS |
| [apps/web](../apps/web/README.md) | UI | Next.js storefront + AdminLTE admin | HTTP 3000 | Menu, cart, checkout, admin |

## Libraries

| Path | Purpose | Short description | Key contents |
|------|---------|-------------------|--------------|
| [libs/proto](../libs/proto/README.md) | gRPC IDL | Shared `.proto` contracts | Gateway ↔ service RPCs |
| [libs/domain](../libs/domain/README.md) | Domain types | Shared enums/types | Roles, statuses |
| [libs/auth](../libs/auth/README.md) | Auth contracts | JWT/RBAC shared surface | Guard-facing types |
| [libs/config](../libs/config/README.md) | Config | Zod env validation | Boot-time typed config |
| [libs/kafka](../libs/kafka/README.md) | Topics | Topic names & envelopes | `order.created`, etc. |
| [libs/observability](../libs/observability/README.md) | Telemetry | Logs, metrics, OTel | Structured logging |
| [libs/persistence](../libs/persistence/README.md) | ORM base | TypeORM BaseEntity + naming | Snake_case Postgres |

## Infrastructure & ops

| Path | Purpose | Short description | When to use | Key contents |
|------|---------|-------------------|-------------|--------------|
| [infra/docker/README.md](../infra/docker/README.md) | Compose stack | Local Postgres, Redis, Kafka, MinIO | Always for local run | `npm run infra:up` |
| [infra/load/README.md](../infra/load/README.md) | Load harness | Flow + full concurrency HTML reports | Perf / handover evidence | `load:flow`, `load:concurrency-report` |
| [infra/helm/README.md](../infra/helm/README.md) | Helm charts | K8s horizontal scaling | Staging / production | Replicas, HPA |
| [infra/runbooks/README.md](../infra/runbooks/README.md) | Ops / DR | Incident and recovery procedures | On-call | Runbooks |
| [production-readiness.md](production-readiness.md) | Go-live | Production checklist | Before launch | Security & ops |
