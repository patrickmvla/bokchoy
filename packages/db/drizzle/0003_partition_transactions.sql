-- Convert transactions to declarative partitioning by RANGE (created_at).
-- Per [[wallet-mechanics]] §3 (composite PK already in place from slice 1) +
-- §7 (monthly partitioning + 24-month hot retention + S3 cold archive).
--
-- Postgres can't ALTER an existing table to add PARTITION BY — the only path is
-- DROP + recreate. This is acceptable in slice 3 ONLY because the table has zero
-- rows at MVP. If this migration ran against a populated table, data would be
-- lost; future schema changes to transactions must use ATTACH/DETACH PARTITION
-- mechanics, not drop-and-recreate.
--
-- Sister tables (loot_rolls, iap_receipts) are NOT partitioned in this slice.
-- The §5 UNIQUE constraints (player_id+banner+session+attempt for loot_rolls;
-- platform+platform_transaction_id for iap_receipts) are load-bearing for
-- idempotency correctness AND incompatible with PARTITION BY RANGE (created_at)
-- per Postgres' partition-key-must-appear-in-every-UNIQUE rule. Gap 8 in
-- .bocek/vault/wallet/gaps.md flags this for /design; sister-table retention
-- ships via cron DELETE in a future slice.
--
-- pg_partman extension setup is NOT included in this slice. 12 monthly
-- partitions (2026-05 through 2027-04) are pre-created manually for runway;
-- pg_partman.create_parent() lands in its own follow-on slice once the
-- automation requirements are concrete (premake count, retention cron, archive
-- destination).

DROP TABLE "transactions";--> statement-breakpoint

CREATE TABLE "transactions" (
  "id"                   bigserial   NOT NULL,
  "project_id"           uuid        NOT NULL,
  "wallet_id"            uuid,
  "player_id"            uuid        NOT NULL,
  "kind"                 text        NOT NULL,
  "amount"               numeric(20, 4),
  "currency_id"          uuid,
  "wallet_version"       bigint      NOT NULL,
  "item_id"              bigint,
  "item_quantity"        integer,
  "reason_code"          text        NOT NULL,
  "source_event_id"      text,
  "idempotency_key_id"   bigint,
  "related_id"           bigint,
  "related_type"         text,
  "metadata"             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "transactions_id_created_at_pk" PRIMARY KEY ("id", "created_at"),
  CONSTRAINT "transactions_kind_check" CHECK ("kind" IN ('currency_credit','currency_debit','item_grant','item_consume','compensation_grant')),
  CONSTRAINT "transactions_related_type_check" CHECK ("related_type" IS NULL OR "related_type" IN ('loot_roll','iap_receipt','compensation_grant')),
  CONSTRAINT "transactions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict,
  CONSTRAINT "transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict,
  CONSTRAINT "transactions_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE restrict,
  CONSTRAINT "transactions_idempotency_key_id_idempotency_keys_id_fk" FOREIGN KEY ("idempotency_key_id") REFERENCES "public"."idempotency_keys"("id") ON DELETE set null,
  CONSTRAINT "transactions_project_reason_code_fk" FOREIGN KEY ("project_id","reason_code") REFERENCES "public"."reason_codes"("project_id","code") ON DELETE restrict
) PARTITION BY RANGE ("created_at");--> statement-breakpoint

-- Indexes on the parent propagate to all current and future partitions.
CREATE INDEX "idx_transactions_wallet_lookup" ON "transactions" USING btree ("wallet_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_player_lookup" ON "transactions" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_related" ON "transactions" USING btree ("related_type","related_id") WHERE "related_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_transactions_project_recon" ON "transactions" USING btree ("project_id","currency_id","created_at") WHERE "wallet_id" IS NOT NULL;--> statement-breakpoint

-- RLS — re-enable on the parent. Per [[wallet-mechanics]] §8 + slice 2 baseline.
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "transactions" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("transactions"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint

-- GRANTs (drop dropped them; sequence is a fresh one owned by the new column).
GRANT SELECT, INSERT, UPDATE, DELETE ON "transactions" TO "bokchoy_app";--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "transactions_id_seq" TO "bokchoy_app";--> statement-breakpoint

-- Initial monthly partitions: 2026-05 through 2027-04 (12 months runway).
-- Half-open intervals match Postgres' RANGE partition convention.
CREATE TABLE "transactions_y2026m05" PARTITION OF "transactions" FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');--> statement-breakpoint
CREATE TABLE "transactions_y2026m06" PARTITION OF "transactions" FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');--> statement-breakpoint
CREATE TABLE "transactions_y2026m07" PARTITION OF "transactions" FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');--> statement-breakpoint
CREATE TABLE "transactions_y2026m08" PARTITION OF "transactions" FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');--> statement-breakpoint
CREATE TABLE "transactions_y2026m09" PARTITION OF "transactions" FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');--> statement-breakpoint
CREATE TABLE "transactions_y2026m10" PARTITION OF "transactions" FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');--> statement-breakpoint
CREATE TABLE "transactions_y2026m11" PARTITION OF "transactions" FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');--> statement-breakpoint
CREATE TABLE "transactions_y2026m12" PARTITION OF "transactions" FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');--> statement-breakpoint
CREATE TABLE "transactions_y2027m01" PARTITION OF "transactions" FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');--> statement-breakpoint
CREATE TABLE "transactions_y2027m02" PARTITION OF "transactions" FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');--> statement-breakpoint
CREATE TABLE "transactions_y2027m03" PARTITION OF "transactions" FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');--> statement-breakpoint
CREATE TABLE "transactions_y2027m04" PARTITION OF "transactions" FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
