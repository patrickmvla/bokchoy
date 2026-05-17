---
type: decision
features: [marketing]
related: ["[[marketing/landing-patterns-research]]", "[[marketing/oss-core-marketing-research]]", "[[oss-sdk-only]]", "[[cockpit/admin-list-endpoints-contract]]", "[[cockpit/first-run-journey]]", "[[cockpit/file-structure]]"]
created: 2026-05-14
confidence: high
---

# BokChoy marketing v1 shape: 3-route IA, noun-claim + outcome hero copy, code-as-hero visual via translated SDK, audit-log-primary 3-pillar features, S-walkthrough page structure

## Decision

Five sub-decisions form the v1 marketing shape:

### (i) IA depth: 3 marketing routes

- `/` — apex landing
- `/pricing` — placeholder if billing not yet built ("Usage-based pricing. Free during private beta. Contact for production estimates.")
- `/docs` — required; sub-decision deferred (in-repo MDX vs subdomain vs external Mintlify-style)

**Top-nav at v1: 4 items** — Product (anchor on `/`), Pricing, Docs, Sign in.

**Dropped at v1** with named revisit triggers (see *Revisit when*): `/changelog`, `/blog`, `/customers`, `/security`, `/build-vs-buy`.

### (ii) Hero copy shape: α — noun-claim + outcome

Pattern: `[noun-claim] + [outcome-frame]`. Example sketch (NOT final copy): *"Wallet infrastructure for game economies"* with sub-headline elaborating concrete scope. Copy polish is a follow-on session; the SHAPE is what's vaulted.

### (iii) Hero visual: code-as-hero (V2 — translated SDK)

The hero shows a ~5-line `@bokchoy/sdk-node` snippet using **friendly names** (`player`, `currency: 'gems'`, `reason: 'level_up_reward'`), NOT raw UUIDs. Example shape (NOT final marketing copy):

```ts
import { BokChoy } from '@bokchoy/sdk-node';

const bokchoy = new BokChoy({ apiKey: process.env.BOKCHOY_API_KEY });

await bokchoy.wallets.credit({
  player: 'player_123',
  amount: 100,
  currency: 'gems',
  reason: 'level_up_reward',
});
```

Requires the SDK to ship a translation layer from friendly names to wire-shape UUIDs (slug → currencyId, playerId → walletId or one-wallet-per-player convention). This OBLIGATES the SDK design beyond a 1:1 wire-shape mirror; see *Cascade obligations*.

> **Terminology note (added 2026-05-14):** Throughout this entry, "slug" is used as a generic English term meaning *"customer-typed string identifier resolved to a UUID."* On the wire, the field on `GET /v1/currencies` is named **`code`** (matching the existing `currencies.code` DB column and the production convention in game-economy SDKs — LootLocker, PlayFab, RevenueCat, AccelByte). The customer-facing SDK arg stays `currency: 'gems'` per Stripe convention. See `[[marketing/currencies-endpoint-research]]` for source-cited derivation. The prose below uses "slug" generically without contradicting the wire field name.

### (iv) Trust-signal substitute strategy: audit-log-primary 3-pillar features section

The features section uses Lootlocker's 3-pillar pattern (per `[[marketing/landing-patterns-research]]` Source 4) with explicit pillar ordering:

1. **PRIMARY: Audit-log replayability.** *"Every credit and debit is replayable from the event log."* Idempotency is rolled into this pillar (the audit log records every attempted operation; idempotency-key dedupe is visible in the trace).
2. **SECONDARY: Postgres-native.** *"Your data, your schema, your queries. No NoSQL lock-in, no vendor-proprietary query language."*
3. **TERTIARY: Defense-in-depth.** *"Proxy-tier gate, RLS-isolated tenancy, admin-gate authorization, idempotency middleware — four independent layers between request and your ledger."*

The pillars are NOT equally weighted. Audit-log is the load-bearing pillar; Postgres-native and defense-in-depth support but don't lead.

### (v) Page structure below the hero: S-walkthrough

Five sections on `/`:

