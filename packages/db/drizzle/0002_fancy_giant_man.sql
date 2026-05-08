ALTER TABLE "players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "currencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "iap_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loot_rolls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reason_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staged_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "players" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("players"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "currencies" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("currencies"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "iap_receipts" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("iap_receipts"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "idempotency_keys" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("idempotency_keys"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "loot_rolls" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("loot_rolls"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "reason_codes" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("reason_codes"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "staged_jobs" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("staged_jobs"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "transactions" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("transactions"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "wallets" AS PERMISSIVE FOR ALL TO "bokchoy_app" USING ("wallets"."project_id" = current_setting('app.current_tenant')::uuid);--> statement-breakpoint
-- FORCE ROW LEVEL SECURITY (drizzle-kit doesn't emit this — appended by hand).
-- Closes the documented owner-bypass failure mode per [[wallet-mechanics]] §8 +
-- [[multi-tenant-rls-research]] Source 19 (Nile post-mortem). Without FORCE, the
-- table owner (here postgres or bokchoy_admin if migrations ran as that) bypasses
-- RLS regardless of policy.
ALTER TABLE "players" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "currencies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "iap_receipts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loot_rolls" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reason_codes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staged_jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- bokchoy_app runtime grants (drizzle-kit doesn't emit GRANTs — appended by hand).
-- Per [[wallet-mechanics]] Amendment Part 1 A1: under M1, bokchoy_app retains
-- direct UPDATE/INSERT/DELETE on protected tables; the discipline that mutations
-- go through wallet_credit/wallet_debit/etc. is enforced by the Slice 7 lint
-- (scripts/check-direct-wallet-mutation.ts), not by GRANT.
-- Better Auth tables are not multi-tenant via RLS but bokchoy_app must read+write
-- them at runtime for the auth flow.
GRANT SELECT, INSERT, UPDATE, DELETE ON "user" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "session" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "account" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "verification" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "organization" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "member" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "invitation" TO "bokchoy_app";--> statement-breakpoint
-- Tenancy + wallet tables. projects is not RLS-protected (listing-by-organization
-- is a different access pattern); the RLS-protected tables get the same grants
-- because under M1 the privilege barrier is not the discipline mechanism.
GRANT SELECT, INSERT, UPDATE, DELETE ON "projects" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "players" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "currencies" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "wallets" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "reason_codes" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "idempotency_keys" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "transactions" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "loot_rolls" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "iap_receipts" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "staged_jobs" TO "bokchoy_app";--> statement-breakpoint
-- bigserial sequence GRANTs — INSERT requires USAGE on the underlying sequence.
GRANT USAGE, SELECT ON SEQUENCE "idempotency_keys_id_seq" TO "bokchoy_app";--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "transactions_id_seq" TO "bokchoy_app";--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "loot_rolls_id_seq" TO "bokchoy_app";--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "iap_receipts_id_seq" TO "bokchoy_app";--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "staged_jobs_id_seq" TO "bokchoy_app";