// Idempotency module per [[backend-service-shape]] §2 + [[idempotency-strategy]]
// + [[idempotency-keys-schema-research]] F7. Idempotency-Key HTTP middleware:
// INSERT … ON CONFLICT into idempotency_keys, lock + replay, parameter-mismatch
// detection via JSONB request_params (D11.1).
//
// **Slice 8.1b — first non-test/non-script writer to idempotency_keys lands
// here. Trips [[reaper-schedule-deferral]] reopen trigger; pg_cron reaper
// schedule deferred to slice 8.1.5 follow-on.**

export { type IdempotencyContext, idempotencyMiddleware } from './middleware';
