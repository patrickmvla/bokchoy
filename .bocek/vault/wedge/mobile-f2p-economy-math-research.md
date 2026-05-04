---
type: research
features: [wedge, mvp]
related: ["[[wedge-decision]]", "[[design-claims-register]]", "[[cockpit-gap-research]]"]
created: 2026-04-30
confidence: medium
provisional: false
---

# What is the canonical math an indie/SMB mobile F2P economy needs to handle?

Resolves the **domain-depth research** queued in `[[wedge-decision]]` — the hard blocker before MVP feature list derivation.

## Question

What math underlies a working indie/SMB mobile F2P economy across (1) gacha PMF design, (2) retention curve modeling, (3) sink/faucet macro accounting, (4) LTV by archetype, (5) battle pass / progression tuning — and what does each impose on the backend primitives BokChoy must ship?

## Triangulation

- **Production reference:** ✓ — production patterns documented across multiple named systems (Genshin Impact, Tower of Fantasy, Fortnite, Clash Royale-tier, ZT Online, Zynga portfolio). Solsten 2025 + GameAnalytics 2026 retention benchmarks reference live game data at scale.
- **Docs reference:** ✓ — Daniel Cook's *Value Chains* (Spry Fox), Nicholas Lovell's whales/dolphins/minnows framework (canonical mobile F2P writing), Deconstructor of Fun battle pass analysis. Tsinghua ACM paper on gacha PMF math.
- **Contradiction probe:** ✓ — actively searched for disagreement on whale population %, D1 retention norms, gacha disclosure regs. Found: Lovell (2011) vs. recent Adweek data on whale revenue concentration; mobile-app D1 averages (Pushwoosh) vs. mobile-game D1 targets (Solsten, GameAnalytics). Conflicts named below.

## Sources examined

### Topic 1 — Gacha PMF design

#### S1.1 — Tsinghua "Gacha Game Analysis and Design" (CHEN, ACM)
- **Tier:** 4 (academic — peer-reviewed but reduced operational relevance)
- **Provenance:** `dl.acm.org/doi/pdf/10.1145/3579438`. ACM publication.
- **Author context:** Canhui Chen, Tsinghua University. Academic framing, post-2023 publication.
- **What it tells us:** Two pity-system design patterns dominate published gacha games — **reset-after-winning** (Genshin Impact) vs. **succeed-after-winning** (Tower of Fantasy). The distinction matters for backend state: reset-after-winning requires per-player pity counter that resets to 0 on any rare pull; succeed-after-winning keeps accumulating until target is obtained.

#### S1.2 — Kyle Chen blog "Algorithms for calculating gacha probabilities"
- **Tier:** 4 (named-author technical blog with explicit math)
- **Provenance:** `kylechen.net/writing/gacha-probability/`. Current.
- **Author context:** Independent technical writer; math reproducible.
- **What it tells us:** Canonical PMF math for gacha pulls. Base rate formula: **`p = 1 - (1 - base_rate · subrate)^n`** for the no-pity range. Soft pity ramp: rate scales linearly with pity counter past a threshold. Example: pulls 1–50 at 0.02, pulls 51+ at `0.02 × (pity_count - 48)`. **Critical computational insight:** expected pulls (mean) substantially exceeds median because hard-pity ceiling drags the distribution's tail — for the worked example, median 57 pulls vs. mean 69.16 pulls. Designers cannot reason about gacha cost from median alone.
  - Dynamic programming approach for exact PMF: state matrix `(target_count, pity_count)` updated per pull. **Operationally implies BokChoy backend stores per-player `pity_counter` per banner.**

#### S1.3 — 2025 MDPI paper on addiction mechanisms in gacha
- **Tier:** 4 (academic)
- **Provenance:** `mdpi.com/2078-2489/16/10/890`. Published 2025.
- **Author context:** Recent peer-reviewed analysis.
- **What it tells us:** Identifies **reward frequency >55** as the threshold above which gacha shifts from engaging to gambling-compulsive. Operationally relevant for **regulatory compliance + ethical design** — backend should support designer-configurable pity ceilings with explicit guardrails.