1. **Hero** (per (ii) + (iii)).
2. **3-pillar features section** (per (iv)).
3. **Code walk-through** — 3-4 sibling operations (credit, debit, balance read, history) demonstrating the API stays clean across the surface, not just on one cherry-picked call. Builds on the hero's code-as-hero V2 commitment.
4. **CTA strip** — *"Start free"* button + secondary docs link.
5. **Footer** — copyright + nav links + small print.

## Reasoning

### (i) IA depth defense

Tight Clerk/Resend pattern per `[[marketing/landing-patterns-research]]` F5: IA depth scales with product breadth, not company maturity (production-cited × 9 sites surveyed). BokChoy at v1 is single-product (wallet primitives) + single primary persona (game devs). Stripe-depth IA would falsely imply product breadth — confusing about what BokChoy IS. Content-availability gate on every dropped route: each requires content that doesn't exist at v1 (no shipping cadence, no customers, no SOC2, no recognized competitor). Empty pages signal worse than missing pages.

### (ii) Hero copy α defense

User defense (2026-05-14): "alpha is new user friendly." Sharpened to vault-quality: **cognitive anchoring for cold visitors.** A noun-claim ("wallet infrastructure") provides a mental category that lets visitors-without-prior-context place the product into their mental map within the first few seconds, reducing cognitive load and bounce rate. Outcome-only (β, e.g. *"Build and grow your app business"*) skips the category anchor; the sub-headline cannot recover from a missed first-impression placement.

This holds AT BokChoy's specific position: "wallet primitives for games" is NOT a pre-existing mental category for cold visitors (game devs land on the page from a Google search or HN link with zero prior context). The category anchor is doing real work — without it, visitors guess wrong (some assume "payments? subscriptions? in-game-store-frontend?") and bounce. With it, the sub-headline can refine. Production-cited at α shape: 5/9 cites (Stripe, Resend, Lootlocker, Supabase, htmx) per F1.

### (iii) Hero visual V2 defense

Code-as-hero per F2-refined (BokChoy is single-purpose dev-tool → code-as-hero is on the table; Supabase falsified the horizontality framing but the single-purpose-vs-platform refined framing still places BokChoy in the code-as-hero-viable class). Reinforces F10's technical-trust substitute strategy under `[[oss-sdk-only]]` framing.

**V2 over V1** (the as-built UUID variant): user defense, sharpened — *"V1's marketing is throwaway; V2's wait-cost is lower than V1's rebuild-cost."* V1 ships a hero with leaked internal implementation (currency-as-UUID, walletId-as-UUID); customers reading the snippet think *"that's clunky"* on first read; first-impression damage compounds; visitor bounces. V2 doesn't have this leak. V2's SDK-translation-layer cost (slug-resolution + cache + lookup-failure handling) is a few days of bounded SDK design work; V1's rebuild cost is shipping bad marketing, observing the bounce-rate damage, and then rebuilding to V2 anyway. Wait-cost dominates rebuild-cost.

Production-cited via Stripe (`currency: 'usd'` not currency-UUID — verified pattern across the entire Stripe SDK surface), plus Better Auth + Resend ship similar friendly-name translation layers in their SDKs (industry-cited × 3).

**V3 (defer code-as-hero) rejected** on opportunity-cost grounds: code-as-hero is the highest-leverage visual for BokChoy's specific audience (single-purpose dev-tool; technical-trust substitute strategy needed at v1 with no customer logos / scale numbers / SOC2 per F10). Abandoning it forfeits a real lever. V2's wait-cost is bounded — affordable to wait for the SDK.

### (iv) 3-pillar features section defense

3-pillar pattern is production-cited × 3+ in the surveyed cite set: Lootlocker (*"Seamless Integration / Your Toolbox / Built to Last"*), Plausible (privacy + lightweight + open source), RevenueCat (3 pillars repeated across the page in different framings). Default register for the "we don't have customer logos, here's what we DO offer" v1 state.

**Audit-log as PRIMARY pillar** because the question it answers — *"a player says they didn't get their gems, what happened?"* — is the most-asked support question in any wallet/ledger product at runtime. Production-cited: Stripe's investment in the Events surface (Stripe Dashboard → Events is a load-bearing customer-support feature) + every payment processor ships an event log. Game devs running player-currency systems hit this question every week in support tickets. The audit log answers it without the dev having to write custom logging code.

