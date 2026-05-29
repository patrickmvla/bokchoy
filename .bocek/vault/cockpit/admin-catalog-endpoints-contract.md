---
type: contract
features: [cockpit, catalog, architecture]
related: ["[[architecture/catalog-mutation-mvp-shape]]", "[[cockpit/admin-list-endpoints-contract]]", "[[cockpit/cockpit-shape]]", "[[shop/shop-contract]]", "[[shop/contract-reconciliation-2026-05-21]]", "[[inventory/inventory-contract]]", "[[wallet/wallet-http-contract]]", "[[architecture/admin-auth-surface]]", "[[architecture/idempotency-strategy]]", "[[marketing/currencies-endpoint-research]]"]
created: 2026-05-29
confidence: high
---

# Admin catalog endpoint contracts — currencies + items + offers CRUD (Slice 8.5)

Closes cascade obligation #4 of `[[architecture/catalog-mutation-mvp-shape]]`. Defines the operator-facing CRUD surface the cockpit catalog editor consumes. The big architecture is already bound by the parent decision (plain CRUD, no draft state, no audit, no ETag, last-write-wins, BC093-at-publish, restrict-FK actionable); this contract pins the wire shapes and resolves the contract-level forks the parent deferred. Convention picks inherit from `[[cockpit/admin-list-endpoints-contract]]` (R2 / Pa-none / A1 / Disc-no / Pref-raw); the (E2) split-POST inheritance is **overridden** for offers (see fork F1).

## Amendment 2026-05-29 (design) — error-model reconciliation

Three wire details in the original (2026-05-29) entry conflicted with shipped admin reality (`apps/backend/src/projects/index.ts` + the shared `validationFailureHook`). Surfaced during implementation, recorded in `[[cockpit/gaps.md]]`, reconciled here with the human ruling on each:

- **C-1 — validation status → `400`** (was `422`). Reuse the shared `validationFailureHook`; consistent with the whole shipped admin surface + Stripe-style 400-for-invalid-params. Inline `422 VALIDATION_ERROR` mentions below updated to `400`.
- **C-2 — uniqueness → `409 CODE_TAKEN`, detail field `resourceCode`** (was `422`, field `code`). `409 Conflict` matches shipped `createProject`'s `PROJECT_SLUG_EXISTS`; the original `code` detail field collided with the envelope's own `code` discriminator (defect). NOTE: `[[cockpit/admin-list-endpoints-contract]]` still specs `422 slug_taken` while shipped `createProject` returns `409` — that entry carries the same drift and is **not** amended here (out of scope; flag for its own pass).
- **C-3 — idempotency on creates: RESOLVED → path-1 natural-key dedup, no client key.** Per `[[cockpit/.research/catalog-creates-idempotency-research]]` + `[[architecture/idempotency-strategy]]`'s hybrid contract: catalog creates have a natural identifier (unique `(project_id, code)`), so they fall under path 1 — the `409 CODE_TAKEN` on double-submit *is* the dedup. **No client `Idempotency-Key` required; no `idempotencyMiddleware` wired** (matches `createProject`, the exact precedent). The original "Idempotency-Key optional on creates" language was wrong and is removed. (`idempotencyMiddleware` no-ops on an absent header, so it *could* be added later as additive replay-polish if cockpit ever enables mutation retry — TanStack defaults it off — but it is NOT part of this contract.)

## Decision

### Path shape — project-nested sub-resources

All catalog admin endpoints nest under `/v1/projects/{projectId}/{resource}`, behind `adminGate`. Resources: `currencies`, `items`, `offers`.

This resolves a hard collision: `GET /v1/currencies` (SDK-facing, `apiKeyMiddleware`, currencies module) and `GET /v1/offers` + `GET /v1/offers/:offerCode` (SDK-facing, shop module) are already shipped at the top-level `/v1/` namespace. The admin CRUD cannot squat on those paths. Project-nesting (a) sidesteps both collisions, (b) makes the RLS tenant explicit so `adminGate({ resource, actions, projectIdParam: 'projectId' })` performs the org-tenancy check exactly like the shipped `POST /v1/projects/{projectId}/api-keys`, and (c) matches Stripe sub-resource nesting (`/v1/customers/{id}/sources`). Forced by the existing pattern + the collision; not a free choice. (production-cited: Stripe sub-resources; internal-consistency with `[[cockpit/admin-list-endpoints-contract]]` api-keys nesting; confidence: high.)

