---
type: decision
features: [wallet, http-contract, backend-stack]
related: ["[[wrapper-shape]]", "[[wallet-mechanics]]", "[[backend-stack]]", "[[backend-service-shape]]", "[[idempotency-strategy]]", "[[player-auth]]", "[[multi-tenant-rls-research]]", "[[http-contract-research]]", "[[url-pattern-research]]", "[[otel-stack-research]]", "[[reaper-schedule-deferral]]", "[[gaps]]"]
created: 2026-05-09
confidence: high
---

# Wallet HTTP contract: `POST /v1/wallets/{walletId}/{verb}` + camelCase body + Stripe-wrapped errors + SDK API key auth + Standard Schema validator + co-shipped idempotency middleware + manual OTel spans + `TenantTx` branded type

## Implementation status (added 2026-05-11)

**Slice 8.1 cluster fully LANDED.** All four sub-slices shipped + verified end-to-end against local-docker (smoke transcripts in `/tmp/smoke-8-1{a,b,c,.6}.sh`):

| Slice | Date | Surface | Verification |
|---|---|---|---|
| 8.1a — auth + RLS type | 2026-05-10 | `apps/backend/src/auth/api-key-middleware.ts`, `packages/db/src/schema/api-keys.ts`, `packages/db/scripts/create-api-key.ts`, `packages/db/src/with-tenant.ts` (`TenantTx` brand) | smoke 9/9 |
| 8.1b — telemetry + idempotency middleware | 2026-05-10 | `apps/backend/src/telemetry.ts`, `@hono/otel` mount in `index.ts`, `apps/backend/src/idempotency/middleware.ts` (4-state machine + body-hash + 30s lock) | smoke 9/9 + OTel spans confirmed |
| 8.1c — wallet handler + error middleware | 2026-05-10 | `apps/backend/src/wallet/index.ts` (credit/debit + Standard Schema validator + manual `tracer.startActiveSpan`), `apps/backend/src/infra/error-middleware.ts` (Stripe-wrapped + BCxxx→HTTP map) | smoke 13/13 + balance reconciles |
| 8.1.6 — concurrency hardening | 2026-05-11 | `apps/backend/src/idempotency/middleware.ts:137-200` — `INSERT ... ON CONFLICT DO NOTHING` + race-loser re-SELECT path per `[[idempotency-strategy]]` §Concurrency canonical pattern | concurrency smoke: 1×200 + 9×409 (same body), 1×200 + 4×409 + 5×422 (mixed body), 0×500 |

**Cascades closed:** all G1-G8 contract obligations realized in code; race-loser semantics for G4 case 4 enforced at the implementation layer per slice 8.1.6 (see `[[idempotency-strategy]]` §Concurrency for the canonical pattern). The contract below stands as written; this status block records the closure.

**Open carry-forward (deferred per the §Slice ladder spec, NOT new):** `walletDeidentifyPlayer` HTTP handler (DSR flow) + `bootstrapProjectReasonCodes` HTTP handler (admin-only, needs Better Auth org plugin). Both intentionally out of slice 8.1 scope per §Auth surface "Other wrapper handlers deferred."

# Decision

The HTTP boundary for `@bokchoy/wallet` consumers — slice 8.1 first wallet handler and every subsequent handler that wraps an `@bokchoy/wallet` function. Resolves all 8 sub-decisions in `[[gaps]]` GAP 9.

## Slice ladder

Slice 8.1 splits into three sub-slices. Each independently smoke-testable; each ships a snapshot the team can ship/rollback atomically.

### Slice 8.1a — auth + RLS type

1. `api_keys` table schema migration: `id UUID PK DEFAULT gen_random_uuid(), project_id UUID NOT NULL FK to projects(id) ON DELETE CASCADE, key_prefix TEXT NOT NULL UNIQUE (12-char prefix `bk_<env>_<8-rand>` for O(log n) lookup), key_hash BYTEA NOT NULL (HMAC-SHA-256 of the secret half, never plaintext), name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_used_at TIMESTAMPTZ NULL, revoked_at TIMESTAMPTZ NULL`. RLS policy `tenant_isolation` (project_id = `current_setting('app.current_tenant')::uuid`). FORCE RLS. `bokchoy_app` GRANT SELECT/INSERT/UPDATE.
2. Bearer-validation Hono middleware at `apps/backend/src/auth/api-key-middleware.ts`. Parses `Authorization: Bearer <full-key>`; splits into prefix + secret; SELECTs `api_keys` WHERE `key_prefix = $1 AND revoked_at IS NULL`; HMAC-compares the secret; populates `c.set('projectId', row.project_id)`; updates `last_used_at` async; raises 401 on miss/expired/revoked.
3. `packages/db/scripts/create-api-key.ts` CLI: takes `--project-id` + optional `--name`, generates `bk_live_<32-rand>` (or `bk_test_` for dev), prints once, never readable again.
4. `TenantTx` branded type in `@bokchoy/db`: `type TenantTx = Tx & { readonly __brand: 'TenantTx' }`. `withTenant<T>(db, projectId, fn: (tx: TenantTx) => Promise<T>): Promise<T>` — the brand exists only inside the callback. Code that needs RLS-protected accessors can require `TenantTx` at the type level. Single-line type change in `@bokchoy/db/src/with-tenant.ts`.
5. Smoke test: `GET /v1/health-authed` route. Requires Bearer; calls `withTenant(db, c.get('projectId'), async (tx) => { ... })`; returns 401 on missing/invalid key, 200 with `{ ok: true, projectId }` on valid key.

