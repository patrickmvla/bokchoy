---
type: research
features: [wallet, architecture]
related: ["[[wallet-mechanics]]", "[[wallet-audit-invariant-research]]", "[[wallet-source-of-truth-research]]", "[[multi-tenant-rls-research]]", "[[idempotency-strategy]]", "[[backend-stack]]"]
created: 2026-05-04
confidence: high
provisional: false
---

# What does pgledger's function source actually contain, and does BokChoy's M2 (stored-function-only-interface with privilege barrier) have a production cite?

## Question

`[[wallet-mechanics]]` §2 commits to **M2 — stored-function-only-interface**: app role has no `UPDATE` privilege on `wallets`/`transactions`/`loot_rolls`/`iap_receipts`; mutations execute through SECURITY DEFINER plpgsql functions; the app has `EXECUTE` on those functions and nothing else. The cite chain runs through `[[wallet-audit-invariant-research]]` F2 + S3, which named pgledger as the M2 production reference.

Q3 from the wallet gap-cluster /design queue (2026-05-04): **walk the pgledger function source, extract the actual mechanism, verify the M2 attribution, and surface the structural template BokChoy can transcribe for `wallet_credit`/`wallet_debit`** — including idempotency-key handling, tenant-context check, balance-update vs audit-row ordering, error-raising convention, search_path hardening, OpenTelemetry-from-plpgsql.

## Triangulation

- **Production reference:** ✓ — `pgr0ss/pgledger@b3143a3` source walked (full 288-line `pgledger.sql` + 80-line `AGENTS.md` + 4 example SQL files). MIT-licensed; observed 2026-05-04.
- **Docs reference:** ✓ — Postgres 16 `sql-createfunction.html` (current as of 2026-05-04) on SECURITY DEFINER + REVOKE/GRANT pattern + search_path hardening.
- **Contradiction probe:** ✓ — searched for production-cited M2 ledger implementations beyond pgledger via two web queries + PostgREST `db_authz` docs. **Result: no surveyed production system publishes the M2 pattern (SECURITY DEFINER + table-level REVOKE UPDATE on app role) for ledger or wallet code.** Cybertec post on SECURITY DEFINER abuse fetched but returned 403; not load-bearing for the contradiction probe given the docs-cited evidence is sufficient on the technique itself.

## Sources examined

### S1 — pgledger source

- **Tier:** 1 (production code, public repo, pinned commit, named author)
- **Provenance:** `github.com/pgr0ss/pgledger`, commit `b3143a33933e78f61a1bbf1c57ee0bf3056fd23b` (2026-04-04). Full schema + functions at `pgledger.sql`. License MIT. Author: Paul Gross. Three blog posts (`pgrs.net/2025/03/24/pgledger-ledger-implementation-in-postgresql/`, `pgrs.net/2025/05/16/pgledger-in-postgresql-is-fast/`, `pgrs.net/2025/06/17/double-entry-ledgers-missing-primitive-in-modern-software/`). Observed 2026-05-04.
- **Author context:** Independent named engineer, project-active (Renovate auto-updates running). Self-published via blog; not behind a vendor. No claim of operating at any particular scale; the 2025-05-16 post benchmarks the implementation but does not name a deployed production system that uses it.
- **What it tells us:** the actual mechanism pgledger ships, source-verified.

### S2 — Postgres 16 CREATE FUNCTION docs

- **Tier:** 2 (current official documentation, version-pinned)
- **Provenance:** `postgresql.org/docs/16/sql-createfunction.html`, observed 2026-05-04 via WebFetch.
- **Author context:** PostgreSQL Global Development Group. Canonical reference for the SQL command. Maintained per release.
- **What it tells us:** SECURITY DEFINER privilege model, the REVOKE-FROM-PUBLIC + GRANT-EXECUTE-TO-role pattern, search_path hardening (write `pg_temp` last), and the absence of specific guidance on combining SECURITY DEFINER with table-level GRANT/REVOKE.

### S3 — PostgREST db_authz docs

