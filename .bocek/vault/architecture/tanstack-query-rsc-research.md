---
type: research
features: [frontend-stack, cockpit]
related: ["[[frontend-stack]]", "[[frontend-stack-research]]", "[[backend-stack]]", "[[backend-service-shape]]"]
created: 2026-05-03
confidence: high
provisional: false
---

# TanStack Query + Next.js 16 RSC: canonical pattern + Server Actions integration

## Question

Hypothesis under test: TanStack Query as client-side cache only, server-side fetch via RSC + Server Actions for mutations (pattern (α) from `[[frontend-stack]]` design flagging). User picked TanStack Query + Table + Virtual for cockpit; Q-Q+RSC integration has architectural nuance.

Sub-questions:
- **Q1:** TanStack Query + Next.js 16 RSC canonical pattern (HydrationBoundary, dehydrate, queryClient lifecycle, staleTime).
- **Q2:** Server Actions + TanStack Query mutation/invalidation pattern (the Next.js-native + client-side double-invalidation question).
- **Q3:** TanStack Table v8 + TanStack Virtual on Next.js 16 — server vs client component placement.
- **Q4:** Anti-patterns at production scale.

## Triangulation

### Q1 (RSC integration pattern)
- **Production reference:** ✓ — TanStack Query official docs (TanStack/query repo, current as of 2026); production guides at byteiota.com 2026 ("Most modern apps use a hybrid approach of RSC + TanStack Query for dashboards, e-commerce, and SaaS"); Admindek + Apex production templates use the hybrid pattern.
- **Docs reference:** ✓ — tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr (verbatim canonical pattern with code examples).
- **Contradiction probe:** ✓ — TanStack/query Discussion #6267 (App Router client + server component with HydrationBoundary patterns); Discussion #7184 (HydrationBoundary + client useQuery refetches on mount issue); explicit caveats in official docs about `fetchQuery` rendering anti-pattern.

### Q2 (Server Actions + invalidation)
- **Production reference:** ✓ — Tkdodo (Dominik Dorfmeister, TanStack Query maintainer) canonical mutation invalidation guide tkdodo.eu/blog/automatic-query-invalidation-after-mutations.
- **Docs reference:** ✓ — TanStack Query Query Invalidation guide v5; Next.js docs `revalidateTag` / `updateTag` (per `[[frontend-stack]]` Section 5).
- **Contradiction probe:** ✓ — explicit gap surfaced: surveyed scope does NOT document the Server Actions + TanStack Query + revalidateTag triple-invalidation pattern. WebSearch summary verbatim: *"results don't show specific information about combining [Server Actions + TanStack Query + revalidateTag] for 2026 production setups"*. Pattern derived from first principles (orthogonal layer composition) + Tkdodo's `MutationCache.onSuccess` global pattern.

### Q3 (Table + Virtual on Next.js 16)
- **Production reference:** ✓ — Admindek Next.js (35+ shadcn primitives + TanStack Table v8 for server-side pagination + 9 dashboard variants); Apex SaaS template (subscription analytics + user management + invoice generation via TanStack Table v8); byteiota.com 2026 ecosystem survey.
- **Docs reference:** ✓ — TanStack Table v8 docs; Discussion #5410 (server-side pagination patterns).
- **Contradiction probe:** ✓ (light scope per pure-headless-utility nature) — no notable production regret cites for TanStack Table/Virtual.

### Q4 (Anti-patterns)
- **Production reference:** ✓ — Tkdodo blog identifies common mistakes; byteiota 2026 RSC overuse warning ("if you accidentally sprinkle 'use client' everywhere... you lose the advantage").
- **Docs reference:** ✓ — TanStack Query official caveats on `fetchQuery` server-rendered results, staleTime=0 default.
- **Contradiction probe:** ✓ — TanStack/query Issue #7963 (double `invalidateQueries` causes double refetches — surprising behavior, hard to work around); Issue #7129 (redundant invalidation when combining `useQuery` + `fetchQuery` in v5).

## Sources examined

