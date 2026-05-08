---
type: discovery
features: [wallet, architecture]
related: ["[[wallet-mechanics]]", "[[idempotency-strategy]]", "[[player-auth]]", "[[backend-stack]]", "[[mvp-feature-sequence]]", "[[multi-tenant-rls-research]]", "[[deidentify-mechanism-research]]"]
created: 2026-05-04
confidence: high
---

# Wallet primitive — gaps blocking first implementation slice

User asked /implementation to "open `[[mvp-feature-sequence]]` and start the first feature." First feature in the spine is **Wallet (multi-currency, atomic credit/debit, transactions log w/ reason-code taxonomy)** per `[[mvp-feature-sequence]]` Month 1–3 row.

The keystone contract `[[wallet-mechanics]]` is concrete on six surfaces (path B source-of-truth, M2 stored-function-only-interface, monthly-partitioned `transactions`, `staged_jobs` outbox, sister tables, RLS §8). It's NOT concrete on the schemas of the **adjacent tables it depends on** (`projects`, `currencies`, `wallets`, `idempotency_keys`), on the **plpgsql function bodies** that satisfy M2, on the **reason-code taxonomy** named in `[[mvp-feature-sequence]]`, and there is a load-bearing **type drift** between `[[wallet-mechanics]]` and `[[player-auth]]` on `players.id`.

Per *Anti-improvisation*, these are not implementable without flagging. Cluster reported as one set; symptom of a missing concrete-schema-shape design pass for the wallet feature.

---

## GAP 1: `players.id` type — UUID vs BIGINT vault drift

**Blocked step:** every multi-tenant table that references `player_id` — `transactions.player_id`, `loot_rolls.player_id`, `iap_receipts.player_id`, the `wallet_deidentify_player` HMAC→bigint projection in `[[wallet-mechanics]]` §6.

**What's missing:** A reconciliation between two vault entries that disagree on the load-bearing type.

- `[[player-auth]]` (created 2026-05-03) §2: `players.id UUID PRIMARY KEY DEFAULT gen_random_uuid()`. No alternative considered.
- `[[wallet-mechanics]]` (created 2026-05-02) §3, §5, §6: `player_id BIGINT NOT NULL` throughout, with a HMAC-SHA-256→63-bit-bigint projection for de-identification anon_id collision math worked out at BIGINT scale (5×10⁻⁸ at 1M players, 5×10⁻⁴ at 100M, 5×10⁻² at 1B).

`[[player-auth]]` is newer and explicitly UUID-shaped (per `gen_random_uuid()`). The `[[wallet-mechanics]]` BIGINT references are stale.

**Why it matters:** Picking BIGINT in implementation contradicts `[[player-auth]]`. Picking UUID requires re-deriving the de-id collision math (UUID is 128 bits; truncating to projected anon-UUID changes the collision-resistance analysis the wallet-mechanics §6 *Anon_id collision math* paragraph turns on). The HMAC pgcrypto projection itself changes (`('x' || encode(substring(...), 'hex'))::bit(63))::bigint` → some UUID-shaped projection like `encode(substring(hash, 1, 16), 'hex')::uuid` or similar). The §6 plpgsql cannot be written verbatim until the type is reconciled.

**Engineering substance at stake:**
- **Failure semantics:** anon_id collision profile (cross-player audit-row merge) shifts with the type pick.
- **Security:** de-identification reversibility math is keyed on the truncation width.
- **API contract:** customer SDK exposes `player_id` — UUID strings vs BIGINT integers is a public-shape choice.

**Unvetted options** (from training data — NOT recommendations):
1. **UUID wins, treat wallet-mechanics as stale.** Re-derive §6 anon_id math at UUID width (full 128-bit HMAC truncated to 122 bits or similar). UUID is `[[player-auth]]`'s intentional pick (per §2 `DEFAULT gen_random_uuid()`); the change is one /design pass on §6 plus columns swap from `BIGINT` to `UUID` across `transactions`/`loot_rolls`/`iap_receipts`. (No external source — internal vault reconciliation.)
2. **BIGINT wins, treat player-auth as stale.** `[[player-auth]]` §2 changes to `id BIGSERIAL`. Re-derive nothing on wallet-mechanics. Loses opaque-key property of UUID (BIGINT is sequence-numbered, leaks signup order). (Common older pattern; no current-best-practice cite.)
3. **Surrogate split — `players.id UUID` for external API + `players.numeric_id BIGSERIAL UNIQUE` for internal FK joins.** Both vault entries stay literal, FKs use the BIGSERIAL. Schema gains a column; cost: every `transactions.player_id BIGINT` lookup needs the surrogate column populated, and the de-id function operates on the BIGSERIAL while customer-visible records use the UUID. Inelegant but contradiction-free. (No production cite.)

