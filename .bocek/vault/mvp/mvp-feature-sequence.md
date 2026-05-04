---
type: decision
features: [mvp]
related: ["[[wedge-decision]]", "[[mobile-f2p-economy-math-research]]", "[[indie-smb-pricing-research]]", "[[design-claims-register]]"]
created: 2026-05-01
confidence: medium
---

# MVP feature sequence: 7-month linear plan with usable spine, cockpit, live-ops mechanics, and AI tooling

## Decision

7-month solo MVP, sequenced linearly with **usability at every release milestone** (no feature stubs, no gaps that block end-to-end use). Each month-end is a usable economy backend for some subset of mobile F2P game shapes.

| Month | Surface shipped | Game shapes usable end-to-end |
|---|---|---|
| **1–3** | **Usable spine.** Wallet (multi-currency, atomic credit/debit, transactions log w/ reason-code taxonomy). Inventory (items, stacks, soulbound flag). Catalog (currencies + items + shops + bundles + loot tables w/ pity config). Shop (server-side purchase flow, IAP fulfillment via validated receipts). **Loot rolls (server-authoritative dice + pity-state-per-player-per-banner).** Unity SDK (auth + wallet + inventory + shop + loot calls + sample scene). Dashboard v1 (catalog editor, transaction inspector, player search). | Any indie F2P game with currencies, items, IAP, gacha-shaped loot. *Smallest viable mobile F2P shape works.* |
| **4–5** | **Cockpit core.** A/B testing framework with segment integration. Segment manager (real-time evaluation on transaction commit, designer-configurable spend-window predicates). Offer builder (segmented + scheduled offers; segment-exclusive stores with dynamic pricing). Live-ops calendar (event scheduling, conflict detection). Statistical guardrails on segment-based A/B (warn when N < 30). | Above + designer can run live-ops without engineer involvement. **Wedge-demo state for pitch table.** |
| **6** | **Live-ops mechanics.** Battle pass (season window, dual-track tier table, free + premium reward arrays, retroactive-claim handling). Quest system (daily/weekly/event quests; integrates with battle pass progression). Mailbox (compensation, gifts, broadcast w/ attachments). Faucet/drain dashboard (currency-in/out by reason-code, source/sink power-class grouping). Inflation alert primitive. | Full mobile F2P feature set including battle pass + quests + events + mail. Most mobile F2P shapes (Clash-Royale-tier, gacha RPG, idle-with-pass) covered end-to-end. |
| **7** | **AI tooling layer (woven into existing surfaces, not separate product).** AI catalog suggest (LLM-augmented "suggest prices/balance" button in catalog editor). AI offer copy generator (variant generation in offer builder per segment). AI anomaly explainer (periodic LLM analysis on dashboard metrics with structured `kind: explanation` response). Designer onboarding flow + sample game project for distribution. | Above + AI as productivity layer. **Full β scope. Pitch-ready and design-partner-onboardable in scale.** |

**Selected over alternatives B and C** per *Rejected alternatives* below.

## Reasoning

### Why linear over wedge-demo-thin (B) or vertical-slice (C)

- **B (thin spine + cockpit fast)** was eliminated by founder pushback (recorded 2026-04-30): *"the first MVP regardless of A B or C needs to be usable; gaps are non-negotiable."* B's thin spine in months 1–2 by definition has gaps (no loot rolls, no bundles, no full catalog) — incompatible with the usability constraint. *(production-cited: Triplet 1-style integrity claim — we don't ship half-built infrastructure.)*
- **C (vertical slice)** would satisfy usability for one game shape but locks the slice to that shape (gacha collection, match-3, idle, etc.) before any design partner has been signed. Indie/SMB ICP is heterogeneous; over-fitting the vertical to one shape kills cross-shape demos in months 4–6. *(inferred, medium confidence — would need design-partner conversation data to verify.)*
- **A (linear)** ships a complete usable spine in months 1–3 covering the largest cross-shape surface (wallet + inventory + catalog + shop + IAP + loot+pity), then layers cockpit and AI on top without re-architecture risk. Each release milestone is a usable product per the founder's constraint.

