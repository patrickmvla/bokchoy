---
type: contract
features: [cockpit, architecture]
related: ["[[admin-list-endpoints-research]]", "[[cockpit-shape]]", "[[first-run-journey]]", "[[auth-surface-mount]]", "[[admin-auth-surface]]", "[[wallet-http-contract]]", "[[idempotency-strategy]]"]
created: 2026-05-11
confidence: high
---

# Admin endpoint contracts for slice 8.3 + 8.4 cockpit consumers

## Decision

Six HTTP endpoint contracts grounded against `[[admin-list-endpoints-research]]` 3-source triangulation (Stripe + Vercel + Resend). All endpoints behind `adminGate` per `[[admin-auth-surface]]`. Six convention picks:

- **(R2)** bare-data success + Stripe-wrapped errors per `[[wallet-http-contract]]` G5 — production-cited × 3.
- **(Pa-none)** no pagination at MVP; bare arrays for list endpoints — production-cited × 1 at MVP scale.
- **(A1)** nested `apiKeys[]` array on `GET /v1/projects/{id}` scalar detail — production-cited × 2 (Vercel + Stripe).
- **(E2)** split-POST: `POST /v1/projects` creates project; `POST /v1/projects/{id}/api-keys` creates key separately. Cockpit makes two sequential requests with `Idempotency-Key` on the second for retry-safe failure recovery. Production-cited × 3 + leverages existing `[[idempotency-strategy]]` D2-α + slice 8.1.6 ON CONFLICT race-loser pattern.
- **(Disc-no)** no `object` type-discriminator field — 2-of-3 production majority + internal consistency with slice 8.1c handlers.
- **(Pref-raw)** raw UUIDs for resource IDs — internal consistency with slice 8.1+ existing pattern; adopting Stripe-style `proj_<UUID>` would force backwards-compat across wallet handlers.

### Endpoint contracts

#### `GET /v1/orgs/me` (slice 8.3)

Returns the active organization + member context for the authenticated user.

**Request:**
- Auth: `adminGate({ resource: 'org', actions: ['read'] })`. Resolves org via session.activeOrganizationId (no `?organizationId` query needed; user always reads their OWN active org).
- Body: none.

**Response 200 (bare data):**
```ts
{
  id: string,           // UUID, e.g. "11111111-..."
  name: string,         // org display name
  slug: string,         // org URL slug
  createdAt: string,    // ISO 8601
  member: {
    id: string,         // UUID
    userId: string,     // UUID, matches session.user.id
    role: 'admin' | 'owner' | 'member',
    createdAt: string,
  },
}
```

**Errors:** BC401 (no session) → 401; BC400 (no active org on session) → 400; BC404 (user not a member of resolved org) → 403.

#### `GET /v1/projects` (slice 8.3)

Returns projects under the user's active org. No pagination at MVP.

**Request:**
- Auth: `adminGate({ resource: 'project', actions: ['read'] })`. Resolves org via session.activeOrganizationId.
- Query: none at MVP. Filters (status, name search) deferred to slice 8.6+.

**Response 200 (bare array):**
```ts
[
  {
    id: string,
    name: string,
    slug: string,
    organizationId: string,
    status: 'active' | 'paused' | 'archived',
    createdAt: string,
  },
  ...
]
```

**Errors:** BC401 / BC400 / BC404 per gate.

#### `POST /v1/projects` (slice 8.4)

Creates a project under the user's active org. Does NOT auto-issue an API key per (E2) split-POST.

**Request:**
- Auth: `adminGate({ resource: 'project', actions: ['create'] })`. Resolves org via session.activeOrganizationId.
- Headers: `Idempotency-Key` optional (cockpit may set `cockpit-create-project-${slug}` for retry safety per `[[idempotency-strategy]]`).
- Body:
  ```ts
  {
    name: string,    // 1-64 chars
    slug: string,    // kebab-case, 1-32 chars, regex /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/
  }
  ```

**Response 201 (bare data):**
```ts
{
  id: string,
  name: string,
  slug: string,
  organizationId: string,
  status: 'active',  // always 'active' on creation
  createdAt: string,
}
```

**Errors:** BC401 / BC400 (validation) / BC403 / BC404 / 422 (`slug_taken` — unique constraint on `(organization_id, slug)`).

#### `POST /v1/projects/{projectId}/api-keys` (slice 8.4)

