---
type: research
features: [backend-stack, backend-service-shape]
related: ["[[backend-stack]]", "[[backend-stack-research]]", "[[player-auth]]", "[[wallet-mechanics]]", "[[host-platform]]", "[[wedge-decision]]", "[[mvp-feature-sequence]]", "[[idempotency-strategy]]"]
created: 2026-05-03
confidence: high
provisional: false
---

# Backend service shape + Bun-vs-Node re-research for BokChoy MVP

## Question

Two coupled sub-questions, single session:

- **Q1 (runtime re-research):** Does Bun 1.3+ in 2026-Q2 clear the production-grade default-runtime gate for BokChoy's specific workload shape (CRUD-on-Postgres + outbox processing per `[[wallet-mechanics]]` + occasional DSR exports per `[[player-auth]]`), or does Node.js 22 LTS remain the conservative production default? **Hypothesis under test (per user directive at session continuation):** "Bun not Node." Existing `[[backend-stack]]` decision (Node.js 22 default) is the position to defend or supersede.
- **Q2 (service shape):** For BokChoy MVP — solo dev, 20-month runway per `[[wedge-decision]]`, indie/SMB SaaS, TS+Drizzle+Better Auth+Postgres stack — what is the production-grade backend service topology? Monolith, modular monolith, split-services, or serverless?

## Triangulation

### Q1 (runtime)
- **Production reference:** ✓ — Trigger.dev firestarter migration (named workload, named engineer, 5× quantified — already cited in `[[backend-stack-research]]`); pkgpulse 2026-Q1 case study ($18k/year savings, 0 errors/week, p99 120ms after Bun + Drizzle + Zod migration); OpenCode founder Jay V's public migration FROM Bun TO Node citing memory + crashes + Windows support; multiple GitHub-tracked production memory leak reports across Bun 1.1.x range (Issues #16339, #18488, #24216, #25948).
- **Docs reference:** ✓ — Bun GitHub Issues as primary tracker for production-stability evidence; Anthropic acquisition of Bun Dec 2025 (the Register / DevClass coverage of Bun 1.1.13 memory fixes April 2026); Better Auth Issue #2283 explicitly closed `wontfix` with maintainer-stated workaround.
- **Contradiction probe:** ✓ — explicit search for Bun production regrets surfaced OpenCode migration cite + multiple memory-leak issues across stable releases. Anthropic stewardship is positive but stability work is **ongoing as of Bun 1.1.13 (April 2026)**, not closed.