### Why 3-month spine (not 2)

Solo throughput at production-ready quality (backend + Unity SDK + dashboard view + tests per primitive): ~10–14 days. Pattern reuse compresses across wallet/inventory and catalog/shop, but the spine totals 8 substantive primitives. Realistic ship time: **~12 weeks = 3 months.** The earlier 2-month estimate was underbudget; rejected on review.

### Why loot+pity in the spine, not deferred

Per `[[mobile-f2p-economy-math-research]]` — pity-state per player per banner is the single load-bearing storage primitive for any gacha-shaped game. Most indie mobile F2P games use gacha or are gacha-shaped. Deferring loot+pity to month 5 (the prior plan) leaves indies running gacha games unable to use BokChoy until month 5 — that's a gap, and gaps are non-negotiable per founder pushback. *(production-cited: math research Source 1.2 + Tsinghua paper.)*

### Why AI is last and first-cut on slip

Per `[[wedge-decision]]` — AI is *tool, not product*. Engine quality is the moat, AI is leverage. If month 7 slips, AI cuts first; month 6 state is already wedge-demo-able with cockpit + live-ops mechanics. This protects the *product* over the *narrative*. *(production-cited: Linear / Notion shape per `[[wedge-decision]]` Source 1.)*

### Why cockpit before live-ops mechanics

A/B + segments + offer builder + calendar (months 4–5) form the wedge-demo surface — these are the features `[[cockpit-gap-research]]` proved are gated behind paid tiers at every named incumbent. Shipping these on the Free tier is the wedge mechanism. Battle pass + quests + mailbox (month 6) are *required for full mobile F2P shapes* but are not the wedge. Order: ship the wedge demo first, then expand the supported game shapes.

## Engineering substance applied

System-shaped decision; principles per `[[mobile-f2p-economy-math-research]]` cascade into per-primitive implementation. At the sequencing level:

