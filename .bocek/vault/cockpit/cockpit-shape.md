---
type: decision
features: [cockpit, mvp]
related: ["[[cockpit-stack-integration-research]]", "[[admin-auth-surface]]", "[[backend-stack]]", "[[frontend-stack]]", "[[mvp-feature-sequence]]", "[[backend-service-shape]]", "[[catalog-mutation-mvp-shape]]"]
created: 2026-05-11
confidence: high
---

# Cockpit MVP scope, IA, project lifecycle, success criteria, and non-goals

## Amendment 2026-05-28 — Slice 8.5 catalog editor scope reconciled to currencies + items + offers (drops shops/bundles/loot tables)

(M2)'s catalog editor scope item — *"currencies, items, shops, bundles, loot tables"* — was vaulted 2026-05-11 BEFORE Inventory and Shop primitives were designed. Reconciliation to the primitives that actually shipped:

- **currencies** — exists, kept. (Wallet primitive per [[wallet/credit-route-contract]].)
- **items** — exists, kept. (Inventory primitive per [[inventory/inventory-contract]].)
- **shops** — renamed to **offers**. Shop primitive landed as the priced unit `offers` (not "storefronts") per [[shop/shop-contract]] B1b. The cockpit-shape (M2) term "shops" refers to what now ships as `offers`/`offer_prices`/`offer_items`.
- **bundles** — subsumed into offers (a multi-`offer_items` offer IS a bundle per [[shop/shop-contract]] (ii) + (iv)). No separate bundle editor surface owed.
- **loot tables** — NOT shipped, NOT designed. Stay deferred per [[catalog-mutation-mvp-shape]] (viii) + [[architecture/catalog-cac-upgrade]] F5-reframing-amendment. When a customer asks, the design seat picks T3-style config-as-code (Hiro shape) or T1+T2 catalog-versioning-style — not pre-committed here.

**Reconciled Slice 8.5 catalog editor scope at MVP = currencies + items + offers (3 editors, not 5).**

The "M2 stored-function calls per [[catalog-versioning]]" framing in the Slice sequencing block is **also amended** as of 2026-05-28: catalog mutation at MVP is plain CRUD via Drizzle direct INSERT/UPDATE/DELETE per [[catalog-mutation-mvp-shape]] (i) + (v). The M2 stored-function-only-interface stays scoped to the wallet/inventory/shop SQL functions where it's load-bearing for ledger conservation; it does NOT extend to catalog mutation. The original Slice 8.5 sequencing reference *"catalog editor CRUD via M2 stored-functions per [[catalog-versioning]]"* should read as *"catalog editor CRUD per [[catalog-mutation-mvp-shape]]"* going forward.

Editor invariants the Slice 8.5 implementation MUST honor (per [[catalog-mutation-mvp-shape]] (vi)+(vii)):
- **BC093 activation invariant on offers:** the offer editor blocks toggling `active=true` unless `≥1 offer_items AND ≥1 offer_prices`. Inline guidance UX. BC093 stays as the SQL backstop.
- **Restrict-FK delete-block UX:** the editor handler enumerates referencing rows on FK-restrict-violation and surfaces *"`<resource>` is referenced by `<list>`; remove these first"* — NOT a generic 422 with raw constraint name.

**What does NOT change in this entry:**
- (M2) scope items other than catalog editor (sign-in, projects, project creation, transaction inspector, player search, API-key issuance, bootstrap-reason-codes) are unchanged.
- (L1) cockpit-creates-projects, (I1) sidebar nav, (MK-COLOC) marketing colocation are unchanged.
- Non-goals table is unchanged.

---


## Decision

Cockpit at MVP launch covers **dashboard v1** scope per `[[mvp-feature-sequence]]` months 1-3 sequencing. Slice 8.3 (β-shape per `[[admin-auth-surface]]` *Mitigations* row 4) is the FIRST cockpit slice; subsequent slices extend toward the full dashboard v1 surface.

**(M2) MVP scope cut — dashboard v1:**
- Sign-in / sign-up (OAuth Google + GitHub primary + email/password fallback per design pick (iii) 2026-05-11; see `[[cockpit-stack-integration-research]]` F7)
- Projects list page + project detail page
- Project creation flow (creates a project + auto-issues first SDK API key)
- Catalog editor (currencies, items, shops, bundles, loot tables)
- Transaction inspector (per-project filter + search by player / reason-code / time window)
- Player search (by id / email within project)
- API-key issuance + revocation (per-project key management)
- Bootstrap-reason-codes action (already wired via slice 8.2.1)

