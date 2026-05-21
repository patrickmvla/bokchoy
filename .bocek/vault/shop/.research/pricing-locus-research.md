---
type: research
features: [shop, inventory, wallet]
related: ["[[inventory/inventory-contract]]", "[[inventory/.research/inventory-primitive-research]]", "[[wallet/credit-route-contract]]", "[[wallet/.research/credit-route-shape-research]]", "[[mvp/mvp-feature-sequence]]", "[[architecture/idempotency-strategy]]"]
created: 2026-05-20
confidence: high
provisional: false
---

# Where does soft-currency price live in the game-economy SDK class, and what is the wire unit of a purchase — scalar-on-item, price-options-array-on-item, separate-offer-entity, or store-as-view?

## Question

The /design seat opened the Simple Shop primitive (next spine after Wallet + Inventory per `[[mvp/mvp-feature-sequence]]`) and killed position (A) "scalar `price_amount`/`price_currency_code` columns on the shipped `items` row" on a migration-asymmetry argument, holding the (B)-principle: *price lives on a stable purchasable unit that absorbs multi-currency/bundles/sales additively*. The concrete schema realization of (B) was recall-grade and unfalsified — separate `offers` table vs `PriceOptions[]`-array-on-item vs store-as-filtered-view. The inventory research (`[[inventory/.research/inventory-primitive-research]]`) surveyed the same four F2P systems for the *item model* but deliberately punted commerce (its Q9: "purchase composes a Shop primitive, separate"). This session probes the unprobed commerce/pricing/store half:

1. **Q1 (load-bearing):** where does soft-currency price live, and what identifier does a purchase call take — `itemCode` vs `offerId`/`listingId` vs `storeId`+item? Falsify scalar-on-item / `PriceOptions[]`-on-item / separate-offer-entity / store-as-view across PlayFab Economy v2, Nakama Hiro, LootLocker, AccelByte.
2. **Q2:** bundle modeling — special catalog-item-with-contents vs offer-referencing-N-items.
3. **Q3:** per-player / per-window purchase-limit prevalence + locus (closes inventory-research open thread on PlayFab `purchase_limit`).
4. **Q4 (lighter):** ledger shape — does the class emit one purchase event or a debit+grant pair?
5. **Contradiction probe:** Stripe Product/Price + a search for any system making the bare owned-item the scalar multi-currency price-bearer.

## Triangulation

- **Production reference:** ✓ — four named F2P game-economy systems (PlayFab Economy v2, Nakama Hiro, LootLocker, AccelByte) + two cross-class commerce systems (Stripe, Google Play Billing). All tier-2 official docs (no tier-1 source-code cite this session — see Reproducibility note).
- **Docs reference:** ✓ — PlayFab pages carry git commit SHAs + `ms.date`/`updated_at`; Stripe current; others observed 2026-05-20.
- **Contradiction probe:** ✓ — actively searched for a game-economy system putting a scalar multi-currency price directly on the bare owned-item. None found. Closest partial exception (LootLocker asset-level default `Price`) is still mediated by a separate Listing entity. Google Play Billing's current object model explicitly articulates the *opposite* of scalar-on-item.

## Sources examined

### Source 1 — PlayFab Economy v2: Stores
- **Tier:** 2 (current official docs)
- **Provenance:** `https://learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/catalog/stores`; `ms.date: 2025-02-20`, `updated_at: 2025-05-01`, author `wesjong` (Microsoft staff); git commit `46a0ea8dbdefe1e5eff495ba37856a4abc7af3af`. Observed 2026-05-20.
- **Author context:** Microsoft / PlayFab. Economy v2 is GA. Canonical PlayFab public reference.
- **What it tells us:**
  - "Stores are a special item type that hold a list of items and prices and **allow you to override base catalog prices** for items." A Store is `Type: "store"` — its own catalog item, created via `CreateDraftItem`.
  - Store shape: `ItemReferences[]`, each `{ "Id": "LaserSword", "Amount": 1, "PriceOptions": { "Prices": [ { "Amounts": [ { "ItemId": "Diamond", "Amount": 1 } ] } ] } }`. `ItemId` is **another catalog item — the currency**.
  - Catalog items carry a **base price independent of any store**: "Both items are existing catalog items with some existing base price as defined in the catalog. This store overrides their existing prices."
  - **`Prices[]` = alternative price options (OR); `Amounts[]` within one Price = combined cost (AND).** Example: `WeaponBundle` priced `[{Gold:10},{Silver:10}]` in one Price = "10 Gold AND 10 Silver."
  - Purchase wire: `PurchaseInventoryItems` with `{ Entity, Item:{Id}, Amount, PriceAmounts:[{ItemId,Amount}], StoreId }`. Purchase identifier = catalog item `Id` + optional `StoreId`; client passes expected `PriceAmounts`, server validates against the store/catalog price.