- **Consistency:** wallet integrity is non-negotiable — server-authoritative writes from month 1; SERIALIZABLE isolation on credit/debit operations. *(production-cited: PlayFab v2 ETag pattern; Stripe's idempotency-key pattern.)*
- **Failure semantics:** at-least-once + idempotency keys for all mutating client API calls from month 1, per `[[idempotency-strategy]]`. Server-derived natural keys (wallet from `(wallet_id, source_event_id)`, loot from `(player_id, banner_id, pull_session_id)`, IAP from `receipt_hash`) — retry-after-crash works because keys are deterministic from business identifiers, not random UUIDs. 24h TTL (Shopify-cited). Multi-step operations use per-step UNIQUE constraints + outbox (`staged_jobs`) + deterministic-RNG-on-key for loot — D2-α pattern, no recovery-point state machine.
- **Concurrency:** optimistic locking via row version on wallet + inventory writes. Server-side loot rolls bound the anti-cheat boundary (client only displays the roll result).
- **Observability:** structured logging via OpenTelemetry from month 1. Transactions table is the primary audit + analytics primitive (per `[[mobile-f2p-economy-math-research]]` Topic 3). Faucet/drain dashboard in month 6 reads from this same table.
- **Storage:** Postgres single instance for MVP; tenant isolation via project_id column (Row-Level Security deferred per `[[wedge-decision]]` until post-Series-A scale demands it). **Idempotency keys on Postgres** (per `[[idempotency-strategy]]` — correctness-critical, not latency-critical; ACID in same transaction as business write). No Redis at MVP. Distributed rate limiting deferred to Studio tier; in-process token-bucket sufficient at indie scale (~3 peak writes/sec). Redis enters the stack later when distributed rate limiting becomes load-bearing; idempotency stays on Postgres permanently.
- **Deployment:** single region (Frankfurt or US-East — pick by first design partners' geography) per `[[wedge-decision]]`. Multi-region deferred.
- **Security:** API keys per project for SDK auth; JWKS callback for custom-backend integration. SOC 2 deferred to Year 2 per `[[wedge-decision]]`.
- **Scaling axis:** PLG funnel — 0 → 100 paying customers over 18–24 months. Single Postgres instance handles 10K MAU × 100 paying customers easily. Vertical scaling first, then read replicas, then sharding only if Series A scale arrives.

## Production-grade gates

- **Idiomatic to *this* stack, *this* version, *this* year.** Stack: Go 1.22+ monolith with internal package boundaries (`/wallet`, `/inventory`, `/catalog`, `/shop`, `/iap`, `/loot`, `/segments`, `/offers`, `/battlepass`, `/quests`, `/mail`, `/dashboard-api`, `/ai`), Postgres 16, Next.js 15 dashboard with Tailwind + shadcn + TanStack Query, Unity 2022 LTS C# SDK distributed via UPM + Asset Store, Anthropic Claude API for AI tool layer. **Redis is NOT in the MVP stack** — added later (likely Studio tier) when distributed rate limiting becomes load-bearing; idempotency stays on Postgres permanently per `[[idempotency-strategy]]`. **Production-cited high.**
- **Industry-standard for problem class.** ≥2 named production references — **RevenueCat** (similar shape: thin client SDK + hosted backend + dashboard, ~10-person team at MVP) and **PostHog** (open-source SDK + commercial backend + dashboard, monolith origin). Both shipped to production with this same architecture. **Production-cited high.**
- **First-class, not workaround.** Postgres native row-version optimistic concurrency (no custom mutex tables). Postgres `UNIQUE (project_id, idempotency_key)` constraint + `locked_at` lock-timeout column for idempotency, per Brandur reference impl `github.com/brandur/rocket-rides-atomic@94b370d` schema (no Redis at MVP). Anthropic API as standard LLM interface (no custom inference). UPM standard package distribution. **Production-cited high.**

## Rejected alternatives

### Alternative B — Wedge-demo-first (thin spine + cockpit fast)
**What:** Months 1–2 ship thinnest possible spine (wallet + inventory + simple shop + IAP + Unity SDK + minimal dashboard, no loot/pity, no bundles). Months 3–4 add cockpit (A/B + offers). Months 5–6 add the rest of the spine + live-ops mechanics. Month 7 AI.
**Wins when:** founder needs to demo the wedge (cockpit at free tier) at a pitch table by month 4, AND can tolerate re-architecture risk when proper foundations are added in months 5–6, AND first design partners' games are simple enough to not need loot/pity.
**Why not here:** the founder's pushback explicitly ruled gaps non-negotiable. A thin spine in months 1–2 has known gaps (loot/pity, bundles) that block gacha-shaped indies. Re-architecture risk in months 5–6 also threatens the runway-tight ship date. Eliminated.

### Alternative C — Vertical slice (one full game-shape primitive end-to-end)
**What:** Months 1–3 ship one complete vertical (e.g. "gacha shop with pity + IAP + catalog editor + first AI feature") for one game shape. Months 4–5 horizontal expansion. Months 6–7 live-ops + more AI.
**Wins when:** a specific first-design-partner game shape is locked in pre-build. The vertical slice over-fits to that shape but is demo-perfect for it.
**Why not here:** no design partner is signed; the indie/SMB target market is heterogeneous (gacha collection, match-3, idle, casual, RPG). Locking the slice to one shape pre-empts the cross-shape pitch in months 4–6. C is reversibly available if a design partner gets locked in by month 1 — until then, A is the cross-shape default.

## Failure mode

Three specific failure scenarios, ranked by likelihood and cost.

1. **Spine slip past month 3.** Solo dev throughput hits unexpected friction (Unity SDK polish takes longer than estimated; dashboard scope creeps; Postgres schema iteration). Probability: medium-high (solo MVPs commonly slip 30–50%). Cost: high — pushes the entire downstream sequence.
2. **Battle pass complexity in month 6.** Per math research, battle pass primitive is non-trivial (season window + dual-track + quest integration + retroactive claim). One month is tight. Probability: medium. Cost: medium — pushes battle pass into month 7, AI catalog-suggest gets cut.
3. **AI cost economics on Free tier exceed margin.** Indie devs hammer AI surfaces; LLM API spend exceeds cap. Probability: medium-low. Cost: medium — fixable post-discovery via tighter rate limits but burns capital while learning.

## Mitigations

- **Spine slip mitigation:** at month 3 retro, audit which spine primitives shipped vs. planned. If 6 of 8 ship by month 3 and 2 are partially shipped (e.g. bundles + loot rolls polish remaining), accept slip and continue with cockpit in month 4 rather than chasing perfect spine. Bundle missing primitives into month 4 alongside cockpit prototype work.
- **Battle pass slip mitigation:** if battle pass not shipped by mid-month-6, push battle pass to month 7 and cut AI catalog-suggest (the largest AI surface). Anomaly explainer + offer copy generator are smaller (~1 week each) and can fit alongside late battle pass.
- **AI cost mitigation:** instrument every AI surface with per-request cost logging from day 1. Set Free-tier hard caps per surface (e.g. 50 catalog suggestions / day / project) per `[[indie-smb-pricing-research]]` recommendation. Use Haiku-tier for high-frequency calls; reserve Sonnet for balance simulation only.
- **General slip protection:** keep pre-seed conversations warm in parallel with build. If month-3 spine ships clean, accelerate to first design-partner conversations by month 4 (not month 5). Buys schedule buffer for downstream slips.

## Idiom citations

- `idioms/typescript.md` (when present in `~/.bocek/idioms/`) — discriminated-union patterns for AI response schemas (catalog suggest returns `{ kind: "suggestion" | "warning", payload: ... }`), so the dashboard branches safely on response type.
- Engine-first-with-AI pattern from Linear / Notion / Stripe — AI surfaces inside existing primitive UIs, not separate AI products. Per `[[wedge-decision]]`.
- Postgres + Go monolith pattern from Linear / RevenueCat / PostHog at MVP scale (these systems run Redis too, but BokChoy's MVP defers Redis until distributed rate limiting becomes load-bearing — idempotency, hot reads, and rate limits all start on Postgres or in-process).
- Unity Package Manager (UPM) + Asset Store distribution per Heroic Cloud + Beamable + Metaplay precedents.

## Revisit when

Specific triggers that should reopen this decision (quantitative where possible):

- **Month 3 retro: spine ships <6 of 8 primitives at production quality** → revisit MVP scope. Either extend spine to 4 months (compresses cockpit) or revisit Alternative B (accept gaps temporarily).
- **Month 4 first design partner converts on a non-mobile-F2P shape** (e.g. cosmetic-shop or MMO) → revisit slice choice; may force pivot back to slice-cell-research D1 or B1.
- **Month 5 retro: cockpit features incomplete (any of A/B + segments + offers + calendar missing)** → wedge demo state slips. Push fundraise pitch back; cut live-ops mechanics scope to fit month 6.
- **Month 6 retro: battle pass or quests not shipped** → AI surfaces cut; ship cockpit-only as v0.7.
- **Month 7 retro: AI surfaces not shipped** → ship without AI; per `[[wedge-decision]]` revisit trigger, this is the controlled slip.
- **First design partner explicitly asks for a primitive deferred to later month** (e.g. month-3 partner asks for battle pass) → renegotiate sequence with partner; may pull battle pass forward at cost of AI features.
- **AI cost per active project exceeds $5/mo on Free tier despite caps** → revisit AI rate limits per `[[indie-smb-pricing-research]]` + possibly revisit pricing tier mix.

## Confidence note

Overall confidence: **medium**. High on procedural rigor — the sequence is derived from the wedge decision, math research, and pricing research, and survives the founder's usability pushback. Medium on solo execution velocity — 17–20 distinct features in 7 months solo is at the high end of plausible; slip risk is the load-bearing risk per *Failure mode* and *Mitigations*. Low on first-design-partner game shape — the linear plan covers the largest cross-shape surface but a partner with unusual needs (e.g. PvP-heavy economy, energy-system-heavy gameplay) could force scope shifts.

The medium label means this decision is *vault-ready as the MVP keystone* but should be re-verified against month-3 spine retro and first-design-partner conversation in month 4.
