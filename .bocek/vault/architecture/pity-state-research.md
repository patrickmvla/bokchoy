---
type: research
features: [architecture]
related: ["[[wallet-mechanics]]", "[[catalog-versioning]]", "[[idempotency-strategy]]", "[[wedge-decision]]"]
created: 2026-05-02
confidence: medium
provisional: false
---

# Pity-state engine — production patterns and platform stances

## Question

Across published F2P/gacha titles and game-backend platforms, what is (a) the dominant pity-carry-over semantic shape designers expect, and (b) the storage shape — separate authoritative state table vs. derived from event log vs. cached projection — for player-scoped progress counters of pity's class? Question feeds CL-031 sub-decision (i) (pity-state engine A/B/C) which I previously called for design from inferred/medium evidence.

## Triangulation

- **Production reference:** ✓ — Hiro Rewards docs (Go example + JSON config), AccelByte Extend Override loot-box docs, PlayFab Economy v2 FAQ, PlayFab v1 Drop Tables docs, Hiro source repo (interfaces). Four named platforms surveyed for storage shape; four named gacha titles surveyed for carry-over semantics (Genshin Impact, Honkai: Star Rail, Neverness to Everness, Seven Deadly Sins Origin).
- **Docs reference:** ✓ — Microsoft Learn (PlayFab v2 FAQ updated 2026-04-15; v1 Drop Tables updated 2025-05-01), `docs.accelbyte.io`, `heroiclabs.com/docs/hiro`. miHoYo's China-region legally-mandated rate disclosures were NOT directly fetched — carry-over rules sourced via secondary aggregators (game8.co, hoyolab community articles, screenrant). Direct primary-source fetch is an open thread.
- **Contradiction probe:** ✓ — actively searched for designer rationale against carry-over ("should not carry over", "per-banner only", designer rationale). Found academic monetization analysis framing carry-over as the higher-revenue-per-win mechanism. Cross-platform contradiction surfaced organically: Hiro ships pity built-in; AccelByte and PlayFab punt to customer code. Both stances backed by tier-1 platform docs.

## Sources examined

### Heroic Labs — Hiro Rewards documentation
- **Tier:** 2 (official docs; example code is publisher-authored)
- **Provenance:** `https://heroiclabs.com/docs/hiro/concepts/economy/rewards/` (observed 2026-05-02)
- **Author context:** Heroic Labs, owner of Nakama (open-source game backend) and Hiro (commercial metagame layer). Customers cited publicly include Zynga, Paradox, Hothead Games. Mid-budget mobile/console scale.
- **What it tells us:** Hiro ships pity as a built-in system. Storage uses Nakama's storage API with `Collection: "pity", Key: "pity_counter", UserID: userID`. JSON shape: `{"pity": N}`. Example hook signature: `func onPurchaseReward(ctx, logger, nk, userID, source *EconomyConfigStoreItem, rewardConfig *EconomyConfigReward, reward *Reward)`. **Critical: the documented example is per-player single key — NO `banner_id` keying in the published example.** Storage shape is Position A (separate authoritative state) but with much coarser keying than BokChoy's `loot_rolls` schema commits to.

### Heroic Labs — Hiro repo (`github.com/heroiclabs/hiro`)
- **Tier:** 1 (production code, but interfaces only)
- **Provenance:** `https://github.com/heroiclabs/hiro` (observed 2026-05-02), Apache-2.0 for the public interface; implementation distributed as proprietary `hiro.bin` binary
- **Author context:** Same as above
- **What it tells us:** Hiro's *implementation* of pity logic is closed (binary). Public surface is interfaces, JSON config schema, OpenAPI spec, `hiro.proto`. Subsystems exposed: Achievements, Energies, Event Leaderboards, Economy, Inventory, plus `stats.go`, `progression.go`, `streaks.go`. Confirms Hiro positions itself as the *metagame layer* on top of bare-metal Nakama; Nakama core itself does not carry pity primitives.

### AccelByte — Custom loot-box roll Extend Override
- **Tier:** 2 (official docs)
- **Provenance:** `https://docs.accelbyte.io/gaming-services/services/extend/override/loot-box-roll/customize-loot-box-roll/` and the announcement post `https://accelbyte.io/blog/announcing-loot-box-for-accelbyte-gaming-services` (observed 2026-05-02)
- **Author context:** AccelByte, white-label backend. Customers include Bandai Namco, Square Enix, Nexon. Mid-to-AAA scale.
- **What it tells us:** AccelByte ships loot boxes with weighted-probability tables but **no built-in pity counter**. Pity is implemented in the customer's "Extend Override" gRPC service (`service LootBox { rpc RollLootBoxRewardsRequest returns (RollLootBoxRewardsResponse); }`). The reference example uses `Map<String, Integer>` for the counter and the docs explicitly warn: *"For reference only, please use persistent storage to store this record in real world application."* AccelByte provides storage primitives; pity logic and keying are customer code.

