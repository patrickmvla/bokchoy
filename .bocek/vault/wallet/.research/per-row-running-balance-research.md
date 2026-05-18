---
type: research
features: [wallet, marketing]
related: ["[[wallet/balance-history-contract]]", "[[wallet/credit-route-contract]]", "[[wallet/wallet-http-contract]]", "[[marketing/currencies-endpoint-research]]", "[[marketing/v1-shape]]", "[[wallet-mechanics]]"]
created: 2026-05-18
confidence: high
provisional: false
---

# Does the game-economy SDK class ship per-row running balance in transaction-history responses?

## Question

For `[[wallet/balance-history-contract]]` GAP 11 G11.7: when `wallets.history({ player, currency })` returns a list of transaction rows, does each row include the running balance *after* that transaction (a `balanceAfter` / `ending_balance` / `running_balance` field), or is the per-row response limited to the delta (amount + kind) with running totals deferred to the customer?

The /design seat staked **(α) persist `transactions.balance_after NUMERIC(20,4)` and ship per row** against (β) omit from wire and let customers compute client-side. The (α) defense rested on three claims the design seat could not verify without research: (1) "Stripe's `balance_transactions` ships `ending_balance` per row" (memory, not cited), (2) "ledgers ship running balance per row" (framing, not production-cited), (3) "Railway pricing puts the storage cost at ~$1/month at projected scale" (inferred, not docs-cited). Triangulating all three.

## Triangulation

- **Production reference:** ✓ — Nakama (tier 1 source: `heroiclabs/nakama/server/core_wallet.go` master, `walletLedger` Go struct).
- **Docs reference:** ✓ — Stripe BalanceTransaction object spec, PlayFab Economy v2 GetTransactionHistory REST API spec, RevenueCat Developer API v2 docs, Postgres 16 NUMERIC type docs.
- **Contradiction probe:** ✓ — actively searched for production game-economy or financial systems shipping per-row running balance. Found Modern Treasury (`resulting_ledger_account_balances`) and Oracle Fusion Cloud Financials (`EndingBalance`) — both **financial-ledger / enterprise-accounting class**, NOT game-economy class. Class-split surfaced is itself a finding, not a contradiction to resolve.

## Sources examined

### Source 1 — Stripe BalanceTransaction object (canonical financial-ledger SDK shape)

- **Tier:** 2 (official docs, version-pinned at the canonical API reference URL).
- **Provenance:** `https://docs.stripe.com/api/balance_transactions/object`, observed 2026-05-18.
- **Author context:** Stripe API team; describes the production object that every Stripe-integrated payments system reads. Framework-defining reference for SaaS API shape conventions.
- **What it tells us:** The BalanceTransaction object's complete field list is `id, object, amount, available_on, balance_type, created, currency, description, exchange_rate, fee, fee_details, net, reporting_category, source, status, type`. **No `ending_balance`, `running_balance`, or `balance_after` field.** The `net` field is the per-row impact on the account balance (`amount` − `fee`); it is NOT the resulting balance after the transaction. Per Stripe-shape convention, the running balance is computed by clients (or surfaced separately via `/v1/balance`).

### Source 2 — PlayFab Economy v2 GetTransactionHistory (direct game-economy SDK class, larger-studio scale)

- **Tier:** 2 (official Microsoft REST API reference, version-pinned to API version `260424`, last updated 2026-04-28 per Microsoft Learn metadata).
- **Provenance:** `https://learn.microsoft.com/en-us/rest/api/playfab/economy/inventory/get-transaction-history?view=playfab-rest`, observed 2026-05-18.
- **Author context:** Microsoft PlayFab team (`andmcc` per `ms.author`); production game-economy backend serving AAA + large indie studios. Audience-scale-mismatch vs BokChoy (larger-studio class per `[[marketing/currencies-endpoint-research]]` F4) but identical problem class.
- **What it tells us:** The `Transaction` object's complete field set is `ApiName, ClawbackDetails, CustomTags, ItemType, OperationType, Operations[], PurchaseDetails, RedeemDetails, Timestamp, TransactionId, TransferDetails`. The inner `TransactionOperation` object has `Amount, DurationInSeconds, ItemFriendlyId, ItemId, ItemType, StackId, Type`. **No `balanceAfter` or running-balance field at any level.** Customers compute running totals client-side.

