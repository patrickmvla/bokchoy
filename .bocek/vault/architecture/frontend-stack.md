---
type: decision
features: [frontend-stack, cockpit, monorepo-tooling]
related: ["[[frontend-stack-research]]", "[[bun-workspaces-research]]", "[[backend-stack]]", "[[backend-service-shape]]", "[[backend-service-shape-research]]", "[[backend-stack-research]]", "[[player-auth]]", "[[auth-compliance-research]]", "[[host-platform]]", "[[wedge-decision]]", "[[mvp-feature-sequence]]"]
created: 2026-05-03
confidence: high
---

# Frontend stack: Next.js 16 + Vercel (Bun runtime) + Server Actions + Cache Components + Bun workspaces + Turborepo + shadcn/Radix/Tailwind + Playwright/Vitest + Zod/RHF + TanStack ecosystem

## Amendment 2026-05-03 (continuation) — supplementary picks + TanStack integration patterns

User dropped five picks 2026-05-03 (continuation): shadcn/ui + Radix UI + Tailwind CSS / Playwright + Vitest / Render PaaS / Zod v4 + React Hook Form / TanStack ecosystem (Query + Table + Virtual). TanStack Query + Next.js 16 RSC interaction had architectural nuance, requested research → `[[tanstack-query-rsc-research]]` vaulted. This amendment closes those picks + locks the TanStack integration patterns from research.

### Supplementary pick 1 — UI library: shadcn/ui + Radix UI + Tailwind CSS

- **shadcn/ui** — component code copied into the codebase (NOT a runtime dependency); recipes built on Radix primitives + Tailwind styling; vendor under `apps/cockpit/src/components/ui/`
- **Radix UI** — headless accessible primitives (Dialog, Dropdown, Tooltip, Popover, etc.); used as dependencies of shadcn-vendored components
- **Tailwind CSS v4** with OKLCh color tokens (per Admindek production template pattern from `[[tanstack-query-rsc-research]]` Source 4)
- 2026 React UI consensus default for B2B SaaS dashboards. Production cite: Admindek (35+ shadcn/ui primitives + Radix) + Apex SaaS template + multiple production dashboards per `[[tanstack-query-rsc-research]]` Source 4

### Supplementary pick 2 — Testing: Playwright (E2E) + Vitest (unit)

- **Playwright** for E2E tests (cockpit user flows + cross-deploy auth integration tests + Better Auth flow validation on both Bun and Node 22 runtimes per `[[frontend-stack]]` F-Cockpit-Bun-2 mitigation)
- **Vitest** for unit tests (cockpit components + Server Actions + utilities)
- **Vitest over `bun test`:** ecosystem maturity (mocking, jsdom, plugin breadth) preferred over Bun's faster but less-mature test runner. Bun runtime + Vitest runs cleanly. Open thread: re-evaluate `bun test` if CI test runtime becomes a friction point per `[[tanstack-query-rsc-research]]` open thread 3.

### Supplementary pick 3 — Container PaaS: Render

- **Render** picked for backend container deploy per `[[backend-service-shape]]` Decision Section 5 (PaaS choice deferred to implementation)
- Defense: existing-subscription resource-constraint (cost-driven, same shape as `[[host-platform]]` Supabase pick)
- Resolves `[[backend-service-shape]]` open thread on PaaS pick. `[[backend-service-shape]]` will receive a small amendment recording Render as the locked-in choice.

### Supplementary pick 4 — Forms: Zod v4 + React Hook Form

- **Zod v4** for schema validation (Server Action input parsing + form schema definitions + DB schema cross-reference via Drizzle-Zod adapter)
- **React Hook Form** + **`@hookform/resolvers/zod`** for cockpit form state management
- Standard 2026 React form stack production-cite leader; uncontrolled-form pattern minimizes re-renders
- Pattern: Zod schema defined once in `packages/shared-types/`, imported by Server Actions for input validation AND React Hook Form for client-side validation — single source of truth

### Supplementary pick 5 — TanStack ecosystem (Query + Table + Virtual) with derived integration patterns

Per `[[tanstack-query-rsc-research]]` findings:

#### TanStack Query — RSC integration pattern (locked)

**Per-request QueryClient via React `cache()`:**
```ts
// packages/query-config/src/client.ts (or apps/cockpit/src/lib/query-client.ts)
import { QueryClient } from '@tanstack/react-query';
import { cache } from 'react';

export const getQueryClient = cache(() => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 60s default per TanStack Query docs verbatim
    },
  },
}));
```

**RSC prefetch + HydrationBoundary pattern (canonical from `[[tanstack-query-rsc-research]]` Source 1):**
```tsx
// apps/cockpit/src/app/(dashboard)/players/page.tsx (Server Component)
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { db } from '@bokchoy/db';
import { PlayersList } from './players-list';

export default async function PlayersPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: ['players', { projectId }],
    queryFn: () => db.query.players.findMany({ ... }), // Drizzle through withTenant
  });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PlayersList />
    </HydrationBoundary>
  );
}
```

**Client component consumes seeded cache:**
```tsx
// apps/cockpit/src/app/(dashboard)/players/players-list.tsx (Client Component)
'use client';
import { useQuery } from '@tanstack/react-query';

export function PlayersList() {
  const { data } = useQuery({
    queryKey: ['players', { projectId }],
    queryFn: () => fetch('/api/players').then(r => r.json()), // Or via Server Action
  });
  return <Table data={data} />;
}
```

**Per-data-type staleTime presets** (override `defaultOptions.queries.staleTime` per query):
- **Live-ops data** (player metrics, real-time wallet balances) → `staleTime: 5_000` (5s)
- **Slow-changing data** (project list, catalog metadata, customer profile) → `staleTime: 5 * 60 * 1000` (5 min)
- **Static data** (organization settings, plan tier) → `staleTime: 60 * 60 * 1000` (1 hour)