**Idempotency rolled into audit-log pillar** because they're semantically connected (the audit log records every operation attempt; idempotency keys dedupe replays; both visible in the same trace). Separating them into two pillars would dilute the audit-log message.

**Postgres-native SECONDARY** because lock-in is a real concern for B2B dev-tool prospects (post-Heroku, post-Parse, post-Firebase customers are now savvy about vendor exit costs) but it's not the support-ticket-frequency primary concern. Strong supporting pillar.

**Defense-in-depth TERTIARY** because security marketing is hard to differentiate (every dev-tool claims it; visitors discount the claim by default). Putting it third honors that signal-degradation. Plus the actual technical implementation (`[[cockpit/nextjs-16-proxy-research]]` + `[[admin-list-endpoints-contract]]` + the RLS work in `[[backend-stack]]`) is already in place; showing it is reinforcement, not aspiration.

### (v) S-walkthrough page structure defense

Code-as-hero V2 commitment carries a content obligation: visitors who read a 5-line code snippet in the hero want MORE code, not abstract feature claims. Stopping at the hero snippet undersells the technical-trust substitute strategy the rest of the page is trying to establish.

A second code section showing 3-4 sibling operations (credit + debit + balance read + history-read) lets visitors confirm *"the API stays this clean across the surface, not just on one cherry-picked call."* This is the same logic that makes Stripe's docs-as-marketing work — the consistency of the API across endpoints is itself the trust signal.

Production-cited: htmx (`[[marketing/landing-patterns-research]]` Source 6) ships code-as-hero + more code below; Resend and Supabase do similar walk-through expansions. 3 of 9 cites in the prior survey ship walkthroughs of comparable shape; the rest don't ship code at all (incompatible with the code-as-hero pick BokChoy already made).

**S-tight (Hero → features → CTA → Footer) rejected** on under-supporting-the-hero-choice: ships 4 sections including hero, no code expansion. The hero's code-as-hero V2 pick implies the visitor wants more code, not just feature claims. S-tight stops short.

**S-stripe (use-case-segmented landing) rejected** on audience-fragmentation: BokChoy v1 has ONE audience (game devs); splitting `/` into RPG vs mobile-IAP vs web3 sub-positions dilutes the noun-claim hero already established. Use-case pages are appropriate at v2+ when there's enough mass to defend separate positioning per vertical.

## Engineering substance applied

- **Failure semantics:** Marketing-site failures = visitor bounce, not data integrity. Low-blast-radius. SDK translation-layer failures are higher-blast: a slug-lookup miss on `bokchoy.wallets.credit({currency: 'gem'})` (typo) must produce an actionable error path. Named exception class (`UnknownCurrencyError`) listing the available slugs is mandatory; a generic `404 Not Found` would leave customers stuck.
- **Concurrency:** SDK's slug-cache is per-process. Concurrent cache misses trigger duplicate lookups (eventually consistent; no hazard). Atomic `Map.set` is sufficient.
- **Observability:** Marketing site needs standard analytics (load time, bounce rate, hero-CTA click-through). SDK's slug-resolution path needs telemetry (cache hit rate, lookup-fail rate per slug — high lookup-fail on a specific slug indicates customer-side typo OR a slug docs gap).
- **Lock-in:** v1 marketing shape is cheap to revise. Each dropped route's revisit trigger is non-blocking. Hero copy/visual are revisable cheaply (content + CSS).

## Production-grade gates

**Idiomatic** (to Next.js 16 + RSC + the cockpit stack):
- IA in `app/(marketing)/` route group per `[[cockpit/file-structure]]`. Next.js 16 App Router native; no custom routing framework.
- Hero as RSC; client-interactive components (sign-in CTAs) at leaf only per `[[cockpit-stack-integration-research]]` F6 anti-pattern table.
- Code sample via static syntax-highlighting (shiki via MDX or static markup) — platform-standard.

**Industry-standard** (production-cited):
- IA tight pattern: Clerk + Resend (≥2 cites at single-product single-persona scale).
- Hero α shape: Stripe + Resend + Lootlocker + Supabase + htmx (5/9 surveyed cites use noun-claim + outcome).
- Hero V2 friendly-name SDK translation: Stripe (`stripe-node` SDK accepts `currency: 'usd'`); Better Auth (organization SDK accepts friendly slug); Resend (audience IDs vs slugs). Production-cited × 3.

