---
type: research
features: [wallet, idempotency, architecture]
related: ["[[idempotency-strategy]]", "[[idempotency-strategy-research]]", "[[wallet-mechanics]]", "[[tenancy-ids-research]]"]
created: 2026-05-04
confidence: high
provisional: false
---

# What is the production-cited `idempotency_keys` table schema beyond Brandur, and how do production teams handle parameter-mismatch detection + locked_at semantics?

## Question

Q4 of the wallet gap-cluster /research queue. `[[idempotency-strategy]]` *Engineering substance applied* deferred the schema specifics: *"Schema specifics deferred to implementation."* `[[wallet-mechanics]]` §3 references `idempotency_key_id BIGINT NULL REFERENCES idempotency_keys(id)` — the FK exists; the target table's full schema does not.

Specific sub-questions:
1. **Full column set** for BokChoy beyond Brandur's reference impl (`[[idempotency-strategy-research]]` S10).
2. **Parameter-mismatch detection mechanism** — request_params JSONB (Brandur shape) vs body-hash (Shopify "fingerprint" shape) vs other.
3. **`locked_at` semantics** — DEFAULT now() (Brandur) vs NULL-until-locked vs other.
4. **Response-replay column set** — what's stored to replay the original response on duplicate-key hit.

## Triangulation

- **Production reference:** ✓ — Brandur `rocket-rides-atomic@94b370d` schema (tier 1, already source-walked in `[[idempotency-strategy-research]]` S10); `stripe/stripe-node@42384847` `src/RequestSender.ts` lines 240–360 (tier 1, source-walked in this entry for SDK retry behavior).
- **Docs reference:** ✓ — Shopify `shopify.dev/docs/api/usage/implementing-idempotency` (tier 2, fingerprinting + error codes + 24h TTL — observed 2026-05-04 via WebFetch); IETF draft 07 `Idempotency-Key` header (tier 2, status code split — already cited in `[[idempotency-strategy]]`).
- **Contradiction probe:** ✓ — searched for published critique of `locked_at DEFAULT now()` Brandur pattern; surveyed Brandur's own follow-up post + Crunchy adaptation + HN discussion. No production-cited critique of the default-now() pattern surfaced; the shape is treated as canonical.

## Sources examined

### S1 — Brandur `rocket-rides-atomic` schema (cross-referenced from `[[idempotency-strategy-research]]` S10)

- **Tier:** 1 (production code, public repo, pinned commit, named author)
- **Provenance:** `github.com/brandur/rocket-rides-atomic`, commit `94b370ddbdc8d08fb263f07c221bab42190d48e6`. Schema in `schema.sql`. Author: Brandur Leach, Stripe-affiliated at original publication. Already cited.
- **What it tells us:**
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
  - `request_params JSONB NOT NULL` — full request body for parameter-mismatch detection.
  - `locked_at TIMESTAMPTZ DEFAULT now()` — every fresh row appears "in-flight"; application code distinguishes via `recovery_point` field.
  - 100-char cap on `idempotency_key`.
  - `recovery_point` for D2-β state-machine — D2-α drops this column per `[[idempotency-strategy]]`.
  - UNIQUE index scope: `(user_id, idempotency_key)` — BokChoy adapts to `(project_id, idempotency_key)`.

### S2 — `stripe/stripe-node` SDK retry behavior

