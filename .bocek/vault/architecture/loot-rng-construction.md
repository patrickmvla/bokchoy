---
type: decision
features: [architecture]
related: ["[[loot-rng-research]]", "[[wallet-mechanics]]", "[[pity-engine-scope]]", "[[deidentify-mechanism-research]]", "[[idempotency-strategy]]"]
created: 2026-05-03
confidence: medium
---

# Loot RNG construction — PRF, seed canonicalization, secret usage, rotation, secret-sharing, output mapping, stream usage

## Decision

BokChoy's `loot_roll` server function constructs deterministic RNG output via the following construction:

**1. PRF primitive: HMAC_DRBG (NIST SP 800-90A) instantiated with HMAC-SHA-256.**
- Implementation reference: HashiCorp `go-hmac-drbg` (Go) or equivalent in the chosen runtime.
- Reuses the HMAC-SHA-256 commitment from `[[wallet-mechanics]]` §6 and `[[deidentify-mechanism-research]]`. Stack consistency.

**2. Seed-input canonicalization: hybrid A+B (fixed-length binary for fixed fields, length-prefix for variable fields).**

The HMAC_DRBG `entropy_input` (server secret) and `nonce` (canonicalized seed) are constructed as follows:

- `entropy_input` = the active `bokchoy.rng_secret` value as bytes (read from server-side configuration; never customer-supplied).
- `nonce` = canonical-form serialization of `(project_id, banner_id, player_id, attempt_number, pull_session_id)` in fixed order:
  - `project_id`: 16 bytes (UUID raw form, big-endian)
  - `banner_id`: 8 bytes (BIGINT big-endian)
  - `player_id`: 8 bytes (BIGINT big-endian)
  - `attempt_number`: 4 bytes (INT big-endian)
  - `pull_session_id`: 4-byte big-endian length followed by UTF-8 bytes
  - Concatenate in this exact order.

Pseudocode:

```
nonce = uuid_bytes(project_id)
     || int_be(banner_id, 8)
     || int_be(player_id, 8)
     || int_be(attempt_number, 4)
     || int_be(byte_length(pull_session_id_utf8), 4)
     || pull_session_id_utf8

drbg = HMAC_DRBG.instantiate(
    entropy_input = bokchoy.rng_secret,
    nonce         = nonce,
    personalization = ""
)
```

**3. Server-secret usage: as `entropy_input` to HMAC_DRBG instantiation.**

