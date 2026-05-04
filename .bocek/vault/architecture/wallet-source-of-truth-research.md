---
type: research
features: [wallet, architecture]
related: ["[[idempotency-strategy]]", "[[idempotency-strategy-research]]", "[[mvp-feature-sequence]]", "[[wallet-audit-invariant-research]]"]
created: 2026-05-02
confidence: high
provisional: false
---

> **Errata 2026-05-02:** the trigger-constraint mechanism named in §"Operational implications" / "If design picks path B" was inferred, not production-cited. `[[wallet-audit-invariant-research]]` (same-day follow-up) found that NO surveyed production ledger reference (Brandur, Square Books, pgledger, Modern Treasury) uses triggers for paired-write enforcement, and GitGuardian published a documented removal experience for triggers in production. The corrected framing surfaces three mechanisms — M1 (app library + discipline), M2 (stored-function-only-interface, the pgledger pattern), M3 (trigger, no production cite for this use case). Read the follow-up entry before staking the path-B mechanism choice.

# Wallet source-of-truth: do production game-backends ship event-sourced wallets, CRUD-with-audit-log, or hybrid — and what's the failure-mode signature of each?

## Question

For a virtual-currency wallet in a multi-tenant game-economy backend serving indie-to-mid-market F2P customers (~3–600 writes/sec/project), is the production-grade source-of-truth model:

- **Path A** — append-only event log, balance is a projection,
- **Path B** — balance row mutated under serializable isolation, transactions table is an audit log alongside,
- **Path C** — hybrid (some entities event-sourced, others CRUD), or
- **Path D** — CRUD interface with ledger-shaped storage underneath (storage gives immutability for free)?

What do named production systems actually ship, what failure modes does each pattern make structurally impossible vs. discipline-dependent, and where does each pattern dominate at BokChoy's scale?

## Triangulation

- **Production reference:** ✓ — Stripe Ledger (Path A, fintech scale); PlayFab Economy v2 (Path B, game-backend scale, official Microsoft docs); Beamable virtual currency (Path B, simpler); LootLocker Economy (Path B); AWS reference architecture for in-game currency (Path D, QLDB-backed); `brandur/rocket-rides-atomic` (Path B mechanics for idempotency, not a wallet — already vaulted in `[[idempotency-strategy-research]]`).
- **Docs reference:** ✓ — PlayFab REST API spec for `ExecuteInventoryOperations` (Microsoft Learn, version `playfab-rest`, last updated 2026-04-28); PlayFab Transaction History conceptual doc (last updated 2025-05-01); Beamable Virtual Currency docs (`docs.beamable.com/docs/virtual-currency-code`).
- **Contradiction probe:** ✓ — Dudycz argues "bank account is not the best example of Event Sourcing" (event-driven.io, 2020-12-09) on replay-cost grounds; Doomen catalogs concrete production failure modes specific to event sourcing (LinkedIn, named author, Aventum Solutions / Verkada). Counter-direction probe ("post-mortem of CRUD-with-audit-log going wrong") returned no named tier-1 incident — surveyed sources surface tutorials and bookkeeping discrepancies, not architecture-attributable failures.

## Sources examined

### S1 — Stripe Ledger engineering blog (Ganelin)

- **Tier:** 2 (official engineering post; primary article body partially behind paywall, summaries available across multiple covering posts)
- **Provenance:** `stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement`, observed 2026-05-02. Author: Ilya Ganelin. Date: 2024-02-16. Cross-covered by `fintechwrapup.com/p/deep-dive-ledger-stripes-system-for` (Sam Boboev, 2025-01-12).
- **Author context:** Stripe engineering, money-movement infrastructure team. Describes payments at Stripe scale.
- **What it tells us:** Stripe Ledger is **"an immutable and auditable log, as a trustworthy system of record"** that **"models internal data-producing systems with state machines, modeling behavior as logical fund flows—the movement of balances between accounts."** Processes 5 billion events per day. Validates fund movement via double-entry bookkeeping (every transaction debits one account and credits another). **This is path A: events are source of truth, balances are projections derived from event streams.** Stripe built a custom ledger DB rather than using Postgres or another off-the-shelf database; the engineering motivation cited was scale (billions of events/day), unified representation across many producer systems, and reconciliation requirements against external rails (banks, networks).