**(L1) Project lifecycle ownership — cockpit creates projects.** New backend handler `POST /v1/projects` behind `adminGate({ resource: 'project', actions: ['create'] })` cascades to slice 8.3.1 or downstream slice. Customer-developer creates dev / staging / prod projects via cockpit UI button. Production-cited B2B SaaS pattern (Stripe, Vercel Dashboard, Linear, Resend).

**(I1) Information architecture — left sidebar nav.** Top-level sections: Projects (default), Catalog, Transactions, Players, Settings (per-project + org-level). Active-project switcher in header. Production-cited × 4 (Stripe Dashboard, Linear, Vercel Dashboard, Resend Dashboard all ship left-sidebar). Sidebar component lives at `apps/cockpit/components/layout/sidebar.tsx`; route segments map 1:1 to sections. **Amendment 2026-05-29:** the project-scoped sections (Catalog/Transactions/Players + per-project Settings) nest under the URL path `app/(app)/project/[projectId]/...` per `[[cockpit/active-project-scope]]` — active project is a **URL path segment**, not a cookie/session field (org stays on the Better Auth session); the header switcher `router.push`-es between project paths. Org-level pages (project list, org settings) sit at the authed root as siblings.

**Marketing/landing page: colocated in cockpit Next.js app at MVP** (added 2026-05-11 per user pushback). Single marketing page lives at `apps/cockpit/app/(marketing)/page.tsx` (Next.js App Router route group). Served at apex domain `bokchoy.com/` via `export const dynamic = 'force-static'` for SEO + CDN cache. Sign Up CTA links to `/sign-in` in the same Next.js app — one deploy, one Vercel project, one apex domain. Sub-domain strategy: `bokchoy.com/` = cockpit (apex; serves both marketing route and auth-gated cockpit routes); `api.bokchoy.com/` = backend Hono per `[[cockpit-stack-integration-research]]` F1 reverse-proxy. **(MK-COLOC) rejected (MK-OUT-separate-workspace) and (MK-OUT-separate-repo)** on solo-dev MVP context — cost of separate workspace/stack/deploy buys nothing for one-page marketing surface. Production refs (Stripe / Vercel / Linear / Resend) split because they're at mature scale with dedicated marketing teams; BokChoy at MVP has ONE landing page. Revisit-when triggers listed below.

**Slice sequencing (within months 1-3 dashboard v1 target):**
- **Slice 8.3 (β):** sign-in OAuth + projects list + bootstrap-reason-codes action. ~3-4 cockpit pages + ~3 backend endpoints (Better Auth handler mount + `GET /v1/orgs/me` + `GET /v1/projects`).
- **Slice 8.4:** project creation flow + API-key issuance. Adds `POST /v1/projects` + `POST /v1/projects/{id}/api-keys` + `DELETE /v1/projects/{id}/api-keys/{keyId}` backend endpoints + create-project + project-settings cockpit pages.
- **Slice 8.5:** catalog editor (CRUD for currencies / items / shops / bundles / loot tables; M2 stored-function calls per `[[catalog-versioning]]`).
- **Slice 8.6:** transaction inspector + player search. Read-only query surfaces over `transactions` + `players` tables, scoped to active project.

Slices 8.5 + 8.6 cumulatively complete dashboard v1; slices 8.7+ are cockpit-core (months 4-5; deferred).

**Success criteria:**
- **Slice 8.3 launch (β-shape success):** Two-person team signs up via OAuth Google or GitHub on cockpit, sees their projects, triggers `bootstrapProjectReasonCodes` for a project. End-to-end auth round-trip + `adminGate` verified in production. Smoke at `/tmp/smoke-8-2.0-admin-gate.sh` updated for cockpit-driven flow.
- **Dashboard v1 (months 1-3 target) launch success:** Above + customer-developer creates a project, manages catalog (CRUD currencies/items/shops/bundles/loot), inspects transactions filtered by player/reason-code/time, searches players, issues and revokes SDK API keys. End-to-end flow from sign-up to first authenticated SDK call against backend.
- **First-paying-customer cockpit success:** Above + customer signal that designer can perform live-ops tasks (when cockpit-core ships in months 4-5).

**Non-goals at MVP (explicit OUT — rejected scope with named revisit-when):**

