# Gateway (`apps/gateway`)

Public **REST BFF** for Food Order App. All browsers and mobile clients call this service only.

| | |
|---|---|
| HTTP | `:3001` |
| Prefix | `/v1` |
| Swagger | http://localhost:3001/api/docs |
| WS proxy | `/ws` → realtime `:3007` |

## Docs

- [API guide](../../docs/API.md)
- [Setup](../../docs/SETUP.md)
- [Root README](../../README.md)

## Run

```bash
set -a && source .env && set +a
unset SERVICE_NAME HTTP_PORT GRPC_PORT
npm run serve:gateway
```

## Responsibilities

- REST mapping to Identity / Catalog / Cart / Order gRPC
- Cookie refresh + Bearer access JWT introspection
- Role guards (`customer` vs `admin`)
- Rate limits (auth, catalog)
- CORS, body size limits, exception mapping
- Professional OpenAPI (scenarios, status codes, examples)

## Key routes

See Swagger tags: `auth`, `catalog`, `cart`, `orders`, `users`, `admin`.
