---
type: decision
features: [catalog, architecture]
related: ["[[catalog-versioning-research]]", "[[wallet-mechanics]]", "[[idempotency-strategy]]", "[[mvp-feature-sequence]]", "[[wedge-decision]]", "[[catalog-cac-upgrade]]", "[[design-claims-register]]"]
created: 2026-05-02
confidence: high
---

# Catalog versioning: per-item Draft/Published states + ETag optimistic concurrency + linear `catalog_audit` log + per-project environment isolation, with bulk-publish + diff-view shipped at MVP and CaC upgrade documented as stub

Resolves **CL-030** in `[[design-claims-register]]`. Falsifies DESIGN.md §12.3's "DAG semantics, branchable" framing per `[[catalog-versioning-research]]` F1 — replaced with the production-cited PlayFab-shape (Draft/Published states + multi-environment-via-project_id) plus a subset of T2 ergonomics that prepay the cost of T3 (CaC upgrade) without building T3 at MVP.

## Decision

### 1. Per-item state machine

Three states on every catalog row: `draft` | `published` | `archived`. Transitions:

```
        catalog_create_draft()
              ↓
           [draft]  ⇄  [published]   via catalog_publish() / catalog_unpublish()
                 ↘   ↙
              [archived]   via catalog_archive() (terminal)
```

`catalog_unpublish` returns a published item to draft (designer wants to edit before re-publishing). `catalog_archive` is terminal — the item is permanently removed from active sale but historic `transactions` and `loot_rolls` rows referencing it remain valid (FKs are `ON DELETE SET NULL`).

### 2. Catalog tables — unified shape with type discrimination

```sql
CREATE TABLE catalog_items (
  id              BIGSERIAL    PRIMARY KEY,
  project_id      UUID         NOT NULL,
  friendly_id     TEXT         NULL,                  -- e.g. 'gem_starter_pack'; UNIQUE per project
  type            TEXT         NOT NULL,              -- discriminator
  display_data    JSONB        NOT NULL,              -- title, description (locale dict), display props
  pricing         JSONB        NULL,                  -- type-dependent: real-money or virtual-currency
  contents        JSONB        NULL,                  -- type-dependent: bundle contents, loot-table entries
  draft_status    TEXT         NOT NULL DEFAULT 'draft',
  start_date      TIMESTAMPTZ  NULL,
  end_date        TIMESTAMPTZ  NULL,
  version         INTEGER      NOT NULL DEFAULT 0,    -- ETag for optimistic concurrency
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, friendly_id),
  CHECK (type IN ('item', 'currency', 'bundle', 'store', 'subscription', 'loot_table')),
  CHECK (draft_status IN ('draft', 'published', 'archived')),
  CHECK (draft_status != 'published' OR start_date IS NOT NULL)  -- published items must have a start_date
);

CREATE INDEX idx_catalog_items_project_lookup
  ON catalog_items (project_id, type, draft_status);

CREATE INDEX idx_catalog_items_search
  ON catalog_items (project_id, draft_status, start_date, end_date)
  WHERE draft_status = 'published';
```

Single `catalog_items` table holds all six types per the unified-with-discriminator pattern from `[[wallet-mechanics]]` F4 (same shape as `transactions`). Type-specific data lives in JSONB columns (`pricing`, `contents`); shared fields (`friendly_id`, `display_data`, lifecycle) are columns.

### 3. M2 stored-function-only-interface (transferred from `[[wallet-mechanics]]`)

App role has **no `UPDATE` or `INSERT` privilege** on `catalog_items` or `catalog_audit`. All catalog mutations go through plpgsql functions. The function set:

