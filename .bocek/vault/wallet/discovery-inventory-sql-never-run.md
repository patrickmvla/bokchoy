---
type: discovery
features: [wallet, inventory, shop]
related: ["[[shop/contract-reconciliation-2026-05-21]]", "[[inventory/inventory-contract]]", "[[wallet/wallet-http-contract]]", "[[wallet/credit-route-contract]]"]
created: 2026-05-21
confidence: high
---

# Discovery: the entire `*_by_external_id` SQL family + inventory + shop were never run against a live Postgres — 6 latent runtime-fatal bugs

## What happened

Standing up the `compose.yml` Postgres (supabase/postgres:17.6.1.113, :5433) and running `packages/db/scripts/smoke-functions.ts` for the first time against a live DB surfaced **six distinct, pre-existing, runtime-fatal bugs**, each masking the next. None were catchable by `typecheck` / `lint` / `bun test` — those gates do not execute PL/pgSQL function bodies, check grants, or validate column types against function logic. Every prior slice's "three gates green / LANDED" was true *for what those gates measure*, but the SQL path of the inventory + shop + wallet-by-external-id primitives had **never executed**. The "HONEST CAVEAT: SQL UNRUN, owed to operator" hedge written into every shop/inventory slice was load-bearing — this is what it was hiding.

## The six bugs (provenance: live run, supabase/postgres 17.6.1.113, 2026-05-21)

1. **`variable_conflict` in `item_grant`/`item_consume_by_external_id`** (0011/0012). `RETURNS TABLE(... stackable, player_id, item_id ...)` output columns shadow table columns in ~18 unqualified SELECT/WHERE sites → `column reference "X" is ambiguous` under default `plpgsql.variable_conflict = error`. **Fixed: 0014** (`#variable_conflict use_column`).
2. **Missing `bokchoy_app` table grants** for `items`/`inventory`/`offers`/`offer_prices`/`offer_items` (0011/0013). The functions are SECURITY INVOKER; 0011/0013 granted EXECUTE on functions but forgot per-table grants (the 0002 hand-appended convention). → `permission denied for table items`. **Fixed: 0015.**
3. **Missing sequence grant** `inventory_id_seq` (0011). `inventory.id` is serial; INSERT needs sequence USAGE. → `permission denied for sequence inventory_id_seq`. **Fixed: 0015** (folded in).
4. **`transactions.item_id` type mismatch** — `bigint` (0001 placeholder, pre-inventory) vs `items.id` `uuid`. Item grants/consumes/purchases could never store an item reference. → `operator does not exist: bigint = uuid` (unmasked once #1 resolved). All existing rows had `item_id` NULL (item txns never succeeded), so the conversion is lossless. **Fixed: 0016 + `wallet.ts:168` bigint→uuid.**
5. **`variable_conflict` in `wallet_credit`/`wallet_debit_by_external_id`** (0010). Same class as #1 — `RETURNS TABLE(... wallet_id, player_id ...)` shadows `wallets.player_id` in the lazy-create `INSERT ... ON CONFLICT (project_id, player_id, currency_id)`. **These power the M-1.5 player-centric HTTP routes the SDK uses** — broken in any real DB, not just shop. Never caught because the smoke suite exercises the by-wallet-id `wallet_credit`/`wallet_debit` (0004), not these wrappers. **Fixed: 0017.**
6. **`wallet_deidentify_player` FK violation** (0012, the D5 inventory clause). Repoints `inventory.player_id → anon_id`, but `inventory.player_id` has an FK to `players.id` and `anon_id` is not a players row. → `violates foreign key constraint inventory_player_id_players_id_fk`. **NOT fixed — design flaw, see `[[wallet/gaps]]` → /design.**

## Verified-green state after fixes #1–#5 (migrations 0014–0017 + wallet.ts)

Full clean run (`down -v` → migrate 0000→0017 → smoke) against the live DB:
- **Wallet (by-id):** tests 1–7, 10–13 ✓
- **Inventory:** tests 14–20, D4 ✓ (grant stackable/non-stackable, BC081 overflow rollback, consume, BC082, list, idempotency-replay, cross-tenant RLS)
- **Shop:** S1–S9 ✓ (happy single + bundle L2 ledger linked by `metadata.purchase_id`, BC081 overflow-rolls-back-the-debit, BC010 insufficient, BC090/091/092, cross-tenant BC090, **BC093 empty-offer raised pre-debit, balance unchanged**)
- **Blocked:** test8/test9 (`wallet_deidentify_player`) on bug #6.

29 of 31 smoke tests pass; the 2 blocked are the deidentify pair, gated on the #6 design decision.

## Why typecheck/lint/unit could not catch any of these

- `variable_conflict`, missing grants, type mismatches, FK violations are **runtime Postgres semantics** — invisible to `tsc`, `biome`, and `bun test` (which mock the DB / assert TS type shapes).
- The smoke suite is the only gate that executes the SQL, and it requires `DATABASE_URL`+`DATABASE_MIGRATION_URL` (a live DB), which was never provisioned until now. Docker *was* reachable the whole time (`compose.yml` present); the gate was simply never run.

## Operational implications

1. **The empirical gate is mandatory, not optional, for any slice that ships PL/pgSQL.** "Three gates green" must include a live smoke run before "LANDED" is claimed for SQL-function work. The `compose.yml` DB makes this a ~2-minute local step; there is no excuse to defer it to "the operator."
2. **Re-audit any other un-run SQL function** for the same `variable_conflict` shadow (any `RETURNS TABLE` whose column names match table columns referenced unqualified) and missing grants. Candidates: `bootstrap_project_reason_codes`, the idempotency reaper, any future `*_by_external_id`.
3. **Bug #5 means the M-1.5 wallet routes (`POST /v1/players/{externalId}/wallets/{currency}/credit|debit`) never worked against a real DB** despite being marked LANDED — they need the same curl re-verification as shop once a backend runs.
4. **Bug #6 (deidentify) is a DSR/GDPR-path design flaw** — the repoint-to-anon-uuid strategy is incompatible with FK-constrained live tables (inventory; possibly loot_rolls/iap_receipts if they carry players FKs + data). → `/design`.

## Reproducibility

`docker compose up -d db` → `cd packages/db && DATABASE_MIGRATION_URL=postgresql://postgres:postgres@localhost:5433/postgres bun run db:migrate` → `DATABASE_URL=postgresql://bokchoy_app:postgres@localhost:5433/postgres DATABASE_MIGRATION_URL=... bun scripts/smoke-functions.ts`. Tests 1–20+D4+S1–S9 pass; test8 fails on #6 until /design resolves the deidentify strategy.
