CREATE TABLE "offer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_items_quantity_check" CHECK ("offer_items"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "offer_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "offer_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"currency_id" uuid NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_prices_amount_check" CHECK ("offer_prices"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "offer_prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_code_check" CHECK ("offers"."code" ~ '^[A-Za-z0-9_]{1,64}$')
);
--> statement-breakpoint
ALTER TABLE "offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_prices" ADD CONSTRAINT "offer_prices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_prices" ADD CONSTRAINT "offer_prices_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_prices" ADD CONSTRAINT "offer_prices_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_items_offer_item_unique" ON "offer_items" USING btree ("project_id","offer_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_offer_items_offer" ON "offer_items" USING btree ("project_id","offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_prices_offer_currency_unique" ON "offer_prices" USING btree ("project_id","offer_id","currency_id");--> statement-breakpoint
CREATE INDEX "idx_offer_prices_offer" ON "offer_prices" USING btree ("project_id","offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_project_id_code_unique" ON "offers" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "idx_offers_project" ON "offers" USING btree ("project_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "offer_items" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("offer_items"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "offer_prices" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("offer_prices"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "offers" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("offers"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint

-- ---------- purchase_offer_by_external_id ----------
-- Shop primitive per [[shop/shop-contract]]. Auto-generated table DDL above;
-- SQL function appended manually (matches 0010/0011 pattern).
--
-- Composes the already-shipped wallet_debit_by_external_id + item_grant_by_external_id
-- (pick (b): calls, not inlines) in ONE transaction: resolve offer + price, debit the
-- pay-with currency, grant each offer item. Atomic by construction — an unhandled
-- BC010 (InsufficientFunds) from the debit or BC081 (InventoryOverflow) from any grant
-- propagates and rolls back the whole purchase. Partial fulfillment is unrepresentable
-- per [[shop/shop-contract]] (iii). reason_codes shop_purchase_cost / shop_purchase_grant
-- are project-bootstrapped (0005). The shared metadata.purchase_id stamped on every
-- ledger row makes the 1 debit + N grants reconstructable as one purchase (L2, (iv)).
-- Idempotency is owned by the HTTP idempotencyMiddleware, so source_event_id is NULL
-- here (the middleware gates replay before this function ever re-runs).

CREATE OR REPLACE FUNCTION purchase_offer_by_external_id(
  p_project_id              uuid,
  p_player_external_id      text,
  p_offer_code              text,
  p_pay_with_currency_code  text     DEFAULT NULL,
  p_idempotency_key_id      bigint   DEFAULT NULL,
  p_metadata                jsonb    DEFAULT '{}'::jsonb
) RETURNS TABLE (
  purchase_id         uuid,
  paid_currency_code  text,
  paid_amount         numeric,
  granted             jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant       uuid;
  v_offer_id     uuid;
  v_active       boolean;
  v_item_count   integer;
  v_price_count  integer;
  v_pay_code     text;
  v_amount       numeric(20,4);
  v_purchase_id  uuid := gen_random_uuid();
  v_meta         jsonb;
  v_item         record;
  v_grant        record;
  v_granted      jsonb := '[]'::jsonb;
BEGIN
  -- (1) Tenant context check (defense-in-depth on top of RLS).
  v_tenant := current_setting('app.current_tenant')::uuid;
  IF v_tenant IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'TenantMismatch: GUC=% p_project_id=%', v_tenant, p_project_id
      USING ERRCODE = 'BC020';
  END IF;

  -- (2) Resolve offer + active flag. BC090 UnknownOffer / BC091 OfferInactive.
  SELECT id, active INTO v_offer_id, v_active
  FROM offers
  WHERE project_id = p_project_id AND code = p_offer_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UnknownOffer: code=% project_id=%', p_offer_code, p_project_id
      USING ERRCODE = 'BC090';
  END IF;

  IF NOT v_active THEN
    RAISE EXCEPTION 'OfferInactive: code=% project_id=%', p_offer_code, p_project_id
      USING ERRCODE = 'BC091';
  END IF;

  -- (2b) Empty-offer backstop: an active offer with zero items would debit + grant nothing.
  -- Editor activation-invariant (active => >=1 offer_items) is the primary prevention; this
  -- catches direct-insert / editor-bug per [[shop/contract-reconciliation-2026-05-21]] D1.
  SELECT count(*) INTO v_item_count
  FROM offer_items
  WHERE project_id = p_project_id AND offer_id = v_offer_id;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'EmptyOffer: code=% project_id=%', p_offer_code, p_project_id
      USING ERRCODE = 'BC093';
  END IF;

  -- (3) Resolve the pay-with price. payWith inferred when the offer has exactly one
  -- price; BC092 when ambiguous (>1 and none named) or when the named currency is not
  -- in the offer's price-set. Returns the canonical currency code + the server-side amount.
  IF p_pay_with_currency_code IS NULL THEN
    SELECT count(*) INTO v_price_count
    FROM offer_prices
    WHERE project_id = p_project_id AND offer_id = v_offer_id;

    IF v_price_count <> 1 THEN
      RAISE EXCEPTION 'InvalidPaymentCurrency: payWith required (offer has % price options)', v_price_count
        USING ERRCODE = 'BC092';
    END IF;

    SELECT c.code, op.amount INTO v_pay_code, v_amount
    FROM offer_prices op
    JOIN currencies c ON c.id = op.currency_id
    WHERE op.project_id = p_project_id AND op.offer_id = v_offer_id;
  ELSE
    SELECT c.code, op.amount INTO v_pay_code, v_amount
    FROM offer_prices op
    JOIN currencies c ON c.id = op.currency_id
    WHERE op.project_id = p_project_id
      AND op.offer_id = v_offer_id
      AND c.code = p_pay_with_currency_code;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'InvalidPaymentCurrency: currency=% not accepted for offer=%',
                      p_pay_with_currency_code, p_offer_code
        USING ERRCODE = 'BC092';
    END IF;
  END IF;

  -- (4) Stamp every ledger row with the shared purchase_id + offer_code.
  v_meta := p_metadata || jsonb_build_object('purchase_id', v_purchase_id, 'offer_code', p_offer_code);

  -- (5) Debit. Reuses wallet_debit_by_external_id (lazy-creates wallet, FOR UPDATE lock,
  -- raises BC010 InsufficientFunds when unaffordable). source_event_id NULL (middleware owns idempotency).
  PERFORM wallet_debit_by_external_id(
    p_project_id, p_player_external_id, v_pay_code, v_amount,
    'shop_purchase_cost', NULL, p_idempotency_key_id, NULL, NULL, v_meta
  );

  -- (6) Grant each offer item. Reuses item_grant_by_external_id (raises BC081 on overflow
  -- → rolls back the whole purchase). ORDER BY code for deterministic grant order + output.
  FOR v_item IN
    SELECT i.code AS item_code, oi.quantity AS quantity
    FROM offer_items oi
    JOIN items i ON i.id = oi.item_id
    WHERE oi.project_id = p_project_id AND oi.offer_id = v_offer_id
    ORDER BY i.code
  LOOP
    SELECT * INTO v_grant
    FROM item_grant_by_external_id(
      p_project_id, p_player_external_id, v_item.item_code, v_item.quantity,
      'shop_purchase_grant', NULL, p_idempotency_key_id, v_meta
    );

    v_granted := v_granted || jsonb_build_object(
      'itemCode',    v_item.item_code,
      'quantity',    v_item.quantity,
      'stackable',   v_grant.stackable,
      'newCount',    v_grant.new_count,
      'instanceIds', to_jsonb(v_grant.instance_ids)
    );
  END LOOP;

  RETURN QUERY SELECT v_purchase_id, v_pay_code, v_amount, v_granted;
END;
$$;--> statement-breakpoint

-- ---------- GRANTs ----------
-- M1 convention: discipline is in scripts/check-direct-wallet-mutation.ts; REVOKE/GRANT is tidiness.

REVOKE ALL ON FUNCTION purchase_offer_by_external_id(uuid, text, text, text, bigint, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION purchase_offer_by_external_id(uuid, text, text, text, bigint, jsonb) TO bokchoy_app;