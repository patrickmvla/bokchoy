---
type: research
features: [catalog, architecture]
related: ["[[wallet-mechanics]]", "[[wallet-source-of-truth-research]]", "[[idempotency-strategy]]", "[[mvp-feature-sequence]]", "[[wedge-decision]]", "[[design-claims-register]]"]
created: 2026-05-02
confidence: high
provisional: false
---

# Catalog versioning: do production game-economy backends and adjacent systems ship Git-style branch+merge — or do they ship state-machines, multi-environment promotion, and linear history with rollback?

## Question

DESIGN.md §12.3 names the catalog as a "version-controlled artifact" needing **DAG semantics, merge-conflict resolution for JSON, and a branch model**. CL-030 in `[[design-claims-register]]` flagged these as deferred specifications. This research closes the gap: what versioning model do named production game-backend catalogs (PlayFab Catalog v2, Beamable Content, Unity Gaming Services Economy) and adjacent systems (LaunchDarkly, Statsig, Contentful, Sanity) actually ship? Specifically:

- Is the version-graph linear, tree, or DAG with branches?
- How are merge conflicts on JSON-shaped catalog rows handled?
- What branch model do designers actually use (draft/staging/prod, feature-branch-per-event, none)?
- And — most load-bearing — does the production-cite signal support DESIGN.md §12.3's "DAG + branchable" framing, or falsify it?

## Triangulation

- **Production reference (game backends):** ✓ — PlayFab Catalog v2 (tier 1+2, Microsoft Learn docs); Beamable Content (tier 2, vendor docs + engineering blog); Unity Gaming Services Economy CLI (tier 1+2, Unity Docs).
- **Production reference (adjacent — feature flags + CMS):** ✓ — LaunchDarkly (tier 2, official docs); Statsig (tier 4, comparison sources cite the model); Contentful (tier 4, multi-source comparison); Sanity (tier 4, multi-source comparison).
- **Docs reference:** ✓ — IETF RFC 6902 (JSON Patch) and RFC 7396 (JSON Merge Patch), pinned to current. Postgres docs implicitly via the storage-shape question (out of scope here).
- **Contradiction probe:** ✓ — searched for game-economy live-ops incident post-mortems where lack of branching cost a team. Surfaced live-ops-failure literature naming "balance change must be quickly rolled back" but no named incident attributable to the absence of Git-style branching. **The contradiction probe strengthens the finding:** if Git-style branching were table-stakes, its absence should produce documented failures; no such documented failure surfaced.

## Sources examined

### S1 — PlayFab Catalog v2 (Microsoft Learn, Catalog Overview + Item Status + REST API)

- **Tier:** 1+2 (official Microsoft docs, version-pinned 2026-02-25)
- **Provenance:** `learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/catalog/catalog-overview`, observed 2026-05-02. Also: `learn.microsoft.com/en-us/rest/api/playfab/economy/catalog/create-draft-item` and related REST endpoints.
- **Author context:** Microsoft Gaming, PlayFab Economy team. Author: thomasgu. Generally Available product shipping at every scale.
- **What it tells us:** PlayFab Catalog v2 implements a **two-state model: Draft + Published**.
  - **Draft state:** "metadata is available via direct call but is not exposed to public search." Visible only to Item Creator + Catalog Admins + Title Entities. Mutations via `CreateDraftItem`, `UpdateDraftItem`. Not yet live.
  - **Publish transition:** explicit `PublishItem` API call moves an item from Draft → Published.
  - **Published state:** items with valid Start/End date pair are visible via `SearchItems` and `GetItem`.
  - **Time-bounded availability:** required `Start Date` field + optional `End Date` field. Designer schedules item availability without needing branches — just publish ahead with a future Start Date.
  - **Display Version field:** a designer-managed integer at item level. NOT a system-managed version graph; just metadata for the designer's own change-tracking. Quote from the Catalog V2 item fields: *"Display Version: A field you can use to version to your Display Properties."*
  - **No branching, no merging, no DAG.** The "version control" is exactly two states + a designer-set integer.

### S2 — Beamable Content (vendor docs + engineering blog)

