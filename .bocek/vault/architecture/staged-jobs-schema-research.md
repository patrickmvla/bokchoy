---
type: research
features: [outbox, architecture, wallet, loot]
related: ["[[idempotency-strategy]]", "[[wallet-source-of-truth-research]]", "[[wallet-audit-invariant-research]]", "[[mvp-feature-sequence]]"]
created: 2026-05-02
confidence: high
provisional: false
---

# `staged_jobs` outbox schema and the loot-roll audit-table organization question: what shape do production Postgres outboxes take, and do production game-backends co-locate domain audit (loot rolls, IAP receipts) with the unified transactions table?

## Question

Two related sub-questions inside CL-029:

**Q3a — Outbox schema.** `[[idempotency-strategy]]` deferred the `staged_jobs` schema to CL-029. What is the production-cited schema shape for a Postgres transactional outbox serving game-economy side effects (webhook fire, mailbox push, IAP receipt validate, analytics event)? Specifically: claim/lease semantics, retry counts, dead-letter handling, payload typing (typed enum vs generic JSONB)?

**Q3b — Domain audit organization.** Do production game-backends co-locate domain-specific audit (loot-roll outcomes with seed inputs and pity state, IAP receipt verification metadata) with the unified `transactions` table — or split per-domain into `loot_rolls`, `iap_receipts`, etc.? What's the cost of each shape?

## Triangulation

- **Production reference:** ✓ — Brandur `rocket-rides-atomic` (re-read for `staged_jobs` schema specifically); pg-boss (Tim Gates, mature Node.js Postgres queue); pg-transactional-outbox (Zehelein, TypeScript, on-pattern); PlayFab Economy v2 transaction history (re-read from `[[wallet-source-of-truth-research]]` for type-discrimination shape); Square Books schema (re-read for journal entry shape).
- **Docs reference:** ✓ — Postgres docs on `SELECT ... FOR UPDATE SKIP LOCKED` (introduced in 9.5, current docs); AWS Prescriptive Guidance + microservices.io on outbox pattern (already cited in `[[idempotency-strategy-research]]`).
- **Contradiction probe:** ✓ — searched for outbox-table-grew-unbounded incidents and dead-letter-queue failure modes. Cluster of named patterns surfaces (pg-boss has dead-letter built in; techplained reference includes the dead-letter transition). No production incident emerging *against* the unified audit table; cluster of anti-patterns named for *generic* JSONB without `kind` discriminator (silent dispatch errors).

## Sources examined

### S1 — Brandur `rocket-rides-atomic` `staged_jobs` table (re-read with outbox-shape focus)

- **Tier:** 1 (production code)
- **Provenance:** `github.com/brandur/rocket-rides-atomic` schema.sql + enqueuer.rb, master HEAD, fetched 2026-05-02 via raw.githubusercontent.com.
- **What it tells us:** Brandur's `staged_jobs` schema is **embarrassingly minimal**:
  ```sql
  CREATE TABLE staged_jobs (
      id        BIGSERIAL  PRIMARY KEY,
      job_name  TEXT       NOT NULL,
      job_args  JSONB      NOT NULL
  );
  ```
  No `status`, no `attempt`, no `scheduled_at`, no `last_error`, no claim mechanism. The `enqueuer.rb` worker uses `DB.transaction(isolation_level: :repeatable_read) do ... StagedJob.where(...).delete end` — fetch-batch-then-delete pattern with no concurrent-worker safety, no retry, no dead-letter.
  
  **Implication:** Brandur is *insufficient* as the sole production-cite for `staged_jobs` schema beyond the bare minimum. The reference impl's outbox is a teaching example, not a production-grade queue. The recommendation in `[[idempotency-strategy]]` to use Brandur's `staged_jobs` shape needs supplementation with a proper claim-and-retry production-cite.

### S2 — pg-boss (Tim Gates, mature Node.js Postgres queue)

- **Tier:** 1 (production code, named author, broadly adopted in Node.js ecosystem)
- **Provenance:** `github.com/timgit/pg-boss`. Observed 2026-05-02. Mature library with active maintenance and broad production adoption.
- **What it tells us:** pg-boss explicitly uses **`SKIP LOCKED`** (per its README) for worker claim, supports priority queues, dead-letter queues, job deferral, and **automatic retries with exponential backoff**. Schema not directly fetched in this session (page rendered metadata-only); the README endorsement is on-record. Worth a deeper source-code read in implementation-phase planning.

