// Idempotency module per [[backend-service-shape]] §2 + [[idempotency-strategy]]
// + [[idempotency-keys-schema-research]] F7. Idempotency-Key HTTP middleware:
// INSERT … ON CONFLICT into idempotency_keys, lock + replay, parameter-mismatch
// detection via JSONB request_params (D11.1).
//
// First write to idempotency_keys from this module is the trigger event for
// [[reaper-schedule-deferral]] — slice 6.5 reopens at that PR.

export {};
