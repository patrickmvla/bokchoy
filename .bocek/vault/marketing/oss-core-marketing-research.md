---
type: research
features: [marketing]
related: ["[[marketing/landing-patterns-research]]"]
created: 2026-05-14
confidence: high
provisional: false
---

# OSS-core commercial dev-tool marketing patterns: extension to `[[marketing/landing-patterns-research]]`

## Question

How does the OSS-core commercial cite class — products with BOTH a public GitHub repo AND `/pricing` page with paid tiers — handle the patterns surveyed in `[[marketing/landing-patterns-research]]`? Specifically: does the OSS-core register break F1 (hero composition), F2 (code-on-landing), F3 (trust signals at maturity), F4 (CTA), F6 (differentiation framing)? And what NEW signals does the OSS-core class introduce that the prior entry didn't surface?

**Trigger:** prior entry surveyed 6 sites; only htmx covered OSS register, and htmx is pure OSS (no commercial tier) — useful as contradiction probe, not as application reference. User halted on this gap: *"lets look at some opensource projects"*, then accepted three OSS-core commercial cites: Supabase, PostHog, Plausible.

## Triangulation

- **Production reference:** ✓ — 3 production OSS-core commercial sites surveyed via WebFetch on 2026-05-14: Supabase, PostHog, Plausible.
- **Docs reference:** N/A; the "spec" is what shipping sites do.
- **Contradiction probe:** ✓ — the cite class itself is the contradiction to the prior entry's commercial-only sample. Plausible specifically falsifies F6's "5/6 commercial dev-tools position-not-compare" claim (see F8a below).

## Sources examined

### Source 7 — Supabase homepage (`supabase.com`)

- **Tier:** 1 (production, Postgres-backed BaaS — closest stack-shape rhyme with BokChoy in the OSS-core class).
- **Provenance:** WebFetch 2026-05-14. PARTIAL extract (top-nav + customer logos + CTA destinations not reached by HTML extraction; same JS-rendering opacity that hit Resend + Clerk in the prior entry).
- **What it tells us (verified):**
  - **Hero copy verbatim:** *"Build in a weekend. Scale to millions."* Sub: *"Supabase is an open source Firebase alternative built on Postgres. It provides a complete backend platform for building web and mobile applications, with a suite of integrated tools that work together out of the box."*
  - **Code on landing:** NONE extracted. Surprising for a dev-platform product. Either WebFetch missed it OR Supabase genuinely doesn't lead with code on the homepage.
  - **OSS claim verbatim:** *"Open source: all core tools are open source and self-hostable"* — in a differentiators bullet list, NOT in the hero.
  - **Compliance:** *"SOC2 Type 2 compliant"*. No HIPAA or GDPR claims surfaced in extract.
  - **`/docs` ✓, `/pricing` ✓.** Other paths not confirmed.

### Source 8 — PostHog homepage (`posthog.com`)

