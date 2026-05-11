---
type: research
features: [cockpit, architecture]
related: ["[[cockpit-shape]]", "[[first-run-journey]]", "[[auth-surface-mount]]", "[[admin-auth-surface]]", "[[wallet-http-contract]]", "[[backend-stack]]"]
created: 2026-05-11
confidence: high
provisional: false
---

# How do production B2B SaaS APIs at indie/SMB MVP scale structure response envelopes, pagination, nested sub-resources, and create-with-side-effect bundling for admin / management endpoints?

## Question

Slice 8.3 + 8.4 backend handlers (`GET /v1/orgs/me`, `GET /v1/projects`, `POST /v1/projects`, `GET /v1/projects/{id}`) need contract shapes grounded against production B2B SaaS conventions. Four sub-questions per /design pushback 2026-05-11 ("move this to research to avoid claims"):

- (a) **Response envelope** — list and scalar endpoints. Bare data, `{ data: ... }` wrap, or Stripe-style `{ object: 'TYPE', id, ... }` discriminated?
- (b) **Pagination** — cursor vs offset, default page size, when introduced.
- (c) **Nested sub-resources on scalar detail endpoints** — do they nest arrays of children (e.g., `apiKeys[]` on `GET /v1/projects/{id}`) or require separate endpoint calls?
- (d) **Create-with-side-effect bundling** — does `POST /v1/projects` return auto-issued first child resources (e.g., first API key plaintext) in the parent response, or split into separate POSTs?

## Triangulation

- **Production reference:** ✓ Stripe API docs at `docs.stripe.com/api/customers/object` + `docs.stripe.com/api/pagination` (production-cited via canonical B2B SaaS payments API at billions-of-requests-per-day scale); Vercel REST API v9 docs at `vercel.com/docs/rest-api/reference/endpoints/projects/find-a-project-by-id-or-name` (production-cited via developer-tools/cockpit at indie/SMB-to-enterprise scale); Resend API docs at `resend.com/docs/api-reference/api-keys/create-api-key` (production-cited via developer-tools/transactional-email at indie/SMB MVP scale).
- **Docs reference:** ✓ same three docs cites version-pinned by direct WebFetch 2026-05-11.
- **Contradiction probe:** ✓ active search for create-with-bundling pattern across Stripe / Vercel / Resend. **Not found.** All three surveyed production APIs split parent + child creation into separate POSTs. F5 surfaces this as a load-bearing contradiction with `[[first-run-journey]]` step 6 + 7 (E1) bundling pick.

## Sources examined

### Source 1 — Stripe API pagination + customer object docs

- **Tier:** 2 (official docs at canonical B2B SaaS payments API).
- **Provenance:** `docs.stripe.com/api/pagination` + `docs.stripe.com/api/customers/object`, fetched 2026-05-11.
- **Author context:** Stripe API team, multi-billion-request-per-day production scale.
- **What it tells us:**
  - **Pagination:** cursor-based via `starting_after` / `ending_before` (object IDs, mutually exclusive). Default `limit: 10`, max `100`. No `total_count` field in response by default.
  - **List envelope verbatim:** `{ "object": "list", "url": "/v1/customers", "has_more": false, "data": [ { ... } ] }`. Four fields: `object` (string literal "list"), `data` (array), `has_more` (boolean), `url` (string).
  - **Scalar envelope:** bare object with `object: 'customer'` discriminator + `id: 'cus_<random>'` + flat fields. No outer `{ data: ... }` wrap.
  - **Nested sub-resources on scalar:** mix of (a) nested objects always included (`address`, `invoice_settings`, `shipping`); (b) nested list-objects `{ object: 'list', data, has_more, url }` for sub-resources (`sources`, `subscriptions`); (c) expandable string IDs (`default_source: 'card_xyz'`) that become full objects via `?expand[]=field` query parameter.
  - **ID format:** prefixed-string with type marker (`cus_`, `card_`, `sub_`, etc.) + random suffix.
  - **Create endpoint POST /v1/customers:** returns the customer object (same bare shape). **Does NOT auto-issue child resources** in the response. Payment methods / sources are created separately via `POST /v1/payment_methods` then attached via `POST /v1/customers/{id}/sources`.

