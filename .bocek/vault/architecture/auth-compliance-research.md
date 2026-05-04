---
type: research
features: [auth, compliance]
related: ["[[wallet-mechanics]]", "[[deidentify-mechanism-research]]", "[[host-platform]]", "[[multi-tenant-rls-research]]"]
created: 2026-05-03
confidence: medium
provisional: false
---

# B2B game-backend SaaS compliance stance: GDPR controller-vs-processor and COPPA operator scope

## Question

For a B2B game-backend SaaS storing end-user (player) PII on behalf of customer-developers, what is the GDPR controller-vs-processor stance and COPPA operator-vs-service-provider scope, as evidenced by (a) regulator primary sources, (b) production game-backend SaaS DPAs, and (c) recent FTC enforcement?

Sub-questions handed back from `/design`:
- (S1) Industry pattern on under-13 audience handling — contractual exclusion, ship age-gate primitives, or full COPPA-compliant operator-stance with verifiable parental consent?
- (S2) Burden delta between controller-stance and processor-stance for B2B SaaS?
- (S3) Does `[[deidentify-mechanism-research]]` AEPD/EDPS key-destruction-as-erasure pattern survive under both stances, or only one?

## Triangulation

- **Production reference:** ✓ — PlayFab/Microsoft (DPA + SCC, processor-stance), Unity Gaming Services (DPA + COPPA dashboard primitives, processor-stance), Heroic Labs/Nakama (privacy policy, processor-stance + explicit DSR pass-through).
- **Docs reference:** ✓ — 16 CFR §312.2 (Cornell LII mirror); EDPB Guidelines 07/2020 final v2 (via Hunton 2020-09-10, EuroCloud 2021-04-27, WebSearch general summary — direct PDF fetch unavailable per same WebFetch limitation as `[[loot-rng-output-research]]` NIST SP 800-90A); 2025 COPPA Final Rule Amendments (FTC press release + Securiti/Mayer Brown/White & Case summaries).
- **Contradiction probe:** ✓ — Searched for FTC enforcement against B2B/SDK vendors directly (closest is Apitor/JPush; FTC pursued APITOR, not JPush); searched for game-backend SaaS taking controller-stance (none found across 3 vendors surveyed); searched for game-backend SaaS contractually excluding under-13 customer audiences (none found among PlayFab/Unity/Heroic Labs).

## Sources examined

### Source 1 — EDPB Guidelines 07/2020 on the concepts of controller and processor in the GDPR

