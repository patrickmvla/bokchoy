---
type: research
features: [local-docker, infra]
related: ["[[local-docker]]", "[[local-docker-research]]", "[[wallet-mechanics]]", "[[multi-tenant-rls-research]]", "[[backend-stack]]", "[[host-platform]]"]
created: 2026-05-04
confidence: high
provisional: false
---

# How does `supabase/postgres` standalone bootstrap roles + extensions vs. Supabase managed prod, and what bridges the gap?

## Question

Sub-unit (2) of the bootstrap brought up `supabase/postgres:17.6.1.113` per `[[local-docker]]` and surfaced two facts that contradicted the contract: (1) only `supabase_admin` exists in the standalone image (no `postgres`); (2) `pgcrypto`/`uuid-ossp`/`pg_stat_statements` are NOT installed despite the contract Reasoning saying they auto-install. Plus log spam at ~2s intervals: `postgres@postgres FATAL: role "postgres" does not exist`. Five questions ahead of `/design` amending `[[local-docker]]`:

- **Q1.** What is the role layout (names + attributes) on a fresh Supabase managed prod project?
- **Q2.** What SQL does `supabase start` (the CLI) run to bring the standalone image into Supabase managed shape?
- **Q3.** Does `supabase/postgres` honor `POSTGRES_USER` env override, and what breaks if we set it to `postgres`?
- **Q4.** What extensions are auto-installed on Supabase managed prod, and which schemas hold them?
- **Q5.** What inside the container is generating the `postgres@postgres FATAL` log spam?

## Triangulation

- **Production reference:** ✓
  - Live query against user's Supabase Free-tier managed project (`pg_roles` + `pg_extension`, observed 2026-05-04 — Q1, Q4).
  - `supabase/postgres` repo (Dockerfile-17, schema-17.sql, init-scripts/) cloned shallow at HEAD on 2026-05-04 — Q3, Q5, parts of Q4.
  - `supabase/cli` repo (internal/utils/templates/globals.sql, internal/db/start/start.go, internal/db/start/templates/restore.sh) cloned shallow at HEAD on 2026-05-04 — Q1, Q2.
