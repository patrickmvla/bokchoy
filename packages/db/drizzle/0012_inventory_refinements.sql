-- Inventory refinements: persist non-stackable instance_ids in transactions.metadata
-- (closes D4 fragile 24h-replay heuristic); wallet_deidentify_player covers inventory rows
-- (closes D5 PII gap for inventory.player_id).

-- ---------- item_grant_by_external_id (replaces 0011 body) ----------
--
-- Two changes vs 0011:
--   1. Non-stackable grant writes the minted instance_ids into transactions.metadata
--      under key 'instance_ids' (jsonb array of uuid strings). Persisting on the audit
--      row removes the 24h-since-created_at replay heuristic — replays now read the
--      exact instance_ids regardless of how much time has passed.
--   2. Idempotency replay for non-stackable reads transactions.metadata->'instance_ids'
--      and reconstructs the uuid[] array for the return. No inventory-row query needed.

CREATE OR REPLACE FUNCTION item_grant_by_external_id(
  p_project_id          uuid,
  p_player_external_id  text,
  p_item_code           text,
  p_amount              integer,
  p_reason_code         text,
  p_source_event_id     text     DEFAULT NULL,
  p_idempotency_key_id  bigint   DEFAULT NULL,
  p_metadata            jsonb    DEFAULT '{}'::jsonb
) RETURNS TABLE (
  transaction_id  bigint,
  player_id       uuid,
  item_id         uuid,
  stackable       boolean,
  new_count       integer,
  instance_ids    uuid[]
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant         uuid;
  v_item_id        uuid;
  v_stackable      boolean;
  v_max_count      integer;
  v_player_id      uuid;
  v_new_count      integer;
  v_new_version    bigint;
  v_instance_ids   uuid[] := ARRAY[]::uuid[];
  v_new_instance   uuid;
  v_txn_id         bigint;
  v_existing_id    bigint;
  v_existing_meta  jsonb;
  v_replay_count   integer;
  v_iter           integer;
  v_audit_metadata jsonb;
BEGIN
  v_tenant := current_setting('app.current_tenant')::uuid;
  IF v_tenant IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'TenantMismatch: GUC=% p_project_id=%', v_tenant, p_project_id
      USING ERRCODE = 'BC020';
  END IF;

  SELECT id, stackable, max_count
  INTO v_item_id, v_stackable, v_max_count
  FROM items
  WHERE project_id = p_project_id AND code = p_item_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UnknownItem: code=% project_id=%', p_item_code, p_project_id
      USING ERRCODE = 'BC080';
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

  IF v_stackable THEN
    IF p_source_event_id IS NOT NULL THEN
      SELECT id INTO v_existing_id
      FROM transactions
      WHERE project_id = p_project_id
        AND item_id    = v_item_id
        AND player_id  = v_player_id
        AND source_event_id = p_source_event_id
        AND kind = 'item_grant';
      IF FOUND THEN
        RAISE LOG 'item_grant_by_external_id: idempotency_replay project=% item=% player=% source_event=% prior_txn=%',
          p_project_id, v_item_id, v_player_id, p_source_event_id, v_existing_id;
        SELECT count INTO v_replay_count
        FROM inventory
        WHERE project_id = p_project_id AND player_id = v_player_id AND item_id = v_item_id AND instance_id IS NULL;
        RETURN QUERY SELECT v_existing_id, v_player_id, v_item_id, true, v_replay_count, NULL::uuid[];
        RETURN;
      END IF;
    END IF;

    INSERT INTO inventory (project_id, player_id, item_id, count, version)
    VALUES (p_project_id, v_player_id, v_item_id, p_amount, 1)
    ON CONFLICT (project_id, player_id, item_id) WHERE instance_id IS NULL
    DO UPDATE SET count   = inventory.count + p_amount,
                  version = inventory.version + 1,
                  updated_at = NOW()
    RETURNING count, version INTO v_new_count, v_new_version;

    IF v_max_count IS NOT NULL AND v_new_count > v_max_count THEN
      RAISE EXCEPTION 'InventoryOverflow: current=% requested=% max=% available_capacity=%',
                      (v_new_count - p_amount), p_amount, v_max_count, (v_max_count - (v_new_count - p_amount))
        USING ERRCODE = 'BC081';
    END IF;

    v_audit_metadata := p_metadata;

  ELSE
    -- (a) Non-stackable replay reads instance_ids from transactions.metadata.
    -- Removes the 24h created_at heuristic that 0011 used.
    IF p_source_event_id IS NOT NULL THEN
      SELECT id, metadata INTO v_existing_id, v_existing_meta
      FROM transactions
      WHERE project_id = p_project_id
        AND item_id    = v_item_id
        AND player_id  = v_player_id
        AND source_event_id = p_source_event_id
        AND kind = 'item_grant';
      IF FOUND THEN
        RAISE LOG 'item_grant_by_external_id: idempotency_replay (non-stackable) project=% item=% player=% source_event=% prior_txn=%',
          p_project_id, v_item_id, v_player_id, p_source_event_id, v_existing_id;
        SELECT array_agg(elem::uuid) INTO v_instance_ids
        FROM jsonb_array_elements_text(COALESCE(v_existing_meta->'instance_ids', '[]'::jsonb)) AS elem;
        IF v_instance_ids IS NULL THEN
          v_instance_ids := ARRAY[]::uuid[];
        END IF;
        RETURN QUERY SELECT v_existing_id, v_player_id, v_item_id, false, NULL::integer, v_instance_ids;
        RETURN;
      END IF;
    END IF;

    FOR v_iter IN 1..p_amount LOOP
      INSERT INTO inventory (project_id, player_id, item_id, instance_id, count, version)
      VALUES (p_project_id, v_player_id, v_item_id, gen_random_uuid(), 1, 0)
      RETURNING instance_id INTO v_new_instance;
      v_instance_ids := array_append(v_instance_ids, v_new_instance);
    END LOOP;

    v_new_count := NULL;
    -- (b) Persist minted instance_ids on the audit row so future replays read them
    -- directly rather than scanning inventory by created_at heuristic.
    v_audit_metadata := p_metadata || jsonb_build_object('instance_ids', to_jsonb(v_instance_ids));
  END IF;

  INSERT INTO transactions (
    project_id, wallet_id, player_id, kind, amount, currency_id, wallet_version,
    item_id, item_quantity, reason_code, source_event_id, idempotency_key_id, metadata
  ) VALUES (
    p_project_id, NULL, v_player_id, 'item_grant', NULL, NULL, 0,
    v_item_id, p_amount, p_reason_code, p_source_event_id, p_idempotency_key_id, v_audit_metadata
  )
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_txn_id, v_player_id, v_item_id, v_stackable,
                      v_new_count, CASE WHEN v_stackable THEN NULL::uuid[] ELSE v_instance_ids END;
END;
$$;--> statement-breakpoint

-- ---------- wallet_deidentify_player (replaces 0004 body) ----------
--
-- One change vs 0004: adds an UPDATE inventory clause that replaces player_id with
-- anon_id for the deidentified player. Without this, inventory rows leak the original
-- player_id even after deidentification — closes D5.
--
-- Also scrubs inventory.properties of standard PII keys ('player_name', 'email')
-- the same way transactions.metadata is scrubbed.

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
  rows_touched integer := 0;
BEGIN
  IF length(k_text) < 32 THEN
    RAISE EXCEPTION 'bokchoy.anon_secret missing or too short (need >= 32 chars)'
      USING ERRCODE = 'BC040';
  END IF;

  hash_full := hmac(
    convert_to(p_player_id::text, 'UTF8'),
    convert_to(k_text,            'UTF8'),
    'sha256'
  );
  hash_16 := substring(hash_full FROM 1 FOR 16);
  hash_16 := set_byte(hash_16, 6, (get_byte(hash_16, 6) & 15) | 128);
  hash_16 := set_byte(hash_16, 8, (get_byte(hash_16, 8) & 63) | 128);
  anon_id := encode(hash_16, 'hex')::uuid;

  UPDATE transactions
    SET player_id = anon_id,
        metadata  = metadata - 'ip' - 'device_id' - 'email_hash' - 'session_id'
    WHERE player_id = p_player_id;
  GET DIAGNOSTICS rows_touched = ROW_COUNT;

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

  -- D5: inventory rows carry player_id; rewrite alongside transactions/loot_rolls/iap_receipts.
  UPDATE inventory
    SET player_id  = anon_id,
        properties = properties - 'player_name' - 'email'
    WHERE player_id = p_player_id;

  UPDATE staged_jobs
    SET payload = payload - 'player_id' - 'email' - 'device_id'
    WHERE (payload->>'player_id')::uuid = p_player_id;

  RETURN rows_touched;
END;
$$;
