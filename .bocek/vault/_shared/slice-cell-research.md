---
type: research
features: [design-doc-audit]
related: ["[[design-claims-register]]", "[[landscape-survey]]", "[[cockpit-gap-research]]"]
created: 2026-04-30
confidence: medium
provisional: false
---

# Which cell on the (layer × shape) grid wins for BokChoy?

Resolves **CL-001** in [[design-claims-register]] — partial. The finding produces per-cell winning conditions; the *decision* between cells is design's job.

## Question

DESIGN.md §1, §6, §7 implicitly choose **A1 (mobile F2P runtime)** as BokChoy's slice. [[landscape-survey]] §3 named 4 viable cells with surface-level differences: A1 (mobile F2P runtime), B1 (cosmetic-shop / battle-royale runtime), C1 (sports-card market runtime), D1 (MMO player-driven economy runtime). CL-001 asks: per cell, who is in it today, what scale of customer set does it have, what would BokChoy's winning conditions be? The cockpit-gap research already covers A1 incumbents in depth — this entry goes deeper on B1 / C1 / D1 with switching evidence and structural-platform-feasibility.

## Triangulation

- **Production reference:** ✓ — Google Cloud / EA Sports FC case study (cloud migration story), CCP EVE Online Monthly Economic Report (architecture artifact), AccelByte product surface, Heroic Labs Hiro framework docs, named customer cases (Animal Company, Whatwapp, Pixel Flow / Loom Games).
- **Docs reference:** ✓ — AccelByte product modules (Foundations / Online / Multiplayer), Heroic Labs Hiro intro docs, CCP MER Nov 2025.
- **Contradiction probe:** ✓ — searched for prior-attempted B2B platforms in C1 (sports card market) and D1 (MMO economy as a service). C1 returned only consumer card businesses (Alt, Card Ladder, CollX), not game-economy-SaaS — the absence itself is the finding. D1 returned Hiro / Nakama scaffolding but no MMO-economy specialist.

## Sources examined

### Source 1 — AccelByte Gaming Services product page
- **Tier:** 2 (vendor docs / product page)
- **Provenance:** `accelbyte.io/about-us`, current.
- **Author context:** AccelByte product team. Founders publicly cited as having engineered Fortnite, Epic Online Store, Xbox Live, EA Origin (per their about-us page).
- **What it tells us:** AccelByte ships in three packages — Foundations (Identity, Game Analytics), Online (**Store & Catalog, Wallet & Payments, Inventory, Season Pass**, Cloud Save, Friends, Achievements, Leaderboards), Multiplayer (Matchmaking, Chat, Sessions, Guilds, Servers). Customer list elsewhere (per [[landscape-survey]] §1): KRAFTON (PUBG), Remedy, Starbreeze, Dreamhaven, Build A Rocket Boy, 1047 Games, Deep Silver Volition, Theorycraft. Console / PC live-service AA-AAA tier. $60M raise from SoftBank Vision Fund 2 (2022) underwrites the trust requirement at this tier.

### Source 2 — Google Cloud / EA Sports FC Ultimate Team migration
- **Tier:** 4 (vendor case study, marketing-leaning)
- **Provenance:** `cloud.google.com/transform/ea-sports-fc-ultimate-team-cloud-migration-no-outages-no-problem`, published 2024-04-16.
- **Author context:** Google Cloud marketing case study with EA Sports FC. EA-side voice. Marketing emphasis, but operational scale numbers are concrete.
- **What it tells us:** EA migrated FUT *to* Google Cloud — i.e. cloud infrastructure as platform, **not** game-economy-SaaS. Scale: "millions of people playing concurrently," "thousands and thousands of machines," peak capacity bursts at 2× to 10× baseline, Google Cloud Spanner planned for future integration. **Auction house and pack system are EA's own engineering** running on Google Cloud VMs. No third-party economy SaaS in the picture.