### Microsoft — PlayFab Economy v2 FAQ
- **Tier:** 2 (official docs)
- **Provenance:** `https://learn.microsoft.com/en-us/gaming/playfab/features/economy-v2/faq` (page updated 2026-04-15)
- **Author context:** Microsoft / PlayFab team. Hundreds-of-millions-of-active-players claimed scale (per overview).
- **What it tells us:** Economy v2 explicitly omits Drop Tables (the v1 random-table primitive): *"Specifically today Economy V2 doesn't support PlayFab style Coupons, Limited Items, Recharge Item Rates, Drop Tables, or Store Support with Segments."* No mention of pity, gacha, or guaranteed-drop primitives anywhere in the v2 surface. Equivalent functionality is referred to Cloud Script / Azure Functions (customer-implemented).

### Microsoft — PlayFab v1 Drop Tables
- **Tier:** 2 (official docs)
- **Provenance:** `https://learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy/tutorials/drop-tables` (page updated 2025-05-01)
- **Author context:** Same; v1 (legacy) is in maintenance/bugfix mode
- **What it tells us:** v1 Drop Tables are stateless weighted-random tables. APIs: `GetRandomResultTables` (returns config) and `EvaluateRandomResultTable` (returns a single rolled item). No state is persisted between rolls — no pity counter primitive existed even in v1. The closest "guarantee" mechanism is the bundle-shape pattern shown in the docs (e.g., "11-Item Drop" bundle that hard-codes 1 guaranteed Legendary slot + 4 Anything slots + 6 fill slots) — guarantees encoded as bundle-composition, not as player state.

### Genshin Impact / Honkai: Star Rail / Neverness to Everness / Seven Deadly Sins Origin — community-documented carry-over rules
- **Tier:** 4 (community aggregators of player-facing behavior; primary miHoYo/Cygames disclosures not directly fetched)
- **Provenance:** game8.co/games/Genshin-Impact/archives/305937, game8.co/games/Honkai-Star-Rail/archives/409610, dexerto.com/wikis/neverness-to-everness/gacha-system--pity-explained/, game8.co/games/The-Seven-Deadly-Sins-Origin/archives/586823 (all observed 2026-05-02)
- **Author context:** Player-facing community wikis and journalism, often updated by dataminers and active players; not the primary disclosure
- **What it tells us:** **Per-banner-type carry-over** is the modal pattern across surveyed mid-to-AAA gacha shipping in 2024–2026. Genshin: character-pity carries between successive *character* event banners; weapon-pity carries between successive *weapon* event banners; the two types are isolated. HSR: identical shape (character vs. light cone). Neverness: also carries between successive banners of the same category. A *separate* carry-over bit is the 50/50 win-state flag — when a player loses the 50/50, the next pull is guaranteed featured; that flag also carries between same-type banners. **Counter-example:** Seven Deadly Sins Origin documented as per-banner-reset (no carry-over) — *"the draws do not carry over to other banners."* So both shapes are shipped; carry-over is the modal pattern but not universal.

### Academic — gacha monetization analysis
- **Tier:** 4 (peer-reviewed academic, but not engineering)
- **Provenance:** ScienceDirect S1875952125001247 ("Monetization mechanisms in gacha games: pricing, pity systems, belief of luck"), Tsinghua paper at magickd.github.io/papers/gacha.pdf, MDPI 2078-2489/16/10/890
- **Author context:** Academic monetization/behavioral-economics analysis, 2024–2025 publication window
- **What it tells us:** Frames carry-over vs. reset as a deliberate revenue tradeoff: *"reset-after-opt-out mechanism resets the buyer's state at the beginning of the next banner...succeed-after-opt-out mechanism carries the buyer's state from one banner to another...With the reset-after-winning mechanism, the expected cost for each win remains the same, while with the succeed-after-winning mechanism, the expected cost for each win varies, and the varying cost makes it possible to achieve higher seller's revenue."* Confirms the carry-over choice is a deliberate monetization-design lever, not a defaulted technical decision.