```sql
CREATE FUNCTION catalog_create_draft(
  p_project_id   UUID,
  p_actor_id     UUID,
  p_friendly_id  TEXT,
  p_type         TEXT,
  p_display_data JSONB,
  p_pricing      JSONB DEFAULT NULL,
  p_contents     JSONB DEFAULT NULL
) RETURNS BIGINT  -- new item id
LANGUAGE plpgsql SECURITY DEFINER
AS $$ ... $$;

CREATE FUNCTION catalog_update_draft(
  p_project_id        UUID,
  p_actor_id          UUID,
  p_item_id           BIGINT,
  p_expected_version  INTEGER,
  p_updates           JSONB        -- JSON Patch (RFC 6902) operations to apply
) RETURNS INTEGER  -- new version
LANGUAGE plpgsql SECURITY DEFINER
AS $$ ... $$;

CREATE FUNCTION catalog_publish(
  p_project_id        UUID,
  p_actor_id          UUID,
  p_item_id           BIGINT,
  p_expected_version  INTEGER,
  p_start_date        TIMESTAMPTZ DEFAULT NOW(),
  p_end_date          TIMESTAMPTZ DEFAULT NULL
) RETURNS INTEGER  -- new version
LANGUAGE plpgsql SECURITY DEFINER
AS $$ ... $$;

CREATE FUNCTION catalog_publish_bulk(
  p_project_id   UUID,
  p_actor_id     UUID,
  p_item_ids     BIGINT[],
  p_scheduled_at TIMESTAMPTZ DEFAULT NOW()  -- optional: future publish; omit for immediate
) RETURNS INTEGER  -- count published
LANGUAGE plpgsql SECURITY DEFINER
AS $$ ... $$;

CREATE FUNCTION catalog_unpublish(...) RETURNS INTEGER ...;
CREATE FUNCTION catalog_archive(...) RETURNS INTEGER ...;
```

Each function:
- Verifies `expected_version` matches current `version`; raises `PreconditionFailed` if mismatched (ETag pattern).
- Increments `version` on success.
- Inserts a `catalog_audit` row in the same transaction recording `actor_id`, `operation`, JSON Patch `diff`.
- Bypassing requires `GRANT INSERT/UPDATE` migration which shows up in security review (same trust boundary as `[[wallet-mechanics]]` M2).

### 4. ETag optimistic concurrency

`version` integer column on every catalog row, incremented on every mutation. Mutation functions take `p_expected_version`; mismatch returns `PreconditionFailed` and the client must re-read + re-apply.

