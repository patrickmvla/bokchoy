---
type: research
features: [design-doc-audit]
related: ["[[design-claims-register]]", "[[landscape-survey]]"]
created: 2026-04-30
confidence: high
provisional: false
---

# Is "designer-first live-ops cockpit" an unfilled gap in named-incumbent coverage?

Resolves **CL-007** in [[design-claims-register]].

## Question

DESIGN.md §8 lists 9 live-ops cockpit dimensions as the wedge ("Domain 2 — Live-ops cockpit (UX moat)"): visual catalog editor, offer builder, A/B testing framework, segment manager, live-ops calendar, player inspector, compensation tooling, VIP/whale tooling, catalog diff & approval. The claim is that this is a category-creating gap: incumbents *do not* ship this depth. CL-007 asks: is that true today (April 2026) for the named incumbents in [[landscape-survey]] §1 — PlayFab Economy v2, Unity Gaming Services Economy, Beamable, Metaplay, Balancy?

## Triangulation

- **Production reference:** ✓ — PlayFab Economy v2 docs (Microsoft Learn, doc updated 2026-04-15), Unity GS Economy docs, Metaplay LiveOps Dashboard docs, Beamable LiveOps Portal docs + marketing pages, Balancy LiveOps Suite page. PlayFab samples on GitHub (PlayFab/PlayFab releases) and Unity samples (Unity-Technologies/com.unity.services.samples) confirm dashboard surfaces are actively maintained.
- **Docs reference:** ✓ — current vendor docs across 5 named systems, version-pinned where possible. PlayFab Economy v2 GA confirmed; Beamable Venus release confirmed (2025); Metaplay 2026 banner copy live.
- **Contradiction probe:** ✓ — actively searched for the strongest *defense* of the DESIGN.md gap claim (i.e. evidence that incumbents are bad at this). Found: AccelByte's October 2025 blog *"Why Studios Are Re-Evaluating PlayFab"* and adjacent Medium article *"The Silent Sunset of PlayFab"* (referenced in search synthesis, not direct-verified). These criticize PlayFab UX/docs as a whole, not specifically the economy live-ops cockpit. So the contradiction supports a *narrower* form of the claim ("PlayFab specifically has UX problems") but does not rescue the broader "category-creating gap" framing.

## Sources examined

### Source 1 — PlayFab Economy v2 overview (Microsoft Learn)
- **Tier:** 2 (official docs)
- **Provenance:** `learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/overview`, updated 2026-04-15, GA status.
- **Author context:** Microsoft / PlayFab product team. Authored doc, current.
- **What it tells us:** Economy v2 GA. Native primitives include: catalog with metadata + content + custom search + localization, **draft states with policy permissions for "catalog admins and reviewers"** (catalog approval workflow), **future start dates** (scheduled publish), **bundle items**, **targeted offers with segment-exclusive stores and dynamic pricing**, optimistic concurrency via ETags, fraud prevention. Several v1 features (drop tables, recharge rates, native trading) were *removed* in v2 and require Azure Functions custom logic.

### Source 2 — PlayFab Targeted Offers walkthrough
- **Tier:** 2 (official docs)
- **Provenance:** `learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/player-segmented-monetization/targeted-offers`, doc updated 2025-05-01.
- **Author context:** Microsoft / PlayFab product team.
- **What it tells us:** Game Manager has visual flows for: **segment creation** (predicates including statistic value, churn risk, last sign-in date, virtual currency balance, location), **store creation linked to segments**, **per-player segment inspector** (Build > Players > Segments tab). Concrete walkthrough creates a "Pizzas eaten > 10" segment, attaches a segment-exclusive store, verifies player membership. Examples explicitly include *churn-risk-based offers* and *event-based scheduled inventory grants*.