Operator works with `code` in the UI; **path addressing is by raw UUID** (`{currencyId}` / `{itemId}` / `{offerId}`) per Pref-raw, consistent with slice 8.1+.

### Resolved forks (the contract-level decisions the parent deferred)

- **(F1) Offers use nested-aggregate-write, NOT split-POST.** `POST` / `PATCH` on an offer carry `prices[]` + `items[]` inline; the handler replaces the owned child rows transactionally. `offer_prices` / `offer_items` are unique-per-offer, restrict-FK-owned, meaningless standalone — value objects of the offer aggregate, not independent resources. This **overrides** the `[[cockpit/admin-list-endpoints-contract]]` (E2) split-POST inheritance named in the parent decision's cascade #4: (E2) was reasoned for parent + *independent* child (API keys have their own lifecycle); that reasoning does not transfer to owned value objects. (production-cited: Shopify product-with-variants/options in one call — strongest analog; Stripe Checkout `line_items[]`; confidence: high.)
- **(F2) `code` is immutable post-create** on all three resources. `PATCH` cannot change `code`. It is the SDK-facing identifier (`wallets.credit({currency:'gems'})`, item-grant-by-code, `shop.purchase({offer:'curl_pack'})`); renaming silently breaks live client integrations. To "rename": create-new + deactivate-old. (principle + Stripe immutable-ID / careful-slug pattern; confidence: high.) Revisit: mutable-with-transfer-semantics if a paying customer demands in-place rename.
- **(F3) `items.stackable` is immutable post-create.** Flipping it corrupts the inventory ownership model — the conditional unique indexes (`inventory_stackable_unique` WHERE `instance_id IS NULL` vs `inventory_instance_unique` WHERE `instance_id IS NOT NULL`) assume `stackable` is fixed for the item's lifetime. `maxCount` stays editable (it is only a cap). (verified against `packages/db/src/schema/inventory.ts`; confidence: high.)
- **(F4) Delete = hard-block + actionable 409, deactivate as the primary removal path.** `DELETE` succeeds only at zero references. When blocked, return `409 RESOURCE_IN_USE` enumerating *removable* references (offers — operator can fix) distinctly from *blocking* references (player wallets/inventory — operator cannot fix via catalog). For items/offers, `active=false` (deactivate) is the recommended removal path. **Currencies have no `active` flag** (parent (ii) deferred it) → a currency referenced by any wallet is permanent at this tier; the error states this honestly. See *Failure mode* + *Revisit when*.

### Convention picks (inherited, recorded for completeness)

- **(R2)** bare-data success + Stripe-wrapped errors `{ error: { code, message, ...detailFields } }` per `apps/backend/src/infra/error-middleware.ts` + `[[wallet/wallet-http-contract]]` G5.
- **(Pa-none)** no pagination; bare arrays on list endpoints. 2-person-team audience per `[[cockpit/cockpit-shape]]`; catalog volume (≤tens of currencies/items/offers per project) is far below the threshold.
- **(A1)** nested arrays on the offer aggregate (`prices[]` + `items[]`), mirroring nested `apiKeys[]` on project detail.
- **(Disc-no)** no `object` type-discriminator field.
- **(Pref-raw)** raw UUIDs for resource IDs in paths and responses.
- **Idempotency on creates** = path-1 natural-key dedup per `[[architecture/idempotency-strategy]]` (catalog rows have unique `(project_id, code)`). No client `Idempotency-Key`, no middleware — double-submit returns `409 CODE_TAKEN`. [C-3, resolved]
- **adminGate** on every endpoint with per-noun resources `currency` / `item` / `offer` and actions `read|create|update|delete` (auth-config cascade below).

### Endpoint contracts

#### Currencies