### Slice 8.1b — telemetry + idempotency middleware

1. `apps/backend/src/telemetry.ts`: `NodeSDK` from `@opentelemetry/sdk-node` with `OTLPTraceExporter` from `@opentelemetry/exporter-trace-otlp-http`. Service name `bokchoy-backend`, version from `package.json`. Endpoint via `OTEL_EXPORTER_OTLP_ENDPOINT` env var (Honeycomb in prod: `https://api.honeycomb.io/v1/traces` + `OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=...`). Unset → `ConsoleSpanExporter` for dev. Sampler: `AlwaysOn` at slice 8.1b; revisit at scale.
2. `@hono/otel` middleware mounted at app level: `app.use(httpInstrumentationMiddleware({ serviceName: 'bokchoy-backend', serviceVersion: pkg.version }))`. Captures HTTP method, URL, route, status code, configurable headers (`user-agent`, `idempotency-key`).
3. Idempotency-Key middleware at `apps/backend/src/idempotency/middleware.ts` per `[[idempotency-strategy]]` D2-α. Header `Idempotency-Key`, ≤255 chars ASCII. Server-derived natural-key path stays primary (`transactions(wallet_id, source_event_id)` UNIQUE); the middleware writes to `idempotency_keys` only when the header is supplied. Lookup by `(project_id, idempotency_key)` UNIQUE. Three states emerge per `[[idempotency-keys-schema-research]]` F6: NULL `locked_at` → INSERT row with `locked_at = now()`, run handler, UPDATE `response_status`/`response_body`/`completed_at` on completion. `locked_at` recent + `completed_at` set → REPLAY (return cached `response_status` + `response_body`). `locked_at` recent + `completed_at` NULL → 409 `{error:{code:'BC001'}}`. `locked_at` recent + body fingerprint mismatch → 422 `{error:{code:'BC002'}}`. **Trips `[[reaper-schedule-deferral]]` reopen trigger** — first non-test/non-script `INSERT INTO idempotency_keys` lands here. Schedule the reaper per `[[reaper-schedule-research]]` option (a) pg_cron in slice 8.1b OR slice 8.1c follow-on (small).
4. Smoke test: `/health` route now emits a span; `/v1/health-authed` enforces idempotency on POST variant.

### Slice 8.1c — wallet handler

1. `POST /v1/wallets/{walletId}/credit` + `POST /v1/wallets/{walletId}/debit` route handlers in `apps/backend/src/wallet/index.ts`. Validation via `@hono/standard-validator` against a Zod 4.x schema. Body shape (camelCase):

```ts
const creditBody = z.object({
  amount: z.number().positive().max(9_007_199_254_740_992),  // JS-safe per [[wrapper-shape]]
  currencyId: z.string().uuid(),
  reasonCode: z.string().min(1).max(64),
  sourceEventId: z.string().min(1).max(255).optional(),
  relatedId: z.number().int().positive().optional(),
  relatedType: z.enum(['loot_roll', 'iap_receipt', 'compensation_grant']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
```

Handler shape:

```ts
app.post('/v1/wallets/:walletId/credit',
  apiKeyMiddleware,
  idempotencyMiddleware,
  zValidator('json', creditBody),
  zValidator('param', z.object({ walletId: z.string().uuid() })),
  async (c) => {
    const projectId = c.get('projectId');
    const { walletId } = c.req.valid('param');
    const body = c.req.valid('json');
    const idempotencyKeyId = c.get('idempotencyKeyId');  // populated by idempotency middleware

    const txnId = await withTenant(db, projectId, async (tx) => {
      const tracer = trace.getTracer('@bokchoy/wallet');
      return tracer.startActiveSpan('wallet.credit', {
        attributes: {
          'db.system': 'postgresql',
          'db.operation': 'wallet_credit',
          'bokchoy.project_id': projectId,
          'bokchoy.wallet_id': walletId,
          'bokchoy.amount': body.amount,
          'bokchoy.currency_id': body.currencyId,
          'bokchoy.reason_code': body.reasonCode,
        },
      }, async (span) => {
        try {
          return await walletCredit(tx, { projectId, walletId, ...body, idempotencyKeyId });
        } catch (err) {
          if (err instanceof Error) {
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          }
          throw;
        } finally {
          span.end();
        }
      });
    });

    return c.json({ id: txnId, walletId, status: 'completed' }, 200);
  }
);
```

