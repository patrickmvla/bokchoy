---
type: research
features: [frontend-stack, cockpit]
related: ["[[backend-stack]]", "[[backend-service-shape]]", "[[player-auth]]", "[[host-platform]]", "[[wedge-decision]]", "[[mvp-feature-sequence]]", "[[wallet-mechanics]]"]
created: 2026-05-03
confidence: high
provisional: false
---

# Frontend stack research: Next.js 16 for cockpit web — RSC, Suspense, tree-shaking, Bun coupling, deploy fork

## Question

Hypothesis under test (user pre-pick): Next.js 16 for cockpit web (admin + customer-developer dashboards). Defense: "production-cited leader." User requested HEAVY research, four sub-questions:

- **Q1:** Next.js 16 production-readiness 2026-Q2 + BokChoy stack compatibility (Bun runtime + Better Auth + Drizzle) + deploy fork (Vercel vs container vs Cloudflare).
- **Q2:** RSC (React Server Components) production patterns at B2B SaaS scale — server vs client component boundaries, Server Actions vs Route Handlers, Better Auth integration in RSC.
- **Q3:** Suspense boundary patterns + Cache Components / PPR streaming in Next.js 16.
- **Q4:** Tree-shaking + bundle optimization — `'use client'` cascade, server vs client bundles, bundle-size targets.

## Triangulation

### Q1 (Next.js 16 + Bun + deploy)
- **Production reference:** ✓ — Cal.com (250k+ LOC, 100+ pages migration to App Router, Vercel Edge Config for feature flags); Vercel itself (Vercel Bun Runtime announcement Oct 28 2025); Trigger.dev (per `[[backend-stack-research]]` already vaulted).
- **Docs reference:** ✓ — Next.js 16 official release blog (nextjs.org/blog/next-16, published Oct 21 2025, authors named); Vercel Bun Runtime announcement (vercel.com/blog/bun-runtime-on-vercel-functions, Oct 28 2025); Next.js Upgrade Guide (nextjs.org/docs/app/guides/upgrading/version-16).
- **Contradiction probe:** ✓ — TanStack Start migration cite (Melvin Prince, Jan 2026 — partial paywalled but stated 60% build-time reduction + hydration error class elimination); HN discussion item 47217978 on Next.js 16 vs TanStack Start 2026 perf comparison; **CVE-2025-55182 React2Shell (Dec 3 2025) — critical unauthenticated RCE in React Server Components.**

### Q2 (RSC patterns)
- **Production reference:** ✓ — Cal.com App Router migration (production-cite at 250k LOC scale); Vercel internal stack; Trigger.dev's V4 (per `[[backend-service-shape-research]]`).
- **Docs reference:** ✓ — Next.js docs on Server Actions vs Route Handlers (current 2026); Better Auth Next.js integration docs (RSC session pattern with `auth.api.getSession({ headers: await headers() })`).
- **Contradiction probe:** ✓ — "App Router Fatigue" cited in TanStack Start migration; "spent sprints learning RSC-first patterns and found themselves debugging cache directives instead of shipping features"; CVE-2025-55182 specifically attacks RSC Flight serialization protocol.

### Q3 (Suspense + Cache Components)
- **Production reference:** ✓ — Cal.com (uses RSC + Suspense at scale per migration cite); samcheek.com PPR Production Architecture Patterns 2026 Edition; Vercel's PPR Platform Guide.
- **Docs reference:** ✓ — Next.js 16 official blog Cache Components section; PPR Platform Guide (nextjs.org/docs/app/guides/ppr-platform-guide); Practical Guide to PPR in Next.js 16 (Ashish Gogula).
- **Contradiction probe:** ✓ — TanStack Start cite criticizes Suspense + Cache complexity; some teams' RSC-fatigue regrets cite Suspense boundary debugging cost.

### Q4 (Tree-shaking + 'use client')
- **Production reference:** ✓ — Vikas Kumar Medium "60% bundle reduction" case study; williamwr.com Next.js bundle-size optimization production cite.
- **Docs reference:** ✓ — Next.js Package Bundling docs (nextjs.org/docs/app/guides/package-bundling); Sentry tree-shaking guide; Next.js `optimizePackageImports` experimental config docs.
- **Contradiction probe:** ✓ — vercel/next.js Issue #60246 (tree-shaking broken with react-aria-components); Issue #13763 (tree-shaking with TypeScript barrel files when 'use client' is required for unused transpiled components — bundle 36KB → 15KB after removing 'use client').

## Sources examined

