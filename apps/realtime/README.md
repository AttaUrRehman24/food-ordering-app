# Realtime (`apps/realtime`)

JWT-authenticated WebSocket gateway; Kafka `order.status.changed` → Redis pub/sub fan-out.

| | |
|---|---|
| HTTP health | `:3007` |
| WS path | `/ws` (proxied by gateway at `:3001/ws`) |

## Docs

- [API WebSocket section](../../docs/API.md)
- [Gateway WS proxy](../gateway/README.md)
- [Setup WS caps](../../docs/SETUP.md)

## Run

```bash
npm run serve:realtime
```

Connect: `ws://localhost:3001/ws?token=<accessJWT>`.