### Source 3 — CCP EVE Online Monthly Economic Report (Nov 2025)
- **Tier:** 1 (production artifact)
- **Provenance:** `eveonline.com/news/view/monthly-economic-report-november-2025`, published 2025.
- **Author context:** CCP Games — the studio's own publication. EVE Online has a named chief economist (Doctor Eyjolfur Gudmundsson) and an estimated $7.4M USD GDP per [unswecosoc.com synthesis].
- **What it tells us:** CCP's economy intelligence tracks: money supply + velocity, consumer/mineral/producer price indices, mining volume history (regional, by ore/ice/gas), production+destruction, market transactions, sink/faucet commodities, moon material valuations, PvP economic data, services breakdown. Hosted on `web.ccpgamescdn.com` — CCP's own CDN. **No third-party platform.** The depth of data demonstrates MMO-grade economy intelligence is technically achievable but currently fully internal. Only the largest MMO publishers run intelligence at this depth.

### Source 4 — Heroic Labs Hiro framework documentation
- **Tier:** 2 (official docs)
- **Provenance:** `heroiclabs.com/docs/hiro/concepts/introduction/`, current.
- **Author context:** Heroic Labs / Nakama team. Hiro positioned as Nakama metagame toolkit.
- **What it tells us:** Hiro ships **wallet/currencies, inventory with stacking and time-limited ownership, shop/catalog, rewards system, mailbox**. Configuration-driven; client SDKs for Unity and Unreal. Not explicit on this page: A/B testing, segments, offers, dashboard, player inspector, VIP/whale tooling, faucet/drain analytics. Public customer named: **Pixel Flow** (Loom Games — 10M+ players). Positioned as general live-service framework.

### Source 5 — Search synthesis on C1 (sports card market) B2B platform attempts
- **Tier:** 4–6 (multi-source synthesis)
- **Provenance:** WebSearch returned consumer card platforms (Alt.xyz, Card Ladder, Cardbase, CollX), print-on-demand infra (QPMN), blockchain (NBA Top Shot, Star Card Sports), sports-betting B2B (Jindo). **No game-economy-SaaS specifically targeting FUT-shape titles** in the result set.
- **Author context:** Synthesis across `dot.la`, `techcrunch.com`, `qpmarketnetwork.com`, `consignr.com`, `nix-united.com`, `blockchainx.tech`. Consumer-trading-card industry, not B2B game-economy-platform industry.
- **What it tells us:** The C1 cell has *zero* dedicated B2B game-economy platform. The only adjacency is consumer trading-card marketplaces (orthogonal product) and sports-betting B2B (orthogonal customer). Survey 01's claim ("nobody serves it as a B2B product. EA built it themselves") is verified.

### Source 6 — Heroic Labs case studies (Animal Company, Whatwapp)
- **Tier:** 3 (engineering case studies, vendor-published but with named customer details)
- **Provenance:** `heroiclabs.com/blog/spatial-case-study/`, `heroiclabs.com/blog/whatwapp-case-study/` (referenced in search synthesis).
- **Author context:** Heroic Labs marketing with named customer voice.
- **What it tells us:** Animal Company (VR breakout, 500k DAU) **built a custom admin panel on top of Nakama's API** — confirms studios extend BaaS dashboards rather than buy specialist UI. Whatwapp uses Nakama Storage + Wallet + Leaderboard + Multiplayer for in-game economy. Both cases: BaaS as primary, custom UI on top. Hiro presumably reduces this custom-build need but isn't yet the universal answer.

## Findings

### Per-cell incumbent + scale picture

