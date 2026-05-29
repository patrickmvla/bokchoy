---
type: research
features: [cockpit, catalog]
related: ["[[cockpit/admin-catalog-endpoints-contract]]", "[[cockpit/gaps]]", "[[architecture/idempotency-strategy]]", "[[cockpit/admin-list-endpoints-contract]]"]
created: 2026-05-29
confidence: high
provisional: false
---

# Idempotency posture for operator catalog creates: does `idempotencyMiddleware` tolerate an absent header, and which hybrid-contract path applies?

## Question

Gap C-3 from `[[cockpit/gaps]]`. The catalog endpoints contract said "Idempotency-Key optional on creates," but two things were unverified: (1) does the shipped `idempotencyMiddleware` actually tolerate an *absent* `Idempotency-Key` header (i.e. is "optional" buildable, or does wiring it force the header like a required gate)? (2) Given every catalog resource has a unique `(project_id, code)` constraint that already makes a double-submit safe, what idempotency posture do catalog creates (`POST currencies/items/offers`) actually need?

## Triangulation

- **Production reference:** ✓ — in-repo tier-1: `apps/backend/src/idempotency/middleware.ts`, `apps/backend/src/projects/index.ts` (createProject vs createApiKey).
- **Docs reference:** ✓ — the project's own canonical decision `[[architecture/idempotency-strategy]]` (confidence: high), which itself triangulated Stripe/Shopify/IETF draft 07 (per its line 219).
- **Contradiction probe:** ✓ — Stripe's "optional Idempotency-Key on every POST" model. Found, and found to have been explicitly adjudicated (rejected as Alternative D in the strategy entry). Named below, not artificially resolved.

## Sources examined

### `idempotencyMiddleware`
- **Tier:** 1 (production code, in-repo).
- **Provenance:** `apps/backend/src/idempotency/middleware.ts:38-47`, working tree 2026-05-29.
- **Author context:** BokChoy backend, slice 8.1b; the file header cites `[[wallet-http-contract]]` G4 + `[[idempotency-strategy]]` D2-α.
- **What it tells us:** the middleware no-ops on an absent header. Lines 43-47: `// Header absent → handler-side natural-key dedup is primary; middleware no-ops.` then `const idempotencyKey = c.req.header(HEADER_NAME); if (!idempotencyKey) { return next(); }`. It also only acts on `MUTATING_METHODS` (line 39). A provided-but-malformed key → 400 `IDEMPOTENCY_KEY_INVALID`; a valid key → SELECT/INSERT-with-`ON CONFLICT DO NOTHING`, replay on completed, 409 `BC001` in-flight, 422 `BC002` body-mismatch.

### `createProject` vs `createApiKey`
- **Tier:** 1 (production code, in-repo).
- **Provenance:** `apps/backend/src/projects/index.ts` — `createProject` (mounted at line 416-421, **no** `idempotencyMiddleware`) catches `projects_organization_id_slug_unique` (lines 126-127) → 409 `PROJECT_SLUG_EXISTS` (line 144). `createApiKey` route mounts `idempotencyMiddleware` (line 430).
- **What it tells us:** the two admin creates take *different* idempotency postures, and the discriminator is the natural key. Projects have a unique `(organization_id, slug)` → rely on it (catch → 409). API keys are randomly generated with no natural identifier → the middleware is their only dedup.

### `[[architecture/idempotency-strategy]]` (the governing decision)
- **Tier:** 2-internal (vaulted decision, confidence: high; itself tier-1+2 grounded).
- **Provenance:** `.bocek/vault/architecture/idempotency-strategy.md:16-19, 45-47, 145-147`.
- **What it tells us:** the **hybrid idempotency contract**. "Every mutating API call enforces idempotency through one of two paths: (1) **Server-derived natural key** (default for endpoints *with* natural business identifiers); (2) **Client-supplied `Idempotency-Key` header** (required for endpoints *without* natural identifiers — designer-initiated compensation grants, manual currency adjustments, mass mailbox sends)." Pure-client-supplied (Stripe-across-the-board) was rejected (Alt D, lines 45/145-147): "Forcing the dashboard to generate UUIDs and pass them to itself is a workaround. Hybrid wins on ergonomics."

## Findings

### F1 — "Optional" is the middleware's native behavior (C-3 premise resolved)
The middleware tolerates an absent `Idempotency-Key` header *by design* — it no-ops and calls `next()` (`middleware.ts:43-47`). The intent is stated in the code comment: it complements handler-side natural-key dedup, it doesn't replace it. So "optional Idempotency-Key" is trivially buildable: wiring the middleware on a route does **not** force clients to send the header. A provided key gets replay/lock semantics; an absent key falls through to the handler.