### Source 3 — Nakama wallet ledger Go struct (game-server framework, infrastructure class)

- **Tier:** 1 (production code, public source).
- **Provenance:** `github.com/heroiclabs/nakama/server/core_wallet.go`, master branch, observed 2026-05-18.
- **Author context:** Heroic Labs production game-server framework, BSD-3 licensed. Adopted across indie and mid-tier studios per public commit history. Audience-scale spans indie through mid-tier game backends.
- **What it tells us:** The internal `walletLedger` struct is `{ID string, UserID string, Changeset map[string]int64, Metadata map[string]interface{}, CreateTime int64, UpdateTime int64}`. **No `Balance` field representing running balance.** The `Changeset` is a map of per-currency deltas (e.g., `{"gems": +100, "coins": -50}`), not a cumulative balance state.

### Source 4 — RevenueCat Developer API v2 (closest BokChoy audience-scale analog, indie F2P scale)

- **Tier:** 2 (official docs, version-pinned at v2).
- **Provenance:** `https://www.revenuecat.com/docs/offerings/virtual-currency` and `https://www.revenuecat.com/docs/api-v2`, observed 2026-05-18. Confirmed by RevenueCat Community thread "Virtual Currency Transactions" (forum post, dated; class shifts to tier 6 for forum but reinforces docs cite).
- **Author context:** RevenueCat team; production-cited × 1 tier 2 per `[[marketing/currencies-endpoint-research]]` F1 as the closest audience-scale match for BokChoy (indie/SMB F2P).
- **What it tells us:** RevenueCat exposes two virtual-currency endpoints: `GET /v2/projects/<id>/customers/<id>/virtual_currencies` (returns balances for all currencies a customer holds) and `POST /v2/projects/<id>/customers/<id>/virtual_currencies/transactions` (deposit/spend; response returns updated balances). **There is no transaction-history endpoint on the Developer API at all** — detailed transaction history is UI-only at present, per the RevenueCat Community moderator response. Implication: at the indie F2P audience scale BokChoy targets, the precedent SDK doesn't even expose history reads; the question of per-row balance is moot for the closest peer.

### Source 5 — Modern Treasury Ledgers API (CONTRADICTION PROBE — financial-ledger class)

- **Tier:** 4 (engineering blog, named author, recent; vendor-published).
- **Provenance:** `https://www.moderntreasury.com/journal/designing-ledgers-with-optimistic-locking` and `https://www.moderntreasury.com/journal/behind-the-scenes-how-we-built-ledgers-for-high-throughput`, observed 2026-05-18.
- **Author context:** Modern Treasury engineering team; production payment-operations / treasury-API at fintech scale. Different problem class — corporate treasury operations, not game economies. Audience-scale-mismatch with BokChoy.
- **What it tells us:** Modern Treasury ships `resulting_ledger_account_balances` per Entry — *"the total Account balance as it was when each Entry is written to it … can power Account statements, such as for a credit card or bank account, that typically show resulting balances after each Transaction."* They expose this via a `show_resulting_ledger_account_balances` request flag. **Supports (α) at financial-ledger class.**

### Source 6 — Oracle Fusion Cloud Financials Ledger Balances (CONTRADICTION PROBE — enterprise-accounting class)

- **Tier:** 2 (official Oracle Fusion docs).
- **Provenance:** `https://docs.oracle.com/en/cloud/saas/financials/25a/farfa/op-ledgerbalances-get.html`, observed 2026-05-18.
- **Author context:** Oracle Fusion Cloud Financials API; enterprise-grade accounting SaaS. Different problem class entirely — general-ledger accounting, not game/payments. Audience-scale dramatically mismatched.
- **What it tells us:** Oracle Fusion's `GET .../ledgerBalances` endpoint exposes an `EndingBalance` field per row — *"the ending account balance for the provided criteria."* **Supports (α) at enterprise general-ledger class.**

