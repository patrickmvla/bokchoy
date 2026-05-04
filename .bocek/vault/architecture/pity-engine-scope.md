---
type: decision
features: [architecture]
related: ["[[pity-state-research]]", "[[wallet-mechanics]]", "[[catalog-versioning]]", "[[wedge-decision]]", "[[idempotency-strategy]]", "[[mvp-feature-sequence]]"]
created: 2026-05-02
confidence: medium
---

# Pity engine scope — P2 (customer-built, BokChoy ships primitives only)

## Decision

Pity-state engine is **NOT** a BokChoy platform primitive at MVP. BokChoy ships:

- `loot_roll` server function taking `(loot_table_id, seed_inputs)` and returning a deterministic roll result; M2-style stored-function-only interface per `[[wallet-mechanics]]`.
- `loot_rolls` audit table with `seed_inputs`, `pre_state`, `post_state` columns. **`pre_state` and `post_state` are opaque JSONB blobs that BokChoy stores but does NOT interpret.** They replace the previously-named `pity_state_before` / `pity_state_after` columns from `[[wallet-mechanics]]` §5.
- `staged_jobs` outbox + per-attempt idempotency UNIQUE on `(player_id, banner_id, pull_session_id, attempt_number)` per `[[idempotency-strategy]]` D2-α.
- A **documented reference pity implementation** in customer-extension code, shipped as a docs artifact (not a platform code artifact).

BokChoy does **NOT** ship:

- A `pity_class` / `banner_type` discriminator on `loot_table` in `[[catalog-versioning]]`.
- A `pity_state` table or any platform-level pity counter.
- Carry-over vs. reset configuration, soft-pity / hard-pity primitives, or win-loss-flag handling.

Customer game-server code (extension function or app code) implements pity by:
1. Reading `pre_state` from the previous roll's `loot_rolls` row (or initializing on first pull).
2. Calling `loot_roll(loot_table_id, seed_inputs)` to get a result.
3. Writing the new `post_state` blob in the same transaction as the audit row insertion.

The customer chooses keying (`per-(player, banner_type)` vs. per-banner vs. per-player), carry-over semantics, soft-pity curve, and any other gacha-specific rules.

## Reasoning

Human's defense: *"I accept P2 because the wedge does not require P1."* Expanded:

1. **Two of three surveyed platforms ship this scope.** AccelByte (`docs.accelbyte.io`, Extend Override loot-box) and PlayFab Economy v2 (Microsoft Learn FAQ, updated 2026-04-15) both deliberately scope pity out of the platform layer. Hiro is the outlier (production-cited / medium per `[[pity-state-research]]`). Two named production platforms beats one, per `Contradiction protocol`.

2. **The wedge argument for P1 does not hold.** `[[wedge-decision]]`'s "designer-first live-ops UX" is a cockpit/dashboard concern — letting designers operate the catalog and live ops without engineer help. It is not a server-mechanics-built-in commitment. A designer-first cockpit gives designers the levers to *configure* their game's pity rules; it does not require BokChoy to bake pity into platform code. The wedge is satisfied by the catalog + cockpit + audit primitives BokChoy already commits to. (inferred / high — wedge-decision text is direct evidence)

3. **Carry-over vs. reset is a customer-monetization-design lever.** Per `[[pity-state-research]]`'s academic source (ScienceDirect S1875952125001247), the choice encodes a deliberate revenue-vs-predictability tradeoff. BokChoy shipping built-in pity means shipping defaults for a customer-product decision — structural mismatch. (production-cited via academic / medium)

4. **P2 forecloses nothing.** If empirical signal later shows customers want batteries-included pity, BokChoy upgrades to P1 or P3 then. The reverse — shipping P1, then walking back to P2 because customers found the defaults wrong — is a much harder migration. (inferred / high)

## Engineering substance applied

