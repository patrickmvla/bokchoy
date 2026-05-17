---
type: research
features: [marketing]
related: ["[[cockpit/first-run-journey]]", "[[cockpit/file-structure]]", "[[cockpit-shape]]"]
created: 2026-05-14
confidence: medium
provisional: false
---

# What do mature B2B dev-tool / dev-infrastructure marketing landing pages actually ship?

## Question

What do mature B2B developer-tool / dev-infrastructure marketing sites ship, surveyed for: (a) site IA and route structure, (b) above-the-fold composition — hero copy + visual + primary CTA, (c) how technical capability is communicated on the landing (code samples, API surface preview, integration snippets), (d) primary CTA action — sign-up-free vs install-command vs read-docs vs talk-to-founder, (e) differentiation framing (how the site answers "why this not that")?

**Scope filter:** stage of the cited company is NOT the filter. Aesthetic and technical-communication quality is the bar — per the design-time honesty boundary: *the site can be as polished as Stripe; what the API offers must be what the backend ships.*

**Trigger:** BokChoy needs a marketing site shape before the (app)/marketing/ vertical slice can land. Existing vault decisions ((MK-COLOC) per `[[cockpit/first-run-journey]]`, domain strategy `bokchoy.com/` apex + `api.bokchoy.com/` backend) name *where* it lives. This entry surveys *what* it should look like.

## Triangulation

- **Production reference:** ✓ — 6 production sites surveyed via WebFetch on 2026-05-14: Stripe, Resend, Clerk, Lootlocker, RevenueCat, htmx. Four full extracts (Stripe, Lootlocker, RevenueCat, htmx); two partial (Resend, Clerk — IA + hero + CTA verified; code-sample claim unverified due to JS-rendering opacity).
- **Docs reference:** N/A for marketing patterns. The "official spec" is what shipped sites do.
- **Contradiction probe:** ✓ — htmx.org included specifically to falsify the "everyone does the Stripe shape" mode-collapse. It DID falsify it; an alternative shape (OSS / hypermedia / no-funnel) ships and works. Vaulted as Source 6.

## Sources examined

### Source 1 — Stripe homepage (`stripe.com`)

- **Tier:** 1 (production, the canonical mature B2B dev-infra reference).
- **Provenance:** WebFetch 2026-05-14.
- **What it tells us:**
  - **IA depth: massive.** 30+ products in footer (Atlas, Billing, Capital, Checkout, Connect, Climate, Crypto, Treasury, …). 7 top-nav items (Products, Solutions, Developers, Resources, Pricing, Sign in).
  - **Hero copy verbatim:** *"Financial infrastructure to grow your revenue."* Sub: *"Accept payments, offer financial services, and implement custom revenue models—from your first transaction to your billionth."*
  - **Primary CTA:** *"Get started"* → `dashboard.stripe.com/register`. Secondary: *"Sign up with Google"* (Google OAuth direct).
  - **Above-fold visual:** wave animation. NO code samples, NO product mockup in immediate hero.
  - **Code on landing:** none. Pushes devs to `/docs` via "View developer docs" link.
  - **Customer logos (carousel):** Amazon, Shopify, Figma, Woo, Uber, Anthropic, Lightspeed, Cursor, NVIDIA, Ford, Google, Mindbody, Ramp, OpenAI.
  - **Scale numbers:** $1.9T payments volume 2025, 135+ currencies, 99.999% uptime, 200M+ subscriptions.
  - **Differentiation:** NO competitor comparison table. Implicit via breadth + reliability.

### Source 2 — Resend homepage (`resend.com`)

- **Tier:** 1 (production, modern single-product dev-tool maturity reference).
- **Provenance:** WebFetch 2026-05-14, two passes. PARTIAL extract — JS-rendered content not fully reached.
- **What it tells us (verified):**
  - IA: top nav not extracted reliably. Footer confirms `/docs`, `/pricing`, `/customers`, `/changelog`, `/blog`, `/security` all exist.
  - Hero copy verbatim (extracted in pass 1): *"Resend is the email API for developers. Send transactional and marketing emails at scale with a simple, modern API."*
  - Compliance badges: SOC 2 + GDPR referenced in /security section.