2. Hono error middleware at `apps/backend/src/infra/error-middleware.ts`:

```ts
app.onError((err, c) => {
  if (err instanceof WalletError) {
    return c.json({
      error: {
        code: err.code,
        message: err.message,
        ...err.details,  // BCxxx-specific fields flattened into the error object
      }
    }, walletErrorToHttpStatus(err.code));  // BC001→409, BC010/BC021/BC022/BC050/BC060→422, BC020/BC040→500, BC002→422 (mismatch)
  }
  // Validator failure → 400 with structured issues
  if (err instanceof HTTPException && err.status === 400) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: ... } }, 400);
  }
  // Unknown → 500
  console.error('Unhandled error', err);
  return c.json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal error' } }, 500);
});
```

3. Smoke test against local-docker covering: happy-path credit (200 + transaction id), BC010 InsufficientFunds (debit on empty wallet → 422 + `{error:{code:'BC010',walletId,requested,available}}`), BC020 TenantMismatch (key-tenant mismatch → 500 — defense-in-depth), BC021 WalletNotFound (404-shaped — wait, BC021 is 422 per `[[wallet-mechanics]]` §SQLSTATE; spell-checked), BC022 CurrencyMismatch (422), BC050 ReasonCodeNotRegistered (422 via 23503 translation), idempotency replay (same key + same body → 200 with cached response), BC001 IdempotencyKeyInUse (409), BC002 IdempotencyKeyMismatch (422), 401 missing Bearer, 401 invalid Bearer, 401 revoked Bearer.

## URL pattern (G1 + G8)

`POST /v1/{resource-plural}/{id}/{verb}`. Slash-suffix-verb on resource id. Production-cited × 2 ecosystems via `[[url-pattern-research]]` (Stripe + GitHub, 10+ named endpoints between them).

| Wrapper | URL | Auth | Slice |
|---|---|---|---|
| `walletCredit` | `POST /v1/wallets/{walletId}/credit` | SDK API key | 8.1c |
| `walletDebit` | `POST /v1/wallets/{walletId}/debit` | SDK API key | 8.1c |
| `walletDeidentifyPlayer` | `POST /v1/players/{playerId}/deidentify` | TBD (cockpit admin OR DSR flow) | post-8.1 |
| `bootstrapProjectReasonCodes` | `POST /v1/projects/{projectId}/bootstrap-reason-codes` | TBD (cockpit admin) | post-8.1 |

`projectId` from validated API-key row (`c.get('projectId')`), NOT from path or header. `walletId`/`playerId`/`projectId-as-resource-id` from URL path. `playerId` for credit/debit is server-derived from the wallet row (wallet → player FK), not in the request body.

**Plural collection names** (Stripe + GitHub × 2 production cites). **Multi-word verbs kebab-case** (GitHub `/update-branch` × 1 production cite). **POST not PUT** — non-idempotent at HTTP layer (idempotency is server-derived per `[[idempotency-strategy]]`; HTTP-level POST matches Stripe's choice for the same semantic).

**API version: `/v1/`.** Stripe ships `/v1/` for ~10 years; Cal.com ships `/v2/` (one redesign). What comes after `v1`: nothing for years. Backward-compatible additive evolution within `/v1/`. If date-granularity breaking changes ever surface, ship via `Bokchoy-Version: YYYY-MM-DD` request header (Stripe pattern). Path `/v2/` only on fundamental redesign — not planned for MVP.

## Body shape and casing (G1)

**camelCase body fields at the wire.** TS-native default; matches `@bokchoy/wallet` wrapper API surface; removes wire-↔-TS transformation layer. Customer language cluster is TS (camel native) + C# (PascalCase native — `[JsonPropertyName("walletId")]` one-line ceremony) + C++ (no convention; team picks). Stripe's snake_case is real-money fintech context targeting Ruby/Python/Go/Java/PHP/.NET — different cluster. (production-cited via Better Auth + Hono ecosystem / high; deviates from Stripe-snake-case but consistent with stack-native shape.)

**Response shape: top-level resource.** No `data` wrapper. `{ "id": <txnId>, "walletId": "...", "status": "completed" }` — Stripe-shape resource-at-top-level (production-cited × 4 in `[[http-contract-research]]`).

## Error response shape (G5)

**(X) Stripe-wrapped:** `{ "error": { "code": "BC010", "message": "Insufficient funds", "walletId": "...", "requested": 100, "available": 50 } }`. The `WalletError.code` becomes `body.error.code`; `WalletError.details` fields flattened as siblings inside `error`.

Production-cited × 2 ecosystems (Stripe + Cal.com). **Defended on customer-SDK-language asymmetry:** BokChoy's customer ecosystem ships Unity (C#) and Unreal (C++); future BokChoy SDKs in those languages benefit asymmetrically — picking (X) keeps the polyglot path open. Picking (Y) flat-top-level closes it without explicit revisit. The Better-Auth-internal-consistency cost ((Y)'s strongest argument) is bounded — auth and wallet ship as different SDK products at customer integration boundary; uniform-within-each-product is the right granularity.

