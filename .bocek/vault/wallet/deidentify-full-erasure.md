---
type: decision
features: [wallet, inventory]
related: ["[[wallet-mechanics]]", "[[deidentify-mechanism-research]]", "[[audit-retention-research]]", "[[wallet/discovery-inventory-sql-never-run]]", "[[wallet/gaps]]", "[[inventory/inventory-contract]]"]
created: 2026-05-21
confidence: high
---

# `wallet_deidentify_player` is full player erasure (anonymize-retain), not audit-trail-only anonymization — resolves GAP 12

## Decision

`wallet_deidentify_player(p_player_id uuid)` is redesigned from **audit-trail-only anonymization** (its accidental scope: it only repointed `transactions`/`loot_rolls`/`iap_receipts` and — incoherently — `inventory`, while never touching the `players` identity row or `wallets`) into **full player erasure**, extending the vaulted `[[wallet-mechanics]]` §6 deterministic-`anon_id` model uniformly to live state.

**End-state invariant (what "erased" means):** after the function commits, the original `p_player_id` appears in **no row of any table**; the deterministic `anon_id` (HMAC-SHA-256 → UUIDv8 per §6 / A10, unchanged) is the **single identifier** across all live + historical rows; all PII columns are scrubbed; and the `players` identity row has become the anonymized row (`external_id = NULL`, `email = NULL`, `project_id` retained for tenant-scoped anonymized correlation). Operational **key-destruction** of `bokchoy.anon_secret` (unchanged, out-of-function) is what makes `anon_id` irreversible = GDPR-recognized erasure per `[[deidentify-mechanism-research]]`.

**Live-state stance: anonymize-retain (human decision 2026-05-21).** `wallets` (balances) and `inventory` (items) rows **survive**, repointed to `anon_id`, PII scrubbed — NOT deleted. Consistent with §6's "anonymize + retain; key-destruction = erasure" applied uniformly: the balance/items are no longer attributable to a person (identity severed, key destroyed). Preserves anonymized analytics.

**Per-table actions:**
- **players** — becomes the anon identity: `external_id = NULL`, `email = NULL`; `id` is/becomes `anon_id`.
- **wallets** — repoint `player_id → anon_id`. **NEW — currently untouched; a real gap, not just inventory.**
- **inventory** — repoint `player_id → anon_id` + scrub `properties` PII keys (the D5 clause — now FK-valid because the anon identity exists first).
- **transactions / loot_rolls / iap_receipts** — repoint `player_id → anon_id` + scrub PII metadata (existing behavior, retained).
- **staged_jobs** — scrub `payload` PII keys (existing, retained).
- **any other table with an FK to `players.id`** — repoint to `anon_id` (enumerate at implementation; see Contract).

**FK mechanic (implementation picks, given the FK enumeration):** the `anon_id` identity must exist in `players` **before** any FK-constrained table is repointed to it. Two valid paths, same end state:
- **(A) rename-with-cascade:** `UPDATE players SET id = anon_id, external_id = NULL, email = NULL` with `ON UPDATE CASCADE` on every live `players.id` FK (wallets, inventory, …) → references follow automatically; explicit repoint only for the no-FK audit logs. Requires an FK-definition migration.
- **(B) insert-anon-then-repoint-then-delete:** `INSERT` an anon `players` row (`id = anon_id`, `external_id = NULL`, `email = NULL`, same `project_id`) → repoint every FK'd + no-FK table to `anon_id` → `DELETE` the original `players` row (now unreferenced). No DDL.

Pick per the FK enumeration: few FKs + `ON UPDATE CASCADE` acceptable → (A) is cleanest (data-preserving rename); otherwise (B). The invariant is fixed: anon identity exists before any FK'd repoint; zero original-`player_id` rows remain after.

## Reasoning

The §6 deterministic-`anon_id` + key-destruction model is the **already-vaulted, research-backed erasure mechanism** (`[[deidentify-mechanism-research]]`: HMAC-SHA-256 via pgcrypto, key-destruction = GDPR-recognized erasure; `[[wallet-mechanics]]` A10: UUIDv8 projection, 5×10⁻²⁰ collision at 1B players). The defect was never the mechanism — it was that the mechanism was only applied to the **audit trail**, while the D5 slice bolted `inventory` (live, FK-constrained state) onto an audit-anonymization function without (a) materializing the anon identity so the FK resolves, or (b) handling `wallets`. This decision completes the model coherently rather than inventing a new one. (production-cited: the §6 research; internal-consistency: extends a vaulted decision.)