- **Tier:** 2 (official docs) — accessed via tier-4 secondary summaries because direct PDF fetch failed (same class as `[[loot-rng-output-research]]` NIST issue)
- **Provenance:** edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-072020-concepts-controller-and-processor-gdpr_en, Final v2 published 2021-07-07, supersedes WP29 Opinion 1/2010 on the concepts of controller and processor
- **Author context:** European Data Protection Board — official EU-level coordinating body of national DPAs; canonical interpretive guidance for Article 4(7)–(8) GDPR
- **What it tells us:** Establishes the "essential means vs non-essential means" test for distinguishing controller from processor. Controller determines essential means (type of personal data processed, duration, categories of data subjects, categories of recipients). Processor may decide non-essential means (specific IT systems, technical implementation of security measures based on controller's general security objectives). Joint controllership requires processing where "the data processing would not be possible without both parties' participation (i.e., the processing by each party is inextricably linked)" (Hunton quote of EDPB). Contracts cannot artificially assign roles — substantive control over purposes/means governs.

### Source 2 — 16 CFR §312.2 (COPPA Rule Definitions, post-2025 amendments)

- **Tier:** 2 (official docs)
- **Provenance:** law.cornell.edu/cfr/text/16/312.2 (Cornell LII mirror of FTC final rule); 2025 amendments published 2025-04-22 in Federal Register (90 FR 16977); effective 2025-06-23, full compliance deadline 2026-04-22
- **Author context:** Federal Trade Commission, codified federal regulation
- **What it tells us:** Operator = "any person who operates a website located on the internet or an online service and who collects or maintains personal information from or about the users of or visitors to such website or online service" (verbatim §312.2). Personal information collected "on behalf of an operator" when (1) collected by an agent or service provider, or (2) the operator benefits by allowing another person to collect information directly from users. "Directed to children" multi-factor test: subject matter, visual content, animated characters, music, age of models, child celebrities, language characteristics, empirical audience composition, marketing/promotional materials. Service-provider exception: a "person who provides support for the internal operations" can receive personal information disclosure but cannot use it "to contact a specific individual, including through behavioral advertising."

### Source 3 — 2025 COPPA Final Rule Amendments

- **Tier:** 2 (official docs) — via FTC press release plus Securiti, Mayer Brown, White & Case secondary summaries
- **Provenance:** federalregister.gov/documents/2025/04/22/2025-05904; ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data
- **What it tells us:** Three changes most relevant to B2B SaaS: (a) new "Mixed audience website or online service" sub-category clarifying child-directed coverage; (b) operators must conduct **"reasonable due diligence"** on third parties that collect children's PII on their behalf or receive it from them, plus must obtain **"written assurances"** from these third parties confirming reasonable security measures; (c) separate verifiable parental consent required for third-party disclosures related to targeted advertising or other purposes beyond "integral" use. **Operational implication: amendments push compliance burden onto operators while requiring assurances FROM third-party vendors — consistent with third-party-as-processor stance, but raises the contractual bar for what processors must commit to.**

### Source 4 — PlayFab / Microsoft Azure DPA (Standard Contractual Clauses)

- **Tier:** 1 (production-equivalent — official commercial contract terms of named system)
- **Provenance:** developer.microsoft.com/en-us/games/products/playfab/privacy-terms (SCC); playfab.com/terms — observed 2026-05-03
- **Author context:** Microsoft, owner of PlayFab since 2018 acquisition; one of the two largest dedicated game-backend SaaS by customer count
- **What it tells us:** Annex I of PlayFab SCC explicitly designates "data exporter as Controller" and "PlayFab as Processor". ToS: *"You agree you are the controller of personal data and Microsoft is the processor of such personal data, except when you act as a processor of personal data, in which case Microsoft is a subprocessor."* Microsoft processes personal data only on documented customer instructions. Customer (game developer) is solely responsible for game data. PlayFab Audit Reports available to customer for GDPR compliance demonstration.

### Source 5 — Unity Gaming Services DPA + COPPA developer guidance

- **Tier:** 1 (production-equivalent)
- **Provenance:** unity.com/legal/unity-data-processing-addendum-dpa; docs.unity.com/ads/en-us/manual/COPPACompliance; docs.unity.com/en-us/grow/levelplay/platform/legal-resources/children-child-directed-apps; support.unity.com/hc/en-us/articles/6191235702420 — observed 2026-05-03
- **Author context:** Unity Technologies, second-largest game-backend SaaS provider after PlayFab; UGS includes Authentication, Cloud Save, Economy, Analytics
- **What it tells us:** *"Under GDPR, Unity is the Processor and you, the developer, are the Controller. Under CCPA (as modified by CPRA), Unity is the Service Provider and you, the developer, are the Business."* Unity processes on customer instruction; Standard Contractual Clauses referenced for international transfers; Unity does not determine the customer's legal basis for processing. **COPPA-specific stance:** Unity ships COPPA-compliance primitives at the dashboard level — game-level age designation toggle ("This app is directed to children"), Mixed Audience Game flag, App-level + User-level age designations on the LevelPlay dashboard. **Unity's stated position: "As a publisher, you are responsible for evaluating your apps and determining if they are child-directed... and ensuring that your apps comply with applicable laws."** Unity ships the toggles; the customer carries the determination and operator obligation.

### Source 6 — Heroic Labs Privacy Policy

- **Tier:** 1 (production-equivalent — direct contractual privacy terms)
- **Provenance:** heroiclabs.com/privacypolicy.txt (effective 2024-11-14); heroiclabs.com/docs/nakama/getting-started/data-privacy/
- **Author context:** GameUp Online, Inc. d/b/a Heroic Labs — Y-Combinator-backed game-backend SaaS, ships Nakama (open-source server) + Hiro (commercial vertical metagame) + Satori (live-ops); directly named in BokChoy vault as architecture peer (`[[pity-state-research]]`, `[[loot-rng-output-research]]`, `[[within-roll-composition-scope]]`)
- **What it tells us:** §2: *"processes End User Data on behalf of and pursuant to our Customers' instructions"* and *"Our Customers are the data controllers of all End User Data."* §6 confirms the same. **Direct DSR pass-through:** *"Heroic has no direct relationship with End Users... We will direct that End User to contact the Customer."* — pure processor pattern. §1 contains a direct-relationship age disclaimer: *"The Websites and Heroic Products and Services are not intended for, nor designed to attract, individuals under the age of 18. Heroic does not knowingly collect personal information from any person under the age of 18."* — but this applies to *Heroic's direct relationships* (website visitors, dashboard users), NOT to End Users in customers' games (whose audience is the customer's choice). Breach notification: not addressed in privacy policy. Nakama platform features include export-all-user-data + delete-all-user-data primitives for the customer to invoke when fulfilling DSRs.

### Source 7 — FTC Apitor / JPush enforcement (settled 2025-09)

- **Tier:** 3 (engineering post-mortem-equivalent — federal enforcement action with public consent decree)
- **Provenance:** FTC press release ftc.gov/news-events/news/press-releases/2025/09; settlement terms reported across Foley Hoag, Eye on Privacy, Mondaq, Perkins Coie, FTC business guidance blog
- **Author context:** Federal Trade Commission. Case against Apitor Technology Co., Ltd. (robot toy maker, child-directed product, ages 6-14, free companion mobile app)
- **What it tells us:** Apitor's app required location permissions to program robots. JPush SDK (developed by Chinese firm Jiguang) collected children's geolocation data and sent it to Chinese servers without parental consent. **The FTC pursued Apitor (the operator), not Jiguang (the SDK vendor).** Settlement: $500,000 penalty (suspended for inability to pay); Apitor required to ensure third-party software complies with COPPA going forward; Apitor required to delete COPPA-violating data unless it obtains parental consent retroactively. **This is the direct production-cited test of the operator/SDK-vendor split: FTC's enforcement target is the operator, not the third-party SDK vendor itself.**

### Source 8 — Foley Hoag interpretive analysis of FTC's Apitor stance

- **Tier:** 4 (engineering blog, named legal-practice author)
- **Provenance:** foleyhoag.com/news-and-insights/blogs/security-privacy-and-the-law/2025/september/ftc-to-app-developers-your-vendors-coppa-missteps-are-your-own/, published 2025-09-08
- **What it tells us:** Direct quotes from the FTC's reasoning: *"the operator (here, Apitor) must give parents clear notice and obtain verifiable consent before any such data is gathered. Apitor allegedly did neither."* The FTC's stated principle: **"outsourcing functionality does not outsource liability"** — and: *"when you embed someone else's code, you inherit that party's privacy risks—and, if children are involved, the FTC's spotlight."* The 2025 amendment requires *"separate opt-in for sharing children's data with third parties for anything other than 'integral' purpose."* Operational expectations on operators integrating B2B vendors: continuous SDK inventory, contractual vendor diligence including "data-flow diagrams, audit rights, indemnities, prompt breach notification, and an obligation to flow down COPPA safeguards."

### Source 9 — Cognosphere (Genshin Impact) COPPA settlement (2025-01)

- **Tier:** 3 (engineering post-mortem-equivalent)
- **Provenance:** FTC announcement 2025-01; $20M settlement
- **What it tells us:** Cognosphere settled for collecting personal data from children without parental consent and **failing to act after gaining actual knowledge of underage users.** Anchors the "actual knowledge" standard: operators who become aware they have under-13 users and don't take corrective action are liable. **B2B SaaS implication:** a processor that learns its customer is operating with under-13 children with that customer's actual knowledge is not directly liable — but the customer-operator carries the obligation to take corrective action.

## Findings

### Finding 1 — GDPR processor-stance is the universal industry pattern for B2B game-backend SaaS storing end-user player PII

PlayFab (Source 4), Unity Gaming Services (Source 5), and Heroic Labs (Source 6) all DPA-position as processor with the customer-developer as controller. The unanimity is meaningful: zero of three surveyed game-backend SaaS take controller-stance for player game data. Consistent with EDPB 07/2020 framework (Source 1): customer-developer determines essential means (which players, what fields, what retention, why), the SaaS determines non-essential means (technical infrastructure, security implementation). **Confidence: high** — three independent production cites agree, regulator primary supports.

### Finding 2 — COPPA operator-stance lands on the customer-developer, not the B2B SaaS vendor

§312.2 (Source 2) operator definition + Apitor enforcement (Source 7) + Foley Hoag interpretive (Source 8) + 2025 amendments (Source 3) consistently target the operator. The FTC's verbatim principle: *"outsourcing functionality does not outsource liability"* — meaning the operator integrating third-party software remains the COPPA-responsible party. The B2B SaaS is the third-party-receiving-on-behalf-of, subject to §312.2 service-provider "internal operations" exception. **Caveat:** the service-provider exception is narrow — cannot use info "to contact a specific individual, including through behavioral advertising." **Confidence: high** — primary regulator + recent direct enforcement + named-author legal interpretive all converge.

### Finding 3 — 2025 COPPA amendments raise the contractual bar for B2B SaaS without changing the operator/processor split

Operators must conduct reasonable due diligence on B2B vendors and obtain written assurances of reasonable security (Source 3, Source 8). Operational expectation per Foley Hoag: vendor-side commitments cover "data-flow diagrams, audit rights, indemnities, prompt breach notification, and an obligation to flow down COPPA safeguards." **Implication for a vendor like BokChoy:** processor-stance still works post-2025 amendments, but the contractual surface widens — DPA must include explicit security commitments, breach notification timing, sub-processor flow-down, and audit cooperation. **Confidence: high** — primary regulator amendment + named legal interpretive.

### Finding 4 — Industry pattern on under-13: vendor disclaims direct end-user relationship + ships COPPA primitives + customer-controller carries operator obligations

The pattern across surveyed vendors:
- **Heroic Labs** (Source 6) disclaims direct under-18 relationship for its websites/dashboards but processes End Users in customers' games as processor — customer's audience choice, customer's COPPA obligation.
- **Unity GS** (Source 5) ships COPPA-compliance toggles at the dashboard level — child-directed flag, Mixed Audience flag, App-level and User-level age designations — and explicitly tells customers: *"As a publisher, you are responsible for... ensuring that your apps comply with applicable laws."*
- **PlayFab** (Source 4) follows similar Microsoft commercial contract pattern: customer-as-controller is solely responsible for game data and lawful basis.

**No surveyed vendor contractually excludes under-13 customer audiences.** All three permit customers to ship to children, with the customer carrying COPPA operator responsibility, and the vendor providing primitives (age toggles, DSR export/delete) that the customer uses to fulfill obligations. **(S1) answer: industry pattern is "ship the primitives, customer holds the operator obligation," NOT contractual age-gate.** **Confidence: medium-high** — three-vendor sample; one or two more (Beamable, LootLocker, AccelByte) would strengthen the unanimity.

### Finding 5 — DSR handling under processor-stance: vendor provides primitives, customer-controller drives execution

Heroic Labs (Source 6) ships Nakama export-all-data and delete-all-data primitives; the privacy policy explicitly directs End Users back to the Customer for DSR. Unity does not handle DSRs from end users directly — customer-as-controller responds to subjects. PlayFab provides audit reports for customer's compliance documentation. **Pattern: vendor builds DSR-fulfillment primitives + audit/assurance docs; customer-controller takes DSRs from data subjects directly and instructs vendor.** **Confidence: high** — three independent production cites with consistent shape.

### Finding 6 — (S2) Burden delta: controller-stance is materially heavier; processor-stance is the cheaper path operationally

Under controller-stance, the SaaS would: (a) field DSRs directly from end users, (b) have direct breach-notification obligation to data subjects under Article 34 GDPR (not just to controller-customer), (c) determine and document lawful basis for processing for each end user, (d) carry first-line COPPA operator obligation if any customer ships to under-13 audiences. Under processor-stance: (a) DSRs flow through customer, (b) breach notification only to customer ("without undue delay" per Article 33(2), customer has 72h to notify supervisory authority), (c) lawful basis is customer's responsibility, (d) COPPA obligations flow to customer-operator. **Implication: processor-stance cuts the directly-customer-facing compliance work substantially.** Required infrastructure under processor-stance is non-trivial (DPA template + SCC + audit cooperation + sub-processor flow-down + DSR primitives) but is a one-time legal infrastructure build, not ongoing per-end-user work. **Confidence: high** — derived directly from GDPR Article 28/33/34 structure + Sources 1, 4, 5, 6.

### Finding 7 — (S3) `[[deidentify-mechanism-research]]` HMAC-SHA-256 + key-destruction-as-erasure pattern is stance-agnostic

Both controller and processor are subject to GDPR. Key destruction = erasure is a technical implementation detail; the *decision* to erase belongs to the controller (responding to a DSR), but the *technical pattern* can be executed by either. Under processor-stance: customer-controller initiates erasure (in response to player DSR), BokChoy-processor executes via key destruction per existing `[[deidentify-mechanism-research]]`. The AEPD/EDPS recognition of key-destruction-as-erasure does not depend on which party holds the key or which is the controller — it depends on the cryptographic property that the data becomes practically irreversible. **Pattern survives under processor-stance unchanged.** **Confidence: high** — derived from the existing research entry's logic + GDPR Article 28 (processor acts on instruction, including erasure instruction).

## Conflicts

### No surveyed B2B game-backend SaaS takes controller-stance for end-user PII

This unanimity is itself a finding. The closest "controller-like" stance any vendor takes is when the SaaS uses end-user data for its own purposes (analytics improvement, ML training, behavioral advertising) — at which point per EDPB 07/2020 the SaaS becomes a separate-purpose controller for that activity. None of the three surveyed take this stance for player game data. (Unity takes it for its Ads/LevelPlay monetization product where it's a separate controller for the ad-targeting purpose — but that's a different product, separately governed.) **Per Contradiction protocol:** absence of disagreement at this scale is itself meaningful — *"no credible disagreement found across PlayFab, Unity GS, Heroic Labs DPAs"* is a stronger claim than silence.

### EDPB direct quotes not captured (PDF rendering limitation)

Same issue class as `[[loot-rng-output-research]]` NIST SP 800-90A failure: WebFetch on the EDPB PDF returns landing-page metadata only. EDPB substantive content reconstructed from law-firm secondary summaries (Hunton 2020-09-10, EuroCloud 2021-04-27) plus WebSearch general summary. Per Contradiction protocol, primary regulator language wins over secondary summaries — **downgrade to medium confidence on EDPB-specific verbatim quotes** pending direct fetch. The "essential vs non-essential means" framing is corroborated across three independent secondary sources, so the framework itself is high confidence; specific EDPB language for vault implementation should be sourced directly when contractual language requires verbatim phrasing.

### Heroic Labs §1 under-18 disclaimer vs §2 End User processing

§1 says Heroic does not knowingly collect under-18s; §2 says Heroic processes End User Data on customer instruction. Apparent tension resolves on careful reading: §1 governs Heroic's *direct* relationships (website visitors, customer dashboard users). §2 governs End Users in customers' games, where customers determine the audience. The under-18 disclaimer applies to whom Heroic itself collects from — not to whom Heroic's customers ship games to. This is a semi-implicit pattern that may also exist in PlayFab/Unity terms but was not directly verified there. **Confidence: medium** on whether this two-tier under-18 stance is universal.

## Conditions

- **Processor-stance holds when:** the B2B SaaS processes player data only on documented customer instruction, does not use player data for cross-customer purposes (analytics improvement, ML training, behavioral advertising) without a separate controller-stance disclosure, provides DSR-fulfillment primitives the customer can invoke, signs a DPA with Article 28 commitments + Standard Contractual Clauses for international transfers.
- **Processor-stance breaks when:** the SaaS uses player data for its own purposes (cross-customer analytics, ML training, behavioral profiling), at which point per EDPB 07/2020 the SaaS becomes a separate-purpose controller for that activity. The §312.2 service-provider exception also breaks if the SaaS uses info to contact specific individuals or for behavioral advertising.
- **Controller-stance for an authentication/identity feature specifically:** the surveyed vendors (PlayFab, Unity GS) ship authentication primitives but DPA-position as processor for the identity data they manage. The argument: authentication serves the customer's purposes (their game, their player relationship), so still processor. **Edge case:** a SaaS that ships its own player-account-portability across customers (one player ID, multiple customer games) starts to look more like joint-controller territory per EDPB 07/2020 "inextricably linked" test.
- **Contractual age-gate viability:** technically viable but no surveyed vendor uses it. Adopting it deviates from industry pattern and cuts off any customer shipping to family/casual mobile or child-directed audiences. Under processor-stance with no age-gate, BokChoy has no direct COPPA exposure (customer-operator carries it) but inherits 2025-amendment "written assurances" obligations.

## Operational implications

For BokChoy's auth + compliance design (handed back to `/design`):

1. **Adopt processor-stance, customer-controller framing.** Matches industry standard across all three surveyed game-backend SaaS. (ii) standard-PII from the design fork is compatible with processor-stance — the trick is BokChoy commits to processing player data only on customer instruction, not for BokChoy's own purposes.

2. **Required legal infrastructure under processor-stance:**
   - Article 28 DPA template + Standard Contractual Clauses for international transfers — standard B2B SaaS legal requirement
   - DSR-fulfillment primitives (export-all-data + delete-all-data per `player_id`) — Nakama already does this; BokChoy must as well
   - Audit/assurance documentation — for the 2025 COPPA "written assurances" requirement
   - Sub-processor flow-down clauses — required by Article 28(2)–(4); covers BokChoy's own dependencies (Supabase per `[[host-platform]]`, etc.)
   - Breach notification SLA: BokChoy notifies customer "without undue delay" per Article 33(2); cascade to existing webhook posture in `[[wallet-mechanics]]` §4a/§4b/§4c

3. **`[[deidentify-mechanism-research]]` HMAC-SHA-256 + key-destruction-as-erasure pattern survives unchanged under processor-stance.** No modification to existing `[[wallet-mechanics]]` §6 design needed. Customer-controller initiates erasure; BokChoy-processor executes via key destruction.

4. **(iii) contractual age-gate decision is independent of stance.** Even under processor-stance, BokChoy can choose to contractually exclude under-13 customer audiences. **No surveyed vendor does this.** Doing it = deviation from industry pattern, cuts off family/casual mobile customers, but eliminates 2025-amendment written-assurance obligations for child data. Not doing it = industry-standard posture, keeps full ICP open, requires written-assurance contract template.

5. **Breach notification flow under processor-stance:** Article 33(2) GDPR — processor notifies controller "without undue delay"; controller has 72-hour window to notify supervisory authority. **BokChoy's obligation = customer-notify, not data-subject-notify.** Operational savings: no direct end-user breach notification infrastructure.

6. **What BokChoy must NOT do to preserve processor-stance:**
   - Use player PII for cross-customer analytics, ML training, or behavioral profiling without separate controller-stance disclosure for that activity
   - Make decisions about player data outside customer instruction (retention beyond customer-set, transfer to third parties)
   - Position itself as the consumer-facing identity layer (would weaken processor-stance by giving BokChoy independent purpose for the identity record)
   - Ship product features (e.g. cross-customer player portability, "BokChoy account that works across games") without first re-deriving the controller/processor analysis for that surface

7. **For the auth library decision (still owed in `/design`):** processor-stance + standard-PII + customer-as-controller does NOT constrain library choice between Better Auth, Auth.js, Lucia. All can be used to build a player-account-store under processor-stance. Library choice is downstream of this research, not coupled to it.

## Reproducibility note

Reproducible. Tool sequence:
1. **Cornell LII direct section URLs** (avoid `/cfr/text/16/part-312` landing — use `/cfr/text/16/312.2` for definitions, `/cfr/text/16/312.5` for parental consent, etc.).
2. **EDPB substantive content via secondary summaries** — direct PDF fetch unavailable through WebFetch (known limitation). Use Hunton, EuroCloud, Privacy World blog summaries plus WebSearch general summary; cross-reference for consistency. Direct EDPB PDF for verbatim quotes requires local PDF download + text extraction.
3. **Vendor SCC/DPA URLs:**
   - playfab.com/privacy-terms (redirects to developer.microsoft.com/en-us/games/products/playfab/privacy-terms — gives SCC Annex I)
   - unity.com/legal/unity-data-processing-addendum-dpa
   - heroiclabs.com/privacypolicy.txt (effective 2024-11-14)
4. **WebSearch "FTC Apitor JPush COPPA"** for the 2025-09 enforcement context, plus Foley Hoag's 2025-09-08 interpretive analysis at foleyhoag.com.
5. **WebSearch "COPPA 2025 amendments"** for the April 2025 final rule context.

**Judgment that does not fully reproduce:** the inference that "no surveyed game-backend SaaS uses contractual age-gate" rests on what was documented in surveyed DPAs/privacy policies + absence of public language to that effect in the surveyed scope. A more thorough archaeology (Beamable, LootLocker, AccelByte, GameSparks, Brainspin, Nakama-on-prem, etc.) might surface it. Confidence: medium on the "industry-wide" generalization; high on the three specific vendors surveyed.

## Open threads

1. **Direct EDPB PDF fetch for verbatim quotes** — 48-page document; some implementation-relevant language (joint controller test exact wording, sub-processor flow-down requirements verbatim, security obligation exact phrasing) is currently reconstructed from secondary sources. Re-attempt via local PDF download + text extraction if vault implementation needs verbatim contractual phrasing for the BokChoy DPA template.

2. **Two more vendor DPAs for triangulation breadth** — Beamable, LootLocker, AccelByte. Three vendors is the floor; five would be stronger. Specifically: do any of them contractually exclude under-13 audiences? Current finding rests on three vendors all permitting child-directed customer apps.

3. **PlayFab/Unity COPPA-specific terms at clause level** — Unity's COPPA dashboard primitives are documented; PlayFab's COPPA-specific clauses not directly captured (only DPA-level processor-stance). Question: do they ship age-gate primitives the customer can use for player-side enforcement? (PlayFab Player Verification, Unity Authentication's underage handling.)

4. **2025 "written assurances" template** — what is the de facto contract language B2B SaaS will use to satisfy this requirement? Not yet visible in surveyed DPAs (likely lagging the April 2025 amendments by 6-12 months). Re-check in 6-12 months as DPAs are updated. BokChoy can pre-empt by including written-assurance language in its DPA template from day one.

5. **Cross-customer analytics / ML training boundary** — Finding 6 says these activities flip BokChoy from processor to controller for that activity. The boundary is fuzzy in practice (does aggregating wallet metrics across customers for product analytics cross the line? what about anonymized usage analytics?). When BokChoy ships a feature using cross-customer data, re-derive the controller/processor analysis for that surface.

6. **NGL Labs / Cognosphere settlement deep-dive** — 2024-2025 enforcement actions cited but not deep-fetched. May reveal additional B2B-vendor implications not surfaced in current research. Open thread for if/when an enforcement-pattern-specific question arises.
