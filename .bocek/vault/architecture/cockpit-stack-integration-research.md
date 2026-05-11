---
type: research
features: [architecture, cockpit]
related: ["[[admin-auth-surface]]", "[[better-auth-org-admin-research]]", "[[frontend-stack]]", "[[frontend-stack-research]]", "[[backend-stack]]", "[[tanstack-query-rsc-research]]", "[[mvp-feature-sequence]]"]
created: 2026-05-11
confidence: high
provisional: false
---

# How does production B2B SaaS at indie/SMB MVP scale wire Better Auth + Next.js 16 RSC across split-deploy (Vercel cockpit + container-PaaS backend) with OAuth-primary auth UX, and what are the named RSC anti-patterns to avoid?

## Question

For slice 8.3 (first cockpit slice, β-shape per `[[admin-auth-surface]]` *Mitigations* row 4 amendment 2026-05-11), three engineering questions had to be grounded before implementation can proceed without improvising the architecture:

- (Q-A) **Auth + split-deploy + CORS + cookies** — how do production cockpits wire Better Auth (or comparable) when the auth instance + DB connection live on a separate container backend (Hono per `[[backend-stack]]`) and the frontend deploys to Vercel/Bun per `[[frontend-stack]]:74`?
- (Q-D) **Next.js 16 RSC + Streaming + Suspense composition** — canonical Server vs Client component boundary criteria, waterfall avoidance, Suspense granularity, with named anti-pattern list (cascaded `'use client'`, sequential await chains, misplaced Suspense boundaries) per user constraint 2026-05-11.

Combined query because the same production cockpit source-walks ground both lenses; budget unchanged from 3-4 cites.

## Triangulation

- **Production reference:** ✓ Better Auth's own demo Next.js app source-walked at commit `e21d744` (`/tmp/bocek-ref-better-auth-better-auth/demo/nextjs/`, observed 2026-05-11). Cal.com production code source-walked at commit `fb01494` (`/tmp/bocek-ref-calcom-cal.com/`, observed 2026-05-11) for RSC composition patterns specifically.
- **Docs reference:** ✓ Better Auth docs v1.6 (current): `integrations/hono.mdx`, `integrations/next.mdx`, `concepts/cookies.mdx`. Next.js docs v16.2.6 (lastUpdated 2026-05-07): `app/getting-started/fetching-data`. Version-pinned where possible.
- **Contradiction probe:** ✓ Earlier WebFetch on Better Auth Next.js integration page returned "split-deploy not documented" — **falsified** by source-walk of `concepts/cookies.mdx` + `integrations/hono.mdx` which BOTH cover split-deploy patterns explicitly. Walking back that finding. Second contradiction-probe channel: TanStack Start migration cite (Melvin Prince Medium 2026-01-19, partial paywalled — reused from `[[frontend-stack-research]]` cite catalog) — "60% build-time reduction + hydration error class elimination after migrating FROM Next.js 16 TO TanStack Start." Direction of evidence: RSC is contested at the edge; for indie/SMB with simple deploy, RSC remains defensible.

## Sources examined

### Source 1 — Better Auth Hono integration docs

- **Tier:** 2 (official docs).
- **Provenance:** `/tmp/bocek-ref-better-auth-better-auth/docs/content/docs/integrations/hono.mdx` at commit `e21d744`, observed 2026-05-11. Public at `better-auth.com/docs/integrations/hono`.
- **Author context:** Better Auth maintainer team (YC X25-backed, v1.6 current).
- **What it tells us:**
  - Canonical Hono mount verbatim: `app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))`. Three-line integration.
  - CORS pattern verbatim with `cors({ origin, allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["POST", "GET", "OPTIONS"], credentials: true })` from `hono/cors`. **Critical:** CORS middleware MUST register before routes; `credentials: true` required for cross-origin cookies.
  - Session-injection middleware pattern populates `c.var.user` + `c.var.session` from `auth.api.getSession({ headers: c.req.raw.headers })` once at app-level; downstream handlers consume typed `c.var.*`.
  - Cross-domain cookies: `SameSite=Lax` default (works for subdomains + reverse proxy); `SameSite=None` + `Secure=true` + `partitioned=true` for foreign-domain split-deploy.
  - `crossSubDomainCookies: { enabled: true }` config for subdomain-shared cookies.
  - Per-cookie override via `advanced.cookies.sessionToken.attributes` OR global via `advanced.defaultCookieAttributes`.

### Source 2 — Better Auth cookies/concepts docs

- **Tier:** 2 (official docs).
- **Provenance:** `/tmp/bocek-ref-better-auth-better-auth/docs/content/docs/concepts/cookies.mdx`, observed 2026-05-11.
- **What it tells us:**
  - **Two production-cited patterns for cross-domain split-deploy:**
    - **(P1) Reverse proxy** via hosting-provider rewrites — `vercel.json` `rewrites` block proxies `/api/*` from cockpit-origin to backend-origin. API appears first-party to browser. Cookies work without `SameSite=None` complexity.
    - **(P2) Shared parent domain** — `app.example.com` + `api.example.com` share `.example.com`; `crossSubDomainCookies` config sets cookies on parent domain so both subdomains see them.
  - Explicit Vercel `rewrites` example verbatim:
    ```json
    { "rewrites": [{ "source": "/api/:path*", "destination": "https://domainA.com/api/:path*" }] }
    ```
  - Safari ITP (Intelligent Tracking Prevention) warning: foreign-third-party-domain cookies blocked entirely without reverse-proxy or shared-parent-domain. Both patterns above sidestep ITP.