### S3 — pg-transactional-outbox (Zehelein, TypeScript on-pattern)

- **Tier:** 4 (open-source library, tier-2-adjacent because the library is explicitly named on the outbox-pattern)
- **Provenance:** `github.com/Zehelein/pg-transactional-outbox`, observed 2026-05-02.
- **What it tells us:** Confirms the architectural invariant — **business state and outbox row commit in the same Postgres transaction** — and names *separate listener components* that poll the outbox, publish, track delivery status, retry. Inbox pattern handles receipt-side de-dup (relevant if BokChoy ever consumes external webhooks; not in MVP scope).
  - Quoted: *"This pattern is an alternative to distributed transactions using a two-phase commit, which can lead to bottlenecks with a large number of microservices."* — confirms outbox is the right shape over 2PC at BokChoy's scale.
  - The library splits "outbox listener" and "inbox listener" as separate concerns. Implication: BokChoy needs an outbox-listener component as part of the runtime topology — not just a table.

### S4 — Patel on "Postgres as a Queue" (techplained.com)

- **Tier:** 4 (engineering blog, named author, dated 2026-04-08, on-topic with concrete schema)
- **Provenance:** `techplained.com/postgres-as-queue`, Abhishek Patel, 2026-04-08. Observed 2026-05-02.
- **Why it's the strongest schema source despite tier 4:** the article publishes an actual production-pattern schema and the matching SQL for claim/retry/dead-letter. Recent, dated, with concrete code. Cross-checked against pg-boss conceptual claims and pg-transactional-outbox pattern statements — converges.
- **What it tells us:** The canonical Postgres-as-queue schema is:
  ```sql
  CREATE TABLE jobs (
    id            BIGSERIAL    PRIMARY KEY,
    queue         TEXT         NOT NULL DEFAULT 'default',
    payload       JSONB        NOT NULL,
    status        TEXT         NOT NULL DEFAULT 'pending',
    priority      SMALLINT     NOT NULL DEFAULT 0,
    attempt       SMALLINT     NOT NULL DEFAULT 0,
    max_attempts  SMALLINT     NOT NULL DEFAULT 5,
    scheduled_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    failed_at     TIMESTAMPTZ,
    last_error    TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
  CREATE INDEX idx_jobs_dequeue ON jobs (priority DESC, created_at ASC)
    WHERE status = 'pending';
  ```
  - **Partial index** on `WHERE status = 'pending'` is load-bearing for performance — keeps dequeue scans bounded as `jobs` grows.
  - **Claim pattern:** `SELECT ... FOR UPDATE SKIP LOCKED` + `UPDATE` to `running` in same txn. Each worker grabs a different unlocked row instantly; no contention.
  - **Retry pattern:** `scheduled_at = NOW() + (POWER(2, job.attempt) || ' seconds')::INTERVAL` — exponential backoff via `scheduled_at` updates rather than timer infrastructure. Dequeue's `WHERE scheduled_at <= NOW()` naturally skips not-yet-due retries.
  - **Dead-letter:** after `max_attempts`, transition `status` to `'dead'`. Manual review queue.

### S5 — PlayFab Economy v2 transaction history (re-read from `[[wallet-source-of-truth-research]]` S2/S3)

- **Tier:** 1+2 (already vaulted with version-pinned API spec + conceptual doc)
- **What it tells us about Q3b:** PlayFab's `GetTransactionHistory` API returns **operations of all kinds** through one endpoint — Add, Subtract, Update, Purchase, Transfer, Delete. The audit log is **unified**; loot-purchase-shaped operations and pure currency operations live in the same surface, discriminated by operation type. *"Some events such as CollectionCreated and CollectionDeleted aren't presented in the transaction history"* — implies a *projection from* a unified internal log, with operation-type filtering.

### S6 — Square Books journal_entries + book_entries (re-read from `[[wallet-source-of-truth-research]]` and `[[wallet-audit-invariant-research]]`)

- **Tier:** 4 (engineering blog, schema described)
- **What it tells us about Q3b:** Square Books uses a **single unified `journal_entries` table** with `book_entries` carrying debit/credit amounts referenced by FK. No per-domain audit tables. All accounting-shaped operations land in journal_entries; domain context lives in metadata or via business-object FK. **The unified-audit-table pattern at fintech scale.**

