---
type: decision
features: [shop, wallet]
related: ["[[shop/shop-contract]]", "[[shop/review-2026-05-21]]", "[[shop/.research/empty-offer-and-activation-research]]", "[[wallet/wallet-http-contract]]", "[[inventory/inventory-contract]]"]
created: 2026-05-21
confidence: high
---

# Shop contract reconciliation — BC093 EmptyOffer backstop, amount→string, BC010→INSUFFICIENT_FUNDS recording

Resolves the three `[[shop/review-2026-05-21]]` findings, grounded by `[[shop/.research/empty-offer-and-activation-research]]`. Three decisions; two amend `[[shop/shop-contract]]`, one amends `[[wallet/wallet-http-contract]]`. A single follow-on /implementation slice (the "reconciliation slice") ships D1+D2; D3 is documentation; the editor invariant in D2 is specified for cascade #11 (cockpit offer editor), not built now.

## Decision

### D1 — Empty offer: BC093 purchase-time backstop + editor activation-invariant (defense-in-depth)

**Two layers, both required:**

1. **Primary (prevention, cascade #11 spec):** the cockpit offer editor MUST enforce `active = true ⇒ (≥1 offer_items row AND ≥1 offer_prices row)`. An offer may exist `active = false` with zero items/prices (work-in-progress); it cannot be *activated* without both. `listOffers` is already active-only, so an incomplete offer is never surfaced for purchase. This is a hard requirement of the editor slice, not optional. Not built now — no offer-creation API exists yet (offers are created only by direct DB insert today).

2. **Backstop (detection, build now):** `purchase_offer_by_external_id` raises **BC093** before the debit when the resolved offer has zero `offer_items`. Surfaces as **HTTP 422 `OFFER_MISCONFIGURED`**. This converts the "charged, granted nothing" silent path into a loud, no-charge failure regardless of how the offer was created (direct insert, editor bug, future bulk-import). Zero-*price* offers are already covered at purchase by BC092 (`pay_with_required` with "0 price options" / `currency_not_accepted`), so BC093 is the zero-*items* case only.

**BC093 buildable contract (for /implementation to quote):**
- **SQLSTATE `BC093`** (continues the shop block: 090 UnknownOffer, 091 OfferInactive, 092 InvalidPaymentCurrency, **093 EmptyOffer**).
- **Raise site + order:** in `purchase_offer_by_external_id`, after the BC091 active-check and **before** price resolution + debit. Resolution order is now: BC090 (unknown) → BC091 (inactive) → **BC093 (no items)** → BC092 (payWith/price) → BC010 (funds) → BC081 (overflow). Empty-offer is structural and takes precedence over the payWith question.
- **Count check:** `SELECT count(*) FROM offer_items WHERE project_id = p_project_id AND offer_id = v_offer_id`; if `0`, RAISE.
- **Message (EXACT — the sqlstate parser depends on it):** `'EmptyOffer: code=% project_id=%'` → `EmptyOffer: code=<offerCode> project_id=<projectId>`. Mirrors BC090/091 format.
- **`ErrorDetails` variant:** `{ code: 'BC093'; offerCode: string; projectId: string }` (mirrors BC090/091).
- **Parser regex:** `BC093_RE = /^EmptyOffer: code=(\S+) project_id=(\S+)$/` + a `case 'BC093'` in `sqlstate-to-error.ts`.
- **Backend handler-local translation** (BC093 is NOT in `BC_TO_HTTP` → would 500 if it propagated): 422 `{ error: { code: 'OFFER_MISCONFIGURED', message: "Offer '<code>' has no items and cannot be purchased", offerCode } }`.
- **SDK:** new `OfferMisconfiguredError extends BokchoyApiError` (status 422, code `OFFER_MISCONFIGURED`, `offerCode`); `http.ts` dispatch branch `status === 422 && code === 'OFFER_MISCONFIGURED'`; export from index.
- **Migration:** the BC093 RAISE is a body change to `purchase_offer_by_external_id`. State.md confirms 0013 is UNAPPLIED (no live DB this env). /implementation: **edit 0013 in place IF it is still unapplied everywhere** (verify), else add **0014** with `CREATE OR REPLACE FUNCTION`. Conservative default = 0014.
- **Tests:** smoke `testS9` (active offer, has price, zero items → BC093, balance unchanged, no grant); `sqlstate-to-error.test.ts` BC093 parse; SDK `OfferMisconfiguredError` dispatch test.

### D2 — Shop money wire type: `amount` is a NUMERIC string, not a JS number

`offer_prices.amount` is `NUMERIC(20,4)` (16 integer digits, max ~10¹⁶) — the schema permits values past 2⁵³, so a JS `number` is lossy at the wire boundary exactly as wallet balances are. The Slice-3 `paid.amount: number` justification ("prices are bounded operator-set values") was an unverified assumption the schema contradicts. **`amount` becomes a string everywhere on the shop wire**, matching wallet's `balance`/`balanceAfter` (e.g. `"100.0000"`). One money representation across the whole API; a customer never reasons about boundedness to know the JSON type.

- **Amend `[[shop/shop-contract]]` (viii):** `paid: { currencyCode: string, amount: string }`.
- **Amend `[[shop/shop-contract]]` (132):** offer-read prices `[{ currencyCode: string, amount: string }]`.
- **Code (reconciliation slice):** the wrapper layer ALREADY returns string (`PurchaseOfferByExternalIdResult.paidAmount: string`, `OfferView.prices[].amount: string`) — the fix is purely the HTTP/SDK boundary: drop `Number(result.paidAmount)` in `purchaseHandler` and `Number(p.amount)` in `toOfferWire` (emit the string directly); change SDK `ShopOfferPrice.amount` and `PurchaseResult.paid.amount` to `string`; update SDK shop tests. No migration.

### D3 — BC010 wire code: record INSUFFICIENT_FUNDS + the friendly-code policy

The Slice-4 change (human-authorized) made `BC010` surface as `INSUFFICIENT_FUNDS` (422) from both `/debit` and `/purchases` via `BC_FRIENDLY_CODE` in `error-middleware.ts`, with an `InsufficientFundsError` SDK class. This is correct and shipped; the vault was stale. **Amend `[[wallet/wallet-http-contract]]` G5:** change the example `"code": "BC010"` → `"code": "INSUFFICIENT_FUNDS"`, and record the **error-code-naming policy**:

> Customer-facing BcCodes surface under a friendly UPPER_SNAKE wire code via one of two mechanisms: **(i) the global `BC_FRIENDLY_CODE` map** in `error-middleware.ts` — for errors whose raw `details` fields are a sufficient body (BC010 → `INSUFFICIENT_FUNDS`); **(ii) handler-local translation** — for errors needing a body the middleware can't assemble (enumeration like `availableCodes`/`availableItems`/`acceptedCurrencies`, or discriminated-variant dispatch): `UNKNOWN_CURRENCY`, `UNKNOWN_ITEM`, `INVENTORY_OVERFLOW`, `INSUFFICIENT_INVENTORY`, `UNKNOWN_OFFER`, `OFFER_INACTIVE`, `INVALID_PAYMENT_CURRENCY`, `OFFER_MISCONFIGURED`. Raw `BCxxx` codes pass through for internal/rare errors that customers don't dispatch on (BC020, BC040, BC050…). A new customer-facing error picks mechanism (i) if detail-fields suffice, (ii) if it needs a richer body — never a third mechanism.

## Reasoning

**D1 — why build BC093 despite zero class precedent (the human's call, defended).** `[[shop/.research/empty-offer-and-activation-research]]` F1 established that no game-economy SDK has a purchase-time empty-offer error: the class either prevents at construction (Stripe Checkout requires ≥1 `line_item`; LootLocker listing structurally *is* an asset) or leaves it unguarded as operator config (PlayFab `ItemReferences` no-min; Nakama `reward` unconstrained — both BokChoy's separated-unit shape, both *silent*). "Unprecedented" here means the silent-shape class members simply don't bother — they carry the SAME unguarded hole. BokChoy's positioning is the named reason to deviate (per *Production-grade default* gate 2, bespoke is allowed with a named reason): `[[marketing/v1-shape]]`/`[[marketing/oss-core-marketing-research]]` make audit-log replayability and "player says they paid and got nothing" the PRIMARY trust pillar — silently charging nothing on operator misconfiguration is the exact support incident BokChoy markets against. The construction-time gate (editor) is the primary prevention but doesn't cover direct-insert / editor-bugs / a future bulk-import; the backstop closes the money path at the SQL layer where it can't be bypassed. Confidence: high on the spec; the cost (~7-touchpoint cascade) is accepted as proportionate to the support-incident class for a money product. (production-cited: the class survey; the deviation is a named-reason bespoke per the marketing positioning.)

**D2 — why string over number.** Two convergent reasons: (1) correctness — identical `NUMERIC(20,4)` type and identical >2⁵³ boundary risk as wallet balances, which already chose string for exactly this; (2) consistency — money has one wire representation across the API. The practical risk is low (no indie game prices anything near 9×10¹⁵), but that same low-practical-risk argument did not stop wallet from choosing string, and consistency carries it alone pre-launch. (docs-cited: `NUMERIC(20,4)` range; internal-consistency with `[[wallet/balance-history-contract]]`.) Confidence: high.

**D3 — settled, recording only.** No fork; the decision shipped in Slice 4 with human authorization. The design content is the naming *policy* that prevents a third friendly-code mechanism from accreting. Confidence: high.

## Engineering substance applied

- **Failure semantics (D1):** BC093 raises BEFORE the debit inside the single purchase transaction — the wallet is never touched, so there is nothing to roll back; the player is never charged. Defense-in-depth: prevention (editor invariant) + detection (BC093 at the money path). The two layers fail independently — an editor bug doesn't defeat BC093, and BC093 being unprecedented doesn't excuse skipping the editor invariant.
- **Security boundary (D1):** the only writers to `offers`/`offer_items` are the operator (future editor, which prevents the bad state) and developers (direct insert, who own it); there is no untrusted offer-creation path at MVP. BC093 covers the residual operator-error / future-bypass surface.
- **Precision (D2):** `NUMERIC(20,4)` → JS `number` is lossy past 2⁵³; string preserves the full ledger precision end-to-end (DB → wrapper → wire → SDK), matching the wallet primitive's existing discipline.

## Production-grade gates

- **Idiomatic:** BC093 reuses the exact BC09x RAISE + SQLSTATE + sqlstate-to-error + handler-local + SDK-class cascade the shop primitive already ships for BC090/091/092 — no new pattern. String money matches the shipped wallet wire shape.
- **Industry-standard:** the *prevention* layer (≥1 content to activate/publish) is class-standard (Stripe construction-validation, Nakama disabled-until-complete, LootLocker structural). The *backstop* layer is a named-reason deviation (BokChoy money-correctness positioning), explicitly recorded as such — not silently bespoke.
- **First-class:** BC093 uses the existing RAISE/SQLSTATE machinery and the existing global+handler error pipeline; no custom mutex, no new framework. String amounts use the existing `readNumericAsString` discipline.

## Rejected alternatives

### Editor-invariant only, no BC093 (research lean; rejected by human on positioning)
**What:** specify `active ⇒ ≥1 item AND ≥1 price` for the editor; no purchase-time error. Empty offers are developer-owns-it until the editor ships.
**Wins when:** the product is not positioned on money-correctness, OR the ~7-touchpoint BC093 cascade isn't justified by the support-incident class, OR an untrusted offer-creation path will never exist.
**Why not here:** BokChoy's primary trust pillar is audit-log/"where did the gems go" correctness; a silent charge-nothing path — even from misconfiguration — is the incident class the product sells against. The human chose defense-in-depth. The editor invariant is still adopted as the primary layer; this alternative is rejected only in its "no backstop" half.

### BC093 as a discriminated `OFFER_MISCONFIGURED` with a `reason` variant
**What:** `{ code:'BC093'; reason:'no_items' | ... }` to extend to future misconfigurations.
**Wins when:** multiple distinct offer-misconfiguration types exist and the client must dispatch on them.
**Why not here:** only one misconfiguration (zero items) exists today; zero-price is BC092's territory. YAGNI — add the variant when a second reason appears. MVP BC093 carries `offerCode` only.

### Keep `amount: number`, document the split (rejected)
**What:** shop=number, wallet=string, documented as "prices assumed bounded."
**Wins when:** shop amounts had a tighter type than balances (they don't — same `NUMERIC(20,4)`).
**Why not here:** permanent cross-namespace DX inconsistency + a latent precision edge the schema technically allows; the "bounded" premise is false at the schema level.

## Failure mode

- **D1:** an operator (post-editor) or developer creates an active offer with a price and zero items. Without BC093: player is debited, granted nothing, support incident. With BC093: HTTP 422 `OFFER_MISCONFIGURED`, no charge, the operator sees their offer is broken. Residual: the editor invariant must actually ship in cascade #11 — if the editor allows activating an empty offer, BC093 still catches it at purchase (that's the point of two layers), but the operator's catalog looks "live" while being unbuyable. Mitigation: editor invariant is a hard requirement of #11.
- **D2:** none introduced — string is strictly safer than number at the boundary.

## Mitigations

- BC093 raises pre-debit (no partial charge to reconcile).
- Editor invariant (≥1 item AND ≥1 price to activate) is marked a HARD requirement of cascade #11, not optional.
- `OFFER_MISCONFIGURED` message names the offer code so the operator can find and fix it from the error alone.

## Revisit when

- **A public `POST /v1/offers` API or bulk catalog-import lands** — re-confirm BC093 covers it and the editor invariant is mirrored at that surface (it already does, since BC093 is at the SQL layer).
- **A second offer-misconfiguration type appears** (e.g. references an archived item, malformed price) → promote BC093 to a discriminated `reason` variant.
- **Nakama-style `disabled` vs `unavailable` split is requested** (operators want "show the offer but mark it locked/sold-out") → BokChoy's single `active` boolean splits into two fields per `[[shop/.research/empty-offer-and-activation-research]]` F2; not MVP.

## Contract (for /implementation to quote)

**Reconciliation slice (build now):**
1. **BC093** full cascade per the D1 buildable contract above (SQL RAISE in `purchase_offer_by_external_id` pre-debit + 0013-in-place-or-0014 + `ErrorDetails` + `BC093_RE` parser + `case 'BC093'` + backend 422 `OFFER_MISCONFIGURED` handler + SDK `OfferMisconfiguredError` + dispatch + export + smoke testS9 + parser test + SDK test).
2. **amount→string** per D2 (drop `Number()` in `purchaseHandler.paid.amount` and `toOfferWire` prices; SDK `ShopOfferPrice.amount`/`PurchaseResult.paid.amount` → `string`; update SDK shop tests asserting string).
3. **`active` in the read shape** — already emitted by `toOfferWire`; this is the contract catching up (D-from-Finding-3): `[[shop/shop-contract]]` (132) read shape gains `active: boolean`. No code change.
4. **`[[wallet/wallet-http-contract]]` G5** — INSUFFICIENT_FUNDS example + friendly-code policy per D3. No code change.
- **Three gates** per the slice (typecheck/lint/test). Empirical gate (migration apply + smoke run + curl) still owed and now includes the BC093 path.

**Deferred to cascade #11 (cockpit offer editor):** the activation invariant `active ⇒ ≥1 offer_items AND ≥1 offer_prices`.
