---
type: decision
features: [architecture]
related: ["[[pity-engine-scope]]", "[[loot-rng-construction]]", "[[loot-rng-output-research]]", "[[wallet-mechanics]]", "[[catalog-versioning]]", "[[mvp-feature-sequence]]"]
created: 2026-05-03
confidence: medium
---

# Within-roll composition scope — P2-strict (customer-built, no platform helpers)

## Decision

Within-roll composition logic — no-duplicates-within-bundle, slot-by-slot composition with per-slot guarantees, multi-item draws of any shape — is **NOT** a BokChoy platform primitive at MVP. BokChoy ships:

- A **single-item-per-call** `loot_roll(loot_table_id, seed_inputs)` server function. Per `[[loot-rng-construction]]`, it instantiates HMAC_DRBG, draws bytes via rejection sampling, returns one item from `loot_table.items` plus the audit row in `loot_rolls`.
- A **documented reference composition implementation** in customer-extension code, shipped as a docs artifact (extension to the `[[pity-engine-scope]]` F1 reference impl). Includes patterns for: no-duplicates-within-bundle (exclusion-set + retry on duplicate), slot-by-slot composition (K calls each with a different `loot_table_id`), and slot guarantees (the "one Legendary slot + N Anything slots" PlayFab pattern).

BokChoy does **NOT** ship:

- A `loot_roll_excluding(loot_table_id, seed_inputs, exclude_set)` platform variant.
- A `max_repeats_within_roll` field on `loot_table` in `[[catalog-versioning]]`.
- A "roll session" platform concept that ties together multiple `loot_roll` calls under shared constraints.

Customer game-server code composes K-item bundles by:

1. Looking up the bundle's per-slot `loot_table_id` mapping (customer-defined — could be in catalog metadata as customer config, or in customer-side game data).
2. For each slot, calling `loot_roll(slot_loot_table_id, seed_inputs_with_slot_attempt_number)`.
3. If no-duplicates-within-bundle is desired: maintaining an in-extension-scope exclusion set, checking each result against it, calling `loot_roll` again with `attempt_number += 1` on collision.

## Reasoning

Human's defense: *"the research is the best pushback we can have"* — accepting that the 4-platform survey converged on the contested split (Hiro and AccelByte ship platform-level no-duplicates; PlayFab and Hearthstone do not) and further research wouldn't resolve it because the choice is positioning-dependent, not evidence-dependent.

Substantive defense for P2-strict over P2-with-helper / P2-with-config:

1. **Surveyed evidence is contested, not convergent.** Per `[[loot-rng-output-research]]`: 2-of-4 platforms ship within-roll no-duplicates at platform level (Hiro, AccelByte); 2-of-4 leave it to bundle/product-level composition (PlayFab, Hearthstone). 2-of-4 is not a clean signal. (production-cited / medium — the contested-split is itself the finding from `[[loot-rng-output-research]]`)

2. **P2-strict matches `[[pity-engine-scope]]`'s posture.** Pity rules are customer-monetization-design levers; pity logic lives in customer-extension code. Within-roll no-duplicates is *also* game-mechanics composition — same logical class. Shipping a platform helper for one composition rule (no-duplicates) but not others (slot guarantees, weighted-pity, multi-banner-aggregation) draws an arbitrary line. Either platform owns composition or it doesn't. P2-strict says it doesn't. (inferred / high — symmetry argument with `[[pity-engine-scope]]` framework)

3. **Customer code for within-roll filtering is small.** Per the reference impl pattern: maintain `Set<item_id>` in extension scope; on each `loot_roll` result, if `result.item_id ∈ exclusion_set`, call again with `attempt_number += 1`; otherwise add to set and return. ~10 lines. Same shape as the reference pity impl from `[[pity-engine-scope]]` F1 — these can be documented together. (inferred / high — direct construction)

4. **P2-with-helper is the half-measure that costs platform code without clear differentiation.** A `loot_roll_excluding` variant adds a platform surface that's only useful for one specific composition pattern (no-duplicates). Other patterns (slot guarantees, multi-stage rolls) still require customer composition. Either you commit to platform-owned composition (which contradicts P2 globally) or you don't. (inferred / medium — slippery slope argument; defensible but not rigorous)

