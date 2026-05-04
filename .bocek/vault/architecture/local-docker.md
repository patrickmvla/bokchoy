---
type: decision
features: [local-docker, infra]
related: ["[[local-docker-research]]", "[[local-docker-roles-research]]", "[[host-platform]]", "[[backend-stack]]", "[[wallet-mechanics]]", "[[multi-tenant-rls-research]]", "[[deidentify-mechanism-research]]"]
created: 2026-05-04
confidence: high
---

# Local Docker: standalone `supabase/postgres` + Mailpit via project-owned compose

## Amendments

### Amended 2026-05-04 per `[[local-docker-roles-research]]`
Sub-unit (2) implementation surfaced two contract gaps confirmed by tier-1 research (live managed-prod query + `supabase/postgres` + `supabase/cli` source at HEAD):

1. **Falsified claim corrected.** Original Reasoning said *"pgcrypto is auto-installed in `extensions` schema per supabase/postgres"*. **Wrong for the standalone image.** Dockerfile-17:158 copies `migrations/db/` into a *subdirectory* of `/docker-entrypoint-initdb.d/`; the docker-library/postgres entrypoint does not recurse into subdirs, so `migrations/schema-17.sql` is shipped but never executed during initdb. pgcrypto/uuid-ossp/pg_stat_statements/supabase_vault are auto-installed on **Supabase managed prod**, NOT in the standalone image. See `[[local-docker-roles-research]]` Source 5+6.

2. **Initial setup obligations expanded** to cover role bootstrap + pgcrypto install. The original "exec into container and run pg_partman SQL" step was already replaced at implementation time by mounting `/docker-entrypoint-initdb.d/` (first-class Postgres-image platform primitive). This amendment expands what gets mounted there. See *Initial setup obligations* below for the new shape.