**Anti-patterns to enforce via PR review / CI lint:**
- Ban `fetchQuery` rendered server-side (use `prefetchQuery` only) per `[[tanstack-query-rsc-research]]` Finding Q4.2
- Require explicit `staleTime` config (no QueryClient with default 0) per Finding Q4.3
- 'use client' discipline per `[[frontend-stack]]` Decision Section 6

#### Server Actions + TanStack Query — derived triple-invalidation pattern (gap-as-finding)

Per `[[tanstack-query-rsc-research]]` Finding Q2.1: surveyed scope does NOT explicitly document Server Actions + `revalidateTag` + `invalidateQueries` triple-invalidation. **Pattern derived from orthogonal layer composition:**

```tsx
// apps/cockpit/src/server/players-actions.ts (Server Action)
'use server';
import { revalidateTag } from 'next/cache';
import { db } from '@bokchoy/db';

export async function updatePlayer(id: string, patch: PlayerPatch) {
  await db.update(players).set(patch).where(eq(players.id, id));

  // Layer 1: Next.js Cache Components invalidation (server-side RSC cache)
  revalidateTag(`player-${id}`);
}

// apps/cockpit/src/components/edit-player-form.tsx (Client Component)
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updatePlayer } from '@/server/players-actions';

export function EditPlayerForm({ playerId }: { playerId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (patch: PlayerPatch) => updatePlayer(playerId, patch),
    onSuccess: () => {
      // Layer 2: TanStack Query client-side cache invalidation
      queryClient.invalidateQueries({ queryKey: ['player', playerId] });
    },
  });
  // ...
}
```

**Both layers fire by design** — orthogonal responsibilities:
- `revalidateTag` (Layer 1) invalidates Next.js's RSC cache for server-side data fetches tagged with the same key
- `queryClient.invalidateQueries` (Layer 2) invalidates TanStack Query's client-side cache for queries that ran on client (post-hydration polling, optimistic updates, refetch-on-window-focus)

**Confidence on derived pattern:** medium per `[[tanstack-query-rsc-research]]` Finding Q2.1. Open thread for first-paying-customer-launch validation.

**Tkdodo broad-invalidation default at MVP** (per Finding Q2.2):
```ts
// QueryClient setup with global mutation invalidation
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => {
      queryClient.invalidateQueries(); // Broad invalidation per Tkdodo canonical
    },
  }),
  defaultOptions: { queries: { staleTime: 60_000 } },
});
```

Tighten to fine-grained per-key only if profiling shows over-invalidation cost post-MVP. Caveat: Issue #7963 (`invalidateQueries` synchronously twice causes double refetches) — only invalidate once per key per mutation `onSuccess` (don't combine global `MutationCache.onSuccess` AND per-mutation `onSuccess` invalidating the same key).

#### TanStack Table v8 + TanStack Virtual

- **TanStack Table v8** for cockpit tables (player list, transaction history, catalog browser, audit log)
  - `manualPagination: true` — server-side pagination via TanStack Query `queryKey: ['table-data', { page, pageSize, sort, filter }]`
  - Client Component (interactive sorting, filtering, row-selection)
  - Initial page 0 prefetched via RSC + seeded into TanStack Query cache via HydrationBoundary
- **TanStack Virtual** for long lists (transaction history >1000 rows, audit log)
  - Wrap virtualized list in Client Component
  - Production cite: Admindek + Apex SaaS templates per `[[tanstack-query-rsc-research]]` Source 4

### Updated cascade obligations (additions to original 15)

16. **`packages/query-config/`** with `getQueryClient()` helper (per-request via `cache()`) + `defaultOptions.queries.staleTime: 60_000` + per-data-type staleTime presets exported
17. **`<QueryClientProvider>` + `<ReactQueryDevtools>`** in `apps/cockpit/src/app/providers.tsx` (Client Component); QueryClient instantiated via `getQueryClient()`
18. **`packages/shared-types/`** Zod schemas for cockpit forms + Server Action inputs (single source of truth between RHF client validation and Server Action server validation)
19. **shadcn/ui CLI initialization** — `npx shadcn-ui@latest init` in `apps/cockpit/` with Tailwind v4 + Radix + components.json config
20. **Tailwind v4 OKLCh color tokens** per Admindek production template pattern (production cite reference)
21. **Playwright config** in `apps/cockpit/playwright.config.ts` — runs against staging deploy + cross-runtime testing on Bun + Node 22 (per F-Cockpit-Bun-2 mitigation)
22. **Vitest config** in `apps/cockpit/vitest.config.ts` — jsdom for React component tests; coverage threshold tracked
23. **`@bokchoy/query-config`** consumed by both `apps/cockpit/` (cockpit web) and any future client-side TanStack Query usage in SDK packages
24. **CI lint rules:** ban `fetchQuery` rendered server-side; require explicit staleTime; 'use client' leaf-placement check
25. **Render PaaS deploy config** (`render.yaml`) for `apps/backend/` per `[[backend-service-shape]]` amendment

### Updated revisit-when (additions)

- **TanStack Form vs React Hook Form** — TanStack Form is in TanStack ecosystem; if RHF integration friction surfaces post-MVP, re-evaluate
- **`bun test` adoption** — re-investigate if CI test runtime becomes friction point
- **Tkdodo broad invalidation → fine-grained migration** — profiling-driven; if over-invalidation cost shows in production data, switch to per-key invalidation per Server Action
- **Triple-invalidation production validation** — at first paying customer launch + 6-month operational data, validate the derived Server Action + TanStack Query pattern from `[[tanstack-query-rsc-research]]` Finding Q2.1

