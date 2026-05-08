---
type: decision
features: [wallet, architecture, outbox, retention]
related: ["[[wallet-source-of-truth-research]]", "[[wallet-audit-invariant-research]]", "[[staged-jobs-schema-research]]", "[[audit-retention-research]]", "[[webhook-retry-norms-research]]", "[[deidentify-mechanism-research]]", "[[multi-tenant-rls-research]]", "[[host-platform]]", "[[idempotency-strategy]]", "[[mvp-feature-sequence]]", "[[wedge-decision]]", "[[design-claims-register]]"]
created: 2026-05-02
confidence: high
---

# Wallet mechanics: path B (CRUD on balance + same-txn audit log) via stored-function-only interface (M2), unified `transactions` audit + sister tables, monthly partitioning with 24-month hot retention + S3 cold archive

Resolves **CL-029** in `[[design-claims-register]]`. Cascades to every wallet-mutating endpoint, the loot-roll engine (CL-031), the IAP fulfillment path, the faucet/drain dashboard, and the customer-facing privacy policy. Falsifies DESIGN.md §12.2's "event-sourced transactions" framing — replaced with path B per `[[wallet-source-of-truth-research]]` after triangulation against PlayFab Economy v2, Beamable, LootLocker, AWS in-game-currency reference. Closes the cascade obligations from `[[idempotency-strategy]]` for `staged_jobs` schema.

## Amendment 2026-05-04 — M2 → M1, SERIALIZABLE → READ COMMITTED + FOR UPDATE, OTel-from-plpgsql → three-layer realistic mechanism, single-vs-double-entry deliberate-divergence vaulted

Per `[[wallet-functions-research]]` (Q3 of the wallet gap-cluster /research queue, source-walked `pgr0ss/pgledger@b3143a3` + Postgres 16 docs + multi-tenant SaaS contradiction probe), the original 2026-05-02 entry's **§2 M2 cite chain was falsified at tier 1**: pgledger does NOT ship SECURITY DEFINER + role-based REVOKE — it is M1 (app-library + ergonomic discipline) with zero `GRANT/REVOKE/CREATE ROLE` across the entire repo and direct `UPDATE pgledger_accounts` shown as normal usage in `examples/lock-account.sql`. M2 (the privilege-barrier mechanism) had no surveyed production cite for ledger code. Per *Source quality ladder*, tier-1 production cite (M1: Brandur + Square Books + pgledger) beats tier-2 docs-cited novel synthesis (M2: Postgres 16 SECURITY DEFINER + REVOKE/GRANT pattern, well-documented but unpublished for ledgers).

Four amendments land:

### A1. §2 mechanism: M2 → M1 (functions stay; privilege barrier removed)

Stored functions remain (they are a useful ergonomic API surface and provide FOR UPDATE row-locking + idempotency-replay shape for free). They become **SECURITY INVOKER** (Postgres default, pgledger pattern), not SECURITY DEFINER. The application role `bokchoy_app` retains direct `UPDATE`/`INSERT`/`DELETE` privileges on `wallets`/`transactions`/`loot_rolls`/`iap_receipts`. The function set is the *convenient and blessed* path; direct table mutation is not blocked at the privilege level.

`bokchoy_admin` / `bokchoy_app` role separation **survives** under M1 because it serves a separate purpose — `bokchoy_admin` owns DDL and runs migrations, `bokchoy_app` runs runtime queries. The role split was load-bearing for migration discipline before; it remains load-bearing for migration discipline now. What changes is that `bokchoy_app` is no longer SELECT-only on the protected tables.

**M1's bypass-protection failure mode** (engineer adds a parallel mutation path bypassing the WalletService library) is mitigated by:
- **CI lint** — new scripted check `scripts/check-direct-wallet-mutation.ts` (extends the pattern of cascade-9 FORCE-RLS + cascade-10 `prepare: false`) that greps `apps/backend/**/*.ts` for `UPDATE wallets`/`INSERT INTO transactions`/`UPDATE loot_rolls`/`UPDATE iap_receipts`/`DELETE FROM (wallets|transactions|loot_rolls|iap_receipts)` patterns inside `sql\`...\`` template literals; fails build on hits outside the wallet-package boundary (path TBD with implementation, likely `packages/wallet/`).
- **Code review discipline** on PRs touching wallet writes.
- **Test discipline** — integration tests assert that the function path is the only path exercising the protected behavior.

**M1→M2 upgrade migration is preserved as a future option** if (a) team grows past 5 engineers touching wallet code, (b) GRANT-migration drift causes a real incident, or (c) compliance regime demands structural privilege barriers. The migration is one ALTER per function (`SECURITY DEFINER`), one role-grant migration (REVOKE UPDATE on protected tables from `bokchoy_app`, GRANT EXECUTE on functions), `SET search_path` hardening per Postgres 16 docs §sql-createfunction. Function bodies, signatures, and TS call sites are unchanged. Defer until trigger fires.

§2's **plpgsql function set survives the amendment** in shape — `wallet_credit`, `wallet_debit`, `inventory_grant`, `inventory_consume`, `wallet_deidentify_player`. The `SECURITY DEFINER` keyword on each is removed (becomes default SECURITY INVOKER). The example signatures in §2 lose `SECURITY DEFINER` but otherwise stand. The `wallet_deidentify_player` function in §6 also loses SECURITY DEFINER + the search_path hardening.

### A2. *Engineering substance applied* line 466: SERIALIZABLE → READ COMMITTED + FOR UPDATE

The original SERIALIZABLE commitment was inherited from the (now-falsified) M2 framing. Pgledger source-walk: `pgledger_create_transfers` uses default `READ COMMITTED` isolation + explicit `FOR UPDATE` row-locking with sorted-then-locked deadlock prevention (S1 lines 211–226 of the pinned commit). Per `[[wallet-functions-research]]` D2 derivation:

- BokChoy MVP scale (~3 peak writes/sec/project per `[[idempotency-strategy]]` F12) makes contention ~zero — SERIALIZABLE's stronger guarantees would never be exercised in practice.
- BokChoy's `wallet_credit/wallet_debit` lock exactly one wallet row per call. The "many tables, unpredictable order" failure mode SERIALIZABLE protects against doesn't exist in this design.
- FOR UPDATE is *self-documenting at the function-body level* (the lock acquisition is visible in the source); SERIALIZABLE relies on the caller's transaction setting and is invisible to readers of the function alone.
- TS callers under D2b have no retry budget and no `40001 serialization_failure` handling — they receive typed `BCxxx` SQLSTATEs and dispatch by code.

**§2's `wallet_credit`/`wallet_debit` function bodies:** lock the wallet row via `SELECT * FROM wallets WHERE id = p_wallet_id AND project_id = p_project_id FOR UPDATE` after the tenant-context check and before the balance update. Per pgledger pattern.

**Future per-function isolation upgrade is preserved** — if a future endpoint touches multiple rows in patterns FOR UPDATE doesn't catch, that endpoint can independently set `transaction_isolation = 'serializable'` and add caller-side retry. Per-function isolation choice; not all-or-nothing.

### A3. *Engineering substance applied* line 468: OTel-from-plpgsql → three-layer realistic mechanism

The original line 468 commits to *"structured logging via OpenTelemetry from the wallet-mutation function."* Per `[[wallet-functions-research]]` F4 #5: no production cite ships plpgsql→OTel emission; pgledger ships zero observability primitives inside the function. The commitment as written requires building infrastructure that doesn't exist.

Replacement, three layers:

1. **OTel span at the TS call boundary.** Every `db.execute(sql\`SELECT wallet_credit(...)\`)` is wrapped in an OTel span with attributes: `db.system=postgresql`, `db.operation=wallet_credit`, `bokchoy.project_id`, `bokchoy.wallet_id`, `bokchoy.amount`, `bokchoy.currency_id`, `bokchoy.reason_code`. Span captures duration + outcome (success / SQLSTATE on failure). Canonical OTel-TS pattern; no novel infrastructure.
2. **`RAISE LOG` from inside plpgsql** for events the TS layer can't see — idempotency-replay hit, allow_negative_balance constraint check edge cases, etc. Format: `RAISE LOG 'wallet_credit: idempotency_replay project=% wallet=% source_event=% prior_txn=%', p_project_id, p_wallet_id, p_source_event_id, v_existing_id`. Postgres server-log destination; captured by deployment log infra (Supabase log explorer / RDS CloudWatch / Vector). Structured key=value format consumable by log-search tooling.
3. **`pg_stat_statements`** (already committed in original *Engineering substance applied* paragraph) for function-level slow-query analysis at the SQL boundary.

This is what's actually feasible. No new infrastructure required.

### A4. §3 single-entry vs double-entry: deliberate-divergence vaulted

Per `[[wallet-functions-research]]` F5. BokChoy ships single-entry on `transactions` (each row is one credit OR debit; no paired counter-row). Pgledger and traditional double-entry ledger systems require paired credit + debit rows summing to zero per currency. The divergence is intentional: virtual currency is **created and destroyed by the system** — IAP credits gold from "outside" the closed economy; loot pulls debit gold to "outside"; daily-login bonuses generate currency from nothing. Pure double-entry would require materializing pseudo-accounts (`system.iap_inflow_USD`, `system.shop_outflow_gems`) for every system-initiated movement — schema overhead plus ~2× row count on `transactions` for no auditable benefit at game-economy scale. Real-money ledgers (pgledger, Stripe Ledger, banking systems) require double-entry because every dollar must be conserved in the closed system; virtual currency is a different conservation regime.

Vaulted here so future readers don't try to "fix" the missing counter-rows.

### A5. Custom SQLSTATE convention pinned: `BC` namespace

Postgres 16 §38.6.5 permits any 5-character SQLSTATE in `RAISE EXCEPTION ... USING ERRCODE`. Pgledger uses default `RAISE EXCEPTION 'msg %, %'` which falls back to `P0001` (raise_exception) — TS clients pattern-match on message strings, brittle. BokChoy commits to a `BC` 2-char class (BokChoy-namespace; unreserved by SQL standard or Postgres docs §A.1). Pinned codes for the wallet primitive:

- `BC001` IdempotencyKeyInUse — concurrent in-flight request with same `(project_id, idempotency_key)`. Maps to HTTP 409 per `[[idempotency-strategy]]`.
- `BC002` IdempotencyKeyMismatch — same `(project_id, idempotency_key)` with different request body. Maps to HTTP 422 per `[[idempotency-strategy]]`.
- `BC010` InsufficientFunds — debit would breach allow_negative=false on the wallet (or table-level `CHECK (balance >= 0)`). Maps to HTTP 422 with body `{error: 'insufficient_funds', wallet_id, requested, available}`.
- `BC020` TenantMismatch — `current_setting('app.current_tenant')::UUID` differs from `p_project_id` parameter. Defense-in-depth check; should never fire in well-formed callers. Maps to HTTP 500 (caller bug).
- `BC021` WalletNotFound — `p_wallet_id` lookup miss within tenant scope.
- `BC022` CurrencyMismatch — wallet's `currency_id` differs from `p_currency_id` parameter.
- `BC030` PolicyViolation — catch-all for non-debit allow_negative/allow_positive breaches (e.g., crediting a frozen wallet).

Function bodies use `RAISE EXCEPTION 'InsufficientFunds: wallet=% requested=% available=%', ... USING ERRCODE = 'BC010'`. TS layer dispatches by `error.code === 'BC010'`. Stable across function-body refactors. Reserved range `BC000-BC099` for the wallet/inventory primitives; future expansion (loot, IAP, mailbox, etc.) gets `BC100+` blocks per cascade obligation amendment when those features land.

### A6. Cascade obligations updated

- **CI lint #5 in *Cascade obligations*** is amended to add the M1-bypass detection script (`scripts/check-direct-wallet-mutation.ts`). The original M2 GRANT-migration scan obligation is removed (no longer applicable; no GRANT migrations to scan under M1).
- **OTel mechanism cascade** added: TS-side OTel-span helper in the wallet-package boundary; Postgres-server-log structured-format convention documented for `RAISE LOG` lines.
- **SQLSTATE convention cascade** added: TS-side error-class hierarchy (`WalletError` base + `InsufficientFundsError extends WalletError` etc.) mapped from BCxxx codes via a pure-function `sqlstateToError(code, message)` lookup. Pinned at `packages/db/src/wallet-errors.ts` (path TBD).

### A7. Failure mode 1 amended

Original Failure mode 1 (`GRANT UPDATE` privilege drift on wallet tables) is amended:
- Under M1, there's no privilege barrier to drift. The failure mode reverts to the M1 class: *"an engineer adds a parallel mutation path bypassing the wallet-package boundary."* Probability medium during code-base growth; cost medium (audit-row-less mutations possible).
- Mitigation: CI lint per A1 above; code review discipline; integration tests assert the function path is exercised.
- Original mitigation (CI lint script greps migrations for `GRANT UPDATE`) is removed — no GRANT changes to scan.

