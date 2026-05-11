---
type: research
features: [wallet, idempotency, http-contract]
related: ["[[idempotency-strategy]]", "[[idempotency-keys-schema-research]]", "[[wallet-http-contract]]"]
created: 2026-05-11
confidence: high
provisional: false
---

# How do production idempotency middlewares handle non-JSON original responses on REPLAY?

## Question

`apps/backend/src/idempotency/middleware.ts:266-273` (slice 8.1b) catches JSON-parse failure on the cached response and stores `null` for `response_body`. On REPLAY, the middleware emits `c.json(null, status)` — a JSON `null` literal body with the original status. **The contract `[[wallet-http-contract]]` G4 does not pin behavior for non-JSON original responses.** /design seat 2026-05-11 attempted to canonicalize "pin null as the contract" (option α) on YAGNI grounds; the position was under-evidenced (zero production cites for non-JSON idempotency replay) and walked back per the design primitive's industry-standard gate. This research entry surveys what production idempotency systems actually do for non-JSON responses behind the same kind of middleware.

## Triangulation

- **Production reference:** ✓ — Brandur `rocket-rides-atomic` source-walked at `api.rb:167` + `schema.sql:24` (commit HEAD as of 2026-05-11; last activity 2022-12-01; stable since 2017 article). The reference impl is JSON-by-construction.
- **Docs reference:** ✓ — IETF draft 07 §2.6 (`datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/`, observed 2026-05-11), Stripe `docs.stripe.com/api/idempotent_requests` (observed 2026-05-11), Shopify `shopify.dev/docs/api/usage/implementing-idempotency` (observed 2026-05-11). All three are non-normative on response-body format invariance.
- **Contradiction probe:** ✓ — actively searched for any production system that pins replay-fidelity guarantees (byte-identical, Content-Type preservation, non-JSON support) for idempotency-key-keyed retries. **No credible disagreement found.** Shopify's docs are the clearest counter-example: they EXPLICITLY say replay is NOT byte-identical (cached response reconstructed from DB records, may have changed). The "contradiction" is not "production teams disagree" but "production teams converge on JSON-by-construction."

## Sources examined

### S1 — Brandur `rocket-rides-atomic` Ruby source

