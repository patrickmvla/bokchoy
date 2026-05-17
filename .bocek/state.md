## Current state
- **Mode:** implementation (2026-05-17). **Active track:** marketing/wallet. **M-1 + M-2 + M-3 + M-1.5 + M-4 + M-5 LANDED.** Slice M-5 implementation closed today: 5 new components in `apps/cockpit/modules/marketing/components/` (`code-block.tsx` shiki-async server-component wrapper, `hero.tsx` α-shape copy + V2 code-as-hero snippet, `features-grid.tsx` 3-pillar with primary `lg:col-span-2` weighting, `code-walkthrough.tsx` credit/debit shipped + balance/history "Coming soon" per user-ratified Option B, `cta-strip.tsx` Start free + Read the docs) + rewrite of `apps/cockpit/app/(marketing)/page.tsx` composing all four sections. shiki@4.0.2 added to cockpit deps for build-time syntax highlighting. All Server Components; CTAs use `<Button asChild><Link/></Button>` Slot composition. Three gates green: monorepo `bun run typecheck` 7/7, `bun run lint` 0 errors, `bun run test` 27/27 cached; cockpit `bun run dev` empirical smoke `GET /` → 200 OK with hero headline + #features anchor + walkthrough heading + all 4 operation tokens + 5 shiki code blocks present in rendered HTML. **All marketing/wallet slices (M-1 through M-5) now landed.**

- **M-5 inline interpretation flags:** (1) `code-walkthrough.tsx` ships credit + debit live + balance + history as `// Coming soon` muted snippets with badge — explicit user directive (Option B over A/C/D) after I surfaced the gap that v1-shape (v) names 4 operations but M-4 supersession scoped balance + history out. Mitigation against v1-shape (iii) failure-mode-on-first-touch: visible badge + opacity-60 + section heading split between "Today" and "Coming soon". (2) shiki theme is single dark (`github-dark`) ignoring next-themes chrome-flip; matches Stripe/Resend/shadcn-marketing convention; dual-theme is CSS-variable polish, deferrable. (3) All section copy is vault-sketch verbatim per the contract's PLACEHOLDER-QUALITY mandate; a separate copy authoring session is owed. Slice M-4 implementation closed today: new `packages/sdk-node` workspace shipping `@bokchoy/sdk-node` (MIT, public-scope) with five source files (~370 LOC including doc comments, ~200 LOC stripped): `index.ts` BokChoy class entrypoint; `wallets.ts` WalletsApi with friendly→wire mapping (`reason` → `reasonCode`, `player`/`currency` as URL path segments, optional body fields omitted when undefined); `http.ts` HttpClient with `globalThis.fetch` default + override for testing, Bearer auth header, auto Idempotency-Key as `bokchoy-sdk-retry-${uuid4()}` per `[[wallet-mechanics]]` Part 3 A17, User-Agent SDK-version reporting, full Stripe-wrapped envelope translation (`translateErrorResponse`); `errors.ts` BokchoyError hierarchy with two contract-mandated 404 classes (`UnknownCurrencyError` carries `availableCodes: readonly string[]`, `UnknownPlayerError` reserved for future explicit-create flow) plus `BokchoyApiError` / `BokchoyAuthenticationError` / `BokchoyValidationError` / `BokchoyConnectionError`. Workspace files: `package.json` (no `"private"`), `tsconfig.json` extending base, `LICENSE` (MIT). Three gates green: monorepo `bun run typecheck` 7/7 packages, `bun run lint` 0 errors, `bun run test` 27/27 (16 new sdk-node + 11 existing wallet). **M-5 NOW UNBLOCKED** — apex landing real content with V2 code-as-hero snippet using `@bokchoy/sdk-node`. **Parked track:** cockpit cascade amendments + operator-driven backend smoke runs + SDK publish path (npm scope claim, build step extraction).

- **Inline interpretation flag for M-1.5:** SQL functions `wallet_credit_by_external_id` / `wallet_debit_by_external_id` return `TABLE(transaction_id, wallet_id, player_id, balance_after)` rather than the literal `bigint` that "matching the existing wallet_credit shape" reads strictly. Reason: route response per (i) needs four fields and the SQL function already knows all four atomically; alternative (return bigint, two extra TS SELECTs per credit) costs two round-trips on the hot path. Reverse-able if a future /review reads the contract literally.

