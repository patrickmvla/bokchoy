-- Slice 8.1a — SECURITY DEFINER functions for api_keys bootstrap lookup +
-- last_used_at update per [[wallet-http-contract]] G3 (mechanism not pinned in
-- the contract; resolved on-the-spot to (A) SECURITY DEFINER pattern matching
-- slice 6 idempotency_keys_reaper precedent).
--
-- The bootstrap problem: Bearer-validation middleware looks up api_keys by
-- prefix BEFORE knowing project_id (the lookup IS what resolves project_id).
-- api_keys is FORCE RLS-protected; direct SELECT from bokchoy_app fails because
-- current_setting('app.current_tenant')::uuid raises on unset GUC.
--
-- Pattern: SECURITY DEFINER + OWNER postgres (BYPASSRLS) + SET search_path
-- harden (CVE-2018-1058) + REVOKE FROM PUBLIC + GRANT EXECUTE TO bokchoy_app.
-- Mirrors slice 6 reaper verbatim.
--
-- Two functions deliberately separated:
--   api_key_lookup(p_prefix)    — read-only, returns 0 or 1 row.
--   api_key_record_use(p_id)    — write last_used_at = now().
--
-- Splitting prevents invalid-Bearer attempts from leaving last_used_at signal —
-- last_used_at means last *successful* use, not last attempt. Caller pattern:
-- middleware calls lookup, verifies HMAC in TS using BOKCHOY_API_KEY_HMAC_SECRET,
-- and only on success calls record_use (fire-and-forget).

CREATE OR REPLACE FUNCTION api_key_lookup(p_prefix text)
  RETURNS SETOF api_keys
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT *
  FROM api_keys
  WHERE key_prefix = p_prefix
    AND revoked_at IS NULL;
$$;

ALTER FUNCTION api_key_lookup(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION api_key_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_key_lookup(text) TO bokchoy_app;

CREATE OR REPLACE FUNCTION api_key_record_use(p_id uuid)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  UPDATE api_keys
  SET last_used_at = NOW()
  WHERE id = p_id;
$$;

ALTER FUNCTION api_key_record_use(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION api_key_record_use(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_key_record_use(uuid) TO bokchoy_app;
