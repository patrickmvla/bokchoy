---
type: research
features: [wallet, http-contract, error-envelope]
related: ["[[wallet-http-contract]]", "[[wrapper-shape]]", "[[wallet-mechanics]]", "[[http-contract-research]]"]
created: 2026-05-11
confidence: high
provisional: false
---

# How do production payment-API error envelopes serialize numeric error detail fields (insufficient-funds amounts, balance, etc.) — JSON number, JSON string, or absent?

## Question

`apps/backend/src/infra/error-middleware.ts` currently emits BC010 InsufficientFunds errors with inline numeric detail fields as JSON strings: `{ "error": { "code": "BC010", "message": "...", "walletId": "...", "requested": "999", "available": "30.0000" } }`. The string typing came from `[[wrapper-shape]]` lines 76-79 (`requested: string; available: string`); the entry's *Reasoning* section never defends WHY string vs number — the typing is inherited from postgres-js's default `NUMERIC → string` mapping + regex-parsing of RAISE EXCEPTION text.

State.md framed this as "per `[[wrapper-shape]]` Postgres-numeric-precision-preserving pick" but the framing is **retrofit** — no precision-preservation prose exists in `[[wrapper-shape]]`. /design seat 2026-05-11 attempted to canonicalize (α) "keep strings, document as contract" via Stripe `unit_amount_decimal: string` precedent; the cite was class-mismatched (input/output amount field, not error detail field) and the position was walked back per the design primitive's industry-standard gate.

This research entry surveys what production API error envelopes actually do with numeric detail fields.

## Triangulation

- **Production reference:** ✓ — Stripe error envelope schema (`docs.stripe.com/api/errors`) + Stripe `card_declined` example (`docs.stripe.com/declines`); Square error schema (`developer.squareup.com/docs/build-basics/handling-errors` + Square Payments INSUFFICIENT_FUNDS example); PayPal error schema (`developer.paypal.com/api/rest/responses/`). All observed 2026-05-11.
- **Docs reference:** ✓ — RFC 7807 + RFC 9457 (`rfc-editor.org/rfc/rfc7807.html`) Problem Details for HTTP APIs; canonical IETF spec for HTTP error envelope shape.
- **Contradiction probe:** ✓ — actively searched for non-payment production REST APIs that DO ship inline numeric fields in error envelopes. Found RFC 7807/9457 spec which **EXPLICITLY supports + exemplifies inline numeric error fields as JSON NUMBER** (`balance: 30` in canonical example). This is a real disagreement: payment APIs do it one way, IETF spec defines another.

## Sources examined

### S1 — Stripe error envelope (`docs.stripe.com/api/errors`)

- **Tier:** 2 (current official docs)
- **Provenance:** `docs.stripe.com/api/errors`, observed 2026-05-11.
- **Author context:** Stripe API docs team; canonical reference for the most-cited production payment API error shape (production-cited × 4 in `[[http-contract-research]]`).
- **What it tells us:**
  - Top-level `error` object schema attributes are ALL strings, objects, or enums — NO numeric fields:
    - `advice_code` (string), `code` (string), `decline_code` (string), `message` (string), `network_advice_code` (string), `network_decline_code` (string), `param` (string), `type` (enum string), `doc_url` (string), `request_log_url` (string)
  - Nested `payment_intent`/`payment_method`/`source` objects DO carry numeric values (e.g., `payment_intent.amount: number`), but those are not "error detail fields" — they're full resource object embeds.
  - **NO `_decimal` suffix fields in the error schema.** Stripe's `_decimal` convention is for resource amount fields (e.g., `Stripe.Subscription.unit_amount_decimal: string`), not error detail fields.

### S2 — Stripe `card_declined` example (`docs.stripe.com/declines`)

- **Tier:** 2 (current official docs)
- **Provenance:** `docs.stripe.com/declines`, observed 2026-05-11.
- **What it tells us:**
  - Canonical `insufficient_funds` decline maps to `{ error: { code: "card_declined", decline_code: "insufficient_funds", message: "...", type: "card_error" } }`. **Zero numeric fields.** No `requested_amount`, no `available_balance`, no `attempted` — only categorical strings.
  - `outcome` object on the Charge resource carries decline metadata: `{ network_decline_code: "54", network_advice_code: "03", network_status: "declined_by_network", reason: "expired_card", advice_code: "confirm_card_data", risk_level: "normal", seller_message: "...", type: "issuer_declined" }` — **all strings/enums.** Even the network decline code (`"54"`) is a string-typed enum (network protocol field), not a numeric.
  - Verbatim docs claim: *"When issuers provide specific explanations, such as an incorrect card number or low funds, these explanations return to Stripe as network decline codes."* **Stripe abstracts low-funds details to a categorical decline_code; never surfaces requested-vs-available numerics in the error.**