- **Tier:** 2 (current official documentation, version-pinned)
- **Provenance:** `docs.postgrest.org/en/v14/explanations/db_authz.html`, observed 2026-05-04.
- **Author context:** PostgREST project (production middleware in active use, Postgres-native API generator). Canonical authz guidance for the most-published Postgres-native auth pattern.
- **What it tells us:** PostgREST does not recommend the M2 pattern (SECURITY DEFINER + table-level REVOKE on app role). Multiple privilege patterns are described (per-user roles + RLS, shared role + JWT claims, hybrid) — none prescribe channeling all writes through SECURITY DEFINER functions while revoking direct table writes.

### S4 — `[[wallet-audit-invariant-research]]` (prior vault entry, 2026-05-02)

- **Tier:** prior vault entry (treated as primary source under review; not external evidence)
- **Provenance:** `.bocek/vault/architecture/wallet-audit-invariant-research.md` lines 49–57, S3 entry on pgledger.
- **What it claimed:** *"`pgledger_create_transfer()` and `pgledger_create_transfers()` functions. Account balance changes happen *only* through these functions; they are SECURITY DEFINER and enforce invariants internally before COMMITting."*
- **What this re-walk falsifies:** the SECURITY DEFINER claim is wrong. Pgledger functions are SECURITY INVOKER (the Postgres default — no `SECURITY DEFINER` clause appears anywhere in `pgledger.sql`). The "happen *only* through these functions" claim is also wrong: the `examples/lock-account.sql` example explicitly shows `UPDATE pgledger_accounts SET allow_negative_balance = 'false'` issued directly from the application — direct table UPDATE is normal usage per the project's own examples.

## Findings

### F1 — Pgledger ships M1, not M2

The privilege barrier `[[wallet-mechanics]]` §2 commits to does not exist in pgledger. Specifically:

- **Zero `SECURITY DEFINER` clauses** across all SQL in the repo (`grep -rni "security definer" pgledger.sql examples/ vendor/` returns nothing).
- **Zero `GRANT`/`REVOKE`/`CREATE ROLE`/`CREATE USER` statements** across the repo.
- The functions are SECURITY INVOKER by default (Postgres 16 docs §sql-createfunction: *"indicates that the function is to be executed with the privileges of the user that calls it. That is the default."*).
- The author's `AGENTS.md` describes the architecture as *"a small set of SQL functions"* and the README describes pgledger as *"primarily a set of functions and views"* — API-shape language, not privilege-barrier language.
- The `examples/lock-account.sql` example shows the application directly issuing `UPDATE pgledger_accounts SET allow_negative_balance = 'false' WHERE id = ...` to freeze an account. Direct table mutation is part of the documented usage.

**Pgledger's actual mechanism is M1 (app-library + discipline)** with the ergonomic tilt that *the convenient path is the function*, which provides FOR UPDATE row-locking + balance-constraint checks + atomic transfer/entry inserts for free. Calling pgledger an M2 reference is a misattribution.

### F2 — BokChoy's M2 in `[[wallet-mechanics]]` §2 has no surveyed production cite

The combination BokChoy committed to —
1. Stored function `wallet_credit` declared `SECURITY DEFINER`, owned by a migrations-only role (`bokchoy_admin`).
2. Application role `bokchoy_app` has `SELECT` on protected tables, **no** `UPDATE`/`INSERT`/`DELETE` privilege.
3. `REVOKE EXECUTE ON wallet_credit FROM PUBLIC; GRANT EXECUTE TO bokchoy_app;`
4. Function body runs as `bokchoy_admin` (table owner), so its `UPDATE wallets` succeeds inside the function.
5. App calling `SELECT wallet_credit(...)` runs as `bokchoy_app` → no direct `UPDATE wallets` possible from outside the function.
6. `SET search_path = pg_catalog, public, pg_temp` (or equivalent) on every SECURITY DEFINER function for the CVE-2018-1058 search-path hardening.