**First-class:**
- Next.js 16 route groups: platform-native IA primitive, not a workaround.
- shadcn primitives for landing components per `[[cockpit/shadcn-setup]]`: reuse the cockpit's existing component library, no parallel marketing-only design system.

## Rejected alternatives

### (IA-Stripe) Stripe-depth IA — 8+ marketing routes at v1
**What:** ship `/`, `/pricing`, `/docs`, `/changelog`, `/blog`, `/customers`, `/security`, `/build-vs-buy` from day one.
**Wins when:** product is multi-SKU (Stripe Atlas + Billing + Capital + Connect ...) AND there's actual content for each route.
**Why not here:** BokChoy at v1 is single-product. Multi-route IA without content reads as falsely-imply-product-breadth + falsely-imply-maturity. Visitors who click a hollow `/customers` or `/blog` page lose more trust than visitors who don't see the link at all.

### (IA-htmx) Single-page IA — `/` only, everything inline
**What:** hero + features + pricing + CTA all on `/`, no separate routes.
**Wins when:** product is OSS-no-funnel (htmx); audience is pure-dev-community willing to scroll.
**Why not here:** BokChoy is commercial. `/pricing` and `/docs` are visitor-expected routes for commercial dev-tools (5/9 cites ship them as separate routes). Inlining them reads as "incomplete site" not "minimalist."

### (β) Outcome-only headline
**What:** hero copy is *"Build games people pay to play"* or similar — outcome without infrastructure-noun.
**Wins when:** audience has a pre-existing mental category for the product (RevenueCat: audience knows what "in-app purchases" are; outcome-only works).
**Why not here:** "wallet primitives for games" is NOT a pre-existing mental category. Cold visitors need the noun-claim anchor to place the product. Skipping it forfeits the category anchor and forces visitors to read the sub-headline OR bounce.

### (V1) Code-as-hero with as-built UUIDs
**What:** ship the Version 1 snippet (UUIDs in the marketing code: `walletId: 'wallet_a3f...'`, `currencyId: 'curr_b1c...'`).
**Wins when:** honesty-to-wire-shape is the dominant constraint AND the audience can read past UUIDs without losing trust.
**Why not here:** first-impression damage on every cold visitor. The UUIDs LEAK internal implementation (currency-as-tenant-scoped-row) into customer-facing surface. Reader thinks *"that's clunky"* in the first 3 seconds. Bounce. Rebuild-cost (ship V1, observe damage, rebuild to V2) exceeds wait-cost (build V2 SDK once, ship marketing once).

### (V3) Defer code-as-hero entirely
**What:** Hero visual is abstract-decorative (Stripe pattern) or product-mockup (RevenueCat pattern) at v1; code-as-hero deferred to a later iteration.
**Wins when:** marketing-shipping speed is the dominant constraint AND visual shape can be revisited cheaply later.
**Why not here:** code-as-hero is the highest-leverage visual for BokChoy's specific audience (single-purpose dev-tool, technical-trust substitute strategy needed at v1). Abandoning it forfeits the F10 substitute strategy lever. V2's wait-cost is bounded — afford the wait.

