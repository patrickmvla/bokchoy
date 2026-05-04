---
type: research
features: [local-docker, infra]
related: ["[[host-platform]]", "[[backend-stack]]", "[[wallet-mechanics]]", "[[multi-tenant-rls-research]]", "[[deidentify-mechanism-research]]"]
created: 2026-05-03
confidence: high
provisional: false
---

# Local Postgres + integration-test infra for BokChoy MVP (Docker Desktop / WSL2, scope 1+2)

## Question

For BokChoy MVP local dev (scope 1: solo-dev iteration loop) + integration tests (scope 2: throwaway-DB-per-run Vitest suite), running on Docker Desktop / WSL2 with Supabase managed Postgres committed in prod per `[[host-platform]]`:

- **Q1.** What does `supabase/postgres` ship in 2026, particularly `pg_partman` (load-bearing per `[[wallet-mechanics]]` partitioning), and what does Supabase CLI's `supabase start` allow excluding for a DB-only profile?
- **Q2.** What's the production-cited pattern for teams running Supabase managed Postgres in prod and shipping a custom local Docker setup? Is the modal pattern `supabase start`, standalone `supabase/postgres` via compose, or stock Postgres with manual extension install?
- **Q3.** Does the local Docker need Supavisor in the loop, or can integration tests connect direct-to-Postgres while Supavisor verification happens against a staging Supabase project?
- **Q4.** Canonical 2026 pattern for Vitest (or `bun test`) running real-Postgres integration tests with `[[multi-tenant-rls-research]]`-shaped `SET LOCAL app.current_tenant` GUC + Drizzle declarative RLS — per-test isolation strategy, GUC interaction with transaction-rollback, extension support requirements?

## Triangulation

- **Production reference:** ✓ — `supabase/postgres` repo (Q1), `supabase/cli` repo (Q1), `supabase/supavisor` repo (Q3), `lrfds/IncentivFlow` `withTenant` cite + 9 other GitHub repos surfacing the pattern (Q4).
- **Docs reference:** ✓ — Supabase CLI `supabase start` reference (Q1, verbatim flag definition), Supabase Connecting-to-Postgres docs (Q3, verbatim Supavisor transaction-mode prepared-statement constraint), Drizzle Discussion #5140 (Q4, semi-official guidance from Drizzle team).
- **Contradiction probe:** ✓ — actively searched for "team ditched supabase start for stock postgres" engineering posts; **none found** (search across `"plain postgres" docker local dev "supabase"` etc.). Found `supabase/postgres` issue #1586 (open, 2025-05-06) reporting `pg_partman` not on managed Postgres despite docs recommending it — load-bearing contradiction surfaced (see *Conflicts*).

## Sources examined

### Source 1 — `supabase/postgres` repo (production code)
- **Tier:** 1 (production code).
- **Provenance:** `github.com/supabase/postgres` on default branch `develop`, observed 2026-05-03 via `gh api`. `pushed_at: 2026-05-01T17:18:15Z`. Files: `nix/ext/versions.json`, `migrations/tests/extensions/30-pg_partman.sql`, `nix/tests/expected/extensions_schema.out`, `Dockerfile-17`.
- **Author context:** Supabase official; this repo's binaries are what backs both the `supabase/postgres` Docker Hub image and Supabase managed Postgres servers (cited as such in repo README).
- **What it tells us:** `pg_partman` 5.3.1 is shipped as a Nix-packaged extension binary alongside ~30 other extensions (`pg_cron`, `pgaudit`, `pgsodium`, `pgjwt`, `pg_stat_monitor`, `pgtap`, `pgvector`, `pgroonga`, `postgis`, etc.). `pgcrypto`, `pg_stat_statements`, `uuid-ossp` are auto-installed in the `extensions` schema by default (per `nix/tests/expected/extensions_schema.out`). The repo's own pg_partman test (`migrations/tests/extensions/30-pg_partman.sql`) shows the canonical install: `CREATE SCHEMA partman; CREATE EXTENSION pg_partman WITH SCHEMA partman;`. Dockerfile-17 uses Alpine 3.23 + Nix flake build.