- **Failure semantics.** Customer-side pity logic must be replay-safe under `[[idempotency-strategy]]` D2-α. `loot_roll` itself is idempotent on `(player_id, banner_id, pull_session_id, attempt_number)` UNIQUE per `[[wallet-mechanics]]` §5. Customer's extension wraps `loot_roll` and is responsible for its own state-update atomicity (read pre_state, call loot_roll, write post_state — all in one tx).
- **Concurrency.** Customer's extension must use `SELECT ... FOR UPDATE` on the previous `loot_rolls` row when reading `pre_state` to avoid double-decrement pity races under concurrent pulls. The reference implementation documents this. BokChoy's `loot_roll` itself is single-tx atomic (audit row insert + opaque state blobs); concurrency hazard lives on the customer's side, not BokChoy's.
- **Observability.** BokChoy logs every `loot_roll` invocation (latency, status, banner_id). Customer's pity *correctness* is not visible to BokChoy. Page-able failures for pity logic live on the customer's side. BokChoy SLO for `loot_roll` itself matches `[[wallet-mechanics]]`'s M2-protected paths.
- **Trust boundary.** P2 *moves* the trust boundary: the platform trusts that what the customer's extension writes into `post_state` is correct; it does not validate. This is consistent with M2-style stored-function ownership — BokChoy owns the audit-write atomicity; the customer owns the semantic correctness of their state model.

## Production-grade gates

- **Idiomatic.** P2 matches the dominant published pattern across surveyed game-backend platforms not positioned as vertical metagame products. Storing opaque per-row blobs that the platform does not interpret is the standard "extend without forking" pattern (Postgres JSONB is first-class for this; AccelByte's Extend Override and PlayFab's Cloud Script formalize it as a platform feature).
- **Industry-standard.** AccelByte (`docs.accelbyte.io/.../customize-loot-box-roll/`, observed 2026-05-02) + PlayFab Economy v2 (`learn.microsoft.com/.../economy-v2/faq`, page updated 2026-04-15) — two named production platforms shipping this scope. Gate cleared.
- **First-class.** Uses BokChoy's existing primitives: M2 stored-function pattern from `[[wallet-mechanics]]`, idempotency D2-α from `[[idempotency-strategy]]`, `staged_jobs` outbox. No new abstraction introduced. Customer's extension uses Postgres `SELECT FOR UPDATE` — first-class Postgres concurrency primitive, not a workaround.

## Rejected alternatives

### P1 — Ship pity as a platform primitive (Hiro stance)