---

# (Original 2026-05-03) Frontend stack: Next.js 16 + Vercel (Bun runtime) + Server Actions + Cache Components + Bun workspaces + Turborepo

## Decision

BokChoy MVP cockpit web stack:

### 1. Framework: Next.js 16 (currently 16.2 at decision time)

- App Router (no Pages Router — greenfield, Cal.com migration cite confirms App Router as 2026 default)
- React 19.2 (bundled with Next.js 16)
- React Compiler 1.0 stable — opt-in via `reactCompiler: true`
- Turbopack stable as default bundler
- TypeScript strict mode
- Pin to **Next.js 16.0.7 or later** at MVP launch (per CVE-2025-55182 patch); track 16.x current via Renovate

### 2. Deploy: Vercel for cockpit + container PaaS for backend (split deploy)

- **Cockpit (`apps/cockpit/`)** → Vercel-native deploy
- **Backend (`apps/backend/`)** → container PaaS per `[[backend-service-shape]]` (Railway / Render / Fly.io / Cloud Run — specific PaaS deferred)
- Two deploy units; cross-deploy communication via HTTP for SDK API calls
- Per `[[frontend-stack-research]]` Finding Q1.3: industry-standard B2B SaaS pattern (Cal.com, Stripe Dashboard, Linear all separate-deploy)

### 3. Cockpit runtime: Bun on Vercel (user explicit risk acceptance)

Per user's explicit risk-acceptance call 2026-05-03 (same shape as `[[backend-stack]]` Bun amendment):

- Vercel `vercel.json` config: `"bunVersion": "1.x"`
- Build/start commands use `bun --bun` flag
- Cross-runtime discipline (carries from `[[backend-stack]]`): no `Bun.*` APIs in cockpit code; Hono server adapter pattern not applicable (Next.js owns runtime adapter on Vercel); use `node:fs` / `node:crypto` / `fetch` for runtime-portable APIs
- Biome `noRestrictedImports` blocks `import 'bun'` / `import 'bun:*'` in `apps/cockpit/` (extends backend rule per `[[tooling]]`)
- **Documented fallback runbook:** if F-Cockpit-Bun-* materializes in production, swap `vercel.json` to remove `bunVersion` config and redeploy on Vercel default Node 22 within 1 hour

### 4. Mutations: Server Actions for cockpit + Route Handlers for SDK API

Per `[[frontend-stack-research]]` Finding Q2.1 (settled 2026 production pattern):

