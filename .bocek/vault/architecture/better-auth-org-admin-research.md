---
type: research
features: [architecture, wallet, cockpit]
related: ["[[backend-stack]]", "[[backend-stack-research]]", "[[tenancy-ids-research]]", "[[wallet-http-contract]]"]
created: 2026-05-11
confidence: high
provisional: false
---

# How does Better Auth's `organization` plugin gate admin endpoints in 2026, given BokChoy's "single role at MVP" posture?

## Question

`[[backend-stack]]` §7 vaulted *"Admin SSO = Better Auth's OAuth providers (Google or GitHub) with explicit role-based access (single role at MVP; RBAC plugin post-MVP)"* and named `bootstrapProjectReasonCodes` + `walletDeidentifyPlayer` as customer-developer-admin endpoints needing the org plugin per `[[wallet-http-contract]]:24,207`. Three sub-questions left unvaulted:

- (a) How is "single role at MVP" actually implemented — `member.role` string compare, the access-control system, custom user field, or `organizationRole` table?
- (b) Where does the gate land — middleware decorator, manual call at handler top, or Better Auth-internal session check?
- (c) What does the session carry for admin endpoints — does `getSession()` return role/membership, or is a separate lookup required?

Plus the (P1 vs P2) design-input question from /design: is the right MVP shape *(P1)* one privileged role string with non-privileged members blocked, or *(P2)* all-org-members-equally-privileged with role differentiation deferred to RBAC plugin?

## Triangulation

- **Production reference:** ✓ `better-auth/better-auth` repo source-walked at commit `e21d744987476c20a934c79ef226fe6a5f468e22` (HEAD as of 2026-05-11). Specifically `packages/better-auth/src/plugins/organization/` (org plugin) + `packages/better-auth/src/plugins/access/` (access control primitive).
- **Docs reference:** ✓ `better-auth.com/docs/plugins/organization` v1.6 (current as of 2026-05-11; version visible in page header).
- **Contradiction probe:** ✓ Searched GitHub issues for `hasPermission middleware admin` — surfaced PR `#7251` + `#7544` + `#7591` + `#7601` + `#7628` + `#7886` (org plugin rewrite in progress, current v1.6 stable but API may shift in next minor/major). Searched demo app for non-`hasPermission` admin gating patterns — found demo's `/admin` route uses `session.user.role !== "admin"` (string compare on `user.role`), but that's the **separate `admin` plugin** for instance-level admin, NOT the `organization` plugin's `member.role`. No production team found using raw `member.role` string compare for org-scoped admin endpoints.

## Sources examined

### Source 1 — Better Auth org plugin source-walk

- **Tier:** 1 (production code).
- **Provenance:** `better-auth/better-auth` repo, commit `e21d744`, cloned to `/tmp/bocek-ref-better-auth-better-auth` 2026-05-11. Files read linearly:
  - `packages/better-auth/src/plugins/organization/has-permission.ts:1-79` — `hasPermission()` server-side function.
  - `packages/better-auth/src/plugins/organization/permission.ts:1-44` — `hasPermissionFn` core matcher; comma-split role parsing at line 12; `creatorRole` default `"owner"` at line 13.
  - `packages/better-auth/src/plugins/organization/access/statement.ts:1-41` — `defaultStatements`, `defaultRoles` (`owner`/`admin`/`member`), `adminAc`/`ownerAc`/`memberAc` permission sets.
  - `packages/better-auth/src/plugins/access/access.ts:1-89` — `createAccessControl()` + `role().authorize()` AND/OR connector logic.
  - `packages/better-auth/src/plugins/organization/schema.ts:130-152` — `member.role` schema: `type: "string"`, `required: true`, `defaultValue: "member"`.
  - `packages/better-auth/src/plugins/organization/routes/crud-org.ts:440-466` — canonical gate pattern in production code.
  - `packages/better-auth/src/plugins/organization/routes/crud-members.ts:714+,997+` — `getActiveMember`, `getActiveMemberRole` endpoints; session reads `activeOrganizationId` from `session.session.activeOrganizationId`.
  - `packages/better-auth/src/plugins/organization/routes/crud-org.ts:732-792` — `setActiveOrganization` route that mutates session payload.