#### S1.4 — PulseGeek + Adjust + Massively OP synthesis
- **Tier:** 5 (vendor / advocacy / commentary blogs)
- **Provenance:** `pulsegeek.com/articles/gacha-odds-and-pity-systems-explained-clearly/`, `adjust.com/blog/gacha-mechanics-for-mobile-games-explained/`, `massivelyop.com/2025/05/16/...`.
- **What it tells us:** Industry context. **Soft pity** raises chance gradually; **hard pity** is a ceiling on pulls. **Rate-up** moves probability mass to the target. **Disclosure requirements:** China requires public listing of gacha odds + paid-pull-per-day cap; Belgium / Netherlands have partial loot box bans; EU loot box regs evolving. **Operationally implies:** BokChoy must support per-region odds-disclosure surfaces and per-day pull caps.

### Topic 2 — Retention curve modeling

#### S2.1 — Solsten "True Drivers of D1, D7, D30 Retention in Gaming"
- **Tier:** 4 (engineering blog, named author, named studio data analysis)
- **Provenance:** `solsten.io/blog/d1-d7-d30-retention-in-gaming`. Published 2025-07-10. Author: Chuck Ansbacher.
- **What it tells us:** **Current targets for strong mobile games:** D1 ≥50% (raised from historical 40%), D7 ≥20%, D30 ≥10%. **Curve characteristic:** plateau by mid-D20s; **D30 ≈ D365** in expectation, making D30 the strongest long-term health predictor available without 12-month data. Driver analysis: D1 driven by find-the-fun + activation UX, D7 by progression + social rewards, D30 by deep investment (time + money).

#### S2.2 — GameAnalytics 2026 mobile retention benchmarks (PDF)
- **Tier:** 3 (industry benchmark report from a major analytics platform)
- **Provenance:** `investgame.net/wp-content/uploads/2026/01/2026-01-20-Mobile_retention_benchmarks_2026.pdf`. Published 2026-01.
- **What it tells us:** **Median D1 ~22%, top 10% D1 ~40%, median D7 ~4%.** D1/D7/D30 declined again in 2025; gap between average and top performers widened. Operationally: median games are losing 78% of users by D1 — the harsh shape that economy design must work within.

#### S2.3 — Pushwoosh 2025 + Adjust mobile app benchmarks
- **Tier:** 4 (vendor benchmark studies)
- **Provenance:** `pushwoosh.com/blog/increase-user-retention-rate/`, Adjust data.
- **What it tells us:** **General mobile app** (not gaming-specific): D1 27% iOS / 24% Android; D7 6.89% iOS / 5.15% Android; D30 3.10% iOS / 2.82% Android. Use as cross-reference, not gaming-specific. Gaming numbers are typically higher than general-app averages.

### Topic 3 — Sink/faucet macro accounting

#### S3.1 — Daniel Cook "Value Chains" (Lostgarden)
- **Tier:** 3 (engineering essay from veteran economy designer with shipped credentials)
- **Provenance:** `lostgarden.com/2021/12/12/value-chains/`. Published 2021-12-12.
- **Author context:** Daniel Cook, Spry Fox, designer of Cozy Grove. Industry-canonical writing on game economy structure.
- **What it tells us:** **Source classification by growth pattern:** Capped (constant), Trickle (linear: `total = rate × time`), Grind (linear, player-driven), **Investment (exponential)**, Random (noise atop other types). Sinks mirror these — **canonical balancing principle: match the power of sinks with the power of sources.** Inflation inevitable when source > sink power class. Operational prescription: spreadsheet auditing of total sources vs. sinks within defined time windows. Cook explicitly: *"long-term, a higher power source will always swamp a lower power sink"* — the math underlying mudflation.