Full operator shape (superset of the SDK 4-field shape from `[[marketing/currencies-endpoint-research]]`):
```ts
type CurrencyAdmin = {
  id: string;            // UUID
  code: string;          // ^[A-Za-z0-9_]{1,16}$  — immutable (F2)
  displayName: string;
  description: string | null;
  decimals: number;      // 0–8; display/SDK-side only, storage is always NUMERIC(20,4)
  isPremium: boolean;
  isTradable: boolean;
  createdAt: string;     // ISO 8601
  updatedAt: string;
};
```

- **`GET /v1/projects/{projectId}/currencies`** → `200` bare array of `CurrencyAdmin`. `adminGate({ resource:'currency', actions:['read'], projectIdParam:'projectId' })`.
- **`POST /v1/projects/{projectId}/currencies`** → `201` `CurrencyAdmin`. Body: `{ code, displayName, description?, decimals?, isPremium?, isTradable? }`. `decimals` defaults 0, booleans default false. Validation: `code` regex, `decimals` 0–8. No `Idempotency-Key` (path-1 dedup; double-submit → `409 CODE_TAKEN`). `adminGate(...,['create'])`.
- **`PATCH /v1/projects/{projectId}/currencies/{currencyId}`** → `200` `CurrencyAdmin`. Body (all optional, all replace): `{ displayName?, description?, decimals?, isPremium?, isTradable? }`. **`code` rejected** if present → `422 IMMUTABLE_FIELD`. `adminGate(...,['update'])`.
- **`DELETE /v1/projects/{projectId}/currencies/{currencyId}`** → `204` on success (zero refs). `adminGate(...,['delete'])`. Blocked → `409 RESOURCE_IN_USE` (see error shapes). Blocking refs: `wallets.currency_id`, `offer_prices.currency_id` (both restrict). Removable: offers (via `offer_prices`). Player-wallet refs are non-removable and permanent (no `active` flag).

#### Items

```ts
type ItemAdmin = {
  id: string;            // UUID
  code: string;          // ^[A-Za-z0-9_]{1,64}$  — immutable (F2)
  displayName: string;
  description: string | null;
  stackable: boolean;    // immutable post-create (F3)
  maxCount: number | null;  // >0 or null; null required when !stackable
  active: boolean;       // shipped via migration 0019_items_active
  createdAt: string;
  updatedAt: string;
};
```

- **`GET /v1/projects/{projectId}/items`** → `200` bare array of `ItemAdmin`. `adminGate({ resource:'item', actions:['read'], projectIdParam:'projectId' })`.
- **`POST /v1/projects/{projectId}/items`** → `201` `ItemAdmin`. Body: `{ code, displayName, description?, stackable?, maxCount?, active? }`. `stackable` defaults true, `active` defaults true. Validation: `code` regex; `maxCount > 0` or null; **`maxCount` must be null when `stackable=false`** (CHECK `items_max_count_consistency_check`) → `400 VALIDATION_ERROR` if violated. [C-1] `adminGate(...,['create'])`.
- **`PATCH /v1/projects/{projectId}/items/{itemId}`** → `200` `ItemAdmin`. Body (all optional): `{ displayName?, description?, maxCount?, active? }`. **`code` and `stackable` rejected** if present → `422 IMMUTABLE_FIELD`. `maxCount` consistency re-validated against the item's existing `stackable`. `adminGate(...,['update'])`.
- **`DELETE /v1/projects/{projectId}/items/{itemId}`** → `204` (zero refs). Blocked → `409 RESOURCE_IN_USE`. Blocking refs: `inventory.item_id` (player holdings — non-removable). Removable: offers (via `offer_items`). Recommended path: deactivate (`PATCH active:false`).

#### Offers (nested-aggregate)

```ts
type OfferAdmin = {
  id: string;            // UUID
  code: string;          // ^[A-Za-z0-9_]{1,64}$  — immutable (F2)
  displayName: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  prices: Array<{ id: string; currencyId: string; currencyCode: string; amount: string }>;  // amount = NUMERIC string
  items:  Array<{ id: string; itemId: string;     itemCode: string;     quantity: number }>;
};
```