- **Tier:** 2 (vendor official docs and engineering blog, dated)
- **Provenance:** `docs.beamable.com/docs/content-feature-overview`; `beamable.com/blog/beamables-new-versioning-system-clarity-and-flexibility-for-our-developers` (2024-10-16). Observed 2026-05-02.
- **Author context:** Beamable platform team. ICP-adjacent (indie/mid-market F2P).
- **What it tells us:** Beamable uses **namespaces** for content isolation + multi-environment + version-isolation:
  - *"Namespaces are locations for content to be published so content does not impact other namespaces."*
  - Namespaces serve dual purpose: environment partitioning AND game-version compatibility (*"content namespaces can also be used for versioning to ensure older versions of the game don't break"*).
  - **Semantic versioning at the platform level** (Beamable's own SDK releases) — patch / minor / major. NOT applied to game content versioning at the row level.
  - Live Ops Portal allows **promotion of content/microservices through deployment workflows** — the term "branches" in Beamable's docs refers to environment-promotion paths, not Git-style branches.
  - CLI-based content management (replaced Unity-native tools per `beamable-unity-sdk-3-0` blog).
  - **No Git-style branch+merge.** Multi-namespace promotion is the closest pattern, and it operates at the environment/game-version level, not at the catalog-row level.

### S3 — Unity Gaming Services Economy CLI

- **Tier:** 1+2 (official Unity docs and CLI source repo)
- **Provenance:** `docs.unity.com/en-us/economy/write-configuration/cli`; `docs.unity.com/ugs/manual/overview/manual/service-environments`; `github.com/Unity-Technologies/unity-gaming-services-cli`. Observed 2026-05-02.
- **Author context:** Unity Technologies (UGS team). Largest engine vendor; UGS is the first-party economy backend.
- **What it tells us:** Unity GS adopts **Configuration-as-Code with external git as the version controller**.
  - Three-tier environment model: **Production / Staging / Development.** "Environments are isolated, meaning that if you change data in one environment, data in other environments is not affected."
  - Recommended workflow: *"Production environment serving released applications, a Staging environment for final testing, and a Development environment as a shared integration environment for the team."*
  - Deploy via CLI: `ugs deploy <path-to-economy-file>` promotes local resources to remote environment.
  - Cross-environment movement: `ugs fetch <out-dir> --environment-name <from>` then `ugs deploy <in-dir> --environment-name <to>`.
  - **Source control IS the canonical version controller.** Quote: *"Economy resources in the Unity Editor allow users to treat their source control as the single source of truth (instead of the cloud version), simplifying actions such as rollbacks and other common operations."*
  - **Concurrency / conflict resolution is not documented at the cloud layer.** Two engineers running `ugs deploy` simultaneously is undefined behavior in the docs surveyed; the system relies on git's branch/merge for the actual version control.
  - **Pattern: backend is a deployment target, not a version controller.** Branches live in git; UGS just executes deploys.

### S4 — LaunchDarkly Change History

- **Tier:** 2 (official docs)
- **Provenance:** `launchdarkly.com/docs/home/releases/change-history`. Observed 2026-05-02.
- **Author context:** LaunchDarkly is the canonical feature-flag-as-a-service. Same problem class as catalog versioning at the operational layer (versioned config, point-in-time rollback, environment promotion).
- **What it tells us:** LaunchDarkly ships a **linear audit trail with point-in-time rollback**.
  - *"a running log of changes made to feature flags and other resources in each environment"* — linear, per-environment.
  - Rollback: *"use the change history to roll back a flag to a previous version"* — prior-version-restore.
  - **No branching, no merging concepts in the documentation.** Multiple environments exist (per LaunchDarkly's standard model) but each environment has its own linear history.
  - Approval workflows and scheduled changes exist as **process-layer controls**, not as data-model branches.

### S5 — Statsig (feature flag, comparison + product docs)

- **Tier:** 4 (vendor comparison sources triangulated)
- **Provenance:** `statsig.com/perspectives/how-launchdarkly-works`, multiple comparison articles, observed 2026-05-02.
- **What it tells us:** Same shape as LaunchDarkly — linear history, prior-version rollback, environments as parallel state — plus **automatic-rollback-on-metric-threshold** as a guarded-release primitive: *"guarded releases with automatic rollback based on metric thresholds."* No branching/merging.

### S6 — Contentful (headless CMS, multi-source comparison)

- **Tier:** 4 (multi-source comparison; vendor docs surfaced via summaries)
- **Provenance:** Cross-references via `enterprisecms.org/guides/sanity-vs-contentful-for-enterprise`, `webstacks.com/blog/contentful-vs-sanity`, `breakingac.com/news/2026/mar/02/cms-workflow-automation-contentful/`. Observed 2026-05-02.
- **What it tells us:** Contentful ships the **closest pattern to "branchable" surfaced anywhere in this research** — but at the *environment* level, not the row level:
  - **Environment aliases:** "the built-in master alias serving live content, and custom aliases (like staging and qa) allowing you to re-point an alias to promote or rollback entire content branches atomically."
  - This is a lightweight branching model: each environment is a snapshot; aliases are mutable pointers; promotion = re-pointing an alias.
  - Workflow states (Draft → Internal Review → Copyedit → Approved → Published) layered as process controls over the linear-history shape.
  - **Still NOT Git-style row-level branch+merge.** It's "atomic environment swaps," which solves the *deployment* concern without solving the *concurrent edit* concern.

### S7 — Sanity (headless CMS, multi-source comparison)

- **Tier:** 4 (multi-source comparison)
- **Provenance:** Cross-references, observed 2026-05-02.
- **What it tells us:** Sanity ships **document versioning + real-time collaboration**:
  - "Document versioning, conditional fields, AI-powered automation, custom workflows."
  - "Multiple people work on the same content in real-time without overwriting each other's changes" — implies CRDT-or-equivalent at the editor layer.
  - "Document history, tracking, and rollback" — linear-with-rollback pattern.
  - **No documented branching/merging at the data model.** Real-time collaboration replaces the need for branches at the editor level.

### S8 — IETF RFC 6902 (JSON Patch) and RFC 7396 (JSON Merge Patch)

- **Tier:** 1 (canonical IETF specs)
- **Provenance:** `datatracker.ietf.org/doc/html/rfc7396`, `datatracker.ietf.org/doc/html/rfc6902`. Current. Observed 2026-05-02.
- **What it tells us:** Both RFCs are **patch formats, not merge-conflict resolvers**.
  - **JSON Patch (6902):** array of `add`/`remove`/`replace`/`move`/`copy`/`test` operations applied atomically. *"if any of them fail then the whole patch operation should abort."* Useful for representing changes between two versions; does NOT specify how to reconcile two patches that conflict.
  - **JSON Merge Patch (7396):** diff-shape — "the nodes of the document which should be different after execution." Simpler than 6902 but has a quirk: *"Deletion happens by setting a key to null. This inherently means that it isn't possible to change a key's value to null."*
  - **Neither RFC handles the case where two patches concurrently target the same path with different values.** That's the merge-conflict-resolution problem, and it's left to the application layer.
- **Implication for BokChoy:** if BokChoy's catalog needs Git-style merging, BokChoy must build the conflict-resolution layer itself. RFCs 6902/7396 give the wire format; they don't give the algorithm.

### S9 — Live-ops failure-mode literature

- **Tier:** 4 (industry articles, no specific named incident located)
- **Provenance:** Multiple live-ops best-practices articles surveyed 2026-05-02 (ilogos.biz, iXieGaming, Adrian Crook).
- **What it tells us:** Industry consensus on live-ops catalog risk:
  - *"Balance changes might permanently ruin your game's economy if not quickly rolled back."*
  - *"LiveOps failures rarely originate from traditional code defects; instead, they emerge from state carry-over, schema mismatches, and timing drift between data and client logic."*
  - **Automated rollback is the named mitigation pattern**, not branching: *"Automated rollback procedures act as a 'panic button' that reverts changes if errors spike."*
- **Contradiction probe outcome:** No named incident attributable to the *absence* of Git-style branching surfaced. The recurring incident class is "bad config went live; needs rollback" — solved by linear-history-with-rollback, not by branching.

## Findings

### F1 — DESIGN.md §12.3's "DAG + branchable" framing is not production-cited

Across PlayFab, Beamable, Unity GS, LaunchDarkly, Statsig, Contentful, Sanity — **none ship Git-style branch+merge inside the catalog.** The closest pattern (Contentful's environment aliases) is atomic-environment-swap at the deployment layer, not row-level branching. The closest "real" branching surfaces only when teams adopt Configuration-as-Code with external git (Unity GS pattern) — and even then, the branching lives in git, not in the backend.

DESIGN.md §12.3 reads as aspirational. **The honest replacement framing:**

> Catalog versioning ships as: per-item state (Draft/Published), per-environment isolation (Dev/Staging/Prod), linear-history with point-in-time rollback, plus optional Configuration-as-Code via external git for teams that want it. No DAG, no merge resolution at the row level — those are solved by process discipline and optimistic locking, not by data model.

### F2 — Five distinct patterns exist; production teams compose, not pick one

The surveyed systems combine multiple patterns rather than committing to a single model:

- **State-based** (PlayFab Draft/Published) — per-item-row.
- **Multi-environment promotion** (Unity, Beamable, Contentful) — per-project-environment.
- **Linear history with rollback** (LaunchDarkly, Sanity) — per-resource-change.
- **Configuration-as-Code with external git** (Unity GS) — per-codebase.
- **Approval workflows + scheduled changes** (LaunchDarkly Workflows, Contentful Workflows app) — process layer over any of the above.

PlayFab ships approximately {state-based} + {linear history via Display Version field} + {time-bounded availability via Start/End dates}. Unity ships {multi-environment} + {CaC via git}. Beamable ships {multi-environment via namespaces} + {portal-based promotion}. **No surveyed system ships ALL five patterns; each picks the subset that fits their ICP.**

### F3 — Concurrent-edit conflict resolution is solved by optimistic locking + process discipline, not by merging

Per `[[wallet-source-of-truth-research]]` S2: PlayFab uses **ETag-based optimistic concurrency**. If two designers edit the same item simultaneously, the second write fails with `PreconditionFailed (1610)`; the second designer must re-read and re-apply.

This is the convergent pattern: detect the conflict, surface the failure, force the human to reconcile. Not auto-merge. Not branch-divergence-then-merge.

The deeper reason: **F2P catalog rows are designer-authored, not autogenerated. The number of concurrent editors per item is small (~1-2) and the social cost of "Sarah, I'm editing the loot table, hold off" is low.** True merge resolution becomes load-bearing when the number of concurrent editors per artifact is high (e.g., source code in a 50-engineer monorepo) — F2P catalogs are not that workload.

### F4 — JSON Patch / Merge Patch RFCs are wire formats, not algorithms

Per S8. RFCs 6902/7396 specify *how to represent a change* between two JSON documents. They do NOT specify *how to reconcile conflicting changes*. If BokChoy ever needs Git-style 3-way merge on JSON catalog rows, that's a build-it-yourself layer with no RFC blueprint to follow. **This is itself a strong argument against the §12.3 framing** — the RFC ecosystem hasn't produced a "JSON Merge Conflict Resolution" spec because production teams haven't needed one.

### F5 — Rollback is the load-bearing mitigation, not branching

S9 + LaunchDarkly + PlayFab + Statsig converge: the operational concern is "bad config went live, revert it fast." Branching is a *prevention* mechanism (test in a branch before merging); rollback is a *response* mechanism (revert after the bad change went live).

In F2P live-ops, the dominant failure mode is *time-pressured catalog deploys* (a live-ops event launches in 30 minutes, the designer makes last-minute price changes). Branching would force the designer to merge before deploy — adding latency. Linear-history-with-rollback lets them deploy fast and revert if something breaks.

**Implication: BokChoy's catalog should optimize for fast rollback, not for branch-merge-deploy.** Designer ergonomics for live-ops match this — they don't want to "open a PR" against the catalog before each deploy.

### F6 — Configuration-as-Code with external git is the upgrade path for teams that need real branching

Unity GS Economy is the production-cite for this pattern. Designer authoring → CLI export to JSON → git commit → CI deploy. Branches and merges happen in git, not in the backend.

This pattern is **not at MVP scope per `[[mvp-feature-sequence]]`** (months 1-3 spine doesn't include CI/CD plumbing for catalog-as-code). But it's the natural upgrade path if a customer ever needs git-style discipline. BokChoy can ship the simpler pattern at MVP and add CaC export/import later without re-architecting.

## Conflicts

### Contentful environment aliases vs. PlayFab's lack of them

Contentful (S6) ships "atomic environment swaps via aliases" — re-point the master alias from one environment snapshot to another. PlayFab (S1) doesn't. This is a real architectural difference but not a contradiction:

**Per *Contradiction protocol*:** different ICPs, different operational characteristics. Contentful serves marketing-content workflows where atomic-swap-between-snapshots is high-value (a marketing team wants to publish 50 changes simultaneously for a product launch). PlayFab serves game-economy where individual-item Draft/Published with time-bounded availability solves the same problem at item granularity.

**For BokChoy:** the Contentful pattern is interesting but not load-bearing. F2P live-ops typically deploys 1-5 catalog changes per event, not 50. Atomic-environment-swap is overkill at MVP. PlayFab-shape is sufficient.

### Sanity's real-time collaboration vs. PlayFab's ETag locking

Sanity (S7) ships real-time CRDT-style collaboration: "multiple people work on the same content in real-time without overwriting each other's changes." PlayFab (S1) ships ETag-based pessimistic-style locking that fails the second writer.

**Per *Contradiction protocol*:** Sanity is editor-tech-heavy; their value-prop is the editing UX. Real-time collaboration is a feature-investment; PlayFab and the surveyed game backends haven't made that investment because the workload doesn't demand it. **For BokChoy:** ETag locking is the production-cited choice for game-backend catalog editing. Real-time collaboration is a nice-to-have feature that doesn't ship at MVP.

## Conditions

This finding holds under:

- **F2P virtual-currency catalogs at indie/mid-market scale.** ICP per `[[wedge-decision]]`. The number of concurrent designers per item is small (1-2); the social cost of serializing edits is low. If BokChoy ever serves a customer with 20+ concurrent designers on the same catalog, the pattern breaks and real-time collaboration (Sanity-style) becomes load-bearing.
- **MVP timeline per `[[mvp-feature-sequence]]`.** Months 1-3 spine includes catalog v1 with editor + transaction inspector + player search. CI-deploy-from-git-branches is not in this scope; ships later if customer demand surfaces.
- **Postgres as backing store** per `[[idempotency-strategy]]` B7. Catalog rows are JSONB columns; the versioning patterns above (Draft/Published states, Display Version field, environment partitioning via project_id, linear history via append-only audit) are all naturally Postgres-shaped.

This finding does **not** generalize to:

- Cross-team / cross-customer collaboration on the same catalog (e.g., publisher + multiple licensee studios editing one shared catalog). Different workload; different patterns apply.
- Real-time multiplayer-style catalog editing (no surveyed F2P backend ships this; deferred).
- Catalogs with hundreds of designers concurrently editing (Sanity-style real-time CRDT becomes the right pattern at that scale).

## Operational implications for design

The CL-030 design pass should choose from this menu of production-cited patterns, in approximate ascending complexity order:

### Tier 1 — Minimum viable (PlayFab-shape, ships at MVP scope)

- **Per-item state machine:** `draft_status` column on catalog rows: `draft` | `published` | `archived`.
- **Time-bounded availability:** `start_date`, `end_date` columns. Designer publishes ahead of an event with a future start_date.
- **ETag-based optimistic concurrency:** every catalog row has a `version` integer. Update queries `WHERE version = $expected_version`; failed updates return `PreconditionFailed`.
- **Linear audit log:** every mutation emits a `catalog_audit` row (similar to `transactions` shape per `[[wallet-mechanics]]`). Point-in-time rollback queries this log to reconstruct prior state.
- **Per-project environment isolation:** dev/staging/prod environments via separate `project_id` values per `[[idempotency-strategy]]`'s scope (already in scope).

This shape is production-cited (PlayFab, LaunchDarkly), fits MVP timeline, and uses Postgres primitives BokChoy already owns.

### Tier 2 — Designer ergonomics layer (ships incrementally post-MVP)

- **Bulk publish / unpublish:** atomically transition multiple draft items to published in one operation (a live-ops event launches with 5 new items + 3 price changes; one button publishes them all).
- **Approval workflows:** per-item or per-project review gate before publish. (LaunchDarkly Workflows pattern.)
- **Scheduled deploys:** publish at specific time without manual intervention. (PlayFab's start_date already covers individual items; bulk scheduling is a UX layer.)
- **Diff view in dashboard:** show what changed between current and prior version. Read-only over the audit log.

Each is an incremental feature; none re-architects.

### Tier 3 — Configuration-as-Code (upgrade path; ships only when customer demands)

- **CLI export/import to JSON:** designer or engineer can `bokchoy catalog export --project=X` to a directory of JSON files; git-commit; CI deploys via `bokchoy catalog import`. (Unity GS pattern.)
- **3-way merge:** if two engineers' branches both edit the same catalog row, the import path detects the conflict and surfaces it. Implementation: stock git diff/merge on JSON files. **No build-it-yourself JSON merge engine** — let git do it; humans resolve.
- **CI-driven multi-environment promotion:** dev → staging → prod gated by CI tests.

This is significant infrastructure work and ships only when a customer's workflow needs it. **Defer to post-Series-A.**

### Tier 4 — Out of scope at any horizon BokChoy currently sees

- **Real-time collaborative editing** (Sanity-style CRDT). Different feature investment; not on the BokChoy roadmap.
- **Atomic environment swap via aliases** (Contentful-style). Solves a problem BokChoy doesn't have at indie/mid-market scale.
- **DAG-based branch+merge inside the catalog data model.** No production cite; F4 + S8 confirm the RFC ecosystem hasn't built the algorithm.

## Reproducibility note

**Reproducible.** Same finding via:

1. PlayFab Catalog v2: read `learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/catalog/catalog-overview` + `item-status` + the `CreateDraftItem` REST API page. The Draft/Published state model is named explicitly; the Display Version field is a designer-managed integer documented as such.
2. Unity Gaming Services: read `docs.unity.com/en-us/economy/write-configuration/cli` + `docs.unity.com/ugs/manual/overview/manual/service-environments`. CaC + multi-environment-via-CLI is documented.
3. Beamable: read `docs.beamable.com/docs/content-feature-overview` + the namespace-versioning blog. Confirm namespace-as-version pattern.
4. LaunchDarkly: read `launchdarkly.com/docs/home/releases/change-history` — confirms linear-history-with-rollback and absence of branching concepts.
5. JSON Patch / Merge Patch: read RFC 6902 + 7396 directly.
6. Contradiction probe: search "live ops catalog rollback incident" — surfaces the rollback-as-mitigation pattern, no named branching-failure.

The judgment most load-bearing on F1's "DESIGN.md §12.3 is aspirational" claim is the survey size (7 named systems). If a future research session finds a tier-1 production reference shipping Git-style row-level branch+merge for game catalogs, F1 should be revisited. None surfaced in this research.

## Open threads

1. **Atomic bulk publish — schema specifics.** Tier 2's "publish 5 items + 3 price changes atomically" needs a transaction grouping primitive. Could be a `catalog_releases` table holding sets of pending publish operations, executed in a single Postgres transaction. Folds into the design entry that vaults CL-030.

2. **Audit-log retention for catalog changes.** `[[audit-retention-research]]` covered transaction retention; catalog change retention is a separate question. Probably similar shape (24-month hot, S3 archive) but warrants a brief verification before vaulting CL-030's design entry.

3. **Designer-ergonomics for time-zone handling.** F2P live-ops events fire at specific local times. PlayFab's `Start Date` is UTC; designer scheduling for a Japan-launch event needs UTC math. Worth surfacing in the design entry as a customer-ergonomics concern, not a research thread.

4. **Customer-facing API contract for catalog publish.** When a customer's CI publishes a catalog change, what's the API shape — REST POST per item, batch endpoint, or both? Ties to the `idempotency-strategy` (catalog publish is itself a mutating endpoint that needs idempotency keys). Belongs in CL-030 design.

5. **Cybertec article on triggers-to-enforce-constraints (cross-reference from `[[wallet-audit-invariant-research]]`).** Still 403'd. Not load-bearing for CL-030 but the research-level open thread carries forward.

6. **CL-031 server-authoritative loot is the next CL in queue.** This research's findings constrain it weakly: the loot-table catalog rows follow the same Draft/Published + audit pattern as other catalog items. The loot-roll engine itself (RNG, pity state) is tighter scope.