— is **technically sound per Postgres 16 docs S2** (every individual element is documented and canonical) but **has no surveyed production cite for the combined ledger/wallet pattern**. Pgledger doesn't ship it. PostgREST doesn't recommend it. Modern Treasury, Brandur, Square Books all ship M1 per `[[wallet-audit-invariant-research]]` F1. The closest published cite for the combined M2 in any context (not specifically ledger) is the multi-tenant SaaS guidance in the Q-probe results, which is tutorial-tier (5-6).

The pattern is BokChoy's synthesis. Confidence in **the technique** (works, prevents direct UPDATE bypass, search_path-safe): **high**, docs-cited. Confidence in **the technique-as-production-validated-for-ledgers**: **low** — no surveyed production system publishes it.

### F3 — Pgledger's function source as a structural template (with named gaps)

Despite the M2 misattribution, pgledger's plpgsql is a useful structural reference for parts of `wallet_credit`/`wallet_debit`. Source-walked findings:

**Concurrency: sorted-then-locked accounts pass via `FOR UPDATE`** (S1 lines 211–226). All account IDs across the transfer batch are collected, deduplicated, sorted lexicographically, then locked one-by-one with `SELECT ... FOR UPDATE`. Pessimistic row-locking; default `READ COMMITTED` isolation. **This contradicts `[[wallet-mechanics]]` *Engineering substance applied* line 466 which commits to "SERIALIZABLE for wallet writes."** Both work — pessimistic-FOR-UPDATE is simpler (no retry loop on serialization failure) but holds locks longer; SERIALIZABLE is stronger but requires a retry budget on conflict. Forking decision for /design — F3 surfaces it; does not resolve.

**Update-then-check ordering** (S1 lines 240–248). UPDATE the balance, RETURNING * INTO local var, then PERFORM the constraint-check function on the returned row. The check is post-update; a transient negative balance briefly exists in the row before being raised away. Inside the transaction this is invisible; outside, never observable. BokChoy can adopt directly.

**Balance-update before audit-row insert** (S1 lines 240–278). Sequence per transfer: (a) UPDATE source balance + version, (b) constraint check, (c) UPDATE destination balance + version, (d) constraint check, (e) cross-currency check, (f) INSERT transfer row, (g) INSERT two entry rows. Atomic inside the function; if any step raises, all roll back. `[[wallet-mechanics]]` §3 does not pin this ordering — pgledger's choice (balance-first, audit-last) is a defensible default.

**Error semantics: plain `RAISE EXCEPTION 'message %, %', val1, val2`** (S1 lines 146, 151, 232, 236, 262). No `USING ERRCODE = 'Pxxxx'` custom SQLSTATE; the error class defaults to `P0001` (`raise_exception`) per Postgres 16 docs §38.6.5. TS clients pattern-match on the message string only — brittle. **BokChoy should NOT transcribe this**; instead use `RAISE EXCEPTION 'InsufficientFunds' USING ERRCODE = 'P0010'` (or similar custom 5-character SQLSTATE in the user-defined `P0xxx` range per Postgres 16 docs §A.1) so the TS layer can dispatch on a stable code. Synthesis from S2 docs.

**ID format: prefixed ULID** (S1 lines 37–40). Pgledger uses `'pgla_' || uuid_to_ulid(uuidv7())` for accounts, `'pglt_'` for transfers, `'pgle_'` for entries. Type-distinct in logs, monotonic for index locality, ULID format URL-safe. Cross-feeds G1 (player ID type debate): pgledger picks neither UUID nor BIGINT but **prefixed ULID over UUIDv7** with v18-native fallback to a SQL-derived microsecond-precision UUIDv7. Worth surfacing as a real third option for G1.

**Concurrency primitive: per-account `version BIGINT` column** (S1 line 47, incremented on every UPDATE at lines 242 and 252). Used as a **forensic version**, not a CAS — every UPDATE increments unconditionally; the FOR UPDATE pessimistic lock IS the concurrency mechanism. Stored on every entry row (`account_version BIGINT NOT NULL` line 77) for audit-trail of "what version of the account did this entry observe." BokChoy can adopt the pattern directly: `wallets.version BIGINT`, incremented per credit/debit, copied to `transactions` row at write time — buys forensic reconstruction at <8 bytes/row cost.