**HTTP status mapping (per `[[wallet-mechanics]]` §SQLSTATE):**

| BcCode | HTTP | Notes |
|---|---|---|
| BC001 | 409 | IdempotencyKeyInUse — middleware-raised |
| BC002 | 422 | IdempotencyKeyMismatch — middleware-raised, body fingerprint mismatch |
| BC010 | 422 | InsufficientFunds |
| BC020 | 500 | TenantMismatch — defense-in-depth, should never fire from well-formed callers |
| BC021 | 422 | WalletNotFound |
| BC022 | 422 | CurrencyMismatch |
| BC030 | reserved | PolicyViolation — not raised today |
| BC040 | 500 | ConfigurationError — anon_secret missing |
| BC050 | 422 | ReasonCodeNotRegistered — translated from PG 23503 |
| BC060 | reserved | CurrencyNotFound |

`409 → idempotency_error` direct precedent: Stripe SDK `RequestSender.ts:329` retries on 409 by design — BokChoy preserves the convention (per `[[idempotency-strategy]]` cite).

Validation errors (Zod / Standard Schema): `400 { "error": { "code": "VALIDATION_ERROR", "message": "...", "issues": [...] } }`. The `issues` array carries Standard Schema's `Issue` shape (`message`, `path`).

**Per-error-code structured detail fields are bespoke vs payment-API convention (added 2026-05-11 per `[[error-detail-numeric-serialization-research]]`).** The Stripe-wrapped envelope `{ error: { code, message, ...details } }` flattens `WalletError.details` fields as siblings of `code`/`message` (e.g., BC010 surfaces `walletId` + `requested` + `available`; BC022 surfaces `walletCurrency` + `requested`). Production payment-API survey (Stripe + Square + PayPal × 3) does NOT ship structured numeric detail fields — they abstract numerics to categorical decline codes (`decline_code: "insufficient_funds"`) and force the caller to refetch the related resource for current numeric state. **BokChoy's pattern intentionally diverges** because the customer profile differs: BokChoy's wallet SDK is consumed by **game designers during development** (developer-facing SDK UX), not by end-users. Designers hit BC010 / BC022 / BC050 errors 100× while building; debug-time numeric snapshot at the error point is more valuable than the production-payment-API "categorical-only + refetch" posture optimized for end-user error UX. Reversibility-asymmetry favors information-rich now: deleting fields is breaking-but-tractable post-launch, adding fields requires versioned bump. See `[[wrapper-shape]]` Fork 2 amendment 2026-05-11 for the typing defense (STRING-typed numerics for postgres-NUMERIC-precision-preservation). **Revisit-when:** customer profile shifts to player-facing API (where end-users see error JSON directly without SDK mediation) → reopen and reconsider Stripe-style categorical-only.

## Validator (G2)

**`@hono/standard-validator` + Zod 4.x as the schema lib.** Standard Schema spec v1.1.0 (2025-12-15) jointly authored by Zod/Valibot/ArkType maintainers (`[[http-contract-research]]` Source 12). better-call already speaks `StandardSchemaV1.Issue` natively. `@hono/standard-validator` accepts any Standard Schema-compliant validator; switching from Zod to Valibot later requires changing schema files only, not route middleware. Zod-direct via `@hono/zod-validator` is also viable but couples permanently to Zod.

Add to root `package.json` catalog: `@hono/standard-validator`, `zod` (latest 4.x stable). Confidence: high (idiom-cited via `idioms/typescript.md` line 75; spec-cited × 1; ecosystem-defining via three validator-author collaboration).

## Auth surface (G3 + G8)

**SDK API key (`Authorization: Bearer <key>`)** validated against `api_keys` table. Co-shipped in slice 8.1a.

`api_keys` schema (full spec in slice 8.1a above). Key format `bk_<env>_<random>`:
- `bk_live_<32-byte hex>` for production keys
- `bk_test_<32-byte hex>` for test keys
- env-prefix prevents prod-key-in-dev mishaps (Stripe pattern).

Stored as `key_prefix TEXT` (first 12 chars, indexed for lookup) + `key_hash BYTEA` (HMAC-SHA-256 of full key, never reversible). Compare full key by: parse → extract prefix → SELECT row by prefix → HMAC the supplied key → constant-time compare against `key_hash`.

`projectId` derives from validated key row. NOT from request header (no `BokChoy-Project-Id` redundancy). NOT from path. The trust boundary: validated API key → `c.set('projectId', row.project_id)` → `withTenant(db, projectId, fn)` → RLS GUC set → handler runs. RLS fail-closed per `[[multi-tenant-rls-research]]`.

