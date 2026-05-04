---
type: research
features: [wallet, architecture, compliance]
related: ["[[wallet-source-of-truth-research]]", "[[wallet-audit-invariant-research]]", "[[staged-jobs-schema-research]]", "[[idempotency-strategy]]", "[[mvp-feature-sequence]]", "[[wedge-decision]]"]
created: 2026-05-02
confidence: high
provisional: false
---

# Audit-log retention for F2P virtual-currency wallet transactions: what do regulators, platform chargeback rules, GDPR, and named F2P operators actually require — and what's the storage math + partition shape at BokChoy's projected scale?

## Question

`[[wallet-source-of-truth-research]]` deferred the audit-retention question with a placeholder ("keep forever, partition by month"). This research closes that gap with concrete regulatory and platform-rule grounding.

Specifically: what retention period does each applicable regime require for per-transaction wallet history in F2P virtual-currency context — UK Gambling Commission, FTC, ESRB/PEGI, Apple App Store, Google Play, GDPR/CCPA — and what do mid-market F2P operators (King, Supercell) actually retain per their public privacy policies? At BokChoy's projected MVP scale, what does the storage math look like and which Postgres partitioning shape is canonical?

## Triangulation

- **Regulatory + platform docs (tier 2):** UK Gambling Commission published guidance pages on loot-box regulatory status and operator record-keeping (`gamblingcommission.gov.uk`); Apple App Store dispute documentation; Google Play developer documentation; ICO right-to-erasure guidance; Postgres docs on declarative partitioning (current).
- **Production reference (tier 4):** Supercell privacy policy (dated 2026-03-11), King privacy policy, both as named F2P operators with publicly-stated retention practices.
- **Contradiction probe (✓):** GDPR right-to-be-forgotten as direct conflict with audit retention — Axiom blog (Kenneally, 2023-11-14) is the named-author analysis of the conflict. Cross-referenced against ICO guidance and EDPB framework. The conflict is real and the resolution is well-documented.
- **Academic + cross-platform self-regulation studies (tier 4):** Royal Society Open Science (2023) on inconsistent loot-box-warning compliance across ESRB/PEGI/IARC. Surfaces *industry-wide non-compliance with self-regulation* as a finding — relevant because it bounds how seriously to take voluntary disclosure regimes.

## Sources examined

### S1 — UK Gambling Commission on loot-box regulatory status

- **Tier:** 2 (official regulator publication)
- **Provenance:** `gamblingcommission.gov.uk/news/article/loot-boxes-within-video-games`; UK GC record-keeping pages (`gamblingcommission.gov.uk/licensees-and-businesses/guide/page/keeping-records`); UK Parliament research briefing CBP-8498 (Woodhouse, 2024-08-13). Observed 2026-05-02.
- **What it tells us:** **Loot boxes are NOT regulated as gambling under the Gambling Act 2005.** UK GC explicit position: prizes from loot boxes "are confined to in-game use and cannot be cashed out, such that they do not have a monetary value outside the video game" — fails the legal definition of gambling. **UK GC has no regulatory authority over loot boxes** and therefore no record-keeping requirement applies to BokChoy customers operating non-cashout F2P games.
  - Operators that ARE regulated (real-money gambling) face a 5-year retention rule for KYC records; this rule does not extend to virtual currency in F2P games.
  - Implication: BokChoy customers in the UK selling traditional F2P loot boxes (no cashout) face **zero regulator-imposed retention floor** from this regime.

### S2 — PEGI 2026 interactive-risk-categories framework

- **Tier:** 2 (official rating-body announcement, dated)
- **Provenance:** PEGI announcement covered by Reed Smith (2026 update), Esports Legal News (2026-03-30), Guru3D. Effective for new submissions from June 2026 onwards. Observed 2026-05-02.
- **What it tells us:** PEGI 2026 introduces four new interactive-risk-categories targeting monetisation, engagement, and communication. **The new requirements are at the *catalog* and *disclosure* level, not the transaction level:**
  - Paid random-item mechanics → default PEGI 16 rating.
  - Loot-box presence + probability disclosures must be made to consumers prior to purchase.
  - Daily quests, login streaks → minimum PEGI 7 with content descriptor.
  - **Nothing in the framework requires per-transaction record retention.** Transparency requirements bind the *catalog and probability disclosure*, not the *historical roll log*.
  - Implication for BokChoy: PEGI compliance is the customer game's responsibility (catalog disclosure, age rating). BokChoy's audit log is orthogonal — no PEGI-imposed retention floor.