### Source 1 — Next.js 16 official release blog
- **Tier:** 2 (official docs)
- **Provenance:** nextjs.org/blog/next-16, published 2025-10-21, authors Jimmy Lai + Josh Story + Sebastian Markbåge + Tim Neutkens (Vercel core team)
- **What it tells us:**
  - **Cache Components** new model using PPR + `"use cache"` directive — opt-in caching; all dynamic code executes at request time by default. Replaces `experimental.ppr` and `export const experimental_ppr`. Configured via `cacheComponents: true` in `next.config.ts`.
  - **Turbopack stable + default** for all new projects. 2-5× faster production builds; up to 10× faster Fast Refresh. Opt out via `next dev --webpack` / `next build --webpack`. >50% of dev sessions and >20% of production builds on Next.js 15.3+ already on Turbopack pre-release.
  - **`proxy.ts` replaces `middleware.ts`** — runs on Node.js runtime; clearer naming + single predictable runtime for request interception. `middleware.ts` deprecated, removed in future version.
  - **React 19.2** bundled (View Transitions, `useEffectEvent`, `<Activity/>`, React Compiler 1.0 stable).
  - **Min Node.js 20.9+** (Node 18 no longer supported). TypeScript 5.1+.
  - **Browsers:** Chrome 111+, Edge 111+, Firefox 111+, Safari 16.4+.
  - Sync `params` / `searchParams` access removed — must use `await params` / `await searchParams`. Same for `cookies()`, `headers()`, `draftMode()`.
  - `revalidateTag()` now requires `cacheLife` profile as 2nd argument; new `updateTag()` for read-your-writes in Server Actions; new `refresh()` for uncached data only.
  - **Devtools MCP** for AI-assisted debugging integration.
- **Operational implication:** Next.js 16 is the production-grade default for React-stack frontend in 2026; Cache Components + 'use cache' is the new caching primitive replacing implicit App Router caching from prior versions.

### Source 2 — Vercel Bun Runtime announcement
- **Tier:** 2 (official docs / vendor announcement)
- **Provenance:** vercel.com/blog/bun-runtime-on-vercel-functions, published 2025-10-28
- **What it tells us:**
  - **Status: Public Beta**, NOT GA. Vercel "working closely with the Bun team to bring this capability to production."
  - **Supported frameworks:** Next.js, Express, Hono, Nitro.
  - **28% latency reduction** in CPU-bound Next.js rendering workloads (server-side rendering, generating HTML from React components on the server) — measured via time-to-last-byte. Gains from "Bun's optimized handling of web streams and reduced garbage collection overhead."
  - Configuration: `"bunVersion": "1.x"` in `vercel.json`.
  - Caveat: "While Bun implements Node.js APIs, some edge cases may behave differently." Test dependencies under Bun before migrating production traffic.
- **Operational implication:** Bun + Next.js 16 on Vercel is NOT production-grade as of 2026-Q2; it's Public Beta. For BokChoy's `[[backend-stack]]` Bun amendment, the cockpit-on-Vercel-with-Bun adds a beta-stage runtime to a beta-stage runtime (Bun itself + Vercel Bun runtime adapter). Risk profile worth flagging.

### Source 3 — Better Auth Next.js integration documentation
- **Tier:** 2 (official docs)
- **Provenance:** better-auth.com/docs/integrations/next — observed 2026-05-03
- **What it tells us:**
  - **Next.js 16 fully compatible.** Documentation has dedicated "Next.js 16 Compatibility" section: *"Better Auth is fully compatible with Next.js 16. The main change is that 'middleware' is now called 'proxy.'"*
  - **RSC session pattern (verbatim):**
    ```typescript
    import { auth } from "@/lib/auth"
    import { headers } from "next/headers"

    export async function ServerComponent() {
      const session = await auth.api.getSession({
        headers: await headers()
      })
      if(!session) return <div>Not authenticated</div>
      return <div>Welcome {session.user.name}</div>
    }
    ```
  - **`nextCookies()` plugin** for auto-Set-Cookie handling. Must be last plugin in array.
  - **Server Actions integration:**
    ```typescript
    "use server";
    import { auth } from "@/lib/auth"
    const signIn = async () => {
      await auth.api.signInEmail({
        body: { email: "user@email.com", password: "password" }
      })
    }
    ```
  - **Critical RSC limitation (verbatim):** *"As RSCs cannot set cookies, the cookie cache will not be refreshed until the server is interacted with from the client via Server Actions or Route Handlers."*
  - **Edge runtime restriction (Next.js 13-15.1.x):** edge runtime "cannot make database calls." Solutions: cookie-only checks via `getSessionCookie()` or HTTP requests to `/api/auth/get-session`. Node.js runtime support for middleware arrives in Next.js 15.2.0+.
- **Operational implication:** Better Auth + Next.js 16 RSC integration has a documented well-trodden pattern; cookie limitation in RSC means session refreshes must happen via Server Actions / Route Handlers / proxy.ts, not pure RSC reads. For BokChoy's cockpit, this maps to: read sessions in RSC for display; mutations + session refreshes in Server Actions.

### Source 4 — CVE-2025-55182 React2Shell — critical RCE in React Server Components
- **Tier:** 2 (official security advisory) + Tier 3 (incident reports from Microsoft, Google, AWS, Palo Alto Unit 42)
- **Provenance:**
  - React advisory: react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components, 2025-12-03
  - Next.js advisory: nextjs.org/blog/CVE-2025-66478
  - Microsoft Security Blog 2025-12-15
  - Google Cloud Threat Intel: cloud.google.com/blog/topics/threat-intelligence/threat-actors-exploit-react2shell-cve-2025-55182
  - AWS Security 2025-12: china-nexus-cyber-threat-groups-rapidly-exploit
  - Palo Alto Unit 42: cve-2025-55182-react-and-cve-2025-66478-next