### Source 3 — Unity GS Economy + Game Overrides
- **Tier:** 2 (official docs)
- **Provenance:** `docs.unity.com/ugs/manual/economy/manual` + `docs.unity.com/en-us/services/solutions/ab-test` + `docs.unity.com/ugs/en-us/manual/game-overrides/manual/ab-testing`, current.
- **Author context:** Unity product team.
- **What it tells us:** Configuration panel for currencies, inventory items, virtual purchases, real-money purchases, custom data. **A/B testing as a separate "Game Overrides" product** — full reporting tab, segmentation, time-window views (today / 7d / 14d / 30d / quarter). Sample project: A/B Test on Game Difficulty. Catalog versioning / approval / live-ops calendar / player inspector / mail / VIP tooling **not explicit** on the Economy page itself — those live in adjacent UGS surfaces.

### Source 4 — Metaplay LiveOps Dashboard intro + LiveOps marketing page
- **Tier:** 2 (official docs) + 4 (vendor marketing)
- **Provenance:** `docs.metaplay.io/liveops-dashboard/introduction-to-the-liveops-dashboard` + `metaplay.io/liveops` + `metaplay.io/mobile-f2p`, current.
- **Author context:** Metaplay product team. Customer list includes Supercell, Trailmix, Lessmore Games, Metacore, Superbloom, Playsome.
- **What it tells us:** Explicit features list: **event scheduling**, **player segments by any attribute or behavior**, **A/B testing with statistical controls**, **in-game offers / bundles / promotions**, **economy tuning without code**, **OTA config updates**, **content calendar**, **localization**, **broadcast messages with attachments**. Dashboard intro page additionally calls out: **game config diffing** ("compare a config build with the currently active one"), **player state inspector** (search, filter, sort, audit history), **mails + broadcasts with attachments**. **Not** mobile-F2P-only despite the URL — they explicitly support live-service / multiplayer / cross-platform. **No engine restrictions** stated.

### Source 5 — Beamable LiveOps Portal (Venus 2025) + features + Portal docs
- **Tier:** 2 (docs) + 4 (marketing)
- **Provenance:** `docs.beamable.com/docs/portal` + `beamable.com/why-beamable/live-ops-portal` + `beamable.com/features` + `beamable.com/blog/hello-beamable-venus`, current.
- **Author context:** Beamable product team.
- **What it tells us:** Portal sections: **Announcements, Campaigns, Cloud Data, Groups, In-App Purchases, Inventory, Leaderboards, Players, Stats, Tournaments, Notify All Players**. "Why Beamable" page adds: **production build automation, integrated analytics, content scheduling for events / offers / messages / campaigns, commerce controls, player support tools (look up player info, fix inventory, grant items, in-game mail)**. Venus release (2025) added **Web SDK** + **major Unreal enhancements** — Beamable is *not* Unity-only as the survey assumed. A/B testing claimed in features page; offer builder / catalog versioning / segment manager / live-ops calendar / VIP tooling **not explicit** on Portal docs page.

### Source 6 — Balancy LiveOps Suite
- **Tier:** 4 (vendor marketing) + reference to docs at `en.docs.balancy.dev` + `en.docsv2.balancy.dev`
- **Provenance:** `balancy.co/liveops-suite/`, current. Founders ex-Wargaming / Nexters / AppsFlyer / Miro, Y Combinator alumni. Customer: Kwalee.
- **Author context:** Balancy product team. Mobile-leaning; published direct competitive positioning.
- **What it tells us:** Explicit: **calendar dashboard** ("calendar overview of planned activities and real-time insights"), **A/B testing on any element**, **in-game events ("two clicks")**, **push notifications**, **segmentation by lifecycle and profile**, **LiveOps features** (battle passes, loot boxes, daily rewards). **Not** explicit on this page: catalog versioning, player inspector, compensation tooling, VIP/whale tooling. Survey 01 separately notes Git-like CMS for economy/balance — that depth lives in CMS docs.

### Source 7 — AccelByte critique of PlayFab
- **Tier:** 4 (engineering blog with named author / commercial competitor)
- **Provenance:** `accelbyte.io/blog/why-studios-are-re-evaluating-playfab-and-how-accelbyte-compares`, published 2025-10-08.
- **Author context:** AccelByte product marketing. Named PlayFab competitor — biased source, but the *specific* criticisms are concrete and verifiable against PlayFab's own docs.
- **What it tells us:** Specific PlayFab pain points cited: *"Documentation keeps pointing us toward features that don't work"*, deprecated features without doc indication, *"Debugging is like working in the dark"* (minimal logs), *"Lobby system feels broken"* (stateless / read-only), *"Linux server support gaps forcing expensive Windows alternatives"*, fragmented matchmaking with version incompatibilities, analytics that *"handcuff"* personalized strategies. **Note:** none of these criticisms are *specifically* about the live-ops cockpit dimensions BokChoy claims as wedge. They are about PlayFab's broader BaaS quality.