- **Tier:** 1 (production code, public repo, pinned commit, Stripe-staff-authored)
- **Provenance:** `github.com/stripe/stripe-node`, commit `42384847a325d0e4daaf41d51d24693eaa1c408c` (2026-04-23). `src/RequestSender.ts` lines 240–360 (`_shouldRetry`, `_defaultIdempotencyKey`). Cloned + read linearly 2026-05-04.
- **Author context:** Stripe SDK team. Canonical client-side reference for Stripe's idempotency behavior; Stripe's server-side schema is private but SDK behavior implies server contract.
- **What it tells us:**
  - **HTTP 409 → SDK auto-retries** (line 282-284): `if (res.getStatusCode() === 409) { return true; }`. Confirms 409 reserved for transient/in-flight class. Same finding as `[[idempotency-strategy]]` *Why 422 for parameter-mismatch and 409 for in-flight* — pinned again at current SDK commit.
  - **`stripe-should-retry: false|true` response header** (lines 274-279) — Stripe's server can override retry decision per-response. Optional pattern; not currently in `[[idempotency-strategy]]` design but worth flagging.
  - **Default idempotency key generation** (lines 336-359): when user doesn't supply, SDK generates `stripe-node-retry-${uuid4()}` for POST (and v2 DELETE). Random UUIDv4 per retry-eligible request.
  - **Exponential backoff with jitter** (lines 298-326): initial delay × 2^numRetries, capped at maxNetworkRetryDelay, jittered to 50–100% of computed delay. Server can request specific delay via `Retry-After` header (capped at MAX_RETRY_AFTER_WAIT).
  - **Schema-shape not exposed.** Stripe's server-side `idempotency_keys` table structure is not published; SDK behavior implies the contract but doesn't reveal columns.

### S3 — Shopify implementing-idempotency docs

- **Tier:** 2 (current official documentation)
- **Provenance:** `shopify.dev/docs/api/usage/implementing-idempotency`, observed 2026-05-04 via WebFetch.
- **Author context:** Shopify API team, official platform docs.
- **What it tells us:**
  - **Parameter-mismatch detection: fingerprinting** — verbatim *"Shopify fingerprints each request's parameters"*. Mechanism unspecified (hash algorithm not disclosed); not full JSONB comparison. Different approach than Brandur.
  - **In-flight / concurrent-dup handling:** verbatim *"Shopify returns `IDEMPOTENCY_CONCURRENT_REQUEST` to subsequent requests instead of processing them"*; client recommendation: *"Wait briefly (exponential backoff recommended) and retry with the same idempotency key."*
  - **TTL: 24 hours.** Verbatim: *"Shopify tracks idempotency keys for 24 hours from the original request."* Post-expiry: keys treated as new requests, no idempotency protection.
  - **Error codes (distinct):** `IDEMPOTENCY_CONCURRENT_REQUEST` (in-flight) and `IDEMPOTENCY_KEY_PARAMETER_MISMATCH` (same key, different body). HTTP status differentiation not in the public doc.
  - **Schema not disclosed.** Shopify's server-side table structure is private.

### S4 — IETF draft 07 (Idempotency-Key header) — already cited in `[[idempotency-strategy]]`

- **Tier:** 2 (IETF draft, expired but only normative reference)
- **Provenance:** `datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/`, version 07, last revised 2025-10-15.
- **What it tells us (already vaulted):**
  - 422 Unprocessable Content for parameter-mismatch.
  - 409 Conflict for in-flight.
  - Value as Structured Header String per RFC 8941.
  - Length cap: not normative, but Stripe's 255 is the production reference.

## Findings

### F1 — Brandur and Shopify ship different parameter-mismatch detection mechanisms; both are tier 1+2 production-cited

**Brandur:** stores full request body in `request_params JSONB NOT NULL`; comparison is JSONB equality (`request_params @> $new_body AND $new_body @> request_params` for exact match, or `request_params = $new_body` if Postgres canonicalizes JSONB key order — which it does at storage time per `jsonb` semantics).

**Shopify:** stores a fingerprint (hash); comparison is byte-equal hash comparison.

**Trade-offs:**
- **JSONB full-body** — exact, no canonicalization discipline required (Postgres `jsonb` storage canonicalizes key order). Storage: 200-byte average request body × 24h × ~3 writes/sec/project at indie ≈ ~50MB/day/project; ~1.5GB at retention. At Studio+ tier (~575 writes/sec/project) ≈ ~10GB/day/project. Bounded but real.
- **Body-hash** — fixed-size (32 bytes for SHA-256), tiny storage. Requires canonical-JSON serialization discipline at hash-time (different key orderings produce different hashes; client + server must agree on canonicalization). False-positive mismatch risk if canonicalization drifts. Stripe SDK doesn't publish hash details — implies they own both ends and canonicalize internally.