### Q2 (service shape)
- **Production reference:** ✓ — DHH 2023 majestic monolith post citing GitHub + Shopify as production proof (millions of LOC, thousands of collaborators); 2026 industry consensus across multiple surveyed sources naming "Modular Monolith" as the default for SaaS under $10M ARR.
- **Docs reference:** ✓ — outbox pattern docs (event-driven.io, microservices.io) document the co-hosted-vs-separate-relay tradeoff; Cloudflare Workers / Vercel docs confirm constraint set (no native binaries, no long-running processes, no filesystem persistence).
- **Contradiction probe:** ✓ — searched for monolith regrets at MVP scale (premature-split post-mortems consistently cite microservices as the premature optimization, not monolith); searched for serverless production cites at indie/SMB B2B SaaS — surveyed scope shows Workers wins for API-heavy edge-latency workloads, loses on native-binary + long-running-worker dependencies (BokChoy's exact shape).

## Sources examined

### Source 1 — DHH "The Majestic Monolith" + "How to recover from microservices"
- **Tier:** 3 (engineering post-mortem-equivalent — multi-decade product experience at 37signals applied to architecture stance)
- **Provenance:** signalvnoise.com/svn3/the-majestic-monolith/ (original post); world.hey.com/dhh/how-to-recover-from-microservices-ce3803cc (May 2023 follow-up); twitter.com/dhh/status/1981342407129235683 (2026 reaffirmation)
- **Author context:** David Heinemeier Hansson, co-founder of 37signals (Basecamp, HEY); creator of Ruby on Rails. Multi-decade production experience shipping B2B SaaS at scale.
- **What it tells us:** Verbatim 2023: *"The vast majority of systems are much better served by starting and staying with a monolith."* Cites GitHub and Shopify as production-cite proof of monoliths at scale ("millions of lines of code and thousands of collaborating programmers"). Verbatim 2026 X post: *"The majestic monolith remains undefeated for the vast majority of web apps. Replacing method calls with network calls makes everything harder, slower, and more brittle. It should be the absolute last resort."* Failure modes of premature splitting: *"splintering coherent flows across multiple systems"*, *"coordination complexity and synchronization issues"*, *"a system comprised of 3-5-7 different programming languages"*, result *"nobody understands or can work on the whole system."* Legitimate splitting conditions: (a) successful evolution from small/simple to large/complex system, (b) isolated hot-spots requiring language rewrite OR organizational benefits from dedicated team ownership with clear boundaries.

### Source 2 — Bun production memory leak class — multiple GitHub issues across stable releases
- **Tier:** 1 (production code-equivalent — primary issue tracker for the runtime under evaluation)
- **Provenance:** github.com/oven-sh/bun/issues/16339 (Next.js memory leak migrating from Node 20 to Bun 1.1.43); /issues/18488 (HTTP fetch streaming memory leak in Bun ≥1.1.27); /issues/24216 (Nest.js memory leak); /issues/25948 (Mongoose production-build memory leak); /issues/16503 (general possible memory leak)
- **Author context:** various reporters; some marked as production deployments hitting issues at scale
- **What it tells us:** **Memory-leak class regression in Bun 1.1.x is not a single closed issue but a recurring pattern.** Different reports across multiple framework integrations (Next.js, Nest.js, Mongoose, fetch-streaming) with different root causes but consistent symptom: production memory growth eventually triggering container termination. **For long-running workloads** (which BokChoy's outbox worker per `[[wallet-mechanics]]` is) the issue class compounds: short benchmarks don't surface the leak, production does.

### Source 3 — Anthropic acquires Bun (December 2025); Bun 1.1.13 memory fixes (April 2026)
- **Tier:** 4 (engineering blog / news, named publications)
- **Provenance:** theregister.com/2026/04/21/anthropics_bun_1113_released_with_memory_fixes/; devclass.com/ci-cd/2026/04/22/anthropic-bakes-memory-fixes-into-bun-1113-as-developers-complain-of-leaks/
- **What it tells us:** Anthropic acquired Bun in December 2025. Bun 1.1.13 (April 2026) shipped memory fixes "following complaints of memory leaks causing problems in production." **Anthropic stewardship is a positive engineering-investment signal, but stability work is ongoing as of 2026-04-21 — not closed.** The acquisition creates capacity for fixes but does not retroactively close the issues that landed in production deployments before the fixes shipped.

### Source 4 — OpenCode founder Jay V — production migration FROM Bun TO Node
- **Tier:** 3 (engineering post-mortem-equivalent — public production-regret cite)
- **Provenance:** Jay V (founder of OpenCode), public statement cited via search aggregation 2026; "moving to Node and Electron, away from Bun and Tauri"
- **What it tells us:** Specific named-engineer + named-product regret on Bun in production. Cited issues: memory issues, crashes, "terrible Windows support." **This is the strongest production-regret cite found.** Counter-balance to Trigger.dev firestarter's positive cite — same week-of-2026, opposite trajectory. The deciding factor between Trigger.dev (kept Bun, fixed-after-leak) vs. OpenCode (migrated away from Bun) is workload shape and team risk tolerance.

### Source 5 — pkgpulse 2026 "Bun.sql vs postgres.js vs Drizzle" guide
- **Tier:** 4 (engineering guide, named publication)
- **Provenance:** pkgpulse.com/guides/bun-sql-vs-postgres-js-vs-drizzle-postgres-stack-2026
- **What it tells us:** 2026 stack consensus: "Bun + Bun.sql + Drizzle (Bun-first apps), Node + postgres.js + Drizzle (most apps)." Bun is endorsed for HTTP API workloads with explicit caveat: **"long-running workloads amplifying problems that short benchmarks never reveal."** The exact concern for BokChoy MVP — outbox worker is long-running by design. Case study cited: p99 latency dropped to 120ms, runtime errors reduced to 0/week, AWS costs dropped $1.8k/month ($18k/year savings) after migrating REST API to Bun + Drizzle + Zod. **This is the strongest pro-Bun production cite.**

### Source 6 — Better Auth Issue #2283 (`bunx` schema-generation crash, closed wontfix)
- **Tier:** 1 (production code — primary issue tracker)
- **Provenance:** github.com/better-auth/better-auth/issues/2283; closed 2025-04-23 with `wontfix` label by maintainer ping-maxwell
- **What it tells us:** Specific bug in BokChoy's intended stack: Bun 1.2.9 + Better Auth + Drizzle + PostgreSQL hits segmentation fault when running `bunx --bun @better-auth/cli@latest generate`. Maintainer's stated workaround: "Use another package manager such as pnpm." **Bug is bunx-CLI-specific, NOT runtime-specific. The Better Auth runtime on Bun is not what fails here — only the schema-generation CLI tool. Per `[[backend-stack]]` decision, BokChoy uses drizzle-kit (not Better Auth CLI) for schema migrations, so Issue #2283 is moot for BokChoy's chosen approach.** Important nuance: this surfaces in research as a "Bun + Better Auth bug" but doesn't bind on the chosen migration path.

### Source 7 — Outbox pattern co-hosted vs separate worker production guidance
- **Tier:** 4 (engineering blog)
- **Provenance:** event-driven.io/en/push_based_outbox_pattern_with_postgres_logical_replication/; npiontko.pro/2025/05/19/outbox-pattern; itnext.io/how-to-implement-the-outbox-pattern-in-go-and-postgres
- **What it tells us:** Co-hosted relay (worker in same process as HTTP API) "works well for small-scale systems with low traffic or a limited number of replicas (typically fewer than five)." At 10-30 replicas, co-hosted relay creates polling-storm (every replica polls outbox table at 25-50ms intervals). **`SKIP LOCKED` solves coordination at moderate scale** — rows locked during transaction, other replicas skip already-locked rows. Better-scale option: log-based CDC via Postgres WAL (no polling overhead, exact transaction-commit ordering preserved). **For BokChoy MVP at 1-2 replicas: co-hosted worker is the production-grade default; SKIP LOCKED via `[[wallet-mechanics]]` `staged_jobs` mechanism handles coordination.** Migration path to separate-worker / WAL-CDC is post-MVP scaling decision.

### Source 8 — 2026 monolith vs microservices industry consensus
- **Tier:** 4 (engineering guides, multiple aggregated sources)
- **Provenance:** distantjob.com/blog/monolith-vs-microservices/ (2026 decision framework); medium "Microservices vs Monolith in 2026"; superblocks.com/blog/monolithic-vs-microservices; javacodegeeks.com 2026 monolith analysis
- **What it tells us:** Unambiguous 2026 consensus for SaaS under $10M ARR: **modular monolith is the default starting point.** Specific cost signal: *"microservices can add 30–50% overhead to early development cycles due to infrastructure setup, inter-service communication design, and distributed testing complexity."* Specific framing: *"For MVPs, small teams (under 8 engineers), or those still validating product and domain logic, a monolith is recommended."* Modular monolith definition: *"a single deployable application internally divided into well-defined, loosely coupled modules, each owning its own domain logic, data access, and interfaces—think of it as microservices discipline without microservices complexity."*

### Source 9 — Cloudflare Workers / Vercel constraints for B2B SaaS
- **Tier:** 4 (engineering guides, multiple aggregated sources)
- **Provenance:** morphllm.com/comparisons/cloudflare-workers-vs-vercel; northflank.com/blog/best-cloudflare-workers-alternatives; multiple 2026 architecture comparisons
- **What it tells us:** Workers wins on cold starts (V8 isolates, 330+ cities, sub-5ms) and cost ($15-50/month for production app with Workers + KV + D1 + R2). **Constraint set:** *"Libraries that depend on filesystem access, long-running processes, native binaries, or persistent in-memory state won't work on Workers."* For BokChoy specifically: argon2 native binding required per `[[player-auth]]` is a native binary; outbox worker per `[[wallet-mechanics]]` is a long-running process. **Both constraints fail on Workers/Vercel-edge — rules out serverless edge for BokChoy MVP.** Vercel Fluid Compute (containers) + Vercel Functions (Lambda-shape) are container-style and could work, but charge $20/user/month vs. Railway/Render/Fly at indie pricing.

## Findings

### Finding Q1.1 — Bun's production memory-leak class is genuinely contested in 2026-Q2

The evidence is mixed but converges on a specific risk profile:

- **Pro-Bun production cites:** Trigger.dev firestarter 5× (long-poll workload), pkgpulse case study ($18k/year savings on REST API workload), Anthropic acquisition Dec 2025.
- **Anti-Bun production cites:** OpenCode founder Jay V's public migration AWAY from Bun 2026, multiple GitHub-tracked memory leak issues across Bun 1.1.x range continuing to surface in 2026, Bun 1.1.13 (April 2026) shipping new memory fixes following community complaints — meaning the issues were live in production until that release.
- **Cross-cutting pkgpulse caveat:** *"long-running workloads amplifying problems that short benchmarks never reveal"* — the exact workload class for BokChoy's outbox worker.

**Confidence: high** — the evidence is mixed, but the mixture itself is the finding. Bun is production-viable for *specific workload shapes* (HTTP-API-as-fast-stateless-router) and production-risky for *other shapes* (long-running workers, native-binding-heavy stacks, memory-pressure-sensitive deployments).

### Finding Q1.2 — For BokChoy's specific workload shape, Node.js 22 LTS remains the production-grade default

BokChoy MVP runs:
- HTTP API (CRUD-on-Postgres for cockpit + SDK calls) — Bun would likely work well here
- Long-running outbox worker per `[[wallet-mechanics]]` `staged_jobs` — exactly the workload class pkgpulse + OpenCode flag as Bun-risky
- argon2 native binding per `[[player-auth]]` — a native module dependency that is Bun-Node-bridge territory
- Better Auth runtime (cookie-based sessions, transaction-heavy auth flows) — Issue #2283 is bunx-CLI-only, not runtime, but the integration surface for Better Auth-on-Bun has tracked bugs that don't exist on Node

**Per Contradiction protocol (production code beats blog):** Trigger.dev firestarter 5× win is one specific workload (long-poll connection broker) at one company; OpenCode migration regret + multiple production memory leak issues represent a broader pattern across more workloads. For BokChoy's mixed workload, the broader pattern wins.

**Confidence: high** — same conclusion as `[[backend-stack-research]]` Finding Q1.1, now reinforced with new evidence (OpenCode regret, ongoing 1.1.x memory leak issues, Bun 1.1.13 fixes still landing in 2026-04). User directive "Bun not Node" was the hypothesis under test; evidence does not warrant amending `[[backend-stack]]`.

### Finding Q1.3 — Bun's Better Auth + Drizzle CLI bug (Issue #2283) is moot for BokChoy

Issue #2283 surfaces in surveyed scope as "Bun + Better Auth + Drizzle + PostgreSQL bug" but is `bunx`-CLI-specific (Better Auth's schema-generation CLI fails on Bun due to native module compilation). **Per `[[backend-stack]]` decision: schema migrations via `drizzle-kit` only, not Better Auth CLI.** BokChoy's chosen migration path doesn't trigger this bug. **Confidence: high** — primary issue cite + cross-reference to vaulted decision.

### Finding Q2.1 — Modular monolith is the unambiguous 2026 consensus for solo-dev B2B SaaS at MVP

Consistent across all surveyed sources (DHH, multiple 2026 industry guides). Modular monolith specifically (not flat monolith): *"a single deployable application internally divided into well-defined, loosely coupled modules, each owning its own domain logic, data access, and interfaces."* For BokChoy: modules align with `[[wallet-mechanics]]` (wallet/transactions), `[[player-auth]]` (auth/identity), `[[catalog-versioning]]` (catalog/items), `[[loot-rng-construction]]` (loot/RNG), cockpit web routes, SDK API routes, outbox worker, scheduled jobs. **Confidence: high** — DHH cite + 2026 consensus + 30-50% overhead cost signal for premature splitting.

### Finding Q2.2 — Outbox worker co-hosted with HTTP API at MVP scale, separable post-MVP

Per Source 7 + `[[wallet-mechanics]]` `staged_jobs` schema: at 1-2 replicas (BokChoy MVP scale), co-hosted relay is production-grade. SKIP LOCKED handles coordination. Migration triggers:
- >5 replicas: split worker to separate process (Source 7 threshold)
- Outbox processing latency budget exceeds threshold under load: WAL-CDC alternative
- Outbox volume grows past N events/sec: warrant own scaling axis

**For BokChoy MVP:** ship co-hosted; instrument outbox-processing latency + queue depth; flag splitting decision as a revisit-when condition.

**Confidence: high** — production cites converge on this pattern for the scale BokChoy operates at.

### Finding Q2.3 — Serverless edge (Workers, Vercel Edge) is ruled out for BokChoy MVP

Per Source 9 constraint set:
- argon2 native binding (required per `[[player-auth]]` for password hashing) — incompatible with Workers V8 isolates
- Outbox worker (long-running by design per `[[wallet-mechanics]]`) — incompatible with serverless invocation model
- Better Auth + Drizzle compatibility on Workers is unverified in surveyed scope

**Container deployment is the production-grade fit** — Railway, Render, Fly.io, or AWS Fargate / GCP Cloud Run all support Node.js 22 + Postgres-via-connection-pool. **Vercel/Cloudflare Workers ruled out at MVP**, revisit if BokChoy ships an edge-latency-sensitive surface (e.g., region-distributed cockpit content). **Confidence: high** — constraint analysis + native-binding incompatibility.

### Finding Q2.4 — Frontend stack (cockpit web) coupled to backend service shape but not yet decided

Out of scope for this research, but coupling-flag: if cockpit ships as Next.js, Vercel becomes the natural deploy target (Vercel Fluid Compute supports Next.js + serverless functions). If cockpit is a SPA (React/Solid + Vite), it's static-hostable separately from the backend monolith. Either is viable; future research session should derive cockpit framework decision separately.

## Conflicts

### Trigger.dev pro-Bun cite vs. OpenCode anti-Bun cite

Both 2026 production cites at indie/SMB SaaS scale. Trigger.dev kept Bun (after fixing memory leak); OpenCode migrated away from Bun (citing memory + crashes + Windows). **Per Contradiction protocol (production code beats docs, multiple production examples beat one):** the *pattern* of memory-leak issues across multiple Bun 1.1.x releases + multiple framework integrations weighs more than a single positive case study. For BokChoy's solo-dev MVP risk profile, the conservative read is: Bun is excellent for specific workloads (Trigger.dev firestarter long-poll connection broker is the canonical positive case), risky for others (general mixed workload + long-running workers + native bindings, which is BokChoy's shape).

### Anthropic acquisition (positive) vs. ongoing memory-leak fixes through 2026-04 (negative)

Anthropic acquired Bun Dec 2025, signaling engineering investment. Bun 1.1.13 (April 2026) shipped memory fixes "following developer complaints." **The acquisition is a positive forward-looking signal but does not close existing production risk** — fixes still landing 5+ months post-acquisition indicates Bun's memory-leak class is not a one-and-done bug but an ongoing engineering effort. **Per Contradiction protocol:** weight current production state, not future-stewardship promise. Re-evaluate Bun in 6-12 months as Anthropic's investment converts to stability.

### DHH "majestic monolith undefeated" (2023, reaffirmed 2026) vs. some surveyed industry sources noting microservices are still preferred at certain scales

DHH's framing is absolute ("the absolute last resort"); industry consensus at moderate scale is more nuanced. **Per Contradiction protocol:** DHH cite is tier-3 (multi-decade production experience post-mortem); industry guides are tier-4 (advocacy / aggregation). For solo-dev MVP at BokChoy's scale (under 8 engineers, under $10M ARR per the 2026 industry framing), DHH's framing applies in full. The contradiction surfaces only at scale-profiles BokChoy is not at and won't be at within MVP horizon.

## Conditions

### Q1 (runtime) conditions
- **Bun wins when:** specific workload is HTTP-API-router with low memory pressure; team has time to debug runtime-level issues; SaaS is in greenfield growth phase with willingness to accept production-stability risk; Trigger.dev firestarter pattern (long-poll, high-concurrency, latency-sensitive single service).
- **Node.js 22 LTS wins when:** mixed workload (HTTP + long-running workers + native bindings); solo-dev or small-team risk profile that can't absorb runtime-level production issues; no specific perf hotspot warranting runtime swap; conservative MVP launch posture.
- **For BokChoy:** mixed workload + solo-dev + MVP launch risk profile + native binding (argon2) + long-running outbox worker. **Node.js 22 LTS is the production-grade-defensible default.**

### Q2 (service shape) conditions
- **Modular monolith wins when:** team < 8 engineers, SaaS under $10M ARR, no distinct team-ownership-per-domain, no independent scaling axis required across modules.
- **Microservices win when:** 15+ engineers, distinct team ownership per domain, independent scaling needs from day one (e.g., one service is CPU-bound, another I/O-bound, another bandwidth-bound).
- **Serverless edge wins when:** workload is request-response API only, no native bindings, no long-running processes, edge-latency is product-critical.
- **For BokChoy:** solo-dev + MVP + mixed workload. **Modular monolith with co-hosted outbox worker, deployed as container, is the production-grade-defensible default.**

## Operational implications

### For `[[backend-stack]]` runtime decision

**Reaffirm Node.js 22 LTS as MVP default. Do NOT amend `[[backend-stack]]` to Bun-default.** Reasoning:

- User directive "Bun not Node" was the hypothesis under test
- Re-research surfaced new evidence (OpenCode production-regret cite, ongoing memory-leak class fixes through Bun 1.1.13 in 2026-04)
- New evidence reinforces the original `[[backend-stack]]` Node.js 22 default rather than warranting amendment
- Bun stays in scope as opt-in upgrade for specific post-MVP workloads (Trigger.dev firestarter pattern), per existing `[[backend-stack]]` revisit-when condition

### For new `[[backend-service-shape]]` decision (handed to `/design`)

Vault `[[backend-service-shape]]` decision entry per `[[player-auth]]` + `[[backend-stack]]` shape. Picks:

1. **Modular monolith.** Single TypeScript Node.js 22 process per replica. Module boundaries align with vault entries: `wallet/`, `auth/`, `catalog/`, `loot/`, `cockpit/`, `sdk/`, `outbox/`, `dsr/`. Each module owns domain logic + DB access via Drizzle + interfaces between modules are typed function calls (not network calls).
2. **Outbox worker co-hosted** in same Node.js process at MVP scale (1-2 replicas). SKIP LOCKED via `[[wallet-mechanics]]` `staged_jobs` polling at 100-500ms cadence. Migration to separate-worker process at >5 replicas (Source 7 threshold) — flag as revisit-when condition.
3. **Container deployment** on `[[host-platform]]` Supabase-managed Postgres + container PaaS (Railway, Render, Fly.io). NOT serverless-edge (argon2 + outbox-long-running rule out Workers/Vercel-Edge).
4. **Module isolation discipline:** modules call each other via typed exports, not HTTP-roundtrip. Cross-module DB access goes through module's exported repository functions (not direct table access from another module). Citadel-pattern reserve: if a module ever needs to be extracted (post-MVP, per DHH conditions), the typed-interface boundary makes extraction mechanical, not architectural.

### Explicit non-decisions (deferred to future research/design)

- Frontend cockpit web framework (Next.js vs SPA + Vite vs other) — separate decision; coupling-flag to deploy target
- Backend service split conditions (when to extract modules to separate processes) — covered by revisit-when conditions, not decided pre-emptively
- WAL-CDC outbox upgrade path — post-MVP scaling decision, not MVP

## Reproducibility note

Reproducible. Tool sequence:

1. **Q1 production cites (Bun pro):** WebFetch trigger.dev/blog/firebun (already in `[[backend-stack-research]]`); WebSearch "Bun production B2B SaaS 2026 postgres-js Better Auth" surfaces pkgpulse 2026 guide.
2. **Q1 production cites (Bun con):** WebSearch "Bun production memory leak HTTP issues 2026" surfaces OpenCode regret + multiple GitHub issues.
3. **Q1 specific bug check:** `gh issue view 2283 --repo better-auth/better-auth` for Issue #2283 wontfix state; cross-reference to `[[backend-stack]]` drizzle-kit-only commitment.
4. **Q1 Anthropic acquisition signal:** WebSearch "Anthropic Bun 1.1.13 memory fixes 2026"; theregister.com / devclass.com coverage.
5. **Q2 production cites:** WebFetch world.hey.com/dhh/how-to-recover-from-microservices-ce3803cc; WebSearch "monolith vs microservices solo developer indie B2B SaaS 2026."
6. **Q2 outbox topology:** WebSearch "outbox pattern worker same process separate service Postgres SaaS production 2026"; event-driven.io + microservices.io references.
7. **Q2 serverless constraint set:** WebSearch "Cloudflare Workers Vercel serverless B2B SaaS production 2026" surfaces native-binary + long-running constraints.

**Judgments that don't fully reproduce:**
- Weighing OpenCode regret vs. Trigger.dev success — both are 2026 production cites with opposite trajectories. Decision-grade weighting requires the reader to apply BokChoy's risk profile (solo dev, MVP launch, mixed workload) — different reader contexts may weight differently.
- "Modular monolith is the unambiguous consensus" — strong across surveyed sources, but the surveyed scope is 2026 industry guides + DHH; could be undermined if a tier-1 production cite (named SaaS post-mortem) surfaces with a contradicting trajectory.

## Open threads

1. **Bun re-evaluation in 6-12 months** — Anthropic's investment may close the memory-leak class. Re-check if `[[backend-stack]]` Bun-eligibility revisit-when condition triggers.
2. **WAL-CDC outbox upgrade path** — post-MVP scaling research. When outbox volume exceeds N events/sec or polling overhead exceeds latency budget, evaluate Postgres logical replication-based CDC.
3. **Frontend cockpit framework decision** — separate research session; couples to deploy target.
4. **Module-extraction triggers** — operational signals warranting module extraction to separate process. Cover in implementation-phase runbooks.
5. **Container PaaS pick** — Railway vs Render vs Fly.io vs Cloud Run for BokChoy specifically. Open thread for implementation phase; not decision-grade research at this point.
6. **Better Auth + Bun runtime compatibility** — Issue #2283 is bunx-CLI-only, but the broader Better Auth + Bun runtime integration surface in 2026-Q2 has not been deeply tested in surveyed scope. Re-investigate if Bun re-evaluation triggers.