### Confidence note on the amendment

The M1 commit is **production-cited tier 1** (Brandur + Square Books + pgledger). Confidence: high. The D2b concurrency commit is **production-cited tier 1** (pgledger source-walked) — confidence high on the technique; medium on the technique-as-validated at BokChoy's Studio+ projection (~575 writes/sec/project, no public benchmark surveyed). The OTel three-layer mechanism is **docs-cited + first-principles** — confidence medium-high (each layer is canonical OTel-TS / canonical Postgres logging / canonical pg_stat_statements; combined into a single observability story for BokChoy's specific shape). The SQLSTATE BC namespace is **docs-cited tier 2** with confidence high (Postgres 16 §38.6.5 explicitly permits any 5-char code; the BC choice is convention, not standards-bearing).

The original entry's body sections below (§1–§8, *Reasoning*, *Engineering substance applied*, *Production-grade gates*, *Rejected alternatives*, *Customer-facing contract obligations*, *Failure modes*, *Mitigations summary*, *Idiom citations*, *Revisit when*, *Cascade obligations*) **stand as written except where this amendment supersedes**. Specifically: §2's "no UPDATE privilege" claim is superseded by A1; §6's `wallet_deidentify_player` SECURITY DEFINER + search_path hardening is removed by A1; *Engineering substance applied* lines 466 + 468 are superseded by A2 + A3; *Failure mode 1* is amended per A7; *Cascade obligations* #5 + #6 are amended per A6.

## Amendment 2026-05-04 (Part 2) — Q1 type-system reconciliation per `[[tenancy-ids-research]]`

Per `[[tenancy-ids-research]]` (Q1 + Q2 of the wallet gap-cluster /research queue, 2026-05-04). Q1 (G1) resolved: `players.id` is **UUID** per `[[player-auth]]` §2 — production-cited tier 1 across Supabase Auth + multi-tenant SaaS canonical pattern; BIGSERIAL rejected on enumeration-attack class; prefixed-text rejected on Postgres-stack RLS-GUC-cast fit. The original 2026-05-02 entry's `player_id BIGINT NOT NULL` references in §3, §5, §6 were inherited from a stale framing pre-`[[player-auth]]`. Five amendments land:

### A8. §3 `transactions.player_id` BIGINT → UUID

The `transactions` table column `player_id BIGINT NOT NULL` (per §3 line 62 of original) becomes `player_id UUID NOT NULL`. Index `idx_transactions_player_lookup ON transactions (player_id, created_at DESC)` carries through unchanged (Postgres B-tree indexes UUID natively, no rewrite needed).

### A9. §5 sister-table `player_id` columns BIGINT → UUID

- `loot_rolls.player_id BIGINT NOT NULL` → `UUID NOT NULL`.
- `iap_receipts.player_id BIGINT NOT NULL` → `UUID NOT NULL`.

`loot_rolls.seed_inputs JSONB` content per `[[loot-rng-construction]]` includes `player_id` — the JSONB field carries the UUID string-form (with dashes per RFC 9562) rather than 8-byte BIGINT-encoded. **Cascades to `[[loot-rng-construction]]` canonical-form hybrid A+B serialization:** the `player_id 8B` field in the seed format becomes `player_id 16B` (UUID raw bytes). This is a cascade obligation against `[[loot-rng-construction]]`, listed below.

### A10. §6 `wallet_deidentify_player` signature + HMAC→UUIDv8 projection

Function signature: `wallet_deidentify_player(p_player_id BIGINT)` → `wallet_deidentify_player(p_player_id UUID)`. Return type unchanged (`INTEGER`, count of rows touched).

The §6 plpgsql body's HMAC→bigint projection (lines reading `(('x' || encode(substring(hash_full FROM 1 FOR 8), 'hex'))::bit(63))::bigint`) is replaced with a deterministic-from-HMAC **UUIDv8 projection** per RFC 9562 §5.8 (UUIDv8 is the spec-defined version for app-specific deterministic UUIDs; v4 reserved for randomly-generated; using v4 for a deterministic UUID is a misuse of the spec):

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE FUNCTION wallet_deidentify_player(p_player_id UUID)
RETURNS INTEGER  -- count of rows touched
LANGUAGE plpgsql
-- (per Amendment Part 1 A1: SECURITY DEFINER + search_path hardening removed under M1)
AS $$
DECLARE
  k_text       TEXT  := current_setting('bokchoy.anon_secret', false);  -- error if unset
  hash_full    BYTEA;
  hash_16      BYTEA;
  anon_id      UUID;
  rows_touched INTEGER := 0;
BEGIN
  IF length(k_text) < 32 THEN
    RAISE EXCEPTION 'bokchoy.anon_secret missing or too short (need >= 32 chars)'
      USING ERRCODE = 'BC040';  -- new SQLSTATE: ConfigurationError, see Amendment Part 1 A5
  END IF;

  -- HMAC-SHA-256 of player_id keyed by the de-id secret.
  -- Project to UUIDv8 (RFC 9562 §5.8): 16 bytes of HMAC output, with
  -- byte 6 version bits forced to 1000 (v8) and byte 8 variant bits forced to 10.
  hash_full := hmac(
    convert_to(p_player_id::text, 'UTF8'),
    convert_to(k_text,            'UTF8'),
    'sha256'
  );
  hash_16 := substring(hash_full FROM 1 FOR 16);
  hash_16 := set_byte(hash_16, 6, (get_byte(hash_16, 6) & 15)  | 128);  -- version 8: 1000xxxx
  hash_16 := set_byte(hash_16, 8, (get_byte(hash_16, 8) & 63)  | 128);  -- variant 10: 10xxxxxx
  anon_id := encode(hash_16, 'hex')::uuid;

  -- transactions: replace player_id, scrub PII metadata fields
  UPDATE transactions
    SET player_id = anon_id,
        metadata  = metadata - 'ip' - 'device_id' - 'email_hash' - 'session_id'
    WHERE player_id = p_player_id;
  GET DIAGNOSTICS rows_touched = ROW_COUNT;

  -- loot_rolls: replace player_id, scrub seed_inputs (player_id is the seed input)
  UPDATE loot_rolls
    SET player_id   = anon_id,
        seed_inputs = jsonb_set(seed_inputs, '{player_id}', to_jsonb(anon_id))
    WHERE player_id = p_player_id;

  -- iap_receipts: replace player_id, NULL out raw receipt
  UPDATE iap_receipts
    SET player_id           = anon_id,
        raw_receipt         = NULL,
        validation_response = validation_response - 'transaction_id' - 'original_transaction_id' - 'app_account_token'
    WHERE player_id = p_player_id;

  -- staged_jobs: scrub player-identifying fields across ALL statuses
  UPDATE staged_jobs
    SET payload = payload - 'player_id' - 'email' - 'device_id'
    WHERE (payload->>'player_id')::UUID = p_player_id;

  RETURN rows_touched;
END;
$$;

