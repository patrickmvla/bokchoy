---
type: research
features: [backend-stack, frontend-stack, monorepo-tooling]
related: ["[[frontend-stack-research]]", "[[backend-stack]]", "[[backend-service-shape]]", "[[backend-service-shape-research]]"]
created: 2026-05-03
confidence: high
provisional: false
---

# Monorepo tooling: Bun workspaces vs Turborepo (and the framing fix)

## Question

Hypothesis under test: Bun workspaces for BokChoy monorepo (user pre-pick implicit by pulling the open thread). Prior recommendation per `[[frontend-stack-research]]`: Turborepo (Cal.com production cite + Vercel-native pairing).

Sub-questions:
- **Q1:** Bun workspaces production-readiness 2026-Q2 + feature parity with Turborepo.
- **Q2:** Vercel deploy + Bun workspaces compatibility for `apps/cockpit/` Next.js 16 build.
- **Q3:** Production cites for Bun workspaces vs Turborepo at B2B SaaS scale.
- **Q4:** Migration cost + lock-in if BokChoy needs to switch later.

## Triangulation

- **Production reference:** ✓ — OpenCode (anomalyco/opencode + sst/opencode, 20+ packages) for **Bun workspaces + Turbo hybrid**; Trigger.dev for Turborepo build orchestration; Cal.com for Turborepo (already in `[[frontend-stack-research]]` Source 5); Autumn (useautumn) for Bun workspaces.
- **Docs reference:** ✓ — bun.com/docs/pm/workspaces; turborepo.dev (Turborepo 3.0 native Bun integration); untergletscher.com 2026 Monorepo Guide; vercel.com/docs/monorepos; bun.com/docs/guides/deployment/vercel.
- **Contradiction probe:** ✓ — shadcn-ui Discussion #6465 (Turborepo + Bun workspace dependency & script issues); vercel/turborepo Discussion #7456 (`prune` support gap in Bun workspaces); vercel/turborepo Discussion #11390 (pnpm → bun migration friction); oven-sh/bun Issue #14662 (automated migration tool open); bun link edge cases vs pnpm workspace protocol.

## Sources examined

### Source 1 — OpenCode production cite for Bun workspaces + Turbo hybrid
- **Tier:** 1 (production code — public repository of named system)
- **Provenance:** github.com/anomalyco/opencode (also github.com/sst/opencode); deepwiki.com/anomalyco/opencode and deepwiki.com/sst/opencode/10.1-build-system-and-monorepo — observed 2026-05-03
- **Author context:** Anomaly Co. / SST team. OpenCode is open-source AI coding agent shipping CLI + desktop + VS Code extension + web interface + cloud backend. Production-grade monorepo at meaningful scale.
- **What it tells us:**
  - **20+ packages** in monorepo
  - **Bun workspaces** as package manager + workspace dep resolution layer
  - **Turbo (Turborepo)** as build orchestration layer
  - **Bun catalog** feature for shared dependency version pinning across packages (typescript, vite, solid-js, zod, etc.)
  - **`workspace:*` protocol** for cross-package references
  - Workspaces defined in `bun.lock` + root config
  - Multiple deploy targets coordinated by Turbo task graph

**Critical clarification on prior OpenCode cite:** `[[backend-service-shape-research]]` Source 4 cited OpenCode's Jay V on "moving to Node and Electron, away from Bun and Tauri" — that regret was specifically about the **desktop app runtime stack** (Electron replacing Tauri, Node replacing Bun-as-Electron-runtime). It was NOT about Bun workspaces or monorepo tooling. **OpenCode retains Bun workspaces + Turbo for the monorepo** even while moving desktop runtime away from Bun. The package-manager-vs-runtime split is clean here — and matches the framing fix below.

### Source 2 — Trigger.dev Turborepo production cite
- **Tier:** 1 (production code-equivalent)
- **Provenance:** deepwiki.com/triggerdotdev/trigger.dev/2.2-build-system-and-turborepo; trigger.dev/changelog/monorepo-turborepo-guide
- **What it tells us:** *"The Trigger.dev monorepo uses Turborepo as its build orchestration system, managing task execution across all workspace packages. The build system configuration is centralized in turbo.json, which defines the task pipeline, dependency relationships, cache configurations, and shared environment variables, while individual packages define their own build scripts in their package.json files, which Turborepo orchestrates according to the pipeline rules."* Same Trigger.dev that ships heavy Bun-runtime production deployments per `[[backend-service-shape-research]]` Source 1 — meaning Bun-runtime + Turborepo hybrid is established at production scale.