For BokChoy: server is the only hashing party (clients send raw JSON; server hashes server-side after canonicalization). False-positive mismatch risk is contained to server-side canonicalization library version. **At BokChoy's MVP scale, JSONB storage cost is bounded ($1–5/month/project); at Studio+ tier it becomes meaningful (~10GB/day/project ≈ $50–100/month/project incremental).** /design picks; the BokChoy pick is conditional on retention window — keys expire at 24h per `[[idempotency-strategy]]`, so the storage delta is bounded by 24h × write rate, not unbounded.

### F2 — `locked_at DEFAULT now()` Brandur pattern survives the contradiction probe — no published critique surveyed

The `locked_at TIMESTAMPTZ DEFAULT now()` design has the property that every fresh row "appears in-flight" briefly. Application code distinguishes via the `recovery_point` field (or for D2-α: via `completed_at IS NOT NULL` or a `state TEXT` column). Cleaner alternative: `locked_at TIMESTAMPTZ NULL` with explicit lock acquisition.

**Surveyed:** Brandur's own follow-up posts (Crunchy adaptation, simple-internal-idempotency fragment) + HN discussion + Lars Gröber's Go translation post. **No production-cited critique of the default-now() pattern.** The shape is treated as canonical.

The default-now() vs NULL-until-locked is a stylistic choice with the same operational behavior — both work; choose what reads cleaner. **Recommendation lane (research surfaces, design picks):** NULL-until-locked is more self-documenting. Brandur's default-now() is canonical; the cleaner-alternative claim is inference, not production-cited.

### F3 — Idempotency-key TTL converges at 24h; Stripe says "at least 24h"; Shopify says "24h"; both compatible

Already vaulted in `[[idempotency-strategy]]` *Why 24h TTL*. Q4 reaffirms. Reaper job purges keys older than 24h.

### F4 — Stripe's `stripe-should-retry` response header is a production pattern not in current BokChoy design

Stripe's SDK respects `stripe-should-retry: false|true` response headers (S2 lines 274-279). Server controls retry-or-not on a per-response basis. Useful when server wants to short-circuit retries (e.g., terminal error class) or insist on retry (e.g., transient lock that will clear).

**Operational implication for BokChoy:** optional pattern. If BokChoy ever finds clients over-retrying on terminal errors, adding a `bokchoy-should-retry` header would let the server signal. Not in current MVP scope; vault as future-option.

### F5 — Stripe SDK auto-generates idempotency key per retry-eligible POST when user doesn't supply

S2 lines 336-359: SDK injects `stripe-node-retry-${uuid4()}` for POST (v1 + maxRetries>0) or POST/DELETE (v2). This is **client-side safety net** — the user doesn't have to think about idempotency keys; the SDK handles it.