### Source 2 — `supabase/postgres` Docker Hub image (production artifact)
- **Tier:** 2 (vendor docs / artifact metadata).
- **Provenance:** `hub.docker.com/r/supabase/postgres`, observed 2026-05-03. Latest tag `17.6.1.113`, **348.1 MB**, updated 2 days prior. Standalone-via-compose example documented for v14.1.0+.
- **Author context:** Supabase official Docker Hub.
- **What it tells us:** The repo's `Dockerfile-17` artifact is published as a standalone image and can be used independently of `supabase start` / the CLI orchestration. Documented compose usage: image + named volume + port 5432 + `command: postgres -c config_file=/etc/postgresql/postgresql.conf`.

### Source 3 — `supabase/cli` repo (production code)
- **Tier:** 1.
- **Provenance:** `github.com/supabase/cli` default branch, files `cmd/start.go` and `internal/start/start.go`, observed 2026-05-03 via `gh api`.
- **Author context:** Supabase official CLI.
- **What it tells us:** `supabase start` accepts `-x, --exclude` flag taking a list of container names from `start.ExcludableContainers()`, validated against `config.Images.Services()`. Excludable containers (verified verbatim in Source 4): `gotrue, realtime, storage-api, imgproxy, kong, mailpit, postgrest, postgres-meta, studio, edge-runtime, logflare, vector, supavisor`. The `db` (Postgres) container is NOT excludable — always on.

### Source 4 — Supabase CLI docs: `supabase start` reference
- **Tier:** 2 (current vendor docs).
- **Provenance:** `supabase.com/docs/reference/cli/supabase-start`, observed 2026-05-03.
- **What it tells us:** Verbatim flag definition: *"`-x, --exclude <strings>` Optional Names of containers to not start. [gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor]"*. Confirms `mailpit` is in the local stack — solves Better Auth email capture without adding a separate compose service if Path A (full CLI) is chosen.

### Source 5 — `supabase/postgres` issue #1586 (contradiction probe)
- **Tier:** 6 (forum/issue) — but used here as a contradiction-probe signal, not a citation for a positive claim.
- **Provenance:** `github.com/supabase/postgres/issues/1586`, opened 2025-05-06, **state: open** as of 2026-05-03.
- **What it tells us:** Reporter claims Supabase docs recommend `pg_partman` but the extension is not available on **managed Supabase Postgres**, while still being in the `supabase/postgres` repo binaries. Establishes that *the binaries shipping in the repo/image ≠ what's in the prod-tier `supautils.extensions` allowlist*. Issue still open ⇒ historical gap not yet definitively closed via this issue thread.

### Source 6 — Supabase Discussion #37986 (staff statement)
- **Tier:** 4 (engineering blog / staff statement). Author: `encima`, Supabase maintainer.
- **Provenance:** `github.com/orgs/supabase/discussions/37986`, last comment 2025-10-28.
- **What it tells us:** Verbatim: *"This is in progress and should be released soon!"* — confirms pg_partman was being added to managed tier as of 2025-10-28.

### Source 7 — Supabase Discussion #35851 (staff statement, later)
- **Tier:** 4. Author: `samrose`, Supabase staff.
- **Provenance:** `github.com/orgs/supabase/discussions/35851`, comment 2025-11-13.
- **What it tells us:** Verbatim: *"we do not have an exact date yet, but it's in progress and going to land as soon as we can"* — most recent staff statement found, **6 months prior to today (2026-05-03)**. After this date the public-record evidence goes silent on a definitive shipped-or-not signal.

### Source 8 — Snap Cloud (Supabase-powered) extension docs
- **Tier:** 5 (third-party advocacy/docs). Snap Cloud is a partner running Supabase under the hood.
- **Provenance:** `cloud.snap.com/docs/guides/database/extensions/pg_partman`, surfaced via web search dated 2026-Q1.
- **What it tells us:** A Supabase-powered third party is publishing pg_partman install docs. Suggests pg_partman is now on the Supabase managed extension allowlist as of 2026-Q1. **Indirect** — would prefer a tier-1 or tier-2 Supabase-official confirmation, but none was found in the surveyed scope.

### Source 9 — Supabase docs: Connecting to Postgres
- **Tier:** 2.
- **Provenance:** `supabase.com/docs/guides/database/connecting-to-postgres`, observed 2026-05-03.
- **What it tells us:** Verbatim: *"Transaction mode does not support prepared statements. To avoid errors, turn off prepared statements for your connection library."* This is a constraint that propagates to `[[backend-stack]]` — `postgres-js` (the recommended Drizzle driver) defaults to prepared statements; **production must set `prepare: false`** to use Supavisor transaction-mode (port 6543).

