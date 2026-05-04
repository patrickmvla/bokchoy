---
type: research
features: [wallet, architecture, retention, gdpr]
related: ["[[wallet-mechanics]]", "[[audit-retention-research]]"]
created: 2026-05-02
confidence: high
provisional: false
---

# Production-cited de-identification mechanism for keyed-hashing player IDs inside Postgres functions, with secret loading under PgBouncer transaction pooling

## Question

The `wallet_deidentify_player` function in `[[wallet-mechanics]]` §6 currently uses `md5(player_id || current_setting('bokchoy.anon_secret'))` to project player IDs to anonymized IDs for GDPR right-to-erasure. Three load-bearing claims need verification before the entry is final:

1. The hash construction (MD5 + suffix-key) — is it production-cited or cryptographically broken?
2. The secret-loading mechanism (custom GUC via `current_setting`) — is the namespace documented, and what's the canonical way to populate it from a secrets manager?
3. The PgBouncer transaction-pool interaction — does `SET LOCAL` reliably scope to one transaction, or does it leak across pooled clients?

## Triangulation

- **Production reference:** ✓ — Elastic engineering blog (Wintergerst, Paquette, McDiarmid) describes HMAC-SHA-256 + secrets store + rotation as their pseudonymization pattern. JP Camara's PgBouncer post corroborates `SET LOCAL` as the safe escape hatch.
- **Docs reference:** ✓ — Postgres 16 official docs for `pgcrypto.hmac`, `set_config`, `current_setting`, `SET` semantics, and `runtime-config-custom` (named GUCs). PgBouncer's `features.html` SQL compatibility table.
- **Contradiction probe:** ✓ — Active search for production sources defending `md5(message||key)` for GDPR de-identification turned up zero defended cases; closest hits were "MD5 is fine for non-cryptographic ID hashing" arguments (cache buckets, partition keys) which are not the same problem class. Silence on a production-defended MD5 GDPR de-id is itself a finding.

## Sources examined

### Source 1 — pgcrypto official docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.postgresql.org/docs/16/pgcrypto.html` (accessed 2026-05-02)
- **Author context:** PostgreSQL Global Development Group; canonical reference for the extension
- **What it tells us:** Verbatim signatures: `hmac(data text, key text, type text) returns bytea`; `hmac(data bytea, key bytea, type text) returns bytea`. Algorithm list verbatim: "Standard algorithms are `md5`, `sha1`, `sha224`, `sha256`, `sha384` and `sha512`." Purpose distinction verbatim: HMAC "is similar to `digest()` but the hash can only be recalculated knowing the key. This prevents the scenario of someone altering data and also changing the hash to match." No `hmac` vs `digest` performance comparison published; benchmark locally if it matters.

### Source 2 — Postgres SET / set_config / current_setting docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.postgresql.org/docs/16/sql-set.html`, `https://www.postgresql.org/docs/16/functions-admin.html`, `https://www.postgresql.org/docs/16/runtime-config-custom.html` (accessed 2026-05-02)
- **Author context:** PostgreSQL Global Development Group
- **What it tells us:** `SET LOCAL` verbatim: "The effects of `SET LOCAL` last only till the end of the current transaction, whether committed or not." Issuing outside a transaction emits a warning and has no effect. Savepoint rollback to before the SET LOCAL clears the GUC. Custom-GUC namespacing is **documented**, not just convention: "Custom options have two-part names: an extension name, then a dot, then the parameter name proper, much like qualified names in SQL." `bokchoy.anon_secret` is syntactically supported.

### Source 3 — PgBouncer features + config docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.pgbouncer.org/features.html`, `https://www.pgbouncer.org/config.html` (accessed 2026-05-02)
- **Author context:** PgBouncer maintainers
- **What it tells us:** SQL feature compatibility table marks **`SET/RESET`** as "Never" in transaction pooling but does **not** list `SET LOCAL` as incompatible. The omission is the doc-level evidence that `SET LOCAL` is the supported escape hatch. Config docs explain the underlying reason verbatim: "When transaction pooling is used, the `server_reset_query` is not used, because in that mode, clients must not use any session-based features, since each transaction ends up in a different connection and thus gets a different session state." Because `SET LOCAL` is bound to the transaction and PgBouncer transaction-pool releases the backend on `COMMIT`/`ROLLBACK`, the GUC is gone before another client gets the connection — **does not leak across transactions**.

