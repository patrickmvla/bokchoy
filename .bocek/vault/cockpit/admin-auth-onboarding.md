---
type: decision
features: [cockpit]
related: ["[[cockpit/.research/cockpit-admin-auth-runtime-research]]", "[[cockpit/auth-surface-mount]]", "[[cockpit/first-run-journey]]", "[[architecture/admin-auth-surface]]", "[[cockpit/admin-catalog-endpoints-contract]]"]
created: 2026-05-29
confidence: high
---

# Cockpit admin surface reachability: trust the cockpit origin (dev) + explicit org-create step + set-active hook

Resolves the two runtime blockers from `[[cockpit/.research/cockpit-admin-auth-runtime-research]]` that made the whole cockpit admin surface (projects + catalog) unreachable in the browser. Both are upstream of the catalog editor (whose backend is wire-verified and whose cockpit code compiles).

## Decision

### (1) Auth-proxy origin — minimal-first: trust the cockpit dev origin
The `set-active` 403 through the Next rewrite proxy is Better Auth ≥1.4 validating the `Origin` header (which carries `http://localhost:3001` even through the same-origin proxy) against `trustedOrigins`, where `:3001` is absent. Fix: **set `BOKCHOY_TRUSTED_ORIGINS` in dev `.env` to include `http://localhost:3001` (and `http://localhost:3000`)**, then re-test `set-active` through the proxy.

- `createAuth` resolves `opts.trustedOrigins ?? [...constant]` → the env **replaces** the constant. In dev that's intended (localhost origins); prod leaves `BOKCHOY_TRUSTED_ORIGINS` unset and keeps the constant (`bokchoy.com` etc.).
- **Escalation ladder, only if the simple origin-trust doesn't resolve it** (i.e. #7657's deeper request-context regression actually bites — less likely here because BokChoy uses a *static* `trustedOrigins` array, not the `trustedOrigins(request)` callback form #7657 centers on): (a) Hono `cors()` on the backend + verify the Request reaches the origin check under the Hono adapter; (b) pin `better-auth` to `1.3.13`; (c) reconsider the rewrite-proxy design. Do NOT pre-emptively downgrade or redesign.
- **CORS is not implicated.** `[[cockpit/auth-surface-mount]]` (P1)'s "no CORS needed" still holds — the proxy is genuinely same-origin to the browser. The only addition owed to P1 is "dev must trust the cockpit origin"; the server-side `trustedOrigins` check is a separate axis from browser CORS.

### (2) Org bootstrap — explicit cockpit "create organization" step
A fresh login has `activeOrganizationId = null`, and Better Auth's org plugin does **not** auto-create an org on signup (research F2). So an operator (email OR OAuth) can land with no org → every adminGate endpoint returns BC400. Decision: **add an explicit "create organization" step to cockpit onboarding** (a form: org name + slug → `POST /api/auth/organization/create` → set active), shown when the signed-in operator has zero organizations.

This **reverses `[[cockpit/first-run-journey]]` (O1)'s rejection of (O2) "explicit Create Organization step."** O1 rejected it as "extra friction; Better Auth defaults to auto-create" — but that premise is **false** (Better Auth does not auto-create orgs). With the corrected premise, the explicit step is the right call: it works for email and OAuth uniformly, gives operators explicit org naming, and doesn't depend on an auto-create that doesn't exist. O1 is amended (cascade #4).

### (3) Active org on login — `databaseHooks.session.create.before`
Add a `session.create.before` hook in `createAuth` that sets `activeOrganizationId` to the operator's first organization membership (the documented Better Auth pattern). So a *returning* operator (who already has an org) gets it active automatically without re-running the create step; the create step (2) is only for operators with zero orgs.