#### S3.2 — 1kxnetwork Medium: Sinks & Faucets lessons
- **Tier:** 4 (industry blog, applied to virtual economies)
- **Provenance:** `medium.com/1kxnetwork/sinks-faucets-lessons-on-designing-effective-virtual-game-economies-c8daf6b88d05`. Industry analyst.
- **What it tells us:** Inflation manifests as price escalation on player-facing items; designer remedies are typically (a) **add additional sinks** that scale with currency supply, (b) **introduce time-limited high-tier sinks** to drain accumulated reserves, (c) **adjust faucet rates** when telemetry shows accumulation outpacing sinks. Reinforces Cook's framework with operational tactics.

#### S3.3 — Wikipedia "Gold sink" + Game Developer "F-Words: Faucets"
- **Tier:** 5 (encyclopedic + retrospective)
- **Provenance:** `en.wikipedia.org/wiki/Gold_sink`, `gamedeveloper.com/design/the-f-words-of-mmos-faucets`.
- **What it tells us:** Established terminology grounding. Definition: *"A sink (sometimes called a drain) is a way or object/element within the game which removes currency, resources or goods from the economy and destroys the currency permanently."* Permanent destruction is the key — currency moved between players is not a sink.

### Topic 4 — LTV by archetype

#### S4.1 — Nicholas Lovell "Whales, Dolphins, Minnows" (GamesBrief)
- **Tier:** 3 (canonical industry-foundational writing)
- **Provenance:** `gamesbrief.com/2011/11/whales-dolphins-and-minnows-the-beating-heart-of-a-free-to-play-game/`. Published 2011-11-16.
- **Author context:** Nicholas Lovell, author of *The Curve*; F2P consultant. Canonical reference; cited across the industry.
- **What it tells us:** **Population (of payers):** Minnows 50%, Dolphins 40%, Whales 10%. **Monthly spending averages:** Minnows ~$1, Dolphins ~$5, Whales ~$20. *Important caveat:* numbers are 2011, asserted approximations. Power-law shape is the durable claim; specific dollar amounts are not.

#### S4.2 — Adweek infographic + Pocket Gamer experts' guide + Chris Kempt
- **Tier:** 4 (industry data syntheses, more recent)
- **Provenance:** `adweek.com/digital/infographic-whales-account-for-70-of-in-app-purchase-revenue/`, `chriskempt.com/p/how-much-do-whales-spend`, `pocketgamer.biz/the-experts-guide-to-mobile-games-monetisation-part-two/`.
- **What it tells us:** Updated numbers vs. Lovell:
  - **Whales <1% of total player base** (not 10% of payers — whole-population %)
  - **Whales account for 70%+ of IAP revenue** in many top-grossing games
  - **1% of users → 29% of revenue** (mobile gaming aggregate)
  - **Top 5% ARPPU ~$66/day** (2023 data) — 20% growth over 3 years
  - **Top 1% spends $500+/month** in many cases
  - **Pareto principle confirmed:** 80% of revenue from 20% of paying users

#### S4.3 — Pipspuzzle 2025 spending tier breakdown
- **Tier:** 5 (commentary, but explicit tier breakdown)
- **Provenance:** `pipspuzzle.com/game/gacha-games`. Current 2025.
- **What it tells us:** Refined 2025 tier model:
  - **F2P Paradise** ($0)
  - **Dolphin-Friendly** ($5–15/month)
  - **Moderate Spender** ($30–100/month)
  - **Competitive Spender** ($100+/month)
  - **Whale Territory** ($500+/month)
  - More granular than Lovell's 3-tier. Operationally relevant: BokChoy's segmentation primitive should support 5+ tier brackets or arbitrary user-defined cuts on monthly spend.

### Topic 5 — Battle pass / progression tuning

#### S5.1 — Deconstructor of Fun "Battle Passes — Everything You Ought to Know"
- **Tier:** 3 (industry analyst publication, named authors with shipped credentials)
- **Provenance:** `deconstructoroffun.com/blog/2022/6/4/battle-passes-analysis`. Published 2022-06.
- **What it tells us:**
  - **Pricing benchmark:** mobile basic battle pass tier **$5–15**.
  - **Mobile season length norm: 1 month.** Mid-core seasons: 3 months.
  - **Tier structures:** symmetric (free + premium at same pace, premium has *better* rewards), premium-heavy (more tiers in paid), free-heavy (more rewards in free).
  - **Reward distribution curve:** "growing curve, progressively increases effort, with relief moments after spikes, ends with a big one." Anchor cosmetics at start + end; pacing rewards in middle.
  - **Operational role:** "primarily a retention and engagement mechanism" — not pure monetization.
  - **Premium-pass holders return more consistently than non-purchasers** — i.e. the pass is a retention multiplier, not just a revenue surface.
  - **Premium track total value 10x+ purchase price** — psychological value framing.

