---
type: decision
features: [wallet, marketing]
related: ["[[wallet/credit-route-shape-research]]", "[[marketing/v1-shape]]", "[[marketing/currencies-endpoint-research]]", "[[wallet-http-contract]]", "[[wrapper-shape]]", "[[idempotency-strategy]]"]
created: 2026-05-14
confidence: high
---

# Slice M-1.5: player-centric credit/debit route + players.external_id schema + lazy-create semantics

## Decision

Four sub-decisions form the M-1.5 contract that unblocks M-4 (`@bokchoy/sdk-node`):

### (i) Route shape: B2 — player-centric URL

Two new routes:
- `POST /v1/players/:playerExternalId/wallets/:currencyCode/credit`
- `POST /v1/players/:playerExternalId/wallets/:currencyCode/debit`

Auth: `apiKeyMiddleware` (SDK-facing, project-scoped via Bearer key). Idempotency: `idempotencyMiddleware` per `[[idempotency-strategy]]` D2-α. URL params are URL-decoded then validated against the regex (see (ii)).

Currency code in URL = the `currencies.code` slug (e.g. `'gems'`). Backend handler does the project-scoped slug → currencyId lookup in one query. **Existing `POST /v1/wallets/:walletId/credit` route stays unchanged** — different audience (internal/admin callers who already hold a walletId).

Request body (both routes):
```ts
{
  amount: number,           // positive, <= Number.MAX_SAFE_INTEGER
  reasonCode: string,       // 1-64 chars, must exist in reason_codes for this project
  sourceEventId?: string,   // 1-255 chars, optional dedup hint
  relatedId?: number,       // optional, positive int
  relatedType?: 'loot_roll' | 'iap_receipt' | 'compensation_grant',
  metadata?: Record<string, unknown>,
}
```

Response 201 (bare data per `[[wallet-http-contract]]` G5):
```ts
{
  transactionId: number,
  walletId: string,         // UUID — the row that was credited (created if lazy)
  playerId: string,         // UUID — the row that was credited (created if lazy)
  balanceAfter: string,     // NUMERIC(20,4) as string to avoid float precision loss
}
```

Errors (Stripe-wrapped per G5):
- 400 `VALIDATION_ERROR` — body/URL-param validation failure (Zod hook).
- 401 `UNAUTHENTICATED` — `apiKeyMiddleware`.
- 404 `UNKNOWN_CURRENCY` — currencyCode not registered for this project. Response body includes `availableCodes: string[]` listing the project's currencies (the backend's contribution to the SDK's `UnknownCurrencyError` named-alternatives obligation).
- 422 BC050 `UNKNOWN_REASON_CODE` — reasonCode not in `reason_codes` for this project (existing wallet contract).
- 422 BCxxx WalletError variants — wallet_credit/debit raises preserved per `[[wallet-http-contract]]`.
- 5xx — Stripe-wrapped via `errorMiddleware`.

OTel spans: `wallet.credit_by_external_id` / `wallet.debit_by_external_id` with attributes `bokchoy.project_id`, `bokchoy.player_external_id_hash` (per (iv)), `bokchoy.currency_code`, `bokchoy.amount`, `bokchoy.reason_code`. Span IS NOT the existing `wallet.credit` — distinct operation name for filtering in observability.

### (ii) Schema migration: `players.external_id`

```sql
ALTER TABLE players
  ADD COLUMN external_id text;

ALTER TABLE players
  ADD CONSTRAINT players_external_id_check
  CHECK (
    external_id IS NULL
    OR external_id ~ '^[A-Za-z0-9._-]{1,128}$'
  );

CREATE UNIQUE INDEX players_project_id_external_id_unique
  ON players (project_id, external_id)
  WHERE external_id IS NOT NULL;
```

Nullable because existing player rows minted via Better Auth's anonymous/email-password flow (per `[[player-auth]] §2`) have no external_id — they were created from auth surfaces, not SDK credit. New player rows minted via SDK lazy-create (per (iii)) WILL have an external_id and may have NULL email.

