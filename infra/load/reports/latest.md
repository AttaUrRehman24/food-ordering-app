# Food Order App — High Concurrency Full Report

Generated: **2026-07-21T19:16:54.784Z**

| Setting | Value |
|---------|-------|
| Design target | 5,000,000 orders |
| Actual TOTAL | 200 |
| CONCURRENCY | 50 |
| API_BASE | http://127.0.0.1:3001/v1 |
| SKIP_LOAD | false |

## 1. Service health

| Service | Port | OK | Status |
|---------|------|----|--------|
| web | 3000 | yes | 200 |
| gateway | 3001 | yes | 200 |
| identity | 3002 | yes | 200 |
| catalog | 3003 | yes | 200 |
| cart | 3004 | yes | 200 |
| order | 3005 | yes | 200 |
| notification | 3006 | yes | 200 |
| realtime | 3007 | yes | 200 |

## 2. Docker (infra horizontal base)

- **food-ordering-postgres**: Up 5 hours (healthy)
- **food-ordering-redis**: Up 5 hours (healthy)
- **food-ordering-kafka**: Up 5 hours (healthy)
- **food-ordering-minio**: Up 5 hours (healthy)

Resource snapshot:
```
food-ordering-postgres CPU=43.28% MEM=80.54MiB / 7.755GiB
food-ordering-redis CPU=20.49% MEM=16.05MiB / 7.755GiB
food-ordering-kafka CPU=412.99% MEM=747.2MiB / 7.755GiB
food-ordering-minio CPU=0.36% MEM=80.47MiB / 7.755GiB
```

> App Nest processes run on host in local mode; infra (postgres/redis/kafka/minio) is Docker. For true horizontal scale use Helm replicas or `docker compose up --scale <svc>=N` with containerized apps.

## 3. Load burst results

- Completed: **200**
- Successful: **200** (100.0%)
- Failed: **0**
- Wall clock: **56874 ms**
- Throughput: **3.52 flows/s**
- E2E latency ms: min 4712 · avg 13140 · p50 12509 · p95 17651 · p99 18629 · max 30515
- POST /orders 202 accept ms: avg 1717 · p95 3361 · max 4891

## 4. Postgres deltas (orders / outbox / notifications)

| Metric | Before | After | Δ |
|--------|--------|-------|---|
| orders_total | 351 | 551 | 200 |
| order_items | 351 | 551 | 200 |
| order_outbox_total | 351 | 551 | 200 |
| order_outbox_unpublished | 0 | 150 | 150 |
| order_idempotency | 351 | 551 | 200 |
| order_status_history | 702 | 916 | 214 |
| users | 352 | 552 | 200 |
| sessions | 360 | 560 | 200 |
| notifications | 4128 | 4377 | 249 |
| notification_delivery | 4128 | 4377 | 249 |
| carts | 0 | 0 | 0 |

Orders by status (after):
```json
{
  "pending": 186,
  "paid": 365
}
```

Notification delivery by status (after):
```json
{
  "sent": 4377
}
```

## 5. Redis

```json
{
  "dbsize": 1,
  "used_memory_human": "1.36M",
  "connected_clients": 8,
  "instantaneous_ops_per_sec": 1,
  "keyspace_hits": 2690,
  "keyspace_misses": 2405,
  "keyspace_raw": "# Keyspace\r\ndb0:keys=1,expires=1,avg_ttl=7785971,subexpiry=0",
  "sample_key_prefixes": {
    "cartish": 0,
    "rate_limit": 0,
    "catalogish": 1,
    "scanned": 1
  },
  "sample_keys": [
    "product:4510c1b9-8c6a-4c90-9b79-c40c3fa56d0b"
  ]
}
```

## 6. Kafka topics & offsets

Topics: __consumer_offsets, catalog.product.changed, notification.email.DLQ, notification.push.DLQ, notification.sms.DLQ, order.created, order.failed, order.paid, order.status.changed, payment.result, session.revoked, user.otp.requested, user.registered

```json
{
  "order.created": {
    "present": true,
    "high_watermarks": "order.created:0:8012"
  },
  "order.status.changed": {
    "present": true,
    "high_watermarks": "order.status.changed:0:383"
  },
  "order.paid": {
    "present": true,
    "high_watermarks": "order.paid:0:388"
  },
  "order.failed": {
    "present": true,
    "high_watermarks": "order.failed:0:0"
  },
  "payment.result": {
    "present": true,
    "high_watermarks": "payment.result:0:0\npayment.result:1:0\npayment.result:2:0"
  },
  "user.otp.requested": {
    "present": true,
    "high_watermarks": "user.otp.requested:0:3"
  },
  "notification.email.DLQ": {
    "present": true,
    "high_watermarks": "notification.email.DLQ:0:0"
  }
}
```

Consumer groups: Error: Executing consumer group command failed due to java.util.concurrent.ExecutionException: org.apache.kafka.common.KafkaException: Failed to find brokers to send ListGroups

## 7. Projection toward 5,000,000 orders

```json
{
  "design_target_orders": 5000000,
  "measured_throughput_flows_per_sec": 3.516520461124767,
  "hours_to_reach_target_at_measured_rate": 394.9611282638889,
  "note": "5M parallel accepts require horizontal scale (many gateway/order replicas + Kafka partitions + Postgres write capacity). Local single-node measures the accept path; Kafka/outbox absorbs async work.",
  "recommended_architecture": {
    "gateway_replicas_behind_lb": "50–200+ (stateless Nest)",
    "order_service_replicas": "20–100 with partitioned outbox pollers",
    "kafka_partitions_order_created": "64–256",
    "notification_workers": "scale consumers independently for email/SMS/push",
    "postgres": "primary + read replicas; partitioned orders; connection pooling (PgBouncer)",
    "redis": "cluster/sentinel for cart + rate-limit + catalog cache",
    "docker_k8s": "Helm charts under infra/helm; HPA on CPU/RPS"
  },
  "rough_gateway_replicas_for_50k_accepts_per_sec_vs_measured": 14219,
  "measured_place_p95_ms": 3360.664988000004
}
```

## 8. Design notes (required architecture)

- Use message queues (Kafka) for order processing after HTTP 202.
- Use Node clustering or Docker/K8s horizontal scaling for gateway & order.
- Optimize DB with indexes, partitioning (orders/notifications already partitioned by month).
- Store long-running tasks (emailing, notifications) in background workers.

## Doc references

- docs/HIGH-CONCURRENCY.md
- docs/LOAD-TESTING.md
- docs/API.md · Swagger http://localhost:3001/api/docs
- infra/docker/README.md · infra/helm/README.md
