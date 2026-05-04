---
type: decision
features: [wallet, architecture, outbox, retention]
related: ["[[wallet-source-of-truth-research]]", "[[wallet-audit-invariant-research]]", "[[staged-jobs-schema-research]]", "[[audit-retention-research]]", "[[webhook-retry-norms-research]]", "[[deidentify-mechanism-research]]", "[[multi-tenant-rls-research]]", "[[host-platform]]", "[[idempotency-strategy]]", "[[mvp-feature-sequence]]", "[[wedge-decision]]", "[[design-claims-register]]"]
created: 2026-05-02
confidence: high
---

# Wallet mechanics: path B (CRUD on balance + same-txn audit log) via stored-function-only interface (M2), unified `transactions` audit + sister tables, monthly partitioning with 24-month hot retention + S3 cold archive

Resolves **CL-029** in `[[design-claims-register]]`. Cascades to every wallet-mutating endpoint, the loot-roll engine (CL-031), the IAP fulfillment path, the faucet/drain dashboard, and the customer-facing privacy policy. Falsifies DESIGN.md §12.2's "event-sourced transactions" framing — replaced with path B per `[[wallet-source-of-truth-research]]` after triangulation against PlayFab Economy v2, Beamable, LootLocker, AWS in-game-currency reference. Closes the cascade obligations from `[[idempotency-strategy]]` for `staged_jobs` schema.

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