- **`GET /v1/projects/{projectId}/offers`** → `200` bare array of `OfferAdmin` (each with nested `prices[]` + `items[]`; A1, small N at wedge scale). `adminGate({ resource:'offer', actions:['read'], projectIdParam:'projectId' })`.
- **`GET /v1/projects/{projectId}/offers/{offerId}`** → `200` single `OfferAdmin`. (Detail endpoint for symmetry; PATCH/POST also return the full nested offer.)
- **`POST /v1/projects/{projectId}/offers`** → `201` `OfferAdmin`. Body:
  ```ts
  {
    code: string;
    displayName: string;
    description?: string;
    active?: boolean;                                          // default true
    prices: Array<{ currencyCode: string; amount: string }>;  // amount NUMERIC string, >0
    items:  Array<{ itemCode: string;     quantity: number }>; // quantity >0
  }
  ```
  Handler resolves `currencyCode`→`currencyId` and `itemCode`→`itemId` within the project; unknown → `422 UNKNOWN_CURRENCY` / `422 UNKNOWN_ITEM` (enumerate available). **BC093 activation gate (vi):** if the resulting `active=true`, require `prices.length ≥ 1 AND items.length ≥ 1`, else `422 OFFER_MISCONFIGURED` (reuse shipped shop error). `active=false` may be created with empty `prices`/`items` (work-in-progress). All inserts (offer + prices + items) in one DB transaction. `adminGate(...,['create'])`.
- **`PATCH /v1/projects/{projectId}/offers/{offerId}`** → `200` `OfferAdmin`. Body (all optional): `{ displayName?, description?, active?, prices?, items? }`. **`code` rejected** → `422 IMMUTABLE_FIELD`. **Replace semantics:** when `prices` (or `items`) is present, it FULLY replaces that dimension's rows (delete existing for the offer, insert the supplied set) inside one transaction; when omitted, that dimension is unchanged. BC093 gate evaluated against the *post-replace* state if the resulting `active=true`. `adminGate(...,['update'])`.
- **`DELETE /v1/projects/{projectId}/offers/{offerId}`** → `204`. **Always succeeds:** offers own their children, so the handler deletes `offer_items` + `offer_prices` + the offer row in one transaction (restrict-FK order: children first). No external FK references the offer (`transactions.metadata.purchase_id` is JSONB, no FK). `adminGate(...,['delete'])`.

### Error shapes

All wrapped per (R2): `{ error: { code, message, ...detailFields } }`.

- **adminGate failures** → `BC401`/`401` (no session), `BC400`/`400` (no active org), `BC403`/`403` (cross-org tenancy), `BC404`/`404` (resource not under project).
- **Validation** (bad `code` regex, `decimals` out of range, `maxCount ≤ 0`, stackable/maxCount inconsistency) → `400 VALIDATION_ERROR` (shared `validationFailureHook`) with offending field. [C-1]
- **Immutable field** (`code` on any PATCH; `stackable` on item PATCH) → `422 IMMUTABLE_FIELD`, `field: 'code' | 'stackable'`.
- **Uniqueness** (`code` already exists in project — unique `(project_id, code)`) → `409 CODE_TAKEN`, `resourceCode: string`. [C-2] (`409 Conflict` matches shipped `createProject`; field is `resourceCode` to avoid colliding with the envelope `code`.)
- **Unknown referenced code** in offer body → `422 UNKNOWN_CURRENCY` / `422 UNKNOWN_ITEM`, with `available: string[]`.
- **BC093 empty active offer** → `422 OFFER_MISCONFIGURED`, `offerCode: string` (shipped shop error, reused).
- **Delete blocked by references** → `409 RESOURCE_IN_USE`:
  ```ts
  {
    error: {
      code: 'RESOURCE_IN_USE',
      message: string,                  // human-readable summary
      resource: 'currency' | 'item' | 'offer',
      resourceCode: string,
      removableReferences: Array<{ type: 'offer'; code: string }>,        // operator can remove these first
      blockingReferences:  Array<{ type: 'player_wallet' | 'player_inventory'; count: number }>,  // non-removable
    }
  }
  ```
  `409` (state conflict) is distinguished from `422` (input validation). The editor renders `removableReferences` as actionable ("remove from offers `curl_pack`, `bundle_pack` first") and `blockingReferences` as the deactivate-instead prompt (items/offers) or the honest dead-end ("held by N player wallets; currency retirement is not supported at this tier" for currencies).