### (Visual-abstract) Abstract-decorative hero
**Wins when:** product is sold to non-devs (Stripe's horizontal audience).
**Why not here:** BokChoy audience is dev-exclusive. Abstract under-uses the audience-fit; code-as-hero gives the same audience MORE signal in the same space.

### (Visual-mockup) Product-mockup hero
**Wins when:** the product UI is polished enough to screenshot well at v1.
**Why not here:** The cockpit UI shipped through slice 8.4 is functional shadcn primitives — adequate UX but not premium hero-screenshot material yet. Revisit when the cockpit UI gets a polish pass.

### (γ-defense-primary) Defense-in-depth as PRIMARY pillar
**Wins when:** the audience explicitly buys on security claims (compliance-regulated, SOC2-required prospects). Auth0's marketing register.
**Why not here:** game-dev audience buys on operational-confidence claims (uptime, replay-ability, ease-of-integration) far more than on security claims. Plus security claims are universally discounted by readers (every dev-tool says "we're secure"). Audit-log wins on signal-strength + question-frequency.

### (γ-postgres-primary) Postgres-native as PRIMARY pillar
**Wins when:** the prospect's primary fear is vendor lock-in (post-Heroku ecosystem). Supabase positions on this verbatim.
**Why not here:** Supabase IS the database (lock-in concern is direct); BokChoy is wallet primitives running on Postgres (one level removed from the lock-in concern). The lock-in pitch lands weaker when BokChoy is a service layer above Postgres, not Postgres itself. Postgres-native works as supporting signal, not load-bearing.

### (S-tight) Hero → features → CTA → Footer
See defense in (v) reasoning section above.

### (S-stripe) Use-case-segmented landing
See defense in (v) reasoning section above.

## Failure mode

**Primary failure mode: SDK slug-resolution layer ships with confusing error semantics; first-customer integration hits a slug typo and gets unactionable feedback.**

Probability: medium. Default failure mode without explicit error-semantic design at the SDK layer is a generic HTTP error wrapped without naming the available alternatives.

**Concrete scenario:**
- Customer writes `bokchoy.wallets.credit({ currency: 'gem' })` (typo: 'gem' instead of 'gems').
- SDK looks up 'gem' → cache miss → fetches from backend → backend returns 404 / "currency not found".
- Without explicit handling: SDK throws `BokChoyApiError: 404 Not Found`. Customer has no idea what they typo'd or what the valid values are.
- With explicit handling: SDK throws `UnknownCurrencyError: 'gem' is not a registered currency. Available: ['gems', 'coins']. See /docs/currencies to register new currencies.` Actionable.

The marketing snippet on the hero specifically uses friendly names — if the SDK fails to translate them well in practice, the marketing promise is broken on first-touch.

## Mitigations

1. **SDK slug-resolution error class with named-alternatives.** `UnknownCurrencyError`, `UnknownPlayerError`, etc., must list available slugs in the error message AND expose them via a typed property the caller can introspect programmatically. Vaulted as part of `[[oss-sdk-only]]`'s cascade obligation when the SDK is built.
2. **Slug-cache TTL + force-refresh on miss.** Cache stale → SDK lookup-fails-then-refetches-then-retries. Bounded by max retry depth (1 refresh per call); subsequent calls within the TTL window use the refreshed cache.
3. **Marketing snippet uses real-world starter slugs.** `currency: 'gems'`, `reason: 'level_up_reward'`, `player: 'player_123'`. The first-run-journey per `[[cockpit/first-run-journey]]` step 6 seeds `'gems'` and `'coins'` as default currencies on first project creation, so the marketing demo aligns with the actual customer-onboarding experience. **Cascade obligation: add this to the first-run-journey decision.**
4. **Hero CTA end-to-end verification.** The hero primary CTA routes to `/sign-up` (already shipped per slice 8.3.5). The marketing → sign-up → OAuth → /projects flow is empirically verifiable before marketing publishes.

## Revisit when

- **`/changelog`** — when the third backend release lands AND there's a stated cadence (monthly minimum). Earlier ships an empty page, signal-worse than no page.
- **`/blog`** — when the first post is drafted AND there's a stated cadence (monthly minimum).
- **`/customers`** — when the third paying customer signs AND consents to logo + name use. Two earlier customers can stay anonymous in scale numbers.
- **`/security`** — when SOC 2 Type 2 audit completes OR a single specific compliance posture (GDPR, EU residency) becomes load-bearing for a named prospect.
- **`/build-vs-buy`** — when a single named competitor with brand recognition emerges AND `[[marketing/oss-core-marketing-research]]` F8a's "recognition + values contrast" condition holds.
- **Hero copy shape (α) revisit:** A/B test data shows category-anchor noun-claim underperforms outcome-only (β) on bounce-rate. Quantitative: outcome-only β tests >10% bounce-rate improvement over noun-claim α across ≥1000 visitor sample. Below that threshold = noise.
- **Hero visual V2 revisit:** SDK slug-resolution layer turns out to be more than a 2-week build (genuine design gotcha emerges in implementation — e.g., the slug-cache invalidation story doesn't close cleanly). Fall back to V3 (defer code-as-hero, ship abstract/mockup) if the SDK work blows out beyond the initial estimate.
- **IA depth revisit:** when product expands to multi-SKU (e.g., adds catalog/loot/identity surfaces as separately-billed products). Then Stripe-depth IA becomes the right register.
- **Tech-stack for `/docs`:** when first docs content needs to land. Sub-pick: MDX in-repo (matches cockpit codebase, no extra tool) vs subdomain (docs.bokchoy.com via Mintlify or similar) vs external (Notion-like). Defer to a separate /design session.

## Cascade obligations

For implementation phase when v1 marketing lands:

1. **`@bokchoy/sdk-node` ships with slug-resolution layer.** ~~Extends `[[oss-sdk-only]]`'s cascade list. Design points: (a) slug → UUID cache (per-process `Map` with TTL); (b) `GET /v1/currencies` (or equivalent) backend endpoint for the SDK to fetch the slug registry (currently doesn't exist — adds to `[[cockpit/admin-list-endpoints-contract]]`); (c) named exception classes (`UnknownCurrencyError`, `UnknownPlayerError`) with available-slug enumeration; (d) one-wallet-per-player convention OR explicit `bokchoy.wallets.create({player})` shown in docs.~~

   **SUPERSEDED 2026-05-14 by `[[wallet/credit-route-contract]]` (i)+(iii).** Backend handles slug→UUID resolution at the player-centric credit route handler (B2 picked over B3 on 3-of-5 production-cite grounds per `[[wallet/credit-route-shape-research]]` F1). SDK package becomes substantially thinner (~250-350 LOC, revised from ~500). What stays from the original obligation: (c) named exception classes `UnknownCurrencyError` / `UnknownPlayerError` — but as thin relays of the backend's 404 response body (which carries `availableCodes: string[]`), not as client-side compute. (d) lazy-create-on-first-credit semantics decided in favor of lazy-create (the marketing-snippet "day-1 works" framing). What's deleted: (a) per-process slug→UUID cache + TTL — no longer needed; (b) is satisfied by Slice M-1 which already shipped.
2. **Backend endpoint owed: `GET /v1/currencies`.** Returns currencies registered for the API key's project. SDK consumes this to power slug resolution (per `[[marketing/currencies-endpoint-research]]` — wire-field-naming + field-set decisions are research-derived from 4 production cites; design seat's prior "wire = slug" position was superseded). Adds to `[[cockpit/admin-list-endpoints-contract]]` next /design pass.

   **M-1 contract (amended 2026-05-14 from `[[marketing/currencies-endpoint-research]]`):**
   - **Method + path:** `GET /v1/currencies`.
   - **Auth:** behind `apiKeyMiddleware` per `apps/backend/src/auth/api-key-middleware.ts` — NOT `adminGate`. SDK consumer, not cockpit-admin session. The middleware sets `c.var.projectId` from the validated Bearer token; the handler reads currencies filtered by that project_id.
   - **Query params:** none at MVP. No pagination per `[[cockpit/admin-list-endpoints-contract]]` (Pa-none) — 2-person-team audience ≤ a handful of currencies per project. Cursor pagination revisited when a customer crosses ~50 currencies.
   - **Response 200 (bare data per (R2)):**
     ```ts
     [
       {
         id: string,            // UUID
         code: string,          // customer-defined identifier, matches DB column `currencies.code`
                                // regex `^[A-Za-z0-9_]{1,16}$` per packages/db/src/schema/wallet.ts:77
         displayName: string,   // human-presentation name from DB column `display_name`
         createdAt: string,     // ISO 8601
       },
       ...
     ]
     ```
   - **Ordering:** `desc(createdAt)` matching `listProjectsHandler` precedent at `apps/backend/src/projects/index.ts:369`.
   - **Empty list:** returns `[]`, NOT 404. The endpoint is "list of currencies for this project"; an empty project legitimately returns an empty array. Per `[[cockpit/first-run-journey]]` step 6 + Cascade obligation #7 of this entry, first-project creation seeds `'gems'` + `'coins'`, so the empty-list state should only occur if the customer explicitly deletes the seeded defaults.
   - **Errors:** 401 `UNAUTHENTICATED` per `apiKeyMiddleware` (invalid/missing Bearer); 500 on unexpected DB error mapped to Stripe-wrapped shape per `apps/backend/src/infra/error-middleware.ts`. No 404, no 422 — list endpoint with project-scoping; failure modes degenerate to auth-fail (401) or infrastructure-fail (500).
   - **OTel span:** `currencies.list` with `bokchoy.project_id` attribute (from `c.var.projectId`) and `bokchoy.currency_count` attribute on success. Composed inside the `http` span from `httpInstrumentationMiddleware` at `apps/backend/src/index.ts:63`.
   - **Field-set deferrals:** `decimals`, `description`, `isPremium`, `isTradable`, `updatedAt` are intentionally NOT on the wire at MVP per `[[marketing/currencies-endpoint-research]]` F4 (audience-scale-matched minimal pattern — RevenueCat + LootLocker production-cited × 2). Backward-compat-safe field additions when (a) SDK ships a balance-display helper that needs `decimals`, OR (b) a customer specifically asks for one of the deferred fields. JSON adds are non-breaking under standard SDK consumer semantics.
   - **File location:** new `apps/backend/src/currencies/index.ts` per `[[backend-service-shape]]` §2 module-by-feature (separate from `apps/backend/src/projects/index.ts` because currency-management is a distinct feature class from project-management — same separation logic that put projects in their own module rather than extending wallet).
   - **Mount:** `mountCurrenciesRoutes(app)` added alongside `mountProjectsRoutes(app)` at `apps/backend/src/index.ts:128`.
