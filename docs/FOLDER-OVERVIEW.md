# Repository folder overview

Why the monorepo is structured this way: **one codebase**, clear boundaries (apps vs shared libs vs infra), and a path from **local Docker** → **Kubernetes scale**. Each folder has a single job so teams can own services independently while sharing contracts.

---

## Top-level folders

| Folder | Purpose | Benefit / why this setup |
|--------|---------|---------------------------|
| **`apps/`** | Runnable applications (microservices + web UI) | Each service can be developed, deployed, and scaled **independently**; failures in one domain (e.g. notifications) do not take down checkout |
| **`libs/`** | Shared libraries used by multiple apps | **DRY** contracts (gRPC, Kafka topics, auth, config); change once, reuse everywhere; fewer integration bugs |
| **`infra/`** | Infrastructure & ops (Docker, Helm, load tests, runbooks) | Separates **runtime code** from **how you run it**; same apps work locally and in K8s |
| **`docs/`** | Human documentation (setup, API, handover, scale) | Onboarding and handover without reading all source; single source of truth for process |
| **`scripts/`** | Automation helpers (e.g. `dev-up.sh`) | One-command local bootstrap; reduces setup mistakes |
| **`node_modules/`** | Installed npm dependencies (generated) | Not source — do not edit or commit; created by `npm install` |
| Root config (`package.json`, `nx.json`, `tsconfig*.json`) | Workspace tooling & TypeScript paths | Monorepo build/test/serve from one place |

---

## `apps/` — applications

| Folder | Purpose | Benefit / why this setup |
|--------|---------|---------------------------|
| **`apps/gateway/`** | Public **BFF** — REST `/v1`, Swagger, CORS, rate limits, WS proxy | Clients talk to **one** HTTP API; internal gRPC stays private; easier security and versioning |
| **`apps/identity/`** | Auth: register, login, JWT, OTP, sessions, RBAC | Central identity; customer vs admin roles enforced consistently |
| **`apps/catalog/`** | Products, variants, PKR prices, images, seed | Menu can scale/cache separately from orders; seed for demo data |
| **`apps/cart/`** | Shopping cart (Redis-primary + Postgres) | Fast cart reads/writes; cleared after order place |
| **`apps/order/`** | Place/list orders, idempotency, outbox → Kafka | **202 accept** + async processing — foundation for high concurrency |
| **`apps/notification/`** | Kafka workers for email/SMS/push (SMTP OTP) | Slow work (email) **off the request path**; peak orders do not wait on SMTP |
| **`apps/realtime/`** | WebSocket fan-out of order status | Live UI updates without polling; scales with Kafka consumers |
| **`apps/web/`** | Next.js customer storefront + AdminLTE admin | Single UI app for customers and admins; calls gateway only |

---

## `libs/` — shared libraries

| Folder | Purpose | Benefit / why this setup |
|--------|---------|---------------------------|
| **`libs/proto/`** | gRPC `.proto` contracts | Gateway and services share the **same API contract**; fewer breaking changes |
| **`libs/domain/`** | Shared enums/types (roles, statuses) | Same language across services; fewer “stringly typed” bugs |
| **`libs/auth/`** | JWT / RBAC contracts | Consistent auth semantics at the edge and in services |
| **`libs/config/`** | Zod env validation | Fail fast on bad `.env`; typed config at boot |
| **`libs/kafka/`** | Topic names & message envelopes | One catalog of topics (`order.created`, …); producers/consumers stay aligned |
| **`libs/observability/`** | Logs, metrics, OpenTelemetry | Uniform logging/metrics across services for ops and load tests |
| **`libs/persistence/`** | TypeORM BaseEntity + naming | Consistent Postgres schema conventions (snake_case, base fields) |

---

## `infra/` — infrastructure & operations

| Folder | Purpose | Benefit / why this setup |
|--------|---------|---------------------------|
| **`infra/docker/`** | Docker Compose: Postgres, Redis, Kafka, MinIO | Local stack mirrors production dependencies; no cloud required to develop |
| **`infra/helm/`** | Kubernetes Helm charts | **Horizontal scaling** path for 5M-style peaks (replicas, HPA) |
| **`infra/load/`** | Load / concurrency scripts + HTML reports | Evidence of throughput; full infra report (DB/Redis/Kafka/notifications) |
| **`infra/runbooks/`** | Incident / DR procedures | Ops can recover without reverse-engineering the code |

---

## `docs/` — documentation

| File / area | Purpose | Benefit / why this setup |
|-------------|---------|---------------------------|
| **`docs/README.md`** | Docs index | Find any guide quickly |
| **`docs/SETUP.md`** | Manual setup (env, migrate, serve) | Full control when `dev-up` is not enough |
| **`docs/API.md`** | REST scenarios + Swagger usage | QA/frontend can test without reading Nest code |
| **`docs/LOAD-TESTING.md`** | Flow load tests | How to run `load:flow` |
| **`docs/HIGH-CONCURRENCY.md`** | 5M design + report harness | Explains scale design and how to generate reports |
| **`docs/HANDOVER.md`** / **`HANDOVER-EMAIL.md`** | Company handover letter | Ready-to-send transfer package |
| **`docs/production-readiness.md`** | Go-live checklist | Before staging/production |

---

## `scripts/`

| Folder / file | Purpose | Benefit / why this setup |
|---------------|---------|---------------------------|
| **`scripts/dev-up.sh`** | One-file: infra → migrate → seed → start all apps | Fastest onboarding; same path for demos and handover |

---

## How the pieces fit (why microservices + queues)

```
Web (apps/web) → Gateway (apps/gateway) → gRPC → Identity / Catalog / Cart / Order
                                                      ↓
                                              Outbox → Kafka
                                                      ↓
                                    Notification + Realtime workers
Infra: Postgres + Redis + Kafka + MinIO (infra/docker)
Scale-out: Helm replicas (infra/helm)
```

| Concern | Folder that addresses it | Benefit |
|---------|--------------------------|---------|
| User-facing HTTP | `apps/gateway`, `apps/web` | One public edge |
| Auth | `apps/identity`, `libs/auth` | Central security |
| Menu | `apps/catalog` | Independent catalog scale/cache |
| Cart | `apps/cart` + Redis | Low latency |
| Orders at peak | `apps/order` + Kafka + `apps/notification` | Accept fast, process async |
| Live status | `apps/realtime` | Better UX under load |
| Local run | `infra/docker`, `scripts/` | Develop offline |
| Millions of accepts | `infra/helm`, `docs/HIGH-CONCURRENCY.md`, `infra/load` | Design + measure + scale |

---

*Also linked from the handover email: attach or point stakeholders to this file — `docs/FOLDER-OVERVIEW.md`.*
