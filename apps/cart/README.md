# Cart (`apps/cart`)

Per-user cart: Redis primary + Postgres snapshot; prices from Catalog gRPC.

| | |
|---|---|
| HTTP health | `:3004` |
| gRPC | `:50053` |

## Docs

- [API cart tag](../../docs/API.md)
- [Setup](../../docs/SETUP.md)
- [Catalog](../catalog/README.md)

## Run

```bash
npm run cart:migration:run
npm run serve:cart
```

Requires `CATALOG_GRPC_URL` (default `localhost:50052`). Customer role only via gateway.
