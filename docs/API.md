# API documentation

Interactive OpenAPI UI (preferred): **http://localhost:3001/api/docs**

## Documentation references

| Doc | Purpose |
|-----|---------|
| [README.md](../README.md) | Product overview, URLs, quick start |
| [docs/README.md](README.md) | Documentation index |
| [SETUP.md](SETUP.md) | Env vars, migrations, manual run |
| [API.md](API.md) | This page — REST scenarios |
| [LOAD-TESTING.md](LOAD-TESTING.md) | Variable concurrency flow tests |
| [HIGH-CONCURRENCY.md](HIGH-CONCURRENCY.md) | **5M-order design + full Docker/Redis/Kafka/DB report** |
| [infra/load/README.md](../infra/load/README.md) | Load scripts |
| [infra/docker/README.md](../infra/docker/README.md) | Compose stack |
| [infra/helm/README.md](../infra/helm/README.md) | K8s horizontal scaling |
| [apps/gateway/README.md](../apps/gateway/README.md) | BFF implementation |

Also linked from Swagger (“Documentation references” section + External Docs).

- OpenAPI JSON: http://localhost:3001/api/docs-json  

The Swagger document includes:

- Tag groups: `auth`, `catalog`, `cart`, `orders`, `users`, `admin`
- Typed response schemas (Models section), Bearer JWT + refresh cookie
- Request/response examples, validation, HTTP status codes
- End-to-end scenarios + high-concurrency design notes
- Custom Food Order App theme, filter, try-it-out, persist auth
- Cross-links to SETUP / API / LOAD-TESTING / HIGH-CONCURRENCY docs

Authorize in Swagger: click **Authorize** → paste `accessToken` from login.

Load / concurrency:

```bash
npm run load:flow
DESIGN_TARGET=5000000 CONCURRENCY=50 TOTAL=200 npm run load:concurrency-report
```


---

## Base URL

```
http://localhost:3001/v1
```

Health (no `/v1` prefix): `GET /health/live`, `GET /health/ready`, `GET /metrics`

---

## Auth summary

| Step | Endpoint |
|------|----------|
| Register | `POST /auth/register` |
| Password login | `POST /auth/login` body `{ identifier, password }` |
| OTP request | `POST /auth/otp/request` `{ identifier, type: "email" }` |
| OTP verify | `POST /auth/otp/verify` `{ identifier, code }` |
| Refresh | `POST /auth/refresh` (cookie `refresh_token`) |
| Logout | `POST /auth/logout` Bearer |
| Logout all | `POST /auth/logout-all` Bearer |

Protected routes: `Authorization: Bearer <accessToken>`.

---

## Scenario cheat-sheet

### Customer checkout

1. Login / register  
2. `GET /catalog/products`  
3. `POST /cart/items` `{ productId, variantId, quantity }`  
4. `POST /orders` + header `Idempotency-Key` + `{ paymentType: "COD" }` → `202`  
5. `GET /orders/:id` or WS `ws://localhost:3001/ws?token=...`

### Admin

1. Login as admin  
2. `GET /admin/orders`  
3. `POST /admin/products` / `PATCH` / variants  

### Roles

| Role | Allowed |
|------|---------|
| customer | catalog, cart, own orders, profile |
| admin | `/admin/*` only for write/list-all; **not** cart / place order |

---

## Currency

All money fields are **PKR** decimal strings (e.g. `"450.00"`).
