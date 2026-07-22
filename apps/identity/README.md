# Identity (`apps/identity`)

Users, credentials, RS256 JWT, OTP (emailed via Notification), sessions, RBAC.

| | |
|---|---|
| HTTP health | `:3002` |
| gRPC | `:50051` |
| Proto | `libs/proto/protos/identity.proto` |

## Docs

- [Setup / ADMIN_* env](../../docs/SETUP.md)
- [API auth flows](../../docs/API.md)
- [Notification SMTP](../notification/README.md)

## Run

```bash
npm run identity:migration:run
npm run serve:identity
```

Admin seeder runs on boot using `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_PHONE` / `ADMIN_NAME`.

OTP codes are published on Kafka topic `user.otp.requested` (email channel only).
