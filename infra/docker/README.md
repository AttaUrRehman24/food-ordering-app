# Local infrastructure (Milestone 0)

Docker Compose stack for local development only (clarification Q7 — no cloud Terraform).

Also see: [docs/SETUP.md](../../docs/SETUP.md) · [scripts/dev-up.sh](../../scripts/dev-up.sh) · [root README](../../README.md)

## Services

| Container | Port |  Documentation mapping |
|---|---|---|
| Postgres 16 | 5432 | §6 Data architecture |
| Redis 7 | 6379 | §7 Redis design |
| Kafka 3.9 (KRaft) | 9092 | TDR-1 / §5.1 |
| MinIO | 9000 / 9001 | §13 object storage (local S3) |

## Commands

From repo root:

```bash
npm run infra:up
npm run infra:logs
npm run infra:down
# or via one-file script:
./scripts/dev-up.sh infra
```

Compose file: `infra/docker/docker-compose.yml`