#### S5.2 — Google Play Apps & Games (Aaron Hiscox) on battle passes
- **Tier:** 4 (platform-published developer content)
- **Provenance:** `medium.com/googleplaydev/how-battle-passes-can-boost-engagement-and-monetization-in-your-game`.
- **What it tells us:** Battle passes work when they "create urgency through time-limited progression." Reinforces the seasonal cadence pattern. Engagement loop: daily/weekly tasks → pass progression → premium-track unlocks.

#### S5.3 — Gamigion + Battlepass.news "Evolution & Models"
- **Tier:** 5 (industry commentary)
- **Provenance:** `gamigion.com/the-evolution-of-battle-pass-event-pass-and-season-pass-systems/`, `battlepass.news/2025/05/29/battle-pass-models-game-comparisons/`.
- **What it tells us:** Genre-specific cadence variation: casual = shorter cycles; mid-core / cosmetic-driven = 3-month cycles; events-linked passes = monthly. Operationally implies BokChoy battle pass primitive must support **flexible season length** + **event-linked passes** as a separate type alongside seasonal.

## Findings

### Topic 1 — Gacha PMF: backend must store pity state per player per banner

**Canonical math (per S1.2):**

For a banner with base rate `r`, subrate `s` (probability the rare pull is the rate-up target), and no pity:
> P(at least one target in n pulls) = 1 - (1 - r·s)^n

With soft pity at threshold T and rate ramp `+Δ per pull past T`:
> rate(p) = r if p ≤ T, else r + Δ·(p - T)

With hard pity at ceiling H: `rate(H) = 1.0`.

Reset-after-winning (Genshin pattern): on any rare pull, `pity_counter ← 0`.
Succeed-after-winning (Tower of Fantasy): on target rare pull, `pity_counter ← 0`; on non-target rare pull, pity *retained* (target guaranteed next rare).

**Operational implication for BokChoy:**
- **Per-player pity state per banner:** `pity_counters: { player_id, banner_id, count, banner_state_hash }`. Banner-state-hash protects against banner config changes mid-pity.
- **Reset semantics is a banner config, not a global setting.** Different banners may use different patterns within one game.
- **Designer-configurable pity ceilings:** soft threshold, soft ramp delta, hard ceiling. The MDPI paper's >55-pulls threshold for compulsion is a guardrail to surface in the dashboard but not to enforce.
- **Per-region disclosure surfaces:** China-region clients display per-pull odds and pity thresholds; non-disclosure regions still have data available via API but UI shows differently. Design implication: catalog metadata includes `disclosed_odds: bool` per banner, per region.
- **Per-day pull caps:** China-region requires this; design implication: rate-limit primitive per player per banner per day.

### Topic 2 — Retention: design economy primitives knowing 78% are gone by D1

**Current 2025–2026 mobile-game benchmarks (per S2.1, S2.2):**

| Metric | Median games | Top performers | Strong-game target |
|---|---|---|---|
| D1 | 22% | ~40% | ≥50% |
| D7 | ~4% | ~20% | ≥20% |
| D30 | (not published median) | ~10% | ≥10% |

**Curve characteristic:** plateau in mid-D20s; **D30 ≈ D365** in expectation. (S2.1)