### Source 8 — Search synthesis on "in-house economy backend" reasons
- **Tier:** 4–6 (synthesis across multiple BaaS-vs-custom posts)
- **Provenance:** Multiple posts on `medium.com`, `merixstudio.com`, `dev.to`, `appwrite.io` returned in WebSearch.
- **Author context:** Mix of generalist B2B-SaaS commentary; *not* game-industry-specific. Treat as weak signal on the specific question.
- **What it tells us:** General build-vs-buy advocacy for custom backends, citing: control / customization, long-term cost, data-control, competitive advantage. **Did not surface** game-industry-specific evidence that mid-core F2P studios reinvent economy primitives because BaaS modules are inadequate. The DESIGN.md §3 claim ("Studios reinvent wallet/inventory/shop/loot from scratch and most do it badly") is **not supported by the surface evidence available** — it's CL-008 in the register and needs its own research entry. **Open thread.**

## Findings

### The 9 cockpit dimensions × 5 incumbents — current state

| # | Dimension | PlayFab v2 | Unity GS | Beamable | Metaplay | Balancy | Coverage |
|---:|---|---|---|---|---|---|---|
| 1 | Visual catalog editor | ✓ Game Manager | ✓ Configuration Panel | ✓ Inventory / IAP sections | ✓ Dashboard | ✓ CMS | **5/5** |
| 2 | Catalog versioning / approval | ✓ draft states + reviewer perms + future start | △ publication step | △ content promotion | ✓ config diffing | ✓ remote settings | **3/5 + 2 partial** |
| 3 | A/B testing framework | ✓ docs + segments | ✓ Game Overrides w/ reporting | ✓ in features page | ✓ "with statistical controls" | ✓ "any element" | **5/5** |
| 4 | Segment manager | ✓ Advanced Segmentation w/ rich predicates | ✓ via Game Overrides | ✓ Stats / Groups | ✓ "any attribute or behavior" | ✓ lifecycle + profile | **5/5** |
| 5 | Live-ops calendar / scheduling | ✓ scheduled tasks + event-based offers | △ less explicit | ✓ Content Scheduling + Campaigns | ✓ Content calendar + LiveOps Timeline | ✓ Calendar dashboard | **4/5 + 1 partial** |
| 6 | Player inspector | ✓ Game Manager > Players > Segments | △ less explicit | ✓ Player Support Tools (lookup, fix inv, grant items) | ✓ complete state + audit history | △ less explicit | **3/5 + 2 partial** |
| 7 | Compensation / mail / broadcast | ✓ scheduled inventory actions + targeted offers | △ less explicit | ✓ in-game mail + announcements + Notify All | ✓ mails + broadcasts w/ attachments | ✓ push notifications | **4/5 + 1 partial** |
| 8 | VIP / whale tooling | △ via segments (currency balance / churn risk) + segment-exclusive stores | △ via segmentation | △ via Stats | △ via spending-tier segment | △ less explicit | **0/5 first-class, 5/5 via segment+offer primitives** |
| 9 | Offer builder / bundle composer | ✓ Targeted Offers + Bundles + dynamic pricing | △ via virtual purchases | ✓ Store + offer packs | ✓ in-game offers / bundles / promotions | ✓ LiveOps features | **4/5 + 1 partial** |

**Reading the matrix:** of the 9 dimensions DESIGN.md claims as wedge, **8 are shipped at first-class depth by ≥3 of the 5 incumbents**. The single dimension where no incumbent ships a *first-class branded* surface is **#8 — VIP/whale tooling** — but every incumbent ships the *primitives* (segment by spend / virtual currency balance / churn risk → targeted offer to that segment). That's the same capability under a different frame.

