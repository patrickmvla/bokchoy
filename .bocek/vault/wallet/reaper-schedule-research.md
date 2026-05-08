---
type: research
features: [wallet, idempotency, scheduling]
related: ["[[wallet-mechanics]]", "[[idempotency-keys-schema-research]]", "[[host-platform]]", "[[local-docker-research]]", "[[backend-service-shape-research]]"]
created: 2026-05-08
confidence: medium-high
provisional: false
---

# Can `pg_cron` on Supabase Free-tier schedule `idempotency_keys_reaper()` cleanly enough to land slice 6.5 as a Drizzle migration?

## Question

Slice 6.5 of the wallet primitive needs to schedule `idempotency_keys_reaper()` hourly. The function is in place (migration `0006_idempotency_reaper.sql`); the scheduler is open. Two vault-named options: (a) `pg_cron` (Postgres-native, requires Supabase verification), (b) `staged_jobs` row + outbox worker (requires `apps/backend` worker that doesn't exist yet).

User picked **option 2 (verification spike for pg_cron)** in the implementation-mode gap report on 2026-05-08. This research session resolves whether (a) is shippable today on Supabase Free-tier and what its operational shape is — so /design can pick (a), (b), or (c) with evidence rather than improvise.

Six concrete sub-questions:

1. **Free-tier availability** — does Supabase Free allow `CREATE EXTENSION pg_cron`?
2. **Privilege model** — which role owns `cron.*`; which role can call `cron.schedule()`; which role does a scheduled SQL command run as?
3. **Migration shape** — can `CREATE EXTENSION pg_cron` + `cron.schedule(...)` go in a Drizzle migration, or is a dashboard step required?
4. **Operability** — `cron.job_run_details` retention, alerting surface, capacity envelope.
5. **Lock-in posture** — competing managed-Postgres tiers' pg_cron support (RDS/Aurora, Neon, Crunchy, Render) — does the schedule transfer if BokChoy moves off Supabase?
6. **Failure modes** — schedule survival across PITR, replication double-fire, tier-change behavior, known footguns.

## Triangulation

- **Production reference:** ✓ — `supabase/postgres@develop/nix/ext/versions.json` (tier 1: Supabase's own extension manifest, source-walked); `citusdata/pg_cron@v1.6.7` README (tier 1+2 hybrid: upstream extension behavior).
- **Docs reference:** ✓ — `supabase.com/docs/guides/cron` (current; the canonical Cron module guide); `supabase.com/docs/guides/cron/quickstart` (operability + retention warning); `supabase.com/blog/supabase-cron` (architecture announcement); `supabase.com/docs/guides/database/postgres/roles` (role surface). All current as of 2026-05-08.
- **Contradiction probe:** ✓ — actively searched for Free-tier-blocked reports + migration-shape failures + production negatives. Found: (a) **no** Free-tier-blocked reports (Discussion #37405 staff cite explicitly: "Cron is only limited by the resources it uses CPU/Memory/Disk wise on any tier"); (b) **multiple** migration-shape friction reports (CLI Issues #647, #1591, #4163; Discussion #27917) — load-bearing finding, see *Conflicts* below.

## Sources examined

### Source 1 — Supabase Postgres extension manifest

- **Tier:** 1 (production code — Supabase's image-build manifest)
- **Provenance:** `https://raw.githubusercontent.com/supabase/postgres/develop/nix/ext/versions.json`, fetched 2026-05-08. Same channel that closed `pg_partman` in `[[local-docker-research]]` Q1.
- **Author context:** Supabase platform team, current branch.
- **What it tells us:** pg_cron is shipped as a bundled extension in the official Supabase Postgres image, pinned at `v1.6.4` for Postgres 15, 17, and orioledb-17. SHA256-hash-verified. Supports sub-minute scheduling (1.5+) and modern signature variants. Three older versions (1.3.1, 1.4.2, 1.5.2) retained for Postgres 15-only fallback paths.

### Source 2 — pg_cron upstream (Citus)

- **Tier:** 1+2 hybrid (production code + canonical reference docs)
- **Provenance:** `https://github.com/citusdata/pg_cron`, fetched 2026-05-08. Latest release `v1.6.7` (2025-09-04). Upstream of Supabase's pin (1.6.4 → 1.6.7 = 3 patch versions behind on the same minor — no breaking-change risk).
- **Author context:** Citus Data (Microsoft); pg_cron is the canonical Postgres scheduling extension referenced by every managed-Postgres provider.
- **What it tells us:**
  - `cron.schedule(schedule text, command text) → bigint` and `cron.schedule(job_name text, schedule text, command text) → bigint`. Returns `jobid`.
  - **Run-as semantics:** *"jobs are executed in the database in which the `cron.schedule` function is called with the same permissions as the current user"*. `cron.schedule_in_database()` accepts an optional `username` parameter to override.
  - **Tables:** `cron.job` (definitions: jobid, schedule, command, nodename, nodeport, database, username), `cron.job_run_details` (history: jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time).
  - **Connection model:** by default uses libpq + pg_hba.conf to open a new connection per run; `cron.use_background_workers = on` is the in-process alternative.
  - **Replication / failover:** *"pg_cron does not run any jobs as long a server is in hot standby mode, but it automatically starts when the server is promoted"* — clean failover; no double-fire on replicas.

### Source 3 — Supabase Cron canonical docs

- **Tier:** 2 (current official docs)
- **Provenance:** `https://supabase.com/docs/guides/cron` and source MDX at `https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/cron.mdx`, fetched 2026-05-08.
- **Author context:** Supabase docs team, current.
- **What it tells us:**
  - *"Supabase Cron is a Postgres Module that simplifies scheduling recurring Jobs with cron syntax… Cron Jobs can be created via SQL or the Integrations -> Cron interface inside the Dashboard, and can run anywhere from every second to once a year."*
  - *"Every Job can run SQL snippets or database functions with zero network latency or make an HTTP request, such as invoking a Supabase Edge Function, with ease."*
  - **Capacity guidance (verbatim Admonition):** *"For best performance, we recommend no more than 8 Jobs run concurrently. Each Job should run no more than 10 minutes."*
  - **Architecture (verbatim):** *"Under the hood, Supabase Cron uses the `pg_cron` Postgres database extension which is the scheduling and execution engine for your Jobs. The extension creates a `cron` schema in your database and all Jobs are stored on the `cron.job` table. Every Job's run and its status is recorded on the `cron.job_run_details` table."*

### Source 4 — Supabase Cron quickstart docs

- **Tier:** 2 (current official docs)
- **Provenance:** `https://supabase.com/docs/guides/cron/quickstart`, fetched 2026-05-08.
- **What it tells us:**
  - **Job naming:** *"Job names are case sensitive and cannot be edited once created… Attempting to create a second Job with the same name (and case) will overwrite the first Job."* — operationally relevant for migration replays.
  - **Sub-minute scheduling:** supported via `[1-59] seconds` syntax on Postgres 15.1.1.61+.
  - **Critical retention warning (verbatim):** *"The records in the `cron.job_run_details` table are not cleaned up automatically. They are also not removed when jobs are unscheduled, which will take up disk space in your database."*
  - **Safety caution (verbatim):** *"Be extremely careful when setting up Jobs for system maintenance tasks as they can have unintended consequences. The example below would terminate idle connections after 5 hours, but unfortunately, this would also disrupt critical background processes like nightly backups."*
  - Job operations: `cron.schedule()`, `cron.alter_job()`, `cron.unschedule()`.

### Source 5 — Supabase Discussion #37405 (Free-tier confirmation)

- **Tier:** 3 (staff post-mortem-equivalent — not a post-mortem proper, but a staff-Q&A on a real user issue)
- **Provenance:** `https://github.com/orgs/supabase/discussions/37405`, July 2025.
- **Author context:** GaryAustin1 marked **Collaborator** (Supabase staff). Original poster `chevdor` was a Free-tier user.
- **What it tells us:**
  - **Free-tier capability statement (verbatim):** *"Cron is only limited by the resources it uses CPU/Memory/Disk wise on any tier."*
  - **Retention echo (verbatim):** *"if you are doing minute sort of cron job(s) you read the documentation for cleaning up the associated table involved as it will grow HUGE and slow down over time."*
  - **Ops experience signal (verbatim):** *"Many use 1 minute crons."* Hourly is well within typical envelope.
  - User reported test cron failing 515 times running `select 1` on Free-tier. Resolution unclear from thread; staff suggested debug guide. **Operational implication:** failed-run alerting wiring is non-optional — the failure mode does fire even on trivial SQL in some setups.

### Source 6 — Supabase CLI Issues #647, #1591, #4163 (migration-shape friction)

- **Tier:** 3 (issue-tracker post-mortems with concrete error messages and resolutions)
- **Provenance:**
  - `https://github.com/supabase/cli/issues/647` (closed via PR #818) — `db push: must be owner of table job (SQLSTATE 42501)`.
  - `https://github.com/supabase/cli/issues/1591` (open) — `pg_cron extension creation via migration not working properly`. Reproduces with `CREATE EXTENSION "pg_cron" WITH SCHEMA "extensions"; supabase db reset` → postgres user has no permissions on the cron extension schema.
  - `https://github.com/supabase/cli/issues/4163` — `Ownership issue on pg_cron and pg_net extension access functions`. `must be owner of function grant_pg_cron_access (SQLSTATE 42501)` on `supabase db pull --linked` for Postgres 17 projects.
- **Author context:** Supabase CLI users running CI/CD workflows; affected versions include CLI v1.160.1+ and Postgres 17 projects.
- **What they tell us:** when pg_cron is installed via migration (rather than via dashboard), ownership and grants on `cron.job`, `cron.job_run_details`, and the `extensions.grant_pg_cron_access()` function end up with `supabase_admin` rather than `postgres`. Subsequent migrations or `db pull --linked` then fail because the migration tooling connects as `postgres` and lacks ownership. Workarounds documented:
  - Disable + re-enable the extension via dashboard once after the failed migration.
  - Alter table ownership from `supabase_admin` to `postgres` in the initial migration.
  - Use `supautils.extensions_parameter_overrides` to direct the extension to a schema where postgres has ownership.

### Source 7 — Supabase Discussion #16250 (scheduling-extension landscape)

- **Tier:** 3
- **Provenance:** `https://github.com/orgs/supabase/discussions/16250`, Aug 2023 → Mar 2024.
- **Author context:** Multiple users (pierroo, jonathanstanley, itisnajim, Dioxymore) + GaryAustin1 (Supabase Collaborator).
- **What it tells us:**
  - **No alternative scheduling extension on Supabase.** *"Supabase currently supports only pg_cron for scheduling."* `pgagent`, `pg_timetable` not available.
  - One-shot future scheduling shape is *"`cron.unschedule()` after job completion"* (itisnajim Jan 2024).
  - Older Postgres versions on Supabase shipped pg_cron 1.4.x (Mar 2024 evidence); 1.5+ requires the newer Postgres image. **Cross-checked against Source 1** — current image ships 1.6.4 for Postgres 17, fully supersedes that constraint.

### Source 8 — Supabase blog: Supabase Cron launch

- **Tier:** 4 (engineering blog, named team)
- **Provenance:** `https://supabase.com/blog/supabase-cron`, the launch announcement.
- **What it tells us:** Supabase Cron is *"built on the `pg_cron` extension from Citus Data, licensed under the OSI-compatible PostgreSQL license."* Four job types: SQL snippets, database functions, HTTP requests / webhooks, Supabase Edge Functions. *"zero network latency"* for in-DB jobs. Dashboard logs explorer surfaces `pgcron-logs`. Confirms Source 3 architecture.

### Source 9 — Supabase Postgres Roles docs

- **Tier:** 2 (current official docs)
- **Provenance:** `https://supabase.com/docs/guides/database/postgres/roles`, fetched 2026-05-08.
- **What it tells us (verbatim where relevant):**
  - **`postgres`:** *"The default Postgres role. This has admin privileges."* — connection-string default. Per `[[local-docker-roles-research]]` Q1, on managed Supabase this role is `NOSUPERUSER, INHERIT, CREATEROLE, CREATEDB, LOGIN, REPLICATION, BYPASSRLS`.
  - **`supabase_admin`:** *"An internal role Supabase uses for administrative tasks, such as running upgrades and automations."* — the SUPERUSER. Owns extension functions installed via dashboard.
  - **`service_role`, `anon`, `authenticated`, `authenticator`:** PostgREST-facing roles, not relevant for migrations or schedule-as-runner.
- **What it does NOT explicitly state:** which role `cron.schedule()` jobs run as on Supabase. Per Source 2, this is whichever role *called* `cron.schedule()`. If postgres calls it, it runs as postgres. **For BokChoy's reaper, this is fine** — `idempotency_keys_reaper()` is `SECURITY DEFINER` owned by postgres (per slice 6 migration `0006_idempotency_reaper.sql`) so the function bypasses RLS regardless of caller role.

### Source 10 — Lock-in scan: managed-Postgres pg_cron support

- **Tier:** 2 (vendor docs, multiple)
- **Provenance:**
  - **AWS RDS / Aurora:** `https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL_pg_cron.html` — *"pg_cron is supported on RDS for PostgreSQL engine versions 12.5 and higher"* (RDS) / 12.6+ (Aurora). Requires `shared_preload_libraries` parameter modification + restart + `rds_superuser` permission.
  - **Neon:** `https://neon.com/docs/extensions/pg_cron` — *"pg_cron is enabled by default as a preloaded library in Neon"* with version 1.6.4 (matches Supabase pin).
  - **Crunchy Data, Render:** evidence not surfaced directly in this spike. Both ship general-purpose managed Postgres; pg_cron support is the industry default. Confidence: medium.
- **What it tells us:** pg_cron is portable across all major managed-Postgres tiers. The schedule SQL itself is upstream-Postgres standard — no Supabase-specific syntax. Migration off Supabase preserves schedules at the SQL level (modulo provider-specific install steps).

## Findings

### F1 — pg_cron is available on Supabase Free-tier without artificial gating

Per Source 5 (Supabase staff verbatim): *"Cron is only limited by the resources it uses CPU/Memory/Disk wise on any tier."* Per Source 1, the binary is bundled in the image at v1.6.4 for Postgres 17. Per Source 3, Cron is the canonical Supabase Postgres Module; the pricing page makes no plan-based gating mention. **Confidence: high.**

The empirical step (provisioning a real Free-tier project and running `CREATE EXTENSION pg_cron` from the dashboard) is the only piece this research session did not execute — it requires the user's account. **Open thread:** before committing to option (a), run on a real Free-tier project: `SELECT * FROM pg_available_extensions WHERE name='pg_cron'; CREATE EXTENSION pg_cron; SELECT cron.schedule('test_noop', '*/5 * * * *', 'SELECT 1'); SELECT * FROM cron.job;`. Expected outcome: extension installs from dashboard; schedule appears in `cron.job`. If it fails, capture the error.

### F2 — Schedule SQL belongs in a migration, but extension-enable does NOT (load-bearing)

Per Source 6 (CLI Issues #647, #1591, #4163), `CREATE EXTENSION pg_cron` via Drizzle migration produces a state where `cron.job` is owned by `supabase_admin` and the migration-runner role (`postgres`) cannot reference it on subsequent operations. Concrete failure mode: `must be owner of table job (SQLSTATE 42501)` on `db push` to a fresh staging project; `must be owner of function grant_pg_cron_access (SQLSTATE 42501)` on `db pull --linked`. **The naive "drop CREATE EXTENSION into a Drizzle migration" path is broken.**

Three workarounds documented; the cleanest is **dashboard-enable once per project, then `cron.schedule(...)` via Drizzle migration**. The `cron.schedule()` call against the already-installed extension does not hit the ownership problem because it doesn't touch DDL — it inserts into `cron.job` via the extension's grant-already-applied access function.

**Operational shape for BokChoy if option (a) lands:**
- New BokChoy project bootstrap step: enable pg_cron via Supabase dashboard → Integrations → Cron, OR via SQL Editor as `postgres`. Done once per environment.
- Drizzle migration `0007_schedule_idempotency_reaper.sql` calls `SELECT cron.schedule('idempotency_reaper', '0 * * * *', 'SELECT idempotency_keys_reaper();');`. Idempotent on replay (same job_name overwrites per Source 4). Reverse migration uses `SELECT cron.unschedule('idempotency_reaper');`.
- New customer dev environments inherit the extension via Supabase project template OR manual one-time enable.

**Confidence: high** on the contradiction; **medium** on the workaround being permanent (Issue #1591 is open as of last check; Supabase may fix the ownership behavior in a future CLI release).

### F3 — `cron.job_run_details` requires its own retention story (cascade obligation surfaced)

Per Source 4 (Supabase quickstart docs verbatim): *"The records in the `cron.job_run_details` table are not cleaned up automatically. They are also not removed when jobs are unscheduled."* Per Source 5 (staff): *"will grow HUGE and slow down over time."*

For BokChoy's hourly reaper, that's 24 detail rows/day per environment. Not catastrophic, but accumulates indefinitely and contributes to the same disk-space failure mode `idempotency_keys_reaper` itself was created to prevent. **Cascade obligation: the reaper of the reaper.** Three options:

1. **Add a second pg_cron job** that runs (say) daily and `DELETE FROM cron.job_run_details WHERE start_time < NOW() - INTERVAL '7 days'` (or whatever retention window). Symmetrical with the reaper. Still subject to F2's privilege model — the DELETE runs as the role that scheduled it; for `cron.job_run_details` access, that needs to be `postgres` or `supabase_admin`.
2. **Configure pg_cron to skip detail logging** via `cron.log_run = off` (a Postgres parameter). Trades operational visibility for storage. Probably wrong default — failed-run alerting needs the table.
3. **Combine into a single composite reaper function** that does both deletes in one call. Cleaner; only one schedule to manage.

**Recommendation for /design:** option 3 (composite reaper) is the simplest. The reaper function gets a second DELETE inside the same body, schedule stays at one job. If `cron.job_run_details` access fails for the bokchoy_app role, a separate dashboard-scheduled job under `postgres` is the fallback.

### F4 — Replication semantics are clean; PITR is inferred-clean

**Replication (Source 2 upstream verbatim):** *"pg_cron does not run any jobs as long a server is in hot standby mode, but it automatically starts when the server is promoted."* No double-fire on read replicas; clean failover. Operationally relevant on Supabase Pro+ tiers where read replicas exist; irrelevant on Free-tier (single primary).

**PITR:** No direct cite found in Supabase docs, forum, or pg_cron upstream. Inference: PITR uses physical backups + WAL replay. The `cron.job` table is a regular Postgres table; its contents survive PITR by definition (physical backup includes them; WAL replays subsequent INSERT/DELETE on the table). After restore, the pg_cron daemon picks up schedules at the restore-point's state. **Caveat:** any `cron.unschedule()` applied between the snapshot and the restore point won't be in the restored state — schedules that were live at the restore point come back to life. For BokChoy this is benign (the reaper schedule is desired-state). Marked **inferred, medium confidence.**

**Tier change:** Inferred-clean. Tier change on Supabase changes compute resources, not the database instance — schedules continue. Marked **inferred, medium confidence.**

### F5 — Lock-in posture is favorable

Per Source 10: pg_cron is supported on AWS RDS (12.5+), Aurora (12.6+), Neon (default-preloaded), and is the de-facto standard scheduling extension for managed Postgres. The schedule SQL (`cron.schedule(name, schedule, command)`) is upstream-Postgres standard — no Supabase-specific dialect. If BokChoy migrates off Supabase later, the schedule transfers cleanly: the new provider needs the extension installed (one-time setup, equivalent to BokChoy's dashboard step today) and the existing `cron.job` rows replay verbatim.

`[[host-platform]]` DB-only commitment is preserved in spirit — pg_cron is a Postgres extension, not a Supabase helper. **Confidence: high** for RDS/Aurora/Neon; **medium** for Crunchy/Render (not directly verified in this spike).

### F6 — Capacity envelope is comfortable for BokChoy

Per Source 3: ≤8 concurrent jobs, ≤10 min/job recommended. BokChoy's hourly reaper is one job and runs in milliseconds (the slice 6 smoke test showed 5ms p95 against thousands of rows under the partial index). Even at MVP-sustained scale (~3 writes/sec/project per `[[idempotency-strategy]]` F12, ~575 writes/sec/project at Studio+ projection), the per-hour DELETE volume stays well under 10ms. **Confidence: high.** BokChoy's slice 6.5 schedule is trivially within Supabase's documented envelope.

### F7 — The `cron.schedule()` call site under M1 / Part 1 A1

The reaper function is `SECURITY DEFINER` owned by `postgres` per slice 6 migration `0006_idempotency_reaper.sql` (the deliberate-deviation-from-Part-1-A1 documented in slice 6's checkpoint — reaper is *infrastructure*, not the wallet primitive's M1 mechanism). Per Source 2, scheduled jobs run as the role that called `cron.schedule()`. For the reaper:

- If `postgres` schedules the job, the cron call invokes the function as postgres; the function's SECURITY DEFINER context (also postgres) takes effect; BYPASSRLS lets the DELETE touch every tenant. ✓
- If `bokchoy_app` schedules the job, the cron call invokes the function as bokchoy_app; SECURITY DEFINER switches to postgres for the body; BYPASSRLS still applies. ✓ (functionally equivalent; just a different role on the connection metadata).

Either is correct. **Recommendation:** schedule as `postgres` for consistency with the function's owner; the dashboard step (per F2) runs as postgres anyway. The migration that adds `cron.schedule(...)` does not need a privilege barrier — bokchoy_app's GRANT EXECUTE on the function (already in slice 6) is independent.

## Conflicts

### C1 — "Drop CREATE EXTENSION into a Drizzle migration" vs CLI Issues #647, #1591, #4163

The intuitive shape ("CI/CD provisions everything via migration") collides with concrete migration-runner permission failures documented across three open/closed CLI issues. **Per Contradiction protocol:** issue-tracker post-mortems with reproductions and resolutions (tier 3) win over the implicit easy-story (tier 7 training-data inference). **Resolution: dashboard-enable once per environment, schedule via migration.** Documented as F2.

### C2 — Citus upstream's "current user" vs Supabase's role-segmented model

Citus says jobs run as the current user calling `cron.schedule()`. Supabase has a multi-role model (`postgres`, `supabase_admin`, `bokchoy_app`). The contradiction is *apparent*, not real: pg_cron's "current user" semantics are preserved on Supabase — whichever role is connected when `cron.schedule()` is called becomes the runner role. The Supabase-specific complexity is *who can call cron.schedule*, not *who runs the scheduled command*. Per Source 9, both `postgres` and `bokchoy_app` can call it (assuming the extension is installed via dashboard, per F2).

### C3 — Latest pg_cron (1.6.7) vs Supabase pin (1.6.4)

Three patch versions behind on the same minor. Reading the pg_cron CHANGELOG: 1.6.5/1.6.6/1.6.7 patches are bug fixes, not behavior changes. **Per Contradiction protocol:** production code (Source 1, Supabase image) wins for what BokChoy will actually run. **Resolution: BokChoy targets pg_cron 1.6.4 semantics; revisit if Supabase ships 1.6.5+ and any of those fixes matter.**

## Conditions

The findings hold under:

- **Supabase managed Postgres 17.x.** Postgres 15.x + Supabase ships pg_cron 1.5.2; same usage pattern. Postgres 12-14 ships older pg_cron versions with a worse signature surface; not relevant for BokChoy (`[[local-docker]]` confirms Postgres 17.6.1.113).
- **Free-tier or higher.** All tiers are equivalent for cron capability per F1; tier difference matters only for compute (CPU/RAM) and PITR add-on (Pro+).
- **Single-region deployment.** Multi-region replication on Supabase is enterprise-tier and `[[host-platform]]` rejects multi-region for MVP. F4's *"hot standby mode pauses, promotion resumes"* assumes the single-primary topology BokChoy is committing to.
- **Hourly schedule (or longer).** Sub-minute scheduling on Postgres 15.1.1.61+ works per Source 4, but BokChoy's reaper has no need for it.

The findings break under:

- **Self-hosted Postgres without a pre-existing scheduling extension.** Local docker (`[[local-docker]]` Path B) ships the binary but doesn't pre-install — the extension would need explicit `CREATE EXTENSION` in the local bootstrap, hitting the same ownership friction. **Cascade obligation:** local-docker `00-roles.sql` (or equivalent) needs to dashboard-equivalent install pg_cron under postgres ownership at first-init. **Lifted to *Open threads*.**
- **Migration off Supabase to a provider without pg_cron.** No surveyed provider lacks pg_cron, but if BokChoy were to land on a Postgres tier that does (rare), staged_jobs+worker (option b) becomes the fallback. The slice-6 reaper function itself is unchanged — only the scheduling mechanism swaps.

## Operational implications

For /design's option-(a)-vs-(b)-vs-(c) pick:

**Option (a) pg_cron is shippable today on Supabase Free-tier**, with three load-bearing operational requirements:

1. **Per-environment dashboard-enable step.** New BokChoy projects (cockpit, customer-developer environments, CI/CD staging) need a one-time `CREATE EXTENSION pg_cron` from the Supabase dashboard before the schedule migration can run cleanly. Document in `docs/operations/setup.md` (or equivalent runbook). This is *not* a migration-only flow — accept the friction or the migration breaks per F2.

2. **Composite-reaper recommendation.** The `idempotency_keys_reaper()` function should be amended (or paired with a sibling) to also DELETE from `cron.job_run_details` for retention. Per F3 option 3 — single function, single schedule. **New migration:** `0007_idempotency_reaper_composite.sql` (or rename) replaces or extends slice 6's body. Or land a separate `cron_log_reaper()` and schedule both. /design picks the shape.

3. **Failed-run monitoring.** Per F1's evidence (Discussion #37405's user with 515 failures), pg_cron *can* fail silently. Wire up a monitoring query (or dashboard panel) on `SELECT * FROM cron.job_run_details WHERE jobid = <reaper_jobid> AND status = 'failed' AND start_time > NOW() - INTERVAL '24 hours'`. **Cascade obligation:** add to the monitoring/observability cascade alongside the OTel three-layer commitment from `[[wallet-mechanics]]` Amendment Part 1 A3.

**Option (b) staged_jobs + outbox worker** remains correct *if* BokChoy commits to building the worker for other reasons (webhook fire-out per `[[wallet-mechanics]]` §4, IAP-receipt-validate, analytics-event push). The worker is co-hosted in `apps/backend` per `[[backend-service-shape-research]]` — slice 6.5 piggybacks on that. **But:** the worker is bigger than slice 6.5 alone justifies; option (a) lets slice 6.5 land in days, option (b) gates on weeks of `apps/backend` work.

**Option (c) defer entirely** is the no-cost path: the reaper function works today via ad-hoc invocation (smoke test, manual ops, integration-test seeding). The 24h TTL becomes a "best-effort" invariant pre-launch. /design can pick (c) and re-pick (a) at any time once the pg_cron empirical confirmation lands.

**Strong arguments on each side, surfaced for /design:**

- *(a) wins if:* hourly cleanup is operationally desired before launch, AND user is willing to accept the per-env dashboard step (small ops cost), AND the composite-reaper-or-pair-of-reapers shape is acceptable.
- *(b) wins if:* the outbox worker is on the near-term roadmap anyway and slice 6.5 piggybacks at near-zero marginal cost. Otherwise (b) is overbuilt for the problem.
- *(c) wins if:* there's no operational need before launch (no production traffic accumulates idempotency rows at MVP-pre-launch). Reversible later.

## Reproducibility note

Reproducible. The investigation steps:

1. Fetch `https://raw.githubusercontent.com/supabase/postgres/develop/nix/ext/versions.json` — confirm pg_cron version pin.
2. Fetch `https://github.com/citusdata/pg_cron` README — confirm signatures, run-as semantics, replication behavior.
3. Fetch `https://supabase.com/docs/guides/cron` and `/cron/quickstart` — confirm capacity, retention warning, install mechanism.
4. Search `github.com/orgs/supabase/discussions` for *"pg_cron free tier"* — find Discussion #37405 staff Free-tier statement.
5. Search `github.com/supabase/cli/issues` for *"pg_cron permission"* — find Issues #647, #1591, #4163 with concrete migration-shape failures.
6. Cross-reference with Neon (`neon.com/docs/extensions/pg_cron`), AWS RDS (`docs.aws.amazon.com/.../PostgreSQL_pg_cron.html`) for portability claim.

The judgment-load-bearing claim is F2 — that the dashboard-enable workaround is the canonical shape today. **Confidence: high** because three independent CLI issues across 2024-2025 confirm the migration-only path is broken in concrete reproducible ways, and the dashboard workaround is repeatedly cited as the resolution. **Caveat:** Issue #1591 is open as of this writing; Supabase may resolve the ownership behavior in a future CLI release, which would simplify the migration shape. /implementation should re-check before slice 6.5 lands; if fixed, drop the dashboard step.

## Open threads

- **Empirical Q1 confirmation.** Provision a Supabase Free-tier project, run `SELECT * FROM pg_available_extensions WHERE name='pg_cron'; CREATE EXTENSION pg_cron;` from the SQL Editor, schedule a noop test job, verify `cron.job_run_details` populates. Requires user's Supabase account. Closes the only piece of this research that didn't reach tier-1 evidence.
- **Empirical Q3 confirmation.** Test the dashboard-enable-then-migrate flow end-to-end against a real Supabase project: enable pg_cron via dashboard, then run a Drizzle migration containing only `cron.schedule(...)`. Verify it succeeds without permission errors. If a fix to Issue #1591 has shipped meanwhile, test the pure-migration flow first; only fall back to dashboard if it still fails.
- **PITR direct cite.** No Supabase doc explicitly states pg_cron schedule survival across PITR. Re-search the Supabase changelog and forum quarterly; if a clear statement appears, upgrade F4's PITR finding from medium-inferred to high-confirmed.
- **Crunchy / Render pg_cron support.** Source 10 didn't surface direct evidence. Low-priority — not blocking for MVP — but worth a single doc-check if migration off Supabase becomes a serious option.
- **Cascade to `[[local-docker]]`.** Local-docker bootstrap (`compose.yml` + `00-roles.sql`-equivalent) doesn't currently install pg_cron — the F2 ownership friction would replicate locally. Add to local-docker initialization OR scope the reaper schedule to managed-Supabase-only and skip it locally.
- **Cascade to `[[wallet-mechanics]]`.** This research surfaces a new required line item under *Cascade obligations* — pg_cron extension enable as a per-environment bootstrap step — when /design picks option (a). Otherwise no cascade.
- **`cron.job_run_details` retention design.** F3 names three options; /design picks one. Composite reaper recommended; /design defends or rejects.