Issues a new API key for an existing project. Plaintext key returned ONCE per K1.

**Request:**
- Auth: `adminGate({ resource: 'apiKey', actions: ['create'], projectIdParam: 'projectId' })`. Tenancy check verifies project belongs to user's active org.
- Headers: `Idempotency-Key` required for cockpit-driven flows per (E2) retry-safety contract. Format: `cockpit-first-key-${projectId}` for the first-run journey step 6's auto-key, or user-supplied via key-creation form.
- Body:
  ```ts
  {
    name?: string,  // optional; defaults to "default" for first key
  }
  ```

**Response 201 (bare data, plaintext key visible-once):**
```ts
{
  id: string,           // UUID, the api_keys row ID
  prefix: string,       // first 12 chars of plaintext key, e.g. "bk_live_a1b2"
  plaintext: string,    // full key, e.g. "bk_live_a1b2c3d4e5f6..."  — STORED ONLY IN RESPONSE
  name: string,
  createdAt: string,
}
```

**Errors:** BC401 / BC400 / BC403 / BC404 / 422 (`name_taken` per project — unique constraint on `(project_id, name)` IF name uniqueness enforced; otherwise no 422).

**Retry semantics:** the `Idempotency-Key` header makes this endpoint retry-safe per `[[idempotency-strategy]]` D2-α + slice 8.1.6 ON CONFLICT race-loser pattern. First call → row inserted → plaintext returned. Replay with same `Idempotency-Key` + same body → cached response replayed (same plaintext) per slice 8.1b middleware. Different body with same key → 422 BC002 IdempotencyKeyMismatch.

#### `GET /v1/projects/{projectId}` (slice 8.4)

Returns project detail + nested `apiKeys[]` array per (A1). Powers `[[first-run-journey]]` step 11 (T2) polling for verify-key loop.

**Request:**
- Auth: `adminGate({ resource: 'project', actions: ['read'], projectIdParam: 'projectId' })`. Tenancy check.

**Response 200 (bare data):**
```ts
{
  id: string,
  name: string,
  slug: string,
  organizationId: string,
  status: 'active' | 'paused' | 'archived',
  createdAt: string,
  apiKeys: [
    {
      id: string,
      prefix: string,        // first 12 chars; full plaintext NEVER in this response
      name: string,
      lastUsedAt: string | null,
      createdAt: string,
      revokedAt: string | null,
    },
    ...
  ],
}
```

**Errors:** BC401 / BC400 / BC403 / BC404.

#### `DELETE /v1/projects/{projectId}/api-keys/{keyId}` (slice 8.4)

Revokes an API key (soft delete via `revoked_at` timestamp). Subsequent SDK calls with this key fail at `apiKeyMiddleware` per slice 8.1a (already implemented; `revoked_at IS NOT NULL` check).

**Request:**
- Auth: `adminGate({ resource: 'apiKey', actions: ['revoke'], projectIdParam: 'projectId' })`. Tenancy check.

**Response 200:**
```ts
{
  id: string,
  revokedAt: string,   // newly set timestamp
}
```

**Errors:** BC401 / BC400 / BC403 / BC404 (key not found under project) / 422 (`already_revoked`).

### Cascade obligations

Per the contract picks, these cascade into the existing slice 8.2.0 + 8.2.1 admin-auth-surface + auth-config:

1. **`packages/auth-config/src/index.ts`** — extend statements via `createAccessControl` from slice 8.2.1:
   ```ts
   export const statements = {
     ...bauthStatements,
     reasonCode: ['bootstrap'],
     player: ['deidentify'],
     project: ['create', 'read'],         // ← new
     apiKey: ['create', 'revoke'],        // ← new
     org: ['read'],                       // ← new
   } as const;
   ```
   Extend `adminRole` + `ownerRole` permission maps with the new entries (per slice 8.2.1 ground-up role pattern). Member role unchanged (still no BokChoy custom permissions).

2. **`apps/backend/src/projects/` (NEW module)** or `apps/backend/src/wallet/index.ts` extension (sibling to `bootstrapReasonCodesHandler`) — six handler implementations matching the contracts above. Per `[[backend-service-shape]]` §2 module-by-feature-not-by-axis: project + api-key management is a distinct feature class from wallet; creating `apps/backend/src/projects/` is the cleaner split. Slice 8.4 cascade.

