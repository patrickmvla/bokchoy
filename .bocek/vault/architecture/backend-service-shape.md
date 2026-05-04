---
type: decision
features: [backend-stack, backend-service-shape]
related: ["[[backend-service-shape-research]]", "[[backend-stack]]", "[[backend-stack-research]]", "[[player-auth]]", "[[wallet-mechanics]]", "[[multi-tenant-rls-research]]", "[[host-platform]]", "[[catalog-versioning]]", "[[loot-rng-construction]]", "[[idempotency-strategy]]", "[[wedge-decision]]", "[[mvp-feature-sequence]]"]
created: 2026-05-03
confidence: high
---

# Backend service shape: modular monolith + co-hosted outbox + container deployment

## Amendment 2026-05-03 (continuation) — Render locked as container PaaS

User picked **Render** for backend container PaaS deploy 2026-05-03 (continuation). Defense: existing-subscription resource-constraint (cost-driven, same shape as `[[host-platform]]` Supabase pick).

This resolves the Decision Section 5 PaaS open thread. **`apps/backend/` deploys via `render.yaml` config in repo root or per-service.**

Region matching with `[[host-platform]]` Supabase region required for low-latency DB connection. Verify Render supports the Supabase region BokChoy uses; configure both in matching region. Open thread if region mismatch surfaces.

Original Section 5 PaaS-pick deferral framing now closed; `[[backend-service-shape]]` cascade obligation 6 (PaaS pick) RESOLVED.

## Amendment 2026-05-03 — runtime flipped to Bun + Hono locked

Per `[[backend-stack]]` 2026-05-03 amendment: runtime flipped from Node.js 22 LTS → **Bun 1.3+** with **Hono locked as HTTP framework** + **cross-runtime portability discipline as mitigation**. Node.js 22 LTS retained as documented fallback (Dockerfile variant CI-tested but not deployed). Four Bun-specific failure modes (F-Bun-1 through F-Bun-4) named in `[[backend-stack]]` amendment.

This entry's references to "Node.js 22 LTS" in the Decision section below now read as "Bun 1.3+ (Node.js 22 LTS fallback documented)." Module structure, outbox topology, container deploy, module isolation discipline are unchanged — service-shape decisions are runtime-agnostic by design.

**Cross-runtime discipline applies at module level too:** modules import from `@hono/*`, `postgres`, `drizzle-orm`, `better-auth`, `node:fs`, `node:crypto`, never from `bun` or `bun:*`. ESLint rule blocks Bun-specific imports in CI.

---

## Decision

BokChoy MVP backend is a **modular monolith** running as a single Node.js 22 LTS TypeScript process per replica, deployed as a container.

### 1. Service topology: modular monolith, not microservices, not serverless edge

- Single deployable application. One git repo. One build artifact. One deploy unit.
- Internally divided into bounded modules with explicit interfaces.
- Communication between modules: typed function calls (in-process), not network calls.
- All MVP features ship as one executable.

### 2. Module boundaries (align with vault feature boundaries)

```
src/
├── auth/         # Better Auth setup, player auth flows, anonymous plugin,
│                 #   organization plugin, SDK API key validation, argon2id
│                 #   per [[player-auth]]
├── players/      # players table CRUD, identity primitives, DSR export/erase
│                 #   stored functions, anonymization per [[deidentify-mechanism-research]]
├── wallet/       # wallet_credit/wallet_debit/etc. stored functions,
│                 #   transactions table, polymorphic related_id pattern
│                 #   per [[wallet-mechanics]]
├── catalog/      # items/currencies/bundles/stores/loot_tables, Draft/Published
│                 #   lifecycle, JSON Patch diffs per [[catalog-versioning]]
├── loot/         # loot_roll function, HMAC_DRBG RNG, hybrid A+B canonicalization,
│                 #   reference pity impl per [[loot-rng-construction]] +
│                 #   [[pity-engine-scope]] + [[within-roll-composition-scope]]
├── outbox/       # staged_jobs poller, webhook delivery, dead-letter handling
│                 #   per [[wallet-mechanics]] §4a/§4b/§4c
├── cockpit/      # web UI routes (admin + customer-developer dashboards)
├── sdk/          # SDK-facing HTTP API endpoints (player + game-server calls)
├── idempotency/  # Idempotency-Key middleware per [[idempotency-strategy]]
└── infra/        # DB connection, withTenant transaction wrapper for RLS,
                  #   telemetry, audit log

src/db/           # Drizzle schema files (Better Auth + BokChoy tables) + migrations
src/lib/          # Shared utilities (HMAC, canonicalization, error types)
src/types/        # Shared TypeScript types (request/response shapes,
                  #   shared enums, branded types per idioms/typescript.md)
```

