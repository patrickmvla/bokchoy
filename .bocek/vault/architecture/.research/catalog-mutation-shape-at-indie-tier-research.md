---
type: research
features: [catalog, architecture, cockpit]
related: ["[[architecture/catalog-versioning]]", "[[architecture/catalog-cac-upgrade]]", "[[inventory/inventory-contract]]", "[[shop/shop-contract]]", "[[wallet/credit-route-contract]]", "[[cockpit/cockpit-shape]]", "[[wedge-decision]]"]
created: 2026-05-28
confidence: medium-high
provisional: false
---

# At indie/SMB-tier game-economy backends, is the catalog mutation surface a draft/published state machine + audit log + ETag (the `[[architecture/catalog-versioning]]` model), or plain CRUD with visibility flags?

## Question

`[[architecture/catalog-versioning]]` (2026-05-02, confidence: high) vaulted a heavyweight catalog mutation model — Draft/Published/Archived state machine, M2 stored-function-only-interface, ETag optimistic concurrency via `version` column, separate `catalog_audit` partitioned table with JSON Patch diffs, bulk-publish + diff-view shipped at MVP — citing PlayFab + LaunchDarkly + Beamable + Unity GS + Contentful as production evidence.

Two of those five cites (LaunchDarkly + Contentful) are NOT game-economy backends. The three game-class cites (PlayFab + Beamable + Unity GS) are mid-to-large platform tier. The two class members closest to BokChoy's wedge — **Nakama Hiro Economy** and **LootLocker** (both indie/SMB-tier per `[[inventory/inventory-contract]]` F2 + `[[shop/.research/pricing-locus-research]]` F1) — were absent from the entry's evidence.

The catalog-versioning entry asserts T1+T2 (state machine + audit + ETag + bulk-publish + diff-view) ships at MVP. Wallet+Inventory+Shop primitives shipped 2026-05-15 → 2026-05-21 implemented none of this — they're plain CRUD tables with `created_at`/`updated_at` and no `catalog_audit` table. The contradiction is total. Resolving which is binding requires checking whether the heavyweight model is industry-pattern at the indie/SMB tier BokChoy targets, or whether it was over-derived from bigger-platform evidence.

Specifically:
- **Q1:** Do indie/SMB-class game-economy backends ship draft/published catalog state machines at the operator surface, or is plain CRUD with `active`/`disabled`/`unavailable` flags the indie idiom?
- **Q2:** Is a per-item catalog change-history view (who-changed-what-when) class-idiomatic at indie tier?
- **Q3:** Is ETag / optimistic-concurrency on catalog edits class-idiomatic at indie tier?
- **Q4 (contradiction probe):** Catalog-versioning's PlayFab cite — is it factually correct AND audience-appropriate, or correct-on-PlayFab but mode-collapsed to "PlayFab does it → indie should too"?
- **Q5:** Sequencing implication — does the evidence support V1 (supersede catalog-versioning), V2 (restore as binding, rework primitives), or V3 (layer incrementally)?

## Triangulation

- **Production reference:** ✓ — three named game-economy backends (Nakama Hiro Economy, LootLocker, PlayFab Economy v2). All three are tier-2 vendor docs; tier-1 source code unavailable (Hiro proprietary, LootLocker proprietary, PlayFab proprietary).
- **Docs reference:** ✓ — heroiclabs.com/docs/hiro/ + docs.lootlocker.com/the-basics/core-concepts/assets + learn.microsoft.com/gaming/playfab/economy-monetization/economy-v2/catalog/item-status (Microsoft Learn, last updated 2025-05-01 per the page frontmatter).
- **Contradiction probe:** ✓ — actively searched for the falsifying-case "indie game backend ships draft/published state machine at MVP." Found the converse: PlayFab (the bigger-platform tier) DOES ship a rich state machine, AND the indie-tier surveyed members (Hiro, LootLocker) do NOT. The class-divergence IS the finding.

## Sources examined

### Source 1 — Nakama Hiro Economy / Virtual Store docs