- **Tier:** 1 (production code, public repo, named author, stable since 2017)
- **Provenance:** `github.com/brandur/rocket-rides-atomic`, shallow-cloned to `/tmp/bocek-ref-brandur-rocket-rides-atomic` 2026-05-11. Files `api.rb` + `schema.sql`.
- **Author context:** Brandur Leach, Stripe-affiliated at original publication (2017 article `brandur.org/idempotency-keys`). Reference-impl-as-teaching-asset; the canonical "Stripe-style idempotency on Postgres" implementation cited × 8 elsewhere in this vault.
- **What it tells us:**
  - `schema.sql:24` — `response_body JSONB NULL`. The column type is JSONB; non-JSON content cannot be stored as native JSONB.
  - `api.rb:167` — `[key.response_code, JSON.generate(key.response_body)]`. Replay path JSON-encodes the JSONB column on the way out.
  - `api.rb:335-355` — `Response` class wraps `(status, data)` and writes `response_body: data` to the key row. The `data` is whatever the handler returned; assumed to be a Hash/Array (Ruby's JSONifiable types). No Content-Type stored. No raw-bytes path.
  - **Conclusion: Brandur's design ASSUMES JSON-only responses BY CONSTRUCTION.** No path exists for non-JSON; the schema cannot represent it cleanly. Engineering teams that follow Brandur inherit this assumption.

### S2 — IETF Idempotency-Key header draft 07

- **Tier:** 2 (IETF draft, current normative reference; expired-but-only)
- **Provenance:** `datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/` + `www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.html`, version 07 (last revised 2025-10-15, observed 2026-05-11).
- **Author context:** Polli, Roozbehani; co-authored with prior input from Stripe, IETF httpapi WG.
- **What it tells us:**
  - **§2.6 (Idempotency Enforcement):** *"The request was retried after the original request completed. The resource SHOULD respond with the result of the previously completed operation, success or an error."*
  - "SHOULD" not MUST — non-normative on the IMPLEMENTATION of "the result." No requirement for byte-identical replay. No Content-Type preservation requirement. No non-JSON body handling guidance. No partial-state-recovery semantics.
  - **The draft is intentionally implementation-agnostic** on response reproduction details. It defines idempotency *semantics* (same key → equivalent result) and delegates response-format details to the resource.

### S3 — Stripe `docs.stripe.com/api/idempotent_requests`

- **Tier:** 2 (current official docs)
- **Provenance:** `docs.stripe.com/api/idempotent_requests`, observed 2026-05-11.
- **Author context:** Stripe's API docs team. Canonical reference for the canonical production idempotency implementation.
- **What it tells us:**
  - Verbatim: *"Stripe's idempotency works by saving the resulting status code and body of the first request made for any given idempotency key, regardless of whether it succeeds or fails. Subsequent requests with the same key return the same result, including 500 errors."*
  - **No specification of byte-identical, Content-Type, or non-JSON handling.** Stripe's API is JSON-by-product-contract; the question doesn't surface in their docs.
  - Limitation noted: *"We save results only after the execution of an endpoint begins. If incoming parameters fail validation, or the request conflicts with another request that's executing concurrently, we don't save the idempotent result."* — validation-failure path bypasses caching entirely.

### S4 — Shopify `shopify.dev/docs/api/usage/implementing-idempotency`

- **Tier:** 2 (current official docs)
- **Provenance:** `shopify.dev/docs/api/usage/implementing-idempotency`, observed 2026-05-11.
- **Author context:** Shopify API team, GraphQL idempotency context.
- **What it tells us:**
  - Verbatim: *"After the original request completes successfully, any duplicate requests with the same idempotency key receive the cached GraphQL response without reprocessing the operation. Note that on rare occasions, the cached GraphQL response may not be the same as the original one, as the cached response is constructed from database records, which may have changed since the original successful response."*
  - **Shopify EXPLICITLY DISCLAIMS byte-identical replay.** The cached response is reconstructed from DB records, not stored as raw bytes. Field values can drift between original and replay if underlying records change.
  - Scope is GraphQL/JSON-only by definition (the `@idempotent` directive applies to mutations). No path for non-JSON.

## Findings

### F1 — Production idempotency middlewares are JSON-by-construction

Three independent surveyed sources (Brandur reference impl, Stripe docs, Shopify docs) ship idempotency middleware that ASSUMES JSON responses. None of them have a path for non-JSON original responses:

- Brandur stores response in JSONB column + JSON.generate's on replay. Non-JSON content cannot be stored as native JSONB.
- Stripe's API surface is JSON-only by product contract; the question doesn't surface.
- Shopify's `@idempotent` directive applies to GraphQL mutations; non-JSON is excluded by scope.

**The "what should we do for non-JSON replay?" question does not have a production-cited answer because production teams do not allow non-JSON behind idempotency middleware.** This is convergent evidence (3/3 surveyed) — the JSON-by-construction posture is the implicit industry standard for idempotency middleware in payment / e-commerce / web-API space.

### F2 — IETF draft delegates response-format details to the implementation

IETF draft 07 §2.6 says SHOULD-respond-with-the-result; offers no normative guidance on byte-identity, Content-Type preservation, or non-JSON handling. The spec is intentionally implementation-agnostic on these details. **There is no IETF-anchored requirement that BokChoy could be measured against.** Any pick is conformant.

### F3 — Shopify's explicit non-byte-identity caveat is the most-aligned production model

Shopify is the only surveyed source that explicitly addresses replay-fidelity, and they DISCLAIM byte-identity: *"the cached response may not be the same as the original one, as the cached response is constructed from database records, which may have changed."* This is a STRONGER position than BokChoy's current null-fallback for non-JSON — Shopify's cached response can differ ARBITRARILY from the original in field values, not just be null when un-parseable. **Shopify's design treats replay as "best-effort reconstruction," not "verbatim playback."**

This reframes BokChoy's question. Pinning JSON-by-construction as the contract puts BokChoy STRICTER than Shopify (verbatim-playback-of-JSON-bodies, not reconstructed-from-DB). The current code's null-on-non-JSON fallback is conservative; Shopify wouldn't even guarantee that on the JSON path.

### F4 — BokChoy's current code is structurally aligned with the production posture

`apps/backend/src/idempotency/middleware.ts:266-273` already does the JSON-by-construction posture: try-parse, store null on failure, replay null on retry. Wallet handlers (slice 8.1c) all return JSON; error-middleware (slice 8.1c) returns JSON; idempotency middleware itself returns JSON. **Zero non-JSON handlers exist in the slice 8.1.x cluster.** The null-fallback is defense-in-depth against future violation, not a designed-for behavior.

## Conflicts

**No production-cited disagreement was found.** The conflict candidate (Shopify's reconstruct-from-DB vs Brandur's JSONB-store-and-replay) is at a different axis (reconstruct-vs-replay) than the (c1) question (what-to-do-with-non-JSON). Neither model surfaces a non-JSON path; both are JSON-only by construction.

The closest thing to a contradiction is the IETF draft's silence — it neither endorses nor forbids non-JSON support. Per *Contradiction protocol* (production code > docs > inference), the production code's JSON-by-construction posture wins over the spec's silence.

## Conditions

The findings hold under:

- **Idempotency middleware as a generic cross-cutting layer** between auth and business handlers. If the middleware ships per-handler, with explicit knowledge of the handler's response shape, the JSON-by-construction assumption could be relaxed per-handler (e.g., a binary-streaming endpoint with bespoke replay).
- **Postgres JSONB as the storage column.** If a future schema migration moves to BYTEA + Content-Type, the JSON-by-construction storage assumption falls away. (Production-cited cost: column migration + storage growth + replay-encoding choice.)
- **No streaming responses.** If a future handler streams (chunked transfer encoding, SSE, large file download), the cached-response model itself is wrong — there's no atomic "response body" to cache. Different problem class.

The findings break if:

- **A future BokChoy handler legitimately needs to emit non-JSON** (HTML email preview endpoint, binary file download with idempotent retry, cockpit-rendered server-side component). At that point, the JSON-by-construction contract is violated and the design must reopen with the new use case named.
- **A new production reference surfaces** with documented non-JSON idempotency replay handling (e.g., a future AWS API doc, a Vercel post-mortem, etc.). Sample size at this research session was 3 surveyed sources; expanding could surface a counter-example.

## Operational implications

For /design:

### Position space (per F1+F2+F3+F4)

- **(α) Pin JSON-by-construction as the contract.** Document: "Handlers behind `idempotencyMiddleware` MUST emit JSON. Non-JSON emission is undefined behavior; current code falls back to null body for defense-in-depth (does not crash), but the contract does not promise replay fidelity in that case." Production-cited × 3 (Brandur + Stripe + Shopify all assume JSON-by-construction). **Lowest cost, matches surveyed posture, walks back nothing.**
- **(β) Cache raw bytes alongside Content-Type** — schema migration (added `response_body_raw BYTEA` + `response_content_type TEXT` columns), storage cost (raw bytes), encoding decisions. Production-cited: ZERO surveyed systems. Phantom-problem solution per CLAUDE.md YAGNI; no current consumer; no future consumer named.
- **(γ) Refuse to cache (skip silently OR error to caller) when handler emits non-JSON** — forcing function for the JSON-by-construction contract. Production-cited: zero. Adds an error class for handlers that violate; complicates the middleware.
- **(δ) Match Shopify's "best-effort reconstruction" model** — explicitly DOCUMENT that replay may differ from original (similar to Shopify's caveat). Trade-off: BokChoy's current code stores the JSON-encoded response verbatim (NOT reconstructed from DB), so this would be a documentation-only change matching the actual stronger guarantee. Distinct from (α) only in framing.