## Findings

### Carry-over semantics (R1)

**Modal pattern: per-banner-TYPE carry-over.** The dominant shape in surveyed 2024–2026 gacha is pity keyed on `(player_id, banner_category)`, NOT on `banner_id`. Counter persists across successive *instances* of the same banner-type but is isolated from other types. Examples: Genshin character-banner-pity, Genshin weapon-banner-pity, HSR character-warp-pity, HSR light-cone-warp-pity — four distinct (player, type) counters, each carrying across banner instances of its type. Plus a separate per-(player, type) win-state bit for the 50/50 carry.

**Counter-example:** per-banner-reset (no carry-over) is shipped without reported player backlash by some titles (Seven Deadly Sins Origin, multiple older titles). Per the academic source, this trades reduced per-win revenue for more predictable per-win cost.

The choice is a *product-level monetization decision*, not a technical default. A platform that ships pity must therefore allow customers to choose the keying granularity.

### Storage shape (R2)

**Three distinct platform stances surveyed:**

1. **Hiro: built-in via Nakama storage kv (separate authoritative state table — Position A shape).** Schema is a kv blob in Nakama's storage API. The published example uses `Collection: "pity", Key: "pity_counter"` keyed by `userID` only — single per-player counter, no banner_type discriminator. The implementation is binary-closed; whether the production binary supports more sophisticated keying than the example suggests is not verifiable from public artifacts.

2. **AccelByte: customer-implemented in Extend Override.** Platform provides loot-box rolling without state; pity is the customer's gRPC extension. Documentation emphasizes that any persistence is the customer's responsibility.

3. **PlayFab Economy v2: customer-implemented via Cloud Script / Azure Functions.** Platform deliberately scopes itself to inventory + catalog + bundles; gacha-with-state is referred entirely to serverless customer code. PlayFab v1's Drop Tables were stateless; v2 dropped them entirely.

**No surveyed platform ships Position B (derive from event log).** Hiro is Position A with coarse keying; AccelByte and PlayFab decline to ship pity at all. Position B has zero production-cite from this survey at the platform level — neither in the "ship a pity table" sense nor the "derive pity from a roll log" sense.

**No surveyed platform ships Position C (cached projection).** Same gap as B; not encountered.

## Conflicts

**Hiro built-in vs. AccelByte+PlayFab customer-code is a real platform-stance contradiction.** Both sides are tier-1 platform docs from named vendors with named customers. Per *Contradiction protocol*, neither wins on tier. The conditions under which each wins:

- Hiro-style built-in wins when the platform is positioned as a *vertical metagame product* — Hiro explicitly markets itself as "core metagame systems quickly and reliably." Customers want batteries-included; the cost of bespoke implementations is the friction the product is selling against.
- AccelByte/PlayFab-style customer-code wins when the platform is positioned as *horizontal infrastructure* — the customer's metagame is too varied to standardize, and the platform's job is to provide storage + identity + catalog primitives that the customer composes.

This is directly relevant to BokChoy because `[[wedge-decision]]` positions BokChoy on the *metagame-as-product* side per its "designer-first live-ops UX" framing. The Hiro stance is closer to BokChoy's positioning than the AccelByte/PlayFab stance.

**Carry-over vs. per-banner-reset is a designer-choice contradiction with monetization implications, not a platform-shape contradiction.** Both shapes are shipped by surveyed titles. Per the academic source, neither is technically wrong; they encode different revenue/predictability tradeoffs.

## Conditions

- The "per-banner-type carry-over is modal" finding is bounded to mid-to-AAA mobile gacha shipping in 2024–2026. Older gacha (pre-2020), Western card-pack systems (Hearthstone-shape), and console-only titles were not surveyed.
- Hiro's per-player kv example breaks for any title shipping multiple concurrent banners with independent pity (the Genshin shape). The example is illustrative; the production binary's keying capabilities are not verifiable from public artifacts.
- Position B has no production-cite *for player-state of pity's class*. Event-sourcing-as-source-of-truth is well-established for ledgers (per `[[wallet-source-of-truth-research]]`), but no surveyed game-backend or shipped gacha title applies that pattern to pity counters specifically. Whether B's lack-of-production-cite is "the pattern is novel and untried" or "the pattern is unsuited because pity is hot-read on every roll" is not resolved by this survey.
- The miHoYo China-region legally-mandated rate disclosures were not directly fetched. Carry-over rules are sourced from community aggregators that report on player-facing behavior. Direct primary-source fetch would upgrade tier and confidence.