**Per-account allow_negative/allow_positive_balance flags** (S1 lines 48–49, check function lines 142–154). Per-account constraint flags rather than table-level CHECK. BokChoy F2P translates: player wallets `allow_negative_balance=FALSE`, system "loss" accounts (loot drops, gift drops) `allow_negative_balance=TRUE`. Useful precedent.

### F4 — Named gaps where pgledger gives no template (BokChoy must derive elsewhere)

Pgledger does not ship and gives no template for:

1. **Idempotency-key handling.** Pgledger has no `idempotency_key` parameter; the function is not idempotent — calling it twice creates two transfers. BokChoy's `[[idempotency-strategy]]` D2-α requires `wallet_credit` to deduplicate on `(project_id, source_event_id)` (server-derived natural key) or `(project_id, idempotency_key)` (client-supplied header). The pattern must come from Brandur's `rocket-rides-atomic` `atomic_phase` Ruby (translation work) or from Postgres docs first-principles (UNIQUE constraint + lookup + FOR UPDATE row lock).
2. **Tenant-context check.** Pgledger is single-tenant; no `project_id`, no RLS, no `current_setting('app.current_tenant')` reference. BokChoy's `[[multi-tenant-rls-research]]` requires `current_setting('app.current_tenant', false)::UUID = p_project_id` enforcement at function entry (fail-closed if the GUC is unset, mismatched, or wrong type). Pattern derived from `[[multi-tenant-rls-research]]` Sources 9, 10, 14.
3. **Custom SQLSTATE error codes.** Pgledger uses default `P0001`. BokChoy needs typed errors (`InsufficientFunds`, `WalletNotFound`, `IdempotencyKeyMismatch`, `IdempotencyKeyInUse`) addressable from TS. Synthesis from Postgres 16 docs §38.6.5 (`USING ERRCODE = 'Pxxxx'`) + `[[idempotency-strategy]]` HTTP-status mapping (P0xxx → 422/409/etc).
4. **Search_path hardening.** Pgledger's functions don't set search_path because they're not SECURITY DEFINER (the CVE-2018-1058 attack class only applies to SECURITY DEFINER). BokChoy's M2 functions are SECURITY DEFINER and **must** include `SET search_path = pg_catalog, public, pg_temp` (or equivalent excluding any user-writable schema) per S2 verbatim: *"For security, `search_path` should be set to exclude any schemas writable by untrusted users."* Already templated by `[[wallet-mechanics]]` §6's `wallet_deidentify_player` (`SET search_path = pg_catalog, public`).
5. **OpenTelemetry-from-plpgsql.** Pgledger ships zero observability — no `RAISE NOTICE`, no logging, no metric emission, no span boundaries. `[[wallet-mechanics]]` *Engineering substance applied* line 468 commits to "structured logging via OpenTelemetry from the wallet-mutation function." **No surveyed production system publishes a plpgsql-to-OTel mechanism.** Open thread: this commitment may need to downgrade to "structured logging via `RAISE LOG` intercepted by client-side OTel span context, with `pg_stat_statements` for slow-query analysis" — which is what's actually feasible without inventing new infrastructure. Hand off as cascade obligation to /design.
6. **Partition-key column on the audit row.** Pgledger's `pgledger_entries` is unpartitioned. BokChoy's `transactions` is monthly-partitioned per `[[wallet-mechanics]]` §3 + §7. The function must INSERT with `created_at = NOW()` and trust pg_partman's partition-routing — straightforward, but pgledger gives no template.

### F5 — Single-entry vs double-entry: a deliberate divergence to vault

