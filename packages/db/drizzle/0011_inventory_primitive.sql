-- Inventory primitive per [[inventory/inventory-contract]] M-A item model.
-- Auto-generated table DDL + RLS below; SQL functions appended manually (matches 0010 pattern).
-- BC080 UnknownItem, BC081 InventoryOverflow, BC082 InsufficientInventory.

CREATE TABLE "inventory" (
	"id" bigserial NOT NULL,
	"project_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"instance_id" uuid,
	"count" integer DEFAULT 1 NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_id_created_at_pk" PRIMARY KEY("id","created_at"),
	CONSTRAINT "inventory_count_check" CHECK ("inventory"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"stackable" boolean DEFAULT true NOT NULL,
	"max_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_code_check" CHECK ("items"."code" ~ '^[A-Za-z0-9_]{1,64}$'),
	CONSTRAINT "items_max_count_check" CHECK ("items"."max_count" IS NULL OR "items"."max_count" > 0),
	CONSTRAINT "items_max_count_consistency_check" CHECK ("items"."stackable" OR "items"."max_count" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_stackable_unique" ON "inventory" USING btree ("project_id","player_id","item_id") WHERE "inventory"."instance_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_instance_unique" ON "inventory" USING btree ("project_id","player_id","instance_id") WHERE "inventory"."instance_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_inventory_player" ON "inventory" USING btree ("project_id","player_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_item" ON "inventory" USING btree ("project_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_project_id_code_unique" ON "items" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "idx_items_project" ON "items" USING btree ("project_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inventory" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("inventory"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "items" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("items"."project_id" = current_setting('app.current_tenant')::uuid);
--> statement-breakpoint

-- ---------- item_grant_by_external_id ----------

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
  v_iter           integer;
BEGIN
  -- (1) Tenant context check (defense-in-depth on top of RLS).
  v_tenant := current_setting('app.current_tenant')::uuid;
  IF v_tenant IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'TenantMismatch: GUC=% p_project_id=%', v_tenant, p_project_id
      USING ERRCODE = 'BC020';
  END IF;

  -- (2) Resolve item code → id + read stackable + max_count in one lookup.
  SELECT id, stackable, max_count
  INTO v_item_id, v_stackable, v_max_count
  FROM items
  WHERE project_id = p_project_id AND code = p_item_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UnknownItem: code=% project_id=%', p_item_code, p_project_id
      USING ERRCODE = 'BC080';
  END IF;

  -- (3) Lazy-create player. Same ON CONFLICT pattern as wallet_credit_by_external_id.
  INSERT INTO players (project_id, external_id)
  VALUES (p_project_id, p_player_external_id)
  ON CONFLICT (project_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_player_id;

  IF v_player_id IS NULL THEN
    SELECT id INTO v_player_id
    FROM players
    WHERE project_id = p_project_id AND external_id = p_player_external_id;
  END IF;

  -- (4) Branch on stackable.
  IF v_stackable THEN
    -- (4a) Idempotency replay check first (read-only; safe regardless of row existence).
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
        SELECT count INTO v_new_count
        FROM inventory
        WHERE project_id = p_project_id AND player_id = v_player_id AND item_id = v_item_id AND instance_id IS NULL;
        RETURN QUERY SELECT v_existing_id, v_player_id, v_item_id, true, v_new_count, NULL::uuid[];
        RETURN;
      END IF;
    END IF;

    -- (4b) Upsert. Row lock acquired atomically via partial UNIQUE; version increment
    -- makes optimistic-concurrency contract visible.
    INSERT INTO inventory (project_id, player_id, item_id, count, version)
    VALUES (p_project_id, v_player_id, v_item_id, p_amount, 1)
    ON CONFLICT (project_id, player_id, item_id) WHERE instance_id IS NULL
    DO UPDATE SET count   = inventory.count + p_amount,
                  version = inventory.version + 1,
                  updated_at = NOW()
    RETURNING count, version INTO v_new_count, v_new_version;

    -- (4c) Post-upsert overflow check. Pre-check would race: SELECT FOR UPDATE on a
    -- non-existent row takes no lock, so two concurrent grants could both pass a
    -- pre-check and the second UPSERT-DO-UPDATE would breach max_count silently.
    -- Post-check is race-safe; RAISE rolls back the increment in the enclosing txn.
    IF v_max_count IS NOT NULL AND v_new_count > v_max_count THEN
      RAISE EXCEPTION 'InventoryOverflow: current=% requested=% max=% available_capacity=%',
                      (v_new_count - p_amount), p_amount, v_max_count, (v_max_count - (v_new_count - p_amount))
        USING ERRCODE = 'BC081';
    END IF;

  ELSE
    -- (4d) Non-stackable branch. Insert p_amount rows, one per granted unit.
    -- Idempotency replay: if prior call with same source_event_id exists, return the
    -- prior instance_ids rather than minting new ones.
    IF p_source_event_id IS NOT NULL THEN
      SELECT id INTO v_existing_id
      FROM transactions
      WHERE project_id = p_project_id
        AND item_id    = v_item_id
        AND player_id  = v_player_id
        AND source_event_id = p_source_event_id
        AND kind = 'item_grant';
      IF FOUND THEN
        RAISE LOG 'item_grant_by_external_id: idempotency_replay (non-stackable) project=% item=% player=% source_event=% prior_txn=%',
          p_project_id, v_item_id, v_player_id, p_source_event_id, v_existing_id;
        SELECT array_agg(instance_id) INTO v_instance_ids
        FROM inventory
        WHERE project_id = p_project_id AND player_id = v_player_id AND item_id = v_item_id AND instance_id IS NOT NULL
          AND created_at >= NOW() - INTERVAL '24 hours';
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
  END IF;

  -- (5) Insert audit row. wallet_id NULL for item-only rows per wallet.ts:158 nullability.
  INSERT INTO transactions (
    project_id, wallet_id, player_id, kind, amount, currency_id, wallet_version,
    item_id, item_quantity, reason_code, source_event_id, idempotency_key_id, metadata
  ) VALUES (
    p_project_id, NULL, v_player_id, 'item_grant', NULL, NULL, 0,
    v_item_id, p_amount, p_reason_code, p_source_event_id, p_idempotency_key_id, p_metadata
  )
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_txn_id, v_player_id, v_item_id, v_stackable,
                      v_new_count, CASE WHEN v_stackable THEN NULL::uuid[] ELSE v_instance_ids END;
END;
$$;--> statement-breakpoint

-- ---------- item_consume_by_external_id ----------
--
-- Stackable: subtract p_amount from count; raise BC082 if current < p_amount.
-- Non-stackable: validate p_instance_id belongs to (project, player, item); DELETE the row.
-- The historical record of consumption lives in transactions (kind='item_consume'),
-- not in the inventory row — inventory represents current ownership state only.

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

-- ---------- GRANTs ----------
-- M1 convention per Part 1 A1: discipline is in scripts/check-direct-wallet-mutation.ts,
-- not in privilege barriers. REVOKE/GRANT is tidiness.

REVOKE ALL ON FUNCTION item_grant_by_external_id(uuid, text, text, integer, text, text, bigint, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION item_grant_by_external_id(uuid, text, text, integer, text, text, bigint, jsonb) TO bokchoy_app;--> statement-breakpoint

REVOKE ALL ON FUNCTION item_consume_by_external_id(uuid, text, text, integer, text, uuid, text, bigint, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION item_consume_by_external_id(uuid, text, text, integer, text, uuid, text, bigint, jsonb) TO bokchoy_app;