5. **P2-with-config opens a new platform-level concept ("roll session") that has its own design surface.** A `max_repeats_within_roll` field on `loot_table` only makes sense if `loot_roll` knows what "this roll" vs. "a different roll" means. That requires either a `roll_session_id` parameter (customer must supply, opening tracking concerns) or platform-side session tracking (state across calls — which contradicts the per-call deterministic seed model from `[[loot-rng-construction]]`). Cascading complexity for a feature whose customer demand is unproven. (inferred / medium — second-order-effect argument)

## Engineering substance applied

- **Trust boundary.** Single-item `loot_roll` keeps the boundary at the same place as `[[pity-engine-scope]]` — caller controls inputs, BokChoy owns the deterministic computation + audit row write, customer composes higher-level rules in extension code. P2-with-helper or P2-with-config would move the boundary inward without consistent rationale.
- **Determinism.** Each `loot_roll` call is independently deterministic per its `seed_inputs` (which include `attempt_number`). Customer-side composition that retries on duplicate produces a deterministic-by-construction outcome: same `(loot_table_id, banner_id, player_id, pull_session_id, sequence_of_attempt_numbers)` always produces the same bundle. Replay safety is preserved.
- **Failure semantics.** Customer's exclusion-set logic must be implemented inside the customer's transaction (same `SELECT FOR UPDATE` discipline as the reference pity impl). The platform doesn't enforce composition correctness; customer's reference impl shows the safe pattern.
- **Observability.** Each `loot_roll` row in `loot_rolls` carries `attempt_number`. A K-item bundle produces K rows in `loot_rolls`, each with monotonically-increasing `attempt_number` for that `(player, banner, pull_session)` tuple. Reconstruction of which roll completed the bundle is straightforward via the audit log.

## Production-grade gates

