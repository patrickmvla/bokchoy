---
type: decision
features: [cockpit]
related: ["[[cockpit/.research/active-project-scope-research]]", "[[cockpit/cockpit-shape]]", "[[cockpit/file-structure]]", "[[cockpit/admin-catalog-endpoints-contract]]", "[[architecture/catalog-mutation-mvp-shape]]", "[[architecture/admin-auth-surface]]"]
created: 2026-05-29
confidence: high
---

# Active project is a URL path segment (`/project/[projectId]/...`), not a cookie or session field

## Decision

The cockpit's **active project is carried in the URL path** — the project-scoped authed area lives under `app/(app)/project/[projectId]/`, and every project-scoped section (catalog, transactions, players, settings) nests beneath it. `projectId` is read from the route param (`useParams()` client-side / `params` in RSC), exactly like the existing `projects/[id]` detail page.

```
app/(app)/
  projects/page.tsx                         # project LIST / picker (plural; exists)
  project/[projectId]/                       # project-scoped workspace (singular)
    page.tsx                                 # overview (absorbs the old projects/[id] detail)
    catalog/
      currencies/page.tsx
      items/page.tsx
      offers/page.tsx
    transactions/page.tsx                    # slice 8.6
    players/page.tsx                         # slice 8.6
    settings/page.tsx                        # per-project settings
  settings/page.tsx                          # ORG-level settings (sibling, not project-scoped)
```

**Org scope stays on the Better Auth session** (`activeOrganizationId`, read by `adminGate` — already shipped). Two scope layers: org → session (identity/auth), project → URL path (view scope). No cookie or session field holds the active project.

**Header switcher** = a navigation control: selecting a project `router.push`-es to `/project/{newId}/...` (preserving the current section where sensible). This is the I1 "active-project switcher in header" — it composes with URL-path scoping (production does both together).

**Last-used project** = NOT used at MVP per *Amendment 2026-05-29* below (bare entry lands on the picker, no auto-jump). The last-used redirect-hint mechanism (cookie / `users.last_project_id`) is deferred until auto-jump-into-project is wanted. The URL path remains the active-project source of truth.

### Resolution rules

