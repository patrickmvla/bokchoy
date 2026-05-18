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

## GAP 9 (surfaced 2026-05-09, slice 8.1 — first wallet HTTP handler): wallet HTTP contract + cross-cutting middleware shape undefined

**Blocked step:** `apps/backend/src/wallet/index.ts` — the placeholder is `export {};` and the user picked "first wallet HTTP handler" as the next slice. The wrapper layer (`@bokchoy/wallet`) is fully landed (slice 7.7) and quotes its own contract verbatim from `[[wrapper-shape]]`. The HTTP-layer contract that consumes those wrappers is **not** in the vault.

**What's missing:** a coherent design pass for the wallet HTTP surface + the cross-cutting middleware it activates. Eight subdecisions cluster, none individually large, but each shapes the public API or the middleware stack downstream features inherit.

### G1. HTTP route shape

- Path scheme: `/v1/wallets/{walletId}/credit` vs `/v1/projects/{projectId}/wallets/{walletId}/credit` vs `/v1/games/{gameId}/wallets/credit` vs RPC-style `/v1/wallet.credit`.
- Method: POST conventional but unpinned for credit/debit specifically.
- Body field casing: wrapper takes camelCase (`walletId`, `currencyId`); HTTP body convention undecided. Stripe uses snake_case at the wire boundary.
- Response envelope: bare `{ transaction_id }` vs Stripe-style `{ id, object: 'transaction', ... }` vs `{ data: {...} }` vs RFC 8288-shaped.
- Version prefix: `[[wallet-mechanics]]` line 439 mentions `POST /v1/webhooks/...` once; no formal commitment to `/v1` for wallet.

### G2. Validation library at the HTTP boundary

`idioms/typescript.md` line 75 (*"For libraries … accept `StandardSchemaV1<unknown, T>`"*) governs library code, not app code. Hono pairs naturally with `@hono/zod-validator`, `@hono/valibot-validator`, or `@hono/standard-validator`. No vault pick.

### G3. Authentication for THE first wallet handler

Three documented surfaces in `[[backend-stack]]` §7 + `[[player-auth]]`, three different middleware stacks, none pinned:

- **SDK API key** (`Authorization: Bearer <key>`, validated server-side against `api_keys` table — table doesn't exist yet; `[[backend-stack]]` cascade obligation #4).
- **Better Auth player session** (cookie or token via the `anonymous` plugin per `[[player-auth]]`).
- **Cockpit admin session** (Better Auth org-member, for designer-initiated grants).

Wallet credit's *production* caller is most likely a game server (SDK API key path), but compensation grants from the cockpit are also a valid first-handler target. The `api_keys` infra is its own slice.

### G4. Idempotency middleware co-shipping vs stubbing

The wrapper accepts `idempotencyKeyId?: number` (HTTP middleware path, slice 4.6) and `sourceEventId?: string` (server-derived natural-key path, `[[idempotency-strategy]]` default). Three positions:

- **Co-ship slice 4.6** — full Idempotency-Key middleware lands with this slice. First `INSERT INTO idempotency_keys` reopens `[[reaper-schedule-deferral]]` per the trigger watchpoint in state.md.
- **Skip 4.6** — require `sourceEventId` in body, server-derived natural key only. No `idempotency_keys` write; trigger doesn't fire.
- **Stub 4.6** — accept the header, ignore it (or log), keep middleware shape forward-compatible.

### G5. Error middleware response-body shape

Hono `app.onError` translates `WalletError` → HTTP response. BCxxx → status code is pinned in `[[wallet-mechanics]]`; the **body shape** isn't:

- Stripe-style `{ error: { type, code, message, ... } }` — production-cited at framework-defining level.
- RFC 7807 `{ type, title, status, detail, instance }` — IETF standard for problem+json.
- BokChoy-custom `{ error_code, error_details }` — owns the namespace; `[[idempotency-strategy]]` already uses `bokchoy_idempotency_key_*` codes which suggests namespace-owned.

Affects every error-emitting endpoint downstream. Sets the SDK error-parsing surface.

### G6. F1 `TenantTx` branded type — open thread, trigger fires here

Per `[[backend-stack]]` F1 mitigation #2: type-level mirror of RLS via branded `Tx`. State.md's open-thread carry-forward names this as parked *"until first RLS-protected feature schema landed"*. That landing is now. Without it, `withTenant(...)` returns raw `Tx`; with it, RLS-protected accessors require a `TenantTx` brand obtainable only inside `withTenant`'s callback. Type-level discipline vs current runtime-only discipline.

### G7. OTel SDK + exporter wiring

Each wrapper has a `// TODO(otel): wrap with span per [[wallet-mechanics]] Amendment Part 1 A3 layer 1` marker. `[[backend-stack]]` defers SDK pick *"to first consumer"* — that's now. Sub-decisions: Node SDK vs OTel auto-instrumentation, exporter target (OTLP/HTTP to which collector), span attribute conventions (`bokchoy.project_id`, `bokchoy.wallet_id` per `[[wrapper-shape]]` Engineering substance).

### G8. `project_id` + `walletId` data sources in the request

Wrapper takes `projectId` (must match GUC) and `walletId`. HTTP layer must source both:

- `projectId`: from authenticated API-key lookup? from request header `BokChoy-Project-Id` per `[[idempotency-strategy]]` Engineering substance? from path segment? — depends on G3 auth pick.
- `walletId`: path segment vs body field — depends on G1 path shape.
- `playerId`: not directly required by `walletCredit` (the wallet row already binds player+currency), but compensation/admin paths may want it for audit; `wallet_deidentify_player` *does* take it.

### What's already pinned (the floor /design starts from)

- Wrapper signatures + error class — `[[wrapper-shape]]` (slice 7.7 verbatim).
- BCxxx → HTTP status — `[[wallet-mechanics]]` §SQLSTATE: BC001→409, BC002/010/021/022/050/060→422, BC020/040→500.
- Idempotency-Key header semantics — `[[idempotency-strategy]]`: 255 chars, `bokchoy_idempotency_key_*` codes, 422 mismatch / 409 in-flight, hybrid server-derived OR client header.
- `withTenant(db, projectId, fn)` is the RLS discipline; `@bokchoy/db` exports it (slice 6.5).
- Auth-surface inventory — `[[backend-stack]]` §7 (SDK API key + Better Auth player session + Better Auth org session); cascade obligation #4 names `api_keys` table.
- Hono framework + `@hono/node-server` adapter — slice 8.0 already wired.
- Cross-runtime imports rule — `[[backend-stack]]` Amendment line 27.

### Engineering substance at stake

- **API contract permanence:** G1 + G2 + G5 set the public HTTP surface. Catalog, loot, IAP, cockpit, sdk all inherit the conventions. Picking from training-data default at slice 1 freezes BokChoy into "what was loudest at training time" — exactly the failure mode `/design` exists to prevent.
- **Failure semantics:** G4's three branches give different observable behavior on retry storms. G5's body shape is what every customer SDK parses.
- **Security:** G3 + G8 set the trust boundary. RLS GUC is downstream of whichever middleware sets it. Incorrect tenant-scope inheritance is the failure mode RLS exists to defend against.
- **Concurrency:** G6 is type-level discipline that prevents runtime bypass. Trigger fires now; deferring leaves a known typed-hole through every RLS handler that follows.
- **Observability:** G7's OTel pick is what every span attribute and exporter target depends on. Cascades to the cockpit's audit surface.

### Unvetted options (clearly NOT recommendations)

For G1 path shape:

1. **Stripe-style flat resource path:** `/v1/wallet/credit` (POST), body carries `wallet_id` + everything. Stripe ships `/v1/charges`, `/v1/refunds` — flat resource verbs. (Production-cited × 1: Stripe.)
2. **REST nested:** `/v1/wallets/{walletId}/credits` (POST). RESTful per RFC 7231 nounification. Common in Rails-shape APIs. (Common pattern; no specific cite.)
3. **RPC-style:** `/v1/wallet.credit` (POST), Google API guide-style. Wins when operations don't map cleanly to nouns. (Production-cited: Google Cloud APIs.)
4. **gRPC-Gateway / tRPC over HTTP:** path is generated; no manual route declaration. Mismatched with Hono's manual-route shape. (Production-cited: tRPC.)

For G2 validator:

1. **Zod via `@hono/zod-validator`:** dominant TS validator 2025-2026; production-cited at framework-defining level; ecosystem maturity. (Production-cited × many.)
2. **Valibot via `@hono/valibot-validator`:** smaller bundle than Zod; modular; growing adoption. (Production-cited × few.)
3. **Standard Schema spec via `@hono/standard-validator`:** library-author neutrality; accepts any Standard Schema. Works for app code too. (Spec-cited per `idioms/typescript.md`.)

For G3 auth-surface for first handler:

1. **SDK API key (Bearer):** ships `api_keys` table + HMAC validation middleware + `Authorization: Bearer` parsing. Most-likely production caller (game server). Largest scope.
2. **Better Auth player session:** wires Better Auth, ships player auth flows. Even larger scope (anonymous plugin, argon2, organization plugin per `[[backend-stack]]`).
3. **Cockpit admin session:** smallest scope (Better Auth org member only); but compensation/admin grants are a niche first-handler target.
4. **Stub / no auth:** dev-only `X-Project-Id` header, validated as UUID, no signature. Useful for smoke-testing the wrapper integration; obvious removal blocker before production.

For G5 error body shape:

1. **Stripe shape `{ error: { type, code, message, param?, ... } }`:** production-cited at framework-defining level; SDK-friendly. (Production-cited × Stripe.)
2. **RFC 7807 `{ type, title, status, detail, instance }`:** IETF standard problem+json. Production-cited via Spring-Boot's defaults, growing in TS ecosystem. (Spec-cited × IETF.)
3. **BokChoy-custom `{ error_code, error_details: ErrorDetails }`:** owns the namespace; aligns with `[[wrapper-shape]]`'s `WalletError.code/details` discriminated union — the wrapper layer's structured error already maps cleanly to this shape. (No production cite; internal coherence with wrapper layer.)

### To resolve

`/design` recommended. The cluster shapes the public API surface + cross-cutting middleware for every HTTP-emitting feature that comes after wallet (catalog, loot, IAP, cockpit, sdk). Picking the wallet credit endpoint shape *first* and reverse-engineering everything else is the wrong direction — these decisions belong upstream of the first endpoint.

Likely vault output: a new entry `[[wallet-http-contract]]` (or broader `[[backend-http-contract]]` if the conventions span features) covering G1/G2/G5; small amendments to `[[backend-stack]]` for G3 auth-surface ordering + G7 OTel pick; small amendment to `[[idempotency-strategy]]` if G4 lands middleware now; an open thread closure for G6 F1 `TenantTx`. Gaps 1-7 took one /design pass each in 2026-05-04; this cluster looks similar in shape.

`/implementation` resumes once the entry lands — the first wallet HTTP handler is then a quote-and-execute slice with no remaining gaps.

---

## GAP 9 RESOLVED 2026-05-09 — `[[wallet-http-contract]]` LANDED

All 8 sub-decisions resolved across three research entries (`[[http-contract-research]]`, `[[otel-stack-research]]`, `[[url-pattern-research]]`) + one /design pass producing `[[wallet-http-contract]]`. Slice 8.1 splits into 8.1a (auth + RLS type) + 8.1b (telemetry + idempotency middleware) + 8.1c (wallet handler). G1 URL pattern resolves to `POST /v1/wallets/{walletId}/credit` (slash-suffix-verb, production-cited × 2 via Stripe + GitHub). G2 validator: `@hono/standard-validator` + Zod 4.x. G3 auth: SDK API key (Bearer) co-shipped in 8.1a. G4 idempotency middleware co-shipped in 8.1b. G5 error body: Stripe-wrapped `{error:{code,message,...}}`. G6 `TenantTx` brand co-shipped in 8.1a. G7 OTel co-shipped in 8.1b (Honeycomb endpoint, manual instrumentation, no auto-instrumentations-node). G8 data sources resolve via G3.

**RFC cite correction (2026-05-09):** GAP 9 G5 originally referenced "RFC 7807" — that spec is **superseded by RFC 9457 (July 2023, Standards Track, obsoletes 7807)** per `[[http-contract-research]]` Source 11. The /design pick (X) Stripe-wrapped doesn't depend on either RFC; the cite correction is bookkeeping. RFC 9457 was rejected as Alternative (Z) — spec-cited only, no major TS-native production adopter surfaced in the contradiction probe.

**/design correction (2026-05-09):** GAP 9 G1 unvetted option (a) flat-action `POST /v1/wallet/credit` was based on a misread of Stripe's pattern. `[[url-pattern-research]]` source-walked stripe-node and confirmed Stripe ships `POST /v1/charges/{id}/capture` slash-suffix-verb on resource id, NOT flat. Pattern (d) `POST /v1/wallets/{walletId}/credit` is the production-cited answer.

---

## GAP 10 (surfaced 2026-05-10, slice 8.1b — idempotency middleware): `// allow-direct-mutation` opt-out semantics don't fit multi-line tagged-template SQL

**Blocked step:** static check `bun run check:direct-mutation` fails with 3 hits at `apps/backend/src/idempotency/middleware.ts:139,175,230` — the three legitimate M1-trigger writes per `[[wallet-http-contract]]` G4 + `[[idempotency-strategy]]` D2-α. Slice 8.1b can't pass CI until the opt-out can be expressed.

**What's missing:** A vaulted decision on how `// allow-direct-mutation:` opt-out is expressed when the protected-table mutation lives inside a multi-line `sql\`...\`` tagged template (Drizzle idiom).

The current lint contract (slice 7 — `scripts/check-direct-wallet-mutation.ts:107-109`) requires the opt-out comment on the **same line** as the SQL keyword. The script's documented example (line 37 of the script) shows single-line tagged templates: `await tx\`UPDATE wallets SET … WHERE …\`;  // allow-direct-mutation: <reason>`. That works for short SQL; it doesn't work for multi-line `sql\`...\`` blocks where the keyword (`INSERT INTO idempotency_keys`) lives 2 lines below the opening backtick — `//` is not a Postgres comment marker, so the opt-out cannot live inside the template literal.

**Why it matters:** Slice 8.1b is the first slice introducing protected-table mutations from outside `packages/wallet/`. The lint mechanism (slice 7) was designed before this idiom appeared. Picking the opt-out shape now sets the convention for every future cross-cutting middleware that mutates protected tables (e.g., a future audit-log middleware, deidentify queue, etc.). The choice cascades:

- **Failure semantics:** the wrong choice silently disables the lint over a wider surface than intended.
- **Reviewer signal:** per-statement opt-out reads as "this specific write is M1-authorized"; per-file opt-out reads as "trust this whole file." The granularity choice changes what a code review must catch.
- **Idiom alignment:** TS engineers reach for `// biome-ignore-next-line` / `// eslint-disable-next-line` patterns. A bocek-internal lint that diverges from this convention pays a memory tax.

**Engineering substance at stake:**
- **Concurrency / cascade:** future middlewares with multi-line SQL (audit log, outbox dispatcher, reaper) hit the same shape. Resolving once via lint-script change vs. case-by-case via SQL-restructure compounds.
- **Observability:** per-statement opt-outs leave reviewable annotations near the write site. Per-file allowlist hides the M1-trigger event from grep.
- **Reversibility:** widening the script (option a/b) is reversible (revert the script change). Per-file allowlist (option d) accumulates entries and is harder to walk back without auditing each excluded file.

**Unvetted options** (from training data + ecosystem convention — labeled, NOT recommendations):

(a) **Widen lint to honor `// allow-direct-mutation:` on the line *immediately preceding* the hit, in addition to same-line.** Mirrors `// biome-ignore-next-line` / `// eslint-disable-next-line` convention. ~5 line script change. Per-statement granularity preserved. (Idiom-cited via biome / eslint; no external production cite for this exact lint.)

(b) **Widen lint to honor the comment within N=2 or N=3 lines preceding the hit.** Generalizes (a). More forgiving but introduces a "how far back does it look" knob that doesn't exist today and could swallow opt-outs intended for a different statement. (No external cite.)

(c) **Restructure middleware to inline single-line SQL templates.** Lint script unchanged. Hurts readability of ~5-line SQL; not how Drizzle SQL templates are typically written in `[[backend-stack]]`-cited reference projects (Cal.com / Better Auth use multi-line for non-trivial SQL). (Anti-idiom for the stack.)

(d) **Add `apps/backend/src/idempotency/` to EXCLUDE_PREFIXES** alongside `packages/wallet/`. Treat the file as a known M1-trigger boundary. Loosest discipline: per-statement annotations disappear inside the excluded directory. (No external cite.)

### To resolve

`/design` — picks the shape with engineering-substance pass + idiom citation. The decision likely lands as a small amendment to `[[wallet-mechanics]]` Amendment Part 1 A1 (the lint mechanism is named there) OR a new short entry `[[direct-mutation-lint-opt-out-shape]]`. Once vaulted, slice 8.1b resumes as a quote-and-execute pass: implement the lint-script change per the picked option, re-run `check:direct-mutation`, advance.

`/implementation` (this seat) flagged the gap rather than picking inline because the cluster of forks above includes a granularity-vs-discipline tradeoff (per-statement vs per-file) that the contract doesn't pin and the codebase will inherit forward.

---

---

## GAP 10 RESOLVED 2026-05-10 — `[[direct-mutation-lint-opt-out-shape]]` LANDED

Decision vaulted at `.bocek/vault/_shared/direct-mutation-lint-opt-out-shape.md` as **(β) N=1 lookback + dual `//`/`--` recognition** per `[[direct-mutation-lint-opt-out-research]]`. `scripts/check-direct-wallet-mutation.ts` accepts the opt-out comment on the SQL line OR the line immediately preceding (N=1 lookback) AND recognizes both TS `//` and Postgres `--` comment-marker forms. Per-statement granularity preserved; `[[reaper-schedule-deferral]]` line 57 contract intact. (α) range markers rejected on granularity-loss attack; (γ) rewrite-to-query-builder rejected on generality (lint should be SQL-idiom-agnostic); (a) K=2 lookback falsified by research F1 (no production lint tool ships K>1 lookback as primary directive); (d) per-file EXCLUDE_PREFIXES rejected earlier for contradicting `[[reaper-schedule-deferral]]`.

**/implementation resumes slice 8.1b** as a quote-and-execute slice with no remaining design gaps: ~3-line script change (regex alternation + N=1 lookback function) + reposition the on-disk middleware opt-out comments from outside the template to inside as `--` Postgres comments on the line immediately above each SQL keyword + failure-message tail updated to name both placement options + script header comment updated with multi-line worked example. Re-run `check:direct-mutation`, smoke-test against local-docker, code self-attack archetypes, checkpoint LANDED.

---

## GAP 11 (surfaced 2026-05-18, slice "balance/history go live"): player-centric balance + history contract undefined

**Blocked step:** the SDK methods + backend endpoints that turn `apps/cockpit/modules/marketing/components/code-walkthrough.tsx`'s `// Coming soon` blocks live. M-5 landed the marketing surface with `credit` + `debit` shipped and `balance` + `history` deliberately stubbed pending this design pass (Option B per the user-ratified M-5 decision; see `.bocek/state.md` 2026-05-17). `[[marketing/v1-shape]]` Cascade #10 commits to "3-4 sibling SDK operations (credit + debit + balance + history) with the same friendly-name register as the hero" — register is committed, wire shape isn't.

**What's missing:** A coherent design pass for a player-centric balance + history HTTP surface and matching SDK methods. The closest existing references are misaligned:

- `[[_shared/url-pattern-research]]` (2026-05-09) F2 mentions `GET /v1/wallets/{walletId}` (balance) and `GET /v1/wallets/{walletId}/transactions` (history) as future-slice candidates — but those are **walletId-keyed**, written before M-1.5's player-centric layer landed. Reading them as the contract would force the SDK to expose walletId, contradicting `[[marketing/v1-shape]]` (iii) friendly-name register and the `wallets.credit({ player, currency, ... })` shape that M-4 shipped.
- `[[wallet/credit-route-contract]]` covers credit + debit only.
- `[[wallet/wallet-http-contract]]` covers the wallet-id-keyed routes from slice 8.1c — predates M-1.5.
- `[[wallet/wrapper-shape]]` covers the `walletCredit`/`walletDebit` wrappers; no balance-read or history-read wrapper exists in `packages/wallet/`.

Twelve sub-decisions cluster, none individually large, but each shapes the public API surface and downstream SDK ergonomics. Structurally similar to GAP 9 (which resolved as `[[wallet-http-contract]]`).

### G11.1 URL shape — balance

- `GET /v1/players/{playerExternalId}/wallets/{currencyCode}` — fetch the wallet resource. REST nounification.
- `GET /v1/players/{playerExternalId}/wallets/{currencyCode}/balance` — slash-suffix-verb, matches credit/debit pattern via `[[_shared/url-pattern-research]]` F1.
- `GET /v1/wallets/{walletId}` — walletId-keyed legacy shape; SDK would have to expose walletId.

Picking the GET-on-resource shape (a) loses the slash-suffix-verb consistency credit/debit has; picking (b) loses REST coherence ("balance is a property, not an action"). Either reads idiomatic in isolation; the inconsistency only shows on grep across the route table.

### G11.2 URL shape — history

- `GET /v1/players/{playerExternalId}/wallets/{currencyCode}/transactions` — nested-resource, scoped to one wallet (one currency × one player). Stripe-shape (`/v1/customers/{id}/balance_transactions`).
- `GET /v1/players/{playerExternalId}/transactions` — scoped to one player across all currencies. Useful for cross-currency activity feed; SDK shape is `wallets.history({ player })` with optional `currency?`.
- `GET /v1/transactions?player=...&currency=...&...` — flat collection with query-string filters. Most flexible; most ergonomic for cockpit audit. Loses the "owned by player" semantic anchor.

Picks compound with G11.5 (filter shape). Stripe-shape (a) is the tightest fit with credit/debit's URL; (c) is closest to the cockpit audit panel that doesn't exist yet but is in the spine (`[[mvp-feature-sequence]]` Month 6 faucet/drain dashboard).

### G11.3 Unknown-player semantics on read

Credit lazy-creates on first call (M-1.5 contract (iii)). Balance + history on read have different stakes:

- **Lazy-create on read** — mirrors credit; `balance: "0"` on unknown player is consistent. But conflates "no transactions" with "player doesn't exist" — bad for audit + bad for client-side error UX.
- **404 UnknownPlayerError** — typed exception with available hint. Distinguishes the two states. Inconsistent with credit's lazy-create.
- **404 only for history; balance lazy-creates** — credit/balance use the same lifecycle (player wallet exists once credited); history is "give me what's logged" which 404s naturally on unknown.

Sub-decision: if 404, does the SDK throw `UnknownPlayerError` (currently defined in `packages/sdk-node/src/errors.ts` but unused — the M-4 contract reserved it for "future explicit-create flow")? This is the future explicit-create flow.

### G11.4 Pagination shape (history)

- **Cursor (Stripe-shape):** `?starting_after=txn_id&limit=N` returning `{data: [...], has_more, next_cursor?}`. Stable under concurrent writes. Production-cited × Stripe.
- **Offset (`?page=N&limit=N`):** simpler; unstable under concurrent writes (rows shift between pages). Anti-pattern for high-write audit logs.
- **Keyset on `(created_at DESC, id DESC)`:** opaque cursor encoding both fields; handles ties. More involved server side.

Default page size, max page size, ordering all sit here. Default ordering is presumed `created_at DESC` (newest-first for activity feeds) — but not vaulted. Max page size affects backend memory ceiling.

### G11.5 Filter shape (history)

- **No filters at MVP:** simplest; cockpit audit can grow filters later. Customers running their own dashboards will pull all and filter client-side. Workable at low cardinality, breaks at scale.
- **`?from=ISO&to=ISO`:** date-range filter, common pattern.
- **`?kind=currency_credit|currency_debit`:** operation-type filter. Maps to `transactions.kind`.
- **`?reasonCode=signup_bonus`:** business-context filter. Maps to `transactions.reason_code`.

Compounds with G11.2. Stripe ships rich filters on `/v1/balance_transactions`; PlayFab's inventory-history is minimal. Indie-scale (BokChoy's audience class) tends minimal.