### Recommended /design framing

**(α) is now production-cited × 3.** /research seat surfaces this; /design weighs and decides. The previously walked-back (α) recommendation is now defensible: the gate that failed was "≥2 named systems shipping the specific shape" — F1 finds 3 systems shipping the JSON-by-construction posture. Pin it.

If /design picks anything other than (α), the rejected-alternative section must explicitly defend why the current production posture is wrong for BokChoy specifically.

## Reproducibility note

Reproducible. Same investigator with the same questions can:

1. `git clone --depth 1 https://github.com/brandur/rocket-rides-atomic /tmp/x && grep -n 'response\|json' /tmp/x/api.rb /tmp/x/schema.sql` — surfaces F1.
2. `WebFetch https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/` (or the html alternate at `www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.html`) + read §2.6 — surfaces F2.
3. `WebFetch https://docs.stripe.com/api/idempotent_requests` — surfaces F3 partial.
4. `WebFetch https://shopify.dev/docs/api/usage/implementing-idempotency` — surfaces F3 fully.

Judgment-load-bearing claim: F1's "JSON-by-construction is convergent" inference rests on 3 surveyed sources. A larger sample (5+) might surface a non-JSON outlier. /research budget for a wire-shape decision (default per primitive) was met; expanding to 5+ is overkill at MVP scale.

## Open threads

- **Hono / Express / Fastify TS-stack idempotency middleware survey** — not done in this session. If any TS-stack production middleware ships non-JSON handling, it's a counter-example. Low priority — surveyed payment/e-commerce production references are tier-1 evidence; TS-stack OSS middleware is typically tier-4-5 (named-author blog or unmaintained).
- **AWS / Google Cloud / Azure idempotency-on-non-JSON survey** — out of scope this session. AWS APIs include non-JSON paths (S3 binary, Lambda streaming); whether their idempotency-token semantics handle non-JSON is a real question for an idempotency-design /research session at larger budget.
- **Future BokChoy non-JSON handler** — if a handler legitimately needs non-JSON behind idempotency (cockpit SSR, file downloads, etc.), this research entry's findings must be revisited. Trigger condition: any new handler in `apps/backend/src/` that returns a non-JSON Content-Type.