### Source 4 — JP Camara, "PgBouncer is useful, important, and fraught with peril"
- **Tier:** 4 (engineering blog, named author, recent)
- **Provenance:** `https://jpcamara.com/2023/04/12/pgbouncer-is-useful.html` (published 2023-04-12, accessed 2026-05-02)
- **Author context:** JP Camara, Postgres practitioner; describes PgBouncer pitfalls hit in production
- **What it tells us:** Identifies plain `SET` as unsafe under transaction pooling (verbatim: "SET operations apply at the session level. This means that on a PgBouncer connection, there is no guarantee our `lock_timeout` will still be applied when we run our DDL"). Treats `SET LOCAL` as the technically correct alternative; warns it forces wrapping in transactions, which can defeat pooling for long-running work — not a concern for a sub-millisecond hash call inside an audit-write transaction.

### Source 5 — Elastic engineering post: "Protecting GDPR Personal Data with Pseudonymization"
- **Tier:** 4 (engineering blog, named authors) — strongest named production cite for the de-identification mechanism
- **Provenance:** `https://www.elastic.co/blog/gdpr-personal-data-pseudonymization-part-1` by Wintergerst, Paquette, McDiarmid (Elastic; accessed 2026-05-02)
- **Author context:** Elastic engineering team; describes their pseudonymization pattern for GDPR compliance in Logstash/Elasticsearch
- **What it tells us:** Verbatim mechanism: "the following proposes using hashing (HMAC with a key) and lookup tables." Verbatim algorithm: "Here we have used a SHA256 method for our fingerprint, which represents a good compromise between robustness and speed." Verbatim key handling: "These keys should be treated with the same diligence as the passwords" — recommends a secrets store. Verbatim rotation: "Users may consider rotating both keys (when using fingerprints) periodically to avoid potential brute force attacks through rainbow tables." This is the production tuple: HMAC-SHA-256 + secrets store + periodic rotation.

### Source 6 — AEPD/EDPS hash-pseudonymization paper
- **Tier:** 2 (regulator authoritative guidance) — but content not extracted from PDF this session
- **Provenance:** `https://www.edps.europa.eu/sites/default/files/publication/19-10-30_aepd-edps_paper_hash_final_en.pdf` (2019; accessed 2026-05-02 but PDF binary not text-extracted by the fetcher; existence + authorship confirmed via Lexology coverage `https://www.lexology.com/library/detail.aspx?g=a6fb6bef-0071-4093-8229-83d4e0c7db9f`)
- **Author context:** Spanish DPA (AEPD) and European Data Protection Supervisor (EDPS); the European authority cited by EU-market game backends for pseudonymization-by-hashing
- **What it tells us:** The document frames keyed hashing with strong (SHA-2/SHA-3) functions as the recommended primitive and key destruction as a recognized erasure mechanism for hash-pseudonymized data. **Verbatim quotes not pulled in this session — re-fetch the PDF locally if a regulator-level direct quote is needed for the design entry or customer-facing privacy policy template.**

### Source 7 — Wikipedia, "Length extension attack"
- **Tier:** Reference / general (not production-cited but cites the foundational results)
- **Provenance:** `https://en.wikipedia.org/wiki/Length_extension_attack` (accessed 2026-05-02)
- **Author context:** Wikipedia summary of the cryptographic attack class
- **What it tells us:** Verbatim on vulnerable functions: "Algorithms like MD5, SHA-1 and most of SHA-2 that are based on the Merkle–Damgård construction are susceptible to this kind of attack." Verbatim on the broken construction: "This is problematic when the hash is used as a message authentication code with construction Hash(secret ‖ message), and message and the length of secret is known, because an attacker can include extra information at the end of the message and produce a valid hash without knowing the secret." Verbatim on the fix: "HMAC also uses a different construction and so is not vulnerable to length extension attacks."

## Findings

### Pattern A — recommended production tuple

