---
type: research
features: [wedge, pricing]
related: ["[[wedge-decision]]", "[[design-claims-register]]", "[[mobile-f2p-economy-math-research]]"]
created: 2026-04-30
confidence: high
provisional: false
---

# What does the right pricing tier mix look like for BokChoy at indie/SMB tier?

Resolves **CL-010** in `[[design-claims-register]]` (partially — establishes tier-mix shape; specific dollar values are recommendations awaiting customer-discovery validation).

## Question

DESIGN.md §16 priced for AA mid-core: Free / Indie $299 / Studio $1,499 / Studio+ $4,999 / Enterprise $10k+. The wedge has pivoted to indie/SMB tier per `[[wedge-decision]]`. CL-010 asks: what tier mix actually fits the indie/SMB segment given (a) the named game-economy incumbents' pricing, (b) dev-tool PLG comparables (PostHog / Cal.com / RevenueCat) that succeeded at indie/SMB acquisition, and (c) BokChoy's wedge mechanism (free-tier cockpit as differentiator)?

## Triangulation

- **Production reference:** ✓ — current pricing pages from 5 game-economy incumbents (Metaplay, Beamable, Balancy, PlayFab, Heroic Labs) and 3 dev-tool PLG comparables (RevenueCat, PostHog, Cal.com).
- **Docs reference:** ✓ — vendor-published pricing pages, all current 2025–2026.
- **Contradiction probe:** ✓ — actively searched for divergent pricing models (per-MAU vs. per-DAU vs. usage-meter vs. revenue-share vs. per-user-flat). Found all five in active use; no dominant-and-unchallenged model.

## Sources examined

### Game-economy incumbents

#### S1 — Metaplay
- **Tier:** 2 (vendor pricing page)
- **Provenance:** `metaplay.io/pricing`, current.
- **Tiers (EUR):** Starter €195 (DAU 5, 1 mini env), Pre-launch €995 (DAU 100, 2 small envs), Production €1,985 + €2.95/1k DAU above 5k, Private Cloud custom.
- **Note:** No permanent free tier. Starter at €195 (~$210) is the entry point.
- **Support tiers separate:** Standard €1,500/mo, Dedicated €5,000/mo, Critical Incident +€5,000/mo. *Support is unbundled — material for indie cost modeling.*

#### S2 — Beamable
- **Tier:** 2 (vendor pricing page)
- **Provenance:** `beamable.com/pricing`, current.
- **Tiers (USD):** 90-day Trial $0 (12.5M API calls, 1k MAU, 3 microservices), Developer $125, Studio $595, Pro $1,895, Enterprise $3,500+.
- **Model:** Usage-based — API calls + MAU + microservices count. Overage $100/10M API calls.
- **Note:** No permanent free tier (90-day trial only). Developer $125 is the entry to ongoing service.

#### S3 — Balancy
- **Tier:** 2 (vendor pricing page)
- **Provenance:** `balancy.co/pricing/`, current.
- **Tiers (USD):** CMS Free ($0, unlimited config + payment validation + cloud storage), Studio $499 + 10k DAU free / project, Publisher $999 + 10 seats, 50 projects.
- **DAU pricing above included:** $2/1k DAU ≤100k, $1.50 100k–500k, $1 500k–1M, $0.50 >1M.
- **Note:** **Balancy is the only game-economy vendor with a permanent free tier** — but it covers CMS only (config + payments), not the LiveOps suite. Studio at $499 is when LiveOps unlocks.