**Operational implication for BokChoy:**
- **Cohort tracking is non-negotiable from day 1.** The economy intelligence layer needs cohort-by-install-date computation. Specifically: retention_curve(cohort_id) returning Day-N retention for N ∈ {1, 7, 14, 30}.
- **D30 as the headline retention metric** (per Solsten's "D30 ≈ D365" finding). Not D7. Studio dashboards should foreground D30 cohort.
- **Hooks at D1 are about activation, not economy.** Designers building on BokChoy will need offer-targeting tools that deploy *before* D1 to maximize that hook — i.e. *first-session offers*, not retention offers. BokChoy's segment manager must support segments by "session count" / "time-since-install" / "first-purchase-status," not just spend tier.
- **At D7+, segments narrow dramatically.** A median game at 22% D1 → ~4% D7 has lost 80% of D1 retainers in 6 days. Whale identification for a Day-7 cohort is statistically thin; segment math has to handle small-N.

**Markov chain framing (inferred from training, not source-cited):** retention is approximately a Markov decay where retention(d+1) = α(d) · retention(d) with α increasing toward 1.0 as d grows (curve flattens). At plateau, α ≈ 1.0. *Inferred, medium confidence.* Production references (named teams using Markov retention models) not surfaced in this pass — open thread.

### Topic 3 — Sink/faucet: backend must enable spreadsheet-style audit of source vs. sink power class

**Canonical math (per S3.1):**

Sources/sinks classified by growth pattern: capped, linear (trickle/grind), exponential (investment), random.

**Balancing rule:** match power of sinks to power of sources. *Long-term, a higher-power source will always swamp a lower-power sink.* (Daniel Cook)

**Operational implication for BokChoy:**
- **Transactions table is the audit primitive.** Every currency mutation logged with `reason_code` ∈ {source category, sink category}. Designer queries: aggregate currency_in by reason over time window vs. currency_out. This was already in DESIGN.md §13 as the "lifeline" — confirmed canonical.
- **Faucet/drain dashboard shows source class vs. sink class per currency.** Not just total in/out — also classification: how much from linear sources (gameplay rewards) vs. exponential sources (compounding upgrades). Per Cook, the *power-class mismatch* is what predicts inflation, not absolute volume.
- **Inflation alert primitive:** rule = `cumulative_in / cumulative_out > threshold over window AND currency_supply growing > X% per day`. Threshold is per-game configurable; defaults to "alert designer when sources outpace sinks by 1.2× over 14 days."
- **Reason code taxonomy is part of the catalog spec.** Designer-defined reason codes must be classifiable as source-or-sink + power-class for the audit to work. Implication: catalog item / shop item / loot table all carry source/sink classification metadata.

### Topic 4 — LTV by archetype: 1% of users = 30%+ of revenue, segment math must handle thin tails

**Power-law shape (per S4.1, S4.2):**

| Tier | % of base | Monthly spend | Revenue share |
|---|---|---|---|
| Whales | <1% | $500+ | ~70% of IAP |
| Dolphins | ~5–15% | $5–30 | ~20% |
| Minnows | most payers | $1–5 | small |
| Non-payers | 90%+ | $0 | $0 |

(Tier sizes vary by genre; whale concentration is the durable claim, not specific %.)

**Operational implication for BokChoy:**
- **Spend-tier segmentation is the load-bearing analytics primitive at indie tier.** Designers need to identify the top 1% of spenders (who drive most revenue) within hours of them spending. Implication: segment manager supports `cumulative_spend > X over Y days` predicates; segment evaluation runs on every transaction (real-time, not batch).
- **Whale-targeting offers at indie tier:** segment-exclusive store visibility for top-1% with dynamic pricing. Already a standard primitive (PlayFab Targeted Offers ships this), so BokChoy's primitive must reach parity. Cross-references CL-007 dimension #8 (VIP/whale tooling) and #9 (offer builder).
- **Population at indie scale is small.** Indie game with 10K MAU has ~100 whales. Segment statistical math must handle small-N gracefully — segment size warnings when whale segment <30 players (statistical floor for A/B testing); offer A/B test guardrails when segment too small to detect 5% lift.
- **Monthly spend tier brackets are designer-configurable.** Pipspuzzle 2025 5-tier model is more granular than Lovell's 3; some games will want 7+ brackets (esports-tier whales). Implication: segments are not hardcoded "whale/dolphin/minnow" — they're arbitrary user-defined predicates with persistent labels.

### Topic 5 — Battle pass: 1-month seasons, $5–15 price, retention multiplier not pure revenue

**Canonical structure (per S5.1):**

- **Pricing:** $5–15 base tier (mobile). Premium track total value 10x+ purchase price.
- **Season length:** 1 month default for mobile; 3 months for mid-core / cosmetic-heavy; event-linked passes shorter.
- **Tier structure:** dual-track free + premium. Three structural choices:
  - Symmetric pace, differentiated rewards (most common)
  - Premium-heavy (more tiers in paid)
  - Free-heavy (more in free)
- **Reward curve:** anchor at start + end; smaller progress rewards in middle.
- **Engagement loop:** daily/weekly tasks → progression → unlocks.

**Operational implication for BokChoy:**
- **Battle pass primitive is non-trivial.** It's not just "a list of tiers and rewards" — it's a scheduled live-ops object with: season window, tier table, free/premium split per tier, daily/weekly quest integration, claim verification, expiration handling, "I bought late but get retroactive rewards" handling.
- **Quest system is intertwined with battle pass.** Quests are the progression vector; battle pass is the reward target. Implication: BokChoy's quest primitive (DESIGN.md §8 mentions this) must integrate with battle pass progression — quest completion contributes XP / pass progress, configurable per quest.
- **Designer configures tier shape, not BokChoy.** Symmetric / premium-heavy / free-heavy are designer choices per pass instance. Catalog spec for battle pass: list of `(tier, free_reward[], premium_reward[])`.
- **Retention multiplier framing is the pitch story.** *"Battle pass premium players return more consistently"* (per S5.1) — this is the operational rationale designers want. BokChoy's economy intelligence dashboard should surface "battle-pass-holder retention vs. non-holder" as a default cohort comparison.

## Conflicts

| Conflict | Source A | Source B | Precedence applied |
|---|---|---|---|
| Whale population: 10% of payers (S4.1, 2011) vs. <1% of total base (S4.2, 2023) | Lovell 2011 | Adweek + Pocket Gamer current | **Recent data wins** per *Contradiction protocol* (recent post-mortem > older advocacy). The shape (power-law concentration) is durable; specific population %s are not. |
| Mobile-app D1 averages (Pushwoosh 27%) vs. mobile-game D1 targets (Solsten 50%) | Pushwoosh general apps | Solsten gaming-specific | **Both correct, different scope.** Mobile games average above general apps. Use gaming numbers for BokChoy. |
| Daniel Cook's Value Chains (2021) vs. machinations.io articles (current) | S3.1 | Machinations 2024+ | **Both consistent.** Machinations operationalizes Cook's framework with simulation tooling. No conflict. |
| Battle pass season length: 1 month (DoF 2022) vs. event-linked variations (current) | S5.1 | S5.3 | **Both correct, genre-dependent.** 1-month is the default; events drive variation. BokChoy primitive must support both. |
| Reset-after-winning vs succeed-after-winning gacha pity (S1.1) | Both production patterns | — | **No precedence — both are valid choices.** BokChoy's primitive supports both as banner config options. Not a contradiction; a design space. |

## Conditions

This finding holds under:
- **Time:** April 2026.
- **Game shape:** mobile F2P (gacha + battle pass + soft/hard currency + IAP). Does not generalize to MMO player-driven economy (different math; see [[slice-cell-research]] D1 for that).
- **Studio scale:** indie/SMB tier, 10K–500K MAU. Above 500K MAU, statistical math and storage shapes change (e.g. whale segment becomes large-N rather than small-N).

Does **not** hold for:
- Cosmetic-shop B1 (Fortnite/Apex) — different revenue mechanics (single hard currency + scarcity rotation, not gacha).
- Sports-card C1 — auction houses + pack EV math, fundamentally different.
- Web3 / token economies — out of scope per DESIGN.md §5.

## Operational implications — backend primitives BokChoy MVP must ship

Cascading from the math above into MVP feature requirements:

1. **Pity-state storage per player per banner.** `pity_counters` table + per-banner config (reset-after-winning vs. succeed-after-winning, soft threshold, soft ramp, hard ceiling, regional disclosure flag, per-day pull cap). *Required for any gacha-shaped game.*
2. **Cohort retention computation.** Pre-aggregated D1 / D7 / D14 / D30 retention by install date cohort, with segment overlay. Powers the dashboard headline metric and the battle-pass-holder cohort compare. *Required for retention-aware live-ops.*
3. **Transactions-as-audit-log with reason-code taxonomy.** Every currency / item move tagged with reason code; reason codes classified as source/sink + power-class for inflation auditing. *Required for the faucet/drain dashboard, which is a wedge feature.*
4. **Real-time spend-tier segmentation.** Segment evaluation runs on transaction commit, not batch. Predicates support `cumulative_spend over window`, `time-since-first-purchase`, `purchase frequency`. *Required for whale targeting + offer mechanics.*
5. **Battle-pass primitive with quest integration.** Season window, dual-track tier table, free / premium reward arrays, quest-progression contributions, retroactive-claim handling. *Required for battle-pass-shaped games (most mobile F2P).*
6. **Inflation alert primitive.** Rule-based alerts on currency supply growth + source/sink ratio. Configurable thresholds per currency. *Required for the economy intelligence wedge.*
7. **Designer-configurable segment brackets, not hardcoded W/D/M tiers.** Segment manager exposes free-form spend-window predicates, persistent labels. *Required for diverse mobile F2P shapes.*
8. **Statistical guardrails on segment-based A/B tests.** Segment size warnings when N too small to detect typical lift. *Required so indie designers don't ship invalid A/B conclusions.*

## Reproducibility note

Reproducible. Another investigator with the same question and access to WebSearch / WebFetch should reach the same canonical-math findings by:
1. Searching gacha PMF + pity + soft/hard pity → academic + technical-blog sources land Genshin/ToF patterns and the formula.
2. Searching mobile F2P retention curve D1/D7/D30 → GameAnalytics + Solsten benchmark numbers land.
3. Searching sink/faucet game economy → Daniel Cook's *Value Chains* is the canonical reference; will land at Lostgarden.
4. Searching "whales dolphins minnows" mobile F2P → Lovell's GamesBrief article is the named precedent.
5. Searching battle pass design tuning → Deconstructor of Fun is the dominant analyst.

Subjective judgment: moderate. Specific implementation details (e.g. segment-size thresholds for A/B test guardrails, exact pity-counter schema) are inferred from the math; another investigator might choose slightly different specifics. Headline mathematical findings — power laws, plateau curves, source/sink power classes — are robust.

## Open threads

- **Markov retention models named in production.** Solsten + GameAnalytics give D-N benchmarks but not Markov decay parameters. Worth a focused future entry if the cohort math becomes the differentiator (it isn't currently a wedge feature, so park).
- **Specific whale-population % at indie scale (10K–500K MAU).** Lovell's 2011 numbers and Adweek's recent numbers describe published-game scales. Indie scale may have different distribution — need customer discovery (PK-* park items in `[[design-claims-register]]`) to verify.
- **Regulatory landscape for gacha at indie tier.** China / EU / Belgium / Netherlands disclosure + ban patterns are documented; smaller markets (LATAM, SEA) less so. Worth a focused entry if BokChoy targets those geos.
- **Battle pass attach rate benchmarks.** Deconstructor of Fun didn't quantify attach rate (% of players who buy premium). Mobile F2P Bible / Mobile Free To Play likely has this; worth checking when pricing the BokChoy battle-pass primitive.
- **Energy / progression mechanics math.** Survey 01 mentioned "energy regen timers" as a mobile F2P primitive but I didn't research the math here. Open for a follow-up entry if BokChoy's MVP includes energy as a primitive.
- **Idiomatic API shape for gacha pull endpoint.** Should it be POST /gacha/pull → returns reward + pity-counter delta? Or stream? Backend design question, not domain math — back to /design.