- **Author context:** Maintainer `ping-maxwell` per PR #7251 author + member status on org plugin rewrite series. YC X25-backed, Better Auth core team. v1.5.0 released 2026-03-01 with 600+ commits; v1.6 current per docs.
- **What it tells us:** The org plugin ships a permission-based gate (`hasPermission()`), called manually at the top of every protected route. `member.role` is a string column on the `member` table (comma-separated for multi-role); default `"member"` (no permissions); `"admin"` and `"owner"` get statement-based permissions per `access/statement.ts`. Session carries `activeOrganizationId` (and `activeTeamId` if teams enabled) — role/member info NOT on session, must be looked up via `adapter.findMemberByOrgId({ userId, organizationId })`.

### Source 2 — Better Auth docs

- **Tier:** 2 (official docs).
- **Provenance:** `better-auth.com/docs/plugins/organization` (v1.6 visible in page header), fetched 2026-05-11.
- **Author context:** Better Auth maintainers; YC X25; ~3 releases/week per `[[backend-stack-research]]` Source 6.
- **What it tells us:**
  - Default roles `owner` / `admin` / `member` confirmed at docs surface.
  - `auth.api.hasPermission()` is the server-side endpoint — signature: `{ headers, body: { permissions: { resource: ["action"] } } }`. Maps to `Source 1` `hasPermission()` internals.
  - `authClient.organization.checkRolePermission()` exists as **client-only synchronous** check — does NOT hit the database; only validates against statically-known roles. Useless for dynamic roles.
  - **No middleware decorator documented.** The doc's protection example for admin endpoints is the same `hasPermission()` call called manually. No `requireAdmin()` / `withRole()` / annotation pattern.
  - Static access control (`createAccessControl()`) vs dynamic access control (`dynamicAccessControl: { enabled: true }`) — runtime role creation per org stored in `organizationRole` table.
  - Session: `activeOrganizationId` + `activeTeamId` added to session; role/member NOT on session.
  - Confirms `getActiveMember()` / `getActiveMemberRole()` as the separate-lookup APIs.

### Source 3 — Org plugin rewrite PRs (stability signal)

- **Tier:** 4 (engineering discussion, named maintainer).
- **Provenance:** GitHub issues / PRs `#7251` (2026-01-10) → `#7544` → `#7591` → `#7601` → `#7628` → `#7886`. Maintainer comments from `ping-maxwell`.
- **Author context:** Better Auth core maintainer; in-flight refactor across multiple PRs through 2026-Q1/Q2.
- **What it tells us:** Org plugin is mid-rewrite. v1.5/v1.6 API surface stable, but maintainer stated *"this couldn't make it into the 1.5 timeline, so it's pushed to the next minor/major release"* (2026-03-02). Rewrite goals include modular addon system, typed schemas, default-RBAC-roles with in-memory permission checks (already shipped per `has-permission.ts:73-76` `cacheAllRoles.get(organizationId)`), pagination on listing endpoints, optional slugs. Signal: pin Better Auth version when implementing; expect minor-version migration work on next bump.

### Source 4 — Demo app admin route (contradiction probe)

- **Tier:** 1 (production code, same repo).
- **Provenance:** `/tmp/bocek-ref-better-auth-better-auth/demo/nextjs/app/admin/page.tsx:58,71`.
- **What it tells us:** Demo app's `/admin` route gates with `session?.user?.role !== "admin"` — direct string compare on `user.role`. This is the **`admin` plugin** (separate from `organization` plugin), used for instance-level admin actions (listUsers, banUser, impersonate). Confirms the two plugins are architecturally distinct surfaces. NOT a contradiction of the org-plugin pattern; it's a different consumer.

## Findings

### F1 (LOAD-BEARING) — Canonical admin gate is `hasPermission()` called manually at handler top

Every protected route in the org plugin's own source code follows this exact shape (`crud-org.ts:440-466`, repeated at `crud-team.ts:123/288/467/1013/1187`, `crud-members.ts:352/612`, `crud-invites.ts:215/907`, `crud-access-control.ts:124/327/556/695/899`):