3. **`apps/cockpit/app/(marketing)/page.tsx`** — apex landing route. Hero with α copy shape + code-as-hero V2 snippet. Server Component; client-interactive primary CTA at leaf only.
4. **`apps/cockpit/app/(marketing)/pricing/page.tsx`** — placeholder page. Content: usage-based-pricing-coming-soon, contact-for-prod-estimate.
5. **`apps/cockpit/app/(marketing)/docs/...`** — docs entry route. Form deferred to separate sub-decision.
6. **Top-nav component** in `apps/cockpit/components/layouts/` (or similar). 4 items: Product (`#features` anchor), Pricing, Docs, Sign in.
7. **`[[cockpit/first-run-journey]]` step 6 amendment.** First-project creation must seed `'gems'` + `'coins'` as default currencies, so the marketing snippet's `currency: 'gems'` works end-to-end on day-1 of customer onboarding.
8. **Marketing copy authoring session.** The α shape is decided; the actual words (*"Wallet infrastructure for game economies"* is a sketch, not final copy) are owed in a separate copy-polish /design session OR by the user directly.
9. **`apps/cockpit/modules/marketing/components/features-grid.tsx`** — 3-pillar features section component. Renders the three pillars in the ordered weighting (audit-log primary, Postgres-native secondary, defense-in-depth tertiary). Reuses shadcn `<Card>` primitive (already in cockpit per `[[cockpit/shadcn-setup]]`).
10. **`apps/cockpit/modules/marketing/components/code-walkthrough.tsx`** — code walk-through section. Shows 3-4 sibling SDK operations (credit + debit + balance + history) with the same friendly-name register as the hero. Static syntax-highlighting via shiki (build-time) — no client-side syntax highlighter to keep bundle weight off the marketing route.
11. **`apps/cockpit/modules/marketing/components/cta-strip.tsx`** — CTA section before footer. Primary CTA *"Start free"* → `/sign-up` (per `[[cockpit/first-run-journey]]` step 1). Secondary docs link.
12. **`apps/cockpit/modules/marketing/components/footer.tsx`** — site footer. Nav links + copyright + small print. Shared with `/pricing` and `/docs` routes.
13. **Resolves `[[marketing/landing-patterns-research]]`** operational implications #1 (hero copy shape), #2 (CTA target — `/sign-up`, direct-signup not docs-first), #3 (hero visual), #4 (IA depth), AND **#5 (trust-signal substitute strategy — audit-log-primary 3-pillar)**. All five operational implications from the prior research entry are now CLOSED.
