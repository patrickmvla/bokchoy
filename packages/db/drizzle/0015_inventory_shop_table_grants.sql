-- ---------- missing bokchoy_app table grants for inventory + shop tables ----------
-- Bug surfaced by the first live run of scripts/smoke-functions.ts: "permission denied for
-- table items" when bokchoy_app (NOSUPERUSER, NOBYPASSRLS) calls the SECURITY INVOKER
-- item_grant/consume + purchase functions.
-- Root cause: per the convention established in 0002 ("drizzle-kit doesn't emit GRANTs —
-- appended by hand"), every tenant table needs an explicit per-table grant to bokchoy_app.
-- 0011 (items/inventory) and 0013 (offers/offer_prices/offer_items) granted EXECUTE on their
-- functions but forgot the table grants. RLS tenant_isolation policies already exist on all
-- five — the grant is access, the RLS policy is the isolation boundary (same split as 0002).
-- 0011/0013 are shipped; grant in a new migration rather than editing them in place.

GRANT SELECT, INSERT, UPDATE, DELETE ON "items" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "offers" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "offer_prices" TO "bokchoy_app";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "offer_items" TO "bokchoy_app";--> statement-breakpoint
-- inventory.id is serial (nextval inventory_id_seq); INSERT needs sequence USAGE. Shop tables use
-- uuid PKs (gen_random_uuid), so no sequence grant is needed for them. Mirrors the 0002 grants.
GRANT USAGE, SELECT ON SEQUENCE "inventory_id_seq" TO "bokchoy_app";