| Out-of-scope item | Revisit when |
|---|---|
| Cockpit-core (A/B testing, segment manager, offer builder, live-ops calendar) | Slice 8.7+ per `[[mvp-feature-sequence]]` months 4-5 |
| Battle pass / quest / mailbox cockpit UI | Month 6 per MVP sequence |
| AI tooling (catalog suggest, anomaly explainer, offer copy generator) | Month 7 per MVP sequence |
| VIP/whale tooling first-class surface | Post-MVP; primitives via segment+offer at cockpit-core ship |
| Multi-team-member-per-org workflows | Per `[[backend-stack]]:105` single-user-per-org MVP deferral; Better Auth team plugin not adopted yet |
| Cross-project portability views | Per `[[backend-stack]]:268` nested-org rejection; cross-project ops via separate sign-ins per org |
| Webhook configuration UI | Backend webhook infrastructure exists; cockpit UI deferred until customer demand |
| `walletDeidentifyPlayer` admin handler UI | Blocked on Q3 DSR-shape research (carry-forward from earlier /design seat) |
| Designer-facing live-ops surfaces (Hiro-style built-in pity dashboards, etc.) | Post-MVP; primitives ship via cockpit-core |
| Self-service billing / Stripe checkout flow | Post-MVP per `[[mvp-feature-sequence]]` AI tooling sequence priority |

## Reasoning

### Why (M2) dashboard v1 scope, not (M1) β-only

`[[mvp-feature-sequence]]` (2026-05-01) already vaults dashboard v1 at months 1-3 with `confidence: medium`. The cockpit-shape entry restates that commitment at the cockpit-feature-specific level — it doesn't introduce new product scope. (M1) would forfeit the dashboard-v1 commitment and force re-derivation at each subsequent slice's scoping.

Slice 8.3 ships (M1)'s subset; the cockpit-shape entry envisions (M2) so slices 8.4-8.6 inherit the design context without re-deriving IA + project lifecycle + success criteria. (production-cited via `[[mvp-feature-sequence]]` revisit-when triggers; confidence: high.)

### Why (L1) cockpit-creates-projects

Three converging defenses:

1. **2-person team audience needs separate dev/staging/prod projects.** Both team members likely want to develop against test data without polluting their (eventual) production project. Standard B2B SaaS pattern. *(production-cited: Stripe Dashboard, Vercel Dashboard, Linear, Resend — all four ship UI-driven project/workspace creation; confidence: high.)*
2. **(L2) auto-create defaults forces explicit creation anyway.** If first project is auto-created, the second is via (L1). Saves one tap at sign-up for the cost of a different creation path; not worth the inconsistency.
3. **(L3) out-of-band only forfeits the UI affordance** the audience expects. CLI / dashboard-config flows match power-user devs, not the 2-person-team integrator profile.

Trade: adds `POST /v1/projects` backend handler (slice 8.4 cascade).

### Why (I1) sidebar nav, not (I2) tabs or (I3) route-segments

Dashboard v1's 8-12 screens overflow tabs (I2) and lack the hierarchical structure tabs imply. Route-segments alone (I3) leaves users without navigation context — they'd rely on browser back-button or URL editing.

Sidebar (I1) is production-cited × 4 — Stripe Dashboard, Linear, Vercel Dashboard, Resend Dashboard all ship left-sidebar at this exact scale (8-12 sections). Same audience class (2-person-to-50-person B2B SaaS teams). The pattern is the industry default; deviating without a named reason fails the *Industry-standard* gate.

**Designing sidebar from day 1, even though slice 8.3 β ships only 3-4 pages,** prevents re-architecture at slices 8.4-8.6. Cost is small (one `<Sidebar>` shell component); benefit is structural inheritance. *(production-cited × 4; confidence: high.)*

### Why all four B2B SaaS cockpit references are sidebar-nav not tabs

Direct observation 2026-05-11 against current production URLs at dashboard.stripe.com / linear.app / vercel.com/dashboard / resend.com/dashboard. Four-of-four convergence at the size class BokChoy targets. *(production-cited / high.)*

## Engineering substance applied

Cockpit-shape is a product-scope decision; engineering substance is concentrated in `[[cockpit-stack-integration-research]]` (auth wiring, RSC composition, anti-pattern audit) and `[[admin-auth-surface]]` (gate primitive). Relevant principles for the shape entry:

- **Failure semantics:** every cockpit-driven mutation goes through `adminGate` per `[[admin-auth-surface]]` D2. Project-creation, API-key-issuance, catalog-mutation, all gated. Fails-closed on session-missing / org-mismatch / permission-deny.
- **Observability:** every cockpit-triggered backend call emits `admin.gate` span per `[[admin-auth-surface]]` *Engineering substance applied*; cockpit-side OTel instrumentation deferred to `[[cockpit/observability]]` (post-slice-8.3 design entry).
- **Storage:** no new tables for cockpit-shape itself — all reads go through existing `organization` / `member` / `projects` / `transactions` / `players` schemas + future `currencies`/`items`/`shops`/`bundles`/`loot_tables` (slice 8.5 cascade). API-key storage already exists per slice 8.1a `api_keys` schema.
- **Security:** OAuth flow trust boundary at provider callback per `[[cockpit-stack-integration-research]]` F7. Cookies first-party to cockpit via reverse-proxy (P1) per F1.