3. **F-Local-6 added** to Failure modes — transient first-init log-spam window before `00-roles.sql` runs (the image's healthcheck `pg_isready -U postgres` at Dockerfile-17:187 fires before init scripts and FATAL-logs until `postgres` exists; ~5 seconds of noise on first init only).

4. **`postgres` and `bokchoy_app` role attributes locked** to managed-prod parity per `[[local-docker-roles-research]]` F1+F2:
   - `postgres`: `NOSUPERUSER, INHERIT, CREATEROLE, CREATEDB, LOGIN, REPLICATION, BYPASSRLS` — matches Supabase Free-tier live query 2026-05-04.
   - `bokchoy_app`: `NOSUPERUSER, NOBYPASSRLS, INHERIT, LOGIN` — `[[wallet-mechanics]]` §8 non-owner role; no managed-prod analogue, BokChoy-defined.
   - `supabase_admin` (already exists from initdb) is the only SUPERUSER, reserved for emergency surgery.

5. **PostgREST/Auth/Storage/Realtime admin roles NOT mirrored** despite Supabase managed shipping 14 non-pg roles. `[[host-platform]]` is explicit DB-only with named lock-in-mitigation reason; mirroring those 10 roles would be cargo-cult. They come back if `[[host-platform]]` is ever revisited and BokChoy adopts PostgREST.

6. **`POSTGRES_USER` env override deliberately NOT used.** Dockerfile-17:176 hardcodes `POSTGRES_USER=supabase_admin`; overriding to `postgres` in compose would break image-internal scripts that reference `supabase_admin` (post-setup.sql line 3, `/etc/postgresql-custom/` configs).

## Decision

Local dev (scope 1: solo-dev iteration loop) + integration tests (scope 2: throwaway-DB-per-run Vitest suite) on Docker Desktop / WSL2 ship as a project-owned `compose.yml` at repo root with two services:

- **`db: supabase/postgres:17.6.1.113`** — the standalone Supabase Postgres image (348 MB per `[[local-docker-research]]` Source 2). Same binary as Supabase managed prod. Named volume `postgres-data` for persistence. Port-mapped `5433:5432` (host:container — non-default host port to avoid F-Local-7 collision class; **see Amendment 2026-05-04 below for rationale**). Direct connection (no Supavisor).
- **`mailpit: axllent/mailpit:latest`** — SMTP capture for Better Auth magic-link / password-reset flows. Ports `1025:1025` (SMTP) and `8025:8025` (Mailpit web UI).

Backend (Bun + Hono) and cockpit (Next.js 16 on Bun) run **native** via `bun --hot`, NOT in containers — solo-dev iteration speed prioritized.

**Initial setup obligations (one-time, automated via init-script mount):**

The compose `db` service mounts `./compose/postgres-init/` to `/docker-entrypoint-initdb.d/` (read-only). Two init scripts run on first init in alphanumeric order:

1. **`00-roles.sql`** — creates `postgres` and `bokchoy_app` roles using `DO $$ ... pg_roles guard ... $$` blocks for idempotency (Postgres 17 has no `CREATE ROLE IF NOT EXISTS`):
   ```sql
   DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
       CREATE ROLE postgres WITH NOSUPERUSER INHERIT CREATEROLE CREATEDB LOGIN
                                 REPLICATION BYPASSRLS PASSWORD 'postgres';
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bokchoy_app') THEN
       CREATE ROLE bokchoy_app WITH NOSUPERUSER NOBYPASSRLS INHERIT LOGIN
                                    PASSWORD 'postgres';
     END IF;
   END $$;
   ```
2. **`01-extensions.sql`** — creates the `extensions` schema (matches Supabase managed schema placement) and installs pg_partman + pgcrypto. Both extensions installed at infra layer because they're prerequisites for any application schema (pg_partman for `[[wallet-mechanics]]` partition policy, pgcrypto for `[[deidentify-mechanism-research]]` hmac()):
   ```sql
   CREATE SCHEMA IF NOT EXISTS extensions;
   CREATE SCHEMA IF NOT EXISTS partman;
   CREATE EXTENSION IF NOT EXISTS pg_partman WITH SCHEMA partman;
   CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
   ```

**Connection-user assignments (cascade obligations to `[[backend-stack]]`):**

- **drizzle-kit migrations** connect as `postgres` — BYPASSRLS lets DDL ignore `FORCE ROW LEVEL SECURITY` during table creation/alteration. Matches managed-prod: `postgres` is the managed migration role.
- **Backend runtime** connects as `bokchoy_app` — RLS applies; `[[wallet-mechanics]]` §8 contract.
- **`supabase_admin`** is unused in BokChoy code paths; reserved for emergency operations only.

**Post-init operational obligations (one-time):**

1. Run `drizzle-kit migrate` connected as `postgres@localhost:5432` (not pooled — `[[backend-stack]]` cascade-6).
2. Seed test data via `bun run seed` (script structure deferred to /implementation).

**First-init recovery:** Postgres docker-entrypoint runs init scripts only when `PGDATA` is empty (first init). If the named volume `postgres-data` exists with a broken-roles state from a pre-amendment boot, `docker compose down` + `up -d` will NOT re-fire init scripts. Recovery is `docker compose down -v && docker compose up -d` — `-v` drops the volume and forces re-init. Local data is reproducible via `bun run seed` per F-Local-4.

**Integration test pattern (per `[[local-docker-research]]` Findings Q4 + `[[drizzle-orm-research]]` Findings (4)):**
- Vitest config: `pool: "forks"`, `singleFork: true` (sequential isolation for solo-dev MVP).
- Per-test wrapper: `BEGIN; <test queries>; ROLLBACK;`.
- `withTenant(projectId, fn)` runs as inner SAVEPOINT inside the outer test transaction (Drizzle `tx.transaction()` calls `client.savepoint()` per `[[drizzle-orm-research]]` Source 6).
- Outer ROLLBACK cleans both writes and `SET LOCAL app.current_tenant` GUC.
- pg_partman setup once in `beforeAll` against a `bokchoy_test` database created from a `bokchoy_template` template DB.

## Reasoning

- **Path B is unblocked as of 2026-05-04.** Verification against Supabase Free-tier project confirmed `CREATE EXTENSION pg_partman` succeeds on the managed allowlist (production-cited: user direct test 2026-05-04). The 6-month-stale "in progress, no firm date" staff statement (`[[local-docker-research]]` Source 7, samrose 2025-11-13) is superseded by current observed behavior.
- **Path B clears all production-grade gates** — see *Production-grade gates* below.
- **Path A's Supavisor-parity edge is defused by `[[backend-stack]]` cascade-10.** With `prepare: false` mandatory + CI-lint-enforced (production-cited: `[[backend-stack]]` 2026-05-03 amendment), the prepared-statement bug class can no longer ship to prod via local→staging gap. Path A's only meaningful technical edge over Path B is removed (docs-cited: this session's design pass).
- **Path B's image-level prod parity is sufficient.** `supabase/postgres:17.6.1.113` is the same binary Supabase Cloud runs (production-cited: `[[local-docker-research]]` Source 1, repo `supabase/postgres` is what backs both Docker Hub image and Supabase managed Postgres servers per repo README). Workflow-level differences (Supavisor pooler, Mailpit positioning) are deliberate parity gaps, mitigated by CI lint + staging environment.
- **Solo-dev iteration speed prioritized.** Backend running native via `bun --hot` (no container hot-reload over bind-mount) avoids the Docker Desktop / WSL2 file-watching latency tax (docs-cited: `[[local-docker-research]]` constraint section — source dir at `/home/mvula/audhd/bokchoy` is ext4 inside WSL2 VM, but native `bun --hot` is still faster than container-mediated reload).

## Engineering substance applied

- **Observability (operability):** Mailpit web UI at `localhost:8025` exposes captured emails for debugging Better Auth magic-link/password-reset flows. No external SMTP credentials needed in dev.
- **Testability (concurrency / consistency):** Transaction-rollback per-test isolation provides serializable semantics for the test transaction without inter-test interference. `withTenant()` SAVEPOINT semantics give nested-tx isolation correctly per `[[drizzle-orm-research]]` Findings (4).
- **Operational cost (solo dev):** One container, one volume, one port mapping for Postgres. Mailpit adds 30 MB image + two ports. Total local footprint <500 MB. Fits Docker Desktop / WSL2 default memory cap.
- **Failure semantics (data persistence):** Named volume `postgres-data` survives `docker compose down`. `docker compose down -v` drops the volume (intentional reset). Brand-new contributor's first `docker compose up -d` creates the volume; subsequent runs reuse.
- **Security boundary:** local DB has no exposed Internet endpoint (port 5432 is bound to localhost via Docker Desktop's port forwarding). Mailpit's SMTP listener is also localhost-only. Acceptable for dev.

## Production-grade gates

- **Idiomatic** — Project-owned `compose.yml` for Postgres-only local dev is the dominant pattern in 2026 for projects running managed Postgres in prod. Docker Hub image used directly (no third-party tooling layer) is the canonical Postgres-in-Docker idiom (production-cited: `supabase/postgres` Docker Hub README explicitly documents standalone-via-compose usage with `command: postgres -c config_file=/etc/postgresql/postgresql.conf` for v14.1.0+). Mailpit as a separate service is the `mailpit` project's documented dev pattern (production-cited: Supabase CLI ships Mailpit by default per `[[local-docker-research]]` Source 4 — same image, different orchestration).
- **Industry-standard** — ≥2 production patterns: (i) Supabase's official local stack (`supabase start`) ships `supabase/postgres` + Mailpit + others, demonstrating both images are production-graded. (ii) Drizzle community's recommended Vitest + Postgres pattern (`[[local-docker-research]]` Source 12 — `drizzle-team/drizzle-orm` Discussion #5140) endorses transaction-rollback or schema-per-test against a real Postgres in Docker.
- **First-class** — uses Postgres native `BEGIN/ROLLBACK` + `SAVEPOINT` semantics for test isolation (Postgres docs-cited: standard SQL transaction semantics). Uses Postgres native `pg_partman` extension (production-cited: shipped by Supabase, Supabase prod allowlist confirmed 2026-05-04). No custom DSL, no application-layer test isolation hack.

## Rejected alternatives

### Path A — `supabase start` with `-x` exclusions
**What:** use Supabase CLI to launch the local stack, exclude all services except `db`, `mailpit`, `supavisor` via `supabase start -x gotrue,realtime,storage-api,imgproxy,kong,postgrest,postgres-meta,studio,edge-runtime,logflare,vector`.

**Wins when:**
- Team needs Supavisor-in-local to catch `prepare: false` bugs early at iteration time.
- Team values being on the Supabase CLI's release cadence (CLI updates auto-bump local stack image versions).
- Team wants Mailpit included by default with no additional compose lines.

**Why not here:**
- `[[backend-stack]]` cascade-10 (`prepare: false` CI lint) defuses the Supavisor-edge claim — the bug class can't ship without CI catching it.
- CLI version-drift creates contributor-skew; project-owned compose pins the image tag explicitly. Same pattern as the Drizzle version pin (cascade-11 — disable auto-bump on Drizzle minor versions; pinned-and-tracked beats auto-bumped-and-surprised).
- Mailpit-included-free saves ~10 lines of compose. Not worth the CLI coupling.

### Path C — Stock `postgres:17-alpine` + custom Dockerfile with extension installs
**What:** build a project-owned Dockerfile based on stock `postgres:17-alpine`, install `pg_partman` from source/apt, layer additional extensions as needed.

**Wins when:**
- Disk footprint is the dominant constraint (stock + extensions ~150–200 MB vs. 348 MB for Supabase image).
- Team wants to avoid any Supabase-tier image dependency (e.g., for compliance reasons or to deploy to a non-Supabase managed Postgres in prod).

**Why not here:**
- BokChoy commits to Supabase managed Postgres in prod per `[[host-platform]]`. Diverging the local image from the prod image creates parity drift — every Supabase image update needs to be replicated in the project Dockerfile or local-prod gap widens silently.
- No production team in `[[local-docker-research]]`'s surveyed scope ships this pattern when prod is Supabase managed Postgres. Bespoke pattern with no external validation.
- Save 200 MB of disk for a parity-drift maintenance burden. Bad trade.

## Failure modes

### F-Local-1: Supabase changes prod image format / extension allowlist out of sync with pinned local tag
**Trigger:** Supabase ships a new `supabase/postgres` minor that adds/removes an extension. Local pinned at `17.6.1.113` doesn't track. Local CREATE EXTENSION succeeds but prod fails (or vice versa).

**Mitigation:** monthly check of `supabase/postgres` GitHub releases (`[[backend-stack]]` cascade-12 release-notes watch already covers Drizzle; extend to `supabase/postgres`). Bump pin deliberately when changes are reviewed. Run pg_partman re-verification on prod after each pin bump (5-min Free-tier project test, same procedure as 2026-05-04 verification).

### F-Local-2: Supavisor-in-prod adds non-prepared-statement constraint we miss because Supavisor isn't in local
**Trigger:** Supabase ships a Supavisor change (e.g., session-state lifetime, GUC handling change) that local doesn't catch. Bug surfaces only in staging/prod.

**Mitigation:** `[[host-platform]]` cascade-2 ("verify Supavisor transaction-mode supports `SET LOCAL`") still requires verification against a real Supabase project — same approach as pg_partman verification just done. Schedule a 30-minute Supavisor smoke test against Supabase Free-tier as a pre-MVP-launch gate. Beyond that, bug class is small (Supavisor's documented constraints are narrow); accepting residual risk for solo-dev MVP scope.

### F-Local-3: Mailpit version drift breaks Better Auth SMTP integration
**Trigger:** `axllent/mailpit:latest` ships a breaking change (e.g., SMTP listener port, config flag). Local emails stop being captured silently.

**Mitigation:** pin Mailpit tag explicitly in compose (`axllent/mailpit:v1.x.y`). Test Better Auth magic-link flow on first `docker compose up` after each Mailpit bump. Lighter than full Renovate config — manual review on bumps.

### F-Local-4: Volume corruption / loss
**Trigger:** Docker Desktop crash, WSL2 reset, accidental `docker compose down -v` wipes the named volume. Local DB starts empty.

**Mitigation:** local data is reproducible via `bun run seed`. Never store data locally that can't be regenerated. If integration tests assume a specific seeded state, the seed script is the source of truth. Document in repo README.

### F-Local-5: Native Bun + bind-mount compatibility on WSL2
**Trigger:** Backend running native via `bun --hot` watches files on `/home/mvula/audhd/bokchoy`. WSL2 native ext4 file events should work, but Bun's file watcher has had documented issues on certain platform combinations.

**Mitigation:** verify on first `bun --hot` run that file changes trigger reloads. If they don't, fall back to manual restart workflow OR move backend into a container with explicit volume mount (defers to Path B+container variant — small follow-up, not blocking MVP start).

### F-Local-7: Host-port collision (E3 — added 2026-05-04)
**Trigger:** Linux/WSL2 host has a stock `postgres-N` service installed (apt's `postgresql` package, Docker Desktop's bundled DB, a separate Supabase CLI stack, etc.) bound directly to `127.0.0.1:5432`. Docker Desktop's iptables NAT for the published port `5432` does NOT take precedence over a host-process bind on the same loopback address. Connection from host applications (e.g., `bun drizzle-kit migrate` running on the host) to `localhost:5432` reach the **host's** Postgres, not the container's. Auth fails or — worse — silently writes to the wrong cluster. Surfaced empirically during sub-unit (6) verification 2026-05-04: WSL2 host had `/usr/lib/postgresql/16/bin/postgres` listening on `127.0.0.1:5432` shadowing the container.

**Mitigation:** Pin a non-default host port in `compose.yml` (`5433:5432` chosen). Update `.env.example` connection strings accordingly. Both fail-loud (no host port 5432 to collide with) and fail-fast (TCP connection error if 5433 also taken). Document in repo README that BokChoy uses 5433 for the local Postgres host port.

**Revisit when:** BokChoy ever needs port 5432 for prod-parity reason (e.g., a tool that hardcodes 5432 with no override). Not anticipated at MVP scope.

### F-Local-6: First-init log-spam window before `00-roles.sql` runs
**Trigger:** During the ~5 seconds between Postgres entering single-user mode (initdb completes, `supabase_admin` exists) and the init scripts in `/docker-entrypoint-initdb.d/` executing, the image's healthcheck (`Dockerfile-17:187`: `pg_isready -U postgres -h localhost`, every 2s) attempts to authenticate as `postgres`. Until `00-roles.sql` creates the role, each healthcheck probe FATAL-logs `role "postgres" does not exist`. Cited via `[[local-docker-roles-research]]` Source 5 + Q5 finding.

**Mitigation:** ignored. The window is bounded (init scripts run before the final server start in normal mode), the spam stops automatically once `postgres` is created, and the alternative (overriding the healthcheck in compose) treats the symptom rather than closing the parity gap. Documented as expected first-init noise in repo README. After the first successful init, the `postgres` role persists in the named volume and the spam never reappears (subsequent restarts use the existing cluster, not initdb).

## Idiom citations

- Standalone Postgres-in-Docker via project-owned `compose.yml` is the canonical 2026 dev pattern for projects running managed Postgres in prod. No specific `idioms/typescript.md` rule applies — this is infrastructure, not language-level idiom.
- Transaction-rollback per-test isolation per Drizzle community recommendation (`[[local-docker-research]]` Source 12).

## Revisit when

1. **`[[backend-service-shape]]` adopts a non-Postgres dependency** (Redis for caching, Elasticsearch for search, etc.) that needs a local container. Add as additional compose service; revisit whether the single-compose-file pattern still works or if profiles split is warranted.
2. **Team grows past solo dev** (≥2 contributors). Onboarding bootstrap becomes a real concern (deferred per `[[local-docker-research]]` scope decision); revisit whether `compose.yml` + `bun run seed` is enough or if a `setup.sh` / `make bootstrap` target is needed.
3. **Integration test suite grows past ~50 tests** OR CI parallelism becomes load-bearing. Switch from transaction-rollback (sequential) to schema-per-test (parallel) per Drizzle Discussion #5140 recommendation.
4. **Supabase changes the standalone-via-compose contract** — e.g., requires the CLI for some feature local can't replicate without it. Re-evaluate Path A.
5. **Container-wrapped backend becomes necessary** — e.g., a non-portable Bun API gets used and needs a Linux container to run consistently across contributor machines. Switch to backend-in-container with bind-mount + `bun --hot`.
6. **Prod migrates off Supabase managed Postgres.** Image pick decouples from Supabase; revisit whether `supabase/postgres` image still makes sense or if stock `postgres:17` + project Dockerfile is now the right pattern.
