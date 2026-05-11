---
type: decision
features: [auth, backend-stack]
related: ["[[backend-stack-research]]", "[[player-auth]]", "[[auth-compliance-research]]", "[[multi-tenant-rls-research]]", "[[wallet-mechanics]]", "[[host-platform]]", "[[wedge-decision]]", "[[mvp-feature-sequence]]", "[[idempotency-strategy]]"]
created: 2026-05-03
confidence: high
---

# Backend stack: TypeScript + Bun + Drizzle + Better Auth + Hono

## Amendment 2026-05-03 — runtime flipped to Bun + Hono locked + cross-runtime discipline

**Trigger:** user explicit risk-acceptance call after `[[backend-service-shape-research]]` Q1 re-research surfaced new evidence (OpenCode founder regret, ongoing Bun memory leak class through Bun 1.1.13 April 2026, pkgpulse long-running-workload caveat). User chose Bun anyway with named risk acceptance, paired with cross-runtime portability discipline as mitigation.

**Amended decisions:**

- **Runtime:** ~~Node.js 22 LTS~~ → **Bun 1.3+ as MVP runtime.** Node.js 22 LTS retained as **documented fallback** — Dockerfile fallback variant maintained and tested in CI but not deployed by default.
- **HTTP framework: Hono locked** (was deferred in original entry; deferred-to-implementation framing replaced). Defense: Hono ships cross-runtime adapter (Node + Bun + Workers + Deno + Cloudflare); natural pairing with Better Auth ecosystem; minimal-overhead matches solo-dev MVP risk profile; chained middleware composes with `withTenant(...)` transaction wrapper.

**Cross-runtime portability discipline (the mitigation):**

- Use **Hono's `serve` adapter** (`@hono/node-server` + Bun's bun-native serve via `hono/bun`), NOT `Bun.serve` directly
- Use **postgres-js** (cross-runtime), NOT `Bun.sql`
- Use **node:fs** + standard `fetch` API, NOT `Bun.write` / `Bun.file`
- Use **node:crypto** for argon2 + HMAC, NOT `Bun.password.hash` Bun-specific shape
- Test Dockerfile fallback variant on Node.js 22 in CI; deploy Bun variant by default
- CI lint rule: `eslint-plugin-no-restricted-imports` blocks `import 'bun'` and `import { ... } from 'bun:*'` in non-test files

**Bun-specific failure modes added (per user explicit acceptance):**