### Source 2 — PlayFab Economy v2: Bundles
- **Tier:** 2 (current official docs)
- **Provenance:** `https://learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/catalog/bundles`; `updated_at: 2026-02-25`, author `fprotti96` (Microsoft staff); git commit `d30c5b4962323d4ad9dbf4580a8fba56d8cca076`. Observed 2026-05-20.
- **What it tells us:**
  - Bundle = `Type: "bundle"` catalog item with `ItemReferences[]` (each `{Id, Amount}`) **plus its own `PriceOptions`**. "Bundles allow you to group multiple items together into a single item."
  - **Purchase auto-unpacks:** "the individual items referenced in the bundle are granted directly to the player's inventory. The bundle itself doesn't appear as an inventory item."
  - Bundles are also the link to real-money marketplace products via `AlternateIds` (out of scope — real-money is BokChoy's separate IAP primitive).

### Source 3 — Nakama Hiro: Virtual Store
- **Tier:** 2 (vendor docs; Hiro = Heroic Labs' commercial economy layer atop OSS Nakama)
- **Provenance:** `https://heroiclabs.com/docs/hiro/concepts/economy/virtual-store/`. Observed 2026-05-20.
- **What it tells us:**
  - Store items live in a **separate `store_items` collection** in the economy config JSON — distinct from the inventory item definition.
  - Store-item shape: `{ name, description, category, cost, reward, additional_properties, disabled, unavailable }`.
  - **`cost` = `{ currencies: <map of currencyId→quantity>, sku }`** — price lives on the store item, not the inventory item. `sku` is the optional IAP code.
  - `reward = { guaranteed: { currencies: {...}, items: {...} } }` — the offer's reward references what the player receives (this is where item-grant is wired).
  - **Purchase limits are NOT a store-item field:** "For items purchasable only once per player (like a 'Starter Pack'), use the Personalizer to hide items after purchase." Limits are a separate personalization layer.

### Source 4 — LootLocker: Catalogs / Listings + Currencies
- **Tier:** 2 (official docs)
- **Provenance:** `https://docs.lootlocker.com/commerce/catalogs` + `https://docs.lootlocker.com/commerce/currencies`. Observed 2026-05-20.
- **What it tells us:**
  - Catalogs contain **Listings**: "A Listing is an individual entry of something to be purchased for a specific amount of Currency." "Listings can include single items or bundles, support custom metadata, and store the item's price."
  - "Catalogs are used to add Currency values to something that can be purchased, for example an Asset, Progression, or even another Currency."
  - **Multi-currency for the same item is explicit:** "The same Asset or Progression Point (or Progression Reset) can be purchased for **different Currencies within the same Catalog**" — i.e. multiple Listings.
  - Assets carry a default `Price` field + optional `Discount Price` ("both prices are still returned to the game so it is still possible to display the original Price"). This default is the *partial* scalar-on-item exception — but purchase is mediated through Listings.

### Source 5 — AccelByte: Store & Catalog + Entitlements
- **Tier:** 2 (vendor docs)
- **Provenance:** `https://docs.accelbyte.io/gaming-services/modules/online/store-catalog/` + `.../monetization/entitlements/` + product blog "Reward Option Box and Purchase Requirements". Observed 2026-05-20.
- **What it tells us:**
  - Store & Catalog is a **separate service from Inventory**; "Inventory will work with Commerce to allow item purchasing" and uses the store catalog "as the main source for item metadata."
  - **Price lives on the catalog item via `regionData`** — region-scoped pricing with currency + discount + date windows ("a specific item assigned the price of $1.99 in USD when sold in the USA between certain dates"). This is the array-on-item shape, region-keyed.
  - Purchase → the **Entitlements** service grants ownership ("Entitlements are the data underlying items and are what the service grants to player accounts").
  - **Purchase Requirements** = eligibility conditions ("entitlements that a player needs to have prior to being permitted to obtain the new item") — caps/eligibility modeled separately from price.

### Source 6 — Stripe: Products & Prices (contradiction / cross-class probe)
- **Tier:** 2 (current official docs)
- **Provenance:** `https://docs.stripe.com/products-prices/how-products-and-prices-work`. Current as of 2026-05-20.
- **Author context:** Stripe — canonical payments API, real-money (cross-class from F2P soft-currency, used as the separate-price-entity reference).
- **What it tells us:**
  - **Price is a separate object referencing a Product.** "Products define what your business offers... Prices define how much and how often to charge."
  - One Product → many Prices ("A single Price can support multiple currencies"; multiple recurring intervals; "you need to create a new price for the new amount, then archive the existing price").
  - Price carries `unit_amount`, `currency`, `recurring`, `tax_behavior`, product reference.
  - **Immutability rationale:** "Instead of changing the `unit_amount` on the existing price, you need to create a new price to make sure that we keep the existing price as an immutable record of past transactions."

### Source 7 — Google Play Billing one-time-product object model (contradiction probe)
- **Tier:** 2 (Google Play developer docs, via search synthesis)
- **Provenance:** Google Play Billing one-time-product object model, surfaced via WebSearch 2026-05-20 (Google Codelabs regional-pricing + Play Billing docs).
- **What it tells us:**
  - Three-level hierarchy: **One-time product** (what is bought) → **Purchase option** (how the entitlement is granted, *its price*, and availability) → **Offer** (discounts/pre-orders affecting a purchase option's price). "A single product can have multiple purchase options representing different prices in different regions"; "a single purchase option can have multiple offers."
  - Explicit articulation of the anti-pattern: this model exists "rather than requiring a single price field on each item," "separating what is being sold from how it's being sold."

## Findings

### F1 — LOAD-BEARING: the priced/purchasable unit is separated from the bare owned-item across the entire class (6/6)

No surveyed system makes the bare owned/inventory item the multi-currency price-bearer. Two sub-shapes within the consensus:

- **Price-options array attached to the catalog item (± a store layer that overrides):** PlayFab (`PriceOptions.Prices[].Amounts[]` on the catalog item; Stores override per-store) and AccelByte (`regionData[]` region-scoped prices on the catalog item; Store as the sales surface).
- **Separate store-item / listing entity that references item(s) + cost:** Nakama Hiro (`store_items[].cost`, reward references items) and LootLocker (Catalog → Listing references asset(s) + price).

Cross-class confirmation: Stripe (Product ↔ separate Price), Google Play Billing (Product → Purchase option → Offer). **The (A)-kill from the design seat is correct and class-grounded; the (B)-principle holds at high confidence.**

### F2 — Bundle modeling: two shapes, both reduce to "the priced unit references N items"

- **Bundle-as-catalog-item-with-contents:** PlayFab `Type: "bundle"` with `ItemReferences[]` + own `PriceOptions`; auto-unpacks to grants on purchase. Steam (prior research) `"201;202x5;203"` syntax.
- **Offer/listing-references-N-items:** LootLocker Listing ("can include single items or bundles"); Nakama `store_item.reward.guaranteed` contains multiple items/currencies.

Both make the *priced unit* the bundle. For a BokChoy schema where the offer is the priced unit, "offer → N items" (a join) is the natural bundle model and needs no separate bundle-item concept.

### F3 — Multi-currency is always handled by multiple price-options / listings, never by mutating the item

PlayFab `Prices[]` = OR-set of alternative price options; AccelByte `regionData[]`; LootLocker multiple Listings ("same Asset for different Currencies within the same Catalog"); Stripe multiple Prices; Google Play multiple purchase options. The first-customer requirement (gems OR coins) is met additively in every system without touching the item-you-own.

### F4 — Per-player / per-window purchase limits are NOT a universal first-class offer field

- Nakama: explicitly NOT a store-item field — handled by the Personalizer ("hide after purchase").
- AccelByte: modeled as **Purchase Requirements** (entitlement eligibility), separate from price.
- PlayFab: no purchase-limit field surfaced on the store/bundle shape (the inventory-research open thread on `purchase_limit` resolves as: not a first-class catalog field).

Signal: purchase caps are a *separate eligibility/personalization concern*, not a column on the priced unit. **For BokChoy MVP: defer purchase-limit columns; it is not MVP-schema.**

### F5 — Ledger shape is opaque in docs; the class exposes purchase as one atomic operation

PlayFab `PurchaseInventoryItems` is a single API; `ExecuteInventoryOperations` is atomic ("if any operation fails, the entire batch is rolled back" — prior research Source 6). AccelByte purchase → Entitlement grant. Bundles auto-unpack into grants. None of the docs expose whether a purchase writes one ledger row or a debit+grant pair — that internal representation is not documented. **This question is not resolvable from these sources; it is a /design call, not a research verdict.**

### F6 — The two F1 sub-shapes differ on whether the item carries a base price

PlayFab + AccelByte put a *base* price on the catalog item (PriceOptions / regionData) and add a store layer that overrides for sales/promotions. LootLocker + Nakama put price *purely* on the listing/store-item; the inventory item definition is price-free. This is the fork the /design seat must resolve (see Operational implications).

## Conflicts

**The two F1 sub-shapes — array-on-item(+store-override) vs separate-offer-entity — are both production-grade; this is not artificially resolved.**

- **Array-on-item + store-override (PlayFab, AccelByte)** wins when: per-store price overrides, regional pricing, and time-boxed sales are first-class day-one requirements, and a document/JSON-shaped catalog is acceptable.
- **Separate-offer-entity (LootLocker, Nakama)** wins when: the platform is relational (Postgres), price needs to be indexable/FK-constrained to a currency, and "Simple Shop" wants the smallest correct unit before the store-override layer is needed.

Per *Contradiction protocol*, no precedence differentiator applies on tier alone (all tier-2 production docs). The differentiator is **BokChoy's substrate**: Postgres + Drizzle + RLS, where a separate relational `offers` table with an FK to `currencies` is more idiomatic than a JSONB price-options blob on `items`. But that is design's call to weigh, not research's to decide.

**No conflict on F1 itself** — scalar-price-on-owned-item was actively probed and found nowhere. LootLocker's asset-level default `Price` is the only partial exception and is still mediated by Listings.

## Conditions

- **Audience-class:** indie/SMB F2P, per `[[marketing/v1-shape]]` and `[[wedge-decision]]`. Same class the inventory research scoped to.
- **Soft-currency shop only.** Real-money / IAP (PlayFab bundle `AlternateIds`, AccelByte real-money `regionData`, Nakama `sku`, Stripe, Google Play) is BokChoy's *separate* IAP primitive per `[[mvp/mvp-feature-sequence]]` — out of scope. The price-bearing currency for Shop is a BokChoy `Currency` (`code`), not a real-money amount.
- **Server-authoritative price.** Every system validates price server-side; client passes an *expected* price at most (PlayFab `PriceAmounts`), never sets it. Confirms the design seat's (C)-rejection.
- Findings break / re-research if: BokChoy adds real-money IAP (regionData/marketplace-link patterns become load-bearing), or peer-to-peer/auction pricing (none of the surveyed systems model dynamic price discovery; the Unity Discussions thread on "full price discovery" was not investigated — out of class).

## Operational implications

For the next /design seat resolving the Shop pricing-locus schema:

1. **(A) is dead and class-grounded.** Do not add scalar price columns to `items`. The (B)-principle is confirmed by 6/6 systems.

2. **The schema fork is B1 vs B2 — research surfaces both, design picks:**
   - **B1 — separate `offers` table (LootLocker/Nakama shape):** e.g. `offers(id, project_id, code, ...)` + an offer→price relation `(offer_id, price_currency_code FK→currencies, price_amount)` allowing multiple rows per offer for multi-currency, + an offer→items relation for bundles. Multi-currency = multiple price rows; bundle = multiple item rows. Cleanest relational/RLS/FK fit for BokChoy's Postgres+Drizzle substrate; smallest correct "Simple Shop" unit. Wire unit = `offerCode`.
   - **B2 — `PriceOptions[]` on `items` + optional `stores` override (PlayFab/AccelByte shape):** price-options array (JSONB or child table) on the catalog item, with a later `stores` entity overriding per-store. More flexible (per-store sales, promotions) but the store-override layer is more than "Simple Shop" needs at MVP, and JSONB price is less indexable/FK-constrained. Wire unit = `itemCode` + optional `storeId`.
   - **Lean signal (NOT a decision):** B1 matches the relational substrate and the "Simple" scope; B2's store-override layer maps to BokChoy's *future* sales/promotions revisit-trigger. Stripe's immutability rationale (keep old prices as immutable records of past transactions) argues for price-as-rows (B1) over mutable price columns regardless — and aligns with BokChoy's append-only `transactions` audit discipline.

3. **Q2 (bundles):** if the offer is the priced unit (B1), model the bundle as `offer → N items` (a join), not a special bundle-item. First customer needs bundles, so this is MVP-schema, not deferred.

4. **Q3 (purchase limits):** **defer.** Not a first-class field in the class; modeled as a separate eligibility/personalization layer (Nakama Personalizer, AccelByte Purchase Requirements). Adding a `purchase_limit` later is non-breaking-additive. Closes the inventory-research open thread.

5. **Q4 (ledger):** unresolved by docs — design call. Either add a `purchase` value to `transactions.kind`, or emit a linked `currency_debit` + `item_grant` pair (the existing kinds) sharing an idempotency key / a `related_transaction_id`. The class exposes purchase as one atomic operation; BokChoy's existing `transactions.kind` already has `currency_debit` + `item_grant`, so the linked-pair path needs no migration. Pure /design pick.

6. **Atomicity (stays in /design, confirmed reusable):** the class treats purchase as atomic (PlayFab rollback-on-any-failure). BokChoy composes the existing `wallet_debit` + `item_grant` SQL functions in one DB transaction via `withTenant` — internal, no research needed.

7. **Wire unit + route:** if B1, `POST /v1/players/{externalId}/purchases` with `{offer}` body, or `.../offers/{offerCode}/purchase` — symmetric to the inventory route family per `[[inventory/inventory-contract]]`. Client passes no price (server-authoritative per Conditions); at most an expected-price echo if BokChoy wants PlayFab-style mismatch protection.

## Reproducibility note

**Reproducible.** WebFetch the PlayFab Stores + Bundles pages (URLs above; git SHAs pinned), the Hiro Virtual Store page, the LootLocker `commerce/catalogs` + `commerce/currencies` pages, the AccelByte store-catalog + entitlements pages, and the Stripe products-prices page. Score each on Q1; F1 + F3 fall out identically unless docs rotate (re-verify any cite >6 months old). 

Load-bearing judgment that could vary: the **B1-vs-B2 lean** in Operational implication #2 is conditioned on BokChoy's relational substrate + "Simple" scope — a different investigator weighting day-one sales/promotions higher could lean B2. The class signal genuinely supports both shapes (F6); design must pick with defense. No tier-1 source-code cite was taken this session (all tier-2 docs); a deeper pass could read OSS Nakama server source (`github.com/heroiclabs/nakama-common`) or `stripe-node` Price/Product types for code-level confirmation, but the docs signal is consistent and strong enough to vault.

## Open threads

1. **Sale / discount modeling depth.** LootLocker `Discount Price`, AccelByte `regionData` date windows, PlayFab store-override, Google Play Offers — all model time-boxed discounts as a layer above base price. Out of MVP scope (deferred per Q3-adjacent reasoning) but the schema should leave room. Worth a focused pass when the sales/promotions revisit-trigger fires.
2. **PlayFab `PriceAmounts` mismatch-protection semantics.** Client passes expected price; server validates. Whether BokChoy wants this echo-and-validate guard or trusts server-only is a small /design pick.
3. **AccelByte `regionData` deep field shape** not directly fetched (intro page thin; relied on search synthesis). Low priority — the array-on-item-with-region signal is clear.
4. **Ledger row-shape across the class** is documented nowhere (F5). If BokChoy later wants to mirror a class convention for purchase audit rows, OSS Nakama server source is the only readable reference.
5. **Dynamic price discovery / auction** (Unity Discussions thread surfaced, not investigated) — out of the F2P fixed-price class; only relevant if BokChoy ever targets player-driven markets.