**Amendment 2026-05-29 (human-ratified, implemented).** Two rules relaxed to match shipped behavior + the Supabase tier-1 cite (which lands on the project *picker*, not an auto-jump): bare entry → **picker-landing** (not auto-jump-into-project); invalid project → **graceful error** (not redirect-to-picker). Rationale: auto-jump would change the shipped sign-in flow and is *less* aligned with the Supabase cite than picker-landing, and needs last-used machinery (RSC can't set cookies); graceful-error (the shipped `ProjectDetailView` "Failed to load / Back to projects") is as good as a redirect and needs no new RSC-fetch. The bullets below are the amended (current) rules.

- **Bare authed entry** (post-sign-in, or apex `/` for an authed user) → land on the **`/projects` picker** (the project list; sign-in/sign-up already `callbackURL: '/projects'`). Bare `/project` with no id → redirect to `/projects` (shipped `app/(app)/project/page.tsx`). No auto-jump into a project; no last-used machinery at MVP.
- **Stale / invalid / cross-org `projectId` in the path** → `adminGate` returns `BC403` (it validates project∈active-org, `admin-gate.ts:109-132`); the cockpit surfaces a **graceful error** ("Failed to load project / Back to projects" via the shipped `ProjectDetailView`), NOT an auto-redirect. The path scope is self-validating; no separate staleness check.
- **Org switch** (operator changes `activeOrganizationId`) → the current project path-id now belongs to the old org → next request 403s → same graceful error with a path back to the picker. Self-healing; no explicit clear-on-org-switch logic.

## Reasoning

Grounded in `[[cockpit/.research/active-project-scope-research]]` (confidence: high):

- **F1 (production-cited, tier-1 same-stack):** project/workspace view-scope is URL-path in production — Supabase Studio `apps/studio/pages/project/[ref]` (open-source Next.js, BokChoy's exact stack, gh-api-verified 2026-05-29) + Vercel `/{team}/{project}` (docs). Cookie-as-scope-source is not production-supported. (production-cited × 2; confidence: high.)
- **F2:** session/cookie scope is for *org/account identity* (Clerk `org_id` in the session token) — BokChoy already does org that way. Project is *view* scope, not an auth boundary (`adminGate` independently guards project∈org), so it doesn't belong on the session. (production-cited: Clerk docs; confidence: high.)
- **F3:** header switcher + URL-path coexist (Vercel + Supabase both) — this satisfies I1's "switcher in header" without a cookie. (production-cited; confidence: high.)
- The earlier design lean (cookie-as-scope) was **overturned by F1** — recorded as a rejected alternative below.

## Engineering substance applied

- **Consistency:** two scope layers, each at its right home — org on the Better Auth session (matches Clerk + already shipped), project in the URL (matches Supabase/Vercel). `adminGate` is the single tenancy guard for both.
- **Failure semantics:** path scope is self-validating via `adminGate` `BC403` (project∉org → 403 → redirect to picker). Covers stale, deleted, and org-switch uniformly — no bespoke invalidation code.
- **Concurrency / multi-tab:** URL-path gives independent per-tab scope for free (each tab's URL is its scope). Strictly better than the cookie's shared-singleton behavior (Clerk had to engineer per-tab tracking *on top of* its cookie; per the research).
- **Observability:** project-scoped routes map cleanly to the `/v1/projects/{projectId}/...` backend spans — `projectId` flows URL → api call → backend span attribute.
- **Security:** no new trust surface. `projectId` was already exposed in the SDK-facing `/v1/projects/{projectId}/...` URLs and guarded by `adminGate`. A tampered path id → 403, not a breach.

## Production-grade gates

- **Idiomatic** — Next.js App Router dynamic segment (`[projectId]`) wrapping a route group's scoped sections; `useParams()` / RSC `params`. Matches Supabase Studio (same framework) exactly. *(production-cited; confidence: high.)*
- **Industry-standard** — URL-path workspace/project scoping is the dominant B2B-dashboard pattern (Supabase, Vercel; Linear/Stripe similar per common observation). *(production-cited × 2 verified; confidence: high.)*
- **First-class** — App Router native routing + the existing Better Auth session for org. No cookie-reader hook, no custom state store, no session-mutation endpoint. *(first-class-cited; confidence: high.)*

## Rejected alternatives

### Cookie as the active-project source of truth (the prior design lean)
**What:** `bokchoy_active_project` cookie holds the scope; hooks read it to build URLs; RSC reads it for the shell.
**Wins when:** there is no natural place to carry scope in the URL, or scope must be invisible in the URL.
**Why not here:** `[[cockpit/.research/active-project-scope-research]]` F1 — not production-supported for project view-scope; shared-singleton-per-browser hurts multi-tab; and it duplicates a guard `adminGate` already provides. Cookie survives only as an optional *last-used redirect hint*.

### Better Auth session field `activeProjectId` (Clerk-style)
**What:** add `activeProjectId` to the session, mutated by a setter endpoint.
**Wins when:** the scope is an *auth/identity* boundary that must be server-authoritative (Clerk's `org_id`).
**Why not here:** project is *view* scope, not auth — `adminGate` already enforces project∈org. Putting it on the session is the wrong layer + heaviest (additionalFields config, setter endpoint, session-refresh-on-switch). Org already occupies that layer correctly.

### Vercel bare-root shape `app/(app)/[projectId]/...`
**What:** projectId bare at the authed root.
**Wins when:** there's a second URL scope level above it (Vercel has `/{team}/{project}` — team namespaces the project).
**Why not here:** BokChoy's org is on the session, so a bare `[projectId]` root sits alone — every org-level authed route must reserve its name as a static sibling. Works via Next static-over-dynamic precedence but is fragile and less clear than the `project/` prefix. Supabase shape wins on clarity at no cost.

### Nest catalog only under `projects/[id]` (the interim option rejected earlier)
**What:** catalog as a sub-view of the existing project-detail route, catalog-specific.
**Why not here:** superseded — this decision makes project the *app-wide* path scope for all sections (Supabase shape), which is the full-IA the human chose, not a catalog-only nest.

## Failure mode

- **Section-preserving switch is imperfect.** The header switcher `router.push`-ing to `/project/{newId}/{currentSection}` assumes the section exists for the new project (it always does — sections are static). No real failure; a deep sub-path with an id (e.g. `/project/{id}/catalog/offers/{offerId}`) on switch should drop to the section root (`/project/{newId}/catalog/offers`), not carry the old project's offerId. Switcher must truncate to the section root. Probability: certain if not handled; Cost: low (a 404 or 403 on the stale offerId otherwise).
- **Post-login redirect flash.** If last-used is client-only (localStorage), the bare-entry redirect can't run in RSC → brief flash before client redirect. Mitigated by a cookie/DB hint (RSC-readable). Implementation picks.

## Mitigations

- **Switcher truncates to section root** on project change (push `/project/{newId}/{section}`, not the full sub-path). Names this as a switcher-component requirement.
- **Last-used as RSC-readable hint** (cookie or `users.last_project_id`) if the post-login flash matters; otherwise localStorage is fine at MVP.

## Idiom citations

- `idioms/typescript.md` (Let the types flow end-to-end) — `projectId` from `useParams()` flows into the typed catalog api functions (which already take `projectId: string`); no new type plumbing.

## Revisit when

- **A second URL scope level is wanted** (e.g. org/team slug in the URL like Vercel) → revisit the bare-vs-prefixed shape; the `project/` prefix can become `/{orgSlug}/project/{projectId}` additively.
- **Deep-link sharing of project sub-views becomes a named requirement** → already supported by URL-path; no change, just confirms the choice.
- **Multi-project bulk views** (cross-project dashboards) emerge → those live at the authed root (org-scoped), outside `project/[projectId]/`; revisit IA then.

## Cascade obligations (Slice 8.5 implementation)

1. **`[[cockpit/cockpit-shape]]` (I1) amendment** — clarify that project-scoped sections nest under `project/[projectId]/` (this decision). **DONE 2026-05-29.**
2. **`app/(app)/project/[projectId]/layout.tsx`** — project-scoped layout: reads `projectId` from `params`, renders the sidebar (sections). **DONE 2026-05-29.** Switcher lives in the global `AppHeader` (Option 1, one-bar), not the layout. Per *Amendment 2026-05-29*: no layout-level validate-redirect — invalid projectId surfaces a graceful error via `ProjectDetailView` (404/403), not a picker redirect.
3. **Sidebar shell** (`components/layouts/project-sidebar.tsx`) — project-scoped section links. **DONE 2026-05-29.** Forward-looking per I1: Overview enabled; Catalog/Transactions/Players/Settings render as disabled "soon" placeholders until their routes land (`enabled` flag per section). (Sidebar is project-scoped, not the org-level Projects entry.)
4. **Header active-project switcher** — `modules/projects/components/project-switcher.tsx`, wired into `AppHeader`. **DONE 2026-05-29.** Reuses `useProjects`, `router.push`-es to `/project/{newId}/{section}` truncating to section root, renders null off-`/project/*`. Needed `bunx --bun shadcn@latest add dropdown-menu`.
5. **Reconcile `app/(app)/projects/[id]/page.tsx`** → `app/(app)/project/[projectId]/page.tsx` (overview). **DONE 2026-05-29** (git mv, param `id`→`projectId`; `projects-list` link updated; `projects/` stays list/picker; `GET /v1/projects/{id}` consumer unchanged). Deferred polish: the overview's breadcrumb is now mildly redundant with the sidebar — cosmetic, not addressed.
6. **Bare-entry → `/projects` picker.** **DONE 2026-05-29** per *Amendment 2026-05-29*: sign-in already lands on `/projects`; bare `/project` redirects to `/projects` (`app/(app)/project/page.tsx`). No auto-jump-into-project, no last-used storage at MVP (deferred).
7. **THEN the 3 catalog modules** per `[[architecture/catalog-mutation-mvp-shape]]` cascade #5, mounted at `project/[projectId]/catalog/{currencies,items,offers}` — `projectId` from `useParams()`, api functions unchanged (they already take `projectId`).
