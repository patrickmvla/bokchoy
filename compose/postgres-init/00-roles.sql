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

-- Match Supabase managed-tier: postgres needs CREATE on public schema for DDL.
-- Postgres 15+ removed CREATE for the implicit PUBLIC role; we grant it directly
-- to postgres. (pg_database_owner cannot have explicit members; we'd need to
-- ALTER DATABASE OWNER to use that path. Direct grant is simpler.)
-- Without this, drizzle-kit migrate fails "permission denied for schema public"
-- when connecting as postgres.
GRANT CREATE ON SCHEMA public TO postgres;
-- Database-level CREATE so drizzle-kit migrate can create its `drizzle`
-- migration-tracking schema. (Without this: PostgresError 42501 "permission
-- denied for database postgres" when drizzle-orm/postgres-js/migrator runs.)
GRANT CREATE ON DATABASE postgres TO postgres;
-- bokchoy_app needs USAGE on public to access tables; per-table privileges
-- (SELECT/INSERT/UPDATE/DELETE) are granted by migrations, not here. CREATE
-- on schema is intentionally NOT granted — the app role does not create tables.
GRANT USAGE ON SCHEMA public TO bokchoy_app;