REVOKE ALL ON FUNCTION wallet_deidentify_player(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wallet_deidentify_player(UUID) TO bokchoy_app;
```

The `staged_jobs` cleanup query's cast becomes `::UUID` (was `::BIGINT`).

**Determinism + collision math:** The UUIDv8 derived from HMAC-SHA-256 carries 122 bits of effective entropy in the data field (16 bytes minus 4 version bits minus 2 variant bits = 122 bits of HMAC-derived value). Birthday collision N²/2¹²² ≈ **5×10⁻²⁰ at 1B distinct player_ids** — functionally zero at any plausible BokChoy scale. The original §6 *Anon_id collision math* paragraph documenting BIGINT-projection collision probability (5×10⁻⁸ at 1M, 5×10⁻⁴ at 100M, 5×10⁻² at 1B) is **retired**; replaced with: *"Anon_id collision math (UUIDv8 projection of HMAC-SHA-256). 122 random bits in the v8 data field; birthday collision N²/2¹²² is functionally zero at any plausible BokChoy scale (≈ 5×10⁻²⁰ at 1B players). No scale-driven Revisit-when trigger applies."*

**Why UUIDv8 not v4-shape:** RFC 9562 §5.4 defines v4 as randomly or pseudo-randomly generated. BokChoy's anon_id is *deterministic from `(player_id, anon_secret)`* — using v4 format misattributes the column's nature. RFC 9562 §5.8 explicitly designates v8 for *experimental or vendor-specific use cases* with the only requirement being correct version + variant bits. v8 is the spec-correct shape; one byte differs in the SQL (`(... & 15) | 128` for v8 vs `(... & 15) | 64` for v4). Same collision profile. Same Postgres `uuid` type acceptance. Internal-only column (anon_ids never leave BokChoy's database) so legacy-tool-recognition concerns are moot.

### A11. *Revisit when* "10M player count" trigger retired

The original *Revisit when* entry: *"Projected player count per project exceeds 10M. Anon_id BIGINT-projection collision math becomes meaningful (~5×10⁻⁴ at 100M, ~5×10⁻² at 1B). Upgrade `player_id` columns to `bytea` (full HMAC-SHA-256 output) or per-project-salted bigint."*

**Retired wholesale.** UUIDv8 width has no plausible-scale collision concern; the threshold this trigger watched for is functionally unreachable. Replace with no successor trigger.

### A12. Cascade obligations from Q1 type changes

- **`[[loot-rng-construction]]` canonical-form hybrid A+B serialization** must amend `player_id 8B` → `player_id 16B`. The seed-bytes derivation changes shape; HMAC_DRBG output is unaffected (the seed-bytes width change doesn't break the PRF determinism). Open thread on `[[loot-rng-construction]]`.
- **`[[player-auth]]` §6 DSR primitives** — `bokchoy.player_export(p_player_id UUID)` and `bokchoy.player_erase(p_player_id UUID)` already match `[[player-auth]]` §2's UUID type; no change needed there. Confirms consistency.
- **`apps/auth-config` Better Auth instance configuration** must include `advanced.database.generateId: "uuid"` per `[[tenancy-ids-research]]` F1. Without this setting, Better Auth generates 32-char alphanumeric TEXT IDs and the entire RLS GUC chain breaks at the `current_setting('app.current_tenant')::UUID` cast. Cascade obligation: `apps/auth-config/src/index.ts` (or wherever the Better Auth instance is defined) sets this option in the config object passed to `betterAuth({...})`.
- **Drizzle table definitions for the auth schema** must hand-translate Better Auth's organization plugin tables (`organization`, `member`, `invitation`, `team`, `teamMember`, `organizationRole`) with `id` typed as Drizzle `uuid('id').primaryKey().defaultRandom()`. Better Auth's `getMigrations` doesn't support Drizzle adapter per `[[backend-stack]]`; hand-translation is the path. Cascade obligation: `packages/db/src/schema/auth.ts` (or equivalent) holds the Drizzle definitions.
- **`[[wallet-functions-research]]` operational-implications template** uses `p_player_id UUID` in the `wallet_credit/wallet_debit` signatures already. No change there; the template was forward-aware of Q1 resolution.

### A13. UUID variant: UUIDv4 today, defer UUIDv7

Per `[[tenancy-ids-research]]` D6 derivation: `gen_random_uuid()` (Postgres-native, generates v4) for column defaults; `crypto.randomUUID()` (Node.js stdlib, generates v4) for app-side ID generation in Better Auth via `advanced.database.generateId: "uuid"`. UUIDv7 is preferred for B-tree insert locality at scale (~49% faster inserts, ~25% smaller index per the mblum.me benchmark on Postgres 15) but Postgres 17 (BokChoy's current per `[[local-docker]]`) doesn't ship native `uuidv7()`; transcribing pgledger's `pgledger_uuidv7_microsecond()` SQL helper would buy v7 today at the cost of carrying ~10 lines of vendored SQL that needs to be remembered + replaced when native arrives.

**Decision:** UUIDv4 today; defer UUIDv7. Migration is cheap when it lands (column-default change + new-rows-land-at-right-edge of B-tree; no data migration; old v4 rows stay frozen).

**Revisit when:**
- Supabase managed Postgres ships Postgres 18 (native `uuidv7()` available) → upgrade defaults in a single migration.
- Sustained write rate on `transactions` exceeds 100 writes/sec for any project (one order of magnitude above indie tier-3 baseline) AND Postgres 18 not yet on Supabase managed → transcribe pgledger's SQL helper and upgrade defaults.

Both triggers are cheap to monitor: Trigger 1 is a Supabase changelog watch; Trigger 2 is checked via the Prometheus metric on `transactions` row growth committed in *Engineering substance applied*. **Vault `[[tenancy-ids-research]]` D6b (UUIDv7-today via vendored SQL helper) as rejected alternative with named winning condition: revisit if Supabase Postgres 18 timeline becomes published and ≥12 months out at vault-write time, in which case shipping the helper today delivers ~12 months of locality benefit before native arrives.**

### Confidence note on Part 2

Q1 commit (UUID for player_id) is **production-cited tier 1** (Supabase Auth `auth.users.id UUID` + multi-tenant SaaS canonical pattern + Better Auth UUID config option). Confidence: high.

UUIDv4-today deferral is **docs-cited** (Postgres B-tree behavior under mixed-monotonic-and-random inserts is well-established) with confidence high on the migration-cheapness claim.

UUIDv8 projection is **spec-correct per RFC 9562 §5.8** (May 2024). Confidence: high on the spec correctness; medium-high on the deterministic-UUID-as-v8 *being the production-recognized pattern* — the RFC is recent (1.5 years old as of vault-write); production-cited examples of v8 in deployed systems are sparse in surveyed sources. The internal-only nature of BokChoy's anon_id (never leaves the database) caps the downside risk at "future-internal-tool may not parse v8" which is mitigated by Postgres `uuid` type accepting v8 byte-pattern as a valid UUID for storage and equality comparison.

Q1 amendments supersede:
- §3 `transactions.player_id BIGINT` → UUID (per A8).
- §5 `loot_rolls.player_id BIGINT`, `iap_receipts.player_id BIGINT` → UUID (per A9).
- §6 `wallet_deidentify_player(BIGINT)` signature + HMAC→bigint projection → `(UUID)` + HMAC→UUIDv8 projection (per A10).
- §6 *Anon_id collision math* paragraph retired and replaced (per A10).
- *Revisit when* "10M player count" trigger retired (per A11).
- *Cascade obligations* extended with Better Auth config + Drizzle auth-schema hand-translation + `[[loot-rng-construction]]` seed-format amendment (per A12).
- New cascade item: UUIDv4→v7 migration triggers (per A13).

## Amendment 2026-05-04 (Part 3) — Wallet-feature schema completion per `[[idempotency-keys-schema-research]]` + `[[economy-primitives-research]]`

Per `[[idempotency-keys-schema-research]]` (Q4 of the wallet research queue) + `[[economy-primitives-research]]` (Q5+Q6+Q7 bundled, 2026-05-04). The research queue surfaced four cross-cutting wallet-feature schemas the original 2026-05-02 entry referenced via FK or naming but did not enumerate: `idempotency_keys`, `currencies`, `wallets`, `reason_codes`. /design Part 3 picks the contested options (D11+D12) and applies the schemas as cascade against §3.

### A14. `idempotency_keys` schema — D11.1 + D11.2 picks

Schema synthesis lives in `[[idempotency-keys-schema-research]]` F6. Picks:

- **D11.1 — `request_params JSONB NOT NULL`** (Brandur shape) over body-hash fingerprint (Shopify shape). Reasoning: storage cost bounded by 24h TTL × write rate; canonical-JSON discipline cost real and ongoing; storage savings (~6× at Studio+) target a non-dominant cost line item. Migration to fingerprint preserved per-endpoint if Studio+ storage becomes load-bearing.
- **D11.2 — `locked_at TIMESTAMPTZ NULL`** (NULL-until-locked) over Brandur's `DEFAULT now()`. Reasoning: D2-α drops the `recovery_point` column that Brandur's default-now relied on for state-disambiguation; under D2-α, NULL-until-locked + `completed_at NOT NULL` makes state derivable from columns alone (self-documenting). Race-window mitigated via `INSERT ... ON CONFLICT (project_id, idempotency_key) DO NOTHING RETURNING id` Postgres-native pattern.

Full schema in `[[idempotency-keys-schema-research]]` F6. Hourly reaper via `staged_jobs` (`kind='idempotency_reaper'`) — extends `[[wallet-mechanics]]` §4 staged_jobs CHECK constraint to include the new kind.

### A15. `currencies`, `wallets`, `reason_codes` schemas — D12 pick

- **D12 — R3 (per-project allowlist)** over R2 (open TEXT). Reasoning: Month 6 faucet/drain dashboard depends on reliable grouping; FK to `reason_codes(project_id, code)` lifts spelling-drift defense to write-time once vs query-time forever. R1 (closed CHECK enum) ruled out by `[[economy-primitives-research]]` F1 — F2P backends do not ship closed reason-code enums, Stripe's pattern is fintech-context.

Full schemas in `[[economy-primitives-research]]`:
- **F3** `currencies(id UUID PK, project_id UUID FK, code TEXT 1-16 alphanumeric+underscore, display_name, description, decimals SMALLINT 0-8, is_premium BOOLEAN, is_tradable BOOLEAN, created_at, updated_at)` UNIQUE(project_id, code). Cap/regen/soft-cap explicitly out-of-MVP.
- **F4** `wallets(id UUID PK, project_id UUID, player_id UUID, currency_id UUID FK, balance NUMERIC(20,4) DEFAULT 0 CHECK >= 0, version BIGINT, allow_negative_balance BOOLEAN, created_at, updated_at)` UNIQUE(project_id, player_id, currency_id). Pgledger row-per-`(player, currency)` pattern; lazy-create on first credit via `INSERT ... ON CONFLICT DO NOTHING`.
- **F6** `reason_codes(project_id UUID, code TEXT CHECK '^[a-z][a-z0-9_]{0,63}$', display_name, category TEXT CHECK 'faucet|drain|transfer|admin', is_system BOOLEAN, created_at)` PK(project_id, code).

Bootstrap default-set ships at project creation (12 codes per F6): faucets `signup_bonus`, `daily_login`, `quest_reward`, `loot_pull_reward`, `shop_purchase_grant`, `iap_grant`, `compensation`, `admin_grant`; drains `loot_pull_cost`, `shop_purchase_cost`, `crafting_cost`, `admin_debit`. All `is_system=TRUE`. Customer extensions get `is_system=FALSE`.

### A16. `transactions` table — column additions to §3

Two new columns added to the original §3 `transactions` schema:

- **`wallet_version BIGINT NOT NULL`** — pgledger forensic-version pattern (`pgledger_entries.account_version` per `[[wallet-functions-research]]` F3). Server-populated from `wallets.version` after the increment, inside the `wallet_credit/wallet_debit` function body. <8 bytes/row at the row-count projection (240M rows × 24 months); ~2GB total at Studio+ scale. Buys forensic reconstruction: "what version of the wallet did this audit row observe?"
- **`reason_code TEXT NOT NULL`** stays declared — but **adds composite FK** `FOREIGN KEY (project_id, reason_code) REFERENCES reason_codes(project_id, code) ON DELETE RESTRICT`. The CHECK constraint on `reason_code` (none in original §3) is replaced by the FK referential integrity. Spelling drift caught at write-time.

§3 partition strategy unchanged — monthly partitioning on `created_at` continues; FKs work across partitioned tables (Postgres 11+).

### A17. Cascade obligations updated

Adding/amending obligations on the existing list:

- **CI lint extension** (per Amendment Part 1 A1) — `scripts/check-direct-wallet-mutation.ts` greps for direct mutation on `currencies`, `wallets`, `reason_codes`, `idempotency_keys` in addition to the original protected tables.
- **Drizzle schema definitions** for `currencies`, `wallets`, `reason_codes`, `idempotency_keys` in `packages/db/src/schema/wallet.ts` (or split per-table).
- **Bootstrap default-set on project creation** — function or trigger or app-side after-insert hook on `projects` inserts the 12 baseline reason codes with `is_system=TRUE`. Implementation choice deferred to /implementation; the data is fixed.
- **`staged_jobs` CHECK constraint** amends to add `'idempotency_reaper'` kind.
- **SDK auto-key generation** — `bokchoy-sdk-retry-${uuid4()}` for retry-eligible POST/DELETE without caller-supplied key. Match Stripe pattern per `[[idempotency-keys-schema-research]]` F5.
- **Customer reason-code CRUD endpoint** — deferred to Month 4+ when cockpit primitives land. MVP customers use the 12 bootstrap codes.

### A18. New SQLSTATEs (extend BCxxx convention from Part 1 A5)

Function bodies now emit:

- **BC050 ReasonCodeNotRegistered** — `transactions.reason_code` doesn't exist in `reason_codes` for this project. FK violation; Postgres raises 23503; function may catch and re-raise as `BC050` for typed TS-side handling, or let 23503 propagate and TS dispatches on it directly. Decision deferred to /implementation; both work.
- **BC060 CurrencyNotFound** — `wallet_credit/wallet_debit` p_currency_id doesn't exist or doesn't belong to p_project_id. Defense-in-depth on top of FK constraint.

Allocations within BCxxx range (Part 1 A5 + Part 2 A10 + Part 3 A18):
- BC001/BC002 idempotency.
- BC010 InsufficientFunds.
- BC020/BC021/BC022 tenant/wallet/currency mismatch.
- BC030 PolicyViolation (allow_negative/allow_positive breaches).
- BC040 ConfigurationError (de-id secret missing).
- BC050 ReasonCodeNotRegistered.
- BC060 CurrencyNotFound.

Reserved range BC000-BC099 for wallet/inventory/idempotency primitives. Future features (loot, IAP, mailbox) get BC100+ blocks.

### Confidence note on Part 3

D11 picks (JSONB + NULL-until-locked) are **production-cited tier 1 + docs-cited tier 2** synthesis (Brandur source + Shopify docs + Postgres ON CONFLICT pattern). Confidence: high.

D12 pick (R3 per-project allowlist) is **synthesized** — no surveyed F2P backend ships exactly R3 publicly (PlayFab/LootLocker show R2). The synthesis is justified by Month 6 faucet/drain dashboard reliability requirement, which is BokChoy-specific. Confidence: medium-high on the synthesis; high on the requirement-driven justification.

Schema cross-references to research entries keep this amendment short. The full SQL schemas live in:
- `[[idempotency-keys-schema-research]]` F6 (`idempotency_keys`).
- `[[economy-primitives-research]]` F3 (`currencies`), F4 (`wallets`), F6 (`reason_codes`).

Q4+Q5+Q6+Q7 amendments supersede:
- §3 `transactions` schema gains `wallet_version BIGINT NOT NULL` column + composite FK on `(project_id, reason_code) → reason_codes`.
- §4 `staged_jobs` CHECK constraint gains `'idempotency_reaper'` kind (Part 3 A17).
- `[[idempotency-strategy]]` *Engineering substance applied* deferral on schema specifics is now closed by F6 in `[[idempotency-keys-schema-research]]`.
- *Cascade obligations* extended per Part 3 A17.
- BCxxx SQLSTATE allocations extended per Part 3 A18.

## Decision

### 1. Source-of-truth model (path B)

`wallet.balance` is the source of truth. Mutations execute under SERIALIZABLE isolation per `[[mvp-feature-sequence]]` line 52. A `transactions` row is written in the same Postgres transaction as the balance update — it is the audit log, not the source of truth. Lose the `transactions` table → balance is still correct; you lose forensics, not money.

Production-cited per `[[wallet-source-of-truth-research]]` against PlayFab Economy v2 (tier 1+2), Beamable (tier 2), LootLocker (tier 4), AWS in-game-currency reference architecture (tier 4) and Brandur `rocket-rides-atomic` (tier 1). Stripe Ledger's path-A choice operates at fintech regulatory scale (5B events/day, regulatory reconciliation against bank rails) and does not apply to F2P virtual currency.

### 2. Audit-row paired-write enforcement: M2 (stored-function-only interface)

The application role has **no `UPDATE` privilege** on `wallets`, `transactions`, `loot_rolls`, `iap_receipts`. All wallet mutations execute through Postgres functions; the app role has `EXECUTE` on the functions and nothing else.

The complete function set:

```sql
CREATE FUNCTION wallet_credit(
  p_project_id          UUID,
  p_wallet_id           BIGINT,
  p_amount              NUMERIC,
  p_currency_id         BIGINT,
  p_reason_code         TEXT,
  p_source_event_id     TEXT,
  p_idempotency_key_id  BIGINT,
  p_related_id          BIGINT     DEFAULT NULL,
  p_related_type        TEXT       DEFAULT NULL,
  p_metadata            JSONB      DEFAULT '{}'::jsonb
) RETURNS BIGINT  -- returns transactions.id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$ ... $$;

CREATE FUNCTION wallet_debit(...) RETURNS BIGINT ...; -- mirror, with InsufficientFunds check
CREATE FUNCTION inventory_grant(...) RETURNS BIGINT ...; -- mutates inventory, writes transactions row
CREATE FUNCTION inventory_consume(...) RETURNS BIGINT ...;
CREATE FUNCTION wallet_deidentify_player(p_player_id BIGINT) RETURNS INTEGER ...; -- §6 below
```

The function is the only mutation path. Bypassing requires a `GRANT UPDATE ON wallets TO app_role` migration which shows up in review as a security change.

Production-cited per `[[wallet-audit-invariant-research]]` F2: pgledger ships exactly this pattern. Brandur and Square Books ship M1 (app-library-discipline); pgledger's M2 is structurally stronger than M1 because bypass requires a privilege change rather than just calling raw SQL from new code. M3 (trigger) has no production cite for this use case and carries documented anti-pattern cost (GitGuardian S4).

### 3. `transactions` table — unified audit log, monthly-partitioned

```sql
CREATE TABLE transactions (
  id                   BIGSERIAL,
  project_id           UUID         NOT NULL,
  wallet_id            BIGINT       NULL,                   -- NULL for non-wallet txns (item-only grants)
  player_id            BIGINT       NOT NULL,               -- de-identifiable per §6
  kind                 TEXT         NOT NULL,
  amount               NUMERIC(20,4) NULL,                  -- positive for credit, negative for debit, NULL for non-currency
  currency_id          BIGINT       NULL,
  item_id              BIGINT       NULL,
  item_quantity        INTEGER      NULL,
  reason_code          TEXT         NOT NULL,
  source_event_id      TEXT         NULL,                   -- natural idempotency key when applicable
  idempotency_key_id   BIGINT       NULL REFERENCES idempotency_keys(id) ON DELETE SET NULL,
  related_id           BIGINT       NULL,                   -- polymorphic FK to sister table
  related_type         TEXT         NULL,                   -- 'loot_roll' | 'iap_receipt' | 'compensation_grant' | NULL
  metadata             JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, created_at),  -- created_at must be in PK because it's the partition key

  CHECK (kind IN ('currency_credit', 'currency_debit', 'item_grant', 'item_consume', 'compensation_grant')),
  CHECK (related_type IS NULL OR related_type IN ('loot_roll', 'iap_receipt', 'compensation_grant'))
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_transactions_wallet_lookup ON transactions (wallet_id, created_at DESC);
CREATE INDEX idx_transactions_player_lookup ON transactions (player_id, created_at DESC);
CREATE INDEX idx_transactions_related ON transactions (related_type, related_id) WHERE related_id IS NOT NULL;
CREATE INDEX idx_transactions_project_recon ON transactions (project_id, currency_id, created_at)
  WHERE wallet_id IS NOT NULL;  -- supports SUM(amount) reconciliation queries
```

Per `[[staged-jobs-schema-research]]` F4: unified audit table is the production pattern across PlayFab, Square Books, and Brandur. Sister tables for domain-specific data (per §5 below).

### 4. `staged_jobs` outbox

```sql
CREATE TABLE staged_jobs (
  id                  BIGSERIAL    PRIMARY KEY,
  project_id          UUID         NOT NULL,
  idempotency_key_id  BIGINT       REFERENCES idempotency_keys(id) ON DELETE SET NULL,
  kind                TEXT         NOT NULL,
  payload             JSONB        NOT NULL,
  status              TEXT         NOT NULL DEFAULT 'pending',
  attempt             SMALLINT     NOT NULL DEFAULT 0,
  max_attempts        SMALLINT     NOT NULL,                -- per-kind, set on insert (see below)
  scheduled_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  last_error          TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CHECK (kind IN ('webhook_fire', 'mailbox_push', 'iap_receipt_validate', 'analytics_event')),
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'dead'))
);