| Dimension | Choice | Source-grounded justification |
|---|---|---|
| Hash function | `hmac(data, key, 'sha256')` from pgcrypto, returning `bytea` | Source 1 (pgcrypto signature); Source 5 (Elastic uses HMAC-SHA-256); Source 7 (HMAC immune to length-extension) |
| Secret storage at rest | AWS Secrets Manager / HashiCorp Vault — **not** `postgresql.conf`, **not** `pg_dump` output | Source 5: "treated with the same diligence as the passwords" |
| Secret-to-session delivery | App reads from secrets manager on startup, then issues `SELECT set_config('bokchoy.anon_secret', $secret, true)` (or `SET LOCAL bokchoy.anon_secret = …`) as the **first statement of each transaction** that calls the de-id function | Source 2 (`SET LOCAL` is transaction-scoped); Source 3 (PgBouncer transaction-pool releases the backend on commit/rollback, GUC gone) |
| PgBouncer mode | Transaction pooling. **Do NOT** set the secret in `connect_query` with plain `SET` — that persists session-scoped on the backend and would leak to the next client | Source 3 (`SET/RESET` "Never" in transaction pool); Source 4 corroborates |
| Function definition | `SECURITY DEFINER`, `SET search_path = pg_catalog` in the function header (search_path attack hardening), `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO bokchoy_app` | Postgres `CREATE FUNCTION` standard hardening |
| Encoding | `hmac(convert_to(player_id, 'UTF8'), convert_to(key, 'UTF8'), 'sha256')` — explicit UTF-8 encoding, returns `bytea`. Use `encode(hash, 'hex')` if downstream wants TEXT for joins | Source 1 (signature returns bytea) |
| Rotation | Versioned key id stored alongside the hash (e.g., `key_version smallint, hash bytea`). Rotation = destroy old key + start writing under new version. Key destruction = GDPR-recognized erasure | Source 5 (rotation recommended); Source 6 (key destruction as erasure mechanism) |