### Source 7 — Postgres 16 NUMERIC storage docs (Q4 supporting)

- **Tier:** 2 (canonical docs, version-pinned).
- **Provenance:** `https://www.postgresql.org/docs/16/datatype-numeric.html`, observed 2026-05-18.
- **Author context:** Postgres core docs.
- **What it tells us:** Verbatim: *"Numeric values are physically stored without any extra leading or trailing zeroes. … The actual storage requirement is two bytes for each group of four decimal digits, plus three to eight bytes overhead."* For NUMERIC(20,4): 5 groups × 2 bytes = 10 bytes + 3–8 bytes overhead = **13–18 bytes per value, variable**. TOAST not triggered for sub-2KB values. The /design seat's "~16 bytes" estimate falls within range; per-row storage projection (240M × 15 bytes ≈ 3.6 GB at 24-month horizon) holds.

### Source 8 — Postgres 16 ALTER TABLE docs (Q3 supporting, partial)

- **Tier:** 2 (canonical docs, version-pinned).
- **Provenance:** `https://www.postgresql.org/docs/16/ddl-alter.html`, observed 2026-05-18.
- **Author context:** Postgres core docs.
- **What it tells us:** General ADD COLUMN guidance: *"From PostgreSQL 11, adding a column with a constant default value no longer means that each row of the table needs to be updated when the `ALTER TABLE` statement is executed. Instead, the default value will be returned the next time the row is accessed, and applied when the table is rewritten, making the `ALTER TABLE` very fast even on large tables."* **The page does not specifically address partitioned-table behavior.** A NULL-default ADD COLUMN is metadata-only on regular tables; analogous behavior on partitioned tables is the strong inference (each partition is a regular table receiving the same ADD COLUMN propagation) but is not explicitly stated on this page. Open thread below.

## Findings

### F1 — Game-economy SDK class converges on omitting per-row running balance

Three production systems in or adjacent to BokChoy's problem class — **Stripe BalanceTransaction (Source 1), PlayFab Economy v2 Transaction (Source 2), Nakama walletLedger (Source 3)** — all explicitly omit a per-row running-balance field from their transaction-history response shape. They ship the delta (`amount`/`net`/`Changeset`/`Operations[].Amount`) and leave running-total computation to the client.

The closest audience-scale match for BokChoy (Source 4 RevenueCat) **does not expose a transaction-history endpoint at all** at the public Developer API level. Per `[[marketing/currencies-endpoint-research]]` F4 RevenueCat is the SMB/indie F2P precedent.

This is a uniform pattern across the class: tier-1 Nakama + tier-2 Stripe + tier-2 PlayFab + tier-2 RevenueCat-by-omission. Confidence: **high**.

### F2 — Financial-ledger / enterprise-accounting class ships per-row running balance

Modern Treasury (Source 5, tier 4) ships `resulting_ledger_account_balances` per Entry, and Oracle Fusion (Source 6, tier 2) ships `EndingBalance` per ledger-balance row. **Both are different problem classes** — treasury operations API (Modern Treasury) and enterprise general-ledger accounting (Oracle Fusion) — not game-economy SDKs. Both ship per-row resulting balance to power use cases (account statements, audit trails for financial reconciliation) that don't transfer to the game-economy class at indie/SMB audience scale.

### F3 — Audience-class verdict places BokChoy with the F1 pattern

`[[marketing/v1-shape]]` positions BokChoy as *"wallet infrastructure for game economies."* `[[marketing/currencies-endpoint-research]]` F4 explicitly places BokChoy at the indie/SMB F2P audience scale (RevenueCat + LootLocker precedent class). The F2 contradicting evidence (Modern Treasury, Oracle Fusion) is audience-class-mismatched: those products serve fintechs and enterprise accounting teams whose customers require formal accounting statements with running balances per entry. BokChoy's customer is a game-server engineer rendering a wallet UI on session start — not an accountant reconciling a bank statement.