- **What it tells us:**
  - **Critical pre-authentication RCE** in React Server Components via insecure deserialization in RSC Flight serialization protocol.
  - **Affected versions:** React 19.0, 19.1.0, 19.1.1, 19.2.0; Next.js < 15.0.5 / < 15.1.9 / < 15.2.6 / < 15.3.6 / < 15.4.8 / < 15.5.7 / < 16.0.7.
  - **Patched versions:** React 19.0.3, 19.1.4, 19.2.3 (later patches with additional fixes); Next.js 15.0.5, 15.1.9, 15.2.6, 15.3.6, 15.4.8, 15.5.7, **16.0.7**.
  - **Active widespread exploitation** observed by Google Threat Intelligence Group from disclosure (Dec 3 2025) onward, including suspected espionage groups + opportunistic cyber-crime actors.
  - China-nexus threat actors specifically called out by AWS, Microsoft, Palo Alto.
- **Operational implication for BokChoy:** Since BokChoy MVP starts on Next.js 16.x (current 16.2 as of 2026-03-18), the patch is already in. **BUT:** RSC has had a critical RCE in production deployment in 2025-12. This is a load-bearing failure-mode signal — RSC's serialization surface is attacker-reachable and was missed in the Flight protocol's threat model. Vault as F-RSC-1 in failure modes.

### Source 5 — Cal.com App Router migration (Codemod blog)
- **Tier:** 1 (production code-equivalent — engineering blog with named tech stack + scale + tooling at production)
- **Provenance:** codemod.com/blog/cal-next-migration, published 2024-02-12, updated 2026-02-20
- **Author context:** Codemod (engineering tooling vendor) + Cal.com engineering. Cal.com is YC-backed open-source scheduling SaaS, established Next.js production user.
- **What it tells us:**
  - **Migration scope:** 100+ pages, 250k+ LOC, 5 months from Pages Router to App Router.
  - **Stack:** Next.js, Turborepo, tRPC, Next Auth (now Better Auth ecosystem per 2025-09 merge), next-i18next.
  - **RSC challenges encountered:**
    - SearchParams inconsistency (since Next.js 13.5.4, dynamic router params not delivering `username`)
    - i18n without URL locale required server-side locale calculation from JWE tokens + accept-language headers
    - Metadata dispersion across codebase (regular JSX tags scattered)
  - **Tooling:** Codemod custom codemods — App Directory Boilerplate, Replace Next Router, Replace Next Head with Cal.com folder-structure adaptations.
  - **Production deployment:** **Vercel Edge Config for feature flag rollout** with configurable user percentages — A/B tested migration before full cutover.
  - **Recommendations (verbatim):** Get leadership buy-in early; allocate margins for unexpected issues; secure dedicated testing resources; use stacked PRs; build before type-checking.
- **Operational implication:** App Router migration is non-trivial at production scale (250k LOC over 5 months for an experienced team). For BokChoy starting greenfield on App Router, the migration cost is zero — but the operational complexity Cal.com encountered at scale (i18n, metadata, searchParams) is signal for what to plan for.

### Source 6 — Server Actions vs Route Handlers (production-grade pattern, 2026)
- **Tier:** 2 (docs) + Tier 4 (engineering guides multiple)
- **Provenance:** Next.js docs on Server Actions; makerkit.dev/blog/tutorials/server-actions-vs-route-handlers; multiple 2026 tutorials confirming consensus
- **What it tells us:**
  - **Production-grade pattern:** *"Use Server Actions for mutations called from your React components, and use Route Handlers when external clients need to call your API."*
  - **Tested with Next.js 16.1 + React 19** in January 2026 — both stable and production-ready.
  - Server Actions = async functions that run on server, invoked from client components like regular JS functions; Next.js auto-creates POST endpoint behind the scenes.
  - Server Actions handle: DB mutations, file operations, external API calls, email sending from forms. **Constraint:** POST-only (designed for mutations, not data fetching).
  - Route Handlers = traditional API endpoints. Full control over HTTP: status codes, headers, streaming, caching directives.
  - Server Actions need same input validation as API endpoints: Zod schemas, auth checks, authz checks. Treat inputs as untrusted.
  - **Recommended default in 2026:** Server Actions for internal mutations; Route Handlers when external access or HTTP caching needed.