## Reasoning

### Why nested-aggregate-write for offers (F1) — overriding the inherited (E2)

The parent decision's cascade #4 said "nested offer_prices/offer_items per (E2) split-POST pattern" — but that was a one-line cascade note, not a reasoned sub-decision. (E2) earned its place in `[[cockpit/admin-list-endpoints-contract]]` on a specific argument: parent + *independent* child, where the child (API key) has its own lifecycle (issue, name, revoke, multiple per project) and "future param explosion" lives cleanly in the child namespace. Offer prices/items fail every premise of that argument: unique-per-offer (`offer_prices_offer_currency_unique`, `offer_items_offer_item_unique`), restrict-FK-owned, never referenced or "used" independently, no lifecycle of their own. They are value objects of the offer aggregate. The DDD aggregate-root principle says owned value objects are written through the root (inferred-principle; confidence: high). Shopify's product-with-variants/options API — the closest production analog to "offer with items + prices" — does exactly this: one POST with nested arrays (production-cited; confidence: high). Stripe's Checkout `line_items[]` is a second cite. Split-POST also forces every offer to transit through BC093-misconfigured intermediate states (created-but-empty) and multiplies partial-failure surface; nested-write makes BC093 a single atomic check.

### Why `code` immutable (F2)

`code` is the contract between the operator's catalog and their live game clients via the SDK. Every SDK call addresses by code: `wallets.credit({currency:'gems'})`, item grants, `shop.purchase({offer:'curl_pack'})` (verified against CONTEXT.md + `[[shop/shop-contract]]`). An in-place rename has no migration story at MVP and would silently break every client still sending the old code. Making it immutable is cheap (create-new + deactivate-old covers the rename use case), safe, and additive-to-relax later. (principle; confidence: high.)

### Why project-nesting over a top-level prefix

Considered `/v1/catalog/*` and `/v1/admin/*` (Shopify-cited). Rejected both in favor of `/v1/projects/{projectId}/*` because: (a) it matches the *shipped* admin pattern (`/v1/projects/{projectId}/api-keys`) rather than introducing a new top-level namespace the existing admin endpoints don't share; (b) catalog rows are project-scoped under RLS, so the project must be in the request regardless — putting it in the path gives `adminGate` its `projectIdParam` tenancy check for free; (c) Stripe sub-resource nesting precedent. (internal-consistency + production-cited; confidence: high.)

## Engineering substance applied

- **Consistency:** every write wrapped in `withTenant(db, projectId, ...)` (RLS GUC `app.current_tenant`) per the shipped currencies/wallet/shop handler idiom. Offer create/PATCH and all child-row replacement run in a single DB transaction (default `READ COMMITTED`; sufficient — the unique indexes + restrict FKs are the real guards, not isolation level). Last-write-wins on concurrent edits per parent (iv).
- **Failure semantics:** idempotency on creates is path-1 natural-key dedup [C-3, resolved] — the unique `(project_id, code)` constraint makes a double-submit safe (second → `409 CODE_TAKEN`); no client key, no middleware. Restrict-FK violation (SQLSTATE 23503) on delete is caught and translated to `409 RESOURCE_IN_USE` with an enumeration query; the FK is the authoritative guard even if a concurrent insert races a pre-check (TOCTOU closes at the FK).
- **Concurrency:** offer child-row replacement is delete-all-then-insert within the txn; two operators editing the same offer → last commit wins (accepted, parent (iv)). Unique `(project_id, code)` race on create → `409 CODE_TAKEN` deterministically (catch-23505). [C-2]
- **Observability:** OTel span per handler — `catalog.currencies.{list,create,update,delete}`, `catalog.items.*`, `catalog.offers.*`. Attrs: `bokchoy.project_id`, `bokchoy.user_id` (operator actor), `bokchoy.resource_type`, `bokchoy.resource_code`. No `catalog_audit` table (parent (iii)); spans are the only edit trail at MVP.
- **Storage:** zero new tables. `items.active` already added (migration `0019_items_active`). No migration owed by this contract.
- **Security:** `adminGate` per-noun resource/action on every endpoint; cross-org access blocked at the gate's tenancy step via `projectIdParam`. No PII in catalog rows. SDK `apiKeyMiddleware` surface (`GET /v1/currencies`, `GET /v1/offers`) is untouched and remains the player-facing read path with its own minimal shapes.