3. **Drizzle schema additions** — `api_keys` table already exists per slice 8.1a; `projects` already exists per `[[tenancy-ids-research]]`. Slice 8.4 adds:
   - Unique constraint `(organization_id, slug)` on `projects` table (if not already present per existing schema; verify).
   - `name` + `revoked_at` columns on `api_keys` (verify against existing schema; `revoked_at` likely already there per slice 8.1a; `name` may need addition).
   - Optional unique constraint `(project_id, name)` on `api_keys` if key-name uniqueness enforced.

4. **OTel spans** per `[[admin-auth-surface]]` *Engineering substance applied* — each handler emits its own span beyond the `admin.gate` middleware span: `projects.list`, `projects.create`, `projects.get`, `api_keys.create`, `api_keys.revoke`. Attributes include `bokchoy.organization_id`, `bokchoy.project_id` (where applicable), `bokchoy.user_id`.

5. **Smoke script extension** — `/tmp/smoke-8-2.0-admin-gate.sh` from slice 8.2.1 extended to cover the 6 new endpoints + their BC4xx outcomes + the (E2) split-POST flow including retry scenarios. Slice 8.4 implementation prep.

## Reasoning

### Why (E2) split-POST over (E1) bundling

Production-cited × 3 (Stripe / Vercel / Resend all split parent + child creation) is the convergent norm per `[[admin-list-endpoints-research]]` F5. The customer-profile-axis defense from `[[wallet-http-contract]]` G5 + `[[wrapper-shape]]` Fork 2 (developer-facing-SDK-during-dev winning condition) was considered but **rejected on scope**: G5's axis defense was for a UI/wire-shape decision (snapshot-at-error fields visible on every API call); bundling-vs-splitting is a request-flow decision affecting one endpoint, once per customer. The G5 precedent doesn't generalize beyond wire-shape decisions.

Race-window cost of (E2) (`POST /v1/projects` succeeds + `POST /v1/projects/{id}/api-keys` fails → project exists with no key) is mitigated by:
- **`Idempotency-Key` header on the second POST** — `cockpit-first-key-${projectId}` makes retry replay cleanly per `[[idempotency-strategy]]` D2-α + slice 8.1b idempotencyMiddleware.
- **Cockpit error-handling UI** — first-run journey step 6+7 catches second-POST failure; shows "Project created; click here to issue API key" button; user-driven retry hits the idempotent endpoint.
- **Future-flexibility** — multi-key issuance, key naming, key scopes all live cleanly in `/v1/projects/{id}/api-keys` namespace; (E1) bundling would force parameter explosion on `POST /v1/projects`.

Three converging defenses. Confidence: high.

### Why (R2) bare-data + Stripe-wrapped-errors

Production-cited × 3 unambiguous (Stripe / Vercel / Resend all bare scalar). Internal consistency with `[[wallet-http-contract]]` slice 8.1c (already established pattern). Confidence: high.

### Why (Pa-none) at MVP

Production-cited × 1 at MVP scale (Vercel ships small project lists without pagination at indie/SMB-MVP scale per `[[admin-list-endpoints-research]]` F2). 2-person-team audience expected ≤50 projects per org per `[[cockpit-shape]]` (M2) scope. Even Stripe's default `limit: 10` would over-paginate at this volume. Pagination revisited at slice 8.6+ (transaction inspector) when actual list volume crosses the threshold; Stripe cursor pattern adopted then per F3.

### Why (A1) nested `apiKeys[]` on project detail

Production-cited × 2 (Vercel heavy nesting with `env[]` + `latestDeployments[]` + 15+ other fields; Stripe nested list-objects). Powers `[[first-run-journey]]` step 11 (T2) polling without doubling round-trips. Confidence: high.

### Why (Disc-no) no `object` field

2-of-3 production majority (Vercel + Resend without `object`; Stripe with it). Internal consistency with slice 8.1c handlers (no `object` field). Confidence: medium-high — revisit if SDK strategy ever requires runtime type tags for TS discriminated unions.

### Why (Pref-raw) raw UUIDs

Internal consistency with slice 8.1+ existing pattern. Adopting Stripe-style `proj_<UUID>` would force backwards-compat across slice 8.1c wallet handlers (`txn_<UUID>`, `wallet_<UUID>`, etc. — none currently prefixed). Cost-benefit doesn't justify the migration at MVP. Confidence: high.

## Engineering substance applied

