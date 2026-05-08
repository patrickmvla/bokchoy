-- M1 stored functions: wallet_credit, wallet_debit, wallet_deidentify_player.
--
-- Per [[wallet-mechanics]] Amendments:
--   Part 1 A1 — SECURITY INVOKER (Postgres default); the function set is the
--               convenient/blessed path under M1, NOT a privilege barrier.
--               search_path hardening removed (only matters for SECURITY DEFINER).
--   Part 1 A2 — READ COMMITTED + FOR UPDATE on the wallet row (pgledger pattern,
--               no SERIALIZABLE retry budget).
--   Part 1 A5 — BCxxx SQLSTATE namespace for typed TS-side dispatch:
--               BC010 InsufficientFunds, BC020 TenantMismatch, BC021 WalletNotFound,
--               BC022 CurrencyMismatch, BC030 PolicyViolation, BC040 ConfigurationError.
--   Part 2 A10 — wallet_deidentify_player(UUID) + HMAC→UUIDv8 projection (RFC 9562
--                §5.8). Internal-only anon_id; never leaves the database.
--   Part 3 A18 — Reserved BC050/BC060 (ReasonCodeNotRegistered/CurrencyNotFound)
--                allocated; bodies do NOT explicitly catch+rethrow because Postgres
--                FK-violation 23503 already raises with enough information for TS
--                dispatch on `error.code === '23503'` against the FK constraint name.
--
-- Body shape per [[wallet-functions-research]] Operational implications template
-- with idempotency-check ordering corrected: idempotency lookup happens AFTER
-- acquiring the FOR UPDATE lock on the wallet row. Under READ COMMITTED, a
-- concurrent caller with the same source_event_id blocks on the wallet lock;
-- when it acquires, the post-commit snapshot includes the prior caller's INSERT
-- — so the idempotency SELECT finds it and the function replays. Doing the
-- check before the lock would race (both concurrent callers miss + double-insert).
--
-- DELIBERATELY NOT IN THIS SLICE:
--   • inventory_grant / inventory_consume — §2 lists them but the inventory
--     schema isn't part of MVP Month 1–3. A function with no inventory table
--     is an audit-row-only writer, deferred until the inventory feature lands.
--   • Client-supplied Idempotency-Key path — these functions accept and store
--     p_idempotency_key_id but do NOT look up / lock the idempotency_keys row.
--     That live in the HTTP layer (middleware does INSERT … ON CONFLICT before
--     calling wallet_credit) per [[idempotency-keys-schema-research]] F7.

CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint

-- ---------- wallet_credit ----------