**What:** BokChoy bakes pity into the platform: `pity_class` field on `loot_table`, `pity_state` table keyed on `(player_id, banner_type)`, server-side carry-over/reset semantics, soft/hard pity built-in. Hiro's published shape (per `[[pity-state-research]]`).
**Wins when:** the platform is positioned as a vertical metagame product (Hiro's stance); the customer base is homogeneous enough that one pity model serves most; the platform is willing to take ownership of a monetization-design lever and accept "your defaults are wrong for my game" support load.
**Why not here:** Customer base in the indie-mid-market segment per `[[indie-smb-pricing-research]]` is heterogeneous (carry-over vs. reset, multi-counter compositions, evolving designs). BokChoy taking ownership of a monetization decision the customer should own is a structural mismatch. One production cite (Hiro) at smaller scale doesn't justify the schema lock-in. Walking back from P1 to P2 later is harder than the reverse.

### P3 — Hybrid (ship reference + expose primitives)

**What:** BokChoy ships both an opt-in built-in pity engine AND the underlying primitives. Customer picks.
**Wins when:** most customers want defaults but a meaningful minority needs custom; platform team has bandwidth to maintain two parallel surfaces.
**Why not here:** MVP team scope per `[[mvp-feature-sequence]]` does not support two surfaces. No empirical demand-signal yet for built-in pity. P3-as-docs (reference impl in docs, primitives in code) captures most ergonomic upside at <5% of the maintenance cost — folded into P2's mitigation list rather than vaulted as a separate path.

## Failure mode

**F1 — Ergonomic tax.** Every customer who wants Genshin-shape pity writes the same ~50-line state machine in extension code. Three customers in, BokChoy gets repeated "where's your pity helper?" support tickets and inconsistent pity implementations across the customer base. (inferred / medium — Hiro saw this and picked P1, but Hiro's customer base may not be representative of BokChoy's mid-market indie/SMB ICP per `[[indie-smb-pricing-research]]`)

**F2 — Concurrency leak in customer code.** Customer's extension reads `pre_state` without `SELECT FOR UPDATE`, or writes `post_state` outside the `loot_roll` transaction, and produces double-decrement pity under concurrent pulls. BokChoy cannot catch this from outside the customer's extension. The per-attempt UNIQUE on `loot_rolls` mitigates the worst case (no duplicate audit rows) but does not prevent stale-pity-read. (inferred / high — standard concurrency bug class)

**F3 — Audit opacity.** When a customer reports "my pity is wrong," BokChoy support cannot diagnose without reading the customer's extension code; `pre_state` / `post_state` are blobs. (inferred / medium — operational support tax)

**F4 — Determinism crossing the boundary.** BokChoy's RNG (sub-decisions ii + iii, deferred) determines roll outcomes; customer's pity determines state. If the customer replays a `loot_roll` with the same `seed_inputs` but a different `pre_state`, the result is deterministic but the *state transition* is not — and the customer may produce inconsistent pity values across replays. The replay-safety contract is split across the boundary and that's fragile. (inferred / medium — needs explicit documentation in the reference impl)

## Mitigations

**F1 — Documented reference pity implementation.** Ship `docs/extensions/reference-pity.md` (or equivalent path) at MVP. Contents: per-`(player, banner_type)` keying example, carry-over toggle, soft-pity curve, win-loss flag, full `SELECT FOR UPDATE` pattern. ~1 day of writing. Captures the ergonomic upside without committing platform code.

**F2 — Reference impl wraps the canonical safe pattern.** Document `SELECT FOR UPDATE` prominently in the reference impl. Document the failure mode (double-decrement) and how to detect it (audit log inspection). Customer-onboarding code review checks for this pattern.

**F3 — Recommended `pre_state` / `post_state` JSON schema in docs.** Reference impl uses well-named keys. Customer is free to deviate; support response when they do is "share your blob schema, we'll diagnose from there."

**F4 — Reference impl is replay-safe.** Documents the contract: customer's pity update must be a function of `pre_state` and the `loot_roll` result, with the same `seed_inputs` always producing the same `(result, post_state)` tuple under the same `pre_state`. Replay produces idempotent state transitions only when this is honored.

## Cascade obligations

1. **Patch `[[wallet-mechanics]]` §5 schema.** Rename `pity_state_before` → `pre_state` and `pity_state_after` → `post_state`. Remove any implication that BokChoy interprets these blobs. Update §5 prose to reflect that `loot_rolls` audits the call, not the customer's pity model. (Not a re-vault of `[[wallet-mechanics]]`; a targeted §5 amendment, encoded in `Revisit when`.)
2. **Cancel the catalog cascade from `[[pity-state-research]]`.** `[[catalog-versioning]]`'s `loot_table` does NOT gain a `pity_class` or `banner_type` field. Banner-type as a concept lives in customer code, not the catalog.
3. **CL-031 sub-decision (i) — A/B/C — is MOOT at the platform level.** Pity-state storage shape is now the customer's problem; BokChoy does not pick A vs. B vs. C. The CL-031 entry when written should note this resolution by scope-decision.
4. **CL-031 sub-decisions (ii) seed format + PRF construction and (iii) PRF-output → roll mapping remain LIVE.** BokChoy ships the deterministic RNG; the determinism guarantee crosses the platform boundary and is the next attack target. The reference impl in F1 depends on (ii)/(iii) being decided.
5. **Reference pity doc is an MVP commitment, not a deferral.** Add to `[[mvp-feature-sequence]]` under documentation deliverables. <1 day estimated.

## Idiom citations

None directly. This decision is system-scope (platform vs. customer ownership of a feature), not language/framework-scope.

## Revisit when

- **≥3 paying customers implement near-identical pity state machines OR file pity-helper friction tickets.** Signal to upgrade to P3-with-real-code or P1. (Quantitative threshold; trackable in support metrics.)
- **A Mode F2 incident reaches production at a paying customer.** Forces the safe-pattern from the reference impl into platform code (partial P1) or stricter customer-onboarding gates.
- **BokChoy's positioning shifts from primitives platform to vertical metagame product.** Re-derive against the new wedge.
- **Empirical signal that carry-over vs. reset configuration is a meaningful customer ask.** Justifies shipping a config knob (partial P3).
- **Sub-decisions (ii) and (iii) make F4 (determinism boundary) a published contract.** The reference impl must align with whatever determinism contract (ii)/(iii) ship; revisit this entry's F4 mitigation when those decisions land.
