---
type: research
features: [cockpit, architecture]
related: ["[[cockpit-shape]]", "[[cockpit-stack-integration-research]]", "[[backend-service-shape]]"]
created: 2026-05-11
confidence: high
provisional: false
---

# How do production React/Next.js B2B SaaS cockpit / developer-tools codebases organize their app-level feature folders at indie/SMB-to-growth-stage scale?

## Question

`[[cockpit-shape]]` slice 8.3 implementation needs the folder structure decision. Prior /design turn proposed Bulletproof-React-style `features/{feature}/{components,hooks,api}` vertical-slice. User caught that vault would land on 1 production cite (Cal.com) — below the *Industry-standard* gate floor of ≥2 named production systems shipping the specific shape. /research handoff triggered to triangulate.

Five sub-questions:
- (a) Directory naming — `features/` vs `modules/` vs `src/` vs other vs none.
- (b) Module internal shape — flat-components vs subfolders (components/hooks/api/lib/types).
- (c) Page-view abstraction (Cal.com's `*-view.tsx` at module root) — convergent or Cal.com-specific.
- (d) Shared UI location — `components/ui/` + `components/layouts/` vs different split.
- (e) Where API/data-fetching code lives — colocated per feature, shared `lib/`, separate package, or other.

## Triangulation

- **Production reference:** ✓ four production B2B SaaS cockpits source-walked: Cal.com (Next.js, 250k+ LOC), Dub.co (Next.js, ~22k stars), Documenso (Remix), Trigger.dev (Remix). Five candidate — Formbricks — clone failed; dropped. 4 cites cleared the *Industry-standard* gate (≥2 named systems).
- **Docs reference:** ✓ Bulletproof React (alan2207/bulletproof-react) is the canonical advocacy reference for vertical-slice feature-folders in React. Tier 4 (educational template, not production app).
- **Contradiction probe:** ✓ active search for layer-based-at-scale production cite. **Found two: Documenso + Trigger.dev both ship layer-based at app-level.** The "convergent feature-folder" claim from prior /design turn is **falsified** by this triangulation.

## Sources examined

### Source 1 — Cal.com `apps/web/modules/`

- **Tier:** 1 (production code).
- **Provenance:** `/tmp/bocek-ref-calcom-cal.com/apps/web/modules/` at commit `fb01494`, observed 2026-05-11.
- **Author context:** Cal.com production engineering. 250k+ LOC per `[[frontend-stack-research]]`.
- **What it tells us:** **Vertical-slice features named `modules/`.** ~38 module folders (auth, availability, bookings, calendars, settings, signup, ...). Each module contains: `components/` subfolder + `hooks/` subfolder + page-level `*-view.tsx` files at module root (e.g. `signin-view.tsx`, `logout-view.tsx`) + sometimes sub-feature folders (`auth/forgot-password/`, `auth/oauth2/`). Plus workspace-level `packages/features/{name}/` with own `package.json` + `tsconfig.json` for cross-app reusable feature packages.

### Source 2 — Dub.co `apps/web/ui/` + `apps/web/lib/`

- **Tier:** 1 (production code).
- **Provenance:** `/tmp/bocek-ref-dubinc-dub/apps/web/` at HEAD, observed 2026-05-11. Public repo `dubinc/dub` (~22k stars).
- **Author context:** Dub.co production engineering. Multi-tenant link management B2B SaaS.
- **What it tells us:** **Horizontal split-by-feature** — `lib/{feature}/` for non-UI code + `ui/{feature}/` for components. Same feature names appear in both directories. Features observed in `ui/`: account, activity-logs, analytics, auth, customers, domains, folders, guides, integrations, layout, links, logs, messages, modals, oauth-apps, partners, placeholders, postbacks, referrals, shared, support, tokens, users, webhooks, workspaces (~25 subfolders). `lib/` mirrors with: actions, ai, analytics, api, api-logs, application-events, auth, axiom, bounty, cache, commissions, constants, cron, customers, discounts, dub.ts, dynadot, edge-config, email, embed, encryption.ts, fetchers, firstpromoter, folder, ... (~30 subfolders). Feature-named, NOT layer-named within `lib/`. **No `components/` directory; `ui/` is the convention.** **No vertical-slice `features/` directory.**

### Source 3 — Documenso `apps/remix/app/` + `packages/`

- **Tier:** 1 (production code).
- **Provenance:** `/tmp/bocek-ref-documenso-documenso/apps/remix/app/` at HEAD, observed 2026-05-11. Public repo `documenso/documenso`.
- **Author context:** Documenso production engineering. Open-source DocuSign alternative. **Remix framework, NOT Next.js** — feature-folder patterns transfer cross-framework (React conventions), routing pattern (file-system routes with `+` segment suffixes for nested layouts) doesn't.
- **What it tells us:** **App-level LAYER-BASED.** `apps/remix/app/` contains: `components/`, `providers/`, `routes/`, `storage/`, `types/`, `utils/`, plus `app.css`, `entry.{client,server}.tsx`, `root.tsx`. No `features/` or `modules/` at app level. **Workspace-level feature-split** — `packages/` has `api/`, `auth/`, `ui/`, `lib/`, `email/`, `prisma/`, `signing/`, `trpc/`. Some packages are domain-named (api, auth, signing), some layer-named (lib, ui). Cross-app reusable feature packages elevated to workspace; app-internal organization stays layer-based.

### Source 4 — Trigger.dev `apps/webapp/app/`

- **Tier:** 1 (production code).
- **Provenance:** `/tmp/bocek-ref-triggerdotdev-trigger.dev/apps/webapp/app/` at HEAD, observed 2026-05-11. Public repo `triggerdotdev/trigger.dev`. **Remix framework.**
- **Author context:** Trigger.dev production engineering. Already a vaulted production cite per `[[backend-service-shape-research]]` Source 4 + `[[backend-stack-research]]` Source 1.
- **What it tells us:** **App-level LAYER-BASED.** `apps/webapp/app/` contains: `api/`, `assets/`, `components/`, `hooks/`, `lib.es5.d.ts`, `models/`, `presenters/`, `redis.server.ts`, `routes/`, `runEngine/`, `services/`, `tailwind.css`, `utils/`, etc. Classic layered architecture: components / hooks / models / presenters / services / routes. **No `features/` or `modules/` directory.** Production B2B SaaS at scale stays layer-based.

### Source 5 — Bulletproof React (advocacy reference)

- **Tier:** 4 (educational template, ~16k stars).
- **Provenance:** `github.com/alan2207/bulletproof-react` canonical structure docs.
- **Author context:** Alan Alickovic, React community educator. NOT a production app — opinionated template.
- **What it tells us:** Advocates `src/features/{feature}/{components,api,hooks,types,utils,routes}/` strict vertical-slice. Influential in React community but **not a production cite.** Prior /design turn over-weighted this as if it were production-cited.

## Findings

### F1 (LOAD-BEARING) — No convergent production pattern across 4 cites

Four production cockpits ship four different shapes:

| Cite | Pattern | App-level dir | Workspace-level |
|---|---|---|---|
| Cal.com (Next.js) | Vertical-slice features | `apps/web/modules/{feature}/{components,hooks,*-view}/` | `packages/features/{name}/` (own package.json) |
| Dub.co (Next.js) | Horizontal split-by-feature | `apps/web/lib/{feature}/` + `apps/web/ui/{feature}/` | none (single app) |
| Documenso (Remix) | App-layer-based + workspace-feature-extracted | `apps/remix/app/{components,providers,routes,storage,types,utils}/` | `packages/{api,auth,ui,lib,...}/` |
| Trigger.dev (Remix) | App-layer-based | `apps/webapp/app/{components,hooks,models,presenters,services,routes}/` | none reported at app level |

**Convergence rate per sub-question:**

- **(a) Directory naming** — divergent. Cal.com `modules/`, Dub.co `lib/`+`ui/`, Documenso `app/{layers}`, Trigger.dev `app/{layers}`. No convergent name.
- **(b) Module internal shape** — Cal.com vertical-slice (1/4). 50% (Documenso + Trigger) don't HAVE module folders at app level — they're flat layered.
- **(c) Page-view abstraction** — Cal.com `*-view.tsx` (1/4). Documenso + Trigger use Remix `routes/` file-system patterns; Dub.co uses Next.js App Router `page.tsx` directly. Cal.com-specific.
- **(d) Shared UI location** — divergent. Cal.com `components/ui/` + `components/layouts/`; Dub.co `ui/` (no top-level `components/`); Documenso `components/` flat + `packages/ui/`; Trigger.dev `components/` flat.
- **(e) Data-fetching/API location** — Cal.com colocated in `modules/{feature}/api/`; Dub.co colocated in `lib/{feature}/`; Documenso routes own their loaders (Remix native); Trigger.dev `services/` + `presenters/` layer.

**The "feature-folder pattern is the production-cited norm" claim is falsified.** 50% of surveyed production cockpits at indie/SMB-to-growth scale ship LAYER-BASED at app level. The pick at this scale is **team preference + scaling forecast**, not "follow the production convergence."

### F2 — Bulletproof React is advocacy, not production cite

Prior /design turn cited Bulletproof React (alan2207/bulletproof-react) as if it were production-cited × 1. **Walked back: it's a tier-4 educational template, NOT a production application.** Influential in React community (~16k stars) but doesn't count toward production-cite floor. The `src/features/{feature}/{components,api,hooks,types,utils,routes}/` pattern advocated there is not directly observed in any of the 4 production cockpits surveyed — closest match is Cal.com's `modules/` (different name, similar internal shape).

### F3 — Workspace-level feature/domain extraction is partial convergence (2/4)

Cal.com + Documenso both extract some features/domains to workspace-level packages (`packages/features/` + `packages/{api,auth,ui,lib}/`). Dub.co + Trigger.dev keep everything in their app workspace. The 2/4 split correlates with "cross-app reuse expected" — Cal.com has multiple Next.js apps (web + api + others); Documenso has multiple apps too. Dub.co + Trigger.dev have a single primary web app.

**For BokChoy at MVP (single cockpit app):** workspace-level feature extraction is over-engineering. Keep features in `apps/cockpit/`. Revisit when a second Next.js app emerges per `[[cockpit-shape]]` revisit-when triggers (marketing-workspace split OR additional admin app).

### F4 — Feature-folder vs layer-based tradeoff axes

Honest tradeoff matrix observed across the four cites:

| Axis | Feature-folder (Cal.com / Dub.co split / Bulletproof) | Layer-based (Documenso / Trigger.dev) |
|---|---|---|
| Cohesion for feature growth | High — all feature code in one tree | Medium — components / hooks / services scatter |
| Onboarding new contributor | "Show me the projects feature" → one dir | Requires explaining the layer decomposition |
| Shared cross-feature primitives | Need explicit `components/` outside features | Naturally shared (everything's in layers) |
| Refactoring boundaries | Easy — feature folder moves as unit | Harder — refactor touches many layer dirs |
| Coupling between features | Low (each feature self-contained) | Naturally cross-cutting (shared services) |
| Scales to N=10 features | Clean per-feature folders | `components/` directory bloat |
| Scales to N=50 features | Some feature directories large (Cal.com has ~38) | `components/` becomes ~500 files (Cal.com case) |
| Empty modules at MVP | Real cost — feature exists with 1-2 files only | No empty layers — all populated |

The tradeoffs cut both ways. Neither is universally better.

### F5 — Dub.co's horizontal split-by-feature is a third path worth naming

Dub.co's `lib/{feature}/` + `ui/{feature}/` split is distinct from both Cal.com vertical-slice and Trigger/Documenso layer-based. It groups by feature WITHIN each top-level layer. Trade: imports for one feature live in two trees, but each tree is cohesive (`ui/links/` is everything UI about links; `lib/links/` is everything non-UI about links).

This pattern matches developer mental models that distinguish "rendering code" from "business logic" — common in TS+React stacks with TanStack Query (where data-fetching lives separately from rendering anyway). For BokChoy, where the cockpit's data-fetching layer (TanStack Query + RSC fetches + Server Actions) is architecturally separated from UI per `[[cockpit-stack-integration-research]]`, this pattern fits naturally.

## Conflicts

### C1 — "Feature-folder is the production norm" (FALSIFIED)

Prior /design turn asserted Bulletproof React's vertical-slice feature-folder is the convergent production pattern. Production cite survey shows 2/4 layer-based, 1/4 vertical-slice (Cal.com), 1/4 horizontal-split (Dub.co). Per *Contradiction protocol* (multiple independent production examples beat one), **layer-based is at least as production-cited as feature-folder.** The claim is falsified.

Conflicting evidence:
- Cal.com is the only pure-vertical-slice cite (1/4).
- Bulletproof React is advocacy, not production.
- Trigger.dev + Documenso ship layer-based at production scale.

### C2 — Framework cross-contamination (Remix vs Next.js)

2 of 4 cites use Remix (Documenso, Trigger.dev). Remix's `routes/` file-system convention differs from Next.js App Router. Some patterns transfer (component organization, layer-vs-feature split) and some don't (route-file naming, layout composition). For BokChoy on Next.js 16, Remix cites are weaker signal than Next.js cites — but the LAYER-vs-FEATURE-vs-SPLIT axis is framework-agnostic, so the 50% layer-based finding still holds.

## Conditions

- **Time:** May 2026. Commit hashes verified at fetch time 2026-05-11. Cal.com `fb01494`; others at HEAD.
- **Cite class:** 2 Next.js production B2B SaaS cockpits (Cal.com, Dub.co) + 2 Remix production B2B SaaS cockpits (Documenso, Trigger.dev). The cross-framework cites add weight on framework-agnostic axes (feature vs layer) but reduce weight on framework-specific axes (route patterns, layouts).
- **Scale:** indie/SMB-to-growth-stage. Findings do NOT hold for hyper-scale codebases (Netflix-tier monorepos) where module federation + DDD bounded contexts apply different patterns.

**Does NOT hold for:**
- Hyper-scale React monorepos (Meta, Netflix, etc.) — different patterns.
- Closed-source production cockpits (Linear, Resend, Vercel Dashboard) — not surveyable.
- Game-industry-specific React conventions (PlayFab, Unity Cloud Dashboard) — not surveyed.

## Operational implications

### Three honest paths for BokChoy `[[cockpit/file-structure]]`

**(P-CAL)** Cal.com-style vertical-slice modules — `apps/cockpit/modules/{feature}/{components,hooks,api,lib,*-view.tsx}/`. 1/4 production cite (Cal.com only). Wins on feature-cohesion + clear refactoring boundaries. Cost: `*-view.tsx` page-view abstraction adds one layer indirection; sparse modules at MVP scale (auth + organizations features will have 2-3 files each).

**(P-DUB)** Dub.co-style horizontal split-by-feature — `apps/cockpit/ui/{feature}/` + `apps/cockpit/lib/{feature}/`. 1/4 production cite (Dub.co only). Wins on data/UI separation matching TanStack Query + RSC architecture; familiar to React devs. Cost: imports for one feature live in two trees (e.g., `import {ProjectsList} from '@/ui/projects/projects-list'` + `import {useProjects} from '@/lib/projects/use-projects'`).

**(P-LAYER)** Trigger.dev/Documenso-style layer-based — `apps/cockpit/{components,hooks,services,utils,...}/`. 2/4 production cites (Documenso + Trigger.dev). Wins on simplicity at small scale (3-5 features); flat layers; production-cited × 2 majority. Cost: at N=10+ features the layer directories bloat (Cal.com's case argues for migration to features); no clear feature ownership signal.

**Recommendation back to /design:** the *Industry-standard* gate is met by all three (≥2 named production systems exist for layer-based; 1 each for vertical-slice and horizontal-split — close to floor but not over). For BokChoy at solo-dev MVP with 3-5 features at slice 8.3-8.6 scope, **(P-LAYER)** is the lowest-LOC + highest-cite path. As cockpit grows past ~10 features (probably months 4-5 cockpit-core + beyond), migration to feature-folder ((P-CAL) or (P-DUB)) becomes worth the cost. **/design picks** with named winning conditions.

### Anti-pattern carry-forward from `[[cockpit-stack-integration-research]]` Amendment F6

Regardless of (P-LAYER) / (P-CAL) / (P-DUB) pick, the Vercel anti-pattern table (F6 in cockpit-stack-integration-research Amendment) applies:
- (F6.15) `bundle-barrel-imports` — no `index.ts` barrels at feature/module/folder roots. Direct file imports.
- (F6.11) `'use client'` at leaf-component placement only.
- (F6.1)-(F6.10) other RSC composition rules.

### Cite-class amendment owed to prior `[[admin-list-endpoints-research]]` Source 6

Cal.com was correctly cited there for RSC composition patterns (auth-lib-agnostic). No amendment owed; that cite-class was honest.

## Reproducibility note

Reproducible. Another investigator with bash + git clones the 4 repos shallow + inspects top-level + first feature folder:

```
git clone --depth 1 https://github.com/calcom/cal.com /tmp/cal.com
ls /tmp/cal.com/apps/web/modules/

git clone --depth 1 https://github.com/dubinc/dub /tmp/dub
ls /tmp/dub/apps/web/ui/
ls /tmp/dub/apps/web/lib/

git clone --depth 1 https://github.com/documenso/documenso /tmp/documenso
ls /tmp/documenso/apps/remix/app/

git clone --depth 1 https://github.com/triggerdotdev/trigger.dev /tmp/trigger.dev
ls /tmp/trigger.dev/apps/webapp/app/
```

Same observations reach the same finding. No load-bearing subjective judgment beyond the layer-vs-feature taxonomy attribution (which is mechanical given the directory names).

## Open threads

- **Formbricks clone failed** this pass (HTTPS clone exit 1). If a 5th Next.js cite is wanted to break the 1/3 vs 2/3 split, retry with different transport (git+ssh) or pick Plane (`makeplane/plane`) / Twenty (`twentyhq/twenty`) as alternates.
- **Closed-source production cockpit conventions** (Linear, Resend, Vercel Dashboard, Stripe Dashboard) — would resolve the layer-vs-feature tension but unsurveyable without insider knowledge.
- **Game-industry React conventions** (PlayFab Dashboard, Unity Cloud Dashboard) — not surveyed; lower-priority cite class for BokChoy's stack-aligned ICP.
- **Hyper-scale React monorepo patterns** (DDD bounded contexts, module federation) — out of scope for indie/SMB-MVP.
- **Bulletproof React's vertical-slice pattern uptake in PRODUCTION codebases** — the survey found 0/4 strict-Bulletproof-shape. Worth a follow-up question: is Bulletproof's pattern aspirational-only, or do production apps adopt it without naming it "features"? Cal.com's `modules/` is structurally close to Bulletproof's `features/` minus the directory name and plus the `*-view.tsx` page-view abstraction.