**To resolve:** load-bearing inconsistency between two vault entries — `/design` recommended (the cleanest path is option 1 reconciliation, but the math re-derivation in §6 should land in /design with full evidence labeling, not in implementation by directive).

---

## GAP 2: `projects` table schema undefined

**Blocked step:** the FK target referenced by `players.project_id`, `transactions.project_id`, `wallets.project_id`, every multi-tenant RLS policy via `current_setting('app.current_tenant')::UUID = project_id`. No table to migrate against.

**What's missing:** A complete schema for `projects`. We have **fragments** scattered across the vault:

- `[[backend-stack]]` (read in earlier session per state.md): "customer-developer = Better Auth org (auth plane); project_id = RLS tenant (data plane); `projects.organization_id` FK." So `projects` has `id UUID` + `organization_id` FK to Better Auth's `organization` table.
- `[[player-auth]]` §4: `projects` gains `is_child_directed BOOLEAN NOT NULL DEFAULT FALSE` (immutable without manual review).
- `[[player-auth]]` §6: `pii_audit` table joins back to `projects` via `project_id`.
- `[[mvp-feature-sequence]]` line 17: implies projects have catalogs, currencies, items, shops — i.e. projects own a pile of child resources.
- `[[wallet-mechanics]]` §8: `bokchoy_admin` owns the table; `bokchoy_app` has `SELECT` and tenant-RLS.

**Not in any entry:** `name`, `slug`, `created_at`, API key relationship (one project → many `api_keys`?), `is_active`/lifecycle, environment differentiation (dev/staging/prod separate `project_id` per `[[idempotency-strategy]]` §"Per-tenant isolation"), customer-facing `display_name`, `region` (single-region MVP per `[[mvp-feature-sequence]]` *Engineering substance applied* but the column might exist for forward compat).

**Why it matters:** `projects` is the tenant root. Every multi-tenant table FKs to it and is RLS-scoped via `current_setting('app.current_tenant')::UUID`. Without a schema, no migration runs and `withTenant()` has nothing to anchor against. Choosing the wrong shape cascades — adding a column later under FORCE-RLS migrations is non-trivial.

**Engineering substance at stake:**
- **Concurrency:** RLS GUC type — `project_id UUID` (matches `current_setting(...)::UUID`) vs `BIGINT` (would require GUC cast change everywhere).
- **Security:** API-key model (per-project key? per-environment key? environment as separate project per idempotency-strategy?) shapes the auth flow.
- **Failure semantics:** project soft-delete vs hard-delete — does "deleted" project still satisfy RLS for in-flight requests? Cascade behavior on player_id and downstream wallets when a project is deleted.

**Unvetted options** (from training data — NOT recommendations):
1. **Minimal:** `id UUID PK DEFAULT gen_random_uuid()`, `organization_id UUID FK`, `name TEXT NOT NULL`, `slug TEXT UNIQUE`, `is_child_directed BOOLEAN NOT NULL DEFAULT FALSE`, `created_at TIMESTAMPTZ`. Defers environment, API key, soft-delete, region. (Common SaaS starter shape.)
2. **Plus environment:** add `environment TEXT NOT NULL CHECK (environment IN ('development', 'production'))` per `[[idempotency-strategy]]` "different `project_id`s" — but this contradicts the design where dev/prod are *separate* projects (env field would be redundant).
3. **Plus soft-delete:** add `deleted_at TIMESTAMPTZ NULL` for paper-trail per audit-retention norms; RLS policy gains `AND deleted_at IS NULL` clause.
4. **Plus API-key surrogate:** hold `api_keys` as a sibling table FK'd to projects (cleaner — keys rotate independently; project lifecycle separate from key lifecycle).

**To resolve:** `/design` — multiple cross-cutting decisions (environment model, API key shape, soft-delete posture) ride on this. Could conceivably resolve with minimal-shape directive if you want to defer the API-key + environment design to a later session.