### What the gap actually is (residual after triangulation)

Three thinner gaps survive — none category-creating:

1. **Full Git-like catalog merge semantics with JSON-aware diff and conflict resolution.** PlayFab v2 ships draft+approval+future-publish but not branch+merge. Metaplay ships diff but not merge. Balancy is closest with "Git-like CMS" framing. **None ship the full DAG model DESIGN.md §12.3 implies.** This is a real but narrow gap, and unclear whether designers actually want it (vs. find it confusing).
2. **Branded "VIP/whale dashboard" as a first-class surface** rather than emergent from segment+offer primitives. Marketing-narrative gap, not capability gap.
3. **Quality-of-execution differential vs. PlayFab specifically** — multiple sources document PlayFab UX / docs decay (AccelByte 2025-10, Medium "Silent Sunset"). Real, but specific to one incumbent and addressable by switching to Metaplay or Balancy without BokChoy existing.

### What the cross-engine framing now looks like

A revised wedge — *"deep cockpit for cross-engine mid-core teams not served by Unity-tied or mobile-only specialists"* — also weakens on closer inspection:
- **Beamable Venus (2025) shipped Web SDK and major Unreal enhancements.** Beamable is no longer Unity-only.
- **Metaplay does not state engine restrictions** and explicitly supports multiplayer / cross-platform / live-service. Their customer list (Supercell, Trailmix, Metacore) is mobile-heavy but their scope page is broader.
- **PlayFab and AccelByte are already engine-agnostic** at the BaaS layer.

The cross-engine specialist gap is narrower than the DESIGN.md framing implied.

## Conflicts

| Conflict | Source A | Source B | Precedence applied |
|---|---|---|---|
| *"Designer-first live-ops UX is an unfilled gap"* (DESIGN.md) vs. *"all 5 named incumbents ship 6–9 of the 9 cockpit dimensions"* (Sources 1–6) | DESIGN.md §8 | Sources 1–6 (vendor docs current) | **Current vendor docs win.** DESIGN.md is the position; vendor docs are the production state. The gap claim as stated does not survive. |
| *"Beamable is Unity-only, opinionated, all-or-nothing"* (DESIGN.md §18) | DESIGN.md | Beamable Venus blog 2025 | **2025 release notes win.** Beamable now ships Web SDK + Unreal. The §18 cell is dated. |
| *"Metaplay is mobile F2P specifically (their stated wedge)"* ([[landscape-survey]] §1) | landscape-survey | metaplay.io/mobile-f2p + metaplay.io/liveops | **Vendor's broader scope claim wins.** Metaplay markets a mobile-F2P URL but the scope page lists multiplayer / cross-platform / live-service. Survey was reading the marketing slug, not the scope page. |
| *"PlayFab is feature-frozen-ish"* (DESIGN.md §18) | DESIGN.md | Microsoft Learn doc updates 2025–2026 (Targeted Offers added 2025-05; Foundation Mode launched GDC 2026) | **Current changelog wins.** PlayFab continues to ship; the §18 cell overstates stagnation. |

The CL-007 claim does not survive these conflicts. Per *Contradiction protocol*, current docs and current code beat asserted positions.

## Conditions

This finding holds under these scope conditions:
- **Time:** April 2026. The matrix above is current as of doc fetches today.
- **Vendors:** the 5 named incumbents from [[landscape-survey]] §1. Other vendors (RisingWave for game data, custom Helika dashboards, in-house solutions at AAA) are not in scope.
- **Definition of "ships":** documented as a feature in current public docs or marketing. Does *not* validate that the UX is *good*, only that the feature exists. A claim of *"BokChoy ships better UX"* is not falsified by this entry — but a claim of *"BokChoy ships a missing capability"* is.

This finding does **not** hold for:
- Latency / performance / scalability comparisons. Out of scope.
- Pricing comparisons. Out of scope (separate research entry — CL-010).
- Quality-of-implementation comparisons across vendors (would need primary research with studios using each).
- The "designer can ship in <5 minutes" UX-bar claim — that requires customer discovery (PK-03 in register).

