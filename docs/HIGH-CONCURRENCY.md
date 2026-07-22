# High concurrency — 5 million orders (design + report harness)

Food Order App is built for **async absorption** of extreme order spikes. The design target is **5,000,000 parallel order accepts**, not 5M synchronous HTTP threads.

## How it scales

| Concern | Approach |
|---------|----------|
| Intake | Gateway returns **HTTP 202**; Order service persists + **transactional outbox** |
| Queue | **Kafka** topics: `order.created`, `order.status.changed`, `order.paid`, … |
| Workers | Notification service consumes Kafka for **email / SMS / push** off the request path |
| Horizontal scale | Stateless Nest services — **Docker Compose scale** or **Helm / K8s HPA** (`infra/helm`) |
| Hot path | **Redis** cart + catalog cache + gateway rate limits |
| Database | Postgres with **partitioned** `orders` / `notifications`, indexes, migrations |

## Full infra report test

```bash
# Gateway should allow load volume:
# LOAD_TEST_BYPASS=true when starting gateway

DESIGN_TARGET=5000000 CONCURRENCY=50 TOTAL=200 npm run load:concurrency-report
```

This places `TOTAL` concurrent order flows, waits for workers to settle, then probes:

- Docker container health & CPU/mem  
- Postgres counts (orders, outbox, users, notifications, delivery status)  
- Redis memory, clients, sample keys  
- Kafka topics + high-watermark offsets + consumer groups  
- Service `/health/live` + gateway metrics sample  
- Extrapolation / replica guidance toward **5M**

Reports land in:

- `infra/load/reports/latest.html` (**open this in a browser**)
- `infra/load/reports/latest.md`
- `infra/load/reports/latest.json`
- timestamped copies alongside

Infra-only (no orders):

```bash
SKIP_LOAD=1 npm run load:concurrency-report
```

## Doc references

- [API.md](API.md) · Swagger http://localhost:3001/api/docs  
- [LOAD-TESTING.md](LOAD-TESTING.md) · [SETUP.md](SETUP.md) · [README.md](README.md)  
- [infra/load/README.md](../infra/load/README.md)  
- [infra/docker/README.md](../infra/docker/README.md) · [infra/helm/README.md](../infra/helm/README.md)

## Important

Running a literal **5,000,000** concurrent local flows will exhaust a laptop. Use `TOTAL`/`CONCURRENCY` for a measured burst; use `DESIGN_TARGET` + the projection section for capacity planning and horizontal scale sizing.

### Questions to ask the client (acceptance of “5M in parallel”)

Before signing off the requirement, confirm with stakeholders:

1. **Parallel vs throughput** — 5M at the same instant, or 5M in a time window?  
2. **Order = 202 accept only**, or full flow through paid + email + WebSocket?  
3. **SLOs** — required success %, p95/p99 accept latency, max async lag?  
4. **Where** — their K8s/cloud vs temporary load-test cluster; budget?  
5. **Milestone** — is design + local reports enough, or is a 5M cluster load-test Phase 2?

Full question list for the handover email: [HANDOVER.md §9a](HANDOVER.md).
