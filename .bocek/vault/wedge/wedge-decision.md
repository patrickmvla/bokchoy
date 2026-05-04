---
type: decision
features: [wedge]
related: ["[[design-claims-register]]", "[[cockpit-gap-research]]", "[[slice-cell-research]]", "[[sales-cycle-research]]", "[[structural-moat-research]]", "[[integration-feasibility-research]]"]
created: 2026-04-30
confidence: medium
---

# Wedge: indie F2P economy engine with free-tier cockpit, engine quality as moat, AI woven in as tooling

## Decision

Five interlocking choices that replace the original `docs/DESIGN.md` v0.1.0 wedge frame. Each survives the cumulative pressure-test of the five research entries above.

1. **Path 3 — Pivot the tier.** Move BokChoy from AA mid-core European F2P (the original DESIGN.md target) to **indie/SMB tier of A1 mobile F2P**. Rejection of paths 1 (named co-founder credibility) and 2 (soft-gate downgrade with substitute trust signals).
2. **3-B (PLG SMB tier of A1).** Free + Indie ($99/mo) as median customer; designer-led adoption; engine asset stores + Discord + Pocket Gamer Connects as channels. Studio tier ($1,499/mo) reached only after the Indie funnel proves out. Rejection of 3-A (D1 MMO niche — wrong domain) and 3-C (open-source-core — direct conflict with Heroic at scale).
3. **β MVP scope** — spine (wallet, inventory, catalog, shop, IAP, Unity SDK) **plus** cockpit features (A/B testing, segments, offer builder, live-ops calendar) **plus** AI tooling woven into existing surfaces (catalog suggest, offer copy generator, anomaly explainer). 7-month solo timeline. Replaces α (too thin to demonstrate the wedge).
4. **Wedge mechanism** — **free-tier cockpit** (the differentiator) **+ engine quality** (the moat) **+ AI as tool, not product** (the leverage). Replaces the "complement, don't compete" framing in DESIGN.md §4.
5. **20-month runway cap.** Hard constraint on MVP-ship + design-partner-acquisition + pre-seed-close window. Drives MVP scope and timeline math.

## Reasoning

### Why path 3, not 1 or 2

