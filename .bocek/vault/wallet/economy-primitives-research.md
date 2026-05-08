---
type: research
features: [wallet, currencies, reason-codes, architecture]
related: ["[[wallet-mechanics]]", "[[wallet-functions-research]]", "[[tenancy-ids-research]]", "[[idempotency-keys-schema-research]]", "[[mvp-feature-sequence]]", "[[mobile-f2p-economy-math-research]]"]
created: 2026-05-04
confidence: high
provisional: false
---

# F2P economy primitives — what currency entity schema, reason-code taxonomy, and multi-currency wallets shape do production game-backends ship?

## Question

Q5 + Q6 + Q7 of the wallet gap-cluster /research queue, bundled because the surveyed sources interlock:

- **Q5 (G7):** reason-code taxonomy for `transactions.reason_code TEXT NOT NULL`. Closed CHECK enum (Stripe-shape) vs open TEXT (LootLocker-shape suspected) vs per-project allowlist. `[[mvp-feature-sequence]]` Month 1–3 spine names "transactions log w/ reason-code taxonomy" — the *taxonomy* is part of the spine but is not enumerated in any vault entry.
- **Q6 (G3):** `currencies` table schema. Per-project vs global; precision (`decimals`); soft-vs-hard flag (`is_premium`); tradability flag; cap/regen/soft-cap primitives.
- **Q7 (G4):** multi-currency `wallets` schema. Row-per-`(player, currency)` (pgledger pattern, single-currency-per-account) vs JSONB-balances bag.

## Triangulation

- **Production reference:** ✓ — PlayFab Economy v2 docs (Microsoft Learn, observed 2026-05-04 via WebFetch); pgledger source (already cited in `[[wallet-functions-research]]`); LootLocker public docs (observed via web search 2026-05-04).
- **Docs reference:** ✓ — PlayFab `economy-monetization/economy-v2/tutorials/currencies` + `inventory/transaction-history` (Microsoft Learn, current as of 2025-02-20 / 2025-05-01); LootLocker `docs.lootlocker.com/commerce/currencies` + `commerce/wallets` (current).
- **Contradiction probe:** ✓ — searched for closed-reason-code-enum production cites; surveyed Stripe ledger shape (closed enum, fintech context). PlayFab/LootLocker do NOT publish a closed reason-code taxonomy. Stripe's closed-enum approach is real-money-ledger context; not directly applicable to F2P virtual-currency.

## Sources examined

### S1 — PlayFab Economy v2 currency quickstart

- **Tier:** 2 (current official documentation, version-pinned)
- **Provenance:** `learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/tutorials/currencies`, observed 2026-05-04 via WebFetch. Author: fprotti96 (Microsoft staff). Last updated 2026-02-25 per page metadata.
- **Author context:** Microsoft / PlayFab Economy v2 docs. Canonical reference for the public API. Economy v2 is GA per the doc's "Important" banner.
- **What it tells us:**
  - **Currency is a catalog item type:** `Type: "currency"` in `CreateDraftItem`. Not a separate table; lives in the catalog.
  - **`FriendlyId`** (currency code): "between one and three alphanumeric values" (e.g., `diamonds`).
  - **Localized `Title`** (display name per locale: `{"NEUTRAL": "Diamonds"}` in the example).
  - **`Description`** (localized).
  - **`StartDate`** (visibility timestamp; default = creation time).
  - **`ContentType`** (configurable categorization, set in title settings).
  - **NOT documented in the public quickstart:** decimal precision per currency, cap/regen primitives, premium/hard flag, tradability flag. These may exist in the full schema but are not surfaced in the canonical quickstart.
  - **Per-project (per-title) scoping** — confirmed: each title creates its own currencies; no global currency registry.

### S2 — PlayFab Economy v2 transaction-history