### (4) The 404/redirect (F3) — deferred, not chased
Re-test the catalog routes against a clean **authed** browser session once (1)+(2)+(3) unblock one. Do not change routing on the strength of the dev-mode 404 observation (research F3, low confidence it's structural).

## Reasoning

- **(1) minimal-first** per *Operating at your ceiling* — the proximate cause (proven by the curl asymmetry: `Origin: :3000` worked, `:3001` 403'd) is the missing trusted origin, not necessarily #7657's deep regression (which targets the callback form BokChoy doesn't use). Downgrading or redesigning before confirming the one-line fix fails is solving an unconfirmed problem. (production-cited: Better Auth #7657 on the exact stack; in-repo: trustedOrigins lacks :3001; confidence: high that origin-trust is necessary, medium that it's *sufficient* — the re-test confirms.)
- **(2) explicit org step** is defensible *because* O1's premise was false (research F2: no auto-create). It's the only option that unblocks the dev/email path (no OAuth configured) and doesn't rely on a non-existent auto-create. (docs-cited: Better Auth org plugin; confidence: high.)
- **(3) set-active hook** is the canonical Better Auth pattern for active-org-on-login (docs-cited; confidence: high).

## Engineering substance applied

- **Security:** active-org is not a trust boundary for catalog (adminGate independently validates project∈org per `[[cockpit/admin-catalog-endpoints-contract]]`); the org-create step + set-active drive *which* org's data the operator sees, gated by membership (owner on create). `trustedOrigins` is the CSRF/origin guard; widening it to the cockpit origin in dev only (env-scoped) keeps prod's allowlist tight.
- **Failure semantics:** operator with zero orgs → onboarding routes to the create-org step (not a dead BC400); returning operator → set-active hook resolves the org; org-create race (slug unique) → surfaced like project slug_taken.
- **Observability:** unchanged; adminGate already spans auth outcomes.

## Production-grade gates

- **Idiomatic** — `databaseHooks.session.create.before` for active-org and an explicit org-create form are both standard Better Auth org-plugin patterns. *(docs-cited; confidence: high.)*
- **Industry-standard** — explicit org/workspace creation on first use is the norm in B2B SaaS onboarding (the same dashboards surveyed in `[[cockpit/cockpit-shape]]`). *(production-cited × multiple; confidence: high.)*
- **First-class** — Better Auth org plugin endpoints + hooks; env-driven trustedOrigins (existing `BOKCHOY_TRUSTED_ORIGINS` wiring). No new infra. *(first-class-cited; confidence: high.)*

## Rejected alternatives

### Auth-proxy: downgrade better-auth to 1.3.13
**What:** pin to the pre-regression version. **Wins when:** the origin-trust fix demonstrably fails AND the Hono-cors path can't be made to work. **Why not here:** freezes the version, loses 1.4→1.6.9 fixes; premature before confirming the simple fix fails.

### Auth-proxy: cockpit → backend direct with CORS
**What:** drop the same-origin rewrite for auth, call cross-origin with CORS. **Wins when:** the rewrite proxy proves unworkable with Better Auth ≥1.4. **Why not here:** contradicts `[[cockpit/auth-surface-mount]]` (P1)'s whole design; large change for an unconfirmed need.

### Org bootstrap: auto-create org on every signup
**What:** `databaseHooks.user.create` auto-creates a personal org. **Wins when:** zero-friction onboarding is paramount and operators don't need to name their org up front. **Why not here:** human chose the explicit step (operators name their studio; clearer ownership); auto-create can be added later if the step proves to be friction.

### Org bootstrap: OAuth-only auto-create (keep O1 as-was)
**What:** scope auto-create to OAuth per O1. **Why not here:** leaves email/password (the dev path, and any non-OAuth operator) org-less; and O1's premise (Better Auth auto-creates) was false regardless.

## Failure mode

- **Origin-trust insufficient (#7657 deeper bug bites despite trusting :3001).** Probability: medium-low (static array, not callback form). Cost: medium — escalate to Hono cors / downgrade per the ladder. **Confirmed only by the re-test** — this decision's (1) is provisional-pending-that-test.
- **Prod same-origin assumption unverified.** `bokchoy.com` is genuine same-origin so Origin = `bokchoy.com` = trusted; #7657's regression *could* still affect prod via baseURL inference. Probability: low. Mitigation: verify against a prod-like origin before launch (revisit-trigger).

## Mitigations

- **(1)** re-test `set-active` through the proxy immediately after setting `BOKCHOY_TRUSTED_ORIGINS`; if still 403, walk the escalation ladder.
- **Prod verification** owed before launch (revisit-when).

## Revisit when

- **The origin-trust re-test still 403s** → escalate (Hono cors → downgrade 1.3.13 → proxy redesign), and reopen the `[[cockpit/auth-surface-mount]]` proxy design.
- **Auto-create org becomes preferable** (onboarding-funnel drop-off on the create-org step) → swap (2) for the auto-create-on-signup hook.
- **Prod exhibits #7657** despite same-origin → revisit the proxy/baseURL handling.
- **Better Auth ships the systematic #7657 fix** → the dev origin-trust may become unnecessary; reassess.

## Cascade obligations (implementation)

1. **Dev `.env`:** `BOKCHOY_TRUSTED_ORIGINS="http://localhost:3001,http://localhost:3000"`. Re-test `set-active` through the cockpit proxy → expect 200. (Consider making `createAuth` *merge* env with the constant rather than replace, so dev doesn't drop prod origins — design note, optional.)
2. **`packages/auth-config/src/index.ts`:** add `databaseHooks.session.create.before` setting `activeOrganizationId` to the user's first org membership.
3. **Cockpit org-create step:** a `modules/organizations/` (or auth) create-org form (name + slug) → `POST /api/auth/organization/create` → set active → route to `/projects`. Shown when the signed-in operator has zero orgs (e.g. `/v1/orgs/me` / org list empty). Wire into the post-login flow.
4. **Amend `[[cockpit/first-run-journey]]` (O1):** correct the false premise (Better Auth does NOT auto-create orgs) and adopt the explicit org-create step (formerly rejected as O2).
5. **Amend `[[cockpit/auth-surface-mount]]`:** note that dev must trust the cockpit origin via `BOKCHOY_TRUSTED_ORIGINS`; (P1) "no CORS" is unaffected (separate axis).
6. **Re-test the catalog editor authed** end-to-end in the browser once 1–3 land (closes research F3).
