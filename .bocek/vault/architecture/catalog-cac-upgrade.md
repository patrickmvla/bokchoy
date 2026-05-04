---
type: exploration
features: [catalog, architecture]
related: ["[[catalog-versioning]]", "[[catalog-versioning-research]]", "[[mvp-feature-sequence]]", "[[wedge-decision]]"]
created: 2026-05-02
confidence: low
status: deferred
---

# Catalog Configuration-as-Code (CaC) upgrade — stub for the T3 upgrade path documented in `[[catalog-versioning-research]]`

> **Status: deferred. Not built. Conditions for revisiting are recorded below.**

## What this is

A stub vault entry tracking the planned-but-not-built upgrade from `[[catalog-versioning]]`'s in-dashboard editing model to a Configuration-as-Code workflow modeled on Unity Gaming Services Economy. Per `[[catalog-versioning-research]]` four-tier menu, this is **T3** — the upgrade tier that customer-demand triggers, not a default MVP investment.

This entry exists so a future engineer searching the vault for "CaC", "catalog export", "git-driven catalog", or "T3" finds a real document with revisit conditions, rather than a sentence buried in `[[catalog-versioning]]`'s reasoning section.

## Shape (when built)

Per `[[catalog-versioning-research]]` S3 (Unity GS Economy CLI):

- **CLI export:** `bokchoy catalog export --project=<id> --out=<dir>` writes catalog rows as JSON files (one per item, organized by type: `items/`, `currencies/`, `bundles/`, etc.). `friendly_id` becomes the filename for human-readable references.
- **CLI import:** `bokchoy catalog import --project=<id> --in=<dir>` reads JSON files, computes per-item diffs against current catalog state, calls `catalog_update_draft()` / `catalog_create_draft()` / `catalog_publish_bulk()` from `[[catalog-versioning]]` accordingly. Atomic per-bulk-publish-call; rolls back on any failure.
- **Cross-project promotion:** `bokchoy catalog export --project=<dev>` then `bokchoy catalog import --project=<prod>` moves a catalog version between environments. `friendly_id` is the stable cross-project reference (per-project `id` does not transfer).
- **Git-driven branching and merge:** designers/engineers commit JSON files to a git repo. Branches and merges happen in git, not in BokChoy. Standard 3-way merge handles concurrent edits — humans resolve conflicts in their git tooling, not in BokChoy. BokChoy is a deployment target, not a version controller (Unity GS pattern).
- **CI deploy:** customer's CI pipeline calls `bokchoy catalog import --project=<env>` on merge to a designated branch.

## Why this is the upgrade path, not an MVP build

Per `[[catalog-versioning-research]]` F6 + the `[[catalog-versioning]]` decision:

- T3 reuses T1+T2 primitives: `catalog_publish_bulk` is the same import primitive; `catalog_audit.diff` is the same JSON Patch shape that export reads.
- T3 has no new schema requirements beyond what `[[catalog-versioning]]` already builds.
- The work that's deferred is purely the CLI surface and the customer-facing CI integration tooling.
- **No customer signal at MVP** justifies building this speculatively. Indie / small-studio customers don't have the git-discipline workflow this enables.

## Revisit when

- **A paying customer requests git-driven catalog workflow.** The first concrete ask. Build out the export/import CLI and the documentation. Customer signal weight: high.
- **Cross-project promotion friction becomes a top-3 customer support complaint.** Per `[[catalog-versioning]]` failure mode #5 — without CaC, dev-to-prod catalog promotion requires re-creating items in the prod project. If that becomes painful, T3 closes the gap.
- **A customer team grows past ~5 engineers + designers contributing to the same catalog.** Concurrent-edit pressure makes git-style discipline more valuable than dashboard-level optimistic locking.
- **A regulatory or contractual requirement appears for "all catalog changes must go through code review."** PEGI-2026-style requirements don't currently mandate this, but a customer-specific compliance audit might.

## Open threads

1. **Schema versioning for the JSON files.** When BokChoy adds a new field to `catalog_items` (e.g., `subscriptions` v2 adds a new lifecycle property), older JSON files in customer git repos become outdated. The CLI needs to know how to handle older schemas gracefully — backward-compatible additive fields, explicit migration steps for breaking changes. Worth a research session before building T3.

2. **`friendly_id` collision handling.** Two engineers create items with the same `friendly_id` on different branches; on merge, the import detects the collision and refuses. UX for surfacing this conflict cleanly is a design question for the CLI implementation phase.

3. **JSON file format conventions.** Hand-edited vs. tool-edited; pretty-printed vs. minified; line-ordering stability across export runs (so `git diff` produces minimal output). Standard CLI implementation concerns; not load-bearing today.

4. **Multi-customer shared catalogs.** Out of scope per `[[wedge-decision]]` (BokChoy serves single-tenant per project) but if cross-customer collaboration ever surfaces, the CaC path needs different conflict-resolution semantics. Defer.

## Why this entry stays minimal

Status: deferred. Not built. The shape above is the minimum viable description for a future engineer to pick up the work without re-deriving it from scratch. Filling in implementation details (CLI argument parsing, JSON file layout, error codes) before any build commitment is premature.

When the revisit conditions trigger, this entry gets promoted to a real `type: decision` entry with full schema, rejected alternatives, and failure modes — at that point it supersedes this stub.