**Operational implication for BokChoy SDK:** match the pattern. BokChoy's TS SDK should auto-generate idempotency keys for mutating endpoints when the caller doesn't supply one, per `[[idempotency-strategy]]` *Engineering substance applied*'s commitment to *"hybrid keys (server-derived natural + client-supplied header)"*. The auto-generation goes in the SDK's request layer; format is `bokchoy-sdk-retry-${uuid4()}` (or similar — namespace it so it's distinguishable in logs).

### F6 — BokChoy `idempotency_keys` schema synthesis

Combining Brandur's structural template + BokChoy-specific adaptations from prior decisions:

```sql
CREATE TABLE idempotency_keys (
  id                  BIGSERIAL    PRIMARY KEY,
  project_id          UUID         NOT NULL,                        -- Q1+Q2 resolution
  idempotency_key     TEXT         NOT NULL CHECK (char_length(idempotency_key) <= 255),  -- Stripe-match cap per [[idempotency-strategy]]
  request_method      TEXT         NOT NULL,                         -- 'POST'/'PUT'/'DELETE'
  request_path        TEXT         NOT NULL,                         -- '/v1/wallets/credit', etc.
  request_params      JSONB        NOT NULL,                         -- F1 trade-off: JSONB chosen below
  response_status     INTEGER      NULL,                             -- HTTP status of original response
  response_body       JSONB        NULL,                             -- replay-on-dup payload
  locked_at           TIMESTAMPTZ  NULL,                             -- F2 trade-off: NULL-until-locked chosen below
  completed_at        TIMESTAMPTZ  NULL,                             -- non-NULL when terminal response stored
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, idempotency_key)
);

CREATE INDEX idx_idempotency_keys_reaper
  ON idempotency_keys (created_at)
  WHERE completed_at IS NOT NULL;  -- supports 24h reaper sweep
```

**Choices made in synthesis (subject to /design confirmation):**
1. `request_params JSONB NOT NULL` (Brandur shape) over body-hash. Rationale: storage cost is bounded by 24h TTL × write rate (~50MB/day/project at indie tier; meaningful but acceptable at Studio+); avoids canonical-JSON discipline cost; exact equality via Postgres `jsonb`.
2. `locked_at TIMESTAMPTZ NULL` (NULL-until-locked) over Brandur's DEFAULT now(). Self-documenting at the column level; one fewer thing to explain to readers.
3. `completed_at TIMESTAMPTZ NULL` separate from `locked_at`. Brandur uses `recovery_point TEXT` to track state; D2-α drops recovery_point; `completed_at` is the simplest substitute (state derivable: `completed_at IS NULL AND locked_at IS NOT NULL` = in-flight; `completed_at IS NOT NULL` = done).
4. **No `recovery_point` column** per `[[idempotency-strategy]]` D2-α explicitly (preserved as future per-endpoint column-add if any future endpoint needs D2-β).
5. Reaper job: `DELETE FROM idempotency_keys WHERE completed_at IS NOT NULL AND created_at < NOW() - INTERVAL '24 hours'`. Run hourly via pg_cron or staged_jobs queue.

### F7 — Function-body idempotency-check shape (forward-cite to `[[wallet-functions-research]]` template)

Per `[[wallet-functions-research]]` *Operational implications* function-body template, the idempotency check inside `wallet_credit/wallet_debit` is two-path:

- **Server-derived natural key (default for wallet credit/debit):** lookup on `transactions(wallet_id, source_event_id)` UNIQUE — no `idempotency_keys` row needed for this path. The transactions row IS the idempotency record co-located with business state, per `[[idempotency-strategy]]` D2-α.
- **Client-supplied `Idempotency-Key` header (designer-initiated mutations):** lookup on `idempotency_keys(project_id, idempotency_key)` UNIQUE; if exists and `completed_at IS NOT NULL`, replay `response_body` + `response_status`; if exists and `locked_at IS NOT NULL AND completed_at IS NULL`, return 409 + `BC001 IdempotencyKeyInUse`; if exists with different `request_params`, return 422 + `BC002 IdempotencyKeyMismatch`; else INSERT row + lock + proceed.

Both paths converge at the `transactions` write — the wallet primitive's per-wallet UNIQUE constraint catches the server-derived path; the `idempotency_keys` table catches the client-supplied path.

`p_idempotency_key_id BIGINT NULL REFERENCES idempotency_keys(id)` per `[[wallet-mechanics]]` §3 is set when the client-supplied path is taken; NULL when the server-derived natural-key path is taken.

## Conflicts

### Conflict 1 — JSONB full-body (Brandur) vs fingerprint (Shopify)

Both are tier 1+2 production-cited. Per *Contradiction protocol*, multiple independent production examples beat one — neither is dominant. The contradiction is real; the resolution is project-conditional. F6 commits to JSONB on storage-cost-is-bounded-by-TTL grounds for BokChoy specifically; vault Shopify's fingerprint as rejected alternative with named winning condition (storage cost becomes load-bearing).

### Conflict 2 — `locked_at DEFAULT now()` (Brandur) vs NULL-until-locked

Brandur's pattern is canonical (no production critique surveyed); NULL-until-locked is the cleaner-alternative claim from inference. Both work. F6 commits to NULL-until-locked on self-documentation grounds. Not load-bearing.

## Conditions

The findings hold under:
- **Brandur reference at commit `94b370d`** (last activity 2022-12-01; stable since 2017 article).
- **Stripe SDK at commit `42384847`** (2026-04-23 stripe-node).
- **Shopify docs current as of 2026-05-04.**
- **24h TTL.** Reaper job runs hourly or via on-demand trigger; covers indie-tier write rates without queue depth issues.

The findings break if:
- A future Postgres release changes JSONB storage semantics (canonicalization, equality operators). Tracked via Postgres major-release watch.
- IETF draft 07 ratifies as RFC with materially different status code or scope semantics. Already noted as revisit-when in `[[idempotency-strategy]]`.

## Operational implications

For /design:

### Q4 (G5) RESOLVED

`idempotency_keys` schema baseline = F6 above. /design picks confirm or reject:
- F6.1 `request_params JSONB` (commit) vs body-hash (rejected with named winning condition).
- F6.2 `locked_at NULL-until-locked` (commit) vs Brandur DEFAULT now() (rejected on self-documentation grounds).
- F6.3 `completed_at TIMESTAMPTZ NULL` as state column (commit).
- F6.4 No `recovery_point` column (commit, per D2-α).
- F6.5 Hourly reaper, 24h TTL (commit, matches Shopify cite).

### Cascade obligations

- **Reaper job:** add to `staged_jobs` outbox or pg_cron schedule. Job kind = `idempotency_reaper` (extends current `[[wallet-mechanics]]` §4 staged_jobs CHECK). Frequency: hourly. Cascade: `[[wallet-mechanics]]` §4 staged_jobs CHECK constraint amends to add `'idempotency_reaper'`.
- **TS SDK auto-key generation:** match Stripe SDK pattern. Format: `bokchoy-sdk-retry-${uuid4()}`. Cascade to SDK package.
- **BC SQLSTATE convention:** BC001/BC002 already pinned in `[[wallet-mechanics]]` Amendment Part 1 A5. No additions needed for Q4.
- **Optional `bokchoy-should-retry` header:** vault as future-option per F4. Not blocking MVP.

## Reproducibility note

Reproducible: clone `brandur/rocket-rides-atomic` at commit `94b370d`, read `schema.sql`. Clone `stripe/stripe-node` at HEAD or `42384847`, read `src/RequestSender.ts:240-360`. Fetch `shopify.dev/docs/api/usage/implementing-idempotency`. The judgment-load-bearing claim is F1's storage-cost-bounded-by-TTL argument — another investigator with different storage-cost weighting could read fingerprinting (F1.alt) as the better default. Vault entry preserves both options.

## Open threads

- Shopify's fingerprinting algorithm is not publicly disclosed. If parameter-mismatch false-positive rate becomes a customer-facing issue, JSONB exact-equality wins; if storage cost becomes the dominant pain, fingerprinting is the migration path. Defer until evidence.
- Stripe's `stripe-should-retry` response header is a production pattern BokChoy could adopt later. No current MVP need; flagged as F4 for future revisit.
- Whether BokChoy's reaper should run via pg_cron extension (Postgres-native, requires extension install) or via the existing `staged_jobs` outbox worker (already committed in `[[wallet-mechanics]]`). Both work; staged_jobs is simpler (one mechanism for all background work). Defer to /implementation.
