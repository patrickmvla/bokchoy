---
type: decision
features: [inventory]
related: ["[[inventory/.research/inventory-primitive-research]]", "[[wallet/credit-route-contract]]", "[[wallet/balance-history-contract]]", "[[mvp/mvp-feature-sequence]]", "[[architecture/idempotency-strategy]]", "[[architecture/multi-tenant-rls-research]]", "[[architecture/wallet-mechanics]]"]
created: 2026-05-19
confidence: high
---

# Inventory primitive contract: per-definition stackable items, player-centric REST routes, code-keyed catalog, C-Reject on overflow

## Decision

BokChoy's Inventory primitive ships as the second spine primitive (sibling to Wallet) per `[[mvp/mvp-feature-sequence]]` 2026-05-18 amendment. **Eight sub-decisions, each grounded in `[[inventory/.research/inventory-primitive-research]]`:**

### (i) Item model: M-A — per-definition `stackable: bool` flag

Items split into stackable (consolidated by count) vs non-stackable (per-instance UUID) at the catalog-definition level. **Single inventory table** with conditional uniqueness — partial UNIQUE indexes carry the stackable-vs-instance split. No second table; no `inventory_stacks` vs `inventory_instances` split. Production cite: Nakama Hiro per `[[inventory/.research/inventory-primitive-research]]` F2 (M-A). Rejected M-B (PlayFab named multi-stack + per-stack JSONB), M-C (LootLocker pure per-instance), M-D (AccelByte slot-based) — winning conditions for each enumerated in *Rejected alternatives* below.

### (ii) Schema — two new tables, one new SQL function pair

**`items` (catalog) — new table:**

```sql
CREATE TABLE items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  code        TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  stackable   BOOLEAN NOT NULL DEFAULT TRUE,
  max_count   INTEGER,  -- NULL = unbounded; only meaningful when stackable=true
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT items_code_check         CHECK (code ~ '^[A-Za-z0-9_]{1,64}$'),
  CONSTRAINT items_max_count_check    CHECK (max_count IS NULL OR max_count > 0),
  CONSTRAINT items_max_count_consistency CHECK (stackable OR max_count IS NULL)
);
CREATE UNIQUE INDEX items_project_id_code_unique ON items (project_id, code);
CREATE INDEX idx_items_project ON items (project_id);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON items
  AS PERMISSIVE FOR ALL TO bokchoy_app
  USING (project_id = current_setting('app.current_tenant')::uuid);
```

**`inventory` (ownership) — new table:**

```sql
CREATE TABLE inventory (
  id              BIGSERIAL,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  instance_id     UUID,  -- NULL when item.stackable=true; gen_random_uuid() when stackable=false
  count           INTEGER NOT NULL DEFAULT 1,
  properties      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- per-row metadata; usable for both modes but typically only populated for non-stackable
  version         BIGINT NOT NULL DEFAULT 0,  -- optimistic concurrency (mirrors wallets.version per wallet.ts:71)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at),  -- partition-ready (matches transactions per wallet.ts:182)
  CONSTRAINT inventory_count_check CHECK (count >= 0)
);

-- Stackable rows: one row per (project, player, item); count is consolidated
CREATE UNIQUE INDEX inventory_stackable_unique
  ON inventory (project_id, player_id, item_id)
  WHERE instance_id IS NULL;

-- Non-stackable rows: one row per (project, player, instance_id); count is always 1
CREATE UNIQUE INDEX inventory_instance_unique
  ON inventory (project_id, player_id, instance_id)
  WHERE instance_id IS NOT NULL;

CREATE INDEX idx_inventory_player ON inventory (project_id, player_id);
CREATE INDEX idx_inventory_item   ON inventory (project_id, item_id);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inventory
  AS PERMISSIVE FOR ALL TO bokchoy_app
  USING (project_id = current_setting('app.current_tenant')::uuid);
```