## Operational implications

For design's next move on DESIGN.md:

1. **Strike or rewrite §4 Strategic Positioning's "designer-first live-ops UX gap" claim.** The category-creating-gap framing is false. The defensible reframings are narrower: *"better execution than PlayFab specifically"* (a quality wedge against one incumbent, not a category) or *"specific dimensions that no incumbent does first-class"* (full Git-like catalog DAG, branded VIP dashboard) — but the residual gap is much smaller than the doc currently claims.

2. **Re-rank the competitive landscape (§18).** Metaplay and Balancy are not "live-ops layer" entries on a thin matrix — they are direct overlap competitors on the BokChoy wedge as currently described. The §18 row labels for Beamable ("Unity-only, opinionated, all-or-nothing") and PlayFab ("feature-frozen-ish") are factually outdated and need rewriting before the doc becomes load-bearing.

3. **CL-001 (slice = A1) is not directly invalidated** by this finding — the slice question is *which cell on the grid*, not *what wedge mechanism inside the cell*. A1 mobile F2P runtime can still be the right cell. But if A1 is the cell *and* the cockpit isn't the wedge, design owes a different wedge mechanism (or a different cell).

4. **CL-002 (complement-don't-compete moat) is heavily damaged.** If the wedge mechanism is mostly already shipped by Metaplay / Balancy / Beamable / PlayFab, the "complement, don't compete" frame loses force. Those vendors *are* the complement-don't-compete tier. BokChoy isn't filling a gap; it's joining a crowded specialist tier with thinner differentiation than the doc claims.

5. **Implications for §3 problem statement (CL-008).** The §3 claims about "studios build economies in spreadsheets, then ship them as hard-coded values" and "live-ops is a full-time job with no purpose-built tools" are weakly supported by this entry. The tools clearly exist. Whether studios *use* them is a different question and requires customer discovery, not desk research.

6. **Recommendation back to /design:** before researching CL-001 / CL-002 / CL-006 / CL-009 in detail, consider whether the wedge as framed in DESIGN.md needs a structural rewrite. If the cockpit isn't the wedge, the entire wedge story changes — which changes what counts as "the right slice" and what counts as "the right moat." Cascading rework is cheaper now than after architecture is invested.

## Reproducibility note

Reproducible. Another investigator with the same question and access to WebSearch / WebFetch should reach a substantially similar matrix by:
1. Fetching the 5 incumbents' current documentation home pages (URLs cited above).
2. Asking each page about the 9 cockpit dimensions explicitly.
3. Cross-referencing PlayFab's Targeted Offers walkthrough and Metaplay's LiveOps Dashboard intro for depth.
4. Searching for "PlayFab limitations" / "Beamable Venus" / "Metaplay mobile F2P" for currency.

Subjective judgment is concentrated in the partial-vs-first-class cell coding (the △ vs. ✓ marks). Two investigators might differ by ±10% on which cells are partial. The headline finding — that 6+ of 9 dimensions are shipped first-class by ≥3 incumbents — is robust to that variation.

## Open threads

- **PK-03** in register: *"can a designer actually ship a segmented, A/B-tested, time-limited offer in <5 minutes in each of these dashboards?"* — desk research can't settle this; need customer discovery or hands-on tool eval.
- **CL-008** (studios reinvent economy primitives) — not supported by surface evidence in this pass; needs its own research entry searching specifically for game-industry post-mortems / GDC talks on in-house economy builds.
- **CL-013** (per-vendor weakness claims in §18) — folded into this entry's matrix; the §18 cells are partially obsolete and need rewriting.
- **Beamable Web SDK + Unreal Venus details** — not deeply explored. If "cross-engine specialist" remains a candidate wedge frame, Beamable's actual cross-engine depth needs its own pass.
- **Balancy CMS depth on catalog versioning / Git-like merge semantics** — referenced in landscape-survey but not directly verified this pass. If full-DAG catalog becomes the residual wedge, this needs verification.
- **AccelByte's "Why Studios Are Re-Evaluating PlayFab"** is a one-sided source; would benefit from balancing against a non-competitor critique of PlayFab.