## Production-grade gates

- **Idiomatic** — sidebar nav + project-switcher header is the canonical B2B SaaS cockpit shape per direct observation of 4 production cockpits 2026-05-11. shadcn UI primitives + Tailwind v4 + RSC composition match `[[frontend-stack]]` stack idiom. *(production-cited; confidence: high.)*
- **Industry-standard** — dashboard v1 scope (catalog + transactions + players + settings + project list) is the table-stakes B2B SaaS dashboard surface at indie/SMB-MVP scale. Stripe / Vercel / Linear / Resend all ship within this scope at MVP. *(production-cited × 4; confidence: high.)*
- **First-class** — uses Next.js 16 App Router native primitives (route segments map to nav sections; layouts compose; RSC + Streaming + Suspense via `[[cockpit-stack-integration-research]]` F5). Better Auth React client + Better Auth org plugin (already vaulted in slice 8.2.x). shadcn UI components copied in (`[[frontend-stack]]` pattern). *(first-class-cited; confidence: high.)*

## Rejected alternatives

### Alternative A — (M1) β-only cockpit shape, defer dashboard v1 to month-3 retro

**What:** Cockpit-shape entry vaults only slice 8.3 scope (sign-in + projects list + bootstrap action). Dashboard v1 (catalog editor, transaction inspector, player search, API-key issuance, project creation) deferred to month-3-retro review.

**Wins when:** spine slip from `[[mvp-feature-sequence]]` *Failure mode* row 1 is realized; project must compress months 1-3 to fit budget; cockpit-shape entry needs to reflect compressed reality.

**Why not here:** the spine has not slipped as of 2026-05-11 (slice 8.2.1 just shipped clean). `[[mvp-feature-sequence]]` already vaults dashboard v1 at months 1-3 — cockpit-shape restating it doesn't introduce new commitment. Premature deferral forfeits design context for slices 8.4-8.6 that already need to land per the 7-month plan.

### Alternative B — (M3) cockpit-core scope at MVP

**What:** Cockpit-shape entry includes cockpit-core features (A/B testing framework, segment manager, offer builder, live-ops calendar) in the MVP target.

**Wins when:** `[[mvp-feature-sequence]]` is rewritten to ship the wedge demo before dashboard v1 completes — i.e., abandoning the founder's "usability at every release milestone" constraint.

**Why not here:** `[[mvp-feature-sequence]]` Alternative B (wedge-demo-first) was explicitly rejected 2026-05-01 on the founder's no-gaps constraint. Reopening cockpit-core at MVP-shape entry contradicts that vaulted decision. (M3) is months 4-5 scope; queued, not MVP.

### Alternative C — (L2) auto-create one default project on org sign-up

**What:** Org sign-up auto-creates a project named "Default" or org-name-suffixed. Subsequent projects via UI button. No `POST /v1/projects` handler at slice 8.3 launch — only at slice 8.4 when second project is needed.

**Wins when:** single-project assumption holds at MVP launch for the typical first user.

**Why not here:** 2-person team likely needs ≥2 projects (dev + prod) immediately. Auto-create saves one tap but the second project still requires (L1)-style explicit creation. Inconsistency (project 1 auto, project 2 manual) is a UX bug. Single creation path wins.

### Alternative D — (I2) Single-page tab-based dashboard

**What:** One cockpit page with tab nav switching between Catalog, Transactions, Players, etc. No sidebar.

**Wins when:** MVP scope is 2-4 sections AND there's no nested navigation per section.

**Why not here:** dashboard v1 has 5-6 top-level sections (Projects, Catalog, Transactions, Players, Settings) + nested CRUD per section. Tabs overflow at 5+ items and lack hierarchical structure. Forfeits the production-cited × 4 sidebar pattern.

### Alternative E — (I3) Route-segments only, no shared navigation

**What:** Each cockpit page is independent; no sidebar, no header nav. Users navigate via URLs or in-page links.

**Wins when:** MVP cockpit is 1-2 pages.

**Why not here:** β-slice ships 3 pages (sign-in, projects list, project detail); subsequent slices add 5-6 more. Users need persistent nav context. Production-cited × 0.

## Failure mode

