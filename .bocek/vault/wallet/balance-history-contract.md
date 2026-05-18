---
type: decision
features: [wallet, marketing]
related: ["[[wallet/credit-route-contract]]", "[[wallet/wallet-http-contract]]", "[[wallet/wrapper-shape]]", "[[wallet/.research/per-row-running-balance-research]]", "[[wallet/credit-route-shape-research]]", "[[marketing/v1-shape]]", "[[marketing/currencies-endpoint-research]]", "[[_shared/url-pattern-research]]", "[[idempotency-strategy]]", "[[wallet-mechanics]]"]
created: 2026-05-18
confidence: high
---

# Wallet balance + history read contract (player-centric, game-economy-class shape)

## Decision

Two new player-centric read endpoints, both behind `apiKeyMiddleware`, both RLS-scoped via `withTenant`. Sibling to the M-1.5 credit/debit routes in `[[wallet/credit-route-contract]]` (i); same auth chain, same player-external-id-based URL convention, same OTel attribute discipline.

### (i) Endpoint shapes

**Balance read:**

```
GET /v1/players/{playerExternalId}/wallets/{currencyCode}
Authorization: Bearer <api_key>
```

- `playerExternalId` path segment: regex `^[A-Za-z0-9._-]{1,128}$` (defense-in-depth at route boundary, same as M-1.5).
- `currencyCode` path segment: regex `^[A-Za-z0-9_]{1,16}$` (matches `currencies.code` CHECK from `packages/db/src/schema/wallet.ts`).
- No request body. No query parameters at MVP.

Response shape:

```jsonc
// 200 OK — wallet exists (player has been credited this currency at least once)
{
  "balance": "100.0000",       // NUMERIC(20,4) as string per [[wallet/wrapper-shape]] precision-preservation
  "currencyCode": "gems",
  "walletId": "<uuid>",
  "playerId": "<uuid>",
  "updatedAt": "2026-05-18T15:30:00.000Z"
}

// 200 OK — wallet does not exist (synthesized zero per G11.3)
{
  "balance": "0",
  "currencyCode": "gems"
  // walletId, playerId, updatedAt absent — wallet row was not materialized
}
```

**History read:**

```
GET /v1/players/{playerExternalId}/wallets/{currencyCode}/transactions[?limit=N&starting_after=ID]
Authorization: Bearer <api_key>
```

- Same path-segment regexes as balance read.
- Query parameters (all optional):
  - `limit`: integer, default `10`, max `100`. Rejects with VALIDATION_ERROR on out-of-range.
  - `starting_after`: integer (transaction `id`). Returns rows with `id < starting_after`.
- No request body. No filters at MVP.

Response shape:

```jsonc
// 200 OK — wallet exists, has transactions
{
  "data": [
    {
      "id": 12345,
      "createdAt": "2026-05-18T15:30:00.000Z",
      "kind": "currency_credit",      // matches transactions.kind CHECK constraint
      "amount": "100.0000",           // NUMERIC(20,4) as string
      "reasonCode": "level_up_reward",
      "sourceEventId": "level-15-reward",  // omitted when null
      "relatedId": null,              // omitted when null
      "relatedType": null,            // omitted when null
      "metadata": {}                  // always present (default '{}'::jsonb per schema)
    },
    // ... more rows, ORDER BY id DESC (newest first)
  ],
  "hasMore": false
}

// 200 OK — wallet does not exist OR exists with no transactions in range
{
  "data": [],
  "hasMore": false
}
```

**No per-row `balanceAfter` field.** Customers compute running totals client-side from `kind` + `amount` (signed delta: `kind === 'currency_credit' ? +amount : -amount`). See *Rejected alternative (α)* below. SDK docs cascade owes the client-side compute pattern example.

### (ii) Auth + middleware chain

Identical to M-1.5 credit/debit chain minus idempotency (GETs are naturally idempotent; per Stripe production convention `Idempotency-Key` is request-method-scoped to mutating operations only):

```
apiKeyMiddleware                                    // Bearer auth, sets c.var.projectId + apiKeyId
sValidator('param', playerCurrencyParam, ...)       // existing schema from M-1.5
sValidator('query', historyQueryParam, ...)         // NEW — for history only
handler                                             // withTenant → tracer.startActiveSpan → wrapper
```

`idempotencyMiddleware` is **NOT** mounted on these GET routes. Verified posture: per `[[wallet/credit-route-contract]]` and Stripe API convention, idempotency keys apply only to non-idempotent operations.

### (iii) Unknown-player / unknown-wallet semantics — STATELESS READS

Per `[[wallet/.research/per-row-running-balance-research]]` F1 audience-class verdict and the M-1.5 PII discipline:

