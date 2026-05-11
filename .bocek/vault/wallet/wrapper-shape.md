---
type: decision
features: [wallet, errors]
related: ["[[wallet-mechanics]]", "[[backend-stack]]", "[[idempotency-strategy]]", "[[reaper-schedule-deferral]]", "[[economy-primitives-research]]"]
created: 2026-05-08
confidence: high
---

# `@bokchoy/wallet` wrapper shape: db-separate parameter-object signatures, single `WalletError` class with discriminated `details` payload, Postgres FK-violation `23503` translated at the wrapper boundary

## Decision

`@bokchoy/wallet` exports four wrapper functions over the M1 stored functions, plus the error infrastructure callers (HTTP layer, future SDK) dispatch on. This entry pins the shape; `/implementation` quotes it verbatim.

### Function signatures

```ts
import type { Db } from '@bokchoy/db';

// Drizzle's transaction-callback type, exported alongside Db when used inside withTenant(...).
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface WalletCreditParams {
  projectId: string;          // uuid string; tenant guard, must match GUC
  walletId: string;           // uuid string
  amount: number;             // numeric(20,4); JS-precision-safe up to 9×10^15
  currencyId: string;         // uuid string; must match wallet's currency_id
  reasonCode: string;         // FK target; BC050 if unregistered (translated from 23503)
  sourceEventId?: string;     // server-derived natural idempotency key
  idempotencyKeyId?: number;  // bigserial pointer to idempotency_keys row (HTTP middleware path)
  relatedId?: number;         // polymorphic FK to loot_rolls / iap_receipts / compensation
  relatedType?: 'loot_roll' | 'iap_receipt' | 'compensation_grant';
  metadata?: Record<string, unknown>;
}

export type WalletDebitParams = WalletCreditParams;

export interface WalletDeidentifyPlayerParams {
  playerId: string;  // uuid string
}

export interface BootstrapProjectReasonCodesParams {
  projectId: string;  // uuid string
}

export function walletCredit(db: Db | Tx, params: WalletCreditParams): Promise<number>;
export function walletDebit(db: Db | Tx, params: WalletDebitParams): Promise<number>;
export function walletDeidentifyPlayer(db: Db | Tx, params: WalletDeidentifyPlayerParams): Promise<number>;
export function bootstrapProjectReasonCodes(db: Db | Tx, params: BootstrapProjectReasonCodesParams): Promise<number>;
```

All four return a `number` (transactions.id for credit/debit; row count for deidentify and bootstrap, matching the SQL function returns). The mode-`number` choice tracks `packages/db/src/schema/wallet.ts` (`bigserial({ mode: 'number' })`); same range cap.

`amount` is `number` (not `string`). JS double precision covers values up to 9×10^15; game-economy currencies stay well inside that range. Revisit if real-money / financial use case lands.

`metadata` is `Record<string, unknown>` per `[[wallet-mechanics]]` §3 (*"key-value freeform; project-controlled"*). No schema enforcement at the TS boundary.

### Error class

```ts
export type BcCode =
  | 'BC001'  // IdempotencyKeyInUse        — middleware-raised (slice 4.6); not wrapper
  | 'BC002'  // IdempotencyKeyMismatch     — middleware-raised
  | 'BC010'  // InsufficientFunds           — wallet_debit
  | 'BC020'  // TenantMismatch              — all three wallet wrappers
  | 'BC021'  // WalletNotFound              — wallet_credit / wallet_debit
  | 'BC022'  // CurrencyMismatch            — wallet_credit / wallet_debit
  | 'BC030'  // PolicyViolation             — reserved; not raised today
  | 'BC040'  // ConfigurationError          — wallet_deidentify_player (anon_secret missing)
  | 'BC050'  // ReasonCodeNotRegistered     — translated from PG 23503
  | 'BC060'; // CurrencyNotFound            — translated from PG 23503 (reserved)

export type ErrorDetails =
  | { code: 'BC001' }
  | { code: 'BC002' }
  | { code: 'BC010'; walletId: string; requested: string; available: string }
  | { code: 'BC020'; gucTenant: string; paramTenant: string }
  | { code: 'BC021'; walletId: string; projectId: string }
  | { code: 'BC022'; walletCurrency: string; requested: string }
  | { code: 'BC030' }
  | { code: 'BC040' }
  | { code: 'BC050'; constraintName: string }
  | { code: 'BC060'; constraintName: string };

export class WalletError extends Error {
  readonly code: BcCode;
  readonly details: Extract<ErrorDetails, { code: BcCode }>;

  constructor(details: ErrorDetails, message: string) {
    super(message);
    this.name = 'WalletError';
    this.code = details.code;
    this.details = details;
  }
}
```