- **Inline interpretation flags for M-4:** Added three error classes beyond the contract-mandated 404 family — `BokchoyAuthenticationError` (401), `BokchoyValidationError` (400), `BokchoyConnectionError` (network/parse failure). Justification: Stripe SDK pattern + customers need to dispatch between "server rejected request" (`BokchoyApiError`) and "your network failed" (`BokchoyConnectionError`); without the latter, customers catch raw `TypeError` from fetch. Reverse-able if a future /review reads the "Named exception classes" obligation narrowly to mean only `UnknownCurrencyError` + `UnknownPlayerError`.

## Slice ordering on the marketing/wallet track

- **M-1** — `GET /v1/currencies` ✓ LANDED
- **M-2** — Default-currencies seeding on first project create ✓ LANDED
- **M-3** — Marketing shell route group ✓ LANDED
- **M-1.5** — Player-centric credit/debit route + player external_id schema ✓ LANDED (2026-05-17)
- **M-4** — `@bokchoy/sdk-node` package ✓ LANDED (2026-05-17; ~370 LOC with doc comments, 16 unit tests)
- **M-5** — Apex landing real content with V2 code-as-hero snippet ✓ LANDED (2026-05-17; credit+debit live, balance+history as "Coming soon" placeholders per Option B user directive)
- **Operator-driven gates owed:**
  - **M-1 curl proof:** four checks — (a) no Bearer → 401, (b) valid Bearer + project with seeded currencies → 200 with `[{id, code, displayName, createdAt}]`, (c) valid Bearer + empty project → 200 with `[]`, (d) cross-tenant: Bearer for project A returns ONLY project A's currencies.
  - **M-2 curl proof:** after creating a fresh project via `POST /v1/projects`, immediately `GET /v1/currencies` with a Bearer key for that project — assert the response contains exactly `gems` + `coins` rows with `displayName: 'Gems'`/`'Coins'`. Additionally: create a project via cockpit; query DB directly `SELECT * FROM currencies WHERE project_id = '<new-id>'` — confirm 2 rows. Atomicity test: trigger a forced failure in the transaction (e.g., a `currencies.code` collision on a doctored DB) and verify the `projects` row does NOT exist after rollback.
- **/design amendments owed (M-2 cascade, not blocking /implementation):**
  - `[[cockpit/first-run-journey]]` step 6 amendment — explicitly name `gems` + `coins` defaults as part of project bootstrap. Currently the step describes auto-key issuance but is silent on currency seeding.
  - `[[cockpit/admin-list-endpoints-contract]]` `POST /v1/projects` response shape — implementation seat picked Position A (response unchanged; SDK fetches via GET /v1/currencies). If a future design pass wants Position B (response includes seeded currency IDs as `seededCurrencies: [{id, code}]`), the addition is backward-compat-safe. No code change owed today.
- **Prior decision context** (for fresh seats reading cold):
  - `[[oss-sdk-only]]` — BokChoy is OSS-SDK-only (MIT). SDK packages public; backend + cockpit private. Slug-resolution layer is owed in `@bokchoy/sdk-node` per v1-shape (iii).
  - `[[marketing/landing-patterns-research]]` + `[[marketing/oss-core-marketing-research]]` — research entries backing the design picks. All 5 operational implications resolved by `[[marketing/v1-shape]]`.
- **Cockpit slice 8.3.6 landed 2026-05-14** (prior implementation seat): `apps/cockpit/proxy.ts` per `[[cockpit/nextjs-16-proxy-research]]` F7. Three gates green + empirical curl proof.

## Marketing track — implementation queue (ordered)

Slices in dependency order. Items in **PARALLEL** can ship concurrently. **BLOCKING** items must finish before downstream items.

### Slice M-1 — Backend `GET /v1/currencies` endpoint *(BLOCKING for M-4)*

**What:** new backend handler that returns the currencies registered for the API key's project.

**Why:** `@bokchoy/sdk-node`'s slug-resolution layer needs an endpoint to fetch the slug → UUID registry. Currently no such endpoint exists.