### Source 2 — Vercel REST API v9 project endpoint docs

- **Tier:** 2 (official docs).
- **Provenance:** `vercel.com/docs/rest-api/reference/endpoints/projects/find-a-project-by-id-or-name` (REST API v9), fetched 2026-05-11.
- **Author context:** Vercel platform engineering, developer-tools/cockpit at indie-to-enterprise scale.
- **What it tells us:**
  - **Scalar envelope:** bare data, NO `object` discriminator field. Direct `{ id, name, accountId, createdAt, ... }` object.
  - **Heavy nested sub-resources (15+ fields):** `env[]` (env vars), `customEnvironments[]`, `latestDeployments[]`, `targets{}`, `analytics{}`, `crons{}`, `dataCache{}`, `integrations[]`, `link{}` (git repo), `microfrontends{}`, `jobs{}`, `staticIps{}`, `rollingRelease{}`, `ssoProtection{}`. ALL included in default project response. Bare arrays (not Stripe-style `{ object: 'list' }` wrapped).
  - **Separate endpoints owed:** deployment logs/details, domain records, git credentials, team members/permissions, billing/usage, monitoring alerts.
  - **Create endpoint:** docs page didn't expose POST schema; pattern across Vercel API is split-POST per resource (tokens, env vars, deployments all have separate creation endpoints).
  - **Pagination:** list endpoint not on this page; Vercel convention (from broader docs) uses `limit` + `since` (timestamp cursor) for paginated lists. No `object: 'list'` envelope; bare arrays.

### Source 3 — Resend API keys create endpoint docs

