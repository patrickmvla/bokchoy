---
type: decision
features: [shop, inventory, wallet]
related: ["[[shop/.research/pricing-locus-research]]", "[[inventory/inventory-contract]]", "[[wallet/credit-route-contract]]", "[[wallet/.research/economy-primitives-research]]", "[[architecture/idempotency-strategy]]", "[[mvp/mvp-feature-sequence]]", "[[wallet-http-contract]]"]
created: 2026-05-20
confidence: high
---

# Simple Shop primitive contract — offer-as-priced-unit (B1b), atomic debit+grant purchase

## Decision

The Shop primitive composes a Currency spend + Item grant(s) into one atomic purchase. It sells **offers**, never bare items. Eight sub-decisions:

**(i) Purchasable unit = B1b (separate `offers` entity with a price-set).** An offer is the stable wire unit (`offerCode`). It references one-or-more items (single item or bundle) and carries a **price-set** of one-or-more `{currencyCode, amount}` rows with **OR-semantics** (the buyer pays *one* of the listed currencies). Price never lives on `items`. Per `[[shop/.research/pricing-locus-research]]` F1 (6/6 systems separate the priced unit from the owned item).

**(ii) Schema = 3 new tables, all tenant-scoped + RLS `tenant_isolation` (mirrors every other tenant table):**
- `offers(id uuid pk default gen_random_uuid(), project_id uuid fk→projects restrict, code text, display_name text, description text, active boolean not null default true, created_at, updated_at)`. CHECK `code ~ '^[A-Za-z0-9_]{1,64}$'` (identical to `items.code`). UNIQUE(project_id, code). Index (project_id).
- `offer_prices(id uuid pk, project_id uuid fk, offer_id uuid fk→offers restrict, currency_id uuid fk→currencies restrict, amount numeric(20,4) not null check (amount > 0), created_at)`. UNIQUE(project_id, offer_id, currency_id) — one price per currency per offer. Multiple rows = multi-currency OR-set.
- `offer_items(id uuid pk, project_id uuid fk, offer_id uuid fk→offers restrict, item_id uuid fk→items restrict, quantity integer not null default 1 check (quantity > 0), created_at)`. UNIQUE(project_id, offer_id, item_id). One row = single-item offer; N rows = bundle. `onDelete: restrict` on item_id (cannot delete an Item referenced by an offer; mirrors `items` restrict posture).
- **Prices are mutable rows; the immutable record is the `transactions` row** that snapshots the amount actually charged at purchase time. No price-versioning table at MVP (additive later — see Revisit).