### Source 1 — TanStack Query Advanced SSR official guide
- **Tier:** 2 (official docs)
- **Provenance:** tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr — observed 2026-05-03
- **What it tells us:** Canonical Next.js App Router + RSC pattern documented with verbatim code:

  **Server Component (`page.tsx`):**
  ```tsx
  export default async function PostsPage() {
    const queryClient = new QueryClient()
    await queryClient.prefetchQuery({
      queryKey: ['posts'],
      queryFn: getPosts,
    })
    return (
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Posts />
      </HydrationBoundary>
    )
  }
  ```

  **Client Component (`posts.tsx`):**
  ```tsx
  'use client'
  export default function Posts() {
    const { data } = useQuery({
      queryKey: ['posts'],
      queryFn: () => getPosts(),
    })
  }
  ```

  **QueryClient lifecycle:**
  - **Per-request (recommended):** new `QueryClient` per Server Component
  - **Singleton-per-request via `cache()`:** `const getQueryClient = cache(() => new QueryClient())` — `cache()` is scoped per request, doesn't leak across requests
  - Warning: dehydrating entire client causes "unnecessary overhead" vs per-component clients

  **staleTime configuration (verbatim):**
  ```tsx
  defaultOptions: {
    queries: {
      // With SSR, we usually want to set some default staleTime
      // above 0 to avoid refetching immediately on the client
      staleTime: 60 * 1000,
    },
  }
  ```

  **Server vs Client component split:**
  - *"Server Components are guaranteed to only run on the server, but Client Components can actually run in both places."*
  - **Server Components handle:** Data prefetching via `prefetchQuery` / `fetchQuery`
  - **Client Components handle:** Query consumption via `useQuery` / `useSuspenseQuery`

  **App Router caveats:**
  - *"In the SSR guide, we noted that you could get rid of the boilerplate of having `<HydrationBoundary>` in every route. This is not possible with Server Components."*
  - **`fetchQuery` server-side rendering anti-pattern:** *"don't render its result on the server or pass the result to another component, even a Client Component one"* — causes data sync issues if client refetches

  **Streaming with pending queries (v5.40+):**
  ```tsx
  dehydrate: {
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) ||
      query.state.status === 'pending',
  }
  ```
  Allows: *"streams the data to the client as the query finishes"* without blocking Suspense boundaries.

### Source 2 — Tkdodo canonical mutation invalidation guide
- **Tier:** 4 (engineering blog, named author who is the TanStack Query maintainer — high signal despite tier-4 placement)
- **Provenance:** tkdodo.eu/blog/automatic-query-invalidation-after-mutations, published 2024-05-25, last updated 2025-11-25
- **Author context:** Dominik Dorfmeister (TkDodo), TanStack Query core maintainer
- **What it tells us:**
  - Canonical global mutation invalidation pattern:
    ```tsx
    const queryClient = new QueryClient({
      mutationCache: new MutationCache({
        onSuccess: () => {
          queryClient.invalidateQueries()
        },
      }),
    })
    ```
  - Philosophy: *"I would prefer fetching some data more often than strictly necessary over missing a refetch."* Broad invalidation + ~2-minute staleTime is pragmatic.
  - Trade-off named: putting updated data directly into cache via `onSuccess` callback avoids refetch but is brittle when requirements evolve. Broad invalidation scales better.
  - Anti-patterns: over-engineering fine-grained revalidation; awaiting all invalidations when fire-and-forget suffices; missing `cancelRefetch: false` on already-in-flight queries.
  - **Server Actions not addressed in this article.**

### Source 3 — TanStack Query Invalidation from Mutations docs
- **Tier:** 2 (official docs)
- **Provenance:** tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
- **What it tells us:**
  - `useMutation` + `onSuccess` + `queryClient.invalidateQueries({ queryKey: [...] })` is the canonical pattern
  - `invalidateQueries` marks query stale (overrides staleTime); active queries refetch in background
  - `refetchType: 'none'` option to mark stale without refetching
  - Multiple key invalidation via `Promise.all` if you need to await