Per `[[marketing/currencies-endpoint-research]]` F1 precedent (game-economy class converged on `code`-shaped currency wire field; cross-class precedent for `slug` from Better Auth/Vercel was rejected as audience-class-mismatched): **same shape applies here**. Within-class production cite × 3 explicit + 1 by-omission → reject (α). Cross-class production cite × 2 supporting (α) → vault as the rejected alternative with conditions ("if BokChoy ever pivots to non-game financial-ledger use cases, revisit").

### F4 — The (α) "reversibility tax" argument is supported but doesn't change the verdict

Source 7 confirms per-row storage cost (13–18 bytes, 3.6 GB at projection). Source 8 confirms ADD COLUMN with constant or NULL default is metadata-only on regular tables (PG11+ optimization); partitioned-table behavior is strong inference (each partition is a regular table) but not directly documented on the page consulted. **Open thread below.**

The /design seat's "expensive backfill if we add the column later" argument has substance — adding the column to non-empty partitioned `transactions` table requires either (a) NULL backfill (metadata-only, cheap) leaving historical rows with `balance_after=NULL` or (b) compute-and-write backfill (window-function pass over the wallet history, expensive). Option (a) is cheap and preserves the optionality without committing to historical accuracy; option (b) is the truly-expensive case. **Implication:** if (α) is ever needed in the future, the cheap path is ADD COLUMN NULL + populate from the next credit/debit onward, accepting null for historical rows. The reversibility tax is smaller than the /design seat claimed.

## Conflicts

**F1 vs F2 — class-split, not resolution:**

Game-economy SDK class (F1) and financial-ledger / enterprise-accounting class (F2) take opposite positions on per-row running balance. Per *Contradiction protocol*:

- Both sides include tier-2 docs cites (Stripe + PlayFab on F1 side; Oracle Fusion on F2 side). Tier doesn't break the tie.
- F1 side includes a tier-1 production-code cite (Nakama Go struct). F2 side does not have a tier-1 cite in the public-source channel. **Tier-1 evidence weighs F1 heavier.**
- The contradiction is **about audience-class match**, not about which approach is engineering-correct. Both are correct within their class. The /design seat should pick the class match, not "average the positions."

No artificial resolution — both findings vault as-stated. The audience-class match decides which applies to BokChoy.

## Conditions

- **F1 applies** at audience-scale: indie/SMB through larger-studio F2P game economies. Customer use case: rendering wallet UI, activity feed, basic dispute resolution. Customers compute running totals client-side from `amount` + `kind` if needed.
- **F1 breaks** if BokChoy pivots to: regulatory accounting (e.g., real-money cashout requiring auditor-shape statements), enterprise general-ledger integration (customers exporting BokChoy data to accounting software requiring per-row resulting balance), or fintech-style settlement reporting.
- **F2 applies** at: fintech treasury operations, enterprise general-ledger accounting, regulated financial reporting. Customer use case: account statements, audit trails for financial reconciliation, reg-compliant journaling.
- **Q4 storage estimate (13–18 bytes/row NUMERIC(20,4))** holds for inline storage. TOAST not triggered.
- **Q3 ADD COLUMN cost** holds for regular tables and is strong-inferred for partitioned tables, but the partitioned-table case is not directly cited on the consulted page. Verify before committing to a "we can always add it later" claim if (α) is revisited.

## Operational implications

**For `[[wallet/balance-history-contract]]` G11.7:**

