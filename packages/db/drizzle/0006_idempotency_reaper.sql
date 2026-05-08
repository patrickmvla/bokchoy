-- idempotency_keys_reaper — hourly cleanup of completed-and-aged idempotency
-- records per [[idempotency-keys-schema-research]] F6 + [[idempotency-strategy]]
-- 24h retention.
--
-- Slice 6 ships the FUNCTION; the scheduler wiring (pg_cron vs staged_jobs +
-- worker) is deferred. The F6 open thread names both options; both need
-- infrastructure that doesn't exist yet (worker process for staged_jobs;
-- operational sign-off for pg_cron extension setup). Picking either before the
-- surrounding context exists would be improvisation. Slice 6.5 wires the
-- scheduler when ready.
--
-- This function is the canonical mechanism the scheduler will eventually call:
--
--   SELECT idempotency_keys_reaper();              -- 24h default per spec
--   SELECT idempotency_keys_reaper(INTERVAL '6 h'); -- ops-tunable for backfills
--
-- Returns the count of rows deleted, useful for caller-side observability
-- (worker job-result logging, pg_cron output capture).
--
-- WHY SECURITY DEFINER (deviation from Amendment Part 1 A1):
--   The Part 1 A1 commitment to "no SECURITY DEFINER" applies to the wallet
--   primitive's M1 mechanism (wallet_credit / wallet_debit / inventory_grant /
--   inventory_consume / wallet_deidentify_player) — those run as the caller
--   under the caller's tenant GUC, scoped by RLS to one project.
--
--   The reaper is INFRASTRUCTURE — a global cleanup job that must touch every
--   tenant's expired records in a single run. SECURITY DEFINER + ownership by
--   postgres (BYPASSRLS) is the canonical pattern for "function that needs
--   elevated privileges to run a cron-style operation." Without it the
--   function would either (a) require the caller to be a BYPASSRLS role
--   (different DB credential for the worker — operational complexity), or
--   (b) need to iterate per-tenant with RLS active (slow + complex).
--
--   SECURITY DEFINER carries CVE-2018-1058 attack surface (search_path-based
--   privilege escalation). Hardened with `SET search_path = pg_catalog, public`
--   per Postgres 16 docs §sql-createfunction.
--
-- WHY NOT BATCHED: at MVP scale the eligible-row count per hourly run is in
-- the low thousands at most (3 writes/sec/project × 3600 seconds = ~11K
-- per-project per hour, of which only a fraction is completed and aged out).
-- A single DELETE backed by the partial index `idx_idempotency_keys_reaper`
-- (created in slice 1) is fast and atomic. Batching adds complexity for a
-- problem we don't have yet. Studio+ projection (~575 writes/sec/project)
-- is ~2M per-project per hour — still tractable for a single DELETE; revisit
-- if hot-path latency degrades during the reaper window.

CREATE OR REPLACE FUNCTION idempotency_keys_reaper(
  p_max_age interval DEFAULT INTERVAL '24 hours'
) RETURNS integer  -- count of rows deleted
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  -- Uses idx_idempotency_keys_reaper (partial index from slice 1):
  --   ON idempotency_keys (created_at) WHERE completed_at IS NOT NULL.
  -- Both predicates align with the index; the planner picks it for the scan.
  DELETE FROM idempotency_keys
  WHERE completed_at IS NOT NULL
    AND created_at < NOW() - p_max_age;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION idempotency_keys_reaper(interval) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION idempotency_keys_reaper(interval) TO bokchoy_app;
