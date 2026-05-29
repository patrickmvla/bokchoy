---
type: contract
features: [cockpit, architecture]
related: ["[[cockpit-stack-integration-research]]", "[[admin-auth-surface]]", "[[cockpit-shape]]", "[[first-run-journey]]", "[[backend-stack]]"]
created: 2026-05-11
confidence: high
---

# Cockpit auth surface mount: Vercel rewrites + Hono Better Auth handler + trustedOrigins config

## Decision

Concrete implementation contract for the auth surface across split-deploy per `[[cockpit-stack-integration-research]]` F1 (P1 reverse-proxy) + F3 (Hono mount) + F7 (OAuth-primary sign-in). Three contracts vaulted: cockpit rewrites + backend handler mount + auth-config trustedOrigins. Plus OAuth provider config shape (env-driven, not vaulted-as-secrets).

### (V3) `apps/cockpit/next.config.ts` — env-driven async `rewrites()`

```ts
import type { NextConfig } from 'next';

const backendUrl = process.env.BOKCHOY_BACKEND_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  cacheComponents: true, // per [[frontend-stack]]
  async rewrites() {
    return [
      { source: '/api/auth/:path*', destination: `${backendUrl}/api/auth/:path*` },
      { source: '/v1/:path*',       destination: `${backendUrl}/v1/:path*` },
    ];
  },
};

export default nextConfig;
```

**Env vars** (set in Vercel project settings + `.env.local` for dev):
- Production: `BOKCHOY_BACKEND_URL=https://api.bokchoy.com`
- Preview deploys: `BOKCHOY_BACKEND_URL=https://api-staging.bokchoy.com` (or per-branch if backend deploys per-branch)
- Local dev: `BOKCHOY_BACKEND_URL=http://localhost:3000` (default)

Static `vercel.json` `rewrites` block rejected ((V1)) — works for production only; preview deploys can't switch backend targets without env substitution. Vercel's `vercel.json` `rewrites` schema doesn't support env-var interpolation natively; `next.config.ts` async function does.

### (H) `apps/backend/src/index.ts` — Better Auth Hono mount

Per `[[cockpit-stack-integration-research]]` F3 + Source 1 verbatim:

```ts
import { auth } from './infra/auth'; // slice 8.2.0 singleton

// ... existing middleware mounts (httpInstrumentationMiddleware, etc.) ...

// Better Auth handler — mount AFTER OTel HTTP instrumentation (so auth spans
// are captured at the @hono/otel layer) but BEFORE wallet route mounts (route
// ordering is stable since matchers are explicit).
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// ... mountWalletRoutes(app), app.onError(errorMiddleware), etc. ...
```

**No `cors()` middleware** on the auth path. Under (P1) reverse-proxy from `[[cockpit-stack-integration-research]]` F1, requests appear same-origin to the backend (Vercel forwards them with same-origin headers per Vercel rewrite docs). The cockpit-origin browser sees first-party requests; the backend receives them with `Origin: https://api.bokchoy.com` (Vercel rewrite sets it). No CORS preflight required for cookie-bearing requests.

Revisit-when triggers in `[[cockpit-stack-integration-research]]` F1: if (P1) is ever abandoned for (P2) shared-parent-domain, add `cors({ origin: 'https://bokchoy.com', credentials: true })` per Source 1 verbatim before the auth-route mount.

### (T-multi) `packages/auth-config/src/index.ts` — `trustedOrigins` extension

**Amendment 2026-05-29** (per `[[cockpit/admin-auth-onboarding]]` + `[[cockpit/.research/cockpit-admin-auth-runtime-research]]` F1): the `// local dev` entry below is `:3000` (the *backend* port), but the cockpit dev server runs on **`:3001`** and the browser's `Origin` is `http://localhost:3001` even through the same-origin rewrite proxy. Better Auth ≥1.4 validates that `Origin` against `trustedOrigins`, so `:3001` MUST be trusted in dev or org mutations (e.g. `set-active`) 403. Dev sets `BOKCHOY_TRUSTED_ORIGINS="http://localhost:3001,http://localhost:3000"` (the env **replaces** the constant; prod leaves it unset). (P1) "no CORS needed" is unaffected — the `trustedOrigins` origin check is a separate axis from browser CORS.