### Source 3 — Better Auth Next.js integration docs

- **Tier:** 2 (official docs).
- **Provenance:** WebFetch `better-auth.com/docs/integrations/next` observed 2026-05-11.
- **What it tells us:**
  - Canonical Next.js handler mount: `app/api/auth/[...all]/route.ts` exports `{ GET, POST } = toNextJsHandler(auth)`. Recommended (but configurable) path.
  - RSC session-read verbatim: `await auth.api.getSession({ headers: await headers() })` (Next.js 16 `headers()` returns Promise).
  - `nextCookies()` plugin REQUIRED for Server Action cookie-setting; without it, Server Action `signInEmail` calls succeed but cookies don't persist.
  - **Documented gotcha:** `getSessionCookie` is for optimistic middleware checks only — does NOT validate session. Authorization decisions MUST go through `auth.api.getSession`. RSCs cannot set cookies — cookie cache won't refresh until client interaction.
  - **Initial WebFetch finding "split-deploy not documented" was wrong** — looking at the Next.js page only; split-deploy lives on the cookies page (Source 2).

### Source 4 — Better Auth demo Next.js app source-walk

- **Tier:** 1 (production code, maintainer-authored).
- **Provenance:** `/tmp/bocek-ref-better-auth-better-auth/demo/nextjs/` at commit `e21d744`, observed 2026-05-11.
- **What it tells us:**
  - `lib/auth.ts` shows full demo config: bearer + organization + admin + customSession + jwt + twoFactor + passkey + scim + sso + stripe + multiSession + oneTap + oAuthProxy + lastLoginMethod + openAPI + deviceAuthorization + electron + dash + sentinel plugins. Heavy plugin surface; BokChoy uses a small subset.
  - `app/api/auth/[...all]/route.ts` shows `toNextJsHandler(auth)` mount + manual `addCorsHeaders` wrapper for OAuth2 endpoints in dev. Pattern: wrap each method export with `withCors(handler.METHOD)`. CORS applied at the route handler level, not via a middleware library.
  - `trustedOrigins` configured in `lib/auth.ts:440`: array of explicit allowed origins including wildcard subdomains via `https://*.better-auth.com` syntax. Production-cited Better Auth own deploy uses subdomain wildcards.
  - Demo uses `bearer()` plugin — confirms BokChoy's slice 8.2.1 bearer-plugin pick is canonical (matches maintainer's own demo).

### Source 5 — Next.js 16 official docs (fetching-data)

- **Tier:** 2 (official docs).
- **Provenance:** WebFetch `nextjs.org/docs/app/getting-started/fetching-data` v16.2.6, lastUpdated 2026-05-07.
- **What it tells us:**
  - **Parallel fetching pattern verbatim** for INDEPENDENT requests: declare promises (no await), then `await Promise.all([p1, p2])`. Requests start when `fetch` is called, not when awaited. Use `Promise.allSettled` for failure-resilient parallel.
  - **Sequential fetching pattern verbatim** for DEPENDENT requests: `const a = await getA(); const b = await getB(a.id)` — second blocks on first. Documented as ACCEPTABLE when one request genuinely depends on another. Wrap downstream component in `<Suspense>` so it streams in after the dependency resolves.
  - **`<Suspense>` granular > `loading.tsx` route-level** explicitly recommended: *"while `loading.js` works well for streaming route segments, using `<Suspense>` closer to the runtime or uncached data access is recommended."*
  - **Layout-uncached-data anti-pattern:** layout that accesses uncached data (`cookies()`, `headers()`, uncached `fetch`) does NOT fall back to same-segment `loading.js` — blocks navigation. Mitigation: wrap uncached access in own `<Suspense>` boundary OR move to page where `loading.js` covers it.
  - **Client Component fetching:** valid via React `use(promise)` API + promise prop-passing; promise initiated in Server Component (no await) + passed to Client Component wrapped in `<Suspense>`.
  - **`React.cache`** for cross-component memoization within a single request — scope is request-only.
  - **`Promise.all` failure mode:** any one rejection rejects all. Use `Promise.allSettled` when partial failure is acceptable.

### Source 6 — Cal.com production code (RSC composition)