Pgledger ships **double-entry**: every transfer creates 1 `pgledger_transfers` row + 2 `pgledger_entries` rows (one per account, signed amount). The total credits and debits in any currency sum to zero. Multi-currency exchange uses 4 accounts (2 user + 2 system "liquidity" accounts) so the total per currency still sums to zero (S1 README lines 186–207).

BokChoy's `[[wallet-mechanics]]` §3 ships **single-entry**: each `transactions` row is one credit or debit, no paired counter-row. Currency is created/destroyed by the system (IAP credits gold from "outside"; loot pulls debit gold to "outside"). Pure double-entry would require BokChoy to materialize pseudo-accounts (`system.iap_inflow_USD`, `system.shop_outflow_gems`, etc.) for every system-initiated movement — a meaningful schema overhead, plus ~2× the row count on `transactions`.

This is a **deliberate design divergence**, not a gap. Virtual-currency game backends differ from real-money ledgers on this axis. Worth flagging in `[[wallet-mechanics]]` (currently doesn't name the divergence) so future readers don't try to "fix" it by adding the missing entry rows.

### F6 — Pgledger's locking strategy on multi-account batches

Pgledger's `pgledger_create_transfers` accepts an array of transfer requests and processes them in one function call. Before processing any of them, it locks **all** affected accounts in sorted order to prevent deadlocks (S1 lines 211–226). This is the classic ledger-batch pattern.

BokChoy's `wallet_credit`/`wallet_debit` per `[[wallet-mechanics]]` §2 are single-wallet operations (one `p_wallet_id BIGINT`). Multi-wallet operations would be the exception (e.g., loot roll currency-pay + currency-grant). For single-wallet operations, the deadlock-prevention pass is unnecessary — only one row is locked. Worth noting because the simplification meaningfully reduces the function body length vs pgledger.

## Conflicts

### Conflict 1 — `[[wallet-audit-invariant-research]]` S3 vs pgledger source

**Disagreement.** S3 line 56 claimed pgledger functions are SECURITY DEFINER and "Account balance changes happen *only* through these functions." Source walk falsifies both claims.

**Per *Contradiction protocol*:** production code wins over docs (and a fortiori over prior-vault summary). The S3 claim was an inference — likely from the function-style API combined with the M2-shaped framing the prior research was searching for, projected onto pgledger without source verification. **Erratum owed to `[[wallet-audit-invariant-research]]`:** S3 must be corrected, F2/F3 conclusions revised. M2 loses its sole production cite.

### Conflict 2 — `[[wallet-mechanics]]` SERIALIZABLE commitment vs pgledger pessimistic-FOR-UPDATE pattern

**Disagreement.** `[[wallet-mechanics]]` *Engineering substance applied* line 466: "SERIALIZABLE for wallet writes." Pgledger uses `READ COMMITTED` (default) + explicit `FOR UPDATE` row locks.

**Per *Contradiction protocol*:** both are valid concurrency patterns; the disagreement is on the right pattern for BokChoy's specific scale and shape, not on which one "works." Surface as forking decision for /design — Q3 does not resolve. Trade-offs:
- **SERIALIZABLE:** stronger guarantees, declarative; requires retry budget on conflict (Postgres raises `40001 serialization_failure`); idiomatic for write-light, contention-light workloads.
- **READ COMMITTED + FOR UPDATE:** simpler code, predictable lock duration, no retry loop; pgledger's choice; idiomatic for batch writes that touch known accounts.

At BokChoy's MVP scale (~3 peak writes/sec/project at indie tier per `[[idempotency-strategy]]` F12), either works. At Studio+ scale (~575 peak writes/sec/project), the difference may matter — but no public benchmark surveyed during Q3 favors one over the other.

## Conditions

The findings above hold under:

- **Pgledger version `b3143a3` (2026-04-04, MIT) on Postgres 16+.** Pgledger's UUIDv7 path uses Postgres 18's native function when available; on Postgres 16/17 it falls back to a SQL-derived microsecond-precision UUIDv7 (`pgledger_uuidv7_microsecond`). BokChoy on Postgres 17 (per `[[local-docker]]` `supabase/postgres:17.6.1.113`) uses the fallback path if it adopts pgledger-shaped IDs.
- **Postgres 16 SECURITY DEFINER + REVOKE/GRANT semantics.** Stable across 14+; no breaking changes surveyed in changelogs.
- **The contradiction probe scope was production-cited M2 ledger/wallet implementations in public repos and engineering blogs.** Could miss closed-source production systems (e.g., Stripe, PayPal, RevenueCat) that may ship M2 internally without publishing it. The absence of public cite is not absolute — it is the strongest claim Q3 can make: *"no public M2 ledger cite found in surveyed sources."*

The findings break if:
- A future pgledger version adds SECURITY DEFINER + REVOKE/GRANT (would close F1's misattribution at the source). Renovate-tracked dependency; unlikely but check on next vault touch.
- A new public production system publishes an M2 ledger implementation. Surface via Hacker News or pgledger blog citations watch.

## Operational implications

For /design (and ultimately /implementation), these findings translate to:

### Erratum to `[[wallet-audit-invariant-research]]`

Add 2026-05-04 erratum: S3's SECURITY DEFINER + "only-through-these-functions" claims about pgledger are falsified by the source-walk in this entry. F2 (M2 = pgledger pattern) is wrong; pgledger is M1. F3 ("pgledger's stored-function-only-interface is the strongest production cite for *structural* enforcement on Postgres") is also wrong — there is no production cite in pgledger for structural enforcement. The functions are an ergonomic API surface, not a privilege barrier.

### Amendment to `[[wallet-mechanics]]` §2

Two paths for /design to weigh:

**Path A — Keep M2, reframe the cite.** `[[wallet-mechanics]]` §2 keeps the M2 commitment but reframes the cite chain: the *technique* is docs-cited (Postgres 16 SECURITY DEFINER + REVOKE/GRANT — high confidence). The *technique-as-production-validated-for-ledgers* has no public cite — downgraded to *inferred-from-docs, medium*, with the explicit acknowledgment that BokChoy is novel-synthesizing for this use case. Includes the search_path hardening pattern from S2 verbatim. Self-attack: novel synthesis means BokChoy bears the unknown-unknown risk that production teams who tried this and abandoned it never published.

**Path B — Downgrade to M1 (pgledger's actual pattern).** `[[wallet-mechanics]]` §2 reframes to M1: app-library + discipline (the function set is the convenient-and-blessed path; direct UPDATE is theoretically possible but caught at code review + CI lint per cascade obligation #5). Loses the structural-vs-habitual distinction the prior decision relied on. Wins production-citation: M1 is what Brandur, Square Books, AND pgledger ship. Self-attack: the GRANT-migration drift failure mode (current Failure mode 1 in `[[wallet-mechanics]]`) reverts to a generic code-review concern — no longer caught by privilege change at all.

Q3 surfaces both; /design weighs.

### Function body shape (template for `wallet_credit`/`wallet_debit`)

Given Path A or Path B, the function bodies share most of their shape. The structural template, derived from pgledger F3/F4 + Postgres 16 docs S2 + `[[idempotency-strategy]]` D2-α + `[[multi-tenant-rls-research]]`:

```sql
CREATE OR REPLACE FUNCTION wallet_credit(
  p_project_id          UUID,
  p_wallet_id           UUID,            -- or BIGINT, pending G4 resolution
  p_amount              NUMERIC,
  p_currency_id         BIGINT,
  p_reason_code         TEXT,
  p_source_event_id     TEXT,
  p_idempotency_key_id  BIGINT DEFAULT NULL,
  p_metadata            JSONB DEFAULT '{}'::jsonb
) RETURNS UUID  -- transactions.id, type pending G4
LANGUAGE plpgsql
SECURITY DEFINER  -- if Path A; omit if Path B
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant      UUID;
  v_wallet      wallets%ROWTYPE;
  v_txn_id      UUID;
  v_existing_id UUID;
BEGIN
  -- (1) Tenant-context check — fail closed
  v_tenant := current_setting('app.current_tenant', false)::UUID;  -- raises 22023 if unset
  IF v_tenant IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'TenantMismatch: GUC=% param=%', v_tenant, p_project_id
      USING ERRCODE = 'P0020';  -- custom SQLSTATE
  END IF;

  -- (2) Idempotency-key check (when p_source_event_id non-null) — D2-α per-step UNIQUE
  IF p_source_event_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM transactions
      WHERE wallet_id = p_wallet_id AND source_event_id = p_source_event_id;
    IF FOUND THEN
      RETURN v_existing_id;  -- replay original result
    END IF;
  END IF;

  -- (3) Lock wallet row (pessimistic FOR UPDATE — pgledger pattern; SERIALIZABLE alternative omits this)
  SELECT * INTO v_wallet
    FROM wallets
    WHERE id = p_wallet_id AND project_id = p_project_id  -- defense-in-depth on tenant
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WalletNotFound: id=%', p_wallet_id USING ERRCODE = 'P0021';
  END IF;
  IF v_wallet.currency_id IS DISTINCT FROM p_currency_id THEN
    RAISE EXCEPTION 'CurrencyMismatch: wallet=%, requested=%', v_wallet.currency_id, p_currency_id
      USING ERRCODE = 'P0022';
  END IF;

  -- (4) Update balance + version (pgledger update-then-check; here the check is implicit
  --     because credit cannot make balance go negative — debit is the mirror with the InsufficientFunds raise)
  UPDATE wallets
    SET balance    = balance + p_amount,
        version    = version + 1,
        updated_at = NOW()
    WHERE id = p_wallet_id;

  -- (5) Insert audit row
  INSERT INTO transactions (
    project_id, wallet_id, player_id, kind, amount, currency_id,
    reason_code, source_event_id, idempotency_key_id, metadata
  ) VALUES (
    p_project_id, p_wallet_id, v_wallet.player_id, 'currency_credit', p_amount, p_currency_id,
    p_reason_code, p_source_event_id, p_idempotency_key_id, p_metadata
  ) RETURNING id INTO v_txn_id;

  RETURN v_txn_id;
END;
$$;

REVOKE ALL ON FUNCTION wallet_credit(UUID, UUID, NUMERIC, BIGINT, TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wallet_credit(UUID, UUID, NUMERIC, BIGINT, TEXT, TEXT, BIGINT, JSONB) TO bokchoy_app;
```

`wallet_debit` mirrors with: balance check after UPDATE (`IF balance < 0 RAISE EXCEPTION 'InsufficientFunds' USING ERRCODE = 'P0023'`), `kind = 'currency_debit'`, signed `-p_amount`. The `CHECK (balance >= 0)` table constraint is the backstop; the named exception is the API contract.

This is a **structural template, not a final body.** The wallets table shape (G4) and the player_id type (G1) gate the actual signature. Q3 does not commit to a final body — that's /design+/implementation.

### Concurrency posture (forking decision for /design)

- **SERIALIZABLE** — `[[wallet-mechanics]]` *Engineering substance applied* line 466's commitment. No FOR UPDATE clause; rely on Postgres SERIALIZABLE conflict-detection. Function callers must implement retry-on-`40001` (TS-side: catch and retry with bounded backoff). Existing literature: stronger guarantees; harder to operate; higher write-throughput cost under contention.
- **READ COMMITTED + FOR UPDATE row-lock** — pgledger's pattern. Lock the wallet row once (or all wallet rows in a multi-wallet batch, sorted to prevent deadlocks). Predictable lock duration; no retry loop; lower abstraction overhead in plpgsql. Pgledger ships this at unspecified production scale.

`[[wallet-mechanics]]` line 466 currently commits to SERIALIZABLE; pgledger's pattern would meaningfully simplify the function bodies. /design must pick one explicitly.

### Other operational implications

- **Custom SQLSTATE convention (`P0xxx` range).** BokChoy must own the convention: `P0010` InsufficientFunds, `P0020` TenantMismatch, `P0021` WalletNotFound, `P0022` CurrencyMismatch, `P0023` InsufficientFunds (debit-specific), `P0024` IdempotencyKeyMismatch (when client-supplied), `P0025` IdempotencyKeyInUse. Surfaces as a `[[wallet-mechanics]]` cascade obligation: enumerate the SQLSTATE map and pin it once.
- **OpenTelemetry-from-plpgsql is unfeasible-as-stated.** `[[wallet-mechanics]]` line 468 commits to OTel from inside the function. No production cite ships this; pgledger doesn't. Realistic alternative: emit `RAISE LOG '...'` from the function with structured key=value, and have the application's OTel span context wrap each `db.execute(sql\`SELECT wallet_credit(...)\`)` call so external timing + outcome get spanned. The plpgsql side gives slow-query data via `pg_stat_statements`; the OTel span happens at the TS boundary. Surface as cascade obligation: `[[wallet-mechanics]]` *Engineering substance applied* line 468 needs amendment.
- **G1 surfaces a third option.** Pgledger's prefixed-ULID pattern is a real third position for the player_id type debate (UUID vs BIGSERIAL). Worth flagging in `[[wallet-functions-research]]` even though G1 is owned by Q1 in the queue — Q1 should consider pgledger as an additional data point.

## Reproducibility note

Reproducible: clone `pgr0ss/pgledger` at commit `b3143a3` (or HEAD, contemporary), read `pgledger.sql` linearly, grep for `security definer\|grant\|revoke\|create role\|create user` across the repo. Cross-reference Postgres 16 `sql-createfunction.html` for the privilege model + recommended pattern. Web-search the contradiction probe queries used here (multi-tenant SaaS SECURITY DEFINER REVOKE on tables) — return set will reproduce within the freshness drift of the result-ranking.

The judgment-load-bearing claim is F2's *"no surveyed production system publishes the M2 pattern for ledger or wallet code."* This is provable only by exhaustion (search did not find one) — it is an absence-of-evidence claim. A future investigator using more / different search channels could surface a counter-example. **Confidence: high on the absence-in-surveyed-sources; medium on the absence-in-existence.**

## Open threads

- **Q3a — pgledger performance characteristics under contention.** Inherited from `[[wallet-audit-invariant-research]]` open thread #2. Pgledger's 2025-05-16 blog post benchmarks the implementation but I did not read it during Q3. Worth a follow-up read before /implementation if /design picks the pgledger pessimistic-FOR-UPDATE concurrency posture.
- **Q3b — Brandur `rocket-rides-atomic` Ruby `atomic_phase` translation to plpgsql.** Brandur ships idempotency-key handling in Ruby; pgledger ships none. The translation work needed for BokChoy's `wallet_credit` idempotency check is its own mini-investigation: the Ruby atomic_phase pattern walks the `idempotency_keys.recovery_point` state machine — which BokChoy explicitly drops per `[[idempotency-strategy]]` D2-α (no recovery-point column). The translation must take the simpler D2-α shape, not the Brandur shape. Outcome: ~15 lines of plpgsql for the idempotency check (lookup → return-existing or proceed → INSERT-after).
- **Q3c — OpenTelemetry-from-plpgsql published patterns.** Did not survey. If `[[wallet-mechanics]]` *Engineering substance applied* line 468 is to keep its OTel-from-inside-function commitment, this open thread becomes a research session. Recommended search: published Postgres-OTel exporters that capture function-internal events, vs the simpler "OTel at the call boundary + pg_stat_statements" path.
- **Q3d — Closed-source production systems (Stripe, RevenueCat, PayPal, Shopify Pay) and whether they ship M2.** Q3's contradiction probe could only find publishable cites. The unstated production patterns at major payments/billing teams are unknown. If a former Stripe/RevenueCat engineer becomes available for technical questions, this is the question to ask. Until then, M2-as-production-pattern stays at *medium* confidence (technique is sound; deployment-validated for ledgers is unknown).