**Files:**
- `apps/backend/src/projects/index.ts` (or split into `apps/backend/src/currencies/index.ts` if it grows) — add `getCurrenciesHandler` and `mountCurrenciesRoutes` (or extend `mountProjectsRoutes`).
- `apps/backend/src/index.ts` — mount the new routes.

**Contract obligations:**
- Wire shape per `[[cockpit/admin-list-endpoints-contract]]` conventions: bare-data success, Stripe-wrapped errors (G5).
- Returns `Currency[]` where `Currency = { id: uuid, slug: string, displayName: string, createdAt: iso }` (verify against the `currencies` table schema in `packages/db/`).
- Behind `apiKeyMiddleware` (NOT `adminGate` — this endpoint serves the SDK, called with the project API key, not via the cockpit admin session).
- OTel span `currencies.list` with `bokchoy.project_id` attr.

**Amendments owed to existing vault entries:**
- `[[cockpit/admin-list-endpoints-contract]]` cascade list grows by one endpoint.

**Estimated scope:** ~50 LOC backend handler + Zod schema. Smallest first slice.

### Slice M-2 — Default-currencies seeding on first project creation *(PARALLEL with M-1)*

**What:** when a new project is created via `POST /v1/projects`, seed `gems` and `coins` rows in the `currencies` table for that project.

**Why:** the marketing snippet shows `currency: 'gems'`. The first-customer experience must align with the marketing demo OR the snippet doesn't work on customer day-1.

**Files:**
- `apps/backend/src/projects/index.ts` — extend `createProjectHandler` to seed defaults within the same `withTenant(db, projectId)` transaction.
- `packages/db/src/schema/currencies.ts` — verify schema exists; if not, add it.

**Amendments owed:**
- `[[cockpit/first-run-journey]]` step 6 amendment — explicitly name the `gems` + `coins` defaults as part of project bootstrap.
- `[[cockpit/admin-list-endpoints-contract]]` `POST /v1/projects` contract amendment — return shape includes the seeded currency IDs OR the SDK fetches them via `GET /v1/currencies` after project creation.

**Estimated scope:** ~30 LOC backend + 1 vault amendment.

### Slice M-3 — Marketing shell *(PARALLEL with M-1, M-2; INDEPENDENT of SDK)*

**What:** the `(marketing)/` route group + top-nav + footer + placeholder `/pricing` page. Visible v1 marketing surface that doesn't depend on the SDK.

**Files (new):**
- `apps/cockpit/app/(marketing)/layout.tsx` — marketing route group layout. Different from `(app)/layout.tsx` (no auth gate; different header).
- `apps/cockpit/app/(marketing)/page.tsx` — apex landing with placeholder hero (real hero content lands in M-5). Should at minimum show the α-shape hero copy sketch + a placeholder CTA.
- `apps/cockpit/app/(marketing)/pricing/page.tsx` — placeholder per `[[marketing/v1-shape]]` cascade #4: *"Usage-based pricing. Free during private beta. Contact hello@bokchoy.com for production estimates."* (or canonical contact address).
- `apps/cockpit/modules/marketing/components/top-nav.tsx` — 4 items per `[[marketing/v1-shape]]` (i): Product (anchor on `/`), Pricing, Docs, Sign in.
- `apps/cockpit/modules/marketing/components/footer.tsx` — copyright + nav links + small print.

**Routing concerns:**
- `app/(marketing)/` route group is OUTSIDE `app/(app)/` per `[[cockpit/file-structure]]`. No auth gate. Public-reachable.
- `apps/cockpit/proxy.ts` matcher (`['/projects', '/projects/:path*']`) does NOT match marketing routes — confirmed clean.
- Top-nav's "Sign in" → `/sign-in` (already shipped per slice 8.3.3).

**Estimated scope:** ~200 LOC.

### Slice M-4 — `@bokchoy/sdk-node` package with slug-resolution *(BLOCKED on M-1; BLOCKS M-5)*

**What:** the OSS-SDK-only package per `[[oss-sdk-only]]`. New workspace package + npm publish flow.

