---
type: decision
features: [catalog, architecture, cockpit]
related: ["[[architecture/.research/catalog-mutation-shape-at-indie-tier-research]]", "[[architecture/catalog-versioning]]", "[[architecture/catalog-cac-upgrade]]", "[[cockpit/cockpit-shape]]", "[[cockpit/admin-list-endpoints-contract]]", "[[shop/shop-contract]]", "[[shop/contract-reconciliation-2026-05-21]]", "[[inventory/inventory-contract]]", "[[wallet/credit-route-contract]]", "[[wedge-decision]]", "[[marketing/v1-shape]]"]
created: 2026-05-28
confidence: high
---

# Catalog mutation at MVP: plain CRUD on per-primitive tables + `active` boolean flags, NO draft/published state machine, NO catalog audit log, NO ETag concurrency, NO M2 stored-function-only interface — `[[architecture/catalog-versioning]]` T1+T2 scoped to upgrade-tier-not-MVP

Supersedes the MVP-scope of `[[architecture/catalog-versioning]]` (2026-05-02, confidence: high). The catalog-versioning entry's heavyweight model stays vaulted as the upgrade-tier reference; this entry binds at MVP.

## Decision

Eight sub-decisions, each grounded in `[[architecture/.research/catalog-mutation-shape-at-indie-tier-research]]` (2026-05-28, F1–F5) + the human's session-confirmed Q-A (wedge binding) + Q-B (marketing pitch is wallet-audit, not catalog-audit) + Q-C (no named customer for catalog features; the IAP-ambition stakeholder push is IAP-scoped).

**(i) Plain CRUD on shipped per-primitive tables.** Catalog mutation at MVP is direct Drizzle CRUD on `currencies` (Wallet primitive) + `items` (Inventory primitive) + `offers` + `offer_prices` + `offer_items` (Shop primitive) — the schemas already shipped 2026-05-15 → 2026-05-21 and empirically verified (30/30 SQL smoke + HTTP curl matrix). NO unified `catalog_items` table. NO type discriminator. NO `display_data`/`pricing`/`contents` JSONB blob columns. NO BIGSERIAL `id` PK + `friendly_id TEXT`. The shipped UUID PK + scalar `code` field stays.

**(ii) `items.active BOOLEAN NOT NULL DEFAULT TRUE` additive migration.** Mirrors `offers.active` (already shipped per `[[shop/shop-contract]]` (ii)). Per `[[architecture/.research/catalog-mutation-shape-at-indie-tier-research]]` F2 the publishing-control function is universal across the class; boolean flag is the wedge-tier idiom (Hiro `disabled`/`unavailable`). NO draft/published state machine. The editor exposes activate/inactivate via the same flag — operators flip `active=false` to remove from circulation without deleting the row. Currencies already in the wedge wire shape per `[[marketing/currencies-endpoint-research]]`; if currency-level activation is later needed, mirror additively.

**(iii) No `catalog_audit` table. No per-item change-history view.** Catalog edits are NOT audited at MVP. Per F3 — `LootLocker` ships a `Last Changed` timestamp only with no operator identity / no content history; Hiro silent (git-as-audit via config-as-code); PlayFab's surveyed page silent. Per Q-B the `[[marketing/v1-shape]]` (iv) audit-log-primary pitch scopes to **wallet-transaction audit** (*"player says they didn't get their gems"*), not catalog-edit audit. V1 does not violate any vaulted marketing commitment. Catalog-edit forensics defers; revisit-trigger named below.

**(iv) No ETag optimistic concurrency on catalog edits.** Last-write-wins at MVP. Per F4 — ETag not class-idiomatic at indie tier; `[[architecture/catalog-versioning]]`'s PlayFab `ExecuteInventoryOperations` ETag cite transferred a player-state primitive to a catalog-state context without specific catalog-state evidence (Conflict 2 in the research, unverified). Solo-dev to small-team at wedge scale = sustained edit conflicts unlikely. Additive when a customer surfaces the pressure.