### Source 10 — `supabase/supavisor` repo (production code, partial)
- **Tier:** 1.
- **Provenance:** `github.com/supabase/supavisor`, files `lib/supavisor/client_handler.ex` etc., observed 2026-05-03 via `gh api`. Elixir source.
- **What it tells us:** Confirms the prepared-statement constraint is enforced at the pooler level (separate code path for prepared-statement packets). No direct evidence on `SET LOCAL` semantics from code inspection at this depth, but the constraint chain is: Postgres `SET LOCAL` is transaction-scoped per Postgres semantics → transaction is released to pooler on COMMIT/ROLLBACK → pooler returns connection to free pool → next client gets a fresh GUC state (matches `[[multi-tenant-rls-research]]` finding for PgBouncer-class poolers).

### Source 11 — `lrfds/IncentivFlow/apps/api/src/core/rls.ts` (cautionary cite)
- **Tier:** 1 (production code, but cautionary).
- **Provenance:** `github.com/lrfds/IncentivFlow`, observed 2026-05-03 via `gh api` code search.
- **Author context:** Independent project; one of 10+ TypeScript repos surfacing the `withTenant` + `set_config` pattern in production code search.
- **What it tells us:** Demonstrates the **wrong** form of the pattern: `prisma.$executeRawUnsafe("SELECT set_config('app.org_id', $1, true), …")` called outside an explicit transaction. The third arg `true` makes `set_config` transaction-scoped, but with no surrounding tx the GUC bleeds across pooled connections. **BokChoy's `withTenant(projectId, fn)` per `[[backend-stack]]` and `[[multi-tenant-rls-research]]` correctly opens an explicit transaction first** — the cautionary cite is useful as a what-not-to-do reference for code review checklist.

### Source 12 — Drizzle Discussion #5140 (semi-official guidance)
- **Tier:** 4 (Drizzle team / community guidance, named author).
- **Provenance:** `github.com/drizzle-team/drizzle-orm/discussions/5140`, observed 2026-05-03.
- **What it tells us:** Recommended Vitest + Drizzle + Postgres patterns in priority order: (i) **schema-per-test** for parallel execution (each test creates a uniquely-named schema, drops in cleanup); (ii) **transaction rollback** wrapping each test (simpler, sequential); (iii) **Testcontainers** for full isolation. Vitest config `pool: "forks"` + `singleFork: true` for true isolation OR parallel with schema isolation. Discussion does NOT directly address GUC/SET LOCAL × isolation-strategy interaction.

### Source 13 — `[[multi-tenant-rls-research]]` (internal vault)
- **Tier:** N/A — internal vault entry, not a primary source but a triangulated synthesis already in the vault.
- **Provenance:** `.bocek/vault/architecture/multi-tenant-rls-research.md`, vaulted 2026-05-02.
- **What it tells us:** Already established that PgBouncer transaction-mode + `SET LOCAL` is documented-safe (Postgres SET docs + PgBouncer docs + Heroku prescriptive guidance + JP Camara). Supavisor is API-compatible with PgBouncer transaction-mode at this level — finding transfers.

## Findings

### Path A — `supabase start` with `-x` exclusions
**What:** Use the official Supabase CLI to launch the local stack via `supabase start -x gotrue,realtime,storage-api,imgproxy,kong,postgrest,postgres-meta,studio,edge-runtime,logflare,vector` — keeping `db` (always on), `mailpit` (Better Auth email capture), `supavisor` (prod-pooler parity).

**Per Sources 3, 4:** All exclusions are documented-supported. `db` cannot be excluded. Mailpit is bundled — solves SMTP capture for Better Auth magic-link / password-reset flows without adding a separate compose service.

**Pros:** Highest prod parity (matches the Supabase Cloud stack image-by-image, Supavisor included). Mailpit included free. CLI handles config generation, port mapping, JWT secrets, role provisioning.

**Cons:** Higher RAM footprint at boot even with most services excluded (CLI still pulls images first run). CLI version drift can shift behavior between contributors. Couples local dev to the CLI's release cadence.