**Files (new workspace package):**
- `packages/sdk-node/package.json` — `@bokchoy/sdk-node`, MIT license per `[[oss-sdk-only]]`, public scope. Eventually moves to `bokchoy/sdk-node` standalone GitHub repo per the per-SDK-repo decision; at MVP can live in the monorepo and split later.
- `packages/sdk-node/src/index.ts` — main `BokChoy` class entrypoint.
- `packages/sdk-node/src/wallets.ts` — `wallets.credit({ player, amount, currency, reason })` and `wallets.debit(...)` with slug-resolution.
- `packages/sdk-node/src/slug-resolver.ts` — slug → UUID cache (per-process `Map` with TTL). Fetches from `GET /v1/currencies` on miss.
- `packages/sdk-node/src/errors.ts` — `UnknownCurrencyError` + `UnknownPlayerError` named exception classes with available-slug enumeration per `[[marketing/v1-shape]]` Mitigation #1.

**Contract obligations (per `[[marketing/v1-shape]]` (iii) + Mitigation #1):**
- Friendly-name API: `wallets.credit({ player: 'player_123', amount: 100, currency: 'gems', reason: 'level_up_reward' })`. NOT the raw `walletId`/`currencyId` wire shape.
- Slug-cache TTL + force-refresh on miss; bounded retry depth (1 refresh per call).
- `UnknownCurrencyError` lists available currencies in the error message AND as a typed property.
- One-wallet-per-player convention (or explicit `wallets.create({ player })` shown in docs — pick at implementation time).

**Estimated scope:** ~500 LOC + tests. The substantial work item.

### Slice M-5 — Apex landing content *(BLOCKED on M-3 + M-4)*

**What:** the full v1 apex landing — hero + features-grid + code-walkthrough + cta-strip components.

**Files (new):**
- `apps/cockpit/modules/marketing/components/hero.tsx` — α-shape hero copy (sketch: *"Wallet infrastructure for game economies"*) + V2 code-as-hero snippet using the real `@bokchoy/sdk-node` API from M-4.
- `apps/cockpit/modules/marketing/components/features-grid.tsx` — 3-pillar features per `[[marketing/v1-shape]]` (iv). Audit-log primary, Postgres-native secondary, defense-in-depth tertiary.
- `apps/cockpit/modules/marketing/components/code-walkthrough.tsx` — 3-4 sibling SDK operations (credit + debit + balance + history) per `[[marketing/v1-shape]]` (v).
- `apps/cockpit/modules/marketing/components/cta-strip.tsx` — *"Start free"* button → `/sign-up`. Secondary docs link.
- `apps/cockpit/app/(marketing)/page.tsx` — composition of the above.

**Implementation gates:**
- Static syntax-highlighting via shiki (build-time) — no client-side syntax highlighter to keep marketing-route bundle weight low.
- All components Server Components by default; client-interactive only at leaf CTA buttons per `[[cockpit-stack-integration-research]]` F6 anti-pattern table.
- Copy is PLACEHOLDER QUALITY — the actual marketing copy is a separate authoring session, not part of M-5. M-5 ships structure; copy polishes after.

**Estimated scope:** ~300-400 LOC.

## Marketing track — open design picks (do NOT touch in /implementation seat)

These are /design questions, not /implementation work. If the next implementation seat hits one of these, it should switch to /design or surface a gap report.

- **`/docs` tech-stack** — MDX in-repo vs subdomain vs Mintlify-style. Form-deferred in `[[marketing/v1-shape]]` (i). Affects `/docs` route implementation; can defer until after M-5.
- **Marketing copy authoring** — α-shape settled; actual words owed. Hero "Wallet infrastructure for game economies" is a SKETCH, not final. Copy session can happen anytime; doesn't block M-1 through M-4.
- **Voice/register survey** — open thread #2 from `[[marketing/oss-core-marketing-research]]`. Defer until copy session.

## Cockpit track — parked items

All non-marketing items in queue. Lower priority than marketing track unless explicitly reactivated.

- **Cascade-amendments /design pass** — 7 items queued: F8-wording amendment for `[[cockpit/turbopack-flag-research]]`; new F6 row for the proxy rename in `[[cockpit-stack-integration-research]]` + Source 4 mental-model amendment; `[[cockpit/auth-surface-mount]]` (V3) rewrites-after-proxy documentation; `[[cockpit/auth-surface-mount]]` (CL) baseURL + (P) socialProviders documentation; `[[cockpit/admin-list-endpoints-contract]]` `prefix` → `keyPrefix`; `[[cockpit/admin-list-endpoints-contract]]` error-code casing; `[[cockpit/first-run-journey]]` step 5+6 terminology.
- **Smoke-script empirical run** for slice 8.4 — operator-driven (`DATABASE_URL` + `DATABASE_MIGRATION_URL` + `BOKCHOY_API_KEY_HMAC_SECRET` env). Extend with DELETE + orgs coverage before running.
- **Empirical OAuth flow test** — operator-driven (`GOOGLE_CLIENT_ID`/`SECRET` + `GITHUB_CLIENT_ID`/`SECRET` env + provider redirect URI registration).
- **Sign-out chrome enhancements** — none owed currently; AppHeader already has it.

## Next on resume — what to do in a fresh /implementation chat

1. Run `bash ~/.bocek/scripts/preflight.sh implementation` (slash command does this).
2. Read this state.md.
3. Read `.bocek/vault/marketing/v1-shape.md` end-to-end (it IS the contract).
4. Read `.bocek/vault/_shared/oss-sdk-only.md` if touching SDK work (Slice M-4).
5. **Next implementation slice: M-1.5** per `[[wallet/credit-route-contract]]`. 13 cascade obligations enumerated in the vault entry (migration + new SQL function + Drizzle column add + wrapper module + 2 new route handlers + Zod schemas + OTel hash impl + env var + v1-shape Cascade #1(a) supersession noted + SDK package estimate revised + SECURITY.md doc + smoke-script extension + schema-comment deletion at `wallet.ts:92`). Quote the contract section verbatim before writing code. M-4 (SDK) blocked on M-1.5 landing; M-5 blocked on M-4. M-1 + M-2 operator-driven curl gates still pickable as parallel-track operator work.
6. Quote the contract section of `[[marketing/v1-shape]]` verbatim per the implementation primitive's contract-following protocol.
7. Three gates per slice: monorepo `bun run typecheck`, cockpit `bun run lint`, cockpit `bun run dev` + empirical curl proof.

## Session history (most recent first)
- 2026-05-17 — `/implementation` — **Slice M-5 LANDED.** Marketing apex S-walkthrough page composition: Hero (α-shape + V2 code-as-hero with real `@bokchoy/sdk-node` import) → FeaturesGrid (3-pillar, audit-log primary lg:col-span-2) → CodeWalkthrough (credit + debit live, balance + history "Coming soon" muted + badged per user-ratified Option B after gap-flag) → CtaStrip (Start free + Read the docs). shiki@4.0.2 added; `CodeBlock` async server component does build-time highlighting via `codeToHtml`. Gates: typecheck 7/7, lint 0 errors, dev-server `GET /` 200 OK with all sections verified via grep on hero headline + #features anchor + walkthrough heading + 4 operation tokens + 5 shiki blocks. **Carries:** SDK `wallets.balance` + `wallets.history` methods + matching backend endpoints owed before the "Coming soon" snippets become live; marketing copy authoring session owed (current text is vault sketch); shiki dual-theme polish deferrable.
- 2026-05-17 — `/implementation` — **Slice M-4 LANDED.** New `packages/sdk-node` workspace shipping `@bokchoy/sdk-node` (MIT, public). Five source files: `index.ts` (BokChoy class entrypoint), `wallets.ts` (WalletsApi friendly→wire mapping), `http.ts` (HttpClient with cross-runtime fetch + Bearer auth + auto-Idempotency-Key + Stripe-wrapped envelope translator), `errors.ts` (BokchoyError hierarchy). 16 unit tests covering URL encoding, header composition (idempotency-key uuid format match), fetch-throw / JSON-parse-failure wrapping, every 4xx/5xx variant including the UNKNOWN_CURRENCY 404 → typed exception with availableCodes round-trip. Gates green; M-5 unblocked. **Carries:** SDK_VERSION hardcoded `'0.0.0'` (wire from package.json at build time when extracted for npm publish); no `engines: { node: '>=20' }` field yet; no build step (monorepo source-only convention); no request-timeout option (caller passes AbortController); M-5 walkthrough wants balance + history endpoints that don't exist on backend — separate cascade.
- 2026-05-17 — `/implementation` — **Slice M-1.5 LANDED.** All 9 in-slice cascade obligations from `[[wallet/credit-route-contract]]` satisfied: (1) migration 0010 with column DDL + 2 SQL functions; (2)–(3) Drizzle column add + comment deletion at `packages/db/src/schema/wallet.ts:92`; (4)–(5) `walletCreditByExternalId` + sister debit wrappers in `@bokchoy/wallet` with shared `readUuidOrText`/`readNumericAsString` helpers in `internal.ts`; (6) BC060 SQLSTATE parser added to `sqlstate-to-error.ts` + ErrorDetails shape changed from `constraintName` to `{currencyCode, projectId}` (FK-violation dormant path retired); (7)–(8) `hashPlayerExternalIdForOtel` HMAC-SHA256 util + `BOKCHOY_OTEL_PII_SALT` env var (32-char min, fail-at-boot); (9) two new route handlers + Zod schemas + handler-local UNKNOWN_CURRENCY 404 with `availableCodes`. Three gates green. **Inline call:** SQL functions return TABLE(...) rather than literal bigint — flagged in Current state. **Carries for /design or future slices:** cascade #11 SDK package M-4 (now unblocked); #12 SECURITY.md external_id paragraph (owed to `[[oss-sdk-only]]` doc cascade); #13 `packages/db/scripts/smoke-functions.ts` extension covering lazy-create + idempotent replay + cross-project isolation + UNKNOWN_CURRENCY error path + adversarial-external_id rejection.
- 2026-05-14 — `/design` — `[[wallet/credit-route-contract]]` LANDED. 4 sub-decisions ratified via structured fork (B2 route shape, combined-scope M-1.5, lazy-create player semantics, Stripe-metadata-pattern PII with HMAC-OTel-tweak). Research-grounded — 3 of 4 picks were tier-2-cited recommendations the human ratified; the 4th (Q2 scope) was operational. `[[marketing/v1-shape]]` Cascade #1(a) marked SUPERSEDED. 13 cascade obligations for M-1.5 implementation enumerated.
- 2026-05-14 — `/research` — `[[wallet/credit-route-shape-research]]` LANDED. 7-source survey (PlayFab tier 2, Nakama tier 2 + tier 1 source, RevenueCat tier 2, LootLocker tier 4, AccelByte tier 4, contradiction probe, own source). F1: game-economy SDKs uniformly player-centric single-call lazy-create. Contradiction probe (walletId-in-path) empty for class. B1 + B4 (two-call) rejected on production grounds. Remaining design pick: B2 (player-centric URL, matches RevenueCat) vs B3 (body-encoded, matches PlayFab + schema-author-intent). Research lean: B2 (production-convention + smaller SDK surface).
- 2026-05-14 — `/implementation` → /design (handoff) — **M-4 BLOCKED on player→walletId resolution gap.** Scoping pass revealed `bokchoy.wallets.credit({ player, currency, ... })` SDK API per v1-shape (iii) is non-implementable against today's backend — `POST /v1/wallets/:walletId/credit` requires a known walletId, no resolution endpoint exists, `wallet_credit` SQL doesn't lazy-create despite schema comment claiming it does. Gap report logged with 4 options (B1–B4). No SDK code written.
- 2026-05-14 — `/implementation` — **Slice M-3 LANDED.** Marketing route group + chrome — 5 new cockpit files (~200 LOC total), deleted slice 8.3.1 root placeholder. Three gates green including empirical browser-curl proof: 4 routes verified (apex 200, /pricing 200, /projects 307→/sign-in, /docs 404). Hero copy is α-shape sketch verbatim from v1-shape; CTAs route to `/sign-up` + `/docs`. Real V2 code-as-hero snippet still owed in M-5 (blocked on M-4 SDK package).
- 2026-05-14 — `/implementation` — **Slice M-2 LANDED.** `createProjectHandler` in `apps/backend/src/projects/index.ts` extended with seeded `gems` + `coins` currency INSERTs inside the same `db.transaction` as the project INSERT. Inlined `set_config('app.current_tenant', ..., true)` for the RLS-enforced currencies write (didn't compose `withTenant` because nesting `db.transaction` calls would split the atomicity guarantee). Picked Position A on the response-shape design fork (response unchanged; SDK fetches via GET /v1/currencies) and flagged Position B as a backward-compat-safe future amendment. Code gates green; empirical curl operator-driven (same blocker as M-1). M-1 + M-2 together make `currency: 'gems'` work end-to-end on day-1 of customer onboarding.
- 2026-05-14 — `/implementation` — **Slice M-1 LANDED.** `apps/backend/src/currencies/index.ts` (new) + mount line in `apps/backend/src/index.ts`. Quoted M-1 contract from `[[marketing/v1-shape]]` Cascade #2 inline; satisfied all 16 contract items (verified by code trace). Gates: typecheck green, lint green after one Biome auto-fix (import ordering), empirical curl operator-driven (HMAC secret not in .env). Unblocks M-4 (SDK package can now consume the endpoint).
- 2026-05-14 — `/design` — `[[marketing/v1-shape]]` AMENDED. Cascade obligation #2 expanded with explicit M-1 wire-shape contract (method, auth, fields, ordering, empty-list, errors, OTel span, file location, mount). Terminology note near (iii) clarifies generic-English use of "slug". One-entry-read for /implementation now possible. M-1 fully unblocked.
- 2026-05-14 — `/research` — `[[marketing/currencies-endpoint-research]]` LANDED. 9 sources across game-economy SDK class (LootLocker, PlayFab, RevenueCat, AccelByte, Nakama, Beamable partial) + generic dev-tool class (Better Auth, Vercel) + Stripe property-convention. F1 LOAD-BEARING: game-economy converges on `code`-shaped wire field; 3 tier-2 cites + 1 tier-4. F2: dev-tool `slug` is wrong-class precedent. F4: minimal field set is the SMB/indie convention. Contradiction probe empty for `slug` in game-economy. **Closes both M-1 contract gaps.** Design seat's Position D (rename to slug) superseded by Position A (wire = code).
- 2026-05-14 — `/implementation` → `/design` → `/research` — M-1 attempt surfaced two contract gaps (wire field name + response field set). /design enumerated positions A/B/C/D (wire name) and α/β/γ (field set) with preliminary position D + β; my evidence base was thin (2 training-data cites for `slug`), so handed to /research for primary-source verification. M-1 paused; M-3 unblocked as fallback work.
- 2026-05-14 — `/design` — `[[marketing/v1-shape]]` LANDED with 5 sub-decisions. All 5 ops from `[[marketing/landing-patterns-research]]` resolved. State.md prepared for fresh /implementation seat with marketing track ordered into slices M-1 through M-5.
- 2026-05-14 — `/design` — `[[oss-sdk-only]]` LANDED. BokChoy is OSS-SDK-only (MIT, per-SDK repos, DCO, 90-day disclosure). Closes prior research open threads.
- 2026-05-14 — `/research` — `[[marketing/oss-core-marketing-research]]` LANDED. OSS-core class survey (Supabase + PostHog + Plausible). F8 falsifies "OSS-core → OSS-prominent marketing"; F8a refines prior F6 with the recognition+values-contrast rule.
- 2026-05-14 — `/research` — `[[marketing/landing-patterns-research]]` LANDED. 6-site B2B dev-tool landing survey. F1-F7 findings + 7 operational implications + 6 open threads.
- 2026-05-14 — `/research` — `[[cockpit/turbopack-flag-research]]` LANDED. `--turbopack` flag documented as no-op-when-default-applies in Next.js 16.2.6; removal optional, retention has no runtime cost.
- 2026-05-14 — `/implementation` slice 8.3.6 — `apps/cockpit/proxy.ts` landed per `[[cockpit/nextjs-16-proxy-research]]` F7. Three gates green + 6 empirical curl checks. Two-tier defense-in-depth verified.
- 2026-05-14 — `/research` — `[[cockpit/nextjs-16-proxy-research]]` LANDED. Triangulation: Next.js 16 file convention is `proxy.ts` not `middleware.ts`; Node.js runtime; getSessionCookie signature unchanged.
- 2026-05-13 — `/implementation` — slice 8.3.5 (Suspense investigation + sign-up surface) LANDED.
- 2026-05-13 — `/implementation` — slice 8.3 (GET /v1/orgs/me + auth chrome) LANDED.
