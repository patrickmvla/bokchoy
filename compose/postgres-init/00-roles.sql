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