| Cell | Vendors active here | Customer scale | Trust requirement | Switching evidence | Cell verdict |
|---|---|---|---|---|---|
| **A1 — mobile F2P runtime** | PlayFab v2, Unity GS, Beamable, Metaplay, Balancy, **Hiro / Nakama**, Hiro is new in this picture | ~thousands of mid-core F2P studios globally | Medium — designer-friendly tooling enough | None named in this pass; weakly supported elsewhere | **Most crowded, largest TAM.** Per [[cockpit-gap-research]] the cockpit gap claim is dead here. Differentiation must be quality-of-execution against 6 named specialists. |
| **B1 — cosmetic-shop / battle-royale** | AccelByte (AA-AAA console live-service), PlayFab (lighter), AAA studios build internal | Hundreds of AA console / PC live-service studios; thousands counting indie | **High** — AccelByte raised $60M from SoftBank to clear this. AAA won't trust greenfield startups. | None named | Dominated at AAA by AccelByte + internal. Mid-market thin between AccelByte (heavy) and PlayFab (light). Smaller TAM than A1, higher trust gate. |
| **C1 — sports card market** | **None as B2B.** EA, MLB The Show, NBA 2K MyTeam — all internal. Google Cloud as raw infra (FUT). | ~5–10 named games globally (FUT, Madden Ultimate Team, MLB The Show Diamond Dynasty, NBA 2K MyTeam, NHL HUT) | Catastrophic — at this scale (FUT was $1.71B Q3 FY24 per survey), the studios won't trust an outside ledger | **N/A — no platform to switch from.** The cell exists at AAA only, served entirely internally. | **Empty cell, but tiny market.** Highest revenue density per game, but ~5 customers total who won't buy from a startup. **Not a slice for a Year-1 startup.** |
| **D1 — MMO player-driven economy** | **None as B2B.** Hiro/Nakama as scaffolding (Animal Company / Whatwapp / Pixel Flow build on top). CCP / Blizzard / Jagex / Square Enix all internal. | ~5–10 MMOs at scale globally; perhaps 50–100 if counting smaller-scale MMOs and MMO-likes | High — MMO economies require linearizable consistency at scale and the operational team to interpret it | None named | **Largest absolute gap, smallest market.** Real opportunity at the "MMO-like with player economy" tier (e.g. mid-scale survival/social games on Nakama), but the canonical MMO buyers (CCP, Blizzard) won't move off internal stacks. |

### Specific implication: Heroic Labs / Hiro is the most under-recognized A1 competitor

Hiro shipped: wallet, inventory with stacking + TTL, shop, rewards, mailbox. Nakama-based. Heroic Labs *already partners with Unity / Unreal* via the Nakama SDKs. Customer: Pixel Flow at 10M+ players. **This is the wedge BokChoy claims, executing today, sold by the partner BokChoy plans to align with.**

DESIGN.md §10 *"Active partnership with Heroic Labs (Nakama)"* and §17 *"partnership-led acquisition"* both rest on the assumption that Heroic doesn't compete on economy depth. Hiro contradicts that. The partnership story now requires either:
- Defending why Hiro isn't deep enough (specifically — what does Hiro miss that BokChoy ships?), or
- Accepting that Heroic is a *competitor* in the live-service-on-Nakama tier and not a partnership target.

This is a separate wedge-frame challenge than CL-007 surfaced, and it specifically attacks the "complement, don't compete" claim against Heroic Labs.

### Per-cell winning conditions

- **A1 wins for BokChoy if** they out-execute Metaplay / Balancy / Beamable / Hiro on cross-engine breadth + designer UX *and* clear PlayFab Standard's $400/mo + Metaplay's free tier on price (CL-010 territory). Largest TAM; most crowded. Pricing math is hostile.
- **B1 wins for BokChoy if** they can serve mid-AA console / PC live-service studios that AccelByte is too heavy for and PlayFab is too thin for. Niche market. Trust gate is high but achievable below AccelByte's six-figure floor. Founder-credibility gate (CL-003) becomes load-bearing here — buyers in this segment know the names.
- **C1 wins for BokChoy if** an off-AAA tier of sports-card-like games emerges (e.g. mid-market collectible card games with auction houses). *Currently does not exist.* Building for a future market.
- **D1 wins for BokChoy if** the "MMO-like with player economy" tier (mid-scale on Nakama, survival/social games with player trade) needs deep economy and Hiro doesn't ship enough. Real opportunity, very small market, direct overlap with Hiro at the same tier.

## Conflicts

| Conflict | Source A | Source B | Precedence applied |
|---|---|---|---|
| DESIGN.md §10: "Active partnership with Heroic Labs" framed as wedge complement | DESIGN.md | Hiro framework docs (Source 4) — Heroic ships their own economy stack | **Production code wins.** Hiro is shipping. The partnership thesis rests on Heroic *not* shipping economy depth; Hiro is exactly that depth. The partnership claim needs reframing. |
| DESIGN.md §1: implicit slice = A1 mobile F2P runtime | DESIGN.md | Survey + this entry (multiple cells, varying market and crowding) | **The surveys win.** A1 is plausible but is *the most crowded cell with the worst pricing math*. The choice of A1 was never derived against alternatives in DESIGN.md. |
| Survey 01: AccelByte serves AA-AAA only | landscape-survey | AccelByte product page (Source 1) — modular packages span foundations through multiplayer | **Both correct, different scope.** AccelByte's product *can* serve AA, but their pricing/sales motion targets AAA per landscape-survey. The product-vs-go-to-market distinction matters. |