CREATE INDEX idx_staged_jobs_dequeue
  ON staged_jobs (scheduled_at, created_at)
  WHERE status = 'pending';

CREATE INDEX idx_staged_jobs_project_status
  ON staged_jobs (project_id, status);  -- per-tenant queue depth monitoring
```

**`max_attempts` defaults set at insert time, per kind.** Each value encodes a deliberate operator-posture choice — *who carries the cost of receiver downtime* — not a tuned-for-receiver-availability number. Per `[[webhook-retry-norms-research]]`. Revisit after first 30 days of production traffic per `[[runbook-idempotency]]` ops review.

- `webhook_fire = 8` — exponential-backoff window 256 sec ≈ 4.3 min. **Policy: short window + customer-driven replay**, not Stripe-shape (3-day passive) or Shopify-shape (4-hour passive). Encodes the choice that BokChoy as multi-tenant operator would rather force customers to handle replay than accumulate a long retry tail of broken receivers — the failure mode Gusto Embedded documented in their 2025 retry-storm post-mortem (`embedded.gusto.com/blog/retry-storms-webhook-queue-latency/`). Position is **conditional** on §4a/§4b/§4c below being shipped at MVP — without those, "short window" reads as "we lose your events." (production-cited: Slack ~6 min / 3 attempts, Stripe 3 days / ~16, Shopify 4 hours / 8, GitHub 0 retries with 3-day manual replay; modal cluster for asynchronous business events is hours-to-days, BokChoy sits at the short end deliberately.)
- `mailbox_push = 5` — exponential-backoff window 62 sec. **Policy: internal-target conservative.** Internal BokChoy infrastructure should have higher availability than external; 5 is conservative for the internal case.
- `iap_receipt_validate = 5` — exponential-backoff window 31 sec. **Policy: short retry + dead-letter + manual replay runbook.** Apple/Google receipt-validation are highly available in steady state; during a multi-hour platform outage, rows go to `'dead'` and require runbook-driven replay rather than indefinite passive retry. Apple has had documented multi-hour validation outages historically; the runbook entry is required (cascade obligation #6 below). Initial value pending Q4 outage-history research per `[[webhook-retry-norms-research]]` open thread #1.
- `analytics_event = 3` — exponential-backoff window 7 sec. **Policy: wallet correctness > analytics fidelity during traffic spikes.** When analytics service is slow during peak load, analytics events drop while wallet writes proceed at full priority. Trade-off explicit: BokChoy accepts metric loss to preserve wallet write throughput during spikes.

### 4a. List-failed-deliveries API (required deliverable for `webhook_fire = 8`)

The short-window posture is conditional on customers being able to recover from a >5-minute outage. Per `[[webhook-retry-norms-research]]` operational implication #2(a):

```
GET /v1/webhooks/deliveries?delivery_success=false&kind=webhook_fire&since=<ts>&limit=N
```

Returns the dead-letter rows from `staged_jobs` filtered by tenant + kind + success-flag, with pagination. Rows in `'dead'` status are queryable for the dead-letter retention window (§4c). Customers also get:

```
POST /v1/webhooks/deliveries/<delivery_id>/replay
```

which re-enqueues a single `'dead'` row to `'pending'` with `attempt = 0`. The mechanism is Stripe-shape (Stripe Dashboard "Resend" + CLI `stripe events resend`). Per `[[webhook-retry-norms-research]]` Source 1.

### 4b. Per-subscription failure-rate limiter (required deliverable for `webhook_fire = 8`)

Required to avoid the named multi-tenant failure mode — broken endpoints generating retry backlog that degrades delivery for healthy customers. Per `[[webhook-retry-norms-research]]` Source 6 (Gusto Embedded, 2025) and operational implication #2(b).

Mechanism: 5-minute sliding-window failure-rate counter per `(project_id, webhook_subscription_id)`. When failure rate exceeds threshold (initial value: ≥80% failures over ≥10 attempts in 5 minutes; revisit after 30 days of production traffic), the subscription is auto-deactivated and the customer notified. Future events for that subscription bypass the queue and go directly to dead-letter. Customer must explicitly re-enable the subscription after fixing their endpoint. Implementation in Postgres:

```sql
-- Counter table; can be a materialized view refreshed every 30 sec, or a small derived table updated by the worker on each delivery outcome.
CREATE TABLE webhook_subscription_health (
  project_id              UUID         NOT NULL,
  webhook_subscription_id BIGINT       NOT NULL,
  window_started_at       TIMESTAMPTZ  NOT NULL,
  attempts_in_window      INTEGER      NOT NULL DEFAULT 0,
  failures_in_window      INTEGER      NOT NULL DEFAULT 0,
  auto_deactivated_at     TIMESTAMPTZ,
  PRIMARY KEY (project_id, webhook_subscription_id)
);
```

The worker, on each delivery outcome, updates the counter; if the threshold is crossed, sets `auto_deactivated_at` and emits a customer notification. No external Redis required — the schema fits in the existing Postgres-only commitment per `[[host-platform]]` + `[[idempotency-strategy]]` B7.

### 4c. Dead-letter retention ≥7 days (required deliverable for `webhook_fire = 8`)

`staged_jobs` rows in `'dead'` status are retained for **7 days** at MVP, with the option to extend to 30 days at customer-paying tier. After retention expires, rows are hard-deleted. The retention floor lets customers recover from a weekend outage; the 30-day cap matches Stripe's CLI `events resend` window for parity. Per `[[webhook-retry-norms-research]]` operational implication #2(c). The hard-delete is the only `staged_jobs` retention exception to the "operational state, not audit" framing — completed/failed rows still hard-delete after 30 days as before.

**Worker claim pattern** (`SELECT ... FOR UPDATE SKIP LOCKED`):

```sql
BEGIN;
SELECT id, kind, payload, attempt, max_attempts
  FROM staged_jobs
  WHERE status = 'pending' AND scheduled_at <= NOW()
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
-- if found:
UPDATE staged_jobs SET status='running', started_at=NOW(), attempt=attempt+1 WHERE id=$1;
COMMIT;
-- worker dispatches; on success/failure updates status accordingly per [[staged-jobs-schema-research]] F2
```

**Stuck-job reaper:** rows in `'running'` state with `started_at < NOW() - INTERVAL '5 minutes'` get reset to `'pending'` (max-run-duration default; verified against pg-boss conventions in implementation phase per `[[staged-jobs-schema-research]]` open thread #2; folds into `[[runbook-idempotency]]`).

No `priority` column at MVP. Add it (one ALTER TABLE + partial-index update) if Studio+ tier exposes a real backlog blocking live-ops webhooks. Per `[[staged-jobs-schema-research]]` F1.

### 5. Sister tables for domain-specific data

```sql
CREATE TABLE loot_rolls (
  id                   BIGSERIAL   PRIMARY KEY,
  project_id           UUID        NOT NULL,
  player_id            BIGINT      NOT NULL,                -- de-identifiable per §6
  banner_id            BIGINT      NOT NULL,
  pull_session_id      TEXT        NOT NULL,
  attempt_number       INTEGER     NOT NULL DEFAULT 0,
  pre_state            JSONB       NOT NULL,                -- customer-opaque per [[pity-engine-scope]]
  post_state           JSONB       NOT NULL,                -- customer-opaque per [[pity-engine-scope]]
  seed_inputs          JSONB       NOT NULL,                -- (player_id, banner_id, pull_session_id, attempt_number) per [[idempotency-strategy]]; canonical-form hybrid A+B serialization per [[loot-rng-construction]]
  rng_output           JSONB       NOT NULL,
  items_granted        JSONB       NOT NULL,                -- array of (item_id, quantity)
  idempotency_key_id   BIGINT      NULL REFERENCES idempotency_keys(id) ON DELETE SET NULL,
  rng_key_id           SMALLINT    NOT NULL DEFAULT 1,      -- which bokchoy.rng_secret version produced rng_output, per [[loot-rng-construction]]
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (player_id, banner_id, pull_session_id, attempt_number)  -- per [[idempotency-strategy]] F14
);