### Source 3 — Bun workspaces official documentation
- **Tier:** 2 (official docs)
- **Provenance:** bun.com/docs/pm/workspaces; bun.com/docs/guides/install/workspaces — observed 2026-05-03
- **What it tells us:** Bun workspaces use the same `workspaces` field in `package.json` that npm and Yarn use (simpler migration). `bun install` installs dependencies for all workspaces, de-duplicating packages where possible. `workspace:*` protocol for cross-references. **Bun 1.3** introduced **Lockfile v3 (text-based `bun.lock`)** — specifically optimized for monorepo "pruning." Catalog feature for shared dependency version pinning.

### Source 4 — Turborepo 3.0 native Bun workspace support
- **Tier:** 2 (official docs)
- **Provenance:** turborepo.dev (Turborepo 3.0 announcement, currently in canary as of April 2026); turborepo.dev/blog/turbo-2-6 (earlier Bun support); untergletscher.com/en/blog/modern-monorepo-bun-turborepo-biome-2026-guide
- **What it tells us:**
  - Turborepo 3.0 offers **native, first-class support for Bun workspaces** — automatically detects `bun.lockb` or text-based `bun.lock` formats; optimizes caching strategy for Bun's internal binary linking
  - Turborepo integrates with npm, pnpm, yarn, AND Bun workspaces — package-manager-agnostic
  - **Cache-miss rate in CI reduced ~40% compared to legacy pnpm configurations** (per untergletscher.com surveyed scope)
  - Remote caching via Vercel — cuts CI times by over 90% (per same source)

### Source 5 — 2026 industry consensus on monorepo stack
- **Tier:** 4 (engineering guide, named publication)
- **Provenance:** untergletscher.com/en/blog/modern-monorepo-bun-turborepo-biome-2026-guide ("The 2026 Monorepo: Bun 1.3, Turborepo 3.0, and Biome 2.2 — The Low-Overhead Stack"); pkgpulse.com/guides/turborepo-vs-nx-vs-moon-build-tools-2026
- **What it tells us:** **Industry-consensus 2026 stack:** *"Bun replaces npm/pnpm, Jest/Vitest, and often Node.js, Biome replaces ESLint and Prettier, and Turborepo orchestrates everything with zero-config caching."* Single-tool, multiple-roles philosophy. Bun + Turborepo + Biome is the named consensus default for new monorepos.

### Source 6 — Bun workspace edge cases / contradiction probe
- **Tier:** 1 (production code — primary issue trackers) + Tier 4 (engineering blogs)
- **Provenance:** github.com/shadcn-ui/ui/discussions/6465 (Turborepo + Bun Workspace Dependency & Script Issues); vercel/turborepo Discussion #7456 (Support `prune` in Bun workspaces — open feature gap); vercel/turborepo Discussion #11390 (pnpm → bun migration path); oven-sh/bun Issue #14662 (Automated migration from pnpm to bun project — open); fgbyte.com/blog/02-bun-turborepo-hell ("Dealing with Monorepo's Hell with Bun")
- **What it tells us:** Real production friction points:
  - **`bun link` behavior differs from pnpm's workspace protocol in subtle ways** (per pkgpulse.com/guides/pnpm-vs-bun-2026)
  - **`prune` support gap** — Turborepo's `turbo prune` (used to slim CI Docker images) has incomplete support for Bun workspaces per Discussion #7456 (open)
  - **`pnpm catalog` migration friction** — direct migration from pnpm-workspace.yaml catalogs to Bun causes errors
  - **Some monorepo tooling treats Bun as second-class citizen** in docs/troubleshooting
  - **Lockfile incompatibility with standard CI environments** was a 2024-2025 pain point; Bun 1.3 Lockfile v3 closes most of this
  - shadcn-ui Discussion #6465 documents specific dependency + script resolution issues in Turborepo + Bun setups

### Source 7 — Vercel monorepo deploy + Bun support
- **Tier:** 2 (official docs)
- **Provenance:** vercel.com/docs/monorepos; bun.com/docs/guides/deployment/vercel; vercel.com/docs/monorepos/turborepo
- **What it tells us:**
  - Vercel "heavily optimized for monorepos"
  - **Critical mechanical detail:** *"if you don't hand Vercel the entire monorepo with the root package.json and lockfiles, the build will crash because it cannot resolve your shared workspaces"*
  - Bun runtime via `vercel.json` `bunVersion: "1.x"` (Public Beta — already accepted as risk in `[[frontend-stack-research]]`)
  - Bun + Next.js works "out of the box" via `bun --bun` flag for build/start commands
  - Turborepo + Vercel is canonical production-grade pairing — remote caching, project-detection, automatic build pipeline