---

## GAP 3: `currencies` table schema undefined

**Blocked step:** the FK target for `transactions.currency_id`, `wallets.currency_id`. Multi-currency wallet primitive per `[[mvp-feature-sequence]]` Month 1–3 cannot be implemented without it.

**What's missing:** a schema for `currencies`. No vault entry defines it.

**Not in any entry:** is `id` BIGSERIAL or UUID? Is currency project-scoped (per-project custom currencies — gems, gold, energy) or global (USD, EUR shared across all projects)? Both matter for F2P: per-`[[mvp-feature-sequence]]` "soft + hard currencies" per project is canonical for indie F2P. Per `[[mobile-f2p-economy-math-research]]` (related), faucets/drains analyze per-currency-per-project — currencies are project-scoped. Schema not enumerated.

What's referenced:
- Field `code` (e.g. `'gems'`, `'gold'`, `'energy'`) — designer-defined per project.
- Field `display_name` for dashboard.
- `minor_unit` precision: virtual currencies are typically integer with no decimals; some games have fractional energy (1.5 hearts). `[[wallet-mechanics]]` §3 has `amount NUMERIC(20,4)` — so 4 decimal places is the storage precision, but per-currency precision metadata isn't explicit.
- `is_premium BOOLEAN`? (separates hard from soft currency for IAP/conversion analytics)
- `is_tradable BOOLEAN`? (some currencies cannot leave a player; loot currencies vs cash)

**Why it matters:** Multi-currency is named in `[[mvp-feature-sequence]]` as Month 1–3 spine functionality. If currencies are global, customers cannot define their own. If per-project, the FK includes project_id (composite key or just BIGSERIAL with project_id column under RLS). The `wallet_credit` function signature `p_currency_id BIGINT` doesn't tell us how the function validates that the currency exists for the calling tenant.

**Engineering substance at stake:**
- **Consistency:** currency precision (decimal places) is per-currency or global? `transactions.amount NUMERIC(20,4)` is unconditional; do all currencies share that precision, or does the currency row specify precision used in display only?
- **Security:** RLS on currencies — must scope by project; otherwise customer A can transact in customer B's currency.
- **API contract:** SDK call shape — `wallet.credit({wallet_id, amount, currency_code})` vs `currency_id` — affects client-facing usability.

**Unvetted options** (from training data — NOT recommendations):
1. **Per-project, BIGSERIAL id:** `currencies (id BIGSERIAL PK, project_id UUID FK, code TEXT NOT NULL, display_name TEXT NOT NULL, decimals INTEGER NOT NULL DEFAULT 0, is_premium BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ, UNIQUE(project_id, code))`. RLS-scoped. Matches `[[wallet-mechanics]]` §3 `currency_id BIGINT` reference.
2. **Per-project, UUID id:** same shape with UUID — opaque, harder to read in transaction logs.
3. **Global table + per-project pin:** `currencies(id PK, code, ...)` global + `project_currencies(project_id, currency_id)` join. Wins if currencies are widely shared across projects (USD, gems-classic). Loses for designer-defined custom currencies. Likely not BokChoy's shape.

**To resolve:** `/design` if currencies have non-trivial structure (precision, tradability, ledger flags); on-the-spot directive if option 1 minimal shape is fine.

---

## GAP 4: `wallets` table schema undefined

**Blocked step:** the table that `wallet.balance` (the source of truth per `[[wallet-mechanics]]` §1) lives in. `wallet_credit/wallet_debit` cannot be written without it.

**What's missing:** a schema for `wallets`. Cross-references:
- `[[wallet-mechanics]]` §1: "`wallet.balance` is the source of truth."
- `[[wallet-mechanics]]` §3: `transactions.wallet_id BIGINT NULL` (NULL for non-wallet txns — item-only grants).
- `[[wallet-mechanics]]` §2: stored-function `wallet_credit(p_wallet_id BIGINT, ...)`.
- Multi-currency from `[[mvp-feature-sequence]]` — does each (player, currency) pair have its own row, or does `wallets` carry a JSONB `balances` column?

**Not in any entry:** unique key (one wallet per `(project_id, player_id, currency_id)`? per `(project_id, player_id)` with JSONB?). Wallet creation lifecycle (lazy-create on first credit, or eager-create on player creation?). Balance type — `NUMERIC(20,4)` matching `transactions.amount`?

