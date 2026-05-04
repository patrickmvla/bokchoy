---
type: research
features: [architecture, mvp]
related: ["[[idempotency-strategy]]", "[[mvp-feature-sequence]]"]
created: 2026-05-01
confidence: high
provisional: false
---

# What does production-grade idempotency actually look like, and where does `[[idempotency-strategy]]` diverge from its sources?

## Question

The vault entry `[[idempotency-strategy]]` resolves CL-028 with a hybrid pattern (server-derived natural keys + client-supplied `Idempotency-Key` header), Redis 24h TTL hot-path + Postgres UNIQUE constraint, and an in-flight sentinel with 5s wait. The entry self-attests `confidence: high` and "all three production-grade gates clear" with citations to Stripe, PayPal, Square, RevenueCat, Adyen, and Cloudflare. This research session asks: do those citations hold up to verification, and what does production-grade idempotency actually look like across publicly documented systems? Specifically: (a) is there a single industry "convention" the entry can lean on; (b) is the entry's architecture the canonical pattern its sources suggest; (c) what HTTP status / wire-shape / TTL / scope claims survive; (d) what does the entry omit that production sources treat as load-bearing?

## Triangulation

- **Production reference:** ✓ — Brandur Leach's `brandur.org/idempotency-keys` (2017, Stripe-affiliated, with full Ruby/Postgres reference implementation); PayPal REST API reference for `PayPal-Request-Id`; Square API docs for `idempotency_key`. Three independent named systems with publicly described idempotency mechanisms.
- **Docs reference:** ✓ — Stripe canonical `docs.stripe.com/api/idempotent_requests` (observed 2026-05-01, no version on page); Stripe error-codes page (observed 2026-05-01); IETF draft-ietf-httpapi-idempotency-key-header version 07 (last revised 2025-10-15, **expired**); PayPal and Square docs as above.
- **Contradiction probe:** ✓ — Active comparison across Stripe / PayPal / Square / IETF surfaces multiple disagreements on wire shape, status codes, TTL, and storage architecture. No single industry "convention" exists — vendors diverge on every load-bearing detail.

## Sources examined

### S1 — Stripe canonical idempotency doc page

- **Tier:** 2 (official docs)
- **Provenance:** `docs.stripe.com/api/idempotent_requests`, observed 2026-05-01. Page is undated; no version stamp visible.
- **Author context:** Stripe official documentation; canonical reference for stripe-js / stripe-node / stripe-go.
- **What it tells us:**
  - **TTL:** "You can remove keys from the system automatically after they're at least 24 hours old." — wording is *at-least-24h* (a retention floor), not *exactly-24h*.
  - **Length:** "Idempotency keys are up to 255 characters long."
  - **Charset:** Not specified.
  - **HTTP method scope:** "All `POST` requests accept idempotency keys. Don't send idempotency keys in `GET` and `DELETE` requests." PUT/PATCH unspecified.
  - **Same-key + different body:** "The idempotency layer compares incoming parameters to those of the original request and errors if they're not the same." Specific HTTP status / error code: **not specified on this page.**
  - **Same-key + same body:** "Subsequent requests with the same key return the same result, including `500` errors."
  - **Concurrent same-key:** "If incoming parameters fail validation, or the request conflicts with another request that's executing concurrently, we don't save the idempotent result because no API endpoint initiates the execution."
  - **Scope (per-account / per-API-key / global):** **not addressed on this page.**

### S2 — Stripe error codes reference

- **Tier:** 2 (official docs)
- **Provenance:** `docs.stripe.com/error-codes`, observed 2026-05-01.
- **Author context:** Stripe official.
- **What it tells us:**
  - `idempotency_key_in_use` exists. Description: "The idempotency key provided is currently being used in another request. This occurs if your integration is making duplicate requests simultaneously."
  - `idempotency_error` (the code the vault entry names) is **not present on this page.**
  - HTTP status codes are not enumerated alongside error codes on this page.

### S3 — IETF draft `Idempotency-Key` header field, version 07