Module boundaries follow vault feature boundaries one-to-one. Each vault decision entry maps to a single src module.

### 3. Module isolation discipline

- **Cross-module communication is typed function calls.** Module exports a public interface (`index.ts`); other modules import from `index.ts`, never directly from internal files.
- **No HTTP/gRPC/IPC between modules.** Network calls are reserved for genuinely external services (Postgres, customer-developer webhooks, AWS Secrets Manager).
- **Cross-module DB access goes through the owning module's repository functions.** No module reads/writes another module's tables directly. Example: `cockpit/` does not query `wallet_credits` table; it calls `wallet/repository.getRecentCredits(playerId)`.
- **CI lint enforces module-boundary discipline:** ESLint custom rule + `eslint-plugin-import/no-restricted-paths` blocks direct imports from `src/<module>/internal/*`.

This is the **citadel-pattern reserve** per DHH. Typed-interface boundary makes future module extraction (post-MVP, if a module's load justifies its own scaling axis) mechanical, not architectural.

### 4. Outbox worker co-hosted with HTTP API at MVP

- **Single Node.js process runs both:** HTTP API (Fastify or Hono) + outbox poller.
- **Outbox poller cadence:** 250ms initial poll interval (revisit on operational data); each poll uses `SELECT ... FOR UPDATE SKIP LOCKED LIMIT N` against `staged_jobs` per `[[wallet-mechanics]]` schema.
- **At 1-2 replicas:** SKIP LOCKED handles coordination — each replica skips rows already locked by other replicas. No external coordinator needed.
- **Worker isolation:** outbox runs as a long-lived async loop, not blocking HTTP request handlers. Node.js single-process supports both (HTTP routes are event-loop-driven; outbox is interval-driven; both share the same Postgres connection pool).
- **Migration trigger to separate-worker process** (post-MVP, listed in revisit-when): >5 replicas OR outbox-poll dominates DB load OR outbox-processing latency budget exceeded OR webhook delivery requires its own scaling axis (e.g., catastrophic webhook failure cascade per `[[webhook-retry-norms-research]]`).
- **Further-scale path:** WAL-CDC via Postgres logical replication (eliminates polling, exact transaction-commit ordering preserved). Documented as post-MVP scaling path; not implemented at MVP.

### 5. Deployment: container on PaaS

- **Build artifact:** Docker container with Node.js 22 LTS base image (`node:22-bookworm-slim` or equivalent), TypeScript compiled to JS via `tsc`.
- **Deploy target:** container PaaS supporting Node.js 22 + Postgres connection pool. Candidates per `[[backend-service-shape-research]]` open thread 5: Railway, Render, Fly.io, Google Cloud Run, AWS Fargate. **Specific PaaS pick deferred to implementation phase** — selection criteria: indie-tier pricing, deploy-from-git workflow, region matching `[[host-platform]]` Supabase region for low-latency DB connection.
- **Replicas at MVP:** 1 (cold start) → 2 (after first paying customer + zero-downtime deploy requirement). Horizontal scaling beyond 2 replicas triggers outbox-worker-extraction revisit.
- **Process supervision:** PaaS handles. No PM2 / systemd / custom process supervision in app.

### 6. Out-of-scope at MVP (vaulted as rejected)

- **Serverless edge** (Cloudflare Workers, Vercel Edge): ruled out due to argon2 native binding + outbox long-running pattern incompatibility per `[[backend-service-shape-research]]` Finding Q2.3.
- **Microservices** (separate auth service + game-backend service + cockpit service): ruled out due to 30-50% early-development overhead per `[[backend-service-shape-research]]` Finding Q2.1; solo-dev MVP scale doesn't warrant.
- **Vercel Functions / Lambda** (serverless containers): ruled out due to outbox-long-running pattern; container-PaaS provides equivalent dev experience without forcing function-style invocation.
- **Worker-as-separate-service at MVP** (extracted outbox process from day one): ruled out due to <5-replica scale; SKIP LOCKED handles coordination without separate process. Revisit post-MVP.

## Reasoning

### Why modular monolith

Per `[[backend-service-shape-research]]` Finding Q2.1: unambiguous 2026 industry consensus for solo-dev B2B SaaS at MVP. Tier-3 production-cite via DHH (37signals — multi-decade B2B SaaS experience): GitHub + Shopify named as monolith proof at scale. Tier-4 industry guides converge: SaaS under $10M ARR, under 8 engineers, no distinct team-ownership-per-domain → modular monolith default. Microservices add 30-50% early-dev overhead per surveyed scope.

For BokChoy specifically: solo dev + 20-month runway per `[[wedge-decision]]` + indie/SMB ICP per `[[indie-smb-pricing-research]]`. Splitting at MVP fails every prerequisite for legitimate splitting per DHH (no scale evolution yet, no isolated hot-spot, no team-ownership-per-domain).

**Modular** (not flat) is load-bearing. Module isolation discipline preserves the future-extraction option without paying the network-call cost now. Per DHH: *"Replacing method calls with network calls makes everything harder, slower, and more brittle."* Methods now; networks later if and only if forced.

### Why module boundaries align with vault feature boundaries

Each vault decision entry (`[[wallet-mechanics]]`, `[[catalog-versioning]]`, `[[player-auth]]`, etc.) defines a coherent feature with its own schema + invariants + failure modes. Mapping vault features to src modules is **not arbitrary** — it preserves the "decisions stay together" property that `[[player-auth]]` cascade-obligations encode. When the implementation queue says "implement `bokchoy.wallet_credit` per `[[wallet-mechanics]]`," that work happens in `src/wallet/`, not scattered across `src/`. **Confidence: high** (inferred from vault structure + DDD bounded-context principle).

### Why outbox co-hosted at MVP

Per `[[backend-service-shape-research]]` Finding Q2.2: outbox co-hosted with HTTP API works for <5 replicas; SKIP LOCKED solves coordination. Production-cited pattern (event-driven.io, microservices.io, Brandur per `[[wallet-source-of-truth-research]]`). At BokChoy's MVP scale (1-2 replicas), separate-worker extraction would be premature optimization adding deploy + monitoring complexity without operational benefit. **Confidence: high** — production-cited at this scale.

### Why container deployment, not serverless edge

Per `[[backend-service-shape-research]]` Finding Q2.3: Cloudflare Workers / Vercel Edge V8-isolate constraint set rules out:
- argon2 native binding required by `[[player-auth]]` for password hashing — native binary, V8 isolates can't load
- Outbox long-running pattern per `[[wallet-mechanics]]` `staged_jobs` polling — V8 isolates are request-response, not long-running
- Better Auth + Drizzle on Workers is unverified in surveyed scope — additional unknown

Container PaaS (Node.js 22 + Postgres connection pool) is the production-grade fit. **Confidence: high** — constraint analysis + native-binding incompatibility evidence.

### Why specific PaaS deferred to implementation

Implementation-phase selection criteria don't change the architecture: any container PaaS supporting Node.js 22 + Postgres works. Locking PaaS now would be premature; the choice depends on operational details (region matching Supabase, indie-tier pricing, CI integration) that don't shape the architecture. **Confidence: high** — separation-of-concerns between architecture and ops.

## Engineering substance applied

- **Consistency:** module boundaries are bounded contexts in DDD terms; cross-module calls go through typed interfaces; no shared mutable state across modules; Postgres SERIALIZABLE on RLS-protected tx (per `[[wallet-mechanics]]` mechanism + `[[multi-tenant-rls-research]]` pattern). Idempotency per `[[idempotency-strategy]]` D2-α at HTTP layer above all modules.
- **Failure semantics:** monolith deploy is all-or-nothing per release; rollback is single-artifact swap. Outbox at-least-once-via-SKIP-LOCKED + idempotency-key dedup + `[[wallet-mechanics]]` per-kind max_attempts. Failed module call propagates to HTTP error or outbox dead-letter — no silent failure modes between modules.
- **Concurrency:** Node.js single-process event loop handles HTTP concurrency. Outbox poller is single-async-loop per replica; SKIP LOCKED prevents cross-replica double-processing. No multi-process worker pool at MVP (Node cluster-mode deferred — pre-empt-cost-of-IPC > value at 1-2 replicas).
- **Observability:** structured logging (JSON to stdout, PaaS picks up), per-module log namespace (`logger.child({module: 'wallet'})` pattern), OpenTelemetry tracing for HTTP requests + outbox processing, metrics for queue depth + processing latency + error rates per module. Page on outbox queue depth >threshold OR module-error-rate >threshold OR HTTP error rate >threshold.
- **Storage:** Postgres-only via `[[host-platform]]` Supabase. Connection pool tuned for replica count (10-20 connections per replica typical at MVP).
- **Networking:** HTTP via Fastify or Hono (TS-native, fast routers). TLS terminated at PaaS ingress. Internal module calls = function calls = zero network overhead.
- **Security:** module-boundary discipline reduces blast radius — a vulnerability in one module is bounded by that module's exported interface. Auth checks at module-boundary (every public function takes authenticated `actor` param; no implicit "trust the caller" pattern). SDK API key validation in `auth/` module; cross-module callers must pass through that module.

## Production-grade gates

- **Idiomatic** — modular monolith is the consensus 2026 default for solo-dev B2B SaaS at MVP per `[[backend-service-shape-research]]` Finding Q2.1. Container deployment via PaaS is the consensus 2026 default for Node.js apps at this scale. Outbox-co-hosted-with-SKIP-LOCKED is documented production pattern (event-driven.io, microservices.io, Brandur). Module-as-bounded-context is DDD canon. **(idiom-cited; confidence: high)**

- **Industry-standard** — DHH/37signals (Basecamp, HEY) named monolith production cite; GitHub + Shopify named at scale (per DHH cite). Trigger.dev pre-V4, Cal.com (TS+Postgres+Better Auth), Linear early-stage all surveyed as monolith production cites at indie/SMB B2B SaaS scale. **(production-cited × 5; confidence: high)**

- **First-class** — Node.js + Postgres + container deployment is the platform's intended path; nothing fights an abstraction. Module-as-typed-export is plain TypeScript; no custom DI container or service registry. SKIP LOCKED is Postgres native primitive (no custom locking protocol). **(first-class-cited; confidence: high)**

## Rejected alternatives

### Alternative A — Microservices (separate auth + wallet + catalog + cockpit + sdk services)

**What:** Each module from the modular-monolith decomposition extracted to a separate service. HTTP/gRPC between services. Independent deploy + scaling per service.

**Wins when:** team has 15+ engineers with distinct ownership-per-domain; one or more services has independent scaling axis (e.g., loot RNG is CPU-bound while wallet is I/O-bound and they need separate replica counts); strict latency-isolation requirements (a slow catalog query cannot impact wallet-credit latency).

**Why not here:** Solo dev per `[[wedge-decision]]` 20-month runway = no team-ownership-per-domain, no parallel-service-development benefit. Workload at MVP is below scaling thresholds where independent scaling pays back. 30-50% early-dev overhead (per `[[backend-service-shape-research]]` Source 8) is unaffordable for solo-dev MVP. DHH's framing applies in full: *"the absolute last resort."*

### Alternative B — Flat monolith (no module isolation discipline)

**What:** Single Node.js application without module boundaries; all features share data structures + utility files freely.

**Wins when:** product is small enough that module-boundary maintenance overhead exceeds module-boundary benefit (e.g., <5 features that don't have natural separations).

**Why not here:** BokChoy has at least 9 distinct vault-feature boundaries already (auth, players, wallet, catalog, loot, outbox, cockpit, sdk, idempotency); flat monolith would mix concerns and lose the future-extraction option. Modular discipline costs little (TypeScript exports + ESLint rule) and preserves citadel-pattern reserve. Flat-monolith is undefended for any project at BokChoy's already-known feature surface.

### Alternative C — Serverless edge (Cloudflare Workers, Vercel Edge)

**What:** Deploy all HTTP handlers as V8-isolate-based functions on Cloudflare Workers or Vercel Edge runtime. No long-running processes; outbox via scheduled-invocation or Durable Objects.

**Wins when:** workload is purely request-response API; argon2 not required (or use Web Crypto's PBKDF2 instead, which is supported in Workers); no long-running worker patterns; sub-5ms cold starts are product-critical (e.g., region-distributed cockpit content); cost-sensitivity favors $15-50/month Workers tier over $20-50/month container PaaS.

**Why not here:** argon2 native binding required per `[[player-auth]]` rules out V8-isolate runtime. Outbox long-running pattern per `[[wallet-mechanics]]` `staged_jobs` doesn't fit Workers invocation model (would require Durable Objects + alarm-based cron, adding complexity rather than removing it). Better Auth + Drizzle on Workers is unverified in surveyed scope. **Cost optimization not justification at MVP** — container PaaS at indie tier is $5-30/month range, not materially more expensive than Workers.

### Alternative D — Vercel Functions / Lambda (serverless containers, not edge)

**What:** Deploy HTTP handlers as serverless functions; outbox via separate scheduled Lambda or Cloud Scheduler-invoked function.

**Wins when:** team is on Next.js stack (Vercel Functions integrate naturally); wants deploy-on-git workflow without managing container infra; willing to accept cold-start latency on first request after idle.

**Why not here:** Outbox long-running pattern doesn't fit serverless invocation; would require splitting outbox to scheduled-Lambda + accepting per-poll cold-start cost. SKIP LOCKED + 250ms-poll cadence + serverless = either constant Lambda invocations (defeats the cost model) or longer poll intervals (adds latency to webhook delivery). Container PaaS is dev-experience-equivalent without forcing function-style invocation.

### Alternative E — Outbox worker as separate service from day one

**What:** From MVP, run outbox worker as its own deploy unit (separate container, separate replica set).

**Wins when:** outbox volume justifies independent scaling axis from day one; team has ops capacity to monitor two deploy units instead of one.

**Why not here:** at <5 replicas (BokChoy MVP scale), SKIP LOCKED handles coordination without process separation. Two-service deploy doubles ops surface (logs, metrics, deploys, secrets) without operational benefit. Migration to separate worker is a future scaling decision (revisit-when condition listed below), not an MVP requirement.

### Alternative F — WAL-CDC for outbox at MVP

**What:** Use Postgres logical replication (WAL streaming) to push outbox events to a relay, instead of polling `staged_jobs` table.

**Wins when:** polling overhead dominates DB load; latency budget for webhook delivery requires sub-100ms outbox processing; team has familiarity with Debezium or similar CDC tooling.

**Why not here:** at MVP scale (low webhook volume), 250ms polling overhead is negligible. WAL-CDC adds operational complexity (Debezium configuration, schema registry, replication slot management) without material MVP benefit. Listed as future-scale upgrade path; not MVP.

### Alternative G — Per-module Postgres schema isolation

**What:** Each module owns a separate Postgres schema (`auth`, `wallet`, `catalog`, etc.); no module reads/writes another module's schema directly.

**Wins when:** schema-level isolation is the bounded-context boundary you want to enforce; future schema-extraction (split DB per service) is a near-term plan.

**Why not here:** RLS per `[[multi-tenant-rls-research]]` is the per-tenant isolation mechanism; per-module schema would add a second isolation axis without commensurate value. Cross-module joins (e.g., `transactions` joining to `players`) are easier in single-schema; multi-schema joins force role/grant management. Schema-per-module is reserved for a true split-DB scenario, which is far post-MVP.

## Failure modes

### F1 — Module-boundary discipline erodes over time

A developer (solo founder included) writes a cross-module direct DB query or imports from another module's internal files. Module boundaries decay. Future extraction becomes architectural cost instead of mechanical refactor.

**Mitigation:** ESLint `import/no-restricted-paths` rule blocks imports from `src/<module>/internal/*`. Custom lint rule (or schema check) flags direct table queries from non-owning modules. CI enforcement. Code review checklist item: "does this PR cross a module boundary? if yes, does it use the typed export?" Solo-dev case: discipline-by-tooling rather than discipline-by-team-review.

### F2 — Outbox worker starves HTTP request handlers

If outbox processing becomes I/O-heavy or webhook delivery hits slow customer endpoints, the same Node.js event loop runs HTTP requests + outbox. Slow webhook delivery could degrade HTTP latency.

**Mitigation:** outbox HTTP calls have aggressive timeouts (5s default per `[[webhook-retry-norms-research]]` short-window posture); outbox poll loop yields between batches; metrics on HTTP request latency + outbox processing latency; alert if HTTP p99 latency degrades coincident with outbox queue depth growth. Migration to separate worker if signals trigger (revisit-when below).

### F3 — Container deploy unit grows unwieldy as features accrete

Single-deploy artifact size grows; deploy time increases; cold-start time increases. Eventually monolith size becomes deploy-time bottleneck.

**Mitigation:** monitor build artifact size + deploy time per release. Tree-shaking via ESM build; lazy-load heavy modules (e.g., loot RNG only loaded by `loot/` module). At threshold (>1GB image OR >5min deploy time), evaluate splitting. Target threshold: not before the first paying-customer-tier-Studio+ traffic appears (per `[[indie-smb-pricing-research]]`).

### F4 — Outbox replica coordination breaks at >5 replicas

SKIP LOCKED becomes inefficient at higher replica counts (every replica polls; many polls return empty as another replica grabbed the work). DB load grows linearly with replica count.

**Mitigation:** revisit-when condition triggers separate-worker extraction. Pre-emptive option: use Postgres advisory locks to elect a single "leader" worker among replicas; non-leader replicas skip outbox. Alternative: reduce poll cadence as replica count grows (250ms → 1s → 5s). Final scaling path: WAL-CDC.

### F5 — Module-boundary forces too aggressive interface design

Premature interface stabilization between modules makes refactoring across module boundaries painful. Anti-pattern: every internal function becomes a public-typed-export prematurely.

**Mitigation:** module exports are deliberately small (just the operations other modules need). Internal module structure is free to refactor. Module's public interface is reviewed pre-export; internal files are non-API. ESLint + TypeScript privacy markers (`internal` directory convention).

### F6 — Container PaaS lock-in

Choice of Railway / Render / Fly.io creates implicit dependencies (specific env-var conventions, deploy CLI, log format) that are mildly painful to migrate.

**Mitigation:** keep deployment portable — Dockerfile uses standard Node.js base image; env vars use `dotenv` or Postgres `secrets` tables, not PaaS-specific magic; logs go to stdout (PaaS-agnostic). Migration target options stay open. Per `[[host-platform]]` portability philosophy.

### F7 — Cold-start latency on first request after idle

Container PaaS scaling-to-zero (if enabled at indie pricing) introduces 1-5s cold start. First customer request after idle period sees latency spike.

**Mitigation:** disable scaling-to-zero at MVP — keep one replica warm at all times. Cost: ~$5-20/month for always-on indie tier. Acceptable per `[[wedge-decision]]` 20-month runway. Revisit if cost becomes load-bearing.

### F8 — All-or-nothing deploy blast radius

Bug in any module → entire monolith rollback. Hot-fix on auth module ships catalog + wallet + cockpit changes.

**Mitigation:** feature flags for new module-level features (rollout by percentage, kill switch on regression); CI test gates per module before merge; staged deploy via PaaS preview environments; rollback within 5 min via PaaS deploy-history. Worse-case blast radius bounded by deploy speed, not architectural separation.

## Mitigations

(captured inline per failure mode; aggregated for runbook reference at implementation phase)

- ESLint + TypeScript privacy markers + custom lint rule for module-boundary enforcement (F1)
- Outbox HTTP call timeouts + per-batch yielding + paired metrics on HTTP latency vs outbox queue depth (F2)
- Build artifact size + deploy time monitoring + lazy-load heavy modules (F3)
- Revisit-when conditions for replica-count-based separate-worker extraction (F4)
- Module export discipline: deliberate-small-public-API + internal-directory convention (F5)
- Dockerfile + env-var portability for PaaS lock-in (F6)
- Always-on replica + cost cap (F7)
- Feature flags + staged deploy + PaaS rollback within 5 min (F8)

## Idiom citations

- **Modular monolith / DDD bounded contexts** — per industry consensus 2026 (`[[backend-service-shape-research]]` Source 8); module boundaries align with feature boundaries (DDD canon)
- **Citadel pattern (DHH)** — typed-interface boundary preserves future-extraction option without paying network-call cost now (`[[backend-service-shape-research]]` Source 1)
- **Outbox + SKIP LOCKED at <5 replicas** — production-cited via Brandur, event-driven.io, Microservices.io (`[[backend-service-shape-research]]` Source 7)
- `idioms/typescript.md` (would-cite if exists) — strict mode + typed exports + branded types where they pay back

## Revisit when

- **Module extraction trigger:** any module hits one of (a) independent scaling axis materially different from others, (b) >50% of one engineer's time spent in that single module while others contribute, (c) team grows to 15+ engineers with explicit per-domain ownership. DHH's three legitimate-extraction conditions.
- **Outbox separate-worker trigger:** >5 replicas OR outbox-processing latency budget exceeded OR outbox poll dominates DB load OR webhook delivery requires its own scaling axis (catastrophic webhook failure cascade per `[[webhook-retry-norms-research]]`).
- **WAL-CDC migration trigger:** outbox volume exceeds N events/sec (specific threshold to derive from operational data) OR webhook delivery latency budget tightens (e.g., <100ms p99).
- **Container PaaS migration trigger:** current PaaS pricing exceeds budget at scale, OR PaaS feature gap (e.g., region BokChoy needs not supported), OR PaaS reliability degradation.
- **Always-on replica cost trigger:** cold-start latency becomes acceptable (cost > customer-experience tradeoff flips).
- **Microservices revisit:** team grows past 15 engineers OR distinct-team-ownership-per-domain emerges OR catastrophic monolith failure mode that can't be mitigated within monolith.
- **Serverless edge revisit:** Bun-on-Workers is shipped + argon2 alternative validated + outbox pattern adapted to Durable Objects OR alarm-based cron + Better Auth + Drizzle production cites surface.

## Cascade obligations queued for implementation phase (NOT design)

1. **Module directory scaffold** — `src/<module>/{index.ts, internal/, repository.ts, schema.ts}` shape per module; ESLint config blocks cross-module internal imports
2. **Module export interface review** — for each of the 9 modules, identify the minimal public interface (what other modules legitimately call); document in module's `index.ts` JSDoc
3. **Outbox poller implementation** — async loop in `src/outbox/`, configurable poll cadence, SKIP LOCKED + retry/dead-letter logic per `[[wallet-mechanics]]` `staged_jobs` schema
4. **Outbox HTTP client** — webhook delivery with timeout + retry-with-jitter per `[[webhook-retry-norms-research]]` short-window posture
5. **Telemetry instrumentation** — OpenTelemetry per-module trace + metrics emission; PaaS-agnostic stdout log format
6. **PaaS pick** — Railway / Render / Fly.io / Cloud Run selection; criteria: indie pricing, region matching Supabase, deploy-from-git, env-var management, log retention. Document choice in implementation runbook.
7. **Dockerfile** — Node.js 22 LTS base image, multi-stage build (deps + build + runtime stages), non-root user, healthcheck endpoint, structured logging to stdout
8. **CI/CD pipeline** — GitHub Actions or PaaS-native; per-module test gates; staged deploy with rollback
9. **Always-on replica config** — PaaS settings to disable scaling-to-zero at MVP
10. **Feature flag infrastructure** — simple table-based flag system in `src/infra/` (ConfigCat / Unleash / similar deferred to post-MVP unless flag complexity grows)