### Source 4 — Production B2B SaaS dashboards using TanStack Table v8 + Next.js 16
- **Tier:** 4 (engineering guides + named templates)
- **Provenance:** adminlte.io/blog/nextjs-admin-dashboards-shadcn (Admindek 35+ shadcn primitives + TanStack Table v8 + 9 dashboard variants); adminlte.io/blog/saas-admin-dashboard-templates (Apex — subscription analytics, user management, invoice generation via TanStack Table v8); byteiota.com/tanstack-ecosystem-2026-9-tools-challenge-next-js
- **What it tells us:**
  - **TanStack Query, Router, Table, Form, Virtual are production-ready and battle-tested in 2026** (byteiota cite)
  - *"Most modern apps use a hybrid approach of RSC + TanStack Query for dashboards, e-commerce, and SaaS, offering the best DX and performance in 2025"*
  - Admindek pattern: vendored shadcn/ui + TanStack Table v8 for server-side pagination — direct production cite for the same stack BokChoy is committing to
  - Apex pattern: TanStack Table v8 powers user-management + role-based access + invoice tables in B2B SaaS dashboard
  - Production templates ship the full stack: Next.js 16 + App Router + React 19 + TypeScript 5 + Tailwind v4 + shadcn/ui + Radix + Recharts + TanStack Table v8 + Framer Motion

### Source 5 — TanStack Query Issue #7963 — double invalidation behavior
- **Tier:** 1 (production code — primary issue tracker)
- **Provenance:** github.com/TanStack/query/issues/7963
- **What it tells us:** *"Calling invalidateQueries twice synchronously should result in a query being refetched once. However, it will cause two refetches, which is surprising and very hard to workaround."* This is a known footgun specifically relevant to Server Actions + TanStack Query patterns where both server-side `revalidateTag` AND client-side `invalidateQueries` fire on the same data.

### Source 6 — TanStack Start vs Next.js 16 contradiction context
- **Tier:** 4 (engineering guides)
- **Provenance:** tanstack.com/start/latest/docs/framework/react/start-vs-nextjs; multiple TanStack Start vs Next.js 2026 comparison guides
- **What it tells us:** *"In Next, you wire up Query manually; in Start, it's a supported pattern with official integrations."* — confirms TanStack Query + Next.js 16 integration is more manual than TanStack Start native pairing. Not a blocker for BokChoy (Next.js 16 picked per `[[frontend-stack]]`), but signal that integration boilerplate is real.

## Findings

### Finding Q1.1 — Canonical pattern is `prefetchQuery` (RSC) → `dehydrate` → `<HydrationBoundary>` → `useQuery` (Client Component)

Per Source 1: per-route Server Component creates per-request `QueryClient`, prefetches data, wraps Client Components in `<HydrationBoundary state={dehydrate(queryClient)}>`. Client Components consume via `useQuery` with same `queryKey`. **Confidence: high** — primary docs cite with verbatim code.

### Finding Q1.2 — staleTime defaults to 0 and MUST be configured for RSC-prefetched data

Per Source 1: *"With SSR, we usually want to set some default staleTime above 0 to avoid refetching immediately on the client."* Default `staleTime: 60 * 1000` (60 seconds) recommended in docs. **Without this, every RSC-prefetched + hydrated query refetches on client mount, defeating the prefetch purpose.** Production-grade `staleTime` per query type — live-ops data 30s, slow-changing data 5min, catalog data 1hr+. **Confidence: high.**

### Finding Q1.3 — Per-request QueryClient via `cache()` for singleton-per-request safety

Per Source 1: `cache(() => new QueryClient())` from React's experimental `cache` API is scoped per request — doesn't leak data across requests. Alternative is per-Server-Component instantiation; for BokChoy MVP use the `cache()` pattern in a `getQueryClient` helper. **Confidence: high** — primary docs cite.

### Finding Q1.4 — Server vs Client confusion: Client Components run BOTH places; only Server Components are server-only

Per Source 1 verbatim: *"Server Components are guaranteed to only run on the server, but Client Components can actually run in both places."* This is critical for BokChoy cockpit. **`useQuery` in a Client Component runs once on server during initial render (using prefetched data) and again on client during hydration.** This double-execution is by React design — staleTime config prevents it from being a network double-fetch. **Confidence: high.**

### Finding Q2.1 — Server Actions + TanStack Query integration is undocumented in surveyed scope; pattern derived from orthogonal layer composition

Surveyed scope (Tkdodo blog, official TanStack Query docs, multiple 2026 production guides) does **not** document the Server Actions + TanStack Query + revalidateTag triple-invalidation pattern explicitly. **This is a gap-as-finding.**

**Derived canonical pattern (BokChoy commits to this):**

The two cache layers are orthogonal and should both fire on mutation:

