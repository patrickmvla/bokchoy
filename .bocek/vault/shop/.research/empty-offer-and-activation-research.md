---
type: research
features: [shop]
related: ["[[shop/shop-contract]]", "[[shop/review-2026-05-21]]", "[[shop/.research/pricing-locus-research]]", "[[wallet/wallet-http-contract]]"]
created: 2026-05-21
confidence: high
provisional: false
---

# Does the game-economy SDK class permit a zero-content priced unit (and error at purchase vs prevent at construction), and does it expose offer activation state on catalog reads?

## Question

Two narrow questions handed back from `[[shop/review-2026-05-21]]` (Findings 2 + 3), against the same source class the `[[shop/.research/pricing-locus-research]]` survey covered — but probing a corner that survey never touched:

1. **Q1 (load-bearing — Finding 2 GAP):** BokChoy's B1b shape makes an offer with a price but **zero `offer_items`** representable; the contract promises "partial fulfillment is impossible" but neither schema nor code enforces ≥1 item, and an empty offer would debit + grant nothing ("charged, got nothing"). Does the class permit a zero-content priced unit (offer/listing/bundle)? If so, does it **error at purchase time** (→ supports a new `BC093 EmptyOffer`) or **prevent it at construction / structurally** (→ supports an operator-invariant, no new error code)?
2. **Q2 (folded — Finding 3 ORPHAN):** BokChoy's offer reads emit an `active` boolean not listed in the contract's (132) read shape. Does the class expose offer **activation/purchasable state on catalog reads** (a boolean, à la Stripe Price `active`), or only via active-filtered lists? → decides keep-and-document vs drop.

## Triangulation

- **Production reference:** ✓ — Stripe (Price object + Checkout Session create), PlayFab Economy v2 (Bundles + Limits), Nakama Hiro (Virtual Store), LootLocker (Listings, from prior vault). All tier-2 official docs.
- **Docs reference:** ✓ — version-pinned where the page carries SHAs (PlayFab git `d30c5b4`); Stripe + Nakama observed 2026-05-21.
- **Contradiction probe:** ✓ (both questions). Q1: actively searched for (a) any system with a purchase-time empty-offer error and (b) any system that lets you construct a chargeable unit with zero content — including the deliberate "buy nothing" edge (Stripe donations / pay-what-you-want). Found neither; the rigorous reference (Stripe) requires ≥1 `line_item` at construction. Q2: searched for a system that returns an offer in a read while concealing whether it is purchasable — none.

## Sources examined

### Source 1 — Stripe Price object (`active` field)
- **Tier:** 2 (current official docs)
- **Provenance:** `https://docs.stripe.com/api/prices/object`, observed 2026-05-21.
- **Author context:** Stripe — canonical payments API; real-money (cross-class from F2P soft-currency, used as the rigorous-validation + activation-flag reference).
- **What it tells us:** the Price object has **`active` (boolean)** — *"Whether the price can be used for new purchases"* — returned on reads. `active: false` = not usable for new purchases but the object still exists/reads. This is an activation flag at the priced-unit level, surfaced on reads.

### Source 2 — Stripe Checkout Session create (`line_items` requirement)
- **Tier:** 2 (current official docs)
- **Provenance:** `https://docs.stripe.com/api/checkout/sessions/create`, observed 2026-05-21.
- **What it tells us:** `line_items` is *"required"* for `payment` and `subscription` mode (max 100 / 20+20). You **cannot create a Checkout Session with an empty `line_items` array** in those modes — the empty-purchase state is rejected at **request/construction time**, not deferred to a purchase-time error. (Even pay-what-you-want / donations still require a `line_item` referencing a Price — the content unit exists; only the amount is variable.)

### Source 3 — PlayFab Economy v2: Bundles + Limits
- **Tier:** 2 (current official docs)
- **Provenance:** `https://learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/catalog/bundles` (git `d30c5b4`, `updated_at 2026-02-25`); Economy V2 Limits page `.../economy-v2/limits`. Observed 2026-05-21.
- **What it tells us:** a bundle is `Type:"bundle"` with `ItemReferences[]` + its own `PriceOptions`. The Limits page documents a **maximum of 250** `ItemReferences` per bundle — **no documented minimum**, and **no documented purchase-time error for an empty bundle.** Conceptual framing is "group **multiple** items," with non-empty examples only; create-flow says "first make sure you have published Catalog Items… you want to be purchaseable" before bundling. Silent on the zero-content case → undefined / operator responsibility.