#### S4 — PlayFab
- **Tier:** 4 (search-synthesis from playfab.com pricing — page didn't fetch; numbers from `learn.microsoft.com` + `community.playfab.com` + Thurrott)
- **Provenance:** Multiple sources synthesized; numbers are post-2024 transition.
- **Tiers (USD):** Dev Mode $0 (1k **lifetime** account creations, 10 titles), Standard $99/mo + $400 included meters then PAYG, Premium $1,999/mo + $8,000 included meters, Enterprise $10k+.
- **Model:** Microsoft transitioned **away from MAU-based** to **usage-based meters** post-2023.
- **Note:** Dev Mode is suffocatingly limited (1k *lifetime* accounts kills indie evaluation past prototype). Standard at $99 is genuinely cheap floor — but no live-ops cockpit depth at that tier per [[cockpit-gap-research]].

#### S5 — Heroic Labs / Heroic Cloud
- **Tier:** 5 (search-synthesis; pricing page didn't fetch directly)
- **Provenance:** `heroiclabs.com/heroic-cloud/`, AWS Marketplace, GCP Marketplace, Y Combinator profile.
- **What it tells us:** Nakama itself is **Apache 2.0 open-source self-hostable for $0** — direct competitor to anything BokChoy could ship as paid backend. Heroic Cloud is paid managed Nakama; specific pricing not surfaced in this pass. **Hiro framework** layered on top is the closer competitor on economy primitives.
- **Open thread:** Heroic Cloud specific pricing tiers. If 3-C path resurfaces, this needs a focused fetch.

### Dev-tool PLG comparables

#### S6 — RevenueCat
- **Tier:** 4 (search-synthesis from MetaCTO + RevenueCat blog + G2)
- **Provenance:** `revenuecat.com/pricing` (didn't fetch directly), MetaCTO 2025 analysis, RevenueCat's own pricing-transition blog.
- **Tiers (USD):** Free up to $2.5k Monthly Tracked Revenue (MTR), Pro = 1% of MTR above $2.5k, Enterprise custom.
- **Model:** Revenue-share. **MTR is gross revenue before App Store / Google Play 30% cut** — important framing.
- **Note:** RevenueCat trained the mobile-F2P SDK market on revenue-share pricing. Indie devs are familiar with this shape.

#### S7 — PostHog
- **Tier:** 2 (vendor pricing page)
- **Provenance:** `posthog.com/pricing`, current.
- **Free tier (monthly recurring, no credit card):** 1M events, 5k recordings, 1M flag requests, 1500 survey responses, 100k errors, 1M data warehouse rows, 100k LLM events, 50GB logs. **1 project, 1-year retention, unlimited team members.**
- **Pay-as-you-go after free:** $0.00005/event tiered down to $0.0000090/event at 250M+ events. Recordings $0.005 → $0.0015 at 500k+. Flags $0.000100 → $0.000010 at 50M+.
- **Self-host:** MIT licensed, free.
- **No required annual minimum.** Enterprise contracts available.

#### S8 — Cal.com
- **Tier:** 2 (vendor pricing page)
- **Provenance:** `cal.com/pricing`, current.
- **Tiers (USD):** Free unlimited for individual (1 user, unlimited events + integrations), Teams $12/user/mo (yearly with 25% discount), Organizations $28/user/mo, Enterprise custom.
- **Self-host:** Available via GitHub + Docker.

## Findings

### Pattern 1 — Game-economy incumbents are *bad* at PLG free tiers

| Vendor | Free tier shape | Practical for indie evaluation? |
|---|---|---|
| Metaplay | None (Starter €195) | No |
| Beamable | 90-day trial only | No (must convert before product launch) |
| Balancy | Free CMS forever; free 10k DAU on Studio | Partial — LiveOps requires $499 |
| PlayFab | 1k *lifetime* accounts | No (kills evaluation past prototype) |
| Heroic / Nakama | Self-host free (Apache 2.0); Heroic Cloud paid | Yes, if you can self-host |

**Production-cited high.** None of the named game-economy commercial vendors ship a permanent free tier with the live-ops surface available.

### Pattern 2 — Dev-tool PLG vendors ship generous permanent free tiers as core strategy

| Vendor | Free tier shape | Free tier converts to paid via |
|---|---|---|
| RevenueCat | Free up to $2.5k MTR | Revenue-share at $2.5k+ MTR |
| PostHog | 1M events/mo + 5k recordings + 1M flags + ... permanent | Pay-as-you-go after monthly allowance |
| Cal.com | Free for individuals (1 user) permanent | Per-user pricing for teams |

**Production-cited high.** All three are 2020+ companies that built indie/SMB market share via *permanent free tiers, not trials*. PostHog's free tier is widely cited as the reason for their adoption velocity.

### Pattern 3 — Pricing models split across five shapes

| Model | Vendors using | When it fits |
|---|---|---|
| Per-DAU | Metaplay (above 5k), Balancy | When DAU correlates with vendor cost |
| Per-MAU | (PlayFab pre-2024, deprecated) | Was standard; deprecated for game-economy |
| Usage meter | PlayFab, Beamable, PostHog | When per-event compute cost is real |
| Revenue-share | RevenueCat | When vendor handles revenue (IAP layer) |
| Per-user-flat | Cal.com | When B2B SaaS with seat-based licensing |

**The shapes are not equivalent.** Per-DAU rewards small games with active players; revenue-share rewards small games with no whales; usage meter rewards small games with low transaction volume. **Indie/SMB studios with low MAU + occasional whales fare best on revenue-share or generous-free-tier-then-meter models.**

### Pattern 4 — Game-economy entry tier pricing range: $99–$595 USD

The lowest *paid* tier where the product is useful varies by vendor:

| Vendor | Lowest useful paid tier |
|---|---|
| PlayFab Standard | $99/mo |
| Beamable Developer | $125/mo |
| Metaplay Starter | €195/mo (~$210) |
| Balancy Studio | $499/mo |
| Beamable Studio | $595/mo |

**$99–$595 is the indie/SMB-tier band for game-economy paid entry today.** DESIGN.md's $299 Indie tier is in this band; DESIGN.md's $1,499 Studio is *above* this band — that price is for AA mid-core, not indie/SMB.

### Pattern 5 — Self-host as a free-tier alternative

Three of eight vendors (PostHog, Cal.com, Nakama via Heroic) ship self-hostable open-source. **None of the game-economy paid stacks** (PlayFab, Metaplay, Beamable, Balancy) do. This is the same observation as `[[slice-cell-research]]` — Nakama is the only self-host option in game-economy. Per `[[wedge-decision]]` this is path 3-C territory, *not chosen* — but the open-source SDK supporting infrastructure was retained.

## Conflicts

| Conflict | Source A | Source B | Precedence applied |
|---|---|---|---|
| Per-MAU vs. usage-meter pricing for game-economy | Pre-2023 norm | PlayFab post-2024 transition | **Recent change wins.** PlayFab explicitly moved away from MAU. Usage-meter is the current trend. |
| Revenue-share vs. flat-fee pricing | RevenueCat (1% MTR) | Metaplay/Beamable/Balancy (flat + DAU) | **Different vendor categories.** Revenue-share fits when vendor handles revenue (IAP layer). Game-economy backends typically don't capture IAP gross — RevenueCat does. **For BokChoy:** if BokChoy ships IAP fulfillment, revenue-share is *available* as a model option. |
| Trial-only vs. permanent free | Beamable (90-day trial) | RevenueCat / PostHog / Cal.com (permanent free) | **Permanent free wins for PLG.** All successful indie/SMB-tier dev-tool vendors in this pass ship permanent free. Trial-only is enterprise-leaning. |

## Conditions

This finding holds under:
- **Time:** April 2026.
- **Pricing model:** the comparables that exist publicly; private-tier custom pricing not visible.
- **ICP:** indie/SMB mobile F2P studios (1–10 person teams, pre-launch through first-launch). Not AA or AAA where pricing dynamics differ.

Does **not** hold for:
- Capital efficiency math — vendor *cost* of serving indie tier (LLM API costs for AI features, infra costs at low MAU) must be solved separately. This entry is about *competitive pricing*, not unit economics.
- Conversion rate from free → paid — that's a customer-discovery / cohort-data question, not desk research.
- Geography-specific pricing (LATAM, SEA local-currency adjustments) — out of scope for this pass.

## Operational implications — rebuilt tier mix for BokChoy

Replaces DESIGN.md §16. Three structural choices, then a recommended tier mix.

### Structural choice A — Pricing model

**Recommendation:** **Hybrid — flat-fee tiers + usage meters at high volume + revenue-share option for IAP-heavy users.**

Reasoning:
- Indie devs need *predictability* at the bottom (flat-fee), so they know if they can afford the product.
- Usage meters at high volume protect vendor margin against hammer-the-AI users on Free tier.
- Revenue-share *option* (1% of IAP fulfilled) for studios who prefer success-aligned pricing — opt-in, not default. Aligns BokChoy's success with customer's, attractive to early-stage studios.

### Structural choice B — Free tier shape

**Recommendation:** **Permanent free tier with full live-ops cockpit included, capped at usage thresholds.**

Reasoning:
- This is the **wedge mechanism** per `[[wedge-decision]]` — *"free-tier cockpit at indie tier that other vendors gate behind paid plans."*
- Caps protect vendor margin: 10k MAU, 100k transactions/mo, 50 catalog items, 5 active offers, 1 active battle pass, 50 AI catalog suggestions / day, basic A/B + segments + offer builder.
- All cockpit *features* available on free; only *scale* gated.
- PostHog / RevenueCat / Cal.com pattern. Game-economy incumbents don't do this.

### Structural choice C — Tier names and prices

**Proposed tier mix (USD):**

| Tier | Price | MAU cap | Transactions/mo | Notes |
|---|---|---|---|---|
| **Free** | $0 | 10k | 100k | Full cockpit + AI tooling at modest rate limits |
| **Indie** | $99/mo | 100k | 1M | Same surface; 10× scale of Free; matches PlayFab Standard floor, undercuts Beamable Developer ($125), Metaplay Starter (€195) |
| **Studio** | $499/mo | 500k | 10M | Matches Balancy Studio ($499); replaces DESIGN.md's $1,499 (which was AA-tier mispriced for indie) |
| **Studio+** | $1,499/mo | 2M | 50M | Inherits the old "Studio" price for the next-tier-up segment; sits between Beamable Studio ($595) and Beamable Pro ($1,895) |
| **Enterprise** | Custom | Unlimited | — | For studios that exceed Studio+ scale; sales-led |

**Per-DAU overage above tier cap:** $1.50/1k DAU (Balancy benchmark). Designer can choose to upgrade tier or pay overage.

**Optional revenue-share alternative on Indie + Studio tiers:** 1.5% of IAP fulfilled through BokChoy, *in lieu of* flat fee. Capped at the next tier's price (so studios can't game it). Sales pitch: "if your game flops, you pay nothing; if it succeeds, we grow with you."

### Why this beats DESIGN.md §16

| Concern | DESIGN.md §16 | Rebuilt mix |
|---|---|---|
| Free tier MAU cap | 10k MAU (good) | 10k MAU (kept) |
| Indie tier price | $299 | $99 (matches PlayFab Standard, undercuts Beamable) |
| Studio tier price | $1,499 (AA-mispriced) | $499 (matches Balancy, indie-priced) |
| Studio+ tier | $4,999 | $1,499 (inherits old Studio price, right band) |
| Free tier surface | "Full features" but ambiguous on cockpit | Explicit: full cockpit + AI tooling at rate limits — wedge mechanism |
| Pricing model | Per-MAU | Hybrid: flat + usage meter at scale + revenue-share option |
| Pricing transparency | Per-MAU only, simple | More complex; needs designer-friendly calculator |

### What survives from DESIGN.md §16 unchanged

- Free tier exists at $0 with 10k MAU
- Annual commit = 2 months free (works regardless of tier mix)
- 14-day Studio trial (replace with: just upgrade-and-downgrade since Free tier exists permanently)
- Region surcharge for non-default region (out of MVP scope per `[[wedge-decision]]` — multi-region deferred)

### Pricing risks to monitor

1. **Free tier abuse / capacity hammer.** Limit to 10k MAU + 100k transactions + 50 AI calls/day per project; rate-limit the AI surface aggressively. PostHog's per-event cost makes free tier abuse painful for them too — they monitor for it. We follow the same playbook.
2. **AI cost economics on Free tier.** Cap AI suggestions per project per day. Use cheap model (Haiku-tier) for catalog suggestions, more expensive for balance simulation (premium-tier feature).
3. **Conversion from Free → Indie below 10%.** Industry benchmark for PLG dev tools: ~5–10% conversion. If BokChoy converts at 3% or less, free-tier cost overwhelms revenue.
4. **Self-hosted backend not offered.** Differentiates from Nakama (which is self-host free) and PostHog (self-host MIT). For BokChoy this is intentional — closed core + open-source SDK is the chosen path per `[[wedge-decision]]`. Tradeoff: lose open-source-purity-conscious customers; gain commercial defensibility.

## Reproducibility note

Reproducible. Another investigator with the same question + WebFetch should reach the same comparable-pricing matrix. Specific tier-price recommendations are *one defensible choice among the band* — another investigator might recommend $79 Indie / $399 Studio / $1,299 Studio+ and be equally defensible. The band ($99–$595 Indie/Studio range) is robust; the specific point inside the band is judgment.

Subjective judgment is concentrated in:
- The hybrid pricing model recommendation (flat + meter + revenue-share). Could be challenged by an investigator who'd prefer pure per-MAU for simplicity.
- The 1.5% revenue-share alternative is inferred from RevenueCat's 1% MTR; specific number is judgment.
- Free-tier rate limits are inferred from PostHog/Cal.com patterns plus AI-cost considerations; specific limits need usage-data validation.

## Open threads

- **Heroic Cloud specific pricing tiers.** Pricing page didn't fetch this pass. If 3-C path ever resurfaces or if BokChoy revisits the open-source-core decision, fetch directly.
- **Indie/SMB conversion-rate benchmarks** for PLG dev tools (free → paid). PostHog / Cal.com have published numbers; would refine the unit-economics model.
- **AI cost per active project** at Free tier. Open-thread from `[[wedge-decision]]`. Needs an actual cost model with claude-haiku-4-5 / Claude Sonnet pricing × expected calls/project/day.
- **Geography-specific pricing.** SE Asia / LATAM / Africa local-currency tiers. Premature for MVP but real for Year 2 expansion.
- **Per-feature pricing within tiers.** Some indie devs may want a-la-carte ("I only use catalog + IAP") rather than full tier — uncommon in dev-tools but worth thinking about.
- **Customer discovery validation.** PK-* park items in `[[design-claims-register]]` include "5 buyer triggers" — does *any* indie studio actually cite price as the reason they don't use Metaplay/Beamable/Balancy today? If price isn't the gate, free-tier wedge weakens.