```ts
const member = await adapter.findMemberByOrgId({
  userId: session.user.id,
  organizationId,
});
if (!member) {
  throw APIError.from("BAD_REQUEST", ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION);
}
const canDoX = await hasPermission(
  {
    permissions: { resource: ["action"] },
    role: member.role,
    options: ctx.context.orgOptions,
    organizationId,
  },
  ctx,
);
if (!canDoX) {
  throw APIError.from("FORBIDDEN", ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_X);
}
```

**No middleware decorator exists** in Better Auth's surface (confirmed Source 1 + Source 2). Manual call at the top of each handler is the production pattern — Better Auth's own routes do it this way ubiquitously. The maintainer team had access to write a `@requireAdmin` decorator and didn't; that's a design choice, not an oversight.

The (P1 vs P2) question is decisively settled: **(P1) is the production-cited pattern**. `member.role === "member"` (the default) has ZERO permissions per `access/statement.ts:29-35` (only `ac: ["read"]`); only `"admin"` or `"owner"` (or custom role with explicit grant) passes. (P2) would require custom AC config that grants `member` role write permissions — a regression versus defaults, undefended in the surveyed source.

### F2 — Session carries `activeOrganizationId` only; role lookup is a separate adapter call

`session.session.activeOrganizationId` is the only org-context field on the session (Source 1 `crud-members.ts:81`; Source 2 docs). `member.role` is NOT on the session. Every protected route does:

```ts
const member = await adapter.findMemberByOrgId({
  userId: session.user.id,
  organizationId: ctx.body.organizationId || session.session.activeOrganizationId,
});
```