**(v) No M2 stored-function-only interface for catalog mutation.** The app role keeps direct INSERT/UPDATE/DELETE on `currencies`/`items`/`offers`/`offer_prices`/`offer_items` (per migration 0015 grants, already shipped). NO `catalog_create_draft()` / `catalog_update_draft()` / `catalog_publish()` / `catalog_publish_bulk()` SQL functions. The `wallet_debit_by_external_id` / `item_grant_by_external_id` / `purchase_offer_by_external_id` SQL functions stay unchanged — they read from `items`/`offers` directly, no draft-state filtering needed, no schema migration.

**(vi) Editor enforces the BC093 activation invariant client-side.** Per `[[shop/shop-contract]]` Cascade #11 + `[[shop/contract-reconciliation-2026-05-21]]` D1 — `offers.active = true ⇒ ≥1 offer_items AND ≥1 offer_prices`. The cockpit offer editor MUST gate the activation toggle on these two preconditions and surface them as block-the-save UX. BC093 stays as the SQL backstop (already shipped); the editor is the primary-prevention layer. For `items.active` (new), no analogous invariant — an Item is fully self-contained.

**(vii) Editor surfaces restrict-FK delete-blocks as actionable.** All three primitive tables FK-restrict-on-delete per their respective contracts: `items` referenced by `inventory.item_id` AND `offer_items.item_id`; `offers` referenced by transitive purchase history via `metadata.purchase_id` (no FK but operationally tracked); `currencies` referenced by `wallets.currency_id` AND `offer_prices.currency_id`. Operator attempting to delete a referenced row hits Postgres restrict-FK violation. The editor MUST map this to actionable UX: enumerate the referencing rows (e.g. *"`health_potion` is in offers `curl_pack`, `bundle_pack`; remove from offers first"*), NOT a generic 422 with a raw constraint name.