CREATE OR REPLACE FUNCTION wallet_credit(
  p_project_id          uuid,
  p_wallet_id           uuid,
  p_amount              numeric,
  p_currency_id         uuid,
  p_reason_code         text,
  p_source_event_id     text     DEFAULT NULL,
  p_idempotency_key_id  bigint   DEFAULT NULL,
  p_related_id          bigint   DEFAULT NULL,
  p_related_type        text     DEFAULT NULL,
  p_metadata            jsonb    DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant       uuid;
  v_wallet       wallets%ROWTYPE;
  v_existing_id  bigint;
  v_new_balance  numeric(20, 4);
  v_new_version  bigint;
  v_new_txn_id   bigint;
BEGIN
  -- (1) Tenant context check (defense-in-depth on top of RLS).
  v_tenant := current_setting('app.current_tenant')::uuid;
  IF v_tenant IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'TenantMismatch: GUC=% p_project_id=%', v_tenant, p_project_id
      USING ERRCODE = 'BC020';
  END IF;

  -- (2) Lock wallet row (READ COMMITTED + FOR UPDATE per Amendment Part 1 A2).
  -- This serializes concurrent operations on the same wallet.
  SELECT * INTO v_wallet
  FROM wallets
  WHERE id = p_wallet_id AND project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WalletNotFound: wallet_id=% project_id=%', p_wallet_id, p_project_id
      USING ERRCODE = 'BC021';
  END IF;

  IF v_wallet.currency_id IS DISTINCT FROM p_currency_id THEN
    RAISE EXCEPTION 'CurrencyMismatch: wallet_currency=% requested=%',
                    v_wallet.currency_id, p_currency_id
      USING ERRCODE = 'BC022';
  END IF;

  -- (3) Idempotency check AFTER lock acquisition. Under FOR UPDATE serialization,
  -- a concurrent caller with the same source_event_id blocks here; once the
  -- prior caller commits, this SELECT (fresh snapshot under READ COMMITTED)
  -- finds the prior INSERT and we replay.
  IF p_source_event_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM transactions
    WHERE wallet_id = p_wallet_id AND source_event_id = p_source_event_id;
    IF FOUND THEN
      RAISE LOG 'wallet_credit: idempotency_replay project=% wallet=% source_event=% prior_txn=%',
        p_project_id, p_wallet_id, p_source_event_id, v_existing_id;
      RETURN v_existing_id;
    END IF;
  END IF;

  -- (4) Update balance + version (pgledger update-then-check; for credit the
  -- post-state can never breach allow_negative_balance so no explicit check).
  v_new_balance := v_wallet.balance + p_amount;
  v_new_version := v_wallet.version + 1;

  UPDATE wallets
  SET balance    = v_new_balance,
      version    = v_new_version,
      updated_at = NOW()
  WHERE id = p_wallet_id;

  -- (5) Insert audit row. transactions.amount is positive for credit per §3.
  INSERT INTO transactions (
    project_id, wallet_id, player_id, kind, amount, currency_id,
    wallet_version, reason_code, source_event_id, idempotency_key_id,
    related_id, related_type, metadata
  ) VALUES (
    p_project_id, p_wallet_id, v_wallet.player_id, 'currency_credit', p_amount, p_currency_id,
    v_new_version, p_reason_code, p_source_event_id, p_idempotency_key_id,
    p_related_id, p_related_type, p_metadata
  )
  RETURNING id INTO v_new_txn_id;

  RETURN v_new_txn_id;
END;
$$;--> statement-breakpoint

-- ---------- wallet_debit ----------

CREATE OR REPLACE FUNCTION wallet_debit(
  p_project_id          uuid,
  p_wallet_id           uuid,
  p_amount              numeric,        -- positive value; row stores -amount
  p_currency_id         uuid,
  p_reason_code         text,
  p_source_event_id     text     DEFAULT NULL,
  p_idempotency_key_id  bigint   DEFAULT NULL,
  p_related_id          bigint   DEFAULT NULL,
  p_related_type        text     DEFAULT NULL,
  p_metadata            jsonb    DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant       uuid;
  v_wallet       wallets%ROWTYPE;
  v_existing_id  bigint;
  v_new_balance  numeric(20, 4);
  v_new_version  bigint;
  v_new_txn_id   bigint;
BEGIN
  v_tenant := current_setting('app.current_tenant')::uuid;
  IF v_tenant IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'TenantMismatch: GUC=% p_project_id=%', v_tenant, p_project_id
      USING ERRCODE = 'BC020';
  END IF;

  SELECT * INTO v_wallet
  FROM wallets
  WHERE id = p_wallet_id AND project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WalletNotFound: wallet_id=% project_id=%', p_wallet_id, p_project_id
      USING ERRCODE = 'BC021';
  END IF;

  IF v_wallet.currency_id IS DISTINCT FROM p_currency_id THEN
    RAISE EXCEPTION 'CurrencyMismatch: wallet_currency=% requested=%',
                    v_wallet.currency_id, p_currency_id
      USING ERRCODE = 'BC022';
  END IF;

  IF p_source_event_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM transactions
    WHERE wallet_id = p_wallet_id AND source_event_id = p_source_event_id;
    IF FOUND THEN
      RAISE LOG 'wallet_debit: idempotency_replay project=% wallet=% source_event=% prior_txn=%',
        p_project_id, p_wallet_id, p_source_event_id, v_existing_id;
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Compute and check before UPDATE so we raise BC010 (typed) instead of the
  -- table-CHECK 23514 which TS would have to dispatch on by constraint name.
  v_new_balance := v_wallet.balance - p_amount;

  IF v_new_balance < 0 AND NOT v_wallet.allow_negative_balance THEN
    RAISE EXCEPTION 'InsufficientFunds: wallet=% requested=% available=%',
                    p_wallet_id, p_amount, v_wallet.balance
      USING ERRCODE = 'BC010';
  END IF;

  v_new_version := v_wallet.version + 1;

  UPDATE wallets
  SET balance    = v_new_balance,
      version    = v_new_version,
      updated_at = NOW()
  WHERE id = p_wallet_id;

  -- transactions.amount: negative for debit per §3 ("positive for credit,
  -- negative for debit, NULL for non-currency").
  INSERT INTO transactions (
    project_id, wallet_id, player_id, kind, amount, currency_id,
    wallet_version, reason_code, source_event_id, idempotency_key_id,
    related_id, related_type, metadata
  ) VALUES (
    p_project_id, p_wallet_id, v_wallet.player_id, 'currency_debit', -p_amount, p_currency_id,
    v_new_version, p_reason_code, p_source_event_id, p_idempotency_key_id,
    p_related_id, p_related_type, p_metadata
  )
  RETURNING id INTO v_new_txn_id;

  RETURN v_new_txn_id;
END;
$$;--> statement-breakpoint

-- ---------- wallet_deidentify_player ----------
-- Per Amendment Part 2 A10 verbatim, with Part 1 A1 cascade applied
-- (SECURITY INVOKER + search_path hardening removed).
--
-- The function expects `app.current_tenant` GUC set to the player's project_id.
-- RLS on each updated table scopes the WHERE player_id = p_player_id clause
-- to that project. Calling without the GUC raises (current_setting one-arg
-- form). Calling with a wrong GUC silently updates 0 rows (the function returns
-- 0 from GET DIAGNOSTICS — caller-side check expected).

CREATE OR REPLACE FUNCTION wallet_deidentify_player(p_player_id uuid)
RETURNS integer
LANGUAGE plpgsql
-- search_path includes 'extensions' (Supabase convention for installed
-- extensions) and 'public' (vanilla Postgres default for pgcrypto). The
-- function calls hmac() / set_byte / get_byte / encode / convert_to — only
-- hmac is from pgcrypto; the rest are pg_catalog. Listed here for symbol
-- resolution, NOT for SECURITY DEFINER hardening (function is INVOKER per
-- Amendment Part 1 A1).
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  k_text       text  := current_setting('bokchoy.anon_secret', false);
  hash_full    bytea;
  hash_16      bytea;
  anon_id      uuid;
  rows_touched integer := 0;
BEGIN
  IF length(k_text) < 32 THEN
    RAISE EXCEPTION 'bokchoy.anon_secret missing or too short (need >= 32 chars)'
      USING ERRCODE = 'BC040';
  END IF;

  -- HMAC-SHA-256(p_player_id, anon_secret) → 32 bytes; project to UUIDv8 per
  -- RFC 9562 §5.8 (force version=8 in byte 6 hi nibble; force variant=10 in
  -- byte 8 top two bits). 122 effective-random bits in the data field;
  -- birthday collision N²/2¹²² ≈ 5×10⁻²⁰ at 1B players (functionally zero).
  hash_full := hmac(
    convert_to(p_player_id::text, 'UTF8'),
    convert_to(k_text,            'UTF8'),
    'sha256'
  );
  hash_16 := substring(hash_full FROM 1 FOR 16);
  hash_16 := set_byte(hash_16, 6, (get_byte(hash_16, 6) & 15) | 128);
  hash_16 := set_byte(hash_16, 8, (get_byte(hash_16, 8) & 63) | 128);
  anon_id := encode(hash_16, 'hex')::uuid;

  -- transactions: replace player_id, scrub PII metadata fields.
  UPDATE transactions
    SET player_id = anon_id,
        metadata  = metadata - 'ip' - 'device_id' - 'email_hash' - 'session_id'
    WHERE player_id = p_player_id;
  GET DIAGNOSTICS rows_touched = ROW_COUNT;

  -- loot_rolls: replace player_id, scrub seed_inputs (player_id is the seed).
  UPDATE loot_rolls
    SET player_id   = anon_id,
        seed_inputs = jsonb_set(seed_inputs, '{player_id}', to_jsonb(anon_id))
    WHERE player_id = p_player_id;

  -- iap_receipts: replace player_id, NULL out raw receipt, scrub validation.
  UPDATE iap_receipts
    SET player_id           = anon_id,
        raw_receipt         = NULL,
        validation_response = validation_response
                              - 'transaction_id'
                              - 'original_transaction_id'
                              - 'app_account_token'
    WHERE player_id = p_player_id;

  -- staged_jobs: scrub player-identifying fields across ALL statuses.
  UPDATE staged_jobs
    SET payload = payload - 'player_id' - 'email' - 'device_id'
    WHERE (payload->>'player_id')::uuid = p_player_id;

  RETURN rows_touched;
END;
$$;--> statement-breakpoint

-- ---------- GRANTs ----------
-- Under M1 (Amendment Part 1 A1), REVOKE FROM PUBLIC + GRANT EXECUTE TO
-- bokchoy_app is best-practice tidiness, NOT a load-bearing privilege barrier.
-- The discipline that mutations go through these functions is in the Slice 7
-- lint (scripts/check-direct-wallet-mutation.ts), not in GRANT.

REVOKE ALL ON FUNCTION wallet_credit(uuid, uuid, numeric, uuid, text, text, bigint, bigint, text, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION wallet_credit(uuid, uuid, numeric, uuid, text, text, bigint, bigint, text, jsonb) TO bokchoy_app;--> statement-breakpoint

REVOKE ALL ON FUNCTION wallet_debit(uuid, uuid, numeric, uuid, text, text, bigint, bigint, text, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION wallet_debit(uuid, uuid, numeric, uuid, text, text, bigint, bigint, text, jsonb) TO bokchoy_app;--> statement-breakpoint

REVOKE ALL ON FUNCTION wallet_deidentify_player(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION wallet_deidentify_player(uuid) TO bokchoy_app;