Implication: a Hono middleware that gates admin endpoints does **one** session read (Better Auth's `getSession()`) + **one** adapter lookup (`findMemberByOrgId`) + **one** `hasPermission()` call. Three async operations per gated request. In-memory cache for repeated `hasPermission()` calls within the same request lives in `cacheAllRoles` (Source 1 `permission.ts:33-38`) — the role-permission map is cached per `organizationId`, NOT per-request, so repeated calls in the same handler can opt in via `useMemoryCache: true`.

`activeOrganizationId` is set by either (a) `setActiveOrganization()` route (`crud-org.ts:750`), (b) automatic-on-create / automatic-on-membership-removal flows in the plugin itself, or (c) BokChoy can pass `organizationId` explicitly in body/query — the org plugin's own routes accept either source (`crud-members.ts:86`, `crud-org.ts:432`).

### F3 — Default `admin` role permissions don't include BokChoy resources; custom statements required

`access/statement.ts:3-9` ships these default statements:
- `organization`: `["update", "delete"]`
- `member`: `["create", "update", "delete"]`
- `invitation`: `["create", "cancel"]`
- `team`: `["create", "update", "delete"]`
- `ac`: `["create", "read", "update", "delete"]`

**Neither `project`, `wallet`, `player`, nor `reasonCode` is a default resource.** BokChoy must extend statements via its own `createAccessControl()` config to add the resources its admin endpoints gate on. The docs example uses `project: ["create", "share", "update", "delete"]` as the canonical pattern — BokChoy needs an equivalent for at least:
- `reasonCode: ["bootstrap"]` (for `bootstrapProjectReasonCodes`)
- `player: ["deidentify"]` (for `walletDeidentifyPlayer`)

…and any future admin resources. The `admin` and `owner` default roles must then be re-derived from the extended statement set with the new permissions explicitly granted, OR BokChoy can define its own role names entirely (the `roles` option in `OrganizationOptions` per `types.ts:72-79`).

### F4 — Multi-role support is built-in via comma-separated string

`permission.ts:12`: `const roles = input.role.split(",");`. `member.role` is conceptually `"admin"` OR `"admin,sale"` OR `"admin,owner"`. The check passes if ANY of the user's roles authorizes the requested permission (OR-of-roles semantics; line 19-25). Implication: BokChoy can model "billing admin" and "compliance admin" as distinct roles without forking the schema; member rows just carry both names comma-separated.

Single-role-at-MVP per `[[backend-stack]]` §7 doesn't require this, but the headroom is free.

## Conflicts

### C1 — Org plugin is mid-rewrite (Source 3 vs vault commit posture)

`[[backend-stack]]` §F5 vaulted a known risk on "Better Auth org plugin custom-field UI breakage." Source 3 surfaces a related-but-distinct stability signal: the entire org plugin is undergoing a multi-PR rewrite through 2026-Q1/Q2 (PRs `#7251` + 5 follow-ups). Current v1.6 API surface is stable; the rewrite is opt-in via separate addon registration per the PR `#7251` body. **Per Contradiction protocol (production code wins), the current code is what we build against.** The rewrite is a future-migration cost, not a current-incompatibility — pin Better Auth version explicitly in BokChoy's `package.json` until rewrite stabilizes.

### C2 — Demo app uses `user.role` not `member.role` (Source 4)

The demo app's `/admin` route gates with `session.user.role !== "admin"`. This is **NOT a contradiction of F1** — it's the `admin` plugin (instance-level), a different surface than the `organization` plugin (org-scoped). Names colliding ("admin" the role string appears in both plugins) — surface this in the BokChoy implementation to avoid confusion: BokChoy's customer-developer-admin uses `member.role`; if BokChoy ever ships instance-admin (BokChoy-staff acting cross-org for support/compliance), that's a separate decision invoking the `admin` plugin, NOT a second org-plugin role.

## Conditions

- **Better Auth v1.6.** Findings apply to current API surface. Org plugin rewrite (Source 3) may change signatures; pin version, re-survey on bump.
- **Customer-developer-admin axis only.** Findings cover *admin-of-org* gates. Instance-admin (BokChoy-staff cross-org) is the separate `admin` plugin, not covered here.
- **Single-role-at-MVP posture from `[[backend-stack]]` §7.** Findings hold under both this posture and post-MVP RBAC-plugin expansion — the API surface is the same; only the role string set widens.
- **Session-token-based auth.** Findings assume Better Auth cookie/session flow per `[[backend-stack]]` §4. Token-based / SDK-key auth uses the BokChoy-issued HMAC key per `[[backend-stack]]` §7 line 118 — separate path; the org-plugin admin gate does NOT apply to SDK-key-authed requests (player-side wallet operations).

## Operational implications

### For `bootstrapProjectReasonCodes` and `walletDeidentifyPlayer` HTTP handlers (slice 8.2 candidates)

Both endpoints share the same auth shape:

1. **Hono middleware:** validate Better Auth session via `auth.api.getSession({ headers: c.req.raw.headers })`. If null → 401.
2. **Resolve organization:** read `session.session.activeOrganizationId`, OR accept `organizationId` from query/body if explicit context (matches Better Auth's own pattern at `crud-members.ts:86`). If neither → 400.
3. **Resolve project's org:** if endpoint operates on a `project_id`, JOIN `projects` table to verify `project.organization_id === session.activeOrganizationId` (BokChoy-side tenancy check per `[[tenancy-ids-research]]:188`). If mismatch → 403.
4. **Look up member:** `adapter.findMemberByOrgId({ userId: session.user.id, organizationId })`. If null → 403 (user not a member).
5. **Permission check:** `await auth.api.hasPermission({ headers, body: { permissions: { reasonCode: ["bootstrap"] } } })` OR construct the call directly with the lower-level `hasPermission()` import. If false → 403.
6. **Proceed to handler.**

Steps 1-5 are reusable middleware; steps 6 is per-handler logic. BokChoy can either build a thin Hono middleware factory `adminGate({ resource, actions })` that emits steps 1-5, OR inline the pattern at each handler top per Better Auth's own internal convention. Either is production-cited; the middleware factory wins on DRY for ≥3 admin handlers (BokChoy already names 2; cockpit will add more).

### Schema additions BokChoy owes

To `packages/db/src/schema/auth.ts` (hand-written Better Auth tables per `[[backend-stack]]` line 96):
- Better Auth's `organization`, `member`, `invitation`, `team`, `teamMember`, `organizationRole` tables per `[[tenancy-ids-research]]` source-walk. Already vaulted.

To BokChoy auth config (`apps/auth-config/src/index.ts` per `[[tenancy-ids-research]]:256` cascade):
- Custom statements via `createAccessControl({ reasonCode: ["bootstrap"], player: ["deidentify"], project: ["read", "update"] /* extend as cockpit lands */ })`.
- Custom roles (or extended defaults) re-deriving `admin` and `owner` with the new permissions.
- Plugin config: `organization({ ac, roles: { admin: customAdmin, owner: customOwner, member: customMember } })`.

### Session-context discipline

`activeOrganizationId` may be `null` on a fresh login — Better Auth doesn't auto-set it unless org-creation/membership-removal flows fire. Cockpit must explicitly call `setActiveOrganization()` after login. Backend admin endpoints should EITHER (a) require `organizationId` in body/query (explicit-context posture, matches Better Auth's own routes), OR (b) require `activeOrganizationId` set on session and reject if null. (a) is more defensible for SDK/scripted admin actions; (b) is more ergonomic for browser-driven cockpit actions. **Open: decide which posture in design pass.**

### F5-risk mitigation already absorbed

`[[backend-stack]]` §F5 ("custom-field UI breakage") cited Better Auth's custom org-member fields not being respected by default UI components. Per `[[backend-stack-research]]:140`, BokChoy isn't using Better Auth UI components — moot. Confirmed: org plugin source-walk shows the UI breakage is in Better Auth's bundled UI lib, not the server-side `hasPermission()` flow. F5 stays risk-cleared for BokChoy.

## Reproducibility note

Reproducible. Clone `better-auth/better-auth` at HEAD (or pin to commit `e21d744`), read:
- `packages/better-auth/src/plugins/organization/has-permission.ts`
- `packages/better-auth/src/plugins/organization/permission.ts`
- `packages/better-auth/src/plugins/organization/access/statement.ts`
- `packages/better-auth/src/plugins/access/access.ts`
- `packages/better-auth/src/plugins/organization/schema.ts:130-152`
- `packages/better-auth/src/plugins/organization/routes/crud-org.ts:440-466`

Cross-reference with `better-auth.com/docs/plugins/organization` (v1.6).

For contradiction probe: `gh api -X GET search/issues -f q='repo:better-auth/better-auth hasPermission middleware admin in:title,body'` surfaces issue/PR list with rewrite signal; `grep -rn "user.role\|member.role" /tmp/bocek-ref-better-auth-better-auth/demo/` shows the demo app's split between `admin` plugin (`user.role`) and `organization` plugin (`member.role`).

No load-bearing judgment; another investigator with the same tooling reaches the same six bullet findings.

## Open threads

- **(Design follow-up, NOT research)** Pick session-context posture: (a) require `organizationId` explicit in body/query, or (b) require `activeOrganizationId` set on session. Both have production precedent; choice is downstream of cockpit UX vs SDK-script-admin expectations.
- **(Design follow-up, NOT research)** Pick admin-gate shape: Hono middleware factory `adminGate({ resource, actions })` vs inline pattern per handler. Better Auth's own code inlines; BokChoy may DRY across ≥3 handlers.
- **(Cross-cutting, future)** Org plugin rewrite (PRs `#7251` + follow-ups) signals API shift in next minor/major. Pin Better Auth version in `package.json`; queue re-survey when rewrite merges to main.
- **(Out of scope for Q2)** Q1 (sequencing) and Q3 (DSR shape in ledger contexts) — Q1 may now be trivially decidable: admin auth surface is medium-complexity (custom statements + extended roles + 5-step middleware), so a strict (a) Better-Auth-first-then-consumers sequencing is defensible. Q3 still owed when BokChoy designs walletDeidentifyPlayer specifically.
- **(Cross-cutting, optional)** Production survey of B2B SaaS shipping Better Auth org plugin without RBAC plugin — Cal.com, Deel.com per `[[backend-stack-research]]` Sources 8-9 named as production users; their public source/docs may show admin-gate patterns to triangulate against. Tier-1 if found. Not blocking Q2 finding.
