## Current state
- **Mode:** implementation
- **Feature:** bootstrap (sub-units 1, 2, 2.5, 3, 4, 6 COMPLETE; (5) CI scaffold next or jump to first feature)
- **Last resolved:** sub-unit (4) tooling executed end-to-end 2026-05-04 per `[[tooling]]` cascade obligations 1-4. Files written: `biome.json` at root (formatter + linter, `noRestrictedImports` rule blocks `bun` bare + `bun:*` glob, test files override rule off); `scripts/check-prepare-false.ts` cascade-10 scripted check (mirrors cascade-9 FORCE-RLS pattern); `scripts/tsconfig.json` so editor diagnostics resolve; root `package.json` adds `@biomejs/biome` to catalog (`^2.0.0`) + devDeps + `lint`/`lint:fix`/`lint:check`/`format`/`check:prepare-false` scripts. Drizzle config rewritten validate-at-boundary (no more `!` non-null assertion per `idioms/typescript.md`). Empty workspaces (`shared-types`, `auth-config`, `backend`, `cockpit`) got `src/index.ts` placeholders (`export {};`) so tsc has input files. **Verified:** `bun run lint:check` 25 files clean; `bun run typecheck` 5/5 workspaces successful; `bun run check:prepare-false` OK. Biome auto-fixed import sorting in `client.ts` + `index.ts` + `package.json` formatting on first run.
- **Open thread (cascade obligation 5):** verify GritQL plugin path (a) for cascade-10. Currently using path (b) Bash-style scripted check. GritQL plugin would be more elegant but is unverified at BokChoy's specific shape per `[[tooling-research]]` Q1. Park; revisit when scripted-check noise or maintenance burden warrants.
- **F1 type-level discipline OPEN THREAD:** branded tx types where RLS-protected table accessors require `TenantTx` from `withTenant` callback. Triggers when first RLS-protected feature schema lands (not in bootstrap scope).
- **In progress:** sub-unit (5) CI scaffold. Now meaningful — wires `bun install` + `lint:check` + `typecheck` + `check:prepare-false` + (eventually) tests + drizzle migrate on a managed Postgres. OR jump to first feature contract per `[[mvp-feature-sequence]]`.
- **Next on resume:** ask human direction — sub-unit (5) CI, OR start first feature.
- **Open flags:** mailpit `:latest` accepted; stack running on port 5433; cascade-10 GritQL verification deferred.
- **Last resolved:** sub-unit (6) `withTenant()` helper verified end-to-end 2026-05-04. `packages/db/src/with-tenant.ts` exports `withTenant(db, projectId, fn)`. All six smoke-test checks passed against the running container: (i) GUC `app.current_tenant` set inside tx matches projectId, (ii) GUC empty outside tx (transaction-scoped per `set_config(name, val, true)`), (iii)+(iv) parallel withTenant calls isolated (tenant-1 sees tenant-1, tenant-2 sees tenant-2), (v) thrown errors propagate from withTenant cleanly, (vi) GUC clears after rollback.
- **Sub-unit (4) tooling DEFERRED** by user 2026-05-04 — three positions surfaced (Biome / ESLint+Prettier / hybrid) with cascade implications across `[[backend-stack]]` cascade-10/F1 + `[[frontend-stack]]` cross-runtime discipline; user chose to defer. Sub-unit (5) CI scaffold makes more sense after (4) lands since lint step is content-empty without it.
- **Four implementation-time decisions applied + flagged this session:**
  - (i) two-env-var split (`DATABASE_URL` + `DATABASE_MIGRATION_URL`) — follows from `[[local-docker]]` Amendment §6 connection-user assignments.
  - (ii) dropped `.ts` import extensions in `src/index.ts` — TS-monorepo idiom.
  - (iii) used `drizzle({ client })` object-form per current Drizzle Supabase setup docs (https://orm.drizzle.team/docs/get-started/supabase-new) — `[[backend-stack]]` cascade-10's transcribed `drizzle(client)` is older positional form.
  - (iv) `withTenant(db, projectId, fn)` 3-param signature instead of contract-literal `(projectId, fn)` closing over module-level `db` — testability + DI ergonomics; load-bearing semantics (db.transaction + set_config + app.current_tenant) unchanged.
- **Vault errata owed (3 items, all small text fixes for one /design pass):**
  - **E1.** `[[backend-stack]]` Amendment 2026-05-04 says pin drizzle-kit to 0.45.2 — that release doesn't exist. drizzle-kit stable is 0.31.x; latest 0.31.10. Applied 0.31.10.
  - **E2.** `[[backend-stack]]` cascade-10 contract pattern uses `drizzle(client)` (older positional form). Current Drizzle docs canonical is `drizzle({ client })` object-form. Applied object-form.
  - **E3.** `[[local-docker]]` compose.yml port mapping `5432:5432` shadowed by host-installed Postgres on WSL2 (host's `/usr/lib/postgresql/16/bin/postgres` listens on 127.0.0.1:5432 directly, beating Docker's iptables NAT). Applied `5433:5432` and updated `.env.example`. F-Local-7 candidate (host-port-collision class).
- **In progress:** revisit (4) tooling, or skip to feature work per `[[mvp-feature-sequence]]`. Bootstrap is functionally complete for the workspace + db + tenant-isolation primitive. CI scaffold (5) is the only remaining bootstrap item and depends on (4).
- **Next on resume:** ask human direction — return to (4) tooling, jump to first feature contract per `[[mvp-feature-sequence]]`, or do a /design pass to consume the three errata.
- **Open flags:** mailpit `:latest` accepted 2026-05-04; stack still running healthy on port 5433; three errata await one /design pass.

## Bootstrap sub-unit log

### sub-unit (4) tooling — COMPLETE 2026-05-04
- Files: `biome.json` (root) + `scripts/check-prepare-false.ts` + `scripts/tsconfig.json` + four workspace `src/index.ts` placeholders + root `package.json` updated (catalog: `@biomejs/biome ^2.0.0`; scripts: `lint`/`lint:fix`/`lint:check`/`format`/`check:prepare-false`) + `packages/db/drizzle.config.ts` rewritten validate-at-boundary.
- Biome formatter ran cleanly on first `lint:fix`: organized imports in `client.ts` + `index.ts`, reformatted `package.json` to multi-line workspaces array, collapsed multi-line `console.error` in scripted check to single line within 100-char limit.
- Verified end-to-end: `lint:check` clean (25 files, 0 errors, 0 warnings), `typecheck` clean (5/5 workspaces), `check:prepare-false` OK.
- Senior-reviewer self-attack: noNonNullAssertion fired on `process.env.X!` in drizzle.config — fixed via runtime check (boundary validation per `idioms/typescript.md`); empty workspaces failed `tsc` with TS18003 "no input files" — fixed via `export {};` placeholders that future sub-units replace; editor diagnostics on `scripts/` dir resolved via `scripts/tsconfig.json`.

### sub-unit (6) withTenant helper — COMPLETE 2026-05-04
- File written: `packages/db/src/with-tenant.ts` exporting `withTenant<T>(db, projectId, fn)` — tx wrapper that runs `set_config('app.current_tenant', projectId, true)` then delegates to fn(tx). Re-exported from `packages/db/src/index.ts`.
- Tx type derived via `Parameters<Parameters<Db['transaction']>[0]>[0]` — no need to restate Drizzle's internal types per `idioms/typescript.md` "Let the types flow end-to-end".
- 3-param signature (db, projectId, fn) — implementation-time interpretation flagged; deviates from contract-literal `(projectId, fn)` closing over module-level db, kept for testability + DI ergonomics.
- Smoke test (`packages/db/_smoke.ts`, deleted after verification): 6/6 PASS — happy path, transaction scope, parallel isolation, error propagation, rollback cleanup. Required port mapping change (5432 → 5433, see E3 below) because host had `/usr/lib/postgresql/16/bin/postgres` on `127.0.0.1:5432` shadowing the Docker port forward.
- Senior-reviewer self-attack: peer-auth on Unix socket noted (bokchoy_app cannot connect via socket without OS user, irrelevant for backend which uses TCP); host-port-collision surfaced and fixed; tx scope semantics verified against `[[multi-tenant-rls-research]]` canonical `set_config(name, val, TRUE)` form.

### sub-unit (3) packages/db Drizzle + postgres-js — COMPLETE 2026-05-04
- Files written/updated: root `package.json` catalog (drizzle-orm 0.45.2, drizzle-kit 0.31.10, postgres ^3.4.0); `packages/db/package.json` (deps via catalog + db:generate/migrate/studio scripts); `packages/db/src/client.ts` (factory with `prepare: false`); `packages/db/src/index.ts` (re-exports); `packages/db/src/schema/index.ts` (placeholder `export {};`); `packages/db/drizzle.config.ts` (reads DATABASE_MIGRATION_URL); root `.env.example` (two env vars for role-split connection).
- `client.ts` matches `[[backend-stack]]` cascade-10 contract pattern verbatim (`postgres(connStr, { prepare: false })` + `drizzle(client)`). No schema wiring yet — empty schema = drizzle accepts. Schema typing layered when first table lands per `[[backend-stack]]` cascade-2.
- Verified: 36 packages installed, typecheck clean, drizzle-kit reads config + reports 0 tables.
- Senior-reviewer self-attack — captured: vault erratum on drizzle-kit version pin (0.45.2 doesn't exist as a drizzle-kit release; applied 0.31.10 latest stable per intent); two-env-var split flagged as implementation-time interpretation; `.ts` import extensions dropped for monorepo-idiom compatibility.

### sub-unit (2.5) role + extension init scripts — COMPLETE 2026-05-04
- 3 file ops: removed `compose/postgres-init/01-pg_partman.sql` (superseded), wrote `compose/postgres-init/00-roles.sql` (postgres + bokchoy_app via DO-block guards), wrote `compose/postgres-init/01-extensions.sql` (extensions + partman schemas, pg_partman + pgcrypto, GRANT USAGE to postgres).
- `00-roles.sql` quotes `[[local-docker]]` Amendment §2 verbatim — postgres `NOSUPERUSER, INHERIT, CREATEROLE, CREATEDB, LOGIN, REPLICATION, BYPASSRLS`, bokchoy_app `NOSUPERUSER, NOBYPASSRLS, INHERIT, LOGIN`, both password 'postgres'.
- `01-extensions.sql` quotes `[[local-docker]]` Amendment §2 + GRANT USAGE — implementation-time interpretation (mechanical completion of "install for use"; bokchoy_app deliberately NOT granted, accesses extensions only via `[[wallet-mechanics]]` §8 SECURITY DEFINER functions).
- Verified via `down -v && up -d`: pg_roles shows all 3 expected roles with correct attributes, pg_extension shows pg_partman + pgcrypto in correct schemas, bokchoy_app TCP login works (peer auth fails on socket — TCP-only via `-h 127.0.0.1`), postgres can execute `extensions.hmac()` returning valid SHA-256 hex, zero FATAL log entries.
- Senior-reviewer self-attack: peer-auth-vs-TCP gotcha noted (bokchoy_app cannot use the local socket because no OS user matches; backend will use TCP per Drizzle/postgres-js connection string anyway).

### sub-unit (2) compose.yml + pg_partman init — COMPLETE 2026-05-04
- 2 files written: `compose.yml` (root) + `compose/postgres-init/01-pg_partman.sql`.
- `compose.yml`: db service `supabase/postgres:17.6.1.113` with `command: postgres -c config_file=/etc/postgresql/postgresql.conf` per contract Reasoning, named volume `postgres-data` mounted at `/var/lib/postgresql/data`, init dir bind-mounted read-only at `/docker-entrypoint-initdb.d`, port 5432:5432, `POSTGRES_PASSWORD=postgres` (local-dev convention, image required env). Mailpit `axllent/mailpit:latest` with ports 1025 (SMTP) + 8025 (web UI).
- `01-pg_partman.sql`: `CREATE SCHEMA IF NOT EXISTS partman; CREATE EXTENSION IF NOT EXISTS pg_partman WITH SCHEMA partman;` — idempotent via IF NOT EXISTS, runs automatically on first init via Postgres image's docker-entrypoint-initdb.d primitive (contract said manual exec; deviated to platform primitive — strictly more reliable, same outcome).
- Verified: `docker compose config` parses clean, project name `bokchoy` auto-derived, volume `bokchoy_postgres-data` canonical-named.
- Senior-reviewer self-attack noted: no healthcheck on db, no .env file for password — both deliberately omitted (contract silent on healthcheck = improvisation; password isn't a secret in dev). Mailpit `:latest` vs F-Local-3 pin mitigation flagged for user decision (not blocking).

### sub-unit (1) workspace skeleton — COMPLETE 2026-05-04
- 15 files written: root `package.json` / `tsconfig.base.json` / `bunfig.toml` / `turbo.json` / `.gitignore` + 5 × (`apps/*/package.json` + `tsconfig.json`) and (`packages/*/package.json` + `tsconfig.json`).
- TypeScript ^6.0.0 + @types/node ^22.0.0 in catalog (Bun catalog protocol verified live).
- Turbo 2.9.8 (latest stable; vault `[[bun-workspaces-research]]` claimed "3.0" — minor imprecision, Turbo 3.0 not yet GA as of 2026-05-04, 2.9.x supports Bun workspaces fully).
- `packageManager: "bun@1.3.3"` required by Turbo workspace detection — added.
- TS strict mode + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` + `noImplicitOverride` + `noFallthroughCasesInSwitch` per `idioms/typescript.md`.
- Senior-reviewer self-attack caught two issues, fixed inline: (i) `bun.lock` was in .gitignore — removed (lockfile committed for reproducible installs); (ii) `apps/backend/tsconfig.json` had unnecessary `moduleResolution: node16` override — removed (base "bundler" resolves correctly under Bun).
- Verified: `bun install` clean, `turbo ls` shows all 5 workspaces.

## Original session context preserved below for continuity

## Original feature: full DESIGN.md audit (Option B chosen 2026-04-30 — register-then-parallel) + local Docker infra now in flight
- **SESSION 2026-05-03 (continuation) — local Docker research vaulted.** `[[local-docker-research]]` written. 44 vault entries. Three Path options surfaced (A: `supabase start` -x, B: standalone `supabase/postgres` 348MB image, C: stock+custom — rejected). **Load-bearing conflict surfaced**: pg_partman ships in repo binaries + Docker Hub image (verified) but managed Supabase prod tier availability unverified as of 2026-05-03; cascade-1 from `[[host-platform]]` NOT closed by local image alone — needs Free-tier project test. NEW cascade obligation for `[[backend-stack]]`: postgres-js `prepare: false` for Supavisor transaction-mode. Hands back to /design for image pick + verification.

## Local Docker pick 2026-05-04 — `[[local-docker]]` vaulted (Path B locked)
- **Verification SUCCEEDED**: user ran `CREATE EXTENSION pg_partman WITH SCHEMA partman` on Supabase Free-tier 2026-05-04, returned "Success. No rows returned" (DDL success). pg_partman is on the Supabase managed prod allowlist as of today; `[[host-platform]]` cascade-1 closed.
- **Path B locked**: standalone `supabase/postgres:17.6.1.113` (348MB) + Mailpit via project-owned `compose.yml`. Backend + cockpit native via `bun --hot`. Direct Postgres (no Supavisor locally).
- **Path A rejected**: CLI version-drift coupling not worth Mailpit-included edge now that `[[backend-stack]]` cascade-10 (`prepare: false` CI lint) defuses Supavisor-parity concern.
- **Path C rejected**: parity-drift maintenance burden, no production cite.
- 5 failure modes + 6 revisit-when triggers named.
- 46 vault entries.

## ALL design-mode work this session arc COMPLETE
Three decisions queued at session start (FORCE-RLS workaround, Drizzle version pin, Local Docker pick) all resolved. Architecture is now closed pending /implementation. Cascade-obligations queue across vault entries: ~30+ items spanning `[[backend-stack]]` (12 cascades), `[[wallet-mechanics]]` (9 cascades), `[[loot-rng-construction]]`, `[[player-auth]]`, `[[backend-service-shape]]` (10 cascades), `[[frontend-stack]]` (15 cascades), `[[local-docker]]` initial setup obligations. Strong candidate for /implementation handoff next session.

## Drizzle decisions 2026-05-04 — both amendments landed on `[[backend-stack]]`
- **FORCE-RLS workaround**: pattern (b.i) — CI script `scripts/check-rls-force.ts` queries `pg_class.relforcerowsecurity` after `drizzle-kit migrate`, fails CI on policy-bearing tables without FORCE; engineer hand-appends `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` to migration file. Migrations stay self-contained. Cascade-9 in `[[backend-stack]]`.
- **`prepare: false` mandate**: unconditional in Drizzle client factory (local + prod identical). Cascade-10 in `[[backend-stack]]`.
- **Drizzle version pin**: 0.45.2 stable. Five concrete revisit-when triggers named (replaces hand-wavy "need arises"). Cascade-11 (Renovate/Dependabot disable auto-bump) + Cascade-12 (release-notes watch).
- **Remaining design-mode work this session**: Local Docker image pick (Path A vs B) — blocked on user's pg_partman managed-tier verification (5-min Free-tier project test).

## Drizzle ORM research 2026-05-03 — `[[drizzle-orm-research]]` vaulted
- 45 vault entries. Scoped to (1) `pgPolicy` round-trip + (3) `prepare: false` + (4) nested-tx SAVEPOINT + (5-reframed) `db.query.*` SQL shape (single-query confirmed; N+1 worry refuted, real risk is poor-plan-at-scale per Issue #5245).
- **Two NEW cascade obligations for `[[backend-stack]]`**: (i) CI-enforced FORCE-RLS post-migration sweep (closes `[[wallet-mechanics]]` §8 owner-bypass defense — Drizzle doesn't generate FORCE RLS); (ii) `prepare: false` unconditional on postgres-js client (Supavisor compat).
- **NEW version-pin decision owed to /design**: Drizzle v1.0.0-rc.1 (2026-04-30, 3 days prior); v1 NOT GA. Recommendation lane: pin 0.45.2 stable for MVP, track v1 GA. RQB-v2 (in v1) carries Issue #5245 perf risk (3-table joins + filtered-related-where + concurrent load).
- Hands back to /design for: FORCE-RLS workaround pick (recommendation: CI script per pattern (b)) + Drizzle version pin.

## Local Docker research 2026-05-03 — `[[local-docker-research]]` vaulted
- Scope locked at /design: (1) solo-dev iteration loop + (2) integration test runner; defer (3) E2E, (4) prod-parity smoke, (5) bootstrap.
- Docker Desktop on WSL2 confirmed; source dir `/home/mvula/audhd/bokchoy` lives in ext4 inside the WSL2 VM.
- 13 sources triangulated across the four sub-questions. Confidence: high on Q1+Q3+Q4, medium on Q2 (no contradicting blog found = absence-of-evidence).
- **Recommended path (research surfaces, design chooses):** Path B (standalone `supabase/postgres:17.6.1.113` via custom compose) + separate `mailpit` service + skip Supavisor locally + Vitest transaction-rollback isolation.
- **Required verification before /design vaults Path B:** spin up Supabase Free-tier project, attempt `CREATE EXTENSION pg_partman WITH SCHEMA partman` — closes the contradiction probe definitively (5 minutes).
- 5 open threads queued for runbook / future verification (PRF-output, Drizzle pgPolicy round-trip, Bun+Vitest at scale, Mailpit+Better Auth pin).

## Original session opening preserved below — backend stack RESOLVED earlier this session

## Backend-stack decision 2026-05-03 — `[[backend-stack]]` vaulted

**Decision summary:**
- Language: TypeScript strict + Node.js 22 LTS (Bun deferred to opt-in post-MVP)
- ORM: Drizzle + `withTenant(projectId, fn)` transaction wrapper for `SET LOCAL app.current_tenant`
- Auth: Better Auth + Drizzle adapter + anonymous plugin (maps `[[player-auth]]` (γ) guest) + organization plugin (customer-as-org Stripe pattern)
- Multi-tenancy: customer-developer = Better Auth org (auth plane); project_id = RLS tenant (data plane); `projects.organization_id` FK
- Schema migrations: `drizzle-kit` ONLY (Better Auth's `getMigrations` doesn't support Drizzle adapter)
- Argon2id: m=64MB, t=3, p=4 per `[[player-auth]]`
- SDK API key: BokChoy-issued per project, HMAC-signed Stripe-pattern, independent of Better Auth

**Nine rejected alternatives** (Bun-default, Go/Rust/Elixir, Prisma, Kysely, Auth.js v5 for new project, Lucia, managed Clerk/WorkOS, project-as-org, nested-orgs).

**Eight failure modes** with mitigations.

**Eight cascade obligations queued for implementation phase:**
1. `withTenant(...)` helper + CI lint rule
2. Drizzle schema files for Better Auth tables (user/session/account/organization, hand-written) + BokChoy tables (projects/players/wallet/transactions/loot_rolls/api_keys)
3. Better Auth config with anonymous + organization plugins + Drizzle adapter + argon2id params
4. SDK API key infrastructure (table, validation middleware, rotation UI, audit log, rate limiter)
5. Deployment matrix docs — Node.js 22 LTS only at MVP
6. `drizzle-kit migrate` against direct Postgres (not PgBouncer pool) — runbook
7. Better Auth schema upgrade runbook — manual diff-and-merge for major versions
8. Integration tests covering Better Auth flows + anonymous user upgrade + RLS enforcement

## Architecture decisions resolved this session arc

The session opened with state.md staging "auth + language combined (II)" framing. Through six interactive turns + two research detours, the framing was rejected and split into three decisions, each resolved:

1. **`[[auth-compliance-research]]`** — GDPR processor-stance + COPPA third-party-vendor stance is universal industry pattern; no surveyed vendor contractually excludes under-13.
2. **`[[player-auth]]`** — owned-only at MVP, pass-through deferred post-MVP demand-gated; per-project players; (i)/(γ) minimal-PII; processor for GDPR / customer = COPPA operator; no contractual age-gate; family-aimed customers in scope; ~1-2 weeks legal infra (DPA + SCC + COPPA written-assurance template).
3. **`[[backend-stack-research]]`** + **`[[backend-stack]]`** — TypeScript + Node.js 22 + Drizzle + Better Auth, Stripe-model multi-tenancy, drizzle-kit-only migrations.

**Top-down architecture decisions remaining open** (per `[[design-claims-register]]` original audit):
- Backend service shape (monolith vs split-services vs serverless)
- Frontend (cockpit web stack — likely Next.js + same Drizzle/Better Auth backend, but vault-derive)

**Or:** if architecture decisions are sufficient for /implementation handoff, the cascade-obligations from `[[wallet-mechanics]]`, `[[loot-rng-construction]]`, `[[player-auth]]`, and `[[backend-stack]]` form a solid implementation queue.

## Top-down architecture status (open at session end)

After this session arc, the DESIGN.md audit register has the following architecture-tier decisions resolved or in-flight:

- **Wedge + ICP:** `[[wedge-decision]]` + `[[indie-smb-pricing-research]]` — closed
- **MVP feature sequence:** `[[mvp-feature-sequence]]` — closed
- **Idempotency:** `[[idempotency-strategy]]` — closed
- **Catalog versioning:** `[[catalog-versioning]]` + `[[catalog-cac-upgrade]]` stub — closed
- **Wallet mechanics:** `[[wallet-mechanics]]` — closed
- **Cross-tenant isolation:** `[[multi-tenant-rls-research]]` (research-grade); awaiting full design pass on RLS amendment to `[[wallet-mechanics]]` §8 (already done in amendment 2026-05-02)
- **Host platform:** `[[host-platform]]` — closed
- **Loot RNG:** `[[loot-rng-construction]]` + `[[within-roll-composition-scope]]` + `[[pity-engine-scope]]` — closed (CL-031 fully resolved)
- **De-identification:** `[[deidentify-mechanism-research]]` — closed
- **Auth + compliance:** `[[auth-compliance-research]]` + `[[player-auth]]` — closed (this session)
- **Backend stack:** `[[backend-stack-research]]` + `[[backend-stack]]` — closed (this session)

**Still open at top level:**
- Frontend stack (cockpit web) — research queued below
- CL-003 founder credibility hard-vs-soft gate (separate from research; design owes a decision)

## Frontend stack research COMPLETE 2026-05-03 — `[[frontend-stack-research]]` vaulted

40 vault entries. Heavy research per user directive (~14 sources, all four sub-questions triangulated, confidence: high).

**Findings summary handed to /design:**

- **Next.js 16 production-grade in 2026-Q2.** Released 2025-10-21; 16.2 with 400% faster `next dev`. Cache Components stable replacing experimental PPR. Turbopack stable default. React 19.2 + Compiler 1.0 stable. proxy.ts replaces middleware.ts. Min Node.js 20.9+.
- **Bun + Next.js 16 on Vercel = Public Beta NOT GA.** Vercel announced 2025-10-28; 28% latency reduction in CPU-bound rendering; not production-ready as of 2026-Q2.
- **Deploy recommendation: Vercel-for-cockpit + container-for-backend (split deploy, industry standard).** Cal.com production cite (250k LOC App Router migration, Vercel Edge Config feature flagging). **Cockpit runs Node.js 22 on Vercel — NOT Bun on Vercel due to Public Beta status. Backend stays on Bun + container per `[[backend-stack]]`.** Two deploy units; cross-deploy communication via HTTP for SDK API.
- **CVE-2025-55182 React2Shell (Dec 3 2025): critical pre-auth RCE in RSC Flight serialization, patched in Next.js 16.0.7+.** Active exploitation observed by Google TIG + Microsoft + AWS + Palo Alto. F-RSC-1 failure mode flagged.
- **Server Actions for cockpit mutations + Route Handlers for SDK API** — settled 2026 production pattern.
- **Better Auth + Next.js 16 RSC integration documented:** `auth.api.getSession({ headers: await headers() })`; `nextCookies()` plugin; RSC cookie limitation surfaced.
- **Cache Components + Suspense streaming:** `cacheComponents: true` + `"use cache"` directive; live-ops data uncached, slow-changing data cached.
- **'use client' cascade is real load-bearing for bundle size:** discipline + `optimizePackageImports` + bundle analyzer in CI; <200KB gzipped initial JS target.
- **Monorepo + Turborepo coupling** required (cockpit calls into shared backend modules via typed imports per `[[backend-service-shape]]`).
- **Contradiction probe (TanStack Start migration):** weighted but doesn't apply to greenfield MVP scale per Contradiction protocol.

**Open threads:**
- Bun + Vercel runtime GA timeline (revisit 6-12 months)
- Cache Components production cites at scale (Next.js 16 just shipped 2025-10)
- Cockpit-specific bundle baseline (measure on first deploy)
- shadcn/ui + Radix + Tailwind UI library decision (separate research)
- Frontend testing strategy (Playwright/Vitest — implementation phase)
- Bun + Better Auth + Next.js 16 + Drizzle four-way at production scale (deeper survey or controlled CI validation)

**Hands to /design:** vault `[[frontend-stack]]` decision entry per `[[player-auth]]` + `[[backend-stack]]` shape with rejected alternatives + failure modes + cascade obligations.

## Frontend-stack vault HELD pending Bun workspaces research

User pulled the monorepo-tooling open thread forward. `[[frontend-stack]]` decision entry held until Bun workspaces vs Turborepo vs pnpm workspaces research lands. Single comprehensive vault entry preferred over amendment churn.

**Already locked in for the vault entry once research lands:**
- Framework: Next.js 16 (currently 16.2)
- Deploy: Vercel for cockpit + container PaaS for backend (split deploy)
- Cockpit runtime on Vercel: **Bun (user explicit risk acceptance — F-Cockpit-Bun-1/2/3 + cross-runtime discipline + 1-hour Vercel-config-flag fallback runbook)** — same shape as backend Bun amendment
- Server Actions for cockpit mutations + Route Handlers for SDK API
- Cache Components opt-in caching
- 'use client' discipline + optimizePackageImports + bundle analyzer
- Better Auth integration via `auth.api.getSession({ headers: await headers() })`
- proxy.ts for route-level auth (Next.js 16+)
- F-RSC-1 (CVE-2025-55182 class) failure mode with patch-discipline mitigation

**Pending research:**
- Monorepo tooling pick (Bun workspaces vs Turborepo vs pnpm workspaces)
- Workspace structure + cross-package dependency model

## Frontend stack RESOLVED 2026-05-03 — `[[frontend-stack]]` vaulted

42 vault entries.

**Decision summary:**
- Next.js 16 (currently 16.2; pin 16.0.7+ at MVP launch per CVE-2025-55182)
- Vercel for cockpit deploy + container PaaS for backend (split deploy, Cal.com cite)
- Cockpit runtime: Bun on Vercel (Public Beta) — user explicit risk acceptance with F-Cockpit-Bun-1/2/3 + cross-runtime discipline + 1-hour fallback to Node 22
- Server Actions for cockpit mutations + Route Handlers for SDK API
- Cache Components opt-in caching (`cacheComponents: true` + `"use cache"`)
- 'use client' discipline + `optimizePackageImports` + bundle analyzer in CI; <200KB gzipped initial JS target
- Better Auth via `auth.api.getSession({ headers })` in RSC + `nextCookies()` + `proxy.ts`
- Monorepo: Bun workspaces + Turborepo hybrid (OpenCode pattern); `apps/{backend,cockpit}/` + `packages/{db,shared-types,auth-config}/`
- CVE discipline: Renovate/Dependabot + `bun audit` + 24-hour critical patch SLA
- 10 rejected alternatives + 9 failure modes + 15 cascade obligations

## SESSION ARC COMPLETE 2026-05-03 — full architecture stack now resolved

13 architecture-tier decisions and research entries closed in this session arc:

**Compliance + Auth:**
1. `[[auth-compliance-research]]` — GDPR/COPPA stance evidence
2. `[[player-auth]]` — owned-only at MVP, minimal-PII, processor stance, no age-gate

**Backend:**
3. `[[backend-stack-research]]` — TS+Drizzle+Better Auth substance
4. `[[backend-stack]]` (+ amendment 2026-05-03 to Bun) — TS strict + Bun + Drizzle + Better Auth + Hono + cross-runtime discipline
5. `[[backend-service-shape-research]]` — modular monolith + Bun re-research
6. `[[backend-service-shape]]` (+ amendment 2026-05-03) — modular monolith + outbox co-hosted + container deploy

**Frontend:**
7. `[[frontend-stack-research]]` — Next.js 16 / RSC / Suspense / 'use client' substance
8. `[[bun-workspaces-research]]` — monorepo tooling framing fix; Bun workspaces + Turbo hybrid
9. `[[frontend-stack]]` — Next.js 16 + Vercel + Bun + Server Actions + Cache Components + Bun workspaces + Turborepo

**Top-level architecture status:** essentially complete.

**Still open at top level (next-session candidates):**
- CL-003 founder credibility hard-vs-soft gate (separate from research; design owes a decision)
- shadcn/ui + Radix + Tailwind UI library decision (smaller scope; future research session)
- Frontend testing strategy (Playwright vs Cypress; Vitest vs Bun test) — implementation-phase task
- Container PaaS pick (Railway vs Render vs Fly.io vs Cloud Run) — implementation-phase task

**Cascade obligations queue across all vaulted decisions** is now substantial (~30+ implementation-phase tasks). Strong candidate for `/implementation` handoff next session if architecture work pauses.

## Frontend supplementary picks AMENDED into `[[frontend-stack]]` 2026-05-03 (continuation)

`[[frontend-stack]]` amendment + `[[backend-service-shape]]` Render-PaaS amendment vaulted.

**Closed:**
- shadcn/ui + Radix UI + Tailwind v4 (Admindek/Apex production cites)
- Playwright (E2E) + Vitest (unit) — Vitest over `bun test` for ecosystem maturity
- Render container PaaS (existing-subscription resource constraint; also amends `[[backend-service-shape]]` Section 5 + closes cascade obligation 6 PaaS pick)
- Zod v4 + React Hook Form + `@hookform/resolvers/zod` (single-source-of-truth schemas in `packages/shared-types/`)
- TanStack ecosystem (Query + Table + Virtual) with full integration patterns from `[[tanstack-query-rsc-research]]`:
  - RSC prefetch → HydrationBoundary → client useQuery
  - Per-request QueryClient via React `cache()`
  - staleTime defaults (60s) + per-data-type presets (5s/5min/1hr)
  - Server Actions + triple-invalidation derived pattern (revalidateTag + invalidateQueries orthogonal layers)
  - Tkdodo broad-invalidation default at MVP
  - TanStack Table v8 + Virtual with server-side pagination via queryKey
  - Anti-patterns enforced via PR review/CI lint

**Original frontend supplementary picks staged section preserved below for session-arc continuity.**

## Frontend supplementary picks staged for amendment to `[[frontend-stack]]` (HISTORICAL — now closed)

User dropped picks 2026-05-03 (continuation):
- **shadcn/ui + Radix UI + Tailwind CSS** — UI library/styling stack — standard, low risk, accepted as 2026 React UI consensus default
- **Playwright (E2E) + Vitest (unit)** — testing — accepted as standard 2026 stack; Vitest over `bun test` for ecosystem maturity (mocking, jsdom, plugins) — defensible
- **Render** for backend container PaaS — existing-subscription resource-constraint defense (matches `[[host-platform]]` Supabase cost-driven framing)
- **Zod v4 + React Hook Form + `@hookform/resolvers/zod`** — form validation stack — standard 2026 leader
- **TanStack ecosystem (Query + Table + Virtual)** — flagged: TanStack Query + Next.js 16 RSC interaction has architectural nuance, needs research before amendment

`[[frontend-stack]]` amendment HELD pending TanStack Query + RSC research.

## TanStack Query + RSC research COMPLETE 2026-05-03 — `[[tanstack-query-rsc-research]]` vaulted

43 vault entries.

**Findings handed to /design (for `[[frontend-stack]]` amendment):**
- **Q1 canonical pattern locked:** RSC prefetch → `dehydrate(queryClient)` → `<HydrationBoundary>` → Client `useQuery`. Per-request QueryClient via `cache(() => new QueryClient())`. **`defaultOptions.queries.staleTime: 60_000` minimum** (per TanStack Query docs verbatim) to prevent client-side double-fetch on hydration. Per-data-type staleTime: live-ops 5s, slow-changing 5min, static 1hr.
- **Q2 Server Actions + invalidation derived pattern (GAP-AS-FINDING):** surveyed scope does NOT document the triple-invalidation. Derived from orthogonal layer composition. **Server Action: DB mutation + `revalidateTag(tag)` (Layer 1, Next.js cache). Client `useMutation.onSuccess`: `queryClient.invalidateQueries({queryKey})` (Layer 2, TanStack Query cache).** Both fire; orthogonal responsibilities. Tkdodo broad-invalidation default. Open thread for first-paying-customer validation.
- **Q3 TanStack Table v8 + Virtual:** production-grade on Next.js 16 (Admindek + Apex production templates cite). Server-side pagination via `manualPagination: true` + `queryKey: ['table-data', {page, sort, filter}]`. Client Components.
- **Q4 anti-patterns:** TanStack Query owns all fetching, `fetchQuery` server-side rendered results, staleTime=0 default, double `invalidateQueries` (Issue #7963).

**`[[frontend-stack]]` amendment ready** with all five supplementary picks (shadcn/Radix/Tailwind, Playwright/Vitest, Render, Zod/RHF, TanStack ecosystem with derived integration patterns).

## Historical: TanStack Query + RSC research handoff queue (now complete)

`[[tanstack-query-rsc-research]]` was vaulted earlier in this session and returned to /design which will produce `[[frontend-stack]]` amendment. Below preserved for session-arc continuity.

## Research handoff queue 2026-05-03 (continuation 4) — tanstack-query-rsc-research (COMPLETE)

**Mode:** /research

**Hypothesis under test:** TanStack Query as client-side cache only, server-side fetch via RSC + Server Actions for mutations (pattern (α) from design's flagging). User pre-pick: TanStack Query + Table + Virtual for cockpit. Pattern integration with Next.js 16 RSC needs research to ensure the canonical 2026 pattern is correctly captured.

**Triangulation budget — focused scope per "production research":** ≥1 production cite per sub-question (B2B SaaS at indie/SMB scale on Next.js 16 + TanStack Query), ≥1 docs cite per sub-question (Next.js + TanStack Query official), ≥1 contradiction probe (anti-pattern post-mortems). Total ~5-7 sources.

### Sub-question Q1 — TanStack Query + Next.js 16 RSC integration pattern

**Triangulation targets:**
- TanStack Query official Next.js integration docs — current 2026 patterns
- `HydrationBoundary` + `dehydrate(queryClient)` server-to-client state-transfer pattern
- Server-side queryClient instantiation + per-request lifecycle
- React Server Components + TanStack Query coexistence — when to use each
- Production cites — B2B SaaS teams shipping the hybrid in Next.js 16

### Sub-question Q2 — Server Actions + TanStack Query mutation/invalidation

**Triangulation targets:**
- Post-mutation invalidation: `revalidatePath`/`revalidateTag`/`updateTag` (Next.js native) vs `queryClient.invalidateQueries` (TanStack Query)
- Optimistic updates with TanStack Query + Server Actions
- Production cites — Server Actions + TanStack Query patterns at scale
- Common foot-guns

### Sub-question Q3 — TanStack Table + Virtual on Next.js 16

**Triangulation targets:**
- TanStack Table v8 with Server Components — boundary placement
- TanStack Virtual with Suspense + streaming — interaction patterns
- Production cites for TanStack Table + Virtual on cockpit dashboards
- Lighter scope than Q1/Q2 since Table + Virtual are pure headless utilities

### Sub-question Q4 — Anti-patterns / "we tried TanStack + RSC and regretted it"

**Triangulation targets:**
- Production post-mortems on TanStack Query + Next.js 16 misuse
- "TanStack Query owns all data fetching" anti-pattern cites
- HydrationBoundary misuse / over-hydration cost
- TanStack Query + Server Actions pattern gotchas

**Hand back to /design with:** sourced canonical pattern + verbatim docs cites + production examples + named anti-patterns. Design amends `[[frontend-stack]]` with the resolved TanStack pattern + the four supplementary picks (shadcn/Radix/Tailwind, Playwright/Vitest, Render, Zod/RHF).

## Historical: Bun-workspaces research handoff queue (now complete)

`[[bun-workspaces-research]]` was vaulted earlier in this session and returned to /design which produced `[[frontend-stack]]`. Below preserved for session-arc continuity.

## Bun-workspaces research COMPLETE 2026-05-03 — `[[bun-workspaces-research]]` vaulted

41 vault entries.

**Critical framing fix surfaced:** "Bun workspaces vs Turborepo" was a category error. They compose at different layers — Bun workspaces = package manager (Layer 1), Turborepo = task orchestration (Layer 2). Turborepo 3.0 ships first-class native Bun workspace support.

**Production cite for the hybrid:** OpenCode (anomalyco/opencode + sst/opencode) runs 20+ packages with Bun workspaces + Turbo for build orchestration + Bun catalog. User's targeted check on OpenCode resolved an earlier conflated cite — `[[backend-service-shape-research]]` Source 4 OpenCode regret was about desktop runtime (Electron context), NOT monorepo tooling. Package-manager-vs-runtime layer split clean as production example.

**Recommendation handed to /design:** Bun workspaces + Turborepo hybrid. Workspace structure: `apps/{backend,cockpit}/` + `packages/{db,shared-types,auth-config,ui-deferred}/`. Catalog for shared dependency pinning. Turbo task graph for cross-workspace builds.

**`[[frontend-stack]]` vault now unblocked** — design has all coupled decisions resolved (Next.js 16 + Vercel for cockpit + cockpit-Bun-on-Vercel risk-acceptance + Server Actions/Route Handlers + Cache Components + 'use client' discipline + Better Auth integration + Bun workspaces + Turborepo).

## Historical: Bun-workspaces research handoff queue (now complete)

`[[bun-workspaces-research]]` was vaulted earlier in this session and returned to /design which will produce `[[frontend-stack]]`. Below preserved for session-arc continuity.

## Research handoff queue 2026-05-03 (continuation 3) — bun-workspaces-research (COMPLETE)

**Mode:** /research

**Hypothesis under test:** Bun workspaces (user pre-pick implicit by pulling the open thread). Prior `[[frontend-stack-research]]` recommendation: Turborepo (Cal.com production cite + Vercel-native pairing). Research treats Bun workspaces as the candidate to defend against Turborepo + pnpm workspaces.

**Triangulation budget:** standard ≥1 production cite + ≥1 docs cite + ≥1 contradiction probe per sub-question. Total ~6-8 sources, lighter than heavy frontend-stack research.

### Sub-question Q1 — Bun workspaces production-readiness + feature parity with Turborepo

- Bun workspaces feature set in 2026-Q2 — install resolution, dependency hoisting, workspace `:filter` semantics
- Build orchestration: does Bun ship task graph + dependency-aware caching equivalent to Turborepo's `turbo.json`?
- Incremental builds + caching across CI/CD invocations (Bun has built-in `bun run` orchestration; depth?)
- Bun workspaces version + maturity signal (Bun 1.2+ shipped workspaces improvements; current state?)

### Sub-question Q2 — Vercel deploy + Bun workspaces compatibility

- Vercel default monorepo deploy: pnpm + Turborepo (well-cited at Cal.com)
- Bun workspaces on Vercel — supported natively or requires Bun runtime adapter? Per `[[frontend-stack-research]]` Source 2, Vercel Bun runtime is Public Beta — does it support workspaces?
- Build cache integration with Vercel's build pipeline
- Workspace dependency hoisting at deploy time
- `apps/cockpit/` Next.js detection + build path with Bun workspaces

### Sub-question Q3 — Production cites for Bun workspaces vs Turborepo

- Who runs Bun workspaces at production B2B SaaS scale? Bun is newer than Turborepo (Turborepo Vercel-native since 2021; Bun workspaces shipped later)
- Cal.com production cite for Turborepo (already in `[[frontend-stack-research]]` Source 5)
- Trigger.dev (heavy Bun production user per `[[backend-service-shape-research]]` — do they use Bun workspaces or Turborepo?)
- Other named B2B SaaS using Bun workspaces in 2026-Q2

### Sub-question Q4 — Migration cost + lock-in

- If BokChoy picks Bun workspaces and needs to switch later (Turborepo, pnpm), what's the cost?
- Workspace config files (`bun-workspaces.json` vs `turbo.json` vs `pnpm-workspace.yaml`) — switch difficulty
- CI/CD pipeline rebuild required on switch
- Cross-runtime discipline applied at monorepo level (already locked at `[[backend-stack]]` runtime level)

**Hand back to /design with:** sourced answer + identified strongest contradiction + named operational implications + monorepo pick recommendation. Design weighs and vaults `[[frontend-stack]]` with the resolved monorepo tooling.

## Historical: frontend-stack-research handoff queue (now complete)

`[[frontend-stack-research]]` was vaulted earlier in this session and returned to /design which will produce `[[frontend-stack]]`. Below preserved for session-arc continuity.

## Research handoff queue 2026-05-03 (continuation 2) — frontend-stack-research (COMPLETE)

**Mode:** /research

**Hypothesis under test (user pre-pick):** Next.js 16 for cockpit web (admin + customer-developer dashboards). Defense: "production-cited leader." User requested HEAVY research, specifically on RSC (server vs client components), Suspense, tree shaking. Plus BokChoy-specific stack compatibility + deploy coupling.

### Sub-question Q1 — Next.js 16 production-readiness + BokChoy stack compatibility

**Triangulation targets:**
- Next.js 16 release date, breaking changes from Next 15, stability signal in 2026-Q2
- **Bun + Next.js 16 compatibility** — `[[backend-stack]]` amendment 2026-05-03 commits to Bun runtime + cross-runtime discipline. Historical Next.js-on-Bun friction per surveyed scope; verify current state.
- **Better Auth + Next.js 16 + Drizzle** integration — Better Auth ships Next.js examples; verify they target Next 16 not 15; verify Bun-on-server-side compatibility
- **Deploy fork (load-bearing):** Vercel-native vs container-PaaS-same-as-backend vs Cloudflare Pages / Next.js standalone output. Affects whether `[[backend-service-shape]]` modular-monolith deploy unity extends to frontend.
- Production cites at B2B SaaS scale (Cal.com, Linear, Stripe Dashboard, Shopify Admin, Vercel itself)
- Contradiction probe: 2026 Next.js 16 production regrets / migration-away cites

### Sub-question Q2 — RSC (React Server Components) at production scale in Next.js 16

**Triangulation targets:**
- Server vs client component boundary placement strategy — Vercel docs + production cites
- Server Actions vs API routes — when each wins for mutations, performance comparison, error handling
- Hydration waterfall avoidance + streaming patterns
- **Better Auth session in RSC** — `getServerSession()` style patterns, cookie handling at server-side, type-safety
- Production cites on RSC at B2B SaaS scale (named teams, named workloads)
- Known foot-guns: hydration mismatches, server-client boundary leaks, prop serialization, request waterfalls
- Contradiction probe: 2026 RSC production regrets / "we went back to client components" cites

### Sub-question Q3 — Suspense boundary patterns + streaming

**Triangulation targets:**
- Boundary placement: per-route vs per-component vs per-data-fetch
- Streaming + Suspense interaction; **Partial Prerendering (PPR)** in Next.js 15+/16
- `error.js` + `loading.js` + `notFound()` conventions
- Cockpit-specific: live-ops dashboard rendering with multiple async data sources (player metrics, wallet stats, transaction history)
- Production gotchas: cumulative layout shift during stream-in, suspense-during-hydration bugs, error-boundary cascading
- Contradiction probe: production cites that DON'T use Suspense / find it hurts more than helps

### Sub-question Q4 — Tree shaking + bundle optimization in Next.js 16

**Triangulation targets:**
- Server vs client bundle split — what ships to browser, what stays server-only
- `'use client'` directive + downstream import cascade ("the use-client wave")
- Dynamic imports + code splitting strategies (`next/dynamic`)
- `@next/bundle-analyzer` production setup + interpretation
- Bundle size targets for B2B dashboard cockpit at MVP (rough rule: <200KB gzipped initial JS)
- Production cites with named bundle sizes (Vercel, Cal.com, Linear)
- Contradiction probe: bundle-bloat post-mortems in Next.js production deployments

### Cross-sub-question coupling

- Q1 deploy fork interacts with Q2 RSC (server actions need a Node-or-Bun-compatible host)
- Q2 RSC + Q4 tree shaking interact heavily ('use client' boundary controls bundle inclusion)
- Q3 Suspense + Q4 streaming interact (Suspense-as-streaming-boundary affects bundle hydration)

**Triangulation budget — heavy research per user directive:** ≥2 production cites per sub-question (B2B SaaS scale named teams), ≥1 docs cite per sub-question (Next.js 16 official docs version-pinned), ≥1 contradiction probe per sub-question. Total ~12-16 sources. Same shape as `[[backend-stack-research]]` but deeper.

**Hand back to /design with:** sourced answers + identified strongest contradiction per sub-question + named operational implications + named coupling decisions for `[[backend-service-shape]]` deploy topology.

## Backend service shape RESOLVED 2026-05-03 — `[[backend-service-shape]]` vaulted

39 vault entries.

**Decision summary:**
- Modular monolith — single Node.js 22 LTS TS process per replica, deployed as container
- Module boundaries 1-to-1 with vault features: auth, players, wallet, catalog, loot, outbox, cockpit, sdk, idempotency, infra; plus cross-cutting db/lib/types
- Module isolation: typed function calls (not network); cross-module DB access via owning module's repository; ESLint `import/no-restricted-paths` enforces
- Outbox co-hosted at MVP via SKIP LOCKED + 250ms poll
- Container deployment on PaaS (specific PaaS deferred to implementation phase)
- Always-on replica (no scaling-to-zero) at MVP
- Serverless edge + microservices + separate-worker-from-day-one + WAL-CDC + per-module-schema all vaulted as rejected
- 7 rejected alternatives, 8 failure modes with mitigations, 10 cascade obligations queued for implementation

**Q1 (Bun re-research) REJECTED ON EVIDENCE:** `[[backend-stack]]` Node.js 22 default stands. User directive "Bun not Node" was hypothesis under test; new evidence reinforces original decision (OpenCode founder Jay V's public migration FROM Bun TO Node + multiple GitHub-tracked memory-leak class issues continuing through Bun 1.1.13 April 2026 + pkgpulse 2026 caveat on long-running workloads applying directly to BokChoy outbox worker). Better Auth Issue #2283 closed wontfix + bunx-CLI-only — moot for BokChoy.

## Amendment 2026-05-03 — Bun + Hono locked into `[[backend-stack]]`

User explicit risk-acceptance after `[[backend-service-shape-research]]` Q1 surfaced new evidence reinforcing Node 22 default. User chose Bun anyway with named failure-mode acceptance (F-Bun-1 through F-Bun-4) + cross-runtime portability discipline as mitigation:
- Bun 1.3+ runtime; Node.js 22 LTS retained as documented fallback (CI-tested Dockerfile variant)
- Hono HTTP framework (cross-runtime adapter, not `Bun.serve`)
- postgres-js (not `Bun.sql`); node:fs (not `Bun.write`); node:crypto for argon2 + HMAC
- ESLint blocks `import 'bun'` / `import 'bun:*'` in non-test files
- Documented fallback runbook: if F-Bun-* materializes in production with material impact, swap deployed Dockerfile to Node 22 variant within 1 week

`[[backend-stack]]` and `[[backend-service-shape]]` amended in-place per `[[wallet-mechanics]]` 2026-05-02 amendment-pattern precedent. Original Node.js 22 reasoning retained for historical record.

This is the user's risk-tolerance call recorded with explicit framing. Future-team / future-self can read the amendment and see the trade made: perf upside + DX preference > production-stability conservativism, with cross-runtime mitigation limiting cost-of-being-wrong to ~hours of operational swap.

## Architecture decisions resolved across this session arc (2026-05-03)

11 architecture-tier decisions and research entries closed in one session:
1. `[[auth-compliance-research]]` — GDPR/COPPA stance evidence
2. `[[player-auth]]` — owned-only at MVP, minimal-PII, processor stance, no age-gate
3. `[[backend-stack-research]]` — TS+Drizzle+Better Auth substance
4. `[[backend-stack]]` — TS strict + Node.js 22 + Drizzle + Better Auth
5. `[[backend-service-shape-research]]` — modular monolith evidence + Bun re-research
6. `[[backend-service-shape]]` — modular monolith + outbox co-hosted + container deploy

**Top-down architecture status: nearly complete.** Still open at top level:
- Frontend stack (cockpit web)
- CL-003 founder credibility hard-vs-soft gate (separate from research; design owes a decision)

These are next-session candidates. Cascade obligation queue from `[[wallet-mechanics]]`, `[[loot-rng-construction]]`, `[[player-auth]]`, `[[backend-stack]]`, `[[backend-service-shape]]` is now substantial enough to consider /implementation handoff if architecture work pauses.

## Historical: backend-service-shape-research handoff (now complete)

`[[backend-service-shape-research]]` was vaulted earlier in this session and returned to /design which produced `[[backend-service-shape]]`. Below preserved for session-arc continuity.

## Backend-service-shape research COMPLETE 2026-05-03 — `[[backend-service-shape-research]]` vaulted

38 vault entries.

**Q1 result: REAFFIRMS `[[backend-stack]]` Node.js 22 default. Does NOT warrant amendment to Bun-default.** User directive "Bun not Node" was hypothesis under test; new evidence reinforces original decision rather than amending. Specific new cites:
- OpenCode founder Jay V's public production-regret migration FROM Bun TO Node (2026)
- Multiple GitHub-tracked memory-leak class issues across Bun 1.1.x (Issues #16339, #18488, #24216, #25948)
- Bun 1.1.13 (April 2026) shipped memory fixes — Anthropic acquired Bun Dec 2025 but stability work ongoing not closed
- pkgpulse 2026 caveat applies directly: *"long-running workloads amplifying problems that short benchmarks never reveal"* — BokChoy outbox worker is exactly that
- Better Auth Issue #2283 (Bun + Drizzle + PostgreSQL) closed wontfix + bunx-CLI-only — moot for BokChoy due to drizzle-kit-only migration commitment

**Q2 result: modular monolith.** Unambiguous 2026 consensus for solo-dev B2B SaaS at MVP. DHH cite + 2026 industry consensus + outbox-worker-co-hosted-pattern + serverless-edge-ruled-out (argon2 native binding + outbox long-running incompatible with Workers/Vercel-Edge V8 isolate constraints).

**Hands to /design:** vault `[[backend-service-shape]]` decision entry — modular monolith + outbox co-located + container deploy + module isolation discipline. NO amendment to `[[backend-stack]]` (Node.js 22 stands).

## Research handoff queue 2026-05-03 (continuation, NOW HISTORICAL) — backend-service-and-runtime-research

**Mode:** /research

**Two coupled-but-separable sub-questions, single session.**

User directive at session continuation: "backend service and bun not node will need to research first."

**Framing:** "Bun not Node" is the hypothesis under test, NOT the assumed answer. `[[backend-stack]]` already vaulted with Node.js 22 as MVP default + engineering reasoning (Trigger.dev memory-leak class regression history, BokChoy workload shape = CRUD-on-Postgres not long-poll-saturated, conservative solo-dev MVP risk profile). Research must surface new evidence (post-2026-03 Bun state, BokChoy-specific compatibility) to warrant amending `[[backend-stack]]`. Existing decision stands until research warrants amendment (precedent: `[[wallet-mechanics]]` amendment 2026-05-02 pattern).

### Sub-question Q1 — Bun vs Node.js 22 as MVP default (re-research, BokChoy-specific)

**Question:** Does Bun 1.3+ in 2026-Q2 clear the production-grade default-runtime gate for BokChoy's specific workload shape (CRUD-on-Postgres + outbox processing per `[[wallet-mechanics]]` + occasional DSR exports per `[[player-auth]]`), or does Node.js 22 LTS remain the conservative production default?

**Triangulation targets:**
- Bun memory-leak class regression state 2026-Q2 (post-Trigger.dev firestarter fix in Bun 1.3.x; any new HTTP-model regressions tracked in Bun GitHub issues?)
- Bun + postgres-js production compatibility at MVP scale
- Bun + Better Auth compatibility (any tracked issues / known incompatibilities?)
- Bun + argon2 native-binding compatibility (Better Auth password hashing per `[[player-auth]]` m=64MB t=3 p=4)
- Bun + Drizzle ORM compatibility (drizzle-kit migrations, drizzle-orm runtime)
- Production cites for Bun-as-default (not just "added support") at solo-dev MVP B2B SaaS scale (≥3 named SaaS)
- Cost-benefit specific to BokChoy workload: typical CRUD + outbox + DSR — does Bun perf upside materialize for this shape, or is it Trigger.dev-firestarter-specific (long-poll connection broker)?
- Contradiction probe: 2026 production post-mortems on Bun-at-MVP-default that hit issues; HN/Reddit threads on Bun production regrets

### Sub-question Q2 — Backend service shape: monolith vs split-services vs serverless

**Question:** For BokChoy MVP — solo dev, 20-month runway per `[[wedge-decision]]`, indie/SMB SaaS, TS+Drizzle+Better Auth+Postgres stack — what is the production-grade backend service topology?

**Triangulation targets:**
- Monolith-at-MVP production cites at indie/SMB SaaS scale (Cal.com pre-Enterprise, Linear pre-Series-B, Trigger.dev pre-V4, Plausible Analytics, etc.)
- Split-services threshold: when does monolith-to-services migration pay back? Production post-mortems on premature split (often-cited: "we split too early")
- Serverless-only production cites (Vercel Functions, Cloudflare Workers, AWS Lambda) at indie/SMB B2B SaaS scale
- Worker/job processing topology for `[[wallet-mechanics]]` `staged_jobs` outbox: in-process worker vs separate-process vs serverless invocation
- DHH "Majestic Monolith" vs microservices-first orthodoxy — current 2026 consensus for solo-dev B2B SaaS at MVP
- BokChoy-specific service boundaries: SDK calls + cockpit web + outbox + DSR exports — do these split naturally or stay together?
- Coupling with `[[host-platform]]` Supabase + `[[backend-stack]]` Node.js 22 + Bun-eligibility (if Q1 lands on Bun)
- Contradiction probe: production teams reporting monolith-was-wrong + production teams reporting microservices-was-wrong, scaled to BokChoy's MVP context

### Cross-sub-question coupling

- If Q1 lands on Bun, Q2 service-shape decision considers Bun's edge runtime affinity (Bun runs well on Cloudflare Workers post-2026; less well on traditional Node container hosts)
- If Q2 lands on serverless, Q1 runtime question is partly moot (Vercel/Cloudflare/Lambda handle runtime selection)
- If Q2 lands on monolith, Q1 runtime decision is independent and binary

**Hand back to /design with:** sourced answer + identified strongest contradiction per sub-question + named operational implications. Design weighs and either amends `[[backend-stack]]` (if Q1 lands on Bun) or vaults new `[[backend-service-shape]]` decision entry (Q2 result).

## Backend-stack research 2026-05-03 — `[[backend-stack-research]]` vaulted

**Triangulation gate met across all three sub-questions** (Q1 language, Q2 ORM, Q3 auth library) via 11 sources. Confidence: high.

**Findings summary (handed to /design):**
- **Q1: TS-on-backend wins** on production-cite weight (Trigger.dev firestarter Bun 5× migration; Cal.com + Deel.com via Better Auth founder citation). Bun is real-but-rough (memory leak class regression history); Node.js 22 = conservative MVP default, Bun = opt-in upgrade. Go-stack-at-indie-SMB has thin public engineering-blog evidence (research-gap-as-finding).
- **Q2: Drizzle wins** on RLS-first-class. `pgPolicy`+`pgRole` schema declarations vs. Prisma's Yates+Client-Extensions workaround stack with documented nested-transaction breakage. Drizzle requires BokChoy-side `SET LOCAL` transaction wrapper (analogous to Supabase's `getDrizzleSupabaseClient`).
- **Q3: Better Auth wins** on consolidated TS auth landscape (Lucia deprecated 2025-03, Auth.js merged 2025-09-22). Anonymous plugin maps `[[player-auth]]` (γ) guest-account shape directly. Production cites: Cal.com, Deel.com, dough.ink, MeetingBaas. WorkOS contradiction probe correctly identifies SCIM/SAML/audit-logging gaps — none bind for indie/SMB MVP, all close enterprise door post-MVP.

**Coupling resolved:** TS+Drizzle+Better Auth is the natural stack pairing. Pre-pick correct on conclusion; this research provides the substance.

**Open threads handed to design:**
- Bun vs Node.js 22 as MVP default runtime — design owes the call
- Project↔organization mapping for BokChoy's two-tier multi-tenancy via Better Auth org plugin — design owes the modeling decision
- SCIM/SAML roadmap watch (re-check 6-12 months post-MVP)
- Drizzle migration tooling at scale (signal-watch open thread)

## Next decision queue — `/design` to vault `[[backend-stack]]`

**Mode:** /design

**Hypothesis under test (now defended):** TS + Drizzle + Better Auth at MVP per `[[backend-stack-research]]` Findings Q1.1-Q3.6.

**Decisions design owes the vault entry:**
1. Confirm pick of TS + Node.js 22 (or Bun?) for backend language
2. Confirm pick of Drizzle ORM with `SET LOCAL` transaction wrapper pattern
3. Confirm pick of Better Auth with anonymous + organization plugins + Drizzle adapter
4. Resolve project↔organization mapping for BokChoy's two-tier multi-tenancy (customer-developer org + projects-as-sub-orgs vs. custom association tables)
5. Vault rejected alternatives per sub-question (≥2 each): Q1 (Go, pure-Bun-default), Q2 (Prisma, Kysely, raw pg), Q3 (Auth.js v5 for new project, Lucia, managed Clerk/WorkOS at MVP)
6. Vault failure modes per sub-question with mitigations
7. Vault revisit-when conditions (Bun memory-leak class regression, Better Auth SCIM/SAML availability, Drizzle migration friction, project↔org mapping breakage)

## Player auth resolution 2026-05-03 — `[[player-auth]]` vaulted

**Decision summary:**
- Player auth: owned-only at MVP; pass-through deferred post-MVP demand-gated
- Per-project players (no cross-project portability)
- PII scope: minimal-PII (i)/(γ) — guest play default; email opt-in; ~7 columns on players table
- Stance: GDPR processor / CCPA Service Provider / COPPA third-party vendor
- No contractual age-gate; family-aimed customers in scope; customer flags audience per Unity GS pattern
- Required legal infra at MVP: ~1-2 weeks copying PlayFab/Unity public DPA templates + COPPA written-assurance template per 2025 amendments

**Six rejected alternatives + seven failure modes vaulted.**

**Cascade obligations queued (implementation phase, NOT design):**
1. Verify Supabase encryption-at-rest default — extends `[[host-platform]]` cascade
2. CI lint discipline extension — players table per `[[wallet-mechanics]]` + `[[multi-tenant-rls-research]]` patterns
3. Pre-implementation security review of player auth endpoints (rate-limit thresholds, credential-stuffing detection, session-token format)
4. Runbook items: credential-stuffing response, DSR async export pattern, PII access audit log
5. Customer-onboarding docs: SDK security guidance (F3 credential handling), recovery patterns for guest players (F2), audience-flagging accuracy (F4)
6. DSR primitives implementation: `bokchoy.player_export` + `bokchoy.player_erase` stored functions
7. Idiom decisions deferred to library/language entry: argon2id parameters, session-token format, rate-limiter mechanism

## Next decision queue — auth library + ORM + backend language

**Still owed.** Three decisions, coupled.

## Research handoff queue 2026-05-03 — backend stack research (language + ORM + auth library)

**Mode:** /research

**Three coupled decisions, single session — same shape as `[[auth-compliance-research]]` triangulated three sub-questions in one entry. Triangulation budget per sub-question: ≥1 production cite + ≥1 docs cite + ≥1 contradiction probe.**

### Sub-question Q1 — Backend language for B2B game-backend SaaS MVP

**Question:** Which backend language wins for a solo-dev B2B SaaS shipping Postgres-RLS + game-backend primitives at MVP scale (10rps initial, 1krps target), with TS proficiency existing and Go/Rust/Elixir not?

**Triangulation targets:**
- ≥3 production-cited B2B SaaS at indie/SMB scale running TS on the backend (e.g., Cal.com, Linear backend, Trigger.dev, Inngest, Drizzle Team's own stack)
- ≥3 production-cited B2B SaaS at indie/SMB scale running Go on the backend (e.g., Tailscale, Earthly, Charm, Defang)
- Docs cite: Node 22 vs Bun 1.x current state-of-art for production runtimes (TC39, Bun changelogs, Node release notes)
- Contradiction probe: post-mortems / engineering blogs naming TS-on-backend regrets (Microsoft TypeScript-team, AdonisJS team, similar) AND Go-startup regrets (Discord moving from Go to Rust on specific service, similar)
- Performance reference: TS+Node vs Go single-instance for typical CRUD-on-Postgres workload at 1krps; latency profile, memory footprint

**Deciding factors expected to surface:**
- TS proficiency-as-substantive-constraint at solo-dev MVP per `[[wedge-decision]]` 20-month runway — research must NOT dismiss as "just familiarity"
- Ecosystem fit for `[[player-auth]]` (auth lib + argon2id + RLS-compatible ORM availability)
- Operational story: deploy / test / observability story differences

### Sub-question Q2 — ORM for TS + Postgres + RLS

**Question:** Which TS Postgres ORM/query-builder is production-grade for `[[multi-tenant-rls-research]]` `SET LOCAL app.current_tenant` pattern + M2 stored-function-only-interface per `[[wallet-mechanics]]`?

**Triangulation targets:**
- Production cites for Drizzle: who runs it in production B2B SaaS, current production-maturity assessment (2026-05-03), GitHub issue tracker state on RLS-related issues
- Production cites for Prisma: same, with explicit RLS support history (Prisma had/has RLS gaps documented)
- Production cites for Kysely (pure query builder): same
- Production cites for raw `pg`/`postgres-js`: same
- Docs cite: each ORM's documentation on `SET LOCAL` / per-transaction settings / RLS interaction
- Contradiction probe: post-mortems / GitHub issues / engineering blogs naming ORM-vs-RLS friction (Prisma's known RLS gaps, Drizzle migrations breakage, Kysely tradeoffs)

**Deciding factors expected to surface:**
- RLS-compat: does ORM let you `SET LOCAL` per transaction without fighting the abstraction? (load-bearing per `[[multi-tenant-rls-research]]`)
- M2 stored-function-only interface: can ORM call stored functions cleanly?
- Migration story for production-grade schema versioning
- Type-safety vs runtime cost
- Bun compatibility (if Q1 lands on Bun)

### Sub-question Q3 — Auth library for TS owned-auth + multi-tenant + custom user model

**Question:** Which TS auth library (or absence thereof) supports `[[player-auth]]` decisions: owned-auth flow + custom user model with nullable email + argon2id + per-project isolation + organization-plugin for customer-developer multi-tenant?

**Triangulation targets:**
- Production cites for Better Auth: who runs it at SaaS scale (production-maturity is the live concern — 2024 release), GitHub issue tracker state on (a) custom user model with nullable email, (b) organization plugin maturity, (c) argon2id support, (d) Drizzle adapter stability
- Production cites for Auth.js (formerly NextAuth): production usage at non-Next.js stacks (load-bearing — BokChoy may or may not be Next.js per Q1+Q2)
- Production cites for Lucia: production usage, current state of "you-own-the-auth-logic" framing, project archival/maintenance signals
- Production cites for managed (Clerk, WorkOS, Stack Auth): owned-auth-ish features, lock-in cost, indie-tier pricing
- Docs cite: each library's documentation on custom user model + multi-tenant
- Contradiction probe: GitHub issues, Reddit/HN threads, engineering blogs on auth-library regrets at production scale

**Deciding factors expected to surface:**
- Better Auth 2024-release production-maturity reality vs. marketing (active issue count, response time, paying-customer signals)
- Custom user model fit: can the library's user-table schema match `[[player-auth]]` minimal-PII shape with nullable email?
- Multi-tenant fit: does "organization plugin" handle customer-developer × players-per-project correctly, or does BokChoy need custom multi-tenancy?
- argon2id native vs adapter-required
- Drizzle adapter quality (if Q2 lands on Drizzle)

### Cross-sub-question coupling

- Q1 → Q2 → Q3 dependency: language constrains library shortlist; ORM choice may constrain library adapter availability
- All three should be researched in same session to surface coupling: e.g., "Drizzle has a Better Auth adapter so Drizzle+Better Auth is a natural pair" — that's a coupling claim that needs validation, not assumption
- TS+Drizzle+Better Auth pre-pick from session-staging is the **hypothesis under test** — research should treat it as the candidate to defend, with explicit alternatives ranked

**Hand back to /design with:** sourced answers + identified strongest contradiction per sub-question + named operational implications. Design weighs and picks.

## Session 2026-05-03 evening — earlier history retained below for context

## Research detour 2026-05-03 — auth-compliance-research vaulted

**Result:** processor-stance + customer-as-controller is the universal industry pattern; COPPA operator-stance lands on the customer-developer; no surveyed vendor contractually excludes under-13 audiences.

**Triangulation:** ✓ — 3 production cites (PlayFab SCC, Unity GS DPA, Heroic Labs privacy policy), 2 regulator primaries (16 CFR §312.2 Cornell + EDPB 07/2020 via secondary summaries), contradiction probe via FTC Apitor/JPush 2025-09 enforcement + 2025 COPPA amendments. Confidence overall: medium (high on regulatory framework + vendor stance unanimity; medium on EDPB direct verbatim due to PDF rendering limitation).

**Operational implications now in design's hand:**
- (4) PII scope (i)/(ii)/(iii) — processor-stance compatible with standard-PII (ii); customer's audience choice (iii) does not require contractual age-gate but does require written-assurance contract template per 2025 COPPA amendments
- (5) controller-vs-processor — RESOLVED: processor-stance, matching universal industry pattern
- (6) age-gate (iii) — design owes the decision; processor-stance keeps the option open in either direction

**Open threads handed back:**
- Direct EDPB PDF fetch for verbatim contractual language (when DPA template is drafted)
- Two more vendor DPAs for breadth (Beamable, LootLocker, AccelByte)
- "Written assurances" template language not yet visible in surveyed DPAs (re-check 6-12 months)
- Cross-customer analytics / ML training boundary — re-derive when feature shipped

## Session 2026-05-03 evening — auth+language progress (no vault writes yet on the design decision)

## Session 2026-05-03 evening — auth+language progress (no vault writes yet)

**Framing rejected:** state.md's prior "auth+language combined (II)" framing collapsed three decisions (backend language, player auth model, library) under one label. Three independent decisions surfaced; player-auth-model is upstream of library.

**Sub-decisions reached this session, NOT yet vaulted (research pending):**

1. **Customer-developer shape at MVP:** both new-game and existing-game customers in scope. ICP indie/SMB skews new-game.
2. **Player auth model at MVP:** owned-only. Pass-through deferred to post-MVP. Defense: integration burden lower for indies starting fresh; pass-through requires customer-side JWKS + claim-mapping config not justified at MVP capacity (solo dev + 20mo runway).
3. **Pass-through trigger (post-MVP):** demand-gated. Operational signal to sharpen on vault: *"first paying customer with a live game (existing player base) requests pass-through."* User said "when customers need it" — sharpen before vaulting.
4. **PII scope:** user picked (ii) standard-PII (profile fields in BokChoy DB). Defense empty — "need to own all our info" is choice restated, not engineering reason. Real defense path: cockpit live-ops dashboards + SDK in-game UI need profile fields; minimal-PII (i) would force customer-side join. Defense not yet articulated by user; vault blocked.
5. **Compliance posture (controller vs processor):** UNRESOLVED. (ii) reads like controller-stance but most B2B SaaS at this scale operates as processor-under-DPA. User did not pick. **Research-blocking.**
6. **(iii) contractual age-gate:** UNADDRESSED. (ii) without (iii) means COPPA exposure on every indie customer shipping to under-13. F2P mobile has real exposure (casual mobile + family-aimed games). User skipped this fork. **Research-blocking.**

**Library + ORM + language decisions deferred — depend on (4)+(5)+(6) landing first.** User pre-named Better Auth + Drizzle in passing; neither defended, neither vaulted. ORM choice is also an unrecorded creep — flag for separate decision once auth resolves.

## Research handoff queue — auth-compliance-research

**Mode:** /research

**Query (load-bearing for vault on player auth model):**

> *"For a B2B game-backend SaaS storing end-user (player) PII on behalf of customer-developers (game studios), what is the GDPR controller-vs-processor stance and COPPA operator-vs-service-provider scope? Surface production-cited stances from at least 3 of: PlayFab, Beamable, LootLocker, Heroic Labs, Unity GS Economy, AccelByte. For each: what does their DPA / privacy policy / terms commit to? Specifically: (a) controller or processor, (b) breach notification flow (direct-to-subject vs. through-customer), (c) DSR handling (direct vs. customer-mediated), (d) under-13 audience stance — contractually excluded, age-gate primitives provided, or full COPPA-compliant operator-stance with verifiable parental consent."*

**Sub-questions:**

- (S1) Industry pattern: do game-backend SaaS contracts contractually exclude under-13 customer audiences at MVP scale, or do they ship age-gate primitives + parental-consent infrastructure?
- (S2) GDPR controller-stance vs processor-stance: what's the burden delta concretely (DSR direct vs through-customer, breach notification timing, contract templates required)?
- (S3) Cross-reference `[[deidentify-mechanism-research]]` AEPD/EDPS key-destruction-as-erasure — does that pattern depend on controller-stance, or does it work for processor-stance equally?

**Triangulation target:** ≥3 game-backend SaaS production cites + ≥1 GDPR primary-source (EDPB / regulator guidance) + ≥1 COPPA primary-source (FTC guidance).

**Hand back to /design with:** sourced answer to (4)+(5)+(6) so the player-auth-model decision can be vaulted with engineering substance + production-grade gates cleared.

## Next session pickup — auth + language combined

**Mode:** /design (with /research as needed for library survey).

**Why combined (II) not abstract-then-defer (I):** user pre-named Better Auth as a leading candidate. Better Auth is TS-stack only; naming it commits to TS at the language layer. (I) would be bad-faith framing.

**Sequencing decision already locked:** auth-first (before backend service shape, frontend) per the strengthened defense — *"auth defines the tenant identity model which drives backend service boundaries; RLS data-layer is decided per `[[wallet-mechanics]]` §8 but the identity flow producing `app.current_tenant` is wide open."*

**Constraints to declare upfront in the auth+language entry (do NOT skip familiarity):**
- Solo-or-small-team execution per `[[mvp-feature-sequence]]` and `[[wedge-decision]]` 20-month runway cap
- TS proficiency exists; Go/Rust/Elixir do not — **familiarity is a substantive engineering constraint at MVP scale**, not an excuse
- Multi-tenant Postgres-backed SaaS per `[[wallet-mechanics]]` + `[[host-platform]]`
- Auth covers three audiences: (a) BokChoy admin, (b) customer-developer (cockpit + SDK), (c) player — load-bearing fork: BokChoy-owned vs. customer-pass-through
- Self-host preferred per `[[host-platform]]` lock-in mitigation
- Supabase Auth already rejected per `[[host-platform]]`

**Candidate space to enumerate (research-grade survey if going /research first):**
- TS-stack: Better Auth (user's pre-pick, 2024 release — production-maturity risk), Auth.js / NextAuth (production-mature, framework-coupled to Next.js), Lucia (you-own-the-auth-logic framing, also new), Clerk / WorkOS (managed, lock-in concern)
- Non-TS-stack-evaluated-for-comparison: Ory Hydra/Kratos (Go), Keycloak (Java)
- Roll-your-own (rejected default — auth implementation is OWASP-class risky)

**Three audience designs owed once library is picked:**
- (a) BokChoy admin — smallest, probably SSO via the chosen library
- (b) Customer-developer — two surfaces: cockpit web login + SDK token/key. Multi-tenant: customer = tenant, customer-team-members = users within tenant. Better Auth has organization plugin if that path lands.
- (c) Player auth — the load-bearing fork. **BokChoy-owned** (player accounts in BokChoy DB; SDK auths players against BokChoy) vs. **customer-pass-through** (customer's existing player ID is opaque; SDK accepts customer-issued token; BokChoy validates against customer-supplied verification config). Different threat models, different compliance surfaces (BokChoy-owned = BokChoy now stores PII; pass-through = BokChoy stores only opaque IDs, customer owns PII). This fork interacts with `[[deidentify-mechanism-research]]` (HMAC-SHA-256 pseudonymization works for either model but the rotation-vs-erasure semantics differ).

**Queued cascade obligations from this session (deferred to implementation phase, NOT design):**
1. Reference composition impl docs (~30 min, extends `[[pity-engine-scope]]` F1 reference pity impl with no-duplicates / slot-composition / slot-guarantee patterns from `[[within-roll-composition-scope]]`)
2. Runbook items for `[[loot-rng-construction]]`: rotation runbook + deployment-time GUC-vs-secrets-manager consistency check
3. Pre-implementation security review of canonicalization function
4. CI lint extension (hybrid A+B canonicalization discipline)
5. NIST SP 800-90A Rev.1 PDF direct-text fetch (research open thread, non-blocking, tier upgrade only)

**Vault state at session end:** 32 entries; CL-031 fully closed; `[[wallet-mechanics]]`, `[[catalog-versioning]]`, `[[idempotency-strategy]]`, `[[pity-engine-scope]]`, `[[within-roll-composition-scope]]`, `[[loot-rng-construction]]`, `[[deidentify-mechanism-research]]`, `[[multi-tenant-rls-research]]`, `[[host-platform]]` all stable. Top-down architecture decisions still open: **languages, backend service shape, auth, frontend** (auth+language is the next attack target per this session's pivot).

## Session history (this session, 2026-05-02 → 2026-05-03)

- Last resolved: `[[within-roll-composition-scope]]` + `[[loot-rng-construction]]` amendment (2026-05-03) — **CL-031 fully resolved.** Two-step landing: (1) amended `[[loot-rng-construction]]` to absorb (iii.a) rejection-sampling output mapping (libsodium / OpenBSD pattern with `bias_threshold = (-weight_sum) mod weight_sum`) as Decision item 6 + (iii.c) stream-mode HMAC_DRBG (one Instantiate per `loot_roll`, all Generates from same instance) as Decision item 7; added Reasoning item 8; added two rejected-alternatives entries (modulo bias + per-Generate re-instantiation); cascade-obligation 6 updated to mark (iii.a)+(iii.c) absorbed and (iii.b) handed to `[[within-roll-composition-scope]]`. (2) Wrote `[[within-roll-composition-scope]]` for (iii.b): **P2-strict** — within-roll composition is customer-code; BokChoy ships single-item-per-call `loot_roll` + reference composition impl extending `[[pity-engine-scope]]` F1 docs. Rejected P2-with-helper and P2-with-config + the Hiro/AccelByte vertical-metagame P1-equivalent. Defense: contested 4-platform survey (2-of-4 each side) + symmetry with `[[pity-engine-scope]]` posture + ~10-line customer code + reference-impl can absorb ergonomic concern. Three failure modes (F1 customer filter implementation error, F2 audit opacity, F3 reference impl doesn't generalize) with mitigations. **CL-031 fully resolved across all four sub-decisions:** (i) moot under `[[pity-engine-scope]]`, (ii) resolved in `[[loot-rng-construction]]`, (iii.a)+(iii.c) absorbed into `[[loot-rng-construction]]` items 6+7, (iii.b) resolved in `[[within-roll-composition-scope]]`. **Cascade obligations now queue:** reference composition impl extension to `[[pity-engine-scope]]` F1 docs (~30 min on top of the pity reference); CL-031 entry in DESIGN.md audit can mark CL-031 closed; `[[mvp-feature-sequence]]` can absorb the docs commitment. **Next:** decide what's next in the DESIGN.md audit register, or hand off to /implementation if CL-031 was the last open architecture decision.
- Prior resolution (2026-05-03): `[[loot-rng-output-research]]` — **CL-031 sub-decision (iii) research pass complete (β scope).** (iii.a) rejection sampling locked via libsodium + OpenBSD direct-source cites with named modulo-bias rejection in both. (iii.c) stream-mode HMAC_DRBG locked via go-hmac-drbg Generate() direct-source cite; 9999-call ceiling non-binding for per-call-seed model. (iii.b) survey of PlayFab + AccelByte + Hiro + Hearthstone converges on slot-by-slot composition; **new wrinkle:** within-roll no-duplicates is platform-level in Hiro (`max_repeats`/`max_repeat_rolls`) and AccelByte ("never rewarded the same item"). Surfaces a new design fork: **P2-strict vs. P2-with-helper (`loot_roll_excluding`) vs. P2-with-config (`max_repeats_within_roll` on `loot_table`).** Triangulation met. Confidence medium. Open threads: NIST SP 800-90A Rev.1 PDF direct render (binary rendering issue with WebFetch), AccelByte reference-impl source for platform-vs-example clarification on no-duplicates. **Next: switch back to /design to (a) lock (iii.a)+(iii.c) into a brief decision entry that absorbs the rejection-sampling pseudocode + stream-mode confirmation into `[[loot-rng-construction]]`, and (b) resolve the new (iii.b) within-roll-constraints fork (P2-strict vs. P2-with-helper vs. P2-with-config).**
- Prior resolution (2026-05-03): `[[wallet-mechanics]]` §5 schema patch per `[[loot-rng-construction]]` cascade-1. Added `rng_key_id SMALLINT NOT NULL DEFAULT 1` between `idempotency_key_id` and `created_at` on `loot_rolls`; updated `seed_inputs` comment to reference hybrid A+B canonicalization in `[[loot-rng-construction]]`; added rotation-mechanism paragraph after the opacity paragraph; updated cascade-obligation 1 in wallet-mechanics to mark CL-031 (ii) resolved + (iii) still owed. **Next: CL-031 sub-decision (iii) PRF-output → roll mapping.**
- Prior resolution (2026-05-03): `[[loot-rng-construction]]` — **CL-031 sub-decision (ii) resolved across four sub-questions.** PRF = HMAC_DRBG over HMAC-SHA-256 (research-determined). Server secret = HMAC_DRBG `entropy_input` (research-determined). Canonicalization = **hybrid A+B** (fixed-length binary for `(project_id 16B, banner_id 8B, player_id 8B, attempt_number 4B)` + 4-byte length-prefix for `pull_session_id`); position survived an iterated challenge cycle (initial hybrid → user "not-over-engineered" criterion → walk-back to pure B → user pushback "sometimes clever is right" → re-derived hybrid on substance: production-cited construction + locked schema + length-prefixing fixed fields is redundant). Rotation = **α+β-default** (new `rng_key_id SMALLINT` column, GUC-driven, server-populated, "no rotation by default" symmetric to `[[deidentify-mechanism-research]]`). Secrets = **independent** `bokchoy.rng_secret` ≠ `bokchoy.anon_secret` (Krawczyk key-separation axiom). Five rejected alternatives + five failure modes. **Cascade:** §5 schema patch (`rng_key_id` column), runbook items (rotation + deployment-time consistency check), pre-implementation security review of canonicalization function, reference pity impl now unblocked. **Calibration moment logged:** I walked back the hybrid position too fast under "not over-engineered" pressure; user caught it; re-derivation found the substantive defense (production-cite + locked schema + redundancy avoidance) that aesthetic walk-back missed. Pattern to watch on future forks: don't conflate "simpler" with "right" when production-cited idiom is non-uniform for a reason. **Next: §5 schema patch (mechanical), then CL-031 sub-decision (iii) PRF-output → roll mapping.**
- Prior resolution (2026-05-03): `[[loot-rng-research]]` — CL-031 sub-decisions (ii) seed format + PRF construction + (ii.4) rotation-vs-replay-determinism research pass. **PRF locked via existing stack:** HMAC_DRBG (NIST SP 800-90A) over HMAC-SHA-256 — RFC 6979 reference design + HashiCorp `go-hmac-drbg` production cite. **Server secret enters as `entropy_input`** (NOT HKDF — wrong primitive class for per-call determinism; NOT BIP-32 hierarchical — unneeded for flat input shape). **Seed canonicalization is open: three production-cited patterns (A fixed-length binary BIP-32; B length-prefix csexp; C canonical CBOR/JSON) — no clean winner; hybrid A+B mirrors RFC 6979's int2octets+bits2octets composition for BokChoy's mixed-fixed/variable input shape.** **Rotation pattern α (key-id stamp + version-aware lookup) recommended-for-design** — SaaS Shield Deterministic Encryption cite + symmetric to existing `[[deidentify-mechanism-research]]` `anon_key_version` pattern. Pattern β (no-rotation, accept invalidation per BIP-32 stance) is the alternative. **Triangulation met** (BIP-32 + Vault Transit + SaaS Shield + RFC 6979 + RFC 5869 + RFC 8785 + OWASP/CWE class-level contradiction probe); confidence medium — gap on (a) no specific forge-attack post-mortem in public record, (b) NIST SP 800-90A + RFC 8949 §4.2 referenced via search-summary not direct fetch. Open threads: direct-fetch upgrades, security review of chosen canonical form before implementation, cascade question on shared-vs-independent secrets between RNG and de-id. Sub-decision (iii) PRF-output → roll mapping deferred. **Next: switch back to /design to resolve (ii.2) canonicalization choice + (ii.4) rotation pattern + secret-sharing question.**
- Prior resolution (2026-05-02): `[[wallet-mechanics]]` §5 + cascade list patched per `[[pity-engine-scope]]`. Column rename `pity_state_before/after` → `pre_state/post_state` with customer-opaque comments + `[[pity-engine-scope]]` link; line-231 prose rewritten ("pity-state debugging" → "state-transition reconstruction"); new opacity paragraph added at §5 explaining customer-side pity ownership + reference impl pattern; cascade-obligation 1 (CL-031) scoped to (ii)+(iii) only with (i) marked moot at platform layer; cascade item 10 added (reference pity impl as MVP docs commitment, depends on (ii)+(iii) landing first). Cascade-obligation 2 (cancel `[[catalog-versioning]]` `pity_class` field) — no edit needed yet because catalog-versioning never wrote the field; cancellation is preventative only. Cascade-obligation 3 (CL-031 (i)/A/B/C moot) and 4 (record-only) and 5 (mvp roadmap) handled in wallet-mechanics + pity-engine-scope vault entries. **Next: CL-031 sub-decision (ii) seed format + PRF construction.**
- Prior resolution (2026-05-02): `[[pity-engine-scope]]` — **CL-031 scope decision = P2.** Pity is NOT a BokChoy platform primitive; customer ships pity in extension code. BokChoy ships `loot_roll` server function + `loot_rolls` audit table with opaque `pre_state`/`post_state` JSONB blobs + documented reference pity impl. Rejected P1 (Hiro built-in stance — schema lock-in + monetization-lever-ownership mismatch) and P3 (hybrid — MVP team can't run two surfaces). Defense: wedge does not require P1 + P2 forecloses nothing + 2-of-3 surveyed platforms ship this scope. Four failure modes (F1 ergonomic, F2 customer concurrency leak, F3 audit opacity, F4 determinism-boundary). Mitigations: reference impl in docs (~1 day, MVP commitment per `[[mvp-feature-sequence]]`). **Cascade obligations:** (1) patch `[[wallet-mechanics]]` §5 column rename `pity_state_before/after` → `pre_state/post_state`; (2) cancel `[[catalog-versioning]]` `pity_class`/`banner_type` cascade from `[[pity-state-research]]`; (3) CL-031 (i)/A/B/C MOOT at platform level; (4) CL-031 (ii) seed/PRF + (iii) RNG-output mapping STILL LIVE — next attack target; (5) reference pity doc on MVP roadmap.
- Prior resolution (2026-05-02): `[[pity-state-research]]` — **first research pass on CL-031 sub-decision (i)**. Three platform stances surveyed (Hiro built-in / AccelByte Extend Override / PlayFab Cloud Script); modal carry-over pattern across surveyed gacha is per-banner-TYPE (Genshin, HSR, Neverness) with Seven Deadly Sins Origin as per-banner-reset counter-example. **Position A gains production cite (Hiro Rewards docs); Position B loses its ledger-by-analogy support — zero surveyed game-backend applies event-sourcing to pity.** Keying is load-bearing and independent of A/B/C: state must key on `(player_id, banner_type)`, not `banner_id`, not just `player_id`. **Cascade obligation queued for design:** `[[catalog-versioning]]` `loot_table` schema must expose a `banner_type` / `pity_class` discriminator independent of `banner_id`. Triangulation met (4 platforms + 4 gacha titles + academic monetization analysis); confidence medium (Hiro binary closed; miHoYo primary disclosures not directly fetched). Open threads: miHoYo China-mandated rate disclosure direct fetch, Hiro binary capabilities, card-pack pity (Hearthstone), event-sourced loyalty CRMs as adjacent-domain B-cite. Sub-decisions (ii) seed/PRF and (iii) RNG-output mapping deferred.
- Prior resolution (2026-05-02): `[[wallet-mechanics]]` **amendment vault-final** — review of v1 wallet-mechanics produced three soft spots; research entries triangulated each (Q1 webhook, Q2 RLS, Q3 de-id); host-platform decision surfaced + vaulted; amendment written across 12 sections. **Four amendment-soft-spots** (failure-rate threshold ≥80%/10/5min, dead-letter retention 7d-then-30d, BIGINT anon_id with 10M-player upgrade trigger, breakglass role unspecified) **accepted-as-written under tagged revisit triggers** — not separately defended; review encoded in §4b/§4c/§6/§8 + Revisit-when. Decisions: (1A) §4a/§4b/§4c required deliverables. (2A) RLS — `bokchoy_app` non-owner + `FORCE ROW LEVEL SECURITY` + per-tx `SET LOCAL app.current_tenant`. (3A) HMAC-SHA-256 + per-tx `SET LOCAL bokchoy.anon_secret`, no rotation by default, key destruction = erasure. PlanetScale + v1 MD5 + Stripe-shape long-window-passive vaulted as rejected. Failure modes 8-12 named.
- Prior resolution (2026-05-02): `[[host-platform]]` — surfaced a previously-implicit load-bearing constraint: **MVP runs on Supabase managed Postgres, DB-only (no Auth/Storage/Realtime/Edge Functions/PostgREST)**. Cost is the reason; DB-only is the lock-in mitigation. Migration to non-Supabase host is connection-string change, not a rewrite. Two cascade obligations: verify `pg_partman` availability on Supabase tier; verify Supavisor in transaction mode preserves `SET LOCAL` semantics. Both fail-safe — substitute if either diverges.
- Prior resolution (2026-05-02): [[catalog-versioning]] — **CL-030 resolved.** T1 + T2-subset (bulk-publish + diff view + optional bulk-scheduled-publish) shipped at MVP; approval workflows deferred (T3 git PR is parallel approval surface so dashboard workflow doesn't pay back at MVP scope); `[[catalog-cac-upgrade]]` stub created for T3. Schema: `catalog_items` with type discriminator + Draft/Published/Archived state + ETag `version` + JSON Patch diffs in `catalog_audit`. M2 mechanism transferred from `[[wallet-mechanics]]`. Per-project environment isolation. Six failure modes named with mitigations. Cascade: CL-031 loot tables follow this lifecycle.
- Prior resolution (2026-05-02 earlier): [[catalog-versioning-research]] — first pass on CL-030, falsified DESIGN.md §12.3's DAG-branchable framing.
- Prior resolution (2026-05-02): [[wallet-mechanics]] — **CL-029 resolved.** Combined decision entry covering path B + M2 + unified `transactions` audit + sister tables + `staged_jobs` outbox + 24mo hot retention + de-identification on account close.
- Tooling fix queued: `.bocek/preflight-bug-2026-05-02.md` documents two bugs in `~/.bocek/scripts/preflight.sh` (vault-path doubling + mode-file-not-written). User maintains bocek; will fix.
- Prior resolutions (2026-05-02): three CL-029 research follow-ups vaulted as `[[wallet-source-of-truth-research]]` (path B picked), `[[wallet-audit-invariant-research]]` (M2 picked), `[[staged-jobs-schema-research]]` (schema + sister-tables pattern), `[[audit-retention-research]]` (24mo hot, de-identify, monthly partitioning).
- Status: design draft is in vault. **User pending review of `architecture/wallet-mechanics.md` before vault is considered final.** Items most worth challenging in review: per-kind `max_attempts` values (initial-values labeling is honest but the numbers are my judgment); de-identification function `bokchoy.anon_secret` parameter name is a placeholder; failure-mode list is comprehensive but not exhaustive.
- Prior resolution (2026-05-02 earlier): [[wallet-source-of-truth-research]] — chose path B over A/C/D for wallet source-of-truth. Path B has tier-1+2 backing across PlayFab/Beamable/LootLocker/AWS-reference; path A is fintech-scale only. Open Q1/Q2/Q3 follow-ups identified.
- Prior resolution (2026-05-01): [[idempotency-strategy]] **rewritten** — hybrid keys (server-derived natural + client-supplied header), Postgres-only storage (B7, permanent commitment regardless of future Redis), per-step UNIQUE + outbox (`staged_jobs`) + deterministic-RNG-on-key for loot (D2-α, no `recovery_point` column), 422 mismatch / 409 in-flight per IETF draft 07 + Stripe SDK auto-retry behavior, bokchoy-prefixed error codes, 24h TTL Shopify-cited. `[[mvp-feature-sequence]]` patched alongside: Redis dropped from MVP stack (lines 53, 56, 63, 65, 98).
- In progress: **CL-031 active 2026-05-02.** Server-authoritative loot — constrained by `loot_rolls` schema (§5 of `[[wallet-mechanics]]`: `seed_inputs`, `pity_state_before`, `pity_state_after`, UNIQUE on (player_id, banner_id, pull_session_id, attempt_number)) + Draft/Published `loot_table` lifecycle from CL-030 + HMAC-SHA-256 + pgcrypto + `SET LOCAL`-secret pattern from §6. Four sub-decisions owed: (i) pity-state engine — separate authoritative table vs. derive-from-latest-roll vs. hybrid; (ii) seed format — input combiner + PRF, with HMAC-SHA-256 the leading candidate by stack consistency; (iii) PRF-output to RNG mapping — stream-cipher style or hash-per-roll; (iv) retry semantics — replay forced by `[[idempotency-strategy]]` D2-α + UNIQUE constraint, mechanical to record. (i) is most architecturally load-bearing; attack first. Then CL-032 tenant isolation (deferred per `[[wedge-decision]]` until post-Series-A scale).
- Open: §14 Phase 0 commitment shapes still owed (i/ii/iii). PK-* park items still requiring customer discovery (founder workstream). `[[runbook-idempotency]]` to be written in implementation phase. CL-003 founder credibility hard-vs-soft gate still owed (separate from research). Cybertec article on triggers-to-enforce-constraints fetch returned 403 — re-fetch if M3 ever becomes a candidate.
- Tooling note (2026-05-02): `bocek` preflight reports mode transitions in stdout but does not write `.bocek/mode` — enforcement hook reads stale value. Worked around by using WebFetch in place of `git clone`. Not blocking; flag for tooling fix.

## Top-5 results summary
- CL-007 — falsified (cockpit gap is not category-creating)
- CL-001 — partial (per-cell conditions; A1 is most crowded with worst pricing math; B1 candidate; C1 not Year-1 slice; D1 smallest gap; design owes the cell choice)
- CL-009 — falsified (12–18 month cycle is enterprise-tier; mid-market is 30–120 days)
- CL-002 — falsified (no reference frame moat translates; pattern fits GitHub/Dependabot not Stripe)
- CL-006 — partial (technical feasible at auth-bridge; political damaged; SDK risk real)

## CL-003 still owed (not research)
Founder credibility hard-vs-soft gate decision. §15 says non-negotiable; §23 lists it as Open Question #1. Design owes a decision independent of any research finding.

## Resolved this session
- [[cockpit-gap-research]] resolves CL-007 (falsified)
- [[slice-cell-research]] resolves CL-001 partial (per-cell conditions; design owes the choice)
- [[sales-cycle-research]] resolves CL-009 (falsified)
- [[structural-moat-research]] resolves CL-002 (falsified)
- [[integration-feasibility-research]] resolves CL-006 (partial)
- [[wedge-decision]] — keystone decision, replaces DESIGN.md §1 / §4 / §5 / §6 / §10 / §15 / §16 / §17 / §19 wedge framing
- [[mobile-f2p-economy-math-research]] — domain depth research, cascades into MVP feature requirements
- [[indie-smb-pricing-research]] resolves CL-010 partial — rebuilt tier mix replaces DESIGN.md §16
- [[mvp-feature-sequence]] — MVP keystone decision, replaces DESIGN.md §14 build roadmap
- [[idempotency-strategy]] resolves CL-028 — first architecture decision; cascades to every mutating API endpoint
- [[idempotency-strategy-research]] — sense-check on `[[idempotency-strategy]]`. Returns 7-point obligation list to design.
- [[wallet-source-of-truth-research]] (2026-05-02) — partial CL-029. Establishes path B (CRUD-on-balance + same-txn audit) is the named game-backend pattern across PlayFab/Beamable/LootLocker/AWS-reference; path A is fintech-scale only (Stripe). Hands back to `/design` for the A/B/C/D pick and `staged_jobs` schema.

## Cumulative damage to DESIGN.md
- §3 problem statement: "BaaS economy modules are shallow" — contested by 4+ named incumbents
- §4 complement-don't-compete moat: damaged on TWO axes — wedge mechanism (cockpit-gap) and cycle-length premise (sales-cycle)
- §4 "12–18 month sales cycle" — falsified for the mid-market ICP; correct only at enterprise tier
- §10 Heroic Labs partnership: directly contradicted by Hiro shipping
- §17 partnership-led acquisition: complement frame's cycle-length justification removed; greenfield-replacement GTM becomes viable
- §18 competitive landscape: 3+ vendor cells factually wrong + Hiro row missing
- §16 pricing tier math: implicit assumption of long cycles for $1,499/mo Studio doesn't match mid-market benchmarks

## Top-5 from the register (proposed research order)
1. CL-001 — slice = A1 mobile F2P runtime
2. CL-007 — designer-first live-ops UX gap exists (incumbents don't ship it)
3. CL-002 — complement-don't-compete is a structural moat
4. CL-009 — replacement-BaaS sales cycle is 12–18 months
5. CL-006 — 30-min PlayFab/Nakama/UGS integration is technically + politically achievable

## Open questions handed back from design
1. Slice not vaulted: A1 (mobile F2P runtime) was picked in `docs/DESIGN.md` without rejected-alternatives derivation. Research must produce per-cell teardown so design can run *Position derivation* against evidence.
2. "Complement, don't compete" lacks structural moat: Stripe/Twilio/Segment/RevenueCat reference frames asserted from training, not verified. Research must establish the actual structural reason each survived — and the historical pattern of BaaS-vs-specialist outcomes in adjacent SaaS.
3. NOT a research question: founder credibility (§15 vs. §23 contradiction). User owes design a separate decision.

## Vault hygiene done this session
- Moved 3 loose entries from vault root → `_shared/` per path convention
- Renamed: `00-research-scope.md` → `_shared/research-scope.md`, `01-landscape-survey.md` → `_shared/landscape-survey.md`, `02-africa-field-notes.md` → `_shared/africa-field-notes.md`
- Created `index.md` and this `state.md`
- Updated internal link in landscape-survey to use `[[wikilink]]` form
- 2026-05-02: split flat `_shared/` into topical dirs to match `index.md` sections. New layout: `_shared/` (cross-cutting research), `wedge/` (wedge-decision + supporting research), `mvp/` (mvp-feature-sequence), `architecture/` (idempotency-strategy + research). Wikilinks unchanged — basename resolution preserved. No entry contents touched.