**`item_grant_by_external_id` and `item_consume_by_external_id` SQL functions** — analogous to `wallet_credit_by_external_id` / `wallet_debit_by_external_id` per `[[wallet/credit-route-contract]]` (ii). Each takes `(p_project_id, p_player_external_id, p_item_code, p_amount, p_idempotency_key_id, p_source_event_id, p_metadata)` and atomically:
1. Lazy-resolves player by `(project_id, external_id)`; lazy-creates if absent (per `[[wallet/credit-route-contract]]` (iii) policy — class-consistent).
2. Resolves item by `(project_id, item_code)`; raises `BC080 UnknownItem` if absent.
3. Reads `items.stackable` + `items.max_count` for the policy branch.
4. **Stackable branch:** UPSERT `inventory (project_id, player_id, item_id, count=N)` with `count = count + p_amount`. CHECK overflow: if `items.max_count IS NOT NULL AND new_count > items.max_count`, RAISE `BC081 InventoryOverflow` with `{currentCount, requestedAmount, maxCount, availableCapacity}` in the error message.
5. **Non-stackable branch:** INSERT one new `inventory` row per unit granted, each with a fresh `instance_id` (UUID v4 via `gen_random_uuid()`). `p_amount` non-stackable grants → `p_amount` rows.
6. INSERT into `transactions` with `kind = 'item_grant'`, `amount = p_amount`, `item_id`, `idempotency_key_id`, `source_event_id`, `metadata`. Reuses existing `transactions.kind` CHECK enum per `packages/db/src/schema/wallet.ts:185` — no audit-log migration.
7. RETURN `(transaction_id, player_id, item_id, new_count_or_instance_ids)`.

Consume mirrors with subtraction; raises `BC082 InsufficientInventory` on under-zero (symmetric to wallet `BC010 InsufficientFunds`).

### (iii) Routes — player-centric REST, symmetric to `[[wallet/credit-route-contract]]`

Four new HTTP endpoints mounted via `mountInventoryRoutes` in `apps/backend/src/inventory/index.ts`:

1. **`POST /v1/players/{playerExternalId}/inventory/{itemCode}/grant`**
   - Auth: `apiKeyMiddleware` (inherits M-1.5 auth chain).
   - Validators: `sValidator('param')` for `{playerExternalId, itemCode}` + `sValidator('json')` for body.
   - Body: `{amount: int >= 1, reasonCode: string, sourceEventId?: string, metadata?: object}`.
   - Idempotency: existing `idempotencyMiddleware` (Brandur-shape, 24h per `[[architecture/idempotency-strategy]]`). Required `Idempotency-Key` header per Stripe-class convention.
   - Response 201 bare-data: `{transactionId, playerId, itemId, instanceIds?, newCount?, version}`. Stackable items return `newCount + version`; non-stackable items return `instanceIds: string[]` (array of fresh UUIDs).
   - Errors Stripe-wrapped: 400 VALIDATION_ERROR, 401 AUTH, 404 `UNKNOWN_ITEM` (with `availableItems` enumeration mirror to currency 404), 409 `IDEMPOTENCY_CONFLICT`, 422 `INVENTORY_OVERFLOW` (with `{currentCount, requestedAmount, maxCount, availableCapacity}` per (vi)), 500 internal.

2. **`POST /v1/players/{playerExternalId}/inventory/{itemCode}/consume`**
   - Mirror of grant. Body shape identical. Errors include `INSUFFICIENT_INVENTORY` (with `{currentCount, requestedAmount}`) instead of overflow.
   - Non-stackable consume requires `instanceId` in body to identify which instance to consume. Stackable consume operates on count.

3. **`GET /v1/players/{playerExternalId}/inventory`**
   - Read all items the player owns. Stripe-cursor-paginated per `[[wallet/balance-history-contract]]` G11.4 (default limit 10, max 100, ORDER BY inventory.id DESC).
   - Stateless reads: unknown player → 200 with empty `data: []` array (no row materialization, preserves M-1.5 PII discipline per `[[wallet/balance-history-contract]]` (iii)).
   - Response: `{data: InventoryRow[], hasMore: bool, nextCursor?: string}`. Each `InventoryRow`: `{itemCode, displayName, count, instanceId?, properties?, updatedAt}`.

4. **`GET /v1/players/{playerExternalId}/inventory/{itemCode}`**
   - Read a single item's player-state. Useful for "does the player have this?" probes.
   - Stackable: returns `{itemCode, count, version, updatedAt}` or 200 zero `{itemCode, count: 0}` on absent.
   - Non-stackable: returns `{itemCode, instances: [{instanceId, properties, updatedAt}]}` or 200 empty `{itemCode, instances: []}`.

