---
type: decision
features: [architecture, wallet, cockpit]
related: ["[[backend-stack]]", "[[better-auth-org-admin-research]]", "[[tenancy-ids-research]]", "[[wallet-http-contract]]", "[[multi-tenant-rls-research]]"]
created: 2026-05-11
confidence: high
---

# Admin auth surface: static AC + single-role + Hono middleware factory + body-or-session org resolution

## Decision

Customer-developer-admin endpoints (`bootstrapProjectReasonCodes`, `walletDeidentifyPlayer`, and future cockpit admin handlers across slices 8.2-8.5) are gated through:

**D1 — `organizationId` resolution.** The gate accepts `organizationId` from either request body/query OR `session.session.activeOrganizationId`. Precedence: body wins when present (matches Better Auth's `||` short-circuit per `crud-members.ts:86` and 9 other call sites). 400 BAD_REQUEST if neither is present.

**D2 — Gate shape.** Hono middleware factory `adminGate({ resource, actions })` registered per-route. Middleware sets typed `c.var.member: Member` + `c.var.org: Organization` so downstream handlers consume verified-admin context without re-checking. Used as `app.post('/admin/.../path', adminGate({ resource: 'reasonCode', actions: ['bootstrap'] }), handler)`.

**D3 — Access control mode.** Static AC at MVP. Statements + roles defined in TypeScript at `packages/auth-config/src/index.ts` startup via `createAccessControl({...})` + `roles: { admin: ... }` passed to `organization({...})`. Dynamic AC + `organizationRole` table deferred to RBAC-plugin slice post-MVP per `[[backend-stack]]` §7 line 117.

**D4 — Schema scope at MVP.** Keep current `packages/db/src/schema/auth.ts` shape: `user`/`session`/`account`/`verification` + `organization`/`member`/`invitation`. `team`/`teamMember`/`organizationRole` tables NOT added — neither is required for static-AC + single-role + single-user-per-org-at-MVP per `[[backend-stack]]` §7 line 105 ("customer-team-members deferred at MVP").

**D5 — MVP statement + role set.**
```ts
const ac = createAccessControl({
  reasonCode: ['bootstrap'],   // bootstrapProjectReasonCodes
  player: ['deidentify'],       // walletDeidentifyPlayer
} as const);

const adminRole = ac.newRole({
  reasonCode: ['bootstrap'],
  player: ['deidentify'],
});

// plugins: [anonymous(), organization({ ac, roles: { admin: adminRole } })]
```

The existing `owner` and `member` Better Auth defaults remain. `member.role === 'member'` (Better Auth's default for newly-created memberships) has ZERO BokChoy-admin permissions; only members promoted to `"admin"` (or `"owner"` if owner-inherits-all-admin-rights is desired) pass `adminGate`. Every new admin endpoint across slices 8.2-8.5 extends the statement set + `adminRole` permission map by a single `as const` literal — 2-line edit per endpoint.

**Contract — `adminGate({ resource, actions })` middleware.** The middleware's 5-step gate:

1. Validate Better Auth session via `auth.api.getSession({ headers: c.req.raw.headers })`. If null → 401 **BC401 AdminUnauthenticated**.
2. Resolve org: `ctx.body.organizationId ?? ctx.query.organizationId ?? session.session.activeOrganizationId`. If null → 400 **BC400 AdminContextMissing**. If present but not a valid UUID, OR (when `projectIdParam` is set) the URL param is missing / malformed UUID → 400 **BC402 AdminInvalidInput**.
3. **BokChoy-side tenancy check** (per `[[multi-tenant-rls-research]]` + `[[backend-stack]]` §5): if the route operates on a `project_id`, JOIN `projects` and verify `project.organization_id === resolvedOrgId`. Mismatch (or project does not exist) → 403 **BC403 AdminCrossOrgForbidden**.
4. Look up member: `db.select().from(member).where(and(eq(member.userId, session.user.id), eq(member.organizationId, resolvedOrgId)))`. Empty (including race with concurrent org delete) → 403 **BC404 AdminNotAMember**.
5. Permission check: `auth.api.hasPermission({ headers: c.req.raw.headers, body: { permissions: { [resource]: actions } } })`. False → 403 **BC405 AdminInsufficientPermissions**.
6. Set `c.set('member', member)` + `c.set('org', org)` + `next()`.

The Hono `Variables` generic carries `{ member: Member; org: Organization }` so handler bodies type-cannot-run without verified admin context. Per `idioms/typescript.md` *Make impossible states unrepresentable*.

Error codes BC400-BC405 allocated in `[[wallet-mechanics]]` Amendment 2026-05-11 — BC400-BC499 reserved for auth/authorization, one code per semantic outcome matching the existing BCxxx convention. Granular allocation (vs broad-stroke BC400/BC401/BC403 that shipped in slice 8.2.0's initial admin-gate.ts) defended on (a) internal consistency with 10 existing BC codes, (b) customer-profile axis from `[[wallet-http-contract]]` G5 amendment (developer-facing SDK during dev — snapshot-at-error matters), (c) asymmetric reversibility (drop unused codes is cheap; consumer-migration if codes split later is not).

## Reasoning

### D1 — Body-or-session is Better Auth's own production pattern, not a choice between two

The /research seat's prior framing of D1 as "(a) body-only vs (b) session-only" was wrong. Better Auth's own production code (commit `e21d744`, HEAD 2026-05-11) accepts BOTH across 10+ call sites: `crud-members.ts:86,285,518,919,1011`, `crud-org.ts:432`, `crud-invites.ts:190,1120`, `crud-access-control.ts:124,327,556,695,899`. The actual question is precedence + fallback semantics, not pick-one.

Body-wins-on-conflict is safe at the trust boundary because the BokChoy-side tenancy check (step 3) catches the actual cross-org breach: if `session.activeOrganizationId = "org-A"` but `body.organizationId = "org-B"` and the project belongs to `org-A`, the tenancy check fails. Better Auth's `||` semantics are production-cited and don't open a new attack surface. (production-cited: Better Auth `crud-*.ts` × 10 call sites; confidence: high.)

### D2 — Hono middleware factory matches BokChoy's internal precedent + Hono's first-class composition

Three converging defenses:

1. **BokChoy already established Hono middleware as the cross-cutting pattern.** Slice 8.1a shipped `api-key-middleware.ts`; slice 8.1b shipped `idempotency/middleware.ts`; slice 8.1c shipped `infra/error-middleware.ts`. Three prior slices, three middleware. Inline gate would be the only cross-cutting concern *not* in middleware — an internal inconsistency. (production-cited: BokChoy slices 8.1a/b/c; confidence: high.)

2. **Hono middleware is the first-class composition primitive** for "do this before the handler runs." Per the *Production-grade default* third gate (first-class, not workaround), middleware-factory uses Hono's intended abstraction. The inline-per-handler pattern (Better Auth's internal style) is framework-agnostic by construction — Better Auth ships to Hono/Express/Fastify/Next.js — and that constraint doesn't bind BokChoy. (docs-cited: Hono middleware composition is canonical per hono.dev; confidence: high.)

3. **Typed `c.var.member` + `c.var.org`** make admin-context-missing a compile-time error. Per `idioms/typescript.md` *Make impossible states unrepresentable* — handler signature can't run without verified context. Inline-per-handler pattern requires `member` to be derived locally (5 LOC) at each handler top, then carries it as a function-scoped variable; type discipline is per-handler, not enforced by signature. (idiom-cited: `idioms/typescript.md` *Make impossible states unrepresentable*; confidence: high for the principle, medium-high for the BokChoy-specific application since I have not source-walked a public B2B SaaS shipping Better Auth + Hono + middleware-factory admin gates — gap flagged in *Open threads*.)

### D3 — Static AC at MVP because dynamic AC has no MVP consumer

`[[backend-stack]]` §7 (line 117) committed *"single role at MVP; RBAC plugin post-MVP"* on 2026-05-03. The current `packages/db/src/schema/auth.ts` (last touched on the schema-baseline commit) confirms the commitment in code — the `organizationRole` table required by Better Auth's `dynamicAccessControl: { enabled: true }` is not present. Static AC = statements + roles defined at startup in TS = zero new tables + immutable-per-deploy + auditable in one file. (production-cited via Better Auth's own org plugin code path: `has-permission.ts:24-34` switches between in-memory roles option and `organizationRole` DB lookup based on `dynamicAccessControl.enabled` flag; confidence: high.)

Dynamic AC's winning conditions — customer-developer needs to create new roles per-org at runtime via cockpit UI — are post-MVP per the same `[[backend-stack]]` §7 commitment. Adding the schema + plugin config now would be unused capacity.

### D4 — No `organizationRole`/`team`/`teamMember` at MVP

Direct corollaries of D3 + `[[backend-stack]]` §7 line 105 ("customer-team-members deferred at MVP — single-user-per-org acceptable initially"). The omission is intentional, not oversight. Schema baseline already reflects this.

### D5 — Two statements + one admin role is the smallest set that maps every named consumer

`[[wallet-http-contract]]:24,207` names two admin endpoints (`bootstrapProjectReasonCodes`, `walletDeidentifyPlayer`). The statement set `{ reasonCode: ['bootstrap'], player: ['deidentify'] }` covers both exactly. A single `"admin"` role granting both permissions is the smallest role set per `[[backend-stack]]` §7 single-role commitment.

The structure is extension-ready: each new admin endpoint adds one `as const` literal to the statement object + one entry to the `adminRole` permission map. 2-line edit per endpoint. No schema migration, no role rename, no role-permission table.

## Engineering substance applied

- **Consistency:** Better Auth session validation fails-closed (no session = 401). RLS GUC chain fails-closed per `[[multi-tenant-rls-research]]` (no `SET LOCAL app.current_tenant` = `current_setting()::UUID` errors). BokChoy-side tenancy check (step 3) fails-closed (mismatch = 403, no silent fallthrough). The 5-step gate composes three independent fail-closed defenses; bypassing requires breaching all three simultaneously.
- **Failure semantics:** at-most-once per request. The gate runs once per request via Hono middleware; no retry loop, no idempotency concerns at the gate layer (idempotency is downstream per `[[idempotency-strategy]]`). On any step's failure, the entire chain aborts with the named BC4xx error code.
- **Concurrency:** the gate's three DB reads (session lookup via Better Auth, project tenancy join, member lookup) are independent reads inside the request-scoped transaction wrapped by `withTenant()` per `[[backend-stack]]` §3. `hasPermission`'s in-memory `cacheAllRoles` (`permission.ts:33-38`) caches the role-permission map per `organizationId` across requests — safe because static AC's roles are immutable per deploy. (production-cited: Better Auth `permission.ts:73-76` opt-in via `useMemoryCache: true`; confidence: high.)
- **Observability:** OTel span emitted from the middleware with attributes `auth.organizationId`, `auth.userId`, `auth.role` (`member.role` value), `auth.resource`, `auth.actions`, `auth.outcome` (`pass` | `fail.401` | `fail.400` | `fail.403_cross_org` | `fail.403_not_member` | `fail.403_perm`). Page on `auth.outcome != 'pass'` rate exceeding 5% over 5min per project — surfaces cockpit misconfig OR active credential-stuffing on admin endpoints. (cross-ref: `[[wallet-http-contract]]` §Observability; cite class: BokChoy-internal pattern from slice 8.1b telemetry layer 1.)
- **Storage:** zero new tables. Existing `member.role: text NOT NULL DEFAULT 'member'` already in `packages/db/src/schema/auth.ts`. Better Auth-side: zero migrations.
- **Security:** trust boundary at session validation. Beyond it, customer-developer-admin's blast radius is their own org's projects + players + reason codes only. Cross-org access blocked at step 3 even with valid session. BokChoy-staff cross-org admin is a separate-plugin question (Better Auth `admin` plugin per `[[better-auth-org-admin-research]]` C2) — explicitly out of this entry's scope.

## Production-grade gates

- **Idiomatic** — Hono middleware composition matches BokChoy's internal precedent across 3 prior slices (`api-key-middleware`, `idempotency/middleware`, `error-middleware`); Better Auth's `hasPermission` call shape matches the production source-walk per `[[better-auth-org-admin-research]]` Source 1; `idioms/typescript.md` *Make impossible states unrepresentable* applies via Hono `Variables` typing. **(production-cited; confidence: high.)**
- **Industry-standard** — Better Auth's organization plugin is production-cited at Cal.com + Deel.com + MeetingBaas + dough.ink per `[[backend-stack-research]]` Sources 8-9; `hasPermission` is the documented + source-walked canonical server-side permission check (Source 2 in `[[better-auth-org-admin-research]]`). Two named production systems clears the floor. **(production-cited × 2; confidence: high.)**
- **First-class** — `hasPermission()` is Better Auth's intended permission abstraction; Hono middleware is Hono's intended composition primitive; static AC via `createAccessControl()` is Better Auth's intended config-time role declaration. Zero workarounds; every primitive is the platform's first-class shape. **(first-class-cited; confidence: high.)**

## Rejected alternatives

### Alternative A — (β) Session-only `organizationId` resolution (rejected on D1)
**What:** Reject explicit `organizationId` from body/query. Always read from `session.session.activeOrganizationId`. Caller must call `setActiveOrganization()` before admin endpoints.
**Wins when:** Cockpit-only consumer with no scripted admin invocation path; want session to be the single source of truth for org context.
**Why not here:** `walletDeidentifyPlayer` may be invoked by customer-developer's GDPR DSR automation (scripted, non-cockpit). Rejecting body forces the DSR script to manage Better Auth session cookies — UX trap for scripted callers. Better Auth's own routes accept both; deviating from production-cited × 10 pattern needs a stronger reason than we have.

### Alternative B — (γ) Body/query required, session not consulted (rejected on D1)
**What:** Require explicit `organizationId` in every admin request; ignore `session.activeOrganizationId`.
**Wins when:** Distrust of `setActiveOrganization()` discipline — operators want all org context to be explicit at the wire.
**Why not here:** Better Auth's session model exists exactly to carry implicit context for browser-driven flows. Rejecting it forfeits cockpit ergonomics for a hypothetical discipline concern. The BokChoy-side tenancy check (step 3) is the actual security boundary; the body-vs-session source doesn't open or close a vulnerability.

### Alternative C — (ν) Inline per-handler gate (rejected on D2)
**What:** Every admin handler starts with 5 LOC of session → org-resolve → tenancy → member-lookup → permission-check before the actual logic. Matches Better Auth's own internal style at every protected route in `crud-org.ts`, `crud-team.ts`, `crud-members.ts`, `crud-invites.ts`, `crud-access-control.ts`.
**Wins when:** BokChoy extracts the admin module to a framework-agnostic package consumed by non-Hono surfaces (e.g., a TanStack-Start-only cockpit binary, an Express-based dev tooling endpoint, a CLI that imports admin handlers as functions).
**Why not here:** BokChoy commits to Hono per `[[backend-stack]]`; framework-agnosticity is not a constraint. Internal inconsistency with 3 prior slices' middleware pattern would be the cost; typed `c.var.member` enforcement would be lost (each handler reconstructs the type discipline manually). Better Auth's choice of inline is framework-agnostic-by-construction (they ship to all TS frameworks); the same reasoning doesn't transfer.

### Alternative D — (ξ) Helper function called inline at handler top (rejected on D2)
**What:** `const { member, org } = await requireAdmin(c, { resource, actions });` at the start of each handler. DRY (one function) + explicit (call shown in handler).
**Wins when:** Hono's middleware abstraction has a property (e.g., context-key collisions across middlewares) that makes the middleware-factory pattern fragile.
**Why not here:** No such collision identified in the surveyed Hono surface. Hono's `Variables` generic + namespaced keys (if needed) resolves any future collision mechanically. The helper-function pattern reads identically to (ν) at the handler level but loses the route-line visibility of `adminGate({...})` as a named gate at registration.

### Alternative E — Dynamic AC at MVP via `dynamicAccessControl: { enabled: true }` + `organizationRole` table (rejected on D3)
**What:** Enable Better Auth's dynamic access control plugin at MVP. Customer-developers can create roles per-org at runtime via cockpit UI. Schema adds `organizationRole` table.
**Wins when:** First paying customer demands runtime role customization OR cockpit's product surface includes role-creation as a primary feature OR > 2 distinct admin scopes emerge that need customer-tunable composition.
**Why not here:** Zero of the winning conditions hold at MVP. `[[backend-stack]]` §7 committed "RBAC plugin post-MVP" two weeks ago; nothing has surfaced to flip the commitment. Adding the schema + plugin config now is unused capacity that BokChoy would pay attention-tax on at every future schema migration.

### Alternative F — Multiple roles at MVP (`admin` + `compliance` + `billing`) (rejected on D5)
**What:** Split `admin` into specialized roles: `compliance` (deidentify only), `billing` (bootstrap codes + future billing endpoints), `build` (catalog publish + future build endpoints).
**Wins when:** ≥ 3 admin endpoints emerge with disjoint permission scopes AND customer-developer organizations want to separate the people who hold each scope (privacy-officer ≠ billing-ops ≠ build-engineer).
**Why not here:** Two admin endpoints today, both in the "customer-developer org-admin acting on org-scoped resources" class. No separation-of-concerns customer signal. Better Auth's comma-separated multi-role support (per `[[better-auth-org-admin-research]]` F4) provides free headroom — when the third role-class need emerges, splitting `admin` into specialized roles is a TS edit, not a schema migration.

## Failure mode

**Primary failure mode: `member.role` set to a string that doesn't exist in the static `roles` config.** If `member.role = "admin"` but `createAuth()` only registers `roles: { compliance: ... }` (typo or missed migration after a role rename), `hasPermission` returns `false` for every check and the customer-developer is locked out of every admin endpoint silently — observable only as a sustained 403 BC405 rate per org.

Likelihood: low-medium. The static-AC path makes this a startup-time observable: `createAccessControl({...})` + `roles: {...}` is one config object; CI lint can assert that every `member.role` value found in the production `member` table is a key in the `roles` config (post-deploy verification, not pre-deploy because the data lives in the DB).

**Secondary failure mode: middleware context-key collision.** If another middleware (e.g. `api-key-middleware`) sets `c.set('member', ...)` for a different purpose, the type-cast inside admin handler bodies returns the wrong shape. Type system would catch shape mismatch; semantic mismatch (same shape, wrong identity) wouldn't.

Likelihood: low. BokChoy's existing middlewares set distinct keys (`apiKey`, `projectId`, etc.); namespacing `adminGate` keys as `c.set('admin:member', ...)` removes ambiguity for ~zero cost.

**Tertiary failure mode: F5 in `[[backend-stack]]` re-emerges.** Custom organization-member fields breaking Better Auth UI components. Per `[[better-auth-org-admin-research]]` F5-clearance, this is bundled-UI-only and BokChoy doesn't use Better Auth UI. Cleared.

## Mitigations

- **CI lint for role consistency.** Post-migration smoke that queries `SELECT DISTINCT role FROM member` and asserts every value is a key in the `roles` config object exported from `packages/auth-config/src/index.ts`. Add to `scripts/check-auth-roles.ts` (new file, ~30 LOC). Run in deploy pipeline after migrations apply. Failure = deploy abort.
- **Namespaced middleware context keys.** `adminGate` sets `c.set('admin.member', ...)` and `c.set('admin.org', ...)` with the `admin.` prefix. Hono `Variables` generic declares `{ 'admin.member': Member; 'admin.org': Organization }`. Eliminates collision class.
- **Sustained 403 rate alerting.** Page on `auth.outcome != 'pass'` rate > 5% over 5min per project per the observability section above. Catches both adversarial probing AND role-misconfig within minutes.
- **`adminGate` integration smoke** ships alongside slice 8.2.1 first consumer as `/tmp/smoke-8-2.0-admin-gate.sh`, exercising the full 5-step gate end-to-end against the running backend with real Better Auth sessions + seeded `member` / `organization` / `projects` rows. Three positive cases (admin role passes, owner role passes, custom role with the same permissions passes) and six negative cases — one per BC4xx code: BC400 missing org, BC401 no session, BC402 malformed UUID, BC403 cross-org project, BC404 member-removed-from-org, BC405 member without required permission. Project convention is shell smoke scripts at `/tmp/smoke-8-*.sh` for HTTP-middleware end-to-end testing (precedent: slices 8.1a/b/c/.6 each shipped this way); `bun:test` reserved for pure-logic units only (precedent: `packages/wallet/src/sqlstate-to-error.test.ts`). Amended 2026-05-11 per `[[gaps]]` Gap 1 resolution — the prior `apps/backend/src/admin/admin-gate.test.ts` path was a /design improvisation that didn't match the project's HTTP-middleware test convention.

## Idiom citations

- **`idioms/typescript.md` (Make impossible states unrepresentable):** Hono `Variables` generic typed as `{ 'admin.member': Member; 'admin.org': Organization }` makes admin handler bodies compile-incapable of running without verified context. Handler signature trusts the type; per the idiom, validation at the parser boundary, downstream code trusts the type.
- **`idioms/typescript.md` (Pass objects, not positional args):** `adminGate({ resource, actions })` is the object-argument factory shape, not `adminGate(resource, actions)`. Order-independent at the call site; self-documenting at the route registration.
- **`idioms/typescript.md` (Let the types flow end-to-end):** `Member` and `Organization` types are derived from Drizzle's `member.$inferSelect` and `organization.$inferSelect` (not redeclared) so any schema change cascades to the middleware + every consumer automatically.

## Revisit when

- **Dynamic AC** (D3 flip): customer-developer cockpit feature surface includes runtime role creation per org, OR > 2 distinct admin scopes emerge that customer-developers need to tune per-org, OR > 2 customer-developer team-members per org (Better Auth team plugin) becomes a paying-customer ask.
- **Multi-role split** (D5 flip): ≥ 3 admin endpoints emerge with disjoint permission scopes AND customer signal arrives that the same human shouldn't hold all three (compliance officer ≠ build engineer separation).
- **Session-only D1** (D1 flip): a customer-developer admin endpoint surfaces where conflict-between-body-and-session has business semantics distinct from "body wins" (e.g., audit-log endpoint that must record the *session-context* org, not the body-asserted org). Single named consumer is enough to revisit.
- **Inline gate D2** (D2 flip): BokChoy extracts the admin module to a framework-agnostic package consumed by non-Hono surfaces. No current trigger.
- **`organizationRole`/`team` tables** (D4 flip): triggered by D3 (dynamic AC) and/or by `[[backend-stack]]` §7's customer-team-members deferral being closed. Cascades to schema migration + Better Auth plugin config.
- **Better Auth org plugin rewrite** (PRs `#7251` + 5 follow-ups per `[[better-auth-org-admin-research]]` C1): when the rewrite merges to a stable release. Pin Better Auth version in `packages/auth-config/package.json` until then; re-survey on bump.

## Open threads (carried)

- **Path discrepancy cascade-cleanup.** `[[tenancy-ids-research]]:256`, `[[wallet-mechanics]]` A12 cascade, and several `state.md` entries reference `apps/auth-config/`. The actual workspace is `packages/auth-config/` (`packages/auth-config/src/index.ts` already present with `createAuth()` factory). One-pass amendment owed to those three vault entries during next /refactoring or /design cleanup pass.
- **Production-cite gap for D2-(μ).** I have not source-walked a public B2B SaaS shipping Better Auth + Hono + middleware-factory admin gates. The (μ) defense rests on (a) BokChoy-internal precedent × 3 slices, (b) Hono first-class composition (docs-cited), (c) idiom `Make impossible states unrepresentable`. Strength: medium-high. Upgrade to high would require finding a Cal.com / Deel.com / MeetingBaas public source-walk showing the same shape. Out of scope this session; flag for a future /research pass if any constraint forces revisiting D2.
- **~~BC400/BC401/BC403 error code allocation in `[[wallet-mechanics]]` A18~~** — RESOLVED 2026-05-11 per `[[gaps]]` Gap 2 resolution. BC400-BC499 reserved for auth/authorization in `[[wallet-mechanics]]` Amendment 2026-05-11. Allocated BC400 AdminContextMissing / BC401 AdminUnauthenticated / BC402 AdminInvalidInput / BC403 AdminCrossOrgForbidden / BC404 AdminNotAMember / BC405 AdminInsufficientPermissions — granular per-outcome (β-pick) defended on internal-consistency + customer-profile-axis + asymmetric-reversibility. Cascade obligation: ~15-LOC code amendment to `admin-gate.ts` + `error-middleware.ts` in slice 8.2.1 prep.