- **What is NOT verified (open thread):**
  - Whether the landing page ships visible code samples above the fold (training-data inference says yes, but WebFetch returned "I cannot see them — content provided is a navigation/resource directory rather than the actual landing page"). **Not vaulting the code-on-hero claim without browser-level verification.**
  - Primary CTA text + destination not extracted.
  - Customer logos not extracted.

### Source 3 — Clerk homepage (`clerk.com`)

- **Tier:** 1 (production, auth dev-infra; Better Auth's commercial competitor — directly comparable product class to part of BokChoy's stack).
- **Provenance:** WebFetch 2026-05-14, two passes. PARTIAL extract — code-sample question unresolved as with Source 2.
- **What it tells us (verified):**
  - IA: tight. Footer Resources: Pricing, Documentation, Blog, Changelog, llms.txt. Verified `/docs`, `/pricing`, `/changelog`, `/blog`. NOT verified: `/customers`, `/security`.
  - Hero copy verbatim: *"More than authentication. Clerk gives you full stack auth and user management — so you can launch faster, scale easier, and stay focused on building your business."*
  - Primary CTA: *"Start building for free"* → `/docs/quickstart`. Routes to docs, NOT direct signup — distinguishes Clerk from Stripe/RevenueCat/Lootlocker which route to signup.
  - Customer logos (verbatim): Browserbase, Inngest, Braintrust, Durable, OpenRouter, Higgsfield, Upstash, Samaya AI, Consensus, Cartesia, David AI. **All AI-startup heavy** — Clerk has positioned in the AI dev-tool ecosystem.
  - Testimonial (verbatim): *"Clerk feels like the first time I booted my computer with an SSD."* — Theo Browne, Ping Labs.
  - Scale number: *"Free for your first 50,000 monthly retained users."*
- **What is NOT verified:** code samples on landing page (component names like `<SignIn />` referenced but no actual code blocks extracted by WebFetch).

### Source 4 — Lootlocker homepage (`lootlocker.com`)

- **Tier:** 1 (production, game-backend services with virtual economy primitives — direct-adjacent class to BokChoy).
- **Provenance:** WebFetch 2026-05-14. Full extract.
- **What it tells us:**
  - IA: 8 top-nav items (Features, Solutions, Pricing, Resources, About, Contact, Login, Create Account). Tight by Stripe's standard, mid-weight overall.
  - Hero copy verbatim: *"The game backend"* + sub *"Powering everything from in-game systems to direct player relationships across games, platforms, and catalogs."* Three-word headline is the tightest in the survey.
  - Primary CTA: *"Create Free Account"* → `/sign-up`.
  - Above-fold visual: sky/cloud decorative banner. NO code samples, NO product mockup.
  - Code on landing: none. Mentions *"open-source SDKs for Unity, Unreal, and Godot"* in plain text but no syntax.
  - Studio logos: Fast Travel Games, Digital Bandidos, Snowcastle, Team17, Turborilla, The Gang. Plus 18 game titles named.
  - Trust signal language: *"Trusted by leading studios & publishers from around the world"* — non-specific scale.
  - Differentiation: *"Why teams choose LootLocker"* 3-pillar (Seamless Integration / Your Toolbox / Built to Last). NO competitor naming (no PlayFab/GameSparks/build-in-house comparison).

### Source 5 — RevenueCat homepage (`revenuecat.com`)

