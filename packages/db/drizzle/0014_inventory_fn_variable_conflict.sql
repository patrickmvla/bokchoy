-- ---------- item_grant_by_external_id / item_consume_by_external_id — variable_conflict fix ----------
-- Bug surfaced by the first live run of scripts/smoke-functions.ts (no live DB until now):
--   "column reference 'stackable' is ambiguous" at item_grant_by_external_id.
-- Root cause: the RETURNS TABLE output columns (transaction_id/player_id/item_id/stackable/
-- new_count/instance_ids|consumed_instance_id) are in-scope as PL/pgSQL variables inside the body,
-- so every unqualified reference to a same-named TABLE column (items.stackable, inventory.player_id,
-- transactions.item_id, ...) is ambiguous under the default plpgsql.variable_conflict = error.
-- Both functions hit this across ~18 read sites (SELECT lists + WHERE clauses).
-- Fix: `#variable_conflict use_column` — when an identifier in a SQL statement could be a variable
-- OR a column, resolve to the COLUMN. Verified safe: NO SQL statement in either function references a
-- bare output-column name MEANING the variable (every RETURN QUERY / SET / VALUES uses v_-/p_-prefixed
-- locals or qualified columns), so use_column resolves all ambiguities to the intended column and
-- changes no behavior. Bodies are otherwise byte-identical to 0012 (grant) / 0011 (consume).
-- 0011/0012 are already shipped — CREATE OR REPLACE in a new migration, never edit in place.

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
#variable_conflict use_column
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

