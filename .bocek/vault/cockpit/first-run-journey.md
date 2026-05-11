---
type: decision
features: [cockpit, mvp]
related: ["[[cockpit-shape]]", "[[cockpit-stack-integration-research]]", "[[admin-auth-surface]]", "[[backend-stack]]", "[[wallet-http-contract]]"]
created: 2026-05-11
confidence: high
---

# Cockpit first-run journey: marketing → OAuth → org auto-create → project creation → API-key issuance → SDK verification loop

## Decision

Concrete step-by-step sequence from "user discovers BokChoy" to "user's first authenticated SDK call shows verified in cockpit." Eleven steps; nine cockpit-driven, two out-of-band (user's local SDK install + their first SDK call from game code).

| Step | Surface | Action | Backend interaction |
|---|---|---|---|
| **0** | Cockpit marketing route at `bokchoy.com/` (force-static per `[[cockpit-shape]]` marketing-colocated decision) | User finds BokChoy via discovery channel TBD (Twitter / HN / GDC talk / Reddit r/gamedev / SEO / referrals) → reads landing page → clicks "Sign Up" CTA | None |
| **1** | Cockpit auth route at `bokchoy.com/sign-in` | OAuth buttons (Google + GitHub) + email/password fallback form per (iii) auth UX pick | None (page render only) |
| **2** | Cockpit OAuth flow via `better-auth/react` client | User clicks "Sign in with Google" → `authClient.signIn.social({ provider: 'google' })` → browser redirects to Google → user authorizes → Google redirects to `bokchoy.com/api/auth/callback/google` | `POST /api/auth/callback/google` (Better Auth handler at backend, reverse-proxy from cockpit per `[[cockpit-stack-integration-research]]` F1) creates/looks-up user row, creates session row, sets cookie on cockpit origin |
| **3** | Cockpit, server-side | Better Auth `organization` plugin auto-creates an organization for the new user (O1 pick); user is `owner` role; `session.activeOrganizationId` set automatically | Backend writes user + organization + member rows; sets cookie |
| **4** | Cockpit projects page at `bokchoy.com/projects` | Empty-state UI: "Create your first project" with prominent CTA button. RSC fetches `GET /v1/projects` via `React.cache(getSession)` + relative-path fetch through Vercel rewrite per `[[cockpit-stack-integration-research]]` F1 + F5.6 | `GET /v1/projects` (returns `[]` for new org) gated by `adminGate({ resource: 'project', actions: ['read'] })` |
| **5** | Cockpit project-create form at `bokchoy.com/projects/new` | Client Component form (RHF + Zod + shadcn `<Form>` + `<Input>`) — fields: name (required, 1-64 chars), slug (auto-derived from name, editable, kebab-case validated) | None (client validation only) |
| **6** | Cockpit submit → backend `POST /v1/projects` | Client submits via `fetch('/v1/projects', { method: 'POST', credentials: 'include', body: JSON.stringify({name, slug}) })`. Vercel rewrite proxies to backend. `adminGate({ resource: 'project', actions: ['create'] })` validates session + member role. Backend creates project row with `organization_id` from `c.var['admin.org'].id`. Backend auto-issues first SDK API key for the new project (slice 8.1a `api_keys` row + HMAC) and returns `{ project: {...}, apiKey: 'bk_live_...' }` in the response (key returned ONCE) | `POST /v1/projects` (new handler, slice 8.4 cascade) |
| **7** | Cockpit project detail page at `bokchoy.com/projects/{id}` | Redirect from create form. Modal shows the API key with copy button + warning: "Save this now — it won't be shown again." K1 visible-once-on-creation pattern per `[[wallet-http-contract]]` slice 8.1a HMAC-stored key model. Cockpit stores only the hash; modal dismisses to project detail showing API-key prefix (e.g., `bk_live_a1b2****`) + creation timestamp | Read-only; project + key-prefix already in response from step 6 |
| **8** | Cockpit copy interaction | User clicks copy → key in clipboard. Modal dismisses. Project detail page shows next-step instructions: "Install the BokChoy SDK locally and make your first call" + code snippet for `bun install @bokchoy/sdk` and minimal usage example with `BOKCHOY_API_KEY=...` env var pattern | None |
| **9** | **OUT of cockpit scope (user-side)** | User installs SDK locally (`bun install @bokchoy/sdk` or `npm install` analog). Adds to game code. Sets `BOKCHOY_API_KEY` env var | None (user's local dev environment) |
| **10** | **OUT of cockpit scope (user-side, runs from user's code)** | User runs game / dev server / curl with key → calls `/v1/health-authed` on `api.bokchoy.com` (or via SDK wrapper) → backend `apiKeyMiddleware` validates HMAC + sets `c.var.projectId` + updates `api_keys.last_used_at` per slice 8.1a (`api_key_record_use(id)` SQL function) | `GET /v1/health-authed` (slice 8.1a existing endpoint) returns 200 + projectId echo; `last_used_at` updated as side effect |
| **11** | Cockpit verify-key view (T2 onboarding-confidence pattern) | Cockpit project detail page polls `GET /v1/projects/{id}` every ~3s via TanStack Query (`refetchInterval: 3000` with `enabled: !apiKey.last_used_at`); response includes `api_keys[].last_used_at`. Within ~5s of step 10, the cockpit UI updates: "✓ Key verified — last used [N seconds] ago." Polling stops after first non-null `last_used_at` is observed | `GET /v1/projects/{id}` (slice 8.4 cascade — admin-gated, returns project + nested api_keys array with last_used_at) |

### Decision sub-picks ratified by user 2026-05-11

- **(J1)** Full happy path through cockpit with explicit project creation. Rejected (J2) CLI-augmented (no MVP CLI), (J3) auto-everything (forces inconsistent project-creation paths for 2-person-team audience).
- **(MK-COLOC)** Marketing/landing page colocated in cockpit Next.js app per `[[cockpit-shape]]` marketing amendment 2026-05-11.
- **(O1)** Auto-create org on first OAuth sign-in. Matches Better Auth org plugin defaults + production refs (Stripe/Vercel/Linear/Resend all auto-create the workspace/team/org on first sign-in). Rejected (O2) explicit "Create Organization" step — extra friction for 2-person-team.
- **(K1)** API key visible-once-on-creation. Matches `[[wallet-http-contract]]` slice 8.1a HMAC model (hash stored, plaintext never retrievable). Production-cited × 3 (Stripe / Vercel / Resend). Rejected (K2) always-visible — DB compromise leaks live keys.
- **(T2)** Cockpit "Verify API key" view via polling `last_used_at`. Closes onboarding-confidence loop within ~5s. Stripe "Test mode" verification UI is the pattern reference. Rejected (T1) backend-health-endpoint-only — user gets no in-cockpit confirmation; trust gap unaddressed.

## Reasoning

### Why (J1) full-happy-path-through-cockpit

Three converging defenses:

1. **2-person-team audience needs explicit project boundaries.** Per `[[cockpit-shape]]` audience pick: dev/staging/prod separation is expected at first project setup. Auto-creating one default project (J3) forces an inconsistent second-project-creation path that contradicts (L1).
2. **No CLI exists in BokChoy MVP scope.** (J2) CLI-augmented forfeits feasibility. Future post-MVP CLI is a separate slice; not blocking this journey.
3. **Production reference convergence.** Stripe / Vercel / Linear / Resend all ship sign-up flows that route through their cockpit's auth + workspace + project/team setup pages — explicit click-through, not auto-everything. Customer-developer audience expects the click-through pattern.

(production-cited × 4 + project-internal-context; confidence: high.)

### Why (T2) cockpit verification loop, not (T1) silent SDK call

The onboarding-trust gap is real: after copying an API key, the user wonders "is this key going to work?" without any in-cockpit signal. (T2) closes the loop within seconds via polling — same psychological effect as Stripe's "Test mode" dashboard that turns green when the first webhook arrives. Cheap to implement (one polling view + nested `api_keys` field in `GET /v1/projects/{id}` response).

(T1) defers this loop to "go check your terminal output" — silent surface; user has to trust without confirmation. Acceptable at MVP β if shipping-fast trumps onboarding-confidence; rejected here because the polling cost is ~30 LOC TanStack Query + ~1 backend field addition.

(idiom-cited via Stripe Test-mode UX pattern; confidence: medium-high — direct observation of Stripe Dashboard 2026-05-11.)

### Why marketing-route step 0 is cockpit-driven, not separate workspace

Per `[[cockpit-shape]]` marketing amendment 2026-05-11: marketing/landing is colocated in cockpit's Next.js app at `apps/cockpit/app/(marketing)/page.tsx`. Domain `bokchoy.com/` apex serves both marketing route and auth-gated cockpit routes from the same Next.js app. Static-rendered for SEO via `export const dynamic = 'force-static'`.

Step 0 is "cockpit-driven" in the sense that cockpit-the-Next-js-app owns the marketing page render. The user's discovery channel that brings them TO `bokchoy.com/` is out-of-band (marketing/distribution motion, not engineering scope).

## Engineering substance applied

- **Consistency:** every cockpit-side write goes through `adminGate` per `[[admin-auth-surface]]` D2. Step 6 (`POST /v1/projects`) and step 11 (`GET /v1/projects/{id}` reading `api_keys`) both gated. Read-your-writes within session — after step 6 creates a project, step 7's redirect to `/projects/{id}` reads the just-created row (Postgres SERIALIZABLE on the wallet writes; reads on default isolation see committed state).
- **Failure semantics:** OAuth callback failure (step 2) — Better Auth's callback handler returns to `/sign-in` with error param; cockpit displays the error. Project-creation failure (step 6) — backend returns `WalletError`-like envelope per `[[wallet-http-contract]]` G5; cockpit displays the error and retains form state for retry. API-key-not-yet-used (step 11) — polling continues indefinitely; user can leave the page and the polling stops (TanStack Query cleanup on unmount).
- **Concurrency:** step 6 creates project + api_key in a single transaction (`withTenant` wrapping both INSERTs); race-free. Step 11 polling is read-only; no concurrency concerns.
- **Observability:** OTel spans emitted per request per `[[cockpit-stack-integration-research]]` operational implications: `admin.gate` per gated call (slice 8.2.0); `POST /v1/projects` handler emits its own span (slice 8.4 cascade). Cockpit-side `@hono/otel`-equivalent — Vercel observability tooling captures Next.js RSC + Server Action spans.
- **Storage:** no new tables for the journey itself. Reuses `user` / `session` / `organization` / `member` / `projects` / `api_keys` schemas. Step 6 adds rows to `projects` + `api_keys`.
- **Security:** API key visible ONCE (step 7) per K1 + `[[wallet-http-contract]]` slice 8.1a HMAC-stored model. Key prefix (first 8 chars) shown afterward for identification; full key never retrievable. OAuth provider redirects validated server-side by Better Auth (Source 3 + 4 from `[[cockpit-stack-integration-research]]`). Reverse-proxy (P1) keeps cookies first-party — no SameSite=None complexity.

## Production-grade gates

- **Idiomatic** — OAuth-primary sign-up flow + auto-org-on-first-login + explicit-project-creation + visible-once-API-key is the canonical B2B SaaS developer-onboarding pattern (Stripe / Vercel / Linear / Resend all follow this shape verbatim). Cockpit-side state via TanStack Query polling matches `[[tanstack-query-rsc-research]]` and `[[frontend-stack]]` integration patterns. *(production-cited × 4; confidence: high.)*
- **Industry-standard** — 11-step flow matches B2B SaaS dev-onboarding convergence. Two named production systems (Stripe, Vercel) ship within 10% of this exact sequence. *(production-cited × 2 minimum gate met; confidence: high.)*
- **First-class** — Better Auth's `organization` plugin auto-create-org on first sign-in is the plugin's intended behavior (Source 4 demo). Vercel rewrite for split-deploy is the production-cited Better Auth pattern (Source 2). shadcn UI primitives for the form (slice 8.4 dependency) match `[[frontend-stack]]`. Per `[[cockpit-stack-integration-research]]` F6.10 — Client Component sign-in pattern avoids the `nextCookies()` plugin complexity. *(first-class-cited; confidence: high.)*

## Rejected alternatives

### Alternative A — (J2) CLI-augmented onboarding

**What:** Sign-in via cockpit, then user runs `bk init` CLI which opens browser → cockpit shows "Authorize CLI" page → CLI receives token → CLI creates project + key locally.

**Wins when:** CLI is the dev's primary surface AND CLI exists in BokChoy MVP scope.

**Why not here:** No CLI in MVP scope per `[[mvp-feature-sequence]]`. Adding CLI to slice 8.3-8.6 is significant scope expansion. Cockpit-driven (J1) ships without CLI; CLI is a separate post-MVP slice if customer signal emerges.

### Alternative B — (J3) Auto-everything onboarding

**What:** OAuth → Better Auth auto-creates user + org + default project + default API key → cockpit shows "Your API key: bk_live_..." on landing page immediately.

**Wins when:** Solo-dev-kicking-the-tires audience (instant gratification); single-project assumption holds.

**Why not here:** Contradicts `[[cockpit-shape]]` (L1) cockpit-creates-projects pick. 2-person-team audience needs ≥2 projects (dev + prod) from day 1; auto-creating one forces an inconsistent (J1)-style path for the second project.

### Alternative C — (T1) Silent SDK call (no cockpit verification view)

**What:** User runs their first SDK call against `/v1/health-authed` and sees the response in their terminal/game logs. Cockpit shows no signal.

**Wins when:** Shipping-fast trumps onboarding-confidence; cockpit polling adds infrastructure cost.

**Why not here:** Polling cost is ~30 LOC TanStack Query + ~1 backend field. Onboarding-confidence gap is a known B2B SaaS UX problem (Stripe / Vercel both close it with verification surfaces). Cheap to do right; expensive to debug "is my key broken?" support tickets later.

### Alternative D — (O2) Explicit "Create Organization" step after sign-in

**What:** OAuth callback redirects to `/onboarding/create-org` instead of auto-creating an org. User names their org explicitly.

**Wins when:** Org name is load-bearing for the user's mental model AND default org-name (user-email-derived or random-slug) is too generic.

**Why not here:** Better Auth's `organization` plugin auto-create-on-first-login is the plugin's default. Stripe / Vercel / Linear / Resend all auto-create with editable-later naming. Extra friction at first sign-in for marginal org-name-clarity benefit. Org name editable in Settings (slice 8.4 cascade).

### Alternative E — (K2) API key always-visible in project settings

**What:** Cockpit shows the plaintext API key in project settings page indefinitely.

**Wins when:** Recovery scenarios — user lost their key — matter more than DB-compromise-blast-radius.

**Why not here:** DB compromise = live keys leaked. Slice 8.1a already commits to HMAC-storage (plaintext never retrievable from DB). Production-cited × 3 (Stripe / Vercel / Resend) all show-once. Lost-key recovery is "issue a new key + revoke old" — covered by API-key management UI in slice 8.4.

## Failure mode

**Primary failure mode: step 6 fails mid-transaction.** Project row created but API key issuance fails (Postgres connection drop, HMAC secret missing, etc.). Cockpit displays error but project orphans without a usable key.

Likelihood: low. Both writes in single transaction per `withTenant`; rollback on error leaves no orphan.

**Secondary failure mode: step 11 polling never fires `last_used_at` update.** User installs SDK but fails to make first call (wrong env var, network error, SDK installation broken). Cockpit poll loops indefinitely showing "Waiting for first SDK call..."

Likelihood: medium. Common at MVP audience scale.

**Tertiary failure mode: OAuth provider downtime.** Google / GitHub OAuth callback returns error or times out. User cannot sign in.

Likelihood: low (4-9s of OAuth provider uptime). Cannot mitigate from BokChoy side beyond clear error messaging + retry guidance.

## Mitigations

- **Step 6 transactional safety:** wrap project + api_key inserts in single `withTenant` transaction; SERIALIZABLE isolation per `[[wallet-mechanics]]`. Already the project pattern for slice 8.1c writes.
- **Step 11 polling timeout:** after 5 minutes of no `last_used_at` update, polling stops and cockpit shows "Still waiting? Check the [SDK installation guide]" with link to docs. Defers indefinite hang; gives user a self-service exit path.
- **Step 11 backend rate-limit consideration:** polling every 3s × N concurrent new-project users = backend load. At MVP scale (~10 paying customers per `[[wedge-decision]]`), trivial. Revisit-when load exceeds threshold per `[[admin-auth-surface]]` *Observability* alerting.
- **OAuth provider downtime:** clear error message + retry button + email/password fallback per (iii) auth UX pick. Magic-link deferred per `[[backend-stack]]` §7 amendment 2026-05-11 (next /design pass cascade).
- **API key copy failure (clipboard API blocked):** show key in a textarea with manual-copy instruction as fallback. Browser clipboard API may be blocked in certain contexts (cross-origin iframes, browser permissions); textarea fallback works universally.

## Idiom citations

- `idioms/typescript.md` (Make impossible states unrepresentable) — step 6 response shape `{ project: Project, apiKey: string }` is a discriminated success case; failure shape is `{ error: { code: 'BC4xx', message: string } }` per `[[admin-auth-surface]]` BC4xx allocation. TS discriminated union; handlers branch safely.
- `idioms/typescript.md` (Pass objects, not positional args) — `authClient.signIn.social({ provider: 'google' })` from Better Auth React client is the object-arg shape.
- Stripe / Vercel / Linear / Resend onboarding-pattern convergence — production-cited (direct observation 2026-05-11) for the 11-step journey shape.

## Revisit when

- **CLI lands in BokChoy MVP scope.** Triggers re-evaluation of (J1) vs (J2) hybrid — CLI-driven onboarding for power-user devs, cockpit-driven for first-time users.
- **First design partner reports onboarding friction** at a specific step. Quantitative: time-to-first-SDK-call > 15 minutes for first design partner → revisit step pacing + remove friction at the bottleneck step.
- **Auto-org-on-first-login (O1) collides with multi-org use cases.** Triggered when user wants to be invited to an existing org but also has personal auto-created org from prior sign-in → revisit O1 + add "Switch organization" flow.
- **API-key-shown-once UX confusion.** If support tickets surface "I lost my key" frequently → revisit (K1) to add prominent "Save your key" warnings + checkbox-acknowledgement gate before dismiss.
- **Polling load on backend at scale.** When backend OTel alerting shows polling-driven request rate exceeds 1% of total request volume → revisit (T2) to WebSocket / Server-Sent-Events push pattern.
- **Marketing/landing page scope grows past one page** per `[[cockpit-shape]]` revisit-when. Triggers split of marketing from cockpit workspace; step 0 surface ownership changes.

## Open threads

- **Discovery channel choice** for step 0. Currently TBD. Vault entry doesn't decide marketing channel — that's separate go-to-market work. Out of cockpit scope.
- **`POST /v1/projects` + `GET /v1/projects/{id}` contracts** owed in `[[cockpit/admin-list-endpoints-contract]]` (next /design pass entry).
- **OAuth provider config** (Google + GitHub client IDs / secrets / callback URLs / scopes) — operational config; not vault scope but slice 8.3 implementation prerequisite.
- **`[[backend-stack]]` §7 amendment** for OAuth-primary auth UX shift — owed to next /design pass mechanical amendment list.
- **SDK distribution package** (`@bokchoy/sdk` or analog) — not yet published; first-SDK-call (step 10) assumes SDK exists. Separate slice owed.