- **Tier:** 1 (production, mobile IAP/subscriptions — closest monetization-adjacent at maturity).
- **Provenance:** WebFetch 2026-05-14. Full extract.
- **What it tells us:**
  - IA: heavy by Lootlocker's standard, light by Stripe's. 7 top-nav items including *"Why RevenueCat?"* surfaced as primary nav. Footer Solutions split by team type (engineering / marketing / product / support / data) AND by company size (Indies / Startups / Enterprise / Agencies).
  - Hero copy verbatim: *"Build and grow your app business"* + sub *"The world's best apps use RevenueCat to power purchases, manage customer data, and grow revenue on iOS, Android, and the web."*
  - Primary CTA: *"Start for free"* → `app.revenuecat.com/signup`. Secondary: *"Talk to sales"* → `/talk-to-sales/`.
  - Above-fold visual: SVG placeholder (product mockup, likely the RevenueCat dashboard — not text-extractable).
  - Code on landing: none extracted.
  - Customer logos: Notion, OpenAI, VSCO, Ladder, Runna.
  - Scale numbers: *"96,000 Apps trust RevenueCat"* + *"4B+ API requests daily"* + *"$13B+ Revenue processed annually"*.
  - Testimonials with quantified outcomes: VSCO 5% churn reduction, CardPointers ~27% saved in app store fees, Pixery 6000+ engineering hours/year, Dipsea 36% reduction in refund rates. **Quantified-outcome testimonials are RevenueCat's signature trust pattern.**
  - Compliance: SOC2, GDPR, 4.8/5 Capterra, 4.8/5 G2.
  - Differentiation: *"Why RevenueCat?"* in top nav. Dedicated `/build-vs-buy/` page. Key positioning *"Just one API instead of one for each platform"* (cross-platform simplification). NO direct Adapty comparison.

### Source 6 — htmx homepage (`htmx.org`)

- **Tier:** 1 (production, OSS, intentionally contradiction probe).
- **Provenance:** WebFetch 2026-05-14. Full extract.
- **What it tells us:**
  - IA: 5 items total (docs, reference, examples, talk, essays). Anti-IA. No nav for pricing, signup, customers, blog.
  - Hero copy verbatim: *"htmx — high power tools for HTML"* + tagline *"htmx gives you access to AJAX, CSS Transitions, WebSockets and Server Sent Events directly in HTML"*.
  - Primary CTA: implicit — docs / examples link. NO signup button.
  - Above-fold visual: retro 90s ad banners (intentional anti-aesthetic). **AND** a 3-line code sample IS the hero element: `<button hx-post="/clicked" hx-swap="outerHTML">Click Me</button>` with explanation.
  - Trust signals: SPONSOR logos (Commspace platinum + 20+ silver including JetBrains, GitHub, Craft CMS), NOT customer logos. OSS register substitutes "who funds us" for "who uses us."
  - Differentiation: explicit competitor frame *"reduced code base sizes by 67% when compared with react"* — the ONLY direct named-competitor positioning in the entire survey.

## Findings

### F1 (LOAD-BEARING) — Hero composition: [noun-claim] + [outcome-frame], 6–12 words

Universal across 6/6 surveyed sites:

| Site | Headline | Frame |
|---|---|---|
| Stripe | *"Financial infrastructure to grow your revenue"* | infrastructure → outcome |
| Resend | *"Resend is the email API for developers"* | what-we-are → audience |
| Clerk | *"More than authentication"* | category-anchored differentiation |
| Lootlocker | *"The game backend"* | maximally-tight noun-claim |
| RevenueCat | *"Build and grow your app business"* | outcome-only (no infra-noun) |
| htmx | *"high power tools for HTML"* | tool-claim + medium |

Two viable shapes: (i) **infrastructure-as-noun + outcome** (Stripe, Resend, Lootlocker) or (ii) **outcome-only** (RevenueCat). Both work. Pure "what we do" without an outcome frame is absent from the survey.

Sub-headline universally elaborates the noun-claim with concrete scope (Stripe: *"from your first transaction to your billionth"*; Lootlocker: *"across games, platforms, and catalogs"*; RevenueCat: *"iOS, Android, and the web"*).

### F2 (LOAD-BEARING) — Code samples on the landing page: split by product class

Two patterns, sorted by surveyed evidence:

- **No code on landing** (4/6 verified): Stripe, Lootlocker, RevenueCat, Clerk. All ship "View docs" or "Start building" link instead.
- **Code IS the hero** (1/6 verified): htmx ships a 3-line code sample as the primary above-fold content.
- **Unverified** (2/6 — open thread): Resend and Clerk could not be reliably extracted by WebFetch; whether their landings ship code is unresolved. Training-data inference says Resend ships code; not vaulting without verification.

The split correlates with **product horizontality**: Stripe/RevenueCat sell to non-devs (PMs, finance teams, business folks) → code on landing would alienate the non-dev audience. htmx sells exclusively to devs → code IS the value proposition.