### Source 8 — Autumn (useautumn) Bun workspaces production cite
- **Tier:** 1 (production code-equivalent)
- **Provenance:** deepwiki.com/useautumn/autumn
- **What it tells us:** Autumn implemented as **Bun-managed monorepo containing three primary application tiers**, repository uses Bun workspaces to manage package dependencies. Smaller-scale production cite than OpenCode (3 tiers vs 20+ packages) but adds breadth.

## Findings

### Finding 1 — "Bun workspaces vs Turborepo" is a category error; they compose

The hypothesis-under-test framing treated Bun workspaces and Turborepo as alternatives. They aren't.

- **Bun workspaces** = package manager (replaces npm/pnpm/yarn) + workspace dependency resolution + install. **Layer 1.**
- **Turborepo** = task orchestration + dependency-aware caching + parallelization + remote caching. **Layer 2.** Turborepo runs on top of any package manager.

Per Source 4: Turborepo integrates with npm, pnpm, yarn, AND Bun workspaces. Turborepo 3.0 ships first-class native Bun workspace detection (auto-detects `bun.lockb` / `bun.lock` text format). They're complementary, not competing.

**OpenCode (Source 1) and Trigger.dev (Source 2) both run Turborepo + Bun-managed dependencies in production.** OpenCode keeps Bun workspaces; Trigger.dev uses Bun heavily as runtime. Both ship Turborepo for orchestration.

**Confidence: high** — multiple production cites + official docs converge on the composability framing.

### Finding 2 — Bun workspaces is production-grade for package management at MVP-and-beyond scale

Per Sources 1, 3, 8: Bun workspaces in 2026-Q2 is production-grade for monorepo package management. OpenCode runs 20+ packages on it. Bun 1.3 Lockfile v3 closes earlier corruption + CI compatibility issues. `workspace:*` protocol + catalog feature provide modern monorepo ergonomics.

**Confidence: high** — production cite at OpenCode scale (20+ packages) + official docs maturity signal.

### Finding 3 — Turborepo provides task orchestration + caching that Bun workspaces alone does not