**(viii) Catalog editor scope reconciles to currencies + items + offers** (3 editors, not 5). `[[cockpit/cockpit-shape]]` (M2) named the catalog editor scope as *"currencies, items, shops, bundles, loot tables"* before Inventory + Shop primitives were designed. Reconciliation: **currencies** = exists (Wallet primitive); **items** = exists (Inventory primitive); **shops** = renamed to **offers** (Shop primitive landed as priced-unit `offers`, not "storefronts" — per `[[shop/shop-contract]]` B1b); **bundles** = subsumed into offers (multi-item offer = bundle); **loot tables** = not shipped, stay deferred per F5 reframing (Hiro skipped T1+T2; loot tables don't need their own catalog-versioning before any customer asks).

## Reasoning

### Why V1 beats V2 and V3 at MVP (the keystone)

The strongest defense composes three converging factors from `[[architecture/.research/catalog-mutation-shape-at-indie-tier-research]]` with two session-confirmed human constraints:

1. **Wedge audience binding (Q-A: yes).** Per `[[wedge-decision]]` BokChoy targets indie/SMB F2P. The IAP-deferral decision earlier this session was made on the same wedge-binding stance — consistency requires applying the same constraint here. (production-cited × 2 at wedge tier: Hiro + LootLocker per research F1; confidence: high.)
2. **Marketing contract is wallet-audit, not catalog-audit (Q-B: yes).** Per `[[marketing/v1-shape]]` (iv) PRIMARY pillar is *"audit-log replayability (with idempotency rolled in) — answers the most-asked support question in any wallet/ledger product ('player says they didn't get their gems — what happened?')"*. That's `transactions`-table audit, which BokChoy already ships. Catalog-edit audit was never promised. V3-narrowed's audit-log addition would pay for a feature no vaulted marketing commitment requires AND no customer is asking for AND no class member at the right tier ships. (vault-internal-cited; confidence: high.)
3. **No named customer or revenue trigger for heavyweight catalog features (Q-C: yes).** The stakeholder push surfaced this session is IAP-scoped (*"more ambitious on IAP"* — currently undefendable hand-waving pending stakeholder specifics, separate decision tree). No stakeholder named catalog audit / draft-published / scheduled publish. Same sequencing rule as the IAP-deferral chain: no named ask → defer with revisit trigger.

The cost asymmetry is total:
- V1 = 1 vault amendment (catalog-versioning scope) + 1 additive column (`items.active`) + 0 schema rework. Slice 8.5 catalog editor unblocks immediately.
- V2 = multi-week rework. Throws away the 30/30 SQL smoke + HTTP curl matrix that just landed. Rebuild `items` + `offers` as rows in unified `catalog_items`; rewrite the 3 shipped SQL functions against new schema; re-run empirical gate from scratch. Justified only by named customer demand which doesn't exist.
- V3-narrowed = 1 migration adding `catalog_audit` + triggers, 0 customer signal, 0 marketing contract, 0 class-tier evidence (F3 says wedge tier doesn't ship this).

### Why the `[[architecture/catalog-versioning]]` (2026-05-02) confidence: high doesn't survive contact with the wedge-tier evidence

The catalog-versioning entry's cite list is **PlayFab + LaunchDarkly + Beamable + Unity GS + Contentful**. Two of five (LaunchDarkly + Contentful) are NOT game-economy class. The three game-class cites (PlayFab + Beamable + Unity GS) are mid-to-large platform tier. Per `[[architecture/.research/catalog-mutation-shape-at-indie-tier-research]]` F1, the two class members closest to BokChoy's wedge — Nakama Hiro Economy + LootLocker — were absent from the entry's evidence AND ship the opposite pattern (plain CRUD with flags). Per *Contradiction protocol* (`research/research-format.md`), production-cited-at-the-right-audience-scale wins over cross-class pattern matching.

The entry's confidence: high stands for the *bigger-platform-tier* claim. It does NOT stand for the *indie-tier-MVP* claim, which is what this decision binds. Amendment to catalog-versioning is owed (cascade #1 below).

### Why "no audit log" doesn't violate `[[marketing/v1-shape]]` (iv)

The marketing pitch's example — *"player says they didn't get their gems — what happened?"* — is answered by the `transactions` table, which BokChoy ships with full per-event provenance (`actor_id`, `created_at`, `metadata`, `reason_code`, `purchase_id`, `idempotency_key_id`). That audit is for **transactional** events: credits, debits, grants, consumes, purchases. The catalog edit ("operator changed potion price 100 → 150") is a different event class — **administrative** state mutation, not transactional event. The marketing pitch never claimed to answer administrative-state forensics. Mixing the two would be marketing-pitch drift; this decision preserves the boundary.

### Why F5 reframes `[[architecture/catalog-cac-upgrade]]`

The catalog-versioning + catalog-cac-upgrade pairing frames T3 (Configuration-as-Code) as "advanced upgrade beyond T1+T2 once customer demand surfaces." Per F5, Nakama Hiro — the wedge-tier class anchor — **skipped T1+T2 entirely and ships T3 directly** (JSON config files, `base-economy.json`, edited in operator's git repo). T3 is therefore an **alternative starting position for the indie audience**, not a "more sophisticated upgrade." This affects how `[[architecture/catalog-cac-upgrade]]`'s revisit conditions read (the stub's "build T3 when a paying customer asks for git-driven workflow" remains valid; the framing of "T3 is the maturity-end of T1+T2" doesn't).

## Engineering substance applied

- **Consistency:** RLS `tenant_isolation` policy already enforced on `currencies` / `items` / `offers` / `offer_prices` / `offer_items` per shipped migrations 0006 / 0011 / 0013 + grants 0015. Direct Drizzle CRUD inherits the tenant isolation. The `wallet_debit_by_external_id` + `item_grant_by_external_id` + `purchase_offer_by_external_id` SQL functions stay untouched — they read items + offers directly, no `draft_status` filter to add. The shipped read-and-mutate path is the contract.
- **Failure semantics:** restrict-FK delete-block is the safety net. Operator attempting catalog deletion that would orphan player state (inventory rows pointing at the item) or commerce state (offer_items pointing at the item) gets a Postgres `foreign_key_violation` (SQLSTATE 23503). Editor maps this to actionable UX per (vii). At-least-once semantics via Brandur idempotency middleware on the editor's POST/PATCH endpoints (per `[[architecture/idempotency-strategy]]` D2-α + `[[cockpit/admin-list-endpoints-contract]]` Idempotency-Key namespace discipline).
- **Concurrency:** last-write-wins on catalog edits. At wedge tier (1-2 designer-operators per organization per `[[cockpit/cockpit-shape]]` 2-person-team audience), sustained conflict rate is negligible. Solo-designer scenario: zero conflicts. Multi-designer revisit-trigger named below.
- **Observability:** OTel spans on each catalog admin endpoint (`catalog.list_items`, `catalog.create_item`, `catalog.update_item`, `catalog.delete_item`, parallel for currencies + offers + nested offer_prices/offer_items). Attrs: `bokchoy.project_id`, `bokchoy.user_id` (operator actor), `bokchoy.resource_type`, `bokchoy.resource_code`. No `catalog_audit` Postgres table; if forensics required later, triggers backfill (cascade additive).
- **Storage:** zero new tables. `items.active` column addition is the only schema change. `catalog_items` unified table and `catalog_audit` partitioned table from `[[architecture/catalog-versioning]]` (ii) + (v) do not get built at MVP.
- **Security:** adminGate per `[[architecture/admin-auth-surface]]` D2 on every catalog admin endpoint with appropriate resource/action permissions (cascade #4). No PII in catalog rows; tenancy enforced by `app.current_tenant` GUC under RLS.

## Production-grade gates

- **Idiomatic** — Drizzle direct CRUD on per-primitive tables with restrict FKs + RLS is BokChoy's existing pattern across `wallets` (slice 8.1) + `inventory` (slice 8.5-prereq) + `shop` (slice 8.6-prereq). NO platform-fighting workarounds. NO custom mutex tables. NO bespoke JSON Patch emitters. *(production-cited internal; confidence: high.)*
- **Industry-standard** — `[[architecture/.research/catalog-mutation-shape-at-indie-tier-research]]` F1 — 2 of 2 surveyed wedge-tier game-economy backends (Nakama Hiro Economy + LootLocker) ship plain CRUD with visibility flags. Tier-2 docs on both. *(production-cited × 2 at the correct audience scope; confidence: medium-high — would be high with a third indie-tier cite; AccelByte still owed as open thread #1 in the research.)*
- **First-class** — Postgres native FK restrict + RLS tenant isolation + standard SQL INSERT/UPDATE/DELETE via the app role's existing grants. No `SECURITY DEFINER` stored functions for catalog mutation (the M2 trust boundary from `[[architecture/wallet-mechanics]]` stays scoped to wallet/inventory/shop SQL functions where it's load-bearing; catalog mutation doesn't need it). *(first-class-cited; confidence: high.)*

## Rejected alternatives

### V2 — Restore `[[architecture/catalog-versioning]]` as MVP-binding; rework shipped primitives

**What:** Rebuild `items` and `offers` as rows in a unified `catalog_items` table per catalog-versioning §2. Add `draft_status` + `version` + `start_date`/`end_date` columns. Build `catalog_create_draft()` / `catalog_update_draft()` / `catalog_publish()` / `catalog_publish_bulk()` / `catalog_unpublish()` / `catalog_archive()` SQL functions per catalog-versioning §3. Revoke app role INSERT/UPDATE/DELETE on the unified table (M2). Rewrite `wallet_debit_by_external_id` / `item_grant_by_external_id` / `purchase_offer_by_external_id` SQL functions to read from `catalog_items` filtered by `draft_status = 'published' AND start_date <= NOW() AND (end_date IS NULL OR end_date > NOW())`. Build `catalog_audit` partitioned table + JSON Patch emitter.

**Wins when:** (a) a named paying customer at design partner level explicitly demands draft/published editing OR catalog audit forensics OR scheduled publish, AND (b) BokChoy's wedge has pivoted toward bigger-platform tier (Studio+ paying customers competing with PlayFab on operator features).

**Why not here:** (a) No named customer for catalog features (Q-C). The IAP-ambition stakeholder push is IAP-scoped (separate decision tree, currently blocked on stakeholder specifics, see state.md). (b) Wedge binding (Q-A) per `[[wedge-decision]]`; consistent with this session's IAP-deferral chain. Cost is multi-week rework. The 30/30 SQL smoke + HTTP curl matrix re-runs from scratch. The shipped per-primitive primitive design isn't broken — it's wedge-aligned. Reverting now would be wedge-erosion masquerading as best-practice.

### V3-narrowed — Add catalog audit log only (defer state machine + ETag)

**What:** New `catalog_audit (id, project_id, actor_id, table_name, row_id, operation, prior_state JSONB, new_state JSONB, created_at)` partitioned table. Postgres `BEFORE UPDATE/DELETE` + `AFTER INSERT` triggers on `currencies` + `items` + `offers` + `offer_prices` + `offer_items` populate it. No draft state machine, no ETag.

**Wins when:** Marketing audit-log pitch extends to catalog-edit forensics (i.e. `[[marketing/v1-shape]]` (iv) re-scopes from wallet-only to catalog-also), OR a named customer asks for change history.

**Why not here:** Q-B explicit answer — marketing pitch is wallet-transaction audit (per `[[marketing/v1-shape]]` (iv) verbatim: *"player says they didn't get their gems"*), not catalog-edit audit. F3 evidence at indie tier (LootLocker explicit `Last Changed` timestamp only with no operator identity / no content history; Hiro silent). No customer asking. **The pattern is genuinely additive later** — triggers can be added in a single migration without modifying the existing tables or SQL functions; pre-trigger edits would go uncaptured but the indie-tier-positioning makes that acceptable.

### V-CaC — Skip T1+T2 entirely, build T3 (Configuration-as-Code) at MVP per the Hiro shape

**What:** Catalog editor doesn't exist as a dashboard surface at MVP. Operators commit JSON config files (`base-economy.json` per project) to their git repo; BokChoy ships a `bokchoy catalog import` CLI that diffs + writes catalog rows. T3 from `[[architecture/catalog-cac-upgrade]]`, brought forward.

**Wins when:** First paying customer is a multi-engineer studio already running CI/CD discipline AND comfortable with git-driven config workflow (Unity GS Economy customer profile).

**Why not here:** BokChoy's wedge audience per `[[wedge-decision]]` includes solo-dev to 2-person-team studios. Forcing git discipline at MVP narrows the wedge below `[[cockpit/cockpit-shape]]`'s 2-person-team audience pick. The dashboard catalog editor (V1's MVP output) is the on-ramp for non-git-disciplined operators; T3 is an upgrade option per `[[architecture/catalog-cac-upgrade]]`'s revisit conditions. Also: the cockpit dashboard infrastructure (sign-in, projects, API keys) already shipped at slice 8.3 + 8.4 — adding the catalog editor as a sibling cockpit surface costs nothing extra in scaffold/auth/IA terms, whereas shipping CLI + import primitive + JSON file conventions + schema versioning is a separate engineering investment.

### V-strict-FK — Ship V1 but with stricter FKs (FK from `offer_items` to `items.id` AND a CHECK enforcing items active when in active offers)

**What:** Add a CHECK constraint `(item.active = true OR offer.active = false)` enforced via trigger. Closes the gap where an operator could deactivate an item that's still in an active offer.

**Wins when:** The class of "operator deactivates an item; existing active offers silently degrade" is a real failure mode observed in customer pre-launch testing.

**Why not here:** No customer pre-launch yet to observe the failure. Adding a constraint pre-emptively that the editor UX could surface as a warning ("this item is in active offers X, Y — deactivating it will keep them sellable but with broken contents") is solving a problem at the wrong layer. The editor UX layer is where this belongs at MVP; backstop migration is additive later if the editor UX proves insufficient.

## Failure mode

**Primary failure mode: stakeholder pivot toward bigger-platform tier surfaces post-MVP.** If the IAP-ambition stakeholder (state.md 2026-05-28) turns out to be pushing toward bigger-platform tier features broadly — not just IAP — V1's wedge-binding stance becomes brittle. Probability: medium. Cost: medium (rework toward V2 is possible additively for state machine + ETag; rework for unified `catalog_items` table is the bigger lift).

**Secondary failure mode: editor UX surfacing of restrict-FK delete-block is implemented as a generic 422.** If Slice 8.5 implementation skips (vii) and shows operators a raw Postgres constraint name instead of *"this item is in offers X, Y, Z; remove from offers first"*, the operator hits a dead-end UX. Probability: medium during initial Slice 8.5 implementation. Cost: low — fixed in the editor handler by enumerating referencing rows in the error response.

**Tertiary failure mode: post-launch regulatory ask for catalog edit forensics.** Pre-launch and pre-trigger-installation catalog edits go uncaptured. Cost: high if it happens, low probability for F2P indie tier per `[[wedge-decision]]` regulatory analysis in `[[architecture/audit-retention-research]]` (no surveyed regulator imposes a catalog-edit retention floor on F2P virtual currency).

**Quaternary failure mode: multi-designer customer pre-launch.** First paying customer ships with 3+ designer-operators concurrently editing the catalog → sustained ETag-like conflicts surface (last-write-wins clobbers prior edits). Probability: low at MVP scope (1-2 designer-operator audience per `[[cockpit/cockpit-shape]]`). Cost: medium — ETag `version` column + handler check is additive.

## Mitigations

- **Primary failure mode** (stakeholder pivot): the catalog-versioning entry stays vaulted as the upgrade-tier reference; if pivot occurs, the V2 path is documented and ready. Maximum cost = retrace the catalog-versioning entry's existing decisions, not redesign from scratch.
- **Secondary** (editor restrict-FK UX): per (vii) — Slice 8.5 implementation MUST include the enumerate-referencing-rows pattern. Cascade obligation #5 below names this as a non-deferrable Slice 8.5 acceptance gate.
- **Tertiary** (regulatory forensics): triggers can be installed as a single forward migration; pre-trigger edits go uncaptured, which is the accepted indie-tier-positioning cost.
- **Quaternary** (multi-designer): revisit-trigger named below; ETag `version` column + handler check is a one-migration + handler addition.

## Idiom citations

- `[[architecture/wallet-mechanics]]` M2 stored-function-only-interface — **scoped to wallet+inventory+shop SQL functions only**, NOT extended to catalog mutation per this decision. M2 is load-bearing where unauthorized direct UPDATE could violate ledger conservation invariants; it is NOT load-bearing for catalog (operator-controlled state with no conservation invariant).
- `[[cockpit/admin-list-endpoints-contract]]` (R2 / Pa-none / A1 / E2 / Disc-no / Pref-raw) — the 6 convention picks inherit to the catalog-admin endpoints contract (cascade #4 below).
- `[[architecture/.research/catalog-mutation-shape-at-indie-tier-research]]` F1+F2+F3+F4+F5 — the load-bearing evidence chain.
- `[[wedge-decision]]` — wedge-binding constraint (Q-A).
- `[[marketing/v1-shape]]` (iv) — wallet-audit-not-catalog-audit marketing scope (Q-B).

## Revisit when

- **Paying customer asks for catalog change history.** → Add `catalog_audit` partitioned table + Postgres triggers on items/offers/currencies/offer_prices/offer_items per the V3-narrowed shape. NO schema rework on existing tables. NO M2 stored-function-only interface required (the trigger pattern doesn't need it). Cost: ~1 migration, ~half-day editor UX work.
- **Paying customer asks for draft/published editing workflow.** → Add `draft_status` enum column on `items` and `offers` (additive). Add transition functions `item_publish()` / `offer_publish()` / `..unpublish()` / `..archive()` (additive). Update existing read paths (`wallet_debit_by_external_id` / `item_grant_by_external_id` / `purchase_offer_by_external_id`) to filter by `draft_status = 'published'`. Cost: ~2 migrations, ~1 week SQL function rework, re-run smoke.
- **Multi-designer concurrent edit pressure manifests** (sustained edit-clobber reports from a paying customer). → Add `version BIGINT NOT NULL DEFAULT 0` ETag column on `items` + `offers`. Handler check + 412 Precondition Failed on mismatch. Cost: ~1 migration, ~half-day handler work, ~half-day editor UX (re-fetch + re-apply).
- **Stakeholder pivot away from indie wedge.** → Re-open Q-A. If wedge is no longer binding, V2 becomes defensible. `[[architecture/catalog-versioning]]`'s 2026-05-02 design is the path forward; the work is execution of the already-vaulted shape.
- **Regulatory or contractual catalog-edit retention requirement surfaces** for a paying customer or jurisdiction. → V3-narrowed audit-log addition + retention policy per `[[architecture/audit-retention-research]]` shape. Pre-trigger edits uncaptured; accepted gap.
- **AccelByte 3rd-indie-cite open thread closes against V1** (i.e. AccelByte indie tier turns out to ship draft/published) → re-weight F1 evidence; if 3/3 wedge-tier converges on heavyweight, V3-narrowed becomes defensible.

## Cascade obligations

1. **`[[architecture/catalog-versioning]]` amendment 2026-05-28** — add Amendment block at top: scope T1+T2 + M2 to upgrade-tier-not-MVP per this decision + `[[architecture/.research/catalog-mutation-shape-at-indie-tier-research]]` F1+F3+F4. Downgrade confidence from `high` to `medium` (high evidence on bigger-platform tier; LOW evidence on wedge-tier MVP claim, which is now superseded for MVP by this entry). The entry remains the canonical reference for the upgrade-tier shape.
2. **`[[architecture/catalog-cac-upgrade]]` amendment 2026-05-28** — add F5 reframing block: T3 is an alternative starting position for the indie audience (Hiro shape), not "upgrade beyond T1+T2." Revisit conditions in the stub remain valid.
3. **`[[cockpit/cockpit-shape]]` (M2) amendment 2026-05-28** — replace catalog editor scope "currencies, items, shops, bundles, loot tables" → "currencies, items, offers" (3 primitives). Drop the slice 8.5 reference *"catalog editor CRUD via M2 stored-functions per `[[catalog-versioning]]`"*; replace with *"plain CRUD per `[[catalog-mutation-mvp-shape]]`"*. Loot tables stay deferred (no Hiro-class loot primitive shipped or designed; F5 says T3-style config-as-code is the future-shape if a customer asks).
4. **New `[[cockpit/admin-catalog-endpoints-contract]]` entry owed** (next /design pass) — endpoints for currencies CRUD + items CRUD + offers CRUD with nested offer_prices/offer_items per (E2) split-POST pattern. Convention picks inherit from `[[cockpit/admin-list-endpoints-contract]]`. The BC093 activation invariant per (vi) is a contract-level concern (the offer-publish endpoint validates `≥1 offer_items AND ≥1 offer_prices` before allowing `active=true`).
5. **Slice 8.5 implementation cascade** (when /implementation activates):
   - Migration adding `items.active BOOLEAN NOT NULL DEFAULT TRUE` column (per (ii)). Existing rows backfill to `TRUE`.
   - 3 cockpit modules: `apps/cockpit/modules/catalog/{currencies,items,offers}/` per `[[cockpit/file-structure]]` Cal.com pattern.
   - shadcn `<Field>` + RHF `<Controller>` form composition per `[[cockpit/shadcn-setup]]` 2026-05-12 Amendment.
   - BC093 invariant client-side gate per (vi) — block save when toggling `offer.active=true` with `offer_items.length === 0 || offer_prices.length === 0`. Show inline guidance.
   - Restrict-FK delete-block UX per (vii) — handler enumerates referencing rows; editor renders as actionable error: *"`<resource>` is referenced by `<list>`; remove these first."*
   - OTel spans per *Engineering substance applied*.

## Open threads (carried from `[[architecture/.research/catalog-mutation-shape-at-indie-tier-research]]`)

1. AccelByte 3rd indie cite — strengthen F1.
2. PlayFab catalog-state ETag verification.
3. Talo OSS indie backend — additional supporting cite.
4. Unity GS + Beamable free-tier shape — verify they ship heavyweight at indie tier or only paid.
5. PlayFab free-vs-paid Draft/Published gating.
6. Postgres-trigger audit pattern proof of concept for the V3-narrowed revisit path (when triggered).