## Operational implications

For CL-031 sub-decision (i) — pity-state engine — the position-derivation I produced in the prior `/design` turn changes:

1. **Position A (separate authoritative `pity_state` table) gains a production cite** — Hiro ships exactly this shape in its built-in pity system. Confidence on A moves from "inferred / medium" to "production-cited / medium" (medium because Hiro's example schema is coarser than BokChoy needs and the production binary's full capabilities are not verifiable).

2. **Position B (derive from latest `loot_rolls.pity_state_after`) loses its weak ledger-by-analogy support.** No surveyed game-backend platform applies event-sourcing to pity. The structural argument from `[[wallet-source-of-truth-research]]` (path B for the wallet) does not transfer cleanly: pity is hot-read on every roll, not occasionally-audited like the wallet. B becomes "novel-but-coherent" — defensible on first-principles single-source-of-truth grounds, not on production-cite grounds. Honest label going forward: tier-7 (training-data inference / first-principles), not tier-1.

3. **The schema commitment in `[[wallet-mechanics]]` §5 (`pity_state_before`, `pity_state_after` columns on `loot_rolls`) is consistent with B but does not commit to it.** Those columns are useful for audit even if A is the live-state surface — they document the state transition each roll caused, which is valuable for post-incident reconstruction regardless of which path serves reads.

4. **The keying question is the load-bearing one** and is independent of A/B/C. Surveyed gacha shipping carry-over keys pity on `(player_id, banner_type)`, NOT `banner_id` and NOT just `player_id`. BokChoy's `loot_rolls` UNIQUE on `(player_id, banner_id, pull_session_id, attempt_number)` keys *rolls* on `banner_id`, but the *state* needs a coarser key. This means a `banner_type` discriminator (or equivalent) belongs in the `[[catalog-versioning]]` `loot_table` schema — not in `loot_rolls`. Cascade obligation if `/design` proceeds: amend `[[catalog-versioning]]`'s `loot_table` (or equivalent catalog item) to expose a `banner_type` / `pity_class` field, and document the lookup path used to map `banner_id → banner_type` at roll time.

5. **The product-level question (per-banner-type carry-over vs. per-banner reset) is a customer-product decision BokChoy ships *to* its customers, not one BokChoy makes for them.** Either carry-over shape must be configurable. The platform decision is whether to ship pity built-in at all (Hiro stance) or punt to customer code (AccelByte/PlayFab stance). `[[wedge-decision]]`'s metagame-as-product positioning argues for the Hiro stance.

## Reproducibility note

Reproducible via the WebFetches above: Hiro Rewards doc, Hiro repo, AccelByte Extend Override loot-box doc, PlayFab v2 FAQ, PlayFab v1 Drop Tables doc. Genshin/HSR carry-over rules are documented redundantly across many secondary sources; primary miHoYo China-region disclosures (legally mandated) are publicly accessible but were not directly fetched in this session — direct fetch would strengthen R1 tier from 4 to 2.

One judgment is load-bearing and would not perfectly reproduce: my characterization of Hiro's per-player example as "too coarse for Genshin-shape gacha." This is an inference from the doc's example snippet, not a Hiro statement of the binary's limits. A direct trial of Hiro (commercial license required) would resolve.

## Open threads

- **Direct fetch of miHoYo China-mandated rate disclosures** — would upgrade R1 from tier-4 community aggregators to tier-2 official primary source. Worth doing if the BokChoy customer-product decision around carry-over needs harder evidence than community wikis.
- **Hiro production-binary capabilities** — whether Hiro's commercial pity supports `(player, banner_type)` keying or only the per-player example shown. Resolvable only via trial license or direct vendor inquiry.
- **Card-pack pity (Hearthstone "guaranteed Legendary by pack 40"; Marvel Snap card-acquisition guarantees)** — different genre, different shape; would provide additional evidence for the per-(player, set) keying pattern. Not surveyed; would extend R2.
- **Pity-on-event-log production cite** — does any non-game-backend system (event-sourced loyalty programs, points-with-tier-thresholds CRMs) apply derive-from-event-log to a hot-read counter of pity's class? If yes, B regains tier-1 backing from an adjacent domain. Not surveyed.
- **Sub-decisions (ii) seed format / PRF construction and (iii) PRF-output → roll mapping** — explicitly out of scope this session per the budget. Next research session if `/design` requires.
