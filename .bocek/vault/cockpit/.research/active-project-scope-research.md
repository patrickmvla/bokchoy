---
type: research
features: [cockpit]
related: ["[[cockpit/cockpit-shape]]", "[[cockpit/admin-catalog-endpoints-contract]]", "[[cockpit/file-structure]]", "[[architecture/admin-auth-surface]]"]
created: 2026-05-29
confidence: high
provisional: false
---

# How do production B2B dashboards store + resolve the active workspace/project scope, and what are the default/stale/switch resolution rules?

## Question

Slice 8.5 chose full-IA (top-level Catalog section + header active-project switcher per `[[cockpit/cockpit-shape]]` I1). The keystone gap: how does a project-scoped cockpit page resolve which `projectId` to operate on? Design's inline lean was a **cookie**; this research tests that against production, since several dashboards appear to scope by URL path. Two parts: (a) storage mechanism (URL path / query / server session / cookie / client storage); (b) resolution rules — first-load default, stale/deleted scope, org-switch.

## Triangulation

- **Production reference:** ✓ Supabase Studio (tier-1, open-source, Next.js — BokChoy's exact stack) + Vercel dashboard (URL structure, docs-confirmed).
- **Docs reference:** ✓ Vercel docs, Clerk docs, Supabase docs.
- **Contradiction probe:** ✓ Clerk stores active org in the **session token (cookie)**, not the URL — the session-scope counter-pattern. Actively found and resolved below (it's for *org identity*, not *project view-scope*).

## Sources examined

### Supabase Studio (the decisive same-stack cite)
- **Tier:** 1 (production code).
- **Provenance:** `github.com/supabase/supabase`, `apps/studio/pages/project/[ref]/` — confirmed via GitHub API 2026-05-29 (the `[ref]` dynamic segment exists as a Next.js Pages-Router route). Live dashboard URL `supabase.com/dashboard/project/{ref}/...` per `supabase.com/docs` (project-ref "is the string right after .../project/").
- **Author context:** Supabase Studio is the production multi-project management dashboard; Next.js, same framework class as BokChoy cockpit; large-scale B2B dev-tool.
- **What it tells us:** the active project is a **URL path segment** (`/project/[ref]/...`), not a cookie or session value. Every project-scoped section (database, auth, logs, etc.) nests under `/project/[ref]/`. Routing redirects operate on `/project/:ref/...` paths.

### Vercel dashboard
- **Tier:** 2 (official docs + observable).
- **Provenance:** `vercel.com/docs/projects/managing-projects` (observed 2026-05) — dashboard URL is `vercel.com/{team-slug}/{project-name}`. CLI mirrors with `--scope`/`--team` overrides.
- **What it tells us:** both team AND project are **URL path segments** (`/{team}/{project}`). URL-path scoping for the workspace + project, with a header switcher that navigates between scopes.

### Clerk (the contradiction probe)
- **Tier:** 2 (official docs).
- **Provenance:** `clerk.com/docs/guides/sessions/session-tokens` (the `o`/`org_id` claim is in the session-token cookie; "session cookie is a singleton (global) value for the browser"); `clerk.com/docs/references/javascript/clerk/session-methods` (`setActive({organization})`); `clerk.com/docs/guides/organizations/org-slugs-in-urls` (also supports org slug in URL). Observed 2026-05.
- **What it tells us:** active **organization** is stored in the **session token (cookie)**, mutated via `setActive()`. Notable nuance: active org is tracked **per browser tab** in the client, but the cookie is a singleton representing the active tab's org. Clerk *also* offers org-slug-in-URL as an alternative for tenant-scoped flows.

## Findings

### F1 (load-bearing) — Project/workspace view-scope is URL-path in production, not cookie/session
Both production dashboards surveyed put the project/workspace scope **in the URL path**: Supabase `/project/[ref]/...` (tier-1, same stack), Vercel `/{team}/{project}/...`. The scoped sections live *under* that path segment. This is the dominant pattern for "which project/workspace am I managing." Per *Contradiction protocol*, tier-1 production code in BokChoy's exact stack (Supabase) + a second production cite (Vercel) outweigh design's inferred cookie lean. **Cookie-as-source-of-truth for the active project is not production-supported.**

### F2 — Session/cookie scope is used for *organization/account identity*, not project view-scope
Clerk stores active **org** in the session token (cookie). That's an *identity/auth* scope (it drives permissions and the `org_id` claim). BokChoy already mirrors this: `activeOrganizationId` lives on the Better Auth session and `adminGate` reads it (`admin-gate.ts`). So BokChoy's org scope is *already* session-based, consistent with Clerk. The open question was only the **project** sub-scope — and F1 says that's URL-path.

### F3 — Header switcher and URL-path scoping coexist (kills the "URL fights the switcher" objection)
Vercel and Supabase both ship a persistent header workspace/project switcher **and** URL-path scoping at the same time. The switcher is a navigation control: selecting a project `router.push`-es to that project's path. Design's earlier objection ("URL-query fights the sticky header switcher") was wrong — production proves they compose. "Stickiness" comes from the URL persisting per tab + a last-used redirect on the bare entry route, not from a sticky cookie holding the scope.

### F4 — Cookie/localStorage appears as a *last-used redirect hint*, not the scope source-of-truth
The resolution pattern: a bare entry route (`/dashboard`, `/`) redirects to the last-used-or-first project. The "last-used" value is the only thing a cookie/localStorage holds — a hint to pick the post-login default path — while the **URL remains the authoritative active scope**. This reconciles design's cookie instinct: cookie is fine *as a default-redirect hint*, wrong *as the scope itself*.

## Conflicts

**Clerk session-cookie org vs. Supabase/Vercel URL-path project.** Both are production. Resolved by *scope type*, not precedence: **identity/auth scope (org/account) → session token** (Clerk; and BokChoy already does this for org); **view scope (project/workspace) → URL path** (Supabase tier-1 same-stack + Vercel). They are not competing answers to the same question — they answer different scope layers. BokChoy has both layers: org (session, done) + project (the question → URL-path).

## Conditions

- Holds for dashboards with a **two-level scope** (org/account → project/workspace), which is BokChoy's shape. A single-scope app wouldn't need the split.
- URL-path scoping assumes the scope id is safe to expose in the URL. BokChoy project ids are UUIDs already exposed in the SDK-facing `/v1/projects/{projectId}/...` surface and guarded by `adminGate` tenancy — no new exposure.
- Multi-tab: URL-path gives independent per-tab scope natively (each tab's URL is its scope) — strictly better than the cookie's shared-singleton behavior that design flagged as the cookie's main cost. Clerk had to engineer per-tab tracking *on top of* its singleton cookie; URL-path gets it for free.

## Operational implications

For `/design` to resolve the active-project mechanism (research does not decide):

- **The production-grounded answer is URL-path, not cookie.** Flip design's lean. The active project should be a **URL path segment** the project-scoped sections nest under — Supabase shape `app/(app)/project/[projectId]/{catalog,transactions,players,settings}/...`, or equivalently a `[projectId]` segment scoping the authed area. This is compatible with the full-IA + header switcher the human already chose (F3): the sidebar sections live under the project path; the header switcher `router.push`-es between projects.
- **This is NOT the rejected "nest catalog under project detail" option.** That option nested *only catalog* under `projects/[id]` as a sub-view. The URL-path finding is broader: project becomes the **app-wide path scope** for *all* sections (Catalog/Transactions/Players/Settings), Supabase-style — which is the full-IA the human picked, just with the scope in the path instead of a cookie.
- **Org scope stays on the Better Auth session** (already shipped; matches Clerk). No change.
- **Resolution rules** (part b): bare authed entry (`/` or `/projects`) redirects to last-used-or-first project; **last-used stored as a cookie/localStorage hint only** (not the scope); invalid/stale `[projectId]` in path → adminGate 403 / redirect to project picker; org-switch → old project path invalid → redirect to picker. `adminGate` already 403s a project outside the active org, so the path scope is self-validating.
- **Cost vs. the cookie design:** routing changes (a `[projectId]` segment wrapping the authed sections) instead of a cookie + `useActiveProject()` reader. The catalog api functions are unaffected — they already take `projectId`; it now comes from the route param (`useParams()`), exactly like the existing `projects/[id]` pages.

## Reproducibility note

Reproducible: `gh api repos/supabase/supabase/contents/apps/studio/pages/project` returns `[ref]` (the dynamic segment), 2026-05-29. Vercel URL structure observable at any `vercel.com/{team}/{project}` + `vercel.com/docs/projects/managing-projects`. Clerk session-org behavior at `clerk.com/docs/guides/sessions/session-tokens`. The scope-type split (identity→session, view→URL) is a synthesis judgment across the three, not a single quoted source — but each leg is independently cited.

## Open threads

- **Last-used-project redirect hint storage** — cookie vs localStorage vs a `users.last_project_id` column. Low-stakes; design picks. (Cookie is RSC-readable for the post-login redirect; localStorage isn't.)
- **Where the `[projectId]` segment sits** — `app/(app)/project/[projectId]/...` (Supabase shape) vs `app/(app)/[projectId]/...` (Vercel shape, scope at the root of the authed area). A routing-shape sub-decision for design; both are production-cited.
- **Migration of the existing `projects/[id]` detail route** — it already uses a URL `[id]`; reconcile whether project-detail becomes the project-scope root or stays a sibling. Design + implementation detail.
- Linear and Stripe were not fetched (budget); both are commonly URL/scope-switcher based but unverified here — additional cites if design wants more weight, not required for the finding.