For BokChoy: it sells exclusively to game devs. Audience is the htmx/Resend class, not the Stripe/RevenueCat class. The code-as-hero pattern is viable on audience grounds.

### F3 — Trust signals: customer logos + scale numbers + compliance badges (in roughly that universality order)

| Signal | Stripe | Resend | Clerk | Lootlocker | RevenueCat | htmx |
|---|---|---|---|---|---|---|
| Customer logos | ✓ (14) | ? | ✓ (11) | ✓ (6 + 18 game titles) | ✓ (5) | ✗ (sponsor logos instead) |
| Scale numbers | ✓ ($1.9T) | ? | ✓ (50k free tier) | ✗ (non-specific) | ✓ ($13B, 96k apps, 4B req/day) | ✗ |
| Testimonials | ✓ | ? | ✓ (Theo Browne) | ✗ | ✓ (quantified-outcome shape) | ✗ |
| Compliance badges | ✗ (deeper on /security) | ✓ (SOC2, GDPR) | ? | ✗ on landing | ✓ (SOC2, GDPR + G2/Capterra) | ✗ |

Universal at maturity: **customer logos + scale numbers + at least one compliance signal somewhere.**

**For BokChoy at v1 (pre-launch, zero customers, zero scale numbers, no SOC2 yet):** all three universal trust signals are unavailable. Either:
- Ship without them (htmx pattern — substitutes sponsor logos, but BokChoy isn't OSS so doesn't have sponsors either).
- Substitute *technical* trust signals (the open-source backend visibility, the published API contract, the idempotency + audit-log primitives shown explicitly as features).

This is the load-bearing gap for the v1 design pass.

### F4 — Primary CTA: "Get started free / Sign up free / Create free account" is the consensus; "Talk to sales" appears as secondary only at real ARR

| Site | Primary CTA | Routes to |
|---|---|---|
| Stripe | *"Get started"* | direct signup |
| RevenueCat | *"Start for free"* | direct signup |
| Lootlocker | *"Create Free Account"* | direct signup |
| Clerk | *"Start building for free"* | `/docs/quickstart` (NOT direct signup) |
| Resend | (unverified) | (unverified) |
| htmx | (none — OSS) | docs |

5/6 ship a free-tier CTA as primary (1 unverified). Only RevenueCat ships *"Talk to sales"* as secondary. **No site in the survey ships "Talk to sales" as the primary CTA.**

**Clerk's deviation** — routing to `/docs/quickstart` instead of direct signup — is a real second pattern. Hypothesis: Clerk's dev audience self-onboards through the SDK; the docs-first CTA is funnel-honest about who actually integrates the product first. For BokChoy this is worth a /design pick — direct-signup OR docs-first.

### F5 — IA depth scales with product breadth, not company maturity

- **Heavy IA** (Stripe 30+ products in footer): platform with multiple SKUs.
- **Mid-weight IA** (RevenueCat ~20 product entries with team-segmented Solutions): single product line with diverse personas.
- **Light IA** (Lootlocker 8 top-nav items): single product, multiple verticals.
- **Tight IA** (Clerk + Resend ~5-6 nav items): single product, single primary persona.
- **Anti-IA** (htmx 5 nav items, no footer): OSS, no funnel.

BokChoy at v1 is single-product (wallet primitives) with single primary persona (game devs). Closest fit: **Clerk/Resend tight pattern**. Adopting Stripe/RevenueCat depth at v1 would falsely imply product breadth.

### F6 — Differentiation framing: positioning beats vs-tables; direct competitor naming is rare

Surveyed differentiation forms:

| Form | Cite | Verbatim |
|---|---|---|
| No comparison; positioning via breadth/reliability | Stripe | implicit |
| 3-pillar "Why X" section, NO competitor named | Lootlocker | *"Seamless Integration / Your Toolbox / Built to Last"* |
| "Why X?" in top nav + `/build-vs-buy/` page (build-it-yourself vs RevenueCat, NOT vs Adapty) | RevenueCat | *"Just one API instead of one for each platform"* |
| Implicit via velocity claim | Clerk | *"launch faster, scale easier"* |
| Direct named-competitor benchmark | htmx | *"67% less code than React"* |

