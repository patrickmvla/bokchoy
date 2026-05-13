---
type: decision
features: [cockpit, architecture]
related: ["[[cockpit-folder-structure-research]]", "[[cockpit-shape]]", "[[cockpit-stack-integration-research]]", "[[backend-service-shape]]", "[[first-run-journey]]", "[[auth-surface-mount]]", "[[admin-list-endpoints-contract]]"]
created: 2026-05-11
confidence: high
---

# Cockpit folder structure: Cal.com-style vertical-slice modules at `apps/cockpit/modules/`

## Decision

(P-CAL) — Cal.com production-cite-aligned vertical-slice module pattern, adapted with internal-consistency-with-backend naming convention. No `*-view.tsx` page-view abstraction at MVP (skipped for LOC efficiency; revisit when testability/reuse demands).

### Top-level layout

```
apps/cockpit/
├── app/                              # ROUTES ONLY — thin page.tsx, imports compose from modules/
│   ├── layout.tsx                    # root: html/body/font, TanStack QueryClient provider, Better Auth client provider
│   ├── globals.css                   # Tailwind v4 entry
│   ├── error.tsx                     # global error boundary
│   ├── not-found.tsx                 # 404 page
│   ├── (marketing)/                  # route group — public, force-static
│   │   ├── layout.tsx                # imports MarketingShell from components/layouts
│   │   └── page.tsx                  # bokchoy.com/ — composes modules/marketing components
│   ├── (auth)/                       # route group — minimal layout
│   │   ├── layout.tsx                # imports AuthShell
│   │   └── sign-in/page.tsx          # composes modules/auth components
│   └── (app)/                        # route group — authenticated, sidebar + header
│       ├── layout.tsx                # imports AppShell
│       ├── projects/
│       │   ├── page.tsx              # composes modules/projects ProjectsList
│       │   ├── loading.tsx           # route-segment streaming fallback per `[[cockpit-stack-integration-research]]` F5
│       │   ├── new/page.tsx          # composes modules/projects CreateProjectForm
│       │   └── [projectId]/
│       │       ├── page.tsx          # composes modules/projects ProjectDetail
│       │       └── loading.tsx
│       └── settings/page.tsx
│
├── modules/                          # FEATURE MODULES — vertical slices per Cal.com pattern
│   ├── auth/
│   │   ├── components/
│   │   │   ├── sign-in-buttons.tsx   # Client, OAuth buttons per `[[first-run-journey]]` step 2
│   │   │   └── sign-in-form.tsx      # Client, email/password fallback, RHF + Zod
│   │   ├── api/
│   │   │   └── auth-client.ts        # Better Auth React client per `[[auth-surface-mount]]` (CL)
│   │   └── lib/
│   │       └── session.ts            # RSC session-read via React.cache(fetch '/api/auth/get-session')
│   │
│   ├── projects/
│   │   ├── components/
│   │   │   ├── projects-list.tsx     # RSC, fetches via api/list-projects
│   │   │   ├── projects-list-skeleton.tsx
│   │   │   ├── create-project-form.tsx       # Client, RHF + Zod, (E2) two-POST flow
│   │   │   ├── project-detail.tsx    # RSC
│   │   │   ├── api-key-modal.tsx     # Client, K1 visible-once display + copy
│   │   │   └── verify-key-view.tsx   # Client, TanStack Query polling lastUsedAt per (T2)
│   │   ├── api/                      # typed fetchers for /v1/* endpoints per `[[admin-list-endpoints-contract]]`
│   │   │   ├── list-projects.ts
│   │   │   ├── get-project.ts
│   │   │   ├── create-project.ts
│   │   │   ├── create-api-key.ts     # with Idempotency-Key header per (E2)
│   │   │   └── revoke-api-key.ts
│   │   ├── hooks/                    # TanStack Query hooks consuming api/
│   │   │   ├── use-projects.ts
│   │   │   ├── use-project.ts        # used by verify-key-view polling
│   │   │   ├── use-create-project.ts
│   │   │   ├── use-create-api-key.ts
│   │   │   └── use-revoke-api-key.ts
│   │   └── types.ts                  # feature-specific types; re-exports from @bokchoy/shared-types
│   │
│   ├── organizations/
│   │   ├── api/get-org-me.ts         # GET /v1/orgs/me per `[[admin-list-endpoints-contract]]`
│   │   └── hooks/use-org-me.ts
│   │
│   └── marketing/
│       └── components/
│           ├── hero.tsx              # landing hero section
│           ├── features-grid.tsx     # feature pillars
│           └── cta.tsx               # sign-up CTA → /sign-in
│
├── components/                       # SHARED CROSS-FEATURE UI
│   ├── ui/                           # shadcn primitives (button, input, form, dialog, label, sidebar, ...)
│   └── layouts/                      # cross-feature shells (app-shell, sidebar, header, marketing-shell, auth-shell)
│
├── lib/                              # CROSS-FEATURE UTILITIES
│   ├── query-client.ts               # TanStack QueryClient per-request via React.cache per `[[cockpit-stack-integration-research]]` F5.6
│   └── utils.ts                      # cn() helper, generic utilities
│
├── public/
├── package.json                      # Next.js 16 + React 19 + Better Auth + @bokchoy/* + TanStack Query + Tailwind v4 + Radix + RHF + Zod
├── next.config.ts                    # env-driven async rewrites per `[[auth-surface-mount]]` (V3)
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

### Conventions enforced via PR review

- **No barrels** per `[[cockpit-stack-integration-research]]` Amendment F6.15 (Vercel `bundle-barrel-imports`). NO `modules/projects/index.ts`, NO `components/ui/index.ts`. Direct file imports: `import { ProjectsList } from '@/modules/projects/components/projects-list'`.
- **`'use client'` leaf placement** per F6.11. Outer layouts (root, route-group layouts) are Server Components. Client interactivity at leaf components (forms, modals, polling views).
- **`React.cache` for cross-component memoization** within a single request per F5.6. `lib/query-client.ts` factory is `React.cache(() => new QueryClient(...))`.
- **No shared module state for request data on server** per Vercel `server-no-shared-module-state`. Session reads via `React.cache(getSession)` in `modules/auth/lib/session.ts`; NEVER cached in module-level mutable state.
- **shadcn imports by direct path**, NOT barrel — per F6.15 + `[[cockpit-stack-integration-research]]` F10.
- **App-level `app/.../page.tsx` is THIN** — only imports + composition of module components. No business logic, no data-fetching beyond what RSC awaits naturally, no `'use client'` (route boundaries are server-rendered).

### What gets dropped at MVP

- **No `*-view.tsx` page-view abstraction at module root.** Cal.com pattern; not adopted. App-level `page.tsx` directly composes module components. Saves one layer of indirection. **Revisit when:** testability demands (need to mock `app/.../page.tsx` for unit tests) OR same view reused across multiple routes.
- **No workspace-level `packages/cockpit-features/` extraction.** Cal.com + Documenso extract because they have multiple Next.js apps; BokChoy has one cockpit app at MVP. **Revisit when:** marketing splits per `[[cockpit-shape]]` revisit-when OR second admin app emerges.

## Reasoning

### Why (P-CAL) Cal.com vertical-slice modules

Three converging defenses per *Operating at your ceiling* position derivation:

1. **Internal consistency with backend per `[[backend-service-shape]]` §2.** Backend uses `modules/{feature}/` naming convention: "Module boundaries align 1-to-1 with vault feature boundaries: `auth/`, `players/`, `wallet/`, ..." Cockpit using same `modules/{feature}/` naming creates shared vocabulary across the codebase. Developer moving between `apps/backend/src/wallet/` and `apps/cockpit/modules/auth/` sees the same convention. *(production-cited via internal precedent + Cal.com external; confidence: high.)*

2. **Production-cited at the largest scale surveyed.** Cal.com ships 38 modules at 250k+ LOC per `[[frontend-stack-research]]` Source 4 cite-class. Direct proof that vertical-slice scales to dashboard-v1-and-beyond range. (P-LAYER) cites (Documenso + Trigger.dev) ship at smaller LOC, untested at Cal.com's complexity. Per *Author context* weighting: scale-of-production matters; Cal.com's complexity test is closer to BokChoy's long-term forecast than the smaller cites. *(production-cited / high.)*

3. **Long-term migration cost asymmetry favors (P-CAL).** (P-LAYER) ships fastest at MVP (~3-5 features at slice 8.3-8.6) but pays migration cost at ~10 features. Per `[[mvp-feature-sequence]]`: months 4-5 cockpit-core brings A/B testing + segment manager + offer builder + live-ops calendar = 4 features; month 6 brings battle pass + quests + mailbox = 3 features. Cockpit at month 6 = ~10 features. (P-LAYER) at that scale = directory bloat + migration window. (P-CAL) is the destination; shipping there directly avoids the refactor. *(forecast-derived; confidence: medium-high — assumes `[[mvp-feature-sequence]]` holds, rated medium-confidence.)*

### Why skip `*-view.tsx` page-view abstraction

Cal.com (1/4 production cite) uses it. Dub.co (1/4) doesn't. Documenso + Trigger.dev use Remix routing — different paradigm. Not convergent.

At BokChoy MVP scope (3-5 features), `*-view.tsx` adds one layer of indirection between `app/.../page.tsx` and module components without testability or reuse demand. App-level `page.tsx` directly composes module components. Lower-LOC pattern. Revisit when concrete testability/reuse pressure manifests.

### Engineering substance applied

- **Consistency:** vocabulary matches backend (`modules/{feature}/`). Reduces cross-app context-switching cost. Feature names align: backend `apps/backend/src/auth/` ↔ cockpit `apps/cockpit/modules/auth/`; backend `wallet/` ↔ cockpit's wallet-related concerns (slice 8.5+ when catalog/transactions ship will likely add `modules/catalog/`, `modules/wallet/` mirroring backend).
- **Failure semantics:** N/A at folder-structure level. Structural decision; runtime behavior unaffected.
- **Concurrency:** N/A. Structural decision.
- **Observability:** module boundaries align with OTel span boundaries — `module/projects/api/create-project.ts` calls map to `POST /v1/projects` backend handler which emits its own span. Easy to attribute cockpit-side telemetry per module.
- **Storage:** N/A.
- **Security:** per-module `lib/session.ts` or `api/auth-client.ts` colocation keeps auth touchpoints discoverable within `modules/auth/`. Cross-module auth consumption goes through public exports (typed imports, no barrels per F6.15).

### Production-grade gates

- **Idiomatic** — Cal.com 250k+ LOC production at the largest scale surveyed; matches BokChoy backend `modules/{feature}/` convention from `[[backend-service-shape]]` §2. *(production-cited internal + external; confidence: high.)*
- **Industry-standard** — Cal.com (1/4 production cite at the survey's largest scale) + internal BokChoy backend precedent (production-cited internal). ≥2 named systems cleared on combined internal-and-external. *(production-cited × 2 minimum; confidence: medium-high — would be higher with a second large-scale external Next.js production cite.)*
- **First-class** — Next.js App Router native route groups (`(marketing)`, `(auth)`, `(app)`), Next.js App Router page/layout/loading conventions, shadcn CLI default (`components/ui/`), `React.cache` per request, Hono middleware composition on backend side. Zero workarounds. *(first-class-cited; confidence: high.)*

## Rejected alternatives

### Alternative A — (P-LAYER) Documenso/Trigger.dev layer-based

**What:** `apps/cockpit/{components,hooks,services,api,utils}/` flat layered organization. Routes at `app/`; everything else split by layer (component type / hook type / service type) regardless of feature.

**Wins when:** production-cite-count majority is the dominant weighting axis (2/4 cites ship this) AND solo-dev MVP simplicity outranks long-term scaling forecast AND internal-consistency-with-backend is not load-bearing.

**Why not here:** internal consistency with `[[backend-service-shape]]` §2 backend `modules/{feature}/` is the deciding factor. Migration cost at ~10 features (months 4-5 cockpit-core) is concentrated and high. Production cite count is one axis among five; (P-CAL) wins on internal consistency + long-term scaling.

### Alternative B — (P-DUB) Dub.co horizontal split-by-feature

**What:** `apps/cockpit/ui/{feature}/` for components + `apps/cockpit/lib/{feature}/` for non-UI feature code. Same feature names in both trees.

**Wins when:** data/UI separation per `[[cockpit-stack-integration-research]]` RSC + TanStack Query architecture is the dominant axis AND developer mental-model strongly distinguishes "rendering code" from "business logic" AND import-paths-in-two-trees overhead is acceptable.

**Why not here:** the data/UI separation argument is real but doesn't beat internal-consistency-with-backend. Backend doesn't use this split; cockpit using it creates vocabulary drift. Plus imports for one feature live in two trees — overhead at MVP scope.

### Alternative C — `*-view.tsx` page-view abstraction at module root (sub-decision)

**What:** Each module has `{feature}-{action}-view.tsx` files at its root, composing the smaller `components/` items. App-level `page.tsx` is one line: `import { SignInView } from '@/modules/auth/sign-in-view'; export default SignInView`.

**Wins when:** page-views are tested in isolation OR reused across multiple routes.

**Why not here:** no test infrastructure for cockpit at slice 8.3 (project convention is shell smoke scripts per slice 8.2.1 precedent; in-tree component tests not yet established). No reuse across routes at MVP scope (3-5 features, ≤8 routes). Add when testability/reuse demands; not premature.

### Alternative D — `packages/cockpit-features/` workspace extraction

**What:** Extract features to workspace packages (`packages/auth/`, `packages/projects/`, etc.) for cross-app reuse.

**Wins when:** ≥2 Next.js apps share the feature surface (Cal.com + Documenso both have multiple apps).

**Why not here:** BokChoy MVP has one cockpit Next.js app. Marketing colocated per `[[cockpit-shape]]` marketing amendment 2026-05-11. Workspace extraction is over-engineering. Revisit per `[[cockpit-shape]]` marketing-split or admin-app revisit-when triggers.

## Failure mode

**Primary failure mode: empty modules at MVP.** Modules `auth/`, `organizations/`, `marketing/` have 2-3 files each at slice 8.3 launch. Some module folders have nested empty `components/`, `hooks/`, `api/`, `lib/` subdirectories with 1-2 files. Looks sparse; possible "premature abstraction" pushback at code review.

Likelihood: low impact. Empty subdirectories cost zero LOC; the convention is the value (anticipating slice 8.4-8.6 growth into the directories).

**Secondary failure mode: cross-module duplication.** When two modules need similar utilities (e.g., `modules/projects/lib/format-date.ts` AND `modules/organizations/lib/format-date.ts`), developers may duplicate instead of promoting to `lib/utils.ts`. Vertical-slice's downside.

Likelihood: medium at scale; low at MVP.

**Tertiary failure mode: shadcn primitive over-coupling to module.** Module pulls shadcn `<Button>` from `components/ui/button.tsx` but also customizes locally; eventually duplicates the customization across modules.

Likelihood: low. shadcn pattern is to extend via variants on the primitive itself; module-specific variations are rare at MVP scope.

## Mitigations

- **Empty-modules acceptance** — accept as a feature of vertical-slice pattern. Don't flatten; the shape pays off at slice 8.5+.
- **Cross-module utility promotion** — if a utility is needed in ≥2 modules, promote to `apps/cockpit/lib/utils.ts` per PR-review enforcement. Establish convention: "two callers means it lives in `lib/`."
- **shadcn primitive discipline** — module-specific variations go IN the module (`modules/projects/components/branded-button.tsx`) using the shadcn primitive via composition, NOT by forking the primitive itself. Keeps `components/ui/` clean as the cross-feature source of truth.
- **No barrels** per F6.15 enforcement at PR review — direct file imports avoid the "barrel hides what's inside" tree-shaking + dependency-clarity hazards.

## Idiom citations

- `idioms/typescript.md` (Let the types flow end-to-end) — `modules/projects/types.ts` re-exports from `@bokchoy/shared-types` workspace; cockpit consumers import via the module's typed surface. Schema change cascades automatically.
- `idioms/typescript.md` (Make impossible states unrepresentable) — module API typed via discriminated unions where applicable (e.g., `ProjectStatus = 'active' | 'paused' | 'archived'`).
- `[[backend-service-shape]]` §2 — module-per-feature naming convention internal precedent.
- Cal.com `apps/web/modules/` × 38 features at 250k+ LOC — production-cited external precedent.

## Revisit when

- **Cockpit grows past 15 features** with substantial cross-module utility duplication observed. Trigger: code-review observation of ≥3 utility files duplicated across modules. Promote to `lib/utils.ts` extension OR consider intermediate split (per-domain util directories).
- **Multiple cockpit apps emerge** (e.g., admin-only super-cockpit, support-team-cockpit) — triggers workspace-level feature extraction per (Alternative D).
- **Marketing scope grows past one page** per `[[cockpit-shape]]` revisit-when — splits to `apps/marketing/` workspace; `modules/marketing/` deletes from cockpit.
- **First design partner reports onboarding pain** at the module structure — quantitative: time-to-first-contribution > 2 hours for a new contributor reading the codebase cold. Triggers reconsideration of module boundary clarity.
- **Page-view testability demand emerges** — first test that wants to mock a route's page-view → introduce `*-view.tsx` abstraction per (Alternative C).
- **Cross-codebase mental model breaks** — backend changes its module pattern OR developer reports confusion across `apps/backend/` and `apps/cockpit/` conventions. Reopen internal-consistency defense.

## Cascade obligations for slice 8.3 + 8.4 implementation

1. **`apps/cockpit/package.json`** — Next.js 16.2.6 + React 19.2 + Better Auth (catalog) + @bokchoy/auth-config (workspace) + TanStack Query + Tailwind v4 + Radix UI + RHF + Zod + shadcn deps.
2. **`apps/cockpit/next.config.ts`** — env-driven async rewrites per `[[auth-surface-mount]]` (V3).
3. ~~**`apps/cockpit/tailwind.config.ts`** — Tailwind v4 config matching shadcn defaults.~~ **OBSOLETE per Amendment 2026-05-12 (see below).** Tailwind v4 has NO JS config file — `components.json.tailwind.config: ""` is the canonical signal. All theme tokens live in CSS via `@theme inline` directives in `app/globals.css`. See `[[cockpit/shadcn-setup-research]]` F4 (schema) + C2 (conflict resolution) + `[[cockpit/shadcn-setup]]` (the decision).
4. **shadcn CLI bootstrap** — `cd apps/cockpit && bunx shadcn@latest init --base radix --preset radix-nova --yes` per `[[cockpit/shadcn-setup]]`. Initializes `apps/cockpit/components/ui/` with `aliases.ui: "@/components/ui"` (cockpit-local per (M-LOCAL); NOT `packages/ui/` workspace extraction).
5. **`apps/cockpit/app/layout.tsx`** — root layout with QueryClientProvider + Better Auth client provider mount.
6. **`apps/cockpit/components/layouts/{app-shell,sidebar,header,marketing-shell,auth-shell}.tsx`** — cross-feature shells.
7. **`apps/cockpit/modules/{auth,projects,organizations,marketing}/`** — vertical slices with components / api / hooks / lib / types per the structure above.
8. **`apps/cockpit/lib/{query-client,utils}.ts`** — cross-feature utilities.
9. **`apps/cockpit/app/{(marketing),(auth),(app)}/...`** — route segments composing module components.
10. **PR-review enforcement** of F6 17-row anti-pattern table extension from `[[cockpit-stack-integration-research]]` Amendment 2026-05-11 + `bundle-barrel-imports` discipline.

## Open threads

- **Cockpit testing infrastructure** — slice 8.3 ships without in-tree component tests per slice 8.2.1 precedent (shell smoke scripts only). Vitest / Playwright wiring deferred until first cockpit slice surfaces a real test gap. `[[frontend-stack]]` vaulted both as MVP-target stacks; implementation timing TBD.
- **`*-view.tsx` abstraction reopening trigger** — first cockpit unit test OR first route reuse will trigger introduction. Watch for it during slice 8.4-8.6.
- ~~**shadcn `components.json` config path** — `components/ui/` is the shadcn CLI default; confirm at scaffold time.~~ **RESOLVED 2026-05-12 per `[[cockpit/shadcn-setup]]`** — `aliases.ui: "@/components/ui"`, `aliases.components: "@/components"`, `aliases.utils: "@/lib/utils"`, `aliases.lib: "@/lib"`, `aliases.hooks: "@/hooks"`. `apps/cockpit/hooks/.gitkeep` required pre-init (the `hooks` alias path must exist).

**Amendment 2026-05-12 (cascade #3 obsolete + shadcn picks landed):** `[[cockpit/shadcn-setup]]` resolved the shadcn bootstrap decisions (`--base radix` + `--preset radix-nova` + `next-themes` class-based dark mode). Tailwind v4 eliminates the JS config file — cascade #3 (`apps/cockpit/tailwind.config.ts`) is OBSOLETE. All theme tokens live in `app/globals.css` via `@theme inline` directives; `components.json.tailwind.config: ""` is canonical. The decision entry contains the full init runbook + post-init verification checklist. See `[[cockpit/shadcn-setup-research]]` F4 / F6 / C2 for source-anchored evidence.
- **Cross-module shared types vs `@bokchoy/shared-types`** — workspace-level shared types package (already exists per workspace structure). Cockpit modules consume via `import type { Project } from '@bokchoy/shared-types'`. Slice 8.4 cascade obligation: backend handlers export types to `@bokchoy/shared-types` for cockpit consumption.
