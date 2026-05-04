---
type: research
features: [design-doc-audit]
related: ["[[design-claims-register]]", "[[cockpit-gap-research]]", "[[slice-cell-research]]"]
created: 2026-04-30
confidence: high
provisional: false
---

# Is the BaaS-replacement sales cycle 12–18 months for BokChoy's actual ICP?

Resolves **CL-009** in [[design-claims-register]].

## Question

DESIGN.md §4 asserts: *"Trying to replace PlayFab/Nakama/Unity GS is a losing fight: studios won't rip and replace; sales cycles become 12–18 months; incumbents have free tiers and trust."* This claim is the gate on the entire complement-don't-compete strategic frame. CL-009 asks: is 12–18 months actually the cycle length for BokChoy's stated ICP (10–100 person mid-core F2P studios, seed–Series B, on existing BaaS), and does the framing survive at the price point DESIGN.md prices Studio tier at?

## Triangulation

- **Production reference:** ✓ — AccelByte product page citing *"weeks instead of months"* deployment time + AccelByte migration framework content. Unity Discussions threads (community evidence of how studios actually evaluate BaaS).
- **Docs reference:** ✓ — multiple 2025 B2B SaaS benchmark reports (Optifai, Lighter Capital, Maxio, Benchmarkit, ORM) with mid-market and enterprise cycle medians.
- **Contradiction probe:** ✓ — actively searched for evidence supporting the 12–18 month claim. Found support *only* at the enterprise-tier (AAA, AccelByte's segment with $60M raise + dedicated Delivery Managers + private cloud). The 12–18 month figure is consistent with enterprise-tier behavior; *not* consistent with mid-market.

## Sources examined

### Source 1 — 2025 B2B SaaS sales cycle benchmarks (synthesis across multiple reports)
- **Tier:** 4 (industry benchmark reports — multiple authors, recent)
- **Provenance:** Synthesis across `optif.ai/learn/questions/sales-cycle-length-benchmark/`, `lightercapital.com/blog/2025-b2b-saas-startup-benchmarks`, `thedigitalbloom.com/learn/pipeline-performance-benchmarks-2025/`, `orm-tech.com/blog/sales-cycle-length-guide/`, `maxio.com/resources/2025-saas-benchmarks-report`, `benchmarkit.ai/2025benchmarks`. 2025 benchmark cycle data.
- **Author context:** Industry analyst / SaaS-funding firms publishing benchmarks for portfolio companies. Generalist SaaS not gaming-specific, but the cycle dynamics are governed by ACV tier and buying-committee structure, which translate.
- **What it tells us:**
  - Overall B2B SaaS average sales cycle: **84 days**.
  - **SMB (<$15K ACV): 14–30 days.**
  - **Mid-market ($15K–$100K ACV): 30–90 days** (one source cites 60–120 days).
  - **Enterprise (>$100K ACV): 90–180+ days.**
  - Cycles have lengthened **22% since 2022** due to committee buying (avg 6.8 stakeholders, up from 5.4 in 2020), CFO involvement (+40%), and SOC 2 / GDPR / vendor risk assessments (+2–4 weeks per cycle).

### Source 2 — AccelByte deployment + sales messaging
- **Tier:** 4 (vendor marketing / sales)
- **Provenance:** `accelbyte.io` + `accelbyte.io/solution` + `accelbyte.io/about-us` + `accelbyte.io/blog/source-forks-vs-cloud-scripting-vs-accelbyte-extend`, current.
- **Author context:** AccelByte product / sales team. Explicitly enterprise-tier ICP — KRAFTON / Remedy / Starbreeze customer list, $60M Series B (TechCrunch May 2022).
- **What it tells us:** AccelByte advertises *"add core features in **weeks instead of months**"* and *"spin up first dedicated servers in just **hours**"* — i.e., **deployment** is fast even at enterprise scale. The long part of the AccelByte story is the *sales* cycle (enterprise-tier evaluation), not implementation. AccelByte explicitly ships a migration framework with "playbooks, phased rollouts, hands-on support, migration tools, and full validation" — actively migrating customers off PlayFab. The migration product exists, which means migrations happen at the AAA tier.

### Source 3 — AccelByte's October 2025 PlayFab attack post
- **Tier:** 4 (vendor blog, named author / commercial competitor — already cited in [[cockpit-gap-research]] as Source 7)
- **Provenance:** `accelbyte.io/blog/why-studios-are-re-evaluating-playfab-and-how-accelbyte-compares`, 2025-10-08.
- **What it tells us for CL-009 specifically:** AccelByte's pitch is structured around *re-evaluation* — i.e. they actively sell against PlayFab. The post implies replacement is happening in the field. Combined with their migration framework (Source 2), this contradicts DESIGN.md §4's "studios won't rip and replace" claim *at the AAA tier*. At mid-market, no public AccelByte case studies — likely because AccelByte's pricing is enterprise-floor (per [[landscape-survey]] §1).

### Source 4 — Unity Discussions community evidence on BaaS evaluation
- **Tier:** 6 (forum threads, named developer questions)
- **Provenance:** `discussions.unity.com/t/replacing-playfab-and-azure-with-unity-gaming-services-question/938303`, `discussions.unity.com/t/which-baas-backend-as-a-service/619125`, `discussions.unity.com/t/can-the-economy-service-replace-playfab/906600`, `discussions.unity.com/t/firebase-vs-playfab-vs-gamespark/924305`, `discussions.unity.com/t/my-thoughts-on-the-unity-game-services-suite/888038`. Threads from 2022–2025 timeframe.
- **Author context:** Indie / small-AA developers asking community for advice on BaaS choice + migration. Not enterprise procurement.
- **What it tells us:** Greenfield evaluation in this segment is **weeks of investigation, days of decision** — community threads, weighing pricing pages, prototype tests. **No 12–18 month deliberation.** This represents the SMB / lower-mid-market segment and matches Source 1's 14–30 days SMB benchmark. For Series-B-backed mid-core teams the cycle extends with committee buying but does *not* approach 12–18 months for $20K-class ACV deals.

### Source 5 — Comparative listings (alternatives / decision support content)
- **Tier:** 5 (tutorial / advocacy)
- **Provenance:** `getgud.io/blog/top-7-game-backend-providers-in-2024-powering-the-future-of-gaming/`, `lootlocker.com/blog/selecting-the-right-backend-for-your-game`, `sourceforge.net/software/product/PlayFab/alternatives`, `6sense.com/tech/game-development/playfab-vs-accelbyte`. Multiple 2024–2025 vendor comparison pages.
- **What it tells us:** A live comparison-shopping market exists. Game studios *do* swap and benchmark BaaS options. PlayFab pricing floor cited as $99/mo when leaving free tier. Decision-support content treats BaaS choice as a near-term comparison, not a multi-year strategic procurement.

## Findings

### The 12–18 month figure is consistent with one specific cell, not BokChoy's

Mapping DESIGN.md's claim to industry-benchmark cycles:

| Tier | ACV range | Benchmark cycle | DESIGN.md product price (Studio tier) | Match? |
|---|---|---|---|---|
| SMB | <$15K | 14–30 days | $299/mo Indie ≈ $3.6K ACV | Indie tier matches SMB benchmark |
| **Mid-market** | **$15K–$100K** | **30–120 days** | **$1,499/mo Studio ≈ $18K ACV; $4,999/mo Studio+ ≈ $60K ACV** | **BokChoy's primary ICP — benchmark says 30–120 days, NOT 12–18 months** |
| Enterprise | >$100K | 90–180+ days | $10K+/mo Enterprise ≈ $120K+ ACV | Enterprise tier — 12–18 months plausible here, especially with SOC 2 / vendor risk + 2–4 weeks |

DESIGN.md §4's 12–18 month claim:
- Is **roughly correct** at the AccelByte / AAA tier ($120K+ ACV). AccelByte's $60M raise underwrites that cycle.
- Is **2–4× too long** at BokChoy's primary mid-market ICP (Studio + Studio+ tiers, $18K–$60K ACV). Realistic cycle: 60–180 days even with extended trust gates for an unproven startup.
- Is **6–12× too long** at the Indie / SMB tier where many of BokChoy's first 10–20 customers will likely come from.

### The strategic frame inverts at BokChoy's actual tier

DESIGN.md §4 uses the 12–18 month claim to justify the *"complement, don't compete"* strategic frame. The reasoning chain:
1. *Replacement is slow → so we can't compete on replacement → so we complement.*

If step 1 is wrong at the BokChoy ICP, the strategic conclusion doesn't follow. At a 60–180 day mid-market cycle, BokChoy *can* compete head-on at:
- **Greenfield** — studios starting a new game who haven't picked a BaaS yet. Decision happens in weeks; competitive eval is the norm.
- **Mid-market migration** — Series-B-backed studios willing to swap out their economy module specifically (not their full BaaS), at a 90–180 day evaluation cycle. AccelByte's migration framework demonstrates the playbook exists at higher tiers; BokChoy could ship a thinner version for mid-market.

This is a **substantively different GTM motion** than complement-don't-compete:
- Replacement-greenfield: target unfunded / pre-launch studios via engine asset stores, Discord, GDC, Pocket Gamer Connects (DESIGN.md §17 already names these).
- Replacement-migration: founder-led sales to studios already burned by PlayFab quality issues per AccelByte's October 2025 critique.
- Complement-don't-compete: partnership-led acquisition through Heroic Labs / Unity / RevenueCat — already damaged in [[slice-cell-research]] by Hiro shipping economy depth.

### The complement framing is also damaged from the other direction

Even if the 12–18 month figure were correct at all tiers (it isn't), [[cockpit-gap-research]] showed that the *"deeper economy than BaaS modules"* wedge mechanism is largely absent. Hiro / Metaplay / Balancy / Beamable already ship the depth. So the complement frame is being damaged on both sides:
- **Sales-cycle gate** (this entry): the cycle isn't actually long enough at the ICP tier to justify the frame.
- **Wedge-mechanism gate** ([[cockpit-gap-research]]): the depth complement is supposed to provide is mostly already shipped by named specialists.

## Conflicts

| Conflict | Source A | Source B | Precedence applied |
|---|---|---|---|
| DESIGN.md §4 *"12–18 month sales cycles"* (asserted, ICP-agnostic) | DESIGN.md | 2025 SaaS benchmarks (Source 1) — 30–180 days across SMB / mid-market / enterprise | **Industry benchmarks win.** DESIGN.md is asserting a single number across all tiers when the literature differentiates by ACV. The 12–18 month figure is consistent only with enterprise-tier ICP, which BokChoy is not. |
| AccelByte: *"weeks instead of months"* deployment | AccelByte marketing | DESIGN.md §4 implication that replacement is multi-year | **Implementation is fast everywhere; sales cycle varies by tier.** No conflict on implementation; conflict is purely on the sales side, and Source 1 resolves it. |
| Forum evidence: developers comparing BaaS in days/weeks | Source 4 | DESIGN.md §4 | **Greenfield + indie/SMB cycles are days-to-weeks** — definitively shorter than mid-market or enterprise. Forum evidence narrows the bottom of the cycle range. |

## Conditions

This finding holds under:
- **Time:** April 2026.
- **ICP:** the mid-market segment DESIGN.md prices Studio / Studio+ tiers for ($15K–$100K ACV), and the indie/SMB segment for the Indie tier (<$15K ACV).
- **Definition of cycle:** time from first contact through signed contract. Doesn't include implementation (which is "weeks not months" per AccelByte for even the largest deals).

This finding does **NOT** hold for:
- BokChoy's *Enterprise* tier ($10K+/mo, $120K+ ACV) — at that tier, 12–18 months is plausible. SOC 2 (DESIGN.md §12.10 timed for month 30 Type 2) is the gate, not the wedge frame. *§4's argument applies if the Enterprise tier becomes the primary GTM, but DESIGN.md positions Enterprise as a small fraction.*
- Studios on multi-year BaaS contracts — if a studio is 18 months into a 3-year PlayFab contract, evaluation may pause until renewal. Cycle is more about contract timing than sales effort.
- The political / partnership dimension — even if cycle is fast, partner-channel deals through Heroic Labs / Unity have their own timing constraints. Out of scope for this entry.

## Operational implications

For design's wedge rework:

1. **§4's "12–18 month" figure should be revised or removed.** It conflates AAA-tier cycles with mid-market reality. The corrected figure for mid-market: **60–180 days, with 90–120 days as the planning median for an unproven startup.** Pricing at $1,499/mo Studio is mid-market; the cycle math has to use mid-market benchmarks.

2. **The strategic frame "complement, don't compete" rests on the original 12–18 month claim.** With cycle math corrected, BokChoy *can* compete head-on at greenfield (weeks-of-decision in indie/SMB; 30–60 days mid-market). The complement frame becomes one option among several, not the only option.

3. **Greenfield-targeting GTM becomes more viable than DESIGN.md gives it credit for.** A specific revision: §17 should add a *"replacement-greenfield"* row to the sales motion table. The conferences DESIGN.md already lists (PG Connects Helsinki, GDC, Devcom) are exactly where pre-launch studios surface — that's a direct match for greenfield, not a partnership-channel optimization.

4. **The "cycle is long → we can't sell to studios on an incumbent" argument doesn't justify pricing at $1,499/mo.** If a $18K ACV cycle is 60–120 days at industry benchmarks, BokChoy's startup tax pushes that to 90–180 days. That's a 3–6 month sales cycle, not 12–18 months. Year-1 ARR target of 10–20 customers (per §1) at this cycle is *more achievable* than the doc's gloss implies — but it requires a faster-moving GTM than partnership-channel.

5. **Cumulative damage to §4 is now severe.** The cockpit-gap finding killed the wedge mechanism. This finding kills the cycle-length premise. The "complement, don't compete" framing has lost both its motivation (gap) and its justification (cycle). Recommended rework: drop the strategic framing entirely and re-derive from current evidence — slice + tier + cycle + actual wedge.

6. **CL-006 (30-min integration) is next.** It's the technical wedge mechanism for the complement frame. If complement isn't the strategy, CL-006's politics question (will Microsoft/Unity/Heroic keep the bridge open?) matters less; the technical-feasibility half still matters for any GTM that integrates with PlayFab/Nakama/UGS as connectors.

## Reproducibility note

Reproducible. Another investigator with the same question and access to WebSearch should reach the same finding by:
1. Searching 2025 B2B SaaS sales cycle benchmarks across multiple sources (cycle data is well-published).
2. Computing BokChoy's ACV per tier from DESIGN.md §16 pricing.
3. Mapping price-per-tier to cycle-by-ACV per industry benchmarks.
4. Cross-referencing with AccelByte's enterprise-tier marketing claims to see what the 12–18 month figure is actually consistent with.

Subjective judgment: minimal. The benchmarks are well-published numbers; the ACV tier of BokChoy's pricing is computable; the mismatch is mechanical.

## Open threads

- **Game-industry-specific cycle data** would strengthen this finding. The benchmarks used here are generalist B2B SaaS. If a game-industry analyst (Newzoo, Sensor Tower, Pocket Gamer) publishes cycle data for B2B game-tools sales, that's a Tier-3 upgrade.
- **AccelByte mid-market reach** — open thread from [[slice-cell-research]]. If AccelByte does sell below the AAA tier, their mid-market cycle would directly bracket BokChoy's. Worth investigating if B1 stays a candidate slice.
- **Empirical validation via founder interviews.** PK-* park items in the register reach this — founder-led customer discovery would settle whether 60–180 day cycles are realistic for the BokChoy ICP, or whether the unproven-startup tax pushes it longer.
- **CL-002 (complement-don't-compete moat) is up next per execution order.** The damage from this entry + cockpit-gap accumulates; CL-002's research will likely confirm the cumulative finding rather than rescue the frame.