## Production-grade gates

- **Idiomatic** — Hono native routing + Drizzle + `withTenant` + `adminGate`, matching the shipped currencies/projects/shop handlers exactly (catalog creates use path-1 natural-key dedup like `createProject`, no idempotency middleware). Nested-aggregate-write matches Shopify's catalog API. (production-cited internal + external; confidence: high.)
- **Industry-standard** — project-nested sub-resources (Stripe), nested-aggregate catalog writes (Shopify, Stripe Checkout), immutable external identifiers (Stripe). Each pick has ≥1 production cite + internal precedent. (confidence: high.)
- **First-class** — Postgres restrict FKs + RLS tenant isolation + standard transactional INSERT/UPDATE/DELETE via the app role's existing grants (migration 0015). No stored functions for catalog mutation (parent (v); M2 stays scoped to ledger functions). (first-class-cited; confidence: high.)

## Rejected alternatives

### Split-POST for offer prices/items (the literal (E2) inheritance)
**What:** `POST /offers` bare, then `POST /offers/{id}/prices`, `POST /offers/{id}/items`, `DELETE` per sub-row.
**Wins when:** prices/items have independent lifecycle or are referenced/reused outside their offer (Stripe Price model).
**Why not here:** BokChoy's `offer_prices`/`offer_items` are unique-per-offer owned value objects with no independent identity; split-POST multiplies round-trips, forces transit through BC093-misconfigured states, and the (E2) reasoning (independent child) doesn't hold. Overridden in F1.

### Top-level `/v1/catalog/*` or `/v1/admin/*` prefix
**What:** group catalog admin endpoints under a new top-level segment (Shopify Admin API uses `/admin/`).
**Wins when:** there's no existing project-nested admin pattern to match, or catalog operations aren't project-scoped.
**Why not here:** the shipped admin surface already nests project-scoped operations under `/v1/projects/{projectId}/`; a new top-level prefix would be inconsistent and would still need projectId in the request for RLS. Project-nesting gives the tenancy check for free.

### Mutable `code` with transfer semantics
**What:** allow `PATCH code`, maintaining an alias/redirect so old-code SDK calls keep working.
**Wins when:** a paying customer needs in-place rename AND the alias-table + dual-lookup complexity is justified.
**Why not here:** no customer asking; create-new + deactivate-old covers the use case at zero infra cost. Additive later.

## Failure mode

- **Currency permanence (the sharp edge).** A currency referenced by any `wallets` row cannot be deleted (restrict FK) and has no `active` flag to deactivate (parent (ii) deferred `currency.active`). Once a project's players hold balances in a currency, that currency is permanent. Probability: certain for any live currency. Cost: low at MVP (operators rarely retire currencies; the typo case is caught pre-launch before wallets exist). The `409 RESOURCE_IN_USE` message states this honestly rather than implying a fix that doesn't exist.
- **Full-replace PATCH clobber.** Two operators editing the same offer concurrently → last PATCH replaces the other's `prices`/`items`. Probability: low (1–2 operator audience). Cost: low. Accepted per parent (iv) last-write-wins.
- **Deactivated item still in active offer.** Operator sets `item.active=false` while an active offer still lists it; the purchase path does not filter on `item.active` (parent (v)+(vi), V-strict-FK rejected), so the offer keeps selling it. Probability: medium. Cost: low. The editor surfaces this as an editor-UX warning per parent (vii), not a backend constraint.

## Mitigations

- **Currency permanence** → revisit-trigger below (add `currency.active` when a customer needs retirement). The honest error message is the MVP mitigation.
- **PATCH clobber** → same as parent's last-write-wins acceptance; ETag `version` column is the additive escape hatch if multi-designer conflict manifests.
- **Deactivated-item-in-active-offer** → editor-UX warning per parent (vii) when toggling `item.active=false`: "this item is in active offers X, Y."