- **Docs reference:** ✓ — `supabase.com/docs/guides/database/postgres/roles` (current as of 2026-05-04) for the role catalog at the prose level.
- **Contradiction probe:** ✓ — actively searched for SUPERUSER vs BYPASSRLS disagreement; found one (CLI's `restore.sh:25` rewrites `CREATE ROLE postgres;` → `WITH SUPERUSER;` for local-CLI dev mode, contradicting managed prod). Resolved per *Contradiction protocol* below.

## Sources examined

### Source 1 — User's Supabase Free-tier managed project (live query 2026-05-04)
- **Tier:** 1 — production code/state of the actual platform
- **Provenance:** SQL editor query against the user's managed project; observed 2026-05-04. Two queries: `pg_roles` (14 non-pg rows) + `pg_extension` (6 rows including plpgsql).
- **Author context:** the platform itself; ground truth for "what does Supabase managed prod actually look like, today, for this customer's tier"
- **What it tells us:** Q1 and Q4 ground truth. `postgres` attributes locked in: `rolsuper=false, rolinherit=true, rolcreaterole=true, rolcreatedb=true, rolcanlogin=true, rolreplication=true, rolbypassrls=true`. `supabase_admin` is the *only* superuser. Six extensions installed: `plpgsql` (default), `pg_partman` 5.3.1 in `partman` (added by user yesterday), `pg_stat_statements` 1.11 in `extensions`, `pgcrypto` 1.3 in `extensions`, `supabase_vault` 0.3.1 in `vault`, `uuid-ossp` 1.1 in `extensions`.

### Source 2 — `supabase/cli` `internal/utils/templates/globals.sql`
- **Tier:** 1 — production code (canonical CLI bootstrap SQL)
- **Provenance:** `github.com/supabase/cli` HEAD 2026-05-04, `internal/utils/templates/globals.sql:1-146`
- **Author context:** Supabase CLI maintainers; this template is rendered+executed against the running container by `supabase start`
- **What it tells us:** the role layout the CLI applies for local dev parity with managed. Lines 14–45 CREATE/ALTER 11 roles. Line 30–31 commented: `-- CREATE ROLE postgres;` / `-- ALTER ROLE postgres WITH NOSUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;`. The CREATE is commented because `postgres` is expected to already exist; the commented ALTER documents the intended attribute set (which agrees with managed Source 1). Subsequent `ALTER ROLE postgres SET ...` lines (74) and GRANT lines (106–125) all assume `postgres` exists.

### Source 3 — `supabase/cli` `internal/db/start/templates/restore.sh:23-25`
- **Tier:** 1 — production code (CLI restore flow)
- **Provenance:** `github.com/supabase/cli` HEAD 2026-05-04, `internal/db/start/templates/restore.sh:23-25`
- **Author context:** Supabase CLI maintainers; this script transforms `pg_dumpall --globals-only` output before pg_restoring it locally
- **What it tells us:** in the CLI's local-restore flow, the CREATE-ROLE-postgres line from a dump is sed-rewritten to add `WITH SUPERUSER`. Concretely: `sed -E 's/^(CREATE ROLE postgres);/\1 WITH SUPERUSER;/'`. This is a CLI-local-dev-only behavior — it contradicts managed prod (per Source 1, `postgres` is NOT superuser on managed).

### Source 4 — `supabase/cli` `internal/db/start/start.go`
- **Tier:** 1 — production code
- **Provenance:** `github.com/supabase/cli` HEAD 2026-05-04, `internal/db/start/start.go:86,374-376`
- **Author context:** Supabase CLI maintainers
- **What it tells us:** the CLI's `start` overrides the container's healthcheck to `pg_isready -U postgres -h 127.0.0.1 -p 5432` (line 86) and connects post-startup as user `postgres` to database `postgres` (lines 374–376). Both presuppose `postgres` exists by the time `start` reaches steady state.

### Source 5 — `supabase/postgres` `Dockerfile-17`
- **Tier:** 1 — production code (canonical image build)
- **Provenance:** `github.com/supabase/postgres` HEAD 2026-05-04, `Dockerfile-17:158-191`
- **Author context:** Supabase Postgres maintainers; this Dockerfile produces the `supabase/postgres:17.x.x` Docker Hub images
- **What it tells us:**
  - Line 158: `COPY migrations/db /docker-entrypoint-initdb.d/` — copies the `init-scripts/` and `migrations/` *subdirectories* into the entrypoint dir. The standard docker-library/postgres entrypoint (line 163–165) does not recurse into subdirs, so files like `00000000000003-post-setup.sql` are shipped but **not executed** during initdb.
  - Line 176: `ENV POSTGRES_USER=supabase_admin` — overrides the default `postgres` value the stock image would use; initdb creates `supabase_admin` instead of `postgres`.
  - Line 187: `HEALTHCHECK --interval=2s --timeout=2s --retries=10 CMD pg_isready -U postgres -h localhost` — **the source of the log spam.** Fires every 2s, tries to authenticate as `postgres`, fails because `postgres` doesn't exist in standalone mode, leaves a `FATAL: role "postgres" does not exist` in the log on every probe.

### Source 6 — `supabase/postgres` `migrations/schema-17.sql`
- **Tier:** 1 — production code (reference dump of the schema-pluss-extensions state)
- **Provenance:** `github.com/supabase/postgres` HEAD 2026-05-04, `migrations/schema-17.sql:82,96,110,124`
- **Author context:** Supabase Postgres maintainers; this is a `pg_dump --schema-only` of the canonical Supabase database state, used by the CLI's restore flow as the schema to apply
- **What it tells us:** declares `CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;` (82), `pgcrypto WITH SCHEMA extensions;` (96), `supabase_vault WITH SCHEMA vault;` (110), `uuid-ossp WITH SCHEMA extensions;` (124). Zero `CREATE ROLE postgres` statements anywhere in the file. The file describes the *target* state; a docker-entrypoint-initdb.d that doesn't execute it (Source 5) means the state is unrealized in standalone mode.

### Source 7 — `supabase/postgres` `migrations/db/init-scripts/00000000000003-post-setup.sql`
- **Tier:** 1 — production code
- **Provenance:** `github.com/supabase/postgres` HEAD 2026-05-04, `migrations/db/init-scripts/00000000000003-post-setup.sql:1-124`
- **Author context:** Supabase Postgres maintainers
- **What it tells us:** does `ALTER ROLE postgres SET search_path` (line 4) and `CREATE ROLE dashboard_user` (line 104). Assumes `postgres` already exists. Lives in a subdir of `/docker-entrypoint-initdb.d/` and per Source 5 isn't executed during initdb anyway, so the standalone image neither creates nor configures `postgres` from this file.

### Source 8 — `supabase.com/docs/guides/database/postgres/roles` (web docs)
- **Tier:** 2 — official docs
- **Provenance:** fetched 2026-05-04
- **Author context:** Supabase documentation; describes the role catalog at prose level for managed prod
- **What it tells us:** confirms `postgres` exists on managed and has "admin privileges"; lists 10 documented default roles. Does not specify exact privilege attributes (filled in by Source 1).

## Findings

### F1 — `postgres` role attributes on Supabase managed prod
Confirmed across Source 1 (live managed query) and Source 2 (CLI globals.sql:31 commented form):

```
NOSUPERUSER  INHERIT  CREATEROLE  CREATEDB  LOGIN  REPLICATION  BYPASSRLS
```

`postgres` is the migration-tier role. Its `BYPASSRLS` attribute is what allows table-DDL flows (drizzle-kit migrate) to skip `FORCE ROW LEVEL SECURITY` during schema work without needing SUPERUSER. SUPERUSER is held only by `supabase_admin` on managed (Source 1).

### F2 — `bokchoy_app` analogue does NOT exist in Supabase managed
Of the 14 non-pg roles in Source 1, none is a clean analogue for `[[wallet-mechanics]]` §8's non-owner `bokchoy_app` (`NOSUPERUSER, NOBYPASSRLS, LOGIN`):
- `anon`, `authenticated`, `service_role` are PostgREST-stack roles; `[[host-platform]]` is DB-only, so PostgREST is out of scope.
- `service_role` is `BYPASSRLS=true` — the opposite of what `bokchoy_app` needs.
- `dashboard_user`, `*_admin` roles, and `supabase_read_only_user` all serve Supabase's own services or have wrong privileges.

`bokchoy_app` must be created by BokChoy. It has no managed-prod analogue to mirror.

### F3 — Standalone image's role bootstrap is *only* `supabase_admin`
Standalone `supabase/postgres:17.6.1.113` initdb path (per Source 5):
1. `POSTGRES_USER=supabase_admin` → initdb creates `supabase_admin` as the cluster bootstrap superuser.
2. `/docker-entrypoint-initdb.d/` contains user-supplied files (root only — subdirs ignored by stock entrypoint).
3. No other roles are created.

Empirically confirmed by the local container: `pg_roles` shows `supabase_admin` only (plus `pg_*` predefined) on first boot of our project's compose stack.

### F4 — CLI's local flow `≠` managed prod, on the SUPERUSER axis
Source 3 (`restore.sh:25`) sed-rewrites `CREATE ROLE postgres;` → `CREATE ROLE postgres WITH SUPERUSER;` when running `supabase db restore` against a local CLI stack. That is **NOT** what managed prod looks like (Source 1: `rolsuper=false`). The CLI accepts the privilege escalation locally to make pg_restore from arbitrary dumps "just work"; production doesn't.

For BokChoy: don't follow `restore.sh` shape. Follow Source 1 (managed prod) shape.

### F5 — Healthcheck assumes `postgres` exists
Source 5's `HEALTHCHECK ... pg_isready -U postgres -h localhost` (Dockerfile-17:187) is the log-spam source. Two fixes available:

- **(F5-a) Create `postgres` role.** Once the role exists, `pg_isready` connects + handshakes + reports ready cleanly. No log spam. Side benefit: gets us managed-prod parity (F1).
- **(F5-b) Override the healthcheck in compose.** Replace with `pg_isready -U supabase_admin` or similar. Functional, but doesn't address F1/F2 — backend still needs a `bokchoy_app` role; migrations still need a `postgres` role for managed parity.

(F5-a) is strictly better — fixes the spam *and* closes parity. (F5-b) treats the symptom.

### F6 — Extensions on managed prod that aren't in standalone
Source 1 shows pgcrypto + pg_stat_statements + uuid-ossp + supabase_vault all installed in `extensions` (or `vault`) schema on managed. Source 6 shows these are *declared* in `schema-17.sql`, but `schema-17.sql` is shipped as a reference dump — not executed during initdb (Source 5). The empirical local state confirms: none of these extensions are installed in the standalone image.

For BokChoy DB-only:
- **pgcrypto** — required by `[[wallet-mechanics]]` §6 hmac() and `[[deidentify-mechanism-research]]`. Must install.
- **pg_stat_statements** — observability; nice-to-have but not in any current contract. Skip at MVP.
- **uuid-ossp** — UUID generation; PG 13+ ships `gen_random_uuid()` in pgcrypto, so uuid-ossp is redundant. Skip at MVP.
- **supabase_vault** — Supabase secret-management. BokChoy uses GUCs (`bokchoy.anon_secret`, `bokchoy.rng_secret`). Out of scope; do not install.
- **plpgsql** — default in every PG instance. Not actionable.

Required additions to local bootstrap: `pgcrypto` (in `extensions` schema, matches managed parity).

### F7 — `POSTGRES_USER` env override would break the image
Source 5 line 176 hardcodes `POSTGRES_USER=supabase_admin`. Compose `environment:` does override Dockerfile `ENV` per Compose spec. If a user sets `POSTGRES_USER=postgres` in compose:
- initdb would create `postgres` instead of `supabase_admin`.
- Init scripts and the CLI's globals.sql + post-setup.sql all reference `supabase_admin` directly (Source 7 line 3, Source 2 line 35, etc.) — those would fail.
- The image's own configs in `/etc/postgresql-custom/` (visible in Dockerfile-17) reference `supabase_admin` as DB owner.

Verdict: don't override `POSTGRES_USER`. Add `postgres` + `bokchoy_app` via init script that runs alongside `01-pg_partman.sql`.

## Conflicts

- **Source 1 (managed: NOSUPERUSER + BYPASSRLS) vs Source 3 (CLI restore: SUPERUSER).** Different deployment modes, both legitimate within their context. Per *Contradiction protocol* and *Source 3*'s explicit `restore.sh` framing (it's the CLI's pg_restore-from-dump path), Source 1 wins for what production-grade means here: BokChoy is targeting managed-prod parity per `[[host-platform]]`. The CLI's local SUPERUSER rewrite is a CLI-tool convenience, not a guidance for what the role *should* be.
- **`[[local-docker]]` Reasoning section vs Source 1.** The contract asserts pgcrypto auto-installs in `extensions` schema "per supabase/postgres". Source 1 confirms this is true on **managed prod**. Source 5+6 confirm it is **NOT** true for the standalone image. The contract conflated managed behavior with image behavior. Falsifier identified at the file:line level.

## Conditions

- **Q1 finding (`postgres` attributes) holds for Supabase Free-tier as of 2026-05-04.** Tier-bump migration (Pro/Team/Enterprise) may modify the role layout — re-verify if `[[host-platform]]` upgrades.
- **Q2 finding (CLI globals.sql is the bootstrap source) holds for `supabase/cli` HEAD 2026-05-04.** CLI rewrites are common; pin the commit-SHA or re-clone if anything cascades.
- **Q4 finding (extensions on managed) is observed on a freshly-created Free-tier project that the user manually `CREATE EXTENSION pg_partman`-d.** A *brand-new* project's `pg_extension` may differ slightly (no pg_partman until enabled) but pgcrypto/pg_stat_statements/uuid-ossp/supabase_vault are auto-present per docs Source 8.
- **Q5 finding (healthcheck is the spam source) is image-specific.** If a future `supabase/postgres` image switches the healthcheck command, this changes. Verify against the pinned tag (`17.6.1.113`).

## Operational implications

For `/design`'s amendment to `[[local-docker]]`:

1. **Add a `00-roles.sql` init script** alongside `01-pg_partman.sql`. Creates two roles in the standalone image:
   - `postgres` with attributes per F1 (`NOSUPERUSER, INHERIT, CREATEROLE, CREATEDB, LOGIN, REPLICATION, BYPASSRLS`) — matches managed prod.
   - `bokchoy_app` with attributes per F2 (`NOSUPERUSER, NOBYPASSRLS, INHERIT, LOGIN`) — non-owner role for `[[wallet-mechanics]]` §8 RLS.
   - Use `DO $$ ... pg_roles guard ... $$` for idempotency (Postgres 17 still has no `CREATE ROLE IF NOT EXISTS`).
   - File-name prefix `00-` so it runs before `01-pg_partman.sql`.

2. **Add `pgcrypto` install** to bootstrap. Either (a) extend the init script with `CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;` (matches managed schema placement), or (b) defer to the first Drizzle migration that uses `hmac()`. Both are defensible; (a) gives matching parity earlier, (b) keeps init lean.

3. **Do NOT install** `pg_stat_statements` (no contract demands it at MVP), `uuid-ossp` (redundant with `gen_random_uuid()` in pgcrypto), or `supabase_vault` (BokChoy uses GUCs).

4. **Do NOT override `POSTGRES_USER`** in compose (F7).

5. **Don't override the healthcheck** (F5-b option). Creating `postgres` in F1 silences the spam at the source (F5-a).

6. **Connection-user assignments (cascade obligations):**
   - drizzle-kit migrations: connect as `postgres` (matches Supabase managed behavior; BYPASSRLS lets DDL ignore FORCE RLS).
   - Backend runtime: connect as `bokchoy_app` (RLS applies; `[[wallet-mechanics]]` §8 contract).
   - `supabase_admin` stays unused in BokChoy code paths (it's the image's internal superuser; reserved for emergency surgery).

7. **First-init recovery:** `/docker-entrypoint-initdb.d/` only runs on first init when `PGDATA` is empty. If a developer brought up the stack before this amendment lands, the existing volume holds the broken-roles state. Recovery: `docker compose down -v && docker compose up -d`. Add as a runbook line in `[[local-docker]]`.

8. **Falsified contract claim:** the existing `[[local-docker]]` Reasoning sentence *"pgcrypto is auto-installed in `extensions` schema per supabase/postgres"* should be marked superseded with the file:line-level falsifier (Source 5+6). Replace with the corrected statement: *"pgcrypto + uuid-ossp + pg_stat_statements + supabase_vault are auto-installed in **Supabase managed**, not in the standalone image — `schema-17.sql` declares them but is not executed during initdb."*

9. **F-Local-3-style failure mode addition:** `F-Local-6 — first-init log spam window before `00-roles.sql` runs.` During the ~5 seconds between the image's first server-start and the init scripts' `CREATE ROLE postgres`, the healthcheck will log `FATAL: role "postgres" does not exist` a few times. After init completes, log goes quiet. Mitigation: documented as expected first-init noise.

## Reproducibility note

Reproducible. Steps:

1. Clone `supabase/postgres` and `supabase/cli` shallow at HEAD.
2. Read `supabase/postgres/Dockerfile-17` (lines 158, 176, 187), `supabase/postgres/migrations/schema-17.sql` (CREATE EXTENSION lines), `supabase/postgres/migrations/db/init-scripts/00000000000003-post-setup.sql`.
3. Read `supabase/cli/internal/utils/templates/globals.sql` (CREATE/ALTER ROLE lines), `supabase/cli/internal/db/start/templates/restore.sh:23-25`, `supabase/cli/internal/db/start/start.go:86,374-376`.
4. Run the two SQL queries (`pg_roles` filter, `pg_extension` join) against any Supabase Free-tier project's SQL editor — output should match Source 1 in shape.

The only judgment call that doesn't trivially reproduce: the operational implications I7 (which extensions are in/out of MVP scope) — those depend on `[[wallet-mechanics]]`, `[[deidentify-mechanism-research]]`, `[[host-platform]]`. Same conclusions if the same vault context is read.

## Open threads

1. **Privilege boundary for `bokchoy_app`'s GRANTs.** This entry locks the *role attributes*. The `GRANT USAGE ON SCHEMA …`, `GRANT EXECUTE ON FUNCTION wallet_credit(…)` etc. are owned by Drizzle migrations per `[[wallet-mechanics]]` §8 — not in scope here, but a future implementation-phase question that needs `[[multi-tenant-rls-research]]` cross-reference.
2. **Whether to mirror Supabase managed's full 14-role set.** The DB-only stance leaves 10 roles unused (PostgREST + Auth/Storage/Realtime admins). Mirror them anyway for parity (future-proof against turning on a Supabase managed feature)? Or skip them as YAGNI? `/design` decision; this entry surfaces the option without picking.
3. **Whether to install `pg_stat_statements` for observability runway.** Supabase managed has it on. Cheap to enable; BokChoy doesn't yet have an observability contract that demands it. Park as `revisit-when` trigger on the eventual telemetry decision.
4. **Migrating between standalone-image-init vs CLI-flow if BokChoy ever adopts `supabase start`.** Cascade impact unknown until that revisit triggers.