**(iii) Atomicity = one SQL function `purchase_offer_by_external_id`** (analogous to `wallet_debit_by_external_id` + `item_grant_by_external_id`, per `[[inventory/inventory-contract]]` (ii) pattern). In ONE DB transaction under the tenant GUC: resolve offer by code (BC090 if unknown / BC091 if `active=false`) → resolve the `payWith` price row (BC092 if `payWith` not in the offer's price-set) → debit the wallet reusing `wallet_debit` semantics (**BC010 InsufficientFunds** if unaffordable) → grant each `offer_items` row reusing `item_grant` semantics (**BC081 InventoryOverflow** if a stackable item would breach `max_count`) → write the ledger rows. **Rollback-on-any-failure** — partial fulfillment is impossible (research F5: class treats purchase as one atomic op; PlayFab `ExecuteInventoryOperations` rolls back the whole batch). Reuses the existing `wallet_debit` / `item_grant` overflow + locking discipline; no new concurrency primitive.

**(iv) Ledger = reuse existing kinds, link via metadata (L2).** A purchase emits **1 `currency_debit` row + N `item_grant` rows** (N = offer_items count), all sharing `metadata.purchase_id` (a UUID minted per purchase) + `metadata.offer_code`. Reason codes are the already-bootstrapped `shop_purchase_cost` (debit) + `shop_purchase_grant` (grants) per `[[wallet/.research/economy-primitives-research]]` default 12-code set. **No `transactions` schema migration** — `kind` CHECK already enumerates `currency_debit`/`item_grant`; `metadata jsonb`, `item_id`, `item_quantity`, nullable `wallet_id` all present per `wallet.ts`. A dedicated `purchase_id` column is the additive upgrade if purchase-history becomes a first-class dashboard view (Revisit).

**(v) Route = player-centric purchase sub-collection.** `POST /v1/players/{externalId}/purchases` with body `{ offer: string, payWith?: string }` (`payWith` required only when the offer's price-set has >1 currency; inferred when exactly 1). 201 bare-data. Plus two project-scoped catalog reads for the SDK/store UI: `GET /v1/offers` (list active offers with prices + items) + `GET /v1/offers/{offerCode}`. Purchase is a write on the *player's* resources (wallet + inventory), so it belongs under `/players/{externalId}/`; leaves room for `GET /v1/players/{externalId}/purchases` (history) later.

**(vi) Auth chain inherits M-1.5 / inventory contract exactly:** `apiKeyMiddleware` + `sValidator('param')` + `sValidator('json')` + `idempotencyMiddleware` on the POST; GETs skip idempotency (Stripe convention). Server-authoritative price — client passes no amount; at most a future expected-amount echo (deferred, see Revisit).

**(vii) Idempotency = Brandur 24h, reused unchanged** per `[[architecture/idempotency-strategy]]`. A retried purchase with the same Idempotency-Key replays the same `purchase_id` + same grants — double-charge protection is the load-bearing reason this matters more here than on credit/grant.

**(viii) Response shape (201):** `{ purchaseId, offer: code, paid: { currencyCode, amount }, granted: [{ itemCode, quantity, instanceIds? }] }` — `amount` is a **NUMERIC string** (e.g. `"100.0000"`, matches wallet `balance`/`balanceAfter`; amended 2026-05-21, was `number`); `instanceIds` present for non-stackable items, absent for stackable (mirrors `[[inventory/inventory-contract]]` (iii) grant discriminated-union).

**Error codes (new block BC090–093, continuing the BC080-082 inventory block):** BC090 `UnknownOffer` → 404 `UNKNOWN_OFFER` (body enumerates nothing — offer codes are not enumerated like currencies; bare message); BC091 `OfferInactive` → 422 `OFFER_INACTIVE`; BC092 `InvalidPaymentCurrency` → 422 `INVALID_PAYMENT_CURRENCY` with `{ acceptedCurrencies: string[] }` (mirrors `UNKNOWN_CURRENCY`'s `availableCodes`); **BC093 `EmptyOffer` → 422 `OFFER_MISCONFIGURED`** (`{ offerCode }`; raised pre-debit when the active offer has zero `offer_items` — the empty-offer backstop per `[[shop/contract-reconciliation-2026-05-21]]` D1). Reuses BC010 `INSUFFICIENT_FUNDS` (422) for unaffordable + BC081 `INVENTORY_OVERFLOW` (422) for grant overflow.

**AMENDED 2026-05-21 per `[[shop/contract-reconciliation-2026-05-21]]`** (closes `[[shop/review-2026-05-21]]` findings): (a) **BC093 EmptyOffer backstop** added (above) + the editor activation-invariant `active = true ⇒ ≥1 offer_items AND ≥1 offer_prices` is a hard requirement of cascade #11 (cockpit offer editor); (b) **wire `amount` is a NUMERIC string, not a number** (see (viii)/Contract below) — `offer_prices.amount` is `NUMERIC(20,4)`, schema-permits >2⁵³, so string preserves precision and matches the wallet wire; (c) offer reads expose **`active: boolean`** (see Reads below).

**SDK surface:** `bokchoy.shop.purchase({ player, offer, payWith?, idempotencyKey? })` + `bokchoy.shop.listOffers()` + `bokchoy.shop.getOffer(code)`. New `ShopApi` class, sibling to `wallets`/`inventory`. New error classes `UnknownOfferError`, `OfferInactiveError`, `InvalidPaymentCurrencyError`; reuses `InsufficientFundsError` + `InventoryOverflowError`.

## Reasoning

**Why B1b over B2 (the keystone).** B1 and B2 have *equal expressive power* for the customer's stated needs — multi-currency is multiple price rows (B1) or multiple price-options (B2); "same item different price in different contexts" is multiple offers (B1) or store-overrides (B2). B2's only genuine delta is **bulk** operator ergonomics ("20%-off the whole store" without editing N offers), which `[[shop/.research/pricing-locus-research]]` F1/F6 places in the *future* sales/promotions revisit-trigger, not MVP (production-cited: PlayFab/AccelByte carry it for catalog-scale live-ops; Nakama/LootLocker price-only-on-offer like B1). Three decisive factors for *this* project:
1. **Relational fit.** B1's price row carries an FK to `currencies` — indexable, constraint-checkable, RLS-scopable. B2's price is a JSONB array on `items` (PlayFab) or region blob (AccelByte) — loses all three and hand-rolls currency validation the FK gives free. `[[inventory/inventory-contract]]` already chose partial-unique relational indexes over JSONB bags for the same reason. (docs-cited: B2 shapes; production-cited: the relational consequence.)
2. **Immutability ↔ audit.** Stripe keeps old prices as immutable records of past transactions (Source 6). BokChoy gets that property *for free* because the `transactions` row snapshots the charged amount — so prices stay mutable rows and the audit lives in the append-only ledger. (production-cited: Stripe Products/Prices.)
3. **Additive escape under uncertainty.** B1 → B2 is non-breaking (add a `stores` table over `offers`; wire unit unchanged). The human is out of depth on whether bulk-sales arrive; the option whose wrong-guess cost is "additive migration later" wins over the one whose wrong-guess cost is "breaking a published SDK." This is the same non-breaking-additive principle that killed (A) and that `[[inventory/inventory-contract]]` used for M-A. (confidence: high, internal-consistency.)

**Why the bulk-sales lever resolves to "not day-one" without the human's input:** a store-wide scheduled discount is meaningless before a catalog + players exist; the first customer is integrating from zero. Even if that judgment is wrong, factor 3 makes B1 safe. The human delegated this explicitly ("we have enough context for a cohesive decision") — the decision is defended by evidence, not by an undefended assertion being recorded.

**Why L2 (debit + N grants, metadata-linked) over L1 (one `purchase` row):** a single row can't represent 1 debit + N item grants — the schema is one-item-per-row (`item_id`, `item_quantity`). L1 would lose per-item detail or need a new wide schema. L2 reuses existing kinds (zero CHECK migration), preserves detail, matches how the class actually works underneath (research F5: no system exposes a distinct purchase ledger primitive — purchase *is* debit + unpacked grants), and the `metadata.purchase_id` link is queryable enough for MVP with an additive column upgrade path. (production-cited: PlayFab bundle auto-unpack-to-grants.)

## Engineering substance applied

- **Consistency:** single DB transaction under the tenant GUC; the debit and all grants commit or roll back together. Reuses `wallet_debit`'s row-lock discipline (the wallet row is locked for the balance check) and `item_grant`'s post-upsert overflow check (race-safe per `[[inventory/inventory-contract]]` Slice-1 fix). No cross-row anomaly because everything is one transaction on one tenant's rows.
- **Failure semantics:** at-least-once delivery via Idempotency-Key (Brandur 24h); a retry replays the recorded response, never re-charges. Partial failure is impossible by construction (atomic rollback) — the customer never sees "charged but not granted" or "granted but not charged."
- **Concurrency:** two concurrent purchases of the same offer by the same player serialize on the wallet row lock (debit path) and the inventory partial-unique row lock (grant path) — same locking the wallet/inventory primitives already proved.
- **Observability:** OTel span `shop.purchase` with HMAC-hashed `player_external_id_hash` + `project_id` + `offer_code` + `pay_with` + `purchase_id` (PII discipline per M-1.5); `shop.list_offers` / `shop.get_offer` spans for the reads.
- **Security boundary:** price is server-derived from `offer_prices` at transaction time; the client cannot set or influence the amount (closes the (C)-rejection from the design open). `payWith` selects among server-defined currencies only — an unknown/unaccepted currency is BC092, not a price the client controls.

## Production-grade gates

- **Idiomatic:** player-centric REST purchase sub-collection + server-authoritative pricing is the F2P-SDK-class shape (`[[shop/.research/pricing-locus-research]]` F1/F5). Relational offer/price/items tables with FKs are idiomatic Postgres+Drizzle, matching the shipped wallet/inventory schemas.
- **Industry-standard:** the separated priced-unit is 6/6 across PlayFab, Nakama Hiro, LootLocker, AccelByte, Stripe, Google Play Billing (research F1). Atomic debit+grant purchase with rollback is production-cited (PlayFab `ExecuteInventoryOperations`). Two-plus named systems on every load-bearing point.
- **First-class:** uses Postgres transactions + FKs + RLS + the existing idempotency middleware — no custom mutex, no client-trusted price, no fighting the platform. Reuses the existing `wallet_debit`/`item_grant` SQL functions and the bootstrapped `shop_purchase_*` reason codes rather than inventing parallel machinery.

## Rejected alternatives

### B2 — price-options-array-on-item + store-override layer
**What:** `PriceOptions[]` (JSONB/child) on `items` + a later `stores` entity overriding per-store (PlayFab/AccelByte shape).
**Wins when:** day-one bulk/scheduled discounting at catalog scale, regional pricing, or per-store price matrices are first-class launch requirements.
**Why not here:** equal expressive power to B1 for the stated needs; loses FK/index/RLS on price; B1→B2 is additive so the override layer can land later without breaking the wire unit. No stated launch-day sales requirement.

### B1a — one price per offer; multi-currency = multiple offers
**What:** offer carries a single `{currency, amount}`; "gems or coins" = two offers (`potion_gems`, `potion_coins`).
**Wins when:** absolute minimum schema is the only goal.
**Why not here:** pollutes the offer namespace — the customer needs N codes for "one purchasable thing," and "the offer" stops being a stable concept. The price-set (B1b) keeps one offer = one purchasable thing with multiple accepted currencies (matches PlayFab `Prices[]` OR-set + Stripe one-product-many-prices).

### L1 — single `purchase` transactions row / new `kind`
**What:** add `purchase` to `transactions.kind`, one row per purchase.
**Wins when:** purchases never need per-item or per-currency audit detail.
**Why not here:** the row schema is one-item-per-row; a single purchase row can't hold 1 debit + N grants without losing detail or widening the schema. L2 reuses existing kinds with zero migration.

### Combined-currency (AND) pricing — DEFERRED, not rejected
**What:** "pay 10 gems AND 5 coins for one item" (PlayFab `Amounts[]` within one Price).
**Why deferred:** rare in F2P soft-currency shops; additive later via a `price_group_id` on `offer_prices`. MVP supports OR (pick one currency) only.

## Failure mode

- **Grant overflow after debit:** buying a bundle where one stackable item would breach `max_count` — the debit must not stick. Handled: single transaction rolls back the debit; purchase fails BC081. Without the atomic boundary this is a "charged, not delivered" support incident.
- **Double-charge on network retry:** without idempotency, an SDK auto-retry charges twice. Handled: Idempotency-Key replay.
- **Price drift between offer-read and purchase:** customer reads `GET /v1/offers` showing 100 gems, operator changes it to 150, player purchases — the purchase charges the *current* 150 (server-authoritative). Acceptable at MVP; a PlayFab-style expected-amount echo guard is deferred (Revisit).
- **Item archived while in an offer:** `offer_items.item_id onDelete restrict` prevents deleting an Item that's still sold; operator must pull it from offers first.

## Mitigations

- Atomic SQL function with rollback-on-any-failure (the primary mitigation — makes partial fulfillment unrepresentable).
- Idempotency-Key replay (double-charge).
- `onDelete: restrict` FKs on `offer_items` (dangling-reference).
- OTel `purchase_id` correlation across the debit + grant spans/rows for support replay ("player says they paid and got nothing" → grep `metadata.purchase_id`).

## Revisit when

- **A customer needs day-one bulk/scheduled sales** ("20% off the whole store this weekend") → add the B2 `stores` override layer over `offers` (additive; wire unit unchanged).
- **Combined-currency (AND) pricing** is requested → add `price_group_id` to `offer_prices`.
- **Purchase history becomes a first-class dashboard view** → promote `metadata.purchase_id` to a `transactions.purchase_id` column + index.
- **Price-versioning / immutable price audit** beyond the transaction snapshot is required (regulatory) → add an `offer_price_history` table.
- **Per-player / per-window purchase limits** ("starter pack, limit 1") → add an eligibility layer (Nakama Personalizer / AccelByte Purchase-Requirements shape per research F4).
- **Expected-amount mismatch protection** wanted → add optional `expectedAmount`/`expectedCurrency` to the purchase body, validate server-side (PlayFab `PriceAmounts` pattern, research open thread #2).
- **Real-money IAP** → separate primitive (already scoped out; `offer_prices` is soft-currency only).

## Cascade obligations for /implementation

1. **Migration 0013** — `offers` + `offer_prices` + `offer_items` tables (RLS + indexes + CHECKs + FKs above).
2. **SQL function `purchase_offer_by_external_id`** (migration 0013 or 0014; SQL body hand-appended per the 0010/0011 convention) — atomic resolve→debit→grant→ledger, raising BC010/BC081/BC090/BC091/BC092.
3. **Drizzle schema** `packages/db/src/schema/shop.ts` (3 pgTables + RLS pgPolicy) + barrel export.
4. **Error envelope** — BC090/BC091/BC092 in `packages/wallet/src/errors.ts` (`BcError` details) + parsers in `sqlstate-to-error.ts` + tests.
5. **Wrappers** — new `@bokchoy/shop` workspace (or extend; /implementation pick per inventory precedent) with `purchaseOfferByExternalId` + `listOffers` + `getOffer` wrappers.
6. **Backend routes** — `apps/backend/src/shop/index.ts`: `POST /v1/players/{externalId}/purchases` + `GET /v1/offers` + `GET /v1/offers/{offerCode}`; `mountShopRoutes`; Zod schemas; handler-local BC→HTTP translation; OTel spans.
7. **SDK** — `bokchoy.shop.{purchase,listOffers,getOffer}` + 3 error classes + unit tests; `ShopApi` wired into `BokChoy`.
8. **Smoke tests** — `smoke-functions.ts`: happy-path purchase (debit + grant + ledger rows linked by purchase_id), insufficient-funds rollback, bundle purchase (1 debit + N grants), overflow-rollback, BC090/091/092, cross-tenant isolation, idempotency replay.
9. **`[[mvp/mvp-feature-sequence]]` amendment** — Simple Shop ✓ LANDED annotation (2 of 4 Month-2 primitives).
10. **`[[wallet-http-contract]]` amendment** — register the 3 new routes.
11. **Cockpit offer/catalog editor** — operator UI to define offers (separate cockpit slice; flagged, not contracted here).

**Two /implementation picks flagged (NOT design picks):** (a) `@bokchoy/shop` new workspace vs extend `@bokchoy/inventory`; (b) purchase SQL function calls the existing `wallet_debit`/`item_grant` functions vs inlines their bodies.

## Contract (for /implementation to quote verbatim)

- **Input (purchase):** `POST /v1/players/{externalId}/purchases`, Bearer API key, `Idempotency-Key` header, body `{ offer: string, payWith?: string }`. `payWith` required iff the offer's price-set has >1 currency.
- **Output (201):** `{ purchaseId: uuid, offer: string, paid: { currencyCode: string, amount: string }, granted: Array<{ itemCode: string, quantity: number, instanceIds?: string[] }> }`. `amount` is a NUMERIC string (amended 2026-05-21, was `number` — `offer_prices.amount` is `NUMERIC(20,4)`, >2⁵³-capable; matches wallet wire).
- **Errors:** BC090 → 404 `UNKNOWN_OFFER`; BC091 → 422 `OFFER_INACTIVE`; **BC093 → 422 `OFFER_MISCONFIGURED` `{ offerCode }`** (active offer with zero `offer_items`, raised pre-debit — empty-offer backstop); BC092 → 422 `INVALID_PAYMENT_CURRENCY` `{ acceptedCurrencies: string[] }`; BC010 → 422 `INSUFFICIENT_FUNDS`; BC081 → 422 `INVENTORY_OVERFLOW` `{ currentCount, requestedAmount, maxCount, availableCapacity }`; VALIDATION_ERROR for bad body/param. **Resolution order:** BC090 → BC091 → BC093 → BC092 → BC010 → BC081.
- **Side effects:** exactly one `currency_debit` + one `item_grant` per offer item in `transactions`, sharing `metadata.purchase_id` + `metadata.offer_code`, reason codes `shop_purchase_cost` / `shop_purchase_grant`; wallet balance decremented by the paid amount; inventory rows created/incremented per grant. All atomic — rollback on any failure. Idempotent on `Idempotency-Key` (24h). (An offer with zero `offer_items` cannot reach the debit — BC093 fires first; the "exactly one item_grant per offer item" guarantee assumes the editor activation-invariant `active ⇒ ≥1 offer_items` holds, with BC093 as the backstop.)
- **Reads:** `GET /v1/offers` → `{ data: Array<{ code, displayName, description, active, prices: [{ currencyCode, amount }], items: [{ itemCode, quantity }] }> }` (active offers only; `amount` is a NUMERIC string; `active: boolean` exposed per 2026-05-21 amendment — class-idiomatic, Stripe Price `active` / Nakama `unavailable`); `GET /v1/offers/{offerCode}` → single offer (any active state, so `active` is informative here) or 404 BC090.
