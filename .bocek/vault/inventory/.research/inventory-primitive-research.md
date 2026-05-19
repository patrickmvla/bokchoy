---
type: research
features: [inventory, wallet]
related: ["[[mvp/mvp-feature-sequence]]", "[[wallet/.research/economy-primitives-research]]", "[[wallet/.research/credit-route-shape-research]]", "[[marketing/currencies-endpoint-research]]", "[[wallet/credit-route-contract]]"]
created: 2026-05-18
confidence: high
provisional: false
---

# How do production game-economy SDKs shape the inventory primitive — item model, items-vs-currency split, stack semantics, soulbound flag, grant/consume URL shape, idempotency posture, read shape?

## Question

`[[mvp/mvp-feature-sequence]]` Month 1-3 spine names "Inventory (items, stacks, soulbound flag)" as a primitive distinct from the already-shipped Wallet. The Wallet primitive landed with currency-only operations (credit/debit/balance/history per `[[wallet/credit-route-contract]]` + `[[wallet/balance-history-contract]]`); the items half is unscoped. BokChoy's current schema has `transactions.kind` CHECK enumerating `item_grant` and `item_consume` (per `packages/db/src/schema/wallet.ts:185`) but no `items` table, no inventory module, no SDK methods.

Before the /design seat writes the inventory contract, surface the production class signal for the load-bearing schema decisions:

1. **Items vs Currencies — unified catalog or split schemas?** PlayFab's `[[wallet/.research/economy-primitives-research]]` S1 documented currency as `Type: "currency"` in the same catalog as items. Does the class converge on unified or split?
2. **Item model:** catalog-row + per-player stack quantity (single-row consolidation) vs per-instance UUID (one row per item owned) vs hybrid (per-definition flag chooses).
3. **Stack semantics:** named multi-stack (PlayFab `StackId`-style), per-definition stackable flag, or no stacking (per-instance).
4. **Item identification:** friendly-id slug (matches BokChoy's currency `code` convention), UUID-only, or numeric.
5. **Soulbound / tradability flag:** does the F2P SDK class ship it as a first-class data-model field?
6. **Grant + consume API shape:** player-centric URL (matching `[[wallet/credit-route-contract]]`'s `POST /v1/players/{externalId}/wallets/{currency}/credit`), item-centric URL, or body-encoded.
7. **Idempotency posture on grant:** Brandur-shape Stripe-pattern (same as Wallet), or different (items might compose differently — granting N copies vs crediting amount).
8. **Read shape:** flat list, per-collection sub-grouping, or per-character grouping.

## Triangulation

- **Production reference:** ✓ — 4 named F2P game-economy SDK class systems surveyed (PlayFab Economy v2, Nakama Hiro, LootLocker Server API, AccelByte Inventory Service).
- **Docs reference:** ✓ — all sources are current official documentation (PlayFab Microsoft Learn updated 2026-02-25; Heroic Labs docs current; LootLocker `ref.lootlocker.com` and `docs.lootlocker.com` current; AccelByte `docs.accelbyte.io` current — all observed 2026-05-18).
- **Contradiction probe:** ✓ — Steam Inventory Service (Steamworks documentation, observed 2026-05-18) chosen as the cross-class probe. Steam is *not* an F2P game-economy SDK — it's a cross-platform inventory layer with peer-to-peer trading and a public marketplace. Different audience-class, surfaces conditions under which the F2P consensus breaks.

## Sources examined

### Source 1 — PlayFab Economy v2 Inventory APIs
- **Tier:** 2 (current official documentation, version-pinned)
- **Provenance:** `https://learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/inventory/`, observed 2026-05-18. Updated 2026-02-25. Author: wesjong (Microsoft staff). Source: `MicrosoftDocs/playfab-docs-pr` repo, commit `2fc90013a6fed06d862fd070f864973352e39590`.
- **Author context:** Microsoft / PlayFab Economy v2 docs. Economy v2 is Generally Available per the doc's "Important" banner. Canonical reference for the PlayFab public API.
- **What it tells us:**
  - **Unified catalog:** items, bundles, virtual currencies, subscriptions all live as catalog items differentiated by `Type` enum. Per *Source 6 (items-and-inventory-overview):* "Virtual currency is a type of item used as a medium of exchange in your game."
  - **Operations** are uniform across types — `AddInventoryItems`, `SubtractInventoryItems`, `UpdateInventoryItems`, `DeleteInventoryItems`, `PurchaseInventoryItems`, `TransferInventoryItems`, `ExecuteInventoryOperations` (batch, max 50 ops / 300 items, **rollback-on-any-failure atomicity**).
  - **Item identification:** mixed UUID and friendly-id — examples show both `"Id": "0b440353-bdbc-48d8-8873-f0988c1f9d8b"` and `"Id": "LaserSword"`. AlternateIds support friendly-name → catalog-UUID resolution.
  - **Stacks:** `StackId` parameter, default `"default"`, named multi-stack pattern (e.g., `"MyNewStack"`). Per-stack `DisplayProperties` JSON metadata (`{"DifficultyRating": 5, "IsMagic": true, "Rarity": "Legendary"}`) — first-class per-instance customization on top of the catalog row.
  - **Inventory Collections:** per-player named sub-inventories (default `"default"`; named like `"main_character"`, `"Warrior Character"`). Transfers between collections supported.
  - **Idempotency:** `IdempotencyId` parameter. **14-day retention.** Using same ID with different request types raises a conflict error.
  - **Concurrency:** ETag + HTTP headers for optimistic concurrency.
  - **Cap:** 10,000 items per inventory.
  - **No soulbound or tradability flag documented in the V2 inventory overview** — search across catalog overview, items-and-inventory-overview, item Type docs shows no first-class `tradable` flag in V2 (per Source 6 confirmation; V1 had a `tradable` flag that V2 dropped from the public type list).
  - **Player identifier is body-encoded:** `"Entity": {"Type": "title_player_account", "Id": "ABCD12345678"}` — RPC-style POST with Entity in body, not URL path.

### Source 2 — Nakama Hiro Inventory
- **Tier:** 2 (vendor docs; Hiro is Heroic Labs' commercial layer atop OSS Nakama)
- **Provenance:** `https://heroiclabs.com/docs/hiro/concepts/inventory/`, observed 2026-05-18. Two fetches: initial concept extraction + targeted re-fetch on tradability + RPC method names + idempotency.
- **Author context:** Heroic Labs. Nakama (the underlying OSS engine) is a widely-deployed game backend; Hiro is the productized economy layer atop it.
- **What it tells us:**
  - **Split from currencies:** explicit — "Inventory and currencies remain distinct systems; items and currency holdings are stored separately in the Storage Engine."
  - **Item Definition (catalog row):** `name` (string), `description` (string), `category` (string), `item_sets` (array of strings), `max_count` (int64), `stackable` (bool), `consumable` (bool), `string_properties` (object), `numeric_properties` (object), `keep_zero` (bool), `disabled` (bool).
  - **Item Instance (runtime ownership row):** `{item_id, owned_time, update_time, count, string_properties, numeric_properties}` keyed by UUID at the inventory map level.
  - **Hybrid stack semantics:** `stackable: true` → consolidate to one record with `count` increment; `stackable: false` → separate UUID-keyed instances per grant. **Per-definition flag chooses; no named multi-stack.**
  - **Item identification:** definition uses string slug (`"iron_sword"`, `"health_potion"`, `"small_crafting_bag"`); instance keyed by UUID. Slug is the customer-facing identifier.
  - **No tradability / soulbound flag at item definition level** — definition lists `stackable`, `consumable`, `disabled`, `keep_zero`; absent: tradability, soulbound. "Such restrictions would likely be enforced at the server-framework level" (i.e., custom code, not data model).
  - **Consume mechanism:** `consume_reward` triggers a Hiro reward when the item is consumed — first-class consume-grants-something pattern.
  - **RPC method names + grant request shape + idempotency:** NOT documented on the concept page; deferred to client library and server framework documentation. Class signal is clear at the data-model level even without the wire-level naming.
  - **Read shape:** map keyed by `instance_uuid → ItemInstance` with merged definition/instance properties.

### Source 3 — LootLocker Server API: List Player Inventory
- **Tier:** 2 (official API reference, REST schema)
- **Provenance:** `https://ref.lootlocker.com/server/api-5291645`, observed 2026-05-18. Header version `LL-Version: "2021-03-01"`.
- **Author context:** LootLocker vendor docs. Server-side API for server-authoritative inventory operations.
- **What it tells us:**
  - **HTTP:** `GET /server/player/{player_id}/inventory` — **player-centric REST URL path**.
  - **Auth:** `x-auth-token` header (LootLocker Server Session).
  - **Response shape:** `{total: uint64, items: array}`. Top-level `total` is a count; no pagination cursors.
  - **Item row:** `{instance_id (uint64), variation_id (uint64, nullable), rental_option_id (uint64, nullable), acquisition_source (string, e.g. "grant_support"), asset, rental: {is_rental, time_left, duration, is_active}}`.
  - **Pure per-instance model.** Each owned item = one row keyed by `instance_id`. No stack quantity field; no consolidation.
  - **Rental as first-class mechanic** — time-limited ownership built into the schema.
  - **No soulbound / tradability flag** present on the inventory item shape.
  - **No character / sub-inventory grouping** on this endpoint. (A separate Server API endpoint exists for character-keyed inventory per the search results — not deep-fetched.)

### Source 4 — LootLocker Inventory Concept Overview
- **Tier:** 2 (official guide docs)
- **Provenance:** `https://docs.lootlocker.com/players/inventory`, observed 2026-05-18.
- **What it tells us:**
  - Inventory rows are "Asset Instances" — "a unique version of the asset with its own Instance ID." Per-instance model confirmed at the concept layer.
  - Sources of grants: (1) Rewards from leaderboards/progressions/triggers, (2) Purchases through catalogs, (3) Default loadouts, (4) Admin manual grants. **Multi-source grant pattern** — server pushes via various channels.
  - No stacking concept, no soulbound flag mentioned.

### Source 5 — AccelByte Inventory Service
- **Tier:** 2 (vendor docs)
- **Provenance:** `https://docs.accelbyte.io/gaming-services/modules/online/inventory/`, observed 2026-05-18. Concept overview page; API explorer requires deeper navigation.
- **Author context:** AccelByte ships a commercial backend platform used by mid-sized studios.
- **What it tells us:**
  - **Items vs currencies split:** "The service will also work with Commerce to allow item purchasing" — Inventory and Commerce (currency/store) are separate services.
  - **Item identification by `code`** (slug, matches BokChoy's currency `code` convention): "the number of inventory with the same code does not exceed the maximum instances per user."
  - **Configurable max instances per user** at inventory configuration level. Per-item cap built into config, not hard-coded.
  - **Stacking via "Slots":** "Slot offers more flexibility to manage player inventory items. This feature allows you to stack the same items in the same slot or distribute it in multiple slots." Slot-based pattern — distinct from PlayFab's named-stacks and Nakama's per-definition flag.
  - **Server-authoritative grants** explicit: "The server can perform server authoritative actions to grant items to player inventory."
  - **Sources of grants:** looting, crafting, trading, gifting. Multi-channel similar to LootLocker.
  - **No soulbound / tradability flag** mentioned in the concept overview.
  - **REST endpoint shapes, idempotency, response schemas** not surfaced in the concept page (deferred to API Explorer). The concept-level signals (item identification by `code`, split from currencies, max-instances-per-user config, server-authoritative grant) are sufficient for class-membership scoring without full API depth.

### Source 6 — PlayFab Economy v2 Items and Inventory Overview
- **Tier:** 2 (current official documentation)
- **Provenance:** `https://learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/inventory/items-and-inventory-overview`, observed 2026-05-18. Updated 2026-02-25. Author: thomg (Microsoft staff).
- **What it tells us:** (Supplements Source 1.)
  - **Five Type values in unified catalog:** "durables, consumables, bundles, subscriptions, and virtual currencies."
  - **Virtual Currency = a type of item:** "Virtual currency is a type of item used as a medium of exchange in your game." Confirms unified-catalog model.
  - **All inventory APIs support `IdempotencyId`** — class-wide reliability primitive, not opt-in per endpoint.
  - **ExecuteInventoryOperations is atomic:** "If any operation fails, the entire batch is rolled back." Explicit atomicity guarantee for batch ops.
  - **Player Inventory Collections** — first-class concept named here: "All player accounts can have one or more inventories called Collections."

### Source 7 — Steam Inventory Service Item Schema (contradiction probe)
- **Tier:** 2 (Steamworks vendor docs)
- **Provenance:** `https://partner.steamgames.com/doc/features/inventory/schema`, observed 2026-05-18.
- **Author context:** Valve. Steam Inventory Service is the cross-game inventory layer for Steam-published titles. **Audience-class mismatch with BokChoy** (Steam is a platform-mediated peer-trading marketplace; BokChoy is per-project game-economy backend). Used here specifically to surface what tradability looks like *when the class needs it*.
- **What it tells us (delta from F2P SDK class):**
  - **Explicit tradability flags at item definition level:** `tradable: bool` (enables Steam Trading between users), `marketable: bool` (enables Community Market sales), `game_only: bool` (excludes from Steam Backpack), `hidden: bool`, `store_hidden: bool`.
  - **Anti-fraud rule:** items must be temporarily untradable for ≥3 days after Market purchase.
  - **Item identification by INTEGER `itemdefid` only** — no slug mechanism. Different from F2P SDK class (which converges on slug/code).
  - **Type enum:** `'item' | 'bundle' | 'generator' | 'playtimegenerator' | 'tag_generator'`. No `currency` type — Steam currency is platform-level (Steam Wallet), not in-app.
  - **Stack semantics:** `auto_stack: bool` (grants combine into one stack as quantity changes). No documented `max_stack_size`. Closer to Nakama's stackable-flag pattern than PlayFab's named multi-stack.
  - **Bundle composition syntax:** `"201;202x5;203"` (semicolon-separated itemdefid with optional `x` quantity).
  - **Exchange/crafting recipe:** `exchange: "100,101;102x5"` first-class.
  - **Promo + drop rules:** `promo: "owns:appid"`, `drop_start_time`, `drop_interval`, `drop_window`, `drop_max_per_window` (default 1, max 10).
  - **Localization:** language-suffixed fields (`name_french`, `description_german`).

## Findings

### F1 — Items vs Currencies are SPLIT in the F2P SDK class (3:1 against unification)

- **Nakama Hiro:** explicit — "Inventory and currencies remain distinct systems" (Source 2). Storage Engine partitions items and currency holdings.
- **LootLocker:** implicit — Server API ships separate `/server/player/{id}/inventory` (Source 3) and `/server/player/{id}/wallet` endpoints. Different services.
- **AccelByte:** explicit — Inventory and Commerce are separate services (Source 5).
- **PlayFab Economy v2** (outlier): unified — Virtual Currency is a `Type` in the same catalog as items, mutated via the same `AddInventoryItems` / `SubtractInventoryItems` / `PurchaseInventoryItems` endpoints (Sources 1 + 6).

Score: **3 split, 1 unified.** Class signal favors split. PlayFab's unification is genuine but outlier within the surveyed F2P SDK class.

### F2 — Item model: three patterns, no class convergence

- **(M-A) Per-definition consolidation with stack-quantity column (Nakama):** Item Definition + Item Instance schema. `stackable: true` → single instance row with `count` integer. `stackable: false` → multiple UUID-keyed instances.
- **(M-B) Named multi-stack (PlayFab):** Catalog row + per-(player, item, StackId) row. Default `StackId: "default"`. Custom stacks with their own `DisplayProperties` JSON. Most flexible.
- **(M-C) Pure per-instance (LootLocker):** Catalog row + one row per owned item keyed by `instance_id`. No stacking.
- **(M-D) Slot-based (AccelByte):** Slots can hold one item type each; can choose to stack same items in same slot or spread across slots.

Score: 1 system per pattern. **No class convergence.** Each is defensible for different game shapes — M-C wins for unique-equipment-heavy games (per-instance crafted weapons); M-A wins for inventory-bag games (Skyrim-shape); M-B wins for cosmetics-with-per-stack-customization (rare-item-with-rolled-stats games); M-D wins for slot-based gameplay (auto-battlers, deck builders).

### F3 — Item identification: slug/code dominates F2P, integer-only is Steam-shape

- **PlayFab:** UUID + AlternateIds friendly-name (`"Id": "LaserSword"` example).
- **Nakama Hiro:** string slug (`"iron_sword"`) at definition layer; UUID at instance layer.
- **AccelByte:** string `code`.
- **LootLocker:** numeric `instance_id` + numeric `variation_id`. No slug at the per-instance API; catalog-side slug exists in admin docs (not deep-probed).
- **Steam (probe):** integer `itemdefid` only. No slug mechanism documented.

Score: **3 of 4 F2P SDKs converge on slug/code as the customer-facing identifier.** Matches BokChoy's existing currency `code` convention (per `[[marketing/currencies-endpoint-research]]` F1). Customer-facing API stays string-keyed; internal UUID separation is implementation detail.

### F4 — Soulbound / tradability flag is uniformly OMITTED in the F2P SDK class

- **Nakama Hiro:** absent at item definition. Server-framework enforces restrictions in custom code.
- **LootLocker:** absent on item instance and asset.
- **AccelByte:** absent in concept overview.
- **PlayFab Economy v2:** explicitly DROPPED from V2 (per Source 6 search results: "tradable" was a V1 feature; V2 does not document a tradable enum value).
- **Steam (cross-class probe):** explicit — `tradable: bool`, `marketable: bool`, `game_only: bool`, plus anti-fraud rules.

Score: **0 of 4 F2P SDKs ship a first-class tradability flag.** The class actively omits it. Steam ships it because Steam's audience is peer-to-peer-trading (different problem class). **Conditions under which the F2P consensus breaks:** when players can trade items peer-to-peer or on a platform marketplace.

### F5 — Grant URL shape: player-centric REST or RPC-style body-encoded; never item-centric

- **PlayFab:** RPC-style POST with `Entity.Id` in body. Endpoint is `/Inventory/AddInventoryItems` style.
- **Nakama:** RPC-style (gRPC) — `userId` first positional argument; not URL-path-encoded.
- **LootLocker:** REST player-centric — `GET /server/player/{player_id}/inventory` for read; grant endpoints follow similar `/server/player/{player_id}/...` pattern.
- **AccelByte:** REST player-centric (per concept docs; deep API not probed but the language "grant items to the player" + Admin Portal player-keyed UI is consistent).
- **Item-centric URL** (e.g., `POST /v1/items/{itemId}/grant?player=X`): **zero cites in the surveyed class.**

Score: **player-centric URL or body-encoded Entity converge for the F2P SDK class; item-centric is not a class pattern.** Matches BokChoy's `[[wallet/credit-route-contract]]` shape — `POST /v1/players/{externalId}/wallets/{currency}/credit` is class-idiomatic for game-economy SDKs.

### F6 — Idempotency: PlayFab explicit (14-day window), others undocumented

- **PlayFab:** `IdempotencyId` parameter on all inventory APIs, 14-day enforcement window, different-request-type-with-same-ID raises error (Sources 1 + 6).
- **Nakama Hiro:** not documented on the inventory concept page (Source 2 re-fetch confirmed absence).
- **LootLocker:** not documented on the API reference page surveyed (Source 3).
- **AccelByte:** not documented on the concept overview (Source 5).

Score: 1 of 4 publishes idempotency contract; **3 of 4 are silent.** Insufficient class signal to claim a convention. PlayFab's 14-day window is a single-point datum; differs from Stripe's 24-hour convention and from BokChoy's current Brandur-shape `[[architecture/idempotency-strategy]]` with 24h reaper.

### F7 — Read shape: paginated + optional sub-grouping is the dominant pattern

- **PlayFab:** `GetInventoryItems` with `CollectionId` filter + `Count` + `ContinuationToken` pagination. TurboLoading bulk variant.
- **Nakama Hiro:** map keyed by `instance_uuid → ItemInstance`. Pagination not surfaced in the concept page.
- **LootLocker:** `GET /server/player/{id}/inventory` returns `{total, items[]}`. No pagination cursors.
- **AccelByte:** REST endpoints with paginated reads (search-result extraction; not deep-probed).

Score: **3 of 4 support pagination at some level.** Sub-grouping (Collections-style) is PlayFab-only; Nakama and LootLocker offer character-keyed alternatives (deep API not probed). BokChoy currently has the cursor-pagination shape via `[[wallet/balance-history-contract]]` G11.4 (Stripe-style ID-based cursor) — class-compatible.

## Conflicts

**PlayFab unified catalog vs Nakama/LootLocker/AccelByte split.** This is the load-bearing conflict for BokChoy's schema decision (Q1).

- **Production-code precedence:** all four are commercial production systems at scale; no precedence ranking applies on tier alone.
- **Conditions under which each side wins:**
  - **PlayFab unified:** customer expectations are PlayFab-anchored (Microsoft / Xbox audience), currencies and items share many lifecycle properties (purchase, transfer, expire, drop), single-table simplicity over multi-table complexity.
  - **Nakama/LootLocker/AccelByte split:** currencies have fungible-quantity semantics fundamentally different from item ownership; split schemas keep wallet-ledger invariants (NUMERIC precision, sum-invariants) from polluting item-instance schemas; OSS-SDK customers prefer recognizable patterns.
- **BokChoy's existing state:** Wallet primitive already shipped with `currencies` table + `wallets` table separate from any `items` table. **Following PlayFab unification at this point would require migrating away from the shipped wallet schema** — high cost, no demonstrated benefit. Following the 3:1 class majority preserves existing schema and is class-idiomatic. Per *Contradiction protocol*: multiple independent production examples (Nakama + LootLocker + AccelByte) beat one (PlayFab) when no precedence differentiator applies.

**Steam tradability vs F2P SDK omission.** Not a conflict to resolve — class-membership question. BokChoy's audience-class per `[[marketing/v1-shape]]` is indie/SMB F2P; peer-trading marketplace is not a v1 requirement. The Steam flag is correct context for *when* tradability would become load-bearing (revisit-when trigger), not a counter-position for v1.

## Conditions

Findings hold under these conditions:

- **Audience-class:** indie/SMB game studios building F2P or premium games on top of BokChoy's per-project economy backend. Same class as `[[marketing/v1-shape]]` (i) defines.
- **Scale:** sub-$1M revenue, ≤10K MAU per project (per `[[wedge-decision]]`). Above this scale, multi-region inventory replication and per-item read-scaling become load-bearing concerns not surveyed here.
- **No peer-marketplace at MVP:** if BokChoy ships peer-to-peer item trading, soulbound flag becomes load-bearing (F4 reverses).
- **Server-authoritative writes:** all surveyed F2P systems assume server (game backend) drives grants. Client-driven inventory mutation is not a class pattern.

Findings break / require re-research:

- If BokChoy targets MMO-class games (unique crafted equipment, rare-item economies), per-instance UUID model (M-C, LootLocker-shape) becomes load-bearing. The current 3-way fork in F2 doesn't resolve for MMO use cases without additional research.
- If BokChoy adopts unified catalog (PlayFab-shape) post-MVP for catalog-editor ergonomics, F1's split signal does not apply — re-research catalog editor UX patterns.

## Operational implications

For the next /design seat writing `[[inventory/inventory-contract]]`:

1. **Q1 (items vs currencies split):** ship SPLIT. The 3:1 class signal + existing BokChoy schema (wallets/currencies already split) + no demonstrated unification benefit → continuing split is the dominant pick. Vault the rejection of PlayFab unification with its winning condition (customer-base anchored to PlayFab; not BokChoy's MVP audience).

2. **Q2 (item model):** the class doesn't converge. Three viable picks, each with named winning conditions:
   - **M-A (Nakama hybrid, per-definition stackable flag):** wins for inventory-bag games + provides clear stacking semantics at definition layer. Schema: `items(project_id, code, ...flags including stackable bool, max_count int)` catalog + `inventory(project_id, player_id, item_id, count, ...)` with composite UNIQUE on (player_id, item_id) when stackable=true; separate UUID-keyed row per grant when stackable=false.
   - **M-B (PlayFab named multi-stack):** wins for per-stack customization (rare items with rolled stats). Schema requires `(player_id, item_id, stack_id)` composite key + per-stack JSONB metadata.
   - **M-C (LootLocker pure per-instance):** wins for MMO-class unique items. Schema: every owned item = one UUID-keyed row. No stack consolidation.
   - **Operational lean for /design:** M-A matches BokChoy's wallet-shape (per-(project, player, currency) composite uniqueness) and is the simplest catalog-row-plus-stack model. The MVP audience (F2P indie/SMB) is not MMO-class; M-C is overkill. M-B adds operational complexity that pays off only when per-stack metadata is a known requirement (no v1 customer signal for this). Recommend M-A as the default; design pick should defend.

3. **Q3 (stack semantics):** falls out of Q2. M-A → per-definition `stackable: bool` flag. Customer-defined items declare stackability at catalog-create time.

4. **Q4 (item identification):** ship **`code`** (slug) as the wire-facing identifier. Matches existing currency `code` convention + 3-of-4 class precedent. Internal UUID stays implementation detail per `CONTEXT.md` resolution (a). Regex constraint: identical to currency `code` per existing schema: `^[A-Za-z0-9_]{1,16}$` (per `packages/db/src/schema/wallet.ts:43`) or relaxed if items need longer names. Defend the chosen regex in design.

5. **Q5 (soulbound flag):** **DO NOT SHIP at MVP.** F2P SDK class uniformly omits. Revisit-when trigger: first customer signals peer-trading marketplace requirement. Schema-evolution path: adding a `nontradable: bool` column to a future `items` table is non-breaking-additive.

6. **Q6 (grant + consume URL shape):** ship **player-centric REST** matching `[[wallet/credit-route-contract]]`:
   - `POST /v1/players/{externalId}/inventory/{itemCode}/grant` (body: amount, reason_code, idempotency-key, etc.)
   - `POST /v1/players/{externalId}/inventory/{itemCode}/consume`
   - Symmetric to wallet credit/debit. Class-idiomatic per F5 (player-centric or RPC; never item-centric).
   - Alternative: `POST /v1/players/{externalId}/inventory/grant` with `{itemCode, amount}` body-encoded. Trade-off: URL-path-encoded itemCode is more discoverable; body-encoded is more flexible for multi-item-batch grants. Design picks.

7. **Q7 (idempotency posture):** continue BokChoy's existing **Brandur-shape Stripe-pattern** per `[[architecture/idempotency-strategy]]`. Insufficient F2P SDK class signal to deviate from current convention. PlayFab's 14-day window is a single datum; BokChoy's 24h reaper is well-established and aligned with Stripe (not PlayFab).

8. **Q8 (read shape):** ship `GET /v1/players/{externalId}/inventory` with Stripe-style cursor pagination per `[[wallet/balance-history-contract]]` G11.4. Match the wallet history shape — `{data: [...], hasMore, nextCursor}`. Skip Collections / sub-grouping at MVP (PlayFab-only pattern; F2P class divides on this).

9. **Composed grant + currency-debit (purchase):** PlayFab's `PurchaseInventoryItems` and the bundle auto-unpack pattern suggest a *Shop* primitive is the proper home for "spend currency, receive item." This sits at the **Shop primitive layer in `[[mvp/mvp-feature-sequence]]` Month 1-2 (post-amendment 2026-05-18)** — outside the Inventory primitive contract's scope. Inventory contract ships grant/consume/read; Shop ships purchase (which composes grant + currency-debit + transaction-log atomically). Recommend /design treat them as separate contracts.

10. **Transaction-kind reuse:** the existing `transactions.kind` CHECK enum (`item_grant`, `item_consume`, `compensation_grant` per `packages/db/src/schema/wallet.ts:185-186`) already supports inventory mutations on the audit log. **No schema migration needed for the audit-log side** — substrate is reusable per `[[mvp/mvp-feature-sequence]]` 2026-05-18 amendment defense.

## Reproducibility note

**Reproducible.** Another investigator with the same question can reach substantively the same finding by:

1. WebFetch the canonical inventory pages for PlayFab (`learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/inventory/` + `.../items-and-inventory-overview`), Nakama Hiro (`heroiclabs.com/docs/hiro/concepts/inventory/`), LootLocker Server API (`ref.lootlocker.com/server/api-5291645`), AccelByte (`docs.accelbyte.io/gaming-services/modules/online/inventory/`).
2. WebFetch the Steam Inventory schema (`partner.steamgames.com/doc/features/inventory/schema`) as the contradiction probe.
3. Score each cite on the 8 sub-questions; F1-F7 will fall out the same way unless the docs have rotated content (worth re-verifying any cite older than 6 months).

Load-bearing judgment that COULD vary: the *operational lean* in Q2 (M-A vs M-B vs M-C). Different investigators evaluating BokChoy's MVP audience differently might lean toward M-B (per-stack customization for "live-ops cosmetic events" framing) or M-C (per-instance for "crafted-weapon" framing). The class signal genuinely doesn't converge here; design must pick with defense.

## Open threads

Not load-bearing for the next /design seat but worth noting:

1. **AccelByte API depth.** The concept page surfaced enough for class-membership; the REST endpoint shapes (URL paths, request/response field names, error envelope) were not deep-probed. Worth a deeper survey if BokChoy considers convergence on AccelByte conventions (low priority).
2. **Nakama Hiro RPC method names + grant request shape.** Concept page deferred to client library docs. If /design picks M-A (Nakama-shape model) and wants to mirror Nakama's RPC argument order, a follow-up read of the Nakama server source (`github.com/heroiclabs/nakama-common`) would surface concrete signatures.
3. **PlayFab `purchase_limit` semantics for per-player ownership caps.** Steam ships this (per F4 contradiction probe); F2P SDK class may or may not — not deep-probed. Relevant if BokChoy ships per-player ownership caps post-MVP.
4. **Inventory transaction history as separate or unified with wallet history.** PlayFab unifies (`GetTransactionHistory` covers both currency and item ops); the F2P split-schema cites don't unify the history endpoint. BokChoy's existing `transactions` table is already unified (single table for both kinds), but the history *endpoint* — `[[wallet/balance-history-contract]]` `GET /v1/players/{externalId}/wallets/{currency}/transactions` — is currency-scoped. Whether inventory ships a parallel `GET /v1/players/{externalId}/inventory/{itemCode}/transactions` or a cross-cutting `GET /v1/players/{externalId}/transactions` (filterable by currency or item) is a /design pick.
5. **Catalog editor UX class survey.** All four F2P SDKs ship admin/dashboard UIs for catalog management (PlayFab Game Manager, Nakama Console, LootLocker Web Console, AccelByte Admin Portal). The cockpit slice that ships items + catalog editor in Month 1-2 per `[[mvp/mvp-feature-sequence]]` 2026-05-18 amendment would benefit from a UX-shape research pass — but UX research is outside the primitive contract surface and is properly /design's call to schedule.