- **Tier:** 2 (official docs).
- **Provenance:** `resend.com/docs/api-reference/api-keys/create-api-key`, fetched 2026-05-11.
- **Author context:** Resend platform engineering, developer-tools/transactional-email at indie/SMB MVP scale.
- **What it tells us:**
  - **POST `/api-keys` response verbatim:** `{ "id": "dacf4072-...", "token": "re_c1tpEyD8_..." }`. Bare object, two fields, plaintext token visible-once.
  - **Pattern:** API keys are a top-level resource at `/api-keys`, NOT nested inside parent (e.g., not nested in a project resource because Resend doesn't have project tenancy like BokChoy does).
  - **No `object` discriminator field** in the response.
  - **No envelope wrap** (no `{ data: ... }`).
  - **Doc context:** no explicit version metadata in the page. Resend's API is small enough that version-pinning is less common at this stage.

### Source 4 — Contradiction probe (create-with-side-effect bundling)

- **Tier:** 7 (search-based, training-data inference attempting to find named counter-pattern).
- **Provenance:** explicit search across Stripe / Vercel / Resend docs surveyed above for any endpoint that creates a parent resource AND auto-issues + returns a child resource (especially child resource plaintext) in the parent's response.
- **What it tells us:** **Not found.** All three surveyed B2B SaaS production APIs split parent + child creation into separate POSTs. The plaintext-API-key-visible-once pattern (Resend's `POST /api-keys` returning `token` plaintext) IS production-cited as a SEPARATE-endpoint pattern, not a bundled-with-parent pattern. **Bundling parent-create + child-issuance into one POST is NOT a production-cited convention at the 3 surveyed B2B SaaS at indie/SMB MVP-to-mature scale.**

## Findings

### F1 — Bare-data response envelopes for scalar endpoints are production-cited × 3

All three surveyed production APIs return scalar resource details as bare objects, NOT wrapped in `{ data: ... }`. Pattern:

- Stripe: bare with `object: 'TYPE'` discriminator
- Vercel: bare without discriminator
- Resend: bare without discriminator

**Convergence:** bare-not-wrapped is unanimous. **Divergence:** `object` discriminator field is Stripe-specific; Vercel + Resend don't adopt it.

For BokChoy's prior /design pick (R2) bare success + Stripe-wrapped errors per `[[wallet-http-contract]]` G5: **production-cited × 3 directly confirms** the bare-success half. The Stripe-wrapped-errors half is already vaulted in `[[wallet-http-contract]]` G5 with its own production cites.

**(R1) `{ data: ... }` wrap REJECTED** — not used by any of the 3 surveyed B2B SaaS at MVP scale.

**`object` discriminator field DECISION DEFERRED to /design.** Production cites split 1-of-3 (Stripe) vs 2-of-3 (Vercel + Resend). Internal-consistency argument: `[[wallet-http-contract]]` slice 8.1c handlers return `{ id, walletId, status }` WITHOUT `object` field. Staying without `object` matches internal pattern + Vercel + Resend (2-of-3 majority).

### F2 — List envelope diverges; Stripe pattern is the production-cited choice WHEN pagination is needed

- Stripe: `{ object: 'list', url, has_more, data: [...] }` with cursor pagination.
- Vercel: bare array (or wrapped without `object` discriminator — unconfirmed from this specific docs page; broader Vercel API uses bare arrays for most list endpoints).
- Resend: list endpoint shape not surfaced from this docs page.

**Pattern:** when pagination is needed, Stripe's envelope is the only one with explicit pagination metadata fields. Vercel embeds pagination state separately (in `since` cursor passed in subsequent requests).

**For BokChoy at MVP (slice 8.3 + 8.4 small lists):** no pagination required per (Pa-none) prior /design pick. List endpoints return bare arrays `[ ... ]` for `GET /v1/projects`. When pagination introduced (post-MVP, ~50+ projects per org OR transaction inspector at slice 8.6 scale), adopt Stripe's `{ object: 'list', data, has_more, url }` envelope + cursor pagination via `starting_after` / `ending_before` (production-cited × 1 with high-scale provenance).

**No `total_count` field** per Stripe convention — explicit + production-cited rejection.

### F3 — Cursor pagination via `starting_after` / `ending_before` is canonical Stripe + B2B SaaS pattern

Stripe verbatim convention: cursor-based, default `limit: 10`, max `100`, mutually-exclusive `starting_after` / `ending_before`. No `total_count`. Production-cited at billion-request-per-day scale.

**For BokChoy:** when pagination eventually ships, this is the canonical pattern. **At MVP no pagination required** — (Pa-none) prior /design pick **confirmed production-cited × 1 at MVP scale** (Vercel ships small project lists without pagination; Resend's API-keys list is small; Stripe's default list of 10 customers fits common cases).

### F4 — Nested sub-resource arrays on scalar detail endpoints are production-cited × 2

- Vercel: 15+ nested fields on project detail response (`env[]`, `latestDeployments[]`, `integrations[]`, etc.) all included by default. Bare arrays.
- Stripe: nested objects (`address`, `invoice_settings`) always included + nested list-objects for sub-resources (`sources`, `subscriptions` with `object: 'list'` wrap) + expandable IDs.

**For BokChoy's prior /design pick (A1)** — nested `apiKeys[]` on `GET /v1/projects/{id}` response: **production-cited × 2 directly confirms.** Vercel's pattern of nesting child arrays in parent detail is the simpler shape; matches BokChoy's (A1) intent. Stripe's expandable-IDs pattern is more sophisticated; not required at MVP scale.

**Decision-level implication:** `GET /v1/projects/{id}` shape for BokChoy:
```ts
{
  id: 'proj_...',
  name: 'My Project',
  slug: 'my-project',
  organizationId: 'org_...',
  status: 'active',
  createdAt: '2026-05-11T12:00:00Z',
  apiKeys: [
    { id: 'key_...', prefix: 'bk_live_a1b2', name: 'default', lastUsedAt: '2026-05-11T12:05:00Z', createdAt: '2026-05-11T12:00:00Z' },
  ],
}
```

**(A2) separate `/api-keys` endpoint REJECTED** for BokChoy MVP β-flow because:
- `[[first-run-journey]]` step 11 (T2 verify-key polling) reads `apiKeys[].lastUsedAt` from project detail — single fetch covers it.
- Doubles round-trips for the verify loop (~5s polling interval × 2 fetches per cycle = wasted bandwidth).
- Production-cited via Vercel × 1 (heavier nesting than Stripe's pattern).

**Alternative (A2) Stripe-expandable-pattern AVAILABLE post-MVP** as a refinement: `GET /v1/projects/{id}?expand[]=apiKeys`. But this adds complexity unnecessary at slice 8.3 + 8.4.

### F5 (LOAD-BEARING contradiction) — Create-with-side-effect bundling is NOT production-cited

The prior /design (E1) pick for `POST /v1/projects` returning `{ project, apiKey: { id, prefix, plaintext } }` — auto-issued first API key with plaintext in the parent's POST response — is NOT a convergent B2B SaaS pattern. All three surveyed production APIs split:

- Stripe: `POST /v1/customers` returns customer; payment-methods created separately via `POST /v1/payment_methods` + attached.
- Vercel: `POST /v9/projects` returns project; tokens created separately via `POST /v1/tokens`.
- Resend: API keys created via `POST /api-keys` as a standalone endpoint, never bundled with parent creation (and Resend doesn't have a parent-resource that owns keys at the API layer).

**Two paths for /design to weigh:**

#### Path (E2) Production-canonical: split into two POSTs

```ts
// Slice 8.4 backend handlers:
POST /v1/projects
  body: { name, slug }
  response: { id, name, slug, organizationId, status, createdAt }

POST /v1/projects/{id}/api-keys
  body: { name }  // optional, defaults to "default"
  response: { id, prefix, plaintext, name, createdAt }
```

Cockpit's create-project flow per `[[first-run-journey]]` step 6 does TWO sequential requests:
1. `POST /v1/projects` → get project.id
2. `POST /v1/projects/{project.id}/api-keys` → get plaintext key

Race window between (1) and (2): if (2) fails, project exists with no key. Cockpit retries (2) on user click. Recovery surface owed.

#### Path (E1) BokChoy-specific bundling: single POST with named divergence

```ts
POST /v1/projects
  body: { name, slug, issueDefaultKey?: boolean = true }  // opt-out for advanced
  response: { project: { id, name, slug, ... }, apiKey: { id, prefix, plaintext, name, createdAt } | null }
```

**Defense for (E1) as deliberate BokChoy divergence:**
1. Single round-trip from cockpit per `[[first-run-journey]]` step 6 + 7 — no race window.
2. K1 visible-once pattern preserved (plaintext returned exactly once on creation).
3. Onboarding-confidence loop (T2) ships in one fewer page-load step.
4. Customer-profile axis from `[[wallet-http-contract]]` G5 amendment: BokChoy = developer-facing SDK during dev → developer-onboarding-UX optimization is the named winning condition for divergence from production-API convention. Same axis used to defend BokChoy's per-error-code structured detail fields (BC010 `walletId/requested/available`) over Stripe/Square/PayPal's no-numerics-in-error-envelope convention.

**Defense for (E2) as production-convention-following:**
1. Separation of concerns — project resource is project; key resource is key.
2. Future-flexibility — multi-key issuance, key naming, key scopes etc. live in a dedicated endpoint surface.
3. Operational debuggability — failures localize per endpoint.
4. Production-cited × 3 unambiguously. No convergent counter-example.

**My read for /design:** (E1) BokChoy-specific bundling is defensible on the same customer-profile axis that previously won at `[[wrapper-shape]]` Fork 2 and `[[wallet-http-contract]]` G5. But the divergence requires the named win-condition documentation in the vault entry. (E2) split-POST is the production-cited safer path with named cost (one extra round-trip + race window mitigation). **/design owes the pick.**

### F6 — `object` type-discriminator field is non-convergent

Stripe ships it (1-of-3); Vercel + Resend don't (2-of-3 majority). For BokChoy:
- Internal consistency: `[[wallet-http-contract]]` slice 8.1c handlers return bare `{ id, walletId, status }` WITHOUT `object` field.
- Majority-2-of-3 production cite: skip `object` discriminator.

**Pick (preliminary): NO `object` field.** Internal consistency + 2-of-3 production majority. Confidence: high.

## Conflicts

### C1 — (E1) bundling vs (E2) split-POST is the real fork

Production-cited × 3 supports (E2) split-POST. BokChoy's customer-profile-axis precedent supports (E1) bundling as a defensible divergence. Per *Contradiction protocol* (production code wins over inference), (E2) is the safer pick. But the customer-profile axis is already a vault-cited divergence pattern (`[[wallet-http-contract]]` G5 + `[[wrapper-shape]]` Fork 2) — so (E1) is not purely inferential; it follows an established BokChoy precedent of deliberate-divergence-on-customer-profile-axis. **The conflict itself is the finding** — /design picks and the entry vaults the chosen winning condition.

### C2 — Stripe `object` discriminator vs Vercel/Resend bare data

Production cites split 1-of-3 vs 2-of-3. Per *Contradiction protocol* (multiple independent production examples beat one), majority-2-of-3 wins for BokChoy. Confidence: medium-high — Stripe's `object` field has its own merits (machine-readable type for SDK clients, helpful in unions); BokChoy's TS-first SDK doesn't strictly need it because TypeScript's discriminated unions can carry the discriminator via dedicated fields like `status` or `kind`.

## Conditions

- **Time:** May 2026. Docs version-pinned by fetch-date 2026-05-11.
- **Vendors surveyed:** Stripe (mature payments API), Vercel (developer-tools cockpit), Resend (developer-tools transactional email at MVP-to-growth scale). Stripe is at-different-scale (billions of requests/day vs BokChoy's MVP); Vercel + Resend are at closer scale to BokChoy MVP.
- **Scope:** B2B SaaS REST API conventions for admin/management endpoints (customer-developer-facing, not end-user-facing). Mobile SDK API conventions out of scope (slice 8.1a SDK API key pattern already vaulted in `[[wallet-http-contract]]`).
- **`object` discriminator decision is provisional** — if BokChoy adopts an SDK strategy where TypeScript-discriminated-unions need a runtime tag, revisit (Stripe pattern wins under that constraint).

**Does NOT hold for:**
- GraphQL APIs (Linear, etc.) — different paradigm; deferred until BokChoy considers GraphQL surface.
- Mobile-SDK-facing endpoints — different consumer profile + auth mechanism per `[[wallet-http-contract]]` slice 8.1a.
- Webhook payload conventions — different surface; `[[webhook-retry-norms-research]]` already covers.

## Operational implications

### Recommended contract shapes for slice 8.3 + 8.4 backend handlers (subject to /design ratification)

```ts
// Slice 8.3:

GET /v1/orgs/me
  headers: { Authorization: 'Bearer <session-token>' } (via Better Auth bearer plugin per slice 8.2.1)
  response 200: {
    id: 'org_...',
    name: 'My Org',
    slug: 'my-org',
    createdAt: '2026-05-11T...',
    member: {
      id: 'mem_...',
      userId: 'user_...',
      role: 'admin' | 'owner' | 'member',
    },
  }
  errors: BC401 / BC400 / BC404 per [[admin-auth-surface]] BCxxx allocation

GET /v1/projects
  query: (no pagination at MVP per (Pa-none); empty)
  response 200: [
    { id: 'proj_...', name: 'My Project', slug: 'my-project', organizationId: 'org_...', status: 'active', createdAt: '...' },
    ...
  ]
  errors: same as above

// Slice 8.4 (split-POST pattern (E2) — production-cited; or bundled (E1) — BokChoy-divergence):

POST /v1/projects
  body: { name: string, slug: string }
  response 201:
    (E2): { id: 'proj_...', name, slug, organizationId, status: 'active', createdAt }
    (E1): { project: {...}, apiKey: { id: 'key_...', prefix: 'bk_live_a1b2', plaintext: 'bk_live_a1b2c3d4...', name: 'default', createdAt } }
  errors: BC400 (validation) / BC401 / BC403 / 422 slug-taken

POST /v1/projects/{id}/api-keys  (only if (E2) picked)
  body: { name?: string }
  response 201: { id: 'key_...', prefix, plaintext, name, createdAt }
  errors: same

GET /v1/projects/{id}
  response 200: {
    id, name, slug, organizationId, status, createdAt,
    apiKeys: [
      { id, prefix, name, lastUsedAt: '2026-05-11T...' | null, createdAt },
    ],
  }
  errors: BC401 / BC403 / BC404 (project not found OR cross-org)
```

### Pattern conventions to vault

- **Bare-data success envelopes** for both scalar and list (no `{ data: ... }` wrap).
- **Stripe-wrapped errors** per `[[wallet-http-contract]]` G5 unchanged.
- **No `object` type-discriminator field** (2-of-3 production majority + internal consistency with slice 8.1c handlers).
- **No pagination at MVP β + dashboard v1 scale.** When introduced (slice 8.6 transaction inspector OR project count exceeds ~50 per org), adopt Stripe cursor pattern.
- **Nested arrays for related sub-resources** on scalar detail responses (Vercel-pattern; production-cited × 2).
- **API-key prefix-only after issuance** in GET responses; plaintext only in POST response (K1 visible-once preserved regardless of (E1) or (E2)).
- **Resource ID prefix convention:** type-prefixed strings — `org_*`, `proj_*`, `key_*`, `mem_*`. Production-cited via Stripe (`cus_`, `card_`, `sub_`, etc.) + Resend (no prefix; raw UUIDs) + Vercel (no prefix; varies). Stripe pattern + Better Auth's UUID generation per `[[tenancy-ids-research]]` F1 compose acceptably — could use type-prefix-then-UUID format. **Decision deferred to /design** — BokChoy already uses raw UUIDs in `[[wallet-http-contract]]` G2 + slice 8.1a; staying with raw UUIDs is internal-consistency; switching to prefix-then-UUID adds machine-readable type tag at the cost of compatibility with existing slice 8.1+ code.

### Cockpit consumption implications

Per `[[cockpit-stack-integration-research]]` F5 + F6 anti-patterns:
- TanStack Query for `GET /v1/projects/{id}` polling (T2) — per-query `staleTime: 0` for the verify-key view ONLY (polling needs fresh data; default staleTime would block refetch).
- `React.cache(getProject)` for RSC reads of project detail.
- Bare-data response means TanStack Query's `data` field IS the response (no unwrap).
- No `Promise.all` waterfall risk on detail page — single endpoint covers project + nested `apiKeys[]`.

## Reproducibility note

Reproducible. Another investigator with WebFetch access reaches the same findings by:
1. Fetching `docs.stripe.com/api/pagination` for cursor-pagination canonical text.
2. Fetching `docs.stripe.com/api/customers/object` for scalar response shape.
3. Fetching `vercel.com/docs/rest-api/reference/endpoints/projects/find-a-project-by-id-or-name` for Vercel scalar pattern.
4. Fetching `resend.com/docs/api-reference/api-keys/create-api-key` for plaintext-once-on-POST pattern.
5. Searching across the surveyed sources for "create + child resource bundled in POST response" — null finding.

No load-bearing subjective judgment; the cite synthesis is mechanical.

## Open threads

- **GraphQL B2B SaaS comparison** (Linear API at `developers.linear.app`) — separate paradigm; relevant if BokChoy ever considers GraphQL surface. Not blocking REST contract for slice 8.3-8.4.
- **GitHub API pagination convention** (Link headers, page-based) — production-cited at large scale but different convention class from Stripe's cursor. If BokChoy ever ships a list endpoint that needs deep pagination, revisit.
- **PlayFab / Unity GS Economy API conventions** (game-industry-specific peer comparison) — not surveyed this pass. Per `[[cockpit-gap-research]]` these are competitor platforms; their API conventions inform the game-developer ICP audience expectation. Lower-priority cite class; surveyed competitors but BokChoy doesn't necessarily match their conventions (BokChoy chose Better Auth + Hono stack-specific patterns vs PlayFab's bespoke-stack).
- **Better Auth's own admin-API conventions** (Better Auth's organization-plugin endpoints at `/api/auth/...`) — already source-walked in `[[better-auth-org-admin-research]]`. Different surface from BokChoy's `/v1/*` admin endpoints; auth-flow-specific.
- **`object` discriminator field decision** — provisional finding (no for now); revisit if SDK strategy ever requires runtime type tags.
- **Resource ID prefix convention** — Stripe-style type-prefix (`proj_`, `key_`) vs raw UUIDs (current BokChoy slice 8.1+ pattern). Deferred to /design with named tradeoff.
- **(E1) vs (E2) decision** owed to /design — the load-bearing fork this research surfaced.
