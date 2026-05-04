# 01 — Landscape Survey: Game Economy Engines

**Purpose:** map the competitive surface, the distinct economy shapes, and who actually pays — enough to pick a slice for path-A deep research. Not a teaching doc.

**Method:** WebSearch verification of 16 named entities + market-sizing reports (Apr 2026). Inline citations. Where I cite a fact without a link, I'm asserting from training and flagging it as such.

---

## 1. Competitor surface

Three layers. A studio's "economy engine" is rarely one product — it's a stack assembled from these.

### 1a. Runtime backend (the live ledger, inventory, transactions, players)

| Vendor | What it does | Pricing floor / ceiling | Tier targeted | What it does NOT do |
|---|---|---|---|---|
| **Unity Gaming Services / Unity Economy** | Currency, inventory, IAP, virtual purchases, integrated into Unity engine. Pay-as-you-go on top of free tier. Hard cutoff: exceed free tier without billing → all UGS APIs blocked. ([UGS Pricing](https://unity.com/products/gaming-services/pricing)) | Free tier → usage-based | Indie / AA Unity studios | Non-Unity engines, custom server logic beyond their primitives |
| **Microsoft PlayFab** | Full game BaaS: economy, leaderboards, player data, multiplayer servers. Dev Mode free (1k lifetime accounts), Standard $400 included meters/mo, Premium $8k, Enterprise from $10k/mo. ([PlayFab Pricing](https://playfab.com/pricing/)) Foundation Mode (GDC 2026) gives Xbox devs core services free. ([Foundation Mode](https://developer.microsoft.com/en-us/games/articles/2026/03/gdc-2026-introducing-foundation-mode-for-playfab/)) | Free dev → enterprise | Indie → AAA, engine-agnostic | Heavy custom logic (CloudScript exists but is constrained) |
| **AccelByte** | Cross-platform backend: matchmaking, store, cloud save, social. Raised $60M from SoftBank Vision Fund 2 (2022). ([TechCrunch](https://techcrunch.com/2022/05/03/accelbyte-a-backend-services-platform-for-game-developers-raises-60m-led-by-softbank-vision-fund-2/)) Customers: KRAFTON (PUBG), Remedy, Starbreeze, Dreamhaven, Build A Rocket Boy, 1047 Games, Deep Silver Volition, Theorycraft. ([AccelByte](https://accelbyte.io/about-us)) | Custom enterprise pricing | AA → AAA console/PC live-service | Mobile-first F2P workflows, design-time simulation |
| **Beamable** | Unity-and-Unreal SDK + live-ops portal + economy + commerce. "Venus" release shipped 2025. ([Beamable](https://beamable.com/)) | Tier-based SaaS | Indie → AA, Unity-heavy | Native console partner integrations at AAA scale |
| **Nakama (Heroic Labs)** | Apache 2.0 open source: multiplayer, matchmaking, leaderboards, social. ~500k devs, ~1T requests/month. ([GitHub](https://github.com/heroiclabs/nakama)) Self-hosted free; Heroic Cloud is paid managed. Server logic in Go / TypeScript / Lua. | $0 self-hosted → managed pricing | Indie → AA who want code-level control | Out-of-the-box economy primitives (commerce/inventory exist but thinner than UGS/PlayFab) |
| **Metaplay** | Mobile F2P-specific Unity backend. C# game server, MySQL on AWS, Terraform/K8s infra. Server-validated IAP, A/B testing, OTA updates, LiveOps Dashboard. "Metaplay Free" launched Aug 2025. ([Metaplay](https://www.metaplay.io/mobile-f2p)) | Free dev → custom | Mobile F2P specifically (their stated wedge) | Non-Unity, console-first, MMO-scale player-driven economies |

**Internal-only, named for context (you do not compete with these — they don't sell):**
- Epic Online Services (EOS) — Epic's stack, used internally for Fortnite, externally as a free SDK for shipping games on Epic Store. Not a paid B2B product.
- EA Frostbite live services — internal to EA.
- Activision / Blizzard — internal.
- Supercell — fully internal stack, source of much industry talent.
- Riot — internal.
- Tencent / NetEase — internal at scale, occasionally licensed regionally.

### 1b. Design-time / simulation (the spreadsheet replacement)

| Vendor | What it does | Customers | What it does NOT do |
|---|---|---|---|
| **Machinations.io** | Visual node-graph economy modeling, Monte Carlo simulation, balance iteration. Customers: Ubisoft, Gameloft, Wargaming, King. In 400+ academic institutions. ([Machinations](https://machinations.io/)) Tokenomics-positioned for web3 since ~2022. | AA → AAA design teams | Run the live game; it stops at design-time |

**This category is thin.** Machinations is the only well-known dedicated tool. Most studios use Excel/Sheets + custom Python/R notebooks. That's signal.

### 1c. Live-ops / config / analytics (the tuning layer)

| Vendor | What it does | Notes |
|---|---|---|
| **Balancy** | No-code LiveOps + monetization platform: Git-like CMS for economy/balance, A/B testing, segmentation, events, IAP. Founders ex-Wargaming, Nexters, AppsFlyer. YC. ([Balancy](https://balancy.co/)) | Mobile-leaning. Unity Asset Store presence. |
| **deltaDNA** | F2P analytics + personalization. **Acquired by Unity 2019** ([Wikipedia](https://en.wikipedia.org/wiki/DeltaDNA)). Now part of Unity stack. | No longer independent. |
| **GameAnalytics** | Free analytics platform, separate from deltaDNA despite shared origin name. | Free-tier dominant in indie/AA mobile. |
| **Helika** | Web3-first analytics + AI game management. Customers: Ubisoft, Maplestory, Parallel, Yuga Labs, Wildcard, Treasure DAO, Animoca subsidiaries. $10.8M CAD Series A. ([Helika](https://www.helika.io/)) | Heavy web3 lean — useful tell for what isn't covered by web2 stacks. |

**Adjacent but in scope:** GameSparks (Amazon, **shut down 2020**, training-knowledge claim — not re-verified this session), PlayFab predates GameSparks death. Cohort/retention work is mostly Amplitude/Mixpanel cross-industry; nobody pays a game-specific analytics premium.

---

## 2. Economy shapes

The five distinct architectures. A platform that tries to serve all five well will serve none of them well.

### Shape A — Mobile F2P (soft/hard/premium currency + gacha + energy + battle pass)
- **Examples:** Supercell (Clash Royale, Brawl Stars, Squad Busters), King (Candy Crush), Playrix.
- **Primitives:** ≥3 currencies (soft earned, hard premium-purchased, special-event premium), gacha pull tables with disclosed odds in regulated regions, energy regen timers, battle pass with free + paid tracks, IAP-validated server-side, segmentation for personalized offers.
- **Defining math:** PMF design for gacha, retention curves (D1/D7/D30), ARPDAU, ARPPU, LTV cohort modeling, whale economics (top 1% ≈ 50%+ revenue — training claim, not re-verified this session).
- **Scale signal:** Supercell hit ~$1.45–2B in 2024; Brawl Stars alone $662M, Clash Royale $452M. ([Deconstructor of Fun](https://www.deconstructoroffun.com/blog/2025/2/17/supercells-record-year-crushing-it-but-at-what-cost))
- **Who serves it:** Metaplay (purpose-built), Beamable, Balancy, PlayFab, Unity Economy.

### Shape B — Cosmetic-shop live-service (one hard currency + scarcity rotation)
- **Examples:** Fortnite (V-Bucks), Apex Legends (Apex Coins), most battle-royale.
- **Primitives:** single hard currency, rotating item shop, season pass, cosmetic-only items (no power), event-driven scarcity. Currency has no soft/hard distinction — V-Bucks is the whole stack.
- **Defining math:** Conversion rate, repeat-purchase frequency, season-pass attach rate, cosmetic rarity tiers, FOMO modeling on rotation timing.
- **Scale signal:** Epic ~$5.7B revenue 2024 (Fortnite ~80%). Fortnite then declined into 2025; Epic raised V-Bucks pack prices Mar 2026 citing operating costs. ([Sacra](https://sacra.com/c/epic-games/))
- **Who serves it:** AccelByte, PlayFab, internal Epic stack. Mobile F2P stacks fit poorly — wrong primitives.

### Shape C — Sports card market (pack odds + bid/ask transfer market)
- **Examples:** EA Sports FC Ultimate Team (was FIFA UT), MLB The Show Diamond Dynasty, NBA 2K MyTeam.
- **Primitives:** card packs with disclosed pull rates (regulatory in most markets since 2018–2020), real-time auction house with bid/ask, card-collection meta progression, weekly/monthly card refresh, sniper bots are a continuous fraud problem.
- **Defining math:** Pack EV calculation, market clearing prices, anti-bot detection, supply-shock management at card releases.
- **Scale signal:** EA Sports FC 24 hit **$1.71B Q3 FY24** UT revenue alone. EA's "extra content" line was $4.4B in FY25 (≈half is UT + Apex). ([Statista](https://www.statista.com/statistics/274761/electronic-arts-ea-extra-content-revenues/))
- **Who serves it:** Nobody as a B2B product. EA built it themselves. **This is the market with the highest revenue density per game — and the hardest to serve as a platform** because the matched pair (collection + market) is co-designed with the gameplay.

### Shape D — MMO player-driven economy (auction house, gold sinks, real money in play)
- **Examples:** EVE Online, WoW (auction house + token), FFXIV, RuneScape.
- **Primitives:** player-to-player trading, auction houses, currency sinks (repair, taxes, materials), gray-market RMT (real-money trading) the studio fights, sometimes a sanctioned token (WoW Token, EVE PLEX).
- **Defining math:** Money supply, CPI, trade flow, sink/faucet balance — actual monetary economics. CCP publishes a **Monthly Economic Report** for EVE; the December 2025 issue is live. ([EVE MER Dec 2025](https://www.eveonline.com/news/view/monthly-economic-report-december-2025))
- **Scale signal:** Niche player counts, but the most economically interesting category — the only one where studios employ actual economists.
- **Who serves it:** Nobody as a packaged platform. AAA MMOs build their own. Nakama gets close as primitive scaffolding.

### Shape E — Web3 / play-to-earn (dual-token, on-chain assets)
- **Examples:** Axie Infinity (SLP/AXS — collapsed), Star Atlas, Pirate Nation, Parallel.
- **Primitives:** on-chain currency tokens, on-chain NFT assets, breeding/crafting that mints supply, off-chain gameplay actions tied to on-chain rewards.
- **Defining math:** Token supply schedule, sink/faucet at token-economy scale (most fail here — Axie's SLP dual-token is the canonical death spiral), bridge UX, gas costs.
- **Scale signal:** Mostly a graveyard. Helika's 2024 ARPU report claims web3 outpaces web2 monetization ([PR Newswire](https://www.prnewswire.com/news-releases/helikas-2024-arpu--arppu-report-highlights-web3-games-outpace-traditional-games-in-monetization-marking-a-shift-to-blockchain-driven-revenue-models-302356332.html)) — that's a vendor-published claim, treat with skepticism, the surviving population is small and self-selected.
- **Who serves it:** Helika (analytics), Machinations (tokenomics design), the Avalanche/other-chain accelerators. Web2 backends mostly avoid it.

**Worth flagging:** Roblox is its own shape — a UGC marketplace where the "economy" is creator payouts. $4.89B revenue 2025, $1.5B paid to creators 2025, 127M DAU. ([Roblox 10-K](https://www.stocktitan.net/sec-filings/RBLX/10-k-roblox-corp-files-annual-report-7d51454cd829.html)) Not a platform you compete with — a platform that competes with the studios you'd sell to.

---

## 3. Who pays

| Studio tier | Runtime layer | Design-time layer | Live-ops/analytics layer |
|---|---|---|---|
| **Indie (1–10 ppl, <$1M ARR)** | Free tiers (Unity Economy free, PlayFab dev mode, Nakama self-hosted, Metaplay Free) | Excel + free tier of Machinations | GameAnalytics free tier |
| **AA (10–200 ppl, $1M–$100M ARR)** | **Pay here.** PlayFab Standard/Premium, Beamable, Metaplay, AccelByte (mid-tier). Sometimes Nakama + Heroic Cloud. | Machinations paid + custom Python/R notebooks | Balancy, deltaDNA (via Unity), Amplitude/Mixpanel |
| **AAA ($100M+ ARR, top-30 mobile or any major console live-service)** | **Build their own.** Won't trust the ledger to a startup. AccelByte is the exception (KRAFTON-class) — and they raised $60M to earn that trust. | Machinations + heavy internal tooling | Internal data teams + heavy bespoke tooling |

**Where the floor crushes you out:**
- Indies don't pay. The free tiers are good enough.
- Unity owns the engine ~60% of mobile and the bundled economy primitives. Beating "free + already in your IDE" requires non-trivial differentiation.

**Where the ceiling crushes you out:**
- AAA studios have built-it-themselves teams of ex-Supercell engineers. Replacement cost is "fund a real raise + spend years earning ledger trust." AccelByte is the proof that it's possible — and the proof that it's expensive.

**The paying middle (AA) exists, and the existing offerings are crowded:**
- **Mobile F2P AA:** Metaplay, Beamable, PlayFab, Balancy, Unity Economy. Five vendors fighting for the same buyer.
- **Console/PC live-service AA:** AccelByte, PlayFab. Less crowded but bigger checks, longer sales cycles, more compliance work.
- **MMO / sports / web3:** Niche enough that the few players have it locked, or so vendor-specific that there's no platform.

---

## Missing axis (added retroactively)

The (layer × shape) grid above is incomplete. There is a **geographic / market-tier axis** I did not include in the original survey:

- **Global SaaS** — what the entire competitor list above optimizes for. US/EU pricing, App Store / Google Play / Stripe payment rails, English-first dashboards.
- **Asia-Pacific high-ARPU** — JP/KR/CN-tier studios. Internal tooling dominates (Tencent, NetEase, miHoYo); foreign B2B SaaS rarely lands.
- **Global South / Low-ARPU** — Africa, SE Asia, LATAM, India. Mobile-money payment rails (M-Pesa, MTN MoMo, GCash, Pix), low-ARPU economy design, offline-first ledgers, regulatory variance.

For Africa specifically, see [[africa-field-notes]]. Field-verified findings: 85% of African studios <$100K/yr ARR; ads dominate over IAP; only South Africa in Sub-Saharan Africa can legally create a Google merchant account; binding constraint is retention not economy design. The "Africa-optimized economy platform" framing was killed by these findings — see notes for reframing options.

**Worth flagging as a publisher-built infrastructure case study:** Carry1st's **Pay1st** — embedded fintech consolidating mobile money across six African countries, built because no global platform did it. ([Carry1st](https://www.carry1st.com/publishing)) Captive to a publisher; not sold as a B2B tool. Demonstrates the gap is real *and* that the existing solution shape is publisher-services, not SaaS.

This axis matters for any path-A slice — it's orthogonal to (layer × shape), not subsumed by it.

## What this doc doesn't tell you (and won't, by design)

- The math of any specific shape (Markov chains for retention, Monte Carlo for gacha, money-supply control for MMO). Path-A depth on the slice you pick.
- Stack choices: language, database, ledger architecture, what scales to 100M MAU. Path-A.
- Founder-specific feasibility: solo / team / funded changes which slices are actually buildable.
- Wedge claims: where the market is open, what nobody is doing, where the differentiated bet sits. **Earn this only after path A.**

---

## Decision the user owes me next

Pick one cell on the (layer × shape) grid for path A:

| | Mobile F2P (A) | Cosmetic shop (B) | Sports card market (C) | MMO (D) | Web3 (E) |
|---|---|---|---|---|---|
| **Runtime** | A1 | B1 | C1 | D1 | E1 |
| **Design-time** | A2 | B2 | C2 | D2 | E2 |
| **Live-ops** | A3 | B3 | C3 | D3 | E3 |

Where the survey suggests path A is *most worth doing* (if you want to maximize learning per session):
- **A1 (mobile F2P runtime)** — biggest market, most crowded, most defined; you'll learn what 5 vendors are doing wrong.
- **C1 (sports card market runtime)** — highest revenue density per game, no B2B platform exists, EA-built. High ceiling, hard to serve.
- **D1 (MMO runtime)** — most economically interesting, niche scale, only category with sanctioned real economists.

But the right slice is the one that matches what you'd actually want to build. I won't pick for you.

After you pick, path A will cover: existing solutions in that cell at depth, the math, the stack, the failure modes, the white space, and what a wedge in that cell would have to look like. Then we decide whether to design.