**Other wrapper handlers deferred:**
- `walletDeidentifyPlayer` — needs DSR flow definition (player-initiated GDPR request vs admin-initiated). Different auth surface. Different slice.
- `bootstrapProjectReasonCodes` — admin-only; needs cockpit admin (Better Auth org plugin). Different slice.

## Idempotency middleware (G4)

**Co-shipped in slice 8.1b.** Per `[[idempotency-strategy]]` D2-α. The wallet handler is non-trivial without idempotency — first-handler smoke test must validate idempotent retry behavior, which is the load-bearing property of `[[idempotency-strategy]]`. Stub-then-build-later means the smoke test can't validate the property the strategy exists to enforce.

Middleware shape: parse `Idempotency-Key` header (≤255 chars ASCII per RFC 8941 Structured Header String semantics); SELECT `idempotency_keys` WHERE `(project_id, idempotency_key)`. Three branches:

1. **Row not found:** INSERT with `locked_at = now()`, `request_method`, `request_path`, `request_params (JSONB)`, `idempotency_key`, `created_at`. Run handler. UPDATE `response_status`, `response_body`, `completed_at`. Set `c.set('idempotencyKeyId', id)` so wallet handler passes it through to wrapper.
2. **Row found + `completed_at` set + body matches:** REPLAY. Return cached `response_status` + `response_body`. Wrapper not invoked.
3. **Row found + `completed_at` set + body mismatch:** 422 `{error:{code:'BC002'}}`.
4. **Row found + `locked_at` recent + `completed_at` NULL:** 409 `{error:{code:'BC001'}}`. (Server-side: lock timeout 30s; if `locked_at` older, reset and proceed.)

Body-mismatch detection: hash the canonical-JSON-serialized body for comparison (smaller storage than full JSONB). Open thread per `[[idempotency-keys-schema-research]]` F1 — defer canonicalization-algorithm pick to slice 8.1b implementation.

**Trips `[[reaper-schedule-deferral]]` reopen trigger.** First non-test/non-script `INSERT INTO idempotency_keys` lands in slice 8.1b. Schedule the reaper per `[[reaper-schedule-research]]` option (a) pg_cron — either in slice 8.1b directly (paired with the middleware) or as slice 8.1.5 follow-on. Pick at /implementation seat.

**JSON-by-construction contract (added 2026-05-11 per `[[replay-non-json-body-research]]`):** handlers behind `idempotencyMiddleware` MUST emit JSON. Non-JSON emission is **undefined behavior**, NOT a supported case. Current code at `apps/backend/src/idempotency/middleware.ts:266-273` falls back to `null` body on JSON-parse failure; that fallback is **defense-in-depth**, not a contract guarantee — REPLAY of a non-JSON original returns `c.json(null, status)` (JSON `null` literal body with original status), which is structurally OK but discards the original body. Production-cited × 3 — Brandur `rocket-rides-atomic` schema is `response_body JSONB NULL` (JSON-only by construction; non-JSON cannot be stored as native JSONB); Stripe API surface is JSON-only by product contract; Shopify GraphQL `@idempotent` directive is JSON-only by scope. Docs-cited × 1 — IETF draft 07 §2.6 non-normative on format details, delegates to implementations. **Revisit-when:** any new handler in `apps/backend/src/` that returns a non-JSON Content-Type and lives behind `idempotencyMiddleware` triggers reopening with the new use case named (e.g., binary file download with idempotent retry, server-side-rendered HTML with idempotency token, etc.). At that point the (β) cache-raw-bytes alternative becomes a real ask with a real consumer; it is currently a phantom-problem solution per CLAUDE.md YAGNI and is rejected.

## TenantTx branded type (G6)

**Single-line type change in `@bokchoy/db/src/with-tenant.ts`** (slice 8.1a):

```ts
type TenantTx = Tx & { readonly __tenantBrand: unique symbol };

export async function withTenant<T>(
  db: Db,
  projectId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${projectId}, true)`);
    return fn(tx as TenantTx);
  });
}
```

The brand exists only inside the callback scope. Future RLS-protected accessors that need tenant-scoping can require `TenantTx` at the type level (not raw `Tx`). The pattern stays opt-in; existing `Db | Tx` accept-type in `@bokchoy/wallet` wrappers stays — they're robust against either, and the wrappers' SQL-side check (`current_setting('app.current_tenant')::uuid`) is the runtime defense.

Closes `[[backend-stack]]` F1 mitigation #2 open thread. Closes the F1 cascade obligation in state.md trigger watchpoints.

## OTel SDK + exporter (G7)

**Co-shipped in slice 8.1b.** Per `[[otel-stack-research]]`:

- `apps/backend/src/telemetry.ts` — single-file bootstrap (modular monolith MVP per `[[backend-service-shape]]`; revisit if cockpit ships as separate deploy).
- Stack: `@opentelemetry/api` + `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http` + `@opentelemetry/semantic-conventions` + `@opentelemetry/resources` + `@hono/otel`.
- **NO `@opentelemetry/auto-instrumentations-node`** — broken on Bun per `[[otel-stack-research]]` F1 (issue #3775 open 2.5yr; #13165 shimmer-patching at bundle layer).
- **Honeycomb** as exporter target. Free tier 20M events/month; BokChoy indie peak ~7.7M events/month — comfortably within. Endpoint via `OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io/v1/traces` + `OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=<key>`. Unset → ConsoleSpanExporter for dev.
- Manual `tracer.startActiveSpan` calls inside `@bokchoy/wallet` wrapper bodies (slice 8.1c) replace the existing `// TODO(otel)` markers. Span attributes per the `bokchoy.*` namespace named in `[[wrapper-shape]]` Engineering substance.
- Sampler: `AlwaysOn` at slice 8.1b. Revisit at scale (parent-based sampler at higher traffic).
- Propagator: W3C TraceContext (OTel default). Revisit if a customer needs Datadog or Jaeger propagation.