### Path B — `supabase/postgres` standalone Docker Hub image via custom compose
**What:** Pull `supabase/postgres:17.6.1.113` (or current pinned tag) directly in a project-owned `compose.yml`, with named volume for `/var/lib/postgresql/data` and explicit `command: postgres -c config_file=/etc/postgresql/postgresql.conf` (per Source 2). Add a separate `mailpit` service for SMTP capture. Skip Supavisor.

**Per Source 2:** 348MB image, single pull, no CLI dependency. **Per Source 1:** The binaries shipped here are the same the prod-tier servers run — extensions available include pg_partman, pgcrypto, pg_stat_statements, uuid-ossp, pgaudit, pg_cron, pgsodium, etc.

**Pros:** Smallest near-prod-parity option. Project-owned compose file (no CLI version dependency). Single container for the DB.

**Cons:** No Supavisor locally — prepared-statement-disabled bugs (Source 9) won't surface in local. Mailpit is a separate compose service (~30 lines extra). **CRITICAL CAVEAT (Source 5–8):** image binaries include pg_partman, but Supabase managed prod tier's `supautils.extensions` allowlist may not include it as of 2026-05-03 — see *Conflicts*.

### Path C — Stock `postgres:17-alpine` + custom Dockerfile
**What:** Build a project-owned Dockerfile based on stock `postgres:17-alpine`, install pg_partman from source / apt, layer pgsodium + other extensions as needed.

**Per none of the surveyed sources:** No production team in the surveyed scope is shipping this pattern when their prod is Supabase managed Postgres. Search for `"plain postgres" docker local dev "supabase"` returned only Supabase-official paths.

**Pros:** Smallest disk footprint (~80MB stock + extensions ~150MB total).

**Cons:** Drift risk — every time Supabase updates the prod image, Path C falls behind silently. Maintenance burden falls on the project. Solves a problem nobody else is solving.

### Q3 — Supavisor in local
- Supavisor is bundled with Path A (`supabase start`); **not** with Path B (standalone image).
- Per Source 9 (verbatim), Supavisor transaction-mode (port 6543) does not support prepared statements. The Drizzle + `postgres-js` driver defaults to prepared statements, so prod must set `prepare: false`.
- Per Source 13 + Source 10, `SET LOCAL` is documented-safe under transaction-mode pooling (Postgres semantics + pooler-level documented behavior).
- For BokChoy: Path A retains Supavisor, catches prepared-statement bugs locally. Path B skips Supavisor; prepared-statement bugs only surface in staging deployment to a real Supabase project. Solo-dev can absorb that gap if the verification is done early and the `prepare: false` flag is committed in code from day one.

### Q4 — Integration test pattern
- Per Source 12, two production-cited patterns are recommended for Drizzle + Vitest + Postgres:
  - **Schema-per-test (preferred for parallel):** each test creates a uniquely-named schema, runs migrations into it, exercises queries, drops in cleanup. `vitest pool: "forks"` for parallel-safe execution.
  - **Transaction rollback (simpler, sequential):** each test runs inside `BEGIN; ... ROLLBACK;`, GUC + writes die on rollback. `vitest pool: "forks", singleFork: true` for true sequential isolation.
- **PGLite (in-memory WASM Postgres) is OUT** for BokChoy — pg_partman is a server-side extension with background workers; PGLite's WASM Postgres does not support it. Same goes for pg_cron and pgsodium.
- **GUC × isolation-strategy interaction (derived from Postgres + Source 13 semantics, not directly cited):**
  - Transaction-rollback strategy is *natively compatible* with `SET LOCAL` — both are transaction-scoped. Outer test tx wraps inner `withTenant(projectId, fn)` tx via SAVEPOINT semantics; outer ROLLBACK cleans both writes and the GUC.
  - Schema-per-test strategy is also compatible — `SET LOCAL` is set inside the test's queries; schema drop in cleanup is independent.
- **Recommended pattern for BokChoy:** transaction-rollback as the simpler default for solo-dev iteration; switch to schema-per-test if/when test suite size or parallel-CI demands it. Both work with `withTenant()`.
- pg_partman setup (CREATE EXTENSION + schema + partition templates) is heavyweight; do once per test database in a `beforeAll`, not per-test.

## Conflicts

**Load-bearing conflict — pg_partman managed-tier availability:**

