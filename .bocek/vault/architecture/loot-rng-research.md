---
type: research
features: [architecture]
related: ["[[wallet-mechanics]]", "[[pity-engine-scope]]", "[[deidentify-mechanism-research]]", "[[idempotency-strategy]]"]
created: 2026-05-02
confidence: medium
provisional: false
---

# Loot RNG — seed canonicalization, server-secret usage, and rotation-vs-replay-determinism

## Question

For BokChoy's `loot_roll` server function — a deterministic seeded RNG whose output is replayable across customer extension code — three sub-questions:

- **(ii.2)** What canonical-form serialization of `(project_id, banner_id, player_id, pull_session_id, attempt_number, server_secret)` forecloses ambiguity / forge attacks?
- **(ii.3)** Where does the server secret enter — HMAC key parameter, HKDF-derived subkey, HMAC_DRBG entropy_input, or message input?
- **(ii.4)** How do production systems handle secret rotation while preserving replay determinism — key-id stamping, no-rotation-by-default with named consequences, or another pattern?

Question feeds CL-031 sub-decisions (ii) seed format + PRF construction and (ii.4) which surfaced inside design as a hidden constraint of the `[[pity-engine-scope]]` F4 determinism boundary.

## Triangulation

- **Production reference:** ✓ — Bitcoin BIP-32 (HD wallet derivation, deterministic-from-master-with-context), Canonical S-expressions / csexp (SPKI digital-signature canonicalization), HashiCorp Vault Transit + go-hmac-drbg (NIST SP 800-90A HMAC_DRBG implementation), SaaS Shield Deterministic Encryption (IronCore Labs — rotation-with-search-determinism pattern). Drand (Cloudflare-backed beacon) cloned but disqualified as reference — drand emits beacon randomness for broadcast, not seeded-from-input determinism. Hashicorp Vault Transit cloned; source not deeply read because Transit generates entropy-backed random bytes (not seeded determinism), making it conceptual reference only.
- **Docs reference:** ✓ — RFC 6979 (deterministic ECDSA, the canonical "deterministic-from-secret-plus-message" reference design — tier-1 IETF), RFC 5869 (HKDF Extract-then-Expand), RFC 8785 (JSON Canonicalization Scheme), NIST SP 800-90A Rev.1 (HMAC_DRBG specification — referenced not directly fetched), RFC 8949 §4.2 (deterministic CBOR — referenced not directly fetched).
- **Contradiction probe:** ✓ — actively searched for "RNG seed canonicalization forge attack post-mortem CVE." Found class-level evidence (OWASP PRNG_Seed_Error, CWE-335, CWE-336) but no named production incident specifically about seed-input-concatenation ambiguity. The SchutzWerk "Attacking a random number generator" blog post documents related techniques. **The harder contradiction surfaced organically:** production-cited canonical-form patterns split three ways (fixed-length binary per BIP-32, length-prefix binary per csexp, canonical text/CBOR per JCS+RFC 8949) — no clean winner; selection is conditional on input shape.

## Sources examined

### RFC 6979 — Deterministic Usage of DSA and ECDSA
- **Tier:** 2 (official IETF specification)
- **Provenance:** `https://datatracker.ietf.org/doc/html/rfc6979`, RFC published August 2013, status: Informational; observed 2026-05-02
- **Author context:** Thomas Pornin (cryptographer, named author at Cryptocat / NCC Group lineage); IETF specification
- **What it tells us:** Canonical reference design for "deterministic-from-(private_key, message)." Uses HMAC_DRBG (NIST SP 800-90A) instantiated with `entropy_input = int2octets(x)` (the secret) + `nonce = bits2octets(H(m))` (the hashed message). Section 3.2: input combiner is `K = HMAC_K(V || 0x00 || int2octets(x) || bits2octets(h1))` — separator-byte concatenation, NOT length-prefix; relies on HMAC's input binding via the keyed structure to prevent ambiguity. **Determinism is single-key-lifetime only.** Section 1 explicitly: *"Note that we instantiate a new HMAC_DRBG instance for each signature generation process."* No key-id stamping, no rotation guidance.

