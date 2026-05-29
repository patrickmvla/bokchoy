---
type: research
features: [cockpit]
related: ["[[cockpit/auth-surface-mount]]", "[[cockpit/admin-catalog-endpoints-contract]]", "[[cockpit/active-project-scope]]", "[[cockpit/first-run-journey]]", "[[architecture/admin-auth-surface]]"]
created: 2026-05-29
confidence: high
provisional: false
---

# Why the cockpit admin surface (incl. the catalog editor) is unreachable in the browser: Better-Auth active-org + a v1.4+ origin-validation regression behind the Next rewrite proxy

## Question

A browser run of the catalog editor hit BC400 ("Organization context missing") on every admin endpoint, and `set-active` (Better Auth org mutation) returned 403 **through the Next.js rewrite proxy** but worked direct on the backend. Three sub-questions: (1) how should the active organization get set after login (current Better Auth)? (2) why does an org mutation 403 through the Next rewrite proxy when the same call works direct? (3) is the unauthed-route 404/308 a real Next 16 routing bug? My knowledge of current Next 16 + Better Auth (≥1.4) behavior is past its cutoff — research, don't assume.

## Triangulation

- **Production reference:** ✓ Better Auth issue #7657 (the maintainers' tracking summary) — *exact* stack: Hono backend + Next.js rewrite proxy. Plus Next.js discussions #17325 / #62050 on proxy header forwarding.
- **Docs reference:** ✓ Better Auth Organization plugin docs (active-org via `databaseHooks`); Next.js `rewrites` + `serverActions.allowedOrigins` docs.
- **Contradiction probe:** ✓ my prior assumption (the reverse-proxy makes cockpit↔backend same-origin so CSRF/origin is a non-issue — `[[cockpit/auth-surface-mount]]` (P1)) — actively checked and **falsified** for Better Auth ≥1.4 (below).
- **In-repo grounding:** `trustedOrigins` constant, `next.config.ts` rewrites, installed `better-auth@1.6.9`.

## Sources examined

### Better Auth issue #7657 — "Cross-Origin Auth Broken in 1.4.x with Hono + Cloudflare Workers + Next.js Proxy"
- **Tier:** 3 (issue tracker, with a maintainer tracking summary).
- **Provenance:** `github.com/better-auth/better-auth/issues/7657`, observed 2026-05-29.
- **What it tells us:** **stricter origin/CSRF validation introduced in v1.4.x** + incomplete request-context propagation across adapters → **proxied requests fail origin validation even when `trustedOrigins` is configured.** `trustedOrigins(request)` doesn't reliably receive the Request under all adapters; `baseURL` inference mishandles proxied requests; the origin-check middleware can reject `Origin: null`/missing-Origin even when trusted. Affects Next.js + Hono explicitly. Documented mitigations: (a) Hono `cors({ origin:[...], credentials:true, allowHeaders:[...] })`; (b) explicit `trustedOrigins`; (c) **confirmed workaround: downgrade to v1.3.13**; systematic fix (Request reaches `trustedOrigins` under every adapter) pending.

### Better Auth Organization plugin docs
- **Tier:** 2 (official docs).
- **Provenance:** `better-auth.com/docs/plugins/organization`, observed 2026-05-29.
- **What it tells us:** active organization **defaults to `null` on session creation**. The current pattern to auto-set it is `databaseHooks.session.create.before`, fetching the user's initial org and returning `{ data: { ...session, activeOrganizationId: org?.id } }`. (Confirmed by issues #685 feature-request and the "Set active org on login" thread.) The plugin does **not** auto-create an org on sign-up.