## Conditions

This finding holds under:
- **Time:** April 2026.
- **Cells:** the 4 cells defined by [[landscape-survey]] §2. The geographic/market-tier axis from §3.5 is orthogonal; this entry doesn't address the Africa / SEA / LATAM dimensions.
- **Definition of "winning":** *which cell offers the best fit for BokChoy's resources and constraints*, not abstractly "which cell is bigger." Founder-credibility gate (CL-003), pricing math (CL-010), Year-1 ARR (CL-011) all interact with cell choice and aren't resolved here.

This finding does **NOT** hold for:
- Roblox-as-shape (UGC marketplace) — survey 01 explicitly excluded; this entry doesn't reopen.
- Web3 / token economies — DESIGN.md §5 excludes; not researched here.
- The geographic axis (Helsinki vs. LATAM vs. emerging markets) — separate research entry needed (touches CL-005).

## Operational implications

For design's wedge rework:

1. **A1 is plausible but not obviously right.** It's the largest TAM and the most crowded. The DESIGN.md choice of A1 implicitly bet "we will out-execute 6 named specialists." That's the wedge that needs defending now — not "we will fill a gap" (which the cockpit research already killed).

2. **B1 is a real candidate slice.** AA mid-market between AccelByte (enterprise) and PlayFab (light) is thinner than A1 but less crowded. Trust gate is higher; founder credibility (CL-003) is more load-bearing. *Worth modeling as the B-alternative to A1.*

3. **C1 is not a slice for a Year-1 startup.** ~5 customers globally, all AAA, all internal. Move on.

4. **D1 is the smallest market with the largest absolute gap.** Real opportunity for a niche play, direct overlap with Hiro at the indie/AA tier. Likely too small to support DESIGN.md's $30–60M Year-5 ARR target.

5. **Heroic Labs is a direct competitor on A1, not a clean partnership.** Hiro is shipping. DESIGN.md §10's "active partnership" requires either evidence that Heroic publicly endorses BokChoy as the deeper-economy alternative to Hiro (no such evidence in this pass), or reframing the relationship. This compounds the cockpit-gap finding's damage to CL-002.

6. **Specific reworks DESIGN.md owes:**
   - §1 should justify A1 against B1 / D1 explicitly (both became viable candidates after the cockpit research damaged the A1-as-gap framing).
   - §10 / §17 partnership claim with Heroic Labs needs evidence beyond "active partnership" assertion or a reframe.
   - §18 needs a Hiro row added, and a Metaplay row corrected (mobile-F2P-only is wrong per [[cockpit-gap-research]]).
   - §3 problem statement claim "BaaS economy modules are shallow" is now contested by Hiro / Metaplay / Beamable / Balancy depth in addition to PlayFab v2.

## Reproducibility note

Reproducible. Another investigator with the same question and access to WebSearch / WebFetch should reach the same per-cell picture by:
1. Searching for B2B platform attempts in each cell (cosmetic shop, sports card, MMO economy).
2. Reading the existing AccelByte / Heroic Labs / EA-FC public materials.
3. Cross-referencing with [[landscape-survey]] §2 surface scan.

Subjective judgment is concentrated in the per-cell "verdict" line. Two investigators might differ on whether B1 mid-AA is large enough to be a slice for a Year-1 startup; the data here is consistent with either reading.

## Open threads

- **Hiro depth** — what does Hiro *not* ship that BokChoy claims to? Worth a focused entry. Critical for whether the Heroic partnership claim survives.
- **AccelByte mid-AA reach** — does AccelByte actually sell to studios under the AAA tier, or is their motion enterprise-only? Email the customer list, or read their case studies. Important for B1-as-candidate-slice.
- **D1 mid-scale opportunity sizing** — how many "MMO-like with player economy" games operate at the mid-scale tier (under EVE/WoW but above hobby projects)? If 50+, D1 is a niche slice. If <20, it's a hobby market.
- **Geographic axis** — separate research entry for Helsinki / LATAM / etc. talent + buyer density (CL-005).
- **CL-009 (replacement-BaaS sales cycle)** — next in queue. Damaged premise but user chose option (b) — parallel evidence accumulation. Run next.
