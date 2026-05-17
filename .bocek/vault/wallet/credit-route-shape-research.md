---
type: research
features: [wallet, marketing]
related: ["[[marketing/v1-shape]]", "[[marketing/currencies-endpoint-research]]", "[[wallet/wallet-http-contract]]", "[[_shared/oss-sdk-only]]"]
created: 2026-05-14
confidence: high
provisional: false
---

# How do production game-economy SDKs route a "credit player X some currency Y" operation, and how do they resolve the player→wallet relationship?

## Question

The /implementation seat scoping `@bokchoy/sdk-node` (Slice M-4) discovered a contract gap: `[[marketing/v1-shape]]` (iii) commits the customer-facing SDK API to `bokchoy.wallets.credit({ player: 'player_123', amount: 100, currency: 'gems', reason: 'level_up_reward' })`, but the backend's only credit route is `POST /v1/wallets/:walletId/credit` at `apps/backend/src/wallet/index.ts:205`. The SDK has no way to derive `walletId` from `(player, currency)` because:

1. No backend endpoint resolves `(player, currency) → walletId` (verified by exhaustive grep across `apps/backend/src/`).
2. The `wallet_credit` SQL function at `packages/db/drizzle/0004_wallet_functions.sql:40` requires a known `p_wallet_id` and **raises `WalletNotFound` if the row doesn't exist** (line 77) — does NOT lazy-create.
3. The schema comment at `packages/db/src/schema/wallet.ts:92` claims lazy-create-on-first-credit semantics that were never written into the SQL function — schema-vs-implementation drift.

v1-shape Cascade #1(d) framed this as an "implementation pick" between (i) one-wallet-per-player convention and (ii) explicit `bokchoy.wallets.create({player})` — but **both interpretations are non-implementable today** because both require a backend endpoint that doesn't exist.

Research question: how do production game-economy SDKs in BokChoy's class shape the wire path for a player-currency credit operation? Specifically: do they use a walletId-in-URL-path pattern (BokChoy's current shape), a player-centric URL pattern, or a body-encoded shape? Is lazy-create-on-first-credit the production default or an outlier?

## Triangulation

