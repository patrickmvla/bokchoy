CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS partman;
CREATE EXTENSION IF NOT EXISTS pg_partman WITH SCHEMA partman;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- pg_cron: scheduling for idempotency_keys_reaper + cron.job_run_details cleanup
-- per [[reaper-schedule-deferral]] (trigger fired at slice 8.1b, debt now sits
-- behind customer-facing routes after 8.1c) + [[reaper-schedule-research]] F2.
--
-- Installed under postgres role at init so local-docker matches the Supabase
-- dashboard-enable ownership shape (extension owner = supabase_admin in both
-- environments; postgres role gets cron access via the bundled grant
-- function in the supabase/postgres image). Mirrors the workaround in F2:
-- per-environment install once, then schedules ride in Drizzle migrations.
--
-- Managed Supabase requires the equivalent one-time dashboard step
-- (Integrations → Cron, OR `CREATE EXTENSION pg_cron` from SQL Editor as
-- postgres). Document in deploy runbook.
CREATE EXTENSION IF NOT EXISTS pg_cron;

GRANT USAGE ON SCHEMA extensions, partman TO postgres;