Caller dispatches by code; TS narrows `details` via the discriminated union:

```ts
catch (err) {
  if (err instanceof WalletError && err.code === 'BC010') {
    // err.details is narrowed to { code: 'BC010'; walletId; requested; available }
  }
}
```

### `sqlstateToError` lookup

Pure function, exported. Inputs: `code: string` (Postgres SQLSTATE), `message: string` (RAISE EXCEPTION text), `constraintName: string | undefined` (for FK violations). Output: `WalletError` if recognized, `null` otherwise (caller re-throws original).

```ts
export function sqlstateToError(
  code: string,
  message: string,
  constraintName: string | undefined,
): WalletError | null;
```

Behavior:
- `code` starts with `'BC'` → parse `message` per the BCxxx code's RAISE EXCEPTION format (see `0004_wallet_functions.sql`). Build `details` payload, return `WalletError`.
- `code === '23503'` AND `constraintName === 'transactions_project_reason_code_fk'` → return `WalletError({ code: 'BC050', constraintName }, ...)`.
- `code === '23503'` with any other constraint name → return `null` (re-raise as `PostgresError`; preserves original error type for telemetry; surfaces stale-translation as a typed error in tests rather than a misleading BC code).
- Anything else → return `null`.

### FK-violation constraint-name table

Pinned today, extensible later:

| Constraint name | BcCode |
|---|---|
| `transactions_project_reason_code_fk` | `BC050` |

`BC060 CurrencyNotFound` is reserved but has no FK that fires it today. `wallets.currency_id` is FK-constrained to `currencies(id)` at row creation; `transactions.currency_id` inherits from the wallet, so a `transactions_currency_id_*_fk` violation would mean wallet-level data corruption (separate failure class). When a future migration adds a code path where a caller-supplied `currencyId` flows directly into `transactions` without wallet lookup, BC060 lands in the table.

### Idempotency-replay invisible to caller

Per `[[idempotency-strategy]]` D2-α: replay is observationally identical to first-call. Wrapper returns the txn id whether the SQL function executed or replayed. `RAISE LOG` inside the function records the replay per `[[wallet-mechanics]]` Amendment Part 1 A3 layer 2; TS callers cannot distinguish.

### Use inside `withTenant(...)`

```ts
import { withTenant } from '@bokchoy/db';
import { walletCredit } from '@bokchoy/wallet';

await withTenant(db, projectId, async (tx) => {
  const txnId = await walletCredit(tx, { projectId, walletId, amount, currencyId, reasonCode });
  // ...
});
```

`Db | Tx` accepts both the top-level `Db` (for one-shot calls outside a transaction) and the `Tx` from `withTenant(...)`. The function-internal `current_setting('app.current_tenant')::uuid` check inside `wallet_credit` requires the GUC to be set; calling outside `withTenant(...)` raises `BC020 TenantMismatch` (or unset-GUC error). Both are valid call sites; the GUC discipline lives at the call boundary.

## Reasoning

### Fork 1 — Parameter shape: db-separate + params-object (B)

Three positions a senior TS engineer might take:
- (A) **Positional args** mirroring plpgsql signature. Fails `idioms/typescript.md` line 65 (*"Pass objects, not positional args"*). Hot-perf-path exception doesn't apply — wallet wrappers do a network round-trip; argument-passing overhead is irrelevant. (idiom-cited / high.)
- (B) **db separate, params object.** Matches Drizzle's own `db.transaction(fn)` shape (production-cited via `[[backend-stack]]`). Matches tRPC's `({ ctx, input }) => ...` convention. Composes cleanly inside `withTenant(tx, projectId, async (tx) => walletCredit(tx, {...}))`. (production-cited × 2 / high.)
- (C) **Single object** containing db. Trades visual context-vs-data distinction for uniformity. Real but minor benefit; doesn't earn the deviation from (B). Curry-style retry wrapping is awkward (`retry(walletCredit)({ db, ...params })` requires destructuring on every call). (inferred / medium.)

(B) wins. Drizzle's `db.transaction(fn)` is the production reference at the project's stack level — the wrapper signature mirrors that pattern at the wallet feature level.

### Fork 2 — `WalletError` shape: single class with discriminated `details` (X)