### S3 — ESRB position on loot boxes

- **Tier:** 2 (official rating-body statement)
- **Provenance:** ESRB public statement covered by wccftech and Reed Smith. Observed 2026-05-02.
- **What it tells us:** **ESRB explicitly declined to follow PEGI's monetisation-driven rating changes.** Position: "non-content related features [should not] influence rating category assignments." ESRB applies *voluntary* disclosure labels (loot-box presence) inconsistently per the Royal Society Open Science 2023 study (`royalsocietypublishing.org/doi/10.1098/rsos.230270`). No record-retention requirements imposed.
  - Implication: ESRB-regulated North American market also imposes zero per-transaction retention floor.

### S4 — Apple App Store chargeback windows

- **Tier:** 2 (Apple support documentation + card-scheme rules summary)
- **Provenance:** Apple legal dispute form `apple.com/legal/intellectual-property/dispute-forms/app-store/`; chargeflow.io and chargebacks911.com (industry chargeback consultancies — tier 4 as analysis but their numbers are sourced from card-scheme rules which are tier 2 under their NDAs). Observed 2026-05-02.
- **What it tells us:** **Multiple chargeback windows nest:**
  - Apple's own refund window for unauthorized/accidental purchases: typically 90 days.
  - Apple's user reporting window for unauthorized charges: typically 14 days.
  - **Card-scheme chargeback windows (Visa, Mastercard) for in-app purchases:** standard window 120 days; under reason code 13.1 (Merchandise/Services Not Received), extends to **540 days from original transaction date**.
  - Developer response window when a chargeback fires: 12 hours.
- **The 540-day card-scheme window is the binding floor for chargeback-defense retention.** A transaction can be charged back up to ~18 months after it occurred. To defend against the chargeback at all, the audit row must still exist.
- Implication for BokChoy: **18 months is the operational retention floor** for chargeback defense. 24 months gives a safety margin for processing time and dispute escalation.

### S5 — Google Play chargeback rules

- **Tier:** 2 (Google Play developer documentation + chargebacks911 analysis)
- **Provenance:** `support.google.com/googleplay/`; Google Play Billing security docs (`developer.android.com/google/play/billing/security`); chargebacks911 analysis. Observed 2026-05-02.
- **What it tells us:** Google requires developers to respond to chargebacks within **7 days** of notification. Required documentation when disputing: proof of delivery, communication logs showing user authorization, terms of service, payment information. **Specific developer-side evidence retention period not documented in public Google Play docs**, but the implication is "as long as chargebacks can fire" — same 540-day card-scheme window per S4. Independent of platform.

### S6 — GDPR right-to-erasure guidance from ICO and Axiom analysis

- **Tier:** 2 (ICO is the UK GDPR regulator) + 4 (Axiom analysis is named-author engineering blog)
- **Provenance:** ICO right-to-erasure page (`ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/`); Axiom blog (Erin Kenneally, 2023-11-14). Observed 2026-05-02.
- **What it tells us:** **Right-to-be-forgotten does NOT override audit retention when there is a legitimate-interest basis.**
  - GDPR Article 17(3): erasure rights do not apply when processing is necessary for "compliance with a legal obligation," "the establishment, exercise, or defense of legal claims" — chargeback defense fits the latter directly.
  - ICO guidance: "If you are relying on legitimate interests as your justification for processing... the individual's right to erasure depends on whether your interests override theirs."
  - Axiom (Kenneally) framework: don't pick one technical mechanism — apply a *log governance framework*: (i) data minimization or anonymization (mask, truncate, tokenize, hash), (ii) granular deletion of individual records by filter, (iii) automated retention policies aligned to legal obligations, (iv) secure storage with role-based access.
  - **The dominant pattern surfacing across these sources: retain transaction records under legitimate-interest basis, but de-identify (pseudonymize) PII fields when the user requests erasure.** The transaction shape (amount, currency, kind, timestamp) survives; the PII binding (player_id, IP, device fingerprint) is hashed or dropped.
- Implication for BokChoy: account-close does NOT delete transaction rows. It triggers de-identification: `player_id` is replaced with an anonymized hash, IP and device fingerprints are dropped, transaction-shape data is preserved for chargeback defense and aggregate analytics. Document the legitimate-interest basis explicitly in privacy policy.

