---
type: discovery
features: [design-doc-audit]
related: ["[[research-scope]]", "[[landscape-survey]]", "[[africa-field-notes]]"]
created: 2026-04-30
confidence: high
---

# DESIGN.md claims register — audit pass

## Scope of this entry

Source: `docs/DESIGN.md` v0.1.0, dated 2026-04-30, 970 lines, 26 sections.

This is a *discovery* entry, not a research finding. It enumerates load-bearing claims in the design document, ranks them by *invalidation cost* (what downstream work falls if the claim fails), and assigns a research priority. Each claim gets a stable ID (`CL-001`, `CL-002`, …) that subsequent research vault entries reference verbatim.

**What "load-bearing" means here:** if the claim were false, the doc would change materially — sections would be cut, repriced, re-sequenced, or rewritten from a different premise. Claims whose falsity would change *nothing* (decoration, restatement, glossary) are dropped.

**What this register does NOT do:**
- Does not verify any claim. Verification is the next step.
- Does not extract every assertion. ~150 candidate sentences scanned; ~75 promoted to numbered claims; ~50 dropped as decoration.
- Does not include claims that require **customer discovery** (founder interviews with target studios) rather than desk research. Those are in the *Park list* — they are real claims, but research mode cannot answer them.

## Priority taxonomy

- **P0** — invalidates the entire doc if false. Slice, moat, founder gate.
- **P1** — invalidates a large section (architecture, GTM, pricing) if false.
- **P2** — shapes implementation but doesn't invalidate the wedge. Per-decision derivation work.
- **P3** — decoration, restatement, or low cost to be wrong. Skip unless surface-level cleanup pass.
- **Park** — real claim, requires customer discovery; cannot be settled by desk research.