### Source 4 — Nakama Hiro: Virtual Store (`disabled`, `unavailable`, `reward`)
- **Tier:** 2 (vendor docs; Hiro = Heroic Labs' commercial economy layer on OSS Nakama)
- **Provenance:** `https://heroiclabs.com/docs/hiro/concepts/economy/virtual-store/`, observed 2026-05-21.
- **What it tells us:** store-item shape = `{ name, description, category, cost, reward, additional_properties, disabled, unavailable }`. Two distinct activation fields, on the read path: **`disabled`** = *"non-purchaseable and not return in queries"* (hidden); **`unavailable`** = *"non-purchaseable but still return in queries"* (visible-but-locked). `reward` = *"the rewards a user should receive once they purchase"* — **no documented constraint that `reward` be non-empty**, no purchase-time empty-reward error. Silent on zero-content → operator responsibility.

### Source 5 — LootLocker: Listings (from `[[shop/.research/pricing-locus-research]]` Source 4)
- **Tier:** 2 (official docs, prior vault)
- **Provenance:** `https://docs.lootlocker.com/commerce/catalogs`, observed 2026-05-20 (prior session).
- **What it tells us:** a Listing is *"an individual entry of something to be purchased"* — it references an asset/progression/currency. **Structurally a listing is of a thing**; there is no "listing of nothing." Zero-content is not representable → prevented by construction, not by a runtime error.

## Findings

### F1 (Q1, load-bearing) — No system in the class has a purchase-time empty-offer error. The degenerate state is prevented at construction (structurally or by request validation), or left undefined as operator config — never caught at purchase.

Two sub-patterns, neither of which is a purchase-time error:

- **Structurally impossible** (the priced unit *is* the content): LootLocker Listing references an asset; Stripe Price references a Product, and a Checkout Session **requires** ≥1 `line_item` (Source 2) — empty-purchase is rejected at request/construction time. You cannot represent "buy nothing."
- **Representable but unguarded** (the priced unit references contents via a list): PlayFab bundle `ItemReferences[]` (max 250, **no documented min**, Source 3) and Nakama `reward` (no non-empty constraint, Source 4). Both **separate** the priced unit from contents — the same shape BokChoy chose — and both are **silent**: no create-time min-validation documented, and critically **no purchase-time empty error documented either**.

**The contradiction probe came back empty:** no surveyed system raises a runtime "empty offer" error, and the most-validated member (Stripe) closes the hole at **construction** (`line_items` required). There is **zero class precedent for a `BC093`-style purchase-time error**; there *is* precedent for construction-time prevention.

### F2 (Q2) — The class exposes offer activation/purchasable state on the read path, and Nakama draws exactly the distinction BokChoy's `active` boolean collapses.

- Stripe Price **`active` (boolean)** on reads — "whether the price can be used for new purchases" (Source 1).
- Nakama splits it in two on the read path: **`disabled`** (hide from queries) vs **`unavailable`** (return in queries, mark not-purchasable) (Source 4).
- PlayFab models availability via `StartDate`/`EndDate` windows + Draft/Published lifecycle (Source 3) — temporal/lifecycle rather than a single boolean, but still surfaced on the catalog read.

BokChoy's single `active` boolean returned by `getOffer` maps directly to the **`unavailable`/`active:false`** semantics — "the offer is returned in the read and the caller can see it is not purchasable." **Exposing `active` on offer reads is class-idiomatic; dropping it would diverge from the class.**

## Conflicts

**No genuine conflict on either question.** Q1: the two sub-patterns (structurally-impossible vs representable-but-unguarded) are not in tension — they agree on the operative point (no purchase-time error; prevention belongs at construction). Q2: Stripe and Nakama agree activation state is read-surfaced; they differ only on granularity (one boolean vs `disabled`/`unavailable` split), and that difference is itself a finding (BokChoy's single boolean is a defensible MVP subset of Nakama's two-field model).

The only nuance worth precedence: Stripe (real-money, the most rigorous validator) prevents empty-purchase at **request construction**; the F2P config-shaped systems (PlayFab/Nakama) leave it to **operator config discipline**. Per *Contradiction protocol* these aren't contradictory — they're the same "prevent before purchase" stance at different enforcement layers. BokChoy's enforcement-layer choice (DB trigger / offer-create API guard / activation gate) is design's to pick.

## Conditions

- **Audience-class:** indie/SMB F2P soft-currency shop, same scope as `[[shop/.research/pricing-locus-research]]`.
- F1 is partly an **absence-of-evidence** claim ("no system documents a purchase-time empty-offer error"). It is hardened by the positive counter-evidence (Stripe `line_items` required at construction) and by the structural argument, but a system *could* have undocumented empty-bundle runtime behavior. Re-research if a class member publishes an explicit empty-priced-unit error.
- Findings break if BokChoy adds real-money IAP (Stripe/Play construction-validation patterns become directly load-bearing) — out of scope here.

## Operational implications

For the `/design` seat resolving review Findings 2 + 3 (research surfaces; design picks):

1. **Finding 2 (zero-item offer) — the class evidence does NOT support `BC093`; it supports construction-time prevention (operator-invariant).** No surveyed system raises a purchase-time empty-offer error. The rigorous reference (Stripe) rejects empty-purchase at request construction (`line_items` required ≥1); the systems sharing BokChoy's separated-unit shape (PlayFab/Nakama) leave it to operator config with no runtime guard. **A new purchase-time `BC093` would be unprecedented in the class.** Design's mechanism choice for "prevent at construction" in BokChoy's Postgres substrate (a column CHECK cannot express "≥1 child row exists"):
   - **(a) Activation-gate invariant (recommended lean, ties to F2):** an offer cannot be set `active = true` without ≥1 `offer_items` row — enforced at the offer-create/activate API or cockpit editor. This reuses the `active` flag (Finding 3) as the natural enforcement point and mirrors Nakama's `disabled`-until-complete + Stripe's "publish a buyable thing only once it has content." `listOffers` is already active-only, so an incomplete (inactive) offer is never purchasable.
   - **(b) DB trigger** enforcing ≥1 `offer_items` on insert/activate — strongest guarantee, more machinery.
   - **(c) `BC093` purchase-time error** — only if design wants defense-in-depth *despite* zero class precedent; the SQL fn would `RAISE` before the debit when the offer resolves to zero items. Lowest-priority given the evidence.
   The decision is operator-invariant vs error-code; **the evidence points at operator-invariant, ideally gated on the `active` flag.**

2. **Finding 3 (`active` field) — keep it and add it to the `[[shop/shop-contract]]` (132) read shape.** Exposing activation state on offer reads is class-idiomatic (Stripe `active`, Nakama `unavailable`). Dropping it diverges from the class. Optional future refinement (not MVP): the single `active` boolean could split into Nakama's `disabled` (hide) vs `unavailable` (show-but-locked) if operators need "visible but temporarily unbuyable" — BokChoy's current `active` collapses both into list-filtering, which is a defensible MVP subset. Design picks whether to document just `active` or signal the future split.

3. **The two findings are coupled:** the cleanest resolution uses the activation flag (Finding 3) as the enforcement point for the empty-offer invariant (Finding 2) — `active = true ⇒ ≥1 offer_items`. One design move closes both.

## Reproducibility note

**Reproducible.** WebFetch `docs.stripe.com/api/prices/object` (Q2: `active`), `docs.stripe.com/api/checkout/sessions/create` (Q1: `line_items` required), the PlayFab bundles + limits pages (Q1: max 250, no min), the Hiro virtual-store page (Q2: `disabled`/`unavailable`; Q1: reward unconstrained). F1's operative claim — *no purchase-time empty-offer error in the class* — is an absence-of-evidence finding (load-bearing judgment), hardened by Stripe's explicit construction-time validation and the structural argument; another investigator searching the same docs reaches the same "none documented." No tier-1 source-code cite taken (all tier-2 docs); a deeper pass could read OSS Nakama server (`github.com/heroiclabs/nakama-common`) for reward-validation code, but the docs signal is consistent and sufficient for an error-handling-shape decision per the stated budget.

## Open threads

1. **Tier-1 confirmation of the empty-reward path** in OSS Nakama server source — would upgrade F1 from "docs silent" to "code confirms no runtime guard." Low priority.
2. **Nakama `disabled` vs `unavailable` split as a future BokChoy refinement** — if operators ask for "show the offer but mark it sold-out/locked," BokChoy's single `active` boolean needs the two-field model. Revisit-when, not MVP.
3. **PlayFab/Stripe construction-time validation exact error shape** (what PlayFab returns if you POST a bundle with empty `ItemReferences`) — not directly fetched; would confirm whether PlayFab validates at create. Marginal for the BokChoy decision (the lean is already operator-invariant).
