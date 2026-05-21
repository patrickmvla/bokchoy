-- transactions.item_id was bigint (0001 placeholder, pre-inventory); items.id is uuid, so
-- item grants/consumes/purchases could never store an item reference (bigint = uuid mismatch,
-- surfaced by the first live smoke run). No valid item transaction has ever been written, and
-- item_id is NULL on every existing row, so USING NULL::uuid is a safe, lossless conversion.
-- Per debugging discovery [[wallet/discovery-inventory-sql-never-run]].
ALTER TABLE "transactions" ALTER COLUMN "item_id" SET DATA TYPE uuid USING NULL::uuid;
