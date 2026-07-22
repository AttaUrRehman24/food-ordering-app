# DR & operations runbooks ( Documentation §14)

## Failover (Postgres primary unreachable)

1. Confirm `/health/ready` on Identity/Catalog/Order returns `down` for `postgres`.
2. Promote sync standby (managed PG / Patroni) — RTO target ≤ 30 min.
3. Update `DATABASE_URL` / PgBouncer primary endpoint.
4. Rolling restart services; verify readiness ok.
5. Confirm order accept path recovers; check Kafka consumer lag drain.

**RPO:** ≤ 5 min via continuous WAL archiving (PITR).

## Partition restore

1. Identify missing/corrupt monthly partition (`orders_YYYY_MM` / `notifications_YYYY_MM`).
2. Restore from base backup + WAL to a staging instance.
3. `ATTACH PARTITION` after validation; run `ANALYZE`.
4. Document in incident ticket.

## DLQ drain (Article IV.4)

1. Alert: `NotificationDlqNonEmpty` or Grafana DLQ panel.
2. Inspect topic `notification.<channel>.DLQ` (Kafka console / kcat).
3. Fix root cause (provider outage, bad payload).
4. Replay messages to the primary topic; confirm DLQ lag → 0.
5. Page clears when increase returns to 0.

## Secret rotation

1. Rotate in secrets manager (never commit `.env`).
2. Roll JWT RSA keys with dual-verify window if needed.
3. Restart Identity → Gateway → Realtime (public key consumers).
4. Revoke sessions if key compromise suspected (`POST /v1/auth/logout-all` for affected users).

## Kafka broker loss (chaos)

1. Kill one broker; RF ≥ 3 keeps partitions available.
2. Consumers continue from offsets — order intake is replayable (no lost accepted orders).
3. Restore broker; ISR catches up.