### G11.6 Balance response shape

What's on the wire for the balance response:

- **Minimal:** `{ walletId, playerId, currencyCode, balance: string }` — string-typed for NUMERIC(20,4) precision per `[[wallet/wrapper-shape]]` rationale.
- **Plus updatedAt:** add `updatedAt: ISO` from `wallets.updated_at`. Useful for staleness checks if the SDK ever caches.
- **Plus lastTransactionId:** add `lastTransactionId: number` for client-side "did anything change since I last looked" optimistic logic.

Field-set conventions per `[[marketing/currencies-endpoint-research]]` F4 (audience-scale-matched minimal pattern). Adding later is non-breaking under standard SDK consumer semantics.

### G11.7 History response shape (per-transaction fields)

The `transactions` table per `[[wallet-mechanics]]` §3 has ~12 columns. Which are on the wire:

- **Core:** `id`, `createdAt`, `kind`, `amount: string`, `reasonCode`, `balanceAfter: string`.
- **Sometimes:** `currencyCode` (redundant when filtered by URL but useful for cross-currency endpoint G11.2 b/c), `sourceEventId`, `idempotencyKeyId`, `relatedId`, `relatedType`, `metadata`.
- **Never on the wire:** `project_id` (implicit via auth), `wallet_id` (redundant), `player_id` (redundant when URL-scoped).