Regex `^[A-Za-z0-9._-]{1,128}$` is URL-path-safe by construction (RFC 3986 unreserved characters minus `~`; `~` excluded because it carries shell/path-traversal connotations in some toolchains and the rest of the set is sufficient). 128-char ceiling matches Better Auth's organization-slug limit and is long enough for game-studio external-id schemes (typically `'player_<uuid4>'` or platform-account-id strings, both fitting in 64).

Case-sensitive (Postgres TEXT default). `'Player_123'` and `'player_123'` are distinct rows. Customer responsibility to be consistent.

### (iii) Lazy-create-player semantics

When the SDK calls credit with an unknown `(project_id, external_id)`:
1. INSERT a new `players` row with `external_id` set, `email = NULL`, `password_hash = NULL`. (INSERT...ON CONFLICT (project_id, external_id) DO NOTHING — race-safe.)
2. INSERT a new `wallets` row with `(project_id, player_id, currency_id)` matching the lazy-created player. (INSERT...ON CONFLICT (project_id, player_id, currency_id) DO NOTHING — race-safe.)
3. Proceed with the credit via the existing `wallet_credit` SQL function (or a new sibling function that wraps the lazy-create + credit in one statement — implementation choice).

Both INSERT...ON CONFLICT DO NOTHING constructs preserve atomicity under concurrent first-credit-from-same-player race: the second request sees the row already exists and proceeds to credit without error.

**DoS mitigation:** per-API-key rate-limit on `POST /v1/players/.../credit` (and `/debit`) routes — bound to the rate limit BokChoy ships generally on the SDK API surface. Specific rate-limit number is operations-team-pick at deploy time; default suggestion is 1000 req/min per API key (well above legitimate use; well below abuse-pattern volumes). Rate-limit infrastructure is `[[idempotency-strategy]]` adjacent — not part of M-1.5 if a project-level rate-limit middleware doesn't already exist; add as a separate slice if needed.

**Schema-comment fix at `packages/db/src/schema/wallet.ts:92`:** the comment claims lazy-create lives inside `wallet_credit` (B3-shape). Under (i)+(iii) above, lazy-create lives in the new player-centric handler/SQL function, NOT inside `wallet_credit`. **Delete the schema comment** as part of this slice — it became wrong when B2 won over B3.

### (iv) PII handling: customer-responsibility documentation, NOT BokChoy hashing

Stripe-metadata pattern. `players.external_id` is treated as customer-controlled opaque data. BokChoy:
- Does NOT validate `external_id` contents beyond the regex shape check.
- Does NOT transform/lowercase/normalize `external_id`.
- Does NOT hash `external_id` before emission to OTel spans by default.
- DOES emit a hash in OTel via the `bokchoy.player_external_id_hash` attribute — but the hash is for span-correlation across operations on the same player WITHOUT exposing the raw value. Implementation: `HMAC-SHA256(external_id, BOKCHOY_OTEL_PII_SALT).slice(0, 16)` — 16 hex chars of HMAC output, enough for span correlation, not reversible. The salt is environment-scoped (one per BokChoy deployment); rotating the salt rotates the hash namespace.

Documentation cascade owed to `SECURITY.md` (planned per `[[oss-sdk-only]]` cascade): one paragraph naming external_id as customer-controlled, advising customers not to use email/phone/PII as external_id, noting that the OTel hash is correlation-only and the raw value is stored only in the `players` table.

The hash design above is a compromise — the option I labeled "customer-responsibility doc" in the question; this adds the hash to keep BokChoy out of trouble if customers ignore the advice. The alternative ("hash with project-salt") would replace raw external_id with hash in ALL emission surfaces (logs, errors, etc.) which has higher friction. The compromise here logs the raw value ONLY in OTel and ONLY hashed, while error responses (e.g. `UnknownPlayerError`) can include the raw value because customers need to debug their own data.

## Reasoning

### (i) Route-shape defense

