---
type: decision
features: [mvp, architecture]
related: ["[[idempotency-strategy-research]]", "[[mvp-feature-sequence]]", "[[wedge-decision]]", "[[mobile-f2p-economy-math-research]]", "[[design-claims-register]]"]
created: 2026-05-01
confidence: high
supersedes: 2026-05-01 prior version (Redis hot-path + recovery-points; multiple unsourced citations)
---

# Idempotency strategy: hybrid keys (server-derived natural + client-supplied header), Postgres-only storage, per-step UNIQUE + outbox for multi-step ops

Resolves **CL-028** in `[[design-claims-register]]`. Cascades to every mutating API endpoint shipped from month 1 onward. This entry replaces the prior version after `[[idempotency-strategy-research]]` falsified multiple load-bearing citations and surfaced a simpler architecture.

## Decision

**Hybrid idempotency contract.** Every mutating API call enforces idempotency through one of two paths:

1. **Server-derived natural key** (default for endpoints with natural business identifiers): wallet credit/debit derives from `(wallet_id, source_event_id)`; loot rolls from `(player_id, banner_id, pull_session_id)`; IAP fulfillment from `receipt_hash`; inventory grant from `(player_id, source_event_id, item_id)`.
2. **Client-supplied `Idempotency-Key` header** (required for endpoints without natural identifiers — designer-initiated compensation grants, manual currency adjustments, mass mailbox sends).

**Wire shape.** Header `Idempotency-Key`, value ≤255 chars, charset = printable ASCII per RFC 8941 Structured Header String semantics. Match Stripe's length cap; charset is the IETF draft 07's framing of value-as-Structured-Header-String.

**Storage: Postgres-only.** Single `transactions` table (or per-feature equivalent) carries the idempotency record co-located with the business state change. UNIQUE constraint on `(project_id, idempotency_key)`; `locked_at TIMESTAMPTZ` column for in-flight signaling; reaper job purges keys older than 24h. **No Redis.** ACID guarantees in the same transaction as the business write; idempotency is correctness-critical, not latency-critical.

**HTTP status semantics.**
- Same key + same request body within TTL → original response replayed (status from original response).
- Same key + **different** request body within TTL → **HTTP 422** with error code `bokchoy_idempotency_key_mismatch`.
- Same key + **in-flight** (a concurrent request with same key currently being processed) → **HTTP 409** with error code `bokchoy_idempotency_key_in_use`.
- Same key after TTL → treated as new request (documented behavior; SDK docs surface this).

**Per-tenant isolation.** Keys scoped per `(project_id, idempotency_key)`. Two studios cannot collide; one studio's prod and dev environments cannot collide (different `project_id`s). Scope enforcement is server-side only — the SDK does not validate scope.

**Multi-step recovery (D2-α — per-step UNIQUE + outbox, no recovery-point state machine).** For multi-step operations (IAP fulfillment, loot rolls, multi-item inventory grants, etc.):

- **Every step's database write is independently idempotent via its own UNIQUE constraint** keyed on natural identifiers. Retry of the entire operation produces duplicate INSERTs that the per-step constraints catch.
- **Any non-deterministic step is made deterministic-on-request-key.** Specifically: loot-roll RNG seeds from `(player_id, banner_id, pull_session_id, attempt_number)` so retry produces the same outcome. Implementation specifics (PRF choice, seed-bytes derivation) deferred to `[[CL-031]]` server-authoritative loot decision.
- **External side effects use a transactional outbox table** (`staged_jobs` or equivalent) committed in the same Postgres transaction as the business state change. A relay worker consumes the outbox and dispatches at-least-once; consumers must be idempotent. Schema specifics deferred to `[[CL-029]]` event sourcing decision.

**No `recovery_point` column.** Per-step idempotency + deterministic-RNG-on-key is sufficient for BokChoy's MVP endpoints (no expensive non-idempotent steps). Migration to recovery-points (D2-β) is preserved as a per-endpoint upgrade if a future endpoint adds an expensive non-idempotent step (paid third-party API per call, etc.).