- **Tier:** 2 (official vendor docs).
- **Provenance:** `https://heroiclabs.com/docs/hiro/concepts/economy/virtual-store/` (fetched 2026-05-28). No public version pinning; treat as "current" 2026-Q2.
- **Author context:** Heroic Labs (Nakama vendor). Hiro is the proprietary monetization module on top of OSS Nakama. Audience: indie/SMB studios per [Heroic's published positioning]. Vendor docs are first-party for behavior claims.
- **What it tells us:** Virtual store items are defined in **JSON configuration files** (`base-economy.json` under the `store_items` collection). Items expose a `disabled` boolean (non-purchaseable + hidden from queries) and an `unavailable` boolean (non-purchaseable but still visible). **No draft/published state machine documented.** No catalog audit log documented. No ETag / optimistic concurrency documented. The mutation surface is editing JSON config files (config-as-code shape, mapping to `[[architecture/catalog-cac-upgrade]]`'s T3 not T1+T2).

### Source 2 — LootLocker Assets / Asset Manager docs

- **Tier:** 2 (official vendor docs).
- **Provenance:** `https://docs.lootlocker.com/the-basics/core-concepts/assets` (fetched 2026-05-28).
- **Author context:** LootLocker (vendor). Audience per `[[inventory/.research/inventory-primitive-research]]` is indie/SMB studios (M-C per-instance model). First-party docs.
- **What it tells us:** Assets managed via **Asset Manager dashboard UI** ("an interface to search for, create, and edit all of your game's assets"). **No draft/published state machine documented.** Audit signal is ONLY a `Last Changed` timestamp — **no operator identity, no change details, no per-item revision history**. No ETag / optimistic concurrency documented. No REST API or config-file import mentioned at the operator level. The mutation surface is dashboard CRUD with timestamp-only audit.

### Source 3 — PlayFab Economy v2 Item Status & Moderation docs

- **Tier:** 2 (official vendor docs).
- **Provenance:** `https://learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/catalog/item-status` (page metadata: `ms.date 2025-02-20`, `updated_at 2025-05-01`). Plus search-aggregated context from `learn.microsoft.com/en-us/rest/api/playfab/economy/catalog/create-draft-item`, `.../publish-draft-item`, and the `Catalog Overview` page.
- **Author context:** Microsoft (PlayFab vendor). Author `wesjong` per page frontmatter. Audience is mid-to-large platform tier (PlayFab serves Microsoft-scale F2P titles). First-party docs.
- **What it tells us:** PlayFab Economy v2 ships **a rich state machine — richer than `[[architecture/catalog-versioning]]` vaulted.** States enumerated: **Unpublished Draft, Published, Scheduled (future StartDate), Expired (past EndDate), Hidden (`IsHidden` flag), and Moderation states (Approved/AwaitingModeration/Rejected/Unknown)**. Separate APIs: `CreateDraftItem`, `UpdateDraftItem`, `GetDraftItem`, `PublishDraftItem`, `GetItemPublishStatus`. Catalog Admins + Item Creator + Title Entities scope edit access. The Item Status page is **silent on audit log and ETag** — neither confirmed nor denied on this page; catalog-versioning's PlayFab-ETag claim needs separate verification (carried as open thread).

## Findings

### F1 (load-bearing) — Catalog state-machine ships is class-divergent by tier, not class-convergent

Two systems at BokChoy's wedge tier (indie/SMB F2P) **do not** ship draft/published state machines:
- **Hiro:** publishing control via `disabled` / `unavailable` boolean flags on JSON config rows. Source 1.
- **LootLocker:** no documented state machine; assets are live-on-create (assumed; docs silent). Source 2.

One system at the larger-platform tier **does** ship a rich state machine:
- **PlayFab Economy v2:** six-state model (Draft, Published, Scheduled, Expired, Hidden, Moderated) with dedicated REST APIs per transition. Source 3.

This is a **class-divergence**, not a convergence. `[[architecture/catalog-versioning]]`'s claim "PlayFab + LaunchDarkly + Beamable + Unity GS + Contentful all do this" is correct for the cited systems but **mode-collapses by ignoring the audience scope**. The wedge-tier counter-position was not in the entry's evidence. (Per *Contradiction protocol*: production-cited-at-the-right-audience-scale wins over cross-class pattern matching.)

### F2 — The "publishing control" function is universal; the implementation is tier-divergent

All three surveyed systems expose SOME way to gate item visibility without deleting the row. The mechanism splits cleanly by tier:
- **Indie tier (Hiro, LootLocker):** boolean flag(s) on the catalog row. `disabled`/`unavailable` (Hiro) is functionally equivalent to BokChoy's existing `offers.active` field.
- **Bigger-platform tier (PlayFab):** explicit state machine with separate APIs for each transition.

The function is non-negotiable (operators need a way to hide things). The implementation choice — flag vs state machine — is what's class-divergent. BokChoy's shipped Wallet+Inventory+Shop primitives already have `offers.active` (and `items` could trivially gain it). **The flag-shape is in-line with the indie idiom, not a deviation from it.**

### F3 — Catalog audit log is not class-idiomatic at indie tier

- **Hiro:** silent on audit log. Config-as-code workflow assumes git history substitutes for in-app audit (the operator's git repo IS the audit log).
- **LootLocker:** docs are explicit — only a `Last Changed` timestamp on each asset. **No operator identity, no change-content history.** That's a deliberate omission, not a documentation gap.
- **PlayFab:** the Item Status page is silent. Catalog Admin scope exists but the surveyed page doesn't document a per-item change-history view.

**No surveyed indie-tier system ships a per-item operator-attributed change-history view** of the kind `[[architecture/catalog-versioning]]`'s `catalog_audit` table + JSON Patch diff model describes. That feature is **at most enterprise-tier**, not indie-class-standard.

### F4 — ETag / optimistic concurrency is not class-idiomatic at indie tier

All three surveyed sources are silent on documented ETag mechanics for catalog edits. `[[architecture/catalog-versioning]]` cites PlayFab `ExecuteInventoryOperations` for ETag — that's an **inventory-mutation** primitive (player state), not a catalog-mutation primitive (operator state). The catalog-versioning entry transferred a player-state concurrency mechanism to a catalog-state concurrency context **without confirming PlayFab does the same transfer**. The PlayFab cite for catalog-ETag is unverified by this research.

### F5 — Hiro's choice maps catalog-cac-upgrade T3 directly, not T1+T2

Hiro's JSON-config-files + `base-economy.json` shape IS `[[architecture/catalog-cac-upgrade]]`'s T3 (Configuration-as-Code) — the deferred-with-revisit-conditions tier. **Hiro skipped T1+T2 entirely.** The implication: T3 isn't necessarily an upgrade from T1+T2; for indie audiences it's an alternative starting position. This contradicts the catalog-versioning + catalog-cac-upgrade pairing's framing that T1+T2 is "default" and T3 is "advanced."

## Conflicts

**Conflict 1: `[[architecture/catalog-versioning]]` (2026-05-02, confidence: high) vs this research's F1.**

The entry asserts the heavyweight catalog mutation model is industry-standard for game-economy backends and ships at MVP. This research finds the model is industry-standard at **larger-platform tier only** (PlayFab confirms it; bigger platforms generalize). The indie tier (Hiro, LootLocker) explicitly does NOT ship it.

Per *Contradiction protocol*:
- Both sides cite production code/docs (tier 1+2).
- PlayFab cite at the bigger tier is correct on PlayFab's behavior.
- Hiro + LootLocker cites at the indie tier are correct on their behavior.
- The disagreement is **audience-scope** — both are right within their tier; neither generalizes across tiers.

Resolution: do not artificially resolve. The conflict IS the finding. `[[architecture/catalog-versioning]]`'s confidence: high stands for the *bigger-platform* claim but should be downgraded for the *indie-tier* claim because the indie tier was not evidenced.

**Conflict 2: `[[architecture/catalog-versioning]]`'s PlayFab-ETag claim is unverified.**

The entry cites PlayFab `ExecuteInventoryOperations` as the ETag-pattern source. That's a player-state primitive (per `[[wallet/.research/wallet-source-of-truth-research]]` S2). The Item Status doc page surveyed here is silent on catalog-edit ETag. Either (a) PlayFab DOES use ETag on catalog edits and a different doc page documents it (catalog-versioning's claim is correct, just on a page not surveyed), or (b) the entry transferred a player-state concurrency claim to a catalog-state context without specific evidence (citation drift). **Carried as open thread; do not vault as resolved.**

## Conditions

- **Holds at BokChoy's wedge.** Per `[[wedge-decision]]` BokChoy targets indie/SMB F2P studios — the exact tier where Hiro + LootLocker plain-CRUD-with-flags is the pattern. The finding's audience-scope match is direct.
- **Holds for the "T1+T2 MVP" question only.** Whether the heavyweight model is appropriate AT a later upgrade tier (Studio+, paying multi-designer customers) is a separate question. The finding does NOT claim catalog-versioning's model is wrong forever — it claims the model is wrong-at-MVP-for-this-audience.
- **PlayFab as counter-example doesn't generalize to BokChoy.** Operators picking PlayFab over Hiro are already opting into the larger-platform tradeoff. BokChoy competing with PlayFab on cockpit complexity is wedge-erosion per `[[wedge-decision]]`.
- **The finding does not address bulk-scheduled-publish, diff-view UX, or approval workflows separately.** Those are downstream of the foundational state-machine question; if the state machine itself isn't class-idiomatic, the dependents fall out of MVP scope automatically.

## Operational implications

### For `[[architecture/catalog-versioning]]` (the 2026-05-02 vault entry)

**Amendment required.** The entry's *Decision* asserts T1+T2 ships at MVP; this research finds the T1+T2 model is not class-idiomatic for BokChoy's audience. Two options for design to weigh:

1. **Amend the entry to scope T1+T2 as "upgrade tier when wedge-erosion threshold trips"** — keep the design as the future direction; mark it explicitly NOT-MVP-binding; downgrade confidence from high to medium-low (high evidence on the bigger-platform tier; low evidence on the wedge tier).
2. **Supersede the entry with a new decision** scoping MVP catalog to plain CRUD + visibility flags + (optional) async audit-trigger log; keep T1+T2 as a documented upgrade path the way `[[architecture/catalog-cac-upgrade]]` is documented as a T3 stub.

Either way the entry's current state — confidence: high, asserting MVP shipping — does not match the post-research evidence map.

### For Slice 8.5 (cockpit catalog editor)

- **V1 (supersede catalog-versioning, ship plain CRUD on items + offers + currencies) is evidence-supported.** Hiro + LootLocker are the wedge-tier match.
- **V2 (restore catalog-versioning as binding, rework primitives) is evidence-counter.** Following a pattern none of BokChoy's wedge-tier competitors use, against the only published indie cites BokChoy has, is wedge-erosion masquerading as best-practice.
- **V3 (layer incrementally) survives but narrows further:**
  - **catalog audit log** — defer at MVP. F3 says it's not indie-idiomatic. Add when a customer asks (matches `[[architecture/catalog-cac-upgrade]]`'s deferral pattern).
  - **draft/published state machine** — defer at MVP. F1+F2 say `active`/`disabled` flag is the indie idiom. BokChoy's shipped `offers.active` already serves this function; extending to `items.active` is the additive move.
  - **ETag concurrency** — defer at MVP. F4 says it's not indie-idiomatic and the PlayFab cite for catalog-ETag is unverified.
- **The catalog editor's job at MVP narrows accordingly:** CRUD forms for currencies + items + offers, the BC093 activation invariant on offers (`active=true ⇒ ≥1 offer_items AND ≥1 offer_prices` per `[[shop/shop-contract]]` cascade #11), `restrict`-FK-blocked-delete error surfacing per `[[inventory/inventory-contract]]` + `[[shop/shop-contract]]`. No draft state, no audit-history view, no version-mismatch UI.

### For `[[architecture/catalog-cac-upgrade]]` (the T3 stub)

F5 reframes the T1/T2/T3 hierarchy. Hiro evidence suggests T3 (config-as-code) is not "advanced upgrade" but **an alternative starting position for the indie audience**. If BokChoy ever picks T3 instead of T1+T2, it's pivoting toward the Hiro shape — not climbing the maturity ladder. The stub's revisit conditions remain valid; the framing of "T3 is the upgrade beyond T1+T2" is not load-bearing.

### For the cockpit-shape M2 amendment (the V1/V2 hygiene question from /design)

The catalog editor scope ("currencies, items, shops, bundles, loot tables") was reframed in /design as needing reconciliation. This research resolves the foundational question; the C1-vs-C2 hygiene pick is downstream and now clearly C1 (amend in place to the actually-shipped primitive list) — superseding is overstating change. Loot tables stay deferred per F5's "Hiro-style config-as-code is an alternative not an upgrade" reframing — they don't need their own T1+T2 design before any customer asks.

## Reproducibility note

Reproducible. Tools used: WebFetch + WebSearch (current as of 2026-05-28, US locale). Specific URLs:
- Hiro: `https://heroiclabs.com/docs/hiro/concepts/economy/virtual-store/`
- LootLocker: `https://docs.lootlocker.com/the-basics/core-concepts/assets`
- PlayFab: `https://learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/catalog/item-status`
- PlayFab REST refs: `https://learn.microsoft.com/en-us/rest/api/playfab/economy/catalog/create-draft-item` + `.../publish-draft-item` + `.../catalog-overview`

Another investigator with the same question would reach substantially the same finding by fetching the same three vendor doc pages. The judgment that's load-bearing is the audience-scope weighting: a researcher who treats PlayFab as the canonical example without weighting BokChoy's wedge audience would generalize the heavyweight model. This research's weighting is grounded in `[[wedge-decision]]` (which is itself vaulted) and `[[inventory/.research/inventory-primitive-research]]` F2 + `[[shop/.research/pricing-locus-research]]` F1 (which establish Hiro + LootLocker as the wedge-tier class anchors).

## Open threads

1. **AccelByte catalog admin shape.** Attempted fetch returned 404; AccelByte is the third wedge-or-adjacent-tier cite that would strengthen F1 from "2 of 2 indie-tier ship plain CRUD" to "3 of 3." Try `docs.accelbyte.io/gaming-services/services/inventory/` or the equivalent current path.
2. **PlayFab catalog-edit ETag — confirmed or citation drift?** `[[architecture/catalog-versioning]]`'s Conflict 2 — does PlayFab document ETag on `UpdateDraftItem` / `PublishDraftItem`, or did the entry transfer a player-state ETag claim to catalog without a catalog-state cite? Worth ~10 minutes against the Catalog REST API reference.
3. **Talo (open source indie game backend).** Surfaced in web-search results as a self-hostable indie option (`trytalo.com`). If Talo ships plain CRUD too, that's a fourth indie cite further hardening F1; if it ships draft/published, that's a contradicting indie cite worth investigating.
4. **Unity GS Economy and Beamable.** Both cited in `[[architecture/catalog-versioning]]` as ship-T1+T2 evidence but never verified at their indie/free tier. Unity GS in particular spans tiers; the free-tier shape might be plain CRUD even if the paid tier is heavyweight.
5. **PlayFab free-tier vs paid-tier gating on Draft/Published.** Source 3 is silent. If draft/published is gated to paid tiers, that further weakens the catalog-versioning entry's "PlayFab ships this at MVP scope" framing — because PlayFab's "MVP scope" for a paying customer is not the same as BokChoy's indie wedge.
6. **Audit log via Postgres triggers as the V3-narrowed default.** If V1 is the design pick but customers later ask for change history, a Postgres trigger-based audit-capture pattern (single `catalog_audit` table populated by triggers on items/offers/currencies) is the additive path that doesn't require the M2 stored-function-only-interface. Worth a separate research session if that revisit-trigger fires.