Invalidation cost is the primary sort key; verifiability-by-desk-research is the secondary filter (claims that can't be settled from the chair go to **Park** regardless of priority).

---

## Top of stack — research these first

Recommended top-5 in priority order. Each is one focused research entry.

| Rank | ID | Claim (one-liner) | Section | Why this ranking |
|---:|---|---|---|---|
| 1 | CL-001 | The right slice is A1 (mobile F2P runtime) | §1, §6, §7 | Keystone. Every other claim downstream of this. |
| 2 | CL-007 | "Designer-first live-ops UX" is an unfilled gap | §4, §7, §8, §19 | This is the *wedge mechanism*. If incumbents already ship this, the slice + moat both die. |
| 3 | CL-002 | "Complement, don't compete" is a structural moat against PlayFab/Unity/Heroic shipping deeper economy | §4, §19 | The strategic frame. If history says BaaS *do* ship adjacent specialist features when threatened, the moat is rented, not owned. |
| 4 | CL-009 | Replacement-BaaS sales cycle is 12–18 months — i.e. *replacing* PlayFab is a losing fight | §4 | Gates the entire complement positioning. If replacement cycles are actually *shorter*, the strategic premise inverts. |
| 5 | CL-006 | "30-minute integration with PlayFab/Nakama/UGS" is technically + politically achievable | §10 | The integration layer is the wedge per §10. If the political side fails (Microsoft / Unity / Heroic refuse to keep the bridge open) the wedge is hostage to vendors. |

CL-003 (founder credibility gate) is the highest-priority *non-research* item. It's **listed in §15 as "non-negotiable" and §23 as Open Question #1** — that's a contradiction the founder owes a decision on regardless of what research finds. Park-equivalent for this register; design will demand it.

---

## P0 — Doc-invalidating claims

### CL-001 — Slice = A1 (mobile F2P runtime)
- **Sections:** §1 Exec summary; §6 Geographic; §7 Product domains assume mobile F2P primitives
- **What it says:** The right cell on `[[landscape-survey]]`'s (layer × shape) grid is mobile F2P runtime, *not* B1 cosmetic-shop / C1 sports-card / D1 MMO.
- **Type:** strategic
- **Evidence in vault:** none — slice was never derived per design protocol.
- **Verifiability:** desk research (per-cell incumbent depth + switching evidence + structural-platform-feasibility).
- **Invalidation cost:** entire doc.
- **Depends on:** [[landscape-survey]] surface scan (already vaulted).
- **Depended on by:** every other P0/P1 claim.
- **Priority:** **P0**, rank 1.

### CL-002 — "Complement, don't compete" is a structural moat
- **Sections:** §4 Strategic positioning; §19 Defensibility
- **What it says:** Reference-frame Stripe / Twilio / Segment / RevenueCat. PlayFab / Unity / Heroic *won't* ship a deeper economy module to crater the wedge because they prioritize breadth.
- **Type:** strategic-bet (reference-frame ground truth + BaaS-vs-specialist historical pattern)
- **Evidence in vault:** none.
- **Verifiability:** desk research (S-1s, founder interviews, post-IPO disclosures, M&A patterns in adjacent SaaS).
- **Invalidation cost:** the entire "complement" frame; if false, BokChoy is in a 6–12-month feature race against incumbents.
- **Depended on by:** §4, §10, §17, §19.
- **Priority:** **P0**, rank 3.

### CL-003 — Founder credibility is a hard gate
- **Sections:** §15 *("non-negotiable")*; §23 Open Question #1
- **What it says:** At least one founder must have shipped F2P credibility (ex-Supercell/King/Riot/Zynga/Wildlife/Tencent/NetEase tier). Without this, mid-core European studios won't take meetings.
- **Type:** founder-bet / strategic
- **Evidence in vault:** none.
- **Verifiability:** **NOT a research question.** Founder owes a decision: hard gate (recruiting plan exists) or soft gate (downgrade language and defend why meetings happen anyway).
- **Invalidation cost:** if hard gate, every Phase-1 timeline assumes the gate has cleared — not currently true.
- **Priority:** **P0** but **out of scope for research mode**. Returns to /design as decision owed.

---

## P1 — Large-section-invalidating claims

### CL-004 — AA mid-core F2P paying middle in Europe is large enough to support Year-1 ARR target
- **Sections:** §1 ($500K–$1M Y1); §5 (median buyer = 10–100 person mid-core); §17 GTM targets
- **What it says:** There are enough Year-1 prospects in the Helsinki/Stockholm/Berlin/etc. corridor at the right tier to land 10–20 customers and $500K–$1M ARR in 12 months.
- **Type:** market sizing
- **Evidence in vault:** [[landscape-survey]] §3 ("paying middle exists, AA tier"). No count, no Europe-specific number, no Y1 conversion rate.
- **Verifiability:** desk research (industry directories, GamesIndustry.biz lists, Sensor Tower data, Pocket Gamer studio databases) + customer discovery for conversion.
- **Invalidation cost:** §1 timeline + §16 pricing tiers + §17 sales targets + Phase 1 success criteria.
- **Priority:** **P1**.

### CL-005 — Helsinki / Stockholm / Berlin / etc. have F2P talent + buyer density justifying Europe-first
- **Sections:** §6 *("Helsinki has more shipped F2P economies per capita than anywhere on earth")*
- **What it says:** Two sub-claims: (a) talent density (Supercell/King alumni); (b) buyer density (concentration of mid-core F2P studios at the right tier).
- **Type:** market geography
- **Evidence in vault:** none. Survey 01 named major mobile-F2P studios (Supercell, King, Playrix) but didn't quantify per-capita or Europe-vs-rest-of-world.
- **Verifiability:** desk research (studio directories, employee headcounts via LinkedIn aggregations, Pocket Gamer regional reports, NewZoo geo data).
- **Invalidation cost:** §6 sequencing. If Helsinki density isn't there, Year-1 launch geography changes (e.g. shift to LA / Stockholm / Tel Aviv).
- **Priority:** **P1**.

### CL-006 — 30-minute integration with PlayFab/Nakama/UGS is technically and politically achievable
- **Sections:** §10 Integration strategy; §17 GTM (partnership-led)
- **What it says:** Two sub-claims: (a) **technical** — session bridges + server-to-server RPC + webhook delivery + identity reconciliation are 30-min tasks for studio engineers; (b) **political** — Microsoft, Unity, Heroic Labs do not block the bridge.
- **Type:** technical + commercial-political
- **Evidence in vault:** none. *"Active partnership with Heroic Labs"* (§4) is asserted, no source.
- **Verifiability:** desk research — technical side (PlayFab API docs, Nakama auth flows, UGS Cloud Code limits); political side (look for cases where a BaaS deprecated or rate-limited a third-party integration).
- **Invalidation cost:** §10 integration layer wedge; §17 partnership-led acquisition motion.
- **Priority:** **P1**, rank 5.

### CL-007 — "Designer-first live-ops cockpit" is a real, unfilled gap in the market
- **Sections:** §4, §7 (Domain 2), §8 (live-ops cockpit table), §19 (UX moat)
- **What it says:** Beamable, Metaplay, Balancy, PlayFab, UGS Economy do *not* ship the designer-UX depth that BokChoy claims as wedge. Visual catalog editor, offer builder, A/B framework, segment manager, live-ops calendar, player inspector, compensation tooling, VIP/whale tooling, catalog diff & approval — *each* must be a thinner-or-absent surface in incumbents to count.
- **Type:** competitive (per-feature, per-incumbent matrix)
- **Evidence in vault:** [[landscape-survey]] §1 surface (which vendors exist, what tier they target). No depth.
- **Verifiability:** desk research — vendor docs, public dashboards, GDC talks, customer reviews.
- **Invalidation cost:** if Beamable or Metaplay already ships 80% of this list, the wedge is "marginally better UX in the same category" rather than "category-creating depth gap."
- **Priority:** **P1**, rank 2 (raised above CL-002 because CL-007 falsity invalidates *both* slice and moat at once).

### CL-008 — Studios reinvent wallet/inventory/shop/loot from scratch and "do it badly"
- **Sections:** §3.3 Problem statement; §18 *"replace custom in-house"*
- **What it says:** Mid-core studios commonly build their own economy primitives, with named failure modes (client-authoritative wallets, no idempotency, no audit trails, no live tuning). This is the source of TCO claim used to justify pricing.
- **Type:** operational (claim about how studios actually work)
- **Evidence in vault:** none.
- **Verifiability:** desk research (postmortems on economy bugs in shipped F2P games; GDC talks on custom economy backends; engineering blogs from named studios) *plus* customer discovery for current state.
- **Invalidation cost:** if studios mostly use BaaS economy modules and don't roll their own, the §3 problem statement narrows and the buyer base narrows with it.
- **Priority:** **P1**.

### CL-009 — Replacing PlayFab/Nakama/UGS has a 12–18 month sales cycle
- **Sections:** §4 *("sales cycles become 12–18 months")*
- **What it says:** Specific claim about replacement-cycle length, used to justify the entire complement-don't-compete frame.
- **Type:** commercial / sales motion
- **Evidence in vault:** none.
- **Verifiability:** desk research — public B2B SaaS sales-cycle data from Gainsight / OpenView / SaaS Capital reports; case studies of studios who *did* replace BaaS; AccelByte-as-counterexample (they replace at AAA, what's their cycle?).
- **Invalidation cost:** if replacement is actually fast (e.g. <6 months for greenfield projects), the moat-via-complement frame inverts and BokChoy could compete head-on at greenfield.
- **Priority:** **P1**, rank 4.

### CL-010 — Studio tier ($1,499/mo) and Studio+ ($4,999/mo) are the right price points
- **Sections:** §16 Pricing
- **What it says:** A studio that pays PlayFab Standard $400/mo will additionally pay BokChoy $1,499/mo for the economy module — i.e. ~4× the BaaS itself.
- **Type:** commercial
- **Evidence in vault:** none.
- **Verifiability:** desk research — comparable B2B SaaS that charge specialist premium over horizontal platform (RevenueCat vs. App Store, Segment vs. Google Analytics, Hightouch vs. dbt, etc.) + customer discovery on willingness-to-pay.
- **Invalidation cost:** §16 economics; §17 ARR targets; LTV/CAC math.
- **Priority:** **P1**.

### CL-011 — Year-1 $500K–$1M ARR with 10–20 customers is achievable for B2B infra in this category
- **Sections:** §1, §17
- **What it says:** From standing start to $500K–$1M ARR in 12 months, 10–20 paying customers, in a category where reference customers don't exist.
- **Type:** commercial / ARR-trajectory
- **Evidence in vault:** none.
- **Verifiability:** desk research — comparable B2B infra trajectories at Y1 (RevenueCat, Mux, LaunchDarkly, Statsig, PostHog, Vercel public revenue history). Founder-led $500K Y1 is rare in B2B infra; most need 18–24 months.
- **Invalidation cost:** if comparable Y1 ARR is actually $100K–$300K, the runway and hiring plan in §15 don't fit.
- **Priority:** **P1**.

### CL-012 — AAA studios "won't trust the ledger to a startup"
- **Sections:** §5 ("AAA: Build their own. Won't trust the ledger to a startup.")
- **What it says:** AAA F2P / live-service won't buy from BokChoy. Used to size the addressable market by *excluding* AAA as a purchasing segment.
- **Type:** market segmentation
- **Evidence in vault:** [[landscape-survey]] notes AccelByte as the AAA exception (KRAFTON/Remedy/Starbreeze/Dreamhaven). $60M raise to earn that trust.
- **Verifiability:** desk research — count AAA studios who have actually adopted any third-party economy / backend SaaS in the last 3 years.
- **Invalidation cost:** if AAA *do* buy (especially mid-AAA / co-dev studios), §5 segment cuts are wrong and the ICP can include higher-value contracts.
- **Priority:** **P1** (mid).

### CL-013 — Per-vendor weakness claims in §3 and §18
- **Sections:** §3 *("PlayFab generic and dated, Nakama rudimentary, UGS minimal")*; §18 (per-vendor weakness column)
- **What it says:** Specific claims per competitor — PlayFab Economy "generic and dated and feature-frozen-ish", Nakama "rudimentary", Beamable "Unity-only, opinionated, all-or-nothing", AccelByte "too heavy/expensive for mid-market", etc.
- **Type:** competitive (per-vendor)
- **Evidence in vault:** [[landscape-survey]] surface scan only.
- **Verifiability:** desk research — vendor docs current state, recent release notes, customer reviews on G2 / Capterra.
- **Invalidation cost:** if even *one* of these vendors is actually shipping the wedge feature (e.g. Beamable's 2025 "Venus" release is genuinely live-ops-deep), the §18 competitive table needs a rewrite and the moat narrative changes.
- **Priority:** **P1** — this is largely the same investigation as CL-007 just framed competitor-by-competitor. Likely fold into CL-007's research entry.

---

## P2 — Per-decision derivation owed

Architectural and commercial decisions stated as pronouncements without rejected-alternatives / production references / *Production-grade gates*. Each becomes its own design-mode position-derivation when slice survives. Listed for completeness; not researched in this audit pass.

### §11 Stack choices (~14 claims)
CL-014 through CL-027:
- Go for API services
- Elixir for realtime/intel (deferred)
- Postgres + RLS for source-of-truth + tenant isolation
- Redis for cache + locks + idempotency
- ClickHouse OR BigQuery (the OR itself is undecided)
- NATS JetStream OR Kafka (also undecided)
- gRPC internal RPC
- REST + WebSocket + GraphQL external
- Next.js + Tailwind + shadcn + TanStack Query dashboard
- AWS primary + Hetzner cost-sensitive (multi-cloud Y1?)
- Kubernetes (EKS)
- OpenTelemetry + Prometheus + Grafana + Sentry
- GitHub Actions + Argo CD
- Drata or Vanta

Each of these claims an idiom + industry-standard + first-class status, none cited.

### §12 Critical architectural decisions (10)
CL-028 through CL-037:
- 12.1 Idempotency everywhere — *needs key derivation strategy, retention, dedup-table sizing*
- 12.2 Event-sourced transactions — *needs isolation level, materialization strategy, projection-lag handling*
- 12.3 Catalog as version-controlled artifact — *needs DAG semantics, merge-conflict resolution for JSON, branch model*
- 12.4 Server-authoritative loot — *needs anti-cheat boundary spec, latency budget*
- 12.5 Postgres RLS for tenant isolation — *needs workload profile, hot-path performance verification*
- 12.6 Data residency from day one — *needs cost analysis vs. Year-1 demand*
- 12.7 Backwards-compatible catalogs — *needs migration policy spec*
- 12.8 Soft-delete on transactions — *needs retention policy, lawsuit-cost claim verification*
- 12.9 At-least-once delivery + idempotency — *needs dedupe window, ordering guarantees*
- 12.10 SOC 2 from year 2 — *needs Type-1-by-month-18 cost vs. revenue-gating analysis*

### §16 Pricing rules
CL-038–CL-042:
- "No transaction fees" rule
- Per-MAU is industry standard
- Annual commit = 2 months free
- 14-day Studio trial
- "If a customer says it's too expensive, they're not the ICP"

### §17 GTM motion
CL-043–CL-046:
- Founder-led for first 20
- Specific conference list (PG Connects Helsinki, GDC, Devcom, Reboot Develop, GDC Summer)
- Devrel as "worth two AEs"
- Discord-as-top-of-funnel

### §19 Defensibility — moat layers by year
CL-047–CL-051: 5 moat layers (speed+focus → integration depth → economy intelligence → designer brand → catalog lock-in)

### §20 Risks
CL-052–CL-064: 13 risks with likelihood / impact / mitigation. Likelihood numbers are aesthetic without a Bayesian frame.

---

## P3 — Decoration / restatement / cleanup pass

Skipped by name. Includes:
- §1 exec summary phrasings (restatement of P0/P1 claims)
- §2 vision/mission
- §9 forbidden list (the discipline is the strategy — defended elsewhere as P1 by implication)
- §13 / Appendix A data model (cascade from §11 / §12 architectural decisions; no independent cost)
- §14 build roadmap (cascade from §1, §17)
- §15 team plan (cascade from §1, §14, §16, §17)
- §22 pre-build artifacts (process, not claim)
- §23 open questions (already meta)
- §24 glossary
- Appendix B API surface (cascade from §12, §13)

---

## Park list — claims requiring customer discovery, not desk research

Real claims, real evidence requirements, but **research mode cannot answer them.** Hand to founder / sales for primary research with target studios.

| ID | Claim | Section |
|---|---|---|
| PK-01 | The 5 buyer triggers in §5 are the actual triggers studios cite when they decide to buy economy infrastructure | §5 |
| PK-02 | Live-ops Designer is the daily user; CTO is the buyer; engineer is the gatekeeper | §5 |
| PK-03 | "Designer can ship segmented A/B-tested time-limited offer in <5 minutes" is the latency that wins champions | §8 |
| PK-04 | Designers move studios and bring tools with them (the §19 Y4 brand moat) | §19 |
| PK-05 | "If a customer says it's too expensive, they're not the ICP" — i.e. price-sensitivity correlates with non-ICP | §16 |
| PK-06 | The 5 personas in §5 exist as distinct buyers / influencers (vs. blurred roles at small studios) | §5 |
| PK-07 | "Studios are reactive, not predictive" — i.e. economy health is observed after the fact in current state | §3 |
| PK-08 | Pre-build founder interview target (30+) is achievable + the right discovery shape | §14 Phase 0 |

These are real questions. They do not get researched here. Do not let them block desk research.

---

## Method note

How I extracted:
1. Read DESIGN.md fully (already in context from /design turn).
2. Walked section-by-section. For each section, listed every assertion that constrained downstream decisions if false.
3. Triaged: dropped pure restatement, glossary, vision language, restatements of P0/P1.
4. Tagged remaining claims by type (strategic / market / competitive / technical / commercial / operational / founder-bet).
5. Ranked by *invalidation cost*: how many other sections / claims fall if this one is false.
6. Filtered for verifiability: claims that need customer discovery → Park list.
7. Top-5 selected by combining (rank-by-invalidation × can-be-settled-by-desk-research × early-cascade-stop value).

Reproducibility: another investigator with DESIGN.md and the [[landscape-survey]] vault entry should reach a substantially similar register. Subjective judgment is concentrated in the P1-vs-P2 cut and in what counts as "decoration" — those calls would shift across investigators by ~10%.

## Open threads

- PK-* park items need a **customer-discovery plan**, not research. Owed back to design / founder.
- CL-003 (founder credibility) is an outstanding decision, not a research question. Owed back to design.
- §11 stack choices and §12 architectural decisions are **derivation work for design**, not pure research. Some sub-questions inside each (e.g. *"what does Postgres RLS cost on a hot-write path at 10krps?"*) ARE research questions; flagged with the per-claim notes above.
- The register itself has a half-life: as research entries land and claims get settled or killed, the register needs updates. State.md should track which IDs are resolved.
