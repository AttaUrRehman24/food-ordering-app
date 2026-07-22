import { ApiResponseOptions } from '@nestjs/swagger';

/** Shared error schema (inline so OpenAPI always includes it) */
export const ApiErrorSchema = {
  type: 'object' as const,
  required: ['statusCode', 'message'],
  properties: {
    statusCode: { type: 'number', example: 400 },
    message: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
      example: 'Validation failed',
    },
    error: { type: 'string', example: 'Bad Request' },
  },
};

export const Unauthorized: ApiResponseOptions = {
  status: 401,
  description: 'Missing/invalid access token, or refresh cookie expired.',
  schema: ApiErrorSchema,
};

export const Forbidden: ApiResponseOptions = {
  status: 403,
  description: 'Authenticated but role is not allowed for this route (customer vs admin).',
  schema: ApiErrorSchema,
};

export const NotFound: ApiResponseOptions = {
  status: 404,
  description: 'Resource not found (or hidden for non-owners).',
  schema: ApiErrorSchema,
};

export const BadRequest: ApiResponseOptions = {
  status: 400,
  description: 'Validation error or malformed payload.',
  schema: ApiErrorSchema,
};

export const TooManyRequests: ApiResponseOptions = {
  status: 429,
  description: 'Rate limit exceeded for this IP or identity key.',
  schema: ApiErrorSchema,
};

export const Unprocessable: ApiResponseOptions = {
  status: 422,
  description: 'Business rule violation (e.g. empty cart, order already processed).',
  schema: ApiErrorSchema,
};

export const SWAGGER_DESCRIPTION = `
# Food Order App — Public REST API (Enterprise BFF)

Production-oriented edge API for a single-vendor food ordering platform.  
**Clients talk only to this gateway** — never to internal gRPC services.

| Resource | URL |
|----------|-----|
| Base path | \`/v1\` |
| This UI | \`/api/docs\` |
| OpenAPI JSON | \`/api/docs-json\` |
| Health | \`/health/live\` · \`/health/ready\` |
| Metrics | \`/metrics\` (Prometheus) |
| WebSocket | \`ws://localhost:3001/ws?token=<accessJWT>\` |

---

## Documentation references

| Doc | Purpose |
|-----|---------|
| [Root README](../README.md) | Product overview, URLs, quick start |
| [docs/README.md](../docs/README.md) | Documentation index |
| [docs/SETUP.md](../docs/SETUP.md) | Env vars, migrations, manual run |
| [docs/API.md](../docs/API.md) | REST scenarios & auth cheat-sheet |
| [docs/LOAD-TESTING.md](../docs/LOAD-TESTING.md) | Variable concurrency flow load tests |
| [docs/HIGH-CONCURRENCY.md](../docs/HIGH-CONCURRENCY.md) | **5M-order design + full infra report harness** |
| [infra/load/README.md](../infra/load/README.md) | Load scripts (\`npm run load:flow\`, \`npm run load:concurrency-report\`) |
| [infra/docker/README.md](../infra/docker/README.md) | Docker Compose (Postgres, Redis, Kafka, MinIO) |
| [infra/helm/README.md](../infra/helm/README.md) | Kubernetes horizontal scaling |
| [apps/gateway/README.md](../apps/gateway/README.md) | BFF implementation notes |

Local shortcuts once the stack is up:

- Web: http://localhost:3000  
- Swagger: http://localhost:3001/api/docs  
- Full concurrency report: \`npm run load:concurrency-report\`

---

## Security model

1. **Access JWT (RS256)** — short-lived (~15m). Header: \`Authorization: Bearer <token>\`.
2. **Refresh token** — httpOnly cookie \`refresh_token\` (rotation / reuse detection in Identity).
3. **Roles**
   - \`customer\` — catalog, cart, own orders, profile
   - \`admin\` — \`/admin/*\` product CRUD + list-all orders (cannot place customer carts/orders)

Use **Authorize** in this UI and paste an \`accessToken\` from login.

---

## Currency

All monetary amounts are **PKR** decimal strings (e.g. \`"450.00"\`).

---

## End-to-end scenarios (try in order)

### A. Customer: register → cart → order
1. \`POST /auth/register\` (or \`/auth/login\`)
2. Copy \`accessToken\` → Authorize
3. \`GET /catalog/products\` → pick \`productId\` + \`variantId\`
4. \`POST /cart/items\`
5. \`POST /orders\` with header **\`Idempotency-Key: <uuid>\`** and body \`{ "paymentType": "COD" }\`
6. \`GET /orders/{id}\` — status moves \`pending\` → \`paid\`/\`failed\` via Kafka workers

### B. OTP login (email-only)
1. \`POST /auth/otp/request\` \`{ "identifier": "you@mail.com", "type": "email" }\`
2. Read code from email (SMTP) or local \`notifications\` table
3. \`POST /auth/otp/verify\`

### C. Admin operations
1. Login as \`admin@foodordering.local\`
2. \`GET /admin/orders\` · \`POST /admin/products\` · variant endpoints

### D. Session hygiene
\`GET /users/me/sessions\` → \`DELETE /users/me/sessions/{id}\` → \`POST /auth/logout-all\`

### E. Idempotent checkout
Retry \`POST /orders\` with the **same** \`Idempotency-Key\` → identical order (no double charge).

---

## High-concurrency design (target: 5 million parallel orders)

This API is built for **async absorption**, not synchronous “5M HTTP threads”:

| Concern | Platform approach |
|---------|-------------------|
| Order intake spike | Gateway returns **202**; Order service writes **outbox** → **Kafka** topics (\`order.created\`, \`order.status.changed\`) |
| Long-running work | **Notification workers** (email/SMS/push) consume Kafka off the request path |
| Horizontal scale | Stateless Nest services in **Docker / K8s** (see \`infra/helm\`); Node cluster or multiple replicas behind LB |
| Hot reads | Catalog **Redis** cache; cart Redis-primary |
| Data integrity | Postgres indexes, partitioned tables where needed, TypeORM migrations |
| Live UX | Realtime WS fan-out from Kafka status events |

**Full infra report (HTTP + Docker + Postgres + Redis + Kafka + notifications):**

\`\`\`bash
DESIGN_TARGET=5000000 CONCURRENCY=50 TOTAL=200 npm run load:concurrency-report
\`\`\`

See \`docs/HIGH-CONCURRENCY.md\` and \`infra/load/README.md\`.

---

## Error envelope

\`\`\`json
{ "statusCode": 400, "message": "Validation failed", "error": "Bad Request" }
\`\`\`

Domain/gRPC failures map to HTTP 400 / 401 / 403 / 404 / 422 / 429.
`;