**Why anonymize-retain over delete (human's call, defended):** consistency with §6 — every row goes to `anon_id`, PII scrubbed, key destroyed; the same logic that retains anonymized `transactions` retains anonymized `wallets`/`inventory`. Identity severance + key destruction is what satisfies erasure, not row deletion. Delete would be a *cleaner* posture but a *different* philosophy (and would force handling `transactions.wallet_id` → `wallets` ordering on delete). (confidence: high — coherent with the vaulted model; the alternative is defensible and recorded below.)

## Engineering substance applied

- **Consistency:** one deterministic `anon_id` across all rows; the whole erasure runs in a single transaction (the function), so partial failure rolls back atomically. FK integrity preserved by ordering (anon identity before FK'd repoints).
- **Failure semantics:** the dominant risk is **partial erasure** — a missed `players.id` FK leaves the original `player_id` surviving there (PII not erased) and makes the rename/delete throw. Mitigated by a complete FK enumeration + a post-erasure assertion that **zero rows reference the original `player_id` across every player-referencing table** (not just the two test8 checks today).
- **Security / compliance:** `external_id` (customer-controlled, PII-class per the OTel-hashing discipline) + `email` scrubbed; `anon_id` deterministic but irreversible once the secret is destroyed; tenant correlation preserved via retained `project_id`.
- **Concurrency:** `SECURITY DEFINER` + pinned `search_path` (existing); per-transaction `SET LOCAL bokchoy.anon_secret` (existing); runs under the function owner, RLS-exempt as designed.

## Production-grade gates

- **Idiomatic:** extends the existing function + the vaulted §6 model; reuses the HMAC→UUIDv8 projection unchanged.
- **Industry-standard:** anonymize-retain + key-destruction is the GDPR pseudonymization-then-erase pattern (`[[deidentify-mechanism-research]]` cites AEPD/EDPS on key-destruction-as-erasure); deterministic pseudonyms for correlation-preserving anonymization are standard.
- **First-class:** Postgres FK `ON UPDATE CASCADE` or insert-repoint-delete — platform primitives, no custom machinery; one transaction.

## Rejected alternatives

### Audit-trail-only anonymization (revert the D5 inventory clause)
**What:** keep `wallet_deidentify_player` as history-anonymization; remove the inventory clause; live state out of scope.
**Wins when:** the product only needs retention-anonymization of the audit trail and never a real right-to-be-forgotten erasure of the live player.
**Why not here:** human chose full erasure 2026-05-21. (Was the smallest fix, but undersells what the operation is for.)

### Delete live state (drop wallets + inventory on erasure)
**What:** anonymize-retain the audit trail; DELETE the player's `wallets` + `inventory`.
**Wins when:** the compliance posture demands no residual live account data for an erased person.
**Why not here:** human chose anonymize-retain; deleting breaks the uniform `anon_id` model, loses anonymized live analytics, and forces `transactions.wallet_id → wallets` delete-ordering. Defensible posture; recorded for the revisit trigger.

### Scrub-in-place keeping the original `players.id` (no repoint to anon_id)
**What:** NULL `players.external_id`/`email`, keep `players.id`; leave wallets/inventory/audit pointing at the original id.
**Why not here:** breaks the §6 deterministic-`anon_id` correlation model — live rows would carry the original `players.id` while the audit trail carries `anon_id`; two identifiers for one erased player, incoherent. (And the original `players.id` is itself the internal identifier the model replaces.)

## Failure mode

A `players.id` FK not enumerated by the function (e.g. a future `pii_audit` table per `[[player-auth]]` §6, or a new feature table) → the original `player_id` survives there (incomplete erasure, PII leak) AND the rename/delete of the `players` row throws on the dangling reference. Likelihood rises every time a new player-referencing table ships.

## Mitigations

- Derive the function from a **complete FK enumeration** (`SELECT conrelid::regclass FROM pg_constraint WHERE confrelid = 'players'::regclass AND contype='f'`) at implementation time.
- **Post-erasure assertion** in the smoke suite: zero rows reference the original `player_id` across players, wallets, inventory, transactions, loot_rolls, iap_receipts (+ any enumerated FK table); the anon `players` row exists with `external_id`/`email` NULL.
- **Checklist item on every future `players`-FK migration:** "add this table to `wallet_deidentify_player` + the erasure assertion" (see Revisit when).

## Revisit when

- **A new table gains an FK to `players.id`** → it MUST be added to `wallet_deidentify_player` (repoint) + the erasure assertion, or erasure silently becomes partial. Make this a hard checklist item on players-FK migrations.
- **A regulator/customer demands hard-delete erasure** (no anonymized residual) → switch the live-state stance to delete (the rejected alternative); re-derive `transactions.wallet_id` delete-ordering.
- **`anon_id` collision** becomes a concern at >1B players (functionally unreachable at UUIDv8 width per A11) → re-derive projection.

## Contract (for /implementation)

- **New migration** (`CREATE OR REPLACE FUNCTION wallet_deidentify_player(uuid)`; + FK `ALTER`s only if the rename-with-cascade path (A) is chosen). 0012's function is shipped — never edit in place.
- **Step 0 — enumerate** every FK to `players.id` (`pg_constraint`); the function must repoint each. Today's known set: `wallets`, `inventory` (+ verify others). The no-FK audit tables (`transactions`/`loot_rolls`/`iap_receipts`) are repointed as today.
- **Materialize anon identity first** (path A rename-with-cascade OR path B insert-anon-row), then repoint all FK'd tables, then null `players.external_id`/`email` (or set them null on the anon row), then (path B) delete the original.
- **Add the missing `wallets` repoint** (`UPDATE wallets SET player_id = anon_id WHERE player_id = p_player_id`).
- **Keep** the existing `transactions`/`loot_rolls`/`iap_receipts`/`inventory`/`staged_jobs` repoints + PII scrubs.
- **Smoke test8/test9** extended: assert zero original-`player_id` rows across ALL player-referencing tables + anon `players` row exists + `external_id`/`email` NULL; re-run the full suite (now 31/31) to green against the live docker DB.
- **Empirical gate is mandatory** (per `[[wallet/discovery-inventory-sql-never-run]]`): the migration + smoke run against a live Postgres before claiming LANDED.
