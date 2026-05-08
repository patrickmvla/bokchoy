CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"email" text,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"locale" text,
	"under_13" boolean
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_child_directed" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_status_check" CHECK ("projects"."status" IN ('active', 'paused', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"decimals" smallint DEFAULT 0 NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"is_tradable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_code_check" CHECK ("currencies"."code" ~ '^[A-Za-z0-9_]{1,16}$'),
	CONSTRAINT "currencies_decimals_check" CHECK ("currencies"."decimals" BETWEEN 0 AND 8)
);
--> statement-breakpoint
CREATE TABLE "iap_receipts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"raw_receipt" text,
	"platform_transaction_id" text NOT NULL,
	"validated_at" timestamp with time zone,
	"validation_response" jsonb,
	"idempotency_key_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iap_receipts_platform_check" CHECK ("iap_receipts"."platform" IN ('apple','google','steam'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_method" text NOT NULL,
	"request_path" text NOT NULL,
	"request_params" jsonb NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"locked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_key_length_check" CHECK (char_length("idempotency_keys"."idempotency_key") <= 255)
);
--> statement-breakpoint
CREATE TABLE "loot_rolls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"banner_id" bigint NOT NULL,
	"pull_session_id" text NOT NULL,
	"attempt_number" integer DEFAULT 0 NOT NULL,
	"pre_state" jsonb NOT NULL,
	"post_state" jsonb NOT NULL,
	"seed_inputs" jsonb NOT NULL,
	"rng_output" jsonb NOT NULL,
	"items_granted" jsonb NOT NULL,
	"idempotency_key_id" bigint,
	"rng_key_id" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reason_codes" (
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"category" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reason_codes_project_id_code_pk" PRIMARY KEY("project_id","code"),
	CONSTRAINT "reason_codes_code_check" CHECK ("reason_codes"."code" ~ '^[a-z][a-z0-9_]{0,63}$'),
	CONSTRAINT "reason_codes_category_check" CHECK ("reason_codes"."category" IN ('faucet', 'drain', 'transfer', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "staged_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"idempotency_key_id" bigint,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" smallint DEFAULT 0 NOT NULL,
	"max_attempts" smallint NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staged_jobs_kind_check" CHECK ("staged_jobs"."kind" IN ('webhook_fire','mailbox_push','iap_receipt_validate','analytics_event','idempotency_reaper')),
	CONSTRAINT "staged_jobs_status_check" CHECK ("staged_jobs"."status" IN ('pending','running','completed','failed','dead'))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" bigserial NOT NULL,
	"project_id" uuid NOT NULL,
	"wallet_id" uuid,
	"player_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(20, 4),
	"currency_id" uuid,
	"wallet_version" bigint NOT NULL,
	"item_id" bigint,
	"item_quantity" integer,
	"reason_code" text NOT NULL,
	"source_event_id" text,
	"idempotency_key_id" bigint,
	"related_id" bigint,
	"related_type" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_id_created_at_pk" PRIMARY KEY("id","created_at"),
	CONSTRAINT "transactions_kind_check" CHECK ("transactions"."kind" IN ('currency_credit','currency_debit','item_grant','item_consume','compensation_grant')),
	CONSTRAINT "transactions_related_type_check" CHECK ("transactions"."related_type" IS NULL OR "transactions"."related_type" IN ('loot_roll','iap_receipt','compensation_grant'))
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"currency_id" uuid NOT NULL,
	"balance" numeric(20, 4) DEFAULT '0' NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"allow_negative_balance" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_balance_check" CHECK ("wallets"."balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iap_receipts" ADD CONSTRAINT "iap_receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iap_receipts" ADD CONSTRAINT "iap_receipts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iap_receipts" ADD CONSTRAINT "iap_receipts_idempotency_key_id_idempotency_keys_id_fk" FOREIGN KEY ("idempotency_key_id") REFERENCES "public"."idempotency_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_rolls" ADD CONSTRAINT "loot_rolls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_rolls" ADD CONSTRAINT "loot_rolls_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_rolls" ADD CONSTRAINT "loot_rolls_idempotency_key_id_idempotency_keys_id_fk" FOREIGN KEY ("idempotency_key_id") REFERENCES "public"."idempotency_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reason_codes" ADD CONSTRAINT "reason_codes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_jobs" ADD CONSTRAINT "staged_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_jobs" ADD CONSTRAINT "staged_jobs_idempotency_key_id_idempotency_keys_id_fk" FOREIGN KEY ("idempotency_key_id") REFERENCES "public"."idempotency_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_idempotency_key_id_idempotency_keys_id_fk" FOREIGN KEY ("idempotency_key_id") REFERENCES "public"."idempotency_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_project_reason_code_fk" FOREIGN KEY ("project_id","reason_code") REFERENCES "public"."reason_codes"("project_id","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "players_project_id_email_unique" ON "players" USING btree ("project_id","email") WHERE "players"."email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_players_project" ON "players" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_organization_id_slug_unique" ON "projects" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "idx_projects_organization" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "currencies_project_id_code_unique" ON "currencies" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "idx_currencies_project" ON "currencies" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "iap_receipts_platform_txn_unique" ON "iap_receipts" USING btree ("platform","platform_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_project_key_unique" ON "idempotency_keys" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_idempotency_keys_reaper" ON "idempotency_keys" USING btree ("created_at") WHERE "idempotency_keys"."completed_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "loot_rolls_player_banner_session_attempt_unique" ON "loot_rolls" USING btree ("player_id","banner_id","pull_session_id","attempt_number");--> statement-breakpoint
CREATE INDEX "idx_staged_jobs_dequeue" ON "staged_jobs" USING btree ("scheduled_at","created_at") WHERE "staged_jobs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_staged_jobs_project_status" ON "staged_jobs" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "idx_transactions_wallet_lookup" ON "transactions" USING btree ("wallet_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_player_lookup" ON "transactions" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_related" ON "transactions" USING btree ("related_type","related_id") WHERE "transactions"."related_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_transactions_project_recon" ON "transactions" USING btree ("project_id","currency_id","created_at") WHERE "transactions"."wallet_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_project_player_currency_unique" ON "wallets" USING btree ("project_id","player_id","currency_id");--> statement-breakpoint
CREATE INDEX "idx_wallets_player" ON "wallets" USING btree ("project_id","player_id");--> statement-breakpoint
CREATE INDEX "idx_wallets_currency" ON "wallets" USING btree ("project_id","currency_id");