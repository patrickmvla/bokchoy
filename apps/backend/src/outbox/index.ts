// Outbox module per [[backend-service-shape]] §2 + §4 + [[wallet-mechanics]]
// §4a / §4b / §4c. staged_jobs poller (250ms initial cadence,
// SELECT … FOR UPDATE SKIP LOCKED), webhook delivery, dead-letter handling.
// Co-hosted with HTTP API in this Bun process at <5 replicas.

export {};