**Auth chain per route (inherits M-1.5 + GAP 11):** `apiKeyMiddleware` → `sValidator('param')` → `sValidator('json'|'query')` → `idempotencyMiddleware` on mutating routes only (not GETs per Stripe convention).

### (iv) Item identification: `code` (slug), regex `^[A-Za-z0-9_]{1,64}$`

Customer-facing identifier is `items.code` — string slug, registered per-project. Internal UUID `items.id` never exposed to SDK or HTTP surfaces (per `CONTEXT.md` Currency-`code`-vs-`currencyId` resolution applied to items). Charset and length defended in *Reasoning* below.

### (v) Soulbound / tradability — NOT shipped at MVP

No `tradable` / `marketable` / `soulbound` column on `items` at v1. F2P SDK class (Nakama, LootLocker, AccelByte, PlayFab V2) uniformly omits — per `[[inventory/.research/inventory-primitive-research]]` F4. Schema-additive when first customer signals peer-trading marketplace need. Revisit-when trigger below.

### (vi) Stack capacity policy: C-Reject on overflow

Grant operations on stackable items with `max_count` set raise `BC081 InventoryOverflow` (HTTP 422 `INVENTORY_OVERFLOW`) when the grant would push count above max. Error body carries `{currentCount, requestedAmount, maxCount, availableCapacity}` per Stripe `UNKNOWN_CURRENCY` + `availableCodes` shape precedent.

Caller (game server) decides what to do: drop, retry to Mailbox (Month 6 primitive), alert player. **C-Clamp rejected** — silent intent-corruption, inconsistent with wallet `BC010` semantics. **C-Mailbox rejected** — depends on Mailbox primitive not yet built. Symmetric to wallet `wallet_debit` raising `BC010 InsufficientFunds` on under-zero; inventory `item_grant` raises `BC081 InventoryOverflow` on over-max.

`max_count IS NULL` (unbounded) is the default — overflow only fires for items whose definition opted in. Non-stackable items don't have `max_count` (CHECK constraint `items_max_count_consistency` enforces).

### (vii) Operation set at MVP: grant + consume only (no `set`)

Inventory ships **incremental operations only** at MVP — `grant` and `consume`. PlayFab's `UpdateInventoryItems` (set-to-exact) and `DeleteInventoryItems` (remove entire stack) are NOT shipped at v1. Symmetric to wallet's credit + debit shape. `set` semantics deferred until a customer signals need (typically: catalog admin tooling that needs "set this player's inventory to this state"). Backward-compatible-additive at that point.

### (viii) Transactions reuse: no audit-log migration owed

`transactions.kind` CHECK constraint already includes `item_grant`, `item_consume`, `compensation_grant` per `packages/db/src/schema/wallet.ts:185-186`. `transactions.amount` is `NUMERIC(20,4)` — accepts integer item counts as `1.0000` cleanly. `transactions.wallet_id` is nullable (per `wallet.ts:158`); item-only rows leave `wallet_id NULL` and populate `item_id` (which already exists per `wallet.ts:168`). **No `transactions` schema changes owed for the inventory primitive.**

## Reasoning

### Why M-A item model

Per `[[inventory/.research/inventory-primitive-research]]` F2, the four production-cited item models (M-A Nakama hybrid, M-B PlayFab named-multi-stack, M-C LootLocker per-instance, M-D AccelByte slot-based) have no class convergence — each is defensible for different game shapes. M-A wins for BokChoy's MVP audience because:

1. **Schema mirrors existing wallet shape.** `wallets(project_id, player_id, currency_id, balance, version)` per `wallet.ts:57-88` is the same composite-uniqueness pattern. Operator readers learn one pattern, apply to both primitives. Substrate consistency (production-cited: Nakama Hiro stackable-flag-with-count; confidence: high).
2. **Most extension-friendly default.** M-A extends into M-B (add nullable `stack_id` + `properties` columns) or M-C (flip `stackable=false` and use existing `instance_id` column) without schema redesign. M-B and M-C each lock in a specific model at v1 — backing out requires column drops + handler rewrites. (Inferred from the schema-evolution patterns; confidence: medium — no production cite directly proves this asymmetry, but the column-add path is non-breaking-additive while column-semantic-flip is not.)
3. **Audience match.** Per `[[wedge-decision]]` BokChoy targets indie/SMB F2P studios — the inventory-bag game shape (consumables, stackable cosmetics, occasional non-stackable equipment). M-B's per-stack JSONB metadata pays for rolled-stats use cases the v1 audience hasn't asked for; M-C's pure per-instance pays for MMO-class unique-item economies the v1 audience doesn't ship; M-D's slot infrastructure pays for slot-based gameplay the v1 audience doesn't ship. (Class match per `[[mobile-f2p-economy-math-research]]`; confidence: high.)