## Idiom citations

- `idioms/typescript.md` (Let the types flow end-to-end) — Drizzle `$inferSelect` on `currencies`/`items`/`offers` is the source-of-truth type; backend handlers + cockpit `useQuery` consume the same `@bokchoy/db` types. The `*Admin` response shapes are projections of those.
- `idioms/typescript.md` (Make impossible states unrepresentable) — immutable `code`/`stackable` enforced at the contract layer (PATCH rejects them) so downstream code never has to reconcile a changed identifier.
- `[[cockpit/admin-list-endpoints-contract]]` — R2/Pa-none/A1/Disc-no/Pref-raw inheritance + project-nested sub-resource precedent.
- `[[architecture/catalog-mutation-mvp-shape]]` (ii)–(vii) — the binding parent decision.

## Revisit when

- **Customer needs to retire a currency** → add `currencies.active BOOLEAN NOT NULL DEFAULT TRUE` (mirror `items.active`/`offers.active`), expose deactivate in the currency editor, add `currency` deactivate path to the `409` guidance. One migration + handler/editor work.
- **Customer needs in-place `code` rename** → relax F2: mutable `code` with an alias table + dual-lookup at the SDK resolution layer. Multi-week; not before a named ask.
- **Multi-designer concurrent-edit clobber reported** → add `version BIGINT` ETag column on `offers` (and `items`/`currencies` if needed) + `412 Precondition Failed` on mismatch. Per parent quaternary failure mode.
- **Catalog edit forensics required** → parent's V3-narrowed `catalog_audit` triggers; the OTel spans are not a queryable audit trail.
- **Offer list payload grows** (a project with hundreds of offers, each with many prices/items) → split list (bare) from detail (nested), add pagination per `[[cockpit/admin-list-endpoints-contract]]` Pa-cursor revisit.

## Cascade obligations (Slice 8.5 implementation)

1. **`packages/auth-config/src/index.ts`** — extend `statements` with `currency: ['read','create','update','delete']`, `item: ['read','create','update','delete']`, `offer: ['read','create','update','delete']`. Extend `adminRole` + `ownerRole` permission maps with the three new resources. Member role unchanged. (`scripts/check-auth-roles.ts` still passes — only additive.)
2. **`apps/backend/src/catalog/index.ts`** (currently a 3-line placeholder) — implement all 13 handlers (currencies: list/create/patch/delete; items: list/create/patch/delete; offers: list/get/create/patch/delete) + `mountCatalogRoutes(app)`. Match the shipped `withTenant` + OTel + Hono idiom from `currencies/index.ts` and `shop/index.ts`.
3. **`apps/backend/src/index.ts`** — `mountCatalogRoutes(app)` alongside the existing mounts.
4. **Error vocabulary** — add `RESOURCE_IN_USE`, `IMMUTABLE_FIELD`, `CODE_TAKEN` to the backend error model + SDK error classes if the cockpit consumes them via the SDK (cockpit may call the admin API directly with the session, not via `@bokchoy/sdk-node` — confirm at implementation). Reuse shipped `OFFER_MISCONFIGURED`, `UNKNOWN_CURRENCY`, `UNKNOWN_ITEM`.
5. **23503 → `409 RESOURCE_IN_USE` translation** — delete handlers catch the FK violation, run the enumeration query (which offers reference this row; count of player wallet/inventory rows), and build the `removableReferences`/`blockingReferences` payload.
6. **OTel spans** per handler (naming above).
7. **Cockpit consumer wiring** — this contract unblocks `[[architecture/catalog-mutation-mvp-shape]]` cascade #5 (the 3 cockpit modules under `apps/cockpit/modules/catalog/{currencies,items,offers}/`, shadcn `<Field>`+RHF `<Controller>`, BC093 client-side gate, restrict-FK delete-block UX rendering the `409` payload).
8. **Smoke/curl coverage** — the 13 endpoints + BC093-at-activate + `409` delete-block enumeration + immutable-field rejection + cross-org tenancy.
9. **No migration owed** — `items.active` (migration `0019_items_active`) is the only schema change and it is already generated (working tree, empirical apply still owed).
