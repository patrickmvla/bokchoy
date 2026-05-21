-- ---------- wallet_deidentify_player → full player erasure (anonymize-retain) ----------
-- Per [[wallet/deidentify-full-erasure]] (resolves GAP 12 / discovery bug #6). The 0012 function
-- only anonymized the audit trail (transactions/loot_rolls/iap_receipts) + (D5) inventory, but
-- NEVER touched the players identity row or wallets — so it didn't actually de-identify the player,
-- and the D5 inventory repoint to a non-existent anon_id violated inventory's players FK.
--
-- This redesign extends the §6 deterministic-anon_id + key-destruction model uniformly to live state:
-- end state = original player_id in NO table; anon_id (HMAC→UUIDv8, unchanged) the sole identifier
-- everywhere; all players PII scrubbed (anon row carries only id/project_id/created_at). Live wallets
-- + inventory are ANONYMIZE-RETAINED (repointed, not deleted) per the human's live-state decision.
--
-- FK mechanic (path B — insert-anon-row → repoint → delete-original): all 4 players.id FKs
-- (wallets, inventory, loot_rolls, iap_receipts) are RESTRICT, so the anon identity must exist
-- BEFORE any FK'd repoint, and the original row is deletable only AFTER all 4 are repointed. Path B
-- needs no FK DDL (RESTRICT posture preserved). No variable_conflict risk: RETURNS integer (no
-- RETURNS TABLE output-column shadowing). SECURITY INVOKER + pinned search_path preserved from 0012.
-- 0012 is shipped — CREATE OR REPLACE in a new migration.

CREATE OR REPLACE FUNCTION wallet_deidentify_player(p_player_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  k_text       text  := current_setting('bokchoy.anon_secret', false);
  hash_full    bytea;
  hash_16      bytea;
  anon_id      uuid;
  v_project_id uuid;
  v_created_at timestamptz;
  rows_touched integer := 0;
BEGIN
  IF length(k_text) < 32 THEN
    RAISE EXCEPTION 'bokchoy.anon_secret missing or too short (need >= 32 chars)'
      USING ERRCODE = 'BC040';
  END IF;

  -- Deterministic anon_id: HMAC-SHA-256(player_id, secret) → 16-byte UUIDv8 (unchanged from 0012/§6 A10).
  hash_full := hmac(
    convert_to(p_player_id::text, 'UTF8'),
    convert_to(k_text,            'UTF8'),
    'sha256'
  );
  hash_16 := substring(hash_full FROM 1 FOR 16);
  hash_16 := set_byte(hash_16, 6, (get_byte(hash_16, 6) & 15) | 128);
  hash_16 := set_byte(hash_16, 8, (get_byte(hash_16, 8) & 63) | 128);
  anon_id := encode(hash_16, 'hex')::uuid;

  -- (1) Materialize the anon identity BEFORE repointing the RESTRICT FK tables.
  -- Copy only structural columns; all PII (email/external_id/password_hash/last_login_at/locale/
  -- under_13) is left NULL = scrubbed. Idempotent: re-run on an already-erased player no-ops.
  SELECT project_id, created_at INTO v_project_id, v_created_at
  FROM players WHERE id = p_player_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  INSERT INTO players (id, project_id, created_at)
  VALUES (anon_id, v_project_id, v_created_at)
  ON CONFLICT (id) DO NOTHING;

  -- (2) Repoint every players.id FK + the no-FK audit log to anon_id (+ scrub PII payloads).
  UPDATE wallets
    SET player_id = anon_id
    WHERE player_id = p_player_id;

  UPDATE inventory
    SET player_id  = anon_id,
        properties = properties - 'player_name' - 'email'
    WHERE player_id = p_player_id;

  UPDATE loot_rolls
    SET player_id   = anon_id,
        seed_inputs = jsonb_set(seed_inputs, '{player_id}', to_jsonb(anon_id))
    WHERE player_id = p_player_id;

  UPDATE iap_receipts
    SET player_id           = anon_id,
        raw_receipt         = NULL,
        validation_response = validation_response
                              - 'transaction_id'
                              - 'original_transaction_id'
                              - 'app_account_token'
    WHERE player_id = p_player_id;

  UPDATE transactions
    SET player_id = anon_id,
        metadata  = metadata - 'ip' - 'device_id' - 'email_hash' - 'session_id'
    WHERE player_id = p_player_id;
  GET DIAGNOSTICS rows_touched = ROW_COUNT;  -- preserves the prior return semantics (audit-row count)

  UPDATE staged_jobs
    SET payload = payload - 'player_id' - 'email' - 'device_id'
    WHERE (payload->>'player_id')::uuid = p_player_id;

  -- (3) Delete the original identity — now unreferenced (all 4 RESTRICT FKs repointed).
  DELETE FROM players WHERE id = p_player_id;

  RETURN rows_touched;
END;
$$;