### S7 — Supercell privacy policy

- **Tier:** 4 (named operator's published privacy policy, dated 2026-03-11)
- **Provenance:** `supercell.com/en/privacy-policy/`. Observed 2026-05-02.
- **What it tells us:** Supercell's stated retention practice:
  - Retain data **"for as long as your account is active or as needed to provide you the Service"** — open-ended.
  - **"Periodically de-identifies unused game accounts"** — confirms the pseudonymization pattern from S6 in production.
  - Even after deletion request: retain data when **"necessary for legitimate business interests, such as to comply with our legal obligations, resolve disputes, and enforce our agreements"** — names the legitimate-interest basis explicitly.
  - Credit card details: deleted after each transaction (PCI scope minimization), except in dispute. Security codes never stored.
  - **No specific retention period for transaction history disclosed.** The implication is "indefinite, with periodic de-identification."

### S8 — King privacy policy

- **Tier:** 4 (named operator's published privacy policy)
- **Provenance:** `king.com/privacypolicy/`. Observed 2026-05-02.
- **What it tells us:** King's stated retention criteria are vague-by-design:
  - Retention based on (i) "length of time needed to retain the information for business purposes," (ii) "legal or regulatory requirements," (iii) "internal operational needs," (iv) "any need based on actual or anticipated investigation or litigation."
  - Account deletion: "If you completely deactivate your account, all progress and any unspent virtual items such as Gold Bars or Boosters will be lost, and cannot be restored in the future." — virtual items are forfeit, but the transaction record is implicitly retained for business purposes.
  - **Same indefinite-retention-with-legitimate-interest pattern as Supercell.**

### S9 — Royal Society Open Science (2023): industry-wide loot-box-warning non-compliance

- **Tier:** 4 (peer-reviewed study, named publisher, recent)
- **Provenance:** `royalsocietypublishing.org/doi/10.1098/rsos.230270`. Observed 2026-05-02.
- **What it tells us:** Empirical finding — even where rating bodies (ESRB, PEGI, IARC) require loot-box presence warnings, compliance is **inconsistently applied across the major platforms (Apple, Epic, Nintendo, Sony, Microsoft).** This bounds how seriously voluntary disclosure regimes function in practice. **Relevant for BokChoy because it confirms: BokChoy's customer game is responsible for the disclosure obligations, not BokChoy. BokChoy's audit log doesn't surface to the regulator; the customer's catalog and probability disclosure does.**

### S10 — Postgres declarative partitioning + pg_partman

- **Tier:** 2 (official Postgres docs + AWS RDS official docs)
- **Provenance:** `postgresql.org/docs/current/ddl-partitioning.html`; `docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL_Partitions.html`. Observed 2026-05-02.
- **What it tells us:** **Native declarative partitioning available since Postgres 10. Monthly range partitioning on `created_at` is the canonical pattern for transaction-shaped time-series tables.**
  - Partition pruning is the main performance win — queries with `WHERE created_at BETWEEN ...` only scan relevant partitions.
  - Partition lifecycle (create new month, archive old month) can be automated via `pg_partman` extension (AWS RDS supports it natively).
  - Postgres 12+ supports thousands of partitions without exclusive-lock pain.
  - Archive pattern: detach old partition (`ALTER TABLE ... DETACH PARTITION ...`), export to Parquet on S3, drop the detached partition. Reversible if needed.

## Findings

### F1 — No surveyed regulator imposes a per-transaction retention floor on F2P virtual-currency wallets

UK GC explicitly does not regulate loot boxes (S1). PEGI 2026 disclosure rules bind the catalog and probability layer, not the transaction layer (S2). ESRB declined to introduce monetisation-driven rules (S3). The cluster is consistent: **regulatory retention floor is zero for BokChoy's ICP** (non-cashout F2P virtual currency).

This is a meaningful negative finding. Design has been carrying an implicit "regulators might require N years" concern that the evidence does not support. BokChoy's customer is responsible for catalog/disclosure compliance; BokChoy is not responsible for retention compliance under any surveyed regime.

### F2 — Card-scheme chargeback windows set the operational retention floor at ~540 days

Apple (S4) and Google (S5) both pass through to card-scheme rules (Visa, Mastercard, Amex). The longest applicable window is **540 days under reason code 13.1 (Merchandise/Services Not Received)**. Below 18 months retention, BokChoy's customer cannot defend a card-scheme chargeback because the audit row is gone.

**The 24-month operational floor is defensible:** 540 days for the chargeback window + buffer for dispute processing time + customer-support response cycle.

### F3 — GDPR right-to-be-forgotten is reconciled via de-identification, not hard delete

S6 + S7 + S8 converge on the production pattern: **retain transaction shape under legitimate-interest basis; de-identify PII fields on account close.** Concrete:
- `player_id` replaced with `anonymized_player_id = hash(player_id || global_secret)` — reversible by Supercell-style admin, irreversible to outside parties.
- IP, device fingerprint, email-bound data: dropped on account close.
- Transaction shape (amount, currency, kind, timestamp, project_id, related_id, related_type) preserved.
- Retention duration: indefinite, with periodic review/cleanup of accounts that age past industry norms (Supercell's "periodically de-identifies unused accounts").

The legitimate-interest basis must be **named in BokChoy's customer-facing privacy policy** — chargeback defense, fraud detection, regulatory cooperation. Documentation is part of GDPR compliance.

### F4 — Storage math at BokChoy's MVP scale supports monthly partitioning from day 1

Per `[[mvp-feature-sequence]]` + `[[wedge-decision]]` + `[[indie-smb-pricing-research]]`:

- **Indie tier:** ~3 writes/sec/project peak; assume 100 paying customers and 100×-1000× lower realistic average → ~250-2500 transactions/sec system-wide peak; ~22M-220M rows/year system-wide.
- **Studio+ tier (~575 writes/sec/project peak × 100 paying customers):** ~5B writes/day peak hypothetical; realistic average ~5M-50M rows/day → 1.8B-18B rows/year system-wide at full Studio+ adoption.

Per-row size estimate: ~200 bytes for a `transactions` row (id BIGINT, project_id UUID, wallet_id BIGINT, kind TEXT, amount NUMERIC, currency_id BIGINT, item_id BIGINT, source_event_id TEXT, idempotency_key_id BIGINT, reason_code TEXT, related_id BIGINT, related_type TEXT, created_at TIMESTAMPTZ, metadata JSONB) + indexes. Total per-row including indexes: ~400-500 bytes.

- 100M rows ≈ 50 GB total
- 1B rows ≈ 500 GB total
- 10B rows ≈ 5 TB total

**Implication:** at indie tier, BokChoy fits comfortably in a single Postgres instance for years 1-2 without partitioning. At Studio+ tier, monthly partitioning is required by Year 1 (a single 10B-row table is operationally painful for vacuum, index maintenance, and query planner).

**The conservative MVP shape: monthly range partitioning on `created_at` from day 1**, even at indie scale. The cost is one DDL statement at table creation + a `pg_partman` cron job creating new monthly partitions ahead of time. Benefits: query pruning works from the start; archive/retention policy slots in naturally; no painful re-partition migration mid-Studio+ adoption.

### F5 — The retention recommendation lands as a tier model

**Tier 1 (hot, queryable from app):**  Postgres native, monthly partitions, **24 months retained.** Indexed for chargeback defense, customer support, faucet/drain dashboard, reconciliation jobs.

**Tier 2 (cold, queryable on-demand):** S3 with Parquet export, **24-60 months retained.** Detached old partitions exported via `aws_s3.query_export_to_s3` (RDS) or equivalent. Loaded back into a temporary Postgres or queried via Athena/Redshift Spectrum for cold cases (lawsuit, regulator inquiry, retroactive analytics).

**Tier 3 (archive, regulator response only):** S3 Glacier (or equivalent), **60+ months → indefinite.** Compliance-only. Restoration timeline is hours to days; acceptable for non-time-sensitive responses.

**Account-close behavior across all tiers:** de-identify `player_id` and PII fields. Transaction shape survives indefinitely under legitimate-interest basis.

Cost math at Studio+ tier (10B rows/year hypothetical):
- Tier 1 (24 months × 5 TB/year = 10 TB hot Postgres): ~$2-3K/month on RDS (provisioned IOPS) — significant but acceptable at the revenue level Studio+ implies.
- Tier 2 (cold 36 months × 5 TB/year compressed to ~1 TB Parquet/year = 3 TB cold S3): ~$70/month on standard S3.
- Tier 3 (Glacier indefinite): ~$1/TB/month, negligible.

**At indie tier (22M-220M rows/year), entire 24-month hot tier fits in <100 GB Postgres.** Storage cost is sub-$50/month per project at full scale. The tier model still applies but the cost pressure is minimal.

### F6 — Industry pattern is "retain indefinitely, de-identify periodically" — BokChoy's recommendation is more conservative

Supercell (S7) and King (S8) both retain transaction-shape data indefinitely under vague legitimate-interest clauses. **BokChoy could match this pattern.** The 24-month-hot + cold-tier-archive recommendation is more disciplined than what Supercell/King disclose, but is well within industry practice.

The reason to be more disciplined than Supercell/King: **operational hygiene**. Hot Postgres tier keeps query planner sane and incident-response queries fast. Indefinite retention in hot Postgres at Studio+ scale is operationally bad even if legally fine.

## Conflicts

### Industry pattern (indefinite hot retention) vs. operational hygiene (tiered with partitioned archive)

S7 + S8 (Supercell, King) suggest indefinite retention is fine. F4 + F5 argue tiered partitioning is operationally cleaner. **Per *Contradiction protocol*:** the industry-pattern is a legal floor (no harm in keeping data); F4 + F5 is an operational preference (better query performance, easier incident response). Both can be true: BokChoy retains indefinitely in *some* tier, but the *hot* tier is bounded for operational reasons. No real conflict once the tiering is named.

### GDPR legitimate-interest basis vs. conservative right-to-erasure interpretation

A maximalist GDPR reading would say: erase transaction rows on account close, accept the chargeback-defense loss. S6 (ICO + Axiom) says: legitimate-interest overrides erasure for chargeback-defense purposes when documented. **Resolution per F3:** de-identify the PII binding while preserving transaction shape — satisfies both the spirit of erasure (player can no longer be identified from the data) and the chargeback-defense need (the row still exists for the customer's regulator/processor to query).

This is the production-cited pattern and is what Supercell explicitly does. Confidence: high.

### PEGI 2026 disclosure obligations vs. BokChoy's audit-log scope

A naive reading might suggest PEGI's loot-box-disclosure rules cascade into BokChoy's retention shape. **They do not.** PEGI binds the customer's catalog and probability disclosures (the *odds* of obtaining each item from a banner). BokChoy's audit log records the *outcomes* — which is operationally useful but not the regulatory deliverable. The customer's PEGI compliance is at the catalog layer (`[[mvp-feature-sequence]]` month 1-3 spine), not the transaction layer.

## Conditions

This finding holds under:

- **F2P virtual currency, no real-money cashout.** If BokChoy ever serves a customer that allows cashout (cash-out tournaments, NFT-backed inventory with secondary markets), the regulatory regime changes — gambling regulators acquire authority and 5-year+ KYC retention applies. Currently out of scope per `[[wedge-decision]]`.
- **EU/UK/US markets only.** Asian markets (China, South Korea, Japan) have additional loot-box-disclosure rules that may eventually evolve toward record-retention. Out of scope for MVP per `[[wedge-decision]]`.
- **Customer is responsible for end-user-facing disclosure.** BokChoy provides infrastructure; the customer's privacy policy and PEGI/ESRB submission are theirs. BokChoy's privacy policy needs to cover BokChoy's processing, not the customer's.
- **Postgres-only stack** per `[[idempotency-strategy]]` B7. The tiering recommendation maps cleanly to Postgres native partitioning + S3 archive. If the stack ever changes (e.g., moves to ClickHouse for analytics), the tier model still applies but the implementation differs.

This finding does **not** generalize to:

- Real-money gambling adjacent products (sports-betting backends, casino-style chance apps that allow cashout, regulated tokens). 5-year regulatory floor + KYC retention applies.
- Markets with loot-box-as-gambling rulings — currently Belgium and Netherlands have ruled certain implementations as gambling; if BokChoy serves customers operating there, the customer faces gambling-regulator retention, not BokChoy.

## Operational implications for design

The retention shape lands as a concrete commitment for the design re-pass on wallet mechanics:

1. **Hot tier:** Postgres `transactions` table partitioned monthly on `created_at`. 24 months of partitions retained. New partition created automatically by `pg_partman` cron 1 month ahead. Older partitions detached and archived.

2. **Cold tier:** S3 with Parquet. Archive job (monthly cron) takes the partition that just aged out of the 24-month window, exports it to S3, drops the partition. Cold-tier queries via Athena/Redshift Spectrum/temp-Postgres-restore for case-by-case forensics.

3. **Archive tier:** S3 Glacier for partitions older than 60 months. Restored only on explicit request (regulator, lawsuit, customer audit).

4. **Account-close behavior:** **de-identify, do not delete.** `WalletService.deidentify_player(player_id)` runs:
   ```
   UPDATE transactions
     SET player_id = encode(digest(player_id::text || global_anonymization_secret, 'sha256'), 'hex'),
         metadata = metadata - 'ip' - 'device_id' - 'email_hash'
     WHERE player_id = $1;
   ```
   And similar on `loot_rolls`, `iap_receipts`, sister tables. Document the legitimate-interest basis in BokChoy's privacy policy.

5. **`transactions` schema gains a `partition_key` column or uses `created_at` directly as the partition key.** Per F4, `created_at` is the natural partition key for time-series data; no separate column needed.

6. **Reconciliation job (`SUM(amount) FROM transactions vs. wallet.balance`) per `[[wallet-source-of-truth-research]]`:** runs only on hot-tier data. Cold-tier rows are immutable archive; reconciliation against hot tier is sufficient because closed/archived months are settled.

7. **Privacy-policy commitment:** BokChoy's customer-facing privacy policy must name (a) legitimate-interest basis for transaction retention, (b) tier-2 cold storage commitment, (c) de-identification process on account close, (d) data subject's right to request earlier de-identification (not deletion).

## Reproducibility note

**Reproducible.** Same finding via:

1. UK GC: read `gamblingcommission.gov.uk/news/article/loot-boxes-within-video-games` and Parliament briefing CBP-8498 (Woodhouse).
2. PEGI 2026: read Reed Smith and Esports Legal News coverage; cross-check against the official PEGI announcement (link not directly fetched in this session — open thread).
3. Apple chargeback windows: card-scheme reason code 13.1 cited in chargeflow.io and chargebacks911.com — both name the 540-day cap. Cross-check against Visa's "Visa Core Rules" (paywalled) is the tier-1-confirmation path for an investigator with access.
4. GDPR legitimate-interest: read ICO's right-to-erasure guidance (public). Cross-check Axiom's framework.
5. Supercell/King privacy policies: stable URLs, dated.
6. Postgres partitioning: official docs + AWS RDS docs.

The judgment most load-bearing on F5's tier model is the storage-cost math at Studio+ scale (5 TB/year hot tier ≈ $2-3K/month RDS). At indie tier the math is trivial; at Studio+ it shapes the recommendation. Math is reproducible from `[[mvp-feature-sequence]]` write-rate estimates.

## Open threads

1. **PEGI primary-source URL not directly fetched.** Coverage was via Reed Smith and Esports Legal News (tier 4 analysis). For a regulator-facing position, fetch the PEGI official announcement directly. Not blocking the finding.

2. **CCPA + Quebec Bill 64 retention specifics not investigated.** California and Quebec have privacy regimes adjacent to GDPR with their own particulars. If BokChoy enters those markets aggressively (likely given US ICP), worth a focused research session before vault-finalizing the retention model. Out of scope for current research budget.

3. **PCI-DSS scope confirmation.** S7 (Supercell) confirms credit card details are not stored — handled at the platform (Apple/Google) layer. BokChoy is similarly out of PCI scope at MVP because Apple/Google process cards, not BokChoy. Worth explicitly vaulting as a non-claim ("BokChoy does not handle PAN, therefore PCI-DSS does not apply") since it shapes the security model. Belongs in CL-032 (tenant isolation) or a separate compliance-scope vault entry.

4. **Customer privacy-policy template.** BokChoy ships infrastructure; its customers ship games. The retention model BokChoy commits to in its terms of service flows to what customers can promise their players. Worth providing customers a "model privacy-policy clause" they can copy. Implementation-phase deliverable, not research.

5. **Cold-tier query infrastructure.** F5 names "Athena/Redshift Spectrum/temp-Postgres-restore" as the cold-tier query path. The actual choice (which AWS service) is implementation-phase, not design. Note for the deployment topology decision (likely CL-040+ or a separate operations design).

6. **All three CL-029 follow-ups now answered.** Q1 (`[[wallet-audit-invariant-research]]`), Q2 (this entry), Q3 (`[[staged-jobs-schema-research]]`). Design can now re-pass the wallet-mechanics decision and vault: M1/M2/M3 mechanism choice + `staged_jobs` schema + retention shape. Then the loot-roll sister-table decision cascades to CL-031.