### S3 — Square error envelope (`developer.squareup.com/docs/build-basics/handling-errors`)

- **Tier:** 2 (current official docs)
- **Provenance:** `developer.squareup.com/docs/build-basics/handling-errors` + Square Payments INSUFFICIENT_FUNDS error example (surfaced via web search 2026-05-11).
- **Author context:** Square developer docs team; production payment API.
- **What it tells us:**
  - Error object schema: `{ category: string, code: string, detail?: string, field?: string }`. **Strings only — zero numeric fields.**
  - Square INSUFFICIENT_FUNDS example: `{ "errors": [{ "code": "INSUFFICIENT_FUNDS", "detail": "Gift card does not have sufficient balance for requested amount.", "category": "PAYMENT_METHOD_ERROR" }] }` — **the amount-context lives in the `detail` STRING, not as a structured numeric field.**
  - Top-level shape is an `errors[]` array (multiple errors per response possible), not Stripe's single-`error` object.

### S4 — PayPal error envelope (`developer.paypal.com/api/rest/responses/`)

- **Tier:** 2 (current official docs)
- **Provenance:** `developer.paypal.com/api/rest/responses/`, observed 2026-05-11.
- **What it tells us:**
  - Generic error response template names `field` + `value` only (string types). **No example error responses with monetary values are provided in the surveyed page.**
  - PayPal's `Money` object format (used in resource bodies) is `{ "currency_code": "USD", "value": "9.45" }` — value is STRING. But this is the resource shape, not error envelope.
  - Sample size for PayPal-in-error-envelope is thin; treat as confirming the pattern via absence rather than presence.

### S5 — RFC 7807 / RFC 9457 (Problem Details for HTTP APIs)

- **Tier:** 2 (IETF spec — RFC, normatively defined)
- **Provenance:** `rfc-editor.org/rfc/rfc7807.html` (RFC 7807, 2016) + RFC 9457 (2024 update); observed via web search 2026-05-11.
- **Author context:** IETF; canonical spec for HTTP API error envelope shape. NOT widely adopted in TS-native production per `[[http-contract-research]]` Source 13 (no major TS-native production API as adopter), but spec-cited.
- **What it tells us:**
  - **Canonical example FROM THE SPEC:**
    ```json
    {
      "type": "https://example.com/probs/out-of-credit",
      "title": "You do not have enough credit",
      "detail": "Your current balance is 30, but that costs 50.",
      "instance": "/account/12345/msgs/abc",
      "balance": 30,
      "accounts": ["/account/12345", "/account/67890"]
    }
    ```
  - **`balance: 30` is a JSON NUMBER.** The spec's primary example for an "out of credit" problem ships an inline numeric field as a JSON number, not string.
  - Spec verbatim: *"Problem type definitions MAY extend the problem details object with additional members. For example, an 'out of credit' problem defines two such extensions — 'balance' and 'accounts' to convey additional, problem-specific information."* — extensions are EXPLICITLY supported.
  - The RFC says nothing about NUMERIC vs STRING for extension members; the canonical example uses NUMBER.

### S6 — Brandur reference impl (cross-referenced from `[[idempotency-keys-schema-research]]` S1)