```ts
// In createAuth options, alongside baseURL / database / etc:
trustedOrigins: [
  'https://bokchoy.com',
  'https://www.bokchoy.com',  // canonical apex redirect target
  'http://localhost:3000',     // local dev
  'https://*-bokchoy.vercel.app', // Vercel preview deploys
  // OAuth provider redirect URIs are NOT in trustedOrigins — Better Auth
  // adds those internally based on socialProviders config (next section).
],
```

Wildcard subdomain support is canonical per `[[cockpit-stack-integration-research]]` Source 4 (Better Auth demo uses `'https://*.better-auth.com'`). Vercel preview deploys at `bokchoy-git-{branch}-{team}.vercel.app` covered by `*-bokchoy.vercel.app` pattern (Vercel preview URL convention).

### (P) OAuth provider config — shape only (values via env)

In `packages/auth-config/src/index.ts` `createAuth` options:

```ts
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  },
},
```

Per Better Auth `socialProviders` API. Default callback paths (auto-mounted by `auth.handler`):
- Google: `/api/auth/callback/google`
- GitHub: `/api/auth/callback/github`

Reverse-proxy from cockpit means OAuth providers see callback URLs at `https://bokchoy.com/api/auth/callback/{provider}` (browser-side; Vercel rewrites the inbound to backend).