### Next.js rewrites + Server Actions origin docs
- **Tier:** 2 (official docs) + tier-3 discussions (#17325 "rewrites should set proxy headers", #62050 "x-forwarded-host does not match origin").
- **What it tells us:** Next `rewrites()` proxy to a destination but **do not propagate `Origin`/`Host` to the backend** in a way that preserves the caller's origin; Server Actions compare `Origin` vs `Host`/`X-Forwarded-Host` and abort on mismatch (`serverActions.allowedOrigins` is the escape hatch). redirect() is documented to return **307** (303 in Server Actions). No confirmed "cacheComponents makes redirect 404" bug surfaced; a Next 16.2.4 **dev-mode** 404-on-back-navigation bug exists (#93413).

### In-repo
- `trustedOrigins` = `['https://bokchoy.com','https://www.bokchoy.com','http://localhost:3000','https://*-bokchoy.vercel.app']` — **does not include the cockpit dev origin `http://localhost:3001`**; `BOKCHOY_TRUSTED_ORIGINS` unset.
- `better-auth@1.6.9` installed (catalog `^1.4.0`) → **in the affected ≥1.4 range.**
- `next.config.ts`: `cacheComponents: true`, rewrites `/api/auth/*` + `/v1/*` → `http://localhost:3000`.

## Findings

### F1 (load-bearing) — the `set-active` 403 is a known Better-Auth ≥1.4 origin-validation regression on the Next-proxy + Hono stack
Per #7657, v1.4.x tightened origin/CSRF checks and proxied requests fail origin validation *even when the origin is trusted*, because the Request context doesn't reach `trustedOrigins` under the proxy and `baseURL` inference mishandles proxying. BokChoy is on `better-auth@1.6.9` (affected) with exactly this stack (Hono backend + Next rewrite proxy). Two compounding causes: (i) the **regression** (#7657); (ii) an **in-repo config gap** — `trustedOrigins` omits `:3001` and Next rewrites don't forward the caller's `Origin`. Note the asymmetry observed (sign-up/sign-in passed through the proxy, `set-active` 403'd) is consistent with #7657's "affects multiple flows / Origin handling is inconsistent across endpoints." Confidence: high.

### F2 — active org is `null` on login by design; the current fix is a `databaseHooks.session.create.before` hook, and new email users have no org to activate
Better Auth defaults `activeOrganizationId` to null per session; the documented pattern is the `session.create.before` hook to set it to the user's first org. BokChoy's `createAuth` does **not** install this hook, so every fresh session has no active org → `adminGate` BC400. Separately, the org plugin doesn't auto-create an org on sign-up, and the cockpit has no org-create UI — it was designed OAuth-first (`[[cockpit/first-run-journey]]` O1 auto-create-org-on-OAuth). So email/password signup (dev, no OAuth configured) yields a user with **no org at all**, not merely an unset active org. Confidence: high.

### F3 (lower confidence) — the unauthed-route 404/308 is most likely a dev artifact, not a structural catalog/routing bug
`redirect()` is documented to return 307; no confirmed `cacheComponents`+`redirect`→404 bug was found. The observed 404 is plausibly the Next 16.2.4 dev-mode 404 behavior (#93413) and the 308 was an empty-`projectId` path-normalization artifact (the PID was blank because `/v1/projects` had 400'd). Needs a clean **authed** repro to confirm; not treated as a catalog defect. Confidence: medium-low (couldn't reproduce cleanly — auth was blocked by F1/F2).

## Conflicts

**`[[cockpit/auth-surface-mount]]` (P1) "reverse-proxy ⇒ same-origin, no CORS needed" vs Better Auth ≥1.4 reality.** The vaulted design assumed the Next rewrite makes cockpit and backend same-origin, so CSRF/origin is moot and no `cors()` is needed. Per #7657 (production, tier-3, exact stack) this is **false for Better Auth ≥1.4**: proxied requests fail origin validation regardless, and a Hono `cors()` + explicit trusted origins (or a version downgrade) is needed. Per *Contradiction protocol*, the production issue on our exact stack outweighs the prior design assumption — `[[cockpit/auth-surface-mount]]` (P1)'s "no CORS" claim needs revisiting. In prod (`bokchoy.com`, genuine same-origin) the symptom may be milder, but the regression's request-context bug is not origin-specific.

## Conditions

- F1 holds for `better-auth ≥ 1.4` behind a Next rewrite proxy (or other adapters in #7657). A downgrade to 1.3.13 or the systematic fix changes it.
- F2's "new user has no org" is specific to the **email/password** path with no OAuth + no org-create UI. OAuth (with the first-run O1 hook actually implemented) or a cockpit org-create step changes it.
- F3 is dev-mode-specific and unconfirmed.

## Operational implications

For `/design` to decide (research does not pick):

- **Unblock the auth proxy (F1) — the gating decision.** Options, each with cost: **(a)** pin `better-auth` to `1.3.13` (confirmed working, but loses ≥1.4 features/fixes); **(b)** add Hono `cors()` on the backend + add the cockpit dev origin to `trustedOrigins` (via `BOKCHOY_TRUSTED_ORIGINS=http://localhost:3001` for dev) + verify the Request reaches `trustedOrigins` under the Hono adapter — may not fully fix per #7657 until the upstream patch; **(c)** track #7657 and adopt the systematic fix when released; **(d)** reconsider `[[cockpit/auth-surface-mount]]` (P1) — e.g. cockpit calls the backend directly (CORS) instead of the rewrite proxy in dev. At minimum, dev needs `:3001` trusted AND the header/forwarding issue addressed; the prod same-origin assumption should be re-verified, not assumed.
- **Set active org (F2):** add `databaseHooks.session.create.before` in `createAuth` (auth-config) to set `activeOrganizationId` to the user's first membership; AND provide an org for new users — either rely on OAuth + implement the `[[cockpit/first-run-journey]]` O1 auto-create hook, or add a cockpit "create organization" step. Without both, the admin surface (projects + catalog) is unreachable for a new email user.
- **F3:** re-test the catalog routes once F1/F2 unblock a real authed browser session; only then judge whether the 404 is real. Don't change routing on the strength of the dev-mode observation.
- **Catalog editor itself is not implicated** — its backend is wire-verified and its cockpit code compiles + renders `/sign-in`. These are upstream auth/onboarding blockers.

## Reproducibility note

Reproducible: `grep better-auth bun.lock` → `1.6.9`; `trustedOrigins` in `packages/auth-config/src/index.ts` (no `:3001`); sign in via the cockpit `:3001` proxy → `get-session` shows `activeOrganizationId: null` → `/v1/orgs/me` 400; `set-active` via the proxy 403 vs 200 direct on `:3000`. Cross-reference Better Auth issue #7657 + org-plugin docs. F3 not reproducible cleanly (auth blocked).

## Open threads

- Exact set of Better Auth endpoints that enforce the stricter origin check (signup passed, set-active failed) — would pin whether a per-endpoint or global config fixes it.
- Whether BokChoy's prod (`bokchoy.com` true same-origin) actually exhibits #7657 or only the dev cross-port setup does — affects urgency.
- Is the `[[cockpit/first-run-journey]]` O1 auto-create-org-on-OAuth hook actually implemented in the shipped cockpit/backend, or only designed? (Determines whether OAuth login currently yields an org.)
- The Next 16 `redirect()`-under-cacheComponents behavior, confirmed against a clean authed repro.