### F2 — The hybrid contract already classifies catalog creates as path 1 (natural-key)
Catalog creates have a natural business identifier: the unique `(project_id, code)` on `currencies`/`items`/`offers`. Per `[[architecture/idempotency-strategy]]`, path 1 (server-derived natural key) is the *default for endpoints with natural identifiers*. A double-submit of `POST .../currencies {code:'gems'}` hits the unique constraint → `409 CODE_TAKEN` (the C-2 ruling) — that **is** the path-1 enforcement. No client `Idempotency-Key` is required. Path 2 is reserved for endpoints *without* natural identifiers; the strategy's examples ("manual currency adjustments", compensation grants, mass mailbox) are arbitrary mutations, not catalog row creation.

### F3 — `createProject` is the exact precedent; `createApiKey` is the contrast, not a conflict
`createProject` (natural key `(org, slug)` → no middleware → catch → 409) is the precise analog for catalog creates. `createApiKey` wires the middleware only because api-keys have *no* natural key — i.e. it's path 2 because it must be. The two postures are the two arms of the hybrid contract applied correctly, not an inconsistency to reconcile.

## Conflicts

**Stripe-across-the-board vs. BokChoy hybrid.** Stripe (and the IETF idempotency draft) recommend an optional client `Idempotency-Key` on *every* POST, server-stored with 24h replay — under that model catalog creates would carry optional keys with replay. Per *Contradiction protocol* this would normally be a strong production cite. But it was **already adjudicated** for this project: `[[architecture/idempotency-strategy]]` Alternative D rejected pure-client-supplied on ergonomics ("forcing the dashboard to pass UUIDs to itself"), choosing hybrid. The contradiction is real in the wider world but resolved at BokChoy's architecture layer; it does not reopen per-endpoint. (If the team ever revisits the hybrid choice, that's a re-open of `[[architecture/idempotency-strategy]]`, not a catalog-local decision.)

## Conditions

- Holds while `[[architecture/idempotency-strategy]]`'s hybrid contract stands and catalog rows keep a natural unique identifier (`(project_id, code)`). If a future catalog mutation has *no* natural key (e.g. a "bulk import" or "duplicate this offer" endpoint that generates codes server-side), that endpoint falls under path 2 and would wire the middleware.
- Path-1 dedup returns an *error* (409 CODE_TAKEN) on a retried-after-success create, not a replay of the original 201. That is safe (no duplicate) but is not the same UX as Stripe-style replay-the-original-response. See operational implications.

## Operational implications

For `/design` to apply to `[[cockpit/admin-catalog-endpoints-contract]]` C-3 (research does not decide):

- **The default the project's own architecture prescribes for catalog creates is path 1: no required `Idempotency-Key`; the unique `(project_id, code)` + 409 CODE_TAKEN is the dedup.** This matches the shipped `createProject` precedent and the current catalog code (no middleware wired). C-3's "optional Idempotency-Key" contract language should be **replaced**, not implemented as written — the accurate statement is "path-1 natural-key dedup; no client key required."
- **Optional polish available, not prescribed:** because the middleware no-ops on absent headers (F1), design *may* additionally wire `idempotencyMiddleware` on the create routes to give replay-the-original-201 to any client that chooses to send a key (cockpit could send `cockpit-create-{resource}-{code}`). Cost: one middleware per create route. Benefit: a retry-after-commit returns the created resource instead of a 409. The closest analog (`createProject`) did **not** do this. This is a UX-polish call for design, not a correctness requirement.
- **No new code needed for the default.** The catalog module as built (no middleware, 409 on duplicate) already implements path 1. If design picks the optional-polish variant, it's an additive middleware mount on the three POST routes.

## Reproducibility note

Fully reproducible from the repo: read `apps/backend/src/idempotency/middleware.ts:38-47` (absent-header no-op), `apps/backend/src/projects/index.ts` (grep `idempotencyMiddleware` — present on the api-keys route, absent on the projects route; grep `unique` for the slug-conflict catch), and `.bocek/vault/architecture/idempotency-strategy.md:16-19` (hybrid contract paths). No external fetch required — the cross-system idempotency landscape was already triangulated in `[[architecture/.research/idempotency-strategy-research]]`.

## Open threads

- Does the cockpit catalog form-submit path have any retry behavior (TanStack Query mutation retries) that would make replay-the-201 materially better than a 409? If the cockpit auto-retries failed mutations, the optional-middleware polish gains value. (A cockpit-side question for the cascade #5 implementation pass.)
- The `[[cockpit/admin-list-endpoints-contract]]` `createApiKey` contract says "Idempotency-Key *required*" — but the middleware does not enforce presence (F1). That's a separate contract-vs-code nuance in that entry (the requirement is a cockpit convention, not a server gate); flagged, not investigated here.