This is the production-cited concurrent-edit conflict resolution per `[[catalog-versioning-research]]` F3. PlayFab uses the same pattern (per `[[wallet-source-of-truth-research]]` S2's `ExecuteInventoryOperations` ETag handling). No auto-merge; humans serialize when conflicts occur.

### 5. Linear `catalog_audit` log

```sql
CREATE TABLE catalog_audit (
  id              BIGSERIAL,
  project_id      UUID         NOT NULL,
  actor_id        UUID         NOT NULL,                -- designer / API key making the change
  catalog_table   TEXT         NOT NULL DEFAULT 'catalog_items',  -- room for future split
  catalog_row_id  BIGINT       NOT NULL,
  operation       TEXT         NOT NULL,                -- 'create' | 'update' | 'publish' | 'unpublish' | 'archive'
  diff            JSONB        NOT NULL,                -- JSON Patch (RFC 6902) operations
  prior_version   INTEGER      NOT NULL,
  new_version     INTEGER      NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id, created_at),                         -- created_at must be in PK for partition key
  CHECK (operation IN ('create', 'update', 'publish', 'unpublish', 'archive'))
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_catalog_audit_row_history
  ON catalog_audit (catalog_row_id, created_at DESC);

CREATE INDEX idx_catalog_audit_project_recent
  ON catalog_audit (project_id, created_at DESC);
```

Single linear log per project. Append-only — no UPDATE or DELETE permitted (enforced at the role-permission layer, same as `transactions` per `[[wallet-mechanics]]`).

**Diff format: JSON Patch (RFC 6902).** Per `[[catalog-versioning-research]]` S8 — represents the change as an ordered array of `add`/`remove`/`replace`/`move`/`copy` operations. Preferred over JSON Merge Patch (RFC 7396) because Merge Patch can't represent deletions properly (null-vs-delete ambiguity) and game catalogs frequently set fields to null intentionally.

**Diff view in dashboard** reads from this log: `SELECT * FROM catalog_audit WHERE catalog_row_id = $X ORDER BY created_at DESC LIMIT 50` shows recent changes. Reverse-applying the JSON Patches reconstructs prior state for visual diff rendering.

### 6. Per-project environment isolation

Multi-environment is implemented via separate `project_id` per environment, NOT via a separate `environment` column. Per `[[idempotency-strategy]]` line 31 (idempotency keys scoped per-project) and `[[wallet-mechanics]]` (project_id is the tenant boundary throughout). A studio with dev/staging/prod creates three projects with three separate API keys.

This matches PlayFab's "title" isolation model (per `[[wallet-source-of-truth-research]]` S2) and Unity GS's environment isolation (per `[[catalog-versioning-research]]` S3).

**Tradeoff named:** moving an item between environments requires copy (insert into target project) rather than a single "promote" operation. This is the cost of project-as-environment. The bulk-export/import primitives in T3 (`[[catalog-cac-upgrade]]`) close this gap when needed.

### 7. Catalog audit retention — 24 months hot, no cold tier at MVP

Catalog change rate is orders of magnitude lower than wallet transaction rate: ~100-1000 catalog mutations per project per month vs. millions of wallet transactions per project per month at Studio+. **Total `catalog_audit` size at full Studio+ adoption: ~120K rows/year/project, ~12M rows/year system-wide hypothetical maximum.**

24-month hot retention in Postgres is trivially cheap at this volume (~tens of MB). No cold-tier S3 archive needed at MVP. Monthly partitioning still applied for query-pruning consistency with `transactions`, but archival can be deferred indefinitely.

Per `[[catalog-versioning-research]]` F4 + the storage-math reasoning: catalog audit doesn't have chargeback exposure, so the 540-day floor doesn't drive retention here. 24 months chosen for forensic-completeness consistency with `transactions`, not because it's the regulatory floor. Revisit only if a customer's catalog hits unusual change-rate.

### 8. Bulk-publish + diff-view ship at MVP; approval workflows defer; bulk-scheduled-publish is one optional parameter

Per `[[catalog-versioning-research]]` four-tier menu, T1 + a T2 subset ships at MVP:

- **T1 (full):** state machine, schema, ETag, audit log, per-project isolation. ✓
- **T2 — bulk publish:** `catalog_publish_bulk(project_id, item_ids[], scheduled_at?)`. Atomically publishes multiple items in one transaction; rolls back on any failure. **Ships at MVP.** Same primitive `[[catalog-cac-upgrade]]`'s CaC import will use.
- **T2 — bulk scheduled publish:** the same `catalog_publish_bulk` function with `scheduled_at` parameter set to a future timestamp. Item rows transition to `published` immediately but `start_date` is set to the future; existing `WHERE start_date <= NOW() AND (end_date IS NULL OR end_date > NOW())` filters in player-facing reads naturally hide the item until the time arrives. **Ships at MVP** as one optional parameter on the existing function.
- **T2 — diff view:** dashboard read from `catalog_audit`. **Ships at MVP** because the log already exists; only UI work remains.
- **T2 — approval workflows:** **defers post-MVP.** Solo-dev and small-studio customers don't have separate approvers; the value isn't there at MVP scope. Per `[[catalog-versioning-research]]` F2 cross-cite, T3's CaC upgrade uses git PRs as the approval surface — building dashboard workflows at MVP doesn't make T3 easier. Add only when a customer surfaces the need (likely Studio+ tier).

### 9. T3 (Configuration-as-Code) documented as `[[catalog-cac-upgrade]]` stub

Stub vault entry tracks the upgrade path without building it. Conditions for revisiting are recorded in the stub. This is "option 2" from the design pre-pass — more disciplined than a single sentence, less expensive than building the feature speculatively.

## Reasoning

### Why per-item state machine + ETag instead of per-revision storage

Per `[[catalog-versioning-research]]` F1 + F3. PlayFab, LaunchDarkly, Beamable, Unity GS all ship state-based-with-linear-history rather than per-revision-storage. The audit log gives historical reconstruction; the live row holds current state. Storage is O(1) per item (one row) plus O(N) audit history rather than O(revisions) per item.

### Why JSON Patch for the diff column

Per `[[catalog-versioning-research]]` F4 + S8. JSON Patch (RFC 6902) and JSON Merge Patch (RFC 7396) are both wire formats. Patch is preferred because:

- It represents deletions explicitly (`{"op":"remove","path":"/foo"}`), avoiding Merge Patch's null-vs-delete ambiguity.
- It supports `move` and `copy` operations that better represent designer intent (e.g., reorganizing a bundle's contents).
- It's more verbose but more recoverable when reverse-applied for diff-view rendering.

The trade-off (Patch is more complex than Merge Patch) is acceptable because the diff is generated by the wallet-mutation function (computer-authored), not by the designer (human-authored).

### Why per-project rather than per-environment column

Per `[[idempotency-strategy]]` line 31 and `[[wallet-mechanics]]` engineering substance. `project_id` is already the tenant boundary throughout the system. Adding an `environment` column would create a second axis of isolation that diverges from the rest of the schema. The cost (copy-to-promote between environments) is real but bounded by the T3 CaC upgrade for teams that need it.

### Why bulk-publish ships at MVP but approval workflows defer

The `[[catalog-versioning-research]]`-grounded argument: bulk-publish is the same atomic-multi-item-deploy primitive T3's CaC import needs. Building it at MVP prepays the T3 cost. Approval workflows are a parallel approval surface to T3's git PRs — building them doesn't make T3 easier and requires multi-role auth + UX work that doesn't pay back at indie/small-studio scope. The user's framing ("T2 makes T3 easy") applies to bulk-publish + diff-view; not to approvals.

### Why JSON Patch over per-column UPDATE statements

Catalog rows are JSONB-shape (`display_data`, `pricing`, `contents`). A designer change might touch one nested field deep in `pricing` or one item in a bundle's `contents` array. JSON Patch represents these surgical edits compactly. UPDATE-the-whole-JSONB-column would write a new full document on every change, which makes the audit log carry redundant data.

### Why T3 as stub vault entry, not "documented in this entry"

Per `[[catalog-versioning-research]]` open thread #6 — option 1 (sentence in this entry) is too thin for a known-known with a clear future. A stub vault entry surfaces in `index.md` and `state.md`, making it discoverable when a future engineer searches for "CaC" or "catalog export." A sentence buried in this entry is easy to miss.

## Engineering substance applied

- **Consistency:** SERIALIZABLE on catalog mutations (consistent with `[[mvp-feature-sequence]]` line 52). ETag optimistic concurrency catches concurrent edits.
- **Failure semantics:** ETag mismatch returns `PreconditionFailed`; designer must re-read and re-apply. No auto-merge. Per `[[catalog-versioning-research]]` F3.
- **Concurrency:** SERIALIZABLE plus ETag means concurrent UPDATE on the same item produces an explicit failure on the second writer rather than silent overwrite.
- **Observability:** every mutation writes a `catalog_audit` row in the same transaction. Dashboard surfaces this as designer change history. Prometheus metric on catalog mutation rate per project (cheap; helps detect runaway scripts).
- **Storage:** Postgres single instance, monthly partitioning on `catalog_audit.created_at`. `catalog_items` itself is small (10k-100k rows per project) — no partitioning needed.
- **Security:** App role `EXECUTE` on the catalog functions; `SELECT` on `catalog_items` and `catalog_audit`; **no `INSERT`/`UPDATE`/`DELETE`** on either. Mutation path is the function. Migration discipline: any GRANT change requires security review per `[[wallet-mechanics]]` cascade obligation #5 (CI lint script).

## Production-grade gates

- **Idiomatic** — Postgres-native: stored functions, role-based GRANT trust boundary, JSONB for flexible item shape, partial indexes on the published/active subset, monthly RANGE partitioning. Same patterns as `[[wallet-mechanics]]`.
- **Industry-standard** — every primitive appears in ≥2 production references:
  - State-based catalog: PlayFab Draft/Published, LaunchDarkly flag-state.
  - ETag optimistic concurrency: PlayFab `ExecuteInventoryOperations`, standard HTTP semantics.
  - Linear audit log + JSON Patch: LaunchDarkly change history, generic CMS practice.
  - Per-project environment isolation: PlayFab title, Unity GS environments, Beamable namespaces.
  - Bulk publish: Contentful release scheduling, PlayFab batched operations.
- **First-class** — uses Postgres' native abstractions (functions, partitions, JSONB indexes, role grants) without fighting them. JSON Patch (RFC 6902) is the IETF-standard wire format for the diff column. No custom serialization, no bespoke locking schemes.

## Rejected alternatives

### A — DAG-based row-level branch+merge (DESIGN.md §12.3 framing)
**What:** every catalog row has a Git-style commit DAG; designers create branches; merge resolves conflicts.
**Wins when:** large-team workflows with concurrent designer collaboration on the same items at high frequency, where serial editing has unacceptable social cost.
**Why not here:** falsified by `[[catalog-versioning-research]]` F1. No surveyed system ships this. Workload mismatch (F2P catalogs have 1-2 concurrent editors per item, not 50). RFC ecosystem hasn't produced merge-conflict-resolution algorithms for JSON because production teams haven't needed them.

### B — Per-revision storage (every change creates a new row, current = max(version))
**What:** `catalog_items_revisions` table; mutations INSERT new rows; live state computed from latest.
**Wins when:** time-travel queries on the *content* (not just the audit log) are first-class, e.g., "what was the price of gem_starter_pack on 2025-12-15?".
**Why not here:** time-travel via audit-log replay is sufficient at BokChoy's read frequency for historical content (rare). Per-revision storage adds a JOIN-heavy read path on every player-facing catalog query, which IS frequent. Cost/benefit doesn't pencil.

### C — Real-time CRDT collaborative editing (Sanity-style)
**What:** Yjs/Automerge-backed editor; multiple designers edit simultaneously without locking.
**Wins when:** the editor is the differentiator and team workflows demand simultaneous editing.
**Why not here:** different feature investment. Per `[[catalog-versioning-research]]` F2/F3 — F2P game-backend catalogs don't have the workload that justifies CRDT-tier editor work. ETag optimistic locking suffices.

### D — Approval workflows at MVP
**What:** dashboard-resident approval gate before publish.
**Wins when:** customer organization mandates approval-before-deploy (regulated industries; large team with separate approvers).
**Why not here:** no MVP customer surface needs this; T3 (CaC upgrade) uses git PRs as the approval surface, so building dashboard workflows at MVP doesn't make T3 easier. Defer until a customer surfaces the need.

### E — `environment` column instead of project-as-environment
**What:** single `project_id`, multiple `environment` values per project.
**Wins when:** environments share most data (catalog, players) and cross-environment queries are first-class.
**Why not here:** breaks `[[idempotency-strategy]]`'s per-project scoping. Players don't shouldn't span environments anyway (a "production" player is not the same entity as a "staging" player). Project-as-environment is consistent with the rest of the system.

### F — Build T3 (CaC) at MVP behind a feature flag
**What:** ship CLI export/import, git-driven workflow at MVP behind opt-in flag.
**Wins when:** customer signal indicates strong demand for CaC out of the box.
**Why not here:** no customer signal at MVP. Speculative build. Position 3 in the design pre-pass settled this — option 2 (stub vault entry) is the right discipline level.

## Failure modes

1. **ETag-mismatch fatigue.** A designer makes a long edit, hits Save, fails because someone else published in the meantime, has to redo their work. Probability: low at solo/small studio scope, medium at Studio+ scope. Cost: low (designer frustration, no data loss). Mitigation: dashboard auto-saves drafts on a debounce so partial work isn't lost on conflict; conflict-detection UI shows what changed since the user's last read.

2. **JSON Patch reverse-apply incorrect for diff view.** Reconstructing prior state requires applying patches in reverse, which works for `replace` but is fragile for `move`/`copy` operations. Probability: medium. Cost: medium (designer sees an inaccurate "previous version" rendering). Mitigation: snapshot every Nth `catalog_audit` row's full prior state in a `prior_state JSONB` column for diff-view fast-paths; reverse-apply only for incremental hops between snapshots. Implementation-phase tuning per `[[runbook-idempotency]]`.

3. **Bulk-publish partial failure.** `catalog_publish_bulk(project_id, item_ids[10], …)` — one of the 10 items has an ETag mismatch; the whole transaction rolls back. Probability: medium during peak edit windows. Cost: medium (designer is mid-event-launch and hits a conflict). Mitigation: dashboard pre-validates ETag on all items before calling bulk-publish; surfaces specific conflicting items; designer resolves and retries.

4. **`catalog_audit` log skew under high mutation rate.** A designer-script that programmatically updates 1000 items in a tight loop generates 1000 audit rows in seconds. Probability: low (intentional misuse pattern). Cost: medium (per-project audit log grows fast, makes diff queries slower). Mitigation: per-project rate-limit on catalog mutations (e.g., 100/minute) at the API gateway; alert at 10× baseline.

5. **Project-as-environment promotion friction.** Moving 50 catalog items from a `dev` project to a `prod` project at deploy time requires re-creating each item with a new `id`. References (`related_id` in `transactions`) don't transfer because the new prod project has new ids. Probability: high if customers want frequent dev-to-prod promotion. Cost: high (designer time + risk of mis-copy). Mitigation: ship `[[catalog-cac-upgrade]]` when this surfaces — CaC export/import preserves `friendly_id` so prod re-creates with stable references via friendly_id, not row id.

6. **Loot-table publishing bug breaks live game.** A designer updates a loot table, accidentally sets a drop probability to 0%, publishes. Live players get nothing from that loot table. Probability: medium during live-ops cycles. Cost: high (player-visible bug, may require compensation grants). Mitigation: catalog mutation functions include sanity-check assertions for known-bad shapes (e.g., loot-table total probability must sum to 1.0); ETag rollback procedure documented in `[[runbook-idempotency]]`; dashboard "Revert to prior version" button reads `catalog_audit` and applies reverse-Patch.

## Mitigations summary

- **ETag fatigue:** auto-save drafts; conflict-detection UI.
- **Reverse-apply edge cases:** periodic prior_state snapshots in `catalog_audit`; only reverse-apply between snapshots.
- **Bulk-publish partial failure:** pre-validate ETags client-side before bulk call.
- **Audit log skew:** per-project mutation rate limit + alerting.
- **Promotion friction:** ship `[[catalog-cac-upgrade]]` when customer demand surfaces.
- **Loot-table bugs:** in-function sanity assertions + revert-to-prior dashboard action.

## Idiom citations

- `[[wallet-mechanics]]` M2 stored-function-only-interface — same pattern transferred to catalog.
- `[[idempotency-strategy]]` per-project scoping — same `project_id` boundary applied to catalog environment isolation.
- IETF RFC 6902 (JSON Patch) — wire format for `catalog_audit.diff`.

## Revisit when

- **Customer demand for git-driven workflow surfaces.** Build out `[[catalog-cac-upgrade]]` per its conditions.
- **A customer team grows past 5 designers concurrently editing the same catalog.** ETag-mismatch fatigue gets real; revisit Sanity-style real-time collaboration vs. building bulk-conflict-resolution UI.
- **A customer demands approval-before-deploy at the dashboard layer.** Build T2 approval workflows.
- **`catalog_audit` log size at any project exceeds 10M rows.** Revisit retention and partition strategy.
- **A specific loot-table or catalog change causes a player-facing incident.** Verify the revert-to-prior dashboard action is fast enough; build a "panic-button" emergency unpublish if needed.
- **Performance issues on diff-view rendering for items with deep change histories.** Implement the prior_state snapshot mitigation.

## Cascade obligations

1. **CL-031 server-authoritative loot** — `loot_table` rows in `catalog_items` follow this entry's lifecycle (Draft/Published, ETag, audit). The RNG seed format and pity-state engine are CL-031's scope; the *catalog representation* of loot tables is set here.
2. **`[[catalog-cac-upgrade]]` stub** — placeholder vault entry to be created alongside this one. Tracks the T3 upgrade path with revisit conditions.
3. **CI lint script** (already cited as cascade from `[[wallet-mechanics]]`) — extend to grep migrations for GRANT changes on `catalog_items` and `catalog_audit`.
4. **Customer-facing API docs** — designer-ergonomics surface (Dashboard v1 per `[[mvp-feature-sequence]]` month 1-3) needs to expose the Draft/Published model coherently.
5. **`[[runbook-idempotency]]`** — absorb the catalog-specific operational items: revert-to-prior procedure, audit-log skew alerting, ETag conflict-resolution playbook.