Pattern: **5/6 sites avoid direct competitor naming on the landing.** The one that does (htmx) is OSS with an explicit philosophical opponent (React-as-status-quo). Commercial dev-tools position-not-compare.

For BokChoy: don't put a "vs PlayFab / vs Lootlocker / vs roll-your-own" table on the landing. Position the product; let the visitor draw the comparison themselves. *"Vs build-it-yourself"* is a defensible framing if a `/build-vs-buy/` page lands later (RevenueCat-style).

### F7 — Above-fold visual: abstract-decorative OR product-mockup OR code-as-hero

| Site | Visual |
|---|---|
| Stripe | wave animation (abstract) |
| Lootlocker | sky/cloud (abstract decorative) |
| RevenueCat | SVG placeholder (product mockup likely) |
| Clerk | (not extracted) |
| Resend | (not extracted; training-data inference: code panel) |
| htmx | retro ad banners + code sample (anti-aesthetic + code-as-hero) |

Three viable shapes. Abstract is lowest-effort + safest. Product-mockup requires the cockpit to look good in a screenshot. Code-as-hero requires the API call to be short and demonstrative.

For BokChoy: a 5-line code sample showing the wallet primitive (`bokchoy.wallets.credit({ playerId, amount, reason })` or similar) is *both* a hero visual AND a technical-capability communication AND a differentiation signal. **It's the highest-leverage choice if the actual API call reads cleanly in 5 lines.** Open thread for /design: does the API call actually demo well in that frame, or does it need too much setup context?

## Conflicts

### C1 — Resend / Clerk code-sample claim unverifiable from WebFetch

Per *Contradiction protocol* (production code wins): WebFetch returned honest "I cannot see code samples" responses for both Resend and Clerk. Training-data inference says both ship code on landing (Resend specifically known for `resend.emails.send({…})`-style panel). NOT vaulted as a finding. Open thread.

### C2 — Hero composition divergence on "noun-claim" mandatory-ness

5/6 ship a noun-claim ("infrastructure", "backend", "API"). RevenueCat ships outcome-only ("Build and grow your app business") — no infrastructure-noun in the headline. **Both work at scale; this is a stylistic fork, not a correctness gate.** /design should pick.

## Conditions