- **Tier:** 1 (production code, source-walked at HEAD on 2026-05-11)
- **Provenance:** `/tmp/bocek-ref-brandur-rocket-rides-atomic` shallow clone, files `api.rb` + `schema.sql`.
- **What it tells us:**
  - Brandur's `rocket-rides-atomic` doesn't ship a domain-specific error envelope (it's a teaching reference). Cannot use Brandur directly for this question; cited here only to note that the closest BokChoy-shaped production reference does NOT decide this for us.

## Findings

### F1 — Production payment APIs DO NOT ship inline numeric fields in error envelopes

Three independent surveyed sources (Stripe, Square, PayPal) ship error envelopes with **zero numeric fields at the top level.** All three abstract numeric-relevant errors (insufficient funds, low balance, invalid amount) to **categorical string codes** (Stripe's `decline_code: "insufficient_funds"`, Square's `code: "INSUFFICIENT_FUNDS"`).

When the customer needs the actual numeric values (current balance, requested amount), they must **refetch the related resource** (PaymentIntent, Charge, account state, etc.) — the error envelope tells them WHAT happened, not the numeric STATE that caused it.

This is convergent (3/3 surveyed payment APIs). **The "string vs number" debate for inline numeric error fields is moot in the production-payment-API frame — production teams do not have inline numeric error fields.** (Confidence: high.)

### F2 — IETF RFC 7807/9457 spec EXPLICITLY supports inline numeric error fields as JSON NUMBER

The Problem Details spec's canonical example for an "out of credit" problem ships `balance: 30` as a JSON NUMBER inline in the error body. Extension members (custom domain-specific fields) are EXPLICITLY supported by the spec. **The spec contradicts the payment-API convergent posture** — it provides a different idiom for the same use case.

(Production-cited adoption of RFC 7807 in TS-native systems is thin per `[[http-contract-research]]` Source 13. Spec-cited / high; production-cited / medium-low.)

### F3 — Three patterns coexist; BokChoy's current pattern matches none

| Pattern | Ships numerics in error envelope? | Format if shipped | Production-cited |
|---|---|---|---|
| Stripe / Square / PayPal | NO | n/a (categorical codes only; refetch related resource for numeric state) | × 3 (high) |
| RFC 7807 / 9457 | YES | JSON NUMBER (canonical spec example: `balance: 30`) | × 1 spec; × 0 named TS-native production adopter |
| BokChoy current | YES | JSON STRING (`requested: "999", available: "30.0000"`) | × 0 |

**BokChoy's current pattern (inline numeric error fields as JSON string) is bespoke** — neither matches the convergent payment-API pattern (no inline numerics) nor the IETF spec pattern (inline as number). The /design seat's previous (α) "keep strings, document as contract" recommendation cited Stripe's `unit_amount_decimal` precedent, but that's a RESOURCE-AMOUNT field, not an error detail field — class-mismatched.

### F4 — Stripe's NETWORK DECLINE CODE is the closest payment-API analog to BokChoy's BC010

The closest production-cited shape to BokChoy's `BC010 InsufficientFunds` is Stripe's `card_declined` + `decline_code: "insufficient_funds"`. Stripe's design surface:

- Error envelope: categorical only (`code: "card_declined"`, `decline_code: "insufficient_funds"`)
- Numeric state (requested charge amount, available balance): NOT in error envelope; available via the PaymentIntent resource refetch (`GET /v1/payment_intents/{id}`)
- Customer SDK ergonomics: SDK code dispatches on `decline_code` enum; no parseFloat / decimal-handling needed at error path

**Stripe's posture optimizes for: (a) error envelope shape stable across all error types (no per-error-code field schema); (b) numeric state always reflects CURRENT (refetched), not error-time-snapshot; (c) error display doesn't require numeric formatting/precision discipline at the SDK boundary.**

BokChoy's posture optimizes for: (a) one-shot error display without extra fetch; (b) error-time-snapshot of state (debug-friendly); (c) per-error-code custom fields. **Both are defensible; BokChoy's is bespoke.**

### F5 — Customer-SDK ergonomic survey (low-budget)

The /design seat's question of "C# / Unity / C++ / Unreal preference for receiving error fields as `JsonNumber` / `decimal` / `string`" was not exhausted at this research budget. Brief probe:

- **C# / Unity** — `System.Text.Json` parses JSON number → `double`/`decimal` based on declared property type; parses JSON string → `string` requiring explicit `decimal.Parse`. Number-to-decimal at deserialization is the ergonomic default; string requires extra step.
- **C++ / Unreal** — typically uses `nlohmann/json` or RapidJSON; both parse JSON number directly to numeric types. String requires explicit `std::stod` / `std::stof`.
- **TS** — JSON number → `number` (with safe-integer cap concerns past 2^53); JSON string → `string` (with `parseFloat` if numeric needed).

**SDK-side ergonomics favor JSON NUMBER for typical-precision numerics; favor STRING when precision past 2^53 matters.** BokChoy's wallet `amount` is capped at MAX_SAFE_INTEGER per `[[wallet-http-contract]]` G1 (request body); the response symmetry argument favors NUMBER. But the database schema is NUMERIC(20,4) — over-provisioned past safe-integer for future real-money cashout.

(Confidence: medium — single-source-per-language survey; could be deepened with actual TS / C# / C++ JSON-deserialization-of-error-fields source-walks.)

## Conflicts

### Conflict 1 — Payment APIs (no inline numerics) vs RFC 7807 spec (inline numerics as NUMBER)

Both are tier-2 docs-cited. Payment APIs are production-cited × 3 with convergent posture; RFC 7807 is spec-cited × 1 with low TS-native production adoption.

Per *Contradiction protocol* (multiple independent production examples beat one): payment-API convergence wins on production-cited weight. But RFC 7807 is the IETF spec — it's the normative reference for HTTP API problem details, even if production adoption in TS-native space is thin.

**The contradiction is real and resolves to: pick which production lineage you align with.** Payment-API lineage = no inline numerics. IETF-spec lineage = inline numerics as NUMBER. BokChoy's current = inline numerics as STRING — aligns with neither.

### Conflict 2 — Stripe `unit_amount_decimal: string` (resource field) vs Stripe error envelope (no numerics)

The /design seat's prior (α) cite of `unit_amount_decimal: string` is class-mismatched. `unit_amount_decimal` is a RESOURCE FIELD on subscription items where decimal precision past 2^53 matters (e.g., $0.0001-per-API-call billing); it's intentionally string-typed for precision preservation. Stripe's ERROR envelope has no analog — there's no Stripe field that is "numeric error detail as string."

**The string typing for `requested`/`available` in BokChoy's BC010 cannot legitimately cite Stripe `_decimal` precedent. The cite was class-mismatched; the precedent is for a different field class.**

## Conditions

The findings hold under:

- **REST/JSON HTTP API context.** GraphQL error shapes (Shopify GraphQL `errors[]` array per spec) are different format constraints; not surveyed here.
- **Payment / financial / commerce API class.** Error envelope conventions in messaging APIs (Twilio, Slack), identity APIs (Auth0, Better Auth), or infra APIs (AWS, GCP) may differ — not surveyed at this research budget.
- **Customer SDKs in C# / Unreal / TS.** SDK-side ergonomic survey was low-budget; deeper survey could shift the (X)/(Y)/(Z) tradeoff.

The findings break if:

- **A future production payment API ships inline numeric error fields** (e.g., a PSP startup adopts RFC 9457 explicitly). Sample size at 3 surveyed; expanding could surface a counter-example.
- **BokChoy's wallet amounts ever exceed MAX_SAFE_INTEGER** (real-money cashout, micro-transaction aggregates, etc.). At that point JSON NUMBER fails on precision; STRING (or BigInt) becomes necessary — but the current STRING typing IS the precision-preserving choice. So the breakage condition is also the validation condition for keeping STRING.

## Operational implications

For /design — three pattern positions to weigh, NOT the (α)/(β)/(γ) string-vs-number frame the prior /design seat operated in:

### Position (X) — Stripe-style: drop inline numerics from error envelope; use categorical codes; client refetches related resource for numeric state

**What:** Change BC010 from `{ requested: "999", available: "30.0000" }` to `{ wallet_id, currency_id }` only. Customer SDK refetches `GET /v1/wallets/{walletId}` to get current balance for error display. BC022, BC050, etc. similarly stripped of numeric details.

**Wins when:** error envelope uniformity matters (same shape across all BCxxx codes); current-state-on-display is the right semantic (vs error-time-snapshot); production-cited × 3 (Stripe + Square + PayPal). **(production-cited × 3 / high.)**

**Cost:** extra round-trip on error path (customer makes second API call to fetch wallet for balance display). **For typical SDK use-case: error means user-facing error UI; one extra fetch is negligible.** For high-throughput error-rate-monitoring use-case: aggregate fetches add up; pre-aggregated metrics path doesn't need per-error refetch.

### Position (Y) — RFC 7807/9457 spec-aligned: inline numerics as JSON NUMBER

**What:** Change BC010 to `{ requested: 999, available: 30.0000, walletId: "..." }` (numeric NOT string). Walks back `[[wrapper-shape]]`'s string typing for `requested`/`available`. SDK-side parses as number directly.

**Wins when:** SDK ergonomics dominate (TS/C#/C++ deserialize NUMBER more cleanly than STRING-requiring-parse); IETF-spec compliance is a stated value; precision past 2^53 is not a concern.

**Cost:** **PRECISION RISK if database NUMERIC(20,4) values exceed 2^53.** `[[wallet-http-contract]]` G1 caps INPUT amounts at MAX_SAFE_INTEGER, but database column allows past it. If a wallet's accumulated balance ever crosses 2^53, BC010 errors silently lose precision (`Number("9999999999999999.0000")` → `10000000000000000`). The schema is deliberately over-provisioned vs JS Number type — the precision risk is real, even if it doesn't bite at game-economy MVP scale.

**(spec-cited × 1; production-cited × 0 in TS-native space; precision-risk / medium.)**

### Position (Z) — BokChoy current: inline numerics as JSON STRING; explicitly defend the divergence

**What:** Keep BC010 as `{ requested: "999", available: "30.0000" }`. Vault explicit defense: precision-preservation via NUMERIC(20,4) text-form; deviation from payment-API convention is intentional (debug-friendly, no extra round-trip on error display); customer SDK ergonomic cost (one parse layer per numeric field) is bounded.

**Wins when:** debug-time error-state snapshot matters (error frozen at error-time, not refetch-time); precision-past-2^53 is a real concern for the schema; one-shot error display is a stated value; SDK-side parseFloat layer is acceptable.

**Cost:** bespoke shape — neither payment-API-cited nor RFC 7807-cited. Future maintainers must read the defense to understand WHY this differs from both production lineages.

**(production-cited × 0; spec-cited × 0 in this exact shape; defensible-on-bespoke / medium.)**

### Recommended /design framing

**The (α)/(β)/(γ) frame from the prior /design seat was operating in the wrong axis.** The real choice is (X) drop-inline-numerics vs (Y) inline-as-NUMBER vs (Z) inline-as-STRING-with-defense.

- (X) is production-cited × 3 + lowest implementation cost (current code stays; just strip the numeric fields). **Strongest production evidence.**
- (Y) is spec-cited × 1 + introduces precision risk + walks back `[[wrapper-shape]]`. **Spec lineage but precision tax.**
- (Z) is bespoke + explicitly defends divergence. **Defensible if (X)'s extra-round-trip cost is unacceptable AND precision-past-2^53 is real.**

/design weighs and chooses. Production-cited weight favors (X); ergonomic and operational arguments can defend (Y) or (Z).

## Reproducibility note

Reproducible. Same investigator with the same questions can:

1. `WebFetch https://docs.stripe.com/api/errors` + `WebFetch https://docs.stripe.com/declines` — surfaces F1 + F4 for Stripe.
2. `WebFetch https://developer.squareup.com/docs/build-basics/handling-errors` — surfaces F1 for Square.
3. `WebFetch https://developer.paypal.com/api/rest/responses/` — surfaces F1 partial for PayPal.
4. `WebFetch https://www.rfc-editor.org/rfc/rfc7807.html` (or web search "RFC 7807 problem details numeric example") — surfaces F2 with the canonical `balance: 30` example.

Judgment-load-bearing claim: F3's "BokChoy current matches none" is mechanical; payment-API survey at sample-size 3 is convergent. Customer-SDK ergonomic survey (F5) is single-source-per-language and could shift if deeper.

## Open threads

- **Customer-SDK ergonomic deeper survey** — does the C# / Unity ecosystem have a publicly-stated preference for NUMBER vs STRING in JSON error fields? `Newtonsoft.Json` vs `System.Text.Json` defaults? Same for C++ / Unreal `nlohmann/json` vs `RapidJSON`. Out of scope this session; queue for /research session if /design picks (Y) and the SDK-ergonomic cost-benefit becomes load-bearing.
- **Non-payment production REST API survey** — do Twilio / Slack / Auth0 ship inline numeric error fields? Sample size in this session was payment-API-only. If non-payment APIs converge differently, (Y) might gain production-cited weight outside the payment domain.
- **Stripe BAD_REQUEST validation error envelope** — does Stripe's 400 validation error ship the rejected numeric value inline? (The `param` field names which parameter failed; whether the value is echoed back was not surveyed.) This would be a closer analog to BC010 than `card_declined`.
- **`[[wrapper-shape]]` Fork 2 amendment** — if /design picks (X) or (Y), `[[wrapper-shape]]` lines 76-79 typing of `requested`/`available` as STRING needs an explicit walkback amendment. (X) drops them entirely; (Y) flips to number. Either way, the bespoke STRING typing requires a Fork 2 amendment.
- **Wire-shape backward compatibility** — slice 8.1c's smoke `/tmp/smoke-8-1c.sh` Test 7 currently asserts `"requested":"999"` (string). If /design picks (X) or (Y), the smoke must update + any out-of-band customer SDK in flight must coordinate. No customer SDK exists yet, so no real backward-compat tax — but the slice 8.1c smoke is the canonical witness of the current contract.