- **Tier:** 1 (production code, large-scale B2B SaaS).
- **Provenance:** `/tmp/bocek-ref-calcom-cal.com/` at commit `fb01494`, observed 2026-05-11.
- **Author context:** Cal.com production engineering. 250k+ LOC per `[[frontend-stack-research]]`.
- **What it tells us:**
  - **Heavy `Promise.all` usage** for independent RSC data fetches — observed at minimum 12 pages: getting-started, bookings, availability, settings/calendars, settings/conferencing, settings/appearance, settings/webhooks/new, settings/general, apps/installed. Pattern: caller + data fetch parallel via `Promise.all([fooCaller, barCaller])` then `Promise.all([fooCaller.get(), barCaller.get()])` for the actual data.
  - **`Promise.allSettled`** at boundary where partial failure acceptable: `apps/web/app/api/social/og/image/route.tsx:39` — font loading allows graceful degradation.
  - **`<Suspense>` at layout level** for slow child content: `availability/troubleshoot/layout.tsx` wraps `{children}` in `<Suspense fallback={<LoaderIcon />}>`.
  - **`loading.tsx` for route-segment streaming** at many routes (refer, event-types/[type], availability/[schedule], apps/(homepage), members, event-types, availability, settings/my-account/conferencing, settings/my-account/appearance, settings/my-account/profile). Pattern: `loading.tsx` exists per route segment that has slow data dependencies.
  - **Cite-class disclaimer:** Cal.com uses `next-auth: 4.24.13` (Auth.js, security-patch-only mode per Better Auth 2025-09-22 absorption per `[[backend-stack-research]]`), NOT Better Auth. RSC composition patterns transfer (auth-lib-agnostic); auth-specific patterns do NOT transfer.

### Source 7 — TanStack Start migration cite (contradiction probe, reused)

- **Tier:** 4 (engineering blog, partial paywall).
- **Provenance:** Melvin Prince, Medium 2026-01-19, reused from `[[frontend-stack-research]]` cite catalog.
- **What it tells us:** Anonymized customer migrated FROM Next.js 16 TO TanStack Start citing 60% build-time reduction + hydration-error-class elimination. Per `[[frontend-stack-research]]` contradiction-probe outcome: Cal.com's TO-App-Router weight beats single anonymized FROM-cite at greenfield-MVP scale. Direction of evidence: RSC is contested at the migration edge but remains defensible at greenfield MVP scale. **Reused contradiction; not novel to this entry.**

## Findings

### F1 (LOAD-BEARING) — Reverse-proxy pattern (P1) is the production-cited split-deploy shape for Vercel+container-backend B2B SaaS

Better Auth docs explicitly cover the reverse-proxy pattern via hosting-provider rewrites (Source 2). For Vercel: `vercel.json` `rewrites` block proxies `/api/*` from cockpit to backend. Browser sees first-party requests; cookies work without `SameSite=None`/Safari-ITP complexity.

Concrete for BokChoy slice 8.3:

```json
// apps/cockpit/vercel.json
{
  "rewrites": [
    { "source": "/api/auth/:path*", "destination": "https://api.bokchoy.com/api/auth/:path*" },
    { "source": "/v1/:path*",       "destination": "https://api.bokchoy.com/v1/:path*" }
  ]
}
```

Backend mounts Better Auth at `/api/auth/*` via the canonical Hono pattern (Source 1):

```ts
// apps/backend/src/index.ts
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
```

Cockpit RSC reads session via relative-path fetch (first-party after rewrite):

```ts
// In RSC
const cookieHeader = (await headers()).get('cookie') ?? '';
const res = await fetch('/api/auth/get-session', {
  headers: { cookie: cookieHeader },
  cache: 'no-store',
});
const session = res.ok ? await res.json() : null;
```

Production-cited via Source 2 Vercel example + Source 1 Hono mount pattern. Confidence: high.

### F2 — Shared-parent-domain (P2) is the rejected alternative, with named winning condition

Production-cited via Source 2 — `app.example.com` + `api.example.com` share `.example.com`; `crossSubDomainCookies.enabled = true` + `domain: "example.com"` in Better Auth config; cookies set on parent domain.

**Wins when:** infrastructure requires that backend stay at a distinct subdomain (separate hosting provider, different CDN edge, etc.) AND DNS control over both subdomains is owned AND the additional config burden is acceptable.

**Loses for BokChoy:** (P1) is simpler. Vercel rewrites are zero-config beyond the JSON file. (P2) requires Better Auth config change + DNS records + parent-domain cookie attributes + production-Safari testing.

### F3 (LOAD-BEARING) — Better Auth + Hono integration is canonical at 3 LOC

Source 1 Hono integration docs verbatim:

```ts
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
```

Plus optional session-injection middleware:

```ts
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  await next();
});
```

For BokChoy: the `adminGate` middleware from slice 8.2.0 already calls `auth.api.getSession` per-route. The app-level session-injection middleware from Source 1 is **redundant** when adminGate is already authoritative — adding it would double the session lookup. Adopt adminGate's per-route call as the canonical pattern; don't add app-level session injection.

### F4 — Cockpit deployment scope: NO Better Auth mount on cockpit-side; cockpit is a thin HTTP client

The auth singleton (Source 4 `lib/auth.ts`) depends on database access. BokChoy's auth singleton at `apps/backend/src/infra/auth.ts` (slice 8.2.0) is the single auth instance with the single DB connection pool. Cockpit on Vercel CANNOT meaningfully run a second Better Auth instance — Vercel functions have connection-pool exhaustion risk; cockpit would either need a separate DB connection (operational duplication) or call backend over HTTP anyway (same as F1).