- **Consistency:** all six endpoints behind `adminGate` per `[[admin-auth-surface]]` D2. Reads use default Postgres isolation; writes wrapped in `withTenant(db, projectId, ...)` for RLS GUC chain per `[[backend-stack]]` §5. Idempotency-Key on `POST /v1/projects/{id}/api-keys` enables retry-safety per `[[idempotency-strategy]]` D2-α.
- **Failure semantics:** every gate-step failure maps to BC4xx per `[[wallet-mechanics]]` A18 Amendment 2026-05-11. Validation failures (slug-shape, name-length) map to BC400 AdminInvalidInput or 422 with structured detail per `[[wallet-http-contract]]` G5. Cross-org tenancy violations → BC403 AdminCrossOrgForbidden.
- **Concurrency:** project creation race on (organization_id, slug) UNIQUE constraint → 422 `slug_taken` deterministically. API-key creation race on (project_id, name) UNIQUE (if enforced) similar shape. Better Auth session reads concurrent-safe.
- **Observability:** OTel spans per handler (`projects.list`, `projects.create`, `projects.get`, `api_keys.create`, `api_keys.revoke`) — composed inside the `admin.gate` span from middleware. Page-on-`admin.gate auth.outcome != 'pass'` rate per `[[admin-auth-surface]]` *Observability*. Cockpit-side TanStack Query polling traces emerge via Vercel Observability per `[[frontend-stack]]`.
- **Storage:** zero new tables (existing `projects` + `api_keys` schemas). Potential column additions on `api_keys` (`name` + verification of `revoked_at`) per cascade obligation #3.
- **Security:** API key plaintext returned ONCE in `POST /v1/projects/{id}/api-keys` response (K1 visible-once); never retrievable from `GET /v1/projects/{id}` or any subsequent endpoint. HMAC-stored per slice 8.1a. Cross-org access blocked at `adminGate` step 3 (tenancy check).

## Production-grade gates

- **Idiomatic** — bare-data success + Stripe-wrapped errors matches `[[wallet-http-contract]]` G5 internal pattern + production-cited × 3 external. Raw UUIDs match slice 8.1+ internal. No `object` discriminator matches Vercel + Resend (2-of-3) external + slice 8.1c internal. Nested `apiKeys[]` matches Vercel pattern. Split-POST matches Stripe + Vercel + Resend. *(production-cited; confidence: high.)*
- **Industry-standard** — every convention pick has ≥2 production cites + internal pattern. (E2) split-POST has 3-of-3 production cites. *(production-cited × 2+ minimum; confidence: high.)*
- **First-class** — uses Hono native routing (`app.post`, `app.get`, `app.delete`), Drizzle native ORM, Better Auth's `auth.api.hasPermission` via `adminGate`, existing `idempotencyMiddleware` from slice 8.1b for the (E2) retry-safe second POST. Zero new infrastructure. *(first-class-cited; confidence: high.)*

## Rejected alternatives

### Alternative A — (E1) bundled `POST /v1/projects` returns project + plaintext API key

**What:** Single endpoint creates project + auto-issues first API key, returns `{ project, apiKey: { id, prefix, plaintext, name, createdAt } }` in one response.

**Wins when:** Customer-profile-axis defense from `[[wallet-http-contract]]` G5 applies at scope-equivalent magnitude — i.e., developer-onboarding-confidence is the dominant constraint AND production-convergence isn't valued AND future-flexibility on key management isn't valued.

**Why not here:** customer-profile axis precedent applies to wire-shape decisions (G5 was per-error-code numeric detail fields, visible on every API call); bundling-vs-splitting is a request-flow decision affecting one endpoint once per customer. Magnitude mismatch — G5's defense doesn't generalize. Production-cited × 3 split-POST + Idempotency-Key retry pattern handles the race window cleanly.

### Alternative B — (R1) `{ data: ... }` wrapped success envelope

**What:** All success responses wrapped in `{ data: ... }` for consistency with error wrapping.

**Wins when:** SDK client library wants single-shape parsing for success + error responses.

**Why not here:** production-cited × 0 across surveyed B2B SaaS. Stripe / Vercel / Resend all return bare success + wrapped errors. Internal-consistency with slice 8.1c (also bare success + Stripe-wrapped error). Wrapping adds nesting without benefit at MVP scale.

### Alternative C — (R3) Stripe-style `{ object: 'TYPE', ... }` discriminator on every response