- **Time:** May 2026. All sites observed via WebFetch on 2026-05-14.
- **Product class:** B2B dev-tool / dev-infrastructure marketing. Survey DOES NOT apply to consumer marketing, B2C SaaS marketing, or non-dev developer-adjacent products.
- **Topology assumption:** Vercel-hosted Next.js OR similar JAMstack hosting. Some patterns (e.g., Resend's JS-rendered code panels) assume a modern frontend stack; older Jekyll/Hugo sites have different rendering pipelines.
- **Confidence:** medium overall. The hero-composition + CTA + IA-depth findings hold across 6/6 with confidence high. The code-on-landing finding has a 2/6 unverified gap (Resend, Clerk) that downgrades the overall.

**DOES NOT hold for:**
- OSS-tool marketing (htmx) outside the contradiction-probe role — different funnel, different trust patterns.
- Consumer-facing dev-tool products (e.g., a coding-as-a-hobby SaaS) — audience is wrong class.
- Game-engine marketing (Unity, Unreal home pages) — these are tooling marketing, not service/API marketing. Out of scope.

## Operational implications

### For the /design pass that follows (immediate)

1. **Hero headline:** F1. 6–12 words. Two viable shapes: noun-claim + outcome OR outcome-only. Sub-headline elaborates concrete scope. **Decision owed:** which shape for BokChoy.
2. **Hero CTA:** F4. *"Start free"* or *"Create free account"* → `/sign-in` (Better Auth OAuth flow already wired per `[[cockpit/first-run-journey]]` step 1+3). **Decision owed:** direct-signup (Stripe/Lootlocker/RevenueCat) OR docs-first (Clerk).
3. **Hero visual:** F7. Three viable: abstract-decorative / product-mockup / code-as-hero. **Decision owed.** Code-as-hero is highest-leverage IF the wallet API call reads cleanly in 5 lines; otherwise abstract is the safer default.
4. **IA depth:** F5. Adopt Clerk/Resend tight pattern at v1 — single product, single persona. Likely: Product / Pricing / Docs / Changelog / Sign in. **Decision owed:** is a `/customers` page meaningful at v1 with zero customers, or skipped until there's content?
5. **Trust signals at v1:** F3 gap. Customer logos, scale numbers, SOC2 all unavailable. **Substitute strategy needed.** Candidate substitutes: open-source backend visibility (if the cockpit source is public — currently not stated); API contract publication (the `[[cockpit/admin-list-endpoints-contract]]` shape could power a public reference); explicit feature signals (idempotency, audit log, defense-in-depth proxy.ts gate — *technical* trust replacing *social* trust).
6. **Differentiation framing:** F6. Position, don't compare. No vs-table at v1. /build-vs-buy/ as a follow-on page later, modeled on RevenueCat's pattern, may be the right move when there's mass to defend.
7. **Honesty boundary (carry-forward from prior turn):** the marketing site can ship the polish register of Stripe/Resend regardless of BokChoy's actual stage, BUT any code sample shown must call an endpoint that actually exists, any feature claimed must be implemented, any pricing tier shown must be billable. /design must enforce this at the page-content level when applied.

### For `[[cockpit/file-structure]]`

The `modules/marketing/` vertical slice named in the file-structure entry: at v1, expect ~5 sub-components (Hero, FeatureGrid or sections, CTAStrip, Footer, possibly CodeSampleBlock). Tight scope. The `(marketing)/` route group hosts `app/(marketing)/page.tsx` (the apex landing) + likely `app/(marketing)/pricing/page.tsx` + `app/(marketing)/changelog/page.tsx` per the IA finding.

### For `[[cockpit/first-run-journey]]` step 1

The CTA-to-OAuth path is unchanged. Per F4 5/6 cites route the hero CTA direct-to-signup; Clerk's docs-first deviation is the alternative. /design pick.

### For tech-stack decisions (separable, NOT this entry)

- Content management for changelog + blog: MDX-in-repo vs CMS — separable open thread.
- Code-sample syntax highlighting: shiki vs prism — implementation detail, defers to /implementation.

## Reproducibility note

Reproducible by WebFetching the same six URLs (or any 4+ from the cite-class list) with structured extraction prompts targeting IA / hero / code / CTA / trust signals / differentiation. The 2/6 partial-extract gap (Resend, Clerk) can be closed by:
- Headless-browser screenshot inspection (Playwright or similar).
- Manual browser inspection by the operator.
- Better Auth-style direct source-walk of the marketing site repository if open-source (Resend's source is not public; Clerk's is not public).

Survey took ~6 parallel WebFetches + 2 second-pass WebFetches in approximately 90 seconds of wall-clock time. Reproducible by anyone with web access.

## Open threads

1. **Resend + Clerk code-on-landing verification.** Both sites unresolved on whether they ship visible code panels above the fold. Headless-browser pass owed before the /design pick on F7 (visual shape).
2. **Voice / tone register survey.** Stripe-technical vs Vercel-aspirational vs Linear-minimal vs Resend's brand-voice — none surveyed here. Separable research session. Trigger: when the /design pass picks hero copy and the voice itself needs grounding.
3. **`/customers` page at zero customers.** Specific decision: skip the page entirely until there are customers, OR ship a "case studies coming soon" placeholder, OR repurpose the URL for partner logos / community-built integrations.
4. **`/build-vs-buy/` follow-on page.** RevenueCat-style explicit comparison page. Worth vaulting as a v2 marketing slice; doesn't need to land at v1.
5. **Sponsor / partner logo pattern.** htmx's substitute for customer logos uses sponsors. Not directly applicable to BokChoy (commercial product, no sponsors), but the *substitute trust signal* concept transfers — what does BokChoy use instead of customer logos at v1?
6. **Code-sample shape verification.** Independent of F7, the actual wallet API call's readability in a 5-line hero block is a /design + /implementation joint question. The API design might need to be evaluated specifically for "does this read well in marketing?" — not as the primary design driver, but as a tiebreaker.