Bun has `bun run --filter <pkg>` for filtering script execution across workspaces, but it does NOT ship:
- **Task graph dependency resolution** (Turborepo's `dependsOn` in `turbo.json`) — declaring task X requires task Y in upstream workspace
- **Output caching** keyed on task input hash — Turborepo caches per-task outputs and skips re-execution if inputs unchanged
- **Remote caching** for CI/CD — share cache across machines
- **Parallelization with task-graph awareness** — Turborepo runs tasks at maximum parallelism honoring dependency order

These are Turborepo's value-add and the reason it exists alongside Bun workspaces. **At BokChoy MVP scale (2 apps + 2-3 packages = ~5 workspaces), Turborepo's caching value is real but not yet load-bearing — `bun run build` across all workspaces sequentially could work for the first few months. Turborepo becomes load-bearing as monorepo grows or CI time becomes a friction point.**

**Confidence: high** — feature comparison from official docs + Trigger.dev/Cal.com production cites for Turborepo's caching value at scale.

### Finding 4 — Vercel deploys Next.js cockpit cleanly from Bun workspaces + Turborepo monorepo

Per Source 7: Vercel monorepo support is mature; Bun + Next.js works out of the box; Turborepo + Vercel is canonical pairing with remote caching. Specific mechanical: monorepo root must be the deploy root (Vercel needs root `package.json` + lockfile to resolve workspaces).

**For BokChoy `apps/cockpit/`:** Vercel project-detection picks up the Next.js workspace; build command `turbo run build --filter=cockpit` runs only what's needed; Bun runtime via `vercel.json` `bunVersion: "1.x"` (Public Beta status accepted in `[[frontend-stack-research]]`).

**Confidence: high** — official docs + Vercel Bun runtime announcement + multiple deploy guides.

### Finding 5 — Specific Bun workspaces + Turborepo edge cases worth knowing

Per Source 6:
- **`turbo prune` for Bun workspaces** has incomplete support (Discussion #7456 open). `turbo prune` is used to create slim Docker images by extracting just one workspace + its deps. **Operational implication for BokChoy:** if backend container Dockerfile uses `turbo prune` to slim the image, this gap may surface. Workaround: ship the entire monorepo into the container (larger image but works), or extract via custom script.
- **`bun link` edge cases** vs pnpm workspace protocol in subtle ways. Surfaces during local development with linked dependencies, less common in CI/deploy paths.
- **`pnpm catalog` migration to Bun catalog** has friction — direct field-rename causes errors. Not relevant for BokChoy greenfield (no existing pnpm setup to migrate).
- **shadcn-ui Discussion #6465** documents dependency resolution issues in some Turborepo + Bun setups — debugging cost real but bounded.

**Confidence: high** — primary issue tracker cites + community engineering blog reports.

### Finding 6 — Industry consensus 2026: Bun + Turborepo + Biome is the canonical low-overhead monorepo stack

Per Source 5: 2026 stack consensus surveyed in untergletscher.com is "Single Tool, Multiple Roles": **Bun replaces npm/pnpm + Vitest/Jest + often Node.js. Biome replaces ESLint/Prettier. Turborepo orchestrates everything with zero-config caching.**

For BokChoy this matches `[[backend-stack]]` (Bun runtime amendment), `[[frontend-stack-research]]` recommendation (Turborepo coupling), and the addition of Bun workspaces + Biome (orthogonal to this research; flagged as future decision).

**Confidence: medium-high** — single named consensus source, but corroborated by production cites from OpenCode + Trigger.dev + Cal.com all running Turborepo.

## Conflicts

### "Bun workspaces is less mature than pnpm" vs "Turborepo + Bun is production-grade"

Per pkgpulse 2026: *"pnpm monorepo support is production-proven while Bun workspaces are functional but less mature, with enterprise validation showing Vercel, Vue core team, and Prisma all migrated to pnpm in 2025-2026."* Counter: OpenCode + Autumn ship Bun workspaces in production at meaningful scale.

**Per Contradiction protocol (multiple production examples beat one):** the maturity gap is real for enterprise-tier scale (Vercel/Vue/Prisma). For BokChoy MVP at solo-dev / indie-SMB scale, OpenCode's 20+-package production cite is the relevant comparison. Bun workspaces is production-grade for BokChoy's scale, less proven at enterprise scale post-MVP.

### Earlier OpenCode "moving away from Bun" cite vs "OpenCode runs Bun workspaces in production"

In `[[backend-service-shape-research]]` Source 4 I cited OpenCode's Jay V on "moving to Node and Electron, away from Bun and Tauri." Reading the verbatim more carefully: that statement is about **desktop app runtime stack** (Tauri → Electron, Bun-as-Electron-runtime → Node). It does NOT contradict OpenCode running **Bun workspaces for monorepo package management** (Source 1 in this entry).

**Per Contradiction protocol:** the apparent contradiction resolves on careful reading — the layers are different. **Vault correction noted:** earlier OpenCode cite is specific to desktop runtime, not monorepo tooling. Updating `[[backend-service-shape-research]]` open thread to reflect this nuance.

## Conditions

### When Bun workspaces wins for BokChoy
- Runtime consistency (Bun across backend per `[[backend-stack]]` + cockpit per Vercel-Bun-acceptance)
- Faster install (4-5x cold install per pkgpulse) — measurable CI speedup
- Catalog feature for cross-package version pinning
- Greenfield project (no pnpm catalog or workspace-protocol-quirks to migrate)

### When pnpm workspaces would win
- Enterprise-tier maturity required (Vercel/Vue/Prisma cite enterprise pnpm preference)
- Existing pnpm catalog setup with quirks not yet supported by Bun
- Concern over `bun link` edge cases at production scale

### When Turborepo is added to either
- Monorepo with >2-3 workspaces where build orchestration matters
- CI time becomes friction → caching pays back
- Multiple deploy targets coordinated by task graph

### When Turborepo is overkill
- Trivial monorepo (<3 workspaces, simple build)
- Solo dev with no CI pipeline yet
- For BokChoy: arguably overkill at week-1 MVP scaffold; pays back as soon as backend + cockpit + shared packages all need coordinated builds (so MVP timeline)

## Operational implications

For BokChoy monorepo decision (handed back to `/design`):

1. **Pick Bun workspaces + Turborepo (hybrid).** Defense:
   - Bun workspaces consistent with `[[backend-stack]]` Bun runtime amendment + `[[frontend-stack]]` cockpit-Bun-on-Vercel risk-acceptance — single package manager + runtime across the monorepo
   - Turborepo for build orchestration matches `[[frontend-stack-research]]` recommendation; Cal.com + Trigger.dev + OpenCode production cites
   - OpenCode is the named production cite for the EXACT hybrid (Bun workspaces + Turbo)
   - Industry consensus 2026 stack per Source 5

2. **Workspace structure (matches `[[backend-service-shape]]` module decomposition):**
   ```
   bokchoy/
   ├── package.json              # Root: workspaces + catalog + turbo
   ├── turbo.json                # Task graph + caching config
   ├── bun.lock                  # Bun lockfile v3
   ├── apps/
   │   ├── backend/              # Bun + Hono + Drizzle + Better Auth (per [[backend-stack]])
   │   └── cockpit/              # Next.js 16 + Bun on Vercel (per [[frontend-stack]])
   └── packages/
       ├── db/                   # Drizzle schema (Better Auth + BokChoy tables)
       ├── shared-types/         # Shared TypeScript types (request/response shapes, branded types)
       ├── auth-config/          # Better Auth config + plugins shared between backend + cockpit
       └── ui/ (deferred)        # Shared React components — added when cockpit grows
   ```

3. **Catalog usage per OpenCode pattern** — pin shared dependency versions (typescript, drizzle-orm, better-auth, hono, react, etc.) in root `package.json` `workspaces.catalog`. Prevents version drift; single source of truth.

4. **Turborepo `turbo.json`** — define `build`, `dev`, `lint`, `test`, `typecheck` tasks with `dependsOn` for cross-workspace dependencies. Enable remote caching via Vercel for CI speedup.

5. **Vercel deploy:** monorepo root + `apps/cockpit/` is the deploy target; build command `turbo run build --filter=cockpit`; Bun runtime via `vercel.json` `bunVersion: "1.x"`.

6. **Backend container deploy:** `apps/backend/` deployed via separate container PaaS per `[[backend-service-shape]]`. Dockerfile multi-stage build using Bun base image. **Note `turbo prune` Bun gap (Source 6):** if Dockerfile uses `turbo prune` to slim image, expect to ship full monorepo into container or use custom extraction. Slim-image-via-prune is post-MVP optimization.

7. **Cross-runtime discipline (already locked in `[[backend-stack]]` amendment) extends to monorepo level:** no `Bun.*` APIs in any workspace; ESLint blocks at all packages.

## Reproducibility note

Reproducible. Tool sequence:
1. **Q1 feature parity:** WebSearch "Bun workspaces 2026 Turborepo feature comparison"; WebFetch bun.com/docs/pm/workspaces; turborepo.dev docs.
2. **Q2 Vercel compat:** WebSearch "Bun workspaces Vercel deploy Next.js monorepo"; WebFetch vercel.com/docs/monorepos.
3. **Q3 production cites:**
   - OpenCode: WebSearch "opencode anomaly SST github bun workspaces" → DeepWiki cite at deepwiki.com/anomalyco/opencode and deepwiki.com/sst/opencode/10.1-build-system-and-monorepo
   - Trigger.dev: DeepWiki cite at deepwiki.com/triggerdotdev/trigger.dev/2.2-build-system-and-turborepo
   - Cal.com: cross-referenced from `[[frontend-stack-research]]` Source 5
   - Autumn: deepwiki.com/useautumn/autumn
4. **Q4 migration / contradiction:** WebSearch "Bun workspaces problems issues 2026 Turborepo migration"; primary issue cites at github.com/shadcn-ui/ui/discussions/6465 + vercel/turborepo Discussion #7456 + #11390 + oven-sh/bun Issue #14662.

**Judgments that don't fully reproduce:**
- "Bun workspaces is production-grade for BokChoy's scale" — based on OpenCode 20+ packages cite. A more thorough survey at higher scale (100+ packages, large team) might surface different conclusions.
- "Turborepo's caching value is not yet load-bearing at week-1 MVP" — judgment call based on BokChoy's specific feature surface; could shift if early CI time becomes friction.

## Open threads

1. **`turbo prune` Bun support** — track Discussion #7456 for resolution. Affects Dockerfile slim-image strategy if used post-MVP.
2. **Biome as ESLint/Prettier replacement** — per Source 5 industry consensus. Orthogonal to this research; future decision when CI lint config is set up.
3. **Vitest vs Bun's built-in test runner** — Bun ships `bun test` as Vitest-replacement per industry consensus. Open thread for testing infrastructure decision.
4. **Bun catalog vs pnpm catalog feature parity** — Bun catalog is newer; specific feature gaps not deeply surveyed. Re-investigate if BokChoy hits a catalog-specific friction point.
5. **Cockpit-specific Vercel deploy configuration** — `vercel.json` for `apps/cockpit/` with monorepo-aware settings (`turbo run build --filter=cockpit`, Bun runtime, env-var injection from root). Implementation-phase task.