**What:** Every scalar response includes `object: 'project'` / `object: 'apiKey'` / `object: 'organization'`. List responses use `{ object: 'list', data, has_more, url }`.

**Wins when:** SDK clients need machine-readable runtime type tags (TS discriminated unions, polymorphic deserializers).

**Why not here:** 2-of-3 production majority (Vercel + Resend) don't use `object` field. Internal consistency with slice 8.1c handlers (no `object` field). BokChoy's TypeScript SDK can use other discriminators (presence of `apiKeys[]` array implies project; etc.). Revisit if SDK strategy explicitly demands runtime type tags.

### Alternative D — (A2) Separate `/v1/projects/{id}/api-keys` GET endpoint for listing

**What:** `GET /v1/projects/{id}` returns project without `apiKeys[]` nested; separate `GET /v1/projects/{id}/api-keys` returns the keys list.

**Wins when:** API-key listing has independent paging/filtering needs OR project detail is small-payload-critical (e.g., very-frequent polling).

**Why not here:** doubles round-trips for `[[first-run-journey]]` step 11 (T2) polling. Project detail payload is small (~500 bytes); inclusion of `apiKeys[]` (5-10 keys typical) keeps total <2KB. Production-cited × 2 nested-array pattern (Vercel + Stripe) supports A1.

### Alternative E — (Pa-cursor) cursor pagination at MVP

**What:** `GET /v1/projects` ships with `?cursor=...&limit=...` from day 1.

**Wins when:** First design partner expected to have >50 projects immediately.

**Why not here:** 2-person-team audience per `[[cockpit-shape]]` has 3-5 projects typical. Pagination at this scale is dead-code complexity. Revisit at slice 8.6+ when transaction inspector ships (actual large-volume list).

### Alternative F — (Pref-stripe) Stripe-style `proj_<UUID>` prefixed IDs

**What:** Resource IDs are `proj_<UUID>` / `key_<UUID>` / `org_<UUID>` / `mem_<UUID>` for type identification.

**Wins when:** Visible-in-debug-logs type tagging is operationally valuable AND backwards-compat across slice 8.1+ existing endpoints is affordable.

**Why not here:** slice 8.1+ uses raw UUIDs across wallet endpoints (txn, wallet, currency, reason_code). Adopting prefixes at slice 8.4 forces either (a) backwards-compat shim (raw UUID accepted alongside prefixed) or (b) migration of all slice 8.1+ endpoints. Cost not justified at MVP. Revisit if visibility issue manifests (multiple support tickets debugging the wrong resource type).

## Failure mode

**Primary failure mode: race window between `POST /v1/projects` and `POST /v1/projects/{id}/api-keys`.** Project created; second POST fails (network, backend crash, transient DB error). User sees project in projects-list but no key issued. SDK calls fail at HMAC verification.

Likelihood: medium-low. Two writes across two requests; second is HMAC + INSERT (low-risk operations).

**Secondary failure mode: cockpit's idempotency-key header collides if user creates two projects with same slug.** `Idempotency-Key: cockpit-first-key-${slug}` would replay across distinct projects.

Likelihood: low. Cockpit should use `cockpit-first-key-${projectId}` (using the returned project.id from first POST), NOT the slug. Documented in `[[first-run-journey]]` step 6 implementation note.

**Tertiary failure mode: deeply-nested `apiKeys[]` array overflow.** At 100+ keys per project, response payload exceeds reasonable size; cockpit polling becomes expensive.

Likelihood: very low. 2-person-team audience uses 1-5 keys per project typical. Revisit at slice 8.6 when key-management UI expands; could add ETags + 304 Not Modified for verify-loop polling efficiency.

## Mitigations

- **(E2) race-window mitigation via `Idempotency-Key`.** Cockpit MUST send `Idempotency-Key: cockpit-first-key-${projectId}` on the second POST per the contract. Backend's existing slice 8.1b `idempotencyMiddleware` handles replay safely.
- **Cockpit error-recovery UI on project-create flow.** Step 6 of `[[first-run-journey]]` mid-failure: cockpit shows "Project created. Issue your first API key" button → idempotent retry POST. ~30 LOC of cockpit error-handling.
- **Idempotency-key namespace discipline.** All cockpit-driven flows use `cockpit-${flow}-${resourceId}` format. Never key off user-mutable values (slug, name).
- **Cap `apiKeys[]` length in response at MVP.** If a project has >50 keys, return first 50 + add `truncated: true` field — for slice 8.4 implementation. (Unlikely at MVP scale; defensive.)