- **F-Bun-1: Memory leak class regression in production at MVP launch.** Multiple Bun 1.1.x issues (Issues #16339, #18488, #24216, #25948 per `[[backend-service-shape-research]]` Source 2) document recurring memory growth in long-running workloads. Mitigation: monitor RSS + heap trend per replica via PaaS metrics; alert on linear growth >4hr; trigger documented Node.js 22 fallback if pattern matches.
- **F-Bun-2: Better Auth runtime integration bug.** Issue #2283 was bunx-CLI-only and `wontfix`-closed; runtime integration at production scale untested in surveyed scope. Mitigation: integration tests covering Better Auth login/session/anonymous-upgrade flows in CI on both Bun and Node 22; if Bun-specific bug surfaces, swap to Node 22 within 1 week.
- **F-Bun-3: argon2 native binding compatibility issue under Bun 1.3+.** Bun 1.2+ claims Node.js native-module compatibility but `argon2` (the canonical Node argon2 binding) hasn't been verified at production scale on Bun in surveyed scope. Mitigation: argon2 verification test in CI on Bun startup; if compatibility breaks, fall back to Node 22 OR migrate argon2 to alternative (Web Crypto PBKDF2 acceptable last resort, with `[[player-auth]]` revisit-when on hashing parameters).
- **F-Bun-4: Outbox worker (long-running) hits exact workload class pkgpulse flagged.** Per pkgpulse 2026 caveat: *"long-running workloads amplifying problems short benchmarks never reveal."* Mitigation: same as F-Bun-1 (RSS monitoring + Node 22 fallback path tested + documented runbook).

**Documented fallback path (revisit-when trigger met):**

If F-Bun-1 / F-Bun-2 / F-Bun-3 / F-Bun-4 surfaces in production with material impact (memory growth forcing container restarts >1×/day, or Bun-specific bug blocking customer flow), execute the fallback runbook:

1. Switch deployed Dockerfile to Node.js 22 LTS variant (already CI-tested)
2. Verify production traffic on Node 22 — should be hours-not-weeks per cross-runtime discipline
3. Open `[[backend-stack]]` revisit-when entry; document the failure pattern observed; re-evaluate Bun re-adoption when class issue closed

**Why this is defensible despite research-anchored Node.js 22 default:**

The user's pick is informed risk-acceptance, not denial of evidence. The research-surveyed evidence (OpenCode regret, multiple memory leak issues, pkgpulse caveat) was acknowledged. The trade made: perf upside + DX preference for Bun > production-stability conservativism for Node 22, paired with cross-runtime mitigation that limits cost of being wrong to ~hours of operational swap rather than weeks of refactoring. **Recording with explicit risk-acceptance framing so the trade is on record for future-team reference.**

The original Node.js 22 default reasoning below is **superseded but retained for historical record** per amendment-pattern precedent (cf. `[[wallet-mechanics]]` 2026-05-02 amendment).

---

# (Original 2026-05-03) Backend stack: TypeScript + Node.js 22 + Drizzle + Better Auth

## Decision

BokChoy MVP backend stack:

### 1. Language: TypeScript

- Backend code in TypeScript (strict mode, `noUncheckedIndexedAccess`, no implicit any)
- Compiled via `tsc` to JavaScript for production deployment
- Type definitions shared between backend services and SDK (single TS-typed contract)

### 2. Runtime: Node.js 22 LTS as MVP default; Bun opt-in for specific workloads post-MVP

- Production deployment: Node.js 22 LTS (active LTS through 2027-04, security through 2027-04)
- Bun NOT default at MVP; tracked as opt-in performance upgrade per Trigger.dev firestarter pattern
- Bun candidates post-MVP: high-concurrency long-poll endpoints (analogous to Trigger.dev firestarter), if/when BokChoy ships such workloads

### 3. ORM: Drizzle (drizzle-orm + drizzle-kit)

- Postgres-only adapter (`drizzle-orm/postgres-js` against Supabase per `[[host-platform]]`)
- Schema-as-TypeScript via `pgTable`, `pgPolicy`, `pgRole` declarations
- Migrations via `drizzle-kit generate` + `drizzle-kit migrate`
- RLS enabled at table level via `pgPolicy` declarations alongside table schemas
- **`SET LOCAL` transaction wrapper** — BokChoy implements `withTenant(tx, projectId)` helper analogous to Supabase's `getDrizzleSupabaseClient`. Pattern:
  ```typescript
  export async function withTenant<T>(
    projectId: string,
    fn: (tx: PgTransaction) => Promise<T>
  ): Promise<T> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${projectId}, true)`);
      return await fn(tx);
    });
  }
  ```
- All RLS-required queries wrapped in `withTenant(...)`. CI lint enforces this discipline (extends `[[wallet-mechanics]]` cascade).
- Stored-function calls per `[[wallet-mechanics]]` M2 mechanism via Drizzle's `sql` template tag.

### 4. Auth library: Better Auth (with Drizzle adapter, anonymous plugin, organization plugin)

- Better Auth core + plugins: `anonymous`, `organization`
- Drizzle adapter (`@better-auth/drizzle-adapter`) with `experimental.joins = true` for 2-3× perf on `/get-session` and `/get-full-organization`
- Argon2id password hashing (Better Auth supports via `password.hash` config)
- **Schema migrations via `drizzle-kit` only.** Better Auth's `getMigrations` does not support Drizzle adapter (per `[[backend-stack-research]]` Finding Q3.5); BokChoy maintains Better Auth's user/session/account/organization tables hand-written in Drizzle schema files matching Better Auth's documented shapes.

### 5. Multi-tenancy mapping (Stripe model)

- **Auth plane:** Better Auth `organization` = BokChoy customer-developer
- **Data plane:** RLS `app.current_tenant` = BokChoy project_id (per `[[multi-tenant-rls-research]]`)
- Customer-developer logs in once → sees N projects underneath their organization
- Project switching is BokChoy-side UI (not Better Auth org-switching)
- `projects` table has `organization_id` foreign key linking to Better Auth's `organization.id`
- Customer-team-members (per `[[wedge-decision]]` 20-month runway, deferred at MVP — single-user-per-org acceptable initially) added via Better Auth org-membership

### 6. Player auth implementation per `[[player-auth]]`

- Better Auth `anonymous` plugin handles guest player accounts (placeholder email `guest-${id}@example.com` via `generateRandomEmail`; account-linking on later upgrade via `onLinkAccount` callback)
- Email captured on guest→registered upgrade (IAP, account-recovery setup) per `[[player-auth]]` (γ) flow
- Players are per-project; `players.project_id` enforced via RLS (`SET LOCAL app.current_tenant`)
- Argon2id parameters: m=64MB, t=3, p=4 per `[[player-auth]]`

### 7. Cockpit + admin auth (audiences a + b from session staging)

- Cockpit web login = Better Auth email/password + magic-link (or OAuth via Google/GitHub plugin if customer demand surfaces)
- Admin SSO = Better Auth's OAuth providers (Google or GitHub) with explicit role-based access (single role at MVP; RBAC plugin post-MVP)
- SDK API key = BokChoy-issued per project, signed HMAC pattern analogous to Stripe API key. Validated server-side against project's `api_keys` table. Independent of Better Auth (Better Auth handles human-developer auth; SDK key handles machine-to-machine)

## Reasoning

### Why TypeScript

Three converging defenses per `[[backend-stack-research]]`:

1. **Production-cite weight at indie/SMB SaaS scale.** Trigger.dev firestarter migration is tier-1 production cite (named workload, named engineer, quantified 5× benchmark). Cal.com + Deel.com cited as production users via Better Auth founder bekacru on HN (production-cited; high confidence). Modern hardware makes TypeScript "viable at scale; a single vertically scaled Postgres instance on today's cloud infrastructure can have 64+ vCPUs and 256+ GB of RAM, which is more than enough for the majority of SaaS products" (Source 11; tier 3-4 industry pattern).

2. **Ecosystem fit for `[[player-auth]]` requirements.** Drizzle (Q2 winner per Finding Q2.1) is TS-native; Better Auth (Q3 winner per Finding Q3.2) is TS-purpose-built; the entire downstream stack lands in TS without forced bridging.

3. **Solo-dev capacity per `[[wedge-decision]]` 20-month runway.** TS proficiency exists; Go/Rust/Elixir do not. **Familiarity is substantive at MVP scale** — not a tiebreaker, but a real engineering constraint when a single engineer is shipping. The argument is *not* "use what you know" — it's "TS clears production-grade gates AND ships faster for this team." Both halves matter.

### Why Node.js 22 default, Bun opt-in

Per `[[backend-stack-research]]` Finding Q1.1, Bun is real-but-rough — Trigger.dev's firestarter post documents both 5× perf upside AND a real production memory leak (Bun-fixed shortly after). For BokChoy's solo-dev MVP risk profile:

- **Node.js 22 LTS** is the conservative default. Active LTS through 2027-04; mature ecosystem; no documented regression class at MVP scale; argon2 / postgres-js / Better Auth all run on Node natively without compatibility caveats.
- **Bun in scope** for post-MVP performance work on specific latency-sensitive workloads (analogous to Trigger.dev firestarter — high-concurrency long-poll connection brokers). Not appropriate for the BokChoy MVP request shape (typical CRUD-on-Postgres + occasional outbox processing, not long-poll-saturated).

The **dual-runtime pattern** (Trigger.dev) is a hedge worth tracking for post-MVP, not adopting at MVP. Node.js 22 single-runtime keeps the MVP simpler.

### Why Drizzle

Per `[[backend-stack-research]]` Findings Q2.1 and Q2.2:

- **First-class RLS support** via `pgPolicy` + `pgRole` schema declarations generating native Postgres RLS during `drizzle-kit` migration. Prisma is workaround-only (Issue #12735 + Yates with documented nested-transaction breakage). For `[[multi-tenant-rls-research]]` requirements, Drizzle is production-grade-defensible; Prisma forces a known-broken stack.
- **`SET LOCAL` requires app-side transaction wrapping.** Drizzle does NOT auto-manage session-local config — BokChoy implements `withTenant(...)` helper. Per Drizzle docs, this is the canonical pattern (Supabase ships `getDrizzleSupabaseClient` for the same reason). Defensible engineering cost.
- **Stored-function-only-interface compatible** per `[[wallet-mechanics]]` M2 — Drizzle's `sql` template tag handles `SELECT bokchoy.wallet_credit(...)` calls cleanly without forcing ORM-level schema for stored functions.

### Why Better Auth

Per `[[backend-stack-research]]` Finding Q3.2 — **the TS auth library landscape consolidated in 2025**:

1. Lucia deprecated 2025-03 (maintainer Pilcrow sunset; "you-own-the-auth-logic" alternative no longer maintained).
2. Auth.js team joined Better Auth 2025-09-22 (Auth.js v5 in security-patch-only mode; new-project recommendation steered to Better Auth).
3. Better Auth v1.5.0 (2026-03-01): 600+ commits, 70 features, 220 bug fixes, 7 new packages, ~3 releases/week, YC X25 backing.

For new TS projects in 2026-Q2, choosing anything other than Better Auth means betting against the consolidation trajectory.

Plus per Finding Q3.1: **anonymous plugin maps `[[player-auth]]` (γ) guest-account shape directly** via `generateRandomEmail` (placeholder `guest-${id}@example.com`) + account-linking on upgrade. The "Better Auth assumes email" concern resolves via the plugin pattern.

Production cites at indie/SMB SaaS scale (Cal.com, Deel.com, dough.ink, MeetingBaas — `[[backend-stack-research]]` Sources 8, 9) clear the industry-standard gate.

### Why Stripe-pattern multi-tenancy mapping (customer-as-org, project-as-resource)

Three options surfaced per `[[backend-stack-research]]` Finding Q3.6 + Discussion #5165 / Issue #1248. The Stripe-pattern (option 2) is the production-cited B2B SaaS multi-tenancy default:

- Stripe Dashboard: one login per Stripe customer; customer holds N "accounts" (live/test, multiple businesses); user switches between accounts in the dashboard. **Inferred** but matches every B2B SaaS surveyed in `[[indie-smb-pricing-research]]`.
- Better Auth's organization plugin matches the customer-tier of this pattern naturally.
- Project-as-BokChoy-side-resource keyed by `organization_id` + `project_id` keeps the data plane (RLS = project_id) and auth plane (org = customer) aligned without collapsing them.

Nested organizations (option 3) was eliminated because Better Auth org plugin doesn't ship native nested-org support per surveyed scope (Discussion #5165 surfaces the question, no documented native answer); custom-architecture cost not justified when option 2 works directly.

### Why drizzle-kit-only schema migrations (not Better Auth CLI)

Per `[[backend-stack-research]]` Finding Q3.5: Better Auth's `getMigrations` does NOT work on Drizzle/Prisma adapters (Kysely-only). Two options:

- **Single-tool (chosen):** Drizzle schema is source of truth for ALL tables (Better Auth's user/session/account/organization shapes hand-written in Drizzle schema; BokChoy tables alongside). One migration tool (`drizzle-kit`); one source of truth.
- **Dual-tool (rejected):** Better Auth's CLI on Kysely-style schema PLUS drizzle-kit for BokChoy tables. More moving parts; sync drift risk between Better Auth's expected schema and Drizzle's representation.

Risk: Better Auth schema breaking changes between versions require manual diff-and-merge in BokChoy's Drizzle schema. Mitigation: pin Better Auth version + review release notes per upgrade + integration test covers Better Auth's user/session flows. Defensible.

## Engineering substance applied

- **Consistency:** TypeScript strict mode + Drizzle's compile-time SQL type checking + Postgres SERIALIZABLE on RLS-protected tx (via `[[wallet-mechanics]]` mechanism) compose into end-to-end-typed-and-isolated writes. Idempotency per `[[idempotency-strategy]]` D2-α at HTTP layer.
- **Failure semantics:** Better Auth session validation fails closed (no session = no access); RLS fails closed per `[[multi-tenant-rls-research]]` (no `SET LOCAL` set = `current_setting()::UUID` errors out, query fails). Both fail-closed semantics align — no implicit fallback to "default tenant" or "default user."
- **Concurrency:** standard B2B SaaS auth flows are single-row CRUD (login → session create) with Better Auth's session table guarded by Postgres unique constraints; no multi-row coordination needed at MVP scale.
- **Observability:** Node.js 22 native fetch + AsyncLocalStorage support for request-scoped tracing; Drizzle query logger pluggable (development only); Better Auth emits hooks for login/logout/session-create that BokChoy attaches metrics to. Page on auth-error rate >threshold per project per minute (initial value, revisit on operational data).
- **Storage:** Drizzle schema-as-TS files become source of truth; `drizzle-kit generate` produces SQL migrations checked into repo. Postgres-only deployment per `[[host-platform]]`.
- **Networking:** Better Auth handles cookie-based session by default; SDK API key transmits via `Authorization: Bearer <key>` header. TLS 1.2+ enforced at Supabase ingress.
- **Security:** Trust boundaries per `[[player-auth]]` Engineering substance section. Argon2id parameters meet OWASP 2024 recommendations. SDK API key rotation via project-level admin UI (deferred to implementation phase; revisit-when listed below).

## Production-grade gates

- **Idiomatic** — TypeScript + Node.js 22 + Drizzle + Better Auth is the consensus-default TS stack in 2026-Q2 per `[[backend-stack-research]]` Findings Q1.1, Q2.1, Q3.2. RLS-via-`SET LOCAL` matches `[[multi-tenant-rls-research]]` canonical pattern. Stripe-model multi-tenancy is the surveyed-default B2B SaaS shape. **(idiom-cited; confidence: high)**

- **Industry-standard** — TS-on-backend at SaaS scale: Trigger.dev (production-cited via blog post), Cal.com + Deel.com (production-cited via Better Auth founder on HN). Drizzle in production via Better Auth ecosystem. Better Auth at indie/SMB scale: Cal.com, Deel.com, dough.ink, MeetingBaas, ChatGPT/Google Labs (via Auth.js merger). **(production-cited × 5+; confidence: high)**

- **First-class** — TypeScript with `tsc` + Node.js 22's built-in ESM/test/fetch is platform-first; Drizzle's `pgPolicy` + `pgRole` are first-class Postgres RLS abstractions; Better Auth's anonymous + organization plugins are first-class library abstractions, not workarounds. The `withTenant` transaction wrapper is the documented Drizzle reference pattern, not a fight against the abstraction. **(first-class-cited; confidence: high)**

## Rejected alternatives

### Alternative A — Bun as MVP default runtime (instead of Node.js 22)

**What:** Deploy BokChoy MVP on Bun 1.3+ as primary runtime; Trigger.dev firestarter pattern from day one.

**Wins when:** team has high-concurrency long-poll workload at MVP (e.g., realtime/websocket-heavy game-backend); team has existing Bun production experience; the 5× perf upside materially affects MVP economics.

**Why not here:** BokChoy MVP request shape is typical CRUD-on-Postgres + outbox processing (per `[[wallet-mechanics]]`, `[[idempotency-strategy]]`), not long-poll-saturated. Bun's documented memory-leak class regression (per Trigger.dev's own post) introduces solo-dev MVP risk that Node.js 22 doesn't. Bun's argon2/postgres-js compatibility was rough at survey time (improving). Defer to opt-in performance work post-MVP.

### Alternative B — Go (or Rust/Elixir)

**What:** Backend in Go (idiomatic for B2B infra: Tailscale, Encore.go, Earthly). Postgres still; ORM choices change (sqlc, GORM, raw); auth handled by self-built or Ory Kratos integration.

**Wins when:** team has Go proficiency; latency-sensitive sub-10ms tail latency required at saturation; multi-region deployment with edge constraints; team plans to hire into Go-shop ecosystem.

**Why not here:** TS proficiency exists; Go does not (per `[[wedge-decision]]` 20-month runway). Q1.2 research-gap finding: surveyed scope did not surface Go-startup-at-indie-SMB engineering blogs defending Go-vs-TS at this scale. Vertical Postgres scale covers MVP load; sub-10ms tail latency not required for game-backend wallet/loot CRUD. Familiarity-as-substantive-constraint defense holds per Finding Q1.3.

### Alternative C — Prisma ORM

**What:** Prisma with Yates library or Prisma Client Extensions for RLS workaround.

**Wins when:** RLS not required; multi-DB needed (MySQL/MongoDB/SQLite); model-driven dev preferred over schema-as-TS-code; Prisma's hosted Postgres (Prisma Postgres) value-add accepted.

**Why not here:** RLS is non-optional per `[[multi-tenant-rls-research]]`. Prisma's RLS support is workaround-only stack with documented breakage class (Yates + nested transactions don't roll back as expected per Prisma's own docs). Postgres-only per `[[host-platform]]` so multi-DB advantage doesn't apply. Adopting Prisma forces BokChoy to debug Yates/Prisma-Client-Extensions interaction at production-grade scale — solo-dev MVP capacity insufficient.

### Alternative D — Kysely (pure query builder, no schema-as-code)

**What:** Kysely + raw SQL migrations (or kysely-codegen for type generation from existing schema).

**Wins when:** maximum SQL transparency required; team prefers writing SQL directly with type-safety on top; schema-as-code's compile-time verification not valued.

**Why not here:** Drizzle's first-class RLS declarations (`pgPolicy`, `pgRole` in TS schema) is a feature Kysely doesn't ship. BokChoy gains nothing material from Kysely's pure-builder shape; loses the schema-as-TS-code value. Better Auth has Drizzle and Kysely adapters both — no auth-side advantage to either.

### Alternative E — Auth.js v5 for new project

**What:** Use Auth.js v5 (formerly NextAuth) for the new project despite the merge.

**Wins when:** team has existing NextAuth expertise + the migration cost from existing v5 deployment is non-trivial; pure security-patch maintenance posture is acceptable.

**Why not here:** Greenfield project. Auth.js v5 in security-patch-only mode per official 2025-09-22 announcement; new-project recommendation explicitly steered to Better Auth. Choosing Auth.js for greenfield "means betting on a library its own maintainers are steering users away from" (Source 7).

### Alternative F — Lucia auth (you-own-the-auth-logic)

**What:** Build owned-auth using Lucia Auth's session-management primitives, retain control of password hashing + session table directly.

**Wins when:** never (deprecated 2025-03 per maintainer Pilcrow's announcement).

**Why not here:** Lucia is no longer maintained. Adopting at MVP commits BokChoy to forking + self-maintaining a deprecated library.

### Alternative G — Managed auth (Clerk, WorkOS, Stack Auth)

**What:** Outsource auth entirely to Clerk or WorkOS; BokChoy holds opaque user_id only.

**Wins when:** team has zero auth-build capacity; willing to accept managed-service vendor lock-in; pricing tolerable at indie/SMB tier ($25-$200/mo at low scale, escalates with MAU); enterprise SSO required at MVP.

**Why not here:** managed lock-in conflicts with `[[host-platform]]` lock-in mitigation philosophy (DB-only Supabase chosen for migration-as-connection-string-change). Indie-tier pricing escalates as BokChoy scales (Clerk's free tier caps then $25+/mo per 10k MAU). Enterprise SSO not MVP-required per `[[wedge-decision]]` indie/SMB ICP. Better Auth + plugins covers the MVP feature surface without the vendor lock-in cost.

### Alternative H — Project-as-Better-Auth-organization (instead of customer-as-org)

**What:** One Better Auth organization per BokChoy project. Customer-developer with N projects has N Better Auth organizations.

**Wins when:** projects are independent enough that per-project user-base is justified (e.g., projects have completely different team-members); organizations are the natural top-level concept for the customer's mental model.

**Why not here:** Forces customer-developer to context-switch between Better Auth orgs per project — UX deviates from Stripe-pattern surveyed-default. Customer-team-members are customer-tier (per `[[wedge-decision]]` indie/SMB usually 1-3 team members per customer); per-project user duplication is wasteful.

### Alternative I — Nested organizations (customer = parent org, project = child org)

**What:** Better Auth org plugin extended with nested org pattern (parent org = customer, child orgs = projects).

**Wins when:** Better Auth ships native nested-org support; nested orgs would model customer-team-members-with-per-project-access cleanly.

**Why not here:** Better Auth org plugin does not ship native nested-org support per surveyed scope (Discussion #5165 surfaces the question; no documented native answer). Custom-architecture cost not justified when customer-as-org + project-as-resource (option 2) works directly. Revisit if Better Auth ships nested-org plugin natively.

## Failure modes

### F1 — `withTenant` helper bypassed (RLS regression)

A developer writes a query outside `withTenant(...)` block, no `SET LOCAL` set, RLS policy errors out OR returns no rows depending on policy phrasing. Could cause silent data-access bug or noisy production failure.

**Mitigation (rewritten 2026-05-04 per `[[tooling-research]]` Q3 / F4):** two-layer defense; lint is NOT load-bearing.

1. **Primary — RLS-fail-closed policies** per `[[wallet-mechanics]]` §8: `FORCE ROW LEVEL SECURITY` on every protected table with policies that read `current_setting('app.current_tenant')::UUID`. Without `SET LOCAL`, queries error or return zero rows — never silently succeed with cross-tenant data. This is the production-grade primary defense; matches `[[multi-tenant-rls-research]]` canonical pattern + Drizzle+Nile production pattern + pgvpd connection-layer-injection pattern.
2. **Secondary — type-level discipline at the Db API surface.** **Open thread CLOSED 2026-05-11 via slice 8.1a `TenantTx` brand at `packages/db/src/with-tenant.ts:17-18`** — `declare const tenantBrand: unique symbol; export type TenantTx = Tx & { readonly [tenantBrand]: never }`. The brand is a `unique symbol` (not a string), so the only way to obtain a `TenantTx` is to be inside a `withTenant(...)` callback — code that requires `TenantTx` at the type level cannot be passed a raw `Tx` without an explicit `as` cast. First consumer is `apps/backend/src/wallet/index.ts` (slice 8.1c) — wallet credit/debit handlers receive `tx: TenantTx` via `withTenant(db, projectId, async (tx) => walletCredit(tx, params))`. The opt-in posture stands per `[[wallet-http-contract]]` G6: `@bokchoy/wallet` wrappers continue to accept `Db | Tx` because their SQL-side `current_setting('app.current_tenant')::uuid` check is the runtime defense; the brand is the type-level mirror, not the substitute. Verification: integration test layer (i) RLS-fail-closed query outside `withTenant` errors per FORCE ROW LEVEL SECURITY semantics — covered by slice 8.1a smoke + slice 8.1c smoke; (ii) type-level rejection compiles-error on bypass attempts — covered by `bun run typecheck` since slice 8.1c. (production-cited / high — `with-tenant.ts:6-7` cites this entry F1 mitigation #2 verbatim. Confidence: high.)
3. **Verification — integration tests** verify both layers: (i) query outside `withTenant` returns zero rows OR errors per RLS-fail-closed semantics; (ii) type-level rejection compiles-error on bypass attempts (once secondary layer ships).

**Why lint is NOT load-bearing here (per `[[tooling-research]]` Q3):** no production team enforces tx-wrapper at lint layer. Drizzle+Nile uses AsyncLocalStorage at connection layer; pgvpd injects tenant identity at the Postgres protocol layer; Drizzle's own ESLint plugin scope is `delete WHERE` only, not tx-wrapper. Drizzle Discussion #1539 ("enforce all queries include tenantId where") is open with no canonical lint answer — production teams enforce at connection + RLS, not lint. Lint can flag obvious bypasses as a tertiary signal (best-effort), but the primary + secondary layers above carry the weight.

### F2 — Better Auth schema breaking change between versions

Better Auth v1.x major version bump introduces schema-breaking change (e.g., session table column rename, organization member field added). BokChoy's hand-written Drizzle schema diverges; migrations break.

**Mitigation:** Pin Better Auth version in `package.json`; manual review of release notes pre-upgrade; integration test covers Better Auth's documented user/session/organization flows; migration via `drizzle-kit generate` reflects schema diff. Risk indicator: Better Auth v1.5.0 had 220 bug fixes including a hardcoded BETTER_AUTH_SECRET breaking change (per `[[backend-stack-research]]` Source from search). Conservative: pin to known-stable v1.x; upgrade only after 6+ weeks production signal on new version.

### F3 — Bun-as-fallback memory leak class regression at MVP scale

If BokChoy adopts Bun for opt-in performance on a specific workload before MVP launch, hits the documented memory-leak class regression in production.

**Mitigation:** Bun is OUT OF SCOPE at MVP per Decision section. Revisit only post-MVP with explicit signal: a workload identified as latency-sensitive enough to warrant runtime swap, AND Bun version with closed memory-leak class regression tested in staging.

### F4 — Drizzle migration breakage at production scale

`drizzle-kit migrate` fails on production-scale schema changes — either due to large-table migrations, PgBouncer-mode incompatibility, or migration-tooling bugs.

**Mitigation:** Test migrations on production-shape staging DB before deploy. `drizzle-kit migrate` runs against direct Postgres connection (not PgBouncer transaction-pool — verify cascade per `[[host-platform]]`). For large-table changes, drop to raw SQL migration via `drizzle-kit generate --custom` flag. Open thread per `[[backend-stack-research]]` open thread 6 — drizzle-kit production scale signal.

### F5 — Better Auth org plugin custom-field UI breakage

Custom fields on organization member schema not respected by Better Auth's default UI components — fork-or-extend required (per `[[backend-stack-research]]` Finding Q3.5).

**Mitigation:** BokChoy isn't using Better Auth UI components per `[[player-auth]]` Decision section (SDK is data-only at MVP, cockpit is custom). Moot at MVP. Revisit if BokChoy ever adopts Better Auth UI primitives post-MVP.

### F6 — SDK API key compromise

Customer-developer's SDK API key leaks (committed to public repo, intercepted, malicious team-member exfil). Attacker has full project-tier access until key rotated.

**Mitigation:** SDK API keys are per-project + revocable via cockpit UI. Rate limiter on API-key-authenticated endpoints. Audit log on API key creation/rotation/deletion. Defense in depth via project-tier RLS (compromised key still scoped to project, not customer-tier or cross-project). Implementation-phase task: monitor API key fingerprint via Trufflehog-equivalent secret scanning; alert customer on detected leak. Rotation cadence: customer-initiated, no forced rotation at MVP (revisit on operational data).

### F7 — Customer-as-organization assumption breaks if customer has multiple separate businesses

Some customer-developers may be agencies or studios shipping multiple unrelated games for different clients. One Better Auth org per customer doesn't cleanly model "Studio A working on Game X for Client A and Game Y for Client B."

**Mitigation:** At MVP indie/SMB scale, this is rare. If a paying customer hits the case, options are: (a) customer creates separate accounts per business (low-cost workaround); (b) BokChoy ships nested-org or "client" abstraction post-MVP. Revisit-when condition listed below.

### F8 — Auth.js v5 security-patch mode doesn't cover a future critical vulnerability

Auth.js v5 in security-patch mode per 2025-09-22 announcement, but Better Auth team only commits to "addressing security patches and urgent issues as they come up" — no formal SLA. If a critical CVE drops in Auth.js v5 packages and the patch lags, BokChoy isn't directly affected (we use Better Auth, not Auth.js) but the merger suggests bekacru's team capacity is shared.

**Mitigation:** Use Better Auth, not Auth.js v5. Track Better Auth's CVE response track record (Launch HN testimonial: "patched within 24 hours"). Post-MVP, evaluate alternative auth libs if Better Auth's CVE response degrades.

## Mitigations

(captured inline per failure mode; aggregated for runbook reference at implementation phase)

- CI lint extends `[[wallet-mechanics]]` + `[[multi-tenant-rls-research]]` discipline to enforce `withTenant(...)` wrapping
- Pin Better Auth version + manual release-notes review per upgrade + integration tests on documented flows
- Bun out-of-scope at MVP — cuts F3 risk to zero pre-launch
- `drizzle-kit migrate` against direct Postgres connection (not PgBouncer pool)
- Better Auth UI not used at MVP — F5 moot
- API key per-project + revocable + audit-logged + rate-limited
- Customer-as-org workaround: agencies create separate accounts; revisit if frequency rises
- Track Better Auth's CVE response record post-MVP

## Idiom citations

- `idioms/typescript.md` (would-cite if exists in `~/.bocek/idioms/`) — strict mode, no implicit any, branded types where they pay back
- TS+Postgres+Drizzle+Better Auth as 2026-Q2 consensus-default for new TS-stack projects per `[[backend-stack-research]]` Findings Q1.1, Q2.1, Q3.2 (industry-cited)

## Revisit when

- **Bun adoption signal:** BokChoy ships a high-concurrency long-poll endpoint (analogous to Trigger.dev firestarter) AND Bun's HTTP-model memory-leak class is closed in tested staging deploy. Per Trigger.dev pattern: dual-runtime support hedges the choice; BokChoy can adopt later without rebuilding.
- **Better Auth SCIM/SAML availability:** Better Auth roadmap ships SAML/OIDC enterprise SSO + SCIM provisioning. Re-derive whether to layer WorkOS for Studio+/Enterprise tier (per `[[indie-smb-pricing-research]]`), or whether Better Auth's native support suffices.
- **Project-as-org pivot:** customer-developer cohort skews toward agencies / studios with multiple unrelated businesses. Frequency >10% of paying customers hits the case. Re-derive option H or revisit nested-org support.
- **Drizzle migration friction:** `drizzle-kit migrate` hits a production-scale issue not surfaced in current research scope. Open thread per `[[backend-stack-research]]` open thread 6.
- **Better Auth schema breaking change in major-version upgrade:** F2 materializes; BokChoy's hand-written Drizzle schema diverges. Trigger upgrade-or-pin decision.
- **Lucia revival or fork emerges as production-grade:** if a production-grade Lucia successor surfaces (post-deprecation fork, new TS auth library targeting "you-own-the-auth-logic"), re-derive Q3.
- **Cross-customer player portability or BokChoy-as-identity-provider feature shipped:** changes the controller-vs-processor analysis per `[[player-auth]]` revisit-when. Auth library may need to flip from per-project to global identity model.
- **Node.js 22 LTS approaches end-of-life (2027-04):** plan migration to Node.js 24 LTS or successor. Re-derive runtime choice.

## Cascade obligations queued for implementation phase (NOT design)

1. **`withTenant(...)` helper implementation** + CI lint rule for enforcement (extends `[[wallet-mechanics]]` + `[[multi-tenant-rls-research]]` discipline)
2. **Drizzle schema files** for: Better Auth's user/session/account/organization tables (hand-written matching Better Auth shapes) + BokChoy's projects/players/wallet/transactions/loot_rolls/api_keys/etc. tables
3. **Better Auth configuration** with anonymous + organization plugins, Drizzle adapter, argon2id password hashing parameters per `[[player-auth]]` (m=64MB, t=3, p=4)
4. **SDK API key infrastructure** — `api_keys` table, signed-HMAC validation middleware, rotation UI, audit log
5. **Bun out-of-scope tag** in deployment docs — explicit "Node.js 22 LTS only" deployment matrix at MVP
6. **`drizzle-kit migrate` against direct Postgres** (not PgBouncer pool) — document deployment runbook
7. **Better Auth schema upgrade runbook** — manual diff-and-merge procedure for major-version Better Auth upgrades
8. **Integration tests** covering: Better Auth login/logout/session-create flows, anonymous-user creation + upgrade-to-registered linking, organization create/invite/role-management, RLS enforcement at every protected-table query path

## Amendment 2026-05-03 (continuation) — Drizzle FORCE-RLS workaround + `prepare: false` mandate (per `[[drizzle-orm-research]]`)

Two cascade obligations added per `[[drizzle-orm-research]]` findings (1) + (3):

9. **FORCE-RLS post-migration check script** (`scripts/check-rls-force.ts`). **Trigger:** `[[drizzle-orm-research]]` confirmed `drizzle-kit` does NOT generate `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` (zero matches in `drizzle-kit/src/sqlgenerator.ts` for `FORCE ROW LEVEL`). `[[wallet-mechanics]]` §8 commits to FORCE on every protected table for owner-bypass defense — gap must be closed by application-side enforcement.
   - **Pattern:** (b.i) per `[[drizzle-orm-research]]` Findings (1). CI script queries `pg_class` joined to `pg_policies` after `drizzle-kit migrate`; fails CI on any table with at least one policy but `relforcerowsecurity = false`. Engineer hand-appends `ALTER TABLE <table> FORCE ROW LEVEL SECURITY;` to the offending generated migration file and re-pushes. Migrations remain self-contained.
   - **Implementation:**
     - File: `scripts/check-rls-force.ts` at repo root (or `apps/backend/scripts/check-rls-force.ts` per `[[backend-service-shape]]` module structure — pick at /implementation).
     - Connection: direct Postgres (not Supavisor pool — needs ad-hoc DDL inspection).
     - Query: `SELECT c.relname FROM pg_class c JOIN pg_policies p ON p.tablename = c.relname WHERE c.relforcerowsecurity = false AND c.relkind = 'r' GROUP BY c.relname;`
     - Exit 0 on empty result. Non-zero with table-list message on violation.
     - CI invocation: `bun run check:rls-force` after `drizzle-kit migrate` step in the migration job.
   - **Runbook entry:** `RLS-FORCE-MISSING: append \`ALTER TABLE <name> FORCE ROW LEVEL SECURITY;\` to the migration file at <path>; re-push.`
   - **Rejected alternatives:** (a) raw-SQL append without CI enforcement — fails on first forgotten table = silent owner-bypass = exact failure mode `[[wallet-mechanics]]` §8 defends against. (c) custom `bokchoyTable(...)` schema helper — fails idiomatic gate; future contributors pay learning tax to read schema.
   - **Revisit when:** Drizzle ships native FORCE RLS generation (open thread #1 in `[[drizzle-orm-research]]` — file FR upstream). When merged + version-pinned, retire the script.

10. **`postgres-js` client `prepare: false` mandate.** **Trigger:** `[[local-docker-research]]` Source 9 (Supabase docs verbatim) — Supavisor transaction-mode (port 6543) does not support prepared statements. `[[drizzle-orm-research]]` Source 7 confirmed Drizzle is a thin wrapper over the `postgres-js` `Sql` client; the flag is set at `postgres()` construction, not on Drizzle.
    - **Pattern (per current Drizzle Supabase setup docs https://orm.drizzle.team/docs/get-started/supabase-new):**
      ```ts
      import postgres from 'postgres';
      import { drizzle } from 'drizzle-orm/postgres-js';
      const client = postgres(connStr, { prepare: false });
      const db = drizzle({ client });
      ```
    - **Discipline:** `prepare: false` set unconditionally in the Drizzle client factory — local AND prod. Local without Supavisor doesn't strictly require it, but committing identical config across environments avoids prepared-statement-related surprise bugs surfacing only in staging/prod.
    - **CI lint (linter-agnostic shape per `[[tooling]]`):** require `prepare: false` to appear in any file matching `**/db/client.ts` (or equivalent path). Two equivalent implementations under Biome: (a) GritQL plugin matching `postgres($url, $opts)` calls and reporting when `$opts` lacks `prepare: false`; (b) Bash/TS scripted check mirroring `[[backend-stack]]` cascade-9 FORCE-RLS pattern (default initial pick — GritQL ergonomics unverified at BokChoy's specific shape per `[[tooling-research]]` Q1 open thread).
    - **Revisit when:** BokChoy moves off Supavisor (e.g., direct Postgres connection from same-region container without pooler), OR Supavisor adds prepared-statement support (track `supabase/supavisor` issue tracker).

## Amendment 2026-05-04 — Drizzle version pin (corrected 2026-05-04 per `[[tooling-research]]`)

**Decision:** pin `drizzle-orm` to **0.45.2** (last stable release, 2026-03-27); pin `drizzle-kit` to **0.31.10** (last stable release, 2026-05-01). Track v1 GA on both packages but do NOT auto-bump.

**Erratum E1 (2026-05-04):** the original amendment said "pin drizzle-orm and drizzle-kit to 0.45.2." That number is correct for drizzle-orm but wrong for drizzle-kit — drizzle-kit and drizzle-orm version independently per Drizzle's monorepo convention; drizzle-kit's stable line is 0.31.x, not 0.45.x. The original framing applied "0.45.2" to both packages, which doesn't match npm reality. Decision intent ("pin stable, defer v1 RC") is unchanged; version numbers corrected.

**Trigger:** `[[drizzle-orm-research]]` Source 11 — Drizzle is at v1.0.0-rc.1 (2026-04-30) at the time of this decision; v1 is NOT GA. v1 ships RQB-v2 which carries Issue #5245 (open, RQB-v2 perf at 3-table joins + filtered-related-where + concurrent load).

**Reasoning:**
- Aligns with `[[backend-stack]]` rejected-alternative posture — Bun-as-default originally rejected (later flipped on user explicit risk-acceptance), Lucia rejected (deprecated), Auth.js v5 rejected (security-patch-only mode), managed Clerk/WorkOS rejected (lock-in). Pattern: pick stable-and-supported, defer aggressive.
- 0.45.x covers BokChoy's full Drizzle commitment surface — `pgPolicy` declarative RLS (introduced 0.36.0), `drizzle-kit migrate`, `db.transaction()` SAVEPOINT semantics, `postgres-js` driver wrap with `prepare: false` flow-through. Per `[[drizzle-orm-research]]` Findings, every behavior BokChoy depends on works in 0.45.x.
- v1's RQB-v2 features are NOT load-bearing for MVP — no documented hard dependency on `defineRelations` or v2-only relation syntax in any vaulted decision.

**Production-grade gates:**
- **Idiomatic:** stable-pin is the dominant production pattern for ORMs. Drizzle's stable line is 0.45.x.
- **Industry-standard:** ≥2 production teams pin Drizzle stable per public engineering posts (Cal.com cited via `[[backend-stack-research]]` uses Drizzle stable; Trigger.dev's firestarter migration cite uses stable).
- **First-class:** uses Drizzle's officially-supported stable channel, not RC.

**Rejected alternatives:**

### (β) Pin to 1.0.0-rc.1
- **What:** ship MVP on Drizzle 1.0.0-rc.1 (2026-04-30); RQB-v2 + 363-commit Alternation Engine.
- **Wins when:** team has hard dependency on v1-only features (none vaulted for BokChoy); team has bandwidth to debug RC-specific bugs during initial customer pain (solo dev does not).
- **Why not here:** RC = not GA. Production usage during RC carries general instability surface; #5245 specifically affects RQB-v2 lateral-join shape under concurrent load + 3-table joins + filtered-related-where. BokChoy's transaction-history cockpit reads (`transactions` × `loot_rolls` × `iap_receipts` polymorphic join) are exactly that shape at scale per `[[drizzle-orm-research]]` Findings (5-reframed). Risk asymmetry: pinning RC adds a debugging surface BokChoy doesn't need; pinning stable defers the v1 upgrade to post-MVP-launch when team has bandwidth.

### (γ) Wait for 1.0.0 GA
- **What:** block implementation start until Drizzle ships 1.0 GA.
- **Wins when:** v1 GA has a public ETA within tolerable window; BokChoy is constrained from starting for unrelated reasons.
- **Why not here:** no public Drizzle ETA. v1.0.0-rc.1 just shipped four days prior to this decision; could be days, weeks, or months to GA. `[[mvp-feature-sequence]]` 7-month plan has no slack to absorb a "wait for GA" delay.

**Failure modes:**
- **F-Drizzle-Pin-1: 0.45.x EOL announced post-MVP-launch.** Drizzle drops maintenance on 0.45.x once 1.0 GA stabilizes. **Mitigation:** track Drizzle release notes + GitHub issue tracker for EOL announcements; plan upgrade window 1–3 months post-MVP-launch when customer pain pattern is known and team has bandwidth. v0.45 → v1 migration cost estimated at 1–2 days schema re-syntax + test re-runs (per `[[drizzle-orm-research]]` Findings — `pgTable(name, columns, (t) => [...])` form, `defineRelations` API surface differ).
- **F-Drizzle-Pin-2: 0.45.x has unfixed P0 bug surfacing in production.** Drizzle backports critical fixes to stable line per typical OSS pattern, but no guarantee. **Mitigation:** if a 0.45.x P0 bug surfaces, evaluate (a) backport patch in fork, (b) emergency upgrade to v1, (c) workaround at application layer. Same upgrade tooling as F-Drizzle-Pin-1.
- **F-Drizzle-Pin-3: BokChoy hits hard dependency on v1-only feature mid-MVP-build.** Unlikely given vaulted scope; no v1-only feature is named load-bearing in any vaulted decision. **Mitigation:** if discovered, surface to /design as a revisit-when trigger; v1-rc evaluation re-runs against the specific feature claim.

**Cascade obligations queued for /implementation:**

11. **Renovate/Dependabot config**: explicitly DISABLE auto-bumping `drizzle-orm` and `drizzle-kit` minor versions until version-pin commitment is revisited. Patch-version auto-bump within 0.45.x is acceptable (security/bug fixes only).
12. **Drizzle release-notes watch**: monthly check of `github.com/drizzle-team/drizzle-orm/releases` for v1 GA announcement + 0.45.x EOL signal. Light-touch obligation — not a runbook page, just a recurring check.

**Revisit when (concrete triggers — replaces hand-wavy "need arises"):**

1. **Drizzle 1.0.0 ships GA + 30+ days operational soak** with no critical regressions in the issue tracker. 30 days is a heuristic, not a hard floor — adjust if community signal converges faster.
2. **Issue #5245 closed in v1** via merged PR (not just triage notes), AND BokChoy code paths include the affected shape (3-table-join + filtered-related-where on cockpit hot path). If BokChoy never ships such a query, #5245's resolution is moot for the upgrade trigger.
3. **0.45.x EOL announced** by Drizzle team OR no patch release in 90+ days indicating de-facto EOL.
4. **Hard dependency on v1-only feature** surfaces in design mode for a future BokChoy decision. Specific named feature, not "the new API looks nice."
5. **Security CVE on 0.45.x** without backport availability. Forces emergency upgrade.

If none of (1)-(5) fire, BokChoy stays on 0.45.2 indefinitely. Stable is not a debt to repay; it's the supported channel.