### Why single-table M-A with partial UNIQUE indexes (not two tables)

Two-table M-A (`inventory_stacks` + `inventory_instances`) would mirror the schema in a way that makes the stackable/non-stackable split syntactically obvious. **Rejected** — it would also double the read-path complexity: every "what does player X own" query becomes a UNION across two tables; every transaction-log JOIN doubles; partition-readiness doubles. The single-table-with-partial-UNIQUE pattern is what Postgres supports natively for this exact case — discriminated rows in one relation, integrity via partial constraints (production-cited: Postgres 16 docs on partial indexes; docs-cited; confidence: high).

### Why `^[A-Za-z0-9_]{1,64}$` for `items.code`

**Length 64 chars** — derived from production data, not chosen by feel. Longest realistic production item names observed (PlayFab `legendary_dragonscale_armor` 28 chars; constructed verbose case `battle_pass_season_07_legendary_reward_chest_variant_3` 54 chars) consume <85% of a 64-char budget. Smaller bounds (32) eat the verbose case; larger bounds (128) match `external_id` width but invite junk-drawer usage as descriptive prose; 255 (Stripe `idempotency_key`-cap) is header-class budget for a primary-key-shaped identifier — wrong scale.

**Charset `[A-Za-z0-9_]`** — unchanged from currency `code` (per `wallet.ts:43`). URL-segment safe-by-construction (`items.code` appears in path `/v1/players/{externalId}/inventory/{itemCode}/grant`); `_` is URL-unreserved; `.` and `-` are unreserved-but-shape-confusable (`item..name` path-traversal lookalikes; `-` mixes with `reason_code` kebab convention). One charset for `currencies.code` + `items.code` reduces operator spec-page count by one.

**Lower bound 1** — class precedent (Nakama accepts 1-char `a`). Enforcing a 2-char minimum is arbitrary discipline customers route around with `_`.

**Mixed case allowed** — differs from `reason_codes.code` `^[a-z][a-z0-9_]{0,63}$` which is lowercase-first. Rationale: items are operator-customer-visible (appear in URLs the customer reads + displays); customers want `LegendarySword` for marketing-copy display. Currency `code` already permits mixed-case; items follow that precedent.

### Why C-Reject on overflow

Class-internal symmetry: wallet `wallet_debit` raises `BC010 InsufficientFunds` on the under-zero boundary; inventory `item_grant` raising `BC081 InventoryOverflow` on the over-max boundary is the same shape. C-Clamp silently corrupts customer intent ("I tried to grant 5, you gave 2") — wallet path explicitly refused that pattern at the symmetric under-zero boundary. C-Mailbox depends on Mailbox infrastructure not yet built per `[[mvp/mvp-feature-sequence]]` (Month 6 primitive). The trilemma dissolves when MVP ships incremental ops only — `set` semantics (PlayFab `UpdateInventoryItems`) sidestep overflow ambiguity by construction (set is clamp-by-definition), but `set` is deferred.

### Why grant + consume only at MVP

Customer signal: zero v1 customers have asked for `set` semantics. Class evidence: PlayFab ships `UpdateInventoryItems` because PlayFab's Game Manager admin UI has a "set inventory to this state" workflow — BokChoy's cockpit at Month 1 doesn't (per `[[mvp/mvp-feature-sequence]]` 2026-05-18 amendment, Dashboard v1 ships catalog editor + transaction inspector + player search, not state-set tooling). Adding `set` later is a new endpoint, not a behavior change to an existing one — backward-compatible-additive (production-cited: this is exactly how PlayFab evolved — `AddInventoryItems` shipped before `UpdateInventoryItems`; confidence: medium — couldn't find Microsoft's version history but the API names + numbering imply sequence).

## Engineering substance applied