**Why it matters:** the storage shape determines the credit/debit query shape. Single-row-per-currency means `UPDATE wallets SET balance = balance + $delta WHERE wallet_id = $w` (Postgres-native row-version). JSONB-balances means `UPDATE wallets SET balances = jsonb_set(balances, '{$currency}', ...)` — different concurrency profile, harder to enforce non-negative-balance on debit.

**Engineering substance at stake:**
- **Consistency:** SERIALIZABLE isolation works on either shape; non-negative-balance check is cleaner on per-currency rows (`CHECK (balance >= 0)` vs JSONB CHECK clause that's harder to read).
- **Concurrency:** per-currency rows allow row-locking only the affected wallet; JSONB locks the whole player's balance set on every credit.
- **Storage:** at scale (1M+ players × 5 currencies × 1 row each = 5M wallet rows) — fine for Postgres. JSONB compresses better but loses per-currency indexing.
- **Idempotency:** UNIQUE constraint per `[[idempotency-strategy]]` D2-α — `transactions(wallet_id, source_event_id)` UNIQUE — works either way; doesn't constrain the wallets shape.

**Unvetted options** (from training data — NOT recommendations):
1. **One row per `(project_id, player_id, currency_id)`:** `wallets (id BIGSERIAL PK, project_id UUID, player_id UUID, currency_id BIGINT, balance NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (balance >= 0), version BIGINT NOT NULL DEFAULT 0, created_at, UNIQUE(project_id, player_id, currency_id))`. Matches `[[wallet-mechanics]]` §3 `wallet_id BIGINT` reference. (Standard ledger pattern; PlayFab v2 shape.)
2. **One row per `(project_id, player_id)` with JSONB balances:** denormalized; simpler player→wallet lookup; harder concurrency story. (No production cite for game-backend usage.)
3. **No `wallets` table — derive balance from `SUM(transactions.amount)` per currency on read:** path-A-shape (event-sourced), explicitly rejected by `[[wallet-mechanics]]`.

**To resolve:** likely on-the-spot directive — option 1 is the only coherent pick given path B is decided. The remaining choices (lazy vs eager wallet creation, row-version column on day 1 or deferred) are minor; could resolve with directive or `/design`.

---

## GAP 5: `idempotency_keys` table schema undefined (referenced by FK in wallet-mechanics)

**Blocked step:** `transactions.idempotency_key_id BIGINT NULL REFERENCES idempotency_keys(id)` per `[[wallet-mechanics]]` §3 and `loot_rolls.idempotency_key_id`, `iap_receipts.idempotency_key_id`, `staged_jobs.idempotency_key_id`. Cannot migrate transactions without `idempotency_keys`.

**What's missing:** an exact schema. `[[idempotency-strategy]]` *Engineering substance applied* says: *"`idempotency` records may live on the `transactions` table … or in a separate `idempotency_keys` table — schema specifics deferred to implementation."* `[[wallet-mechanics]]` made the table-separation choice (separate table; FK from transactions). Schema not pinned.

**Reference:** Brandur's `rocket-rides-atomic@94b370d` schema (per `[[idempotency-strategy-research]]` §S10):

```sql
CREATE TABLE idempotency_keys (
    id              BIGSERIAL   PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    idempotency_key TEXT        NOT NULL CHECK (char_length(idempotency_key) <= 100),
    last_run_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at       TIMESTAMPTZ DEFAULT now(),
    request_method  TEXT        NOT NULL,
    request_params  JSONB       NOT NULL,
    request_path    TEXT        NOT NULL,
    response_code   INT         NULL,
    response_body   JSONB       NULL,
    recovery_point  TEXT        NOT NULL CHECK (char_length(recovery_point) <= 50),
    user_id         BIGINT      NOT NULL
);
CREATE UNIQUE INDEX idempotency_keys_user_id_idempotency_key
    ON idempotency_keys (user_id, idempotency_key);
```

**Adjustments BokChoy needs vs Brandur:**
- Scope: `(project_id UUID, idempotency_key TEXT)` UNIQUE per `[[idempotency-strategy]]`. Replaces `user_id`.
- Length cap: 255 chars (Stripe-match) per `[[idempotency-strategy]]`, not 100 (Brandur).
- `recovery_point`: D2-α explicitly drops this column per `[[idempotency-strategy]]`. NULL or omitted.
- `request_path`/`request_method`/`request_params`: needed for parameter-mismatch detection (HTTP 422). Body-hash vs full-JSONB is a sub-decision (hash is smaller; JSONB is exact).
- `response_status` (renamed from `response_code` for clarity).
- TTL/reaper: 24h cap per Shopify-cite; reaper job is not table schema but cron sibling.
- RLS: `ENABLE ROW LEVEL SECURITY` + tenant policy on `project_id`.

**Why it matters:** This is the cross-cutting infra table for every mutating endpoint. Field choices (full request_params JSONB vs body-hash, response_status column shape) affect API ergonomics and storage cost. The `locked_at` semantics (initial `DEFAULT now()` per Brandur, or NULL until in-flight per a cleaner design) affect the 409 in-flight detection logic.

**Engineering substance at stake:**
- **Concurrency:** the `locked_at` default (`now()` Brandur-shape vs NULL-until-locked) changes how an in-flight check reads. Brandur's default-now means every fresh row "appears in-flight" which the application code sorts out via a row-state field. NULL-until-locked is simpler.
- **Storage:** request_params JSONB at 255-char-key + average 200-byte body × 24h × throughput ≈ a few MB/project/day at indie tier; manageable.
- **Failure semantics:** parameter-mismatch detection — JSONB equality (Postgres `@>`/`<@` operators) is exact; body-hash needs canonical JSON serialization to avoid false-positive mismatches on key reordering.

**Unvetted options** (from training data — NOT recommendations):
1. **Adopt Brandur shape, swap user_id→project_id, drop recovery_point, extend cap to 255.** Keeps full request_params JSONB. Standard. (Brandur reference impl.)
2. **Hash-based parameter-mismatch:** drop request_params JSONB, store `request_body_hash BYTEA NOT NULL` (SHA-256 of canonical-JSON-serialized body). Smaller storage; depends on canonical-JSON discipline. (Stripe — inferred, not docs-cited.)
3. **NULL-until-locked variant:** `locked_at TIMESTAMPTZ NULL`, `completed_at TIMESTAMPTZ NULL`; row state derived from columns rather than explicit field. (Cleaner; no production cite I know.)

**To resolve:** likely on-the-spot directive — option 1 is the production-cited default. The hash-vs-JSONB sub-decision is minor and could go either way without /design. The Brandur 24h reaper cron sits with the table.

---

## GAP 6: `wallet_credit` and `wallet_debit` plpgsql function bodies undefined

**Blocked step:** `[[wallet-mechanics]]` §2 spells signatures with `$$ ... $$;` placeholder bodies. These are the M2 mechanism; without the bodies there's no callable contract.

**What's missing:** the exact plpgsql for:
- Idempotency-key check (lookup by `(project_id, idempotency_key)`, return prior result if present, raise 409 if locked, lock row otherwise) — this is the load-bearing pattern from `[[idempotency-strategy]]` *Engineering substance applied*.
- Tenant context check (`current_setting('app.current_tenant')::UUID = p_project_id` — must match RLS GUC, otherwise raise).
- `wallet_credit`: lookup wallet, increment balance, INSERT transactions row (kind='currency_credit', amount=p_amount), return transactions.id.
- `wallet_debit`: same shape, decrement balance, raise `InsufficientFunds` if balance after decrement < 0 (the `CHECK (balance >= 0)` is a backstop, but the function should raise a typed error). `[[wallet-mechanics]]` §6 names `InsufficientFunds` but doesn't enumerate the SQLSTATE/error code conventions.
- `search_path` hardening — `[[wallet-mechanics]]` §6 example uses `SET search_path = pg_catalog, public` for `wallet_deidentify_player`. The same applies here (SECURITY DEFINER functions need search_path pinned to prevent search-path-based privilege escalation).

**Why it matters:** these functions ARE the wallet primitive. Every higher-level write goes through them. Errors raised here become the public error contract. Internal SQL shape (use of `FOR UPDATE` row-locking, isolation-level expectations, transactions row insert order vs balance update order) is load-bearing.

**Engineering substance at stake:**
- **Consistency:** order-of-writes matters for crash recovery — INSERT transactions then UPDATE wallets means a crash mid-function leaves an audit row with no balance change (rollback fixes it inside SERIALIZABLE; outside SERIALIZABLE there's a window). `[[wallet-mechanics]]` §"Engineering substance applied" line 462 commits to SERIALIZABLE so the order is moot for atomicity but still matters for diagnostic reading.
- **Failure semantics:** error codes — `InsufficientFunds` (custom SQLSTATE 'P0001' RAISE EXCEPTION? or a Postgres-native RAISE NOTICE pattern?). Must map to something the TS layer can pattern-match on (`error.code === 'P0001' && error.message === 'InsufficientFunds'` is brittle; named-exception classes via SQLSTATE custom codes per Postgres docs §43.6.5 are cleaner).
- **Observability:** OpenTelemetry instrumentation from inside plpgsql is not free — the project has not picked an OTel-emit-from-plpgsql mechanism (RAISE NOTICE intercepted by client? Direct INSERT into a span table? The `[[wallet-mechanics]]` *Engineering substance applied* commits to it without naming the mechanism).

**Unvetted options** (from training data — NOT recommendations):
1. **Brandur-shape plpgsql:** mirror Brandur's `atomic_phase` pattern — idempotency_keys lookup with FOR UPDATE, then per-recovery-point logic; for D2-α single-step, reduce to one phase. Need to translate Ruby/Rails idiom to plpgsql. (Brandur reference impl is Ruby; plpgsql translation is structurally equivalent but not source-citable line-by-line.)
2. **pgledger-shape plpgsql:** pgledger has a published function set for the same M2 pattern. If the source is open and license-compatible, transcribing the shape is the strongest production cite. Need to verify availability and license. (`[[wallet-audit-invariant-research]]` F2 cites pgledger but I haven't read the function source.)
3. **First-principles:** derive from `[[wallet-mechanics]]` §1+§2+§3 invariants directly. Risk: mode-collapse to LLM-default plpgsql which is a known thin spot in training data.

**To resolve:** `/design` recommended. Function bodies are non-trivial code (~50–100 lines each with idempotency-handling, tenant check, error semantics, search_path pinning). They're the wallet primitive's Ricci tensor — small mistakes in error semantics or SQLSTATE choice cascade to every TS call site. /design with explicit pgledger source-walk + Brandur translation gets the production-cited shape; first-principles in implementation gets the LLM-default.

---

## GAP 7: Reason-code taxonomy undefined

**Blocked step:** the values that `transactions.reason_code TEXT NOT NULL` may carry. Every `wallet_credit/wallet_debit/inventory_grant/inventory_consume` call asks the caller for `p_reason_code TEXT` per `[[wallet-mechanics]]` §2 signature. No CHECK constraint, no enumeration, no validation.

**What's missing:** the list of reason codes. `[[mvp-feature-sequence]]` Month 1–3 spine names "transactions log w/ reason-code taxonomy" — the taxonomy is part of the spine but not enumerated. `[[mobile-f2p-economy-math-research]]` (related, per Topic 3) names *faucet/drain dashboard groups by reason-code* (Month 6) — the taxonomy needs to support that grouping.

What's referenced indirectly:
- `[[wallet-mechanics]]` §3 `kind TEXT CHECK (kind IN ('currency_credit', 'currency_debit', 'item_grant', 'item_consume', 'compensation_grant'))`. `kind` is the *operation-type taxonomy* — orthogonal to reason-code.
- `[[wallet-mechanics]]` §3 `related_type TEXT CHECK (related_type IN ('loot_roll', 'iap_receipt', 'compensation_grant'))`. `related_type` is the *side-table-link taxonomy* — also orthogonal.
- `reason_code` is the *business-context taxonomy* — what game-event caused this credit/debit. Examples from F2P industry: `signup_bonus`, `daily_login`, `quest_complete`, `iap_grant`, `loot_pull_cost`, `loot_pull_reward`, `shop_purchase_cost`, `shop_purchase_grant`, `compensation`, `admin_adjustment`. **No vault entry enumerates these.**

**Why it matters:** without an enumeration there's no faucet/drain dashboard grouping (Month 6 deliverable). Without a CHECK constraint, designers will free-text and the dashboard can't group reliably. This is a cross-spine decision — Month 1 wallet writes must already include valid reason codes when Month 6's dashboard reads them.

**Engineering substance at stake:**
- **Observability:** faucet/drain dashboard depends on this taxonomy being closed (CHECK enum) for grouping. Open taxonomy means designers spell `signup_bonus` and `signupBonus` differently; dashboard breaks.
- **API contract:** SDK call sites pass reason_code. If the taxonomy is closed, SDK exposes it as an enum/union; if open, free-text. Closed is harder to extend without a migration; open is harder to govern.
- **Versioning:** if the taxonomy is closed, adding `battle_pass_reward` in Month 6 requires a migration touching `transactions` (CHECK constraint update) and the SDK. If open, just SDK update.

**Unvetted options** (from training data — NOT recommendations):
1. **Closed CHECK enum on transactions, full taxonomy in vault:** define the full Month 1 spine reason codes now (~12–20 codes), CHECK on the column, SDK exposes typed enum. Future-month additions require migration. (Stripe ledger-shape — Stripe's reason codes are closed.)
2. **Open TEXT with per-project allowlist in `currencies` or a sibling `reason_codes` table:** customer can register their own reason codes; CHECK is FK to allowlist. Designers can extend without BokChoy migration. (LootLocker-shape, inferred.)
3. **Open TEXT with no constraint, soft-validation in SDK:** TypeScript SDK exposes a recommended-set type but accepts any string. Postgres column has no CHECK. Faucet/drain dashboard groups by best-effort on observed values. (Most permissive; loses dashboard reliability.)

**To resolve:** `/design` — this is a taxonomy decision that touches the wallet API contract, the dashboard, the SDK, and customer-extensibility posture. Should not be picked from training data.

---

## Summary

Seven gaps cluster around one missing dimension: **the wallet feature's concrete schema and code shape, beyond the keystone `[[wallet-mechanics]]` decision's high-level invariants.**

`[[wallet-mechanics]]` is concrete on *patterns* (path B, M2, RLS §8, sister tables, retention model). It defers the *adjacent table schemas* (projects, currencies, wallets, idempotency_keys), the *function bodies*, and the *reason-code taxonomy*. Plus there's a UUID-vs-BIGINT type drift between `[[player-auth]]` and `[[wallet-mechanics]]` that must reconcile before any of the schemas below are committed.

**Recommendation (per *Anti-improvisation*):** switch to `/design`. Single design pass can resolve gaps 1, 2, 3, 4, 6, 7 as a coherent set (they're symptoms of the same missing schema-shape decision). Gap 5 (`idempotency_keys` shape) could resolve with directive in this implementation seat if the user wants to pick option 1 (Brandur-shape with project_id/255-cap/no-recovery-point) without /design ceremony — but resolving it with the others in /design is cleaner.

If the user prefers on-the-spot directives instead of /design, a minimal-shape directive for each table (with the type drift resolved as option 1: UUID wins, wallet-mechanics §6 math re-derived) could unblock the first wallet slice. /design is the safer path because §6's collision math is load-bearing for the de-identification security claim.

---

## GAP 8 (surfaced 2026-05-08, slice 3 — partitioning): `loot_rolls`/`iap_receipts` UNIQUE-vs-partition-key structural conflict

**Blocked step:** `[[wallet-mechanics]]` §7 *Retention model* commits to monthly-partition + S3-archival for `transactions`, `loot_rolls`, **and** `iap_receipts`: *"The same partitioning + tiering applies to `loot_rolls` and `iap_receipts` (sister tables grow with `transactions`)."* Slice 3 attempted to apply `PARTITION BY RANGE (created_at)` to all three.

**What's missing:** Postgres declarative partitioning (PG 11+) requires the partition key to be present in **every** UNIQUE constraint on the partitioned table. The §5 sister-table schemas have UNIQUEs that *don't* include `created_at`:

```sql
-- loot_rolls (per [[wallet-mechanics]] §5 + [[idempotency-strategy]] F14):
UNIQUE (player_id, banner_id, pull_session_id, attempt_number)

-- iap_receipts (per [[wallet-mechanics]] §5):
UNIQUE (platform, platform_transaction_id)  -- platform-side idempotency
```

Both are load-bearing for idempotency correctness — they prevent double-fulfillment. Adding `created_at` would let the same `(player_id, banner, session, attempt)` tuple recur across months and bypass the dup-check. That defeats the constraint's purpose.

**Engineering substance at stake:**
- **Failure semantics:** without the UNIQUE, double-fulfillment becomes possible — a retried client could be granted the same loot pull twice, or an Apple receipt could be redeemed twice. `[[idempotency-strategy]]` F14 names the loot UNIQUE specifically as the natural-key idempotency anchor.
- **Storage / retention:** `transactions` is the high-volume table (240M rows × 24 months projection per `[[wallet-mechanics]]` Failure mode 7); pruning matters there. `loot_rolls` and `iap_receipts` grow proportionally but at fractional volume. Retention without partitioning is `DELETE FROM x WHERE created_at < NOW() - INTERVAL '24 months'` on a cron — slower and IO-noisier than `DETACH PARTITION`, but workable at sister-table scale.
- **Pruning:** `transactions` queries gain partition pruning when filtered by `created_at` (the §3 indexes are mostly `(col, created_at)`). `loot_rolls`/`iap_receipts` queries are typically by player_id or platform_id, not date-range — partition pruning by `created_at` would help less.

**Unvetted options** (from training data — NOT recommendations):

1. **Partition `transactions` only; keep `loot_rolls` + `iap_receipts` flat.** Apply retention via cron-driven DELETE batches + archival queries to S3 against the flat tables. Workable; loses the operational ergonomics of `DETACH PARTITION` but preserves the §5 UNIQUE invariants. *Slice 3 ships this as the default — see Slice-3 deviation below.*

2. **Add `created_at` to the §5 UNIQUEs and require callers to canonicalize the timestamp** (e.g., quantize to the day or pass an explicit `created_at` they store-and-retry). Defeats the natural-idempotency benefit of `pull_session_id` / `platform_transaction_id`; pushes complexity onto the SDK + caller. Strong reject.

3. **Hash-partition `loot_rolls`/`iap_receipts` on the unique-anchor column** (e.g., `HASH (player_id)` for loot_rolls, `HASH (platform_transaction_id)` for iap_receipts). Preserves the UNIQUE because the hash key is included. Loses time-based retention via partition drop — old data is spread across all partitions. Retention falls back to DELETE-by-date. Same effective outcome as option 1 but with extra schema complexity and worse query patterns.

4. **Range-partition `loot_rolls`/`iap_receipts` by `id` (BIGSERIAL)** — id growth correlates with time so old data lives in old partitions. UNIQUE constraint must include `id` (or partition-key column), which is automatic for the table PK; the §5 UNIQUEs that don't include `id` still conflict with the partition-key requirement. Same conflict, different shape.

5. **Move the UNIQUE constraint to a separate non-partitioned lookup table.** E.g., `loot_roll_dedup_keys (player_id, banner_id, pull_session_id, attempt_number, loot_roll_id BIGINT REFERENCES loot_rolls(id))` flat with PK on the dedup tuple, and `loot_rolls` itself partitioned. Enforces uniqueness via the lookup table; retention drops both tables in lockstep (cron-driven delete on the lookup table for rows whose `loot_roll_id` no longer exists in retained partitions). Adds a join on every loot-roll write/read. Real production-cite uncertain.

**Slice-3 deviation from §7:** `transactions` partitioned per spec (no conflict). `loot_rolls` + `iap_receipts` ship FLAT in Slice 3, with retention via DELETE-by-date cron handled in a future slice (alongside pg_partman setup for `transactions`). The §7 "same partitioning applies" obligation for the sister tables is **deferred and downgraded to "same retention applies via different mechanism"** until /design picks one of the options above.

**To resolve:** `/design` recommended. The trade-off is across (a) idempotency invariant (§5 UNIQUEs are load-bearing), (b) operational ergonomics of partition retention vs cron DELETE, (c) schema complexity of a separate lookup table. Option 1 (this slice's default) is the smallest scope-control move and preserves the load-bearing invariant. Option 5 is the most "fully partition everything" but adds a join and a coordination burden. The right answer depends on whether sister-table retention via cron DELETE is acceptable at Studio+ projection scale.

---

## Summary (updated 2026-05-08 — 8 gaps total, gaps 1–7 resolved by 2026-05-04 design+research passes; gap 8 surfaced during Slice 3 implementation)