- **Reads NEVER materialize a `players` row or a `wallets` row.** The only path that creates these rows is credit/debit (`wallet_credit_by_external_id` / `wallet_debit_by_external_id`) per M-1.5.
- **Unknown player external_id → 200 with synthesized zero/empty.** Balance returns `{ balance: "0", currencyCode }` with `walletId` / `playerId` / `updatedAt` absent. History returns `{ data: [], hasMore: false }`.
- **Known player, no wallet for this currency → same 200 synthesized zero/empty.** From the customer's perspective the two cases are indistinguishable, which is correct: at MVP BokChoy does not expose a "does this player exist" probe surface.
- **`UnknownPlayerError`** (defined in `packages/sdk-node/src/errors.ts`) stays **reserved for the future explicit-create flow** (a hypothetical `POST /v1/players` endpoint that does not exist at MVP). M-4 was correct to define the class with no current use site.

This decision is anchored by the user-ratified customer-shape constraint: *"new player → balance 0 is the common case"* — wallet UI render on session start hits this path first time a player logs in, and surfacing it as a 404 forces every SDK customer to write try/catch around the most common read.

### (iv) OTel instrumentation

Spans inherit the M-1.5 attribute set verbatim per `[[wallet/credit-route-contract]]` (iv):

**`wallet.balance` span attributes (always emitted):**
- `db.system: 'postgresql'`
- `db.operation: 'wallet_balance_by_external_id'`
- `bokchoy.project_id`
- `bokchoy.player_external_id_hash` — `hashPlayerExternalIdForOtel(playerExternalId)` per M-1.5 helper
- `bokchoy.currency_code`

**`wallet.balance` post-query attribute (success path only):**
- `bokchoy.wallet_exists: boolean` — `true` if wallet row found, `false` if synthesized zero. Diagnostic for read-vs-create flow inspection in traces.

**`wallet.history` span attributes (always emitted):**
- `db.system: 'postgresql'`
- `db.operation: 'wallet_history_by_external_id'`
- `bokchoy.project_id`
- `bokchoy.player_external_id_hash`
- `bokchoy.currency_code`
- `bokchoy.limit: number` — the resolved `limit` value after default + cap clamp.
- `bokchoy.cursor: 'first_page' | 'paginated'` — first_page when `starting_after` is absent.

**`wallet.history` post-query attribute (success path only):**
- `bokchoy.transaction_count: number`
- `bokchoy.has_more: boolean`

Span names `wallet.balance` / `wallet.history` follow the noun-form convention established by `wallet.credit` / `wallet.debit` in M-1.5.

### (v) Wrapper layer in `packages/wallet/`

Two new module exports, RLS-scoped via the caller-provided `tx` (callers wrap in `withTenant` at the route layer):

```typescript
// packages/wallet/src/balance-by-external-id.ts (new)
export async function walletBalanceByExternalId(
  tx: Db | Tx,
  args: { projectId: string; playerExternalId: string; currencyCode: string }
): Promise<{
  exists: false;  // wallet row absent — caller synthesizes the zero response
} | {
  exists: true;
  walletId: string;
  playerId: string;
  balance: string;       // NUMERIC(20,4) as string
  updatedAt: Date;       // ISO-serialize at route layer
}>;
```

```typescript
// packages/wallet/src/history-by-external-id.ts (new)
export async function walletHistoryByExternalId(
  tx: Db | Tx,
  args: {
    projectId: string;
    playerExternalId: string;
    currencyCode: string;
    limit: number;             // already clamped to [1, 100]
    startingAfter?: number;    // transaction id; if present, returns rows with id < this
  }
): Promise<{
  data: Array<{
    id: number;
    createdAt: Date;
    kind: 'currency_credit' | 'currency_debit' | /* other kinds */ string;
    amount: string;            // NUMERIC(20,4) as string
    reasonCode: string;
    sourceEventId: string | null;
    relatedId: number | null;
    relatedType: 'loot_roll' | 'iap_receipt' | 'compensation_grant' | null;
    metadata: Record<string, unknown>;
  }>;
  hasMore: boolean;
}>;
```

**No new stored functions required.** Reads are plain Drizzle SELECTs scoped by the RLS GUC set inside `withTenant`. The wrapper queries:

```sql
-- walletBalanceByExternalId
SELECT w.id AS wallet_id, w.player_id, w.balance, w.updated_at
FROM wallets w
JOIN players p ON p.id = w.player_id
JOIN currencies c ON c.id = w.currency_id
WHERE w.project_id = $1
  AND p.external_id = $2
  AND c.code = $3
LIMIT 1;
-- Empty row count → return { exists: false }.

-- walletHistoryByExternalId
SELECT t.id, t.created_at, t.kind, t.amount, t.reason_code,
       t.source_event_id, t.related_id, t.related_type, t.metadata
FROM transactions t
JOIN wallets w ON w.id = t.wallet_id
JOIN players p ON p.id = w.player_id
JOIN currencies c ON c.id = w.currency_id
WHERE t.project_id = $1
  AND p.external_id = $2
  AND c.code = $3
  AND ($4::bigint IS NULL OR t.id < $4)
ORDER BY t.id DESC
LIMIT $5 + 1;
-- Fetch limit+1 to detect hasMore without a second query: if returned > limit,
-- slice off the extra and set hasMore=true.
```