CREATE OR REPLACE FUNCTION item_consume_by_external_id(
  p_project_id          uuid,
  p_player_external_id  text,
  p_item_code           text,
  p_amount              integer,
  p_reason_code         text,
  p_instance_id         uuid     DEFAULT NULL,
  p_source_event_id     text     DEFAULT NULL,
  p_idempotency_key_id  bigint   DEFAULT NULL,
  p_metadata            jsonb    DEFAULT '{}'::jsonb
) RETURNS TABLE (
  transaction_id  bigint,
  player_id       uuid,
  item_id         uuid,
  stackable       boolean,
  new_count       integer,
  consumed_instance_id uuid
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_tenant         uuid;
  v_item_id        uuid;
  v_stackable      boolean;
  v_player_id      uuid;
  v_current_count  integer;
  v_new_count      integer;
  v_new_version    bigint;
  v_txn_id         bigint;
  v_existing_id    bigint;
  v_owned_count    integer;
BEGIN
  -- (1) Tenant context check.
  v_tenant := current_setting('app.current_tenant')::uuid;
  IF v_tenant IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'TenantMismatch: GUC=% p_project_id=%', v_tenant, p_project_id
      USING ERRCODE = 'BC020';
  END IF;

  -- (2) Resolve item code → id + stackable.
  SELECT id, stackable INTO v_item_id, v_stackable
  FROM items
  WHERE project_id = p_project_id AND code = p_item_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UnknownItem: code=% project_id=%', p_item_code, p_project_id
      USING ERRCODE = 'BC080';
  END IF;

  -- (3) Resolve player. Consume does NOT lazy-create — consuming from a player
  -- who has never been credited is by definition InsufficientInventory.
  SELECT id INTO v_player_id
  FROM players
  WHERE project_id = p_project_id AND external_id = p_player_external_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'InsufficientInventory: player=% has no inventory of item=%',
                    p_player_external_id, p_item_code
      USING ERRCODE = 'BC082';
  END IF;

  -- (4) Branch on stackable.
  IF v_stackable THEN
    SELECT count INTO v_current_count
    FROM inventory
    WHERE project_id = p_project_id
      AND player_id  = v_player_id
      AND item_id    = v_item_id
      AND instance_id IS NULL
    FOR UPDATE;

    IF NOT FOUND OR v_current_count < p_amount THEN
      RAISE EXCEPTION 'InsufficientInventory: current=% requested=%',
                      COALESCE(v_current_count, 0), p_amount
        USING ERRCODE = 'BC082';
    END IF;

    -- Idempotency replay after lock.
    IF p_source_event_id IS NOT NULL THEN
      SELECT id INTO v_existing_id
      FROM transactions
      WHERE project_id = p_project_id
        AND item_id    = v_item_id
        AND player_id  = v_player_id
        AND source_event_id = p_source_event_id
        AND kind = 'item_consume';
      IF FOUND THEN
        RAISE LOG 'item_consume_by_external_id: idempotency_replay project=% item=% player=% source_event=% prior_txn=%',
          p_project_id, v_item_id, v_player_id, p_source_event_id, v_existing_id;
        RETURN QUERY SELECT v_existing_id, v_player_id, v_item_id, true, v_current_count, NULL::uuid;
        RETURN;
      END IF;
    END IF;

    v_new_count := v_current_count - p_amount;

    UPDATE inventory
    SET count   = v_new_count,
        version = version + 1,
        updated_at = NOW()
    WHERE project_id = p_project_id AND player_id = v_player_id AND item_id = v_item_id AND instance_id IS NULL
    RETURNING version INTO v_new_version;

  ELSE
    -- Non-stackable: p_instance_id required; p_amount must be 1.
    IF p_instance_id IS NULL THEN
      RAISE EXCEPTION 'InsufficientInventory: non-stackable consume requires instance_id'
        USING ERRCODE = 'BC082';
    END IF;

    SELECT count INTO v_owned_count
    FROM inventory
    WHERE project_id = p_project_id
      AND player_id  = v_player_id
      AND item_id    = v_item_id
      AND instance_id = p_instance_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'InsufficientInventory: instance=% not owned by player=% for item=%',
                      p_instance_id, p_player_external_id, p_item_code
        USING ERRCODE = 'BC082';
    END IF;

    -- Idempotency replay for non-stackable.
    IF p_source_event_id IS NOT NULL THEN
      SELECT id INTO v_existing_id
      FROM transactions
      WHERE project_id = p_project_id
        AND item_id    = v_item_id
        AND player_id  = v_player_id
        AND source_event_id = p_source_event_id
        AND kind = 'item_consume';
      IF FOUND THEN
        RAISE LOG 'item_consume_by_external_id: idempotency_replay (non-stackable) project=% item=% player=% source_event=% prior_txn=%',
          p_project_id, v_item_id, v_player_id, p_source_event_id, v_existing_id;
        RETURN QUERY SELECT v_existing_id, v_player_id, v_item_id, false, NULL::integer, p_instance_id;
        RETURN;
      END IF;
    END IF;

    DELETE FROM inventory
    WHERE project_id = p_project_id AND player_id = v_player_id AND item_id = v_item_id AND instance_id = p_instance_id;

    v_new_count := NULL;
  END IF;

  -- (5) Insert audit row.
  INSERT INTO transactions (
    project_id, wallet_id, player_id, kind, amount, currency_id, wallet_version,
    item_id, item_quantity, reason_code, source_event_id, idempotency_key_id, metadata
  ) VALUES (
    p_project_id, NULL, v_player_id, 'item_consume', NULL, NULL, 0,
    v_item_id, p_amount, p_reason_code, p_source_event_id, p_idempotency_key_id, p_metadata
  )
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_txn_id, v_player_id, v_item_id, v_stackable,
                      v_new_count, p_instance_id;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION item_grant_by_external_id(uuid, text, text, integer, text, text, bigint, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION item_grant_by_external_id(uuid, text, text, integer, text, text, bigint, jsonb) TO bokchoy_app;--> statement-breakpoint
REVOKE ALL ON FUNCTION item_consume_by_external_id(uuid, text, text, integer, text, uuid, text, bigint, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION item_consume_by_external_id(uuid, text, text, integer, text, uuid, text, bigint, jsonb) TO bokchoy_app;