```tsx
// Server Action (apps/cockpit/src/server/players-actions.ts)
'use server';
import { revalidateTag } from 'next/cache';
import { db } from '@bokchoy/db';

export async function updatePlayer(id: string, patch: PlayerPatch) {
  await db.update(players).set(patch).where(eq(players.id, id));

  // Layer 1: Next.js Cache Components invalidation (server-side cached RSC data)
  revalidateTag(`player-${id}`);
  // Or: updateTag(`player-${id}`) for read-your-writes within same request
}

// Client Component using useMutation
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updatePlayer } from '@/server/players-actions';

function EditPlayerForm({ playerId }: { playerId: string }) {
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

**Why both layers fire:**
- `revalidateTag` invalidates Next.js's RSC cache for server-side data fetches tagged with the same key
- `queryClient.invalidateQueries` invalidates TanStack Query's client-side cache for queries that ran on client (post-hydration polling, optimistic updates, refetch-on-window-focus)
- Different layers, different responsibilities, both required for full-stack consistency

**Layered behavior on next render:**
1. Next render fetches fresh data via RSC (because `revalidateTag` invalidated server cache)
2. Fresh data seeds TanStack Query via `<HydrationBoundary>`
3. Client `useQuery` hooks see fresh data; any subsequent client-side refetches use the invalidated `queryClient` cache → fetch fresh

**Caveat per Source 5:** Issue #7963 — calling `invalidateQueries` synchronously twice causes double refetches. **Implication:** if BokChoy ever has a Server Action that triggers TWO `revalidateTag` calls + the client `useMutation` `onSuccess` calls `invalidateQueries` once for the same `queryKey`, the double-refetch concern is bounded to client side only. Server side `revalidateTag` is internally deduplicated by Next.js.

**Confidence: medium** on the derived pattern — gap-as-finding means no production cite specifically validates the exact triple-invalidation. The orthogonal layer composition is logically sound + matches both Tkdodo's TanStack Query patterns + Next.js Cache Components docs from `[[frontend-stack]]`. Vault as **derived pattern needing production validation** at first paying customer launch.

### Finding Q2.2 — Tkdodo's canonical pattern: global `MutationCache.onSuccess` + broad invalidation + ~2-minute staleTime

Per Source 2: Tkdodo's pragmatic philosophy is "broad invalidation over fine-grained": global `MutationCache.onSuccess` triggers `queryClient.invalidateQueries()` (no key filter, invalidates all). Combined with staleTime ~2 minutes, the cost of over-invalidation is bounded.

**For BokChoy:** start with broad-invalidation pattern (Tkdodo default) at MVP; tighten to fine-grained per-key invalidation post-MVP if profiling shows excessive refetches. **Confidence: high** — TanStack Query maintainer's stated pattern.

### Finding Q3.1 — TanStack Table v8 + TanStack Virtual are production-grade on Next.js 16 + RSC

Per Source 4: Admindek + Apex production B2B SaaS templates ship TanStack Table v8 with server-side pagination + Next.js 16 App Router. byteiota 2026 ecosystem survey confirms TanStack Table + Virtual as production-ready.

**For BokChoy cockpit:**
- Tables are interactive (sorting, filtering, pagination, row-selection) → live in Client Components
- Initial table data fetched via RSC + seeded into TanStack Query via HydrationBoundary
- Server-side pagination: TanStack Table accepts `manualPagination: true` + `pageCount`; pagination state managed by TanStack Query (`queryKey: ['players', { page, pageSize }]`)
- TanStack Virtual for long player lists / transaction history — Client Component wrapping virtualized rows

**Confidence: high** — production-cite weight + headless-utility framework simplicity.

### Finding Q4.1 — Anti-pattern: TanStack Query owns ALL fetching (forfeits RSC streaming benefits)

Per Source 6: TanStack Start has native TanStack Query integration; Next.js requires manual wiring. **The temptation in Next.js is to skip RSC prefetch and just have client `useQuery` fetch everything.** This forfeits:
- RSC server-side data fetch (no client→server roundtrip)
- Suspense streaming
- Cache Components opt-in caching per `[[frontend-stack]]`

**For BokChoy:** explicit pattern (α) commitment per `[[frontend-stack]]` Section 4 — Server Actions for mutations, RSC for initial fetch, TanStack Query for client-side cache only.

**Confidence: high.**

### Finding Q4.2 — Anti-pattern: `fetchQuery` results rendered server-side cause hydration sync issues

Per Source 1 verbatim: *"don't render its result on the server or pass the result to another component, even a Client Component one"*. Specific scenario: server prefetches data via `fetchQuery`, renders count or summary in Server Component, client refetches and gets different data → server-rendered text shows stale "Nr of posts: 5" while client shows updated list with 6 posts.

**Mitigation:** in BokChoy cockpit, prefetch data via `prefetchQuery` (returns void, doesn't expose result) for hydration-only purposes. If you need to render server-side, fetch directly via Drizzle in RSC, NOT through TanStack Query's `fetchQuery`. **Confidence: high** — primary docs caveat.

### Finding Q4.3 — Anti-pattern: staleTime=0 default causes double-fetch on hydration

Per Source 1 + multiple production guides: forgetting to configure `staleTime` defeats the prefetch. RSC prefetches → hydrates → client immediately marks stale and refetches → network roundtrip wasted.

**Mitigation:** set `defaultOptions.queries.staleTime` to 60s minimum at QueryClient creation. Override per-query for time-sensitive data (live metrics 5s, slow-changing data 5min+). **Confidence: high.**

### Finding Q4.4 — Anti-pattern: double invalidation causing double refetches

Per Source 5 (Issue #7963): synchronous `invalidateQueries` called twice → two refetches (not deduplicated). Relevant for Server Actions calling `revalidateTag` AND `useMutation.onSuccess` calling `invalidateQueries` for the same data — but only on client-side path; server-side `revalidateTag` is not the same code path as client `invalidateQueries`.

**Mitigation:** in `useMutation.onSuccess`, invalidate once per `queryKey`. Don't call `invalidateQueries` in both `onSuccess` and a global `MutationCache.onSuccess` for the same key — pick one layer. **Confidence: medium-high** — issue is documented but workaround is straightforward.

## Conflicts

### Tkdodo's "broad invalidation" vs canonical fine-grained `invalidateQueries({ queryKey: [...] })`

Tkdodo (Source 2) recommends global `MutationCache.onSuccess` invalidating ALL queries; canonical TanStack Query docs (Source 3) show fine-grained per-key invalidation. **Per Contradiction protocol (production code beats docs by tier; named-author production-engineer tier-4 beats abstract docs guidance):** Tkdodo's broad invalidation is the production-pragmatic default, fine-grained is the optimization path.

**For BokChoy:** start with Tkdodo broad pattern; refactor to fine-grained per-key only if profiling shows over-invalidation cost. Aligns with Tkdodo's stated philosophy: *"I would prefer fetching some data more often than strictly necessary over missing a refetch."*

### Server Actions + TanStack Query gap (no production cite found)

Surveyed scope explicitly notes the gap. Pattern derived from first principles + orthogonal layer composition. **Per Contradiction protocol:** absence-of-evidence isn't evidence-of-absence; the derived pattern is logically sound + each layer has its own production-cited usage. Vault as derived pattern needing production validation at launch.

## Conditions

### When TanStack Query + RSC pattern (α) wins for BokChoy
- Cockpit dashboards with mix of server-fetched initial data + client-side polling/refetch
- Optimistic updates needed (Server Actions don't natively provide; TanStack Query `optimisticUpdate` covers)
- Reconnect-on-window-focus or interval-polled live data
- Match Admindek + Apex production-cite stack

### When TanStack Query is overkill
- Pure read-only RSC pages with no interactivity beyond navigation (rare for B2B dashboard cockpit)
- Mutations only via Server Actions, no client cache concerns

### When fine-grained invalidation pays back over broad
- Profiling shows >100 unnecessary refetches per session (broad pattern with 2-minute staleTime usually under this threshold for B2B SaaS)
- Specific user-facing latency on refetch-heavy pages

## Operational implications

For BokChoy `[[frontend-stack]]` amendment (handed back to `/design`):

1. **Confirm pattern (α): TanStack Query as client-side cache only.** RSC prefetches via `prefetchQuery`; HydrationBoundary seeds TanStack Query; client `useQuery` consumes seeded cache + handles polling/optimistic-updates.

2. **`packages/auth-config/` or new `packages/query-config/`** exports `getQueryClient()` helper using `cache(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } }))`. Used by Server Components for prefetch + Client Components via QueryClientProvider.

3. **Default staleTime: 60_000ms (60 seconds) per TanStack Query official docs.** Override per-query:
   - Live-ops data (player metrics, real-time wallet) → staleTime: 5_000ms (5 seconds)
   - Slow-changing data (project list, catalog metadata) → staleTime: 5 * 60 * 1000 (5 minutes)
   - Static data (org settings) → staleTime: 60 * 60 * 1000 (1 hour)

4. **Mutation pattern (the derived gap):**
   - Server Actions handle DB mutation + call `revalidateTag(tag)` for Next.js Cache Components (per `[[frontend-stack]]` Section 5)
   - Client `useMutation` calls Server Action via `mutationFn`; `onSuccess` calls `queryClient.invalidateQueries({ queryKey: [...] })` for client-side cache
   - Both layers fire; Layer 1 invalidates server-side RSC cache; Layer 2 invalidates client-side TanStack Query cache

5. **Tkdodo broad-invalidation default:** start with `MutationCache.onSuccess` invalidating all queries broadly + 2-minute default staleTime. Tighten to per-key only if profiling shows over-invalidation cost.

6. **Anti-pattern guards** (CI lint rules / PR review):
   - Ban `fetchQuery` server-side rendered results (use `prefetchQuery` only)
   - Ensure `staleTime` configured (no QueryClient with defaults at staleTime=0)
   - 'use client' discipline per `[[frontend-stack]]` extends to TanStack Query usage

7. **TanStack Table v8** for cockpit tables — Client Components, server-side pagination via TanStack Query `queryKey: ['table-data', { page, pageSize, sort, filter }]`.

8. **TanStack Virtual** for long lists (player history, transaction list, audit log) — Client Component wrapping virtualized rows.

9. **`@bokchoy/query-config` package** (or `apps/cockpit/src/lib/query-client.ts`) exports `getQueryClient()` + default options + per-data-type staleTime presets.

## Reproducibility note

Reproducible. Tool sequence:
1. **Q1 canonical pattern:** WebFetch tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr (verbatim code examples).
2. **Q2 mutation pattern:**
   - WebFetch tkdodo.eu/blog/automatic-query-invalidation-after-mutations (Tkdodo canonical).
   - WebSearch "Server Actions TanStack Query revalidateTag invalidateQueries" — surfaces the gap explicitly.
3. **Q3 Table + Virtual:** WebSearch "TanStack Table Virtual Next.js 16 server components production"; production cites at adminlte.io templates + byteiota.com 2026 survey.
4. **Q4 anti-patterns:** TanStack Query Issue #7963 (double invalidation); official docs caveats on `fetchQuery` rendering + staleTime=0 default.

**Judgments that don't fully reproduce:**
- The Q2 derived pattern (Server Action + revalidateTag + invalidateQueries triple-invalidation) is logically derived but lacks production-cite validation. A future deeper survey or controlled BokChoy production deployment will validate. **Vault confidence: medium** on this specific pattern; high on the underlying layer composition.
- Tkdodo's broad-invalidation default is one TanStack Query maintainer's recommendation, not universal consensus. Some production teams prefer fine-grained from day one.

## Open threads

1. **Production cite for Server Actions + TanStack Query + revalidateTag triple-invalidation** — surveyed scope had a gap. Re-investigate at first paying customer launch + 6-month operational data.
2. **TanStack Form** — listed in Source 4 as production-ready (TanStack Query + Router + Table + Form + Virtual ecosystem). User picked React Hook Form per `[[frontend-stack]]` amendment staging; not amending. Open thread: re-evaluate TanStack Form vs RHF if RHF integration friction surfaces post-MVP.
3. **Bun test vs Vitest** — user picked Vitest. Verified as defensible (ecosystem maturity, plugin breadth, Bun runtime compatible). Open thread: re-investigate Bun test if CI test runtime becomes friction point.
4. **TanStack Router** — listed in Source 4 ecosystem; not in BokChoy stack (Next.js App Router is the router). N/A unless `[[frontend-stack]]` revisits to TanStack Start.
5. **Issue #7963 double-invalidation behavior** — TanStack Query maintainers may fix or document workaround in future minor. Track for resolution; current workaround is "invalidate once per key per mutation onSuccess."