## Engineering substance applied

- **Consistency:** SERIALIZABLE not required (per `[[wallet-mechanics]]` Amendment Part 1 A2 — single-wallet FOR UPDATE row lock + READ COMMITTED). Idempotency check is *inside* the same transaction as the wallet mutation per `[[idempotency-strategy]]`. End-to-end-typed via Standard Schema → wrapper params → SQL function args → typed response. RLS GUC set inside `withTenant`; queries outside `withTenant` fail-closed per `[[multi-tenant-rls-research]]`.
- **Failure semantics:** at-least-once from client (mobile, lossy network); exactly-once observable from server. 24h TTL on idempotency keys; beyond it retry is treated as new request. Network partition during operation: Postgres UNIQUE on `(project_id, idempotency_key)` prevents double-write because dedup record + business write are in the same transaction; partial commit impossible.
- **Concurrency:** two requests with same key arriving milliseconds apart — first acquires row lock, second sees `locked_at` recent and returns 409 `BC001`. Lock timeout 30s; after timeout, treated as recoverable and re-locked. No client-wait-loop pattern.
- **Observability:** OTel spans at the Hono request boundary (`@hono/otel`) + at the wrapper-call boundary (manual `tracer.startActiveSpan`). Span attributes: `bokchoy.project_id`, `bokchoy.wallet_id`, `bokchoy.amount`, `bokchoy.currency_id`, `bokchoy.reason_code`, `db.system='postgresql'`, `db.operation='wallet_credit'`. On error: `span.recordException` + `span.setStatus({ code: ERROR })`. Page on: BC020 rate (defense-in-depth violation = caller bug); BC040 rate (anon_secret missing — config drift); idempotency lock-timeout rate (server-side hang signal); auth 401 spike (potential credential-stuffing).
- **Storage:** `api_keys` ~200 bytes/row × low cardinality (~10 keys per customer-project) = trivial. `idempotency_keys` per `[[idempotency-keys-schema-research]]`: ~200 bytes/row × 24h TTL × peak 3 writes/sec × project-count = ~50MB/day at indie tier per Brandur; bounded by reaper.
- **Networking:** HTTPS via Render ingress. `Authorization: Bearer <key>` header; `Idempotency-Key` header; `Bokchoy-Version` header (deferred until first breaking change). TLS 1.2+ enforced at Render.
- **Security:** trust boundary changes hands at Bearer-validation middleware (validated key → c.set('projectId')). Downstream code trusts `c.get('projectId')`. RLS GUC set inside `withTenant`. SDK API key per-project + revocable. Audit log on key creation (slice 8.1a script writes to `api_keys.created_at`); rotation cadence: customer-initiated, no forced rotation at MVP.

## Production-grade gates

- **Idiomatic** — TS-native + Hono + Standard Schema + Drizzle is the consensus 2026-Q2 stack per `[[backend-stack]]`. Slash-suffix-verb URL pattern is production-cited × 2 (`[[url-pattern-research]]` F1). Stripe-wrapped error envelope is production-cited × 2 ecosystems (`[[http-contract-research]]` F3). camelCase body matches TS-native default and `@bokchoy/wallet` wrapper API surface. **(idiom-cited × multiple; confidence: high)**
- **Industry-standard** — Stripe + Cal.com (TS-native B2B SaaS) + Better Auth (TS-native auth lib) + GitHub (REST-purist long-running) for various sub-decisions. Each subdecision has ≥2 production cites in `[[http-contract-research]]` + `[[url-pattern-research]]` + `[[otel-stack-research]]` + `[[idempotency-strategy]]`. **(production-cited × 5+; confidence: high)**
- **First-class** — Hono middleware composition for auth + idempotency + telemetry; Postgres native UNIQUE for idempotency dedup; `withTenant` Drizzle pattern from Supabase reference impl; `@hono/otel` Hono-org middleware (sidesteps Bun shimmer-patching); Standard Schema as the validator-neutrality interop layer. No workarounds. **(first-class-cited; confidence: high)**

