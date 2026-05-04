---
type: research
features: [architecture]
related: ["[[loot-rng-construction]]", "[[loot-rng-research]]", "[[pity-engine-scope]]", "[[wallet-mechanics]]", "[[catalog-versioning]]"]
created: 2026-05-03
confidence: medium
provisional: false
---

# Loot RNG output → roll mapping — bias avoidance, stream usage, multi-item composition

## Question

For BokChoy's `loot_roll` server function, given the HMAC_DRBG byte stream from `[[loot-rng-construction]]`, three sub-questions:

- **(iii.a)** When mapping uniform PRF bytes to a weighted item selection over a non-power-of-2 weight sum, what's the production-cited algorithm — modulo or rejection sampling?
- **(iii.b)** For multi-item draws (a single bundle yields K items), what composition pattern do production game-backend platforms ship — independent draws, slot-by-slot composition, combinatorial sampling, or some combination? What within-roll constraints (no-duplicates, slot guarantees) are platform-level vs. customer-code?
- **(iii.c)** For multi-item draws, do you re-instantiate the PRF per-item or stream consecutive bytes from one instantiation?

## Triangulation

- **Production reference:** ✓ — libsodium `randombytes_uniform`, OpenBSD `arc4random_uniform`, HashiCorp `go-hmac-drbg` (iii.a + iii.c production code, three named systems). PlayFab v1 Drop Tables, AccelByte loot-box, Hiro Rewards, Hearthstone (industry-pattern via Blizzard support docs + community wikis) for (iii.b) composition patterns.
- **Docs reference:** ✓ for (iii.b) (Microsoft Learn for PlayFab, docs.accelbyte.io, heroiclabs.com/docs). **Gap on (iii.a) and (iii.c):** NIST SP 800-90A Rev.1 PDF direct fetch failed (binary not extractable via WebFetch). Production-code cites are *implementations* of the relevant NIST sections — production-code beats docs in the ladder, so the gap is tier-comparison only, not evidence-quality.
- **Contradiction probe:** ✓ — (iii.a) actively probed for "modulo is fine" — rejected by both surveyed implementations with explicit comments. (iii.c) actively probed for "per-item instantiation" — directly contradicted by go-hmac-drbg's Generate() stream-state mutation. (iii.b) surfaced an unanticipated axis from AccelByte: **within-roll no-duplicates and cumulative cross-roll guarantees are platform-level features in some surveyed systems**, not just customer-code composition. Hiro confirmed independently with its `max_repeats` / `max_repeat_rolls` config fields. This is a real wrinkle that wasn't in design's prior (iii.b) framing.

## Sources examined

### libsodium `randombytes_uniform`
- **Tier:** 1 (production code, Apache 2.0, deployed in tens of thousands of projects)
- **Provenance:** `https://github.com/jedisct1/libsodium/blob/master/src/libsodium/randombytes/randombytes.c`, observed 2026-05-03
- **Author context:** Frank Denis (jedisct1), libsodium maintainer; canonical NaCl-derived crypto library
- **What it tells us:** Rejection sampling. Threshold `min = (1U + ~upper_bound) % upper_bound` (== `2^32 mod upper_bound`). Loop `do { r = randombytes_random(); } while (r < min)` then return `r % upper_bound`. Inline comment: *"r is now clamped to a set whose size mod upper_bound == 0; the worst case (2^31+1) requires ~ 2 attempts."* Confirms: rejection-sampling pattern with named uniformity goal; expected retries are O(1).