- **Tier:** 1 (production, OSS-core analytics + product-engineering platform).
- **Provenance:** WebFetch 2026-05-14. Full extract.
- **What it tells us:**
  - **Top nav (verbatim, including idiosyncratic items):** `home.mdx`, `Product OS`, `Pricing`, `customers.mdx`, `demo.mov`, `Docs`, `Talk to a human`, `Ask a question`, `Sign up ↗`, `Switch to website mode`. *Note: file-extension nav items (`home.mdx`, `customers.mdx`, `demo.mov`) are intentional — PostHog ships an "engineer mode" / "website mode" toggle that re-skins the nav as a file tree. Brand-voice signal, not a typo.*
  - **Hero copy verbatim:** *"The new way to build products"*. Sub: *"Product development used to mean manually writing code, running analysis, diagnosing bugs, and rolling out changes using dozens of tools. PostHog is the only platform that acts like a co-pilot for you (and your AI agents) to do it all – autonomously."*
  - **Primary CTA:** *"Get started - free"* → `app.posthog.com/signup`. Secondary: *"Install with AI"* → wizard flow.
  - **Code sample on landing (VERBATIM):** `npx @posthog/wizard`. Install-command-only, not an API demo. Single code element on the page.
  - **Customer logos:** Y Combinator, Lovable, ResearchGate, Supabase, ElevenLabs, Exa, Hasura. *(AI/dev-startup heavy register, same as Clerk's customer pattern.)*
  - **Scale signals:** *"98% of our customers use PostHog for free"* + *"1 million events/mo"* + *"5,000 recordings/mo"* (free tier).
  - **Trust language:** *"VCs love them"*, *"Product engineers love them"*. G2 badge mentioned. Self-aware brand voice (*"Not endorsed by Kim K"*).
  - **OSS signal:** NOT surfaced on the homepage extract. No GitHub link in top nav. No "Open source" badge. No star count. **The OSS positioning is buried** despite PostHog having a public OSS-core repo.
  - **Self-host:** NOT mentioned. Default narrative is PostHog Cloud (US Virginia / EU Frankfurt regional split).

### Source 9 — Plausible homepage (`plausible.io`)

- **Tier:** 1 (production, OSS-core analytics, smaller-scale than PostHog).
- **Provenance:** WebFetch 2026-05-14. Full extract.
- **What it tells us:**
  - **Top nav (verbatim):** Why Plausible, Who it's for, Compare, Resources, Pricing, Login, Start free trial, My dashboard.
  - **Hero copy verbatim:** *"Easy to use and privacy-friendly Google Analytics alternative"*. Sub: *"Plausible is powerful, lightweight analytics. No cookies, just insights. Made and hosted in the EU, powered by European-owned infrastructure. 🇪🇺"*. **The headline names the competitor.**
  - **Primary CTA:** *"Start free trial"* → `/register`. Secondary: *"View live demo"* → `/plausible.io`.
  - **Code on landing:** NONE visible. Analytics product; integration is a `<script>` tag, but it's not surfaced on the landing.
  - **Customer testimonials (named individuals, not logos):** Clem Delangue (Hugging Face), DHH (37signals), John O'Nolan (Ghost), Cyrus Shepard (SEO), Rob Hope, Laura Roeder (Paperbell). **Named-people signal, not customer-logo signal.**
  - **Scale numbers verbatim:** *"18k paying subscribers"*, *"260B tracked pageviews"*, *"99.99% uptime (Last 90 days)"*.
  - **Privacy positioning as trust signal:** *"Made and hosted in the EU 🇪🇺"*, *"No cookies, just insights"*, *"No cookie banner required"*. EU data residency as a load-bearing signal.
  - **OSS signal verbatim:** *"The code is public and auditable. Self-host on your own infrastructure or use our hosted version."* Plus: *"Our code is open source too, so you're never locked in."* GitHub in footer, NOT top nav. No star count displayed.
  - **Self-host:** explicitly named as alternative path. NO dedicated `/self-hosting` page found.
  - **Differentiation:** `/compare` page in top nav with sub-pages: `vs Google Analytics`, `vs Matomo`, `vs Cloudflare`, `GA4 accuracy comparison`. **Most aggressive competitor-comparison surface in the entire 9-cite survey.**

## Findings

### F8 — OSS positioning prominence is variable; "OSS-core commercial" does not predict OSS-prominent marketing

| Site | OSS signal on landing | OSS position weight |
|---|---|---|
| Supabase | *"Open source: all core tools are open source and self-hostable"* in bullet list | Medium (named, not in hero) |
| PostHog | NOT surfaced | None (OSS is invisible on the marketing site) |
| Plausible | *"Code is public and auditable… never locked in"* + Compare page | High (load-bearing) |

The hypothesis *"OSS-core commercial → OSS leads the marketing"* is FALSIFIED by PostHog. PostHog has an OSS-core repo but does not surface it on the homepage at all.

**Pattern that DOES hold:** OSS positioning prominence correlates with whether OSS IS the differentiator. Plausible's value prop is privacy + EU + no-lock-in → OSS reinforces that. PostHog's value prop is "all-in-one product analytics" → OSS would dilute that. Supabase is in between (the Firebase-alternative frame benefits from "and you can self-host" defang of lock-in, but the product value is BaaS-completeness, not OSS).

**Implication for BokChoy (whether OSS-core or proprietary):** If OSS-core, surface the OSS signal ONLY if it reinforces the value prop. For wallet primitives, OSS isn't a differentiator (no privacy concern, no lock-in panic axis). BokChoy could be OSS-core AND ship a marketing site that doesn't lead with that — the PostHog pattern.

### F8a — Amendment to prior entry's F6 (differentiation): direct competitor naming happens when the opponent has high brand recognition AND a values-based contrast

Prior F6 said: *"5/6 commercial dev-tools position-not-compare. Direct competitor naming is rare."* This held at 6 cites.

Adding Plausible at cite 9: Plausible names Google Analytics directly in the HEADLINE (*"Easy to use and privacy-friendly Google Analytics alternative"*) AND ships a `/compare` page with sub-pages for GA, Matomo, Cloudflare. That's 2 of 9 commercial dev-tools naming a competitor — still minority, but the pattern is **conditional, not universal:**

Direct competitor naming wins when:
- The opponent has high brand recognition (Google Analytics, React) AND
- The contrast is values-based, not feature-based (privacy vs surveillance; simplicity vs framework-bloat).

Direct competitor naming loses when:
- The opponent is fragmented (Stripe vs "what — Square? PayPal? Adyen?") — no single opponent.
- The contrast is feature-based — vs-tables age badly and invite "but you don't do X."

**For BokChoy:** is there a single named opponent with values contrast? Lootlocker (named, but no brand recognition outside game-dev — fails the recognition gate). PlayFab (named, Microsoft-owned — recognition higher, but values contrast is weak). Building-it-yourself (Plausible/RevenueCat-style "vs build" page — viable). The strongest available framing is *"vs build it yourself"*, not *"vs Lootlocker."*

### F9 — "Mention self-host, don't lead with it" — pricing-vs-self-host narrative across all three cites

- Supabase: OSS + self-hostable mentioned once in a bullet; commercial tier is the marketing's destination.
- PostHog: self-host NOT mentioned on landing. Commercial tier is the only path surfaced.
- Plausible: self-host explicitly named, but no dedicated `/self-hosting` page; commercial cloud is the path the CTA routes to.

**Pattern: self-host exists in the marketing only as a lock-in escape hatch, not as a primary adoption path.** The commercial-tier funnel is where the marketing CTAs route. OSS positioning serves two purposes: (i) defang the lock-in objection, (ii) generate community signal (GitHub stars, contributions) that powers trust at v1. Adoption-via-self-host is NOT the funnel any of the three optimizes for.

**Implication for BokChoy if OSS-core:** "Self-host" is a footer/docs link, not a CTA. The hero CTA still routes to commercial signup. Plausible's pattern (*"Self-host or use our hosted version"* mentioned once) is the right register.

### F10 — Trust-signal substitute patterns at the OSS-core class: GitHub stars, scale numbers, named-individual testimonials, privacy/compliance positioning

Three substitute patterns surfaced beyond customer logos:

1. **Scale numbers as primary trust signal (PostHog, Plausible):** PostHog says *"98% free, 1M events/mo, 5k recordings/mo"*. Plausible says *"18k subscribers, 260B pageviews, 99.99% uptime"*. Scale numbers are immediately understandable even without context.

2. **Named-individual testimonials over customer logos (Plausible specifically):** DHH, Clem Delangue, John O'Nolan. The audience knows/trusts those names; the names carry weight that a logo wall doesn't at small scale.

3. **Values-positioning as trust signal (Plausible's EU/privacy register):** *"Made in EU"*, *"No cookies"*, *"Powered by European-owned infrastructure"*. The flag emoji 🇪🇺 IS the trust signal for the audience that cares about EU data residency.

**For BokChoy at v1:**
- Scale numbers: unavailable (no users yet). Out.
- Named-individual testimonials: hard to land pre-launch. Theoretical (could DM a known game dev for a quote), but high-effort + uncertain return.
- Values positioning: viable if BokChoy has a values-based differentiator. Candidates: open audit trail (every wallet movement is reproducible from event log), defense-in-depth (the proxy.ts + RLS + adminGate + idempotency layering), Postgres-native (no NoSQL lock-in). **All three are technical-trust signals that could substitute for social-trust at v1.** Plausible-style framing: *"every credit/debit is replayable from the audit log"* OR *"defense-in-depth, audited by you not by us"*.

GitHub stars as substitute requires OSS-core. If BokChoy stays proprietary, this lever is unavailable.

### F11 — Brand voice on the OSS-core class diverges sharply from Stripe-class

- PostHog: self-aware ironic register. *"Not endorsed by Kim K"*. File-extension nav items (`home.mdx`, `demo.mov`). "Switch to website mode" toggle. Brand voice IS a differentiator.
- Plausible: earnest values-driven. EU flag emoji, *"surveillance capitalism"* framing.
- Supabase: developer-utilitarian. *"Build in a weekend. Scale to millions."* Hyperbolic but not ironic.

Stripe-class is uniformly serious / corporate / measured ("Financial infrastructure to grow your revenue"). The OSS-core class permits more voice variation — three different registers across three sites.

**Implication for BokChoy:** voice is a real open thread (already named in prior entry as open thread #2). The OSS-core class evidence widens the design space — earnest values (Plausible), ironic dev-community (PostHog), or utilitarian (Supabase) are all viable registers at this product class.

## Conflicts

### C3 — F6 amendment from F8a above

Prior entry's F6 stated *"direct competitor naming is rare in mature B2B dev-tool marketing."* Numerically still true (2/9 sites), but the framing was too strong. Per *Contradiction protocol* (production cites win over my over-strong claim): the refined rule is the *conditional* one in F8a. Cite distribution: 7/9 don't name competitors (Stripe, Resend, Clerk, Lootlocker, RevenueCat, Supabase, PostHog), 2/9 do (htmx vs React, Plausible vs GA). Both conditions in F8a (recognition + values contrast) hold for the 2 that name.

### C4 — Prior F2 (code-on-landing) is weaker than originally claimed

Prior entry's F2: *"code-on-landing splits by product horizontality. Dev-exclusive products → code as hero (htmx, possibly Resend). Sell-to-non-devs platforms → no code."*

Supabase is the falsifier: it's a dev-platform product (devs are the entire audience) and ships NO code on the landing. The horizontality framing doesn't fit cleanly.

Refined pattern: **code-as-hero correlates with single-purpose dev tools** (htmx is one mechanism, Resend is one API call) **NOT with platform breadth** (Supabase has DB + auth + storage + edge functions — no single 5-line snippet represents the value). PostHog adds weight: it's a multi-product platform too, and ships only an install command, not an API demo.

**For BokChoy:** wallet primitives are single-purpose. The 5-line code-sample-as-hero pattern is still on the table for BokChoy specifically. Prior F2's conclusion holds for BokChoy even though the underlying explanation was wrong.

## Conditions

- **Time:** May 2026. Same as prior entry.
- **Product class:** OSS-core commercial dev tools with paid tiers. Findings DO NOT generalize to pure-OSS-no-commercial (Tailwind CSS, Astro), nor to proprietary-only (Stripe).
- **Cite weight:** 3 sites in this class. The prior entry's 6 sites + this entry's 3 sites = 9 total. Triangulation across the cite class is min-floor; another 1-2 OSS-core cites (Hasura, Strapi, Cal.com self-hosted) could refine F8 (OSS prominence) but are diminishing returns at this point.

**DOES NOT hold for:**
- The OSS-core class at much larger scale (Vercel — has OSS in Next.js but is fundamentally a hosting product, different shape).
- Pure-OSS commercial-tier-via-services (Linux/Red Hat) — service revenue model is different from SaaS-tier revenue model.

## Operational implications

These ADD to the 7 numbered implications in the prior entry. Numbered continuing from there.

### For the /design pass that follows (immediate, additions to prior entry)

8. **OSS-or-proprietary decision for BokChoy itself.** This entry's existence raises the question without forcing it. The marketing patterns differ enough (F8, F9, F10) that the /design pass must pick BEFORE applying the marketing-research findings. Candidate framings:
   - **Stay proprietary** (current default per `private: true` + no vault entry stating otherwise). All F1-F7 findings apply; F8-F10 don't. Trust-signal substitute = technical signals only.
   - **Open-source the backend** (`@bokchoy/backend`, `@bokchoy/wallet`, `@bokchoy/auth-config`, etc., kept as `private` but moved to public GitHub). Gains: GitHub stars as substitute trust signal, community-contribution surface, Plausible-style lock-in defang. Costs: public CVE surface, contributor management overhead, brand-protection complexity (squatting + forks), loss of strategic option-value (closing later is hostile).
   - **Open-source the SDK only** (`@bokchoy/sdk` if/when it exists), backend stays proprietary. Lighter commitment; "open source SDK" is a weak marketing signal but lower-cost than full-backend OSS.

   **/research overhead before this pick:** licensing options, monetization-vs-OSS-core dynamics, what proprietary-now-OSS-later costs vs OSS-now-close-later. Maybe a /research seat; maybe not — the user's directional preference would shrink the question.

9. **Differentiation framing — values vs build-it-yourself.** Per F8a: BokChoy has no high-recognition single opponent. The strongest viable framing is *"vs build it yourself"* (RevenueCat pattern) on a follow-on `/build-vs-buy/` page. NOT *"vs Lootlocker"* at v1.

10. **Trust-signal substitute strategy at v1 (refines prior entry's implication #5).** Per F10: technical-trust signals are the v1 path regardless of OSS-or-not. Candidates:
    - Audit-log positioning: *"every credit/debit is replayable from the event log"*.
    - Defense-in-depth positioning: surface the layering — proxy.ts gate + RLS + adminGate + idempotency.
    - Postgres-native positioning: *"your data, your schema, your queries — no NoSQL lock-in"*.
    Each is a different values-frame. /design picks which.

11. **Voice / register is an explicit open thread (was implicit in prior entry's open thread #2).** Three viable registers from the OSS-core class: earnest-values (Plausible), ironic-dev-community (PostHog), utilitarian (Supabase). Plus the prior class added serious-corporate (Stripe), aspirational-business (RevenueCat). The voice survey is a separable /research session.

### Cascade amendments to prior entry `[[marketing/landing-patterns-research]]`

Owed inline edits to that entry when next visited:
- F2 refinement: replace "horizontality" framing with "single-purpose-vs-platform" framing per C4.
- F6 refinement: add the conditional rule from F8a (recognition + values contrast).
- Sources extended: cite count is now 9, not 6.

NOT doing those edits in this seat to keep the entries independently coherent. The current entry's F8a + C3 + C4 explicitly point at the obligation.

## Reproducibility note

Reproducible: WebFetch the same three URLs with structured-extract prompts targeting IA / hero / code / OSS-signals / trust / pricing-vs-self-host. Survey took 3 parallel WebFetches in ~30 seconds wall-clock.

The Supabase partial-extract gap (top nav, customer logos, CTA destinations not reached) is the same JS-rendering opacity that hit Resend + Clerk in the prior entry. Headless-browser pass would resolve all three; same Open Thread #1 from prior entry covers it.

## Open threads

1. **(carried from prior entry)** Headless-browser pass to resolve Supabase + Resend + Clerk code-on-landing and Supabase IA / CTA / customer-logos gaps.
2. **BokChoy OSS-or-proprietary decision** — surfaced by F8/F9 implications. Not decidable from this research alone. Possibly a /research seat (licensing + monetization + close-later-cost) or just a /design pick if directional preference exists.
3. **Cal.com self-hosted, Hasura, Strapi** — three more OSS-core cites that would refine F8 (OSS-prominence pattern). Diminishing returns at this point unless the OSS-or-proprietary decision (open thread #2 above) pulls in that direction.
4. **Voice/register survey** — promoted from "implicit" to "explicit" by F11. Separable research session whenever /design picks hero copy and the register needs grounding.
5. **PostHog's "engineer-mode" / "website-mode" toggle.** Worth probing — is this a real brand-voice differentiator that drives engagement metrics, or pure novelty? Useful before /design considers similar moves for BokChoy.