## Rejected alternatives

### Alternative (a) — Flat-action `POST /v1/wallet/credit` URL pattern

**What:** body carries `wallet_id`; no `walletId` in path.
**Wins when:** the operation is collection-level or doesn't have a clear resource identifier.
**Why not here:** `[[url-pattern-research]]` F1 corrected my prior /design pick — Stripe ships `POST /v1/charges/{id}/capture` slash-suffix-verb on resource id, NOT flat. The "wallet" in `walletCredit(walletId, ...)` is an identified resource. Falsified by production source-walk.

### Alternative (b) — REST nested-resource `POST /v1/wallets/{walletId}/credits` (creates a "credit" record)

**What:** treats credit as a sub-resource of wallet; creates a transaction record.
**Wins when:** the action produces a first-class resource with its own URL (`GET /v1/wallets/{id}/credits/{creditId}`).
**Why not here:** BokChoy's `transactions` table has cross-cutting query patterns (project-scoped audit, player-scoped history, time-windowed faucet/drain) that don't map cleanly to wallet-scoped collection resource. Slash-suffix-verb is structurally one-to-one with the `walletCredit(...)` wrapper signature; nested-resource forces a rename layer between SDK call and wire shape.

### Alternative (c) — REST verb-slug at collection level `POST /v1/wallets/credit`

**What:** Cal.com-style hybrid with verb-as-segment but no resource id in path. `wallet_id` in body.
**Wins when:** operations are collection-level and don't address a specific resource.
**Why not here:** wallet credit/debit ARE resource-id-scoped (operate on a specific wallet). Cal.com's verb-slug applies to collection-level operations like "get all bookings." Different problem class.

### Alternative (Y) — Flat top-level error body `{ "code": "...", "message": "..." }`

**What:** the better-call/Better-Auth shape; HTTP status carries the "is-error" signal.
**Wins when:** SDK is TS-only AND consistency with Better Auth's own emission shape is the dominant value.
**Why not here:** BokChoy's customer ecosystem ships Unity (C#) and Unreal (C++); future polyglot SDKs benefit from Stripe-shape uniform `body.error.code` dispatch. (Y) closes the polyglot-SDK path without explicit revisit; (X) keeps it open. Asymmetric reversibility favors (X).

### Alternative (Z) — RFC 9457 problem+json

**What:** IETF-compliant `{ "type", "title", "status", "detail", "instance" }` + `application/problem+json`.
**Wins when:** IETF spec-conformance is a stated value AND the API is meant for cross-language enterprise tooling that consumes problem+json.
**Why not here:** `[[http-contract-research]]` Source 13 contradiction probe surfaced no major TS-native production API as adopter. Spec-cited only. BokChoy doesn't have a stated value for IETF-conformance over ecosystem convention.

### Alternative — Zod-direct via `@hono/zod-validator`

**What:** couple validator middleware permanently to Zod.
**Wins when:** team will never switch validators AND the simpler types pay back the coupling cost.
**Why not here:** Standard Schema interop is no-cost ergonomic equivalent. Zod 4.x ships native `~standard` interface; using `@hono/standard-validator` with a Zod schema works identically. Zero downside; future flexibility.

### Alternative — Defer OTel one slice

**What:** ship slice 8.1c without manual tracer.startActiveSpan calls; keep `// TODO(otel)` markers for one more slice.
**Wins when:** the slice scope is already too wide and another can absorb OTel separately.
**Why not here:** OTel was already deferred from slice 7.7. The rationale "wait for first consumer" matches slice 8.1 — consumer is now arriving. Adding OTel in slice 8.1b is bounded (~50 LOC for bootstrap + ~10 LOC per span call site); deferring means the first wallet handler ships without observability, which violates `[[wallet-mechanics]]` Amendment Part 1 A3 layer 1 commitment.

### Alternative — Single slice 8.1 (no split)

**What:** ship all 13 items as one atomic slice.
**Wins when:** PR-review discipline handles ~700 LOC in one review without missing edge cases.
**Why not here:** solo-dev review-surface scale + snapshot tracking. Three sub-slices (8.1a / 8.1b / 8.1c) keep each review surface manageable and let snapshots track progress per `[[mvp-feature-sequence]]` cadence.

## Failure modes

### F-Wallet-HTTP-1: API key leak via customer git commit / log

Customer commits Bearer key to public repo OR logs it in their server logs. Any reader of the leak can act as the customer's project until rotation.

**Mitigation:** key format `bk_<env>_<random>` is recognizable for secret scanners (GitHub native scanning, Trufflehog). Per-project key + revocable via `revoked_at` column + dashboard UI in cockpit slice. Rate limiter on Bearer-authenticated endpoints (per `[[idempotency-strategy]]` Engineering substance, in-process at MVP). Audit log on key creation/rotation/deletion (cockpit slice). Defense in depth via project-tier RLS — compromised key still scoped to project, not customer-tier or cross-project.