Both queries are indexed by existing M-1.5 + base-schema indexes (`idx_transactions_wallet_lookup` on `(walletId, createdAt)`; `wallets` unique `(project_id, player_id, currency_id)`; `currencies` unique `(project_id, code)`). No new indexes required.

### (vi) Error envelope — VALIDATION_ERROR only at MVP

Per `[[wallet/wallet-http-contract]]` G5 (X) Stripe-wrapped: validation failures (regex mismatch on path segments, out-of-range `limit`, invalid `starting_after`) flow through the existing `validationFailureHook` to a `400 { error: { code: 'VALIDATION_ERROR', ... } }` response.

**No 404 class for unknown-wallet** — per (iii) reads are stateless and return synthesized zero/empty instead of 404. The M-1.5 `UNKNOWN_CURRENCY` 404 class does **not** apply here: unlike credit/debit which raise BC060 from the SQL function when currency lookup fails inside the function, the read path's JOIN naturally returns zero rows on unknown currency — indistinguishable from "currency exists, wallet doesn't." Both cases return the same 200 synthesized zero.

**Implication:** the route handler does NOT need to enumerate available currencies on error (M-1.5's `availableCodes` enrichment). Customers who pass an invalid currency code get 200 zero, not a hint. This is acceptable because the SDK pins `currencyCode` to a customer-controlled slug they registered themselves — there's no discovery use case at read time. Customers discover currencies via `GET /v1/currencies` (M-1) up-front, not via probe-on-read.

### (vii) Cascade obligations for `/implementation`

**Wrapper layer** (`packages/wallet/`):
1. `packages/wallet/src/balance-by-external-id.ts` (new) — `walletBalanceByExternalId` per (v).
2. `packages/wallet/src/history-by-external-id.ts` (new) — `walletHistoryByExternalId` per (v).
3. Export both from `packages/wallet/src/index.ts`.
4. Unit tests covering: wallet-exists path, wallet-absent path (returns `exists: false`), history pagination cursor correctness (limit+1 detection), RLS-isolation (one tenant's data invisible to another).

**Backend routes** (`apps/backend/src/wallet/index.ts`):
5. Two new GET handlers per (i) — `makeBalanceByExternalIdHandler` + `makeHistoryByExternalIdHandler` factories analogous to `makeByExternalIdMutationHandler` from M-1.5.
6. Two new Zod schemas: `balanceParamSchema` (reuse existing `playerCurrencyParam`), `historyQueryParam` (`limit: z.coerce.number().int().min(1).max(100).default(10).optional(); starting_after: z.coerce.number().int().positive().optional()`).
7. Mount both routes in `mountWalletRoutes(app)`. Auth chain per (ii): `apiKeyMiddleware → sValidator('param', ...) → sValidator('query', ...) → handler`.
8. OTel spans per (iv) wrapping the wrapper call inside `withTenant`.
9. Synthesized-zero response composition at the route layer: route handler checks `result.exists` from the wrapper and emits the minimal `{ balance: "0", currencyCode }` shape vs the full `{ balance, currencyCode, walletId, playerId, updatedAt }` shape.

**SDK methods** (`packages/sdk-node/src/wallets.ts`):
10. Two new methods on `WalletsApi`:
    ```typescript
    balance(params: { player: string; currency: string }): Promise<{
      balance: string;
      currencyCode: string;
      walletId?: string;
      playerId?: string;
      updatedAt?: string;
    }>;

    history(params: {
      player: string;
      currency: string;
      limit?: number;
      startingAfter?: number;
    }): Promise<{
      data: Array<{
        id: number;
        createdAt: string;
        kind: string;
        amount: string;
        reasonCode: string;
        sourceEventId?: string;
        relatedId?: number;
        relatedType?: 'loot_roll' | 'iap_receipt' | 'compensation_grant';
        metadata?: Record<string, unknown>;
      }>;
      hasMore: boolean;
      nextCursor?: number;  // SDK-side convenience: id of last row when hasMore=true
    }>;
    ```
11. Wire `balance` to `GET /v1/players/{player}/wallets/{currency}` (URL-encoded path segments via existing `http.ts` `pathSegments` shape).
12. Wire `history` to `GET /v1/players/{player}/wallets/{currency}/transactions` with `limit` + `starting_after` as query string params.
13. Note: `http.ts` currently has `post()` method; add `get()` method (no body, no Idempotency-Key header) to match the new method shape.
14. SDK tests: balance happy path, balance synthesized-zero (response without optional fields parses cleanly), history pagination cursor (mock backend returns hasMore=true + nextCursor; SDK forwards to caller), history empty list, URL-encoding of path segments (verify special characters in player external_id pass through correctly).

**Marketing surface** (`apps/cockpit/modules/marketing/components/code-walkthrough.tsx`):
15. Update the `// Coming soon` muted snippets for balance + history to **live** code shapes per (i) + (10). Remove the "Coming soon" badge from those operation tiles. Move them from the "Coming soon" section to the "Today" section (per the user-ratified Option B split in M-5).
16. New shiki-highlighted code blocks for balance + history matching the V2 code-as-hero register used by credit/debit in M-5.

**Vault cascade**:
17. Small amendment to `[[wallet/wallet-http-contract]]` — register the two new GET endpoints in its endpoint inventory (it lists credit/debit/bootstrap-reason-codes currently; the two new GETs slot in beside credit/debit).
18. `[[marketing/v1-shape]]` Cascade #10 — the "balance + history Coming soon" line is no longer accurate once the snippet update lands; amend post-implementation.

**Smoke-script extension** (`packages/db/scripts/smoke-functions.ts` — already extended in M-1.5 cascade #13):
19. Add cases: balance read for known wallet → expected balance; balance read for unknown player → `{balance: "0"}`; history read with pagination → correct ordering + cursor handoff.

## Reasoning

The M-1.5 player-centric pattern already exists. The decision space for these reads is: replicate that pattern for the read surface, or diverge. Replication wins on all forks except G11.3 (unknown-player), where the read surface's stakes differ from the write surface's stakes and a new position must be staked.

**G11.1 + G11.2 URL shapes — REST nounification for reads, slash-suffix-verb for writes.** The nested `/v1/players/{externalId}/wallets/{currencyCode}` resource prefix is established by M-1.5 (per `[[wallet/credit-route-contract]]` (i)). Reads on that resource take GET on the resource itself (balance) or GET on a nested collection (transactions). Slash-suffix-verb `/balance` would mix the action-register and resource-register inside the same URL hierarchy without engineering justification — `[[_shared/url-pattern-research]]` F2 explicitly resolves this co-existence in favor of "GET on resource + slash-suffix-verb for actions sharing the same prefix." Stripe ships `GET /v1/customers/{id}` (resource-read) alongside `POST /v1/customers/{id}/...` (action-verb), not `GET /v1/customers/{id}/show`. (production-cited × Stripe; confidence: high.)

**G11.3 stateless reads — production-cited at the audience class.** Per `[[wallet/.research/per-row-running-balance-research]]` F1 the closest BokChoy audience-scale analog (RevenueCat) doesn't ship a transaction-history endpoint at all; the next-closest (PlayFab Economy v2) ships history but with no balance-after field; Nakama's `walletLedger` is a tier-1 production-code cite at the same shape. None of them lazy-create on read. The M-1.5 PII discipline (`[[wallet/credit-route-contract]]` (iv) HMAC-OTel-hash pattern) was specifically structured to keep external_ids out of the canonical `players.external_id` column except when the customer-driven write path creates the row; lazy-create on read would regress that discipline. (production-cited × 3 game-economy class; confidence: high.) The user-ratified customer-shape constraint *"new player → balance 0 is the common case"* anchors the ergonomic case.

**G11.4 cursor on `transactions.id`** — Stripe `starting_after` + `limit` is production-cited at framework-defining level. `transactions.id` is BIGSERIAL, monotonic with `created_at` to BIGSERIAL granularity (single-shared-sequence behavior on partitioned tables per Postgres docs), so id-DESC ordering is newest-first without a composite cursor. Default `limit: 10` / max `100` matches Stripe defaults — production-cited × Stripe at framework-defining level. (confidence: high.)

**G11.5 no filters at MVP** — `[[marketing/currencies-endpoint-research]]` F4 audience-scale-matched minimal-field-set precedent applies to query parameters too: indie F2P SDKs (RevenueCat + LootLocker tier) ship minimal filter surfaces. Filters are non-breaking-additive — `?from=`/`?to=`/`?reasonCode=` can land later when a customer asks. The cockpit audit panel (Month 6 deliverable per `[[mvp-feature-sequence]]`) is a separate audience with a separate URL and separate filter set. (production-cited × RevenueCat by-omission, LootLocker by-omission; confidence: medium-high.)

**G11.6 minimal balance response with optional materialization fields** — `[[marketing/currencies-endpoint-research]]` F4 audience-scale-minimal pattern. `updatedAt` is free (the `wallets.updated_at` column already exists). `lastTransactionId` was rejected as over-precision (would require joining `transactions` on the balance read query). Optional `walletId`/`playerId`/`updatedAt` cleanly encode the synthesized-zero case under G11.3 without a discriminator field. (audience-class match; confidence: high.)

**G11.7 omit per-row `balanceAfter`** — `[[wallet/.research/per-row-running-balance-research]]` F1 production-cited × 3 (Stripe BalanceTransaction, PlayFab Economy v2 Transaction, Nakama walletLedger) all explicitly omit per-row balance. The contradicting cites (Modern Treasury, Oracle Fusion) are financial-ledger / enterprise-accounting class, not game-economy class. Audience-class verdict per F3 places BokChoy with the game-economy F1 pattern. Three /design-seat (α) defense claims falsified by research: "Stripe ships ending_balance per row" (FALSE per Stripe BalanceTransaction object docs), "ledgers ship running balance" (TRUE only at F2 class), "Railway pricing makes (α) cheap" (unverified and not load-bearing once audience-class decides). (production-cited × 3 game-economy class; tier-1 evidence on Nakama; confidence: high.)

**G11.8 OTel attrs** — verbatim inheritance from M-1.5 per `[[wallet/credit-route-contract]]` (iv) `bokchoy.player_external_id_hash` HMAC pattern. Span names `wallet.balance` / `wallet.history` follow the noun-form convention (`wallet.credit` / `wallet.debit` are also noun-form despite the operation being verb-shaped — the M-1.5 precedent settled this). Diagnostic attributes (`wallet_exists`, `transaction_count`, `has_more`, `cursor`, `limit`) added for trace-level read-vs-create flow inspection. (internal consistency; confidence: high.)

**G11.9 idempotency skipped on GET** — Stripe production convention is request-method-scoped: `Idempotency-Key` applies only to non-idempotent operations (POST/PUT/PATCH/DELETE). GETs are naturally idempotent per HTTP spec; running the M-1.5 idempotency middleware on them would be middleware-runs-but-does-nothing noise. Skip it. (production-cited × Stripe; confidence: high.)

**G11.11 read auth via `apiKeyMiddleware`** — symmetry with credit/debit. The SDK customer holds a project API key; reads are scoped by the same auth boundary. A read-only sub-scope (e.g., for game-client-direct calls instead of game-server-proxied) is a future concern and would need a separate `api_keys.permissions` design pass; not in scope at MVP. (internal consistency; confidence: high.)

**G11.12 wrapper layer in `packages/wallet/`** — pattern inherits from M-1.5 `walletCreditByExternalId` + `walletDebitByExternalId`. Difference: reads don't need atomicity guarantees, so they don't need SQL stored functions with `SECURITY DEFINER` + `FOR UPDATE` row locks. Plain Drizzle SELECT inside `withTenant` is sufficient and matches `[[wallet/wrapper-shape]]` Fork 1 (db-separate + params-object signature). No new error class — reads return `{exists: false}` discriminated-union for the absent-wallet case, no `WalletError` raised. (internal consistency + idiom-aligned; confidence: high.)

## Engineering substance applied

- **Consistency:** Reads use `READ COMMITTED` (Postgres default) snapshot isolation under `withTenant`. Sufficient because: (a) the SDK customer already saw the credit response synchronously with the same-transaction `balanceAfter` value; no read-your-writes guarantee owed across sessions. (b) Audit-feed reads accept that concurrent writes may insert new rows mid-pagination — cursor on `transactions.id` is stable under inserts (id is monotonic-increasing, paginating backward via `id < starting_after` is unaffected by new rows arriving after the cursor).
- **Failure semantics:** Read-only path. No retry policy required at the SDK layer beyond the existing HttpClient default. Idempotency middleware skipped per G11.9.
- **Concurrency:** No FOR UPDATE locks, no write contention. Reads can run in parallel without coordination. Pagination cursor stable under concurrent writes per snapshot-isolation behavior.
- **Observability:** OTel span per call with diagnostic attrs (`wallet_exists`, `transaction_count`, `has_more`). Span name distinguishes balance vs history. Page-able failure mode: high read-error rate on `wallet.balance` or `wallet.history` spans would indicate either RLS-context misconfiguration (wrong projectId on the GUC) or query-plan regression (missing index). Runbook entry: re-verify `idx_transactions_wallet_lookup` + `wallets` unique constraint after schema changes.
- **Storage / access:** Read pattern is `(project_id, player_external_id, currency_code) → wallet row + ordered transaction rows`. Existing indexes cover both queries; no new indexes. Read cost dominated by the JOIN to `players` (1 row), `currencies` (1 row), and the indexed scan over `transactions` (limit+1 rows).
- **Security:** Trust boundary is `apiKeyMiddleware` → `withTenant` sets the RLS GUC → all reads are tenant-scoped via the `pgPolicy('tenant_isolation', ...)` policies already on `wallets`, `players`, `currencies`, `transactions`. Cross-tenant data leak requires the GUC to be wrong — defense is `[[backend-stack]]` F1 mitigation #2 `TenantTx` branded type already enforced.
- **PII:** Player external_id appears in URL (logged at HTTP-access-log layer; mitigation per M-1.5 — customer responsibility per Stripe-metadata pattern, plus OTel layer hashes it). Body never contains external_id. Response body contains `playerId` UUID (not external_id) when the wallet exists. No regression from M-1.5 PII posture.

## Production-grade gates

- **Idiomatic:** Hono `app.get(...)` with `sValidator('param', ...)` + `sValidator('query', ...)` chain. Mirrors the existing `mountWalletRoutes` structure verbatim. Drizzle SELECT queries through `Db | Tx` per `[[wallet/wrapper-shape]]`. Per `idioms/typescript.md` (per `[[wallet/wrapper-shape]]` reasoning): discriminated union `{exists: false} | {exists: true, ...}` for the wrapper return — not a nullable field bag.
- **Industry-standard:** Stripe `GET /v1/customers/{id}/balance_transactions` cursor pagination is the canonical analog (production-cited × Stripe at framework-defining level). RevenueCat `GET /v2/projects/{id}/customers/{id}/virtual_currencies` is the audience-class match for balance read (production-cited × 1 tier 2 per `[[marketing/currencies-endpoint-research]]` F1). Nakama `walletLedger` is the tier-1 production code reference for history row shape.
- **First-class:** Postgres RLS via existing tenant policies. Drizzle SQL builder. Hono native GET + query validation. No bespoke layers. ADD COLUMN to `transactions` explicitly NOT done — schema unchanged from M-1.5.

## Rejected alternatives

### (α) Persist `transactions.balance_after NUMERIC(20,4)` and ship per row

**What:** Add a `balance_after` column to the `transactions` table. SQL functions `wallet_credit_by_external_id` / `wallet_debit_by_external_id` (and their wallet-id-keyed siblings) update to persist the post-mutation balance value they already compute as a return value. History rows on the wire include `balanceAfter: string` per row. Customer renders running balance directly from the response.

**Wins when:** BokChoy positions as a financial-ledger / enterprise-accounting product whose customers require formal accounting-statement-shape responses (running balance per entry). Modern Treasury and Oracle Fusion both ship this shape — see `[[wallet/.research/per-row-running-balance-research]]` F2.

**Why not here:** Audience-class mismatch. `[[marketing/v1-shape]]` positions BokChoy as "wallet infrastructure for game economies"; `[[marketing/currencies-endpoint-research]]` F4 places it with the indie/SMB F2P precedent class (RevenueCat + LootLocker tier). Three named production systems in the game-economy class explicitly omit per-row balance: Stripe BalanceTransaction (tier 2 docs cite, no `ending_balance` field), PlayFab Economy v2 Transaction (tier 2 docs cite, no balance-after field), Nakama walletLedger (tier 1 production code cite, `Changeset` map but no Balance field). RevenueCat doesn't even ship a transaction-history endpoint. The financial-ledger cites (Modern Treasury, Oracle Fusion) are cross-class — different customer needs (auditor-shape statements, real-money reconciliation) that don't transfer to a game-economy SDK serving F2P studios at MVP scale.

The /design seat's three (α)-supporting claims fell under research:
- "Stripe ships ending_balance per row" → **falsified** by Stripe BalanceTransaction object spec.
- "Ledgers ship running balance per row" → **true at F2 class, false at game-economy class**.
- "Railway pricing makes (α) cheap insurance" → **not load-bearing** once audience-class decides on grounds other than cost.

Reversibility note: if a future class pivot makes (α) needed, `ALTER TABLE transactions ADD COLUMN balance_after NUMERIC(20,4)` is metadata-only on regular tables (PG11+ optimization per Postgres 16 docs); partitioned-table behavior is strong-inferred (each partition is a regular table receiving the same ADD COLUMN propagation) but not directly cited. Historical rows would carry NULL; SQL functions update to populate from next credit/debit forward. No expensive backfill required.

### (γ) Compute `balanceAfter` on read via window function

**What:** History endpoint computes `SUM(CASE kind WHEN 'currency_credit' THEN amount ELSE -amount END) OVER (PARTITION BY wallet_id ORDER BY id)` per row at read time, ships in the response.

**Wins when:** Schema is fixed and immutable, but customers still need per-row running balance.

**Why not here:** Dominated by both (α) and (β) on every axis. Higher storage cost than (β) (the window evaluation needs index support; `idx_transactions_wallet_lookup` supports ordering but Postgres `WindowAgg` still reads all prior rows in the partition to compute partial sums — read cost grows with wallet history length). Higher read cost than (α) (which is a no-op read on the materialized column). At 100k+ transactions per wallet (high-value player accounts), the window function becomes slow read; no upside vs (α).

### (b) Flat per-player history endpoint, currency as query filter

**What:** `GET /v1/players/{externalId}/transactions?currency=gems` — cross-currency-per-player flat history.

**Wins when:** Customer's primary use case is a player profile screen showing all activity across all currencies in one feed (e.g., "Sally earned 100 gems, spent 50 coins, redeemed 10 energy on the same day"). Saves N-currency fan-out per profile load when N is large (10+ currencies).

**Why not here:** The marketing snippet on `code-walkthrough.tsx` shows `wallets.history({ player, currency })` — currency is a required parameter. F2P games typically have 2–4 currencies (soft, hard, energy, premium); fan-out across 4 calls at session start is cheap. Non-breaking-additive: this endpoint can ship later as `GET /v1/players/{externalId}/transactions` (currency-optional or absent) without breaking the per-currency endpoint.

### (c) Top-level transactions collection

**What:** `GET /v1/transactions?player=...&currency=...&from=...&to=...` — cockpit-audit-friendly cross-player, cross-currency, filter-heavy.

**Wins when:** The primary audience is the cockpit audit panel (Month 6 faucet/drain dashboard per `[[mvp-feature-sequence]]`) — admin session, cross-player queries, rich filter set.

**Why not here:** Different audience (admin session, not API key); different authz model (`adminGate`, not `apiKeyMiddleware`); different read pattern. Belongs in a future Month 6 slice with its own contract entry. Mixing it into the SDK surface confuses the customer-facing API with the admin-facing audit API.

### G11.3 alternative: lazy-create player + wallet on read (rejected)

**What:** Balance read on unknown player external_id materializes a `players` row + `wallets` row + returns `{ balance: "0", playerId: <new>, walletId: <new>, ... }`.

**Wins when:** Customer's integration assumes the response always contains stable IDs (`playerId`, `walletId`) for downstream reconciliation in their own DB, AND customer accepts the PII + cardinality cost.

**Why not here:**
- **PII footprint creep** — reads materialize the external_id as the canonical `players.external_id` value, even when the caller is exploring or enumerating. Regression vs M-1.5's careful HMAC-OTel-hash discipline.
- **Audit-log noise** — `pii_audit` per `[[player-auth]]` fires on player insert. Reading a balance shouldn't trigger a PII-creation audit entry.
- **Cardinality blowup** — customer integrates `balance()` on a per-page-view path (wallet-UI render on every screen) → every unique external_id seen creates a player row. Unbounded growth from reads, not customer-driven writes.
- **No production cite** — every surveyed game-economy SDK keeps reads stateless. The lazy-create-on-read pattern has no audience-class precedent.

### G11.3 alternative: 404 `UnknownPlayerError` on both reads (rejected)

**What:** Unknown player → 404 with `{error: {code: 'UNKNOWN_PLAYER', message: ..., playerExternalId: ...}}`. SDK throws `UnknownPlayerError` from `packages/sdk-node/src/errors.ts` (the class that's been reserved).

**Wins when:** Customer's integration requires an explicit-create-player flow (e.g., onboarding gate where first credit must happen through a controlled signup endpoint, not gameplay). The 404 is the signal that the player needs to be created first.

**Why not here:** BokChoy doesn't ship an explicit `POST /v1/players` endpoint at MVP. The lazy-create-on-credit flow (M-1.5) means the "create" pathway is implicit — players come into existence by being credited. Making reads 404 on unknown player while credits lazy-create the same player would be a self-contradictory API: customer learns "to create a player, send a credit; to check if a player exists, send a balance read and catch 404." That asymmetry has no engineering reason to exist. User-ratified customer-shape constraint *"new player → balance 0 is the common case"* directly rejects this path.

## Failure mode

**Pagination cursor poisoning.** A malicious or buggy caller supplies a `starting_after` value pointing at a non-existent transaction id. Behavior: the JOIN returns empty results because `t.id < <huge_value>` is satisfied trivially or not at all, but the customer can't distinguish "empty page because of bad cursor" from "empty page because end of history." Specific scenario: SDK customer caches cursor across SDK upgrades, BokChoy's `transactions.id` sequence gets reset (e.g., from a partition-detach + re-attach sequence misorder), customer's cached cursor now points outside the valid range — returns empty data, customer thinks history was cleared.

**Probability:** low at MVP — no operational events on the transactions partition table yet. Mitigation: document the cursor as opaque (don't expose `nextCursor` as `transaction_id`-shape; could base64-encode in a future version if the foot-gun materializes). For now, accept the failure mode and revisit if a customer hits it.

**Read RLS GUC missed-context bug.** If the `withTenant(db, projectId, ...)` callback fails to set the GUC correctly (e.g., a refactor introduces a code path that bypasses `withTenant` and uses raw `db.execute`), the read silently returns either nothing (if the policy `USING` clause fails closed) or potentially cross-tenant data (if RLS isn't `FORCE`d on the role). Same defense as the wallet-mechanics §8 RLS posture — `[[backend-stack]]` F1 mitigation #2 `TenantTx` branded type prevents this at compile time when the wrapper is called through the branded `Tx` type.

**Probability:** low (TenantTx brand enforced). Mitigation: integration test asserts cross-tenant isolation (project A's Bearer key can't read project B's wallet) — owed in the smoke-script extension per cascade obligation 19.

## Mitigations

1. **TenantTx brand check at wrapper boundary.** Wrapper signature `walletBalanceByExternalId(tx: Db | Tx, ...)` accepts the broader type, but the route handler always passes the `Tx` returned by `withTenant` — TS-level enforcement that direct `db` calls don't slip through.
2. **Integration test for cross-tenant isolation.** Per cascade obligation 19, smoke-script tests project A's API key reading project B's wallet → expect 200 synthesized zero (the wallet exists for B but A's RLS GUC hides it from A's read). This proves the RLS isolation holds for reads, not just writes.
3. **Cursor convention documented as opaque.** SDK docs (cascade) — explicitly state that `nextCursor` is "an opaque token; do not parse, store, or modify it."
4. **OTel `wallet_exists` attribute** — diagnostic for trace-level inspection of how often the synthesized-zero path runs vs the materialized-wallet path. If `wallet_exists=false` rate spikes, indicates either customer enumeration probe (potential abuse) or normal new-player onboarding spike.

## Idiom citations

- **`[[wallet/wrapper-shape]]` Fork 1** — db-separate + params-object signature. Both new wrappers follow this verbatim: `walletBalanceByExternalId(tx, { projectId, ... })`.
- **`idioms/typescript.md` (discriminated union)** — wrapper return type uses `{exists: false} | {exists: true, ...}` discriminator instead of nullable-fields-bag. The route handler narrows via `if (result.exists)` and TypeScript guarantees field access safety. No optional chaining on the wrapper return; only on the route response shape (where the wire-level optional fields are intentional per G11.6).
- **`[[wallet/credit-route-contract]]` (iv) HMAC-OTel-hash pattern** — re-applied verbatim. Same helper (`hashPlayerExternalIdForOtel`), same env var (`BOKCHOY_OTEL_PII_SALT`), same span attribute key (`bokchoy.player_external_id_hash`).
- **Stripe pagination convention** — `starting_after` + `limit` + `hasMore`. Production-cited; standard across BokChoy's customer-facing API surface (already settled in `[[admin-list-endpoints-research]]` F3 + (Pa-none) → cursor-when-MVP-grows; this is the first cursor-paginated endpoint to actually ship at MVP).

## Revisit when

- **Customer pivots to financial-ledger class.** If BokChoy ever serves customers requiring real-money cashout (regulatory accounting, auditor-shape statements, multi-party settlement reporting), revisit G11.7 — (α) likely wins under the F2 audience class. Trigger: any vault entry adopting "real-money," "settlement," "reconciliation-grade," or similar terminology in the customer-positioning section. Cheap path documented in *Rejected alternative (α)* reversibility note.
- **Customer asks for cross-currency activity feed.** Trigger: 2+ customers ask for "show me Sally's activity across all currencies in one call." Ship `GET /v1/players/{externalId}/transactions` (cross-currency for one player) as a non-breaking-additive endpoint. Don't generalize the existing per-currency endpoint.
- **Cockpit Month 6 faucet/drain dashboard.** Trigger: any /design pass for cockpit transaction-audit UI. Ship `GET /v1/transactions?...` (top-level collection, `adminGate` auth) as a separate endpoint with its own contract entry.
- **Pagination cursor foot-gun materializes.** Trigger: customer reports stale-cursor breakage. Make `nextCursor` opaque-base64 encoded then.
- **Per-row balance customer ask.** Trigger: 2+ customers ask for per-row running balance. Re-derive whether they want F2-class shape (probably indicates a class pivot — see first trigger) or just a docs gap on the client-side compute pattern.
- **History endpoint hot-path latency regresses.** Trigger: p95 on `wallet.history` span exceeds 50ms at modest load (≤10 rps per project). Investigate query plan — likely missing partition pruning on `transactions` once the table is partitioned by `created_at` per `[[wallet-mechanics]]` §7.