## Reasoning

### Why hybrid keys (server-derived + client-supplied)

Pure client-supplied (Stripe-style across-the-board) requires the client to generate keys for every operation, including dashboard-initiated mutations where the server is the originator. Forcing the dashboard to generate UUIDs and pass them to itself is a workaround.

Pure server-derived requires every endpoint to have a natural unique business identifier. Designer compensation grants are arbitrary by design (designer wants to grant 100 gems to player_id 42 right now, no natural correlation ID). Forcing a fake natural key is also a workaround.

Hybrid lets each endpoint pick the natural fit. Both paths land in the same Postgres storage; conflict semantics are identical. Single mental model.

(Production-cited per Stripe's canonical doc page allowing client-supplied keys for any POST; PayPal, Square, Shopify all ship variants of the same hybrid — see `[[idempotency-strategy-research]]` Findings F1.)

### Why Postgres-only (B7) instead of Redis hot-path + Postgres safety net

**Idempotency is correctness-critical, not latency-critical.** ACID guarantees in the same transaction as the business write are the load-bearing property: the dedup record and the wallet credit (or inventory grant, or loot inventory write) commit atomically, or both abort. Redis would gain ≤2ms/req latency at the cost of a permanent class of failure (Redis-cached response divergent from Postgres truth after a partial Redis recovery, cache invalidation under restart, etc.).

`[[idempotency-strategy-research]]` F12 quantified the latency savings: at indie tier (~3 peak writes/sec) Redis saves 3ms/sec across the entire fleet at peak — operationally meaningless. At Studio+ tier (~575 peak writes/sec) it saves ~1s/sec across the fleet — measurable but small, and per-request still <2ms. The "Redis is faster" argument is true but not at a scale that justifies a separate system.

Additionally per F10: **no named production system publishes a Redis + Postgres dual-storage idempotency architecture.** Brandur (the most cited Stripe-affiliated reference) describes Postgres-only with serializable transactions; Stripe, PayPal, Square, Shopify don't publish their internal architectures; Redis-blog tutorials describe Redis-as-deduplication but not the dual-storage safety-net pattern.

**Permanent commitment — even when Redis later joins the stack** (eventually for distributed rate limiting at Studio tier, per the human's stated migration plan), idempotency stays on Postgres. If at >10× current scale projections (~20M MAU, ~100M writes/day) the latency math flips, Redis can be added as an opportunistic cache layer in front of the Postgres truth — but Postgres remains source of truth.

(Production-cited: Brandur reference impl `github.com/brandur/rocket-rides-atomic@94b370d`, schema.sql confirms Postgres-only via the `idempotency_keys` table with `locked_at` column; AWS Prescriptive Guidance + microservices.io confirm outbox pattern as the correct way to combine Postgres state with external side effects. Confidence: high.)

### Why 24h TTL

Shopify's idempotency documentation (`shopify.dev/docs/api/usage/implementing-idempotency`, observed 2026-05-01) states explicitly: *"Shopify tracks idempotency keys for 24 hours from the original request."* Stripe's canonical doc states *"at least 24 hours"* — compatible with a 24h floor. Mobile retry windows are minutes-to-hours; beyond 24h the player's session has long ended and a retry is functionally a new request.

(Docs-cited: Shopify documentation; production-cited: Stripe canonical page. Confidence: high.)

### Why 422 for parameter-mismatch and 409 for in-flight

Stripe's own SDK auto-retries on HTTP 409 (`stripe-node@42384847` / `src/RequestSender.ts:329-332`: `if (res.getStatusCode() === 409) { return true; }`). This is structurally incompatible with Stripe's server returning 409 for parameter-mismatch (a permanent error would loop forever). Stripe must therefore reserve 409 for the in-flight (transient) case, and use a different status code for parameter-mismatch.

The IETF draft `Idempotency-Key` header field, version 07 (`datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/`, last revised 2025-10-15, expired but the only normative reference) recommends:
- **422 Unprocessable Content** for "the resource SHOULD reply with a HTTP 422 status code" when the same key is reused with different parameters.
- **409 Conflict** for "a request with the same Idempotency-Key for the same operation is being processed or is outstanding."

Adopt the IETF split. It's structurally consistent with how Stripe's SDK behaves and is the only normative source on the question.

(Production-cited: Stripe SDK retry behavior in `RequestSender.ts:329-332` at pinned commit; docs-cited: IETF draft 07 §6 status code recommendations. Confidence: high.)

### Why bokchoy-prefixed error codes (not Stripe-match)

Codes are `bokchoy_idempotency_key_mismatch` and `bokchoy_idempotency_key_in_use`. The names are Stripe-inspired (Stripe ships `idempotency_key_in_use`) but namespace-prefixed to BokChoy. Reason: avoid implicit semantic coupling. If BokChoy's mismatch or in-flight semantics ever diverge from Stripe's (response body shape, retry-after guidance, etc.), Stripe-named codes would silently mislead designers integrating with both. Owning the namespace from day 1 means BokChoy's docs define BokChoy's semantics; Stripe-style is an inspiration, not a contract.

(Decision: own the namespace. Confidence: high.)

### Why D2-α (per-step idempotency + outbox) instead of D2-β (recovery-points) or D2-deferral

D2-α is the simplest correct pattern for BokChoy's MVP endpoints. All four multi-step endpoints (wallet credit/debit, IAP fulfillment, loot roll, inventory grant) decompose into 1–4 steps where:

- **Wallet credit/debit:** UNIQUE on `transactions(wallet_id, source_event_id)`. Retry produces a duplicate INSERT caught by the constraint.
- **IAP fulfillment:** UNIQUE on `(receipt_id)` for transaction record + `(user_id, sku, receipt_id)` for inventory grant. Apple/Google receipt validation is externally idempotent (same receipt → same response). Retry re-runs four steps; constraints catch each duplicate.
- **Loot roll:** RNG made deterministic by seeding from `(player_id, banner_id, pull_session_id, attempt_number)`. Once RNG is idempotent-on-key, the rest is per-step UNIQUE.
- **Inventory grant:** UNIQUE on `(player_id, source_event_id, item_id)`.

D2-β (Brandur's full recovery-point state machine) wins when an operation has expensive non-idempotent steps — e.g., charging Stripe per-call (Brandur's actual case in Rocket Rides). BokChoy's MVP has no such steps. D2-β's optimization (skip already-completed steps on retry) saves nothing meaningful here; the cost it adds (a `recovery_point` column, per-endpoint state-machine constants, more test surface) is real.

D2-deferral (defer multi-step to CL-031) is falsified by `[[idempotency-strategy-research]]` F13: the recovery_point/per-step-key decision is co-located on the idempotency table schema. Deferring still costs a future schema migration. And `[[mvp-feature-sequence]]` line 17 already commits to multi-step IAP and loot rolls in months 1–3 — the gap is live in MVP, not later.

The transactional outbox is required separately and used regardless of D2-α/β. Any endpoint that fires external side effects (mailbox push, webhook, third-party API) writes to `staged_jobs` (or equivalent) inside the same Postgres transaction as the business state change. A relay worker consumes the outbox and delivers at-least-once.

**Migration path D2-α → D2-β preserved per-endpoint:** if a future endpoint adds an expensive non-idempotent step, that endpoint individually can adopt recovery-points. `ALTER TABLE transactions ADD COLUMN recovery_point TEXT NULL;` plus a state-machine refactor of just that endpoint. Other endpoints stay on D2-α. The taxonomy stays scoped.

(Production-cited: `brandur/rocket-rides-atomic@94b370d` schema.sql + api.rb confirms the recovery-point pattern at tier 1; AWS Prescriptive Guidance + microservices.io confirm outbox pattern at tier 2. Brandur's 2017 blog explicitly frames recovery-points as "more elaborate than necessary for many cases." Confidence: high.)

### Why per-`(project_id, idempotency_key)` scoping

Two studios on BokChoy could pick the same idempotency key by chance (UUID collisions are rare but nonzero; or both happen to use `purchase_id_42`). Without per-tenant scoping, one studio's request could return another studio's response. Catastrophic privacy + correctness failure. Scoping eliminates the entire class of bugs.

Stripe scopes idempotency in practice (the SDK at `RequestSender.ts` sends `Stripe-Account` alongside `Idempotency-Key`; scope is enforced server-side). The Stripe canonical doc page does not address scope explicitly, so the inference is from SDK behavior, not direct documentation.

(Inferred from Stripe SDK code; confidence: medium on the Stripe side, high on the BokChoy side because the privacy argument is independently load-bearing.)

## Engineering substance applied

System-shaped decision; touches wallet, inventory, catalog mutations, shop, IAP, loot, segment-evaluation triggers, offer redemption, mailbox sends, designer-initiated dashboard mutations.

- **Consistency:** SERIALIZABLE isolation on wallet credit/debit per the broader §12.2 carry-over. Idempotency check is *inside* the same transaction as the mutation: SELECT for `(project_id, idempotency_key)`; if exists and finished, return prior result; if exists and `locked_at` within timeout, return 409 in-flight; else INSERT (with row lock) and run business logic. Atomicity of check + insert + business write is the load-bearing property.
- **Failure semantics:** at-least-once delivery from client (mobile, lossy network), exactly-once observable behavior from server. 24h TTL is the documented contract — beyond it, retry is a new request. Network partition during operation: the Postgres UNIQUE constraint protects against double-write because both the dedup record and the business write are in the same transaction; partial commit is impossible.
- **Concurrency:** two requests with the same key arriving milliseconds apart: the first to acquire the row lock proceeds; the second sees `locked_at` recent and returns 409 with `bokchoy_idempotency_key_in_use`. Lock timeout is configurable (initial value 30 seconds); after timeout, a stuck row is treated as recoverable and re-locked. **No 5-second client-wait pattern** — the prior version's "wait up to 5 seconds then return 409" was unsourced and added unnecessary client-side complexity.
- **Observability:** every idempotency-cache hit is logged with `idempotency_key, original_response_at, age_seconds, scope=(project_id)`. Page-able alert: `bokchoy_idempotency_key_in_use` rate > 1% over 5min (signals a client implementation bug — clients should not be sending parallel duplicate requests). Runbook entry: `[[runbook-idempotency]]` (to be written in implementation phase).
- **Storage:** Postgres single instance for MVP per `[[mvp-feature-sequence]]`. `idempotency` records may live on the `transactions` table (idempotency-record-as-business-record co-location, Brandur pattern) or in a separate `idempotency_keys` table — schema specifics deferred to implementation but the UNIQUE constraint on `(project_id, idempotency_key)` is non-negotiable.
- **Adversarial input:** malicious client sends 1M unique idempotency keys to fill Postgres. Mitigation: per-API-key rate limit on accepting unique idempotency keys (10K unique keys per hour per API key) — initial implementation as in-process token bucket; promote to distributed (Redis or Postgres advisory locks) when distributed rate limiting becomes load-bearing at Studio tier.
- **Networking:** `Idempotency-Key` header per IETF draft 07 naming. Length cap 255 chars matching Stripe. Charset printable ASCII per RFC 8941 Structured Header String. The header sits alongside `Authorization` (project API key) and `BokChoy-Project-Id` (explicit project scope, redundant with auth in normal use, used for diagnostic clarity and forward compat).
- **Security:** keys scoped per-`(project_id, idempotency_key)`. Two studios cannot collide. Keys per-environment (dev / staging / prod) via separate API keys per environment, which map to separate `project_id`s.

## Production-grade gates

- **Idiomatic to *this* stack, *this* version, *this* year.** Postgres-backed idempotency-key table with UNIQUE constraint and `locked_at` lock timeout is the canonical 2026 pattern for B2B APIs handling mutations on Postgres-primary stacks. Deterministic-RNG-on-request-key is the canonical 2026 pattern for idempotent-by-design random generation in game backends. Outbox pattern via in-DB queue table is the canonical 2026 pattern for atomic-state-plus-side-effect. **Production-cited high.**

- **Industry-standard for the problem class.** ≥2 named production references with provenance:
  - **Brandur reference implementation** at `github.com/brandur/rocket-rides-atomic@94b370d` — Postgres-only idempotency with `locked_at` and per-row state, schema verbatim in `schema.sql`. Co-published with the canonical 2017 article at `brandur.org/idempotency-keys`.
  - **Shopify** at `shopify.dev/docs/api/usage/implementing-idempotency` — explicit 24h TTL, distinct error codes for parameter-mismatch vs. concurrent-request (`IDEMPOTENCY_KEY_PARAMETER_MISMATCH` / `IDEMPOTENCY_CONCURRENT_REQUEST`), GraphQL surface but the conceptual model maps directly.
  - **Stripe** at `docs.stripe.com/api/idempotent_requests` + SDK code at `stripe/stripe-node@42384847` — at-least-24h retention, 255-char header value, server-side scope enforcement, 409 reserved for transient/in-flight per SDK retry behavior.
  
  Outbox pattern separately confirmed at AWS Prescriptive Guidance and microservices.io (Chris Richardson). **Production-cited high.**

- **First-class, not workaround.** Postgres native UNIQUE constraint as primary defense. Postgres `SELECT … FOR UPDATE` for row-level locking on the dedup record. Postgres timestamp + reaper job for TTL (cron-style cleanup, not row-level TTL — Postgres doesn't natively support TTL columns, this is the standard pattern). Outbox via dedicated table consumed by a relay worker. **No workarounds.**

## Rejected alternatives

### Alternative A — Pure Stripe-style: client always supplies Idempotency-Key
**What:** Every mutating API call requires a client-supplied `Idempotency-Key` header. Server doesn't derive any keys.
**Wins when:** every API endpoint is client-initiated (e.g. pure REST API for external integrators). Client controls retry semantics fully.
**Why not here:** dashboard-initiated mutations have no client in the request-flow sense — the server is the originator. Forcing the dashboard to generate UUIDs and pass them to itself is awkward; server-derived natural keys are cleaner. Hybrid wins on ergonomics.

### Alternative B — Pure business-state-derived: server-only key derivation
**What:** Every endpoint derives idempotency from natural business identifiers; no `Idempotency-Key` header accepted.
**Wins when:** every endpoint has a natural unique business identifier and external integrators don't need to retry without mediation through a known business entity.
**Why not here:** designer-initiated compensation grants and bulk operations don't have natural unique identifiers by design. Forcing a fake business identifier is a workaround. Hybrid wins on coverage.

### Alternative C — Optimistic-locking only (ETag-based)
**What:** No idempotency-key concept. Client sends `If-Match: <version>` on mutations; server returns 412 on conflict; client retries with new version.
**Wins when:** client and server share an explicit resource-version model and can negotiate retries.
**Why not here:** different semantics — optimistic locking solves *concurrent edits to the same resource*, not *retried duplicate requests*. Game economy needs both, but they're separable concerns. Use optimistic locking for catalog edits (CL-030 territory) and idempotency keys for transactional mutations. Not an either-or; this entry is about the latter only.

### Alternative D — Redis hot-path + Postgres safety net (E-revised, prior version's design)
**What:** Redis `SET NX EX 86400` for idempotency-key dedup; Postgres `UNIQUE(project_id, idempotency_key)` as safety net on Redis miss/eviction.
**Wins when:** Redis is already in the stack for unrelated reasons (sessions, rate limits, pub/sub), the marginal cost is near-zero, AND tail latency is tight enough that 0.5–2ms per request matters.
**Why not here:** Redis is not in BokChoy's MVP stack, and per `[[idempotency-strategy-research]]` F12 the latency math doesn't justify it (≤2ms/req savings, operationally meaningless at 10K–2M MAU). Per F10, no named production system publishes this dual-storage architecture; the pattern is unsourced from production. Idempotency is correctness-critical, not latency-critical: Postgres ACID in the same transaction as the business write is worth more than the latency savings. **Permanent rejection — even when Redis later joins for rate limiting at Studio tier, idempotency stays on Postgres.**

### Alternative E — D2-β: full Brandur recovery-point state machine on every multi-step endpoint
**What:** Add `recovery_point TEXT NOT NULL` column to the idempotency table. Each multi-step endpoint defines its own state machine constants (`RECOVERY_POINT_INVENTORY_WRITTEN`, `RECOVERY_POINT_CURRENCY_DECREMENTED`, etc.) and progresses through them inside a serializable transaction. On retry, skip already-completed steps.
**Wins when:** multi-step operations have expensive non-idempotent steps (charging external payment gateway, calling priced AI inference, sending billable SMS). Brandur's Rocket Rides charges Stripe per-call — that's the canonical case D2-β was designed for.
**Why not here:** BokChoy's MVP endpoints (wallet, IAP, loot, inventory grant) have no expensive non-idempotent steps. Re-running per-step UNIQUE-constrained INSERTs on retry costs ~4 SQL operations — negligible. The optimization saves nothing; the cost (per-endpoint state machine, taxonomy drift over time, additional test surface) is real. **Migration path preserved: any future endpoint with an expensive non-idempotent step can individually adopt D2-β via `ALTER TABLE … ADD COLUMN recovery_point` + per-endpoint refactor.** The taxonomy stays scoped to endpoints that need it.

### Alternative F — Defer multi-step recovery to CL-031
**What:** This entry covers single-step idempotency only; explicitly forward-references CL-031 for multi-step.
**Wins when:** the multi-step pattern depends on decisions in CL-031 that aren't yet made.
**Why not here:** falsified by `[[idempotency-strategy-research]]` F13 — recovery_point and idempotency keys are co-located on the same schema; deferring still costs a future schema migration. And `[[mvp-feature-sequence]]` line 17 commits to multi-step IAP and loot rolls in months 1–3, so the gap is live in MVP. The dependency I claimed (CL-029/CL-031 must land first) was partially false: per-step idempotency states come from the operation's structure (already known for wallet/IAP/loot), not from event-sourcing or authority-model decisions.

## Failure mode

Three specific failure scenarios, ranked by likelihood and cost.

1. **Postgres lock contention under sustained high write rate.** At sustained ≥1k writes/sec/project on a single Postgres primary, `SELECT … FOR UPDATE` on the idempotency row plus the business write plus the outbox INSERT inside one transaction creates a 3–4 statement contention window. Probability: low at MVP scale (~3 peak writes/sec at indie, ~575 at Studio+ — well below contention threshold). Cost: medium if it manifests at Studio+ tier — manifest as elevated p99 latency, not correctness violation.

2. **In-flight `locked_at` timeout under heavy retry storms.** A request is interrupted (server crash, network drop) mid-operation; its row stays locked until the timeout expires. Concurrent retries during the lock window return 409 with `bokchoy_idempotency_key_in_use`. Designers see transient errors. Probability: medium during incidents. Cost: medium — visible to designers as "sometimes my retry returns 409 instead of the cached response." Mitigation: SDK auto-retries on 409 with exponential backoff (matching Stripe SDK pattern); after lock timeout, re-lock and proceed.

3. **Designer doesn't know about 24h TTL and retries with same key after 25h.** Server treats it as a new request; designer sees double-grant or divergent state. Probability: medium-low (most retries within minutes-hours). Cost: high when it happens. Mitigation: SDK auto-prepends a timestamp into client-supplied keys to make them naturally distinct across the boundary; SDK docs explicitly call out the 24h window.

4. **Outbox relay worker falls behind.** Side effects (mailbox push, webhooks) accumulate in `staged_jobs` faster than the relay worker can drain. Probability: medium during traffic spikes. Cost: medium — designer-visible as "my mailbox push didn't fire for 30s after the IAP completed." Mitigation: monitor outbox depth; auto-scale relay worker; circuit breaker on third-party APIs that are slow.

## Mitigations

- **Postgres lock contention:** monitor p99 of idempotent endpoint latency. If sustained contention appears at Studio+ tier, partition the idempotency table by `project_id` (hash partitioning on `project_id` range), or move `staged_jobs` writes to a separate transaction with explicit two-phase commit pattern. Defer the partitioning decision until traffic data justifies.
- **In-flight `locked_at` timeout:** SDK pattern handles this transparently — auto-retry on 409 with exponential backoff. Document the SDK behavior; document the lock timeout (initial: 30 seconds) so designers integrating without the SDK can implement equivalent retry logic.
- **24h TTL surprise:** SDK injects timestamp into client-supplied keys by default; SDK debug-mode flag disables timestamp injection for designers who need raw control; SDK docs warn about the 24h window with example "what to do if you need longer-lived keys."
- **Outbox depth blowup:** Prometheus metric on `staged_jobs` row count per status; alert when depth exceeds 10× the rolling 5-min average; scale relay worker pool based on depth; circuit-break third-party calls that are slow.
- **Adversarial Postgres-fill:** per-API-key rate limit on accepting unique idempotency keys (10K/hour per API key); enforce in-process at MVP (single app server initially), distributed when Studio tier requires it (Redis or Postgres advisory locks).
- **Operational runbook:** `[[runbook-idempotency]]` (to be written in implementation phase) covers: stuck `locked_at` row recovery; outbox depth alerts and remediation; bulk replay of failed staged jobs; reaper job failure recovery.

## Idiom citations

- Brandur reference implementation pattern (Postgres-only idempotency with `locked_at` lock and per-step state) — applied via D2-α simplification (no `recovery_point` column) per F14–F16 in `[[idempotency-strategy-research]]`.
- Stripe `Idempotency-Key` header convention — header name and length cap.
- IETF draft `Idempotency-Key` header field, version 07 — HTTP status code split (422 for parameter-mismatch, 409 for in-flight) and Structured Header String value semantics.
- Transactional outbox pattern — AWS Prescriptive Guidance + microservices.io (Chris Richardson) — for atomic-state-plus-side-effect.
- Shopify documented 24h TTL — SDK and designer-facing TTL contract.

## Revisit when

Specific triggers that should reopen this decision:

- **Sustained p99 latency on idempotent endpoints exceeds 50ms at Studio+ tier (>500 writes/sec)** → revisit storage strategy. Options: (a) add Redis as opportunistic cache in front of Postgres truth (Postgres remains source of truth); (b) partition `transactions` table by `project_id`; (c) move outbox to a separate transaction.
- **A future endpoint adds an expensive non-idempotent step** (e.g., per-call paid third-party API, billable AI inference per loot roll, etc.) → upgrade *that endpoint* to D2-β by adding a `recovery_point` column and a per-endpoint state machine. Other endpoints stay on D2-α.
- **`bokchoy_idempotency_key_in_use` rate exceeds 1% over 5min sustained** → client SDK or designer implementation bug. Investigate before scaling. May indicate clients sending parallel duplicates instead of waiting for the in-flight response.
- **`bokchoy_idempotency_key_mismatch` rate exceeds 0.1% over 5min** → designer is reusing keys for genuinely different operations. SDK key-derivation logic may be wrong, or designer is hand-rolling keys badly.
- **Outbox depth (`staged_jobs` row count for `pending` status) exceeds 10× rolling 5-min average sustained for 15min** → relay worker capacity issue or downstream API slowness. Auto-scale; investigate.
- **Designer feedback indicates the 24h TTL is causing double-grant bugs at >0.1% rate** → tighten SDK-level timestamp injection or extend TTL window (would require a Postgres reaper-job change, trivial).
- **A high-volume customer requests a custom retention window** (e.g. >24h for very-flaky-network markets) → revisit per-tenant TTL configurability. Postgres column already supports per-row variable TTL; reaper job logic would need per-project parameter.
- **At Series A scale (>10× current MAU projections)** → revisit Postgres-only stance. The latency math may flip when contention starts dominating; Redis-as-cache becomes worth the operational cost.
- **IETF draft 07 ratified as RFC, with materially different status code or scope semantics than current draft** → align if the changes are non-breaking; document divergence if not.

## Confidence note

Overall confidence: **high.** B7 (Postgres-only) is backed by tier-1 evidence (Brandur reference implementation source at pinned commit) plus tier-2 docs (Stripe canonical, Shopify, IETF draft 07). D2-α (per-step keys + outbox, no recovery-point state machine) is derived from re-reading Brandur's own framing ("more elaborate than necessary for many cases") plus first-principles analysis of BokChoy's specific endpoints (no expensive non-idempotent steps in MVP scope) plus tier-2 docs on outbox pattern. HTTP status semantics are derived from Stripe SDK retry behavior at pinned commit + IETF draft 07 normative recommendations. 24h TTL is directly cited from Shopify documentation.

The residual `confidence: medium` items: (a) per-`(project_id, idempotency_key)` scope is inferred from Stripe SDK behavior, not directly cited from Stripe's docs — the privacy argument for BokChoy is independently load-bearing, but the "Stripe does it this way" justification is inference; (b) outbox schema specifics deferred to `[[CL-029]]`; (c) RNG seed format deferred to `[[CL-031]]`. Both deferrals are explicit and the requirements (outbox commits in same transaction; RNG deterministic-on-request-key) land here.

This decision is **vault-ready as the architectural foundation for every mutating API call shipped from month 1 onward.** The cascade (CL-029 event sourcing, CL-030 catalog versioning, CL-031 server-authoritative loot, CL-032 tenant isolation) can proceed.

## Cascade obligations

This entry has dependencies on adjacent decisions and one prior-vault patch:

1. **`[[mvp-feature-sequence]]` line 56** currently states *"Redis for idempotency keys + hot reads + rate limits"* — this contradicts the Postgres-only decision above. Update to drop "Redis for idempotency keys"; defend remaining Redis use cases (hot reads, rate limits) or drop them too. Pending separate edit alongside this entry.
2. **`[[CL-029]]` event sourcing** — must specify the `staged_jobs` (or equivalent outbox) table schema: status enum, retry counts, claim semantics for the relay worker. The *requirement* (outbox exists; outbox writes commit in the same transaction as state change; consumers are idempotent) is set here; the *schema* lands with CL-029.
3. **`[[CL-031]]` server-authoritative loot** — must specify the deterministic-RNG-from-request-key implementation: PRF choice (HMAC-SHA256 over seed bytes is the obvious default), seed-bytes derivation from `(player_id, banner_id, pull_session_id, attempt_number)`, retry-attempt semantics (does `attempt_number` increment for legitimate "I want a different result" retry, or is it always 0 for a given user-perceived roll). The *invariant* (RNG deterministic-on-request-key) is set here; the *implementation* lands with CL-031.
4. **Implementation runbook** `[[runbook-idempotency]]` to be written in the implementation phase: stuck `locked_at` recovery, outbox depth remediation, bulk replay procedures, reaper job failure recovery.
