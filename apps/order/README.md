# Order (`apps/order`)

Order aggregate, idempotency keys, outbox → Kafka, payment mock finalizer, admin list-all.

| | |
|---|---|
| HTTP health | `:3005` |
| gRPC | `:50054` |
| Proto | `libs/proto/protos/order.proto` |

## Docs

- [API orders + admin orders](../../docs/API.md)
- [Setup](../../docs/SETUP.md)
- [Realtime status](../realtime/README.md)

## Run

```bash
npm run order:migration:run
npm run serve:order
```

Place order requires cart lines + `Idempotency-Key`. Admin `ListOrders` used by `GET /v1/admin/orders`.