Per RFC 6979 §3.3 reference design. NOT HKDF (wrong primitive class — HKDF is for long-lived subkeys, not per-call deterministic streams). NOT BIP-32 hierarchical chain-code (unnecessary for BokChoy's flat input shape).

**4. Rotation: pattern α+β-default — mechanism present, policy "no rotation by default".**

- New column on `loot_rolls`: `rng_key_id SMALLINT NOT NULL DEFAULT 1`. Server-populated at write time from a Postgres GUC (`current_setting('bokchoy.rng_key_id')::SMALLINT`); never accepted as a function argument from caller.
- Server config maintains a key-id → secret-value mapping (e.g., `bokchoy.rng_secret_v1`, `bokchoy.rng_secret_v2` GUCs loaded per-transaction via `SET LOCAL` from secrets manager — same pattern as `[[deidentify-mechanism-research]]`'s `bokchoy.anon_secret`).
- Default operating policy: never rotate. Rotation is opt-in, triggered only by suspected compromise or explicit compliance event.
- On rotation: new `rng_key_id` (e.g., 2) becomes active for new rolls; old rolls remain replayable indefinitely as long as historical secrets remain accessible to the replay path. No backfill required.

**5. Secret separation: `bokchoy.rng_secret` and `bokchoy.anon_secret` are independent secrets in the secrets manager with independent rotation policies.**

- Both today: "no rotation by default" (symmetric posture).
- Each can be rotated without affecting the other.
- Each is stored as a distinct entry in the secrets manager; loaded into Postgres GUCs separately per-transaction.

**6. Output mapping: rejection sampling per the libsodium / OpenBSD pattern.**

Given a `loot_table` with item weights, `loot_roll` maps the HMAC_DRBG output stream to an item by:

```
weight_sum = sum(item.weight for item in loot_table.items)
bias_threshold = (-weight_sum) mod weight_sum    # equivalent to 2^32 mod weight_sum

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

`bias_threshold` is the smallest value of `r` such that `r mod weight_sum` is uniformly distributed; values below it would skew the distribution toward small `weight_sum` buckets. Worst-case retry probability is `bias_threshold / 2^32`, which is `(2^32 mod weight_sum) / 2^32 ≤ weight_sum / 2^32`. For any `weight_sum ≤ 2^31`, this is ≤ 0.5; expected retries are ≤ 1. Per `[[loot-rng-output-research]]`'s libsodium + OpenBSD direct-source cites.

**7. Multi-draw within one `loot_roll`: stream from a single HMAC_DRBG instance per call.**

Each `loot_roll` invocation instantiates HMAC_DRBG once (with the canonical seed from item 2). All Generate calls within that invocation — primary draw, rejection-sampling retries, any future composition draws — are served from the same instance via state-mutating Generate per `[[loot-rng-output-research]]`. The 9999-Generate ceiling per Instantiate is operationally non-binding because each `loot_roll` instantiates afresh. No per-draw re-instantiation; no nonce mutation between draws within one call.

## Reasoning

Human's defense: *"we have massive research and we had a push back with enough context."*

Expanded — the position derivation ran the design protocol end-to-end:

1. **Research established the candidate space and ranked evidence** per `[[loot-rng-research]]`. PRF and secret-usage choices fell out of triangulation (HMAC_DRBG via RFC 6979 + HashiCorp `go-hmac-drbg`; entropy_input pattern). Three production-cited canonicalization patterns (A/B/C) surfaced with no clean evidence-based winner; rotation patterns α and β both production-cited.

2. **Design self-attacked the initial hybrid A+B position** under the human's "won't-kill-us-later AND not-over-engineered" criterion. Walked back to pure B as ostensibly simpler.

3. **Human pushed back on the walk-back** — "sometimes clever is the right call." Forced a re-examination on substantive grounds rather than aesthetic-uniformity grounds.

4. **Hybrid A+B re-derived from substance, not aesthetics:**
   - Production cryptographic protocols (BIP-32, RFC 6979) use fixed-length encoding for fixed-length fields specifically *because* length-prefixing a value of known fixed size is redundant — the prefix carries zero information. (production-cited / high — BIP-32 and RFC 6979 both directly observable)
   - BokChoy's `seed_inputs` schema is locked by `[[idempotency-strategy]]` to `(player_id, banner_id, pull_session_id, attempt_number)` plus `project_id`. Pure B's "extends naturally if a new variable field is added" advantage is hypothetical in a locked schema. (docs-cited / high — `[[idempotency-strategy]]` F14 + schema in `[[wallet-mechanics]]` §5)
   - The cognitive cost of one mixed encoding rule is paid once by code reviewers at onboarding, not per-call. Pure B's "uniform rule" is an aesthetic advantage in describing the rule, not in operating the system.

5. **PRF + secret-usage choices are research-determined**, not design-judgment. HMAC_DRBG fits the use case (per-call deterministic stream from per-call inputs); HKDF doesn't (wrong class — long-lived subkeys); BIP-32 chained derivation is for hierarchical structures BokChoy doesn't have. (production-cited / high via `[[loot-rng-research]]`)

6. **Rotation α+β-default is conservative-default analysis:** mechanism cost is one SMALLINT column + one server config read; absence cost on the day rotation ever happens is total replay-determinism loss for old rolls. Asymmetric tradeoff, mechanism wins. (production-cited / medium — SaaS Shield Deterministic Encryption cite + symmetric-to-existing-de-id-pattern argument)

7. **Secret separation is Krawczyk's key-separation axiom** applied to BokChoy's two secrets-with-different-threat-models. Cost of separation: one extra secrets-manager entry. Benefit: halved blast radius on either-secret compromise. (docs-cited / high — RFC 5869 §3.2 design rationale documents the principle)

8. **Items 6 (output mapping = rejection sampling) and 7 (stream-mode HMAC_DRBG) are research-determined**, not design-judgment. Both are universal in surveyed cryptographic libraries: libsodium `randombytes_uniform` and OpenBSD `arc4random_uniform` independently implement rejection sampling with the identical bound formula, both with explicit comments rejecting modulo bias as the failure mode they avoid. HashiCorp `go-hmac-drbg` Generate() is stream-mode by construction (state-mutating with backtracking resistance). No defended alternative exists in the surveyed evidence stack. Absorbed into the construction spec as canonical implementation guidance. (production-cited / high via `[[loot-rng-output-research]]`)

## Engineering substance applied

- **Determinism contract.** Same `(rng_secret_v_n, project_id, banner_id, player_id, pull_session_id, attempt_number)` always produces the same HMAC_DRBG output stream. This is the foundation of `[[pity-engine-scope]]` F4 mitigation (replay-safe per `[[idempotency-strategy]]` D2-α). The `rng_key_id` column makes the secret-version part of the determinism contract explicit.
- **Failure semantics.** `loot_roll` is invoked inside the customer extension's transaction. `loot_rolls` UNIQUE on `(player_id, banner_id, pull_session_id, attempt_number)` enforces no double-roll under retry. The HMAC_DRBG output is a function of the seed alone; replay produces identical bytes; idempotency is structural.
- **Concurrency.** Stateless function; no concurrency hazard within `loot_roll` itself. Concurrency hazards live in customer extension code per `[[pity-engine-scope]]` F2.
- **Trust boundary.** `bokchoy.rng_secret_v_n` is read from server-side configuration only. Customer cannot supply or influence the secret, the active key id, or the canonicalization. The boundary is the function signature of `loot_roll(loot_table_id, seed_inputs)` — both inputs are caller-controlled but neither is the secret.
- **Observability.** `loot_rolls` row records the full audit input: `seed_inputs` JSONB (the original input as supplied), `rng_key_id` (which secret produced the output), `rng_output` JSONB (the rolled bytes / mapped result). Replay is fully reproducible from these three columns plus the historical secret.

## Production-grade gates

- **Idiomatic.** HMAC_DRBG is the standard cryptographically-strong PRF for deterministic random bit generation in Go (HashiCorp go-hmac-drbg) and other ecosystems. Hybrid A+B canonicalization is the construction shape used by BIP-32 and RFC 6979 — the cryptographic-protocol idiom for mixed-length seed inputs. Per-row `key_id` stamping for rotation-with-replay is the SaaS-pattern idiom (SaaS Shield Deterministic Encryption).
- **Industry-standard.** RFC 6979 (IETF, 2013, Pornin) — deterministic ECDSA via HMAC_DRBG. BIP-32 (Wuille, 2013) — HD wallet derivation, fixed-length-field composition. NIST SP 800-90A — HMAC_DRBG specification. RFC 5869 (Krawczyk, 2010) — HKDF design principles documenting the key-separation axiom that drives secret-separation. All current; all multi-vendor production deployment.
- **First-class.** Uses Postgres + pgcrypto's existing HMAC-SHA-256 surface. `SET LOCAL bokchoy.rng_secret = ...` and `current_setting('bokchoy.rng_key_id')::SMALLINT` are first-class Postgres GUC patterns documented in `[[deidentify-mechanism-research]]` and `[[multi-tenant-rls-research]]`. No new infrastructure, no new abstraction. The HMAC_DRBG primitive lives in app-layer code (Go via `go-hmac-drbg`, equivalent in other runtimes); only the canonicalization happens in Postgres functions.

## Rejected alternatives

### Pure A (fixed-length binary only) for canonicalization
**What:** Encode every field at a fixed byte width including `pull_session_id`. Requires a maximum-length bound on `pull_session_id` (e.g., ≤ 64 bytes) baked into the schema.
**Wins when:** All input fields are bounded at design time.
**Why not here:** Locks `pull_session_id` to a fixed maximum length, pinning future customer behavior. A customer wanting longer session IDs forces a re-vault. Pure A buys nothing over hybrid A+B in this schema.

### Pure B (length-prefix uniform) for canonicalization
**What:** Length-prefix every field including UUIDs and integers.
**Wins when:** Schema is open-ended and may add variable-length fields later; uniformity in code description is valued over alignment with cryptographic-protocol idiom.
**Why not here:** BokChoy's `seed_inputs` schema is locked. Length-prefixing fixed-length fields is redundant — the prefix encodes information already known from the field's type. Pure B is the right answer for an open schema; not BokChoy's.

### Pure C (canonical CBOR per RFC 8949 §4.2 or canonical JSON per RFC 8785) for canonicalization
**What:** Encode the seed inputs as canonical CBOR or JSON before hashing.
**Wins when:** Customer-inspectability of the canonical bytes is a hard requirement.
**Why not here:** BokChoy already stores `seed_inputs` as JSONB on `loot_rolls` (audit-legible by construction). The on-the-wire HMAC input doesn't need to match audit storage. Pure C buys nothing for BokChoy's auditing; costs ~5–10× the encoding overhead vs. binary forms.

### HKDF for server-secret usage
**What:** Use the server secret as IKM in HKDF Extract; per-call inputs as `info` in HKDF Expand.
**Wins when:** Output is a long-lived subkey used many times (TLS 1.3 traffic keys, Signal Protocol session keys).
**Why not here:** BokChoy's use case is a per-call deterministic stream from a per-call input set — that's HMAC_DRBG's domain, not HKDF's. Per `[[loot-rng-research]]` Source-RFC 5869 analysis: HKDF is wrong primitive class.

### BIP-32 chained derivation for server-secret usage
**What:** Build a hierarchical key tree with chain-code intermediates per banner/player.
**Wins when:** The use case is hierarchical (parent key → child key chains).
**Why not here:** BokChoy's input shape is flat (`(project_id, banner_id, player_id, pull_session_id, attempt_number)` — no parent/child hierarchy). BIP-32's structure is overhead without benefit.

### Pure β for rotation (no `rng_key_id` column, accept replay invalidation on rotation)
**What:** Don't track key version per row; on rotation, accept that all historical rolls become unreplayable.
**Wins when:** Rotation is genuinely never expected over the system's lifetime.
**Why not here:** "Never" is a strong claim across a multi-year horizon. The `rng_key_id` column costs 2 bytes per row; the absence cost on rotation is total audit-trail loss. Asymmetric tradeoff favors α.

### Modulo bias for output mapping (instead of rejection sampling)
**What:** Compute `roll_value = drbg.generate_uint32() mod weight_sum` directly, no rejection.
**Wins when:** `weight_sum` divides `2^32` evenly (only for `weight_sum ∈ {1, 2, 4, ..., 2^32}`) — the bias is exactly zero. Otherwise, never.
**Why not here:** For arbitrary `weight_sum` (e.g., 1111 in the standard `[1000, 100, 10, 1]` example), some output values are slightly more likely than others. The bias is small in absolute terms (~10⁻¹⁰) but it's a recognized vulnerability class (CWE-1241) and has zero performance benefit over rejection sampling at the cost of giving up cryptographic uniformity. Both surveyed implementations (libsodium, OpenBSD) explicitly reject this approach with named rationale.

### Re-instantiate HMAC_DRBG per Generate call (instead of stream-mode)
**What:** For each Generate call within `loot_roll`, call HMAC_DRBG.Instantiate again with the same seed inputs and a counter increment.
**Wins when:** The system needs *fresh* DRBG instances for some operational reason (e.g., one-shot key derivation per output, hierarchical DRBG patterns).
**Why not here:** HMAC_DRBG's Generate function is designed for stream reuse — state mutates per call with built-in backtracking resistance per NIST SP 800-90A §10.1.2 (per `[[loot-rng-output-research]]`). Re-instantiating per Generate pays setup cost K times for nothing; stream-mode is cheaper, simpler, and the spec's intended use. The 9999-call reseed ceiling on the production HashiCorp implementation is non-binding for any single roll.

### Shared `bokchoy.rng_secret = bokchoy.anon_secret`
**What:** Use the same secret for de-identification HMAC and RNG entropy.
**Wins when:** Secrets-management surface is severely constrained (it isn't) AND the two use cases have equivalent threat models (they don't).
**Why not here:** Krawczyk's key-separation axiom (RFC 5869 design rationale): never reuse a key for two purposes. Different threat models — de-id compromise = past anonymization reversible; RNG compromise = active gacha exploitable. Different incident-response triggers should be possible. Cost of separation is one secrets-manager entry; cost of being-wrong on shared is doubled blast radius.

## Failure mode

**F1 — Customer supplies non-canonical or attacker-controlled fields in `seed_inputs`.** A customer extension developer constructs `seed_inputs` with a value that triggers ambiguity in the canonicalization (e.g., a `pull_session_id` containing bytes that mimic the length-prefix of a different field). The hybrid A+B encoding is unambiguous *by construction* (each field has a known byte position determined by the prior fields' fixed widths or length prefixes), so this is structurally prevented. (inferred / high — provable from the encoding)

**F2 — Server secret is leaked.** RNG output for all past and future rolls under that key id becomes predictable. Rotation via the α mechanism mitigates *future* exposure but cannot un-leak past output. (inferred / high — standard secret-compromise model)

**F3 — `bokchoy.rng_secret` and active `rng_key_id` get out of sync.** A misconfigured deployment sets the GUC `bokchoy.rng_key_id = 2` but the secrets manager only contains `rng_secret_v1`; `loot_roll` produces wrong bytes or fails. (inferred / medium — operational misconfiguration class)

**F4 — `loot_roll` invoked outside the customer's transaction.** Customer extension code calls `loot_roll` standalone, then wraps state read/write in a separate transaction. Concurrency hazard inherited from `[[pity-engine-scope]]` F2. (inferred / high — addressed in `[[pity-engine-scope]]`'s reference impl mitigation)

**F5 — Forge attack via seed-input ambiguity in some construction we didn't anticipate.** No public post-mortem cite for this exact failure on a deterministic seeded RNG per `[[loot-rng-research]]` contradiction-probe. Class-level OWASP/CWE-335/CWE-336 evidence only. The hybrid A+B construction is provably unambiguous by length-and-fixed-width construction, but a security-review pre-implementation is warranted to validate the implementation matches the specification. (inferred / medium — class-level concern, no specific cite)

## Mitigations

**F1:** No mitigation needed beyond the encoding choice itself — hybrid A+B is unambiguous by construction. CI lint can verify that any future change to the canonicalization function preserves length-or-fixed-width discipline.

**F2:** Rotation runbook (deferred to `[[runbook-idempotency]]` per `[[wallet-mechanics]]` cascade). Trigger conditions: suspected compromise (Twitter leak, accidental commit, contractor offboarding), compliance mandate. On rotation: new `rng_key_id` activated; old rolls remain valid for replay; new rolls use new secret. No backfill required.

**F3:** Deployment-time check: on Postgres connection bring-up, verify that `current_setting('bokchoy.rng_key_id')::SMALLINT` resolves to a key id whose secret value is loadable via `SET LOCAL`. Fail loudly on mismatch. Document in `[[runbook-idempotency]]`.

**F4:** Reference pity implementation per `[[pity-engine-scope]]` F1 mitigation already documents the in-transaction wrapping pattern. Customer-onboarding code review checks for this.

**F5:** Pre-implementation security review of the canonicalization function. Class-level OWASP/CWE evidence per `[[loot-rng-research]]` contradiction-probe gap is sufficient justification. Reviewer should verify (a) hybrid A+B is implemented per spec, (b) no field is silently truncated, (c) integer encodings are big-endian as specified, (d) UTF-8 encoding of `pull_session_id` is normalized to NFC or documented as not normalized.

## Cascade obligations

1. **`[[wallet-mechanics]]` §5 schema patch** — add `rng_key_id SMALLINT NOT NULL DEFAULT 1` to `loot_rolls` between `idempotency_key_id` and `created_at`. Update the §5 prose to reference `[[loot-rng-construction]]` for the rotation pattern.
2. **`[[runbook-idempotency]]`** — absorb F2 (rotation runbook) and F3 (deployment-time consistency check). New runbook items.
3. **CI lint script** — extend the existing GRANT-discipline lint to verify any change to the canonicalization function preserves hybrid A+B discipline (e.g., grep migrations for new fields added without explicit canonicalization rule).
4. **Pre-implementation security review** of the canonicalization function. Owner: implementation phase. Class-level OWASP/CWE-335/CWE-336 evidence is sufficient justification for the review.
5. **Reference pity implementation** per `[[pity-engine-scope]]` F1 — depends on this entry landing because the determinism contract (which seed inputs go in, what `rng_key_id` does on replay) is now documentable.
6. **CL-031 sub-decision (iii) absorption status:** (iii.a) rejection-sampling output mapping + (iii.c) stream-mode HMAC_DRBG are absorbed into items 6 + 7 of this entry's Decision section per `[[loot-rng-output-research]]`. (iii.b) within-roll composition (no-duplicates, slot-guarantees) is **scope-decided in a separate vault entry** parallel to `[[pity-engine-scope]]` — see `[[within-roll-composition-scope]]` once written.

## Idiom citations

None directly applied — this decision is system-scope (cryptographic construction + schema), not language/framework-scope.

## Revisit when

- **`seed_inputs` schema gains a new variable-length field.** The hybrid A+B canonicalization rule must be amended to length-prefix the new field; reviewer must verify field-order is fixed and prior fields' widths are unaffected.
- **Compromise event triggers rotation.** The α mechanism activates; revisit this entry's F2 mitigation against actual operational experience.
- **A named forge-attack post-mortem appears in the public record** for a deterministic seeded RNG that closes the contradiction-probe gap. Re-evaluate whether the canonicalization choice was sufficient.
- **NIST publishes an SP 800-90A revision** that supersedes HMAC_DRBG or changes the recommended construction.
- **A customer reports a determinism violation** — same `seed_inputs` + same `rng_key_id` produces different `rng_output` bytes. Indicates implementation drift from the spec; investigate immediately.
- **Sub-decision (iii) lands and forces a structural change** to how PRF output is consumed (e.g., rejection sampling forces multiple HMAC_DRBG draws per roll, changing the determinism contract).