**Primary failure mode: dashboard v1 scope creep into cockpit-core (M3) during slices 8.4-8.6.** Solo-dev MVP context — adding "just one more wedge feature" (e.g. simple A/B button) during catalog editor slice expands scope past months 1-3. Risk: dashboard v1 doesn't ship in time; cockpit-core slips; wedge-demo state misses pitch table window per `[[mvp-feature-sequence]]` *Failure mode* row 1.

Likelihood: medium-high. Scope creep is the canonical solo-dev failure mode.

**Secondary failure mode: sidebar IA pre-commits to a structure that doesn't fit cockpit-core's added sections.** If cockpit-core ships A/B + Segments + Offers + Calendar as new sidebar sections in slices 8.7+, the sidebar may need restructuring (groups, collapse-expand sub-sections, hover-out fly-outs). Risk: re-architecture cost at slice 8.7.

Likelihood: medium. All 4 surveyed production cockpits (Stripe / Vercel / Linear / Resend) extend their sidebars over time without major restructuring — collapsible groups are the canonical extension pattern.

**Tertiary failure mode: 2-person-team audience doesn't translate to wider customer base post-launch.** First-paying-customer success criterion assumes 2-person-team integrator profile. If first design partner is a larger team (5+ engineers, dedicated designer role), cockpit UX may mismatch.

Likelihood: low-medium. Per `[[mvp-feature-sequence]]` revisit-when row 2: first design partner converts on non-mobile-F2P shape OR non-2-person-team profile → revisit scope.

## Mitigations

- **Scope creep guard:** explicit cockpit-shape non-goals list above. Every slice 8.4-8.6 PR must trace back to a dashboard v1 scope item; cockpit-core features REJECTED at PR review without an `[[cockpit-shape]]` amendment first.
- **Sidebar extensibility:** design `<Sidebar>` component with `sections` prop that accepts groups (collapsible) from day 1, even though slice 8.3 only ships 1-2 sections. Cost: small (~10 LOC). Defers re-architecture risk.
- **First-design-partner audience verification:** queue customer-discovery question for first design-partner conversation — "are you 2-person, 5-person, or 10+-person team?" + "what's your designer-role separation?" Re-validate audience assumption against actual signup data.

## Idiom citations

- `idioms/typescript.md` (Make impossible states unrepresentable) — cockpit-shape's non-goals list makes "scope ambiguity" unrepresentable. Every cockpit feature is either named in scope or named in non-goals; no third state.
- Production cockpit pattern (Stripe / Vercel / Linear / Resend) — sidebar nav + project-switcher header is the convergent shape at indie/SMB-MVP scale; not a Bocek idiom per se but a production-cited × 4 convergence.

## Revisit when

- **Spine slips per `[[mvp-feature-sequence]]` *Failure mode* row 1.** Month-3 retro shows <6 of 8 spine primitives shipped at production quality → cockpit-shape revisits dashboard v1 scope (likely compress catalog editor or defer transaction inspector / player search to month 4).
- **First design partner converts on non-2-person-team profile** (5+ engineers, dedicated designer, studio-size). Per `[[mvp-feature-sequence]]` revisit-when row 2: cockpit-shape revisits audience assumption + IA suitability.
- **Cockpit-core (slices 8.7+) requires sidebar restructuring** at month-5-retro. Per *Failure mode* secondary row: collapsible-group extension is the canonical mitigation; major restructuring triggers full IA revisit.
- **Customer signal that catalog editor / transaction inspector / player search is wrong scope cut.** If first design partner asks for cockpit-core features before dashboard v1 completes → renegotiate sequence per `[[mvp-feature-sequence]]` revisit-when row 5.
- **Multi-team-member-per-org demand emerges** (paying customer asks for it). Per `[[backend-stack]]:105` deferral: triggers Better Auth team plugin adoption + cockpit team-management UI + multi-member RBAC. Significant scope expansion; full design pass owed.
- **Cross-project portability views requested** by paying customer. Per `[[backend-stack]]:268` nested-org rejection: triggers re-evaluation of multi-tenancy model + cockpit UX for cross-project ops.
- **Marketing scope grows past one page** (feature pages, blog, docs site, pricing page with calculator, multi-page funnel). Triggers split of marketing into `apps/marketing/` workspace OR separate Vercel project with own stack. Current colocated-page-in-cockpit pattern won't scale past ~3-5 pages without contaminating cockpit's bundle / RSC composition.
- **Marketing/design team hire.** Ownership boundary needs codification; split marketing to separate workspace/repo for clean handoff.
- **Marketing page performance regresses** due to shared cockpit bundle (e.g. auth-gated dynamic routes degrade marketing Core Web Vitals, cockpit code paths bloat the marketing page bundle past `<200KB gzipped` target per `[[frontend-stack]]`). Split for isolation.