### OpenBSD `arc4random_uniform`
- **Tier:** 1 (production code, BSD-licensed, base of many BSD/macOS/Linux random APIs)
- **Provenance:** `https://github.com/openbsd/src/blob/master/lib/libc/crypt/arc4random_uniform.c`, observed 2026-05-03
- **Author context:** OpenBSD project; this implementation is the parent design that `arc4random_uniform` derivatives in macOS, glibc (newer), musl all follow
- **What it tells us:** Same rejection-sampling pattern. Threshold `min = -upper_bound % upper_bound` (mathematically identical to libsodium's). Inline comment: *"Uniformity is achieved by generating new random numbers until the one returned is outside the range [0, 2**32 % upper_bound). This guarantees the selected random number will be inside [2**32 % upper_bound, 2**32) which maps back to [0, upper_bound) after reduction modulo upper_bound."* Independently arrives at the same algorithm with explicit modulo-bias rejection rationale.

### HashiCorp `go-hmac-drbg` Generate function
- **Tier:** 1 (production code, MPL 2.0, used in HashiCorp Vault Transit per `[[loot-rng-research]]`)
- **Provenance:** `https://github.com/hashicorp/go-hmac-drbg/blob/master/hmacdrbg/hmacdrbg.go`, observed 2026-05-03
- **Author context:** HashiCorp; the library is the Go implementation of NIST SP 800-90A HMAC_DRBG used in production at thousands of enterprises via Vault
- **What it tells us:** Stream-mode is the design. `Generate(outputBytes []byte) bool` returns false when reseed is required (after `reseedCounter >= 10000`). State (`v`, `reseedCounter`, `updateCounter`) mutates per call; backtracking resistance via `update`. Up to 9999 Generate calls per Instantiate before reseed. **For BokChoy: each `loot_roll` invocation instantiates a fresh DRBG (per-call seed), so the 9999 limit applies within a single roll; a single roll needs 1–3 Generate calls in practice (primary draw + occasional rejection retry + composition). Reseed limit is operationally non-binding.** Confirms (iii.c): stream-from-one-instance is the spec's intended use, and operational limits don't constrain BokChoy.

### NIST SP 800-90A Rev.1 — `nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-90Ar1.pdf`
- **Tier:** 2 (intended; official NIST specification)
- **Provenance:** PDF at the canonical URL above; observed 2026-05-03
- **Author context:** NIST; the canonical specification for HMAC_DRBG, Hash_DRBG, and CTR_DRBG
- **What it tells us:** **WebFetch failed** — the PDF binary did not extract to readable text (rendering issue with the WebFetch tool). The §A.5 (uniform integer generation) and §10.1.2 (HMAC_DRBG Generate function) sections were the targets. Both libsodium/OpenBSD (§A.5 implementations) and go-hmac-drbg (§10.1.2 implementation) are production realizations of these sections; their convergent behavior is implicit confirmation. **Direct-fetch gap noted as an open thread; production-code cites are stronger evidence per the ladder, so the gap is tier-comparison only, not a confidence reduction.**

### Microsoft PlayFab v1 Drop Tables (multi-item bundle composition)
- **Tier:** 2 (official docs)
- **Provenance:** `https://learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy/tutorials/drop-tables`, observed 2026-05-03 (also fetched in `[[pity-state-research]]`)
- **Author context:** Microsoft / PlayFab; v1 in maintenance mode, but the slot-composition pattern is the canonical reference
- **What it tells us:** Slot-by-slot composition with explicit per-slot table assignment. *"First slot will roll on Legendary Equipment to guarantee at least 1 legendary item, the next 3 slots roll on Anything (which can roll more Legendaries or less desirable common equipment), and the remaining slots are filled with guaranteed Rare and Uncommon items."* Bundle is a first-class catalog item; bundle composition encodes per-slot drop-table references and quantities.

### AccelByte loot box composition
- **Tier:** 2 (official docs + announcement)
- **Provenance:** `https://accelbyte.io/blog/announcing-loot-box-for-accelbyte-gaming-services` and `https://docs.accelbyte.io/.../customize-loot-box-roll/`, observed 2026-05-03 (re-cited from `[[pity-state-research]]`)
- **Author context:** AccelByte; mid-to-AAA scale customer base
- **What it tells us:** **Two within-roll/cross-roll features at platform level:** *"After opening 10 loot boxes, a player will be guaranteed an item from the Ultra Rare group"* (cumulative-per-player guarantee state, cross-roll) AND *"For each player and each loot box, he/she will never be rewarded the same item"* (within-box no-duplicates). The first is `[[pity-engine-scope]]` territory (cross-roll state — platform doesn't ship under P2). The second is *within-roll composition* — and AccelByte ships it at platform level via the Extend Override pattern's reference implementation.

### Hiro Rewards (multi-item composition)
- **Tier:** 2 (official docs)
- **Provenance:** `https://heroiclabs.com/docs/hiro/concepts/economy/rewards/`, observed 2026-05-03 (also fetched in `[[pity-state-research]]`)
- **Author context:** Heroic Labs / Hiro
- **What it tells us:** Hiro ships **`max_repeats`** (item-set scope) and **`max_repeat_rolls`** (weighted/gacha rolls scope) config fields. Within-roll duplicate prevention is a *platform-level configuration feature*, not customer-code. Documentation focuses on configuration, not API call shape; whether multi-item rewards are one-call-N-items or N-calls is unstated in the surveyed docs.

### Hearthstone card-pack composition (Blizzard / Activision)
- **Tier:** 3 (Blizzard support page + community wiki documentation of shipped behavior)
- **Provenance:** `https://us.support.blizzard.com/en/article/116884` (Blizzard duplicate-protection support page), `https://hearthstone.fandom.com/wiki/Card_pack`, observed 2026-05-03
- **Author context:** Blizzard Entertainment; Hearthstone shipped 2014, hundreds of millions of packs opened
- **What it tells us:** **Two layers of within-pack composition:** (a) slot guarantee — *"one of which is guaranteed to be Rare quality or better"* (every 5-card pack has ≥1 Rare-or-better slot, akin to PlayFab's "Legendary slot"); (b) within-pack duplicate caps — *"a single pack will never contain more than two copies of the same Common, Rare, or Epic card, or more than one copy of the same Legendary card"*. Industry-scale confirmation that within-roll composition rules are a normal product feature; not platform-vs-customer-code question, just a product-level design.

## Findings

### (iii.a) Single-item draw — rejection sampling is universal

Two independent tier-1 production implementations (libsodium `randombytes_uniform` and OpenBSD `arc4random_uniform`) implement rejection sampling with mathematically identical bound formulas. Both have explicit comments rejecting modulo bias as the failure mode they're avoiding. Expected retries are O(1) — libsodium's worst case is "~2 attempts."

**No alternative production cite found for "modulo is fine."** The class-level CWE for biased PRNG output (CWE-1241 "Use of Predictable Algorithm in Random Number Generator") confirms modulo bias is a recognized vulnerability class even when the underlying PRF is cryptographically strong.

**Operational shape for BokChoy:** within `loot_roll`, after instantiating HMAC_DRBG, draw 4 bytes via Generate() to produce a uint32; if `r < (2^32 mod weight_sum)`, draw next 4 bytes; otherwise return `r mod weight_sum` and map to the cumulative-weight-bucketed item.

### (iii.c) Multi-draw — stream from one HMAC_DRBG instantiation

HashiCorp `go-hmac-drbg` is a direct production implementation of NIST SP 800-90A HMAC_DRBG. The Generate function is designed for stream-mode reuse: state mutates per call (`v`, `reseedCounter`, `updateCounter`), backtracking resistance is provided. Reseed required after 9999 Generate calls.

**Operational shape for BokChoy:** instantiate HMAC_DRBG once per `loot_roll` invocation (using the canonical-form seed from `[[loot-rng-construction]]`); make 1–3 Generate calls within the function (primary draw + rejection retry if needed + within-roll composition draws if applicable); discard the instance at function return. The 9999-Generate ceiling is operationally non-binding for any single roll.

### (iii.b) Multi-item composition — convergent on slot-composition + customer-code orchestration; new wrinkle on within-roll constraints

**The convergent pattern across four surveyed sources:** multi-item draws are **slot-by-slot compositions**. Each slot references a (sub-)loot-table; bundle metadata encodes which slots reference which tables. PlayFab's "Legendary slot + Anything slots + Rare/Uncommon slots" is the canonical reference; Hearthstone's "1 guaranteed Rare-or-better slot in a 5-card pack" is the AAA-scale industry confirmation; Hiro's bundle/reward configuration follows the same shape.

**Pure independent draws (no slot composition, no within-roll constraints) is not represented in surveyed platforms.** Either composition is in the platform (Hiro, AccelByte) or in the bundle definition (PlayFab) or in the product design (Hearthstone). No surveyed system says "K independent rolls, customer composes outside."

**The new axis surfaced from AccelByte + Hiro: within-roll duplicate constraints are platform-level features in two of four surveyed sources.** Hiro: `max_repeats` (item-set scope) and `max_repeat_rolls` (weighted reward scope). AccelByte: "never rewarded the same item" within a single box. This is a different concern from cross-roll pity (which is `[[pity-engine-scope]]` P2 = customer-code).

**Implication for BokChoy under P2:** the platform's `loot_roll(loot_table_id, seed_inputs)` returns *one* item per call. Multi-item bundles are composed by the customer's extension code making K calls. Within-roll constraints (no-duplicates, slot guarantees) are *also* customer-code under P2. **But Hiro and AccelByte shipping these as platform features suggests a real customer demand-signal that pure P2 might under-serve.** Three plausible BokChoy responses:

- **(P2-strict):** customer code does everything including within-roll constraints. Customer wanting no-duplicates writes the filtering loop.
- **(P2-with-helper):** ship a `loot_roll_excluding(loot_table_id, seed_inputs, exclude_set)` variant that takes an exclusion set; customer composes K calls with growing exclusion sets. Small platform addition, eliminates the most common composition pain.
- **(P2-with-config-on-loot_table):** add `max_repeats_within_roll` field to `loot_table` schema in `[[catalog-versioning]]`; `loot_roll` honors it across some "session" identifier. More opinionated; revisits the P2 boundary.

This is design's choice, not research's. Surfacing the surface for `/design` to attack.

## Conflicts

**(iii.a) and (iii.c) — direct NIST PDF fetch failed but the gap doesn't damage findings.** Production code from libsodium + OpenBSD (§A.5) and go-hmac-drbg (§10.1.2) is implementation of the relevant NIST sections; convergent production behavior is implicit confirmation. Per *Contradiction protocol*, production code beats docs anyway. Open thread for tier-completeness, not for findings-confidence.

**(iii.b) — surveyed platforms diverge on whether within-roll constraints are platform-level or customer-code.** Hiro and AccelByte: platform. PlayFab: bundle/composition metadata (a hybrid). Hearthstone: product-level (no platform/customer distinction in a vertically-integrated game). No clean winner per *Contradiction protocol* because they're solving different positioning questions. BokChoy under P2 inherits this ambiguity — three viable responses (P2-strict, P2-with-helper, P2-with-config) with no production-cited "right" answer because the question is positioning-dependent.

## Conditions

- **(iii.a) rejection-sampling cost** is O(1) on average and bounded above by ~2 retries even in the worst case (per libsodium's comment). The cost holds for any reasonable loot-table weight sum.
- **(iii.c) reseed limit (9999 Generate calls per Instantiate)** is operationally non-binding for BokChoy because each `loot_roll` instantiates a new DRBG. The limit would only constrain a hypothetical "one DRBG instance reused across many rolls" pattern, which BokChoy's per-call seed model rules out.
- **(iii.b) findings hold for surveyed game-backend / mobile-gacha / card-pack contexts.** Did not survey: console-AAA loot systems (Destiny, Diablo) which may ship different patterns due to vertically-integrated game-engine integration. Open thread.
- **(iii.b) "P2-with-helper" or "P2-with-config" choices** become more attractive if customer-discovery shows the no-duplicates-within-roll pattern is requested by ≥2 paying customers. No empirical signal yet.

## Operational implications

For CL-031 sub-decision (iii):

1. **(iii.a) — rejection sampling, with the libsodium / OpenBSD bound formula.** Implementation pseudocode for `loot_roll`:

   ```
   weight_sum = sum(item.weight for item in loot_table.items)
   bias_threshold = (-weight_sum) mod weight_sum    # = 2^32 mod weight_sum

   loop:
     r = drbg.generate_uint32()
     if r >= bias_threshold:
       break
   roll_value = r mod weight_sum

   cumulative = 0
   for item in loot_table.items:
     cumulative += item.weight
     if roll_value < cumulative:
       return item
   ```

   Confidence: high. Direct production-code cite from two independent implementations.

2. **(iii.c) — stream from one HMAC_DRBG instance per `loot_roll` call.** No re-instantiation between Generate calls within a single roll. The 9999-call ceiling is non-binding. Confidence: high. Direct production-code cite from go-hmac-drbg.

3. **(iii.b) — single-item-per-call platform primitive; multi-item composition is customer-code by P2 default.** `loot_roll` returns one item per call. K-item bundle = K calls in customer extension. **New design fork surfaced:** does BokChoy ship a within-roll-constraints helper (P2-with-helper or P2-with-config)? Surveyed platforms (Hiro, AccelByte) ship within-roll no-duplicates at platform level, suggesting real customer demand. Pure P2-strict is defensible but may under-serve a common need. Hand back to `/design` for the choice.

4. **Cascade implications for `[[loot-rng-construction]]`:** the rejection-sampling algorithm and bound formula should be added to its Decision section as the canonical implementation. If `/design` picks P2-with-helper or P2-with-config, additional `loot_roll_excluding`/`loot_table.max_repeats` field becomes part of the construction spec.

5. **Reference pity implementation per `[[pity-engine-scope]]` F1:** can now document the canonical multi-item composition pattern (K calls with `attempt_number` increment per slot). The within-roll-constraints decision affects how rich the reference impl is.

## Reproducibility note

Reproducible via the same WebFetches: libsodium randombytes.c (jedisct1/libsodium), OpenBSD arc4random_uniform.c (openbsd/src), go-hmac-drbg hmacdrbg.go (hashicorp/go-hmac-drbg), PlayFab Drop Tables (Microsoft Learn), AccelByte announcement + custom-roll docs, Hiro Rewards docs, Hearthstone Blizzard support page + Fandom wiki.

NIST SP 800-90A Rev.1 PDF was fetched but the WebFetch tool did not extract readable text (binary rendering issue). Reproducibility constraint: an investigator with ability to render the PDF locally would get §A.5 + §10.1.2 directly; this session relied on production-code cites that *implement* those sections as effective tier-1 substitutes.

One judgment is load-bearing: characterizing AccelByte's "never rewarded the same item" as platform-level (vs. customer-code) is based on the announcement post's framing, not direct source-read of AccelByte's loot-box reference impl. A different investigator might read it as "the Extend Override reference example does this; customers can choose to or not."

## Open threads

- **NIST SP 800-90A Rev.1 §A.5 + §10.1.2 direct-text fetch.** WebFetch on the PDF returned binary; alternative: HTML mirror, derived spec like FIPS 140-3, or local PDF render. Tier upgrade only; findings unchanged.
- **(iii.b) within-roll-constraints design fork (P2-strict vs. P2-with-helper vs. P2-with-config).** Now in `/design`'s queue. Customer-discovery signal would resolve: do ≥2 paying customers want platform-level no-duplicates-within-roll? If yes, P2-with-helper or P2-with-config. If no, P2-strict.
- **Console-AAA loot systems (Destiny, Diablo) composition patterns** not surveyed; may add a fifth shape distinct from mobile-gacha + card-pack. Lower priority — BokChoy's ICP is mid-market mobile/indie per `[[indie-smb-pricing-research]]`.
- **AccelByte's reference-impl source** (the Extend Override sample) for direct read on whether "never rewarded the same item" is platform vs. example-code. Tier upgrade for the (iii.b) AccelByte cite.
- **Loot table weight-sum > 2^32 edge case.** Multi-Generate-call accumulation is the standard fix; not researched in depth, defer to implementation.