- **Cockpit web** (admin + customer-developer dashboards) → Server Actions for mutations (project CRUD, catalog edits, profile updates per `[[player-auth]]` + `[[catalog-versioning]]` + `[[wallet-mechanics]]` flows)
- **SDK API** (`apps/backend/` `src/sdk/` module per `[[backend-service-shape]]`) → Route Handlers for external clients (customer-developer's game server calls). Full HTTP control + OpenAPI documentation
- Server Actions still validate inputs (Zod schemas), check auth, verify authorization — treat inputs as untrusted same as API endpoints
- Read sessions in RSC via `auth.api.getSession({ headers: await headers() })` for display; mutations + login/logout/session-refresh through Server Actions (RSC cannot set cookies per `[[frontend-stack-research]]` Finding Q2.2)

### 5. Caching: Cache Components opt-in (`cacheComponents: true` + `"use cache"`)

Per `[[frontend-stack-research]]` Finding Q3.1:

- `next.config.ts`: `cacheComponents: true` enables PPR-via-Cache-Components
- `"use cache"` directive on data-fetching functions/components for cacheable data
- All dynamic code executes at request time by default (Next.js 16 default behavior change from prior App Router)
- **Cockpit-specific caching map:**
  - **Live-ops data** (player metrics, recent transactions per `[[wallet-mechanics]]`, wallet stats, transaction history) → uncached / per-request inside Suspense boundaries
  - **Slow-changing data** (project list, catalog metadata per `[[catalog-versioning]]`, customer-developer profile, organization settings) → `"use cache"` with `cacheLife` profile (`hours` or `days`)
  - **Static UI shell** (sidebar nav, layout chrome) → auto-static via Cache Components
- `revalidateTag(tag, profile)` for SWR-style invalidation; `updateTag(tag)` for read-your-writes in Server Actions

### 6. Bundle discipline: <200KB gzipped initial JS target

Per `[[frontend-stack-research]]` Finding Q4.1 + Q4.2:

- **`'use client'` placement at leaf components only**, NOT at page-level wrappers (cascade-bloat documented in Next.js Discussion #13763 + Issue #60246)
- **No wildcard imports** — `import { LucideIcon } from 'lucide-react/icons/lucide-icon'` not `import * as Icons from 'lucide-react'`
- **`optimizePackageImports`** in `next.config.ts` for known-problem libraries:
  ```ts
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', '@radix-ui/react-icons', 'recharts'],
  }
  ```
- **`@next/bundle-analyzer` in CI** — alert on bundle size growth >threshold from baseline
- **<200KB gzipped initial JS target** per page (Vikas Kumar 60% reduction case study; industry-standard B2B dashboard rule of thumb)
- ES Modules throughout (CommonJS imports forbidden); named exports preferred over default

### 7. Auth integration: Better Auth in RSC + Server Actions + proxy.ts

Per `[[frontend-stack-research]]` Source 3 (Better Auth Next.js integration docs):

- **RSC pattern (verbatim from Better Auth docs):**
  ```typescript
  import { auth } from "@/lib/auth"
  import { headers } from "next/headers"

  export async function ServerComponent() {
    const session = await auth.api.getSession({
      headers: await headers()
    })
    if (!session) return <div>Not authenticated</div>
    return <div>Welcome {session.user.name}</div>
  }
  ```
- **`nextCookies()` plugin** in Better Auth config — auto-handles Set-Cookie headers when present in response (must be last plugin in array per Better Auth docs)
- **Server Actions** for login/logout/session-refresh:
  ```typescript
  "use server";
  import { auth } from "@/lib/auth"
  // ... call auth.api.* methods
  ```
- **proxy.ts** (Next.js 16 replacement for middleware.ts) for route-level auth checks — redirect unauthenticated users to login, validate session on protected routes; runs on Node.js runtime

### 8. Monorepo: Bun workspaces + Turborepo hybrid

Per `[[bun-workspaces-research]]` Finding 1 (OpenCode production cite for the exact hybrid):

```
bokchoy/                          # repo root
├── package.json                  # workspaces + catalog config
├── turbo.json                    # task graph + caching pipeline
├── bun.lock                      # Bun lockfile v3 (text-based)
├── .gitignore
├── .eslintrc.cjs                 # cross-cutting ESLint rules including no-bun-imports
├── apps/
│   ├── backend/                  # Bun + Hono + Drizzle + Better Auth (per [[backend-stack]] + [[backend-service-shape]])
│   │   ├── package.json
│   │   ├── Dockerfile            # Multi-stage Bun image; Node 22 fallback variant CI-tested
│   │   ├── src/                  # Module structure per [[backend-service-shape]]
│   │   │   ├── auth/
│   │   │   ├── players/
│   │   │   ├── wallet/
│   │   │   ├── catalog/
│   │   │   ├── loot/
│   │   │   ├── outbox/
│   │   │   ├── sdk/              # Route Handlers
│   │   │   ├── idempotency/
│   │   │   └── infra/            # withTenant wrapper, telemetry
│   │   └── ...
│   └── cockpit/                  # Next.js 16 + Bun on Vercel
│       ├── package.json
│       ├── next.config.ts        # cacheComponents + optimizePackageImports + bundle analyzer
│       ├── vercel.json           # bunVersion: "1.x" + build commands
│       ├── proxy.ts              # Auth route-level checks
│       └── src/
│           ├── app/              # App Router routes
│           │   ├── (auth)/       # Login, signup
│           │   ├── (dashboard)/  # Customer-developer dashboards
│           │   ├── (admin)/      # BokChoy admin
│           │   └── api/          # Route Handlers (rare; mostly Server Actions)
│           ├── components/       # Mostly server components; client-leaf only
│           └── server/           # Cockpit-side data access (calls into shared backend modules via @bokchoy/db etc.)
└── packages/
    ├── db/                       # Drizzle schema (Better Auth + BokChoy tables)
    │   ├── package.json          # name: "@bokchoy/db"
    │   ├── drizzle.config.ts
    │   └── src/
    │       ├── schema/           # Per-feature schema files
    │       └── index.ts          # Public exports
    ├── shared-types/             # Shared request/response types, branded types
    │   ├── package.json          # name: "@bokchoy/shared-types"
    │   └── src/
    ├── auth-config/              # Better Auth config + plugins (anonymous, organization, nextCookies)
    │   ├── package.json          # name: "@bokchoy/auth-config"
    │   └── src/
    └── ui/ (deferred — created when cockpit grows past initial routes)
```

**Catalog-managed shared dependency versions** (per OpenCode pattern via Bun catalog feature) in root `package.json`:
- `typescript`, `react`, `react-dom`, `next`, `drizzle-orm`, `better-auth`, `hono`, `zod`, `argon2` (or argon2id-binding-of-choice), `@types/*`

**Turbo task graph** (`turbo.json`):
- `build` task with `dependsOn: ["^build"]` (build dependencies first)
- `dev`, `lint`, `test`, `typecheck` parallel tasks
- Remote caching via Vercel for CI speedup

**Cross-package references via `workspace:*` protocol** — packages reference each other using local workspace versions, not published npm versions.

**Linter `noRestrictedImports` rules (Biome per `[[tooling]]`):**
- All packages: block `import 'bun'` / `import 'bun:*'` (cross-runtime discipline) via Biome's built-in `noRestrictedImports` rule with gitignore-style patterns; `overrides[]` excludes test files where Bun-specific imports (e.g. `bun:test`) are legitimate.
- `apps/cockpit/`: enforce 'use client' leaf-component placement via PR review at MVP (no clean lint expression in either Biome or ESLint; `[[tooling-research]]` Q1 limitations apply equally here).

### 9. Dependency CVE discipline (mitigation for F-RSC-1)

- **Renovate or Dependabot** auto-PRs for CVE patches
- **`npm audit` (Bun-equivalent: `bun audit`) in CI** — fail build on critical CVEs
- **Pin Next.js to 16.x** with auto-PR upgrades within 16.x range; major version bumps reviewed manually
- Subscribe to Next.js security advisories + React security advisories

## Reasoning

### Why Next.js 16

Per `[[frontend-stack-research]]` Findings Q1.1:
- Production-grade in 2026-Q2: released 2025-10-21, 16.2 (2026-03-18) shipped 400% faster `next dev` + 50% faster rendering + 200+ Turbopack bug fixes
- Cache Components stable replacing experimental PPR
- Turbopack stable as default
- React 19.2 + React Compiler 1.0 stable
- proxy.ts replaces middleware.ts (clearer network-boundary semantics)
- Production cites: Cal.com (250k+ LOC App Router migration with Vercel Edge Config feature flagging), Vercel itself, multiple B2B SaaS surveyed

User pre-pick "production-cited leader" earned the entry — research surfaced no contender with comparable production-cite weight at React-stack B2B SaaS scale. **Confidence: high.**

### Why Vercel-for-cockpit + container-for-backend (split deploy)

Per `[[frontend-stack-research]]` Finding Q1.3:
- Industry-standard B2B SaaS pattern (Cal.com, Stripe Dashboard, Linear all split-deploy)
- Vercel free tier covers indie/SMB MVP scale
- Vercel Edge Config + image optimization + ISR-via-Vercel-cache match cockpit's needs
- Backend stays on container PaaS per `[[backend-service-shape]]` modular monolith — argon2 native binding + outbox long-running pattern require container deploy
- **Modular-monolith philosophy is for backend service shape; cockpit is frontend, separate deploy by industry convention.** Two deploy units; cross-communication via HTTP for SDK API calls (which is the contract anyway — customer-developer game servers also call backend via HTTP)

**Confidence: high** — production-cite-converged + clear engineering rationale.

### Why Bun on Vercel for cockpit (explicit risk acceptance)

User pick 2026-05-03. Per `[[frontend-stack-research]]` Source 2: Vercel Bun runtime is **Public Beta, NOT GA** — risk profile materially higher than Node 22 default. User accepted explicit risk with named failure modes (F-Cockpit-Bun-1/2/3) + cross-runtime discipline mitigation + 1-hour fallback runbook. Same shape as `[[backend-stack]]` Bun amendment.

**Trade documented honestly:** runtime consistency across stack (Bun everywhere) + perf upside potential > production-stability conservativism. Cost of being wrong is bounded by `vercel.json` config swap to Node 22 default.

**Confidence: medium** on the runtime call (per Vercel Public Beta status); high on the trade being defensibly recorded.

### Why Server Actions for cockpit + Route Handlers for SDK

Per `[[frontend-stack-research]]` Finding Q2.1: settled 2026 production-grade pattern.

- Cockpit calls are internal (customer-developer logged in to BokChoy dashboard) → Server Actions provide DX win + auto POST endpoint
- SDK API calls are external (customer-developer's game server → BokChoy) → Route Handlers provide HTTP control + OpenAPI generation + status code semantics

**Confidence: high** — production-cited consensus.

### Why Cache Components opt-in

Per Next.js 16's default behavior change: dynamic execution at request time, caching is opt-in. Per `[[frontend-stack-research]]` Finding Q3.1:
- Live-ops dashboards need fresh data per request (not cached) — matches default
- Static UI shell + slow-changing data (project list, catalog metadata) benefit from caching
- `cacheLife` profiles (`hours`, `days`, `max`) for graduated freshness control
- Sub-50ms TTFB on personalized routes per Vercel benchmarks

**Confidence: high** — primary docs + production-architecture guides converge.

### Why Bun workspaces + Turborepo hybrid

Per `[[bun-workspaces-research]]` Finding 1 (framing fix): "Bun workspaces vs Turborepo" was a category error — they compose at different layers.

- **Bun workspaces** (Layer 1): package manager + workspace dep resolution. Production cite: OpenCode (anomalyco/opencode), 20+ packages. Consistent with Bun runtime per `[[backend-stack]]` amendment.
- **Turborepo** (Layer 2): task orchestration + caching + parallelization. Production cites: Trigger.dev, Cal.com, OpenCode. Turborepo 3.0 has first-class native Bun workspace support.

OpenCode is the named production cite for this exact hybrid. Industry consensus 2026 stack per untergletscher.com is "Bun + Turborepo + Biome." **Confidence: high.**

### Why CVE-discipline as named failure mode

Per `[[frontend-stack-research]]` Source 4: CVE-2025-55182 (React2Shell, Dec 2025) was a critical pre-auth RCE in RSC Flight serialization protocol. Active widespread exploitation observed by Google TIG + Microsoft + AWS + Palo Alto Unit 42. Patched in Next.js 16.0.7+. **For BokChoy:** starting fresh on 16.x current means patch is in place at MVP launch. **But:** RSC's serialization surface has been red-team-tested + exploited; subsequent CVEs at the same severity are plausible.

Mitigation pattern (Renovate/Dependabot + npm audit in CI + security advisory subscription) is industry-standard. **Confidence: high.**

## Engineering substance applied

- **Consistency:** TypeScript strict + Drizzle compile-time SQL types + Zod runtime validation at Server Action boundaries. End-to-end typed contracts via `@bokchoy/shared-types` package shared across cockpit + backend.
- **Failure semantics:** Server Actions fail with thrown errors caught by Next.js boundary; Route Handlers return explicit HTTP status. RSC pages 500-error fallback via `error.tsx`. Better Auth session validation fails closed.
- **Concurrency:** RSC + Suspense streaming render multiple data sources in parallel; Server Actions are sequential per-request mutations. Standard B2B SaaS pattern.
- **Observability:** Vercel native instrumentation (request logs, function metrics, build logs); structured JSON logs to stdout from Next.js server runtime; OpenTelemetry compatible per Next.js 16 docs. Page on Vercel error rate >threshold; bundle-size growth alert in CI.
- **Storage:** No frontend-side storage. Server Actions/RSC read from backend via `@bokchoy/db` package (Drizzle queries through `withTenant(...)` per `[[backend-stack]]`).
- **Networking:** TLS terminated at Vercel ingress for cockpit; cross-deploy HTTP calls (cockpit → backend SDK API) over TLS; Better Auth cookie domain configured to match cockpit deploy URL.
- **Security:** F-RSC-1 (CVE-2025-55182 class) patch discipline; Server Action input validation discipline (Zod at every boundary); CSP headers configured per Next.js Security guides; Better Auth handles CSRF on Server Actions per its plugin architecture.

## Production-grade gates

- **Idiomatic** — Next.js 16 + App Router + Server Actions + Cache Components is the 2026 React-stack consensus default. Bun workspaces + Turborepo is the 2026 monorepo consensus per `[[bun-workspaces-research]]`. `'use client'` discipline + `optimizePackageImports` is the documented Next.js 16 bundle-optimization path. **(idiom-cited; confidence: high)**

- **Industry-standard** — Cal.com (250k LOC App Router production cite), Vercel, Stripe Dashboard, Linear (split-deploy pattern), OpenCode (Bun workspaces + Turbo), Trigger.dev (Turborepo). Better Auth + Next.js 16 documented integration with explicit version compatibility. **(production-cited × 5+; confidence: high)**

- **First-class** — Next.js + Vercel native pairing; Bun workspaces + Turbo native first-class integration; Better Auth + Next.js 16 official integration; Cache Components is the platform's intended caching primitive (not a workaround). **(first-class-cited; confidence: high)**

## Rejected alternatives

### Alternative A — SPA + Vite (no Next.js)

**What:** Pure client-side rendered React app via Vite; backend serves API only.

**Wins when:** No SEO needs (cockpit is auth-gated so this applies), no SSR streaming requirements, smaller bundle target, simpler mental model, runtime portability priority.

**Why not here:** Cache Components + Suspense streaming materially improve cockpit perceived performance for live-ops dashboards (sub-50ms TTFB on personalized routes per `[[frontend-stack-research]]` Source 7). Cal.com production cite for App Router at indie/SMB SaaS scale is direct evidence the framework pays back at this shape. RSC server-side data fetching reduces client-server round trips. Loss of `'use client'` discipline tax is real but bounded.

### Alternative B — Remix / React Router 7

**What:** Remix's nested-route + server-loader-data pattern (now React Router 7).

**Wins when:** Strong preference for navigation-led data loading; team already on Remix; simpler mental model than RSC.

**Why not here:** Production-cite weight at indie/SMB B2B SaaS scale skews to Next.js. Less ecosystem (Better Auth integration is documented for Next.js, not Remix). Remix v2 → React Router 7 migration mid-MVP is risk. **Confidence on rejection: medium-high** — Remix is genuinely viable; rejection is on cite-weight + ecosystem-fit, not on technical inferiority.

### Alternative C — SvelteKit / Solid Start

**What:** Non-React frameworks with smaller bundle + simpler reactivity.

**Wins when:** Greenfield project willing to skip React ecosystem; smaller bundle + better perceived performance valued over ecosystem breadth.

**Why not here:** Better Auth + Drizzle ecosystem skews React-heavy in 2026 docs/integrations. Smaller production-cite weight for B2B SaaS at indie/SMB scale. TS proficiency is React-heavy per session-staging context. **Rejected on ecosystem-fit + cite-weight.**

### Alternative D — Astro

**What:** Astro for content + island architecture for interactivity.

**Wins when:** Content-heavy site, low interactivity, blog/marketing-site shape.

**Why not here:** Cockpit is dashboard-shape (high interactivity, auth-gated, frequent data refresh). Astro's island model is wrong fit — virtually every page is highly interactive.

### Alternative E — Container-PaaS deploy for cockpit (single deploy unit with backend)

**What:** Next.js standalone output deployed in same container as backend.

**Wins when:** Strong preference for single-deploy operational simplicity, willing to forfeit Vercel-specific features.

**Why not here:** Loses Vercel native integration (Edge Config, image optimization, ISR cache). Custom Dockerfile complexity. Bun + Next.js + Hono backend in single process is untested combo (cross-cite from `[[backend-service-shape-research]]`). Two-deploy-unit cost is real but bounded.

### Alternative F — Cloudflare Pages / Workers for cockpit

**What:** Edge-distributed cockpit on Cloudflare Pages.

**Wins when:** Edge-distributed personalized content is product-critical; Bun-on-Workers is GA (it's not as of 2026-Q2).

**Why not here:** Better Auth edge runtime can't make DB calls per `[[frontend-stack-research]]` Source 3; would force HTTP roundtrip pattern adding latency. Cloudflare Pages doesn't support Next.js 16 App Router fully without workarounds. Vercel is the production-grade default at this scale.

### Alternative G — Node 22 on Vercel for cockpit (research-anchored conservative pick)

**What:** Cockpit runs Node 22 (Vercel default) instead of Bun. Backend stays on Bun per `[[backend-stack]]`.

**Wins when:** Risk-averse MVP launch posture; want to avoid Public-Beta-on-Public-Beta layered risk; cross-runtime philosophy actually executed (cockpit is the cross-runtime fallback that backend's discipline preserves).

**Why not here:** User explicit risk-acceptance call 2026-05-03. Node 22 fallback path is documented + 1-hour swap if Bun bites. Same risk-tolerance shape as `[[backend-stack]]` Bun amendment. **Rejected via user risk-acceptance, not on engineering inferiority** — Node 22 is the conservative pick research recommended. Vault entry honest about the trade.

### Alternative H — Pages Router (legacy Next.js routing)

**What:** Next.js Pages Router instead of App Router.

**Wins when:** never (greenfield project; App Router is consensus default).

**Why not here:** Cal.com migrated 250k LOC FROM Pages Router TO App Router over 5 months. Greenfield starting on Pages Router would lock BokChoy into the same migration debt later. App Router is Next.js 16 default + RSC primitives only available in App Router.

### Alternative I — Pure Bun workspaces without Turborepo

**What:** Bun workspaces only; build orchestration via `bun run --filter` + custom scripts.

**Wins when:** Tiny monorepo (1-2 workspaces), no CI caching needs.

**Why not here:** Per `[[bun-workspaces-research]]` Finding 3: Bun workspaces does NOT ship task graph dependency resolution + output caching keyed on inputs + remote caching. At BokChoy MVP scale (4+ workspaces), Turborepo's caching pays back almost immediately. OpenCode + Trigger.dev + Cal.com all use Turborepo.

### Alternative J — pnpm workspaces + Turborepo

**What:** pnpm as package manager (replacing Bun) + Turborepo.

**Wins when:** Enterprise-tier maturity required (Vercel, Vue core team, Prisma all migrated TO pnpm in 2025-2026 per `[[bun-workspaces-research]]` pkgpulse 2026 cite); concern over Bun workspaces edge cases at scale.

**Why not here:** Loses runtime-consistency story (Bun runtime + pnpm package manager is a hybrid that works but adds complexity). Bun workspaces is production-grade for BokChoy scale (OpenCode 20+ packages cite). Migration cost from Bun→pnpm later is low if needed (workspace config files are small).

## Failure modes

### F-RSC-1 — Future RSC serialization vulnerability (CVE-2025-55182 class)

CVE-2025-55182 (React2Shell, Dec 2025) was a critical pre-auth RCE in RSC Flight serialization protocol. RSC surface is now red-team-tested; subsequent CVEs at same severity are plausible.

**Mitigation:**
- Pin Next.js 16.0.7+ at MVP launch
- Renovate/Dependabot auto-PRs for CVE patches
- `bun audit` (or `npm audit`) in CI — fail build on critical CVEs
- Subscribe to Next.js + React security advisories
- Monthly CVE review + patch deploy SLA: 24 hours for critical, 7 days for high

### F-Cockpit-Bun-1 — Vercel Bun runtime adapter compatibility gap

Vercel Bun runtime is Public Beta. Specific Next.js 16 feature not yet supported by adapter, edge case in request lifecycle, or compatibility issue with Better Auth integration.

**Mitigation:**
- Monitor Vercel deployment logs + error rates for first 4 weeks post-launch
- Documented fallback runbook: swap `vercel.json` to remove `bunVersion` config + redeploy on Node 22 within 1 hour
- Cross-runtime discipline (no `Bun.*` APIs) ensures fallback is config-flag change, not refactor
- Integration tests covering Better Auth flows on both Bun and Node 22 in CI

### F-Cockpit-Bun-2 — Bun + Next.js 16 + Better Auth four-way at production scale unverified

`[[frontend-stack-research]]` Finding Q1.4: surveyed scope did not directly verify the four-way at production scale. Compatibility assumed transitively (each pair works) but compounded.

**Mitigation:** integration tests on the full stack in CI (login → session → RSC read → Server Action mutation → logout) on both Bun and Node 22; staging deploy mirrors production runtime; first-customer pre-launch validation period.

### F-Cockpit-Bun-3 — Vercel Bun runtime feature regressions during Bun's stability iteration

Vercel + Bun ship fixes through 2026 (`[[backend-stack]]` Bun amendment, `[[frontend-stack-research]]` Source 2). Some fix may break BokChoy-specific patterns.

**Mitigation:** Vercel preview deployments for every PR; staging environment mirrors production; feature flag rollout for new cockpit features via Vercel Edge Config (Cal.com pattern).

### F-Frontend-1 — `'use client'` cascade inflates cockpit bundle

Discipline erodes; a developer adds 'use client' at page level instead of leaf component; downstream wildcard imports trigger barrel-file bundle inclusion.

**Mitigation:** `@next/bundle-analyzer` in CI with size threshold alert; manual review of `'use client'` placement at PR; `optimizePackageImports` configured for known-problem libraries; baseline bundle size measured + tracked in CI.

### F-Frontend-2 — Cockpit-backend deploy split breaks at first paying customer

Cross-deploy HTTP calls between cockpit (Vercel) → backend (container) hit CORS issue, auth cookie domain mismatch, or latency spike from cross-region deploy.

**Mitigation:** test cross-deploy auth + API calls in staging before production; Vercel + container PaaS in matching region (Supabase region per `[[host-platform]]`); CORS headers + cookie domain explicitly configured; first-paying-customer flag for early signal.

### F-Frontend-3 — Server Action input validation gap

Server Action receives malformed input; Zod schema missing; auth check skipped; state mutation occurs with bad data.

**Mitigation:** every Server Action wraps body in Zod parse + auth check + authz check; ESLint custom rule (or PR review checklist) flags Server Actions without Zod parse; integration tests cover malformed-input cases.

### F-Frontend-4 — Cache Components stale data displayed to user

`"use cache"` directive applied too aggressively; user expects fresh data, sees stale.

**Mitigation:** explicit `cacheLife` profile per cached function (`hours` for project list, `max` for catalog with explicit `updateTag` on writes); Server Actions use `updateTag(tag)` for read-your-writes; user-facing operations that need fresh data use `refresh()` post-mutation.

### F-Frontend-5 — Monorepo `turbo prune` Bun support gap impacts Docker image size

Per `[[bun-workspaces-research]]` Finding 5: `turbo prune` for Bun workspaces is incomplete (vercel/turborepo Discussion #7456 open). Backend Dockerfile may ship full monorepo into container.

**Mitigation:** at MVP, ship full monorepo into backend Docker image (~30-50MB extra image size, negligible at MVP scale). Track Discussion #7456; switch to slim-image-via-prune when supported. Cockpit doesn't use Dockerfile (Vercel deploy), so this only affects backend.

### F-Frontend-6 — Bun catalog feature gap in 2026-Q2

Bun catalog is newer than pnpm catalog; specific feature gaps unsurveyed.

**Mitigation:** simple catalog usage at MVP (just version pinning across packages); document any catalog friction in vault open thread; fall back to inline version specifications if catalog blocks.

## Mitigations

(captured inline per failure mode; aggregated for runbook reference at implementation phase)

- F-RSC-1: Renovate + `bun audit` in CI + security advisory subscriptions + 24-hour critical patch SLA
- F-Cockpit-Bun-1/2/3: Vercel preview + staging env + integration tests on both runtimes + 1-hour fallback runbook
- F-Frontend-1: bundle analyzer in CI + 'use client' placement review + optimizePackageImports
- F-Frontend-2: cross-deploy staging + CORS + cookie-domain config + region matching
- F-Frontend-3: Zod parse + auth/authz at every Server Action; ESLint rule
- F-Frontend-4: explicit `cacheLife` profiles; `updateTag` for read-your-writes; `refresh()` for uncached refresh
- F-Frontend-5: ship full monorepo into Docker at MVP; track Turborepo Discussion #7456
- F-Frontend-6: simple catalog usage; fall-back to inline specs

## Idiom citations

- `[[frontend-stack-research]]` (Q1-Q4 evidence base)
- `[[bun-workspaces-research]]` (monorepo tooling resolution)
- 2026 industry consensus stack (Bun + Turborepo + Biome) per untergletscher.com
- Better Auth + Next.js 16 official integration patterns
- `[[backend-stack]]` cross-runtime discipline (extends to cockpit)

## Revisit when

- **Vercel Bun runtime announces GA** — re-evaluate whether to drop the F-Cockpit-Bun-* failure-mode discipline (current discipline costs near-zero, can be retained)
- **Cache Components production cites at scale accumulate** (Next.js 16 just shipped 2025-10) — re-investigate caching strategy if production data shows under-utilization or over-aggressive caching
- **CVE in RSC class fires** — execute F-RSC-1 mitigation runbook; document the CVE in vault failure-mode log; may trigger broader review of RSC vs alternatives
- **Cockpit bundle size exceeds 250KB initial JS gzipped** — investigate which 'use client' cascade or wildcard import grew it; tighten lint rules
- **Cockpit starts hitting Vercel free-tier limits** ($0 → $20/mo Pro tier) — re-evaluate whether revenue justifies the upgrade or whether container-PaaS-deploy alternative becomes attractive
- **Customer-developer asks for SSO (SAML/OIDC) into cockpit** — Better Auth gap per `[[backend-stack-research]]` + `[[backend-service-shape-research]]`; layer WorkOS or similar
- **`turbo prune` Bun support lands** (Discussion #7456) — adopt slim-image Docker pattern for backend
- **Frontend testing strategy chosen** (Playwright vs Cypress for E2E; Vitest vs Bun test for unit) — implementation-phase task, not architecture revisit
- **shadcn/ui + Radix + Tailwind UI library decision** — separate research session; affects bundle size budget
- **Cockpit needs SSR for SEO** (currently auth-gated; would change if marketing site colocated) — revisit Vercel Edge Network + ISR strategy
- **Monorepo grows past ~10 packages** — re-evaluate workspace structure + `turbo.json` task graph; may warrant separate `tools/` directory for shared CLI tools

## Cascade obligations queued for implementation phase (NOT design)

1. **Monorepo scaffold:** root `package.json` + `turbo.json` + `bun.lock` + workspace dirs; `apps/{backend,cockpit}/` + `packages/{db,shared-types,auth-config}/`
2. **Bun catalog config** in root `package.json` for shared dependency version pinning per OpenCode pattern
3. **Turbo task pipeline** in `turbo.json`: `build`, `dev`, `lint`, `test`, `typecheck` with `dependsOn` cross-workspace dependencies
4. **Vercel project setup** for `apps/cockpit/`: monorepo-aware config, `bunVersion: "1.x"`, `buildCommand: "turbo run build --filter=cockpit"`, env-var injection from root
5. **Next.js 16 config** (`apps/cockpit/next.config.ts`): `cacheComponents: true`, `optimizePackageImports`, `@next/bundle-analyzer` integration
6. **proxy.ts** for cockpit route-level auth checks
7. **Better Auth setup** in `packages/auth-config/`: anonymous + organization plugins + nextCookies + Drizzle adapter; consumed by `apps/cockpit/src/lib/auth.ts` and `apps/backend/src/auth/`
8. **Cockpit module scaffold:** `apps/cockpit/src/{app,components,server,lib}/` per Next.js conventions
9. **CI/CD pipeline:** GitHub Actions or Vercel-native — per-package test gates; staged deploy with rollback; bundle-size threshold alerts; CVE audit on every PR
10. **Renovate/Dependabot config** for auto-PR on CVE patches + Next.js 16.x minor/patch upgrades
11. **Cross-deploy integration tests:** cockpit (Vercel) → backend (container) auth + SDK API call flows on both runtimes
12. **`@bokchoy/db` package design:** Drizzle schema files for Better Auth tables (hand-written matching Better Auth shapes per `[[backend-stack]]`) + BokChoy tables; exported repository functions per `[[backend-service-shape]]` module-isolation discipline
13. **`@bokchoy/shared-types` package design:** request/response shapes shared between cockpit Server Actions and backend; branded types for IDs (per `idioms/typescript.md` if exists)
14. **Bundle baseline measurement:** measure cockpit's initial JS at first deploy; set CI threshold from actual baseline (not generic <200KB rule)
15. **Vercel Edge Config setup** (deferred until first feature flag is needed) — Cal.com pattern