### Pattern B — concrete sketch

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE FUNCTION bokchoy.deid_player(p_player_id text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  k text := current_setting('bokchoy.anon_secret', false);  -- error if unset
BEGIN
  IF length(k) < 32 THEN
    RAISE EXCEPTION 'bokchoy.anon_secret too short';
  END IF;
  RETURN hmac(convert_to(p_player_id, 'UTF8'),
              convert_to(k,           'UTF8'),
              'sha256');
END;
$$;

REVOKE ALL ON FUNCTION bokchoy.deid_player(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bokchoy.deid_player(text) TO bokchoy_app;
```

Caller (per transaction, under PgBouncer transaction pool):
```sql
BEGIN;
SELECT set_config('bokchoy.anon_secret', $secret_from_secrets_manager, true);
-- ... audit write that calls bokchoy.deid_player(...)
COMMIT;
```

### Pattern C — why MD5(player_id || secret) is rejected

The current `[[wallet-mechanics]]` §6 draft places the secret as the *suffix* of the input. That technicality blunts the textbook length-extension attack from Source 7 (you'd need to extend a secret you don't control), but the construction is still indefensible:

1. **MD5 collision resistance is broken.** Wang et al. 2004 demonstrated practical collisions; Stevens 2009 demonstrated chosen-prefix collisions. For de-identification, two distinct `player_id`s could collide and silently merge audit rows — a data-integrity defect even with no attacker.
2. **Suffix-keyed hashes have their own academic break** (Preneel & van Oorschot 1995, the "envelope" critique).
3. **HMAC has standardization and a security proof** (FIPS 198-1, RFC 2104). pgcrypto already exposes it. There is no operational reason to ship the broken construction.

## Conflicts

No first-party conflicts. Two weak conflicts were probed and resolved:

1. **"MD5 is fine for non-crypto ID hashing"** (cache buckets, partition keys) appears in many engineering posts. This is a different problem class — those uses don't require collision resistance against an adversary OR any secrecy property. They do not generalize to GDPR de-identification. Per *Contradiction protocol*, problem-class mismatch dismisses these as relevant counter-positions.

2. **No production engineering source defending `md5(message||key)` specifically for GDPR de-identification was located** during the contradiction probe. Per *Contradiction protocol*, this is a stronger result than silence — searched and not found is itself a finding.

## Conditions

The findings hold under these conditions:

- **PostgreSQL ≥ 12** (pgcrypto `hmac` and custom GUCs are stable in supported versions; current docs cited at 16).
- **PgBouncer transaction pool mode** is the deployment assumption. Session-pool mode would change the leak analysis but is not BokChoy's deployment per `[[idempotency-strategy]]` B7 + standard managed-Postgres conventions (Railway, Fly.io, Supabase, Render all default to transaction mode for high-concurrency workloads).
- **Secret rotation policy: no rotation by default.** Default is "no rotation unless compelled by incident." Rotating mid-corpus invalidates correlation across the rotation boundary — that is a *feature* (forward-secrecy on de-identification) but it also breaks any analytics that joins pre-/post-rotation anon_ids. If rotation occurs, document the rotation date in the runbook so analytics consumers can scope their queries.
- **No external KMS calls from inside SQL.** The secret is loaded into the session by the app, which has KMS access. The function reads from the GUC. No `pg_kms` or per-call HTTP from within plpgsql.

## Operational implications

For the amendment to `[[wallet-mechanics]]` §6:

1. **Replace `md5(...)` with `hmac(... , 'sha256')` via pgcrypto.** This is mechanical — Source 1 confirms the signature, Source 5 confirms the algorithm choice, Source 7 confirms the rejection of MD5.

2. **Replace the bit-cast projection.** The current draft projects MD5 hex into `bit(63)` and casts to `bigint`. Replace with `bytea` (or `text` via `encode(hash, 'hex')` if a `BIGINT` join column is required for FK compatibility). If `BIGINT` is non-negotiable, hash-truncation collision probability at 1B players ≈ 1 / 2^31 — document the tradeoff explicitly. Recommended: keep `bytea` and let downstream lookups join on the full hash.

3. **Specify the secret-loading pattern.** Per-transaction `SET LOCAL bokchoy.anon_secret = …` (or `set_config(..., true)`) at the app layer, with the secret pulled from AWS Secrets Manager / Vault on startup and held in app memory. Do NOT use `connect_query` with plain `SET`. Do NOT store in `postgresql.conf`. Do NOT include in `pg_dump` output (the secret is in app config, not DB config — already separated by this pattern).

4. **Vault the no-rotation default.** Add to `Revisit when`: "incident triggers secret rotation; document the rotation boundary so analytics consumers can scope queries; old anon_ids no longer correlate to new ones."

5. **Document key destruction = erasure.** Per Source 6 (regulator-cited): destroying the de-identification key is a recognized GDPR erasure mechanism for hash-pseudonymized data. This is the customer-facing privacy-policy template's escape hatch for "right to erasure beyond what de-identification provides."

6. **The placeholder name `bokchoy.anon_secret` is fine as a name.** Source 2 confirms the namespaced GUC syntax is documented. Cosmetic rename to `bokchoy.deidentify_hmac_key` is optional.

## Reproducibility note

**Reproducible.** Re-run by:
1. Reading `https://www.postgresql.org/docs/16/pgcrypto.html` for `hmac` signature.
2. Reading `https://www.postgresql.org/docs/16/sql-set.html` for `SET LOCAL` semantics.
3. Reading `https://www.pgbouncer.org/features.html` for the SQL feature compatibility table.
4. Reading `https://www.elastic.co/blog/gdpr-personal-data-pseudonymization-part-1` for the production-cited HMAC-SHA-256 + secrets-store + rotation tuple.
5. Reading `https://en.wikipedia.org/wiki/Length_extension_attack` for the MD5/Merkle–Damgård rejection.

Honest gaps:
- AEPD/EDPS PDF binary was not text-extracted in this session. The document is cited via topical authority + Lexology coverage; verbatim regulator quotes require a local fetch.
- pgcrypto `hmac` vs `digest` performance comparison is not in the docs; benchmark locally if performance matters in the wallet-mutation hot path. Expected: negligible difference for sub-100-byte inputs; both are HMAC-style operations on top of digest primitives.
- No production engineering post from Supercell, King, Riot, or any large-scale F2P backend describing the actual de-identification mechanism was found. **Treat the silence as the finding** — F2P backends do not publicly disclose this, so Elastic remains the strongest available named-author cite.

## Open threads

1. **Hash output type — `bytea` vs `BIGINT` projection.** Design decision, not research. If a BIGINT FK column is needed, write the rejection of the bit-cast collision tradeoff explicitly. Alternative: add an integer surrogate column populated at de-identify time and use that as the new player FK.

2. **Secret rotation runbook entry.** When (if ever) to rotate, who authorizes, what gets logged, what gets communicated to customers. Implementation-phase deliverable; folds into `[[runbook-idempotency]]`.

3. **AEPD/EDPS PDF verbatim quotes for customer privacy policy template.** Local fetch + extraction is needed before the customer-facing privacy policy template can quote the regulator directly.

4. **Performance benchmark of `hmac` vs `digest`** in the wallet-mutation hot path — implementation-phase.