Per `[[wallet/credit-route-shape-research]]` F1 (production-cited × 3 at tier 2: PlayFab + Nakama + RevenueCat all player-centric single-call lazy-create; contradiction probe for walletId-in-path empty in game-economy class). RevenueCat URL shape is the closest direct cite (`/customers/{customer_id}/virtual_currencies/{currency_id}/actions/update_balance`).

B3 (body-encoded sibling) rejected on three counts: 1-of-5 production cites (PlayFab, but PlayFab's wider API is RPC-shaped without REST resource nesting — not a clean precedent for BokChoy's existing REST shape per `[[wallet-http-contract]]`); diverges from BokChoy internal-route consistency (every shipped POST uses URL path params for resource identifiers); keeps the SDK slug-resolver layer (~150 LOC of Cascade #1(a) work the SDK doesn't need under B2).

### (ii) Schema-migration regex defense

URL-safe-by-construction. Pre-emptive constraint prevents an entire class of adversarial inputs: path traversal (`../`), null-byte injection (`%00`), URL-special chars (`/`, `?`, `#`). Wide enough to cover the marketing-snippet shape `'player_123'` AND production game-studio external-id conventions (`'unity_uid_<uuid4>'`, `'steam_<steamid>'`, `'firebase_<uid>'`). 128-char ceiling matches Better Auth org-slug; halts pathological-length attacks at DB layer.

Case sensitivity preserves customer namespace control. The currencies-research lesson applies: don't silently transform customer-typed strings; let customers be consistent. Document this in the SDK docs.

Nullability accommodates the existing players-via-auth flow (`[[player-auth]] §2`). Backfilling existing rows with auto-generated external_ids is rejected: those players never had a customer-facing identifier, generating one creates a fake namespace that customers might rely on and then break when the migration is later cleaned up.

### (iii) Lazy-create defense

Production-convention × 3 (PlayFab, Nakama, RevenueCat — `[[wallet/credit-route-shape-research]]` F2). Matches the marketing snippet's "day-1 works" implication.

DoS-via-typo concern (a buggy customer client iterating malformed external_ids and creating unbounded player rows) is real but bounded. Mitigation depth: (a) URL regex limits external_id to 128 chars × URL-safe charset; (b) per-API-key rate limit (default 1000 req/min suggestion above); (c) per-project player-count alerting at observability layer (separate slice, not blocking). The rate-limit alone reduces a typo loop from "unbounded player creation" to "bounded by rate limit × time"; ops gets paged on player-count anomaly within minutes.

Schema-author-intent (the `wallet.ts:92` comment) ALSO endorsed lazy-create — just located in `wallet_credit` instead of in the new route handler. The semantics match; the location moves.

### (iv) PII handling defense

Customer-responsibility framing × 1 strong production cite (Stripe `metadata` field — Stripe doesn't validate or transform metadata content; customers can put PII in metadata at their own risk; Stripe's docs are explicit on this).

The hash-with-salt-on-OTel-only compromise is a defense-in-depth tweak rather than an axis change: customer-responsibility is the framing, but BokChoy avoids logging raw customer-controlled strings in observability surfaces where ops engineers might glance. Cost: 16-hex-char attribute in spans instead of raw external_id. Operators querying by external_id use the `players` table directly (where raw is stored) or compute the hash themselves with the deployment salt.

Full hash-everywhere (the "hash with project-salt before emission" option) was rejected because errors like `UnknownCurrencyError`/`UnknownPlayerError` need to relay readable values back to customers for debugging. Hashing those defeats the named-alternative-enumeration purpose. Selective hashing — OTel yes, customer-facing error responses no — is the right boundary.

## Engineering substance applied

- **Consistency model:** strong on the credit-write path via SERIALIZABLE-by-default Postgres transaction wrapping (player INSERT...ON CONFLICT + wallet INSERT...ON CONFLICT + wallet_credit). The two ON CONFLICT clauses prevent the lost-update class of races. Reads are not relevant — this is write-only.
- **Failure semantics:** at-least-once via `Idempotency-Key` header per `[[idempotency-strategy]]` D2-α. SDK auto-generates `bokchoy-sdk-retry-${uuid4()}` per `[[wallet-mechanics]]` Part 3 A17. Retries are safe because the IK middleware's NULL-locked-completed state machine handles replay.
- **Concurrency:** two concurrent first-credit-from-same-player creates race on `(project_id, external_id)` unique index → ON CONFLICT DO NOTHING resolves; both proceed to wallet INSERT, race on `(project_id, player_id, currency_id)` unique → same. Both proceed to wallet_credit which holds a FOR UPDATE row lock per `[[wallet-mechanics]]` Part 1 A2. Total race window is O(50µs); production tolerance is fine at MVP scale.
- **Observability:** `wallet.credit_by_external_id` span (distinct name) with `bokchoy.project_id`, `bokchoy.player_external_id_hash`, `bokchoy.currency_code`, `bokchoy.amount`, `bokchoy.reason_code`. Page on auth-fail rate (existing `admin.gate` alert pattern); page on `UNKNOWN_CURRENCY` rate exceeding 1% of credits (signals customer-side typo or docs gap).
- **Storage:** zero new tables. One column add on `players` + one unique index + one CHECK constraint. Atomic DDL; no data-rewrite migration needed because the column is nullable and existing rows already have NULL.
- **Security:** `apiKeyMiddleware` validates project-scoped Bearer per `[[wallet-http-contract]]` G3. RLS-protected `players` and `wallets` tables require the GUC chain through `withTenant` per `[[wallet-mechanics]]` §8 — same pattern as existing routes. External_id is URL-safe regex prevents adversarial input. Hash-on-OTel prevents inadvertent PII logging if customers ignore the customer-responsibility advice.

## Production-grade gates

- **Idiomatic** — route shape `/v1/players/:playerExternalId/wallets/:currencyCode/credit` matches RevenueCat verbatim + matches BokChoy internal `/v1/{resource}/:id/{action}` precedent from `[[wallet-http-contract]]` D1. ON CONFLICT DO NOTHING is Postgres-native lazy-create per the schema author's intent. URL-safe regex matches `[[idempotency-strategy]]` IK format constraint shape (different regex, same construction principle). *(production-cited × 3 internal + 3 external; confidence: high.)*
- **Industry-standard** — game-economy SDK player-centric single-call lazy-create has 3 tier-2 production cites (PlayFab + Nakama + RevenueCat) per `[[wallet/credit-route-shape-research]]`. Stripe-metadata-style customer-responsibility on opaque fields is canonical. *(production-cited × 3+ per axis; confidence: high.)*
- **First-class** — Hono native routing, Drizzle native ORM, Better Auth's session model unchanged (this is SDK-facing not auth-facing), Postgres native INSERT...ON CONFLICT for lazy-create. Zero new infrastructure; existing middleware composition (`apiKeyMiddleware` + `idempotencyMiddleware`) reused verbatim. *(first-class-cited; confidence: high.)*

## Rejected alternatives

### B3 — body-encoded `POST /v1/wallets/credit` with `{ playerId, currencyId, ... }` body
**What:** sibling route to existing `/v1/wallets/:walletId/credit`, takes the player + currency in the body instead of URL.
**Wins when:** schema-author-intent alignment is the dominant constraint (`wallet.ts:92` comment claimed lazy-create lives in `wallet_credit`; B3 implements that). Multi-language SDK ergonomics favor body-encoded (URL encoding is uglier in some HTTP client libraries).
**Why not here:** 1-of-5 production cites (PlayFab — RPC-shaped wider API, not REST precedent). Diverges from BokChoy's URL-path-param internal convention. Keeps SDK slug-resolver (~150 LOC) without reason. Schema comment is one line; fixable.

### B1 — Two-call: `POST /v1/wallets/upsert` returning walletId, then `POST /v1/wallets/:walletId/credit`
**What:** SDK calls upsert first to materialize the walletId, caches it per-process, then credits.
**Wins when:** SDK-side aggressive caching is desired (subsequent credits skip the upsert round-trip).
**Why not here:** rejected at research stage — zero game-economy SDK production cites use two-call patterns for currency credits. Extra round-trip per (player, currency) first-touch; cache invalidation question; weakens marketing-snippet ergonomics.

### B4 — Explicit `bokchoy.wallets.create({ player, currency })` in SDK, customer must call before first credit
**What:** SDK exposes a create method; customer's code calls it once per (player, currency) at game-session start; subsequent credits hit the credit route.
**Wins when:** wallet lifecycle awareness in the customer's game logic is desired (e.g., wallet-state-as-feature: "this player just unlocked the gems wallet").
**Why not here:** rejected at research stage — same as B1, zero game-economy production cites. Customers don't think about wallet lifecycle for currencies; they think about "credit X gems to player Y." Forcing the upsert call inverts the abstraction.

### Reject-with-UnknownPlayerError (Q3 alternative)
**What:** the credit route rejects unknown players with 404; customer must explicitly create players via a separate `POST /v1/players` endpoint.
**Wins when:** DoS-via-typo is the dominant concern AND rate-limiting infrastructure is unavailable. Suitable for systems where player creation is a meaningful event (logged, billed, indexed).
**Why not here:** rate-limiting bounds the DoS; marketing-promise day-1 framing is the dominant constraint; production-convention × 3 favors lazy-create. The alternative is the conservative-only-when-needed default; we don't need that conservatism at MVP scale.

### Full hash-everywhere PII handling (Q4 alternative)
**What:** hash external_id with project-salt before ANY observability or error emission. Customer-facing error responses say `UnknownPlayerError: 'hash:abc123...' is not a registered player` — uses the hash.
**Wins when:** strict PII-isolation is regulatory-mandated (HIPAA, similar) AND customers can't be trusted to follow the customer-responsibility doc.
**Why not here:** breaks the `UnknownPlayerError` named-alternative-enumeration purpose (customers can't debug from a hash). MVP audience is indie/SMB game devs with no regulatory PII pressure. Stripe-metadata-pattern is the right default. Revisit when first regulated-vertical customer ships (revisit-when trigger below).

## Failure mode

**Primary failure mode: lazy-create-player allows DoS-via-typo against `players` table.**

A customer's game client with a typo in player-id generation (e.g., timestamp-based external_ids without dedup) could attempt to credit thousands of distinct external_ids per minute. Without rate-limiting, this creates unbounded `players` rows.

Probability: low at MVP scale (2-person team customers per `[[cockpit-shape]]` (M2)) but real. The probability scales with customer count and customer code quality.

**Concrete scenario:**
- Customer ships game client with bug: `player_external_id = Date.now() + Math.random()` (intended to be deterministic, isn't).
- Game server proxies events: every game-event-batch credit re-mints `players` row + `wallets` row.
- BokChoy's `players` table grows by ~3000 rows/minute per customer with the bug.
- Without mitigation: BokChoy storage cost + index degradation; eventually Postgres pool exhaustion.

**Secondary failure mode: customer puts PII (email, phone, real name) in external_id, BokChoy logs it via OTel + error responses.**

Customer concept: external_id is opaque BokChoy storage; they map to their internal user record. Customer reality: developer-shorthand picks the user's email as the external_id because "it's already unique." Now BokChoy is processing PII without a DPA in place.

Probability: medium without explicit `SECURITY.md` documentation. Lower with documentation. Genuinely lower with the OTel-hash mitigation in place (raw value stays in `players` table; ops/observability surfaces have the hash).

**Tertiary failure mode: schema-comment-vs-implementation drift, third instance.**

The pattern across this session: schema comments describing semantics that aren't actually implemented (currency code-vs-slug naming; wallet_credit lazy-create; player external_id contract). Each one was a 1-line fix; each one cost a /research session to discover. The drift is the failure mode; the fix is the discipline of (a) deleting comments that don't match code AND (b) writing comments only when the surrounding code actually implements them.

## Mitigations

1. **Per-API-key rate limit on the new credit/debit routes.** Default suggestion: 1000 req/min per API key. Configurable per project. Existing rate-limit infrastructure status TBD — if absent, this is a separate slice that ships alongside M-1.5 OR M-1.5 ships without rate-limit and adds it as M-1.5.5 within one release.
2. **`SECURITY.md` external_id guidance.** One paragraph naming external_id as customer-controlled opaque data, advising against PII usage, noting that OTel emissions hash the value. Cascade obligation when `SECURITY.md` ships per `[[oss-sdk-only]]`.
3. **OTel hash-with-salt for `external_id` spans.** `HMAC-SHA256(external_id, BOKCHOY_OTEL_PII_SALT).slice(0, 16)`. Salt is deployment-environment-scoped. Customer-facing error responses keep raw value.
4. **Schema-comment audit.** As part of M-1.5 implementation, delete the schema comment at `packages/db/src/schema/wallet.ts:92` describing lazy-create-inside-wallet_credit semantics. The lazy-create lives elsewhere now. **Implementation seat MUST delete this comment** to close the third schema-vs-code drift.
5. **Player-count observability.** OTel metric `bokchoy.players.row_count` per project. Alert threshold: 50% week-over-week growth on a project that already has >1000 players — surfaces DoS-via-typo before it gets expensive. Separate slice from M-1.5; vault as a future obligation.

## Idiom citations

- `idioms/typescript.md` (Make impossible states unrepresentable) — `UNKNOWN_CURRENCY` 404 response includes `availableCodes: string[]` so SDK consumers can construct typed exception classes that enumerate alternatives, not a generic 404 message.
- `idioms/typescript.md` (Let the types flow end-to-end) — Drizzle schema → `wallet_credit_by_external_id` SQL function → handler response shape → SDK exports the same type. No duplication.
- `idioms/typescript.md` (Pass objects, not positional args) — SDK signature `wallets.credit({ player, amount, currency, reason })` follows; backend handler reads from validated body+param objects, not positional URL+body concat.
- `[[wallet-http-contract]]` G5 — bare-success-Stripe-wrapped-errors precedent reused verbatim.
- `[[idempotency-strategy]]` D2-α — IK middleware composition + SDK-driven IK format `bokchoy-sdk-retry-${uuid4()}`.
- `[[wrapper-shape]]` D2-α — params-object signature for the new wallet wrapper if one is created (vs direct SQL function call).

## Revisit when

- **Customer signal: PII regulatory pressure.** First customer in a regulated vertical (HIPAA, GDPR-strict-mode, etc.) asks for stronger PII isolation. Triggers re-evaluation of (iv) toward full hash-everywhere.
- **Customer signal: external_id format complaints.** Customer reports rejected external_ids that should pass (e.g., wants colon, tilde, or unicode). Revisit regex with the specific failing case. Don't pre-emptively loosen.
- **Customer signal: DoS-via-typo observed in the wild.** Player-count anomaly alert fires for a customer. Revisit rate-limit default; possibly add automated typo-detection (e.g., consecutive external_ids with >90% character overlap suggesting a counter bug).
- **Multi-currency-debit-in-one-call demand.** Customer asks to credit/debit multiple currencies atomically for a single player. Triggers a new endpoint `POST /v1/players/:playerExternalId/wallets/batch` taking an array; this contract stays single-currency.
- **Customer signal: wallet lifecycle becomes a feature.** Customer wants explicit `wallets.create` to gate gameplay (e.g., "player must have gems wallet unlocked before they can earn gems"). Triggers B4-shaped supplementary endpoint that materializes wallets without crediting them. Coexists with this route.
- **Internal observability: span attribute hash collisions.** If the 16-hex-char hash truncation produces collisions on `bokchoy.player_external_id_hash` at observable rates, widen to 32 hex (full SHA-256 truncated to 16 bytes). Telemetry triggers, not pre-emptive.

## Cascade obligations

For implementation when M-1.5 lands (Q2: combined scope):

1. **`packages/db/drizzle/{next}.sql`** — migration: `ALTER TABLE players ADD COLUMN external_id text` + CHECK + UNIQUE INDEX (per (ii) above).
2. **`packages/db/drizzle/{next}.sql`** — new SQL function `wallet_credit_by_external_id(p_project_id, p_player_external_id, p_currency_code, p_amount, p_reason_code, p_source_event_id, p_idempotency_key_id, p_related_id, p_related_type, p_metadata)` that: (a) INSERT...ON CONFLICT DO NOTHING into `players` returning the row, (b) INSERT...ON CONFLICT DO NOTHING into `wallets` returning the row, (c) calls existing `wallet_credit` logic with the resolved walletId. Returns the transaction record matching the existing wallet_credit shape. Sister function `wallet_debit_by_external_id` parallel.
3. **`packages/db/src/schema/wallet.ts:92`** — **DELETE the comment** describing lazy-create-inside-wallet_credit. The comment is now wrong; the lazy-create lives in the new player-centric SQL function.
4. **`packages/db/src/schema/tenancy.ts`** — add `externalId: text('external_id')` column to `players` Drizzle schema with optional shape matching the migration.
5. **`packages/wallet/src/wallet-credit-by-external-id.ts`** (new) — TypeScript wrapper around the new SQL function, matching `[[wrapper-shape]]` D2-α params-object signature. Sister `wallet-debit-by-external-id.ts`.
6. **`apps/backend/src/wallet/index.ts`** — two new route handlers: `POST /v1/players/:playerExternalId/wallets/:currencyCode/credit` and `/debit`. Mounted via `mountWalletRoutes(app)` already-existing function. Existing `/v1/wallets/:walletId/credit` and `/debit` routes stay.
7. **`apps/backend/src/wallet/index.ts`** Zod schemas — new `playerCurrencyParam` URL-param schema validating `:playerExternalId` against the regex and `:currencyCode` against the `currencies.code` regex. New `creditDebitByExternalIdBody` matches existing `creditDebitBody` minus `currencyId` (currency now in URL).
8. **`apps/backend/src/telemetry.ts`** or wallet handler — implement `bokchoy.player_external_id_hash` attribute computation: `HMAC-SHA256(external_id, BOKCHOY_OTEL_PII_SALT).slice(0, 16)`. Salt env var loaded once at module init like `BOKCHOY_API_KEY_HMAC_SECRET`.
9. **`apps/backend/src/telemetry.ts`** — environment variable validation: `BOKCHOY_OTEL_PII_SALT` required at boot if the new routes are enabled. Document in `.env.example` alongside `BOKCHOY_API_KEY_HMAC_SECRET`.
10. **`[[marketing/v1-shape]]` amendment** — Cascade #1(a) (SDK slug-resolution layer) SUPERSEDED. Backend handles slug→UUID at the route handler. SDK `UnknownCurrencyError` becomes a thin relay of the backend's `availableCodes` response.
11. **`@bokchoy/sdk-node`** (M-4 — substantially thinner now) — credit/debit POST to URL-encoded `/v1/players/{external_id}/wallets/{currency_code}/credit`. No client-side slug-resolver. Named exception classes (`UnknownCurrencyError`, `UnknownPlayerError`) parse and relay the backend's 404 response body. Estimated package size revised from ~500 LOC to ~250-350 LOC.
12. **`SECURITY.md` documentation cascade** — owed to `[[oss-sdk-only]]`. One paragraph on `external_id` as customer-controlled opaque data; PII guidance; OTel-hash note.
13. **Smoke-script extension** — extend `packages/db/scripts/smoke-functions.ts` or sister to cover: (a) lazy-create player + wallet on first credit; (b) idempotent replay; (c) cross-project tenancy isolation; (d) `UNKNOWN_CURRENCY` error path with `availableCodes` shape; (e) regex rejection on adversarial external_id.
