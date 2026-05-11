CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_prefix_unique" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "idx_api_keys_project" ON "api_keys" USING btree ("project_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "api_keys" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("api_keys"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
-- Hand-appended (drizzle-kit doesn't emit FORCE per [[drizzle-orm-research]] (1)):
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- DELETE intentionally omitted: revocation is via revoked_at column (preserves audit trail).
GRANT SELECT, INSERT, UPDATE ON "api_keys" TO bokchoy_app;