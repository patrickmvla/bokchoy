-- ---------- wallet_credit/debit_by_external_id — variable_conflict fix ----------
-- Same class as 0014 (inventory fns), surfaced by the first live smoke run via the shop purchase
-- path (purchase_offer_by_external_id PERFORMs wallet_debit_by_external_id). Both 0010 functions
-- RETURN TABLE(... wallet_id uuid, player_id uuid ...); those output columns are in-scope
-- variables, so the lazy-create `INSERT INTO wallets ... ON CONFLICT (project_id, player_id,
-- currency_id)` + the fallback `WHERE player_id = v_player_id` are ambiguous under the default
-- plpgsql.variable_conflict = error. Never caught because the smoke suite exercised the
-- by-wallet-id wallet_credit/wallet_debit (0004), not these by-external-id wrappers — which power
-- the M-1.5 player-centric HTTP routes the SDK uses. Fix: `#variable_conflict use_column`
-- (verified safe: every RETURN QUERY / delegation uses v_-prefixed locals; no SQL statement wants
-- a bare output-column name as a variable). Bodies otherwise byte-identical to 0010.
-- 0010 is shipped — CREATE OR REPLACE in a new migration, never edit in place.

CREATE OR REPLACE FUNCTION wallet_credit_by_external_id(
  p_project_id          uuid,
  p_player_external_id  text,
  p_currency_code       text,
  p_amount              numeric,
  p_reason_code         text,
  p_source_event_id     text     DEFAULT NULL,
  p_idempotency_key_id  bigint   DEFAULT NULL,
  p_related_id          bigint   DEFAULT NULL,
  p_related_type        text     DEFAULT NULL,
  p_metadata            jsonb    DEFAULT '{}'::jsonb
) RETURNS TABLE (
  transaction_id  bigint,
  wallet_id       uuid,
  player_id       uuid,
  balance_after   numeric
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_tenant       uuid;
  v_currency_id  uuid;
  v_player_id    uuid;
  v_wallet_id    uuid;
  v_txn_id       bigint;
  v_balance      numeric(20,4);
BEGIN
  v_tenant := current_setting('app.current_tenant')::uuid;
  IF v_tenant IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'TenantMismatch: GUC=% p_project_id=%', v_tenant, p_project_id
      USING ERRCODE = 'BC020';
  END IF;

  SELECT id INTO v_currency_id
  FROM currencies
  WHERE project_id = p_project_id AND code = p_currency_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CurrencyNotFound: code=% project_id=%', p_currency_code, p_project_id
      USING ERRCODE = 'BC060';
  END IF;

  INSERT INTO players (project_id, external_id)
  VALUES (p_project_id, p_player_external_id)
  ON CONFLICT (project_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_player_id;

  IF v_player_id IS NULL THEN
    SELECT id INTO v_player_id
    FROM players
    WHERE project_id = p_project_id AND external_id = p_player_external_id;
  END IF;

  INSERT INTO wallets (project_id, player_id, currency_id)
  VALUES (p_project_id, v_player_id, v_currency_id)
  ON CONFLICT (project_id, player_id, currency_id) DO NOTHING
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    SELECT id INTO v_wallet_id
    FROM wallets
    WHERE project_id = p_project_id
      AND player_id  = v_player_id
      AND currency_id = v_currency_id;
  END IF;

  SELECT wallet_credit(
    p_project_id,
    v_wallet_id,
    p_amount,
    v_currency_id,
    p_reason_code,
    p_source_event_id,
    p_idempotency_key_id,
    p_related_id,
    p_related_type,
    p_metadata
  ) INTO v_txn_id;

  SELECT balance INTO v_balance
  FROM wallets
  WHERE id = v_wallet_id;

  RETURN QUERY SELECT v_txn_id, v_wallet_id, v_player_id, v_balance;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION wallet_debit_by_external_id(
  p_project_id          uuid,
  p_player_external_id  text,
  p_currency_code       text,
  p_amount              numeric,
  p_reason_code         text,
  p_source_event_id     text     DEFAULT NULL,
  p_idempotency_key_id  bigint   DEFAULT NULL,
  p_related_id          bigint   DEFAULT NULL,
  p_related_type        text     DEFAULT NULL,
  p_metadata            jsonb    DEFAULT '{}'::jsonb
) RETURNS TABLE (
  transaction_id  bigint,
  wallet_id       uuid,
  player_id       uuid,
  balance_after   numeric
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_tenant       uuid;
  v_currency_id  uuid;
  v_player_id    uuid;
  v_wallet_id    uuid;
  v_txn_id       bigint;
  v_balance      numeric(20,4);
BEGIN
  v_tenant := current_setting('app.current_tenant')::uuid;
  IF v_tenant IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'TenantMismatch: GUC=% p_project_id=%', v_tenant, p_project_id
      USING ERRCODE = 'BC020';
  END IF;

  SELECT id INTO v_currency_id
  FROM currencies
  WHERE project_id = p_project_id AND code = p_currency_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CurrencyNotFound: code=% project_id=%', p_currency_code, p_project_id
      USING ERRCODE = 'BC060';
  END IF;

  INSERT INTO players (project_id, external_id)
  VALUES (p_project_id, p_player_external_id)
  ON CONFLICT (project_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_player_id;

  IF v_player_id IS NULL THEN
    SELECT id INTO v_player_id
    FROM players
    WHERE project_id = p_project_id AND external_id = p_player_external_id;
  END IF;

  INSERT INTO wallets (project_id, player_id, currency_id)
  VALUES (p_project_id, v_player_id, v_currency_id)
  ON CONFLICT (project_id, player_id, currency_id) DO NOTHING
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    SELECT id INTO v_wallet_id
    FROM wallets
    WHERE project_id = p_project_id
      AND player_id  = v_player_id
      AND currency_id = v_currency_id;
  END IF;

  SELECT wallet_debit(
    p_project_id,
    v_wallet_id,
    p_amount,
    v_currency_id,
    p_reason_code,
    p_source_event_id,
    p_idempotency_key_id,
    p_related_id,
    p_related_type,
    p_metadata
  ) INTO v_txn_id;

  SELECT balance INTO v_balance
  FROM wallets
  WHERE id = v_wallet_id;

  RETURN QUERY SELECT v_txn_id, v_wallet_id, v_player_id, v_balance;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION wallet_credit_by_external_id(uuid, text, text, numeric, text, text, bigint, bigint, text, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION wallet_credit_by_external_id(uuid, text, text, numeric, text, text, bigint, bigint, text, jsonb) TO bokchoy_app;--> statement-breakpoint
REVOKE ALL ON FUNCTION wallet_debit_by_external_id(uuid, text, text, numeric, text, text, bigint, bigint, text, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION wallet_debit_by_external_id(uuid, text, text, numeric, text, text, bigint, bigint, text, jsonb) TO bokchoy_app;