### Bitcoin BIP-32 — Hierarchical Deterministic Wallets
- **Tier:** 1 (production specification + reference implementations across every Bitcoin wallet)
- **Provenance:** `https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki`, observed 2026-05-02; in production use across Bitcoin/Ethereum/Cosmos wallet ecosystems since ~2013
- **Author context:** Pieter Wuille (Blockstream / Bitcoin Core); production-deployed in every major wallet
- **What it tells us:** Canonical reference for "deterministic-from-master-secret-with-path-context" — directly analogous to BokChoy's `(secret, banner_id, player_id, pull_session_id, attempt_number)` shape. **Canonical-form serialization is fixed-length binary**: `ser256(kpar)` (32-byte big-endian) + `ser32(i)` (4-byte big-endian); leading zero byte for hardened-child padding. **Master secret usage:** master is processed first via `I = HMAC-SHA512(Key = "Bitcoin seed", Data = S)`; the chain code `IR` extracted from this output becomes the HMAC key for child derivations — **derived intermediate**, NOT master used directly. **Rotation:** silent. *"Rotation would require regenerating the entire tree from a new seed, invalidating all prior key material."* Security claim: HMAC keyed structure prevents parent-key recovery from child-plus-index even with chain code public.

### RFC 5869 — HKDF (HMAC-based Key Derivation Function)
- **Tier:** 2 (official IETF specification)
- **Provenance:** `https://datatracker.ietf.org/doc/html/rfc5869`, published May 2010, status: Informational; observed 2026-05-02
- **Author context:** Hugo Krawczyk (IBM Research, designer of HMAC, SIGMA, Hugo's-axiom-of-key-separation); used in TLS 1.3, Signal Protocol, Noise Protocol, IPsec
- **What it tells us:** Canonical pattern for "one master secret → many context-specific subkeys" via two stages: Extract (`PRK = HMAC-Hash(salt, IKM)`) and Expand (`OKM = HMAC-Hash(PRK, info || 0x01)`). **Master secret enters as IKM (input keying material), NOT as the HMAC key in Extract.** The salt is the HMAC key. Section 3.2: *"info may contain a protocol number, algorithm identifiers, user identities, etc."* — explicitly *"may prevent the derivation of the same keying material for different contexts when reusing IKM."* No key-rotation guidance. **Critical scope distinction for BokChoy:** HKDF is for *long-lived subkeys*, not per-call deterministic outputs. RFC 6979 / HMAC_DRBG is the closer-fit primitive for BokChoy's use case (per-roll deterministic stream from a per-roll input set).

### RFC 8785 — JSON Canonicalization Scheme (JCS)
- **Tier:** 2 (official IETF specification)
- **Provenance:** `https://datatracker.ietf.org/doc/html/rfc8785`, published June 2020; observed 2026-05-02
- **Author context:** Anders Rundgren (cyberphone), independent IETF contributor
- **What it tells us:** Canonical-form serialization for JSON. Four rules: whitespace-strip, ECMAScript-style number serialization (IEEE 754 double per ECMAScript §7.1.12.1), property-sort by UTF-16 code-units, UTF-8 output. **Designed for JSON-signature stability, not RNG seeds.** No formal injectivity claim within the RFC; the spec constrains to I-JSON which is approximately injective but not formally proven. Production implementations exist (`canonicalize` npm, java/go/python at github.com/cyberphone). For BokChoy: applicable IF seed inputs are JSON-shaped and customer-inspectability matters; less efficient than fixed-length binary.

### Canonical S-expressions (csexp) — SPKI/SDSI
- **Tier:** 1 (production specification used in SPKI; tier-2 for the spec doc itself)
- **Provenance:** Wikipedia entry surfaced via search; canonical reference is Ron Rivest's 1997 spec used in SPKI/SDSI; observed 2026-05-02
- **Author context:** Ron Rivest (RSA co-author, MIT)
- **What it tells us:** Length-prefixed binary canonicalization explicitly designed for digital signature stability. *"Each atom is encoded as a length-prefixed byte string."* This is the OTHER production-cited canonicalization strategy (vs. BIP-32's fixed-length binary). The choice between fixed-length and length-prefix is conditional: fixed-length wins when input shape is bounded; length-prefix wins when inputs are variable-length (e.g., BokChoy's TEXT `pull_session_id`).

### HashiCorp Vault Transit + `go-hmac-drbg`
- **Tier:** 1 (production code)
- **Provenance:** `https://github.com/hashicorp/vault` Transit secrets engine + `https://github.com/hashicorp/go-hmac-drbg`; observed 2026-05-02 via search summary (cloned but not deep-read because the use case is entropy-backed random bytes, not seeded determinism)
- **Author context:** HashiCorp; Vault is in production at thousands of enterprises
- **What it tells us:** HMAC_DRBG per NIST SP 800-90A is the production-grade DRBG primitive in Go, and HashiCorp ships it as a standalone library. Vault Transit's `generate-random` endpoint exposes it. **Direct applicability to BokChoy:** the `go-hmac-drbg` library is reusable; BokChoy's `loot_roll` would instantiate HMAC_DRBG with the canonicalized seed, draw bytes, map to roll outcomes.

### SaaS Shield Deterministic Encryption (IronCore Labs)
- **Tier:** 1 (production system, public docs)
- **Provenance:** `https://ironcorelabs.com/docs/saas-shield/deterministic-encryption/`, observed 2026-05-02
- **Author context:** IronCore Labs, deployed at SaaS customers needing search-over-encrypted-data; deterministic-encryption is their domain
- **What it tells us:** Closest production-cited reference for **rotation + replay-determinism**. Uses key-versioning + alias mapping: *"key alias is a friendly name mapping to key version that simplifies swaps."* On rotation: *"all of the data encrypted using that secret needs to be re-encrypted with the new secret"* — provides a "rotation process that will allow searches to continue to work correctly during the rotation period." This is the production pattern α (key-id stamp + bulk re-encryption migration window). Confirms the pattern exists at production scale; doesn't make it obviously right for a low-volume per-call deterministic RNG like BokChoy's `loot_roll`.

### OWASP PRNG_Seed_Error / CWE-335 / CWE-336
- **Tier:** 4 (vulnerability knowledge bases)
- **Provenance:** `https://owasp.org/www-community/vulnerabilities/PRNG_Seed_Error`, `https://cwe.mitre.org/data/definitions/335.html`, `https://cwe.mitre.org/data/definitions/336.html`; observed 2026-05-02
- **Author context:** OWASP / MITRE community-curated taxonomies
- **What it tells us:** Class-level confirmation that seed-input weaknesses are a recognized vulnerability class. CWE-335 (Incorrect Usage of Seeds) and CWE-336 (Same Seed in PRNG) are the relevant taxonomies. **No specific named incident in the public record for "seed-input ambiguity / concatenation forge attack on a deterministic seeded RNG."** This is interesting: the class is well-known, but the specific failure mode I'm worried about for BokChoy doesn't have a named tier-1 post-mortem cite. Possibilities: (a) gacha titles get reverse-engineered and exploited but companies don't publish post-mortems; (b) the failure mode is rare enough that mature implementations always defend against it via HMAC's structure; (c) my concern is theoretically sound but operationally unimportant. Honest read: I don't know which.

## Findings

### (ii.2) Canonical-form serialization

**Three production-cited patterns; no clean winner. Selection is conditional on input shape.**

- **Pattern A — Fixed-length binary (BIP-32 / RFC 6979).** All inputs serialized to fixed byte widths via `int2octets()` / `serN()`-style encoders. Concatenated without separators. Wins when input shape is bounded and known at design time. Fastest, smallest, simplest to audit. Loses when an input is variable-length (BokChoy's `pull_session_id TEXT` falls here).
- **Pattern B — Length-prefixed binary (Canonical S-expressions / csexp).** Each input atom encoded as `<length>:<bytes>`. Wins when input shape is variable. Slightly larger encoding, equally well-defined. Used in SPKI for exactly this purpose — making variable-length data unambiguous for digital-signature inputs.
- **Pattern C — Canonical text/structured (RFC 8785 JCS, RFC 8949 §4.2 deterministic CBOR).** Wins when (a) inputs naturally JSON/CBOR-shaped and (b) customer-inspectability of the canonical form matters (because audit logs are easier to read than binary). Larger, slower; tradeoff buys legibility.

**For BokChoy specifically:** mixed inputs — `project_id` (UUID = 16 bytes fixed), `banner_id` / `player_id` / `attempt_number` (BIGINT/INTEGER = fixed), `pull_session_id` (TEXT = variable). Pure Pattern A doesn't fit because of `pull_session_id`. **Hybrid A+B (fixed-length encode the fixed fields; length-prefix the variable field) is one defensible composition. Pure Pattern B is another (length-prefix everything for uniformity). Pattern C buys audit-legibility at the cost of efficiency.** Design picks; research has surfaced the tradeoff.

### (ii.3) Server-secret usage

**Two competing canonical patterns for "deterministic output from secret + per-call inputs."**

- **HMAC_DRBG / RFC 6979 pattern.** Secret enters as `entropy_input` to HMAC_DRBG instantiation; per-call inputs enter as `nonce`. Pulls bytes via `Generate()`. **Direct fit for BokChoy's `loot_roll`**: secret is long-lived, per-call inputs are the canonicalized `(project_id, banner_id, player_id, pull_session_id, attempt_number)`, output is a deterministic byte stream that maps to roll outcomes.
- **HKDF / RFC 5869 pattern.** Master secret + salt + info → derived subkey. Designed for long-lived subkeys, not per-call streams. **Mismatch for BokChoy's per-roll use case.** HKDF would be the right primitive if BokChoy needed, e.g., one subkey per `(project_id, banner_id)` for a longer-lived RNG instance — but a per-roll deterministic stream from a per-roll input set is HMAC_DRBG's domain.

**Note on BIP-32's pattern:** BIP-32 uses neither cleanly. It uses HMAC-SHA512 directly with master-derived chain-code as the HMAC key (a hierarchical-derivation pattern). For BokChoy's flat (non-hierarchical) structure, BIP-32's pattern is overkill; HMAC_DRBG is the right fit.

### (ii.4) Secret rotation vs. replay determinism

**Cryptographic specs (RFC 6979, BIP-32, HKDF) are silent on rotation.** All assume single-key-lifetime determinism.

**Production patterns surveyed:**

- **Pattern α — Key-id stamp + version-aware lookup.** Add a small `rng_key_id` field to each `loot_rolls` row recording which key version produced that roll. Rotation produces new id; replay looks up the right key by id. Mirrors `[[deidentify-mechanism-research]]`'s `anon_key_version` pattern. Production cite: SaaS Shield Deterministic Encryption uses key alias → key version mapping for exactly this concern. Operational cost: one small column; rotation is operationally cheap (no re-roll required); old rolls remain replayable indefinitely as long as key history is retained.
- **Pattern β — No rotation by default; rotation invalidates replays.** Same posture as `[[deidentify-mechanism-research]]`'s de-id secret. Production cites: BIP-32 ("rotation would require regenerating the entire tree from a new seed, invalidating all prior key material" — accepts invalidation as part of the model). Operational cost: rotation is a flag day; old rolls become replay-impossible after rotation.

**The two patterns are not mutually exclusive:** BokChoy could ship α-as-mechanism + β-as-default-policy. Key-id column exists; rotation is rare and explicitly compensated.

## Conflicts

**(ii.2) — three production-cited canonicalization patterns with no clean winner.** Per *Contradiction protocol*, all three are tier-1; selection is conditional on input shape and on the audit-vs-efficiency tradeoff. Not artificially resolved — the conditional remains the finding.

**(ii.3) — apparent disagreement between HMAC_DRBG (RFC 6979) and HKDF (RFC 5869) is not actually a conflict.** Different problem classes: HMAC_DRBG for per-call deterministic streams; HKDF for long-lived subkeys. RFC 6979 explicitly cites HMAC_DRBG for the deterministic-signature use case; HKDF is not a competitor for that use. BIP-32 picks a third path (chained HMAC with derived intermediate) for a hierarchical use case BokChoy doesn't have.

**(ii.4) — conflict between cryptographic spec silence and production rotation requirements.** Cryptographic specs assume single-key lifetime; real production systems with replay requirements need rotation. SaaS Shield is the closest cite for the resolution (key-id stamping + alias). BIP-32 is the closest cite for the alternative (accept invalidation). Per *Contradiction protocol*, both production-cited; selection is a design choice grounded in BokChoy's specific compromise model and operational tolerance for flag-day rotations.

**Contradiction probe gap:** I could not find a named production post-mortem of a "seed-input ambiguity forge attack" on a deterministic seeded RNG. Class-level evidence exists (CWE-335, CWE-336, OWASP); specific incident does not. This means my (ii.2) recommendation is grounded in *prevention class* not *prevented incident* — a weaker basis than I'd prefer. Honest label.

## Conditions

- The HMAC_DRBG fit assumes BokChoy ships HMAC-SHA-256 as the underlying PRF (already in scope per `[[wallet-mechanics]]` §6 / `[[deidentify-mechanism-research]]`). If a different PRF were chosen, RFC 6979 / HMAC_DRBG would still apply but the implementation surface shifts.
- The "rotation is rare" assumption underlying Pattern β breaks if compliance / incident response requires periodic rotation. BokChoy's de-id secret rotation policy is "no rotation by default" per `[[deidentify-mechanism-research]]`; symmetric posture for the RNG secret is *defensible but not automatic* — they're different threat models.
- The Pattern A/B/C choice depends on whether BokChoy commits to bounded `pull_session_id` lengths. If `pull_session_id` is bounded (e.g., `≤ 64 bytes UUID-like`), pure Pattern A becomes viable.
- Contradiction-probe gap: the absence of a named forge-attack post-mortem in the public record is not proof of safety. Some weight should be given to the class-level OWASP/CWE evidence; the precise failure mode for *this specific construction* would need a security review or pen-test to validate.

## Operational implications

For CL-031 sub-decisions (ii) seed format + PRF construction:

1. **PRF primitive: HMAC_DRBG (NIST SP 800-90A) instantiated with HMAC-SHA-256.** Production-cited via HashiCorp `go-hmac-drbg` (Go) and equivalent libraries in other ecosystems. Reuses BokChoy's existing HMAC-SHA-256 commitment from `[[wallet-mechanics]]` §6. Stack consistency.

2. **Server-secret usage: as `entropy_input` to HMAC_DRBG.** Per RFC 6979 §3.3 pattern. NOT HKDF (wrong primitive class for per-call determinism). NOT chain-code derivation (BIP-32 hierarchical pattern unnecessary for flat input shape).

3. **Seed-input canonicalization: design picks among three production-cited patterns.** Research surfaces the conditional; design weighs:
   - Pattern A (fixed-length binary): only if `pull_session_id` is constrained to fixed-length
   - Pattern B (length-prefix binary, csexp-style): handles variable-length cleanly, audit-readable in hex dumps
   - Pattern C (canonical CBOR per RFC 8949 §4.2 or canonical JSON per RFC 8785): audit-legible, larger overhead
   - Hybrid A+B: fixed-length for the fixed fields + length-prefix for `pull_session_id`. Defensible composition; not a single-cite pattern but mirrors how RFC 6979 treats `int2octets(x)` + `bits2octets(h1)` (fixed-length chunks combined via separator byte).

4. **Rotation pattern: Pattern α (key-id stamp) recommended-for-design** — operational flexibility is cheap (one `rng_key_id SMALLINT` column on `loot_rolls`); supports both no-rotation-by-default policy AND the option to rotate without losing replay. Symmetric to `[[deidentify-mechanism-research]]`'s `anon_key_version SMALLINT` pattern. Pattern β alone (BIP-32 stance) accepts replay invalidation on rotation — defensible only if rotation is genuinely never expected.

5. **Cascade obligation for design:** the (ii.4) decision interacts with `[[deidentify-mechanism-research]]`'s `bokchoy.anon_secret` policy. The two secrets serve different purposes (de-id vs. RNG seeding); they may share rotation policy or differ. Design should explicitly decide whether they're (a) the same secret, (b) different secrets sharing rotation policy, or (c) fully independent secrets with independent policies. Cleanest: separate secrets, each with key-id stamping, no-rotation-by-default policy on both for symmetry.

6. **Reference pity impl from `[[pity-engine-scope]]` F1 mitigation depends on this entry landing.** The doc must show how to invoke `loot_roll` with proper seed inputs — that contract is set here.

7. **Failure mode worth naming during design:** the absence of a tier-1 forge-attack post-mortem doesn't validate the construction; it just means the failure hasn't been publicly named. Recommend a security review of the chosen seed-canonicalization pattern before implementation lands. Class-level OWASP/CWE-335/CWE-336 are the closest-cite warnings.

## Reproducibility note

Reproducible via the same WebFetches: RFC 6979 (datatracker.ietf.org), BIP-32 (github.com/bitcoin/bips), RFC 5869 (datatracker.ietf.org), RFC 8785 (datatracker.ietf.org), HashiCorp Vault Transit + `go-hmac-drbg` (GitHub), SaaS Shield docs (ironcorelabs.com), Canonical S-expressions (Wikipedia entry → linked spec). NIST SP 800-90A and RFC 8949 were referenced via search summaries, not directly fetched — direct fetch would strengthen tier on the HMAC_DRBG specification and on deterministic CBOR.

Two judgments are load-bearing and would not perfectly reproduce:
1. Characterizing HKDF as "wrong primitive class for BokChoy's use case" — this is my reading of the RFC's scope language (Section 1: *"the goal of the 'extract' stage is to 'concentrate' the possibly dispersed entropy of the input keying material"*) applied to BokChoy's per-call use case. Defensible but not a quoted RFC sentence.
2. The contradiction-probe gap interpretation — "no public post-mortem" might mean the failure mode is rare *or* that companies don't publish. I labeled this honestly above; a different investigator might weight it differently.

## Open threads

- **NIST SP 800-90A Rev.1 direct fetch.** Would upgrade HMAC_DRBG specification from search-summary tier to direct-doc tier-2. Worth doing before implementation.
- **RFC 8949 §4.2 deterministic CBOR direct fetch.** Would settle whether canonical CBOR is competitive with length-prefix binary for BokChoy's input shape on efficiency grounds.
- **A pen-test or security review of the chosen canonicalization pattern** before implementation lands. Class-level OWASP/CWE evidence is sufficient to justify the review; resolves the contradiction-probe gap on this specific construction.
- **Formal injectivity proof for the chosen canonicalization.** csexp claims injectivity by construction (length-prefix + atom encoding); BIP-32's fixed-length encoding is injective for fixed-length inputs; canonical CBOR claims deterministic encoding but not formal injectivity in the same way. Worth confirming for the design choice.
- **Sub-decision (iii) — PRF-output → roll mapping.** Deferred to a separate session. Real questions: rejection sampling vs. modulo bias for non-power-of-2 weights; how to draw multi-item rolls (independent draws vs. combinatorial sampling); whether to derive a fresh PRF instance per item or stream from one instance.
- **Whether `bokchoy.anon_secret` and the RNG `bokchoy.rng_secret` should be the same secret, sharing rotation policy, or fully independent.** Surfaced in operational implication 5; deferred to design.
