---
type: decision
features: [wallet, idempotency, scheduling]
related: ["[[reaper-schedule-research]]", "[[idempotency-keys-schema-research]]", "[[wallet-mechanics]]", "[[backend-service-shape-research]]"]
created: 2026-05-08
confidence: high
---

# Defer scheduling of `idempotency_keys_reaper()` until first production write to `idempotency_keys`

## Resolution 2026-05-11 — DEFERRAL CLOSED

**Trigger fired 2026-05-10** — slice 8.1b shipped the HTTP idempotency middleware at `apps/backend/src/idempotency/middleware.ts` with three `// allow-direct-mutation: idempotency-middleware` opt-out comments (per `[[direct-mutation-lint-opt-out-shape]]` (β) N=1 lookback shape). The mechanical primary trigger documented in §Trigger below fired exactly as specified — the per-statement opt-out PR was the trigger event. (production-cited / high — git log + `bun run check:direct-mutation` output verifiable in repo.)

**Pick: option (a) pg_cron** — landed in slice 8.1.5 on 2026-05-10 per `[[reaper-schedule-research]]` F2 (dashboard-enable-then-Drizzle-migrate) + F3 option 3 (single composite function, single schedule) + F7 (run-as postgres role). Three artifacts shipped:
- `compose/postgres-init/01-extensions.sql` — `CREATE EXTENSION IF NOT EXISTS pg_cron` under postgres role at init time. Closes the §Open Threads "Cascade to `[[local-docker]]`" item.
- `packages/db/drizzle/0009_idempotency_reaper_composite.sql` (~85 lines) — `CREATE OR REPLACE FUNCTION idempotency_keys_reaper(p_max_age interval DEFAULT '24 hours')` extends the slice 6 body with a second `DELETE FROM cron.job_run_details WHERE start_time < NOW() - INTERVAL '7 days'` (composite-reaper per F3); then `SELECT cron.schedule('idempotency_reaper', '0 * * * *', 'SELECT idempotency_keys_reaper();')`.
- `packages/db/scripts/smoke-reaper.ts` — `test6_composite_cron_log_reaper()` verifies pre-flight extension check, seeds 3 rows in `cron.job_run_details` with explicit high runids, calls reaper, asserts -10d + -8d rows deleted, -3d row survives. 6/6 green.

**Open debt carried (NOT closed by this resolution):**
- **(deploy-runbook, owed)** Per-env one-time Supabase dashboard step (Integrations → Cron → enable, OR `CREATE EXTENSION pg_cron` from SQL Editor as postgres) per `[[reaper-schedule-research]]` F2 — migration-only path is broken on managed Supabase per CLI Issues #647/#1591/#4163.
- **(monitoring cascade, owed)** Failed-run alerting on `cron.job_run_details WHERE jobid=<reaper_jobid> AND status='failed'` per `[[reaper-schedule-research]]` operational implication 3. Ad-hoc weekly check via `psql` is the manual mitigation until wired.
- **(first-deploy verification, owed)** Verify `extensions.grant_pg_cron_access` grants postgres DELETE on `cron.job_run_details` on managed Supabase. Likely true per F2 inference; not directly cited.

The deferral entry below stands as the historical record of why the schedule was NOT shipped at slice 6. The resolution above records what landed at slices 8.1b (trigger) + 8.1.5 (schedule). Future readers find the trigger contract in §Trigger; the resolution contract here.

## Decision

Slice 6.5 stays queued. The `idempotency_keys_reaper(p_max_age interval DEFAULT '24 hours')` function from slice 6 is in place and callable from any context (smoke test, ops command, a future schedule); **no schedule is wired today**. The schedule lands when a production code path first writes to `idempotency_keys` — that moment is grep-detectable and CI-detectable.

When the trigger fires, the 3-way pick from `[[reaper-schedule-research]]` reopens with the evidence already collected:

- **(a)** pg_cron — viable on Supabase Free-tier; ships as 2 Drizzle migrations + 1 per-env dashboard step + composite-reaper to clean `cron.job_run_details`.
- **(b)** `staged_jobs` row + outbox worker — natural if `apps/backend` has shipped the outbox worker for other reasons (webhook fire-out, IAP receipt validate, analytics events) per `[[backend-service-shape-research]]`.
- **(c)** further defer — only if production traffic is still zero at trigger time.

