# Web (`apps/web`)

Next.js 15 App Router storefront (**Food Order App**) + AdminLTE admin panel.

| | |
|---|---|
| Dev server | http://localhost:3000 |
| API | `NEXT_PUBLIC_API_BASE_URL` → gateway `/v1` |

## Docs

- [Setup / web env](../../docs/SETUP.md)
- [API](../../docs/API.md)
- [Root README](../../README.md)

## Features

- Customer: menu (food images, PKR), cart, checkout, orders, OTP email login
- Admin: AdminLTE — products + all orders
- Middleware role cookie `fo_role` — admins blocked from customer shopping routes

## Run

```bash
npm run serve:web
```

Requires gateway on `:3001`.