- **Idiomatic.** P2-strict matches the `[[pity-engine-scope]]` precedent for game-mechanics-composition-as-customer-code. Surveyed split shows half of game-backend platforms ship the same scope; 2 of 4 named platforms (PlayFab, Hearthstone-via-Blizzard's-design-philosophy) leave composition to bundle/product-level.
- **Industry-standard.** PlayFab v1 Drop Tables (Microsoft Learn, observed 2026-05-03) treats slot-composition as bundle metadata, not a platform RNG primitive. Hearthstone's slot guarantees and within-pack duplicate caps are product-level design encoded in the game client / server, not exposed as a platform API. Two named systems treat composition as out-of-scope-for-RNG-primitive.
- **First-class.** Uses BokChoy's existing `loot_roll` primitive + customer extension hooks (Postgres functions). No new platform abstractions; no new schema fields. Customer composition is plain Postgres / app-code.

## Rejected alternatives

### P2-with-helper — ship `loot_roll_excluding(loot_table_id, seed_inputs, exclude_set)`
**What:** Platform variant of `loot_roll` accepting an exclusion set. Customer composes K calls with a growing exclusion set; the variant filters items in the exclusion set out of the cumulative-weight bucket before drawing.
**Wins when:** No-duplicates-within-bundle is the dominant composition pattern AND customer demand for it is empirically demonstrated AND the platform team is willing to maintain a second `loot_roll` surface.
**Why not here:** No empirical customer-demand signal yet. Adds platform surface (~20 lines of Postgres function + tests + docs + CI lint extension) to solve one specific composition pattern; other patterns still need customer code. Slippery slope: each subsequent customer-requested composition rule (slot guarantees, weighted re-roll, sliding-window pity) has the same pull-toward-platform argument. Either commit to platform-owned composition or don't.

### P2-with-config — `max_repeats_within_roll` field on `loot_table`
**What:** `loot_table` schema in `[[catalog-versioning]]` adds a config field; `loot_roll` honors it across some "roll session" identifier.
**Wins when:** Composition rules are stable enough across customers to encode in catalog config AND a "roll session" platform concept is acceptable.
**Why not here:** Requires either customer-supplied `roll_session_id` (opening session-tracking concerns and customer-side surface) or platform-side session state (contradicting the per-call deterministic seed model from `[[loot-rng-construction]]`). Adds a platform-level concept whose customer demand is unproven. P2-with-config opens more design surface than it closes.

### Hiro/AccelByte-style platform-level no-duplicates (a stronger version of P2-with-config)
**What:** Ship `max_repeats` / `max_repeat_rolls` config + cumulative cross-roll guarantees as platform features.
**Wins when:** The platform is positioned as a vertical metagame product (Hiro's stance per `[[pity-engine-scope]]`).
**Why not here:** Same rejection argument as P1 in `[[pity-engine-scope]]` — wedge does not require this; customer base is heterogeneous; monetization-lever ownership belongs with the customer. Already vaulted under `[[pity-engine-scope]]`'s P1 rejection.

## Failure mode

**F1 — Customer extension implements within-roll filtering incorrectly.** Customer's filter loop has an off-by-one in the `attempt_number` increment, or fails to handle the "exhausted-table" edge case (`exclusion_set == loot_table.items`), and produces wrong rolls or infinite loops. (inferred / high — standard customer-code-error class)

**F2 — Customer reports "your gacha is broken" when the actual issue is their composition logic.** Same audit-opacity concern as `[[pity-engine-scope]]` F3 — `loot_rolls` rows are correct in isolation, but the customer's K-call sequence produces a result the customer didn't expect. BokChoy support cannot diagnose without reading customer extension code. (inferred / medium — operational support tax)

**F3 — Reference impl pattern doesn't generalize.** A customer with an unusual composition (Hearthstone-style "no more than 2 of any common per pack") finds the reference impl's exclusion-set example doesn't fit. Customer either improvises (risk: F1) or files a "platform should support this" ticket (risk: spec drift toward P2-with-helper / P2-with-config under inconsistent pressure). (inferred / medium — composition diversity is real)

## Mitigations

**F1 — Reference composition implementation in docs.** Extension to `docs/extensions/reference-pity.md` (or equivalent path) per `[[pity-engine-scope]]` F1 mitigation. Documents the canonical patterns: no-duplicates-within-bundle (exclusion-set + retry), slot-by-slot composition (K calls each with a different `loot_table_id`), slot guarantees (the "Legendary slot + Anything slots" PlayFab shape). Includes the exhausted-table edge case (return remaining items as-is or raise an error) and the `attempt_number` hygiene rules. ~30 minutes of additional docs writing on top of the pity reference impl.

**F2 — Recommended log-shape conventions in docs.** When customer reports a composition bug, support response: "share your slot-by-slot `loot_rolls` rows for `(player, banner, pull_session)`, plus your bundle definition." If customer follows the reference-impl conventions (logging the bundle definition + slot mapping in their extension's own audit), diagnosis is tractable.

**F3 — Document the explicit "if your composition isn't in this reference impl, you write it yourself" stance.** Set the expectation upfront. Customers with unusual compositions get full Postgres + extension flexibility — that's the upside of P2-strict. The downside is they don't get a one-line config; that's the cost of consistency with `[[pity-engine-scope]]`. Surface a "compositions-we-don't-ship-and-why" section in the docs.

## Cascade obligations

1. **Reference composition implementation extension** — extend `[[pity-engine-scope]]` F1 reference pity impl to include the within-roll composition patterns from F1 mitigation above. Same docs artifact, additional sections. ~30 min of writing on top of the pity reference. MVP commitment per `[[mvp-feature-sequence]]`.
2. **Cancel `[[catalog-versioning]]` `max_repeats_within_roll` cascade** — preventative; the catalog-versioning entry never wrote this field. P2-with-config rejection means it stays out.
3. **Update `[[loot-rng-construction]]` cascade item 6** — already updated to reference this entry.
4. **CL-031 fully resolved.** Sub-decisions (i) moot under `[[pity-engine-scope]]`, (ii) resolved in `[[loot-rng-construction]]`, (iii.a)+(iii.c) absorbed into `[[loot-rng-construction]]` items 6+7, (iii.b) resolved here. CL-031 closes.

## Idiom citations

None directly — system-scope policy decision, parallel in shape to `[[pity-engine-scope]]`.

## Revisit when

- **≥3 paying customers implement near-identical no-duplicates-within-bundle filter loops OR file "where's your no-dup helper?" tickets.** Signal to upgrade to P2-with-helper. Quantitative threshold; trackable in support metrics.
- **A customer's composition genuinely cannot be expressed in the reference impl pattern** (e.g., requires platform-side session state). Re-evaluate whether the reference impl needs a new pattern OR whether platform support is justified.
- **BokChoy's positioning shifts from primitives platform to vertical metagame product** — would change the wedge argument and re-open P2-with-helper / P2-with-config (also re-opens `[[pity-engine-scope]]`'s P1).
- **A composition-related correctness incident reaches production at a paying customer** (e.g., F1 manifests, customer ships an off-by-one filter loop). Forces the safe-pattern from the reference impl into platform code (partial P2-with-helper) or stricter customer-onboarding gates.