**Implication:** cockpit installs Better Auth's CLIENT-side library (`better-auth/react`) for client-side `useSession()` / `signIn` / `signOut` hooks. The auth INSTANCE (the `betterAuth({...})` config) lives only at the backend.

Source 4 demo has both side-by-side (single-deploy), but the architectural split is clear: instance owns DB, client owns React state.

### F5 (RSC composition canonical patterns)

From Source 5 (Next.js docs) + Source 6 (Cal.com production):

1. **Parallel independent fetches via `Promise.all`** (or `Promise.allSettled` for graceful-degradation). Promises initiated before any `await`. Cal.com uses this pervasively (12+ pages observed).
2. **Sequential dependent fetches via `await ... await`** with downstream component wrapped in `<Suspense>` — NOT an anti-pattern when the dependency is genuine.
3. **`<Suspense>` granularity:** docs explicitly recommend granular `<Suspense>` over route-level `loading.tsx` when independent data has different latency profiles. `loading.tsx` for whole-route streaming when content uniformity holds.
4. **Layout uncached-data anti-pattern:** layout reading `cookies()` / `headers()` / uncached `fetch` BLOCKS navigation — does not fall back to `loading.js`. Mitigation: wrap in own `<Suspense>` OR move to page.
5. **Client Component data via `use(promise)` API** — promise prop-passed from Server Component, no await on the server side, `<Suspense>` boundary around client.
6. **`React.cache`** for cross-component memoization within a single request scope.

### F6 (anti-patterns enumerated with named fixes)

Consolidated from Sources 3, 5, plus prior `[[tanstack-query-rsc-research]]` Q4 + `[[frontend-stack-research]]` Q4:

| # | Anti-pattern | Source | Named fix |
|---|---|---|---|
| 1 | Cascaded `'use client'` (whole subtree client) | Next.js Issue #60246 + Discussion #13763 (prior research) | Leaf-component placement; React Compiler 1.0 hoists boundaries automatically when permitted |
| 2 | Sequential awaits in same RSC for INDEPENDENT data | Source 5 (Next.js docs) | `Promise.all([a, b])` after both promises declared |
| 3 | Layout reading uncached data without local Suspense | Source 5 | Wrap layout's uncached access in own `<Suspense fallback>` OR move to page |
| 4 | Page-level Suspense for partially-slow content | Source 5 docs recommendation | Section-level `<Suspense>` boundaries; instant content streams while slow content shows fallback |
| 5 | `getSessionCookie` for authorization decisions | Source 3 (Better Auth docs) | `auth.api.getSession()` validates server-side; cookie check is optimistic-only |
| 6 | `fetchQuery` results rendered server-side | `[[tanstack-query-rsc-research]]` Q4 (reused) | `prefetchQuery` + `<HydrationBoundary state={dehydrate(qc)}>` + client `useQuery` |
| 7 | TanStack Query default `staleTime: 0` | `[[tanstack-query-rsc-research]]` Q4 (reused) | `defaultOptions.queries.staleTime: 60_000` minimum |
| 8 | Double `invalidateQueries` synchronously | `[[tanstack-query-rsc-research]]` Q4 (reused; Issue #7963) | Single invalidation point per mutation; consolidate via `MutationCache.onSuccess` |
| 9 | TanStack Query owning all data fetching | `[[tanstack-query-rsc-research]]` Q4 (reused) | RSC prefetches for initial; TanStack Query for client-cache + invalidation |
| 10 | Server Action signInEmail without `nextCookies()` | Source 3 | `nextCookies()` plugin in Better Auth config (LAST in plugins array). Or use Route Handler instead of Server Action for sign-in. |
| 11 | `'use client'` on outer layout for tree-shaking convenience | Source 5 + prior research | Outer layout MUST be Server Component; client interactivity at leaves only |
| 12 | Foreign-domain cookies without reverse proxy or `SameSite=None+Secure+Partitioned` | Source 1 + Source 2 | Reverse proxy via hosting rewrites (preferred). Or `defaultCookieAttributes: { sameSite: 'none', secure: true, partitioned: true }` for explicit foreign-domain. |

### F7 — OAuth-primary sign-in form pattern

Per design-pass pick (iii) OAuth Google/GitHub primary + email/password fallback (2026-05-11), the sign-in surface is:

1. **Primary OAuth buttons** (Sign in with Google / Sign in with GitHub) — Client Component triggers `authClient.signIn.social({ provider: 'google' })` from `better-auth/react`. Browser redirects to OAuth provider → callback URL handled by Better Auth's `/api/auth/callback/[provider]` route (auto-mounted by `auth.handler`).
2. **Email/password fallback** — small form (RHF + Zod + shadcn `<Form>` + `<Input>`) calling `authClient.signIn.email({ email, password })` on submit. Client Component pattern; no Server Action needed because Better Auth's client handles cookie-setting on the response. Server Action alternative would require `nextCookies()` plugin (Source 3) — adds complexity for no benefit at MVP.
3. **No magic-link at MVP** — dropped from `[[backend-stack]]` §7's original "(or magic-link)" hedge. Vault entry `[[admin-auth-surface]]` already names this as a `[[backend-stack]]` §7 amendment owed in next /design pass.

## Conflicts

### C1 — "Better Auth split-deploy is not documented" (falsified, walked back)

Initial WebFetch on `better-auth.com/docs/integrations/next` returned this finding. Falsified by Source 2 (`concepts/cookies.mdx`) + Source 1 (`integrations/hono.mdx`) which BOTH document the patterns. Per *Contradiction protocol* (production code + multiple docs pages beat a single docs page), the split-deploy patterns ARE documented; the Next.js integration page just doesn't repeat them. Walked back the original WebFetch finding; current entry uses the cookies-page + Hono-page material as load-bearing.

### C2 — Cal.com cite-class mismatch (Better Auth claim vs next-auth reality)

`[[backend-stack-research]]` Source 8 named Cal.com as a Better Auth production user. Reality (Source 6 source-walk): `apps/web/package.json:111` lists `next-auth: 4.24.13`. Cal.com is on Auth.js (next-auth), which Better Auth is absorbing per the 2025-09-22 transition per `[[backend-stack-research]]` Q3. **Cal.com is not a Better Auth production user; it's a future migration target.** Same class as the prior /design seat's Stripe `unit_amount_decimal` adjacent-vs-same-class cite mismatch. Cal.com's value to this entry is RSC composition patterns (auth-lib-agnostic), NOT auth-specific patterns. The auth-specific patterns triangulate via Sources 1+2+3+4. `[[backend-stack-research]]` Source 8 amendment owed to next /design pass.

### C3 — TanStack Start migration cite (RSC at-the-edge contested)

Per `[[frontend-stack-research]]` contradiction probe: one customer migrated FROM Next.js 16 TO TanStack Start. Cumulative-evidence weight (Cal.com 250k LOC TO App Router + Vercel commerce templates TO RSC + maintainer ecosystem TO RSC) beats single anonymized FROM-cite at greenfield-MVP scale. Direction: RSC is contested at the migration edge; defensible for greenfield. **Reused; not novel.**

## Conditions

- **Time:** May 2026. Better Auth v1.6; Next.js 16.2.6; Cal.com commit `fb01494`; Better Auth commit `e21d744`.
- **Topology:** Vercel cockpit + container-PaaS backend (Hono) per `[[frontend-stack]]:74` + `[[backend-service-shape]]`. Findings apply ONLY to this split-deploy shape.
- **Auth UX:** OAuth Google/GitHub primary + email/password fallback per design pick (iii) 2026-05-11. Magic-link dropped from MVP.
- **MVP audience:** 2-person team integrating BokChoy into their game per user pick 2026-05-11.
- **Scope of "ships":** documented + production-cited reverse-proxy pattern. Does NOT validate that the FULL OAuth callback flow + cookie-attribute-tuning + Safari production-test passes — slice 8.3 implementation owes that verification end-to-end via smoke script.

**Does NOT hold for:**
- Edge-runtime auth (Cloudflare Workers / Vercel Edge Functions) — Better Auth's DB-connection dependency is the constraint; out of scope per `[[backend-service-shape]]`.
- Mobile SDK auth flows — Better Auth ships `@better-auth/expo` per Source 4 demo plugins but BokChoy MVP is cockpit-web only.
- Multi-region / latency-bounded auth — single-region per `[[wedge-decision]]` deferred until Series A scale.

## Operational implications

### For slice 8.3 (cockpit β-shape) implementation

1. **`apps/cockpit/vercel.json`** — add `rewrites` block proxying `/api/auth/:path*` + `/v1/:path*` to `https://api.bokchoy.com/:path*` (or env-driven `BOKCHOY_BACKEND_URL`). Closes the split-deploy CORS surface entirely; browser sees first-party requests.

2. **`apps/backend/src/index.ts`** — mount Better Auth handler verbatim per Source 1:
   ```ts
   app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
   ```
   No `cors()` middleware needed for the auth path under (P1) reverse-proxy — requests appear same-origin to backend per Vercel-rewrite forwarding. If (P2) ever picked, add `cors({ origin: 'https://app.bokchoy.com', credentials: true })` per Source 1 verbatim. Slice 8.3 implementation defers CORS to (P1).

3. **Better Auth config additions** in `packages/auth-config/src/index.ts`:
   - `trustedOrigins: ['https://app.bokchoy.com', 'http://localhost:3000']` (cockpit prod + dev origins).
   - No `crossSubDomainCookies` config (P1 doesn't need it).
   - `nextCookies()` plugin NOT added on the backend — that plugin is for Next.js Server Actions on the cockpit side. Backend stays Hono-native. **However**, if slice 8.3 uses Server Actions for sign-in (vs Client-Component-only), the cockpit needs its OWN Better Auth client config that includes `nextCookies()` for the cockpit-side cookie write — this is a different concern from the backend auth instance. **Decision: use Client Component sign-in (F7 pattern 1+2), avoid Server Action complexity for MVP. Revisit if customer demand for Server Action sign-in emerges.**

4. **Cockpit Better Auth React client** at `apps/cockpit/lib/auth-client.ts`:
   ```ts
   import { createAuthClient } from 'better-auth/react';
   import { organizationClient } from 'better-auth/client/plugins';

   export const authClient = createAuthClient({
     baseURL: '/', // relative — Vercel rewrites handle the backend
     plugins: [organizationClient()],
   });
   ```
   No `baseURL: 'https://api.bokchoy.com'` — Vercel rewrite makes relative paths work. This is the (P1) ergonomic win.

5. **RSC session-read pattern** at any cockpit RSC needing the user:
   ```ts
   // apps/cockpit/lib/session.ts
   import { headers } from 'next/headers';
   import { cache } from 'react';

   export const getSession = cache(async () => {
     const cookieHeader = (await headers()).get('cookie') ?? '';
     // Relative path — Vercel rewrites to backend
     const res = await fetch(new URL('/api/auth/get-session', process.env.BOKCHOY_INTERNAL_URL ?? 'http://localhost:3000'), {
       headers: { cookie: cookieHeader },
       cache: 'no-store',
     });
     return res.ok ? await res.json() : null;
   });
   ```
   `React.cache` per F5.6 prevents duplicate fetches within a single request.

   **Note:** RSC requires absolute URL for `fetch` (relative paths don't work server-side). Use `BOKCHOY_INTERNAL_URL` env var to call the backend directly server-to-server (skips Vercel-rewrite overhead). For browser-side fetches, relative paths through Vercel-rewrite work.

6. **Projects list page** (slice 8.3 first non-auth surface):
   ```ts
   // apps/cockpit/app/projects/page.tsx — Server Component
   import { getSession } from '@/lib/session';
   import { redirect } from 'next/navigation';
   import { Suspense } from 'react';
   import { ProjectsList } from './projects-list'; // RSC
   import { ProjectsListSkeleton } from './projects-list-skeleton'; // Client or RSC

   export default async function ProjectsPage() {
     const session = await getSession();
     if (!session) redirect('/sign-in');
     return (
       <div>
         <h1>Projects</h1>
         <Suspense fallback={<ProjectsListSkeleton />}>
           <ProjectsList />
         </Suspense>
       </div>
     );
   }
   ```
   Section-level `<Suspense>` per F5.3 — header renders immediately; list streams in.

7. **Anti-patterns to enforce via PR review** (extension of `[[frontend-stack]]` enforcement list):
   - F6.2 sequential awaits in same RSC for independent data → use `Promise.all`
   - F6.3 layout reading uncached data without local Suspense
   - F6.4 page-level Suspense for partially-slow content → section-level
   - F6.10 Server Action signIn without `nextCookies()` (if Server Actions used post-MVP)
   - F6.11 `'use client'` on outer layout
   - F6.12 foreign-domain cookies without proxy/cookie-attribute config (alarm if (P1) ever bypassed)

8. **Cascade obligations queued for slice 8.3 implementation:**
   - `apps/cockpit/package.json` — add deps: `next@^16.2.6`, `react@^19.2`, `better-auth` (catalog), `@bokchoy/auth-config` workspace, `@bokchoy/db` workspace (or skip if cockpit never reads DB directly), `@tanstack/react-query` (catalog), `tailwindcss@^4`, `@radix-ui/*`, `react-hook-form`, `zod` (catalog), `@hookform/resolvers`.
   - `apps/cockpit/vercel.json` — `rewrites` block per (1) above.
   - `apps/cockpit/next.config.ts` — Cache Components opt-in, instrumentation, etc. per `[[frontend-stack]]`.
   - `apps/cockpit/lib/auth-client.ts` — Better Auth React client.
   - `apps/cockpit/lib/session.ts` — RSC session-read with `React.cache`.
   - `apps/cockpit/app/sign-in/page.tsx` — OAuth-primary form per F7.
   - `apps/cockpit/app/projects/page.tsx` — projects list (RSC + Suspense).
   - `apps/backend/src/index.ts` — mount Better Auth handler at `/api/auth/*`.
   - `apps/backend/src/wallet/index.ts` or new module — `GET /v1/orgs/me` + `GET /v1/projects` admin endpoints behind `adminGate`.
   - `packages/auth-config/src/index.ts` — `trustedOrigins` extension for cockpit origins.

## Reproducibility note

Reproducible. Another investigator with the same question and Bun + git CLI reaches the same finding:

1. Clone `better-auth/better-auth` shallow.
2. Read `docs/content/docs/integrations/hono.mdx` + `docs/content/docs/concepts/cookies.mdx` + `docs/content/docs/integrations/next.mdx`.
3. Source-walk `demo/nextjs/lib/auth.ts` + `demo/nextjs/app/api/auth/[...all]/route.ts`.
4. Cross-reference Next.js 16 docs at `nextjs.org/docs/app/getting-started/fetching-data`.
5. Clone `calcom/cal.com` shallow; grep for `Promise.all` + `<Suspense>` + `loading.tsx` patterns in `apps/web/app/`.

No load-bearing judgment beyond cite-class verification (Cal.com next-auth vs Better Auth correction).

## Amendment 2026-05-11 — Vercel React Best Practices + Composition Patterns skills integrated

User directive 2026-05-11 (this session, post-initial-research): read the Vercel skills at `~/.claude/skills/vercel-react-best-practices/` and `~/.claude/skills/vercel-composition-patterns/`. Both are Vercel-maintainer-authored engineering guides (tier 4, but maintainer-authored at Vercel scale — load-bearing for Next.js patterns).

### Sources 8 + 9 added

#### Source 8 — Vercel React Best Practices skill (`vercel-react-best-practices`)

- **Tier:** 4 (engineering guide, Vercel-maintainer-authored).
- **Provenance:** `~/.claude/skills/vercel-react-best-practices/` — 69 rules across 8 priority-ranked categories. Maintained by Vercel.
- **Author context:** Vercel engineering — same team that ships Next.js.
- **What it tells us:** Confirms F5 canonical patterns + adds concrete impact metrics + extends F6 with 7 anti-patterns. Priority 1 "Eliminating Waterfalls" (impact: 2-10× improvement per `async-parallel.md`) matches F5.1 / F6.2. New rules surfaced:
  - **`server-no-shared-module-state` (HIGH impact)** — mutable module-level variables for request-scoped data on the server leak across concurrent renders. Race conditions, cross-request contamination, security bugs where one user's data appears in another user's response. Treat module scope on the server as PROCESS-WIDE shared memory, not request-local. Safe exceptions: immutable static config, intentional cross-request caches with correct keying, process-wide singletons with no request-specific mutable data.
  - **`server-dedup-props` (LOW impact)** — RSC→client serialization deduplicates by REFERENCE, not value. `.toSorted()`, `.filter()`, `.map()`, `.slice()`, `[...arr]` all create new references and double-serialize. For `string[]`/`number[]`/`boolean[]`: HIGH impact (full duplication). For `object[]`: LOW impact (nested objects dedup by reference). Move transformations to Client Components when possible.
  - **`server-hoist-static-io` (MEDIUM impact)** — static I/O (fonts, logos, config) loaded ONCE at module level, not in render path.
  - **`server-cache-react` + `server-cache-lru`** — `React.cache()` for per-request memoization (matches F5.6); LRU cache for cross-request caching (different use case).
  - **`server-after-nonblocking`** — use Next.js 16 `after()` API for non-blocking operations after response (logging, cleanup, etc).
  - **`bundle-barrel-imports` (CRITICAL impact)** — barrel files (`index.ts` re-exporting everything) prevent tree-shaking. Direct imports only: `import { Button } from '@radix-ui/react-button'`, not `import { Button } from '@radix-ui'`. Critical for cockpit's `<200KB gzipped` target per `[[frontend-stack]]`.
  - **`async-cheap-condition-before-await`** — check cheap sync conditions before awaiting flags/remote values. E.g., `if (!user) return null; const data = await expensiveFetch()` instead of `const data = await expensiveFetch(); if (!user) return null`.
  - **`async-defer-await`** — move `await` into branches where actually used; don't await upfront if some code paths don't need the data.

#### Source 9 — Vercel React Composition Patterns skill (`vercel-composition-patterns`)

- **Tier:** 4 (engineering guide, Vercel-maintainer-authored).
- **Provenance:** `~/.claude/skills/vercel-composition-patterns/` — 4 priority categories.
- **What it tells us:** Component-architecture patterns for scaling React apps. Most relevant additions:
  - **`architecture-avoid-boolean-props`** — don't add boolean props to customize behavior; use composition (compound components, slots). Boolean-prop proliferation is the LLM-typical failure mode for component-library design. Critical at cockpit-core (months 4-5) when designer-facing live-ops surfaces ship; defensive at MVP β-slice but worth enforcing from day 1.
  - **`architecture-compound-components`** — complex components share state via Context provider. The provider is the only place that knows how state is managed (`state-decouple-implementation`).
  - **`patterns-children-over-render-props`** — use `children` for composition, not `renderX` props. Cleaner JSX, better for compound-component patterns.
  - **`react19-no-forwardref`** — React 19 (Next.js 16 default) — `forwardRef` is no longer needed; refs are regular props. Replace `useContext()` with React 19's `use()`.

### F8 — Vercel-cited canonical patterns confirm F5/F6 + add 5 anti-patterns to enforce

The two Vercel skills confirm every F5 canonical pattern at the maintainer level (Vercel ships Next.js + maintains these guides). Net-new anti-patterns extending F6:

| # (extends F6) | Anti-pattern | Source | Impact | Named fix |
|---|---|---|---|---|
| 13 | Shared module-level state for request data on server | Source 8 `server-no-shared-module-state` | HIGH (data leaks across concurrent renders) | Keep request data local to the render tree; pass via props or component arguments. Cockpit example: NEVER cache session in module-level `let session = null` — use `React.cache(getSession)` per-request only. |
| 14 | RSC→client transformations that create new array/object references | Source 8 `server-dedup-props` | LOW for object[], HIGH for string[]/number[]/boolean[] (double-serialized) | Pass raw data to client; do `.toSorted()` / `.filter()` / `.map()` in Client Component via `useMemo`. |
| 15 | Barrel imports (`import * from '@some/lib'`) | Source 8 `bundle-barrel-imports` | CRITICAL (prevents tree-shaking) | Direct named imports only. Cockpit example: `import { Button } from '@/components/ui/button'`, not `import { Button } from '@/components/ui'`. |
| 16 | Boolean-prop proliferation on cockpit components | Source 9 `architecture-avoid-boolean-props` | MEDIUM (scales poorly at cockpit-core) | Composition via slots/compound components. Vault entry's slice 8.3 components SHOULD design API around composition from day 1; cockpit-core will fail otherwise. |
| 17 | `forwardRef` for ref-forwarding in React 19 components | Source 9 `react19-no-forwardref` | LOW (works, but obsolete) | Refs are regular props in React 19; replace `useContext()` with `use(Context)`. |

### F9 — Vercel rule `server-no-shared-module-state` directly applies to cockpit `lib/session.ts`

Per F1+F4 operational implication (5) from the original entry, cockpit's RSC session-read uses `React.cache(getSession)`. The Vercel rule confirms this pattern as the correct one — `React.cache` scopes per-request, no shared module state. **DO NOT** cache the session in module-level `let cachedSession`. This is a concrete enforcement point for the slice 8.3 PR review checklist.

### F10 — Vercel rule `bundle-barrel-imports` directly applies to cockpit shadcn imports

`[[frontend-stack]]` already vaulted shadcn/ui via copy-into-source pattern (not npm-package barrel). Cockpit will have `apps/cockpit/components/ui/button.tsx` etc. — but the import path `@/components/ui` must NOT be a barrel re-export. Each component imported by direct path. Slice 8.3 implementation enforces this from day 1.

### Operational implications added by Sources 8+9

Extend the original "Operational implications" section:

- **`apps/cockpit/lib/session.ts`** — explicit comment in the file noting "never cache session in module-level state per Vercel `server-no-shared-module-state`; `React.cache` is per-request."
- **`apps/cockpit/components/ui/` barrel discipline** — shadcn components copied in MUST be imported by specific file path, NEVER via a barrel `index.ts` re-export. Add to PR-review enforcement.
- **Component API design from day 1** — even the simple sign-in form + projects list should design API via composition, not boolean-prop variants. Reference vault entry at PR review for any cockpit component that takes ≥2 boolean props.
- **React 19 patterns** — Next.js 16 uses React 19. New cockpit components use `use(Context)` instead of `useContext()`; refs are regular props (no `forwardRef`). PR-review enforcement.

### Reproducibility note for Sources 8+9

Reproducible. Another investigator with access to the Vercel skills at `~/.claude/skills/vercel-{react-best-practices,composition-patterns}/` reaches identical findings by:
1. Reading the `SKILL.md` index for each skill (canonical priority + rule taxonomy).
2. Reading individual rule files for full code examples.
3. Cross-referencing against Next.js 16 docs + Source 5.

No load-bearing judgment beyond skill applicability triage (which rules apply to slice 8.3's small surface vs. which are dashboard-v1+ scope).

## Open threads

- **`[[backend-stack]]` §7 amendment owed.** Vault revisions:
  - Line 116 cockpit web login: "email/password + magic-link (or OAuth on demand)" → "OAuth Google/GitHub primary + email/password fallback; magic-link deferred" per design pick (iii) 2026-05-11.
  - Line 117 admin SSO: already OAuth; no change needed.
  - Add cross-reference to `[[cockpit-stack-integration-research]]`.
- **`[[backend-stack-research]]` Source 8 cite-class amendment.** Cal.com listed as Better Auth user; reality is next-auth 4.24.13. Same correction-class as Stripe `unit_amount_decimal` adjacency. Down-rate Source 8 cite class; Cal.com retains weight as RSC composition reference only.
- **`apps/cockpit/` scaffolding** — Next.js 16 setup, Tailwind v4 config, shadcn CLI init, TanStack Query provider mount. Inline /design + /implementation work; not research.
- **`GET /v1/orgs/me` + `GET /v1/projects` backend handlers** — slice 8.3 backend dependency. Contract design owed (response shape, pagination posture). Inline /design.
- **Safari ITP production verification** — slice 8.3 smoke must test the OAuth callback flow + session persistence in Safari specifically. Source 2 explicitly flags Safari as the failure-mode browser; even with (P1) reverse proxy, production verification owed.
- **OAuth provider config** — Google OAuth client ID/secret + GitHub OAuth app + callback URLs + scopes. Operational config; not research.
- **`nextCookies()` plugin decision** — if cockpit Server Actions are added post-MVP, `nextCookies()` becomes load-bearing for cookie persistence. Currently deferred via F7 Client-Component-only pattern. Revisit when first Server Action ships.
- **TanStack Query + RSC integration** — `[[tanstack-query-rsc-research]]` already covers; slice 8.3 implements the patterns vaulted there. No new research owed.