Founder credibility (CL-003) is the gating signal at AA-AAA mid-core European F2P (production-cited via [[structural-moat-research]] Source 6 — AccelByte's $60M raise + named ex-Fortnite/EA Origin/Xbox Live engineers). Founder is solo, ex-EA contact does not have AccelByte-class public credit, ex-EA-as-investor is shape (iii) — fits-the-profile, not committed. Path 1 (hard credibility moat) doesn't close. Path 2 (soft-gate substitute trust signals) doesn't have a defended substitute given solo founder + no public technical content named yet. Path 3 — pivot to a tier where credibility isn't the gating signal — is the only honest survivor.

### Why 3-B over 3-A and 3-C

- **3-A (D1 MMO niche):** wrong domain depth match. Founder's claimed depth is AI integration + game-economy-domain-research-to-be-built; this skill set fits mobile F2P (gacha PMF, retention curves, segment monetization) better than MMO (player-driven trade, sink/faucet macro, RMT detection, market-clearing algorithms). Per [[slice-cell-research]] Findings — D1 customer count is ~5–10 globally at scale; market too small to support the runway target.
- **3-C (open-source core, Heroic / PostHog model):** direct conflict with Heroic Labs at the scale verified in this session — 500k devs, 600M installs, $1B annual revenue across customers, 10k GitHub stars, 10 years old (production-cited via Heroic Labs October 2025 newsletter + Crunchbase). Solo founder pitching against that distribution moat on the same wedge is bet-the-company asymmetric. 3-B retains an open-source SDK as supporting infrastructure but does not compete with Heroic on full-stack open-source.

### Why β over α

α (spine-only) was too thin to demonstrate the wedge against named incumbents. Per [[cockpit-gap-research]] verified matrix: the spine (wallet, inventory, catalog, shop, IAP, SDK) is shipped first-class by every named incumbent (PlayFab v2, Unity GS, Beamable, Metaplay, Hiro/Nakama, Balancy). Differentiation requires shipping at least one cockpit feature surface incumbents gate behind paid tiers. β's cockpit layer (A/B + segments + offer builder + live-ops calendar at the Free tier) is the wedge mechanism. Sources: [[cockpit-gap-research]] confirms each cockpit feature is gated behind paid tiers at Metaplay (€195/mo Starter+), Balancy (paid tier), PlayFab (Standard $400/mo+), Beamable (paid tier).

### Why engine-first with AI as tool, not AI-first

Founder pushback on the AI-first framing (recorded 2026-04-30): *"AI feels like will divert from building a Mobile F2P play economy engine and build ai slop the whole product becomes ai driven instead of it being the tool it needs to be — i don't want to depend on AI; we have it but it shouldn't be the actual product."* Substantive engineering judgment. Engine quality is the moat (hard to copy, compounds with switching cost); AI features are leverage (easy to copy via bolt-on within 12 months as APIs commoditize). Pattern: Linear / Notion / Stripe ship engine-first with AI features inside, not AI-first products. Inferred-medium on the comparable-product-shape claim — verified via product surfaces (Linear's AI features documented as augmentation; Notion AI as enhancement layer; Stripe Radar as ML-backed but not the product). Production-cited at the engine-first-with-AI tier.

### Why 20-month runway shape

Founder-named hard cap (recorded 2026-04-30). Realistic timeline: 7-month MVP build + 5–8 months design-partner conversations + first 3–5 paying users + 3–6 months pitch + close = 15–21 months total. Cap leaves 0–5 month slippage buffer. β scope is **the largest scope that fits within the cap**; γ (full Domain 2 cockpit) does not fit. α (spine only) has buffer but not the wedge mechanism. β is the load-bearing fit.

## Engineering substance applied

System-shaped decision; relevant principles per [[design-claims-register]] CL-014 onward (P2 derivation work) interact with this wedge at the implementation layer. At the wedge level:

- **Consistency:** wallet integrity is non-negotiable per DESIGN.md §12.1–§12.2 carry-over. Server-authoritative writes; ETag-based optimistic concurrency for catalog and inventory updates per [[cockpit-gap-research]] Source 1 (PlayFab v2 ships ETags; we follow the standard pattern). Confidence: high.
- **Failure semantics:** at-least-once + idempotency keys for all mutating client API calls (carry-over from §12.9). AI tool-layer calls are non-deterministic; cache by input-hash, provide deterministic fallback (catalog editor works without AI suggestions; dashboard works without anomaly explainer).
- **Concurrency:** optimistic locking on catalog versions; designers can ship concurrent edits with merge-on-publish per the §12.3 carry-over. Specific DAG semantics deferred to P2 derivation (CL-030).
- **Observability:** every AI recommendation logged with model version + prompt template hash + designer's accept/reject. Page on AI service downtime (designer can still use cockpit) but not on AI quality regression (slow signal, manual review).
- **Cost economics for AI tool layer:** model selection by call frequency. Cheap models (Haiku-tier) for high-frequency catalog suggestions. Higher-cost models (Sonnet/Opus) for low-frequency balance simulation + anomaly explanation. Cache aggressively. Rate-limit AI surfaces on Free tier to keep margin defensible.
- **Scaling axis:** PLG funnel — 0 → 100 paying customers over 18–24 months. Different scaling shape than enterprise (small-N high-trust). Single region (Frankfurt) at MVP; multi-region post Series A.

## Production-grade gates

- **Idiomatic to *this* stack, *this* version, *this* year.** Stack: TypeScript dashboard (Next.js 15 + Tailwind + shadcn + TanStack Query), Go API services, Postgres 16 + Redis, Anthropic Claude API for AI tool layer, Unity 2022+ C# SDK distributed via UPM and Asset Store. All current 2026 idioms; aligns with `idioms/typescript.md` discriminated-union patterns for AI response schemas (when AI surface returns structured suggestions). Confidence: high.
- **Industry-standard for the problem class.** **Engine-first with AI features:** Linear (issue tracker + AI), Notion (wiki + AI), Stripe Radar (payments + ML). All shipping; all sustainable; all distinct from AI-first vertical SaaS (Cursor, v0, Replit Ghostwriter). Production-cited via product surfaces. **Free-tier cockpit:** PostHog (free tier with full feature surface), Cal.com (free tier with paid commercial features). Production-cited at the dev-tools-PLG tier — though the *game-dev-tools tier* has no direct precedent at this depth (production-cited zero — empty cell). Confidence: medium.
- **First-class, not workaround.** Server-authoritative writes per §12.4 carry-over. Postgres native catalog versioning (no custom DAG before evidence demands it). Idiomatic Unity Package Manager + Asset Store distribution. AI service is a thin layer over the LLM API, not a workaround for missing functionality. Confidence: high.

## Rejected alternatives

### Original DESIGN.md v0.1.0 wedge — AA mid-core European F2P + complement-don't-compete + designer-first cockpit gap
**What:** the doc's framing pre-research. Premium pricing ($1,499–$4,999/mo Studio tiers), 12–18 month replacement cycle, partnership-led GTM via Heroic Labs, "designer-first live-ops UX gap" as wedge mechanism.
**Wins when:** founder has AccelByte-class credibility, 5+ named active partnerships, paid-tier-only cockpit really is the gap (which it isn't — see [[cockpit-gap-research]]).
**Why not here:** every load-bearing claim was falsified or partially falsified across CL-007 / CL-001 / CL-009 / CL-002 / CL-006 in this session. Cumulative damage too severe to patch; replaced wholesale.

### 3-A — D1 niche play (mid-scale MMO-like player-driven economy)
**What:** narrow surface to economy primitives + player-to-player trade + sink/faucet for ~50–100 mid-scale MMO-like games not served by Hiro depth. ARR ceiling ~$3–8M Year 5. Acquisition-bait, not category-leadership.
**Wins when:** founder has monetary-economics + concurrency-systems depth (MVCC, market-clearing). Real player-driven economy is the explicit ICP need.
**Why not here:** founder's depth is AI integration + mobile-F2P-domain-to-be-researched. Wrong skill match. D1 customer count too small to fit fundraise narrative. Per [[slice-cell-research]] Findings.

### 3-C — Open-source-core + hosted commercial (Heroic / PostHog model)
**What:** ship a self-hostable open-source economy core; commercial product is hosted + enterprise features. Capital-efficient via community.
**Wins when:** open-source distribution can outgrow Heroic Labs' 10k GitHub stars + 500k devs + 10-year head start, OR the founder has differentiated technical reputation (which 3-B does not require).
**Why not here:** direct conflict with Heroic at distribution scale verified in this session (Source: Heroic October 2025 newsletter, Pocket Gamer 10-year retrospective). Bet-the-company asymmetric for solo founder. 3-B retains an open-source SDK as supporting on-ramp without competing on full-stack open-source.

### W3 — AI-augmented economy designer (AI-first wedge)
**What:** AI is the headline product; "Cursor for game economy designers" pitch.
**Wins when:** AI features themselves are deep, defensible, and impossible-to-bolt-on. (Cursor pattern: deep IDE-integration that JetBrains' AI features couldn't match.)
**Why not here:** founder pushback (recorded 2026-04-30): AI-first framing risks shipping "AI slop" — LLM features without substance, vulnerable to incumbent bolt-on within 12 months, weak engine moat. Engine-first with AI as tool is the substantively better product *and* a comparably strong fundraise narrative (Linear/Notion shape).

## Failure mode

Three specific failure scenarios, ranked by likelihood and cost.

1. **MVP slips past month 7 → AI surfaces don't ship → fundraise narrative weakens.** The 7-month estimate assumes solo execution velocity holds across spine + cockpit + AI integration. A 30% slip pushes MVP to month 9 — runway tightens to 11 months for the rest. Probability: medium (solo MVPs commonly slip 30–50%). Cost: medium-high — the AI-as-tool layer is the differentiator over a pure free-tier-cockpit pitch.
2. **Free-tier cockpit doesn't actually win indie/SMB design partners.** Indies may prefer free + minimal cockpit (Metaplay Free shape) over free + full cockpit + slightly newer vendor. Probability: medium. Cost: high — invalidates the wedge mechanism. Discoverable in months 4–7 via direct conversations with first 3 design-partner candidates.
3. **AI cost economics negative on Free tier.** Indie devs hammer AI surfaces; LLM API spend exceeds margin. Probability: medium-low (cache-by-input-hash + cheap models for high-frequency calls + rate limits should hold). Cost: medium — fixable post-discovery via tighter rate limits, but burns capital while learning.

## Mitigations

- **For MVP slip:** AI surfaces are designed as last-to-ship (months 6–7). If runway tightens, ship spine + cockpit at month 7 and demo AI-as-tool as v0.2 differentiator at the pitch. Cockpit at free tier is still a defensible pitch without AI.
- **For free-tier-cockpit market fit risk:** validate via 3 founder-led design-partner conversations in months 4–6, *before* shipping the full cockpit surface. Discovery questions: *"if you got A/B testing and segment manager at $0, would you switch off your current backend?"* — listen for the conversion friction.
- **For AI cost:** instrument every AI surface with per-request cost logging from day 1. Set Free-tier hard caps per surface (e.g. 50 catalog suggestions / day / project). Convert heavy users to paid tier with explicit messaging.
- **For founder runway:** keep pre-seed conversations warm in parallel with build. If the design-partner data converts well, accelerate pitch. Don't wait until month 14 to start; start month 10.

## Idiom citations

- `idioms/typescript.md` (when present in `~/.bocek/idioms/`) — discriminated-union patterns for AI response schemas (catalog suggestions, anomaly explanations) so the dashboard can branch safely on `kind: "suggestion" | "warning" | "explanation"`.
- Engine-first-with-AI pattern from Linear / Notion / Stripe — cited in this entry's *Production-grade gates* section.
- PostHog / Cal.com free-tier-with-full-feature-surface pattern at the dev-tools tier — though the *game-dev-tools* application is empty-cell.

## Revisit when

Specific triggers that should reopen this decision (quantitative where possible):

- **3 of 3 first design-partner candidates reject "free-tier cockpit" as not solving their primary need** → wedge mechanism failed; revisit slice or wedge before scaling further.
- **Heroic Labs ships A/B testing + segments + offer builder + live-ops calendar at no extra cost in Hiro / Nakama Console** → cockpit gap closes; wedge mechanism dies; revisit immediately.
- **MVP slips past month 9 with AI surfaces still not shipped** → revisit timeline + cut scope or extend runway.
- **AI cost per active project exceeds $5/mo on Free tier despite caching + rate limits** → margin model breaks; revisit pricing or cap AI surfaces more aggressively.
- **Pre-seed pitch fails after 6 named investor conversations** → revisit fundraise narrative; possibly revisit wedge if the rejection theme is consistent.
- **Founder secures AccelByte-class co-founder unexpectedly** → path 3 rejection no longer holds; revisit whether to climb back to AA mid-core (path 1).

## Confidence note

Overall confidence: **medium**. High on procedural rigor — the decision is properly derived from 5 triangulated research entries and survives a substantive engineering pushback. Medium on market validation — no customer-discovery evidence yet (PK-* park items unanswered). Low-medium on the AI-tool-layer specifically (founder's claimed AI integration depth is asserted, not verified by shipped artifacts in this session). The medium label means this decision is *vault-ready as the rewrite keystone* but should be re-verified against the first 3 design-partner conversations before scaling investment.