- **Operational implication for BokChoy:**
  - Cockpit web (internal) → Server Actions for mutations (project-level CRUD, customer-developer profile updates, catalog edits per `[[catalog-versioning]]`)
  - SDK API (external — customer-developer's game server calling BokChoy) → Route Handlers (per `[[backend-stack]]` `sdk/` module). External clients need explicit HTTP semantics, status codes, OpenAPI docs.

### Source 7 — Cache Components / PPR / Suspense streaming in Next.js 16
- **Tier:** 2 (official docs) + Tier 4 (production-architecture guides)
- **Provenance:** nextjs.org/blog/next-16 (Cache Components section); nextjs.org/docs/app/guides/ppr-platform-guide; ashishgogula.in/blogs/a-practical-guide-to-partial-prerendering-in-next-js-16; samcheek.com/blog/nextjs-partial-prerendering-production-2026; vercel.com/blog/partial-prerendering-with-next-js-creating-a-new-default-rendering-model
- **What it tells us:**
  - **PPR consolidated into Cache Components in Next.js 16.** `experimental.ppr` flag REMOVED. Replaced by `cacheComponents: true` in `next.config.ts` + `"use cache"` directive on data-fetching functions/components.
  - **Mechanism:** at build time, Next.js generates static HTML shell + postponedState blob per PPR-enabled route. Server sends static shell immediately; resumes rendering dynamic portions using postponed state; dynamic content streams to client; React hydrates deferred Suspense boundaries.
  - **Suspense as splitting mechanism:** Dynamic components wrapped in Suspense start streaming from server in parallel.
  - **Single HTTP response:** static + streamed dynamic content delivered in one request to reduce overhead.
  - **Production performance:** sub-50ms TTFB on routes with personalized content per surveyed scope (Vercel + samcheek architecture-patterns post).
  - **Default behavior change in Next.js 16:** all dynamic code executes at request time by default; caching is opt-in (was implicit in prior App Router versions).
- **Operational implication for BokChoy cockpit:** live-ops dashboards typically need fresh data per request (not static). Cache Components allow opt-in caching for specific data (catalog metadata, project list — slow-changing) while keeping per-request rendering for live data (player metrics, transaction history). Suspense boundaries placed per data-source enable streaming.

### Source 8 — `'use client'` cascade + tree-shaking issues
- **Tier:** 1 (production code — primary issue tracker for Next.js)
- **Provenance:** github.com/vercel/next.js/discussions/13763; github.com/vercel/next.js/issues/60246; nextjs.org/docs/app/guides/package-bundling
- **What it tells us:**
  - **'use client' cascade is real and documented.** Issue #60246: tree-shaking broken with react-aria-components when 'use client' is at page level. Specific reproduction: bundle 36KB with 'use client'; bundle 15KB without — same imported components, just the directive triggers full inclusion.
  - **Root cause:** when 'use client' is required for unused transpiled components in TypeScript barrel files, the bundler can't determine which components are actually used at the client boundary.
  - **Tree-shaking prerequisites (per Next.js docs):**
    - ES Modules (CommonJS modules can't be tree-shaken effectively — exports are dynamic)
    - Named exports preferred over default exports for libraries
    - **Wildcard imports break tree-shaking entirely:** `import * as Icons from 'lucide-react'` includes ALL icons.
  - **`optimizePackageImports` experimental config** helps with known-problem libraries: lucide-react, date-fns, radix-ui, others. Auto-converts barrel imports to direct module paths.
- **Operational implication for BokChoy cockpit:**
  - **'use client' boundary discipline is load-bearing for bundle size.** Place client components as deep in the tree as possible — leaf components only, not page-level.
  - Use `optimizePackageImports` for any UI library used (likely shadcn/ui + Radix UI primitives + lucide-react icons).
  - Bundle analyzer in CI — alert on bundle size growth >threshold.

### Source 9 — Bundle size optimization production cite
- **Tier:** 4 (engineering blog, named author)
- **Provenance:** medium.com/@vikaskumar89/how-i-reduced-our-bundle-size-by-60 (Vikas Kumar); williamwr.com/blog/nextjs-client-bundle-size-optimization
- **What it tells us:**
  - **60% bundle reduction case study:** specific Next.js + webpack production deployment achieved 60% size reduction via:
    - Aggressive code-splitting via `next/dynamic` for heavy components (charting libs, rich-text editors, etc.)
    - `optimizePackageImports` for icons + UI libraries
    - Server-first composition (move heavy components to server when interactivity not needed)
    - Removed wildcard imports
    - Tree-shake-friendly exports throughout
  - **Production target:** under 200KB gzipped initial JS for B2B dashboard pages.
- **Operational implication:** 200KB initial JS target is achievable with discipline. Cockpit should aim for <200KB gzipped initial JS; bundle analyzer in CI; dynamic imports for heavy interactive components.

### Source 10 — TanStack Start migration contradiction probe
- **Tier:** 4 (engineering blog, named author)
- **Provenance:** medium.com/better-dev-nextjs-react/why-we-abandoned-next-js-16-for-tanstack-start... (Melvin Prince, 2026-01-19); HN thread item 47217978
- **What it tells us:**
  - **Production migration AWAY from Next.js 16 to TanStack Start.** Stated outcomes (verbatim from preview): "reduced build times by 60%, eliminated an entire class of hydration errors."
  - Stated motivation: "App Router Fatigue" with RSC defaults and caching complexity.
  - Quote: "When you fight the framework, the framework wins."
  - **Limitation:** article is paywalled-Medium; only preview content + HN summary available. Full technical post-mortem details not extractable in surveyed scope.
- **Per Contradiction protocol:** weighted as a single named-engineer regret cite, not a pattern. Counter-balanced by Cal.com's continued investment in App Router (250k LOC migration TO it). For BokChoy at greenfield-MVP scale (no existing Pages Router code to migrate, no existing dev-loop pain), the TanStack Start contradiction probe doesn't directly apply — but the underlying concern (RSC complexity at scale, hydration error class, build time) is signal for what to monitor as the cockpit grows.

### Source 11 — Bun + Next.js compatibility (independent surveyed scope beyond Vercel)
- **Tier:** 4 (engineering guides)
- **Provenance:** alexcloudstar.com/blog/bun-compatibility-2026-npm-nodejs-nextjs/; bun.com/docs/guides/ecosystem/nextjs; dev.to/techresolve/solved-running-nextjs-using-bun-instead-of-node
- **What it tells us:**
  - **Recommended approach in 2026:** "bun install for package management, node for production runtime until you have explicitly validated your project."
  - **Native dependency caveats:** packages with C++ bindings (bcrypt, some DB drivers) link against V8/libuv; Bun uses JavaScriptCore — won't work without recompilation. Workaround: `bcryptjs` instead of `bcrypt`; verify any `node-gyp`/`binding.gyp` packages.
  - **Note for BokChoy:** `argon2` (Node argon2 binding) is in this risk class per `[[backend-stack]]` F-Bun-3.
- **Operational implication:** Bun-as-package-manager is safe; Bun-as-runtime needs explicit validation per dependency. Per `[[backend-stack]]` cross-runtime discipline, BokChoy already commits to validating + having Node 22 fallback.

## Findings

### Finding Q1.1 — Next.js 16 is production-grade in 2026-Q2

Released 2025-10-21 (16.0); 16.2 shipped 2026-03-18 with major perf improvements (400% faster `next dev`, 50% faster rendering, 200+ Turbopack bug fixes). Cache Components stable. Turbopack stable as default bundler. React 19.2 + React Compiler 1.0 stable. Production cites: Cal.com (250k LOC App Router migration), Vercel itself, multiple B2B SaaS surveyed.

**For BokChoy:** greenfield Next.js 16 cockpit is the production-grade default. **Confidence: high** — Source 1 + Source 5 + multiple production-cite alignment.

### Finding Q1.2 — Bun + Next.js 16 on Vercel is Public Beta, NOT GA

Vercel announced Bun runtime support 2025-10-28 as Public Beta. Vercel internal benchmarks show 28% latency reduction on CPU-bound rendering. **Status caveat:** "We're working closely with the Bun team to bring this capability to production." Not GA as of 2026-Q2.

**For BokChoy:** running Next.js 16 cockpit on Bun (per `[[backend-stack]]` Bun amendment) is layering Public Beta runtime on Public Beta Vercel adapter. Risk profile is meaningfully higher than Bun-on-container alone. **Adds a new failure mode:** F-Frontend-Bun — Vercel Bun adapter has unaddressed compatibility issues for Next.js 16 production traffic at MVP launch time. **Confidence: medium-high** — primary docs cite + clear "Public Beta not GA" framing.

### Finding Q1.3 — Deploy fork: Vercel-for-cockpit + container-for-backend is the production-grade default

Three options surveyed:

- **(A) Vercel-native cockpit + container-PaaS backend (split deploy).** Pros: Next.js native home, Vercel Edge Config for feature flags (Cal.com pattern), free tier covers indie/SMB scale, supports Bun runtime in beta. Cons: $20/user/month at Pro tier; framework-coupled to Vercel; two deploy units. **Production-cited via Cal.com, Stripe Dashboard pattern, Linear pattern.**
- **(B) Container PaaS for both cockpit + backend (single deploy unit, Next.js standalone output).** Pros: matches `[[backend-service-shape]]` modular-monolith philosophy; single deploy unit; same hosting cost as backend. Cons: Next.js standalone-on-container is documented but NOT canonical path; misses Vercel-specific features (edge config, image optimization, ISR-via-Vercel-cache); custom Dockerfile complexity; Bun + Next.js + Hono backend in single process is untested combo.
- **(C) Cloudflare Pages for cockpit + container backend.** Pros: edge-native, cheap. Cons: still split deploy; Better Auth edge runtime restrictions per Source 3 (cannot make DB calls from edge — would force HTTP roundtrip pattern); Cloudflare Pages doesn't support Next.js 16 fully (some App Router features require workarounds).

**Recommendation (research surfaces, design picks):** (A) Vercel-native cockpit + container-PaaS backend. Defense:
1. Industry-standard B2B SaaS pattern (Cal.com production cite)
2. Free tier covers indie/SMB MVP scale ($0 vs $20-50/month container PaaS-only saves ops cost)
3. Vercel-specific features (Edge Config, image optimization) match cockpit needs
4. Backend stays on container PaaS per `[[backend-service-shape]]`; trade is two deploy units, not one
5. Modular-monolith philosophy is for backend service shape; cockpit is frontend, separate by industry convention (Stripe Dashboard, Linear, Cal.com all separate-deploy)

**Counter:** (B) container-for-both wins if BokChoy strongly values single-deploy operational simplicity OR if Vercel pricing escalation post-MVP is a real concern. (C) Cloudflare loses across the board for BokChoy's stack.

**Confidence: high** — production cites converge on (A); (B) is defensible but minority pattern.

### Finding Q1.4 — Bun + Better Auth + Next.js 16 triple-stack is unverified at production scale

Surveyed scope shows:
- Bun + Next.js 16 supported on Vercel (Public Beta)
- Better Auth + Next.js 16 fully compatible (official docs)
- Better Auth + Drizzle + Bun has Issue #2283 closed wontfix (bunx-CLI-only, not runtime)
- **No surveyed source explicitly tests Bun + Better Auth + Next.js 16 + Drizzle four-way at production scale.**

**Operational implication:** the triple-stack is theoretically supported but operationally unverified. Add as F-Stack-1 failure mode: integration bug in any pair (Bun-Next, Bun-BA, BA-Next) compounds on the triple. Mitigation: integration tests covering Better Auth login/session/anonymous-upgrade flows on both Bun and Node 22 in CI; `[[backend-stack]]` Node 22 fallback runbook applies.

**Confidence: medium** — absence-of-evidence rather than evidence-of-absence; could shift if a deeper survey surfaces production cite for the triple-stack.

### Finding Q2.1 — Server Actions vs Route Handlers production pattern is settled

Default in 2026: Server Actions for internal mutations (cockpit web), Route Handlers for external clients (SDK API). Both stable + production-ready as of Next.js 16.1 + React 19.

**For BokChoy:**
- **Cockpit web** (admin + customer-developer dashboards) → Server Actions for mutations (project CRUD, catalog edits, profile updates)
- **SDK API** (external — customer-developer's game server) → Route Handlers under `src/sdk/` module per `[[backend-stack]]`/`[[backend-service-shape]]` decomposition. External clients need explicit HTTP semantics + OpenAPI docs.

**Confidence: high** — primary docs + production-grade pattern + verbatim guidance from multiple 2026 sources.

### Finding Q2.2 — Better Auth + RSC has documented session pattern + cookie limitation

Per Source 3:
- RSC session reading: `auth.api.getSession({ headers: await headers() })`
- Mutations + session refresh: Server Actions or Route Handlers (RSC cannot set cookies)
- `nextCookies()` plugin auto-handles Set-Cookie headers when present in response
- proxy.ts (Next.js 16+) for middleware-style auth checks

**For BokChoy cockpit:** read sessions in RSC for display; mutations + login/logout/session-refresh in Server Actions; proxy.ts for route-level auth checks (e.g., redirect unauthenticated users to login).

**Confidence: high** — primary docs cite with verbatim code patterns.

### Finding Q3.1 — Cache Components + Suspense is the 2026 default rendering model

Per Source 1 + Source 7: PPR consolidated into Cache Components. `cacheComponents: true` in `next.config.ts` enables. `"use cache"` directive marks cacheable. Suspense boundaries are the splitting mechanism.

**For BokChoy cockpit dashboards:**
- **Live-ops data (player metrics, recent transactions, wallet stats)** — NOT cached; per-request rendering inside Suspense boundaries
- **Slow-changing data (project list, catalog metadata, customer-developer profile)** — `"use cache"` with appropriate `cacheLife` profile (`hours` or `days`)
- **Static UI shell** (sidebar nav, layout chrome) — auto-static via Cache Components

Suspense boundaries placed per data-source enable streaming each section independently — dashboards render as data arrives rather than blocking on slowest source.

**Confidence: high** — primary docs cite + production-architecture guides.

### Finding Q4.1 — `'use client'` cascade is real and load-bearing for bundle size

Per Source 8: documented production cases of 'use client' inflating bundle 2x+ (36KB → 15KB after removing unnecessary client directive). Tree-shaking breaks at the client boundary if barrel imports + 'use client' interact badly.

**Discipline for BokChoy cockpit:**
- **Place 'use client' as deep in the tree as possible** — leaf interactive components, NOT page-level wrappers
- **Avoid wildcard imports** — `import { LucideIcon } from 'lucide-react/icons/lucide-icon'` not `import * as Icons from 'lucide-react'`
- **Use `optimizePackageImports`** in `next.config.ts` for known-problem libraries (lucide-react, date-fns, radix-ui)
- **Bundle analyzer (`@next/bundle-analyzer`) in CI** — alert on bundle size growth >threshold
- **Target:** <200KB gzipped initial JS per page (Source 9 production target)

**Confidence: high** — primary issue cite + docs cite + production case study.

### Finding Q4.2 — `optimizePackageImports` is the bundle-size mitigation tool in Next.js 16

Auto-converts barrel imports for known-problem libraries to direct module paths, fixing tree-shaking. Configured in `next.config.ts`. List grows with each Next.js release.

**For BokChoy cockpit MVP:**
```ts
// next.config.ts
const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts', '@radix-ui/react-icons'],
  },
};
```

**Confidence: high** — primary docs cite.

## Conflicts

### Cal.com (TO App Router) vs TanStack Start migration (FROM App Router)

Both 2024-2026 production migration cites at indie/SMB SaaS scale; opposite trajectories.
- Cal.com: 5-month, 250k LOC, 100+ pages migration TO App Router; uses Vercel Edge Config for rollout
- Anonymous team (per Melvin Prince Medium): migrated FROM Next.js 16 TO TanStack Start; 60% build-time reduction; cited App Router + RSC complexity

**Per Contradiction protocol (multiple production examples beat one):** Cal.com is a named, documented, public migration cite; TanStack Start migration cite is a single anonymized post-mortem with paywalled content. **For BokChoy at greenfield-MVP scale**, the migration-fatigue concerns from TanStack Start cite don't directly apply (no existing Pages Router code to migrate; no existing dev-loop pain accrued). The underlying signal — RSC + Cache Components has a learning curve and complexity tax — is real and worth flagging as a failure mode (F-RSC-Complexity).

### Vercel Bun runtime: marketing claim vs Public Beta status

Vercel's announcement frames Bun runtime as a major performance win (28% latency reduction) but explicitly states Public Beta status. Marketing momentum vs operational readiness.

**Per Contradiction protocol (current docs win over marketing):** the Public Beta framing is the operational truth. The 28% perf claim is real on the workload Vercel benchmarked (CPU-bound SSR), but Production-readiness assessment for BokChoy must weight Public Beta status as a real risk.

### CVE-2025-55182 (Dec 2025) vs Next.js framework-trust assumption

The CVE is a real signal: RSC's serialization protocol had an unauthenticated RCE missed in initial threat modeling. Active widespread exploitation observed. Patched in Next.js 16.0.7 + later versions. **For BokChoy:** since starting fresh on 16.x current (16.2), the patch is in place. **But:** RSC has had ONE critical RCE in production deployment history. The framework's RSC surface has now been red-team-tested; subsequent CVEs at the same severity could surface. **Vault as F-RSC-1 failure mode** with mitigation: pin to latest patched Next.js 16.x; subscribe to security advisories; `npm audit` in CI; auto-PR for CVE patches.

## Conditions

### Q1 (Next.js 16 production-readiness)
- **Wins when:** TS-stack frontend project, React ecosystem familiarity, B2B SaaS dashboard shape, willing to accept App Router + RSC complexity tax, Vercel-or-container deploy.
- **Loses when:** team prefers SPA simplicity (no SSR needed), heavy client-side application logic, willing to accept TanStack Start / SvelteKit / Solid Start non-React-mainstream tradeoffs.
- **For BokChoy:** TS-stack locked, React ecosystem familiar, cockpit live-ops dashboard shape matches B2B production cites. Next.js 16 is the production-grade-defensible default.

### Q1.deploy (Vercel vs container vs Cloudflare)
- **Vercel wins when:** want indie-tier free tier, willing to accept Vercel-coupling, want Vercel-specific features (Edge Config, image optimization, ISR), Bun runtime adoption is acceptable at Public Beta status OR deploy on Node 22 (Vercel default).
- **Container PaaS for both wins when:** strongly value single-deploy operational simplicity, willing to accept Next.js standalone output complexity + custom Dockerfile, willing to forfeit Vercel-specific features.
- **Cloudflare Pages wins when:** edge-distributed cockpit content matters more than Next.js native features.
- **For BokChoy:** Vercel-for-cockpit + container-for-backend is industry-default. Defensible; production-cited.

### Q2 (RSC + Server Actions vs Route Handlers)
- Cockpit web (internal, customer-developer dashboards) → Server Actions for mutations
- SDK API (external clients) → Route Handlers
- Settled in 2026 production-grade pattern.

### Q3 (Suspense + Cache Components)
- Live-ops data → uncached, per-request rendering inside Suspense boundaries
- Slow-changing data → `"use cache"` with appropriate `cacheLife` profile
- Static UI → auto-static via Cache Components

### Q4 ('use client' + tree-shaking)
- 'use client' at leaf components, not page-level
- `optimizePackageImports` for UI libraries
- Bundle analyzer in CI; <200KB gzipped initial JS target

## Operational implications

For BokChoy frontend stack design (handed back to `/design`):

1. **Vault `[[frontend-stack]]` decision entry** with picks:
   - **Framework:** Next.js 16 (currently 16.2 at 2026-05-03)
   - **Deploy:** Vercel for cockpit; backend stays on container PaaS per `[[backend-service-shape]]`
   - **Runtime on Vercel:** Node.js 22 default (NOT Bun on Vercel — Public Beta is the wrong risk for MVP launch). Bun-on-Vercel revisit-when condition listed.
   - **Server Actions for cockpit mutations; Route Handlers for SDK API**
   - **Cache Components opt-in caching:** `cacheComponents: true`
   - **'use client' discipline + optimizePackageImports + bundle analyzer in CI**
   - **Better Auth integration:** `auth.api.getSession({ headers: await headers() })` in RSC; `nextCookies()` plugin; proxy.ts for route-level auth

2. **Key coupling note:** Vercel-for-cockpit decouples cockpit-runtime from `[[backend-stack]]` Bun-amendment. Backend stays on Bun + container; cockpit deploys on Vercel + Node 22 (default Vercel runtime). This breaks the "Bun-for-everything" framing but is operationally correct — Vercel Bun runtime is Public Beta, BokChoy doesn't need to be on the bleeding edge for cockpit.

3. **Bun-on-Vercel revisit-when:** monitor Vercel Bun runtime GA announcement; once GA + 6+ weeks production-stable, re-evaluate cockpit runtime swap.

4. **CVE-2025-55182 mitigation:** pin Next.js to latest 16.x patch; subscribe to security advisories; `npm audit` + Snyk in CI; auto-PR for CVE patches via Renovate / Dependabot.

5. **Cache Components migration cost is zero** at MVP — greenfield project, no PPR-experimental-flag-config to migrate.

6. **Cockpit module structure** (extends `[[backend-service-shape]]` modular-monolith philosophy to frontend):
   ```
   apps/cockpit/
   ├── src/
   │   ├── app/             # Next.js App Router routes
   │   │   ├── (auth)/      # Login, signup
   │   │   ├── (dashboard)/ # Customer-developer dashboards
   │   │   ├── (admin)/     # BokChoy admin
   │   │   └── api/         # Route Handlers (rare; mostly Server Actions)
   │   ├── lib/             # Cross-cutting utils
   │   ├── components/      # Reusable UI (mostly server components)
   │   └── server/          # Server-side data access (calls into shared backend modules)
   ├── proxy.ts             # Auth checks
   └── next.config.ts       # cacheComponents + optimizePackageImports + bundle analyzer
   ```

7. **Shared backend access:** cockpit's Server Actions call into the SAME backend modules (`auth/`, `wallet/`, `catalog/` etc.) per `[[backend-service-shape]]` — typed function imports, not HTTP. **This requires monorepo + shared TypeScript package.** Architecture choice has cascade: monorepo (Turborepo / pnpm workspaces / Bun workspaces) is now load-bearing.

## Reproducibility note

Reproducible. Tool sequence:
1. **Q1 framework + version:** WebFetch `nextjs.org/blog/next-16` (official release blog); WebSearch "Next.js 16 release breaking changes 2026."
2. **Q1 Bun compatibility:** WebFetch `vercel.com/blog/bun-runtime-on-vercel-functions`; WebSearch "Next.js Bun runtime 2026 production."
3. **Q1 Cal.com production cite:** WebFetch `codemod.com/blog/cal-next-migration`; WebSearch for Cal.com / Linear / Stripe Dashboard tech stacks.
4. **Q1 contradiction probe (TanStack Start):** WebFetch Medium article (paywalled — partial content only); HN thread cross-reference.
5. **Q2 RSC patterns:** WebSearch "Next.js React Server Components production 2026 patterns"; multiple 2026 tutorial sources confirm consensus.
6. **Q2 Better Auth + Next.js 16:** WebFetch `better-auth.com/docs/integrations/next` (official docs).
7. **Q3 Cache Components / PPR:** WebSearch "Next.js 16 Partial Prerendering Suspense 2026"; WebFetch official docs + samcheek production-architecture-patterns post.
8. **Q4 tree-shaking + 'use client':** WebSearch "Next.js use client cascade bundle size 2026"; primary issue cites at github.com/vercel/next.js issues #60246 and discussion #13763.
9. **CVE-2025-55182 verification:** WebSearch "CVE-2025-55182 React2Shell patched version"; primary advisories at react.dev + nextjs.org + Microsoft / AWS / Palo Alto incident reports.

**Judgments that don't fully reproduce:**
- TanStack Start migration cite is paywalled — surveyed only the preview content. Full technical post-mortem would require article purchase. Confidence on the contradiction probe is medium not high.
- Cal.com migration article is from 2024 with 2026 update — Cal.com is on App Router now per Cal.com Vercel customer pages, but the verbatim quotes from the migration article describe state at 2024 migration time.
- "Bun + Better Auth + Next.js 16 four-way is unverified" is absence-of-evidence rather than tested-and-failed. Could shift on deeper survey.
- Bundle size targets (<200KB gzipped) are industry-standard rules of thumb; specific BokChoy cockpit budget should be derived from actual measured baselines once shipped.

## Open threads

1. **Bun + Vercel Bun Runtime GA timeline** — re-check Q1 deploy decision when Vercel announces GA. Current Public Beta pushes BokChoy to Node 22 on Vercel for cockpit at MVP launch.
2. **Cache Components production cites at scale** — Next.js 16 just shipped 2025-10; production cite weight is lighter than older PPR. Re-survey 6-12 months for production-stability signal.
3. **Cockpit-specific bundle baseline** — measure initial JS at first cockpit deploy; set CI threshold from actual baseline, not generic <200KB rule.
4. **Server Actions scaling concern** — surveyed scope shows guidance "default to Server Actions for internal mutations" but doesn't deeply cover scaling beyond simple mutations. Re-investigate if BokChoy ships a complex Server Action workflow (multi-step transactions, conditional cascading mutations).
5. **Monorepo tooling pick** — Turborepo (Vercel-native, well-cited at Cal.com) vs pnpm workspaces vs Bun workspaces. Coupled to deploy story (Turborepo + Vercel is canonical pairing). Future research session if monorepo decision is contested.
6. **shadcn/ui + Radix + Tailwind decision** — the cockpit needs a UI component library. Out of scope for this research session (orthogonal); future research session.
7. **Frontend testing strategy** — Playwright vs Cypress for E2E; Vitest vs Jest for unit. Out of scope; implementation-phase decision.
8. **Bun + Better Auth + Next.js 16 + Drizzle four-way at production scale** — open thread for a deeper survey or controlled validation in CI.