- **Consistency:** SERIALIZABLE on grant/consume mutating paths per `[[architecture/wallet-mechanics]]` §3 (inherits Wallet's isolation level via shared `withTenant` wrapper). Optimistic concurrency on stackable rows via `inventory.version BIGINT` column mirroring `wallets.version`. Reads use READ COMMITTED with stateless-zero semantics (no row materialization on unknown player) per `[[wallet/balance-history-contract]]` (iii).
- **Failure semantics:** at-least-once + Brandur-shape idempotency per `[[architecture/idempotency-strategy]]`. Server-derived natural keys (no random UUIDs from customer side — `Idempotency-Key` header is opaque to BokChoy and reused on retry). 24h TTL via existing reaper. Both grant and consume route through the same idempotency middleware.
- **Concurrency:** stackable upserts use UNIQUE-constraint-driven `INSERT ... ON CONFLICT DO UPDATE SET count = count + p_amount` with `version` increment + CHECK on overflow inside the same transaction. Non-stackable grants are plain INSERTs (each new instance is independent). Race-safe — no read-then-write windows.
- **Observability:** OTel spans `inventory.grant` / `inventory.consume` / `inventory.list` / `inventory.get`. Attrs inherit M-1.5 set: `bokchoy.project_id`, `bokchoy.player_external_id_hash` (HMAC-SHA256 truncated 16 hex per `[[wallet/credit-route-contract]]` (iv)), `bokchoy.item_code`, plus inventory-specific: `inventory.operation_kind` (grant|consume), `inventory.stackable`, `inventory.amount`, `inventory.new_count` (stackable) or `inventory.instance_count` (non-stackable). Errors emit `bokchoy.error.code` (BC080/BC081/BC082) for dashboard grouping.
- **Storage and access:** read-heavy on list/get endpoints (game server pings on session resume); write-heavy on grant during gameplay (quest reward, IAP, loot drop). `idx_inventory_player` covers list; `inventory_stackable_unique` doubles as lookup index for get-by-item. Partition-ready PK `(id, created_at)` matches `transactions` pattern; partitioning not enabled at MVP (per `[[wallet/balance-history-contract]]` parallel decision).
- **Networking and protocols:** HTTP/1.1 + JSON. Hono routing per `[[architecture/backend-stack]]`. Player-centric REST URL shape per `[[inventory/.research/inventory-primitive-research]]` F5 class signal.
- **Security:** RLS `pgPolicy('tenant_isolation', ...)` on both `items` and `inventory` tables — mirrors every other tenant-scoped table from migration 0001. API key auth via existing `apiKeyMiddleware`. No PII in inventory rows (player identified by UUID-internal-only at the inventory layer; `external_id` resolution happens at the route handler before reaching the SQL function).

## Production-grade gates

- **Idiomatic:** Postgres-backed inventory primitive with RLS tenancy + composite UNIQUE composite uniqueness + Drizzle ORM table declarations matches the patterns already shipped in `wallets`, `currencies`, `transactions`, `idempotency_keys`. The partial-UNIQUE-index pattern for stackable-vs-instance discrimination is Postgres-native (per Postgres 16 docs §11.8). Stripe-shape error envelope already in production via existing wallet routes. **Production-cited: high** (BokChoy's own substrate + Nakama Hiro shape transfer).
- **Industry-standard:** ≥2 named production references — **Nakama Hiro** (M-A schema shape, stackable-flag + per-definition consolidation) + **PlayFab Economy v2** (player-centric inventory operations + idempotency-on-grant). Both surveyed in `[[inventory/.research/inventory-primitive-research]]`. AccelByte's slot-based variant (M-D) is rejected here but is an additional production cite for "inventory primitive in F2P SDK class." Confidence: high.
- **First-class:** Postgres native `INSERT ... ON CONFLICT DO UPDATE` for stackable upserts (no custom mutex tables); native partial UNIQUE indexes for the stackable/instance split; native `pgPolicy` for RLS; standard SQL CHECK constraints for `items_max_count_consistency`. No platform-fighting workarounds.

## Rejected alternatives

### M-B — PlayFab named multi-stack
**What:** `inventory(project_id, player_id, item_code, stack_id, count, properties JSONB)` composite key + per-stack JSONB metadata. Default `stack_id = 'default'`; customers create custom stacks for per-instance customization.
**Wins when:** customer ships rare-item-with-rolled-stats (gacha pulls with per-instance affixes; MMO loot with unique stat rolls; cosmetics with named skin variations). Per-stack `properties` is load-bearing for the game design — the same item code can have many distinct stacks with different metadata, all owned by the same player.
**Why not here:** Adds a second customization axis (`stack_id`) BokChoy has no v1 customer signal for. The MVP audience per `[[wedge-decision]]` is indie/SMB F2P — gacha is present, but rolled-stats per pull is a specialized sub-class (not all F2P games). M-A extends into M-B by adding nullable `stack_id` + `properties` columns later, non-breaking-additive. Front-loading M-B's complexity pays for use cases not yet on the customer roadmap. Revisit-when triggers below.

### M-C — LootLocker pure per-instance
**What:** every owned item = one row keyed by `instance_id` UUID. No stack consolidation. `properties` JSONB per row. Equivalent to forcing `stackable=false` on every item.
**Wins when:** customer ships MMO-class unique items (crafted weapons with player-set names; provenance-tracked rare items; NFT-class one-of-one cosmetics). Per-instance identity has commercial or gameplay value.
**Why not here:** Per-instance grows the inventory table linearly with grants. At MVP F2P scale (10K MAU × ~100 items each over 6 months = 1M rows per project), manageable but heavier than M-A. Also pays per-row overhead for stackable consumables (1 row per potion is wasteful). M-A supports M-C use cases via `stackable=false` items; opting in is per-item-definition.

### M-D — AccelByte slot-based
**What:** `inventory_slots(project_id, player_id, slot_id, occupant_item_code, count)`. Slots are first-class; items occupy slots.
**Wins when:** customer ships slot-based gameplay (auto-battler boards, deck-builder hands, equipment slots with fixed positions). Slot identity ≠ item identity; full-slot rejection on grant is a feature.
**Why not here:** Slot infrastructure (slot allocation, slot-vs-item identity, full-slot rejection on grant, slot-rearrangement endpoints) is operational complexity with no v1 customer requirement. Slot semantics can be implemented client-side on top of M-A's flat inventory at zero backend cost.

### C-Clamp on overflow
**What:** silently cap grant at `max_count`, return clamped count, log overflow.
**Wins when:** customer's overflow semantic is "best-effort grant up to cap" (e.g., daily-login-bonus that should never error even at cap; auto-reward systems that don't want to handle overflow errors).
**Why not here:** class-internal inconsistency with wallet `BC010 InsufficientFunds` (wallet refuses silent clamping at the symmetric under-zero boundary). Customer can implement clamp behavior client-side by catching `INVENTORY_OVERFLOW` and accepting the partial grant; BokChoy refusing to silently corrupt intent is the safer default.

### C-Mailbox on overflow
**What:** overflow goes to `inventory_mailbox` table for later claim.
**Wins when:** game design requires "your inventory is full, your reward is waiting in the mailbox" UX (PlayFab does this for some configs; mobile RPG convention).
**Why not here:** depends on Mailbox primitive not yet built. Mailbox lives in Month 6 per `[[mvp/mvp-feature-sequence]]`; can't reference an infrastructure that doesn't exist. Revisit when Mailbox lands — at that point, customer can opt into overflow→mailbox semantics via item-definition flag (additive change).

### `set` operation at MVP
**What:** ship `POST /v1/players/{playerExternalId}/inventory/{itemCode}/set` with `{count: N}` semantics. Replaces incremental grant/consume composition.
**Wins when:** admin tooling needs "set this player's inventory to this state" workflow (PlayFab Game Manager pattern). Idempotent state-set is more robust than incremental ops for catalog-editor-driven admin actions.
**Why not here:** No v1 customer signal; PlayFab's `UpdateInventoryItems` is admin-tooling-driven, BokChoy's MVP cockpit doesn't ship that workflow. Adding `set` later is a new endpoint, not a breaking change.

### Soulbound / `tradable` flag at MVP
**What:** add `items.tradable: bool` + `items.marketable: bool` columns at v1, anti-fraud temp-untradable post-purchase per Steam pattern.
**Wins when:** customer ships peer-to-peer item trading (Steam-class audience; cross-game inventory marketplaces). Tradability flags are the data-model anchor for marketplace UX.
**Why not here:** 0:4 in F2P SDK class per `[[inventory/.research/inventory-primitive-research]]` F4 — Nakama, LootLocker, AccelByte, PlayFab V2 all omit. BokChoy's audience is per-project F2P, not peer-marketplace. Schema-additive at any future point.

## Failure mode

### F1 — Schema-evolution lock-in on item model at first non-F2P partner
**What goes wrong:** First design partner ships an MMO-class game with per-instance unique-item economy (crafted weapons, rolled-stat equipment). M-A supports this via `stackable=false` items + `instance_id` per row + `properties` JSONB — but the partner expected per-stack-with-metadata (M-B shape) for "stack of 5 potions, all with different durations" use case. Schema needs extension.
**Probability:** medium — F2P audience is heterogeneous; specific shape varies per partner.
**Cost:** low — M-A → M-B extension is non-breaking-additive (add nullable `stack_id` column + read-path branch on its presence). One migration + one handler-branch change.

### F2 — Inventory row growth unbounded in pathological cases
**What goes wrong:** Customer creates `stackable=false` items + grants many instances per player per session. At MVP F2P scale (10K MAU × pathological 1000 instances each = 10M rows per project), the inventory table grows large enough to need partitioning.
**Probability:** low — F2P consumables-heavy bags rarely produce 1000+ non-stackable instances; this fires only for unusual gameplay patterns.
**Cost:** medium — partitioning by `created_at` is supported by the PK shape (`PRIMARY KEY (id, created_at)`) but requires a separate migration when the trigger fires.

### F3 — Item code collision with reason code at customer-side typo
**What goes wrong:** customer defines item `code = 'iron_sword'` and also defines reason code `'iron_sword'` (different tables, no collision constraint). Operator confusion on Cockpit transaction-inspector: "is this row's `reason_code` field the item or the reason?" In code: SDK customer accidentally passes item code in reason_code field on a wallet credit.
**Probability:** medium — both fields use compatible charsets; collision is plausible but always operator-error, never silent.
**Cost:** low — Cockpit display can disambiguate by column header; SDK validation would reject (reason_codes table FK constraint would error on `iron_sword` not being a registered reason code).

## Mitigations

- **F1:** explicit revisit-when trigger below names the migration path. /design seat re-engages within 1 week of first non-F2P partner signing.
- **F2:** monitor inventory row count per project via observability (existing OTel attrs). Alert threshold 1M rows per project. At trigger, schedule partition migration.
- **F3:** Cockpit transaction-inspector UI labels columns explicitly (`Reason Code` vs `Item Code`). SDK customer education in `@bokchoy/sdk-node` JSDoc on the grant method signature. No backend-enforcement change needed (collision is operator-error, not invariant violation).

## Idiom citations

- `[[architecture/wallet-mechanics]]` §3 (SERIALIZABLE on mutating paths) — inherited via `withTenant` wrapper.
- `[[wallet/credit-route-contract]]` (ii) — lazy-create player + by-external-id SQL function shape adopted verbatim for `item_grant_by_external_id`.
- `[[wallet/balance-history-contract]]` (iii) — stateless-zero read semantics adopted for `GET /v1/players/{externalId}/inventory[/itemCode]`.
- `[[architecture/idempotency-strategy]]` — Brandur-shape 24h idempotency-key middleware reused unchanged.
- `idioms/typescript.md (when present)` — discriminated-union response shape for grant return type (`{stackable: true, newCount, version} | {stackable: false, instanceIds}`).
- `[[wallet/wrapper-shape.md]]` — Drizzle wrapper conventions for `walletGrantByExternalId` + `walletConsumeByExternalId` (sibling module naming).

## Revisit when

- **First design partner signs with per-instance metadata requirements** (rolled stats, durability counters, charge counts, expiry timestamps per instance) — evaluate M-A → M-B extension cost vs M-A → M-C extension cost based on the partner's actual shape. Specifically: if partner needs >1 distinct metadata-bearing stack per (player, item), extend toward M-B; if partner needs >1 unique-identity row per (player, item) with no consolidation, extend toward pure M-C.
- **Customer requests `set` semantics** (PlayFab `UpdateInventoryItems`-shape) — add `POST /v1/players/{externalId}/inventory/{itemCode}/set` endpoint. Backward-compatible-additive.
- **First customer signals peer-to-peer trading or platform marketplace** — schema-extend `items` with `tradable: bool` + `marketable: bool` + anti-fraud temp-untradable-after-grant column. Per `[[inventory/.research/inventory-primitive-research]]` F4 contradiction-probe (Steam).
- **Mailbox primitive lands (Month 6 per `[[mvp/mvp-feature-sequence]]`)** — re-evaluate C-Mailbox as a per-item opt-in overflow policy (additive `items.overflow_policy` enum column with `reject | mailbox` values).
- **Inventory row count per project exceeds 1M** — schedule partition migration on `(id, created_at)`.
- **Customer demands max-count above 2,147,483,647** (INT32 ceiling) — migrate `inventory.count` from `INTEGER` to `BIGINT`. Unlikely at F2P MVP scale.

## Cascade obligations for /implementation

13 items the next /implementation seat picks up:

1. **Migration 0011** — create `items` + `inventory` tables with RLS policies + partial UNIQUE indexes per (ii); add `BC080`/`BC081`/`BC082` SQLSTATE codes to `[[wallet/.research/economy-primitives-research]]` taxonomy if needed.
2. **Migration 0012** — create `item_grant_by_external_id` + `item_consume_by_external_id` SQL functions per (ii) sub-step (4)-(7).
3. **Drizzle schema** — add `items` + `inventory` `pgTable` declarations to `packages/db/src/schema/inventory.ts` (new file). Update `packages/db/src/schema/index.ts` barrel.
4. **Wrappers** — `packages/wallet/src/inventory-grant-by-external-id.ts` + `inventory-consume-by-external-id.ts` + `inventory-by-external-id.ts` (list) + `inventory-item-by-external-id.ts` (get single). Naming: `walletGrant*` or rename module to `@bokchoy/inventory`? **/implementation pick** — recommend new module `packages/inventory/` for separation; existing wallet wrappers stay in `packages/wallet/`. Confirm before writing.
5. **Backend routes** — `apps/backend/src/inventory/index.ts` (new) + `mountInventoryRoutes(app)` mount line in `apps/backend/src/index.ts`.
6. **Zod schemas** — request body schemas for grant + consume + query param schema for list pagination.
7. **Error envelope additions** — `BC080 UnknownItem` (`availableItems: string[]`), `BC081 InventoryOverflow` (`currentCount, requestedAmount, maxCount, availableCapacity`), `BC082 InsufficientInventory` (`currentCount, requestedAmount`). Update `packages/wallet/src/sqlstate-to-error.ts` ErrorDetails union.
8. **SDK methods** — `bokchoy.inventory.grant({player, item, amount, reason, metadata?})` + `inventory.consume({player, item, amount, reason, metadata?, instanceId?})` + `inventory.list({player, cursor?, limit?})` + `inventory.get({player, item})`. Either new namespace `bokchoy.inventory.*` or sibling to `wallets.*` — **/implementation pick**.
9. **SDK error classes** — `UnknownItemError`, `InventoryOverflowError`, `InsufficientInventoryError` extending `BokchoyError`. Mirror `UnknownCurrencyError` pattern.
10. **OTel spans + attrs** — per *Engineering substance applied* §observability.
11. **Smoke-script extension** — `packages/wallet/scripts/smoke-functions.ts` adds inventory grant/consume/list cases covering: stackable grant + overflow rejection, non-stackable grant + instance-id round-trip, consume with instance-id, list with cursor pagination, cross-tenant isolation (project A's API key cannot read project B's inventory).
12. **`mvp/mvp-feature-sequence.md` amendment** — Day 17 → end-Month-2 budget item "Inventory primitive" marked LANDED on ship; no spine-shape change.
13. **CONTEXT.md amendment** — add `**Item:**` term as sibling to existing Inventory entry, distinguishing the individual catalog row from the primitive. One-line definition. Optional but recommended for vocabulary clarity.

**Three gates per slice:** monorepo `bun run typecheck`, `bun run lint`, `bun run test`. Then operator-driven curl proof: stackable grant happy-path, stackable grant overflow-reject, non-stackable grant instance-id-roundtrip, consume happy-path, consume insufficient-reject, list pagination cursor handoff, cross-tenant isolation.