CREATE TABLE iap_receipts (
  id                   BIGSERIAL   PRIMARY KEY,
  project_id           UUID        NOT NULL,
  player_id            BIGINT      NOT NULL,                -- de-identifiable per §6
  platform             TEXT        NOT NULL,                -- 'apple' | 'google' | 'steam'
  raw_receipt          TEXT        NOT NULL,                -- de-identified to NULL on account close per §6
  platform_transaction_id  TEXT    NOT NULL,
  validated_at         TIMESTAMPTZ NULL,
  validation_response  JSONB       NULL,
  idempotency_key_id   BIGINT      NULL REFERENCES idempotency_keys(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (platform, platform_transaction_id),  -- platform-side idempotency
  CHECK (platform IN ('apple', 'google', 'steam'))
);
```

A loot roll: one `loot_rolls` row + N `transactions` rows (typically: 1 `currency_debit` row paying for the pull + K `item_grant` rows for each item awarded), all with `transactions.related_type='loot_roll'` and `transactions.related_id=loot_rolls.id`.

An IAP fulfillment: one `iap_receipts` row + M `transactions` rows for the granted goods, with `related_type='iap_receipt'`.

Sister-table pattern justified per `[[staged-jobs-schema-research]]` F4: roll-specific forensics (state-transition reconstruction, banner-revenue analytics) need indexed columns that don't fit the unified `transactions` shape; `transactions.metadata` JSONB can't be efficiently indexed for these query patterns.

**`pre_state` and `post_state` are customer-opaque blobs** per `[[pity-engine-scope]]`. BokChoy stores them on `loot_rolls` for forensic auditing but does NOT interpret them. Pity logic, carry-over semantics, and any other game-mechanics state live in customer extension code; BokChoy's `loot_roll` server function is opinionated only about (a) the deterministic RNG it computes from `seed_inputs` (per `[[loot-rng-construction]]` for seed format + PRF + sub-decision (iii) for output → roll mapping) and (b) the audit-row write semantics under M2. The customer's extension reads `pre_state` from the previous `loot_rolls` row inside its own transaction (`SELECT ... FOR UPDATE` for concurrency safety per the reference impl), invokes `loot_roll`, and writes the new `post_state`. CL-031 sub-decision (i) — pity-state engine A/B/C — is **moot at the platform layer** because the storage shape is the customer's choice.

**`rng_key_id` records which `bokchoy.rng_secret` version produced this roll's `rng_output`** per `[[loot-rng-construction]]`. The column is server-populated at write time from `current_setting('bokchoy.rng_key_id')::SMALLINT` and is never accepted as caller input. Default policy is no rotation (symmetric to `[[deidentify-mechanism-research]]`'s `bokchoy.anon_secret`); the column exists so that rotation, when triggered by a compromise event or compliance mandate, preserves replay determinism for historical rolls under their original key.

### 6. De-identification on account close

GDPR right-to-erasure reconciled with audit retention via de-identification, not hard-delete (per `[[audit-retention-research]]` F3 + Supercell/King industry pattern). **Hash construction: HMAC-SHA-256 via pgcrypto** — replaces the `md5(player_id || secret)` v1 draft. Per `[[deidentify-mechanism-research]]`. Reasons:

- MD5 collision-resistance is broken (Wang 2004; chosen-prefix Stevens 2009). Two distinct `player_id`s could collide and silently merge audit rows — data-integrity defect even with no attacker.
- Suffix-keyed hashes have an academic break (Preneel & van Oorschot 1995, "envelope" critique).
- HMAC has a security proof (FIPS 198-1, RFC 2104) and pgcrypto already exposes it. There is no operational reason to ship the broken construction.
- Production-cited: Elastic engineering blog (Wintergerst, Paquette, McDiarmid) — HMAC-SHA-256 + secrets store + rotation. Strongest available named cite for the de-identification pattern; F2P backends (Supercell/King/Riot) do not publicly disclose their mechanism.

Function:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE FUNCTION wallet_deidentify_player(p_player_id BIGINT)
RETURNS INTEGER  -- count of rows touched
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public  -- hardening per Postgres CREATE FUNCTION docs
AS $$
DECLARE
  k_text       TEXT  := current_setting('bokchoy.anon_secret', false);  -- error if unset
  hash_full    BYTEA;
  anon_id      BIGINT;
  rows_touched INTEGER := 0;
BEGIN
  IF length(k_text) < 32 THEN
    RAISE EXCEPTION 'bokchoy.anon_secret missing or too short (need >= 32 chars)';
  END IF;

  -- HMAC-SHA-256 of player_id keyed by the de-id secret, projected into a positive BIGINT.
  hash_full := hmac(
    convert_to(p_player_id::text, 'UTF8'),
    convert_to(k_text,            'UTF8'),
    'sha256'
  );
  anon_id := (('x' || encode(substring(hash_full FROM 1 FOR 8), 'hex'))::bit(63))::bigint;

  -- transactions: replace player_id, scrub PII metadata fields
  UPDATE transactions
    SET player_id = anon_id,
        metadata  = metadata - 'ip' - 'device_id' - 'email_hash' - 'session_id'
    WHERE player_id = p_player_id;
  GET DIAGNOSTICS rows_touched = ROW_COUNT;

  -- loot_rolls: replace player_id, scrub seed_inputs (player_id is the seed input)
  UPDATE loot_rolls
    SET player_id   = anon_id,
        seed_inputs = jsonb_set(seed_inputs, '{player_id}', to_jsonb(anon_id))
    WHERE player_id = p_player_id;

  -- iap_receipts: replace player_id, NULL out raw receipt (contains platform user identifiers)
  UPDATE iap_receipts
    SET player_id           = anon_id,
        raw_receipt         = NULL,
        validation_response = validation_response - 'transaction_id' - 'original_transaction_id' - 'app_account_token'
    WHERE player_id = p_player_id;

  -- staged_jobs: scrub player-identifying fields across ALL statuses (closes the 30-day window
  -- between de-identify and completed-row hard-delete that v1 left open).
  UPDATE staged_jobs
    SET payload = payload - 'player_id' - 'email' - 'device_id'
    WHERE (payload->>'player_id')::BIGINT = p_player_id;

  RETURN rows_touched;
END;
$$;

REVOKE ALL ON FUNCTION wallet_deidentify_player(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wallet_deidentify_player(BIGINT) TO bokchoy_app;
```

**Secret-loading pattern (per-transaction `SET LOCAL` from secrets manager, NEVER `postgresql.conf`).** Per `[[deidentify-mechanism-research]]` and the same mechanism §8 uses for RLS context.

App startup reads `BOKCHOY_ANON_SECRET` from AWS Secrets Manager / HashiCorp Vault / process env (Supabase doesn't ship a built-in secret manager — externalize). At the start of every transaction that calls `wallet_deidentify_player`:

```sql
BEGIN;
SELECT set_config('bokchoy.anon_secret', $secret_from_secrets_manager, TRUE);  -- TRUE = transaction-local
SELECT wallet_deidentify_player($player_id);
COMMIT;
```

`SET LOCAL` (or `set_config(name, value, TRUE)`) is transaction-scoped per Postgres `sql-set.html`; PgBouncer transaction-pool releases the backend on commit, so the GUC dies before the connection returns to the pool. **DO NOT** load the secret via `connect_query` with plain `SET` — that persists session-scoped on the backend and leaks to the next pooled client. Per `[[multi-tenant-rls-research]]` Source 5 (PgBouncer features.html) and Source 7 (Heroku PgBouncer best-practices).

**Cascade obligation: verify Supavisor (Supabase's PgBouncer fork) in transaction mode preserves `SET LOCAL` semantics** — see `[[host-platform]]` cascade obligation #2.

**Anon_id collision math (BIGINT projection of HMAC-SHA-256).** Truncating SHA-256 to 63 bits gives birthday-collision probability ≈ N²/2⁶⁴ for N de-identified players per project: at 1M players ≈ 5×10⁻⁸ (negligible), at 100M ≈ 5×10⁻⁴ (notable), at 1B ≈ 5×10⁻² (unacceptable). At BokChoy MVP and Studio-tier scale this is fine; the Studio+ ceiling triggers the upgrade per *Revisit when*.

**Key rotation: NONE by default.** Rotation is incident-only — suspected key compromise or regulatory mandate. Rotating without a security trigger is ceremony: it forces analytics consumers to handle epoch boundaries forever for no real-world threat reduction. Rotation breaks correlation across the boundary, which is a feature for forward-secrecy on de-identification but a bug for analytics that joins pre-/post-rotation anon_ids. **If rotation occurs**, document the rotation date in the runbook so analytics queries can scope by epoch; old anon_ids no longer correlate to new ones. **Key destruction = GDPR-recognized erasure** per `[[deidentify-mechanism-research]]` Source 6 (AEPD/EDPS regulator paper) — destroying the de-id key destroys reversibility, which is the regulatory escape hatch for "right to erasure beyond what de-identification provides."

**PII fields enumerated for de-identification** (this is BokChoy's commitment to its customers' privacy policies):
- `transactions.player_id` → replaced with HMAC-derived anon_id
- `transactions.metadata.ip`, `.device_id`, `.email_hash`, `.session_id` → dropped
- `loot_rolls.player_id` + `.seed_inputs.player_id` → both replaced
- `iap_receipts.player_id` → replaced
- `iap_receipts.raw_receipt` → NULL'd (contains Apple/Google subject IDs)
- `iap_receipts.validation_response.transaction_id`, `.original_transaction_id`, `.app_account_token` → dropped
- `staged_jobs.payload.player_id`, `.email`, `.device_id` → dropped across **all statuses** (extended from v1's pending/running-only to close the 30-day completed-row window)

Transaction shape (amount, currency, kind, timestamp, reason_code) is preserved indefinitely under legitimate-interest basis per `[[audit-retention-research]]` S6.

### 7. Retention model — three-tier with monthly partitioning

**Tier 1 (hot, queryable from app):** Postgres `transactions` table partitioned monthly on `created_at`. **24 months of partitions retained** (covers 540-day card-scheme chargeback floor + 6-month buffer per `[[audit-retention-research]]` F2).

**Partition lifecycle via `pg_partman`:**
- New monthly partition created 1 month ahead by `pg_partman` cron.
- Partitions older than 24 months: detached (`ALTER TABLE transactions DETACH PARTITION transactions_p2024_05`), exported to S3 as Parquet via `aws_s3.query_export_to_s3` (RDS) or equivalent script, dropped.

**Tier 2 (cold, queryable on-demand):** S3 with Parquet, **24-60 months retained**. Restored to a temporary Postgres or queried via Athena/Redshift Spectrum for case-by-case forensics (lawsuit, regulator inquiry, retroactive analytics).

**Tier 3 (archive):** S3 Glacier for partitions older than 60 months, **indefinite retention**. Restoration on explicit request only.

The same partitioning + tiering applies to `loot_rolls` and `iap_receipts` (sister tables grow with `transactions`). `staged_jobs` does NOT need tiering — completed/dead rows can be hard-deleted after 30 days; outbox is operational state, not audit.

Per `[[audit-retention-research]]` F4 + F5. Storage math: ~$50/month per project at indie tier; ~$2-3K/month at full Studio+ tier — bounded by hot-tier hardware, not by archive storage.

### 8. Cross-tenant isolation: RLS with non-owner application role + per-request `SET LOCAL` context

**Problem.** Every query on `transactions`, `loot_rolls`, `iap_receipts`, `staged_jobs`, `wallets`, `webhook_subscription_health` MUST filter on `project_id`. A single missed filter exposes another customer's data. M2 (§2) protects writes structurally; RLS is the symmetric mechanism for reads + an additional layer on writes. Per `[[multi-tenant-rls-research]]`.

**Mechanism.** Postgres row-level security with `current_setting('app.current_tenant')::UUID` as the policy predicate, loaded per-transaction via `SET LOCAL` from the application. Production-cited per AWS Prescriptive Guidance (verbatim "required to maintain tenant data isolation in a pooled model with PostgreSQL") + AWS Database Blog + Crunchy Data + Heroku + Drizzle/Prisma worked examples. Strongest named counter-position (PlanetScale / Simeon Griggs 2026-04-21) is rejected per *Rejected alternatives* below — its argument collapses given M2 already commits BokChoy to DB-layer structural protection on writes.

**Role architecture (Supabase DB-only mode per `[[host-platform]]`).** Tables are owned by a migration-only role (`bokchoy_admin`); the application connects as `bokchoy_app`, which is *not* a table owner and *not* a superuser:

```sql
CREATE ROLE bokchoy_admin LOGIN;     -- migrations only; not used at runtime
CREATE ROLE bokchoy_app   LOGIN;     -- runtime app connections

-- migrations create tables as bokchoy_admin; bokchoy_admin grants minimum privileges to bokchoy_app
GRANT USAGE ON SCHEMA bokchoy TO bokchoy_app;
GRANT SELECT ON transactions, loot_rolls, iap_receipts, staged_jobs, wallets,
                 webhook_subscription_health, catalog_items TO bokchoy_app;
GRANT EXECUTE ON FUNCTION wallet_credit, wallet_debit, inventory_grant, inventory_consume,
                          wallet_deidentify_player, catalog_create_draft, catalog_publish,
                          catalog_publish_bulk, catalog_unpublish, catalog_archive TO bokchoy_app;
-- M2 invariant: bokchoy_app has NO direct UPDATE/INSERT/DELETE on protected tables (per §2).
```

**RLS policy on every multi-tenant table:**

```sql
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;  -- applies even to table owner; closes the owner-bypass failure mode
CREATE POLICY tenant_isolation ON transactions
  USING (project_id = current_setting('app.current_tenant')::UUID);

-- Same pattern for: loot_rolls, iap_receipts, staged_jobs, wallets,
-- webhook_subscription_health, catalog_items, catalog_audit, idempotency_keys.
```

`FORCE ROW LEVEL SECURITY` is required — without it, RLS is bypassed for the table owner (the documented owner-bypass failure mode per `[[multi-tenant-rls-research]]` Source 19, Nile post-mortem). With `FORCE`, even `bokchoy_admin` is subject to policies during migrations; explicit `BYPASS RLS` is granted only to a maintenance role used in documented break-glass procedures.

**Per-request context-loading pattern** (same `SET LOCAL` mechanism §6 uses for the de-id secret — one mechanism, two GUCs):

```sql
BEGIN;
SELECT set_config('app.current_tenant', $project_id, TRUE);  -- TRUE = transaction-local
-- … all queries during this request execute under RLS scoped to $project_id …
COMMIT;
```

In TypeScript with Drizzle, this lives inside `db.transaction(async (tx) => { … })`; with Prisma, it's the `$executeRaw('SELECT set_config(\'app.current_tenant\', $1, TRUE)', projectId)` pattern from the official Prisma client-extensions example. Per `[[multi-tenant-rls-research]]` Sources 9, 10, 14.

**Why `SET LOCAL` is safe under PgBouncer/Supavisor transaction-pool:** chain documented in `[[multi-tenant-rls-research]]` Sources 2, 5, 6, 7, 8, 15. The Postgres SET docs confirm `SET LOCAL` ends at COMMIT/ROLLBACK; PgBouncer's transaction-mode rule releases the backend on commit; Heroku's official guidance is verbatim prescriptive ("Any changes to session state via `SET` must only be made with `SET LOCAL`"); JP Camara provides an independent named demonstration. **Cascade obligation: verify Supavisor preserves the same semantics** — `[[host-platform]]` cascade obligation #2.

**Partition pruning interaction.** RLS does NOT break partition pruning under BokChoy's shape. The `created_at` partition key is orthogonal to the `project_id` RLS qualifier; pruning is driven by the application's `WHERE created_at >= …` clause (Postgres docs, S4 in `[[multi-tenant-rls-research]]`). Empirical confirmation: scalar `current_setting()::int` against a partition column DOES participate in pruning (pgsql-hackers Marcelo Zabani 2024-08-07, S17); array-via-`ANY()` does not — BokChoy uses scalar single-UUID, matches the working case. Verification: `EXPLAIN (ANALYZE, BUFFERS)` should show "Subplans Removed" on representative queries.

**Real performance risk: leakproof-ness regression on inner predicates** (Pierre Ducroquet, pgsql-hackers 2019, S18 in `[[multi-tenant-rls-research]]`). Surfaced as failure mode 8 below; mitigation: profile representative queries with RLS enabled, mark project-internal SQL/plpgsql functions LEAKPROOF where safe, document tradeoffs.

**No public RLS case study at BokChoy's potential scale exists** (≥1k tenants, ≥10k req/sec). AWS prescriptive + Nile post-mortem are the most authoritative voices; neither publishes the operational metrics. Treated as an open thread for `[[runbook-idempotency]]` ops review at first paying customer.

## Reasoning

### Why path B over path A/C/D

Per `[[wallet-source-of-truth-research]]`. All four named game-backends at BokChoy's ICP scale ship path B. Stripe Ledger's path-A choice operates under regulatory reconciliation + 5B events/day conditions BokChoy does not face. Path D (CRUD + ledger storage) requires QLDB or equivalent — unavailable on Postgres without contradicting `[[idempotency-strategy]]` B7. Path C (hybrid) buys nothing once the M2 mechanism + sister-tables pattern provides forensics + structural enforcement.

### Why M2 over M1 or M3

Per `[[wallet-audit-invariant-research]]`. M3 (trigger) has no production cite for paired-write enforcement; GitGuardian's removal post-mortem (S4) is the named anti-pattern source. M1 (app-library-discipline, per Brandur and Square Books) is shipped at production scale, but its failure mode — engineer adds parallel mutation path bypassing the library — is real. M2 (pgledger pattern) makes that failure require a `GRANT UPDATE` migration. The `GRANT` change shows up in review as a security change, not a schema change. *The same code-review-on-migrations discipline that protects against M1's failure mode is more load-bearing under M2 — but the protection it gives is structural rather than habitual.* Production-cited (pgledger) per ecosystem research and the explicit research-and-design loop that produced this entry.

### Why unified `transactions` + sister tables

Per `[[staged-jobs-schema-research]]` F4. Production-cited unification across PlayFab, Square Books, Brandur. Sister tables solve the heterogeneous-shape problem F2P has but pure double-entry doesn't (loot rolls have RNG seed + pity state; IAP receipts have platform metadata; pure currency moves don't).

### Why `staged_jobs` schema follows pg-boss / Patel reference rather than Brandur

Per `[[staged-jobs-schema-research]]` F1. Brandur's `(id, job_name, job_args)` is structurally insufficient as a production queue — no claim mechanism, no retry, no dead-letter. The pg-boss + Patel reference covers all three with `SELECT ... FOR UPDATE SKIP LOCKED` claim, `scheduled_at` exponential backoff, `status='dead'` after `max_attempts`. Brandur is preserved as the production-cite for the *transactional invariant* (outbox row commits with business state) but not for the queue mechanism.

### Why per-kind `max_attempts` and the conditional short-window posture

The four side-effect kinds encode different operator-posture choices, not different receiver-availability assumptions. Per `[[webhook-retry-norms-research]]` — production-cited spectrum of webhook retry policies.

- `webhook_fire = 8` (4.3 min): **deliberately at the short end** of the asynchronous-business-event cluster (Slack ~6 min, Stripe 3 days, Shopify 4 hours, GitHub 0-with-3d-replay). The Gusto Embedded 2025 post-mortem documents the dominant multi-tenant failure mode of long-window passive retry: a small number of broken endpoints generate retry backlog that degrades delivery for healthy customers. BokChoy's short window + customer-driven replay avoids that named failure mode. **Conditional on §4a/§4b/§4c shipping at MVP** — without those, "short window" reads as "we lose your events." Not an unconditional best-default; explicit operator-posture choice.
- `iap_receipt_validate = 5` (~31 sec): receipts highly available in steady state; multi-hour platform outages route to dead-letter for manual replay (cascade obligation: Apple/Google outage runbook).
- `mailbox_push = 5` (~62 sec): internal target, conservative.
- `analytics_event = 3` (~7 sec): metric loss accepted to preserve wallet write throughput during traffic spikes.

Initial values labeled as such per `[[staged-jobs-schema-research]]` open thread #1; revisit after first 30 days of production traffic.

### Why HMAC-SHA-256 + per-tx `SET LOCAL` over `md5(player_id || secret)` + postgresql.conf

Per `[[deidentify-mechanism-research]]`. MD5 collision-resistance is broken (Wang 2004); suffix-keyed hashes have an academic break (Preneel-van Oorschot 1995); HMAC has standardization (FIPS 198-1, RFC 2104) and pgcrypto already exposes it. Production-cited replacement per Elastic engineering blog. The secret-source choice (per-transaction `SET LOCAL` from secrets manager, not postgresql.conf) is required by PgBouncer/Supavisor transaction-pool semantics — plain `SET` in `connect_query` would persist session-scoped on the backend and leak to the next pooled client per `[[multi-tenant-rls-research]]` Sources 5/7/15.

### Why RLS over PlanetScale's app-layer enforcement (the named counter-position)

RLS is the dominant published pattern in non-Supabase guidance per `[[multi-tenant-rls-research]]` (AWS Prescriptive Guidance verbatim "required to maintain tenant data isolation in a pooled model with PostgreSQL"). The strongest named counter-position — PlanetScale / Simeon Griggs (2026-04-21) — argues for app-layer enforcement on debuggability grounds. That argument's structural premise is "the database is the wrong layer for tenant isolation logic." **For BokChoy, that premise is already incompatible with M2** — `[[wallet-mechanics]]` §2 explicitly commits to DB-layer structural protection on writes (stored-function-only-interface, app role has no UPDATE on protected tables). Going hybrid (M2 writes + app-layer reads) ships two enforcement patterns, not one. PlanetScale's debuggability concerns are real and surface as failure modes 8/9/10 below, with named mitigations (profile with `EXPLAIN ANALYZE`, `FORCE ROW LEVEL SECURITY` + non-owner role, middleware sets `SET LOCAL` as first statement of every transaction). The decision is internally consistent with M2; rejecting RLS would force reopening M2 too.

### Why 24 months hot retention

Card-scheme chargeback floor is 540 days under reason code 13.1 per `[[audit-retention-research]]` S4. 18 months hot would be exact-fit; 24 months adds a 6-month buffer for dispute-processing-time and customer-support response cycle. Cost differential at indie tier is sub-$50/month; at Studio+ tier is meaningful (~$500-1000/month per 6 months) but bounded by revenue Studio+ already justifies per `[[indie-smb-pricing-research]]`.

### Why de-identification standard, not hard-delete

Industry pattern across Supercell + King + GDPR legitimate-interest analysis (`[[audit-retention-research]]` F3, S6, S7, S8). Hard-delete + 540-day chargeback window are operationally incompatible: a chargeback fires 400 days after a transaction; hard-delete on account-close 200 days ago means no audit row to defend with; customer loses the chargeback. De-identification preserves the audit shape while satisfying GDPR Article 17(3) legitimate-interest carve-out.

### Why `pg_partman` over manual partition management

Native to AWS RDS Postgres; supported by every major managed-Postgres host (Railway, Render, Fly.io, Supabase). Manual partition management is ~30 lines of cron-equivalent that's easy to get wrong (forgotten future-month creation = INSERT failures at month boundary). The dependency is small and standard.

## Engineering substance applied

- **Consistency:** SERIALIZABLE isolation on credit/debit operations (per `[[mvp-feature-sequence]]` line 52). The wallet-mutation function executes its INSERT into `transactions` and UPDATE on `wallets` in the same transaction; if either fails, both abort. Idempotency key insertion + business-state update + audit-row insert + `staged_jobs` outbox-row insert all commit atomically per `[[idempotency-strategy]]` invariant.

- **Failure semantics:** at-least-once + idempotency keys per `[[idempotency-strategy]]`. `staged_jobs` consumers must be idempotent — including external webhook receivers, which is a contract obligation surfaced in §"Customer-facing contract obligations" below.

- **Concurrency:** SERIALIZABLE for wallet writes; `SELECT ... FOR UPDATE SKIP LOCKED` for `staged_jobs` worker claim. Optimistic locking via row version is NOT used at MVP — SERIALIZABLE on the small mutation surface plus M2's stored-function-only-interface gives stronger guarantees than version-column-based optimistic locking and matches the `[[idempotency-strategy]]` mechanics.

- **Observability:** structured logging via OpenTelemetry from the wallet-mutation function (per `[[mvp-feature-sequence]]` line 55). `pg_stat_statements` enabled on the deployment for slow-query analysis on the wallet functions specifically — plpgsql debugging tax mitigated by structured-logging-from-inside-the-function. Prometheus metrics on `staged_jobs` queue depth per `[[idempotency-strategy]]` line 191.

- **Storage:** Postgres single instance for MVP per `[[idempotency-strategy]]` B7. Monthly partitioning on `transactions`, `loot_rolls`, `iap_receipts` from day 1 via `pg_partman`. Partitions older than 24 months archive to S3.

- **Security (M2 + RLS layered defense).** Write boundary: `bokchoy_app` has `EXECUTE` on `wallet_credit/debit/inventory_grant/inventory_consume/wallet_deidentify_player` and `SELECT` on protected tables; **no `UPDATE`/`INSERT`/`DELETE` privilege** on `wallets`/`transactions`/`loot_rolls`/`iap_receipts`/`staged_jobs`/`webhook_subscription_health`. Direct DML bypasses M2 — blocked at the role level. Read boundary: RLS policies on every multi-tenant table with `FORCE ROW LEVEL SECURITY` enabled, scoped via `current_setting('app.current_tenant')::UUID` set per-transaction with `SET LOCAL`. Per §8. Trust boundary changes hands from API gateway → app → DB at the `SET LOCAL app.current_tenant` statement; everything downstream is RLS-scoped automatically. Per `[[multi-tenant-rls-research]]`.

## Production-grade gates

- **Idiomatic** — Postgres-native: `SERIALIZABLE` isolation, plpgsql functions, `SELECT ... FOR UPDATE SKIP LOCKED`, declarative partitioning, role-based GRANTs. No fights with the platform. (production-cited: pgledger ships exactly this pattern; pg-boss is the canonical TypeScript-ecosystem queue using SKIP LOCKED.)

- **Industry-standard** — every named primitive appears in ≥2 production references:
  - Path B + same-txn audit: PlayFab Economy v2, Beamable, LootLocker, Brandur (`[[wallet-source-of-truth-research]]`)
  - Stored-function-only-interface: pgledger (`[[wallet-audit-invariant-research]]`)
  - SKIP LOCKED outbox: pg-boss, pg-transactional-outbox, Patel reference (`[[staged-jobs-schema-research]]`)
  - Sister-tables pattern: PlayFab transaction-history, Square Books journal_entries + book_entries, Brandur audit_records (`[[staged-jobs-schema-research]]` F4)
  - 24-month retention with tiered archive: Supercell + King industry pattern, AWS reference architectures (`[[audit-retention-research]]`)
  - `pg_partman` + monthly partitioning: AWS RDS canonical, Postgres docs
  - HMAC-SHA-256 + secrets-manager + per-tx `SET LOCAL` for de-id: Elastic engineering blog (Wintergerst/Paquette/McDiarmid); `pgcrypto.hmac()` per Postgres 16 docs; AEPD/EDPS regulator paper on hash-pseudonymization (`[[deidentify-mechanism-research]]`)
  - RLS + `current_setting()::UUID` for multi-tenant: AWS Prescriptive Guidance (verbatim "required"), AWS Database Blog (Beardsley 2020), Crunchy Data (Kerstiens 2024), Heroku PgBouncer best-practices, Drizzle/Prisma worked examples (`[[multi-tenant-rls-research]]`)
  - Webhook short-window posture + per-subscription failure-rate limiter: Gusto Embedded 2025 post-mortem; Slack 3-attempt + manual-recover pattern; GitHub 0-retry + queryable-state pattern (`[[webhook-retry-norms-research]]`)

- **First-class** — uses Postgres' native abstractions (functions, GRANTs, declarative partitioning, SKIP LOCKED) rather than fighting them. No custom locking schemes, no application-side queue management, no ledger-storage hacks. Works with Drizzle/TypeScript at the call boundary (`db.execute(sql\`SELECT wallet_credit(...)\`)`); plpgsql is the implementation language for the mutation core only.

## Rejected alternatives

### Path A (event-sourced wallet)
**What:** event log is source of truth; balance is a projection (synchronous M1, async M2, or compute-on-read M3).
**Wins when:** regulatory reconciliation against external rails (Stripe Ledger conditions); 5B+ events/day; replay-from-events is operationally load-bearing (chargeback defense at scale, regulator audit trail).
**Why not here:** BokChoy operates at game-backend scale (~575 writes/sec/project peak at Studio+, orders of magnitude below Stripe). No regulatory reconciliation. Path-A operational taxes (schema evolution per live-ops cycle, projection desync, replay cost) inherited for no benefit at this scale. Per `[[wallet-source-of-truth-research]]` F2 + F4.

### Path C (hybrid — wallet event-sourced, others CRUD)
**What:** wallet event-sourced; inventory + loot CRUD.
**Wins when:** wallet has forensic requirements meaningfully stronger than other entities AND those requirements aren't met by path B + sister tables.
**Why not here:** path B + M2 + `loot_rolls` sister table provides the forensic completeness path C buys, without the operational tax of two patterns. Path C is justified only if a specific entity needs ES that path-B-with-domain-audit-tables can't provide; no such entity exists in MVP scope. Per `[[wallet-source-of-truth-research]]` F4 path-C analysis.

### Path D (CRUD interface + ledger storage underneath, AWS QLDB pattern)
**What:** balance is the source of truth at the interface level; underlying storage (QLDB) provides automatic immutability + history.
**Wins when:** the team is willing to add a ledger-database to the stack and accept a non-Postgres storage layer for wallet data.
**Why not here:** contradicts `[[idempotency-strategy]]` B7's permanent Postgres-only commitment. Adding QLDB or equivalent is out of scope per `[[mvp-feature-sequence]]`. Per `[[wallet-source-of-truth-research]]` F3.

### M1 (app-library + code review only)
**What:** single `WalletService` library wraps all wallet writes; code review enforces "do not write to `wallets` outside `WalletService`."
**Wins when:** team is small, well-disciplined, and team-growth is slow; or when the cost of plpgsql tooling (M2) outweighs the structural-protection delta.
**Why not here:** `[[mvp-feature-sequence]]` projects 18-24 months pre-Series-A solo/small-team; team growth post-Series-A is when the discipline cost of M1 starts compounding. The marginal cost of M2 over M1 is a one-time function-authoring effort + ongoing migration review discipline; the marginal benefit is making the bypass failure-mode require a privilege change rather than just a code path. Per `[[wallet-audit-invariant-research]]` F2 + F3.

### M3 (trigger-based audit-row enforcement)
**What:** AFTER UPDATE trigger on `wallets` aborts transactions without paired `transactions` insert.
**Wins when:** threat model includes admin-session-bypass (dashboard SQL accidentally bypasses audit); or when stored-function-interface is operationally infeasible.
**Why not here:** GitGuardian's documented removal post-mortem (`[[wallet-audit-invariant-research]]` S4) — cascading lock issues, debugging visibility, hidden complexity. No surveyed production reference uses M3 for this purpose. M2 covers the realistic threat (application-code-bypass) without inheriting M3's anti-pattern cost.

### Brandur-minimal `staged_jobs` schema
**What:** `(id, job_name, job_args)` only.
**Wins when:** the outbox is purely a teaching example or is paired with an external queue system (Sidekiq, RabbitMQ).
**Why not here:** BokChoy's outbox IS the queue. Without claim/retry/dead-letter primitives in the table itself, the worker code must implement them externally — operational complexity moves but isn't reduced. Per `[[staged-jobs-schema-research]]` F1 + S1.

### Hard-delete on account close
**What:** delete all transaction/wallet/inventory rows for a player on account close per a maximalist GDPR reading.
**Wins when:** strict-deletion jurisdiction with no legitimate-interest carve-out for chargeback defense (no surveyed jurisdiction matches at present).
**Why not here:** card-scheme chargeback windows extend 540 days past transaction date; hard-delete + chargeback are operationally incompatible. Industry pattern (Supercell, King) is de-identification under legitimate-interest basis per `[[audit-retention-research]]` F3.

### App-layer cross-tenant enforcement (PlanetScale pattern)
**What:** every query goes through a tenant-scoped query helper / ORM middleware that injects `WHERE project_id = $current_tenant`; no Postgres RLS used; rely on TypeScript types + code review + tests for enforcement.
**Wins when:** the team has no DB-layer structural commitments AND prioritizes debuggability + observability over structural protection AND has strong type-discipline + code-review culture. PlanetScale (Griggs, 2026-04-21) names debuggability, silent policy misconfiguration, and pooling interactions as the cost of RLS.
**Why not here:** BokChoy already commits to DB-layer structural protection at the write boundary via M2 (§2). Going hybrid (M2 writes + app-layer reads) ships two enforcement patterns, not one — internally inconsistent. PlanetScale's debuggability concerns are real but surface as failure modes 8/9/10 below with named mitigations; the case for app-layer-only collapses given M2's existence. If M2 were reopened (small team can't carry plpgsql + RLS taxes), this alternative would also be reopened. Per `[[multi-tenant-rls-research]]` Source 12.

### MD5(player_id || secret) for de-identification
**What:** the original v1 §6 draft — `md5(p_player_id::text || current_setting('bokchoy.anon_secret'))` projected to BIGINT.
**Wins when:** the threat model excludes both adversarial collisions and accidental player_id collisions, AND collision-resistance is not load-bearing for audit integrity (hard to defend in any production scenario).
**Why not here:** MD5 collision-resistance is broken (Wang 2004; chosen-prefix Stevens 2009) — two distinct `player_id`s could collide and silently merge audit rows, a data-integrity defect even with no adversary. Suffix-keyed hashes have a separate academic break (Preneel-van Oorschot 1995). HMAC-SHA-256 has standardization (FIPS 198-1, RFC 2104) and pgcrypto already exposes it; there is no operational reason to ship the broken construction. No production engineering source defending `md5(message||key)` for GDPR de-identification was located during contradiction probe (`[[deidentify-mechanism-research]]`). **Superseded by HMAC-SHA-256 in §6 of this entry; vault preserves the rejection so future sessions don't re-derive.**

### Long-window passive webhook retry (Stripe 3-day / Shopify 4-hour shape)
**What:** retry webhooks for hours-to-days with exponential backoff, terminate by disabling the subscription.
**Wins when:** the sender can absorb the queue depth from broken receivers AND prefers "we deliver eventually" as the customer-facing contract over "you are responsible for replay."
**Why not here:** Gusto Embedded's 2025 retry-storm post-mortem documents the dominant failure mode for multi-tenant senders — broken endpoints generate retry backlog that degrades delivery for healthy customers. Shopify's 2024-09-10 changelog tightening from 19/48h to 8/4h is first-party evidence the long policy was costly to operate. BokChoy's short window + customer-driven replay (§4 + §4a/§4b/§4c) is the operator-posture choice that avoids this failure mode at multi-tenant scale. Long-window passive remains the right pick for single-tenant or tightly-controlled-receiver environments. Per `[[webhook-retry-norms-research]]`.

## Customer-facing contract obligations

These are commitments BokChoy makes to its customers (game studios using the API) and which flow into the customer's player-facing privacy policy.

1. **Webhook receivers must be idempotent.** `webhook_fire` retry policy delivers up to 8 attempts on persistent receiver failure. Each delivery includes a `delivery_id` header so receivers can de-dup. SDK + API documentation must surface this requirement; webhook-receiver examples must demonstrate de-dup.

2. **Transaction history retention disclosed.** BokChoy retains transaction-shape data (amount, currency, kind, timestamp, reason_code) under legitimate-interest basis (chargeback defense, fraud detection, regulatory cooperation) for 24 months in hot tier, then archived to cold storage. Customer privacy policy must reference this.

3. **De-identification on account close.** When a customer requests player-account deletion via BokChoy's API, BokChoy de-identifies (does not delete) the player's transactions/loot_rolls/iap_receipts rows per §6. Customer privacy policy must name this behavior. Hard-delete is opt-in customer feature only — not built at MVP.

4. **PCI scope.** BokChoy does not handle PAN (Apple/Google process cards). Customer's PCI compliance is at the platform layer; BokChoy's customer privacy policy notes that BokChoy is not a PCI environment.

5. **Cross-tenant isolation commitment.** BokChoy enforces cross-project isolation at the database layer via Postgres row-level security. No application code path can read or write across project boundaries — RLS policies + `FORCE ROW LEVEL SECURITY` + the non-owner application role guarantee this structurally, not by application discipline. Customer privacy policy may reference this commitment.

6. **Webhook delivery contract (short-window + customer-driven replay).** BokChoy retries `webhook_fire` events 8 times over ~4.3 minutes with exponential backoff. After the retry window, events go to dead-letter, queryable via the list-failed-deliveries API for 7 days (30 days at paying tier). Customers MUST monitor delivery health and replay from dead-letter when their endpoint recovers — BokChoy does not retry indefinitely. Per-subscription failure-rate limiting auto-deactivates broken endpoints to protect cross-tenant delivery; customers receive notification on auto-deactivation. SDK + API documentation must surface this contract; webhook-receiver examples must demonstrate delivery-health monitoring + replay flow.

## Failure modes

1. **`GRANT UPDATE` privilege drift on wallet tables.** A future migration grants direct UPDATE on `wallets` to the app role, silently disabling M2's structural protection. Probability: medium during migration churn; cost: high (structural protection lost). Mitigation: migration review checklist explicitly checks for GRANT changes on `wallets`/`transactions`/`loot_rolls`/`iap_receipts`; CI lint script greps migrations for `GRANT UPDATE` and fails build with manual-override required for legitimate cases.

2. **plpgsql debugging blind spots.** Bug in `wallet_credit`/`wallet_debit` is harder to reproduce in development than a TypeScript bug. Probability: medium; cost: medium. Mitigation: structured logging from inside the function emitting to OpenTelemetry; `pg_stat_statements` enabled; integration tests against the function via `db.execute()` cover the happy path + every error case (`InsufficientFunds`, idempotency-key conflict, etc.); fixtures replay against a test Postgres instance.

3. **`staged_jobs` queue depth blowup.** Side effects accumulate faster than relay workers drain. Probability: medium during traffic spikes or relay-worker outages; cost: medium (designer-visible delays). Mitigation: Prometheus metric on `staged_jobs` row count per status; alert on depth >10× rolling 5-min average per `[[idempotency-strategy]]` line 191; auto-scale relay workers; circuit-break slow third-party APIs.

4. **Stuck `running` jobs from worker crashes.** Worker crashes mid-job; row stays in `'running'`; subsequent retries blocked. Probability: medium; cost: low (delayed delivery). Mitigation: stuck-job reaper running every 60s, reset rows in `'running'` with `started_at < NOW() - INTERVAL '5 minutes'` to `'pending'`. Cadence + max-run-duration default verified against pg-boss in implementation phase per `[[runbook-idempotency]]`.

5. **Customer's webhook receiver isn't idempotent despite contract.** 8 retries on `webhook_fire` produce 8x duplicate processing. Probability: medium (customer dev mistake); cost: customer-attributed (their bug, their downstream). Mitigation: SDK includes `delivery_id` example handler; documentation surfaces the requirement; webhook contract test in customer-facing test suite asserts receiver behavior.

6. **Partition maintenance failure.** `pg_partman` cron fails, no future partition exists, INSERTs fail at month boundary. Probability: low (well-tested extension); cost: high (production outage). Mitigation: `pg_partman` cron monitored; alert on missing future partition >7 days out; manual partition-creation runbook entry as fallback.

7. **Hot-tier storage cost overrun at Studio+ scale.** Larger-than-projected adoption pushes hot Postgres into multi-TB territory faster than runway absorbs. Probability: low pre-Series-A; cost: medium (revenue justifies but burns runway). Mitigation: monitor hot-tier storage growth weekly; archive cadence accelerates if growth exceeds projections; runbook entry on emergency 18-month-cap pivot if needed.

8. **RLS leakproof regression on inner predicates.** RLS policy on `transactions` (or other multi-tenant tables) causes the planner to be conservative about pushing non-leakproof predicates past the policy, costing index usage on inner WHERE clauses. Probability: medium during query authoring (most Postgres operators are not LEAKPROOF per Pierre Ducroquet pgsql-hackers 2019, S18 in `[[multi-tenant-rls-research]]`). Cost: medium (slow queries, not lost data). Mitigation: profile representative queries with `EXPLAIN (ANALYZE, BUFFERS)` against tables with RLS enabled; mark project-internal SQL/plpgsql functions LEAKPROOF where safe; document the tradeoff in `[[runbook-idempotency]]` so query authors know to test perf with RLS active.

9. **RLS owner-bypass.** Application accidentally connects as the table-owning role (`bokchoy_admin`) — RLS is silently bypassed without `FORCE ROW LEVEL SECURITY`, exposing cross-tenant data. Probability: low (mitigated by role separation). Cost: critical (cross-tenant exposure = privacy breach). Mitigation: `FORCE ROW LEVEL SECURITY` on every protected table; CI integration test asserts `bokchoy_app` cannot read another project's rows; production connections default-deny migration-role usage at runtime. Per `[[multi-tenant-rls-research]]` Source 19 (Nile post-mortem).

10. **RLS context-bleed across requests.** Transaction reuses an old `app.current_tenant` value because a code path didn't re-set it at the start of the request. Probability: medium during refactors. Cost: critical (cross-tenant exposure). Mitigation: middleware mandates `SET LOCAL app.current_tenant = …` as the first statement of every request transaction (no read or write path bypasses); integration test verifies fresh `current_setting` on each request; the `current_setting('app.current_tenant', false)` form (without `missing_ok`) raises if the GUC is unset, providing fail-loud rather than silent-default behavior. Per `[[multi-tenant-rls-research]]` Source 19.

11. **De-id secret missing or short.** App calls `wallet_deidentify_player` without first running `SET LOCAL bokchoy.anon_secret = …`, OR the loaded secret is shorter than 32 chars (e.g. dev-environment placeholder). Probability: medium during deploy / environment setup. Cost: low (function fails closed — RAISE EXCEPTION, no de-identification executed, account-close request errors back to the caller). Mitigation: function uses `current_setting('bokchoy.anon_secret', false)` (raises on unset) + explicit `length(k_text) < 32` check; integration test in CI verifies the function errors when secret is unset. Fail-loud is the design; the failure is operational noise, not data loss.

12. **Webhook auto-deactivation false positive.** Per-subscription failure-rate limiter (§4b) auto-deactivates a customer's subscription that was experiencing transient failures (e.g. a brief CDN outage at the customer's edge); customer doesn't notice; events accumulate in dead-letter beyond their attention. Probability: low-medium (depends on threshold tuning). Cost: medium (customer-experienced delivery gap). Mitigation: customer-facing notification on auto-deactivation (email + dashboard + webhook alert to a fallback endpoint if registered); 5-minute sliding-window threshold tuned conservatively (≥80% failures over ≥10 attempts; revisit after 30 days); customer-side re-enable flow that drains the dead-letter on first re-enable. Per `[[webhook-retry-norms-research]]` Source 6.

## Mitigations summary

- **GRANT migration review:** CI script + checklist, surfaced in `[[runbook-idempotency]]`. Extends to RLS verification (every multi-tenant table has `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + at least one tenant-isolation policy).
- **plpgsql observability:** OpenTelemetry instrumentation inside functions; `pg_stat_statements` always on.
- **Outbox depth alerting:** Prometheus + alert at 10× baseline per `[[idempotency-strategy]]` line 191.
- **Stuck-job reaper:** 60-second cron, 5-minute max-run-duration default, verified before MVP ship.
- **Webhook idempotency:** SDK example handler + customer doc + customer-side contract test.
- **Webhook short-window deliverables:** list-failed-deliveries API (§4a), per-subscription failure-rate limiter (§4b), dead-letter retention ≥7 days (§4c). All required for the `webhook_fire = 8` posture to be operationally sound.
- **Partition maintenance:** `pg_partman` monitored; alert on missing future partitions. `pg_partman` availability on Supabase verified per `[[host-platform]]` cascade obligation #1.
- **Hot-tier cost:** weekly storage-growth monitoring; emergency 18-month pivot in runbook.
- **RLS verification:** integration test at CI asserts cross-tenant read returns empty; `EXPLAIN (ANALYZE, BUFFERS)` representative-query test confirms partition pruning preserved with RLS enabled (look for "Subplans Removed").
- **`SET LOCAL` middleware:** request-pipeline middleware sets `app.current_tenant` (RLS) as the first statement of every transaction; sets `bokchoy.anon_secret` (de-id) only at the start of transactions calling `wallet_deidentify_player`. Both required to be in app boilerplate, not application code paths.
- **Supavisor `SET LOCAL` semantics test:** smoke-test verifies `SET LOCAL` persists exactly through one transaction and is gone after — validates `[[host-platform]]` cascade obligation #2.

## Idiom citations

- `idioms/postgres.md` (if present) — SECURITY DEFINER functions for trust-boundary mutations; partition by RANGE on time-series; SKIP LOCKED for queue patterns. *(Idiom file not currently present in `~/.bocek/idioms/`; this entry's choices are the de-facto idiom for BokChoy's stack and warrant adding once a second decision touches the same patterns.)*
- `[[idempotency-strategy]]` — co-located on the same Postgres transaction; outbox-pattern invariant; per-step UNIQUE constraints.

## Revisit when

- **`max_attempts` per-kind values are observed against production.** First 30 days of production traffic; revise per actual receiver-failure characteristics. Folds into `[[runbook-idempotency]]`.
- **Stuck-job reaper cadence and max-run-duration are observed against pg-boss conventions.** Implementation-phase verification.
- **Hot-tier write throughput exceeds 1k writes/sec sustained at any single project.** Revisit single-Postgres-instance assumption per `[[idempotency-strategy]]` line 207.
- **Studio+ adoption pushes hot-tier storage above 5 TB.** Revisit retention window and partition cadence.
- **A customer enters a strict-deletion jurisdiction.** Build the hard-delete opt-in feature; don't change the default.
- **A customer requires real-money cashout.** Re-research path A — the regulatory regime changes, KYC retention applies, the wallet-mechanics decision shifts.
- **A future endpoint adds an expensive non-idempotent step (priced AI inference per loot roll, etc.).** Per `[[idempotency-strategy]]` D2-α/β migration trigger; that endpoint upgrades to D2-β; M2 mechanism unchanged.
- **Team size grows past 5 engineers touching the wallet path.** Re-evaluate M1 vs M2 — at small team M2's plpgsql tax is small; at larger team it scales. (M2 currently chosen partly because it scales BETTER than M1 with team growth.)
- **Projected player count per project exceeds 10M.** Anon_id BIGINT-projection collision math becomes meaningful (~5×10⁻⁴ at 100M, ~5×10⁻² at 1B). Upgrade `player_id` columns to `bytea` (full HMAC-SHA-256 output) or per-project-salted bigint; document the migration plan in `[[runbook-idempotency]]`.
- **De-id secret incident (suspected compromise or regulator mandate).** Trigger key rotation per the no-rotation-by-default policy. Add `anon_key_version SMALLINT NOT NULL DEFAULT 1` to `transactions`/`loot_rolls`/`iap_receipts` in the same migration that introduces the new key; document the rotation date in the runbook.
- **Supavisor in transaction mode diverges from vanilla PgBouncer `SET LOCAL` semantics.** §6 secret-loading + §8 RLS context-loading both depend on documented behavior. If divergence found at integration test (`[[host-platform]]` cascade obligation #2), pick: (a) switch to a different pooler, (b) switch to non-Supabase host, (c) re-architect to use a different per-request context mechanism. Per `[[multi-tenant-rls-research]]`.
- **`pg_partman` unavailable on Supabase tier.** Per `[[host-platform]]` cascade obligation #1. Swap §7 partition-lifecycle to `pg_cron` + manual DDL or alternative extension; the §7 retention model is unchanged, only the partition-management mechanism.
- **RLS leakproof regression measured > 20% on representative queries.** Profile triggered by either spec acceptance or first paying-customer perf review. Per failure mode 8: mark project-internal functions LEAKPROOF where safe, OR relocate hot queries to use a stored function bypassing the RLS policy (with M2-style explicit `project_id` parameter check inside the function).
- **PlanetScale-style app-layer enforcement reopens.** Trigger: M2 itself reopens (e.g., 1-person team can't carry both M2's plpgsql tax and RLS's debugging tax). At that point both M2 and RLS get reconsidered together; partial undo of either is incoherent.
- **Customer requests on-the-record SLA stronger than Supabase's underlying floor.** Per `[[host-platform]]`. Trigger: migrate to a host whose SLA matches BokChoy's customer-facing commitment.

## Cascade obligations

1. **CL-031 server-authoritative loot — sub-decision (iii) PRF-output → roll mapping** still owed. Sub-decision (ii) seed format + PRF + secret usage + rotation + secret-separation **resolved** per `[[loot-rng-construction]]` (HMAC_DRBG over HMAC-SHA-256, hybrid A+B canonicalization, `rng_key_id` column for rotation, independent secrets). Sub-decision (i) pity-state engine A/B/C is **moot at the platform layer** per `[[pity-engine-scope]]` — pity lives in customer extension code. Reference pity implementation is a separate cascade (item 10 below) and is now unblocked since the determinism contract is documentable.
2. **`[[runbook-idempotency]]`** — must absorb the operational items: GRANT-migration review checklist (now extended to RLS-policy-presence verification), stuck-job reaper cadence verification, outbox depth remediation, hot-tier storage growth monitoring, partition-maintenance fallback runbook, plpgsql function debugging procedure, **RLS perf-regression profiling guide**, **Apple/Google IAP outage replay runbook**, **webhook auto-deactivation customer-comms template**, **de-id secret rotation runbook (incident-only).**
3. **Customer-facing privacy policy template** — implementation-phase deliverable. BokChoy provides customers a model clause covering: legitimate-interest basis for transaction retention, 24-month-hot + cold-archive disclosure, de-identification process on account close, BokChoy's non-PCI scope, **cross-tenant isolation commitment via Postgres RLS**, **webhook short-window-with-replay delivery contract.**
4. **SDK + API docs** — webhook receiver idempotency requirement, `delivery_id` de-dup example, error-code reference for `InsufficientFunds` etc., **list-failed-deliveries API endpoint contract (§4a)**, **dead-letter replay endpoint contract (§4a)**, **webhook health-monitoring example (§4b)**.
5. **CI lint script** — greps migrations for `GRANT UPDATE`/`GRANT INSERT`/`GRANT DELETE` on protected tables; fails build pending manual sign-off. **Extends to: every new multi-tenant table must have `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + at least one tenant-isolation policy citing `current_setting('app.current_tenant')::UUID`. Migrations missing any of the three fail the build.**
6. **`[[host-platform]]` cascade obligations inherited:** verify `pg_partman` available on Supabase free + Pro tiers (§7 partition lifecycle depends on it); verify Supavisor in transaction mode preserves `SET LOCAL` semantics (§6 secret-loading + §8 RLS context-loading both depend on it). Both fail-safe — substitute extension or pooler if either diverges.
7. **Q4 — Apple/Google IAP receipt-validation outage history.** Open thread from `[[webhook-retry-norms-research]]`. Justifies or revises `iap_receipt_validate = 5`. Non-blocking; lower priority than the RLS / HMAC / webhook-deliverables cascade.
8. **Integration tests** — cross-tenant RLS read-isolation test; `SET LOCAL` Supavisor smoke test; `wallet_deidentify_player` happy-path + missing-secret-error test; webhook auto-deactivation threshold test; dead-letter replay round-trip test.
9. **AEPD/EDPS PDF verbatim quotes** for the customer-facing privacy policy template re. hash-pseudonymization regulator basis. Per `[[deidentify-mechanism-research]]` open thread #3 — local fetch + extraction needed before the privacy policy template can quote the regulator directly.
10. **Reference pity implementation in customer extension code** — MVP commitment per `[[pity-engine-scope]]` F1 mitigation. Documents per-`(player, banner_type)` keying example, carry-over toggle, soft-pity curve, win-loss flag, full `SELECT FOR UPDATE` pattern. Ships as docs artifact (`docs/extensions/reference-pity.md` or equivalent), not platform code. Estimated <1 day. Depends on cascade item 1 (CL-031 (ii)+(iii)) landing first so the determinism contract is documentable.