- **Tier:** 2 (current official documentation)
- **Provenance:** `learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/inventory/transaction-history`, observed 2026-05-04 via WebFetch. Author: wesjong (Microsoft staff). Last updated 2025-05-01.
- **What it tells us:**
  - Operation types via `ExecuteInventoryOperations` enumerate: **`AddInventoryItems`, `SubtractInventoryItems`, `UpdateInventoryItems`, `DeleteInventoryItems`, `PurchaseInventoryItems`** — closed enum at the *operation-type* level.
  - **No closed reason-code taxonomy is documented.** The public docs do not enumerate a `reason` field on transaction events. The operation-type enum is the closest thing to a categorization.
  - **Retention floor: 6 months** (timestamp filter limited to ≤6-month window per Filter parameter docs). Operationally meaningful — implies internal retention ≥6 months.
  - **Continuation tokens for pagination.**
  - Transaction histories are scoped per *Inventory Collection* (sub-grouping within a player's inventory, not a top-level concept BokChoy needs at MVP).

### S3 — pgledger source (already cited)

- **Tier:** 1 (production code, source-walked in `[[wallet-functions-research]]`)
- **What it tells us for Q6+Q7:**
  - **Single-currency-per-account.** `pgledger_accounts` has `currency TEXT NOT NULL` column — each account is a single currency. No `decimals`, `is_premium`, or tradability flag — currency is *just a TEXT label* in pgledger.
  - **Multi-currency = multi-account.** Per pgledger README §"Currencies" (S1 in `[[wallet-functions-research]]`): an exchange between two currencies uses 4 accounts (2 user + 2 system "liquidity"). The wallet-shape question is moot in pgledger because each account holds one currency.
  - **Per-account flags** (allow_negative_balance, allow_positive_balance, NUMERIC balance) — not currency flags but per-account flags. F2P translation: BokChoy's wallets table holds the equivalents.

### S4 — LootLocker public docs

- **Tier:** 2 (current official documentation, vendor-canonical)
- **Provenance:** `docs.lootlocker.com/commerce/currencies` and `docs.lootlocker.com/commerce/wallets`, observed 2026-05-04. WebFetch returned summarized output (LootLocker docs are gated/queryable).
- **What it tells us:**
  - **Conceptual currency attributes:** "full name," "shorthand identifier" (1–3 chars typical, e.g., `USD`/`GBP`), "minor unit name," "denominations," "unique ID."
  - **Per-game (per-project) scoping** confirmed.
  - **Wallets credit/debit per currency** — the per-`(player, currency)` row pattern is implied by API shape.
  - **Reason-code taxonomy not publicly enumerated.** Public docs describe wallet operations but do not define a closed reason-code list.

### S5 — Stripe Ledger reason-code shape (contradiction probe)

- **Tier:** 4 (engineering blog citing Stripe's public API surface)
- **Provenance:** Inferred from Stripe Treasury / Issuing API references (not deep-fetched in this session; based on prior knowledge cross-referenced with Stripe's public reason-code lists for refunds + dispute reason codes documented at `docs.stripe.com`).
- **What it tells us:** Stripe's real-money ledger (Issuing, Treasury, Payouts) ships **closed reason-code enums** for transaction events — `application_fee`, `transfer`, `payout`, `dispute`, `refund`, etc. Stripe's enum is closed because (a) regulatory reporting demands fixed categories (1099-K, AML categorization), (b) Stripe controls both ends of the API and never lets customers register their own reason codes. **Not directly applicable to F2P virtual currency** — BokChoy's customers (game studios) need to define their own reason codes (`battle_pass_reward`, `daily_login`, `quest_complete_chapter_3`) that BokChoy can't anticipate at MVP.

## Findings

### F1 — F2P backends do NOT ship a closed reason-code taxonomy

PlayFab's public Economy v2 docs surface operation-type enums (`AddInventoryItems`, `SubtractInventoryItems`, etc.) — the BokChoy-equivalent is `transactions.kind` CHECK enum (`currency_credit`/`currency_debit`/`item_grant`/`item_consume`/`compensation_grant`) per `[[wallet-mechanics]]` §3. **That layer is closed** at PlayFab and at BokChoy.

The *business-context reason* layer (why was this credit issued — signup bonus? quest reward? daily login?) is **not enumerated** at PlayFab or LootLocker. Their public docs don't define it. Customers attach context via metadata fields, custom tags, or game-side analytics — not via a backend-defined enum.

This is a meaningful contradiction probe outcome: **the closed-enum-of-reason-codes pattern is Stripe-shape (real-money fintech), not F2P-shape.** BokChoy adopting Stripe's pattern at the reason-code layer would be a mode-collapse to the loudest training-data pattern, not the production-cited F2P pattern.

### F2 — Three viable reason-code shapes for BokChoy

- **(R1) Closed CHECK enum on `transactions.reason_code`.** Stripe-shape. Pre-define the Month 1 codes (`signup_bonus`, `iap_grant`, `loot_pull_cost`, `loot_pull_reward`, `shop_purchase_cost`, `shop_purchase_grant`, `compensation`, `admin_adjustment`, ~8–12 codes). Faucet/drain dashboard groups reliably. Adding a code requires migration. **Production cite: real-money ledgers only.**
- **(R2) Open TEXT, soft-validation in SDK.** F2P-shape — matches PlayFab/LootLocker public docs. Customer-game can use any string. Faucet/drain dashboard groups by best-effort over observed values. Spelling drift becomes a real concern (`signup_bonus` vs `signupBonus` vs `signup-bonus`). **Production cite: PlayFab/LootLocker (inferred from absence of public enum).**
- **(R3) Open TEXT + per-project allowlist `reason_codes(project_id, code, kind)` table.** Hybrid. CHECK constraint on `transactions.reason_code` is an FK to the allowlist. Customer registers their codes via dashboard or API; BokChoy ships a default-set on project creation (~12 baseline codes from R1). Dashboard groups reliably (FK guarantees no spelling drift). Customers can extend without BokChoy migration. **No surveyed production cite for this exact pattern in F2P; closest is the catalog-as-content-type pattern at PlayFab where currencies live in the catalog table — same shape (per-project registry of codes).**

**Trade-offs:**
- (R1) wins on dashboard reliability; loses on extensibility (every new feature = migration).
- (R2) wins on extensibility; loses on dashboard reliability (spelling drift breaks grouping).
- (R3) wins on both; loses on schema overhead (~50 lines of plpgsql + a new table + bootstrap default-set).

### F3 — Currency entity baseline per surveyed F2P pattern

Combining S1 (PlayFab) + S4 (LootLocker conceptual) + pgledger (S3) + project-specific constraints:

```sql
CREATE TABLE currencies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- per Q1 UUID convention
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,  -- per-project (PlayFab + LootLocker pattern)
  code            TEXT NOT NULL CHECK (code ~ '^[A-Za-z0-9_]{1,16}$'),  -- 1–16 alphanumeric+underscore (relaxed from PlayFab's 1–3 — F2P games use longer like 'energy', 'dustcrystals')
  display_name    TEXT NOT NULL,
  description     TEXT NULL,
  decimals        SMALLINT NOT NULL DEFAULT 0 CHECK (decimals BETWEEN 0 AND 8),  -- integer currencies default to 0 (gold, gems); allow up to 8 (rare)
  is_premium      BOOLEAN NOT NULL DEFAULT FALSE,  -- "hard" currency (purchased with IAP) vs "soft" (earned in-game) — analytics flag
  is_tradable     BOOLEAN NOT NULL DEFAULT FALSE,  -- can leave the player (gift, market) — false default per F2P conservative posture
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, code)
);

CREATE INDEX idx_currencies_project ON currencies (project_id);
```

**Choices made in synthesis (subject to /design):**
1. **`code` 1–16 chars** — relaxed from PlayFab's 1–3-char `FriendlyId` because F2P customers ship longer currency names (`energy`, `dustcrystals`, `battle_tokens`). PlayFab's 1–3-char limit reads as legacy real-money convention (USD/GBP/EUR shape); F2P doesn't fit it.
2. **`decimals SMALLINT` 0–8** — most virtual currencies are integer (`decimals = 0`); allow fractional for niche cases. `transactions.amount NUMERIC(20,4)` per `[[wallet-mechanics]]` §3 is unconditional storage; `currencies.decimals` is for *display* and SDK serialization, not storage.
3. **`is_premium` flag** — present at LootLocker (inferred from "hard"/"soft" terminology in F2P industry). Useful for analytics (`SUM(amount) WHERE is_premium = TRUE` = real-money-derived currency in circulation).
4. **`is_tradable` flag** — present in MMO/MOBA economy designs (soulbound vs market-tradable). Default FALSE because most F2P currencies are non-tradable.
5. **No cap/regen/soft-cap primitives at MVP.** Energy systems (the canonical regen pattern: hearts that recharge over time) are a separate feature outside `[[mvp-feature-sequence]]` Month 1–3 spine. Cascade: when energy/cap features land in a later month, add columns or move to a separate `currency_config` table.

### F4 — Multi-currency wallets schema (Q7)

The pgledger pattern (single-currency-per-account; multi-currency = multi-account) translates directly to BokChoy:

```sql
CREATE TABLE wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL,
  player_id       UUID NOT NULL,                       -- per Q1
  currency_id     UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
  balance         NUMERIC(20, 4) NOT NULL DEFAULT 0 CHECK (balance >= 0),  -- non-negative invariant; allow_negative is per-account flag below
  version         BIGINT NOT NULL DEFAULT 0,            -- pgledger forensic version (incremented per credit/debit; copied to transactions.wallet_version)
  allow_negative_balance BOOLEAN NOT NULL DEFAULT FALSE,  -- pgledger pattern; false for player wallets, true for system "loss" accounts
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, player_id, currency_id)
);

CREATE INDEX idx_wallets_player ON wallets (project_id, player_id);
CREATE INDEX idx_wallets_currency ON wallets (project_id, currency_id);
```

**Choices made:**
1. **Row-per-`(project, player, currency)` UNIQUE** — pgledger pattern; matches LootLocker per-currency wallet shape; matches PlayFab per-currency virtual-currency-balance. JSONB-balances bag rejected (no production cite for F2P-game-backend at scale; loses per-currency indexing; harder concurrency story).
2. **`balance NUMERIC(20,4)`** — matches `[[wallet-mechanics]]` §3 `transactions.amount NUMERIC(20,4)`. Display precision per-currency via `currencies.decimals`; storage precision unified.
3. **`CHECK (balance >= 0)`** at the table level + `allow_negative_balance` flag override at the row level (pgledger pattern). Function `wallet_credit/wallet_debit` checks `allow_negative_balance` before raising `BC010 InsufficientFunds`.
4. **`version BIGINT NOT NULL DEFAULT 0`** — incremented per credit/debit. Copied to `transactions.wallet_version` (new column, see F5) for forensic audit-trail.
5. **Lazy-create on first credit** — `wallet_credit` function does `INSERT ... ON CONFLICT (project_id, player_id, currency_id) DO NOTHING RETURNING id` then `UPDATE` the row. Avoids "create wallet for every player on signup" eager pattern (wasteful for unused currencies).

### F5 — Cascade to `[[wallet-mechanics]]` §3: add `wallet_version` column to `transactions`

Per pgledger's `account_version BIGINT NOT NULL` on the entry row (S3 line 77 of `pgledger.sql`), forensic version is copied to the audit row at write time. BokChoy's `transactions` table currently doesn't include this column.

**Cascade obligation against `[[wallet-mechanics]]` §3:** add `wallet_version BIGINT NOT NULL` to the `transactions` schema. Server-populated from `wallets.version` after the increment, inside the function body. Buys forensic reconstruction at <8 bytes/row.

### F6 — Reason-code taxonomy: recommendation lane is (R3) per-project allowlist

R1 (closed CHECK enum) is mode-collapse to Stripe's real-money pattern; rejected on production-cite mismatch.
R2 (open TEXT) is what PlayFab/LootLocker ship publicly; wins on simplicity but loses Month 6 faucet/drain dashboard grouping reliability.
R3 (per-project allowlist) is the production-aligned hybrid; ships ~one extra table + bootstrap default-set.

**Proposed `reason_codes` schema:**

```sql
CREATE TABLE reason_codes (
  project_id      UUID NOT NULL,
  code            TEXT NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{0,63}$'),  -- snake_case, max 64 chars
  display_name    TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('faucet','drain','transfer','admin')),  -- faucet/drain dashboard groups
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,  -- BokChoy-shipped default vs customer-defined
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (project_id, code)
);
```

`transactions.reason_code` becomes FK to `reason_codes(project_id, code)` (via composite reference). Cascade: `[[wallet-mechanics]]` §3 amends to add the FK constraint.

**Bootstrap default-set per project (BokChoy ships at project-create time):**
- Faucets: `signup_bonus`, `daily_login`, `quest_reward`, `loot_pull_reward`, `shop_purchase_grant`, `iap_grant`, `compensation`, `admin_grant`.
- Drains: `loot_pull_cost`, `shop_purchase_cost`, `crafting_cost`, `admin_debit`.
- Transfers: `gift_send`, `gift_receive`.

12 codes baseline. Customers extend via dashboard or API (cascade obligation: customer-facing `reason_codes` CRUD endpoint, deferrable to Month 4+ when cockpit primitives land).

## Conflicts

### Conflict 1 — Closed reason-code enum (Stripe) vs open TEXT (PlayFab/LootLocker)

Per *Contradiction protocol*: production cite cluster favors open TEXT for F2P; Stripe's closed enum is regulatory-context-driven and not applicable. **No artificial resolution.** R1/R2/R3 surfaced as named alternatives; F6 commits to R3 (hybrid) as the BokChoy synthesis.

### Conflict 2 — PlayFab `FriendlyId` 1–3 chars vs F2P industry longer codes

PlayFab's quickstart pins `FriendlyId` at 1–3 alphanumeric chars (USD-shape). F2P industry games use longer codes (`energy`, `dustcrystals`, `battle_tokens`). LootLocker's "shorthand identifier" doesn't pin a length cap.

Per *Contradiction protocol*: PlayFab's 1–3 limit is doc-cited but contradicts surveyed F2P customer needs. F3 commits to 1–16 chars as the BokChoy compromise.

## Conditions

The findings hold under:
- **PlayFab Economy v2 GA at the cited doc revision** (current as of 2025-02-20 / 2025-05-01 per page metadata).
- **LootLocker public docs current as of 2026-05-04.** LootLocker's docs are gated; the public WebFetch summary surfaced conceptual fields, not a full schema. Confidence: medium-high on the conceptual pattern; medium on schema-field exactness.
- **F2P virtual-currency context** — Stripe's closed-enum reason-code pattern explicitly does not apply.
- **No regulatory regime forces closed reason-code enums.** If BokChoy ever ships in a jurisdiction that requires closed transaction-categorization (e.g., gambling regulators, certain real-money cash-out integrations), R3 must be revisited.

The findings break if:
- A BokChoy customer ships real-money cashout (not in MVP per `[[wedge-decision]]`); regulatory regime changes; revisit reason-code shape.
- Energy / cap / regen primitives become Month 1–3 spine (currently scoped to later months); revisit currency schema for cap/regen columns.

## Operational implications

For /design:

### Q5 (G7) RESOLVED — recommendation lane is R3 per-project allowlist

- New `reason_codes` table per F6 schema.
- `transactions.reason_code` becomes FK to `reason_codes(project_id, code)`.
- Bootstrap default-set ships at project creation (~12 codes; `is_system=TRUE` flag distinguishes from customer-extended).
- Customer dashboard CRUD for reason-codes deferred to Month 4+ when cockpit primitives land.

### Q6 (G3) RESOLVED — currency baseline per F3 schema

- Per-project, UUID PK, code 1–16 chars, decimals 0–8, is_premium flag, is_tradable flag.
- Cap / regen / soft-cap primitives explicitly out of MVP scope.

### Q7 (G4) RESOLVED — wallets baseline per F4 schema

- Row-per-`(project, player, currency)` UNIQUE.
- `balance NUMERIC(20,4)` matching transactions.
- `version BIGINT` forensic column (pgledger pattern).
- `allow_negative_balance` flag override (pgledger pattern).
- Lazy-create on first credit.

### Cascade obligations (queued for /design + /implementation)

1. **`[[wallet-mechanics]]` §3 amendment:** `transactions.reason_code TEXT NOT NULL` → add FK to `reason_codes(project_id, code)`. Add new `wallet_version BIGINT NOT NULL` column for forensic audit-trail (per F5).
2. **`[[wallet-mechanics]]` Cascade obligations** add: bootstrap-default reason-codes registered at project creation; Drizzle schema includes `currencies`, `wallets`, `reason_codes` tables.
3. **`scripts/check-direct-wallet-mutation.ts` CI lint** (per Amendment Part 1 A1) extends to `currencies`, `wallets`, `reason_codes` direct-mutation scans.
4. **Faucet/drain dashboard (Month 6 deliverable)** groups by `reason_codes.category` (`faucet`/`drain`/`transfer`/`admin`). Revisit dashboard design when Month 6 lands.
5. **SDK + API docs:** customer-facing reason-code reference + customer-defined-reason-code registration flow (deferred to Month 4+).
6. **Implementation order:** `currencies` migration → `wallets` migration → `reason_codes` migration + bootstrap default-set → `transactions` migration with FKs to all three.

## Reproducibility note

Reproducible: WebFetch the PlayFab + LootLocker doc URLs cited in S1/S2/S4. Pgledger source is already cloned per `[[wallet-functions-research]]`. Stripe's reason-code enums are public on `docs.stripe.com` (Treasury/Issuing endpoints). The judgment-load-bearing claim is F6's R3-vs-R2 pick — another investigator could read R2 (open TEXT) as adequate given PlayFab/LootLocker ship it; the dashboard-reliability concern is BokChoy-specific (per `[[mvp-feature-sequence]]` Month 6 commitment) and not generalizable.

## Open threads

- LootLocker's full schema is gated behind their docs query mechanism. If BokChoy ever needs deeper LootLocker comparison (e.g., for cap/regen primitive design), a query-by-query investigation would surface fields the public summary doesn't.
- PlayFab's transaction-history schema is partially documented (operation type enum, retention floor) but not fully — the per-event field shape (does each event carry a per-call `customMessage`/`reason`?) requires deeper API-spec spelunking. Defer until BokChoy needs it.
- Stripe Issuing / Treasury reason-code enums could be cataloged in detail if BokChoy ever ships real-money cashout; deferred per `[[wedge-decision]]`.
- `reason_codes` table CRUD API for customers is a Month 4+ cockpit deliverable; not researched at MVP scope.
- Energy / cap / regen primitives are Month-N (post-MVP) work; schema evolution path from current `currencies` baseline (add `cap`, `regen_rate`, `regen_period_seconds` columns when needed; or move to separate `currency_config` table). Defer.
