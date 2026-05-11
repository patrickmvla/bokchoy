-- Slice 8.1.5 — composite reaper + pg_cron schedule per
-- [[reaper-schedule-deferral]] (trigger fired at slice 8.1b: idempotency_keys
-- middleware writers landed; debt now sits behind customer-facing routes after
-- slice 8.1c) + [[reaper-schedule-research]] F2 (dashboard-enable-then-migrate)
-- + F3 option 3 (single composite function, single schedule) + F7 (run-as
-- postgres for consistency with function owner).
--
-- Two changes in one migration (kept together because they're the same
-- atomic decision: extend the function body to clean cron.job_run_details
-- AND wire the schedule that produces those rows):
--
--   1. CREATE OR REPLACE idempotency_keys_reaper to also DELETE from
--      cron.job_run_details older than 7 days. Schema-qualified reference
--      (cron.job_run_details) because the function's hardened search_path
--      excludes the cron schema per CVE-2018-1058 mitigation pattern from
--      slice 6.
--
--   2. SELECT cron.schedule('idempotency_reaper', '0 * * * *', ...).
--      Idempotent on replay — Source 4 (Supabase quickstart docs verbatim):
--      "Attempting to create a second Job with the same name (and case)
--      will overwrite the first Job."
--
-- Return-type preservation: CREATE OR REPLACE FUNCTION cannot change return
-- type. The function continues to return the idempotency_keys deletion count
-- (caller-side observability per slice 6 contract). The cron.job_run_details
-- count goes to RAISE NOTICE for log inspection — surfaces in pg_cron's own
-- output capture (cron.job_run_details.return_message) as a side-effect of
-- being a notice, without expanding the public return shape.
--
-- Pre-requisite: pg_cron extension is installed in the target database.
--   Local-docker: compose/postgres-init/01-extensions.sql (slice 8.1.5).
--   Managed Supabase: one-time dashboard step (Integrations → Cron) per
--     [[reaper-schedule-research]] F2 — migration-only `CREATE EXTENSION`
--     hits ownership friction (CLI Issues #647, #1591, #4163).
-- If the cron schema is absent at migration time, this migration fails loudly
-- on the cron.schedule(...) call. That's the intended failure mode — surfaces
-- the missing dashboard step explicitly rather than silently no-op'ing.

CREATE OR REPLACE FUNCTION idempotency_keys_reaper(
  p_max_age interval DEFAULT INTERVAL '24 hours'
) RETURNS integer  -- count of idempotency_keys rows deleted
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer := 0;
  v_log_deleted integer := 0;
BEGIN
  -- Uses idx_idempotency_keys_reaper (partial index from slice 1):
  --   ON idempotency_keys (created_at) WHERE completed_at IS NOT NULL.
  -- Both predicates align with the index; the planner picks it for the scan.
  DELETE FROM idempotency_keys
  WHERE completed_at IS NOT NULL
    AND created_at < NOW() - p_max_age;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Composite step: clean cron.job_run_details. pg_cron does not auto-clean
  -- this table (Source 4 Supabase quickstart docs verbatim: "The records in
  -- the cron.job_run_details table are not cleaned up automatically. They are
  -- also not removed when jobs are unscheduled, which will take up disk space
  -- in your database"). 7-day window per slice 8.1.5 directive — enough to
  -- debug a missed-run incident across a long weekend; trivial storage at
  -- 24 detail rows/day per scheduled job.
  --
  -- Schema-qualified (cron.job_run_details) — search_path is hardened to
  -- pg_catalog,public per CVE-2018-1058. Postgres role has DELETE on this
  -- table via pg_cron's bundled grant function (extensions.grant_pg_cron_access
  -- on Supabase / equivalent in supabase/postgres image) — verified in
  -- local-docker pre-implementation spike.
  DELETE FROM cron.job_run_details
  WHERE start_time < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS v_log_deleted = ROW_COUNT;

  -- Side-channel for cron.job_run_details deletion count. Does not change the
  -- function return contract (caller observability already wired against the
  -- integer return — slice 6 smoke + slice 8.1b operator narrative). Surfaces
  -- in cron.job_run_details.return_message when the reaper itself runs under
  -- pg_cron, giving operators a self-referential audit trail.
  IF v_log_deleted > 0 THEN
    RAISE NOTICE 'idempotency_keys_reaper: deleted % cron.job_run_details rows', v_log_deleted;
  END IF;

  RETURN v_deleted;
END;
$$;--> statement-breakpoint

-- Schedule the hourly reaper. Idempotent on replay per Source 4. Run-as
-- semantics per Source 2 + F7: command runs as the role calling cron.schedule,
-- which is whichever migration runner this executes under. The function is
-- SECURITY DEFINER owned by postgres, so the BYPASSRLS context is established
-- inside the function regardless of the calling role on the schedule.
SELECT cron.schedule(
  'idempotency_reaper',
  '0 * * * *',
  'SELECT idempotency_keys_reaper();'
);