**OAuth provider operational config (NOT vaulted — env-driven):**
- Google: create OAuth 2.0 Client ID at console.cloud.google.com; authorized redirect URIs = `https://bokchoy.com/api/auth/callback/google` + `http://localhost:3000/api/auth/callback/google` + Vercel preview wildcards (per Google's accepted-redirect-URI format, which requires exact match — Vercel preview deploys may need per-branch OAuth client OR a single `*-bokchoy.vercel.app` wildcard which Google does NOT support — see *Open threads*).
- GitHub: same shape, console at github.com/settings/applications/new; authorized redirect URI = `https://bokchoy.com/api/auth/callback/github` (GitHub allows per-app callback URL, simpler).
- Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. Stored in Vercel project settings + backend container PaaS env (not committed).

### (CK) Cookie config

Default Better Auth cookie attributes — `SameSite=Lax`, `Secure=true` in production, `HttpOnly=true`, no explicit Domain (defaults to backend's origin). Under (P1) reverse-proxy: cookie is set with `Domain` undefined → browser scopes it to the originating server's host (which appears as `bokchoy.com` to the browser per Vercel's rewrite-preserving-host behavior). First-party from cockpit's perspective; no `SameSite=None` complexity.

**No `crossSubDomainCookies` config** under (P1). Only needed under (P2) shared-parent-domain pattern.

### (CL) Cockpit Better Auth client config

In `apps/cockpit/lib/auth-client.ts`:

```ts
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: '/', // relative — Vercel rewrites handle backend
  plugins: [organizationClient()],
});

export const { signIn, signOut, useSession, organization } = authClient;
```

`baseURL: '/'` is the (P1) ergonomic win — cockpit code uses relative paths; Vercel rewrites send them to backend. Cockpit doesn't need to know the backend hostname; environment-specific config lives only in `next.config.ts`.

## Reasoning

### Why (V3) env-driven `rewrites()` over (V1) static JSON

Three converging defenses:

1. **Vercel preview deploys are part of the workflow.** Solo-dev MVP context still uses preview deploys for PR review + design-partner demos. Preview deploys need to hit a non-production backend (staging or per-branch deploy) without rebuilding cockpit for each. Env-var-driven rewrites cover prod / preview / dev with one config.
2. **`vercel.json` `rewrites` doesn't interpolate env vars.** Direct empirical limit — Vercel's JSON schema for rewrites doesn't support `${ENV_VAR}` substitution. Working around it via build-time JSON generation is more brittle than Next.js's first-class async `rewrites()` function.
3. **Next.js async `rewrites()` is the production-cited canonical pattern.** Per Next.js docs (v16.2.6 confirmed in `[[cockpit-stack-integration-research]]` Source 5) the async function is documented as the env-driven path. *(docs-cited / high.)*

(V1) static JSON wins only if there are NO non-production deploys, which contradicts the workflow this project has been using.

### Why (H) Hono mount verbatim with no `cors()` middleware

Per `[[cockpit-stack-integration-research]]` F1 (P1) reverse-proxy: Vercel rewrites preserve same-origin perception to the browser. Backend receives requests with same-origin headers from the cockpit. No CORS preflight needed. `cors()` middleware would be defensive-but-unused under (P1). Per *Anti-improvisation* in the implementation primitive: don't add infrastructure the contract doesn't require.

(production-cited × 1: Better Auth docs Source 1 example shows `cors()` only for explicit cross-origin scenarios — Vercel rewrite covers our case differently. confidence: high.)

### Why (T-multi) wildcards for Vercel preview

Better Auth `trustedOrigins` accepts wildcard subdomain patterns per `[[cockpit-stack-integration-research]]` Source 4 demo (`'https://*.better-auth.com'`). Vercel preview deploys follow `{project}-git-{branch}-{team}.vercel.app` naming → `*-bokchoy.vercel.app` covers them (assuming team slug `bokchoy`). Documented Better Auth pattern.

Alternative (T-prod) would force every preview deploy to fail the `trustedOrigins` check; preview deploys are the workflow this project uses for slice review.

### Why OAuth provider config shape vaulted but values out-of-scope

Vault entries name contracts that the team can act on for years. OAuth client IDs / secrets are rotated periodically; their CURRENT values are operational state, not architectural decisions. Vault records the SHAPE (`socialProviders: { google: { clientId, clientSecret }, github: { ... } }`) — implementation reads env. Rotation runbook owed as a separate vault entry alongside the existing `BOKCHOY_API_KEY_HMAC_SECRET` rotation carry from slice 8.1a + bearer-token rotation carry from slice 8.2.1.

## Engineering substance applied

- **Consistency:** session cookie scope same across cockpit's auth surface (sign-in, sign-out, get-session, callback). Under (P1) reverse-proxy: all paths under `bokchoy.com/api/auth/*` look first-party to browser → uniform cookie behavior.
- **Failure semantics:** auth callback failure routes back to `/sign-in?error=...` per Better Auth default. `trustedOrigins` check failure returns 403 from Better Auth — Better Auth's internal validation, no custom error mapping needed.
- **Concurrency:** auth flow is per-request; session writes are single-row INSERT into `session` table by Better Auth; no concurrency hazards beyond Better Auth's internal concurrency model.
- **Observability:** `httpInstrumentationMiddleware` from slice 8.1b captures `/api/auth/*` spans automatically. Better Auth doesn't emit its own OTel spans; sub-second auth response means the HTTP-layer span is sufficient observability at MVP scale. Revisit-when latency at scale demands deeper observability — `auth.handler` internals.
- **Security:** reverse-proxy preserves first-party cookies; HMAC-signed cookies per Better Auth default; OAuth callback validation server-side per Better Auth `socialProviders` internals. `trustedOrigins` enforces cockpit-origin allowlist for sign-in / sign-out redirects.

## Production-grade gates

- **Idiomatic** — Next.js async `rewrites()` is the canonical 2026 env-driven proxy pattern; Hono `auth.handler(c.req.raw)` is the canonical 3-LOC Better Auth mount per `[[cockpit-stack-integration-research]]` Source 1; Better Auth React client with `baseURL: '/'` is the canonical relative-path-via-proxy ergonomic pattern. *(production-cited + docs-cited; confidence: high.)*
- **Industry-standard** — split-deploy reverse-proxy is documented as the Better Auth canonical pattern for Vercel-cockpit + container-backend per `[[cockpit-stack-integration-research]]` Source 2 verbatim Vercel example. ≥1 named production system (Better Auth's own demo) ships exactly this shape; floor met. *(production-cited × 1 minimum; confidence: medium-high — would be high with a third B2B SaaS source-walk shipping (P1).)*
- **First-class** — uses Vercel's `rewrites` + Next.js's `rewrites()` + Better Auth's `auth.handler` + Hono's `app.on` + Better Auth's `trustedOrigins` + Better Auth's `socialProviders` — every primitive is the platform's intended abstraction. Zero workarounds. *(first-class-cited; confidence: high.)*

## Rejected alternatives

### Alternative A — (V1) static JSON `vercel.json` rewrites

**What:** Hardcode `https://api.bokchoy.com` in `vercel.json` `rewrites` block.

**Wins when:** zero non-production deploys (no preview, no staging, single environment).

**Why not here:** project uses Vercel preview deploys for PR review + design-partner demos. Single hardcoded URL breaks previews.

### Alternative B — (V2) `vercel.json` with `$BOKCHOY_BACKEND_URL` substitution

**What:** Vercel JSON `rewrites` with `${BOKCHOY_BACKEND_URL}` placeholder.

**Wins when:** Vercel ships native env-var substitution in `vercel.json` (current schema does not).

**Why not here:** Vercel JSON schema does not support env-var interpolation. Build-time generation of `vercel.json` from a template is brittle vs Next.js's first-class async `rewrites()`. Tier of complexity unjustified.

### Alternative C — `cors()` middleware on backend auth route

**What:** Add `app.use('/api/auth/*', cors({ origin: 'https://bokchoy.com', credentials: true }))` before mount.

**Wins when:** cockpit-to-backend requests cross origin from browser's perspective (e.g., (P2) shared-parent-domain pattern; or no Vercel rewrite).

**Why not here:** (P1) Vercel rewrite makes requests appear same-origin. CORS middleware is defensive-but-unused infrastructure. Adds attack surface (overly-permissive `credentials: true` config drift risk) without benefit.

### Alternative D — Cockpit `authClient` with absolute `baseURL: 'https://api.bokchoy.com'`

**What:** Cockpit Better Auth React client targets the backend hostname directly (no Vercel rewrite).

**Wins when:** Vercel rewrite is unavailable OR you want explicit control over backend URL in cockpit code.

**Why not here:** absolute URL = cross-origin request from browser = SameSite=None or partitioned-cookies complexity. Forfeits (P1)'s first-party-cookie ergonomic win. Defeats the architectural choice from `[[cockpit-stack-integration-research]]` F1.

### Alternative E — `trustedOrigins` hardcoded to prod only

**What:** `trustedOrigins: ['https://bokchoy.com']`.

**Wins when:** no dev / preview deploys.

**Why not here:** breaks `http://localhost:3000` dev sign-in immediately. Wildcard preview pattern in (T-multi) is the canonical Better Auth pattern; no reason to deviate.

## Failure mode

**Primary failure mode: Vercel rewrite doesn't preserve host headers correctly.** Empirically, Vercel rewrites do preserve host; but if Vercel changes behavior or if a misconfiguration redirects through a proxy that strips headers, the backend receives requests with mismatched Origin → Better Auth's internal `trustedOrigins` check rejects → 403.

Likelihood: low. Vercel's rewrite behavior is documented + stable.

Detection: smoke test for cockpit slice 8.3 must verify OAuth callback flow end-to-end against a deployed (not localhost) cockpit. Catches host-header bugs at slice acceptance.

**Secondary failure mode: OAuth provider callback URL mismatch.** Google requires exact match for authorized redirect URIs; Vercel preview deploys have unpredictable URLs that don't fit Google's exact-match policy. Result: preview deploys can't complete OAuth sign-in.

Likelihood: medium-high. Google's exact-match policy is well-documented and inflexible.

**Tertiary failure mode: env var typo or missing in production.** `BOKCHOY_BACKEND_URL` unset → `rewrites()` returns `http://localhost:3000/...` destinations → production fails immediately on first auth request.

Likelihood: medium. Standard env-var typo class. Easy to detect (first deploy fails); easy to fix (set env var).

## Mitigations

- **Vercel rewrite host-header verification** at slice 8.3 acceptance smoke test. Deploy cockpit + backend; complete OAuth round-trip; verify session cookie set on `bokchoy.com` domain.
- **OAuth provider preview-deploy strategy** — three options:
  - (a) Skip OAuth on preview deploys; email/password fallback only. Pragmatic; minimal cost.
  - (b) Single test OAuth client with `localhost:3000` callback only (works for local dev). Preview deploys can't OAuth at all.
  - (c) Per-branch OAuth client (operational overhead) OR Vercel-specific OAuth proxy (more infra).
  - **Recommend (a)** for MVP. Preview deploys are for visual review + email/password sign-in flow review; OAuth round-trip verification happens at production. Vault as `[[cockpit/oauth-preview-deploy-strategy]]` if more substance owed.
- **Env var validation at backend startup.** `apps/backend/src/infra/auth.ts` already throws on missing `BOKCHOY_BASE_URL`. Add similar check for `BOKCHOY_BACKEND_URL` at cockpit's `next.config.ts` import time — throw with clear error if unset in non-dev environments (`NODE_ENV === 'production'`).

## Idiom citations

- `idioms/typescript.md` (Make impossible states unrepresentable) — `socialProviders: { google: {...}, github: {...} }` is a record type with each provider's config typed; missing client IDs at runtime throw at startup (validated by Better Auth internals) — not silently degraded.
- Per `[[cockpit-stack-integration-research]]` F1 Source 2 Vercel example — production-cited convergent shape.
- Better Auth `auth.handler(c.req.raw)` per `[[cockpit-stack-integration-research]]` Source 1 verbatim — canonical 3-LOC mount.

## Revisit when

- **Switch from (P1) reverse-proxy to (P2) shared-parent-domain.** Triggers add `cors({ origin, credentials: true })` on backend auth-route mount + `crossSubDomainCookies` config in `createAuth` + cockpit `authClient` `baseURL` change to absolute backend URL.
- **OAuth preview-deploy strategy revisit** if first paying customer demands OAuth on preview deploys (e.g., for partner demos). Trigger: customer signal OR > 20% of design-partner conversations gated on preview-deploy OAuth working.
- **Better Auth org plugin rewrite stabilizes** (PRs `#7251` + 5 follow-ups per `[[better-auth-org-admin-research]]` C1). May require re-vetting all `createAuth` config including `trustedOrigins` + `socialProviders` API stability across the rewrite.
- **Additional OAuth providers** (Apple, Microsoft, Discord). Trigger: customer signal OR specific game-industry segment using a provider not in current config. Adds entries to `socialProviders` + provider operational config.
- **Backend deploy URL changes** (Render → Railway → Fly.io migration; PaaS bake-off conclusion). Trigger: change `BOKCHOY_BACKEND_URL` env var across all environments; no code change.
- **Auth observability gap manifests at scale** — backend logs show auth flow latency > 500ms p95 OR debugging requires Better Auth-internal instrumentation. Trigger: investigate Better Auth's plugin-hook pattern for OTel span emission.

## Open threads

- **OAuth provider preview-deploy strategy decision.** Recommended (a) skip-OAuth-on-preview per *Mitigations*, but not vaulted as its own decision. If preview-OAuth becomes load-bearing, vault as `[[cockpit/oauth-preview-deploy-strategy]]` with concrete operational config.
- **Bearer-token rotation runbook** carry from slice 8.2.1 + `BOKCHOY_API_KEY_HMAC_SECRET` rotation carry from slice 8.1a + OAuth client secret rotation owed. Consolidate into `[[ops/secret-rotation-runbook]]` post-MVP-launch.
- **`apps/cockpit/lib/auth-client.ts` and `apps/cockpit/lib/session.ts` implementations** — slice 8.3 cascade obligation; not in this entry's scope.
- **`packages/auth-config/src/index.ts` typed signature for trustedOrigins** — current `createAuth` factory takes a small `CreateAuthOptions` interface; needs extension to accept `trustedOrigins` parameter or have it hardcoded. Inline /design decision: hardcode the array as a module-level constant beside the existing `roles` export, OR extend `CreateAuthOptions` with `trustedOrigins: string[]` parameter. Per `[[admin-auth-surface]]` D3 static-AC pattern, hardcoded module-level constant matches; trustedOrigins is also static-per-deploy. **Pick (inline /design):** hardcoded module-level constant.