### S2 — PlayFab Economy v2 Inventory: ExecuteInventoryOperations API spec

- **Tier:** 1 (official REST API spec, version-pinned, Microsoft-authored)
- **Provenance:** `learn.microsoft.com/en-us/rest/api/playfab/economy/inventory/execute-inventory-operations`, API version `260424`, doc last updated 2026-04-28. Observed 2026-05-02.
- **Author context:** Microsoft Gaming, PlayFab service team. Generally Available product. Ships at every scale — from solo indie to Activision-tier (PlayFab is Microsoft's first-party economy backend).
- **What it tells us:** The wallet/inventory mutation API is **CRUD with ETag-based optimistic concurrency, batched and atomic.**
  - Operations: `Add`, `Subtract`, `Update`, `Purchase`, `Transfer`, `Delete` — direct mutations on inventory amount, not events appended to a log.
  - **"The operations to run transactionally. The operations will be executed in-order sequentially and will succeed or fail as a batch. Up to 50 operations can be added."** — atomic batched CRUD.
  - **`ETag` parameter for concurrency checking** — optimistic locking on the inventory row, pattern characteristic of CRUD-on-state-row.
  - **`IdempotencyId` parameter** with documentation **"Idempotency IDs can be used to prevent operation replay in the medium term but will be garbage collected eventually."** — this is decisive: an event store does not garbage-collect events. GC of idempotency keys is the CRUD-with-dedupe-table pattern (matches `[[idempotency-strategy]]`'s 24h TTL).
  - Response returns **`TransactionIds[]`** — pointers into a separate transaction-history store, not the source of truth.
  - Error codes include `InsufficientFunds (1059)`, `PreconditionFailed (1610)` — direct read-modify-write semantics on the balance row.

### S3 — PlayFab Economy v2 Transaction History

- **Tier:** 2 (official conceptual doc, Microsoft-authored)
- **Provenance:** `learn.microsoft.com/en-us/gaming/playfab/features/economy-v2/inventory/transaction-history`, last updated 2025-05-01. Observed 2026-05-02. Author: wesjong (per doc frontmatter).
- **Author context:** Microsoft PlayFab docs team.
- **What it tells us:** Transaction History is **explicitly a separate audit/forensics surface, not the source of truth.**
  - **"This data can be used to help track usage of game systems, troubleshoot bugs, and identify malicious actors."** — framed as audit/forensics, not state derivation.
  - `Filter` supports timestamp ranges only, **with a maximum 6-month window per query**. An event-sourced system cannot bound history this way — the events ARE the state, you cannot retain a partial subset and still rebuild balances. A bounded audit log is path B.
  - **"Some events such as CollectionCreated and CollectionDeleted aren't presented in the transaction history."** — confirms the "transactions" are projections from a *separate* internal log, not the canonical event stream. Some operations are not surfaced at all.

### S4 — Beamable Virtual Currency code reference

- **Tier:** 2 (official SDK docs, vendor-authored)
- **Provenance:** `docs.beamable.com/docs/virtual-currency-code`, observed 2026-05-02.
- **Author context:** Beamable platform docs. Beamable serves indie/mid-market F2P — same ICP segment BokChoy targets.
- **What it tells us:** Beamable's wallet API is **the simplest path B shape — pure CRUD with no documented audit log.**
  - `InventoryUpdateBuilder.CurrencyChange(currencyId, delta)` accepts positive or negative integers — direct delta application to balance.
  - Balance reads via `inventoryView.currencies` — `Dictionary<string, long>` keyed by currency ID. **Balance is a single `long` value per currency.**
  - **No documented transaction log, history endpoint, or event stream.** Forensics in Beamable are not a first-class feature.

### S5 — LootLocker Economy

- **Tier:** 4 (vendor blog, named platform but no engineering deep-dive)
- **Provenance:** `lootlocker.com/blog/new-economy-currency-system`, observed 2026-05-02.
- **Author context:** LootLocker is a smaller indie-focused game-backend competitor.
- **What it tells us:** LootLocker ships path B with no transaction history surface documented. **"The Currencies that a player owns are stored in that player's Wallet. Only the logged in player and the server can change the Currencies in the Wallet."** Four API categories — Currency, Catalogs, Wallets & Balances, Purchasing — none of which are an event/transaction log API. Confirms the indie-game-backend pattern.

### S6 — AWS Architecture Blog: Building a Serverless Wallet Service for In-Game Currency

- **Tier:** 4 (AWS architecture blog, named authors, dated)
- **Provenance:** `aws.amazon.com/blogs/architecture/building-a-serverless-wallet-service-for-in-game-currency/`, authors Coronel & Vajja, AWS, 2021-06-01. Observed 2026-05-02.
- **Author context:** AWS solutions architects. Reference architecture, not a production system, but specifically scoped to "in-game currency" — directly on-topic.
- **What it tells us:** Path D (hybrid storage). **"To keep things simple in the following example, we have one table (`Wallets`) and only store the `accountId` and `balance` as a QLDB document."** Balance is the only stored attribute on `Wallets` — pure path B at the *interface* level. But the underlying store is **Amazon QLDB**, which is a ledger database with **built-in immutable transaction history** (every change recorded automatically with QLDB-managed metadata). Transaction history is then streamed via Kinesis to DynamoDB for query performance. **The architectural insight: CRUD ergonomics on top of ledger storage gives you path A's audit-completeness without path A's interface complexity.** "Because it's a ledger database, it contains the history of all modifications."

### S7 — Dudycz: "Why a bank account is not the best example of Event Sourcing"

- **Tier:** 4 (engineering blog, named author with ES expertise, dated)
- **Provenance:** `event-driven.io/en/bank_account_event_sourcing/`, Oskar Dudycz, 2020-12-09. Observed 2026-05-02.
- **Author context:** Dudycz is an event-sourcing practitioner and Marten committer (Marten is a popular .NET event store). Has been writing on ES for years; not a casual blogger.
- **What it tells us:** **The standard "balance is replayed from events" pitch fails at realistic volumes.** Dudycz uses his own banking history (~18,615 transactions over 17 years at 3/day) as the worked example: replaying tens of thousands of events to compute a current balance is wasteful. He recommends **snapshots** or **summary events** (rolling closures that allow archiving older events) as mitigations. He suggests Order or Helpdesk-ticket as better ES introductory examples — which signals that the bank-account/wallet shape introduces *operational tax* (snapshot management, summary events, archival) that the canonical ES pitch hides. **Implication for BokChoy: a literal event-sourced wallet inherits an operational story we have to maintain — it's not free even if conceptually clean.**

### S8 — Doomen: "The Ugly of Event Sourcing — Real-world Production Issues"

- **Tier:** 4 (LinkedIn engineering article, named author with ES platform-vendor reputation)
- **Provenance:** `linkedin.com/pulse/ugly-event-sourcing-real-world-production-issues-dennis-doomen`, observed 2026-05-02.
- **Author context:** Dennis Doomen, author of NEventStore / Liquid Projections, longtime ES practitioner. Lists concrete failure modes from production deployments.
- **What it tells us:** Catalogs failure modes specific to ES, all of which have CRUD-with-audit-log analogues that are *less likely* or *less load-bearing*:
  1. **Schema evolution problems.** A property's max length changes; old projections break against new events. *In CRUD-with-audit, schema migrations are atomic table changes — events don't need backward-compat across decades.*
  2. **Missing event properties.** Older versions of an event lacked a field; projection assumes the field is present. *In CRUD, the field exists or doesn't on the live row.*
  3. **Event ordering assumptions.** Projectors implicitly depend on a sequence; reorder breaks them. *In CRUD, the row reflects the latest write — order only matters within a transaction.*
  4. **Projection desynchronization.** Events are split/merged; projections silently drift. *In CRUD, there is no second projection to drift.*
  5. **Projector dependencies.** One projection reads another, the second is at a different point in event-stream history, inconsistencies appear. *Doesn't apply in CRUD.*
  6. **SQL Server identity ordering.** Inserts complete out-of-order, projections process prematurely. *In CRUD, the txn commits or it doesn't.*
  7. **Duplicate events from background jobs not checking idempotency.** 100K+ events accumulated in a single stream. *In CRUD, this is the same idempotency-key problem CRUD-with-audit-log already has to solve, and `[[idempotency-strategy]]` already addresses.*

  **Doomen's list is a catalog of taxes path A imposes that path B doesn't.** Not a falsification of ES — Doomen ships an ES platform — but an honest ledger of what teams actually pay.

### S9 — Brandur `rocket-rides-atomic` (re-cited from `[[idempotency-strategy-research]]`)

- **Tier:** 1 (production code)
- **Provenance:** `github.com/brandur/rocket-rides-atomic@94b370d`, already vaulted.
- **What it tells us, scoped to this question:** rocket-rides is a ride-share app with payment, not a virtual-currency wallet. There is no `wallet.balance` row at all. The schema reveals **CRUD on the business state (rides table), with `idempotency_keys` for replay protection and `staged_jobs` for outbox.** This is the load-bearing detail for the new question: even Brandur's reference (the production cite `[[idempotency-strategy]]` is built on) does NOT event-source balances. Brandur's pattern is path B mechanics for the idempotency surface, with business state mutated under transactions. Re-using Brandur as evidence for path A vs. path B *for wallet specifically* would be an over-claim — Brandur is silent on that question; he addresses idempotency for in-process multi-step ops, not balance source-of-truth.

## Findings

### F1 — At BokChoy's ICP scale, every named game-economy backend ships path B (CRUD on balance with optional separate audit log)

PlayFab (Microsoft, every scale), Beamable (indie/mid-market), LootLocker (indie), and AWS's published reference architecture for in-game currency — none of them event-source the wallet at the interface level. The canonical operations are `Add` / `Subtract` / `Purchase` / `Transfer` on a balance value, with optimistic concurrency (ETags) and idempotency keys handling retry safety. Forensic audit is provided as a *separate, optional, possibly-bounded* surface — PlayFab caps transaction-history queries at 6 months per call; Beamable and LootLocker don't expose one at all in public docs.

This is a strong tier-1+2 pattern signal across four named systems. It is not coincidence and it is not naïveté — the surveyed systems include Microsoft PlayFab, which has had a decade to add event sourcing if it were the right call.

### F2 — Stripe Ledger is the only path-A reference, and it operates under conditions BokChoy does not face

Stripe processes 5B events/day, reconciles against bank rails, faces money-movement regulatory audit, and built a custom ledger database to do so. The architectural choice is grounded in:
- **Regulatory reconciliation:** Stripe's books must match counterparty books (banks, card networks); event log is the canonical record for dispute resolution at the regulator.
- **Cross-system unification:** "many systems and partners" produce data; Ledger normalizes representation.
- **Volume:** 5 billion events/day is an event-store-sized problem.

BokChoy's MVP scale is ~3 writes/sec/project at indie tier, ~575 at Studio+ — orders of magnitude below the Stripe Ledger threshold. BokChoy faces no regulatory reconciliation against external rails (virtual currency in F2P games is not regulated money). The justifications that drove Stripe to path A do not apply.

### F3 — Path D (CRUD interface, ledger storage underneath) is a real fourth option, surfaced by AWS+QLDB, but does not apply on Postgres

The AWS reference architecture using QLDB gets *audit-completeness for free* — every change to the `Wallets` document is automatically recorded with QLDB metadata, no separate audit-write code path required. The interface is path B (CRUD); the storage is ledger. **This is the structurally cleanest shape: no second write path to forget, no second table to maintain, no projection to keep in sync.**

But: BokChoy is committed to Postgres-only per `[[idempotency-strategy]]` (B7, "permanent commitment regardless of future Redis"). Postgres is not a ledger database — it does not provide automatic immutable history at the storage layer. The closest Postgres analogues are:
- Manual `transactions` table written in the same transaction as the balance update (path B).
- Logical replication audit captured externally (Debezium → Kafka → archival store) — adds infrastructure BokChoy does not have.
- Postgres temporal extensions (`temporal_tables`, `pg_audit`) — not in MVP scope per `[[mvp-feature-sequence]]`.

**Path D is not available on the BokChoy stack without additional infrastructure.** Worth surfacing as the design choice "we explicitly are not doing path D because we are not adding QLDB-equivalent storage."

### F4 — Path A imposes operational taxes path B does not

Per S7 + S8, the named taxes of path A specifically:
- **Snapshot management** — wallet replay cost grows with player history. F2P players accumulate transactions fast (battle pass progression, daily quests, IAP, loot rolls). Snapshots are required, which adds a state-machine to maintain and a rebuild-on-corruption procedure.
- **Schema evolution discipline** — every event type must remain backward-compatible *forever* in the event store, or migrations require event rewriting (an expensive and risk-laden operation). Reason-code taxonomies in F2P evolve every live-ops cycle (new currencies, new sinks/faucets ship monthly).
- **Projection synchronization** — if balance is a projection, the projection layer is a second write path that must stay in sync with the event log. This is the source of Doomen's S8 #4 (projection desynchronization) and #5 (cross-projector dependencies).
- **Replay performance** — recovering balance from events is O(events), and events grow without bound. Mitigations exist (snapshots, summary events) but are themselves operational debt.

These are not hypothetical. Doomen's list is from production. Dudycz cites them specifically as why bank-account-shaped data is a poor ES introduction.

### F5 — Path B's structural failure mode is real but bounded by `[[idempotency-strategy]]`

The argument for path A's failure-mode robustness is **"a future engineer adds a wallet mutation path and forgets to write the audit log row."** This is a real risk. Mitigations:
1. **Database-level constraint:** Postgres CHECK constraint or trigger refusing balance updates without a paired `transactions` row in the same transaction. Cited as "discipline" in S7/S8 framing — but in Postgres, a trigger that aborts the transaction on missing audit-row is not discipline, it's a constraint. *Implementation cost: one DDL statement per protected entity. This is engineering, not operational tax.*
2. **Code review pattern:** all wallet mutations route through a single `wallet.credit(...)` / `wallet.debit(...)` library function that writes both the balance update and the transactions row, never raw SQL. Compiler-enforceable in a typed language; review-enforceable otherwise.
3. **Reconciliation job:** periodic `SUM(amount)` over `transactions` table compared to `wallet.balance` — alerts on drift. Cheap to run at BokChoy scale.

The "audit-write was forgotten" failure mode is mitigated to "implausible" with constraint #1 alone. It does not require event sourcing to make this failure mode unrepresentable.

### F6 — None of the surveyed game backends face the regulatory audit pressure that drove Stripe to path A

Path A's load-bearing argument is forensic completeness for regulatory and dispute-resolution purposes. F2P virtual currency is not regulated as financial instrument — it is consumable goods purchased via Apple/Google/Steam IAP rails, which are themselves the regulated layer. BokChoy's chargeback defense surface is at the IAP receipt layer (which is externally event-logged by Apple/Google) and at the transactions-table audit layer (path B already provides).

The "where did my gems go" customer support query is real and load-bearing for F2P. Path B with a `transactions` table answers it cleanly: `SELECT * FROM transactions WHERE wallet_id = ? ORDER BY created_at`. Same query, same operational shape, materially identical UX as path A's projection query — except path A pays the operational tax of F4.

## Conflicts

### Stripe vs. PlayFab on the same problem class — but at different conditions

Stripe Ledger and PlayFab Economy v2 are both solving "track and validate financial movement" — and they choose opposite architectures. The contradiction-protocol resolution:

- **Production code wins over docs:** Both are tier-1/2 production systems. Equal weight as production references.
- **Multiple independent production examples beat one:** PlayFab + Beamable + LootLocker + AWS-reference all converge on path B at game-backend scale. Stripe is a single production example at fintech scale.
- **Conditions matter:** Stripe operates at 5B events/day under regulatory reconciliation; the surveyed game backends do not. The contradiction is *resolved by scale and regulatory regime* — both sides are correct *under their respective conditions*.

The conflict isn't path A vs. path B in the abstract. It's **"what is BokChoy's regulatory posture and write volume?"** BokChoy is on the game-backend side of that line, not the fintech side. Decision recommendation flows from there to design.

### Dudycz writes both pro-ES and anti-bank-account-as-ES content

S7 (the bank-account critique) is by the same author who wrote the architecture-weekly piece on ledger databases (`architecture-weekly.com/p/building-your-own-ledger-database`, 2024-11-11). Dudycz is not anti-event-sourcing; he is event-sourcing-aware enough to flag that the canonical ES pitch hides operational complexity for balance-shaped data. The contradiction is internal to a sympathetic source — which strengthens its weight, not weakens it.

## Conditions

This finding holds under:

- **Scale ≤ ~10M writes/day system-wide.** Above that, replay-cost and projection-lag arguments shift; consider re-investigating path A with snapshots. BokChoy's MVP is far below this threshold (Studio+ at 575 writes/sec/project × 100 paying customers ≈ 5B writes/day system-wide hypothetical maximum, but realistic load is 100×–1000× lower).
- **No external regulatory reconciliation.** If BokChoy ever enters regulated payments (e.g., real-money cash-out, regulated tokens, child-protection regulator audit beyond loot-box disclosure), revisit. Per `[[wedge-decision]]`, this is explicitly out of scope.
- **Postgres-only stack.** Per `[[idempotency-strategy]]` B7. Path D requires QLDB or equivalent. If the architecture changes, path D becomes available.
- **F2P-shaped customer support.** The "where did my gems go" forensic query is the load-bearing forensic case. If a different forensic case emerges (e.g., regulator demanding 7-year retention with cryptographic immutability), revisit.

This finding does **not** generalize to:
- Inventory items with attached real-money value (e.g., NFT-backed inventory). Different regulatory regime; path A or D may be required.
- Multi-tenant accounting where BokChoy itself moves money between projects (inter-project clearing, revenue splits with partners). That would be Stripe-shape.

## Operational implications for design (CL-029)

Surfacing the strongest argument for each path scoped to BokChoy's actual conditions. **Research does not decide; design does.**

### If design picks path B (CRUD on balance, transactions table as same-txn audit log)

- `wallet.balance` is the source of truth, mutated under SERIALIZABLE per `[[mvp-feature-sequence]]` line 52.
- `transactions` table written in the same Postgres transaction as the balance update. Schema includes `wallet_id`, `amount`, `reason_code`, `source_event_id`, `created_at`, `idempotency_key_id` (foreign key into the idempotency-keys table per `[[idempotency-strategy]]`).
- **Failure mode "engineer forgets audit write" mitigated by Postgres trigger** that aborts balance updates without a paired transactions-row insert in the same transaction. Implementation: one DDL statement. Not operational tax.
- `staged_jobs` outbox table per `[[idempotency-strategy]]` cascade obligation #2 is for **external side effects** (webhook fire, mailbox push, IAP receipt validation echo) — not the same as `transactions`. Keep the two separate.
- Forensics ergonomics: `SELECT * FROM transactions WHERE wallet_id = ? ORDER BY created_at` answers customer support. Reconciliation: `SUM(amount) FROM transactions WHERE wallet_id = ?` compared to `wallet.balance` as a periodic job.
- **Aligned with**: PlayFab, Beamable, LootLocker, Brandur reference impl, `[[idempotency-strategy]]` mechanics.
- **Concedes:** the audit-row constraint relies on the trigger being maintained correctly; if a future migration drops the trigger, the protection is gone. But that is a code-review-and-migration discipline question, not an architectural one.

### If design picks path A (event log is source of truth, balance is a projection)

- `wallet.balance` is a denormalized cache — either materialized synchronously in the same txn as the event insert (M1, no projection lag) or async via projection worker (M2, lag possible) or compute-on-read (M3, slow at Studio+ scale).
- M1 is the only viable option at BokChoy scale: M2's projection lag against wallet balances introduces a "I just bought 1000 gems but my balance shows 0" customer support spike; M3's compute-on-read makes every balance check `O(transactions)` and degrades as players accumulate history (per S7, F2P players accumulate fast).
- **M1 collapses to "a transactions table that happens to also have a same-txn balance update."** At that point, the only remaining difference from path B is *which write is the source of truth*. If the balance row diverges from the events, which one wins on reconciliation? Path A says "rebuild from events." Path B says "the balance is correct, the audit log might have gaps." The operational implication: path A requires a documented and tested replay procedure for balance recovery; path B requires a documented and tested reconciliation procedure for audit-log gaps. Both are operational work; the framing differs but the cost is comparable.
- **Inherits Doomen's S8 failure modes** when reason-code taxonomy evolves (every live-ops cycle), when projection workers exist (M2), when projector dependencies form (e.g., faucet/drain dashboard reading from transactions while balance reads from a separate projection — they can drift).
- **Aligned with**: Stripe Ledger pattern, but not at Stripe's scale.
- **Concedes:** F2P scale doesn't justify the operational story Stripe pays for.

### If design picks path C (hybrid — wallet event-sourced, inventory CRUD, etc.)

- Two write patterns in the codebase. Two test surfaces. Two ops runbooks.
- Justification must name *the specific entity* where the event-sourcing tax pays for itself. Wallet is the strongest candidate (chargeback defense + forensics) — but path B with the trigger constraint already covers chargeback defense and forensics adequately.
- **The strongest case for path C is loot-roll outcomes specifically** — the roll outcome is itself an event (server-authoritative dice roll, player-visible result). But once the roll is granted, the resulting inventory grant is downstream CRUD. Path C-on-loot would mean: roll outcomes vault as events in a `loot_rolls` table; the inventory grant is a separate CRUD op. That's not actually path A vs. path B — that's "loot-roll outcomes are immutable history rows in a CRUD table, queryable for chargeback defense and pity-state debugging." Which is path B with a domain-specific audit log. Not actually hybrid in the architectural sense.
- **Decision implication:** path C as commonly described (event-source wallet, CRUD inventory) buys very little once the wallet trigger constraint exists. Path C-as-domain-audit-tables (loot_rolls separate from transactions) is just path B applied per-domain.

### If design picks path D (CRUD interface, ledger storage underneath)

- Not available on Postgres without additional infrastructure (Debezium + Kafka + archival, or QLDB, or a temporal extension).
- Adds a new component to the MVP stack, contradicting `[[mvp-feature-sequence]]` line 56 and `[[idempotency-strategy]]` B7's Postgres-only commitment.
- **Reject for MVP** unless design also wants to revisit B7. Worth flagging as the upgrade path if Series A scale forces a revisit.

### Cross-cutting implication for `staged_jobs` schema (CL-029's deferred concrete deliverable)

Whichever path design chooses, **`staged_jobs` is the external-side-effects outbox** — it is *not* the wallet event log. Its schema is the same across A/B/C: status enum (`pending`/`claimed`/`succeeded`/`failed`/`dead`), claim lease (`claimed_at`, `claimed_by`), retry count + max retries, payload reference, and FK to the originating idempotency-keys row. Brandur's reference impl is the production cite for shape.

The wallet source-of-truth question and the `staged_jobs` schema are independent decisions, both inside CL-029's scope. Design can pick path B without prejudicing the outbox design.

## Reproducibility note

**Reproducible.** Another investigator with the same question reaches the same finding via:

1. Search "PlayFab Economy v2 ExecuteInventoryOperations" → Microsoft Learn API spec (URL stable, version-pinned).
2. Search "Beamable virtual currency" → `docs.beamable.com/docs/virtual-currency-code` (vendor docs).
3. Search "Stripe Ledger architecture" → `stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement` + cross-coverage at `fintechwrapup.com`.
4. Contradiction probe: search "event sourcing wallet balance bad example" → Dudycz's `event-driven.io/en/bank_account_event_sourcing/`. Search "event sourcing production issues" → Doomen's LinkedIn article.
5. AWS reference: search "AWS in-game currency wallet QLDB" → AWS Architecture Blog post by Coronel & Vajja.

Tools required: web search, ability to read API specs, willingness to follow contradiction probes against confirmation bias. Total investigation time: ~2 hours including this writeup.

The judgment most load-bearing on the finding is **"Stripe's regulatory and scale conditions do not apply to BokChoy."** That judgment is grounded in reading `[[wedge-decision]]` (no fintech entry) and `[[mvp-feature-sequence]]` (volume estimates) — both are vault entries, both are reproducible from the project's stated constraints.

## Open threads

1. **Does path B's reconciliation job catch real drift in production?** The recommendation includes "periodic `SUM(amount) FROM transactions` compared to `wallet.balance` alerts on drift." Frequency, alert thresholds, and what to do on drift detection are operational questions deferred to `[[runbook-idempotency]]` (which `[[idempotency-strategy]]` already commits to writing in implementation phase). Could fold into the same runbook.

2. **What's the schema for `staged_jobs` specifically?** The deferred CL-029 obligation. This research did not investigate that — it answered the prerequisite question (what kind of system are we building, so we know what `staged_jobs` is for). Schema design is a separate research-or-design pass; recommend `/design` to handle it inline since Brandur is the production reference and the shape is well-known.

3. **Should loot_rolls be a separate domain audit table?** Surfaces during the path-C examination above. Per `[[idempotency-strategy]]` cascade #3, this folds into CL-031 (server-authoritative loot). Open question: does path-B-with-domain-audit-tables generalize across other domains (offer redemptions, battle-pass tier claims)? Plausibly yes — but worth surfacing during CL-031 or CL-032 design.

4. **What does Stripe Ledger's actual schema look like?** The primary blog body is paywalled in the publicly-summarizing covering posts. If chargeback-defense or regulator-audit becomes a load-bearing constraint, this is worth re-investigating with direct access to the primary source. Today, BokChoy is not in that regulatory regime.

5. **Tencent Games' CQRS+ES system** — surfaced during search but is for analytics, not wallet. If BokChoy's analytics primitives (faucet/drain dashboard, segment evaluator) ever become event-sourced for analytics-specific reasons, that's a separate research question.

6. **AccelByte's wallet docs** — fetch failed twice with empty responses. The search-result summary suggests path B (wallet/sub-wallet hierarchy, balance per currency). Worth re-attempting if the architectural choice is contested; not load-bearing for the current finding given four other game-backend cites.
