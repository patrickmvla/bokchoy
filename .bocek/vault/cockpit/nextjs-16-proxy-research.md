---
type: research
features: [cockpit]
related: ["[[cockpit-stack-integration-research]]", "[[cockpit/nextjs-scaffold-research]]", "[[cockpit/auth-surface-mount]]", "[[cockpit/admin-list-endpoints-contract]]"]
created: 2026-05-14
confidence: high
provisional: false
---

# Next.js 16 middleware → proxy rename: canonical edge-level auth-gate shape for slice 8.3.6

## Question

In Next.js 16.2.x, what is the canonical convention for an edge-level auth gate — (a) file location and name, (b) handler/runtime semantics, (c) matcher syntax, (d) integration shape with Better Auth's `getSessionCookie` — given that the cockpit is on Next.js 16 with `cacheComponents` + `reactCompiler` enabled?

Triggered by halt on 2026-05-14: the implementation seat was about to write `apps/cockpit/middleware.ts` from training-data defaults. Per `[[feedback-fast-moving-oss-research-first]]`: Next.js framework majors are exactly the class of moving target where training defaults rot fastest. The user's halt-flag — *"next 16 changed a lot of things"* — was load-bearing.

## Triangulation

- **Production reference:** ✓ — `Achour/nextjs-better-auth` public repo, `proxy.ts` at HEAD, demonstrates `proxy` function + Better Auth `getSessionCookie` import.
- **Docs reference:** ✓ — Next.js 16.2.6 official docs (file-convention page + upgrade-to-16 guide, both `lastUpdated: 2026-05-13`) + Better Auth `integrations/next` page.
- **Contradiction probe:** ✓ — Active search for "middleware deprecated in 16", "proxy.ts vs middleware.ts", "Edge Runtime still supported". Found unanimous secondary coverage; no credible disagreement on the rename. The remaining disagreement (Better Auth Issue #6360) is doc-style nuance about which warning attaches to `getSession` vs `getSessionCookie`, NOT about the proxy/middleware shape itself.

## Sources examined

### Source 1 — Next.js 16.2.x file-convention docs (proxy)

- **Tier:** 2 (official docs).
- **Provenance:** WebFetch `nextjs.org/docs/app/api-reference/file-conventions/proxy` observed 2026-05-14. Page metadata: `version: 16.2.6`, `lastUpdated: 2026-05-13`. URL note: the page **redirects to `/proxy`**; the historical `/middleware` URL is deprecated.
- **What it tells us:**
  - **Version history (verbatim):** `v16.0.0` — *"Middleware is deprecated and renamed to Proxy. Proxy defaults to the Node.js runtime."* `v15.5.0` — *"Middleware can now use the Node.js runtime (stable)."* `v15.2.0` — *"Middleware can now use the Node.js runtime (experimental)."*
  - **Runtime constraint (verbatim):** *"Proxy defaults to using the Node.js runtime. The `runtime` config option is not available in Proxy files. Setting the `runtime` config option in Proxy will throw an error."*
  - **File location:** *"Create a `proxy.ts` (or `.js`) file in the project root, or inside `src` if applicable, so that it is located at the same level as `pages` or `app`."*
  - **Function shape:** *"The file must export a single function, either as a default export or named `proxy`."* The named-export form is `export function proxy(request: NextRequest)`. Both sync and `async` allowed.
  - **Param type:** *"This parameter is an instance of `NextRequest`."* Optional shorthand: `import type { NextProxy } from 'next/server'; export const proxy: NextProxy = (request, event) => { … }` — infers both `request` (NextRequest) and `event` (NextFetchEvent).
  - **Matcher syntax (unchanged from v12+):** path-to-regexp anchored from start of path, supports `:path*`/`:path+`/`:path?` modifiers, regex groups, array of strings or `{source, locale, has, missing}` objects. Constants only (statically analyzed at build).
  - **Redirect:** `NextResponse.redirect(new URL('/sign-in', request.url))` — produces a real HTTP redirect; status is 307 by default (or 308 for permanent via second arg). `Response.redirect` also works.
  - **Execution order:** Proxy runs AFTER `headers` + `redirects` from `next.config.js`, BEFORE filesystem routes + rewrites + dynamic routes. Critical: *"`headers` from `next.config.js` (1) → `redirects` (2) → Proxy (3) → `beforeFiles` rewrites (4) → Filesystem routes (5)…"* — proxy runs BEFORE the cockpit's `rewrites()` block in `next.config.ts`.
  - **Without a `matcher`, Proxy runs on EVERY request** including `_next/static`, `_next/image`, `public/`. Negative matchers required to exclude.
  - **Renamed config flags:** `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`; same for `skipTrailingSlashRedirect` (unchanged name, still applies).
  - **Server Functions caveat (verbatim):** *"Server Functions are not separate routes in this chain. They are handled as POST requests to the route where they are used, so a Proxy matcher that excludes a path will also skip Server Function calls on that path. A matcher change or a refactor that moves a Server Function to a different route can silently remove Proxy coverage. Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone."*
  - **Migration rationale (verbatim):** *"The reason behind the renaming of `middleware` is that the term 'middleware' can often be confused with Express.js middleware … This feature is recommended to be used as a last resort. Next.js is moving forward to provide better APIs with better ergonomics so that developers can achieve their goals without Middleware."*
  - **Codemod:** `npx @next/codemod@canary middleware-to-proxy .` — renames file + function.

### Source 2 — Next.js 16 upgrade guide

- **Tier:** 2 (official docs).
- **Provenance:** WebFetch `nextjs.org/docs/app/guides/upgrading/version-16` observed 2026-05-14. Page metadata: `version: 16.2.6`, `lastUpdated: 2026-05-13`.
- **What it tells us:**
  - **Edge runtime escape hatch (verbatim):** *"The `edge` runtime is NOT supported in `proxy`. The `proxy` runtime is `nodejs`, and it cannot be configured. If you want to continue using the `edge` runtime, keep using `middleware`. We will follow up on a minor release with further `edge` runtime instructions."* Vercel has NOT yet shipped the Edge-runtime-in-proxy story; deferred to a future minor.
  - **Backward compat:** `middleware.ts` still works in 16.x with deprecation warning. Will be removed in a future major.
  - **Codemod migrates flags too:** `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize` auto-renamed.
  - **Other 16 breaking changes NOT relevant to slice 8.3.6 but worth tracking** (verified against current cockpit state, see *Operational implications* §): Async Request APIs hard-removed sync access (we already use `await headers()` per `apps/cockpit/lib/session.ts:48` ✓); `experimental_ppr` removed, replaced with top-level `cacheComponents` (already top-level in `next.config.ts:22` ✓); `experimental.turbopack` promoted to top-level `turbopack` (already top-level in `next.config.ts:47` ✓); `experimental.dynamicIO` / `experimental.useCache` deprecated in favor of `cacheComponents` ✓; `next lint` removed (cockpit uses Biome — not affected); Turbopack default; Node 20.9+ required; React 19.2 Canary; `revalidateTag(tag, cacheLife)` now requires the second arg (no current callers).

### Source 3 — Better Auth Next.js integration docs

- **Tier:** 2 (official docs).
- **Provenance:** WebFetch `better-auth.com/docs/integrations/next` observed 2026-05-14. Better Auth v1.6.x.
- **What it tells us:**
  - **Documents BOTH patterns side-by-side:**
    - *"Next.js 16+ (Proxy): `proxy.ts` with function named `proxy`."*
    - *"Versions 13–15.x: `middleware.ts` with function named `middleware`."*
  - **Canonical signature:** `getSessionCookie(request)` — first arg `Request | Headers`; second arg optional config `{ cookiePrefix?: string; cookieName?: string; path?: string }`. Returns `string | null`.
  - **Default cookie name:** `better-auth.session_token` (with `__Secure-` prefix auto-applied in production). No custom prefix needed if the auth-config doesn't override `advanced.cookiePrefix` or `advanced.cookies.*.name` — which it doesn't in `packages/auth-config/src/index.ts:172-177` (verified 2026-05-14).
  - **Disclaimer (verbatim):** *"THIS IS NOT SECURE! This is the recommended approach to optimistically redirect users. You must always validate the session on your server for any protected actions or pages."*
  - **Note:** Better Auth Issue #6360 (closed as duplicate of #6187, locked) argues this warning is over-broad — it specifically applies to `getSessionCookie` (cookie-presence-only, no validation), NOT to `auth.api.getSession()` which actually validates server-side. Doc nuance issue; doesn't affect our pattern: we use `getSessionCookie` in `proxy.ts` optimistically + `auth.api.getSession()` server-side validation in `app/(app)/layout.tsx` as defense-in-depth. Stack matches the documented secure approach.

### Source 4 — `Achour/nextjs-better-auth` production repo (`proxy.ts`)

- **Tier:** 1 (production code; small-scale OSS reference impl, not a maintainer demo).
- **Provenance:** WebFetch `raw.githubusercontent.com/Achour/nextjs-better-auth/main/proxy.ts` observed 2026-05-14.
- **Author context:** OSS template repo; smaller scale than a maintainer-shipped demo. Useful for the *shape* (imports, function name, matcher array form) — not for production-scale operational patterns.
- **What it tells us:**
  - **Imports:** `import { NextRequest, NextResponse } from "next/server";` + `import { getSessionCookie } from "better-auth/cookies";`
  - **Function:** named export `export async function proxy(request: NextRequest)`.
  - **Logic shape:** bidirectional gate — authenticated user on `/login` or `/signup` → redirect to `/dashboard`; unauthenticated user on `/dashboard` → redirect to `/signup`.
  - **Matcher (verbatim):** `matcher: ["/dashboard", "/login", "/signup"]` — flat array of bare paths. Bare strings work without `:path*` wildcards.
  - **Returns `NextResponse.redirect(new URL("/dashboard", request.url))`** — same shape as docs.

### Source 5 — Better Auth Issue #6853 (Next.js 16 server error)

- **Tier:** 6 (forum / issue tracker).
- **Provenance:** WebFetch `github.com/better-auth/better-auth/issues/6853` observed 2026-05-14. Issue status: closed as not planned.
- **What it tells us:** Reporter experienced server error after restart with Keycloak OAuth + `proxy.ts` checking session cookie. Root cause not confirmed — closed without resolution. **Useful as a soft warning** that OAuth + proxy + Next.js 16 has rough edges at the integration boundary (consistent with `[[cockpit-stack-integration-research]]` open thread #2 on OAuth preview-deploy verification still owed). Does NOT contradict the rename shape.

### Source 6 — Better Auth Issue #6360 (docs accuracy)

- **Tier:** 6 (forum / issue tracker).
- **Provenance:** WebFetch `github.com/better-auth/better-auth/issues/6360` observed 2026-05-14. Status: closed as duplicate of #6187, conversation locked.
- **What it tells us:** Reporter argues the *"THIS IS NOT SECURE"* disclaimer on `getSession` snippets in the Next.js docs misattributes the warning — `getSession` IS server-side-validated and IS secure; the warning belongs only on `getSessionCookie`. Doc bug, doesn't affect our pattern.

## Findings

### F1 (LOAD-BEARING) — `middleware.ts` → `proxy.ts` rename is a v16.0.0 breaking-by-deprecation change

Per Source 1's version history line `v16.0.0`: *"Middleware is deprecated and renamed to Proxy."* Concrete migration:

```
File:     middleware.ts                              →  proxy.ts
Function: export function middleware(request)        →  export function proxy(request)
Flag:     skipMiddlewareUrlNormalize                 →  skipProxyUrlNormalize
Codemod:  npx @next/codemod@canary middleware-to-proxy .
```

Backward compat: `middleware.ts` continues to work in 16.x with a deprecation warning. Removal scheduled for a future major version (no date pinned in docs).

### F2 (LOAD-BEARING) — Proxy runs on Node.js runtime; Edge Runtime is unavailable in `proxy.ts`

Per Source 2 verbatim: *"The `edge` runtime is NOT supported in `proxy`. The `proxy` runtime is `nodejs`, and it cannot be configured."*

Implication for slice 8.3.6 framing: *"edge-level optimistic cookie check"* (the framing in `state.md`'s "Next on resume #1") is **stale terminology** — should be *"proxy-level optimistic cookie check via `getSessionCookie`, Node.js runtime."* The latency story remains comparable in practice (Source 1: *"in optimized cases deployed to your CDN for fast redirect/rewrite handling"* — hosting platforms may still CDN-deploy proxy functions despite the Node.js runtime classification), but the underlying runtime model has changed.

**For BokChoy specifically:** `getSessionCookie` is pure cookie parsing (no runtime dependency); the change is API-shape-neutral.

**Edge Runtime escape hatch:** Source 2 names one — *"If you want to continue using the `edge` runtime, keep using `middleware`. We will follow up on a minor release with further `edge` runtime instructions."* Vercel hasn't shipped the Edge-runtime-in-proxy follow-up yet. For the cockpit's auth gate use case, this escape hatch is unnecessary (`getSessionCookie` is runtime-agnostic).

### F3 — `getSessionCookie` import path + signature unchanged from prior Better Auth versions

Per Source 3 + cockpit-local `node_modules/better-auth/dist/cookies/index.d.mts` (Better Auth `1.6.9`, verified 2026-05-14):

```ts
declare const getSessionCookie: (
  request: Request | Headers,
  config?: {
    cookiePrefix?: string;
    cookieName?: string;
    path?: string;
  } | undefined
) => string | null;
```

Import: `import { getSessionCookie } from 'better-auth/cookies';`. Returns the cookie value when present, `null` when absent. **No validation** — that's `auth.api.getSession()` server-side.

`NextRequest extends Request` — pass-through compatible without cast.

### F4 — Matcher syntax is unchanged across the rename

Path-to-regexp anchored from start of path, same modifiers (`:path*`, `:path+`, `:path?`), same array-of-strings or array-of-objects shape. Bare strings work without wildcards.

For slice 8.3.6's `(app)/projects` URL tree: `matcher: ['/projects', '/projects/:path*']` is the right shape. Equivalent (less explicit) shorthand: `'/projects/:path*'` alone (path-to-regexp `*` is zero-or-more so it matches bare `/projects` too) — but the two-entry form survives a future refactor that flips `*` to `+` without silently losing bare-path coverage.

### F5 (LOAD-BEARING for `state.md`'s "RSC migration" obligation, NOT for 8.3.6 itself) — Server Functions silently bypass proxy matchers

Per Source 1's *Execution order* note: Server Functions are POSTs to the route they're used in; a matcher that excludes a path also excludes its Server Functions. Docs explicit: *"Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone."*

For BokChoy: no current Server Action usage (per `[[cockpit-stack-integration-research]]` operational note #3: *"Decision: use Client Component sign-in (F7 pattern 1+2), avoid Server Action complexity for MVP."*). This finding parks until a future Server Action lands.

### F6 — Other Next.js 16 breaking changes that affect cockpit work, audited current state

| # | 16 breaking change | Cockpit state today | Action |
|---|---|---|---|
| 1 | `headers()`, `cookies()`, `draftMode()` removed sync access | `apps/cockpit/lib/session.ts:48` already `await headers()` | ✓ none |
| 2 | `params` / `searchParams` are Promises in `page.tsx` | `apps/cockpit/app/(app)/projects/[id]/page.tsx` already `Promise<{id}>` per slice 8.4 | ✓ none |
| 3 | `experimental_ppr` removed; replaced by top-level `cacheComponents` | `next.config.ts:22` already top-level `cacheComponents: true` | ✓ none |
| 4 | `experimental.turbopack` promoted to top-level `turbopack` | `next.config.ts:47` already top-level `turbopack: { root }` | ✓ none |
| 5 | `experimental.dynamicIO` / `experimental.useCache` deprecated | Not used | ✓ none |
| 6 | `next lint` removed | Cockpit uses Biome | ✓ none |
| 7 | Turbopack now default; `--turbopack` flag unnecessary | `package.json` scripts may still pass `--turbopack` — verify | **AUDIT** |
| 8 | Node.js 20.9+ required | Bun-runtime cockpit; Node fallback path uses Bun catalog | **AUDIT** if CI ever falls back to Node |
| 9 | React 19.2 Canary in App Router | Per slice 8.4.0 cockpit ships React 19 + Compiler | ✓ none |
| 10 | `revalidateTag(tag, cacheLife)` now requires 2nd arg | No callers in cockpit today | ✓ none |
| 11 | Parallel routes require `default.js` | Cockpit doesn't use parallel routes today | ✓ none |
| 12 | `next/image` `qualities` default narrowed to `[75]` | Cockpit doesn't use `next/image` non-default qualities today | ✓ none |
| 13 | `next/image` `minimumCacheTTL` default 60s → 4h | Defaults; no override owed | ✓ none |
| 14 | `serverRuntimeConfig` / `publicRuntimeConfig` removed | Not used (env-var pattern already) | ✓ none |

Two action items surface — both should be triaged in a follow-on cockpit-tooling cleanup slice; neither blocks slice 8.3.6. **Action items vaulted to F8.**

### F7 — Canonical `proxy.ts` shape for cockpit slice 8.3.6 (synthesizing F1–F4)

```ts
// apps/cockpit/proxy.ts
import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest): NextResponse {
  const cookie = getSessionCookie(request);
  if (cookie === null) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/projects', '/projects/:path*'],
};
```

**Mounted role split** (defense-in-depth, unchanged from the `state.md` migration plan):
- `apps/cockpit/proxy.ts` — optimistic cookie-presence redirect at proxy tier (this slice).
- `apps/cockpit/app/(app)/layout.tsx` — authoritative `auth.api.getSession()` via `lib/session.ts`, catches expired / invalid / forged cookies that have presence but no backend validity.

### F8 — Follow-on cockpit-tooling audits owed (NOT slice 8.3.6)

- **`package.json` `--turbopack` flag** — per F6 row 7, Turbopack is now the default for `next dev` / `next build`. `apps/cockpit/package.json` may still pass `--turbopack`. Harmless (flag is recognized for backward compat) but should be cleaned up. Audit + remove in a follow-on tooling slice.
- **Codemod scan** — `npx @next/codemod@canary upgrade latest` reportedly handles middleware-to-proxy + turbopack config + ESLint CLI migration in one pass. Operator may run it to surface anything missed in F6. NOT blocking 8.3.6.

## Conflicts

### C1 — Stale "edge-level" terminology in `[[cockpit-stack-integration-research]]` F6.5 + `state.md`

`[[cockpit-stack-integration-research]]` F6 row 5 references *"`getSessionCookie` for authorization decisions"* in a Next.js 15 context where middleware ran on Edge Runtime by default. `state.md`'s "Next on resume #1" describes slice 8.3.6 as *"edge-level optimistic cookie check at the edge via `getSessionCookie`"*.

Per F2 above: the cockpit is on Next.js 16; `proxy.ts` runs on Node.js runtime exclusively. The *intent* (optimistic-check-before-RSC-renders) is unchanged; the *runtime classification* has changed. Amendment owed to both: rephrase to *"proxy-tier optimistic cookie check via `getSessionCookie`, Node.js runtime."* Or accept the looser "edge-level" reading as *"at the network-boundary tier before app routing"* and note the runtime detail inline.

**Per *Contradiction protocol* precedence (production code + current docs over stale vault terminology):** the current Next.js 16 docs win. Vault amendments to `[[cockpit-stack-integration-research]]` and `state.md` are owed to next /design pass. NOT blocking 8.3.6 — the implementation shape this entry vaults supersedes the framing.

### C2 — Better Auth docs' "THIS IS NOT SECURE" disclaimer (per Issue #6360) over-attributes the warning to `getSession`

Per Source 6: the disclaimer is correct for `getSessionCookie` (cookie-presence-only) but misapplied to `getSession` (server-side validated). Doc bug.

**Per *Contradiction protocol* (production code wins):** the warning attaches to `getSessionCookie` only. The cockpit's defense-in-depth stack is: optimistic `getSessionCookie` in `proxy.ts` (this slice) + authoritative `auth.api.getSession()` in `app/(app)/layout.tsx` (already landed). Matches what Better Auth maintainers actually intend as the secure pattern; doesn't depend on the doc warning's attribution.

## Conditions

- **Time:** May 2026. Next.js `16.2.6` (docs `lastUpdated: 2026-05-13`). Better Auth `1.6.9` (cockpit-installed). Reproducibility window: this finding holds while Next.js 16.x is current. When 17.x ships, re-run the docs check against the version history table.
- **Stack:** Next.js 16 App Router + Better Auth 1.6+ + RSC + `cacheComponents` + `reactCompiler` opt-in. Findings DO NOT hold for: Pages Router, Next.js ≤15, edge-runtime-only setups (the F2 escape hatch still exists but is not actively maintained per Source 2's "follow up on a minor release" pending).
- **Hosting topology:** Vercel cockpit + container-PaaS backend per `[[cockpit-stack-integration-research]]` F1. The proxy still runs at the platform's network boundary (Vercel deploys proxy functions to its edge tier under Node.js runtime) — implication-equivalent to "edge" in the previous mental model, with different terminology.
- **Auth provider:** Better Auth default cookie name `better-auth.session_token` (or `__Secure-better-auth.session_token` in prod). NO custom `cookiePrefix` / `cookies.*.name` in `packages/auth-config/src/index.ts` — verified 2026-05-14. If a future amendment adds a custom prefix, `getSessionCookie(request, { cookiePrefix: '…' })` must be passed; the auth-config and the proxy MUST stay in lockstep on cookie naming.

**DOES NOT hold for:**

- Pages Router cockpits — Next.js 16 ships separate Pages Router docs at `/docs/pages/api-reference/file-conventions/proxy`. Slice 8.3.6 is App Router only; not investigated.
- Cockpits that still need Edge Runtime semantics (e.g., for geo-routing latency-sensitive workloads) — see F2 escape hatch, but acknowledge no in-this-investigation production cite for the Edge-runtime-in-middleware path post-16. Re-run research before adopting.
- Self-hosted Next.js where the platform doesn't CDN-deploy proxy functions — proxy still runs but as a regular Node.js function in front of the app server. Latency profile changes; functional behavior unchanged.

## Operational implications

### For slice 8.3.6 implementation (immediate, this seat or next)

1. **File path:** create `apps/cockpit/proxy.ts` (NOT `middleware.ts`). Place at the cockpit workspace root, same level as `app/`.

2. **Function:** named export `export function proxy(request: NextRequest)` (not `middleware`). Sync function (no `async` needed — `getSessionCookie` is sync).

3. **Imports:**
   ```ts
   import { getSessionCookie } from 'better-auth/cookies';
   import { NextResponse, type NextRequest } from 'next/server';
   ```

4. **Matcher:**
   ```ts
   export const config = { matcher: ['/projects', '/projects/:path*'] };
   ```
   Two-entry form survives a future refactor that flips path-to-regexp `*` to `+` modifier without silently losing bare-path coverage.

5. **Redirect target:** `/sign-in`, matching the layout's existing `redirect('/sign-in')` behavior. No `?returnTo=` query param — out of scope and not in the layout's pattern either.

6. **Defense-in-depth:** keep `apps/cockpit/app/(app)/layout.tsx`'s `await getSession()` + null-redirect intact. Per F7, the proxy filters no-cookie-at-all traffic at the network boundary; the layout filters cookie-present-but-invalid (expired session, backend session purge, forged token that lacks server-side row).

7. **NO `runtime` config field.** Per F2, setting `runtime` in `proxy.ts` throws.

8. **No `auth.api.getSession()` calls inside the proxy** (per F2 / F5 / Source 3 disclaimer): the proxy is optimistic-only; server-side validation lives in layout / RSC / Server Actions.

### For `state.md` slice 8.3.6 framing

Amend the "edge-level optimistic cookie check" phrasing to *"proxy-tier optimistic cookie check via `getSessionCookie`, Node.js runtime."* Mention F2 escape hatch (`middleware.ts` for Edge) for completeness; mark as out-of-scope for cockpit (we don't need Edge Runtime).

### For `[[cockpit-stack-integration-research]]` (vault amendment owed)

- F6 row 5 *"`getSessionCookie` for authorization decisions"* — phrasing still correct (it's an anti-pattern as the ONLY auth check; correct as optimistic check paired with server-side validation). No content amendment.
- Add new F6 row referencing this entry: *"`middleware.ts` file convention in Next.js 16 — fix: rename to `proxy.ts` per `[[nextjs-16-proxy-research]]`. Codemod available."*
- Source 4 reference's "Edge Runtime by default" mental model in the broader entry is now stale terminology for Next.js 16 — flag for amendment.

### For `[[cockpit/auth-surface-mount]]` (vault amendment owed)

- (V3) `next.config.ts` `rewrites()` — unchanged; rewrites still happen after proxy per Source 1's execution order. Validate: rewrites for `/api/auth/*` and `/v1/*` to backend run AFTER proxy filters. **Proxy matcher must NOT match `/api/auth/*` or `/v1/*`** — and our matcher (`/projects`, `/projects/:path*`) doesn't. ✓
- (CL) baseURL — already had a vault amendment owed from slice 8.3.3. Unaffected by 16 rename.

### For follow-on tooling slices (NOT blocking 8.3.6)

- **`apps/cockpit/package.json`** — audit `dev` / `build` scripts; remove `--turbopack` flag if present (it's now default per F6 row 7).
- **Optional:** run `npx @next/codemod@canary upgrade latest` once on the cockpit workspace to catch any remaining v15→v16 drift Source 2 mentions (`turbopack` config promotion, `unstable_` prefix removal, `experimental_ppr` removal). Cockpit was scaffolded post-16 per slice 8.4.0 — codemod may be a no-op, but safe to run as a verification pass.

### For future Server Action work (parked, NOT blocking)

- Per F5 + Source 1: if a future slice adds Server Actions to the cockpit, the proxy matcher CAN silently bypass them. Mitigation: re-verify auth inside each Server Action server-side. Vault as a constraint when the first Server Action lands.

## Reproducibility note

Reproducible:

1. WebFetch `nextjs.org/docs/app/api-reference/file-conventions/proxy` — verify the version history table mentions `v16.0.0` rename.
2. WebFetch `nextjs.org/docs/app/guides/upgrading/version-16` — verify the `middleware` to `proxy` section + Node.js runtime constraint.
3. WebFetch `better-auth.com/docs/integrations/next` — verify the `getSessionCookie` example exists in both `middleware` and `proxy` form.
4. WebFetch `raw.githubusercontent.com/Achour/nextjs-better-auth/main/proxy.ts` — verify the production cite still imports `better-auth/cookies` + exports `proxy`.
5. `cat apps/cockpit/node_modules/better-auth/dist/cookies/index.d.mts | grep getSessionCookie` — verify signature matches F3.

If steps 1–2 stop pinning version `16.2.x` (i.e. Next.js 17 ships and the docs roll forward), re-run before relying on the entry — the rename direction is unlikely to reverse, but the F2 escape hatch ("keep using `middleware`") + F6 status of secondary breaking changes may evolve.

## Open threads

1. **F2 escape hatch follow-up.** Next.js team named *"We will follow up on a minor release with further `edge` runtime instructions"* — when that minor lands, the Edge-runtime-in-proxy story becomes researchable. Trigger: cockpit ever needs Edge Runtime for the auth gate (geo-routing? sub-50ms TTFB on the gate itself?). At MVP, none of these apply.
2. **F8 codemod sweep.** Run `npx @next/codemod@canary upgrade latest` against the cockpit workspace to confirm zero net drift since slice 8.4.0 scaffold. Output: should report no changes; if it changes anything, that's the next surprise to investigate.
3. **Server Action auth verification pattern.** When the first cockpit Server Action lands, vault the verify-auth-inside-the-action pattern per Source 1's *Server Functions caveat*.
4. **Better Auth maintainer demo for `proxy.ts`.** Issue #5672 reports the better-auth/better-auth `demo/nextjs/` lacks a proxy-tier example using `better-auth/cookies`. Re-check at next Better Auth release; promote the maintainer demo to Tier-1 cite if landed.