Three positions:
- (X) **Single class + `code` discriminant + per-code `details` discriminated union.** Production-cited × 4 in TS-native ecosystem at convention-defining level: tRPC's `TRPCError` (`code` discriminant), Hono's `HTTPException` (`status` discriminant), Better Auth's `APIError` (`status` discriminant), postgres-js's `PostgresError` (`code` discriminant). All 4 are tier-1 production cites. (production-cited × 4 / high.)
- (Y) **Per-code subclass hierarchy.** Production-cited via Stripe SDK (`StripeAPIError`, `StripeAuthenticationError`, `StripeCardError`, `StripeIdempotencyError`) and AWS SDK v3. Wins when the error class is the public-API surface across multiple language idioms. `@bokchoy/wallet` is `"private": true` (slice 7.6) — workspace-internal, not SDK. (production-cited / not-here-applicable.)
- (Z) **Hybrid** — base + subclasses for HTTP-uniquely-dispatched codes only. Mixed evidence; gives some of (X)'s simplicity and some of (Y)'s `instanceof` narrowing. Adds asymmetric type surface (some codes have classes, some don't); arbitrary cut-line hard to defend. (inferred / medium.)

(X) wins. The TS ecosystem at the framework-defining level (tRPC, Hono, Better Auth, postgres-js) consistently picks single-class-with-discriminant. The discriminated `details` payload gives caller-side type narrowing equivalent to (Y) without class-per-code expansion.

`[[wallet-mechanics]]` Amendment Part 1 A6 names *"a pure-function `sqlstateToError(code, message)` lookup"*. The *"lookup"* phrasing implies a single-class output, not a class registry. (docs-cited / high.)

#### Fork 2 amendment 2026-05-11 — explicit defense of STRING typing for numeric `details` fields per `[[error-detail-numeric-serialization-research]]`

`ErrorDetails` for `BC010` carries `requested: string; available: string` (lines 76-79 above). `BC022` carries `requested: string` (UUID — different semantic). The STRING typing for numeric fields was inherited from postgres-js's default `NUMERIC → string` mapping + regex-parsing of RAISE EXCEPTION text in `sqlstate-to-error.ts:45`; the ORIGINAL Fork 2 derivation never explicitly defended STRING-vs-NUMBER for these fields. /design seat 2026-05-11 attempted Stripe `unit_amount_decimal: string` as a precedent; /research falsified the cite as class-mismatched (resource amount field, not error detail field). This amendment lands the explicit defense after research-cited reframing.

**Decision: keep STRING typing for `requested`/`available` in `BC010` (and any future numeric `BC` detail fields).** Justified by:

1. **Customer-profile divergence.** Production payment-API convention (Stripe + Square + PayPal, all surveyed in `[[error-detail-numeric-serialization-research]]` F1) ships ZERO structured numeric fields in error envelopes — categorical decline codes only, refetch related resource for state. **That convention optimizes for end-user-facing error UX.** BokChoy's wallet SDK customer is **game designers during development** — debug-time numeric snapshot at error point matters more than refetch-on-display. Per-code structured detail fields are the right shape for developer-facing SDK error UX. Defensible bespoke; named winning condition for the divergence is the customer-profile axis. (production-cited / 0 in this exact shape; first-principles + customer-profile divergence; confidence: medium.)

2. **Postgres NUMERIC(20,4) precision preservation.** `[[wallet-mechanics]]` §3 schemas `wallets.balance` + `transactions.amount` as `NUMERIC(20,4)` — max value 9999999999999999.9999, deliberately over-provisioned past JS-safe-integer (2^53-1 ≈ 9007199254740991) for future real-money cashout per *Revisit when* on this entry. STRING preserves precision past 2^53 without forcing customers to commit to BigInt or decimal.js at the SDK boundary if their values stay safe. NUMBER would silently lose precision: `Number("9999999999999999.0000")` → `10000000000000000` (off-by-one). `[[wallet-http-contract]]` G1 caps INPUT amounts at MAX_SAFE_INTEGER, but database column is over-provisioned vs the input cap. (docs-cited / high — postgres-js native NUMERIC mapping + JS Number safe-integer arithmetic.)

3. **Reversibility-asymmetry favors STRING.** Information-rich → information-poor is a one-way wire-shape transition: dropping `requested`/`available` from BC010 is a breaking-but-tractable change pre-customer (ZERO customer SDK consumes this today); adding them back later requires versioned bump. NUMBER → STRING is also breaking. STRING → NUMBER is breaking on type. **Keeping STRING preserves all three optionality paths**: (a) drop fields entirely (Stripe-style) if customer profile shifts; (b) flip to NUMBER if precision concern is moot AND customer-SDK-ergonomic complaint surfaces; (c) keep STRING long-term if precision matters or DX confirms STRING is fine. NUMBER preserves only (a) + (c-NUMBER).

**Rejected alternatives:**

- **(X) Stripe-style — drop structured numeric fields entirely; numerics in `message` only; customer refetches related resource.** Production-cited × 3 (Stripe + Square + PayPal). Wins when: end-user-facing error UX is the primary consumer profile. **Why not here:** customer profile differs (developer-facing SDK during dev; refetch-per-debug-iteration is friction designers feel that end-users don't). Revisit-when: customer profile shifts to player-facing API where end-users see error JSON directly without SDK mediation.
- **(Y) RFC 7807/9457 — inline numerics as JSON NUMBER.** Spec-cited × 1 (canonical example `balance: 30`). Wins when: RFC 7807 envelope shape is adopted overall AND amounts stay safely within JS-safe integer. **Why not here:** `[[wallet-http-contract]]` G5 already rejected the full RFC 7807 envelope shape in favor of Stripe-wrapped; cherry-picking the inline-numeric-as-NUMBER convention from a rejected envelope is incoherent. Also: NUMBER introduces precision risk per (2) above.

**Revisit-when triggers (specific):**

- **Customer profile shifts to player-facing API.** Players see error JSON directly without SDK mediation; categorical-only-with-refetch becomes the right ergonomic. Reopen and re-evaluate (X).
- **Customer SDK ergonomic complaint surfaces.** Designers explicitly report STRING parsing as friction in iterative debug AND BokChoy commits to acceptable-extra-round-trip-on-error. Flip to (X) at the SDK ergonomic milestone.
- **Real-money cashout lands AND wallet amounts cross 2^53 in production.** STRING is validated by the precision case; NUMBER would have been wrong. (Trigger reinforces STRING; doesn't trigger reopening.)
- **Future numeric `BC` detail field needs precision-past-2^53 explicitly** (e.g., a high-volume aggregate balance). Confirms STRING choice was right; doesn't trigger reopening.

(Confidence: medium-high. Production-cited weight for "developer-facing-SDK customer profile + inline-numeric-string" is unsurveyed — payment-API survey was the closest comparable cohort. Game-economy-backend-SDK cohort survey — PlayFab, Firebase Game SDK, Epic Online Services, Unity Cloud Save — not done at /research budget. Open thread carried in `[[error-detail-numeric-serialization-research]]`.)

### Fork 3 — FK-violation 23503 dispatch: translate at wrapper (P)

Two positions:
- (P) **Translate at wrapper.** Catch 23503, inspect `constraintName`, throw `WalletError({ code: 'BC050', constraintName }, ...)`. Caller dispatches one error namespace. (inferred / high — direct engineering math, no production cite at this granularity.)
- (Q) **Surface raw.** Let `PostgresError` propagate; HTTP layer dispatches BC range AND PG SQLSTATE range. Two namespaces. (inferred / medium.)

(P) wins. The HTTP layer's view: `BC050 ReasonCodeNotRegistered` and `BC022 CurrencyMismatch` both map to HTTP 422 with the same caller-fix shape (*"the value you sent doesn't exist"*). Conflating them into one error namespace is *correct for the HTTP-dispatch use case*. (Q) makes the dispatch table forked across two namespaces with no operational benefit.

Stale-translation risk (a future migration adds an FK whose constraint name isn't in the table) is mitigated by re-raising `PostgresError` for unknown constraint names — surfaces as a typed Postgres error in tests, not as a misleading BC code. The translation table is small (one entry today, additive thereafter).

## Engineering substance applied

- **Failure semantics:** wrapper translates SQL-layer errors (BCxxx + 23503) into `WalletError` with structured `details`. PostgresError for unrecognized SQLSTATEs propagates raw — caller can wrap in 500 / log + investigate. Idempotency-replay observationally identical to first-call (per `[[idempotency-strategy]]` D2-α). At-least-once semantics handled by the FOR UPDATE row lock + idempotency check inside the SQL function (slice 4 migration), not at the TS layer.
- **Concurrency:** `Db | Tx` accept lets the wrapper run inside `withTenant(...)`'s transaction OR as a one-shot outside. The GUC check (`current_setting('app.current_tenant')::uuid` inside the SQL function) catches missing-GUC cases with `BC020 TenantMismatch`. No TS-side concurrency state.
- **Observability:** wrapper emits an OTel span at the call boundary per `[[wallet-mechanics]]` Amendment Part 1 A3 layer 1. Span attributes: `db.system=postgresql`, `db.operation=wallet_credit` (etc.), `bokchoy.project_id`, `bokchoy.wallet_id`, `bokchoy.amount`, `bokchoy.currency_id`, `bokchoy.reason_code`. On error: span status set, error details attached. **Wiring deferred:** the OTel SDK + exporter pick is open (no consumer in `apps/backend` exercising spans yet). The wrapper is structured to wrap each call in a span when the SDK lands; for now, ship the wrapper without span emission and add a `// TODO(otel): wrap with span per Part 1 A3 layer 1` comment at the call site. Justified by anti-improvisation — instrumenting before there's a consumer to validate against would commit to an SDK choice prematurely.
- **Reversibility:** signatures + error class are public-API for `@bokchoy/wallet` (workspace-internal). Changes are workspace-private — not SDK breakage.
- **Blast radius:** wrapper bug propagates to every caller. Mitigated by integration tests (slice 4's smoke tests already cover the SQL function path; wrapper tests come with the implementation slice).

## Production-grade gates

- **Idiomatic** — (B) parameter shape matches `idioms/typescript.md` line 65 + Drizzle's own `db.transaction(fn)` pattern. (X) error class matches tRPC / Hono / Better Auth / postgres-js convention at convention-defining level. (P) translation matches the design intent of `[[wallet-mechanics]]` Amendment Part 1 A6's *"pure-function lookup"* phrasing. **(idiom-cited × 1 + production-cited × 4 / high.)**
- **Industry-standard** — single-class-with-discriminant is the dominant TS-native error pattern (tRPC + Hono + Better Auth + postgres-js — 4 named production systems with provenance). Per-code class hierarchy (Stripe SDK, AWS SDK v3) is the dominant cross-language-SDK pattern but doesn't apply here (workspace-private, not published SDK). **(production-cited × 4 / high.)**
- **First-class** — uses Drizzle's `sql` template through `Db | Tx`, not raw postgres-js. Uses `Error` JS-native class for `WalletError`, not a custom Result-monad. Uses postgres-js's `PostgresError.code` and `.constraint_name` fields directly, not a re-parsed message string. **(first-class-cited / high.)**

## Rejected alternatives

### (A) Positional args
**What:** `walletCredit(db, projectId, walletId, amount, currencyId, reasonCode, sourceEventId?, idempotencyKeyId?, relatedId?, relatedType?, metadata?)`
**Wins when:** hot-perf-path with stable arg list and known-uniform call shape.
**Why not here:** wallet wrappers do a network round-trip; argument-passing overhead is irrelevant compared to SQL execution. Fails `idioms/typescript.md` line 65 outright.

### (C) Single-object containing db
**What:** `walletCredit({ db, projectId, walletId, ... })`
**Wins when:** uniform-shape — easier to log all inputs as one struct, easier curry/refactor, treating db as just-another-input.
**Why not here:** Loses the context-vs-data distinction that Drizzle's own API surface (`db.transaction(fn)`) and tRPC's (`{ ctx, input }`) preserve. Curry-style retry wrapping (`retry(walletCredit)({ db, ...params })`) requires destructuring at every call site. Real but minor benefit; doesn't earn the deviation from (B).

### (Y) Per-code subclass hierarchy
**What:** `class InsufficientFundsError extends WalletError {}`, `class TenantMismatchError extends WalletError {}`, etc. — 9 subclasses for the 9 BCxxx codes. Caller dispatches via `instanceof`.
**Wins when:** the error class IS the public SDK surface across multiple language idioms. Stripe SDK + AWS SDK v3 are the production cites — both ship to multi-language ecosystems where `instanceof` is the polyglot convention.
**Why not here:** `@bokchoy/wallet` is `"private": true` (slice 7.6 package.json). Workspace-internal, not SDK. The TS-ecosystem convention at the framework-defining level (tRPC, Hono, Better Auth, postgres-js) is single-class-with-discriminant. **Revisit when:** `@bokchoy/wallet` (or a subset) ships as a public SDK.

### (Z) Hybrid base class + selective subclasses
**What:** `WalletError` base + subclass only for HTTP-uniquely-dispatched codes (e.g., `WalletNotFoundError extends WalletError` for HTTP 404).
**Wins when:** most codes collapse into a generic handler, a small minority has unique HTTP semantics.
**Why not here:** the cut-line is arbitrary. BC010 and BC022 both map to HTTP 422 — one is "you can't afford it," the other is "wrong currency." Are those "unique enough" for subclass? Decision is judgment-call territory. (X) avoids it entirely by making every code's `details` shape explicit in the discriminated union.

### (Q) Surface 23503 raw to caller
**What:** wrapper catches BCxxx via `sqlstateToError`, passes 23503 through as `PostgresError`. Caller dispatches both BC range AND PG SQLSTATE range.
**Wins when:** FK-violation is treated as a distinct "data integrity" failure class separate from "wallet operation logic."
**Why not here:** from the HTTP layer's view, `BC050 ReasonCodeNotRegistered` and `BC022 CurrencyMismatch` are both HTTP 422 with the same caller-fix shape. The data-integrity-vs-logic distinction is real but doesn't drive different HTTP dispatch — the operational benefit of (Q) is zero, the cost is two namespaces in the dispatch table.

## Failure mode

**Stale FK-translation table.** A future migration adds an FK constraint that raises 23503 inside `wallet_credit/wallet_debit`. Constraint name isn't in the wrapper's translation table. Wrapper returns `null` from `sqlstateToError`; original `PostgresError` propagates to the HTTP layer.

**Probability:** medium during code-base growth.
**Cost:** low — caller sees a typed `PostgresError` with full `.code` + `.constraint_name`, can dispatch or 500 + log + add a translation entry. Worse-case is a temporarily ugly error response, not silent failure or wrong dispatch.
**Detection:** integration tests in the migrating slice exercise the new FK; wrapper tests assert `sqlstateToError(23503, msg, 'new_constraint')` returns `null` (not a misleading BC code) — surfaces as a test failure, not a production silent.

**Misparsed RAISE EXCEPTION message.** Wrapper parses `'InsufficientFunds: wallet=% requested=% available=%'` to extract three values. If a future SQL function refactor changes the format string, the parser silently extracts wrong values into `details`.

**Probability:** low — RAISE format is in the migration files; refactor without test failure means the wrapper's parse test missed it.
**Cost:** medium — caller sees correct `code` (still BC010) but corrupted `details` (wallet/requested/available wrong). Logs may show garbage.
**Detection:** wrapper's parse test asserts the full happy-path RAISE format → ErrorDetails mapping for each BC code. Format change → test failure.

## Mitigations

- Wrapper unit tests cover every BCxxx → ErrorDetails parse path (one test per code).
- `sqlstateToError(23503, msg, unknown_constraint)` returns `null` (re-raise) — explicitly tested.
- `WalletError` instances are JSON-serializable (`{ name, code, details, message }`) for HTTP error-body emission; tested.
- Integration tests in `packages/wallet/scripts/smoke-wrappers.ts` (or equivalent) call each wrapper against local-docker Postgres, assert the happy path + each named error code surfaces correctly.

## Idiom citations

- `idioms/typescript.md` line 65 (*"pass objects, not positional args"*) — Fork 1 (B) winner.
- `idioms/typescript.md` line 30 (*"discriminated unions over flag bags"*) — Fork 2 (X) winner; the `details` payload is a discriminated union on `code`.
- `idioms/typescript.md` line 8 (*"Make impossible states unrepresentable"*) — `Extract<ErrorDetails, { code: BcCode }>` on `WalletError.details` ensures the class can't carry a `details` payload whose `code` mismatches the class's own `code` field.

## Revisit when

- **`@bokchoy/wallet` flips to `"private": false` (becomes a published SDK).** Reconsider Fork 2 (X→Y) — class hierarchy may better match SDK convention.
- **A new BCxxx code adds rich structured fields beyond what message-parsing can extract.** Today's parser is regex-based; if a future code wants nested objects in `details`, switch the SQL `RAISE EXCEPTION` to use a JSON-encoded message body and parse via `JSON.parse`. Reverse-compatible; one wrapper change.
- **A new FK whose 23503 should map to a new BCxxx.** Add to the constraint-name table. Trivial.
- **Real-money / financial wallet use case lands.** Reconsider the `amount: number` choice — `string` (preserving NUMERIC(20,4) precision exactly) becomes correct.