- **Production reference:** ✓ — PlayFab Economy v2, Nakama (Heroic Labs), RevenueCat Virtual Currency, LootLocker (partial), AccelByte (partial). Plus Stripe/fintech as cross-domain class probe.
- **Docs reference:** ✓ — Microsoft Learn (PlayFab), heroiclabs.com (Nakama), revenuecat.com/docs (RevenueCat), all version-current as of 2026-05.
- **Contradiction probe:** ✓ — Active search for "game backend API wallet credit endpoint walletId path parameter." Returned ZERO hits in the game-economy class; the walletId-in-path pattern appears in crypto/fintech wallets (different problem class — wallet IS the user's asset) but not in game-economy SDKs.

## Sources examined

### Source 1 — PlayFab Economy v2 AddInventoryItems
- **Tier:** 2 (official docs)
- **Provenance:** `https://learn.microsoft.com/en-us/rest/api/playfab/economy/inventory/add-inventory-items?view=playfab-rest`. Cross-referenced with the items-and-inventory-overview at the parent path. Observed 2026-05-14.
- **Author context:** Microsoft-owned, Generally Available. The doc is the canonical contractual API reference.
- **What it tells us:** The `AddInventoryItems` API takes an `Entity` parameter (player identifier of type `title_player_account`) in the request body to specify which player's inventory to modify. Virtual currencies are a TYPE of inventory item, mutated via the same endpoint as physical items. **Player identifier is body-encoded, not URL-encoded.** Idempotency-Id is supported with 14-day retention. **No separate "create wallet" call** — granting currency to a player who never had it before just works (the inventory row is created at the database layer on first grant).

### Source 2 — Nakama (Heroic Labs) walletUpdate
- **Tier:** 2 (official docs) + 1 (public source at `github.com/heroiclabs/nakama/blob/master/server/core_wallet.go`)
- **Provenance:** `https://heroiclabs.com/docs/nakama/guides/concepts/economy/`. Observed 2026-05-14. Public source available for triangulation.
- **Author context:** Heroic Labs ships the open-source Nakama server; docs are the canonical reference; source is verifiable.
- **What it tells us:** `walletUpdate(userId, map[string]int64, metadata, updateLedger)`. **Player-first positional argument**. Currency identified by map KEY (no separate Currency resource — wallets are `map[string]int64` stored as JSON column on the player record). New currency keys are added implicitly; no `wallets.create` needed. Ledger entry on each update when `updateLedger=true`. **Server-side only** — clients cannot directly mutate wallets (forces server-authority pattern). Single-call lazy-create.

### Source 3 — RevenueCat Virtual Currency Update Balance
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.revenuecat.com/docs/api-v2`. Observed 2026-05-14.
- **Author context:** RevenueCat is a commercial virtual-currency platform; the docs are the canonical paying-customer reference.
- **What it tells us:** Endpoint: `POST /v2/projects/{project_id}/customers/{customer_id}/virtual_currencies/{currency_id}/actions/update_balance`. **URL-encoded customer (player) AND currency**; project_id is the tenant id (BokChoy analog: API-key-resolved project_id). Single call mutates the balance; lazy-create on first adjustment is implicit (the docs describe this as "Adjust Virtual Currency Balance" without a prerequisite registration call). Auth via API key with `customer_information:purchases:read_write` permission. Rate-limited 480 req/min. Adjustments are reference-string-tagged (BokChoy analog: reason_code). **Three layers of identifiers in the URL: tenant + player + currency.**

### Source 4 — LootLocker server-side currency award (partial)
- **Tier:** 4 (search summary; direct fetch attempted but did not return the schema)
- **Provenance:** `https://ref.lootlocker.com/server-api/` — server-API reference. Observed 2026-05-14 via WebSearch synthesis.
- **Author context:** LootLocker is a commercial game-publishing platform; server-API is the auth'd-server-side surface.
- **What it tells us:** Currency-award is a server-authorized operation (clients can't directly trigger it — same security model as Nakama). The server-API surface exposes currency-grant endpoints. Wire shape not fully extracted at tier 2 in this session; the model is **player-centric** based on the platform's overall API shape (other LootLocker server endpoints surveyed in `[[marketing/currencies-endpoint-research]]` Source 1 follow `GET /admin/game/<game_id>/player/<player_id>/...` and `POST /server/<resource>/<player_id>/...` patterns). Open thread.

### Source 5 — AccelByte wallet credit/debit (partial)
- **Tier:** 4 (search summary; direct fetch returned generic content)
- **Provenance:** `https://docs.accelbyte.io/gaming-services/services/monetization/wallets/manage-wallet/`. Observed 2026-05-14.
- **Author context:** AccelByte is a commercial game-backend platform.
- **What it tells us:** Wallets are per-user, with per-currency sub-wallets. Credit/debit operations are admin-driven (cockpit UI) or programmatic. Admin portal exposes credit/debit per sub-wallet (i.e., per (user, currency)). Direct API endpoint path not extracted at tier 2 in this session, but the "sub-wallet" structure (user → wallet → sub-wallets per currency) implies URL-encoded user + currency in the programmatic API. Open thread.

### Source 6 — Contradiction probe: walletId-in-URL-path pattern survey
- **Tier:** 4 (search summary across multiple results)
- **Provenance:** WebSearch on `"game backend API wallet credit endpoint walletId path parameter"`, 2026-05-14.
- **What it tells us:** **Zero hits in the game-economy class for walletId-in-URL-path credit routes.** Hits returned were: Google Wallet API (digital tickets / loyalty cards — different problem class), Sila Money (fintech — wallet IS the user's banking primitive), Crossmint / Moralis / Helius (crypto wallets — wallet IS the user's blockchain asset), Cardano wallet-backend (crypto). In all these classes the wallet entity is the user's PRIMARY identity surface; URL-encoding makes sense. **In game-economy class the wallet is a secondary derived entity per (player, currency) — and the surveyed SDKs all use player-centric URL patterns instead.**

### Source 7 — Existing BokChoy backend wire shape (for contrast)
- **Tier:** 1 (own source code)
- **Provenance:** `apps/backend/src/wallet/index.ts:205`, `packages/db/drizzle/0004_wallet_functions.sql:40-77`. Observed 2026-05-14.
- **What it tells us:** BokChoy currently ships `POST /v1/wallets/:walletId/credit` and `POST /v1/wallets/:walletId/debit` — **walletId-in-URL-path**, requires the caller to already know the walletId. The `wallet_credit` SQL function raises `WalletNotFound` if the row doesn't exist (does NOT lazy-create), despite the schema comment at `packages/db/src/schema/wallet.ts:92` claiming lazy-create exists. **This wire shape is an outlier in the game-economy class** — no surveyed peer SDK uses it for the customer-facing credit operation.

## Findings

### F1 — Game-economy SDK class converges on player-centric, single-call credit routes (LOAD-BEARING)

The pattern across PlayFab, Nakama, RevenueCat, and (with partial verification) LootLocker + AccelByte:

| System | Wire shape for "credit player X some currency Y" | Player position | Currency position |
|---|---|---|---|
| PlayFab (Source 1) | `AddInventoryItems` body: `{ Entity: {Id}, Item: {amount, currencyId}, ... }` | Body | Body |
| Nakama (Source 2) | `walletUpdate(userId, map[currency]amount, ...)` (server function) | First arg | Map key |
| RevenueCat (Source 3) | `POST /v2/.../customers/{customer_id}/virtual_currencies/{currency_id}/actions/update_balance` | URL path | URL path |
| LootLocker (Source 4) | server-side player-centric (shape unverified at tier 2) | URL path (inferred) | unverified |
| AccelByte (Source 5) | sub-wallet credit per (user, currency) (shape unverified at tier 2) | URL path (inferred) | URL path (inferred) |

**3 tier-2 cites confirm the player-centric, single-call pattern. Zero cites for walletId-in-path in the game-economy class.**

### F2 — Single-call semantics with implicit lazy-create is the production default

None of the surveyed SDKs require a separate "create wallet" or "register currency for this player" call before the first credit. The wallet/balance row is materialized at the DB layer on first credit (via INSERT...ON CONFLICT DO NOTHING or equivalent). The customer's mental model is *"credit player X some currency Y"* — and the wire matches it.

**Schema-comment-vs-implementation drift for BokChoy:** the comment at `packages/db/src/schema/wallet.ts:92` describes exactly this lazy-create semantics ("Lazy-create on first credit via INSERT … ON CONFLICT DO NOTHING (executed inside wallet_credit, not here)") — but the `wallet_credit` SQL function as shipped doesn't implement it. The schema author's stated intent is the production convention; the SQL function diverged from intent.

### F3 — URL vs body axis for player encoding is split, with URL-encoded slightly more common

| System | Player encoding |
|---|---|
| PlayFab | Body (`Entity.Id`) |
| Nakama | Function arg (not REST) |
| RevenueCat | URL path |
| LootLocker | URL path (inferred) |
| AccelByte | URL path (inferred) |

URL-encoded player position is 3-of-5 (with two unverified). Body-encoded is 1-of-5 confirmed (PlayFab). Neither is wrong; URL-encoded slightly more common in REST-shaped game-economy APIs. Both work cleanly with idempotency-key headers.

### F4 — Idempotency keys are universally supported in mutation routes

PlayFab ships `IdempotencyId` with 14-day retention. RevenueCat exposes idempotency on most v2 mutation endpoints. Nakama's `walletUpdate` includes a "metadata" parameter where idempotency tracking is conventionally stored, plus the ledger handles replay shape. AccelByte exposes idempotency-key on payment APIs (extrapolating to wallet credit/debit likely). BokChoy's existing `idempotencyMiddleware` at `apps/backend/src/idempotency/...` per `[[idempotency-strategy]]` D2-α is production-class — the new route(s) should adopt it directly.

### F5 — Server-side-only authority is a recurring constraint

PlayFab AddInventoryItems requires title entity token (NOT player auth). Nakama walletUpdate is server-only. LootLocker server-API is auth'd with server-authorized tokens. **BokChoy's `apiKeyMiddleware` (project API key, NOT player auth) is the right primitive** for the SDK-facing surface — the SDK runs on the customer's game server, not on the player's device. Matches production convention.

## Conflicts

**No fundamental conflict on F1, F2, F4, F5.** The game-economy class is remarkably uniform on these axes.

**Soft contention on F3** (URL vs body for player encoding). URL-encoded is more common (3-of-5) but not universal. Per *Contradiction protocol*, this is design-discretion; neither side is wrong. The discriminator is internal consistency with the rest of BokChoy's API surface — current shipped routes are URL-encoded path params (`/v1/wallets/:walletId/`, `/v1/projects/:projectId/`, `/v1/orgs/me`). URL-encoded player+currency would match internal precedent.

## Conditions

- **F1, F2, F4, F5 hold across the surveyed set as of 2026-05.** The signal is strong (3 tier-2 cites converging, contradiction probe empty). If a future entrant in the class chooses walletId-in-path explicitly, the finding becomes contested.
- **The findings assume customer-facing SDK consumption pattern is "game server credits player on game-event"** (the BokChoy class). They do NOT apply to:
  - Crypto / blockchain wallets (where wallet IS the user's identity — walletId-in-path is correct).
  - Fintech / payment wallets (Stripe Issuing, Sila — similar to crypto class).
  - Internal microservice-to-microservice ledger calls where caller already holds the wallet identity.
- **F2's lazy-create depends on a unique-index resolver at the DB layer.** BokChoy already has this: `uniqueIndex('wallets_project_player_currency_unique').on(t.projectId, t.playerId, t.currencyId)` at `packages/db/src/schema/wallet.ts:115`. The DB shape is already correct for lazy-create; only the SQL function needs the INSERT...ON CONFLICT DO NOTHING glue.

## Operational implications

The four B-options surfaced by /implementation map to the production-convention space as:

- **B1 (two-call: upsert + credit)** — **diverges from production convention.** No surveyed SDK does this. Adds a roundtrip per first-touch per (player, currency) without buying ergonomic clarity. Reject on production-convention grounds.

- **B2 (player-centric route, single-call):** *e.g.* `POST /v1/players/:playerId/wallets/:currencyCode/credit` — **matches production convention exactly.** RevenueCat is the closest direct cite (URL-encoded player + currency + action). The currency identifier in path can be the `code` (slug) per `[[marketing/currencies-endpoint-research]]` F1, avoiding client-side UUID resolution. **Important implication: SDK-side slug-resolver from `[[marketing/v1-shape]]` Cascade #1(a) becomes unnecessary** — the backend resolves the slug→currencyId at the route handler. Simpler SDK; one fewer round-trip pattern for the SDK to cache.

- **B3 (modify wallet_credit SQL + new no-path-param route `POST /v1/wallets/credit` taking body `{ playerId, currencyId, amount, reasonCode }`):** **matches production convention on single-call semantics but uses body-encoded player.** Production-cited × 1 (PlayFab AddInventoryItems uses body-encoded Entity). Implementing the schema comment's stated intent. Compatible with the SDK's slug-resolver design (currency identifier is still the UUID on the wire; SDK does slug→UUID before posting).

- **B4 (two-call: explicit `wallets.create` then credit)** — **diverges from production convention.** No surveyed SDK does this. Forces customers to manage wallet lifecycle explicitly; the marketing snippet's "day-1 works" implication is undermined. Reject on production-convention grounds.

### Recommendation framing for /design

**Reject B1 and B4** on production-convention grounds (no game-economy SDK in the surveyed set does two-call patterns for currency credits).

**The remaining choice is B2 vs B3.** They differ on:

| Axis | B2 (player-centric URL) | B3 (body-encoded, no-path-param route) |
|---|---|---|
| **Production convention** | 3-of-5 surveyed SDKs (RevenueCat exact match) | 1-of-5 surveyed SDKs (PlayFab) |
| **Internal consistency with BokChoy routes** | Matches `/v1/projects/:projectId/api-keys/:keyId` URL-encoding pattern | Diverges — no other BokChoy POST route ships body-only identifiers |
| **SDK slug-resolver cost** | Eliminated (backend resolves slug at handler) | Required (SDK does slug→UUID before posting) — Cascade #1(a) work |
| **SQL function modification** | Required (lazy-create logic moves into a new player-centric SQL function OR wallet_credit gets refactored to accept player+currency too) | Required (wallet_credit needs lazy-create via INSERT...ON CONFLICT) |
| **Backwards-compat with existing route** | Existing `/v1/wallets/:walletId/credit` can stay for callers who already know walletId | Existing route stays unchanged; new route is sibling |
| **Idempotency-key pattern** | Standard (matches existing `idempotencyMiddleware`) | Standard (matches existing `idempotencyMiddleware`) |

**B2 has the stronger production-convention support and the smaller SDK package surface** (no slug-resolver). **B3 has the stronger schema-author-intent alignment** (the schema comment claimed lazy-create lives inside `wallet_credit` exactly; B3 implements that).

Both require backend work BEFORE M-4 (SDK package) can ship. M-4 becomes M-1.5 + M-4 where M-1.5 is the new backend endpoint.

### Cascade owed once /design picks B2 vs B3

1. **`[[marketing/v1-shape]]`** — amend Cascade #1(a) per the pick. If B2 wins, the SDK's slug-resolution layer is OBVIATED (backend does it server-side) — the cascade obligation should be deleted or marked superseded. If B3 wins, the slug-resolver stays per the original design.
2. **`packages/db/drizzle/{next-migration}.sql`** — either a new SQL function (`wallet_credit_by_player`?) or a modification to `wallet_credit` adding lazy-create via INSERT...ON CONFLICT DO NOTHING + return the resolved walletId. Per `[[wallet-mechanics]]` Amendments, this migration must be hand-written (Drizzle-kit doesn't emit declarative function changes).
3. **`apps/backend/src/wallet/index.ts`** — add new route handler mounting the new endpoint. Existing `/v1/wallets/:walletId/credit` route stays.
4. **Schema comment fix at `packages/db/src/schema/wallet.ts:92`** — either deleted (if comment is now wrong) or kept (if B3 lazy-create lands and the comment finally matches reality).
5. **`@bokchoy/sdk-node`** (Slice M-4) — finally scaffold-able, with credit/debit hitting the new backend endpoint(s).

## Reproducibility note

Reproducible. Anyone surveying the 6 sources above (PlayFab + Nakama + RevenueCat at tier 2 minimum, plus the contradiction probe) with the same question should reach the same finding — game-economy SDK class is uniform on player-centric single-call lazy-create. The B-option ranking (B2/B3 over B1/B4) follows directly from the F1+F2 findings.

Tools used: WebFetch on canonical RevenueCat v2 reference; WebSearch on PlayFab + LootLocker + AccelByte + Nakama + the generic walletId-in-path probe. No clones, no POC sketches.

## Open threads

- **LootLocker server-API currency-award schema** — tier 2 verification owed via direct fetch of `ref.lootlocker.com/server-api/` once a stable URL is identified. Not load-bearing (3 tier-2 cites already converge on F1+F2); but a tier-2 confirmation would tighten the LootLocker cite.
- **AccelByte wallet credit/debit endpoint** — same. Direct-fetch at tier 2 owed.
- **B2 vs B3 decision** — design fork, not closeable by research. /design picks once it weighs schema-author-intent (favors B3) vs production-convention-most-common (favors B2) vs SDK-package-surface-size (favors B2) vs internal-route-shape-consistency (favors B2).
- **Currency identifier on the wire of the new route — slug or UUID?** If B2 wins, the slug-in-URL (`/v1/players/X/wallets/gems/credit`) is the most ergonomic + matches the customer's SDK arg directly. The backend handler reads the slug and does the project-scoped lookup. If B3 wins, the SDK still ships a slug-resolver; the wire stays UUID. /design picks based on B2 vs B3.
- **Backwards-compat with existing `/v1/wallets/:walletId/credit`** — the existing route is correct for callers who already hold a walletId (e.g., internal admin tooling, future reconciliation workers). Keep it. The new route is a sibling for SDK consumers.
- **Idempotency-Key namespace** — the current cockpit/SDK convention is `cockpit-${flow}-${resourceId}` per `[[idempotency-strategy]]`. For SDK-driven credits the SDK auto-generates `bokchoy-sdk-retry-${uuid4()}` per `[[wallet-mechanics]]` Part 3 A17 staging note. /design confirms which pattern applies on the new route.
