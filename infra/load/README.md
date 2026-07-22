# Load scripts

| Script | Runner | Purpose |
|--------|--------|---------|
| `high-concurrency-report.mjs` | Node 18+ | **Full report**: concurrent orders + Docker/Postgres/Redis/Kafka/notifications deltas + 5M projection |
| `order-flow-concurrency.mjs` | Node 18+ | Full register→catalog→cart→order flow; variable `CONCURRENCY` / `TOTAL` |
| `order-burst.js` | k6 | Ramping arrival-rate on `POST /orders` (needs `ACCESS_TOKEN` + cart) |
| `catalog-read.js` | k6 | Catalog read throughput |

## Full high-concurrency report (recommended for 5M design)

```bash
DESIGN_TARGET=5000000 CONCURRENCY=50 TOTAL=200 npm run load:concurrency-report
```

Writes `infra/load/reports/latest.md` + `.json` covering Docker scale base, DB, Redis, Kafka offsets, email/notification delivery rows, and capacity projection.

Docs: [docs/HIGH-CONCURRENCY.md](../../docs/HIGH-CONCURRENCY.md).

## Flow concurrency

```bash
CONCURRENCY=10 TOTAL=50 npm run load:flow
```

Env:

| Variable | Default | Meaning |
|----------|---------|---------|
| `API_BASE` | `http://127.0.0.1:3001/v1` | Gateway base |
| `CONCURRENCY` | `10` / `50` | Parallel in-flight flows |
| `TOTAL` | `50` / `200` | Total flows to complete |
| `DESIGN_TARGET` | `5000000` | Design target for projection (report only) |
| `PAYMENT_TYPE` | `COD` | Order payment type |
| `SKIP_LOAD` | `0` | Infra probe only |

### Rate limits

Gateway auth/catalog IP rate limits apply in normal mode. For larger local runs, start the gateway with:

```bash
LOAD_TEST_BYPASS=true
```