## Idiom citations

- `idioms/typescript.md` (Make impossible states unrepresentable) — `status: 'active' | 'paused' | 'archived'` is a discriminated union typed at the schema layer (Drizzle CHECK constraint per `[[tenancy-ids-research]]:53`). API responses pass the typed enum through; cockpit `useQuery` returns typed data.
- `idioms/typescript.md` (Let the types flow end-to-end) — Drizzle's `$inferSelect` on each table generates the source-of-truth type; backend handlers + cockpit `useQuery` both consume the same generated type via `@bokchoy/db` workspace import. Schema change → automatic type cascade.
- `[[wallet-http-contract]]` G5 — bare success + Stripe-wrapped errors precedent.
- `[[idempotency-strategy]]` D2-α + §Concurrency ON CONFLICT race-loser canonical pattern.
- `[[admin-auth-surface]]` D2 — `adminGate` chain for all six endpoints.

## Revisit when

- **Customer signal that bundled-create-with-key is needed.** If first design partner explicitly asks for single-POST onboarding flow, revisit (E1) bundling on customer-profile axis defense. Trigger: customer ask OR onboarding-funnel metric showing step 6+7 drop-off >10%.
- **Multi-key-per-project demand emerges.** Triggers `POST /v1/projects/{id}/api-keys` parameter expansion: key scopes (`scopes: ['wallet:read', 'wallet:write']`), key expiration (`expiresAt`), key environment (`env: 'live' | 'test'`). Adds fields to current contract without breaking shape.
- **Pagination needed.** Triggers transition from bare-array response to `{ object: 'list', data, has_more, url }` Stripe envelope per `[[admin-list-endpoints-research]]` F2 + F3. Cursor params: `starting_after` / `ending_before` / `limit` (default 10, max 100).
- **`object` discriminator needed.** Triggers (Disc-yes) — adopt Stripe-style discriminator on every response. Cascade: cockpit TS unions consume discriminator; SDK exports type narrowing helpers. Revisit if BokChoy ships an SDK that benefits from runtime tags.
- **Stripe-style ID prefixes adopted.** Triggers (Pref-stripe) — all resource IDs get type-prefix. Cascade: migration across slice 8.1+ wallet handlers; backwards-compat shim for ~1 release. Don't migrate without paying-customer signal.
- **Cockpit polling cost exceeds threshold.** Per OTel observability: if polling-driven request rate exceeds 1% of total request volume per `[[admin-auth-surface]]` *Observability* alerting, revisit T2 polling pattern → consider Server-Sent-Events / WebSocket push for verify-key loop.

## Cascade obligations queued for slice 8.3 + 8.4 implementation

1. **`packages/auth-config/src/index.ts`** — extend `statements` with `project: ['create', 'read'], apiKey: ['create', 'revoke'], org: ['read']`. Extend `adminRole` + `ownerRole` permission maps. Member role unchanged.
2. **`apps/backend/src/projects/` (NEW module)** — six handler implementations: `getOrgMeHandler`, `listProjectsHandler`, `createProjectHandler`, `getProjectHandler`, `createApiKeyHandler`, `revokeApiKeyHandler`. Per `[[backend-service-shape]]` §2 module-by-feature naming.
3. **Drizzle schema verification** — confirm `projects.name`, `projects.slug` unique constraint on `(organization_id, slug)`, `api_keys.name`, `api_keys.revoked_at` columns exist. Migrations added if not.
4. **`apps/backend/src/index.ts`** — mount the new module routes alongside existing `mountWalletRoutes(app)`. New: `mountProjectsRoutes(app)`.
5. **OTel span emission** in each new handler per slice 8.1c precedent (wallet credit/debit handlers).
6. **`/tmp/smoke-8-2.0-admin-gate.sh`** extension — cover the 6 new endpoints + (E2) split-POST flow + idempotency-key retry scenarios + BC4xx error outcomes.
7. **Cockpit consumer wiring** (slice 8.3 + 8.4) — TanStack Query hooks for each endpoint per `[[cockpit-stack-integration-research]]` patterns; RSC session-read via `React.cache(getSession)`; section-level `<Suspense>` boundaries.
