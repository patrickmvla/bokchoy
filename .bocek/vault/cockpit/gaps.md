---
type: discovery
features: [cockpit, catalog]
related: ["[[cockpit/admin-catalog-endpoints-contract]]", "[[cockpit/admin-list-endpoints-contract]]", "[[architecture/idempotency-strategy]]"]
created: 2026-05-29
---

# Catalog endpoints — implementation gaps flagged for /design

Surfaced while implementing the backend half of `[[cockpit/admin-catalog-endpoints-contract]]` (2026-05-29, implementation mode). These are **contract defects / conflicts**, not implementation choices.

**Resolution (2026-05-29, design):** human ruled on each. C-1 and C-2 reconciled in `[[cockpit/admin-catalog-endpoints-contract]]` *Amendment 2026-05-29*. C-3 routed to `/research`. See per-gap status below.

## GAP C-1 — Validation status code: contract `422` vs shipped shared hook `400`

**Conflict.** The contract's *Error shapes* says validation → `422 VALIDATION_ERROR`. The shipped, shared `validationFailureHook` (used by `apps/backend/src/projects/index.ts` and reused across admin endpoints) returns **`400`**. Honoring the contract literally requires a catalog-specific validation hook returning 422 — diverging from the shared helper the contract claims to inherit ("inherits from `[[cockpit/admin-list-endpoints-contract]]`").

**Why it's blocked.** Cannot both reuse the shared `validationFailureHook` (consistency) AND return 422 (contract). One must give.

**Unvetted options:** (a) amend contract → `400` to match the shared hook + the whole admin surface; (b) keep contract `422`, write a catalog-local 422 hook, accept wire inconsistency with projects.

**RESOLVED → `400`** (option a, ratified). Code already returns 400 (matches). Contract amended.

## GAP C-2 — `CODE_TAKEN` detail field collides with the envelope `code` key

**Defect.** The contract specifies `422 CODE_TAKEN, code: string`. The R2 envelope is `{ error: { code, message, ...detailFields } }` — the error's discriminator is already `code: 'CODE_TAKEN'`. A `code` *detail* field would overwrite or collide with it. The contract's response shape is not representable as written.

**Why it's blocked.** The offending-code value needs a non-colliding field name.

**Unvetted options:** (a) rename detail field `code`→`resourceCode`; (b) `conflictingCode`; (c) omit it, put the code only in `message`.

**RESOLVED → `409 CODE_TAKEN` + field `resourceCode`** (ratified). Code already matches. Contract amended. (Sibling `[[cockpit/admin-list-endpoints-contract]]` carries the same 422-vs-shipped-409 drift on `slug_taken` — left for its own pass.)

## GAP C-3 — "Idempotency-Key optional on creates" — implementability

**Conflict.** The contract says `Idempotency-Key` is optional on all creates (per `[[architecture/idempotency-strategy]]` D2-α). The shipped `idempotencyMiddleware` is wired on `createApiKey` where the key is *required*; `createProject` omits the middleware entirely. Whether the middleware tolerates an absent header (true "optional") is unverified.

**Why it's blocked.** "Optional Idempotency-Key" may not be cleanly implementable if the middleware requires the header. Needs the middleware's absent-header behavior confirmed (a `/research` or code-read question) before the contract's "optional" is buildable.

**Unvetted options:** (a) verify middleware tolerates absent header → wire it on catalog creates; (b) drop idempotency at MVP (matches `createProject`), rely on the unique `(project_id, code)` constraint making double-submit safe via the uniqueness error; (c) require the key like `createApiKey`.

**RESOLVED → path-1 natural-key dedup, no client key / no middleware** (researched in `[[cockpit/.research/catalog-creates-idempotency-research]]`, ratified in design 2026-05-29). The middleware tolerates an absent header (so "optional" was buildable), but the deciding factor is `[[architecture/idempotency-strategy]]`'s hybrid contract: catalog creates have a natural identifier (unique `(project_id, code)`) → path 1, the `409 CODE_TAKEN` on double-submit is the dedup. Matches `createProject`. Current code (no middleware) already implements this. Contract amended. Optional replay-polish (wire the no-op-tolerant middleware) deferred — only helps if cockpit enables mutation retry (TanStack defaults off); additive later.

## Status

C-1 ✅ resolved (400). C-2 ✅ resolved (409 + resourceCode). C-3 ✅ resolved (path-1, no middleware). All three closed; contract `[[cockpit/admin-catalog-endpoints-contract]]` amended. Bare-data envelope was implemented faithfully (not a gap); shipped `createProjectHandler`'s `{ project }` wrap is a separate pre-existing drift, noted, not propagated.