- **Tier:** 2 (draft standard)
- **Provenance:** `datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/`, version 07, last revised 2025-10-15. Status: **expired Internet-Draft.** Working group: httpapi WG. Authors: Jayadeba Jena (PayPal), Sanjay Dalal.
- **Author context:** Active expired draft; no ratified RFC. Co-authored by PayPal engineer (despite PayPal not actually using the `Idempotency-Key` header in practice — see S4).
- **What it tells us:**
  - **Header name:** `Idempotency-Key` (matches Stripe's choice).
  - **Value type:** RFC 8941 Structured Header String. **No length or charset constraint specified.**
  - **Same-key + different body:** "the resource SHOULD reply with a HTTP `422` status code" (Unprocessable Content).
  - **Same-key + in-flight:** "the resource SHOULD reply with an HTTP `409` status code" when "a request with the same Idempotency-Key for the same operation is being processed or is outstanding."
  - **TTL:** "The resource MAY require time based idempotency keys to be able to purge or delete a key upon its expiry. The resource SHOULD define such expiration policy and publish it in the documentation." No specific value mandated.
  - **Scope:** Not specified — keys "MUST be unique," with uniqueness scope deferred to "the resource owner."

### S4 — PayPal REST idempotency reference

- **Tier:** 2 (official docs)
- **Provenance:** `developer.paypal.com/api/rest/reference/idempotency/`, observed 2026-05-01.
- **Author context:** PayPal official docs.
- **What it tells us:**
  - **Header:** `PayPal-Request-Id` — **not** `Idempotency-Key`.
  - **Length:** "38 single-byte character limit." UUID format recommended.
  - **TTL:** Server stores the ID "for a period of time" — **undocumented duration.**
  - **Same-key + same body:** "PayPal returns the latest status of the previous request that used that same header."
  - **Same-key + different body:** Not addressed.
  - **Concurrent:** "When you send two simultaneous API requests with same `PayPal-Request-Id` header, PayPal processes the first request and might fail the second request." HTTP code unspecified.

### S5 — Square idempotency reference

- **Tier:** 2 (official docs)
- **Provenance:** `developer.squareup.com/docs/working-with-apis/idempotency`, observed 2026-05-01.
- **Author context:** Square official docs.
- **What it tells us:**
  - **Wire location:** `idempotency_key` is a **request body field**, not a header. (Confirmed across Square's `CreatePayment`, `CreateOrder`, etc., in their REST API reference.)
  - **Same-key + different body:** "you get an error indicating that you used the idempotency key previously. Note that this behavior might vary depending on the API." HTTP code / error code unspecified on this page.
  - **Same-key + same body:** "The endpoint returns the response as the first successful `CreatePayment` response."
  - **TTL / charset / length / scope / concurrent:** Not specified on this page.

### S6 — Stripe corporate blog: "Designing robust and predictable APIs with idempotency"

- **Tier:** 4 (engineering blog, named author with affiliation)
- **Provenance:** `stripe.com/blog/idempotency`, published 2017-02-22, author Brandur Leach (Stripe API Experience).
- **What it tells us:** Conceptual treatment of idempotency. **Does not describe Stripe's internal storage architecture, TTL specifics, concurrent-request handling, or HTTP status codes.** This is the post the vault entry's "Stripe's internal architecture per their engineering blog uses similar dual-storage pattern" claim points at — and it does not say that.

### S7 — Brandur Leach personal blog: "Implementing Stripe-like idempotency keys in Postgres"

- **Tier:** 4 (engineering blog, named author, with full reference implementation)
- **Provenance:** `brandur.org/idempotency-keys`, published 2017-10-27, author Brandur Leach (Stripe-affiliated at time of writing; published the Rocket Rides example app cited in this article alongside Stripe).
- **Author context:** This is the canonical "how do I build this" reference for Stripe-pattern idempotency in production. Treated as quasi-authoritative across the industry.
- **What it tells us:**
  - **Storage:** **Postgres-only.** Quote: "none of this is possible on a non-ACID store like MongoDB." No Redis. No dual-storage cache.
  - **Locking:** Postgres serializable transactions. Quote: "Only acquire a lock if the key is unlocked or its lock has expired because the original request was long enough ago." "If two different transactions both try to lock any one key, one of them will be aborted by Postgres."
  - **TTL recommendation:** "I'd suggest a threshold of about 72 hours so that even if a bug is deployed on Friday that errors a large number of valid requests, an app could still keep a record of them throughout the weekend." Mentions "say 24 hours or so" only as a key-recycling alternative.
  - **HTTP status codes:** **409** for both concurrent in-flight (`error_request_in_progress`) and same-key + different params.
  - **Multi-step operations:** Recovery-point state machine. States `RECOVERY_POINT_STARTED`, `RECOVERY_POINT_RIDE_CREATED`, `RECOVERY_POINT_CHARGE_CREATED`, `RECOVERY_POINT_FINISHED`. Each phase returns `NoOp`, `RecoveryPoint`, or `Response` within a serializable transaction. This is how partial-progress on a multi-step operation is recovered after crash.

## Findings

### F1 — There is no single industry idempotency "convention" the entry can lean on

The entry calls the `Idempotency-Key` header "Stripe RFC" and treats wire shape, length, and charset as universal. Three independent payment providers ship three different shapes:

| Provider | Mechanism | Length | Source |
|---|---|---|---|
| Stripe | `Idempotency-Key` header | 255 chars max | S1 |
| PayPal | `PayPal-Request-Id` header | 38 chars max | S4 |
| Square | `idempotency_key` body field (not header) | Unspecified | S5 |

The IETF draft (S3) defines the `Idempotency-Key` header but is **expired**, sets no length or charset, and has **no ratified RFC**. The entry's "per Stripe RFC" framing is wrong on three counts: not Stripe's, not an RFC, and not ratified.

**Operational consequence:** the entry can adopt Stripe's header shape as a deliberate choice, but it cannot claim "industry standard." If BokChoy customers integrate with engines or middleware that follow PayPal or Square shapes, the wire contract diverges.

### F2 — The entry's HTTP status code semantics directly contradict the IETF draft and partially diverge from Stripe

| Case | Entry | IETF draft 07 (S3) | Stripe canonical (S1, S2) | Brandur (S7) |
|---|---|---|---|---|
| Same key, different body | **409 + `idempotency_error`** | **422** | "errors" — code unspecified, but `idempotency_error` is **not present** on Stripe's error-codes page | **409** |
| Same key, in-flight | **409 + `request_in_flight`** | **409** | **`idempotency_key_in_use`** error code | **409 + `error_request_in_progress`** |

Two specific issues:
1. **422 vs. 409 for the parameter-mismatch case.** The IETF draft (the closest thing to a standard) specifies **422 Unprocessable Content**. The entry uses 409 with no source supporting that exact choice. Brandur's blog uses 409, which is at least one credible cite — but at the cost of contradicting the draft.
2. **Error-code names are fabricated.** `idempotency_error` is not on Stripe's error codes page. `request_in_flight` is invented; Stripe's actual code is `idempotency_key_in_use`, Brandur's is `error_request_in_progress`. The entry's named error codes are not any provider's actual codes.

**Operational consequence:** the entry can pick a status-code shape, but must defend it. The current naming will not interoperate with any client SDK that follows Stripe's actual codes or the IETF draft's semantics.

### F3 — The Redis + Postgres dual-storage architecture is not what the cited sources describe

The entry says: "Stripe's internal architecture per their engineering blog uses similar dual-storage pattern. Confidence: medium — Stripe's full architecture not public." Two things wrong here:

- The Stripe corporate blog (S6) makes **no architecture claims** at all. It is conceptual.
- Brandur's personal blog (S7) — the actual canonical implementation reference — describes **Postgres-only**, with serializable transactions providing the locking. Quote: "none of this is possible on a non-ACID store like MongoDB."

The Redis-as-hot-path + Postgres-as-safety-net pattern is not in either Stripe-affiliated source. It may be a sound design — Redis `SET NX EX` is a real distributed-lock primitive and ACID stores are not the only correct choice — but the entry's claim that it's "per Stripe's engineering blog" is unsupported.

**Two design positions are now visible, and the entry has not chosen between them:**
- **Position B7 (Brandur):** Postgres-only with serializable transactions. ACID guarantees do the lock. Simpler operational footprint (one database). Higher latency at scale (transaction overhead per request). Recovery via in-DB state machine.
- **Position E (entry's current model):** Redis hot-path + Postgres safety net. Faster lookup. More operational complexity (cache invalidation, Redis failover, dual-storage consistency). The entry's "Redis SET NX EX, fallthrough to Postgres UNIQUE on Redis miss" is a real pattern but is *not* what Stripe-affiliated material describes.

The entry never names this fork or defends choosing E over B7. **That's a design hole, not a research finding** — but research surfaces it.

### F4 — The 24h TTL choice is not sourced as the entry implies

Sources surveyed:
- **Stripe canonical (S1):** "at least 24 hours" — a *minimum* retention, not a TTL value. Stripe may keep keys longer.
- **Brandur (S7):** explicitly recommends **72 hours** with reasoning ("a bug deployed Friday should still have records through the weekend"). Mentions "24h or so" only as a key-recycling alternative.
- **IETF draft (S3):** no specific TTL.
- **PayPal / Square:** TTL undocumented.

The entry chose 24h with no defense. **The most cited Stripe-affiliated reasoning explicitly recommends 72h.** A 24h choice is defensible (mobile-retry windows, simpler designer mental model) but the entry does not make that argument — it asserts 24h as "Stripe convention" when in fact:
- Stripe's canonical wording is "at least 24h" (a floor)
- Stripe's most-cited engineer recommends **3× that** as the sensible default

**Operational consequence:** if the BokChoy retention floor is actually 24h, a customer who deploys a buggy release Friday afternoon and rolls back Monday morning has lost the keys. Brandur's 72h argument applies directly. The entry needs to either defend 24h or revise to 72h.

### F5 — The entry omits multi-step / partial-progress recovery — a load-bearing concept in Brandur's reference architecture

Brandur (S7) treats partial-progress recovery as **central**, not optional: idempotency keys are not just a duplicate-detection mechanism, they are also a *recovery checkpoint* for multi-step operations. The state machine (`RECOVERY_POINT_STARTED` → `..._CREATED` → `..._FINISHED`) lets a process crash mid-operation and the next retry pick up from the last completed step rather than re-running the whole thing.

The entry's wallet credit/debit example is single-step, so the question doesn't surface there. But the entry's own scope includes **"loot rolls from `(player_id, banner_id, pull_session_id)`"** — and a loot roll is multi-step (roll RNG, write inventory, decrement currency, write transaction record). What happens if the server crashes between "wrote inventory" and "decremented currency"? The entry's "store the response on completion" model has no answer. Brandur's recovery-point model has a direct answer.

**Operational consequence:** the entry's architecture handles single-step idempotent operations. It does not handle multi-step operations with partial-progress recovery. For BokChoy's mutating endpoints — wallet, loot, IAP fulfillment, inventory grant — this is likely material. **The recovery-point pattern is missing from the entry and needs to be either adopted or explicitly rejected with reasoning.**

### F6 — Per-API-key scoping is plausible but not cited

The entry asserts: "Stripe scopes by API key — per their docs and the way their `account.id` is part of the request signature. Confidence: high." The Stripe canonical idempotency doc (S1) **does not address scope.** The IETF draft (S3) does not specify scope. PayPal and Square don't address it on the surveyed pages.

Per-API-key scoping is a sensible design and almost certainly what Stripe does in practice (API keys are how Stripe distinguishes accounts on every request), but the entry's `confidence: high` for this claim is based on an inference, not a cited source. The investigation budget does not include reading the Stripe SDK source or the test-mode-vs-live-mode docs to verify directly.

**Operational consequence:** the per-tenant isolation argument in the entry is structurally correct, but the citation is unverified. Vault as `provisional` for this specific sub-claim, or read the Stripe SDK source as a follow-up.

### F7 — RevenueCat / Adyen / Cloudflare citations are unsupported

The entry cites these three by name: "Adyen ships business-state-derived patterns; Cloudflare Workers KV ships similar hybrid for their tail consumers." And: "RevenueCat (subscription / IAP-fulfillment SDK uses similar pattern internally per their blog)." None of these citations include URLs, post titles, or dates. The investigation budget did not pull these specifically — they would each require a dedicated search and fetch — but their absence from the searchable surface (no obvious RevenueCat blog post on idempotency, no Adyen public docs on business-state-derived idempotency at the level the entry describes) suggests these are training-data inferences, not real citations.

**Operational consequence:** the entry's "≥2 named production references" claim under its production-grade gates collapses. Stripe (via Brandur) is **one** production reference. PayPal and Square are technically additional references, but they ship **different patterns** than the entry adopts, so they don't support the entry's choices — they contradict aspects of them. The entry cannot claim "production-cited high" on the dual-storage pattern, the 24h TTL, the per-API-key scoping, or the in-flight-sentinel design from the surveyed sources.

## Conflicts

The findings above include several direct contradictions. Applying *Contradiction protocol* (production code > current docs > old advocacy):

1. **24h vs. 72h TTL.** Brandur (engineering blog with reference impl, S7) recommends 72h. Stripe canonical (S1, current doc) says "at least 24h" (a floor). These don't actually conflict — Stripe's wording allows 72h. The conflict is between the entry (asserts 24h hard) and the source most likely to have driven the entry (recommends 72h). **No source defends a 24h hard cap.**

2. **422 vs. 409 for parameter-mismatch.** IETF draft (S3, current draft) recommends 422. Brandur (S7, 2017) uses 409. Stripe canonical (S1) doesn't specify. Per *Contradiction protocol*, current draft over old blog — but the draft is **expired**, weakening it. This contradiction does not resolve cleanly; the entry must defend its choice rather than claiming consensus.

3. **Postgres-only vs. Redis + Postgres dual-storage.** Brandur (S7) is Postgres-only. The entry's dual-storage has no source defending it specifically. This isn't a contradiction in the sources — it's the entry making an architectural claim that its purported source doesn't make.

4. **Wire shape (header name, length, location).** Stripe vs. PayPal vs. Square diverge fundamentally. There is no resolution; the entry must pick a shape and own the choice.

## Conditions

These findings hold under specific conditions:

- **Sources observed 2026-05-01.** Stripe doc pages are unversioned and may shift. IETF draft 07 is expired; if revived as 08+ or ratified as RFC, normative claims may change.
- **Surveyed providers are payments-adjacent (Stripe, PayPal, Square) plus one IAP/subscription-adjacent reference (Brandur for Stripe Rocket Rides).** Game-economy-specific idempotency patterns may differ — RevenueCat, AccelByte, Heroic Hiro are gaming-specific candidates not surveyed in this session.
- **The investigation did not pull live Stripe SDK source.** The per-API-key scoping claim (F6) and the exact behavior of Stripe's `idempotency_key_in_use` (HTTP code, response body) are not directly verified — they would require reading `stripe/stripe-node` or `stripe/stripe-go` at a pinned commit.
- **Brandur's blog is from 2017.** Stripe's internal architecture has likely evolved; the recovery-point pattern and Postgres-only model may or may not still be how Stripe ships in 2026.

## Operational implications

The entry `[[idempotency-strategy]]` cannot be vault-ready as currently written. **It is not the design that's wrong — it's the evidence basis.** Specific obligations to design:

1. **Strike unsupported claims.** Remove or downgrade: "Adyen ships business-state-derived patterns," "Cloudflare Workers KV ships similar hybrid," "RevenueCat... similar pattern internally per their blog," "PayPal and Square also ship header-based idempotency" (true only with caveats — Square is body, PayPal is a different header). "Stripe RFC" → "expired IETF draft."

2. **Defend or revise the 24h TTL.** No surveyed source defends 24h as a hard cap. Brandur explicitly recommends 72h. Either (a) revise to 72h with citation, or (b) defend 24h with reasoning ("mobile retry windows are minutes-to-hours; longer TTL increases Redis memory cost without observable benefit") — but the defense must be the entry's, not a fabricated cite.

3. **Defend or revise the dual-storage architecture.** Brandur's reference is Postgres-only. The entry's Redis-hot-path + Postgres-safety-net is a real pattern but unsourced from the cited material. Either (a) cite a different production system that publishes this architecture (Cloudflare Workers KV, AWS internal idempotency, etc. — requires real investigation), or (b) defend the choice on first principles ("at our latency target, Postgres-only adds Xms per request and we cannot tolerate that"). Right now neither is done.

4. **Resolve the 422 vs. 409 question for parameter-mismatch.** The entry's 409 claim contradicts the IETF draft's 422. Pick one with reasoning. If 409, cite Brandur and acknowledge the IETF divergence. If 422, acknowledge the divergence from Stripe's likely de-facto behavior.

5. **Replace the fabricated error codes.** `idempotency_error` and `request_in_flight` are not real. Use Stripe's actual codes (`idempotency_key_in_use` for in-flight) or invent new codes and own them — but don't claim "per Stripe convention."

6. **Add multi-step recovery, or explicitly reject it with reasoning.** Brandur's recovery-point state machine handles partial-progress on multi-step operations (the loot-roll case in BokChoy). The entry's model handles only completed-or-not. For BokChoy's loot, IAP fulfillment, and inventory-grant endpoints — all multi-step — this is likely material. Either adopt the recovery-point pattern explicitly or document why "rerun the whole operation if it crashed mid-flight" is acceptable for these endpoints.

7. **Verify per-API-key scoping by reading the Stripe SDK or doc-search.** F6's claim is plausible but not cited. Either verify directly (read `stripe/stripe-node` for how `account.id` participates in idempotency lookup) or downgrade `confidence` and mark `provisional`.

The entry's *direction* — hybrid (server-derived + client-supplied), per-tenant scoped, with cache+DB safety — is sensible. The work to do is not redesign; it's grounding each load-bearing claim in a real source or a real defense.

## Reproducibility note

Reproducible. Investigator with access to the public web should reach substantially the same finding via:

1. WebFetch `docs.stripe.com/api/idempotent_requests` and `docs.stripe.com/error-codes` (observe 2026-05-01 or current).
2. WebFetch `datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/` for status; fetch the draft 07 HTML for normative content.
3. WebFetch `developer.paypal.com/api/rest/reference/idempotency/` and `developer.squareup.com/docs/working-with-apis/idempotency`.
4. WebFetch `brandur.org/idempotency-keys` (the implementation-detail reference) and `stripe.com/blog/idempotency` (the conceptual one) to compare.

The structural claims (three providers ship three shapes; Brandur recommends 72h and Postgres-only; IETF draft 07 is expired; specific status-code recommendations) are direct quotes, not inferences. The per-API-key scoping question and exact Stripe SDK behavior are not reproducible from this session and would require code reading.

## Closing the open threads (2026-05-01, same session)

### S8 — `stripe/stripe-node` source at commit `42384847a325d0e4daaf41d51d24693eaa1c408c`

- **Tier:** 1 (production code, public repo, pinned commit)
- **Provenance:** `github.com/stripe/stripe-node`, commit `42384847`, file `src/RequestSender.ts`. Observed 2026-05-01.
- **What it tells us:**
  - Lines 240–242: `'Idempotency-Key': this._defaultIdempotencyKey(method, userSuppliedSettings, apiMode)`. Header placement confirmed. Default key auto-generated as `uuid4()` for safe operations.
  - Lines 329–332:
    ```ts
    // Retry on conflict errors.
    if (res.getStatusCode() === 409) {
      return true;
    }
    ```
    **Stripe's own SDK auto-retries on 409.** This is structurally incompatible with using 409 for parameter-mismatch (a permanent error would loop forever). So Stripe's server cannot return 409 for the same-key + different-body case in normal use — that case must use a different status code (likely 422 per the IETF draft, or 400-class).
  - No client-side validation of key length or charset.
  - No per-account or per-API-key scoping logic in the SDK code. Scope is enforced server-side; the SDK just sends the header.

### S9 — Shopify GraphQL idempotency reference

- **Tier:** 2 (official docs)
- **Provenance:** `shopify.dev/docs/api/usage/implementing-idempotency`, observed 2026-05-01.
- **What it tells us:**
  - **TTL: 24 hours, documented and explicit.** "Shopify tracks idempotency keys for 24 hours from the original request."
  - GraphQL `@idempotent` directive (different wire shape from REST header — fourth distinct shape across surveyed providers).
  - Same-key + different body: `IDEMPOTENCY_KEY_PARAMETER_MISMATCH` userError (GraphQL, not HTTP status).
  - In-flight: `IDEMPOTENCY_CONCURRENT_REQUEST` userError. **Distinct error code from the parameter-mismatch case** — same conceptual split as Stripe's `idempotency_key_in_use`.
  - Storage architecture: not addressed.
  - Scope: implicitly per-shop.

### F8 — 409 in Stripe means in-flight, not parameter-mismatch (closes part of F2)

Stripe's SDK auto-retries on 409 (S8). Brandur's 2017 blog returns 409 for both in-flight and parameter-mismatch (S7). **Per *Contradiction protocol* — production code wins over old advocacy — Stripe's current behavior overrides Brandur's 8-year-old blog.** The entry's "409 + `idempotency_error` for parameter-mismatch" is wrong on both counts:
- 409 cannot be the parameter-mismatch code in a system that auto-retries 409 client-side.
- `idempotency_error` is not a real Stripe error code.

Resolution: use 422 for parameter-mismatch (IETF draft S3, structurally consistent with Stripe's auto-retry behavior) and 409 for in-flight (IETF draft, Stripe's `idempotency_key_in_use`, Shopify's `IDEMPOTENCY_CONCURRENT_REQUEST`). Use real error codes (`idempotency_key_in_use` if matching Stripe, or invent and own).

### F9 — 24h TTL has a current named-system citation (closes F4 gap)

Shopify (S9) explicitly documents 24h. Stripe canonical (S1) says "at least 24h" — compatible with 24h as a hard cap. Brandur (S7) recommends 72h with reasoning. Per *Contradiction protocol* — current docs over old advocacy — Shopify's 24h is the more recent and explicit data point. **24h is now defensible by citation, not just assertion.**

The Brandur 72h argument ("Friday-bug-rolled-back-Monday should still have records") still has weight but is countered by: (a) BokChoy's audit log via the Postgres `transactions` table is permanent, so records aren't actually lost at TTL — only the fast-replay window closes; (b) a designer rolling back a 72h-old payment is fundamentally a different operation (refund/reverse) than retrying an idempotent request, and idempotency keys aren't the right tool for it.

### F10 — No named production system publicly documents a Redis + Postgres dual-storage idempotency architecture (closes OT2)

Search result: tutorial-tier blogs describe Redis + DB hybrid patterns generically (Redis blog, Medium posts, dev.to). **No tier-1/2/3 production system surveyed publishes their dual-storage idempotency architecture as ground truth.** Specifically:

- Stripe (via Brandur, S7): Postgres-only with serializable transactions.
- Shopify (S9): storage architecture not documented; Shopify's primary database is MySQL, not Postgres+Redis.
- Square (S5): not documented.
- PayPal (S4): not documented.
- "Implementing idempotency in Redis" (Redis corporate blog, tier 4–5): describes Redis-as-deduplication, not dual-storage with DB safety net. Acknowledges that "Postgres is often the better choice for high-stakes operations."

**The entry's Redis-hot-path + Postgres-safety-net architecture has no named production cite.** This is not a fatal flaw — first-principles arguments about distributed locks and ACID guarantees are valid — but the entry must defend it on engineering reasoning, not borrowed authority. The "production-grade" claim "industry-standard for the problem class" is not earned for the dual-storage *architecture*; it's earned only for the *header-based-key concept*.

### F11 — Recovery-points are not legacy; they are the in-process form of saga state (closes OT4)

Modern engineering writeups (2024–2025, surveyed via search) treat sagas, event sourcing, and idempotency keys as **complementary**, not as alternatives. Specifically:

- "All operations and compensations in sagas must be idempotent" — meaning each saga step uses an idempotency key.
- Recovery-points (Brandur's pattern) are the in-process state-machine equivalent of saga state for a multi-step operation that lives within one service.
- Event sourcing provides the durable log; idempotency keys provide the deduplication contract; recovery-points or sagas provide the partial-progress recovery.

For BokChoy specifically, the architecture cascade implies:

- **Single-service multi-step operations** (loot roll: RNG → write inventory → decrement currency → write transaction record, all in one service) → **recovery-point pattern** within a Postgres serializable transaction. Brandur's pattern applies directly.
- **Cross-service multi-step operations** (IAP fulfillment: receipt-validation → wallet-credit → inventory-grant → mailbox-notify, across services if BokChoy decomposes) → **saga pattern** with idempotency at each step boundary.
- **Audit / replay** (CL-029 event-sourcing decision, upcoming) → **event store** sits alongside both.

The entry currently models only the single-step case. It must explicitly add recovery-points for multi-step single-service (loot, inventory grant) or commit to a saga-based decomposition. The choice depends on the upcoming CL-029, but the entry must name the gap and not pretend the current model handles multi-step.

### F12 — Postgres-only idempotency is operationally cheaper than dual-storage at BokChoy scale (closes OT5)

Back-of-envelope under entry-stated traffic levels.

**Indie tier (10K MAU, ~50K transactions/day):**
- Average write rate: ~0.6/sec. Peak (5× factor common in mobile gaming): ~3/sec.
- Postgres `(project_id, idempotency_key)` UNIQUE index lookup at this scale: B-tree fits trivially in `shared_buffers`. Lookup ~0.1–0.5ms.
- Idempotency overhead per write: 1 SELECT + 1 INSERT inside the existing transaction. ~0.5–1.5ms added latency.
- **Redis savings: ~0.3–1ms per request. Total per-second savings: ~3ms across the entire fleet at peak.** Operationally meaningless.

**Studio+ tier (2M MAU, ~10M transactions/day):**
- Average write rate: ~115/sec. Peak: ~575/sec.
- Postgres index size: 10M rows × ~50 bytes/row index entry = ~500MB. Still fits in `shared_buffers` on standard hardware.
- Idempotency overhead per write: ~1–3ms (index slightly bigger, but still cached).
- **Redis savings: ~0.5–2ms per request. Total per-second savings: ~1s across the entire fleet at peak.** Measurable but small.

**Cost comparison:**
- Postgres-only: existing database, no additional infrastructure. Idempotency rows live in the same DB as the business data and are co-located in the same transaction (which Brandur's pattern requires for correctness).
- Redis hot-path: separate Redis cluster, requires HA failover, requires sentinel logic for in-flight requests, requires reconciliation logic on Redis miss → Postgres fallthrough. Per S7 (Brandur), Redis is unnecessary because Postgres serializable transactions already provide the locking.

**Conclusion:** at BokChoy's scale (10K MAU through 2M MAU), Postgres-only is genuinely viable. Sub-millisecond latency savings from Redis do not justify the operational complexity of dual-storage. The entry's "Redis is faster" argument is technically true but operationally negligible. The choice is not between "fast" and "slow" — it's between "simple" and "complex," and the complexity is not earned by the latency math.

The case for Redis would have to come from somewhere else — e.g. if the same Redis cluster is already required for session state, rate limiting, or pub/sub, then the marginal cost of adding idempotency to it is near-zero. **That argument is not in the entry.** If BokChoy has Redis for unrelated reasons, dual-storage becomes cheap and the choice is fine. If not, Postgres-only is the better default.

## Updated operational implications (post-OT-closure)

The 7-point obligation list to design from the original *Operational implications* section is updated:

1. **Strike unsupported claims.** (Unchanged from original.)

2. **24h TTL is now defensible by citation.** Shopify documents 24h explicitly (S9). Use that as the citation; drop the implied-Stripe-canonical reasoning. Optionally note Brandur's 72h alternative as a rejected option.

3. **Defend or revise the dual-storage architecture.** F10 confirms no named production system publishes this pattern. F12 shows Postgres-only is operationally cheaper at BokChoy scale. **Two coherent positions for design to choose between:**
   - **Position B7 (Postgres-only, per Brandur):** simpler, fewer systems, sufficient at scale. Use Postgres serializable transactions for locking and recovery-point state machine for multi-step operations.
   - **Position E-revised (dual-storage justified by Redis-already-present):** valid only if Redis is required elsewhere for sessions/rate-limiting/etc. and the marginal cost is near-zero. Entry must name the other Redis use case to justify.
   - The current entry implies E without naming the other use case. **Choose B7 or justify E.**

4. **Resolve 422 vs 409.** F8 closes this: **422 for parameter-mismatch, 409 for in-flight.** Cite IETF draft (status-code split) + Stripe SDK behavior (S8 auto-retries on 409, structurally requires 422-or-similar for permanent errors).

5. **Replace fabricated error codes.** Use Stripe's actual `idempotency_key_in_use` for in-flight, or invent BokChoy-specific codes (`bokchoy_idempotency_concurrent`, `bokchoy_idempotency_mismatch`) and own them. Drop "per Stripe convention" framing.

6. **Add multi-step recovery (recovery-points or saga).** F11 closes this: not legacy, not optional for BokChoy's loot/IAP/inventory-grant endpoints. Adopt recovery-points for in-process multi-step ops; defer saga decision to CL-029 cascade. Either path requires explicit addition to the entry.

7. **Verify per-API-key scoping.** F6 + S8 close this: SDK does not enforce scope (it just sends the header), so scope is purely server-side. The entry's per-tenant isolation argument is correct but the citation must shift from "per Stripe convention" to "BokChoy-specific server-side decision, structurally consistent with how Stripe ships scoping (account-derived, not key-derived)." Confidence on this sub-claim: medium — verified-by-absence-in-SDK rather than verified-by-explicit-doc.

## Round 2 — closing D2 (multi-step recovery) with tier-1 evidence (2026-05-01, same session)

Design surfaced D2 as the second remaining decision after committing to B7 (Postgres-only, Path α). My initial push-back rested entirely on F11, which cited Brandur's 2017 blog (tier 4). Promoting the evidence to tier 1 — and actively probing for a counter-position.

### S10 — `brandur/rocket-rides-atomic` reference implementation source

- **Tier:** 1 (production code, public repo, pinned commit, named author)
- **Provenance:** `github.com/brandur/rocket-rides-atomic`, commit `94b370ddbdc8d08fb263f07c221bab42190d48e6`, last activity 2022-12-01. Observed 2026-05-01.
- **Author context:** Brandur Leach, Stripe-affiliated at time of original publication. Repository is the reference implementation for the 2017 `brandur.org/idempotency-keys` post. Last commit is a Sinatra dependency bump — code is otherwise stable since the article.
- **What it tells us:** `schema.sql` carries the load-bearing detail:

  ```sql
  CREATE TABLE idempotency_keys (
      id              BIGSERIAL   PRIMARY KEY,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      idempotency_key TEXT        NOT NULL CHECK (char_length(idempotency_key) <= 100),
      last_run_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_at       TIMESTAMPTZ DEFAULT now(),
      request_method  TEXT        NOT NULL,
      request_params  JSONB       NOT NULL,
      request_path    TEXT        NOT NULL,
      response_code   INT         NULL,
      response_body   JSONB       NULL,
      recovery_point  TEXT        NOT NULL CHECK (char_length(recovery_point) <= 50),
      user_id         BIGINT      NOT NULL
  );
  CREATE UNIQUE INDEX idempotency_keys_user_id_idempotency_key
      ON idempotency_keys (user_id, idempotency_key);
  ```

  Three confirmations: (i) `recovery_point` is on the same row as `idempotency_key` — F11 confirmed at tier 1, schema co-location is real; (ii) UNIQUE scoping is `(user_id, idempotency_key)` — analogous to BokChoy's proposed `(api_key_id, idempotency_key)`; (iii) `request_params JSONB` stores the full request body for parameter-mismatch detection. Length cap is 100 chars, not 255 (Stripe) or 38 (PayPal) — fourth distinct length data point.

  Also relevant: the schema has a separate `staged_jobs` table for outbox-pattern background work, and `api.rb` confirms (per `RECOVERY_POINT_*` constants and `case key.recovery_point` loop) that recovery-point advancement and `staged_jobs.insert` happen inside the same `atomic_phase` Postgres transaction. This is the load-bearing invariant: the state machine and the queued side effects commit atomically.

### S11 — AWS Prescriptive Guidance on transactional outbox pattern

- **Tier:** 2 (official docs, AWS architecture center)
- **Provenance:** `docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html`, observed 2026-05-01.
- **Author context:** AWS architecture team, official prescriptive guidance for cloud patterns. Maintained.
- **What it tells us:** The outbox pattern is the canonical solution to atomic-DB-write-plus-event-publication. Outbox table sits in the same database; relay process consumes it. **At-least-once delivery, not exactly-once** — consumers must be idempotent. Aligns directly with what `staged_jobs` is in S10.

### S12 — microservices.io transactional outbox pattern

- **Tier:** 2 (canonical reference site for microservices patterns, Chris Richardson)
- **Provenance:** `microservices.io/patterns/data/transactional-outbox.html`, observed 2026-05-01.
- **Author context:** Chris Richardson (Eventuate.io founder, author of *Microservices Patterns*). Long-standing canonical resource on microservices design patterns.
- **What it tells us:** Confirms the outbox pattern is industry-standard for atomic-state-change-plus-side-effect. Cross-references the saga pattern: sagas use outbox at each step boundary. Independent corroboration of S11.

### F13 — Recovery-points are co-located with idempotency keys at tier 1 (closes F11 → tier 1)

S10 confirms F11 directly with code: `recovery_point TEXT NOT NULL` is a column on `idempotency_keys`. The Brandur 2022 commit shows the pattern is stable, not abandoned. Promotes F11 from tier-4 evidence to tier-1.

### F14 — A simpler pattern (D2-α) exists: per-step idempotency keys + outbox, without recovery-points

The contradiction probe surfaces a real third option my prior push-back didn't name. **If every step in a multi-step operation has its own idempotency key, AND any non-deterministic step (RNG) is made deterministic-on-key, then retrying the entire operation produces duplicates that the per-step UNIQUE constraints catch. Recovery-points become optional.**

For BokChoy's MVP endpoints specifically:

- **Wallet credit/debit (1–3 steps):** UNIQUE on `transactions(wallet_id, source_event_id)`. Retry produces duplicate INSERTs caught by the constraint. **No recovery-point needed.**
- **IAP fulfillment (4 steps):** UNIQUE on `(receipt_id)` for transaction record + `(user_id, sku, receipt_id)` for inventory grant. Apple/Google receipt validation is externally idempotent (same receipt → same response). Retry re-runs all four steps; constraints catch each duplicate. **No recovery-point needed.**
- **Loot roll (4 steps):** the only step that's non-deterministic on retry is the RNG. **Solution: deterministic PRNG seeded from `(player_id, banner_id, pull_session_id, attempt_number)`.** The seed is the request-level idempotency key. Retry produces the same RNG outcome → same inventory write → same currency decrement → same transaction record. All four steps idempotent via per-step UNIQUE. **No recovery-point needed.**
- **Inventory grant (1 step):** trivially idempotent via UNIQUE.

What D2-α loses vs. D2-β (full Brandur):
- **Wasted compute on retry.** Re-runs already-completed steps. For these endpoints, ~4 SQL operations per retry — negligible at BokChoy scale.
- **Less precise debug state.** Can't tell from the idempotency row "got to step 3 of 4 then crashed" — only "completed or not." Recoverable from logs.

What D2-α gains vs. D2-β:
- **Simpler schema.** No `recovery_point` column on the idempotency table.
- **Simpler request handler.** No `loop do … case key.recovery_point` state machine. Just: lookup key → if present and finished, replay response; if present and in-flight, return 409; if absent, run the operation (which is internally idempotent at every step), insert key with finished response.
- **Simpler test surface.** No need to test partial-progress recovery as a state machine — only need to test that each individual step is idempotent.

**The outbox (`staged_jobs`) is required separately, regardless of D2-α or D2-β.** Any endpoint that triggers an external side effect (webhook fire, mailbox push, third-party API call) needs at-least-once delivery via outbox. The choice between D2-α and D2-β is *only* about the recovery-point state machine.

### F15 — D2-α is the better fit for BokChoy specifically

Argument for D2-α over D2-β at BokChoy's MVP scope:

1. **The MVP endpoints (wallet, IAP, loot, inventory) are all 1–4 steps with naturally-keyable side effects.** D2-β's "skip already-completed steps on retry" optimization is worth more when steps are *expensive* — e.g., Brandur's example charges Stripe (network call, money moves). BokChoy's loot roll re-runs deterministic-RNG + 3 SQL writes, which is microseconds. The optimization saves nothing meaningful.
2. **D2-β requires a discipline D2-α doesn't.** Each multi-step endpoint defines its own recovery-point names (`RECOVERY_POINT_INVENTORY_WRITTEN`, `RECOVERY_POINT_CURRENCY_DECREMENTED`, etc.). New endpoints add new constants. Schema constraint is fine (`char_length <= 50`) but the *taxonomy* lives in code, drifts over time, and has to be reasoned about at every endpoint design. D2-α has no such taxonomy — every endpoint just makes its individual steps idempotent.
3. **The "retry replays expensive steps" risk doesn't apply to BokChoy's MVP.** No expensive non-idempotent-by-default steps. Stripe fits Brandur's pattern because charging a card has cost; BokChoy's spine has no such steps in MVP scope.

Argument for D2-β over D2-α (in case it gets relevant later):

1. **Future endpoints might have expensive non-idempotent steps.** If BokChoy later adds a feature that, e.g., triggers a third-party AI inference per loot roll (cost per call), the wasted-recompute concern applies and D2-β saves money. **Mitigation: the migration from D2-α to D2-β is `ALTER TABLE idempotency_keys ADD COLUMN recovery_point TEXT;` plus a per-endpoint state-machine refactor of the affected endpoints.** Not free, but localized to the endpoints that need it. D2-α today does not lock out D2-β tomorrow on an endpoint-by-endpoint basis.

2. **Debug-state precision.** D2-β makes "where did this crash" inspectable from the idempotency row directly. D2-α requires log correlation. Real but small benefit.

### F16 — The 2017 Brandur post explicitly mentions the simpler pattern as an option

Re-reading S7 (Brandur's blog) with this framing: Brandur calls the recovery-point pattern "a bit more elaborate than necessary for many cases" and notes that for simpler operations, per-step idempotency suffices. The article advocates recovery-points specifically because Rocket Rides charges Stripe (an expensive non-idempotent-by-default step) — *not* as a universal recommendation. **My initial push-back over-claimed Brandur as advocating recovery-points always.** Brandur advocates them when the operation has expensive non-idempotent steps. BokChoy's MVP doesn't have those.

## Updated D2 framing

Three positions, post-Round-2:

- **D2-α — Per-step idempotency keys + outbox for side effects, no recovery-point state machine.** Per-endpoint UNIQUE constraints on natural keys; deterministic RNG for loot rolls seeded from request-level key; `staged_jobs` (or equivalent outbox table) for at-least-once side-effect delivery. **New position surfaced this round.** Wins when endpoints have no expensive non-idempotent steps and step-count is small (BokChoy MVP).
- **D2-β — Brandur's full pattern: recovery-points + outbox + per-step keys.** `recovery_point` column on idempotency-keys table; per-endpoint state machine. Wins when endpoints have expensive non-idempotent steps (e.g., charging external payment gateway, calling priced AI inference). **Reject for BokChoy MVP — no such steps in scope.**
- **D2-B (deferral) — Defer all multi-step handling to CL-031.** Falsified by F13 + F11 — schema co-location of recovery-points means deferring still costs schema migration later, and `[[mvp-feature-sequence]]` line 53 already presumes "retry-after-crash works."

**Recommendation to design: D2-α.** Defends D2-B's spirit (don't add recovery-point state machine yet) without its falsified premise (deferring is free). Adopts the outbox pattern explicitly as a separable load-bearing piece. Stays open to D2-β endpoint-by-endpoint if future expensive-step features warrant it.

## Updated operational implications (Round 2)

The 7-point obligation list to design from the prior section gets one revision:

**6. Multi-step recovery — adopt D2-α, not deferral, not full Brandur.** The revised idempotency entry must:
- Keep idempotency key table schema simple: no `recovery_point` column.
- Add explicit *contract* requirements for each multi-step endpoint: every step has its own UNIQUE constraint on natural keys; any RNG is deterministic-on-request-key.
- Add `staged_jobs` (or equivalent outbox) table for side-effect at-least-once delivery, with documented invariant: outbox writes commit in the same Postgres transaction as the business state change.
- Specify deterministic-RNG-seed for loot rolls explicitly: `seed = hash(player_id || banner_id || pull_session_id || attempt_number)`.
- Document the migration trigger: "if a future endpoint has an expensive non-idempotent step (e.g., paid third-party API per call), upgrade *that endpoint* to D2-β by adding the recovery_point column and state machine. Don't pre-emptively add recovery-points to all endpoints."

The other 6 obligations are unchanged.

## Updated reproducibility note (Round 2)

Reproducible. Add to the prior reproducibility steps:

- Clone or fetch via API `github.com/brandur/rocket-rides-atomic` at commit `94b370d`. Read `schema.sql`, then `api.rb` for the `RECOVERY_POINT_*` constants and the `case key.recovery_point` loop.
- WebFetch `docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html` and `microservices.io/patterns/data/transactional-outbox.html`.
- Re-read S7 (`brandur.org/idempotency-keys`) attending to the section that frames recovery-points as "more elaborate than necessary for many cases."

## Open threads (post-Round-2)

Closed this round: D2 framing (F13–F16). Position D2-α surfaced; recommendation issued.

Remaining:

1. **Game-engine SDK idempotency models.** Original OT3 — still open. Not closed because RevenueCat publishes consumer-side patterns (webhook event_id deduplication, which BokChoy's natural-key approach already handles), not internal IAP fulfillment architecture. PlayFab / Nakama / AccelByte similarly publish only customer-facing surface. Lower priority; defer.

2. **Length cap and charset.** Original OT, still minor. Default to 255 chars matching Stripe; charset = printable ASCII per RFC 8941 Structured Header String (the IETF draft's framing). No further investigation needed; design owns the choice.

3. **Outbox table schema specifics.** The recommendation is "add `staged_jobs` or equivalent" but the actual schema (status enum, retry counts, claim semantics for the relay worker) deserves a short separate design pass. Could be folded into CL-029 (event sourcing) since the outbox is closely related to the event log. **Recommend deferring outbox-schema details to CL-029** — the *requirement* (outbox exists, commits in same transaction as state change) lands in this entry; the *schema* lands with the event-sourcing entry.

4. **Deterministic RNG seed format and PRF choice.** The recommendation is "seed from request-level key." Specifics (which PRF, how to derive seed bytes, how to handle attempt_number for retry-with-different-result on legitimate cases) are loot-specific and belong in CL-031 (server-authoritative loot). **Recommend deferring RNG details to CL-031** — the *invariant* (deterministic-on-key) lands in this entry; the *implementation* lands with the loot decision.