- **Source 1** (repo binaries) and **Source 2** (Docker Hub image) confirm pg_partman 5.3.1 ships in the local image with full install pattern documented and tested.
- **Source 5** (issue #1586, open since 2025-05-06) and **Source 7** (staff statement 2025-11-13) say pg_partman was NOT on managed prod 6 months ago and "in progress, no firm date."
- **Source 8** (Snap Cloud, 2026-Q1) suggests it has shipped via a Supabase-powered third party publishing install docs.
- **No tier-1 or tier-2 Supabase-official confirmation** that pg_partman is on the managed prod allowlist as of 2026-05-03.

Per *Contradiction protocol* (production code > docs > blogs):
- The repo binary is necessary but not sufficient — managed-tier servers run the binary BUT gate user access to extensions via `supautils.extensions` allowlist. The repo's binary presence does not prove allowlist inclusion.
- The Snap Cloud doc (tier 5) is suggestive but not authoritative; could be aspirational, could be a fork-specific allowlist.
- **Resolution:** This conflict is NOT artificially resolvable from public web evidence as of 2026-05-03. Surface as a load-bearing verification step before vaulting any local Docker decision that depends on pg_partman.

**Secondary conflict — `withTenant` implementation correctness in the wild:**
- Production code surveyed (Source 11 + multiple peers) shows the `withTenant` pattern in active use, but **at least one (`lrfds/IncentivFlow`) implements it incorrectly** — `set_config(...,true)` outside a transaction does not transaction-scope the GUC.
- BokChoy's design per `[[backend-stack]]` correctly wraps in an explicit transaction. Code review must enforce this; the wrong form is plausibly common enough to slip past review without explicit checks.

## Conditions

- **Path B (standalone image) wins when:** prod-tier extension allowlist is verified to include all extensions BokChoy uses (currently: pg_partman, pgcrypto, pgsodium-or-pgcrypto-for-HMAC, pg_stat_statements). Solo-dev iteration speed is prioritized over Supavisor-bug surfacing in local.
- **Path A (full CLI) wins when:** the team wants to catch Supavisor prepared-statement bugs in local + wants Mailpit included free + accepts the CLI version-drift coupling.
- **Path C wins when:** [no condition surfaced in the surveyed scope].
- **Schema-per-test wins when:** test suite > ~50 tests OR CI parallelism is needed.
- **Transaction-rollback wins when:** solo-dev MVP, suite < ~50 tests, sequential CI is fine.
- **All Path A/B/C findings hold only on:** Postgres 17 (current Supabase default per Source 1's `Dockerfile-17`); Postgres 15 path also exists but Supabase has deprecated it for new projects per the Source 7 thread context.

## Operational implications

For `[[host-platform]]`:
- **Cascade-obligation 1 ("verify pg_partman availability before implementation") is NOT closed by local Docker verification alone.** Local image shipping pg_partman is *necessary but not sufficient*. Independent verification needed against Supabase managed prod tier — either (i) connect to a real Supabase project (Free tier) and run `CREATE EXTENSION pg_partman` to test, OR (ii) ask Supabase support / consult most-current dashboard.
- If pg_partman is **not** on managed prod tier as of 2026-Q2, three options:
  - (a) Wait for Supabase to ship it (timeline unknown).
  - (b) Self-host Postgres elsewhere (overturns `[[host-platform]]` decision — large cost).
  - (c) Replace pg_partman with manual partition management (DIY scripts via pg_cron or app-side scheduler — adds surface area but is decoupled from Supabase's roadmap).

For `[[backend-stack]]`:
- **NEW cascade obligation:** `postgres-js` client config in production must set `prepare: false` to be compatible with Supavisor transaction-mode (port 6543). Local without Supavisor will not catch this — runbook + CI lint should enforce.

For local-Docker design (when this finding returns to /design):
- **Recommended path: Path B** (standalone `supabase/postgres` Docker Hub image via project-owned `compose.yml`), conditional on closing the pg_partman managed-tier verification gap above.
- **Add separate `mailpit` service** (~10 lines compose) for Better Auth email capture.
- **Skip Supavisor locally;** verify Drizzle `prepare: false` config against a staging Supabase project once before MVP launch. Document in runbook.
- **Compose file**: single `compose.yml` at repo root with two services (`db: supabase/postgres:17.6.1.113`, `mailpit:axllent/mailpit:latest`), named volume `postgres-data`, port mappings `5432:5432`, `1025:1025` (SMTP), `8025:8025` (Mailpit web UI). Bun + Hono + Next.js run native via `bun --hot`.
- **Integration tests:** Vitest with `pool: "forks", singleFork: true`; per-test `BEGIN; ... ROLLBACK;` wrapper; `withTenant(projectId, fn)` runs as nested-tx via SAVEPOINT inside the outer test tx. pg_partman setup once in `beforeAll`. Migrations applied via `drizzle-kit push` to a dedicated `bokchoy_test` database created from a `bokchoy_template` template DB.
- **Do NOT** use PGLite — server-side extensions don't run.
- **Code review checklist item:** every `set_config('app.current_tenant', ...)` call must be inside an explicit `db.transaction(async tx => { ... })` block. The cautionary cite (Source 11) shows the bug shape.

## Reproducibility note

Reproducible. To reach substantially the same finding, another investigator would:

1. `gh api repos/supabase/postgres/contents/nix/ext/versions.json` — verify pg_partman version pin (Q1).
2. `gh api repos/supabase/postgres/contents/nix/tests/expected/extensions_schema.out` — verify auto-installed extensions (Q1).
3. Fetch `hub.docker.com/r/supabase/postgres` for image size + compose example (Q1, Q2).
4. Fetch `supabase.com/docs/reference/cli/supabase-start` for `-x` flag definition (Q1).
5. Search GitHub issues + discussions for `pg_partman supabase managed` to surface the contradiction probe (Q1, Conflicts).
6. Fetch `supabase.com/docs/guides/database/connecting-to-postgres` for Supavisor transaction-mode constraints (Q3).
7. Fetch Drizzle Discussion #5140 + adjacent threads for test isolation pattern guidance (Q4).
8. Code search GitHub for `withTenant` + `set_config` patterns in TypeScript projects to triangulate the production usage shape (Q4).

The pg_partman managed-tier ambiguity (Conflicts) hinges on judgment about how to weight a 6-month-old "in progress" staff statement against a Supabase-powered third-party doc. Another investigator might reasonably reach a more confident yes/no after a direct test against a real Supabase Free-tier project.

## Open threads

1. **pg_partman on Supabase managed Postgres prod, definitive 2026-Q2 status.** Cannot be answered from public web evidence alone. Verification path: create a Supabase Free-tier project, attempt `CREATE EXTENSION pg_partman WITH SCHEMA partman`. Either it works (allowlist closed) or it errors (still in-progress, design must adapt). 5-minute verification, blocks Path B + closes `[[host-platform]]` cascade-1.
2. **Supavisor + `SET LOCAL` direct verification.** Source 13 transferred from the PgBouncer finding; Supavisor's specific behavior on `SET LOCAL` was not directly cited in source code at this depth. Low risk of divergence (same transaction-pool semantics) but a 10-minute load test would close the question definitively. Goes into runbook for `[[host-platform]]` cascade-2.
3. **Drizzle `pgPolicy` / `pgRole` round-trip through `drizzle-kit migrate`.** Repo files exist (`drizzle-orm/src/pg-core/policies.ts`, `drizzle-orm/src/neon/rls.ts`) but no production-cite of a project shipping declarative RLS policies through `drizzle-kit migrate` against a local Postgres surfaced in the surveyed scope. Risk: the feature is shipped but rough. Verify with a POC migration before betting `[[wallet-mechanics]]` RLS policies on it.
4. **Bun + integration test runner.** `[[backend-stack]]` commits Bun for runtime; `[[frontend-stack]]` commits Vitest over `bun test`. Vitest works on Bun per `[[frontend-stack]]` cite, but extension-heavy DB integration tests under Bun-on-Vitest at scale not directly cited in surveyed scope. Likely fine; verify on first integration test.
5. **Mailpit version pin + Better Auth SMTP config.** Mailpit ships in `supabase start` (Source 4); for Path B we'd add `axllent/mailpit:latest`. Confirm Better Auth's mailer config accepts Mailpit's port-1025 SMTP without TLS — likely yes (SMTP-on-localhost-no-TLS is a standard dev pattern), but pin in a runbook entry.