The `balanceAfter` per-row column lets clients render running totals without re-computing — but `transactions` may or may not have this column today. Need to check.

Sub-decision: does the row order in the response match `ORDER BY created_at DESC, id DESC` per G11.4 default, or the reverse (older-first chronological)? Activity feed convention is newest-first.

### G11.8 OTel span name + attributes

Following the M-1.5 player-centric attribute set verbatim:

- `wallet.balance` span: `bokchoy.project_id`, `bokchoy.player_external_id_hash` (HMAC), `bokchoy.currency_code`, `bokchoy.balance_returned: string`. (Last attr is post-query — emit only on success.)
- `wallet.history` span: same set without balance; `bokchoy.transaction_count` post-query, `bokchoy.cursor: 'first_page' | 'paginated'`.

Sub-decision: span name `wallet.balance` vs `wallet.read_balance` — slash-suffix-verb URL would suggest the verb form. The credit/debit span names are `wallet.credit` / `wallet.debit` (action form). Consistency lean: `wallet.balance` / `wallet.history`.

### G11.9 Idempotency middleware on GETs

GETs are naturally idempotent (no side effects). The current `idempotencyMiddleware` runs on POSTs in `mountWalletRoutes`. Three positions:

- **Skip on GET:** apply only to POST. Standard. SDK doesn't send Idempotency-Key for reads. (Stripe-shape.)
- **Accept-and-ignore on GET:** middleware runs, header is recorded for diagnostic but no replay logic. Adds noise.
- **Wire it for caching:** GET responses cached in `idempotency_keys` for replay savings. Out of scope at MVP; ETag is the right primitive instead.