## Reasoning

The reaper has nothing to reap pre-trigger (production-cited / high). Per `[[idempotency-keys-schema-research]]` F7, `idempotency_keys` is the storage-of-record for the **client-supplied-header path only**; server-derived natural-key idempotency uses `transactions(wallet_id, source_event_id)` and never touches this table. Per `0004_wallet_functions.sql` header (production-cited / high — direct quote from the slice-4 migration in this repo): *"these functions accept and store `p_idempotency_key_id` but do NOT look up / lock the idempotency_keys row. That live in the HTTP layer (middleware does INSERT … ON CONFLICT before calling wallet_credit)."*

The HTTP middleware that writes to the table is queued (state.md slice 4.6), gated behind `apps/backend` which is currently empty (`src/index.ts` only). Until that middleware ships, production-tier `idempotency_keys` accumulates zero rows.

Scheduling pg_cron now would mean an hourly noop DELETE on an empty table. That noop carries real cost:

- One row/hour in `cron.job_run_details`, which is itself not auto-cleaned per `[[reaper-schedule-research]]` F3 (production-cited / high — Supabase quickstart docs verbatim). 24 rows/day. Composite-reaper design becomes load-bearing for a problem that doesn't exist yet.
- Per-environment Supabase-dashboard `CREATE EXTENSION pg_cron` step. Load-bearing per `[[reaper-schedule-research]]` F2 contradiction (production-cited / high — three concrete CLI Issues #647/1591/4163 with `must be owner of table job (SQLSTATE 42501)` failures on migration-only install).
- Failed-run alerting wired on `cron.job_run_details.status='failed'`. Per `[[reaper-schedule-research]]` F1 evidence (Discussion #37405) pg_cron can fail silently even on `select 1` — monitoring is non-optional once a schedule exists.

All three costs are real today and zero-payoff pre-trigger.

## Engineering substance applied

- **Failure semantics:** none. No schedule, no failure mode. The reaper function is independently callable as `SELECT idempotency_keys_reaper();` for one-shot ad-hoc cleanup if disk pressure surfaces before the trigger fires.
- **Observability:** none required. When the trigger fires, observability lands with the schedule per `[[reaper-schedule-research]]` operational implication 3.
- **Ops cost:** zero today. The deferred work cost moves with the work, not ahead of it.
- **Reversibility:** trivial. Picking (a) or (b) when the trigger fires is a small slice, not a redesign. Slice 6's function and its smoke tests stay unchanged.
- **Blast radius:** zero. No scheduled SQL means nothing to misconfigure across tenants.

## Production-grade gates

- **Idiomatic** — YAGNI on background-job scheduling until the data path exists. Defensible from direct engineering math (no writes → no cleanup needed). **(inferred / high.)**
- **Industry-standard** — this gate does not have a clean two-named-system citation. *"Defer scheduling until the writer exists"* is the absence of an action, not a published pattern with named adopters. Honest framing: this is a scope-discipline call, not a pattern. **(inferred / high.)**
- **First-class** — yes. The reaper function exists as a first-class Postgres function callable from any context (psql, smoke test, future schedule). Deferring the schedule preserves all three options (pg_cron / staged_jobs / manual ad-hoc) without locking any in.

## Trigger

**Primary (mechanical):** any non-test, non-script TypeScript code in `apps/` or `packages/` containing one of:

- `INSERT INTO idempotency_keys`
- `INSERT INTO "idempotency_keys"`
- `.insert(idempotencyKeys)`

The CI lint `scripts/check-direct-wallet-mutation.ts` already scans for these patterns against the protected-table list (`idempotency_keys` is on it per `[[wallet-mechanics]]` Amendment Part 3 A17). When the HTTP idempotency middleware lands, the implementer adds `// allow-direct-mutation: idempotency-middleware` (or equivalent) to silence the lint — **that opt-out PR is the trigger event** for slice 6.5.

**Why mechanical, not slice-named:** slice numbers are not stable across reshuffling and are not in implementation order. The PR that introduces the first write to `idempotency_keys` may be the currently-numbered slice 4.6, a renumbered combined slice, or split across two slices. Naming the *act* (the write) is invariant under those reshuffles.

**No secondary trigger.** The primary trigger is grep-mediated (CI lint catches the line) and PR-review-mediated (the `// allow-direct-mutation` opt-out is reviewable). If both fail, the underlying review + lint discipline is broken — a table-size monitoring alert papers over the discipline failure rather than fixing it. Belt-and-suspenders is overengineering for solo-dev with vault-discipline cascade tracking.

## Rejected alternatives

### (a) Ship pg_cron schedule today

**What:** `CREATE EXTENSION pg_cron` via Supabase dashboard (per `[[reaper-schedule-research]]` F2 — migration-only install is broken), then Drizzle migration calls `SELECT cron.schedule('idempotency_reaper', '0 * * * *', 'SELECT idempotency_keys_reaper();');`. Composite-reaper extends `idempotency_keys_reaper` to also clean `cron.job_run_details` (per F3). Failed-run alerting wired on `cron.job_run_details`.
**Wins when:** production traffic is writing to `idempotency_keys` (so the reaper has work) OR "infrastructure-first" is a named team policy with the team capacity to pay the ops cost (PagerDuty / Datadog operate this way).
**Why not here:** no writer exists pre-trigger; vault-discipline + cascade-obligation tracking already mitigate the forgetting failure mode that "infrastructure-first" exists to address. Per-env dashboard step + composite-reaper + monitoring is real cost for zero present-day benefit.

### (b) `staged_jobs` row + outbox worker

**What:** hourly enqueue of `staged_jobs(kind='idempotency_reaper')`; outbox worker in `apps/backend` does `SELECT … FOR UPDATE SKIP LOCKED`, calls the reaper function. Per `[[backend-service-shape-research]]` the worker is co-located in the modular monolith.
**Wins when:** `apps/backend` is already shipping the outbox worker for other reasons (webhook fire-out, IAP receipt validate, analytics events). Marginal cost of adding a reaper kind is near-zero in that case.
**Why not here:** `apps/backend` is empty. Shipping the worker just to schedule the reaper is overbuilt — the worker is bigger than slice 6.5 alone justifies. When the worker lands for other reasons, (b) becomes natural at the same trigger event as (a).

### Infrastructure-first counter to (c)

**What:** wire monitoring + cleanup before there's load, on the basis that teams forget to wire it after.
**Wins when:** team is large, oncall is shared, vault discipline is weak. Datadog / PagerDuty operate this way at scale.
**Why not here:** solo-dev + active vault + cascade-obligation tracking + grep-mediated trigger → the forgetting failure mode the school exists to mitigate does not bind here.

## Failure mode

**Trigger fires, nobody notices, `idempotency_keys` grows unbounded.** Cost ramp:

- Free-tier 500MB cap. At indie-projection ~50MB/day/project per `[[idempotency-keys-schema-research]]` (production-cited from Brandur), ~10 days from first production write to disk fill.
- Pro+ 8GB cap → ~160 days runway.

The window between trigger and detection is days-to-weeks, not hours — even the worst case is recoverable by ad-hoc invocation of the reaper.

## Mitigations

- This vault entry is the durable record of the trigger condition.
- `state.md` checkpoint references this entry under the slice-6.5 cascade queue.
- The CI lint `scripts/check-direct-wallet-mutation.ts` already flags writes to `idempotency_keys`. No new tooling.
- Recovery if the trigger fires unnoticed: `SELECT idempotency_keys_reaper();` is callable ad-hoc — returns the count of rows deleted. Buys time while slice 6.5 is wired properly.

## Idiom citations

N/A — this is a scope-discipline decision, not a code-shape decision. No idiom file applies.

## Revisit when

**Primary trigger fires.** Any non-test, non-script code in `apps/` or `packages/` writes to `idempotency_keys`. Reopen this decision with `[[reaper-schedule-research]]` evidence in hand to pick (a), (b), or further defer to (c).