### F-Wallet-HTTP-2: Idempotency middleware locks a row that never completes

Server crash / network drop mid-handler leaves `locked_at` set, `completed_at` NULL. Subsequent retries return 409 until lock timeout.

**Mitigation:** lock timeout 30s; after expiry, middleware re-locks and re-runs handler. Document the timeout in SDK docs. SDK auto-retries on 409 with exponential backoff (Stripe SDK pattern at `RequestSender.ts:329`). Operator alert on `idempotency_keys WHERE locked_at < now() - 5m AND completed_at IS NULL` rate >0.1% (server-side hang signal).

### F-Wallet-HTTP-3: OTel exporter unreachable

Honeycomb endpoint down or auth misconfigured. Spans accumulate in SDK buffer; eventually drop.

**Mitigation:** OTLP exporter has internal retry + buffer; spans drop silently after buffer fill. **OTel is observability, not audit-of-record** — `transactions` table is the audit. Loss of spans is recoverable (bug investigation degraded but not impossible). Operator alert on `otel.exporter.errors` metric (the SDK self-reports).

### F-Wallet-HTTP-4: Slice 8.1c smoke test missing a corner case

13 items in slice 8.1c smoke test list above. Easy to miss one (e.g., a specific BCxxx code path).

**Mitigation:** smoke test list is in this vault entry verbatim (line items in slice 8.1c spec); slice 8.1c implementation must check off each. CI enforces by parsing the smoke test file and counting expected assertions ≥ list length.

### F-Wallet-HTTP-5: `Bokchoy-Version` header convention not designed when first breaking change ships

Ship `/v1/` indefinitely, hit a need for breaking change, no version-header convention exists.

**Mitigation:** revisit-when trigger below names the date for designing `Bokchoy-Version` header. Open thread tracked.

## Mitigations

(captured inline per failure mode; aggregated for runbook reference at slice 8.1c implementation)

- Secret scanning + per-project revocable keys + rate limiting + audit log (F-1)
- Lock timeout 30s + SDK auto-retry on 409 + operator alert on long locks (F-2)
- OTLP buffer + spans-as-observability-not-audit + exporter-error metric alert (F-3)
- Smoke test checklist parsing in CI (F-4)
- Revisit-when trigger for version-header design (F-5)

## Idiom citations

- `idioms/typescript.md` line 30 (*"discriminated unions over flag bags"*) — `WalletError.code` discriminant + `details` payload maps to `body.error.code` + flattened error fields.
- `idioms/typescript.md` line 65 (*"pass objects, not positional args"*) — Hono handler reads `c.req.valid('json')` as object; consistent with wrapper signatures.
- `idioms/typescript.md` line 75 (*"For libraries … accept `StandardSchemaV1<unknown, T>`"*) — Standard Schema validator pick.
- `idioms/typescript.md` line 89 (*"OpenTelemetry, not print logging"*) — OTel SDK pick (manual instrumentation due to Bun shimmer breakage per `[[otel-stack-research]]` F1).

## Revisit when

- **Slice 8.2 ships customer-facing **outside** `wallet/` feature module** (catalog handler, loot handler, IAP handler) — confirm URL pattern (d) and Stripe-wrapped error envelope generalize cleanly. They should; flag if any feature has a structural reason to deviate.
- **First customer ships SDK in C# or C++** — verify Stripe-wrapped error envelope deserializes cleanly in those languages. If not, the (X)-vs-(Y) decision reopens for the SDK boundary specifically (HTTP wire shape stays).
- **First date-granularity breaking change** — design `Bokchoy-Version: YYYY-MM-DD` header convention. Stripe-pattern. Likely 12+ months from MVP launch.
- **Bun ships native OTel auto-instrumentation** (closes `[[otel-stack-research]]` F1 / Bun #28968) — reconsider auto-instrumentations-node packages. Replace manual `@hono/otel` with the auto path if the surface is meaningfully wider.
- **Honeycomb 20M-events/month free tier exceeded** — switch to Pro tier OR self-hosted collector OR Grafana Cloud (revisit Grafana free-tier limits). At BokChoy Studio+ tier (~575 writes/sec), Pro-paid is required regardless of vendor.
- **Standard Schema spec ships v2 with breaking changes** — pin `@standard-schema/spec` version + plan migration. Spec authors already coordinate; low-risk.
- **Better Auth player session integration** lands (pre-existing cascade — `[[backend-stack]]` cascade obligation #1) — `bootstrapProjectReasonCodes` and `walletDeidentifyPlayer` handlers ship under their respective auth surfaces. Different vault entry or amendment to this one.
- **`@bokchoy/wallet` flips to `"private": false`** (becomes published SDK) — reconsider error-class pattern (X)-vs-(Y) per `[[wrapper-shape]]` revisit-when. HTTP envelope stays Stripe-shape regardless; the change is at the SDK error class layer.