Recommendation lean: (a). Worth pinning so the future cockpit audit endpoint doesn't accidentally hold a different posture.

### G11.10 SDK method shape

The `WalletsApi` class currently exposes `credit` + `debit`. New methods:

- `wallets.balance({ player, currency }): Promise<Balance>` where `Balance = { walletId, playerId, currencyCode, balance: string, updatedAt?: string }`.
- `wallets.history({ player, currency?, limit?, startingAfter?, ... }): Promise<{ data: Transaction[], hasMore: boolean, nextCursor?: string }>`.

The `currency?` optional on history depends on G11.2 — if URL is `/v1/players/{externalId}/wallets/{currency}/transactions`, currency is required. If URL is `/v1/players/{externalId}/transactions`, currency is an optional filter.

Auto-pagination helper: `for await (const txn of wallets.history({...}).autoPaginate())` — Stripe-shape. Defer to a future SDK version; M-5 marketing snippet doesn't need it.

### G11.11 Auth surface (read scope)

Same `apiKeyMiddleware` as credit/debit at MVP — the customer's game server reads its own players' balances. Trivial. Worth pinning so future read-only sub-scope (game-client-direct calls instead of game-server-proxied) doesn't break callers.

### G11.12 Wrapper-layer obligation

`packages/wallet/` exports `walletCredit` / `walletDebit` per `[[wallet/wrapper-shape]]`. Balance + history need matching wrappers:

- `walletBalanceByExternalId(tx, { projectId, playerExternalId, currencyCode })`: returns the wallet row (RLS-scoped).
- `walletHistoryByExternalId(tx, { projectId, playerExternalId, currencyCode?, limit, startingAfter?, ... })`: returns rows from `transactions` (RLS-scoped, sorted, paginated).

Both are RLS-scoped reads — they don't need stored functions like credit/debit (which need atomicity + SECURITY DEFINER). Plain Drizzle queries inside `withTenant`. But the wrapper shape is still owed to keep the route handler clean and matches the `[[wrapper-shape]]` discipline. Sub-decision: error class? Probably a new `WalletError` code `BC0xx` for the 404 cases, or handler-local error mapping like M-1.5's UNKNOWN_CURRENCY.

### Engineering substance at stake

- **API contract permanence:** G11.1 + G11.2 + G11.4 + G11.6 + G11.7 set the public read surface. Cascades to the cockpit audit panel (Month 6 deliverable per `[[mvp-feature-sequence]]`).
- **Failure semantics:** G11.3's lazy-create-vs-404 affects every customer who calls `balance` before `credit` (which is the common "show empty wallet on first login" flow).
- **Security:** G11.11 — read-scope auth pins the trust boundary. RLS via `withTenant` covers per-tenant isolation.
- **Observability:** G11.8 attribute set is what the future cockpit dashboard groups by.
- **Marketing alignment:** the M-5 placeholder copy already names balance + history operations. Whatever SDK call shape /design picks, the `code-walkthrough.tsx` snippets need to update verbatim. Picking inconsistent register (e.g., `wallets.getBalance` vs marketing's `wallets.balance`) ships a contradiction to the apex landing page.

### Unvetted options (clearly NOT recommendations)

For G11.1 (URL — balance):
1. `GET /v1/players/{externalId}/wallets/{currencyCode}` — REST resource read. (No production cite specifically for game-economy class.)
2. `GET /v1/players/{externalId}/wallets/{currencyCode}/balance` — slash-suffix-verb; matches credit/debit. (Action-form precedent.)
3. PlayFab-shape RPC: `POST /v1/players/{externalId}/wallets/{currencyCode}/get-balance`. Misfit; reads as a mutation.

For G11.2 (URL — history):
1. `GET /v1/players/{externalId}/wallets/{currencyCode}/transactions` — Stripe-shape nested. (Stripe `/v1/customers/{id}/balance_transactions`.)
2. `GET /v1/players/{externalId}/transactions?currency=...` — per-player flat. SDK shape simpler.
3. `GET /v1/transactions?player=...&currency=...` — global with query filters. Cockpit-audit-friendly.

For G11.3 (unknown-player on read):
1. Lazy-create on balance, 404 on history. Mixed.
2. 404 on both. Strict.
3. Lazy-create on both. Permissive.

For G11.4 (pagination):
1. Cursor (Stripe `starting_after` / `limit`, `has_more` flag).
2. Offset (`page` / `limit`). Anti-pattern for audit logs.
3. Keyset on `(created_at DESC, id DESC)` with opaque-cursor encoding.

For G11.10 (SDK signature):
1. `wallets.balance({ player, currency })` + `wallets.history({ player, currency?, limit?, startingAfter? })`. Friendly-name register.
2. Verb-form: `wallets.getBalance` + `wallets.listHistory`. Inconsistent with `credit`/`debit` register.

### To resolve

`/design` recommended. The cluster's shape (12 sub-decisions across URL, pagination, response shape, error model, SDK API, OTel) is structurally GAP 9-sized; one /design pass with `[[_shared/url-pattern-research]]` F1 + Stripe shape + the M-1.5 player-centric register as the floor can resolve them coherently. Likely vault output: a new entry `[[wallet/balance-history-contract]]` (sibling to `[[wallet/credit-route-contract]]`) and a small amendment to `[[wallet-http-contract]]` to register the new endpoints.

`/implementation` resumes once the entry lands — wrapper-layer + backend handlers + SDK methods + `code-walkthrough.tsx` snippet update become a quote-and-execute slice with no remaining gaps. Marketing surface flips from "Coming soon" to live.

---

## Summary (updated 2026-05-18 — 11 gaps total, gaps 1–7 resolved 2026-05-04; gap 8 deferred-and-downgraded; gap 9 RESOLVED 2026-05-09 via `[[wallet-http-contract]]`; gap 10 RESOLVED 2026-05-10 via `[[direct-mutation-lint-opt-out-shape]]`; gap 11 OPEN — `/design` recommended for `[[wallet/balance-history-contract]]`)
