# Notification (`apps/notification`)

Kafka consumers for OTP, welcome, order events. Channels: email (SMTP), SMS/push stubs, in-app.

| | |
|---|---|
| HTTP health | `:3006` |

## Docs

- [SMTP env](../../docs/SETUP.md#notification-otp-email)
- [OTP API](../../docs/API.md)
- [Identity OTP publish](../identity/README.md)

## Run

```bash
npm run notification:migration:run
npm run serve:notification
```

OTP is **email-only**. Without `SMTP_*`, delivery is logged / stored in `notifications` table for local debugging.