1. **Pick (β) — omit `balanceAfter` from each history row.** History row shape becomes `{ id, createdAt, kind, amount, reasonCode, sourceEventId?, relatedId?, relatedType?, metadata? }` — matches Nakama `walletLedger` shape + Stripe BalanceTransaction shape + PlayFab Transaction shape within the game-economy class.
2. **Do not add `transactions.balance_after` column.** No migration 0011 required. `transactions` schema is unchanged from M-1.5. SQL functions continue to return `balance_after` as a function-call return value (consumed by the credit/debit route response, NOT persisted to the table column).
3. **Customers needing running totals compute client-side** from `amount` + `kind` (signed delta: `kind === 'currency_credit' ? +amount : -amount`). Documentation of this pattern in SDK docs is owed.
4. **Reversibility path documented:** if a future customer requires per-row balance (or BokChoy pivots toward F2 class), ADD COLUMN NULL is metadata-only on partitioned tables (strong inference; verify in Q3 follow-up). Populate from the next credit/debit forward; historical rows carry NULL. No expensive backfill required.
5. **Marketing/`code-walkthrough.tsx` snippet alignment:** the v1-shape history snippet should show `wallets.history({ player, currency })` returning rows shaped without `balanceAfter`. SDK Transaction TypeScript type omits the field. This is also the same shape Nakama publishes and that customers familiar with game-economy SDKs already expect.

**For the /design seat:**

The (α) defense leaned on three uncited claims that all fell:
- "Stripe ships ending_balance per row" — FALSE per Source 1.
- "ledgers ship running balance" — TRUE for the financial-ledger class (F2); FALSE for the game-economy class (F1).
- "$1/month at Railway pricing" — unverified by this research; not load-bearing because the audience-class verdict decides on grounds other than cost.

(β) wins on production-cite + audience-class match, not on cost.

## Reproducibility note

Reproducible. Another investigator with the same question and standard tooling reaches substantially the same finding:

1. Read `docs.stripe.com/api/balance_transactions/object` field list — verify "no ending_balance".
2. Read `learn.microsoft.com/en-us/rest/api/playfab/economy/inventory/get-transaction-history` Transaction schema — verify "no balanceAfter".
3. Clone or browse `github.com/heroiclabs/nakama` master branch, find `server/core_wallet.go`, locate `walletLedger` struct — verify "no Balance field".
4. Search `revenuecat.com/docs/api-v2` for transaction-history endpoint — verify "not exposed at v2".
5. Contradiction probe: search "financial ledger API ending_balance per row" — surface Modern Treasury (`resulting_ledger_account_balances`) + Oracle Fusion (`EndingBalance`).
6. Audience-class match per `[[marketing/currencies-endpoint-research]]` F4 — apply same class-split logic that resolved the `code` vs `slug` decision in May 2026.

Judgment that is load-bearing but reproducible: the audience-class match is a *categorical* judgment ("BokChoy is game-economy class, not financial-ledger class"). Anchored in `[[marketing/v1-shape]]` hero copy + `[[marketing/currencies-endpoint-research]]` F4 audience-class definition. Another investigator reading those vault entries reaches the same class assignment.

## Open threads

1. **Postgres ADD COLUMN cost on partitioned tables — direct cite owed.** Source 8 covers regular tables; partitioned-table behavior is strong inference. If a future seat picks (α) on a class pivot, verify against `https://www.postgresql.org/docs/16/ddl-partitioning.html` or the `ALTER TABLE` reference page directly before committing to "ADD COLUMN NULL is metadata-only on partitions."
2. **LootLocker + AccelByte transaction-history row shapes — opaque in public docs.** Public API spec pages returned no schema body. Two paths to close: (a) read AccelByte Go SDK source on GitHub (`AccelByte/accelbyte-go-sdk`) for the wallet OpenAPI struct; (b) reach LootLocker support for the Get Player Operations response schema. Not load-bearing for the current decision (F1 is strong with the 4 sources already cited) but would tighten the contradiction probe.
3. **Customer-side running-total convention — docs owed.** If customers want the running balance, the SDK docs must show the canonical client-side compute pattern (`signed delta = kind === 'currency_credit' ? +amount : -amount`; running sum on the page). This is a doc-writing thread, not research.