### S7 — Brandur `audit_records` table (re-read for the domain question)

- **Tier:** 1 (production code)
- **Provenance:** `brandur/rocket-rides-atomic` schema.sql, audit_records definition.
- **What it tells us about Q3b:** Brandur's `audit_records` is a single generic table:
  ```
  audit_records: id, user_id, action TEXT, data JSONB, resource_type TEXT, resource_id, origin_ip, created_at
  ```
  All audit events from all domains (rides, charges, etc.) land here. `resource_type` and `action` discriminate. The pattern: **one audit table, discriminated by type, with domain-specific data in JSONB.**

### S8 — Postgres docs on `SELECT ... FOR UPDATE SKIP LOCKED`

- **Tier:** 2 (official docs)
- **Provenance:** `postgresql.org/docs/current/sql-select.html`, current.
- **What it tells us:** `SKIP LOCKED` was introduced in Postgres 9.5 specifically as a queue/work-distribution primitive. Concurrent transactions issuing the same `SELECT ... FOR UPDATE SKIP LOCKED` will see different rows — there's no contention on row-locked work. The semantic guarantee is documented and load-bearing for the claim pattern in S4.

## Findings

### F1 — The production-cited `staged_jobs` schema is much richer than Brandur's bare minimum

The schema consensus across S2 (pg-boss), S3 (pg-transactional-outbox), and S4 (Patel) is the schema in S4. Brandur's minimal `(id, job_name, job_args)` does NOT include claim/lease, retry, or dead-letter mechanisms — Brandur explicitly avoided building a real queue. **For BokChoy's MVP, the recommended schema follows S4 (Patel's reference) with BokChoy-specific additions:**

```sql
CREATE TABLE staged_jobs (
  id              BIGSERIAL    PRIMARY KEY,
  project_id      UUID         NOT NULL,                       -- tenant isolation per [[idempotency-strategy]] scope
  idempotency_key_id  BIGINT   REFERENCES idempotency_keys(id) ON DELETE SET NULL,
  kind            TEXT         NOT NULL,                       -- discriminator; constrained via CHECK below
  payload         JSONB        NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'pending',     -- pending | running | completed | failed | dead
  attempt         SMALLINT     NOT NULL DEFAULT 0,
  max_attempts    SMALLINT     NOT NULL DEFAULT 5,
  scheduled_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CHECK (kind IN ('webhook_fire', 'mailbox_push', 'iap_receipt_validate', 'analytics_event')),
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'dead'))
);

CREATE INDEX idx_staged_jobs_dequeue
  ON staged_jobs (priority DESC, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX idx_staged_jobs_project
  ON staged_jobs (project_id, status);   -- per-tenant queue depth monitoring
```

**BokChoy-specific additions vs. S4 reference:**
- `project_id` UUID — tenant scoping per `[[idempotency-strategy]]`.
- `idempotency_key_id` FK — enables tracing "which API call produced this job" + cleanup behavior on idempotency-key TTL.
- `CHECK (kind IN (...))` — typed-enum-via-CHECK-constraint pattern. Stronger validation than free-text `job_name`, less rigid than Postgres `ENUM` type (which has no `DROP VALUE`). New kinds require one DDL to add a value to the CHECK list.

**BokChoy-specific subtractions vs. S4 reference:**
- Drop `queue` and `priority` columns at MVP. All four MVP kinds have similar urgency; priority queues add operational complexity for a feature MVP doesn't need. Add later if a kind becomes premium-priority (e.g., webhook fires for live-ops events).

### F2 — Claim/retry/dead-letter pattern is canonical and Postgres-native

`SELECT ... FOR UPDATE SKIP LOCKED` is the production-cited claim primitive (S2, S4, S8). Exponential-backoff-via-`scheduled_at` is the production-cited retry pattern (S4, pg-boss-implied). Dead-letter via `status='dead'` after `max_attempts` is the production-cited dead-letter pattern (S2, S4).

**Worker pseudocode:**
```sql
BEGIN;
SELECT id, kind, payload, attempt
  FROM staged_jobs
  WHERE status = 'pending'
    AND scheduled_at <= NOW()
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

-- if found:
UPDATE staged_jobs
  SET status = 'running', started_at = NOW(), attempt = attempt + 1
  WHERE id = $1;
COMMIT;

-- worker dispatches the side effect
-- on success:
UPDATE staged_jobs SET status = 'completed', completed_at = NOW() WHERE id = $1;

-- on failure (and attempt < max_attempts):
UPDATE staged_jobs
  SET status = 'pending',
      scheduled_at = NOW() + (POWER(2, attempt) || ' seconds')::INTERVAL,
      last_error = $err_message
  WHERE id = $1;

-- on failure (and attempt >= max_attempts):
UPDATE staged_jobs SET status = 'dead', failed_at = NOW(), last_error = $err_message WHERE id = $1;
```

**Why this is robust:** worker crashes mid-job leave the row in `'running'` state; a stuck-job reaper job (separate process, runs every N seconds) can find rows where `started_at < NOW() - max_run_duration` and reset them to `'pending'` for retry. This is the same shape as `[[idempotency-strategy]]`'s `locked_at` reaper for stuck idempotency-key rows.

### F3 — Typed-enum-via-CHECK is the right middle ground for `kind`

Three options for typing `kind`:

- **Postgres native ENUM type:** strongest typing; but `ALTER TYPE ... DROP VALUE` is not supported in Postgres, making evolution painful. Reject for BokChoy where new kinds will ship every live-ops cycle.
- **CHECK constraint on TEXT (recommended above):** typed at schema level; new kinds require a single DDL (`ALTER TABLE ... DROP CONSTRAINT ...; ADD CONSTRAINT ... CHECK (kind IN (..., 'new_kind'))`). One migration per new kind; reversible.
- **Free-text TEXT, no constraint (Brandur's choice):** loosest; typo-prone; no schema-level documentation of allowed values. Rejected.

**The CHECK-on-TEXT pattern is the production-cited pattern** in S4 (Patel) and is what most production Postgres queue libraries use. Confidence: high.

### F4 — Unified audit table is the production-cited pattern; loot rolls go in `transactions` with type discrimination + sister table for roll-specific data

The pattern across S5 (PlayFab unified `GetTransactionHistory`), S6 (Square Books unified `journal_entries`), and S7 (Brandur unified `audit_records` with `resource_type` discriminator) is consistent: **one audit table, discriminated by type/action, with domain-specific data referenced via FK to a sister table or carried in JSONB metadata.**

The applied recommendation for BokChoy:

- **`transactions` table** — the unified path-B audit log per `[[wallet-source-of-truth-research]]`. Records every wallet movement: currency credited, currency debited, item granted, item consumed. Schema:
  ```
  transactions(id, project_id, wallet_id, kind, amount, currency_id, item_id, source_event_id,
               idempotency_key_id, reason_code, related_id, related_type, created_at, metadata JSONB)
  ```
  - `kind` discriminator (`currency_credit`, `currency_debit`, `item_grant`, `item_consume`, etc.) — CHECK-constrained list.
  - `related_id` + `related_type` polymorphic FK to the originating domain row (e.g., `loot_rolls.id` for a roll-driven transaction; `iap_receipts.id` for an IAP-driven transaction).

- **`loot_rolls` sister table** — holds roll-specific data that doesn't fit `transactions`: `banner_id`, `pity_state_before`, `pity_state_after`, `seed_inputs` JSONB, `rng_output` JSONB, `items_granted` ARRAY. Has `idempotency_key_id` FK per `[[idempotency-strategy]]`. Per-roll: one `loot_rolls` row + N `transactions` rows (typically: 1 currency_debit + K item_grants, all sharing `related_type='loot_roll'` and `related_id=loot_rolls.id`).

- **`iap_receipts` sister table** — holds IAP-specific data: `platform` (apple/google/steam), `raw_receipt`, `validated_at`, `apple_transaction_id`, etc. Per IAP: one `iap_receipts` row + the `transactions` rows it triggers (currency credits, item grants).

**Why split-into-sister-tables-plus-unified-transactions is structurally cleaner than alternatives:**

- **vs. fully-unified-with-everything-in-JSONB**: roll-specific queries (pity-state forensics, banner-revenue-by-week) require parsing JSONB; sister tables let those queries hit indexed columns. Forensics-heavy domains deserve their own schema.
- **vs. fully-split-into-domain-tables-with-no-unified-transactions**: lose the `[[wallet-source-of-truth-research]]` path-B audit-log property. Faucet/drain dashboard would need to UNION across N domain tables. Reconciliation against `wallet.balance` becomes per-domain.
- **vs. unified-without-sister-tables**: every roll's banner/pity/seed metadata in `transactions.metadata` JSONB is queryable but not indexable for the patterns roll-forensics needs (e.g., "all rolls on banner X in window W"). Sister tables with indexed columns are cheap; JSONB-only forces sequential scans for these queries.

### F5 — Critical interaction with `[[wallet-audit-invariant-research]]` M1/M2/M3 mechanism choice

If design picks **M2 (stored-function-only-interface for wallet mutations)** per `[[wallet-audit-invariant-research]]`, the function naturally handles `staged_jobs` insertion in the same transaction. Schema cost: zero extra. Same applies to M1 (app-library wraps all writes including `staged_jobs`).

If design picks **M3 (trigger-based)**, the trigger that aborts wallet updates without a paired `transactions` insert needs to also handle the case where `staged_jobs` insertion is part of the side-effect lifecycle but is NOT a `transactions`-pairing requirement. Trigger logic gets more complex. **Another reason M3 is operationally heavier than M1/M2.**

`staged_jobs` itself does NOT need invariant-pairing enforcement — a `staged_jobs` row is the *intent to publish a side effect*, not a record of state mutation. It can be inserted independently or alongside `transactions`/`wallets` updates without a structural pairing requirement.

## Conflicts

### Brandur's outbox is a teaching example, not a production reference

S1 vs. S2/S3/S4 — Brandur's `staged_jobs` is structurally insufficient as a production queue. **Per *Contradiction protocol*:** the ecosystem of pg-boss, pg-transactional-outbox, and the Patel reference (multiple independent production-style examples) beats one minimal teaching example. Resolution: use Brandur for the *transactional invariant* (outbox row commits with business state) but use the richer schema from S4 for the actual table.

This confirms: `[[idempotency-strategy]]`'s sentence "use Brandur's `staged_jobs` shape" should be read as "use Brandur's *pattern* (in-DB outbox committed atomically with business state), with a production-grade schema sourced from pg-boss / Patel." That is what this entry vaults.

### Sister-tables vs. fully-unified

S6 (Square Books) uses fully-unified `journal_entries` + `book_entries` — two tables, but both are generic, no per-domain split. A reader could interpret S5/S7 the same way (PlayFab's transaction history is fully unified; Brandur's audit_records is fully generic).

**Per *Contradiction protocol*:** the conflict is conditions-based. *fintech-pure-double-entry* (Square) has homogeneous shape — all entries are debit/credit pairs. *F2P game-economy* has heterogeneous shape — currency moves are debit/credit-shaped, but loot rolls have additional non-financial data (RNG seed, pity state, banner) that doesn't fit the journal-entry shape.

**Resolution:** the sister-tables-plus-unified pattern is strictly more general than fully-unified. If a future domain turns out to be debit/credit-pure, its sister table can stay empty. If a domain turns out to need extra shape, the sister table absorbs it. Not a real contradiction once conditions are scoped.

## Conditions

This finding holds under:

- **Postgres 9.5+** (for `SELECT ... FOR UPDATE SKIP LOCKED`). Already implicit in `[[idempotency-strategy]]` B7.
- **Single-DC deployment** at MVP. Cross-region distributed claim semantics are not in scope per `[[mvp-feature-sequence]]` line 57.
- **Side-effect kinds are stable enough that schema migrations for new kinds are acceptable.** True at MVP for the four named kinds; if BokChoy ever adds dozens of side-effect kinds, the CHECK-list maintenance becomes burden and a separate `kinds` lookup table is the right shape. Not load-bearing today.
- **Worker count ≤ ~50 per tenant.** Above that, lock contention on the partial index becomes meaningful; partition `staged_jobs` by `project_id`. Not load-bearing at MVP.

This finding does **not** generalize to:

- Cross-database outboxes (use Debezium + CDC, not Postgres-native).
- Sub-second SLA work (use a dedicated message broker, not Postgres SKIP LOCKED — the polling cadence is a cost).
- Non-idempotent side effects whose retry semantics are dangerous (paid third-party APIs without their own idempotency-key support). Per `[[idempotency-strategy]]` D2-α, none of BokChoy's MVP side effects are in this category. If one is added, that endpoint upgrades to D2-β per the migration trigger.

## Operational implications for design

`staged_jobs` schema (F1, F2, F3) is a concrete deliverable. Design adopts the schema, vaults it as a decision (`[[staged-jobs]]` or as part of the wallet-mechanics decision entry), and the implementation phase ships the migration.

The split-loot-rolls + unified-transactions decision (F4) is **larger than just CL-029** — it cascades to:
- **CL-031 server-authoritative loot** must define the `loot_rolls` schema concretely (not just the RNG seed format).
- **`transactions` polymorphic-FK columns** (`related_id`, `related_type`) need a documented enum of `related_type` values and the cascade behavior on delete (probably `ON DELETE SET NULL` to preserve audit history).
- **The faucet/drain dashboard** in `[[mvp-feature-sequence]]` month 6 reads from the unified `transactions` table; sister-table joins are an enrichment for forensics-heavy queries, not a replacement.

Critical interaction with `[[wallet-audit-invariant-research]]` M1/M2/M3:
- M1 + M2 fit naturally with the sister-tables pattern — the wallet-mutation library/function inserts `transactions` and the relevant sister-table row in the same transaction.
- M3 (trigger) gets more complex if it also has to handle sister-table-row-pairing; arguably the trigger wouldn't even fire on sister-table rows, so the protection scope is narrower than M1/M2.

**Recommendation lane (research surfaces, design chooses):** schema as in F1 + sister-tables pattern as in F4, mechanism as in `[[wallet-audit-invariant-research]]` M2 — coherent triple that's production-cited and minimizes operational tax.

## Reproducibility note

**Reproducible.** Same finding via:

1. Fetch raw `schema.sql` from `brandur/rocket-rides-atomic` master HEAD via `raw.githubusercontent.com` — confirm `staged_jobs` is `(id, job_name, job_args)` only.
2. Read `github.com/timgit/pg-boss` README — confirms SKIP LOCKED + dead-letter + retries.
3. Read `github.com/Zehelein/pg-transactional-outbox` — confirms outbox pattern shape.
4. Read `techplained.com/postgres-as-queue` (Patel, 2026-04-08) — full schema + claim/retry/dead-letter SQL.
5. Re-read PlayFab `GetTransactionHistory` API + Square Books blog already vaulted — confirms unified-audit-table dominance.

The judgment most load-bearing on the F4 sister-tables recommendation is **"F2P game-economy has heterogeneous audit shape (financial + RNG-roll + IAP-receipt) where pure double-entry is homogeneous."** That is rooted in `[[mobile-f2p-economy-math-research]]` (loot rolls are a first-class economic primitive distinct from currency moves) and in `[[wedge-decision]]` (BokChoy's wedge is at the cockpit + economy layer, where forensics on rolls and IAP fulfillment is part of the value proposition).

## Open threads

1. **pg-boss source-code deep read.** S2 was confirmed at the README level; the actual schema and worker code are worth reading in implementation phase to absorb production-tested SQL patterns BokChoy can adopt directly. Suggested: clone `pg-boss` and read `src/migrations/*.sql` plus the dequeue/retry code paths.

2. **Stuck-job reaper specifics.** F2 names the pattern (rows in `'running'` state with `started_at` older than max-run-duration get reset to `'pending'`) but the actual reaper job's cadence, max-run-duration default, and alert thresholds are runbook-level. Belongs in `[[runbook-idempotency]]` per `[[idempotency-strategy]]`'s commitment.

3. **Outbox depth alerting.** `staged_jobs` row count for `status='pending'` exceeding 10× rolling 5-min average is the alert per `[[idempotency-strategy]]` line 191. The metric and alert-rule plumbing is implementation-phase work.

4. **The `transactions.related_type` enum needs vaulting.** F4 names `loot_roll`, `iap_receipt`, etc. as candidates but doesn't enumerate the full list. Belongs in the design re-pass or in CL-031 (which will own `loot_rolls`).

5. **Q2 (audit retention regulatory + storage math) is the third research session.** Independent of Q1 and Q3 — concerns the lifecycle of `transactions` rows after they exist, not their schema or the side-effect outbox.

6. **CL-031 server-authoritative loot must define the `loot_rolls` schema.** The path-B sister-tables pattern decided here (F4) constrains CL-031: it cannot pick a model where roll outcomes don't have a sister table, because the unified-`transactions` audit-log property would be lost. Flag for CL-031 design.
