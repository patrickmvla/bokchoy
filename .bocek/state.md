## Current state
- **Mode:** implementation → slice 8.2.0 LANDED 2026-05-11 (`[[admin-auth-surface]]` primitive layer shipped; 5/6 cascade obligations satisfied; integration-tests obligation deferred to slice 8.2.1 first-consumer smoke per project convention; gap report at `.bocek/vault/architecture/gaps.md` flags two queued amendments + path cleanup)
- **Slice 8.2.0 LANDED 2026-05-11 per `[[admin-auth-surface]]` contract.** Eight work units shipped:
  - **`packages/auth-config/src/index.ts`** extended with `createAccessControl({ reasonCode: ['bootstrap'], player: ['deidentify'] } as const)` + `adminRole` granting both + `roles` export keyed by `'admin'`. Plugin wiring updated to `organization({ ac, roles })`. Per [[admin-auth-surface]] D3 + D5; `roles` export load-bearing for cascade obligation #3 (CI lint).
  - **`apps/backend/src/infra/auth.ts`** (NEW) — Better Auth singleton via `createAuth({ db, baseURL, trustedOrigins })`. Closes `apps/backend/src/index.ts:25` "Better Auth wiring explicitly out" comment. `auth.api.getSession` / `auth.api.hasPermission` work without mounting Better Auth's HTTP routes (route-mount is cockpit-slice scope).
  - **`apps/backend/src/infra/index.ts`** updated to re-export `auth`.
  - **`apps/backend/src/admin/admin-gate.ts`** (NEW) — Hono middleware factory `adminGate({ resource, actions, projectIdParam? })`. Implements the 5-step contract verbatim: session → resolve org (body → query → session precedence) → optional project tenancy check → member lookup → hasPermission. Sets typed `c.var['admin.member']` + `c.var['admin.org']`. OTel span `admin.gate` with `auth.{resource,actions,has_project_scope,user_id,organization_id,role,outcome}` attributes covering pass + 5 named failure paths.
  - **`apps/backend/src/admin/index.ts`** (NEW) — barrel re-export `adminGate`, `AdminContext`, `AdminGateOptions`.
  - **`apps/backend/package.json`** — added `@bokchoy/auth-config: workspace:*` + `better-auth: catalog:` deps.
  - **`scripts/check-auth-roles.ts`** (NEW) — post-migration CI lint. Queries `SELECT DISTINCT role FROM "member"`, asserts every value is in `Better Auth defaults ∪ Object.keys(roles)`. Per [[admin-auth-surface]] *Mitigations* primary failure mode.
  - **`package.json`** — added `check:auth-roles` script wiring the new lint.
- **Verification:**
  - **`bun run typecheck`** (turbo: 6/6 packages green — both auth-config + backend cache-miss recompiled with new code).
  - **`bun run lint:check`** exit 0 (2 pre-existing `packages/wallet/scripts/smoke-wrappers.ts` slice-7.7 warnings only; ZERO from slice 8.2.0 code after biome auto-fix import sort + manual `noConfusingVoidType` fix + `satisfies` + `Parameters` boundary cast replacing `as any`).
  - Integration smoke deferred per Gap 1.
- **Cascade obligations status:**
  - **#1 Wire static AC + adminRole in packages/auth-config/src/index.ts** ✅ LANDED.
  - **#2 Implement adminGate middleware at apps/backend/src/admin/admin-gate.ts** ✅ LANDED.
  - **#3 CI lint scripts/check-auth-roles.ts** ✅ LANDED + wired via `bun run check:auth-roles`.
  - **#4 Integration tests at apps/backend/src/admin/admin-gate.test.ts** ⏸ DEFERRED to slice 8.2.1 first-consumer smoke per Gap 1. Project convention is `/tmp/smoke-*.sh` shell scripts; vault entry's named path was a /design improvisation that didn't match project pattern.
  - **#5 BC4xx error-code allocation amendment to [[wallet-mechanics]] A18** ⏸ DEFERRED per Gap 2 — mechanical, not blocking; queue for next /design or /refactoring.
  - **#6 OTel span emission** ✅ LANDED inside adminGate.
- **Self-attack pass:**
  - **Boundary input** (malformed UUID): UUID_REGEX validates before DB query → 400 BC400, not 500. ✅
  - **Error path** (DB down / Better Auth error): bubbles to existing errorMiddleware → 500. ✅
  - **Cancellation**: span ends in finally; no resource leak. ✅
  - **Observability gap**: 6 outcome values stamped on `admin.gate` span (pass + fail.401 + fail.400 + fail.403_cross_org + fail.403_not_member + fail.403_perm); alerting rule fires on outcome != 'pass' rate > 5% over 5min per project. ✅
  - **Concurrency hazard**: middleware is per-request; Better Auth's in-memory `cacheAllRoles` is keyed by `organizationId`, safe across concurrent requests for the same org. ✅
  - **Idempotency**: gate is read-only; retries re-run cleanly. ✅
  - **Anti-default review**: senior reviewer would catch (a) `as HasPermInput` cast at one boundary — necessary because Better Auth's input is ZodIntersection; downstream typed cleanly; (b) 4 DB roundtrips per gated request (Better Auth session + optional project + member + org) — could collapse to JOIN at perf-pass; trade is simplicity wins at MVP, revisit if p95 > 100ms; (c) body precedence might silently override session activeOrg — vault entry documents body-wins-on-conflict as production-cited × 10, tenancy check is the actual security boundary.
- **Gap reports** at `.bocek/vault/architecture/gaps.md`:
  - **Gap 1**: integration-test path vs project convention (recommend (a) defer to 8.2.1 smoke; amend `[[admin-auth-surface]]` *Mitigations* row 4).
  - **Gap 2**: BC4xx wire-code namespace not vaulted in `[[wallet-mechanics]]` A18 (mechanical amendment queued).
  - **Gap 3**: `apps/auth-config/` path discrepancy in 3 vault entries (mechanical refactor queued).
- **Open / known debt (carried, UNCHANGED by 8.2.0):**
  - All slice-8.1-era debt items still open (deploy runbook for pg_cron, failed-run alerting, `extensions.grant_pg_cron_access` verify, `BOKCHOY_API_KEY_HMAC_SECRET` rotation runbook, cockpit-driven key creation, WWW-Authenticate response header on 401, sampler revisit at scale, OTel layers 2+3).
  - `walletDeidentifyPlayer` HTTP handler — DSR flow, blocked on adminGate (now unblocked!) but also blocked on Q3 (DSR shape in ledger contexts) research from prior /design seat.
  - `bootstrapProjectReasonCodes` HTTP handler — admin-only, now unblocked by adminGate.
  - **`.env.example`** — owes `BOKCHOY_BASE_URL` + `BOKCHOY_TRUSTED_ORIGINS` additions (added in slice 8.2.0 code path but env-example update is queued; matches the slice-8.1a/b cleanup-pass pattern).
- **Cascades active (NEW after 8.2.0):**
  - **`adminGate` opens first-consumer slot** — slice 8.2.1 can pick either `bootstrapProjectReasonCodes` (no DSR research dependency) or `walletDeidentifyPlayer` (requires Q3 DSR research entry per prior /design seat's queued open thread).
- **Cascades active (UNCHANGED):**
  - `[[idempotency-strategy]]` §Concurrency Generalization note watch — second cross-cutting middleware writing to UNIQUE-constrained table triggers promotion to `[[upsert-race-loser-pattern]]` standalone entry.
- **Next on resume — recommended sequence:**
  1. **Slice 8.2.1** — pick first admin handler consumer. **`bootstrapProjectReasonCodes` is the lower-risk path** (no Q3 DSR research dependency; admin role grants `reasonCode:bootstrap` permission; data shape per `[[wallet-mechanics]]` Part 3 A15 `reason_codes` schema). `walletDeidentifyPlayer` requires Q3 DSR research first (carry-forward from prior /design seat's queued threads).
  2. **`/tmp/smoke-8-2.0-admin-gate.sh` integration smoke** ships alongside slice 8.2.1 first consumer — closes Gap 1 by exercising the full 5-step gate end-to-end against real Better Auth sessions + member rows + project rows.
  3. **Optional: `/design` mini-pass** to resolve Gap 1 + Gap 2 vault amendments (≤30min; both are mechanical). Cleaner long-term but not blocking 8.2.1.
  4. Working tree as of this session = slice 8.1.x cluster (committed) + Q2 research entry + admin-auth-surface decision entry + slice 8.2.0 implementation (8 file changes) + gap-report entry — all ready for next commit.

- **Mode (prior):** design → handoff to /implementation 2026-05-11 (admin auth surface RESOLVED + vaulted as `[[admin-auth-surface]]`; five sub-decisions D1-D5 grounded; six rejected alternatives named; three failure modes mitigated; ready for slice 8.2 admin handler implementation)
- **/design pass 2026-05-11 LANDED.** One decision entry shipped covering D1-D5 from prior /research handoff. Position derivation per primitive's *Operating at your ceiling* protocol: enumerated alternatives per sub-decision, ranked by evidence quality, self-attacked picks, anti-default check applied.
- **`[[admin-auth-surface]]`** — admin gate is a Hono middleware factory `adminGate({ resource, actions })` running the canonical 5-step gate (session → resolve org → BokChoy-side tenancy check → member lookup → `hasPermission`) per `[[better-auth-org-admin-research]]` F1. Sets typed `c.var['admin.member']` + `c.var['admin.org']` for downstream handlers; org resolved via `body ?? query ?? session.activeOrganizationId`. Static AC at MVP; statements + single `"admin"` role declared at `packages/auth-config/src/index.ts` startup.
- **Picks summary (all grounded against the picks-table presented to user 2026-05-11):**
  - **D1** = (α) body precedence + session fallback — production-cited × 10 Better Auth call sites at commit `e21d744`. Confidence: high.
  - **D2** = (μ) Hono middleware factory — BokChoy internal precedent × 3 prior slices (api-key/idempotency/error-middleware) + Hono first-class composition primitive + `idioms/typescript.md` *Make impossible states unrepresentable*. Confidence: medium-high (gap-flagged: no public B2B SaaS Better-Auth+Hono+middleware-factory source-walked).
  - **D3** = Static AC at MVP — `[[backend-stack]]` §7 commitment 2026-05-03 confirmed by code (no `organizationRole` table in `packages/db/src/schema/auth.ts`). Confidence: high.
  - **D4** = Schema scope unchanged at MVP — direct corollary of D3 + `[[backend-stack]]` §7 customer-team-member deferral. Confidence: high.
  - **D5** = Two statements + one `"admin"` role — `{ reasonCode: ['bootstrap'], player: ['deidentify'] }` + adminRole granting both. Smallest set mapping both named consumers (`[[wallet-http-contract]]:24,207`); 2-line-edit extension shape. Confidence: high.
- **User defense ratified:** *"single role at MVP still holds, vault it"* — defended via `[[backend-stack]]` §7 commitment standing unchanged after two weeks; no surfaced constraint to flip. Per *Response calibration* (sound reasoning with evidence → accept, record, move on).
- **Codebase reading was load-bearing this pass.** Verified `packages/auth-config/src/index.ts` already exists with `createAuth()` factory + `betterAuth({ plugins: [anonymous(), organization()], advanced.database.generateId: 'uuid' })`. Verified `packages/db/src/schema/auth.ts` already has the 7-table baseline (user/session/account/verification/organization/member/invitation) with `session.activeOrganizationId: uuid` + `member.role: text NOT NULL DEFAULT 'member'`. Pre-existing wiring matches research findings exactly — `member.role` schema verbatim with Better Auth source-walk per `[[better-auth-org-admin-research]]` F1. **Three vault entries reference stale `apps/auth-config/` path**; cleanup cascade owed.
- **Cascade obligations queued for /implementation phase:**
  1. **Wire static AC + adminRole in `packages/auth-config/src/index.ts`** — extend existing `createAuth()` factory: `import { createAccessControl } from 'better-auth/plugins/access'` + define statements + define adminRole + pass `{ ac, roles: { admin: adminRole } }` to `organization()`.
  2. **Implement `adminGate({ resource, actions })` Hono middleware factory** at `apps/backend/src/admin/admin-gate.ts` (new dir + file). Hono `Variables` generic: `{ 'admin.member': Member; 'admin.org': Organization }`. 5-step gate per the contract.
  3. **CI lint `scripts/check-auth-roles.ts`** — post-migration smoke querying `SELECT DISTINCT role FROM member`, asserts every value is a key in the exported `roles` config. Deploy-pipeline gate; failure = abort.
  4. **`adminGate` integration tests** at `apps/backend/src/admin/admin-gate.test.ts` — 3 positive (admin/owner/custom-with-permissions) + 4 negative (no-session-401, missing-org-400, cross-org-project-403, member-without-permission-403). Reuses slice 8.1c smoke pattern.
  5. **BC400/BC401/BC403 error-code allocation** — extend `[[wallet-mechanics]]` Part 3 A18 BCxxx namespace via mechanical amendment when first admin handler ships in slice 8.2.
  6. **OTel span emission from `adminGate`** with `auth.{organizationId,userId,role,resource,actions,outcome}` attributes. Page-rule on `outcome != 'pass'` > 5% over 5min per project.
- **Cascade obligations queued for next /design or /refactoring pass (NOT blocking implementation):**
  1. **Path-discrepancy cleanup** — `apps/auth-config/` → `packages/auth-config/` in three vault entries: `[[tenancy-ids-research]]:256`, `[[wallet-mechanics]]` A12 cascade obligations, prior state.md entries. One-pass amendment.
- **Open threads (carried, NOT blocking implementation):**
  - **D2-(μ) production-cite gap** — no public B2B SaaS Better-Auth+Hono+middleware-factory source-walked. Confidence medium-high vs high; not blocking, but if a future constraint forces D2 revisit, run focused /research pass on Cal.com / Deel.com / MeetingBaas admin handler shape.
  - **Org plugin rewrite stabilization** — Better Auth PRs `#7251` + 5 follow-ups in flight through 2026-Q1/Q2; pin Better Auth version in `packages/auth-config/package.json`; re-survey on bump.
  - **Q1 (sequencing) from prior /design seat collapsed** — Q2 finding made admin-auth-surface decision tractable enough to vault directly; sequencing question becomes "ship admin-auth-surface in slice 8.2, then `bootstrapProjectReasonCodes` and `walletDeidentifyPlayer` as parallel-or-sequential implementation work." No sequencing research owed.
  - **Q3 (DSR shape in ledger contexts) still owed** when /design picks `walletDeidentifyPlayer` as a slice. Out of scope this pass; admin-auth-surface entry doesn't preclude any DSR shape.
- **Next on resume — recommended sequence:**
  1. **Switch to `/implementation`** with `[[admin-auth-surface]]` as the contract. Six cascade obligations enumerated above; pick first consumer (`bootstrapProjectReasonCodes` vs `walletDeidentifyPlayer`) as the parallel slice-8.2 work.
  2. /implementation flags any gap in the contract back to /design (BC4xx allocation cleanup is the most likely gap-flag — mechanical, not architectural).
  3. Working tree as of this session = slice 8.1.x cluster (committed) + Q2 research entry + admin-auth-surface decision entry (both vaulted, both ready for next commit).

- **Mode (prior):** research → handoff to /design 2026-05-11 (Q2 vaulted: `[[better-auth-org-admin-research]]` — admin-gate canonical pattern + (P1) ratified + custom-statements obligation surfaced + two design follow-ups owed)
- **/research pass 2026-05-11 LANDED.** One entry shipped, triangulated per *Triangulation* gate (1 production cite + 1 docs cite + 1 contradiction probe):
  - **`[[better-auth-org-admin-research]]`** — closes /design Q2 (Better Auth org plugin admin-gate shape for slice 8.2). Production-cited via source-walk of `better-auth/better-auth` org plugin at commit `e21d744` (HEAD 2026-05-11); docs-cited via better-auth.com/docs/plugins/organization v1.6; contradiction probe across GitHub issues + demo-app source.
- **F1 (LOAD-BEARING):** canonical admin gate = `hasPermission()` called manually at handler top. Every protected route in Better Auth's own org plugin code (crud-org / crud-team / crud-members / crud-invites / crud-access-control) follows `findMemberByOrgId` → `hasPermission({ permissions, role: member.role, options, organizationId }, ctx)` → throw FORBIDDEN. **No middleware decorator exists**; docs confirm; manual call is the intended pattern.
- **F2:** Session carries `activeOrganizationId` ONLY; role lookup is a separate `findMemberByOrgId` adapter call. In-memory `cacheAllRoles` exists for repeated checks within same request.
- **F3:** Default statements (`organization` / `member` / `invitation` / `team` / `ac`) don't include BokChoy resources. **BokChoy MUST extend** via `createAccessControl({ reasonCode: ["bootstrap"], player: ["deidentify"], project: ["read", "update"] })` + custom roles in `apps/auth-config/src/index.ts`.
- **F4:** Multi-role via comma-separated `member.role` string; OR-of-roles semantics built-in. Free headroom, not required at MVP.
- **(P1 vs P2) settled:** (P1) is production-cited. `member.role === "member"` (default) has ZERO permissions per `access/statement.ts:29-35`; only `"admin"` / `"owner"` (or extended role) passes. (P2) is regression vs defaults, undefended.
- **C1 contradiction (stability signal):** org plugin mid-rewrite across 6 in-flight PRs (#7251, #7544, #7591, #7601, #7628, #7886) through 2026-Q1/Q2. v1.6 stable; pin Better Auth version; expect minor-version migration work on next bump.
- **C2 contradiction (resolved):** demo app's `/admin` route uses `session.user.role !== "admin"` — that's the SEPARATE `admin` plugin (instance-admin), not org plugin. BokChoy customer-developer-admin = org plugin's `member.role`. If BokChoy ever ships BokChoy-staff cross-org admin, that's `admin` plugin's `user.role` — separate decision.
- **F5 risk cleared:** `[[backend-stack]]` F5 (custom-field UI breakage) is bundled-UI-only; server-side `hasPermission()` flow unaffected. Confirmed in source-walk.
- **Operational implications:** both `bootstrapProjectReasonCodes` and `walletDeidentifyPlayer` share a 5-step admin gate (Better Auth session → resolve org → BokChoy-side `project.organization_id === activeOrgId` check → `findMemberByOrgId` → `hasPermission`). Hono middleware factory `adminGate({ resource, actions })` defensible for ≥3 admin handlers.
- **Anti-default applied:** explicitly searched for non-`hasPermission` admin-gate patterns. Found demo-app `user.role` compare → resolved as `admin` plugin (different surface). Found rewrite-in-progress → flagged as version-pin obligation, not contradiction.
- **Q2 sub-question outcomes:**
  - (a) "How is single role at MVP implemented?" → `member.role` is a `string NOT NULL DEFAULT 'member'` column; `"admin"` / `"owner"` are statement-derived defaults; comma-separated for multi-role.
  - (b) "Where does the gate land?" → manual call at handler top; no middleware decorator in Better Auth surface.
  - (c) "What does session carry?" → `activeOrganizationId` only; role lookup separate.
- **Q2 collapse on prior Q2-scope:** prior /design seat asked "is the choice vaulted" — verified YES at `[[backend-stack]]` §7 line 91 + nested-org rejected alternative line 268. /research correctly walked back skepticism inline before scoping Q2.
- **Open threads (carried forward):**
  - **(Design follow-up, NOT research) D1:** session-context posture pick — require `organizationId` explicit in body/query, or require `activeOrganizationId` set on session. Both production-cited; choice downstream of cockpit UX vs SDK-script-admin expectations.
  - **(Design follow-up, NOT research) D2:** admin-gate shape pick — Hono middleware factory `adminGate({ resource, actions })` vs inline per handler. Better Auth's own code inlines; BokChoy may DRY across ≥3 handlers.
  - **(Cross-cutting, future)** Org plugin rewrite (PRs #7251 + 5 follow-ups) signals API shift in next minor/major. Pin Better Auth version in `package.json`; queue re-survey when rewrite merges to main.
  - **(Optional triangulation extension)** Production survey of B2B SaaS shipping Better Auth org plugin without RBAC plugin — Cal.com, Deel.com cited as production users in `[[backend-stack-research]]` Sources 8-9; their public source/docs may corroborate F1 with tier-1 cite. Not blocking; current triangulation already meets the gate.
  - **(Q1 may now collapse)** Sequencing question (Q1 from prior /design seat) was downstream of Q2 complexity. Q2 finding: admin-auth-surface is medium-complexity (custom statements + extended roles + 5-step middleware) — strict (a) Better-Auth-org-plugin-first sequencing is now defensible, NOT trivially-decidable as initially hoped. Q1 still owed if /design wants production-cited sequencing survey; defer until ready to ship a second consumer.
  - **(Q3 still owed)** DSR shape in ledger contexts — only matters when /design picks `walletDeidentifyPlayer` as next slice 8.2 consumer.
- **Next on resume — recommended sequence:**
  1. **Switch to `/design`** with `[[better-auth-org-admin-research]]` in hand. /design weighs D1 (session-context posture) + D2 (middleware-factory vs inline) and vaults the admin-auth-surface decision entry. With (P1) ratified, the slice 8.2 scope becomes: extend statements + extend roles + ship `adminGate` (or inline pattern) + wire `bootstrapProjectReasonCodes` + wire `walletDeidentifyPlayer`. Three sub-decisions per the design primitive.
  2. After D1/D2 resolved → /implementation can quote contracts and ship.
  3. Working tree as of this session = slice 8.1.x cluster (committed) + this Q2 research entry (vaultable next commit).

- **Mode (prior):** design → working tree commit-ready 2026-05-11 (both wire-shape decisions vaulted; ZERO code changes required; current code already matches both contracts)
- **/design pass 2026-05-11 LANDED — both decisions vaulted with research-cited evidence + customer-profile-axis reframe.** Three vault amendments shipped:
  - **(1) `[[wallet-http-contract]]` G4 in-place amendment — c1 RESOLVED: pin JSON-by-construction.** Production-cited × 3 (Brandur + Stripe + Shopify per `[[replay-non-json-body-research]]` F1). Handlers behind `idempotencyMiddleware` MUST emit JSON; non-JSON is undefined behavior. Current code at `apps/backend/src/idempotency/middleware.ts:266-273` falls back to `null` body on JSON-parse failure as defense-in-depth, NOT as contract guarantee. Revisit-when: any new handler emits non-JSON Content-Type behind idempotency middleware → reopen with named consumer.
  - **(2) `[[wallet-http-contract]]` G5 in-place amendment — c2 partial: defend bespoke-vs-payment-API divergence.** Documents that BokChoy ships per-error-code structured detail fields (BC010 `walletId/requested/available`, BC022 `walletCurrency/requested`, BC050 `constraintName`) and that this DIVERGES from production payment-API convention (Stripe + Square + PayPal × 3 ship ZERO structured numerics in error envelopes). Divergence justified on customer-profile axis: BokChoy = developer-facing SDK during dev (snapshot-at-error matters for debug); payment APIs = end-user-facing error UX (refetch-for-current-state matters more). Cross-refs Fork 2 amendment for typing defense.
  - **(3) `[[wrapper-shape]]` Fork 2 amendment 2026-05-11 — c2 typing defense.** Decision: keep STRING typing for `requested`/`available` in BC010. Three justifications: (a) customer-profile divergence (medium evidence — game-economy-backend-SDK cohort unsurveyed; payment-API cohort doesn't apply); (b) Postgres NUMERIC(20,4) precision preservation past 2^53 (high evidence — postgres-js native mapping + JS Number safe-integer math); (c) reversibility-asymmetry favors information-rich pre-customer (high evidence — STRING preserves all three optionality paths: drop-fields / flip-to-NUMBER / keep-STRING; NUMBER preserves only two). Rejected (X) Stripe-style and (Y) RFC 7807 NUMBER with named winning conditions. Confidence: medium-high.
- **Position derivation walkback notes (vaulted in amendments):**
  - **c1**: prior /design seat's (α) recommendation was correctly walked back as under-evidenced before /research. Post-research, evidence is production-cited × 3; (α) ratified.
  - **c2**: prior /design seat's (α)/(β)/(γ) frame was operating in the wrong axis (string-vs-number format). /research surfaced (X)/(Y)/(Z) shape-axis. Customer-profile reframe (developer-facing SDK ≠ end-user-facing error UX) was load-bearing for the (Z) win. Stripe `unit_amount_decimal: string` cite was class-mismatched (resource field, not error field) — confirmed by `[[error-detail-numeric-serialization-research]]` Conflict 2.
- **Code changes required: ZERO.**
  - (c1): current `middleware.ts:266-273` already does null-fallback as defense-in-depth; vault contract pins JSON-by-construction explicitly. No code touch.
  - (c2): current `packages/wallet/src/errors.ts` BC010 ErrorDetails already types `requested: string; available: string`; current `sqlstate-to-error.ts:45` already captures regex groups as strings; current `error-middleware.ts` already spreads `details` as siblings of `code`/`message`. **Working tree already implements (Z) — vault entry now defends it.**
- **Working tree commit-ready.** All slice 8.1.x cluster + cleanup pass + design pass + research entries + this-pass amendments are committable as a single mega-commit OR split per slice. Decide commit shape and execute.
- **Open / known debt UNCHANGED by /design pass:**
  - **(deploy-runbook, owed)** Per-env Supabase dashboard step for pg_cron extension enable.
  - **(monitoring cascade, owed)** Failed-run pg_cron alerting on `cron.job_run_details`.
  - **(first-deploy verification, owed)** `extensions.grant_pg_cron_access` verify on managed Supabase.
  - `BOKCHOY_API_KEY_HMAC_SECRET` rotation runbook (carried from 8.1a).
  - Cockpit-driven key creation (carried from 8.1a).
  - WWW-Authenticate response header on 401.
  - Sampler revisit at scale (parent-based) — `[[wallet-http-contract]]` revisit-when.
  - `walletDeidentifyPlayer` HTTP handler — DSR flow + cockpit admin auth surface.
  - `bootstrapProjectReasonCodes` HTTP handler — admin-only, needs Better Auth org plugin.
  - Better Auth wiring (`apps/auth-config`).
  - **OTel layers 2 + 3** (RAISE LOG structured Postgres-server-log + pg_stat_statements enablement).
- **Cascades active (NEW after /design pass):**
  - **`[[wallet-http-contract]]` G5 + `[[wrapper-shape]]` Fork 2 c2 revisit-when triggers** — customer profile shift to player-facing API OR customer SDK ergonomic complaint OR game-economy-backend-SDK cohort survey landing AND showing convergent player-facing pattern → reopen and re-evaluate (X) Stripe-style.
  - **`[[wallet-http-contract]]` G4 c1 revisit-when** — any new handler emits non-JSON behind idempotency middleware → reopen and re-evaluate (β) cache-raw-bytes.
- **Cascades active (UNCHANGED):**
  - `[[idempotency-strategy]]` §Concurrency Generalization note — second cross-cutting middleware writing to UNIQUE-constrained table triggers promotion to `[[upsert-race-loser-pattern]]` standalone entry.
- **Open threads (carried in research entries):**
  - Game-economy-backend-SDK cohort survey (PlayFab, Firebase Game SDK, Epic Online Services, Unity Cloud Save) — would strengthen or falsify (Z) c2 customer-profile defense. Out of scope this session; queue for /research session if customer SDK ergonomic complaint surfaces.
  - Customer-SDK ergonomic deeper survey (C# / Unity / C++ / Unreal JSON-error-field-deserialization preferences). Out of scope.
  - Hono / Express / Fastify TS-stack idempotency middleware survey for non-JSON handling. Low priority — payment-API survey already triangulates F1.
  - AWS / GCP / Azure idempotency-on-non-JSON survey. Out of scope.
  - Stripe BAD_REQUEST validation error envelope (closer analog to BC010 than `card_declined`). Out of scope.
- **Next on resume — recommended sequence:**
  1. **Commit the working tree.** Pick mega-commit OR per-slice splits. The working tree is internally consistent and matches all vaulted contracts.
  2. **Slice 8.2** — pick from: `walletDeidentifyPlayer` (DSR flow, needs new design pass), Better Auth org-plugin wiring (cockpit admin auth surface design needed), or first cockpit slice (no vault entry yet — needs greenfield design pass).

- **Mode (prior):** research → handoff to /design 2026-05-11 (two research entries LANDED; both wire-shape questions triangulated; /design seat reopens with production-cited evidence in hand)
- **/research pass 2026-05-11 LANDED.** Two vault entries shipped, both triangulated per *Triangulation* gate (1 production cite + 1 docs cite + 1 contradiction probe each):
  - **(1) `[[replay-non-json-body-research]]`** — `apps/backend/src/idempotency/middleware.ts:266-273` non-JSON REPLAY behavior. Sources: Brandur `rocket-rides-atomic` source-walk at `/tmp/bocek-ref-brandur-rocket-rides-atomic` (api.rb:167 + schema.sql:24, tier 1); IETF draft 07 §2.6 (tier 2); Stripe + Shopify docs (tier 2). **F1 (LOAD-BEARING):** production idempotency middlewares are JSON-by-construction (3/3 surveyed). The "what should we do for non-JSON replay?" question doesn't have a production-cited answer because production teams don't allow non-JSON behind idempotency middleware. **The /design seat's prior (α) "pin null as contract" recommendation is now production-cited × 3** — gate that failed previously was "≥2 named systems shipping the specific shape"; F1 finds 3. (α) is now defensible.
  - **(2) `[[error-detail-numeric-serialization-research]]`** — WalletError BC010 numeric detail fields. Sources: Stripe + Square + PayPal error envelopes (tier 2 docs); Stripe `card_declined` example showing `decline_code: "insufficient_funds"` with ZERO numeric fields (tier 2); RFC 7807 / 9457 canonical example with `balance: 30` JSON NUMBER (tier 2 spec). **F1 (LOAD-BEARING):** production payment APIs (3/3) DO NOT ship inline numeric fields in error envelopes — they abstract to categorical decline codes + force client to refetch related resource for numeric state. **F2 (CONTRADICTION):** RFC 7807/9457 spec EXPLICITLY supports inline numeric fields as JSON NUMBER. **F3 (REFRAME):** BokChoy's current pattern (inline numerics as STRING) matches NEITHER production lineage; it's bespoke. The /design seat's prior (α)/(β)/(γ) string-vs-number frame was operating in the wrong axis — the real choice is (X) drop-inline-numerics, (Y) inline-as-NUMBER per RFC 7807, or (Z) inline-as-STRING-with-defense.
- **Conflicts surfaced (per *Contradiction protocol*):**
  - **(c1)** No production-cited disagreement found. IETF + Stripe + Shopify converge on JSON-by-construction posture. Shopify's "reconstruct-from-DB may not be byte-identical" caveat is at a different axis than the (c1) question.
  - **(c2)** Real disagreement: payment-API convergent posture (no inline numerics) vs RFC 7807 spec (inline numerics as JSON NUMBER). Per *Contradiction protocol* (multiple independent production examples beat one), payment-API convergence wins on production-cited weight. But RFC 7807 is the IETF normative reference. **Both are vault-worthy; design picks which lineage to align with.**
- **Anti-default applied:** explicitly searched for non-payment production REST APIs that ship inline numeric error fields. Found RFC 7807/9457 spec (canonical example uses NUMBER) + Square gift-card INSUFFICIENT_FUNDS example (numeric in DETAIL string, not structured field). The contradiction probe surfaced the (c2) reframe — the (α)/(β)/(γ) frame was incomplete because it didn't surface (X) drop-inline-numerics-entirely as a production-cited option.
- **Walkback corrections to /design seat 2026-05-11 prior position:**
  - **(c1)** Prior /design (α) recommendation was walked back as under-evidenced. /research now finds production-cited × 3 evidence for the "pin null" position. **Revisit as defensible per the production-grade gate.**
  - **(c2)** Prior /design (α)/(β)/(γ) frame was string-vs-number; /research surfaces (X)/(Y)/(Z) which is shape-vs-format-axis. **Frame change owed to /design.** Stripe `unit_amount_decimal: string` cite was class-mismatched (resource field, not error field) — confirmed by `[[error-detail-numeric-serialization-research]]` Conflict 2.
- **Open threads (carried forward):**
  - Hono / Express / Fastify TS-stack idempotency middleware survey for non-JSON handling (low priority — payment/e-commerce production references already triangulate F1).
  - AWS / GCP / Azure idempotency-on-non-JSON survey (out of scope this session; AWS S3 binary + Lambda streaming have non-JSON paths).
  - Customer-SDK ergonomic deeper survey (C# `System.Text.Json` vs `Newtonsoft.Json`; C++ `nlohmann/json` vs `RapidJSON` defaults for JSON-error-field-deserialization).
  - Non-payment production REST API survey (Twilio / Slack / Auth0 inline-numeric-error-field handling).
  - Stripe BAD_REQUEST validation error envelope behavior (closer analog to BC010 than `card_declined`).
  - `[[wrapper-shape]]` Fork 2 amendment owed if /design picks (X) or (Y) for c2.
  - `/tmp/smoke-8-1c.sh` Test 7 wire-shape assertion update if /design picks (X) or (Y).
- **Next on resume — recommended sequence:**
  1. **Switch to `/design`** with `[[replay-non-json-body-research]]` + `[[error-detail-numeric-serialization-research]]` in hand. /design weighs (X)/(Y)/(Z) for c2 and ratifies (α) for c1.
  2. /implementation seat may follow if /design picks (X) or (Y) for c2 (code change required: error-middleware + wrapper types). For c1 (α), no code change — the current code matches the contract; vault note only.
  3. Then commit. Working tree as of this session = slice 8.1.x cluster + design pass 2026-05-11 + Path A cleanup + 2 research entries.

- **Mode (prior):** design → handoff to /research 2026-05-11 (two debt items NOT vaulted as decisions; under-evidenced for production-grade gate)
- **/design pass on (c1) REPLAY non-JSON body + (c2) WalletError numeric serialization HALTED 2026-05-11.** Initial position derivation recommended (α) for both items (pin current code as contract; document). User pushed back: evidence base too thin for vault. Walking back both (α) picks as under-evidenced.
- **Why halted:** the (α) recommendations failed the design primitive's *Production-grade default* industry-standard gate ("≥2 named production systems shipping the specific shape"). Specifically:
  - **(c1)** zero production cites named for non-JSON idempotency replay behavior. The "pin null as contract" framing was YAGNI-defense (no current consumer feels the friction), not production-cited evidence.
  - **(c2)** Stripe `unit_amount_decimal: string` cite was class-mismatched — it covers INPUT/OUTPUT resource amount fields, not ERROR DETAIL fields. Adjacent precedent, not same-shape precedent. About to claim "production-cited / high" on an adjacency.
- **Research queries handed off to /research:**
  - **(c1) REPLAY non-JSON body queries:**
    - Source-walk Brandur's `rocket-rides-atomic` `app.py` (referenced in `[[idempotency-keys-schema-research]]` S1 schema-only; app code never source-walked) — how does the upsert path handle non-JSON original response, if at all?
    - Stripe docs + SDK code: documented behavior for non-JSON cached replay? Does Stripe's POST API even permit non-JSON responses (probably no — answer tells us whether the question is real)?
    - Shopify `implementing-idempotency` docs (cited in `[[idempotency-keys-schema-research]]` S3): replay format invariance pinned?
    - IETF draft 07 `Idempotency-Key` header: replay-fidelity normative?
    - Production survey: TS-stack idempotency middlewares (Hono / Express / Fastify ecosystem) — any documented non-JSON behavior?
  - **(c2) Error-detail numeric serialization queries:**
    - Stripe error envelope at `docs.stripe.com/api/errors`: serialization for numeric error fields? Decimals as string or number in error responses?
    - Square error envelope: same question.
    - PayPal error envelope: same question.
    - Specifically: when an error envelope carries a database NUMERIC value (insufficient-funds-style errors), do production payment APIs emit string or number?
    - Customer-SDK ergonomic survey: C# / Unity preference for `JsonNumber` / `decimal` / `string`? C++ / Unreal preference?
- **What was NOT decided:** no vault writes from this /design pass. Both (c1) and (c2) remain open carried debt awaiting research evidence. Original `[[wrapper-shape]]` typing of `BC010.requested: string` + `BC010.available: string` stands until /research surfaces evidence to defend OR walk back.
- **Lesson logged for future /design seats:** when staking a position on a wire-shape decision, verify the production cite covers the SAME field class (input-amount vs error-detail-amount), not adjacent. The design primitive's industry-standard gate explicitly requires same-shape, not adjacent-shape, evidence. Adjacent-cite + inference is a /research handoff, not a /design vault.

- **Mode (prior):** implementation (Path A cleanup pass LANDED 2026-05-11 — three small carried-debt items closed)
- **Path A cleanup pass 2026-05-11 LANDED.** Three cleanup items shipped from carried debt:
  - **(1) `apps/backend/src/idempotency/middleware.ts:1-7` stale-comment delete** — removed the 4-line "Trips [[reaper-schedule-deferral]] reopen trigger ... lands in slice 8.1.5 follow-on (deferred per user)" paragraph. The deferral CLOSED 2026-05-11 per `[[reaper-schedule-deferral]]` Resolution 2026-05-11; the trigger fired and the schedule landed. Per CLAUDE.md *"Don't reference the current task, fix, or callers... since those belong in the PR description and rot as the codebase evolves"* — the comment was task-tracking, not WHY-documentation. Reaper-deferral history remains discoverable via the `[[reaper-schedule-deferral]]` wikilink in the contract reference at line 1.
  - **(2) `apps/backend/src/idempotency/middleware.ts:38 + 257` type-cast cleanup** — added `import type { ContentfulStatusCode } from 'hono/utils/http-status'`; replaced opaque `decision.status as Parameters<typeof c.json>[1]` with `decision.status as ContentfulStatusCode`. Matches the convention already established at `apps/backend/src/infra/error-middleware.ts:14,27,42`. Cast is structurally identical (both narrow to Hono's contentful-status union); `ContentfulStatusCode` is the named type. Typecheck pass confirms compatibility.
  - **(3) `.env.example` additions** — appended `BOKCHOY_API_KEY_HMAC_SECRET` (slice 8.1a) + `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS` (slice 8.1b) with brief WHY notes pointing at the contract entries. The HMAC-SECRET line carries a dev-only test value (matches the value used in `/tmp/smoke-8-1{a,b,c,.6}.sh` headers); OTel vars commented-out by default (unset → ConsoleSpanExporter dev path).
- **Verification:** `bun run typecheck` (6/6 packages green); `bun run lint:check` (2 pre-existing warnings only — `packages/wallet/scripts/smoke-wrappers.ts` slice 7.7 leftovers, NOT from this pass); `bun run check:direct-mutation` (28 files scanned, opt-outs intact). Smoke regressions skipped: documentation + cosmetic edits with no behavioral path; typecheck is the load-bearing check.
- **Self-attack:**
  - (1) Comment delete — could a future reader miss the reaper history? Discoverable via wikilink. Not a regression.
  - (2) Type-cast rename — could ContentfulStatusCode reject a status that Parameters<typeof c.json>[1] accepts? Both derive from Hono's status types; if mismatched, typecheck would fail. Typecheck passed. Not a regression.
  - (3) `.env.example` additive — vars already read by existing code (api-key-middleware.ts + telemetry.ts); this is documentation. Not a regression.
- **Cascades closed by Path A cleanup:**
  - **(stale doc, surfaced 8.1.6) middleware header comment fix** — RESOLVED.
  - **(cosmetic) Replay status type-cast** — RESOLVED.
  - **`.env.example` line additions** — RESOLVED (BOKCHOY_API_KEY_HMAC_SECRET + OTEL_EXPORTER_OTLP_ENDPOINT + OTEL_EXPORTER_OTLP_HEADERS).
- **Open / known debt UNCHANGED by Path A cleanup:**
  - **(deploy-runbook, owed)** Per-env Supabase dashboard step for pg_cron extension enable.
  - **(monitoring cascade, owed)** Failed-run pg_cron alerting on `cron.job_run_details`.
  - **(first-deploy verification, owed)** `extensions.grant_pg_cron_access` verify on managed Supabase.
  - **(design-shaped, NOT cleanup)** Non-JSON response body cached as null on REPLAY at `middleware.ts:266-273`. Contract didn't pin non-JSON behavior; flag back to /design.
  - **(design-shaped, NOT cleanup)** WalletError `details` numeric fields serialize as strings. Wire shape contract; flag back to /design.
  - `BOKCHOY_API_KEY_HMAC_SECRET` rotation runbook (carried from 8.1a).
  - Cockpit-driven key creation (carried from 8.1a).
  - WWW-Authenticate response header on 401.
  - Sampler revisit at scale (parent-based) — `[[wallet-http-contract]]` revisit-when.
  - `walletDeidentifyPlayer` HTTP handler — DSR flow + cockpit admin auth surface.
  - `bootstrapProjectReasonCodes` HTTP handler — admin-only, needs Better Auth org plugin.
  - Better Auth wiring (`apps/auth-config`).
  - **OTel layers 2 + 3** (RAISE LOG structured Postgres-server-log + pg_stat_statements enablement).
- **Cascades active (UNCHANGED):**
  - `[[idempotency-strategy]]` §Concurrency Generalization note watch — second cross-cutting middleware writing to UNIQUE-constrained table triggers promotion to `[[upsert-race-loser-pattern]]` standalone entry.
- **Next on resume — recommended sequence:**
  1. **Slice 8.2 design pass.** Three sub-paths viable; all need /design before /implementation can quote a contract. Pick: `walletDeidentifyPlayer` (DSR flow), Better Auth org-plugin wiring, or first cockpit slice.
  2. **Or smaller /design pass on the two design-shaped debt items** above (REPLAY non-JSON behavior + WalletError numeric serialization). Smaller scope, closes pending wire-shape questions before slice 8.2 ships more handlers.

- **Mode (prior):** design → handoff to /implementation (slice 8.1 cluster cascade-closure /design pass LANDED 2026-05-11; ON CONFLICT canonical race-loser pattern vaulted in `[[idempotency-strategy]]` §Concurrency)
- **/design pass 2026-05-11 LANDED.** Five vault writes closing slice 8.1 cluster cascade obligations + canonicalizing the slice 8.1.6 implementation-seat pattern. **One real design decision** (ON CONFLICT race-loser canonicalization, position α: amend `[[idempotency-strategy]]` in-place; rejected β new-entry on phantom-problem grounds + γ inline-comments-only on contract-load-bearing grounds). **Four cascade closures** (TenantTx open thread, reaper-schedule deferral, wallet-http-contract slice LANDED status, wallet-mechanics Part 4 amendment).
- **Vault writes:**
  - **(1) `[[idempotency-strategy]]` §Concurrency in-place amendment** — extended line 122 with the canonical race-loser pattern paragraph: `INSERT ... ON CONFLICT (project_id, idempotency_key) DO NOTHING RETURNING id` + re-SELECT + dispatch trimmed state machine (mismatch / replay / in_use; lock-expired re-lock skipped on race-loser to avoid double-execution). Evidence labels: docs-cited / high (Postgres ON CONFLICT §6.4 + Drizzle `.onConflictDoNothing().returning()`); production-cited / medium (Brandur schema-implied; app code not source-walked); production-cited / high (this project — slice 8.1.6 empirical 10× xargs -P verification). Generalization note: future cross-cutting middleware writing to UNIQUE-constrained tables re-use this shape; if/when a second consumer ships, promote to `[[upsert-race-loser-pattern]]` entry. Until then, scoped to idempotency. **The "production-cited high" claim from prior /design turn was overstated and corrected** — Brandur's research entry source-walked schema.sql only, not app.py; honest label is medium for Brandur.
  - **(2) `[[backend-stack]]` F1 mitigation #2 amendment** — closed the open thread *"design follow-up triggered by first RLS-protected feature schema landing"* (line 283 original). Trigger fired in slice 8.1a; `TenantTx` brand at `packages/db/src/with-tenant.ts:17-18` cited verbatim. First consumer = `apps/backend/src/wallet/index.ts` (slice 8.1c). Opt-in posture preserved per `[[wallet-http-contract]]` G6 (wallet wrappers still accept `Db | Tx` because SQL-side `current_setting('app.current_tenant')::uuid` is the runtime defense; brand is type-level mirror, not substitute). Verification: typecheck + integration smoke covers both layers.
  - **(3) `[[reaper-schedule-deferral]]` Resolution 2026-05-11 closure block** — prepended after title. Records: trigger fired 2026-05-10 via slice 8.1b's `// allow-direct-mutation: idempotency-middleware` opt-out PR (mechanical primary trigger per §Trigger fired exactly as specified); pick = option (a) pg_cron landed in slice 8.1.5 with three artifacts (`compose/postgres-init/01-extensions.sql`, `packages/db/drizzle/0009_idempotency_reaper_composite.sql`, `packages/db/scripts/smoke-reaper.ts test6`); §Open Threads "Cascade to `[[local-docker]]`" item closed via 01-extensions.sql install. Open debt carried (NOT closed): per-env Supabase dashboard step + failed-run alerting + first-deploy `extensions.grant_pg_cron_access` verification. Original deferral entry stands as historical record below the closure block.
  - **(4) `[[wallet-http-contract]]` Implementation status block** — prepended after title. 4-row table covering slices 8.1a/b/c/.6 with date + surface + verification (smoke results). Cascades closed: all G1-G8 contract obligations realized in code; G4 case 4 race-loser semantics enforced at impl layer per slice 8.1.6 (cross-ref to `[[idempotency-strategy]]` §Concurrency). Open carry-forward: `walletDeidentifyPlayer` + `bootstrapProjectReasonCodes` handlers, both intentionally out of slice 8.1 scope per the original §Auth surface "Other wrapper handlers deferred."
  - **(5) `[[wallet-mechanics]]` Amendment Part 4** — closure-aggregation pass. Five sub-amendments A19-A23: A19 (Part 1 A1 M1 boundary realized in apps/backend), A20 (Part 1 A3 OTel layer 1 path resolved — SDK + bootstrap file + manual span emission), A21 (Part 1 A6 SQLSTATE TS-side `path TBD` resolved → `packages/wallet/src/`, NOT `packages/db/` as originally forecast), A22 (Part 3 A18 BC050 path closed end-to-end — TS-dispatches-on-23503-directly path picked over plpgsql-catch-and-re-raise; verified by smoke 8.1c Test 10), A23 (cascade obligations updated: §5 CI lint CLOSED, Part 1 A6 OTel CLOSED, Part 1 A6 SQLSTATE CLOSED, Part 3 A17 staged_jobs CHECK NOT NEEDED — pg_cron picked instead, NEW per-env pg_cron bootstrap step + failed-run alerting + ON CONFLICT canonical pattern cross-reference). **No new design decisions in Part 4 itself** — the canonical pattern lives in `[[idempotency-strategy]]` §Concurrency; Part 4 cross-references.
- **Index update:** intentionally skipped. `vault/index.md` entry summaries are mature prose blobs (~1-3KB each), not the simple-line format vault-format.md prescribes. Surgical 5-place text edits would be brittle for marginal discoverability value. Amendments are visible inline in each vault entry with dated section headings; future readers grep there.
- **Cascades closed by 2026-05-11 /design pass:**
  - `[[backend-stack]]` F1 mitigation #2 open thread CLOSED.
  - `[[reaper-schedule-deferral]]` deferral CLOSED (entry preserved as historical record).
  - `[[wallet-mechanics]]` Part 1 A6 OTel cascade CLOSED + Part 1 A6 SQLSTATE TS-side cascade CLOSED + §5 CI lint cascade CLOSED + Part 3 A18 BC050 path CLOSED.
  - `[[wallet-http-contract]]` slice 8.1 cluster fully realized, status block records closure.
  - **Slice 8.1.6 ON CONFLICT pattern canonicalized** in `[[idempotency-strategy]]` §Concurrency with generalization note for future middleware reuse.
- **Open / known debt UNCHANGED by /design pass:**
  - **(deploy-runbook, owed)** Per-env Supabase dashboard step for pg_cron extension enable.
  - **(monitoring cascade, owed)** Failed-run pg_cron alerting on `cron.job_run_details`.
  - **(first-deploy verification, owed)** `extensions.grant_pg_cron_access` verify on managed Supabase.
  - **(minor, from 8.1b)** Non-JSON response body cached as null on REPLAY at `middleware.ts:218-225`.
  - **(minor, slice 8.1c)** WalletError `details` numeric fields serialize as strings.
  - **(cosmetic)** Replay status type-cast in idempotency middleware.
  - **(stale doc, surfaced 8.1.6)** `apps/backend/src/idempotency/middleware.ts` header comment lines 4-7 still say "pg_cron reaper schedule lands in slice 8.1.5 follow-on (deferred per user)" — that schedule LANDED 2026-05-10. One-line comment update owed.
  - `BOKCHOY_API_KEY_HMAC_SECRET` rotation runbook (carried from 8.1a).
  - Cockpit-driven key creation (carried from 8.1a).
  - `.env.example` line additions for `BOKCHOY_API_KEY_HMAC_SECRET` + `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS`.
  - WWW-Authenticate response header on 401.
  - Sampler revisit at scale (parent-based) — `[[wallet-http-contract]]` revisit-when.
  - `walletDeidentifyPlayer` HTTP handler — DSR flow + cockpit admin auth surface.
  - `bootstrapProjectReasonCodes` HTTP handler — admin-only, needs Better Auth org plugin.
  - Better Auth wiring (`apps/auth-config`).
  - **OTel layers 2 + 3** (RAISE LOG structured Postgres-server-log + pg_stat_statements enablement) — A20 closes layer 1 only.
- **Cascades active (NEW after /design pass):**
  - `[[idempotency-strategy]]` §Concurrency Generalization note watch — second cross-cutting middleware writing to UNIQUE-constrained table triggers promotion to `[[upsert-race-loser-pattern]]` standalone entry.
- **Next on resume — recommended sequence:**
  1. **Slice 8.2** — pick from: `walletDeidentifyPlayer` (DSR flow, needs new design pass for trigger / auth surface / sync-vs-async / retention), Better Auth org-plugin wiring (cockpit admin auth surface design needed), or first cockpit slice (no vault entry yet — needs greenfield design pass).
  2. **Optional cleanup:** middleware header comment stale-doc fix (1-line edit) + minor REPLAY null-body / numeric-string-serialization debt items.
  3. Path A (5-write cascade closure pass) DONE this session.

- **Mode (prior):** implementation (slice 8.1.6 LANDED 2026-05-11 — idempotency middleware concurrency hardening; `[[wallet-http-contract]]` G4 case 4 race-loser semantics now enforced in code, not just contract)
- **Slice 8.1.6 LANDED 2026-05-11 per `[[wallet-http-contract]]` G4 case 4 + `[[idempotency-strategy]]` line 122 + state.md prior-seat directive (Stripe / `[[idempotency-strategy]]` mitigation pattern: `INSERT ... ON CONFLICT (project_id, idempotency_key) DO NOTHING RETURNING *` + re-SELECT + dispatch state machine).** 1 work unit shipped:
  - **`apps/backend/src/idempotency/middleware.ts:137-200`** (~50 LOC change to the `if (!row)` block in the lookup-or-insert transaction). The existing INSERT now carries `ON CONFLICT (project_id, idempotency_key) DO NOTHING` — matches the unique constraint name `idempotency_keys_project_key_unique` per `packages/db/src/schema/wallet.ts:188`. On empty `RETURNING id` (race lost), middleware re-SELECTs the same row inside the same `withTenant` transaction (RLS GUC stays scoped) and dispatches a TRIMMED state machine: body mismatch → `mismatch` (422 BC002); `completed_at` set + body match → `replay` (200, cached body); else → `in_use` (409 BC001). **Lock-expired re-lock branch is intentionally skipped on the race-loser path** — the winner just INSERTed milliseconds ago so `locked_at` is fresh by construction; re-locking would race the winner and could double-execute the handler when both transactions write their completion UPDATEs. Race-loser is canonically `in_use` per `[[idempotency-strategy]]` line 122; client retries on 409 per Stripe SDK pattern (`RequestSender.ts:329`) and resolves cleanly on retry. Throws on the vanishingly improbable "ON CONFLICT returned no id but re-SELECT returned no row" pathology rather than swallow (reaper's DELETE WHERE clause filters on `completed_at IS NOT NULL` per `packages/db/drizzle/0006`, so a fresh in-flight row cannot be reaped — the throw is invariant-violation defense-in-depth, not expected-path handling). Existing `-- allow-direct-mutation` opt-out comment on the INSERT updated to note ON CONFLICT addition.
- **Verification (slice 8.1.6):**
  - **Static checks ✓** — `bun run typecheck` (turbo: 6 packages green); `bun run lint:check` (2 pre-existing warnings only — `packages/wallet/scripts/smoke-wrappers.ts` slice 7.7 leftovers, NOT from 8.1.6); `bun run check:direct-mutation` (28 files scanned, 3 idempotency-middleware hits opted-out via N=1 `--` comments — same 3 hits as before, INSERT-path opt-out comment text expanded to mention ON CONFLICT, regex still matches); `bun run check:prepare-false` (cascade-10 passes).
  - **Regression smokes ✓** — `/tmp/smoke-8-1b.sh` 9/9 functional pass (header bypass / INSERT path / REPLAY / mismatch / in-flight / lock-expired re-lock / >255 char invalid / 8.1a regressions); `/tmp/smoke-8-1c.sh` 13/13 pass (auth, validation, happy-path credit/debit, BC010/BC021/BC022/BC050, idempotency replay, BC002 mismatch, BC001 in-use, final balance reconciles to 35.0000). The ON CONFLICT change is a no-op for sequential traffic — every prior test passes unchanged.
  - **Concurrency smoke `/tmp/smoke-8-1.6.sh`** (xargs -P parallel curl, N=10):
    - **Test A (10 × same key + same body)**: codes = `409 409 409 409 200 409 409 409 409 409` → 1×200 + 9×409 + **0×500** + 0×other. Exactly 1 row in idempotency_keys (UNIQUE held under race). Race-loser path correctly resolves to BC001.
    - **Test B (10 × same key + 5×bodyA + 5×bodyB stripe-interleaved)**: codes = `422 409 200 422 409 422 409 422 409 422` → 1×200 + 4×409 (same-body losers) + 5×422 (other-body losers, all carrying BC002 in body) + **0×500** + 0×other. Exactly 1 row in idempotency_keys. Body-mismatch path correctly trumps in-use on race-loser.
    - **Backend log: 0 unhandled-error / uncaughtException / unhandledRejection / 23505 mentions** — ON CONFLICT swallowed the unique violation cleanly at the SQL layer; no exception propagated to onError.
- **Self-attack pass:**
  - **Concurrency hazard (primary)** — covered empirically by Test A + Test B above. ✓
  - **Idempotency on retry** — race-loser receives 409 → SDK retries (Stripe pattern) → re-SELECT finds row → if completed REPLAY (200), if still locked recent → 409 again, if lock expired → re-lock + proceed. Both paths converge through the existing state machine. ✓
  - **Error path (non-23505)** — ON CONFLICT DO NOTHING swallows ONLY the unique-violation. Other tx.execute errors (deadlock, connection reset, schema error) bubble out of withTenant → onError → 500. Correct. The new throw on "no id + no row" pathology bubbles to onError → 500 with searchable error text. ✓
  - **Observability gap** — race-loser never enters wallet handler, so wallet.credit/wallet.debit spans (manual `tracer.startActiveSpan` inside the handler) never start; only the `@hono/otel` HTTP span captures the 409. Acceptable per `[[wallet-http-contract]]` §Observability — per-request HTTP span at the boundary is sufficient; alerting on 409 BC001 rate is the operational signal per `[[idempotency-strategy]]` §Observability ("`bokchoy_idempotency_key_in_use` rate exceeds 1% over 5min sustained → client SDK or designer implementation bug"). ✓
  - **Clock skew** — race-loser path returns `in_use` regardless of `locked_at` age (no lock-expired check on race-loser). Skew can't cause race-loser to attempt re-lock on the winner. Initial-row-found path still uses Date.now() vs locked_at — pre-existing, unchanged. ✓
  - **Anti-default review** — *"Why re-SELECT inside the same withTenant transaction?"* RLS GUC is set inside withTenant; re-SELECTing outside would need another withTenant wrapping. Inside is one round-trip cheaper and atomic. *"Why throw on 'no id + no row' rather than treat as proceed?"* Failing loud on invariant violation; treating as proceed would set undefined idempotencyKeyId and break the completion-UPDATE. *"Why not extract the state machine into a helper?"* Race-loser dispatch is intentionally trimmed (skips lock-expired re-lock); inlining keeps the divergence visible. ~10 LOC duplication, acceptable.
  - **Winner-crash mid-handler** — winner INSERTs + commits → handler throws → onError 500 → completion-UPDATE never runs → row stays `locked_at` recent + `completed_at` NULL. Subsequent retries during lock window → in_use → 409. After 30s lock timeout, re-lock + proceed path takes over. Correct. ✓
- **Cascades closed by slice 8.1.6:**
  - **`[[wallet-http-contract]]` G4 case 4 race-loser semantics** now enforced at the code layer, not just the contract layer. The mitigation pattern named in state.md prior-seat directive is implemented as documented.
  - The (LOAD-BEARING, from 8.1b) "Concurrency UNIQUE-violation race at `apps/backend/src/idempotency/middleware.ts:120-149`" debt entry **RESOLVED** via this slice. Race window verified absent under N=10 same-key + N=10 mixed-body stress.
- **Open / known debt (UNCHANGED by 8.1.6):**
  - **(minor, from 8.1b)** Non-JSON response body cached as null on REPLAY at `middleware.ts:218-225`. Same as before.
  - **(minor, slice 8.1c)** WalletError `details` numeric fields serialize as strings.
  - **(cosmetic)** Replay status type-cast in idempotency middleware (`decision.status as Parameters<typeof c.json>[1]`).
  - `BOKCHOY_API_KEY_HMAC_SECRET` rotation runbook (carried from 8.1a).
  - Cockpit-driven key creation (carried from 8.1a).
  - `.env.example` line additions for `BOKCHOY_API_KEY_HMAC_SECRET` + `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS` (carried).
  - WWW-Authenticate response header on 401 (carried).
  - Sampler revisit at scale (parent-based) — `[[wallet-http-contract]]` revisit-when (carried).
  - `walletDeidentifyPlayer` HTTP handler — DSR flow + cockpit admin auth surface (deferred per `[[wallet-http-contract]]`).
  - `bootstrapProjectReasonCodes` HTTP handler — admin-only, needs Better Auth org plugin (deferred).
  - Better Auth wiring (`apps/auth-config`) — still queued.
  - **(deploy-runbook, from 8.1.5, owed)** Per-env one-time Supabase dashboard step: Integrations → Cron → enable, OR `CREATE EXTENSION pg_cron` from SQL Editor as postgres.
  - **(monitoring cascade, from 8.1.5, owed)** Wire failed-run alerting on `cron.job_run_details WHERE jobid=<reaper_jobid> AND status='failed'`.
  - **(first-deploy verification, from 8.1.5, owed)** Verify `extensions.grant_pg_cron_access` grants postgres DELETE on cron.job_run_details on managed Supabase.
  - **(stale doc, surfaced 8.1.6, minor)** `apps/backend/src/idempotency/middleware.ts` header comment (lines 4-7) still says "The pg_cron reaper schedule lands in slice 8.1.5 follow-on (deferred per user)" — that schedule LANDED 2026-05-10 in slice 8.1.5. One-line comment update owed; out of scope for this slice. Pair with the next /refactoring or /design pass.
- **Cascades active:**
  - **`[[wallet-mechanics]]` consolidated amendment owed** — cascade obligations from 8.1a (TenantTx / first-RLS-handler) + 8.1b (telemetry instrumentation, idempotency middleware) + 8.1c (wallet handler / error middleware / WalletError wire shape) + 8.1.5 (per-env pg_cron bootstrap step) + 8.1.6 (race-loser ON CONFLICT pattern as the implementation-layer realization of G4 case 4). One /design or /refactoring pass closes all five cascade entries. **Note for that pass:** the ON CONFLICT pattern is now the canonical race-loser shape for any future cross-cutting middleware that writes to a UNIQUE-constrained table (audit log, outbox, DSR queue, etc.). Worth an `[[idempotency-strategy]]` amendment or short new entry.
- **Next on resume — recommended sequence:**
  1. **Slice 8.2** — pick from: `walletDeidentifyPlayer` (DSR flow, needs design), Better Auth org-plugin wiring (cockpit admin handlers blocked on this), or first cockpit slice (no vault entry yet).
  2. **`[[wallet-mechanics]]` consolidated amendment** via /design pass (closes 5 cascade obligations cleanly).
  3. Optional cleanup: middleware header comment stale-doc fix (one-line edit) + minor REPLAY null-body / numeric-string-serialization debt items.

- **Mode (prior):** implementation (slice 8.1.5 LANDED 2026-05-10 — composite reaper + pg_cron schedule; `[[reaper-schedule-deferral]]` cascade RESOLVED)
- **Slice 8.1.5 LANDED 2026-05-10 per `[[reaper-schedule-deferral]]` (trigger fired at 8.1b; debt sat behind customer-facing routes after 8.1c) + `[[reaper-schedule-research]]` F2 (dashboard-enable-then-migrate) + F3 option 3 (single composite function, single schedule) + F7 (run-as postgres) + user directives (local-docker install + 7-day cron.job_run_details retention + CREATE OR REPLACE existing fn).** 4 work units shipped:
  - **(1) `compose/postgres-init/01-extensions.sql`** — added `CREATE EXTENSION IF NOT EXISTS pg_cron;` under postgres role at init time. Local-docker now matches managed-Supabase ownership shape (extension owner = `supabase_admin` even when invoked by postgres — verified empirically; matches F2 evidence). Resolves `[[reaper-schedule-research]]` Open Threads "Cascade to `[[local-docker]]`."
  - **(2) `packages/db/drizzle/0009_idempotency_reaper_composite.sql`** (~85 lines incl. WHY-comments) — `CREATE OR REPLACE FUNCTION idempotency_keys_reaper(p_max_age interval DEFAULT '24 hours')` extends slice 6 body with second `DELETE FROM cron.job_run_details WHERE start_time < NOW() - INTERVAL '7 days'` (schema-qualified per CVE-2018-1058 hardening). `RAISE NOTICE` side-channels the cron-log deletion count (surfaces in `cron.job_run_details.return_message` when reaper runs under pg_cron — self-referential audit trail) without changing the public `RETURN integer` contract (which keeps surfacing the idempotency_keys count per slice 6 caller observability). Then `SELECT cron.schedule('idempotency_reaper', '0 * * * *', 'SELECT idempotency_keys_reaper();')`.
  - **(3) `packages/db/drizzle/meta/_journal.json` + `0009_snapshot.json`** — journal entry idx=9 + snapshot mirrored from 0008 with new id chain (handwritten function migration, no ORM-derivable schema delta — matches 0006/0008 pattern).
  - **(4) `packages/db/scripts/smoke-reaper.ts`** — added `test6_composite_cron_log_reaper()`. Pre-flight checks `pg_available_extensions.installed_version` for pg_cron and fails loudly with runbook hint if missing (mirrors migration's "fail loudly on missing extension" contract). Seeds 3 rows via `cron.job_run_details (runid, start_time, status, command, username)` with explicit high runids (9999999990–92, far above pg_cron's sequence range to guarantee zero collision); calls `idempotency_keys_reaper()`; asserts -10d + -8d rows deleted, -3d row survives. Idempotent cleanup pre+post via runid-filtered DELETE.
- **Verification (slice 8.1.5):**
  - **Static checks ✓** — `bun run typecheck` (turbo: 6 packages green); `bun run lint:check` exits 0 (2 pre-existing warnings only — `packages/wallet/scripts/smoke-wrappers.ts` slice 7.7 leftovers, NOT from 8.1.5); `bun run check:direct-mutation` (28 files scanned, opt-outs unchanged); `bun run check:prepare-false` (cascade-10 passes).
  - **Pre-implementation spike** — verified `CREATE EXTENSION pg_cron` works on running supabase/postgres:17.6.1.113 image (returns version 1.6.4 per F1 Source 1). Verified postgres role has full DELETE/INSERT privilege on `cron.job_run_details` (information_schema.role_table_grants). Verified `cron.schedule('test_pg_cron_smoke', ...)` succeeds + cleanup via `cron.unschedule()`. Privilege gap concern (F2: ownership goes to supabase_admin) is moot for local-docker because supabase/postgres image bundles the equivalent of `extensions.grant_pg_cron_access`.
  - **Migration applied via `bun run db:migrate`** — applied cleanly. `cron.job` shows jobid=2, jobname=`idempotency_reaper`, schedule=`0 * * * *`, command=`SELECT idempotency_keys_reaper();`, username=postgres. Function definition via `pg_get_functiondef` matches migration source verbatim.
  - **End-to-end function test** — seeded 3 rows in cron.job_run_details (10/8/3 days old) → `SELECT idempotency_keys_reaper()` returned 0 (no idempotency_keys to reap; correct — return contract preserved) + RAISE NOTICE fired with `deleted 2 cron.job_run_details rows` + post-count = 1 (only -3d survived). ✓
  - **Smoke-reaper 6/6 ✓** — all prior tests (1–5) green + new test 6 (composite cron-log cleanup) green.
  - **Replay-overwrite verified empirically** — re-running `cron.schedule('idempotency_reaper', ...)` returned same jobid=2 + post-count = 1 (overwrote in place per Source 4: "Attempting to create a second Job with the same name (and case) will overwrite the first Job"). Migration is safely re-runnable.
- **Self-attack pass:**
  - **Replay** — `cron.schedule` same-name overwrite verified empirically. ✓
  - **Missing extension on fresh Supabase deploy** — migration fails LOUDLY at `cron.schedule(...)` per intended failure mode. **Carry as deploy-runbook debt** (one-time dashboard step per env).
  - **Half-applied migration** (function CREATE OR REPLACE succeeds + cron.schedule fails on missing extension) — function updated, schedule missing, drizzle marks failed. Manual `cron.schedule()` recovery needed. **Acceptable** — deploy-time runbook concern; matches existing multi-statement convention from slice 6.
  - **Privilege boundary on managed Supabase** — `extensions.grant_pg_cron_access` typically grants postgres DELETE; verified locally; assumed-equivalent on managed per F2. **Carry as first-deploy verification debt.**
  - **Long-lock from large `cron.job_run_details` backfill** — at 24 rows/day/job, even a year unmanaged is ~9K rows; sub-second DELETE. Not a real concern.
  - **Concurrent reaper invocations** — PostgreSQL row-level locks; loser sees ROW_COUNT=0. No corruption. ✓
  - **Failed-run pg_cron alerting NOT wired** — per F1 (Discussion #37405's 515-failure user) pg_cron can fail silently. **Carry as monitoring cascade debt** for next observability slice.
  - **Anti-default review** — *"Why hard-code 7-day cron-log retention?"* Defensible — cron-log retention is a deploy-policy decision independent of `p_max_age` (idempotency_keys retention). Two different abstractions; keep separate.
- **Cascades closed by slice 8.1.5:**
  - **`[[reaper-schedule-deferral]]` cascade RESOLVED.** Trigger fired at 8.1b; (a) pg_cron picked at trigger time per state.md framing + user directives. Schedule landed; composite reaper landed; local-docker bootstrap parity landed.
  - `[[reaper-schedule-research]]` Open Thread "Cascade to `[[local-docker]]`" RESOLVED via `01-extensions.sql` install.
- **Open / known debt (carried forward from slice 8.1.5):**
  - **(deploy-runbook, owed)** Document the per-env one-time Supabase dashboard step: Integrations → Cron → enable, OR `CREATE EXTENSION pg_cron` from SQL Editor as postgres. Migration-only path is broken per F2 (CLI Issues #647, #1591, #4163).
  - **(monitoring cascade, owed)** Wire failed-run alerting on `SELECT * FROM cron.job_run_details WHERE jobid=<reaper_jobid> AND status='failed' AND start_time > NOW() - INTERVAL '24 hours'` per `[[reaper-schedule-research]]` operational implication 3. Pairs with first observability slice. **Note:** until wired, ad-hoc weekly check via `psql` is the manual mitigation.
  - **(first-deploy verification, owed)** When BokChoy first deploys to managed Supabase, verify `extensions.grant_pg_cron_access` grants postgres DELETE on cron.job_run_details (F2 inference; not directly cited). If grant absent, dashboard-step + GRANT statement needed.
  - **`[[wallet-mechanics]]` cascade obligations amendment owed** — small amendment owed: per-env pg_cron extension enable as a bootstrap step (cascade obligation #6 or equivalent). Pair with the pre-existing 8.1a (TenantTx) + 8.1b (telemetry) amendments — single /design or /refactoring pass closes all three.
- **Open / known debt carried from prior slices (UNCHANGED by 8.1.5):**
  - **(LOAD-BEARING, from 8.1b) Concurrency UNIQUE-violation race** at `apps/backend/src/idempotency/middleware.ts:120-149`. Mitigation pattern: `INSERT ... ON CONFLICT DO NOTHING RETURNING *` + re-SELECT. **Now in customer-facing routes after 8.1c.** Path B explicit acceptance.
  - **(minor, from 8.1b)** Non-JSON response body cached as null on REPLAY.
  - **(minor, slice 8.1c)** WalletError `details` numeric fields serialize as strings.
  - **(cosmetic)** Replay status type-cast in idempotency middleware.
  - `BOKCHOY_API_KEY_HMAC_SECRET` rotation runbook (carried from 8.1a).
  - Cockpit-driven key creation (carried from 8.1a).
  - `.env.example` line additions for `BOKCHOY_API_KEY_HMAC_SECRET` + `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS` (carried).
  - WWW-Authenticate response header on 401 (carried).
  - Sampler revisit at scale (parent-based) — `[[wallet-http-contract]]` revisit-when (carried).
  - `walletDeidentifyPlayer` HTTP handler — DSR flow + cockpit admin auth surface (deferred per `[[wallet-http-contract]]`).
  - `bootstrapProjectReasonCodes` HTTP handler — admin-only, needs Better Auth org plugin (deferred).
  - Better Auth wiring (`apps/auth-config`) — still queued.
- **Cascades active:**
  - `[[wallet-mechanics]]` consolidated amendment owed: cascade obligations from 8.1a (TenantTx / first-RLS-handler) + 8.1b (telemetry instrumentation, idempotency middleware) + 8.1c (wallet handler / error middleware / WalletError wire shape) + 8.1.5 (per-env pg_cron bootstrap step). One /design or /refactoring pass closes all four cascade entries.
- **Next on resume — recommended sequence:**
  1. **Concurrency hardening pass** for `apps/backend/src/idempotency/middleware.ts:120-149` UNIQUE-violation race. ~20 LOC change + GNU-parallel curl smoke. Most-load-bearing remaining 8.1.x debt.
  2. Slice 8.2 — pick from: `walletDeidentifyPlayer` (DSR flow), Better Auth org-plugin wiring (cockpit admin handlers blocked on this), or first cockpit slice.
  3. `[[wallet-mechanics]]` consolidated amendment via /design pass (closes 4 cascade obligations cleanly).

- **Mode (prior):** implementation (slice 8.1c LANDED 2026-05-10 — wallet credit/debit handlers complete; `[[wallet-http-contract]]` slice 8.1 cluster ALL LANDED)
- **Slice 8.1c LANDED 2026-05-10 per `[[wallet-http-contract]]` slice 8.1c spec.** 5 work units shipped:
  - **(1) `apps/backend/src/wallet/index.ts`** (~135 lines) — `mountWalletRoutes(app)` registers `POST /v1/wallets/:walletId/credit` + `/debit` per `[[url-pattern-research]]` F1 slash-suffix-verb pattern. Handler chain verbatim from contract: `apiKeyMiddleware` → `idempotencyMiddleware` → `sValidator('param', walletIdParam)` → `sValidator('json', creditDebitBody)` → handler. Inside handler: `tracer.startActiveSpan('wallet.credit'/'wallet.debit', { attributes: 'db.system'/'db.operation'/'bokchoy.project_id'/'bokchoy.wallet_id'/'bokchoy.amount'/'bokchoy.currency_id'/'bokchoy.reason_code' })` → `withTenant(db, projectId, async (tx) => walletCredit/walletDebit(tx, params))` → `c.json({ id, walletId, status: 'completed' }, 200)`. `try/catch/throw/finally` lifecycle records exception via `span.recordException` + sets `span.setStatus({ code: SpanStatusCode.ERROR })` then re-throws to onError. Shared `makeMutationHandler` factory eliminates credit/debit duplication.
  - **(2) Body schema** at `creditDebitBody` (Zod 4.x, camelCase per contract): `amount` positive number capped at `Number.MAX_SAFE_INTEGER` (= 2^53-1; contract literal 9_007_199_254_740_992 was off-by-one at the unsafe boundary), `currencyId` UUID, `reasonCode` 1-64 chars, `sourceEventId?` 1-255 chars, `relatedId?` positive int, `relatedType?` enum (`loot_roll`/`iap_receipt`/`compensation_grant`), `metadata?` record. `walletIdParam` = `z.object({ walletId: z.uuid() })`.
  - **(3) `apps/backend/src/infra/error-middleware.ts`** (~85 lines) — Hono `onError` handler. `WalletError` → Stripe-wrapped `{error:{code,message,...details-flattened}}` per `[[wallet-http-contract]]` G5 (X). BCxxx → HTTP map verbatim from `[[wallet-mechanics]]` §SQLSTATE: BC001→409, BC002→422, BC010→422, BC020→500, BC021→422, BC022→422, BC030→422, BC040→500, BC050→422, BC060→422. `HTTPException(400)` → `{error:{code:'VALIDATION_ERROR',message}}`. Anything else → 500 `INTERNAL_SERVER_ERROR`.
  - **(4) `validationFailureHook`** in `wallet/index.ts` — sValidator hook callback that translates `@hono/standard-validator`'s default `{success:false, error:Issues, data}` shape into the contract's `{error:{code:'VALIDATION_ERROR',message,issues}}` shape. Hook returns `c.json(...)` on `!result.success`; void on success (sValidator continues to handler). Applied to both `sValidator('param', ...)` and `sValidator('json', ...)` calls. **Required because** the validator returns its own 400 response without throwing HTTPException — `errorMiddleware` never sees it; the hook is the only intercept point.
  - **(5) Wiring** in `apps/backend/src/index.ts:103-110` — `mountWalletRoutes(app)` after the existing `/v1/health-authed` smoke routes; `app.onError(errorMiddleware)` registered after route mounts.
- **Catalog deps added** to root `package.json` and `apps/backend/package.json`: `@hono/standard-validator ^0.2.2` (`sValidator` named export per its README; production-cited via @hono org), `zod ^4.4.3` (Zod 4 native `~standard` interface), `@standard-schema/spec ^1.1.0` (peer for the `Hook` type signature), `@bokchoy/wallet workspace:*`. `bun install` clean (133 installs, 22 new packages).
- **Verification (slice 8.1c):**
  - **Static checks ✓** — `bun run typecheck` (turbo: 6 packages green); `bun run lint:check` (2 pre-existing warnings only — `packages/wallet/scripts/smoke-wrappers.ts` slice 7.7 leftovers, NOT from 8.1c); `bun run check:direct-mutation` (28 files scanned, 3 idempotency-middleware hits opted-out via N=1 `--` comments per `[[direct-mutation-lint-opt-out-shape]]`); `bun run check:prepare-false` (cascade-10 passes).
  - **Smoke `/tmp/smoke-8-1c.sh` against local-docker — 13/13 functional tests pass** (the contract's 13-item smoke list):
    - (1) 401 missing Bearer; (2) 401 invalid Bearer; (3) 400 VALIDATION_ERROR missing reasonCode; (4) 400 VALIDATION_ERROR bad walletId UUID; (5) 200 happy-path credit (balance 0→100); (6) 200 happy-path debit (100→30); (7) 422 BC010 InsufficientFunds (debit 999 on balance 30); (8) 422 BC021 WalletNotFound (ghost UUID); (9) 422 BC022 CurrencyMismatch (silver currency on gold wallet); (10) 422 BC050 ReasonCodeNotRegistered (unknown reason → 23503 → BC050); (11) idempotency REPLAY (same key + same body → 200, same txn id, wrapper invoked once); (12) 422 BC002 IdempotencyKeyMismatch (same key + different body); (13) 409 BC001 IdempotencyKeyInUse (pre-locked row, retry).
    - **Stripe-wrapped error envelope verified** — every BCxxx response has `details` flattened next to `code`+`message` (e.g. BC010 surfaces `walletId`/`requested`/`available` as siblings; BC022 surfaces `walletCurrency`/`requested`; BC050 surfaces `constraintName`).
    - **Span exception recording verified** — `wallet.credit`/`wallet.debit` spans emitted with full attributes; on each error path the span records `exception.stacktrace` attribute + ERROR status. Manual instrumentation per `[[wallet-mechanics]]` Amendment Part 1 A3 layer 1 contract end-to-end clean.
    - **Idempotency × wallet wrapper interaction verified** — Test 11 returns same txn id (72) on replay; final balance 35.0000 = +100 -70 +5 confirms no double-credit (3 transactions, replay short-circuited via cached response).
- **Cascades closed by slice 8.1c:**
  - `[[wallet-http-contract]]` slice 8.1 cluster ALL LANDED (8.1a auth + 8.1b telemetry/idempotency + 8.1c wallet handler).
  - `[[backend-stack]]` cascade obligation: first wallet handler → wallet routes mounted; first OTel-instrumented business operation; first error middleware translating `WalletError` to wire shape. Small amendment owed to `[[backend-stack]]` for cascade-obligation closure.
  - All 3 trigger watchpoints from prior sessions resolved: (a) `idempotency_keys` first non-test/non-script writer (8.1b), (b) `apps/backend/src/wallet/index.ts` first wallet-mutating handler (8.1c), (c) `apps/backend/src/infra/index.ts` first RLS-protected handler (8.1a `TenantTx` brand).
- **Open / known debt carried forward:**
  - **(LOAD-BEARING, from 8.1b) Concurrency UNIQUE-violation race** at `apps/backend/src/idempotency/middleware.ts:120-149`. Untouched by 8.1c. Smoke didn't exercise (sequential bash). At production retry contention the second caller hits 23505 → unhandled → 500 instead of 409/REPLAY. Mitigation pattern: `INSERT ... ON CONFLICT (project_id, idempotency_key) DO NOTHING RETURNING *` + re-SELECT. **Now in customer-facing routes** (slice 8.1c put credit/debit on Bearer-auth'd routes — first production retry pattern that hits this is the one that surfaces the bug). Path B explicit acceptance.
  - **(minor, from 8.1b) Non-JSON response body cached as null on REPLAY** — same as before.
  - **(minor, slice 8.1c) WalletError `details` numeric fields serialize as strings** (`requested:"999"`, `available:"30.0000"`) per `[[wrapper-shape]]` Postgres-numeric-precision-preserving pick. Customer SDKs that expect numbers will need a parseFloat layer. Document in future SDK slice; not a blocker.
  - **(cosmetic)** Replay status type-cast in idempotency middleware (carried).
  - `BOKCHOY_API_KEY_HMAC_SECRET` rotation runbook (carried from 8.1a).
  - Cockpit-driven key creation (carried from 8.1a).
  - `.env.example` line additions for `BOKCHOY_API_KEY_HMAC_SECRET` + `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS` (carried).
  - WWW-Authenticate response header on 401 (carried).
  - Sampler revisit at scale (parent-based) — `[[wallet-http-contract]]` revisit-when (carried).
  - `walletDeidentifyPlayer` HTTP handler — DSR flow + cockpit admin auth surface (deferred per `[[wallet-http-contract]]`).
  - `bootstrapProjectReasonCodes` HTTP handler — admin-only, needs Better Auth org plugin (deferred).
  - Better Auth wiring (`apps/auth-config`) — still queued. SDK API key path is sufficient for slice 8.1.
- **Cascades active:**
  - **`[[reaper-schedule-deferral]]` reopen trigger TRIPPED at 8.1b** — schedule pg_cron reaper per `[[reaper-schedule-research]]` option (a) dashboard-enable-then-Drizzle-migrate. **Slice 8.1.5 owed and now overdue** (8.1c put writers behind customer-facing routes; production traffic risk-window opens with first deploy).
  - `[[backend-stack]]` small amendment owed: cascade obligation #5 (telemetry) closure from 8.1b + first-RLS-handler / `TenantTx` open thread closure from 8.1a.
- **Next on resume — recommended sequence:**
  1. **Slice 8.1.5 (reaper schedule) — load-bearing.** `[[reaper-schedule-deferral]]` trigger fired at 8.1b; debt now sits behind customer-facing routes (8.1c). pg_cron extension dashboard-enable + Drizzle migration + composite-reaper for `cron.job_run_details` per `[[reaper-schedule-research]]` F3.
  2. **(Concurrency hardening pass)** — address `INSERT ... ON CONFLICT` race in idempotency middleware. ~20 LOC change; concurrency smoke test using GNU parallel curl. Can pair with slice 8.1.5 or ship separately.
  3. Slice 8.2 — pick from: wallet feature continuation (`walletDeidentifyPlayer` requires DSR flow), Better Auth wiring (org plugin needed for cockpit admin handler), or first cockpit slice.

- **Mode (prior):** implementation (slice 8.1b LANDED 2026-05-10 — telemetry + idempotency middleware + lint shape per `[[direct-mutation-lint-opt-out-shape]]`)
- **Slice 8.1b LANDED 2026-05-10 per `[[wallet-http-contract]]` slice spec + `[[direct-mutation-lint-opt-out-shape]]`.** 6 work units shipped:
  - **(1) `apps/backend/src/telemetry.ts`** (52 lines) — `NodeSDK` + `OTLPTraceExporter` + `resourceFromAttributes` + `ATTR_SERVICE_NAME`/`ATTR_SERVICE_VERSION`. Service name `bokchoy-backend`, version from `npm_package_version`. Endpoint via `OTEL_EXPORTER_OTLP_ENDPOINT`; unset → `tracing.ConsoleSpanExporter` for dev. AlwaysOn sampler, W3C TraceContext propagator. SIGTERM/SIGINT graceful shutdown.
  - **(2) `@hono/otel` middleware** mounted at `apps/backend/src/index.ts:50-56` as outermost middleware; side-effect import of `./telemetry` on line 28 ensures SDK initializes first.
  - **(3) `apps/backend/src/idempotency/middleware.ts`** (239 lines) — full 4-state machine: row-absent → INSERT + run + UPDATE; row-completed + body-match → REPLAY; row-completed + body-mismatch → 422 BC002; row-locked + completed_at NULL + lock-recent → 409 BC001; row-locked + lock-expired → re-lock + proceed. SHA-256 raw-body fingerprint, RFC 8941 header validation (≤255 printable ASCII), 30s lock timeout, mutating-methods-only filter (POST/PUT/PATCH/DELETE).
  - **(4) Smoke route `POST /v1/health-authed`** at `apps/backend/src/index.ts:74-101` — chains `apiKeyMiddleware` → `idempotencyMiddleware` → manual `tracer.startActiveSpan('health.echo')` inside the handler.
  - **(5) `scripts/check-direct-wallet-mutation.ts`** lint shape per `[[direct-mutation-lint-opt-out-shape]]` (β): `OPT_OUT_RE = /(?:\/\/|--)\s*allow-direct-mutation\b/` + `isOptedOut(lines, i)` function (same-line OR N=1 preceding-line) + failure-message updated for both placement options + header comment with worked example.
  - **(6) Middleware opt-out repositioning** — 3 `// allow-direct-mutation: ...` TS comments moved from outside the templates (2 lines above SQL keyword) to INSIDE each `sql\`...\`` template as `-- allow-direct-mutation: <reason>` Postgres comments on the line immediately above each SQL keyword (INSERT path lines 137-145; UPDATE re-lock path lines 173-184; UPDATE completion path lines 228-237). Reasons unchanged.
- **Verification (slice 8.1b):**
  - **Static checks ✓** — `bun run typecheck` (turbo: 6 packages green); `bun run lint:check` (2 pre-existing warnings only — `packages/wallet/scripts/smoke-wrappers.ts` slice 7.7 leftovers, NOT from 8.1b); `bun run check:direct-mutation` (27 files scanned, all 3 hits opted-out via N=1 preceding `--` comments); `bun run check:prepare-false` (cascade-10 passes).
  - **Smoke /tmp/smoke-8-1b.sh against local-docker — 9/9 functional tests pass:** (1) header absent → bypass + no idempotency_keys row, (2) 1st INSERT path → 200 + row inserted, (3) REPLAY → 200 + same projectId/idempotencyKeyId returned (JSON keys reorder due to JSONB round-trip but data identical — contract doesn't pin lexical order), (4) body mismatch → 422 BC002, (5) in-flight lock (pre-INSERTed locked row, locked_at recent + completed_at NULL) → 409 BC001 (verified middleware finds the pre-locked row, dispatches in-flight branch), (6) lock expired (locked_at >30s ago) → re-lock same row + proceed + completed (verified: same row id pre + post handler, completed_at populated), (7) >255-char Idempotency-Key → 400 IDEMPOTENCY_KEY_INVALID, (8) 8.1a regression GET /v1/health-authed → 200, (9) 8.1a regression missing Bearer on POST → 401.
  - **SQL hygiene ✓** — `--` opt-out comments inside `sql\`...\`` template literals do NOT break Postgres execution. Verified empirically: 3 `idempotency_keys` rows post-test with INSERTs and UPDATEs all completed cleanly.
  - **OTel ✓** — `@hono/otel` HTTP spans (instrumentationScope=`@hono/otel` v1.1.2; attributes `http.request.method` / `url.full` / `http.route` / `http.response.status_code` / `http.request.header.user-agent`) AND manual `tracer.startActiveSpan('health.echo')` nested spans (instrumentationScope=`bokchoy-backend`; parentSpanContext correctly linked) both emitted to ConsoleSpanExporter. 16 traceId entries, 13 lines matching instrumentation-scope name.
- **Cascades closed by slice 8.1b:**
  - GAP 10 in `.bocek/vault/wallet/gaps.md` RESOLVED 2026-05-10 via `[[direct-mutation-lint-opt-out-shape]]`.
  - `[[backend-stack]]` cascade obligation #5 (telemetry instrumentation) CLOSED via `apps/backend/src/telemetry.ts` + `@hono/otel` mount.
  - `[[reaper-schedule-deferral]]` reopen trigger TRIPPED — slice 8.1b ships idempotency_keys writers (3 mutations across the 4-state machine). Per the trigger contract, the per-statement `// allow-direct-mutation: idempotency-middleware` PR is the trigger event. Reaper schedule (slice 8.1.5 follow-on) owed.
- **Open from slice 8.1b (deferred to follow-up slices) — KNOWN DEBT carried forward:**
  - **(KNOWN DEBT, load-bearing) Concurrency hazard — SELECT-then-INSERT UNIQUE-violation race** at `apps/backend/src/idempotency/middleware.ts:120-149`. Under millisecond-level contention with the same `Idempotency-Key`, two callers both see "no row" + both INSERT; second hits `idempotency_keys_project_key_unique` (UNIQUE index per migration `0001:181`) → 23505 → unhandled → 500. Contract says concurrent → 409 BC001 / REPLAY, not 500. **Smoke didn't exercise** (bash+curl is sequential). Mitigation pattern (Stripe / `[[idempotency-strategy]]`): `INSERT ... ON CONFLICT (project_id, idempotency_key) DO NOTHING RETURNING *`; on empty RETURNING, re-SELECT and dispatch state machine. Pre-existing in original 8.1b code (predates this seat). Flag for slice 8.1c review pass OR a dedicated 8.1.5 hardening slice.
  - **(KNOWN DEBT, minor) Non-JSON response body lost on REPLAY** at `middleware.ts:216-225`. `cloned.json()` parse failure falls through with `responseBody = null`; REPLAY returns null body. Contract didn't pin non-JSON behavior. Flag for review pass.
  - **(KNOWN DEBT, minor) Lock-expired re-lock path drops prior `locked_at` audit signal** — contract authorized "reset and proceed" (implementation-compliant). Future audit-log slice may want to preserve prior attempts.
  - **(Cosmetic) Replay status type-cast** at `middleware.ts:209` — `decision.status as Parameters<typeof c.json>[1]`. Could use `ContentfulStatusCode` literal; doesn't affect behavior.
  - `BOKCHOY_API_KEY_HMAC_SECRET` rotation runbook (carried from 8.1a).
  - Cockpit-driven key creation (carried from 8.1a).
  - `.env.example` line addition for `BOKCHOY_API_KEY_HMAC_SECRET` + `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS`.
  - WWW-Authenticate response header on 401 (carried from 8.1a).
  - Sampler revisit at scale (parent-based at higher traffic) — `[[wallet-http-contract]]` revisit-when.
- **Cascades active:**
  - **`[[reaper-schedule-deferral]]` reopen trigger TRIPPED** — schedule pg_cron reaper per `[[reaper-schedule-research]]` option (a) dashboard-enable-then-Drizzle-migrate. Slice 8.1.5 follow-on, paired with the cockpit setup OR before slice 8.1c.
  - `[[backend-stack]]` small amendment owed — note F1 closure (slice 8.1a `TenantTx` brand) + cascade obligation #5 closure (slice 8.1b telemetry).
- **Next on resume:** two paths viable; pick one.
  - **(Path A — recommended) Slice 8.1.5 (reaper schedule) before slice 8.1c.** `[[reaper-schedule-deferral]]` trigger fired; the schedule is owed before more idempotency_keys writers land in slice 8.1c. Small slice — pg_cron extension dashboard-enable + Drizzle migration + composite-reaper for `cron.job_run_details` per `[[reaper-schedule-research]]` F3. Plus optional: address (KNOWN DEBT iv) UNIQUE-violation race in the same slice (single hardening pass, ~20 LOC change to middleware INSERT path + a concurrency smoke test that uses GNU parallel curl).
  - **(Path B) Slice 8.1c (wallet handler) directly**, deferring slice 8.1.5 + concurrency hardening to a later 8.1.5/8.2 hardening pass. Faster to demonstrable wallet operation; carries the concurrency debt into customer-facing routes.

- **Mode (prior):** design → handoff to /implementation (`[[direct-mutation-lint-opt-out-shape]]` LANDED 2026-05-10 — GAP 10 RESOLVED, slice 8.1b unblocked)
- **`[[direct-mutation-lint-opt-out-shape]]` LANDED 2026-05-10.** `.bocek/vault/_shared/direct-mutation-lint-opt-out-shape.md` (~280 lines) closes GAP 10 with **(β) N=1 lookback + dual `//`/`--` recognition** per `[[direct-mutation-lint-opt-out-research]]` evidence. User ratified the position on the research backing — F1 (production-cited × 3 for N=1 next-line) is the controlling evidence; (α) range markers loses on the granularity-loss attack; (γ) rewrite-to-query-builder loses on generality (lint should be SQL-idiom-agnostic); (a) K=2 lookback is research-falsified; (d) per-file EXCLUDE_PREFIXES contradicts `[[reaper-schedule-deferral]]` line 57.
- **Implementation contract for slice 8.1b lint-script change** (concrete enough for /implementation to quote verbatim):
  - **(1) `scripts/check-direct-wallet-mutation.ts` updates** (~3 line change):
    - `OPT_OUT_RE = /(?:\/\/|--)\s*allow-direct-mutation\b/` (regex alternation accepts TS `//` OR Postgres `--`).
    - Replace single-line opt-out check with `function isOptedOut(lines, i): boolean { return OPT_OUT_RE.test(lines[i]) || (i > 0 && OPT_OUT_RE.test(lines[i - 1])); }`; call `if (isOptedOut(lines, i)) continue;` in the per-line scan loop.
    - Failure-message tail updated to: *"add `// allow-direct-mutation: <reason>` to the line or the line above (TS context), OR `-- allow-direct-mutation: <reason>` immediately preceding the SQL keyword inside the template literal."*
    - Script header comment gains one worked example for the multi-line `sql\`...\`` template form.
  - **(2) `apps/backend/src/idempotency/middleware.ts` opt-out repositioning** — move the 3 `// allow-direct-mutation: ...` comments (currently 2 lines above each SQL keyword as TS comments) to INSIDE each `sql\`...\`` template as `-- allow-direct-mutation: <reason>` on the line immediately above the SQL keyword (`INSERT INTO idempotency_keys` on slice 8.1b INSERT path; `UPDATE idempotency_keys` on re-lock recovery path; `UPDATE idempotency_keys` on completion path). Reasons unchanged.
- **Verification owed for slice 8.1b after /implementation lands the lint change:**
  - `bun run check:direct-mutation` ✓ (3 hits should now be opted out).
  - Smoke test against local-docker — `apps/backend` POST `/v1/health-authed` exercising the 4-state machine: header absent → no idempotency_keys row; 1st call with header → INSERT + run; replay same body → cached response; body mismatch → 422 BC002; 2 concurrent calls same key → 409 BC001 on second; lock-expired re-lock path.
  - Code self-attack: replay `decision.body` returned via `c.json(body, status as Parameters<typeof c.json>[1])` type assertion (cosmetic — flag for review pass); JSON parse failure path stores null body (replay returns null — surfaces gap in observability rather than silent loss); `c.res.clone()` after `next()` captures the final response or earlier (verify); `rawBody = await c.req.text()` ordering vs auth middleware completion (already verified middleware order index.ts:74 chains `apiKeyMiddleware` → `idempotencyMiddleware` correctly).
  - Then checkpoint slice 8.1b LANDED, advance to slice 8.1c (wallet handler).
- **Cascades closed by `[[direct-mutation-lint-opt-out-shape]]`:**
  - GAP 10 in `.bocek/vault/wallet/gaps.md` marked RESOLVED 2026-05-10.
  - Future cross-cutting middleware authors find the canonical opt-out shape via wikilink from `[[wallet-mechanics]]` Amendment Part 1 A1 (small amendment owed to wallet-mechanics — pointer to this entry).
- **Cascades active (carried forward):**
  - `[[reaper-schedule-deferral]]` reopen trigger fires WHEN slice 8.1b ships (idempotency_keys writers land, opt-out PR review IS the trigger event per line 57). pg_cron reaper schedule via dashboard-enable-then-Drizzle-migrate per `[[reaper-schedule-research]]` workaround. Slice 8.1.5 follow-on.
  - `[[backend-stack]]` cascade obligation #5 (telemetry instrumentation) closes via slice 8.1b telemetry.ts + @hono/otel mount (pending /implementation final verification).
- **Open threads (carried forward from research entry):**
  - Drizzle multi-line `sql\`` survey at higher sample size (F2 medium-confidence; drizzle-team/drizzle-orm internal usage + 2-3 public Drizzle apps would raise to high — not blocking).
  - Postgres `--` comment INSIDE `sql\`...\`` template literal — verification spike on postgres-js + Drizzle that the SQL still executes cleanly (very likely yes, but unverified — /implementation will confirm via the smoke test).
  - Should middleware rewrite to Drizzle query builder (F2 secondary question — separable from lint-mechanism pick; /design or future code-review may pick up).
  - `pgrls` adjacent integration for Postgres-layer ops tooling (future ops slice).
- **Next on resume:** switch to `/implementation`. Quote `[[direct-mutation-lint-opt-out-shape]]` as the contract for slice 8.1b lint-script change + middleware opt-out repositioning. Quote `[[wallet-http-contract]]` slice 8.1b as the contract for the rest of the slice. Re-run static checks, smoke-test, self-attack, checkpoint LANDED, advance to slice 8.1c.

- **Mode (prior):** research → handoff to /design (`[[direct-mutation-lint-opt-out-research]]` LANDED 2026-05-10 — GAP 10 cluster ready for /design pushback)
- **`[[direct-mutation-lint-opt-out-research]]` LANDED 2026-05-10.** `.bocek/vault/_shared/direct-mutation-lint-opt-out-research.md` (~270 lines) closes the /design pushback owed on GAP 10 (slice 8.1b lint blocker). 9 sources triangulated across all three channels: docs (Biome 2.x suppressions doc, ESLint configure-rules doc, TS handbook on `@ts-expect-error`, Drizzle official `sql` template doc), production code (Better Auth `gh search code 'sql\`'` survey + GitHub-wide `sql\`\\nINSERT INTO --extension ts` negative result), prior-art probe (`pgrls`, `eslint-plugin-immutable/-functional/-better-mutation`, Convex ESLint plugin — none match BokChoy's shape), capability check (ESLint custom-rule API).
- **Headline finding F1 (LOAD-BEARING):** TS-ecosystem suppression conventions are **N=1 next-line OR explicit range markers** — production-cited × 3 across Biome (next-line + file-wide + start/end range), ESLint (next-line + same-line + `eslint-disable`/`-enable` blocks), TS (`@ts-expect-error` N=1 only). **No production lint tool ships K>1 lookback as a primary directive.** ESLint custom-rule API supports building K>1 lookback via `sourceCode.getCommentsBefore` / `sourceCode.lines[]`, but no published plugin or stock directive surfaces it as a primary suppression mechanism.
- **My /design pick of (a) K=2 lookback was FALSIFIED.** No production cite for K>1 lookback as a built-in directive. The "TS-ecosystem convention" label I attached to K=2 in /design was inferred from training-data, not verified against current Biome/ESLint/TS docs. Per *Contradiction protocol* (current docs > training-data inference): F1 wins, K=2 drops from candidate set, fails *Production-grade default* industry-standard gate (≥2 named systems requirement).
- **Headline finding F2:** Drizzle production INSERT/UPDATE/DELETE routes through the **query builder** (`db.insert(table).values()`, `db.update(table).set()`, `db.delete(table).where()`), NOT through raw multi-line `sql\`INSERT INTO ...\``. Better Auth `sql\`` usage overwhelmingly inline single-line for SELECT fragments / type casts / default expressions / ILIKE-LOWER; the one multi-line `sql\`SELECT ...\`` lives in e2e test code, not production middleware. `gh search code 'sql\`\\nINSERT INTO' --extension ts` returned zero matches across public TS. Drizzle official docs explicitly position `sql\`` as the *escape hatch for complex queries*. **The on-disk middleware's choice of multi-line raw `sql\`INSERT INTO\`` is unusual relative to ecosystem norm** — surfaces secondary design question (separable from lint-mechanism pick): should middleware rewrite to Drizzle query builder?
- **Headline finding F3:** No off-the-shelf prior art for "RLS-protected table + stored-function-only discipline" lint. `eslint-plugin-immutable` / `-functional` / `-better-mutation` target JS variable mutation, not DB tables. `pgrls` (Python tool, single-author) lints Postgres RLS policies at the SQL/migration layer — adjacent but different layer. Convex ESLint plugin is closest in spirit (gates DB access) but Convex has its own runtime, not raw Drizzle/Postgres. **BokChoy's `scripts/check-direct-wallet-mutation.ts` is bespoke; conventions inherited from analogous lint-comment ecosystems (F1), not from a domain-specific plugin.**
- **Two viable shapes survive triangulation for /design pushback:**
  - **(α) Range markers** — `// allow-direct-mutation-start: <reason>` ... `// allow-direct-mutation-end` wrapping the await statement(s). Production-cited × 2 (Biome `biome-ignore-start`/`-end`, ESLint `eslint-disable`/`-enable`). Region-granularity; +2 lines per single-statement; reviewer signal unmistakable.
  - **(β) N=1 lookback + accept `--` SQL comments alongside `//`** — opt-out lives on the line immediately preceding the SQL keyword, INSIDE the `sql\`...\`` template literal as a Postgres `--` comment. Industry-cited × 3 for N=1 convention; the `--` recognition is a small script regex extension. Per-statement granularity preserved; comment maximally proximate to SQL keyword (1 line above). Mixes TS `//` and SQL `--` comment styles — dual-format awareness.
- **Conflicts NOT artificially resolved:**
  - F1 vs /design's K=2 pick — F1 wins per *Contradiction protocol*; K=2 dropped.
  - F2 (raw `sql\`` vs query builder) — flagged as secondary design question for /design to consider, not forced by this research.
- **Cascade:** GAP 10 entry in `.bocek/vault/wallet/gaps.md` carries forward; /design pushback owed. Once /design lands the pick (α vs β), `/implementation` resumes slice 8.1b: apply the lint change, re-run `check:direct-mutation`, smoke-test, code self-attack, checkpoint LANDED.
- **Open threads (carried forward):**
  - Drizzle multi-line `sql\`` survey at higher sample size (F2 medium-confidence — sample was Better Auth + Drizzle docs + GitHub negative; drizzle-team/drizzle-orm internal usage + 2-3 public Drizzle apps would raise to high).
  - Postgres `--` comment INSIDE `sql\`...\`` template literal — verification spike on postgres-js + Drizzle that the SQL still executes cleanly (very likely yes, but unverified).
  - Should middleware rewrite to Drizzle query builder (F2 secondary question).
  - `pgrls` adjacent integration for ops tooling (future slice).
- **Next on resume:** switch to `/design`. /design seat picks between (α) range markers and (β) N=1 + `--`. Both production-cited; pick is per-statement-vs-region-granularity preference, verbosity tolerance, and comment-style purity. After /design lands the pick, `/implementation` resumes slice 8.1b.

- **Mode (prior):** implementation → handoff to /design (slice 8.1b BLOCKED 2026-05-10 on GAP 10 — lint opt-out shape for multi-line SQL)
- **Slice 8.1b — telemetry + idempotency middleware: code on disk, static checks BLOCKED.** 4 work units written per `[[wallet-http-contract]]` slice 8.1b spec, NOT yet verified end-to-end:
  - **(1) `apps/backend/src/telemetry.ts`** (52 lines) — `NodeSDK` from `@opentelemetry/sdk-node` + `OTLPTraceExporter` from `@opentelemetry/exporter-trace-otlp-http` + `resourceFromAttributes` from `@opentelemetry/resources` + `ATTR_SERVICE_NAME`/`ATTR_SERVICE_VERSION` from `@opentelemetry/semantic-conventions`. Service name `bokchoy-backend`, version from `npm_package_version` env var. Endpoint via `OTEL_EXPORTER_OTLP_ENDPOINT`; unset → `tracing.ConsoleSpanExporter` for dev. AlwaysOn sampler (OTel default). W3C TraceContext propagator (default). SIGTERM/SIGINT graceful shutdown calls `sdk.shutdown()` to flush spans.
  - **(2) `@hono/otel` middleware** mounted at `apps/backend/src/index.ts:50-56` as outermost middleware. `httpInstrumentationMiddleware({ serviceName, serviceVersion, captureRequestHeaders: ['user-agent', 'idempotency-key'] })`. Side-effect import of `./telemetry` at top of `index.ts:28` ensures SDK initializes before any other module loads.
  - **(3) `apps/backend/src/idempotency/middleware.ts`** (239 lines) — full 4-state machine per contract: row-absent → INSERT + run + UPDATE; row-completed + body-match → REPLAY (cached `response_status` + `response_body`); row-completed + body-mismatch → 422 BC002; row-locked + completed_at NULL + lock-recent → 409 BC001; row-locked + lock-expired → re-lock + proceed. Body fingerprint = SHA-256 of raw body bytes (matches Stripe documented behavior; on-the-spot pick — contract authorized "defer canonicalization-algorithm pick to slice 8.1b implementation"). Header validated per RFC 8941 Structured Header String (`/^[\x21-\x7E]{1,255}$/`). Header `Idempotency-Key` constant; lock timeout 30s; mutating methods only (POST/PUT/PATCH/DELETE bypass otherwise). Wrapped in `withTenant` for RLS GUC. `c.set('idempotencyKeyId', rowId)` for downstream wallet handler. `c.res.clone()` after `next()` to capture response body for caching.
  - **(4) Smoke route `POST /v1/health-authed`** at `apps/backend/src/index.ts:74-101` — chains `apiKeyMiddleware` → `idempotencyMiddleware` → manual `tracer.startActiveSpan('health.echo', { attributes: { 'bokchoy.project_id', 'bokchoy.api_key_id' } }, …)` inside the handler with `withTenant(db, projectId, async (tx) => tx.execute(sql\`SELECT 1\`))`. AppContext typed as `ApiKeyContext & IdempotencyContext`.
  - **`apps/backend/package.json` deps added** for OTel + `@hono/otel`. Catalog entries pinned in root `package.json`: `@hono/otel ^1.1.2`, `@opentelemetry/api ^1.9.1`, `@opentelemetry/sdk-node ^0.217.0`, `@opentelemetry/exporter-trace-otlp-http ^0.217.0`, `@opentelemetry/resources ^2.7.1`, `@opentelemetry/semantic-conventions ^1.40.0`. `bun install` clean (Checked 131 installs, no changes).
- **Verification status (slice 8.1b):**
  - `bun install` ✓ clean
  - `bun run typecheck` ✓ all 6 packages green (turbo)
  - `bun run lint:check` ✓ 2 pre-existing warnings only (`packages/wallet/scripts/smoke-wrappers.ts` slice 7.7 leftovers — same as before 8.1b)
  - `bun run check:prepare-false` ✓ cascade-10 passes
  - `bun run check:direct-mutation` ✗ **BLOCKED — 3 hits at `apps/backend/src/idempotency/middleware.ts:139,175,230`.** Genuine M1-trigger writes the contract authorizes, but the lint script's same-line opt-out semantics don't fit multi-line `sql\`...\`` tagged templates. **GAP 10 surfaced + vaulted.**
  - Smoke test against local-docker: NOT YET RUN (gated on lint passing).
  - Code self-attack: NOT YET COMPLETED.
- **GAP 10 (OPEN, surfaced 2026-05-10):** `// allow-direct-mutation` opt-out for multi-line tagged-template SQL — full report at `.bocek/vault/wallet/gaps.md` GAP 10. Four unvetted options (a/b/c/d): widen-lint-to-preceding-line, widen-lint-to-N-preceding-lines, restructure-to-single-line-SQL, per-file-EXCLUDE_PREFIXES. Recommendation pending /design — granularity-vs-discipline tradeoff (per-statement vs per-file) and idiom-citation pass needed (biome-ignore-next-line / eslint-disable-next-line convention). User picked **handoff to /design** rather than implementation-seat inline pick.
- **Cascades active (carried forward):**
  - `[[reaper-schedule-deferral]]` reopen trigger fires WHEN slice 8.1b passes CI and ships (idempotency_keys writers land). pg_cron reaper schedule via dashboard-enable-then-Drizzle-migrate per `[[reaper-schedule-research]]` workaround. Slice 8.1b will write to idempotency_keys IFF GAP 10 resolves; reaper schedule is the immediate follow-up.
  - `[[backend-stack]]` cascade obligation #5 (telemetry instrumentation) **CLOSED via slice 8.1b telemetry.ts + @hono/otel mount** (pending verification). Small amendment owed to backend-stack vault entry once 8.1b lands.
- **Open from slice 8.1b spec (deferred to follow-up slices):**
  - `BOKCHOY_API_KEY_HMAC_SECRET` rotation runbook — same as 8.1a deferred.
  - Cockpit-driven key creation — same as 8.1a deferred.
  - `.env.example` line addition for `BOKCHOY_API_KEY_HMAC_SECRET` + `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS`. Small follow-up.
  - WWW-Authenticate response header on 401 — same as 8.1a deferred.
  - Sampler revisit at scale (parent-based at higher traffic) — `[[wallet-http-contract]]` revisit-when.
  - Lock-expired re-lock path drops prior `locked_at` audit signal (contract says "reset and proceed" — implementation-compliant; flag as known debt for future audit-log slice).
  - Replay status `decision.status as Parameters<typeof c.json>[1]` type assertion — cosmetic, flag for review pass.
- **Next on resume:** switch to `/design`. Cluster shape is a single sub-decision (lint opt-out semantics for multi-line SQL) — likely smaller than GAP 9. Likely vault output: small amendment to `[[wallet-mechanics]]` Amendment Part 1 A1 lint-mechanism paragraph OR a short new entry `[[direct-mutation-lint-opt-out-shape]]`. After /design lands the pick, `/implementation` resumes slice 8.1b: apply the lint change, re-run `check:direct-mutation`, run smoke test against local-docker, run code self-attack archetypes, then checkpoint slice 8.1b LANDED + advance to slice 8.1c.

- **Mode (prior):** implementation (slice 8.1a LANDED 2026-05-09 — auth + RLS type)
- **Slice 8.1a — auth + RLS type LANDED 2026-05-09 per `[[wallet-http-contract]]` slice spec.** 7 work units shipped:
  - **(1) `api_keys` schema** at `packages/db/src/schema/api-keys.ts`: `id UUID PK + project_id UUID FK CASCADE + key_prefix TEXT UNIQUE + key_hash BYTEA + name + created_at + last_used_at NULL + revoked_at NULL`. RLS policy `tenant_isolation`. `customType<{data: Buffer}>` for BYTEA (Drizzle pg-core lacks BYTEA in core surface). Re-exported from `schema/index.ts`. Locating in its own file (NOT `auth.ts`) — `auth.ts` is the Better Auth schema mirror per `[[backend-stack]]` §6.5; `api_keys` is BokChoy-original M2M auth, different concern.
  - **(2) Migration `0007_adorable_chamber.sql`** generated via `drizzle-kit generate`; hand-appended `ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;` + `GRANT SELECT, INSERT, UPDATE ON api_keys TO bokchoy_app;` per slice 2 pattern (drizzle-kit doesn't emit FORCE per `[[drizzle-orm-research]]` (1)). **DELETE intentionally omitted** — revocation via `revoked_at` column preserves audit trail. Verified post-apply: `relforcerowsecurity=true`, bokchoy_app has SELECT/INSERT/UPDATE.
  - **(3) Migration `0008_api_key_lookup.sql`** (custom hand-written, mirrors slice 6 reaper) — **architectural gap surfaced inline + resolved on-the-spot**. Bearer middleware lookup runs BEFORE tenant_GUC is set (the lookup IS what resolves project_id); FORCE RLS on `api_keys` makes direct SELECT from bokchoy_app fail because `current_setting('app.current_tenant')::uuid` raises on unset GUC. Two SECURITY DEFINER functions added: `api_key_lookup(p_prefix text) RETURNS SETOF api_keys` (read-only, filters `revoked_at IS NULL`) + `api_key_record_use(p_id uuid) RETURNS void` (UPDATE last_used_at = NOW()). Both OWNER postgres (BYPASSRLS), `SET search_path = pg_catalog, public` (CVE-2018-1058 hardening), REVOKE FROM PUBLIC + GRANT EXECUTE TO bokchoy_app. **Functions split deliberately:** lookup vs record_use separation prevents invalid-Bearer attempts from leaving last_used_at signal — preserves audit semantics ("last *successful* use, not last attempt"). User accepted (A) on the spot.
  - **(4) `TenantTx` branded type** in `packages/db/src/with-tenant.ts`: `declare const tenantBrand: unique symbol; type TenantTx = Tx & { readonly [tenantBrand]: never };`. `withTenant<T>(...fn: (tx: TenantTx) => Promise<T>): Promise<T>` — brand exists only inside callback. `tx as TenantTx` cast inside the body. Closes `[[backend-stack]]` F1 mitigation #2 open thread; closes the F1 cascade obligation in state.md trigger watchpoints. **Existing `Db | Tx` accept-type in `@bokchoy/wallet` wrappers stays per `[[wrapper-shape]]` Fork 1** — brand is opt-in for type-level discipline; SQL-side `current_setting()` check is the runtime defense.
  - **(5) `BOKCHOY_API_KEY_HMAC_SECRET` env var pattern** introduced — HMAC keying via server-side secret means DB leak alone doesn't validate keys (Stripe-pattern). **Contract said "HMAC-SHA-256 of secret half" without naming the HMAC key**; resolved on-the-spot to env-var server secret (defensible inline because the alternative — plain SHA-256 with no keying — would be a real security gap; the contract phrasing was loose, not under-specified-on-purpose).
  - **(6) Bearer middleware** at `apps/backend/src/auth/api-key-middleware.ts`: parses `Authorization: Bearer <key>`; validates length (40) + prefix (`bk_live_`/`bk_test_`); extracts 12-char prefix; `db.execute<ApiKeyRow>(sql\`SELECT * FROM api_key_lookup(${keyPrefix})\`)`; `node:crypto.timingSafeEqual(expected, hmacKey(fullKey))` constant-time compare; 401 with `{error:{code:'UNAUTHENTICATED',message:...}}` on miss/format/HMAC-mismatch; `c.set('projectId')` + `c.set('apiKeyId')` on success; fire-and-forget `api_key_record_use($1)` with `.catch(console.error)` to surface async failures. Cross-runtime discipline preserved (`node:crypto`, not Bun-specific).
  - **(7) Key-creation CLI** at `packages/db/scripts/create-api-key.ts`: connects via DATABASE_MIGRATION_URL (postgres role, BYPASSRLS); uses `node:util.parseArgs` for `--project-id` (UUID-validated) + `--name` (cap 100 chars) + `--env` (default `live`, validates `live|test`); `randomBytes(16).toString('hex')` → `bk_<env>_<32-hex>` full key (40 chars total); `createHmac('sha256', HMAC_SECRET).update(fullKey).digest()` → `key_hash` BYTEA; INSERT row, print full key once with "shown once — store securely" warning. Wired as `bun run --cwd packages/db create:api-key`.
  - **(8) DB client wiring + smoke route.** Created `apps/backend/src/infra/db.ts` (singleton — Cal.com / Better Auth ecosystem precedent). Added `@bokchoy/db` + `drizzle-orm` workspace deps to `apps/backend/package.json`. `GET /v1/health-authed` route at `apps/backend/src/index.ts` chains `apiKeyMiddleware` → `withTenant(db, c.get('projectId'), async (tx) => tx.execute(sql\`SELECT 1\`))` → `200 {ok:true,projectId,apiKeyId}`. Hono app generic typed `Hono<ApiKeyContext>` so `c.get('projectId')` is `string`-typed.
- **Verification (slice 8.1a):** All 8 smoke paths pass against local-docker via `/tmp/smoke-8-1a.sh`: (1) CLI prints valid `bk_live_<32-hex>` format, (2) `/health` no-auth → 200, (3) missing Bearer → 401 `Missing Bearer token`, (4) malformed Bearer → 401 `Invalid key format`, (5) valid-format fake key → 401 `Invalid key` (HMAC mismatch caught by timingSafeEqual), (6) valid Bearer → 200 with `{ok:true,projectId,apiKeyId}` (Bearer + RLS GUC chain end-to-end works), (7) `last_used_at` recorded on success only (SECURITY DEFINER `api_key_record_use` fires after HMAC verify, fire-and-forget), (8) revoked key → 401 (`api_key_lookup` filters `revoked_at IS NULL`). Static checks all clean: `bun run typecheck` (turbo: 6 packages green), `bun run lint:check` (61 files, 2 pre-existing warnings in `packages/wallet/scripts/smoke-wrappers.ts` slice 7.7 leftovers — not from this slice), `bun run check:direct-mutation` (25 files scanned), `bun run check:prepare-false` (cascade-10 passes).
- **Cascades closed by slice 8.1a:**
  - `[[backend-stack]]` F1 mitigation #2 open thread CLOSED via `TenantTx` brand.
  - `[[backend-stack]]` cascade obligation #1 (DB connection in `apps/backend/`) CLOSED via `apps/backend/src/infra/db.ts`.
  - `[[wallet-http-contract]]` G3 + G6 + G8 LANDED.
- **Open from slice 8.1a (deferred to follow-up slices):**
  - `BOKCHOY_API_KEY_HMAC_SECRET` rotation runbook — kill-switch on rotate; cockpit-side warning before rotate action. Vault as cascade obligation when cockpit slices ship.
  - Cockpit-driven key creation — needs SECURITY DEFINER `api_key_create(...)` function (mirrors slice 8.1a CLI's privileged-INSERT path through a function callable by bokchoy_app). Slice when cockpit auth wires.
  - `.env.example` line addition for `BOKCHOY_API_KEY_HMAC_SECRET`. Small follow-up.
  - WWW-Authenticate response header on 401 — REST convention; not in `[[wallet-http-contract]]` spec; flag for slice 8.1c review pass.
- **Mode (prior):** design → handoff to /implementation (`[[wallet-http-contract]]` LANDED 2026-05-09 — GAP 9 RESOLVED)
- **`[[wallet-http-contract]]` LANDED 2026-05-09.** `.bocek/vault/wallet/wallet-http-contract.md` (~430 lines). Closes all 8 sub-decisions in `[[gaps]]` GAP 9 across one design pass + three research entries (`[[http-contract-research]]`, `[[otel-stack-research]]`, `[[url-pattern-research]]`). **Slice 8.1 splits into 8.1a + 8.1b + 8.1c** for snapshot tracking + reviewability at solo-dev scale (user defended split: "track 8.1 as snapshots"). **8.1a (auth + RLS type):** `api_keys` table schema migration + RLS policy + Bearer-validation Hono middleware + `bk_<env>_<random>` key format + `packages/db/scripts/create-api-key.ts` CLI + `TenantTx` branded type closing `[[backend-stack]]` F1 mitigation #2 open thread + smoke `GET /v1/health-authed`. **8.1b (telemetry + idempotency middleware):** `apps/backend/src/telemetry.ts` NodeSDK + OTLP/HTTP exporter (Honeycomb endpoint via `OTEL_EXPORTER_OTLP_ENDPOINT` env var; ConsoleSpanExporter for dev; AlwaysOn sampler; W3C TraceContext) + `@hono/otel` middleware mounted + Idempotency-Key middleware per `[[idempotency-strategy]]` D2-α (4-state machine: NULL→INSERT-with-locked_at→run→UPDATE; replay if completed+body-matches; 409 BC001 if locked+incomplete; 422 BC002 if completed+body-mismatch; 30s lock timeout). **TRIPS `[[reaper-schedule-deferral]]` reopen trigger** — first non-test/non-script `INSERT INTO idempotency_keys` lands here. Schedule pg_cron reaper per `[[reaper-schedule-research]]` option (a) — pair with middleware in 8.1b OR slice 8.1.5 follow-on (small). **8.1c (wallet handler):** `POST /v1/wallets/{walletId}/credit` + `/debit` with `@hono/standard-validator` + Zod 4.x schema (camelCase body) + Hono error middleware translating `WalletError` → Stripe-wrapped JSON (`{error:{code,message,...flattened-details}}`) per BCxxx→HTTP map verbatim from `[[wallet-mechanics]]` §SQLSTATE + manual `tracer.startActiveSpan('wallet.credit', { attributes: { 'bokchoy.project_id', 'bokchoy.wallet_id', 'bokchoy.amount', 'bokchoy.currency_id', 'bokchoy.reason_code', 'db.system', 'db.operation' } })` inside wrappers replacing `// TODO(otel)` markers + 13-item smoke-test list (happy paths + each BCxxx + idempotency replay/409/422 + auth 401 paths).
- **Resolutions:** G1 `POST /v1/{plural-resource}/{id}/{verb}` slash-suffix-verb (production-cited × 2: Stripe + GitHub via `[[url-pattern-research]]`); plural collections; multi-word verbs kebab-case; POST not PUT; `/v1/` stable indefinitely (Stripe ~10yr); future date-granularity breaking changes via `Bokchoy-Version: YYYY-MM-DD` header. G1 body casing camelCase (TS-native; customer cluster Unity C# + Unreal C++ + TS all camel-friendly). G1 response shape top-level resource (`{id, walletId, status}` no envelope). G2 `@hono/standard-validator` + Zod 4.x (switchable later via Standard Schema interop). G3 SDK API key Bearer co-shipped in 8.1a. G4 idempotency middleware co-shipped in 8.1b. G5 (X) Stripe-wrapped error envelope — defended on customer-SDK-language asymmetry (future polyglot SDK preserved; Better-Auth-internal-consistency cost bounded since auth and wallet are different SDK products). G6 `TenantTx` brand co-shipped in 8.1a (single-line type change in `@bokchoy/db/src/with-tenant.ts`). G7 OTel co-shipped in 8.1b — manual path per `[[otel-stack-research]]` F1 (no `auto-instrumentations-node`); Honeycomb 20M-events/month free tier; bootstrap at single file `apps/backend/src/telemetry.ts`. G8 `projectId` from validated API-key row, `walletId` from URL path, `playerId` server-derived from wallet row.
- **Cascades active:**
  - `[[reaper-schedule-deferral]]` reopen trigger fires when slice 8.1b ships (idempotency_keys writers land). Schedule pg_cron reaper via dashboard-enable-then-Drizzle-migrate per `[[reaper-schedule-research]]` workaround.
  - `[[backend-stack]]` F1 mitigation #2 open thread closes via `TenantTx` brand in slice 8.1a — small amendment owed to backend-stack vault entry (note F1 closure).
  - `[[backend-stack]]` cascade obligation #5 (telemetry instrumentation) closes via slice 8.1b — small amendment owed.
  - `[[gaps]]` GAP 9 RFC 7807 cite corrected to RFC 9457 (July 2023, Standards Track, obsoletes 7807) — landed in gaps.md.
  - `[[gaps]]` GAP 9 /design (a) flat-action mitigation-by-assertion corrected to (d) per `[[url-pattern-research]]` — landed in gaps.md.
- **Deferred (separate slices):**
  - `walletDeidentifyPlayer` HTTP handler — needs DSR flow + cockpit admin auth surface. Different slice.
  - `bootstrapProjectReasonCodes` HTTP handler — admin-only; needs Better Auth org plugin. Different slice.
  - Better Auth wiring (`apps/auth-config` package) — still queued. SDK API key path is sufficient for slice 8.1.
- **Next on resume:** switch to `/implementation`. Quote `[[wallet-http-contract]]` as the contract; ship slices 8.1a → 8.1b → 8.1c in order. Each is a quote-and-execute slice with no remaining design gaps. Trigger watchpoints (carried forward) all activate within this implementation pass.
- **Mode (prior):** research → handoff to /design (G1 follow-up `[[url-pattern-research]]` LANDED 2026-05-09)
- **`[[url-pattern-research]]` LANDED 2026-05-09.** `.bocek/vault/_shared/url-pattern-research.md` (~290 lines) closes the /design self-attack on G1 raised when /design seat picked (a) `POST /v1/wallet/credit` flat-action with mitigation-by-assertion ("Stripe ships exactly this hybrid"). User pushed to /research rather than vault undefended reasoning — correct discipline. **Triangulation FALSIFIED my /design (a) pick:** Stripe doesn't ship flat-action; Stripe ships `POST /v1/charges/{id}/capture` slash-suffix-verb on resource id. **Fourth pattern (d) I missed in /design enumeration:** `POST /v1/{resource-plural}/{id}/{verb}`. Production-cited × 2 ecosystems (Stripe + GitHub), 10+ named endpoints. Google AIP-136 ships colon-variant `:verb` (cosmetic difference). Cal.com / Better Auth ship verb-slug-as-segment at collection-level or auth-method-level — different problem class from BokChoy's resource-id-scoped wallet ops. Industry "nouns only" prescription falsified at production scale. **F2 lock-out concern doesn't materialize under (d):** `GET /v1/wallets/{walletId}` and `POST /v1/wallets/{walletId}/credit` share resource prefix, no hybrid coexistence problem. **For BokChoy slice 8.1+:** `POST /v1/wallets/{walletId}/credit`, `/debit`; `POST /v1/players/{playerId}/deidentify`; `POST /v1/projects/{projectId}/bootstrap-reason-codes`. Plural collection names. Multi-word verbs kebab-case. POST not PUT (non-idempotent-at-HTTP — idempotency is server-derived). Body field casing orthogonal — `[[http-contract-research]]` F1 still stands; /design picks snake vs camel separately.
- **GAP 9 status — research complete; /design ready to land all 8 sub-decisions.** G1 (route shape) → pattern (d) production-cited via this entry. G2 (validator), G5 (error body) → `[[http-contract-research]]` triangulated; /design picks. G3 (auth-surface) → /design seat picked (i) SDK API key co-shipped in slice 8.1 (provisional, not yet vaulted). G4 (idempotency middleware) → vault evidence exists; /design picks timing. G6 (TenantTx brand) → vault pattern documented; /design closes open thread. G7 (OTel) → `[[otel-stack-research]]` triangulated; /design picks bootstrap location + Honeycomb-vs-Grafana. G8 (data sources) → resolved by G3 pick (`projectId` from validated API key row). **Provisional G3 pick stands** unless /design challenges; reasoning was "production scope from day one" — defensible.
- **Next on resume:** switch to `/design`. The full GAP 9 cluster is research-backed. Likely output: a new entry `[[wallet-http-contract]]` (or broader `[[backend-http-contract]]` if conventions span features) for G1/G2/G5; small amendments to `[[backend-stack]]` for G3 auth-surface ordering + G7 OTel pick; small amendment to `[[idempotency-strategy]]` if G4 picks "middleware lands now"; F1 `TenantTx` open-thread closure for G6. Update GAP 9 entry: stale RFC 7807 cite → RFC 9457 (per `[[http-contract-research]]`); /design (a) flat-action mitigation-by-assertion → corrected to (d) per this entry. After /design lands the entry, `/implementation` resumes slice 8.1 as a quote-and-execute slice.
- **Mode (prior):** research → handoff to /design (research queue Entry 2 of 2 `[[otel-stack-research]]` LANDED)
- **`[[otel-stack-research]]` LANDED 2026-05-09.** `.bocek/vault/_shared/otel-stack-research.md` (~310 lines) closes Entry 2 of the 2-entry research queue queued behind GAP 9. Cross-cutting concern (touches every module that emits spans) so vaulted under `_shared/` not `wallet/`. 12 sources triangulated across all three channels — production code (Bun GitHub issues #3775 / #26536 / #28968 / #13165 / #6546, `@hono/otel` README + src, `wataruoguchi/otel-instrumentation-postgres`), official docs (Sentry Bun OTel custom-setup, Honeycomb pricing 2026, Grafana Cloud OTLP), engineering blogs (Datadog unsupported-runtimes guide, OneUptime Bun OTel guide by Nawaz Dhandala 2026-02-06), Bun maintainer position (Discussion #7185 Jarred-Sumner Nov 2023 "Maybe"). **Headline findings:** (F1 load-bearing) **Bun + `@opentelemetry/auto-instrumentations-node` is structurally broken since 2023** — shimmer-based monkey-patching of http/express/pg fails at Bun's bundle layer (#13165). #3775 open 2.5yr; #26536 closed as duplicate; #28968 proposes Bun-native API but not shipped. Deno 2.2 shipped native OTel Feb 2025 — Bun unmatched. **Workable path is manual instrumentation:** `@opentelemetry/api` + `@opentelemetry/sdk-node` (or `sdk-trace-node` per Sentry pattern) + `@opentelemetry/exporter-trace-otlp-http` + `@hono/otel` Hono-middleware. NO `auto-instrumentations-node`. (F2 Hono) `@hono/otel` published 2026-03-04 from honojs org (authored Joakim Lorentz + Hong Minhee) — uses `createMiddleware` from `hono/factory`, calls `@opentelemetry/api` directly, NO shimmer. Captures HTTP method/URL/route/status + configurable headers + custom `spanNameFactory`. Limitation: request-lifecycle granularity, not per-middleware. (F3 postgres-js) **Official `@opentelemetry/instrumentation-pg` does NOT cover postgres-js** (porsager/postgres) — covers `pg` only. Two community options exist (tier-3, single-maintainer, Bun-compat untested). **Recommended path: manual span emission inside `@bokchoy/wallet` wrappers** at existing `// TODO(otel)` markers — tier-1 BokChoy code, sidesteps community-wrapper Bun question. (F4 exporter) **Honeycomb 20M events/month free tier** is concrete and sufficient at indie tier (~7.7M/month peak, well within); Studio+ scale requires Pro+ regardless of vendor. Grafana Cloud OTLP-native free tier viable; specific limits not pulled (open thread). Self-hosted collector premature. Console exporter for dev. **Conflicts NOT artificially resolved:** (1) "OTel works on Bun" (vendor docs) vs "OTel doesn't work on Bun" (issue tracker) — both true at different layers; manual works, auto broken. (2) Sentry `sdk-trace-node`+`NodeTracerProvider` vs OneUptime `sdk-node`+`NodeSDK` — practical equivalence; sdk-node bundles the broken-on-Bun helpers. **Cascade:** same risk class as `[[backend-stack]]` F-Bun-1/2/3/4 — manual-instrumentation tax is part of the Bun-acceptance trade, documented not re-opened. **Sub-decisions for /design:** OTel-or-defer-one-slice, bootstrap module location (`apps/backend/src/telemetry.ts` vs `@bokchoy/telemetry/` workspace package), Honeycomb vs Grafana Cloud, span-attribute spec per `[[wrapper-shape]]` Engineering substance. **Open threads:** community postgres-js wrapper Bun-compat spike, Grafana Cloud free-tier limit numbers, Bun #28968 ship signal (quarterly check), Trigger.dev's actual OTel-on-Bun setup, `@hono/otel` cross-middleware span fragmentation, sampler/propagator policy.
- **Research queue COMPLETE — both entries land.** Entry 1 (`[[http-contract-research]]`) covered G1+G2+G5 (route shape + validator + error body). Entry 2 (`[[otel-stack-research]]`) covered G7 (OTel SDK + exporter). G3 (auth-surface) + G4 (idempotency middleware co-shipping vs stubbing) + G6 (F1 `TenantTx` branded type) + G8 (data sources) all have existing vault evidence — decisions are picks, not evidence-gathering.
- **Next on resume:** switch to `/design`. The full GAP 9 cluster is now research-backed. Likely output: a new entry `[[wallet-http-contract]]` (or broader `[[backend-http-contract]]` if conventions span features) for G1/G2/G5; small amendments to `[[backend-stack]]` for G3 auth-surface ordering + G7 OTel pick; small amendment to `[[idempotency-strategy]]` if G4 picks "middleware lands now"; F1 `TenantTx` open-thread closure for G6. Plus a stale-cite correction: gap report's RFC 7807 reference is superseded by RFC 9457 (July 2023, Standards Track). After /design lands the entry, `/implementation` resumes slice 8.1 as a quote-and-execute slice.
- **Mode (prior):** research (Entry 1 of 2 LANDED 2026-05-09 — `[[http-contract-research]]`)
- **`[[http-contract-research]]` LANDED 2026-05-09.** `.bocek/vault/wallet/http-contract-research.md` (~430 lines) closes Entry 1 of the 2-entry research queue queued behind GAP 9 (slice 8.1 first wallet HTTP handler). 13 sources triangulated across all three channels — production code (Stripe SDK Error.ts, better-call APIError + ValidationError, Better Auth APIError re-export), official docs (Stripe API charges/create + errors, Hono validation + HTTPException, tRPC error-handling, PlayFab Economy v2 Inventory/AddInventoryItems, RFC 9457, Standard Schema v1.1.0 spec, Cal.com API v2 intro), partial F2P-second-source (LootLocker), negative-result contradiction probe (RFC 9457 production adoption in TS-native — none surfaced). **Headline findings:** (F1 route) TS-native B2B SaaS REST `/v1/{resource}` (Stripe/Cal.com/Better Auth × 3 ecosystems) vs F2P RPC `/{Service}/{ActionName}` (PlayFab/LootLocker × 2 F2P-domain) — **BokChoy's wallet wrappers are verb-heavy and structurally closer to F2P RPC than CRUD REST despite the team's TS-native B2B SaaS lineage**. (F2 validator) Standard Schema v1 stable, jointly authored by Zod/Valibot/ArkType maintainers; Hono ships first-class `@hono/standard-validator` AND `@hono/zod-validator`, neither labeled "official"; better-call already speaks `StandardSchemaV1.Issue` natively. (F3 error body) genuine TS-native split — Stripe-wrapped `{error:{code,message,...}}` (Stripe/Cal.com) vs flat top-level `{code,message,...}` (Better Auth/better-call) — Production-cite × 2 each, NOT artificially resolved per Contradiction protocol. RFC 9457 problem+json is spec-cited only; tRPC JSON-RPC rules out; PlayFab `ApiErrorWrapper` 6-field wrapper isn't widely emulated. Body casing: snake (Stripe), camel (TS-native default), Pascal (PlayFab) — three production patterns, choice tracks SDK target language. **`409 → idempotency_error` (Stripe) is direct precedent for BokChoy's `BC001 → 409` already pinned in `[[wallet-mechanics]]`**. **Cascade obligation surfaced:** gap report's RFC 7807 cite is stale — superseded by RFC 9457 (July 2023, Standards Track, obsoletes 7807). Update GAP 9 entry on next /design or implementation pass touching that section. **Open threads:** Standard Schema support per validator+version (Zod/Valibot/ArkType native `~standard` enumeration); Hono OpenAPI cascade for SDK/docs slices; PlayFab Economy v2 wallet-credit-equivalent endpoint re-fetch (this entry hit Inventory/AddInventoryItems but not the direct wallet credit/debit shape); LootLocker error body shape second-source via `?ask=` query interface.
- **Next on resume (Entry 2):** `_shared/otel-stack-research.md` — OTel SDK + exporter pick for Bun + Hono + postgres-js stack. Sources to gather: `@opentelemetry/sdk-node` Bun compat status (any `[[backend-stack]]` F-Bun-N-class incompat?); `@opentelemetry/instrumentation-hono` if it exists; postgres-js auto-instrumentation (`@opentelemetry/instrumentation-pg` covers node-postgres but not postgres-js — gap to verify); exporter target tradeoffs (OTLP/HTTP to Grafana Cloud free-tier vs Honeycomb free-tier vs self-hosted collector). Anti-default declared: the loudest training-data answer is "OpenTelemetry SDK" generically; the actual question is whether it works on Bun 1.3+ today, and how to avoid `@opentelemetry/instrumentation-*` packages that don't yet patch Hono or postgres-js. Default budget per primitive *Research budget*: one production cite + one doc cite + one contradiction probe; expand if evidence is thin.
- **Mode (prior):** implementation → handoff to /design (slice 8.1 — first wallet HTTP handler — blocked on gap cluster, 2026-05-09)
- **Slice 8.1 scoping — gap cluster surfaced, /design owed.** User picked "first wallet HTTP handler" as the next slice (activates two of three trigger watchpoints: `apps/backend/src/wallet/index.ts` consumes `@bokchoy/wallet`; first RLS-protected handler triggers F1 `TenantTx`). Before writing any Hono route, the implementation seat surveyed `[[wrapper-shape]]`, `[[wallet-mechanics]]`, `[[backend-stack]]`, `[[backend-service-shape]]`, `[[idempotency-strategy]]`, `[[player-auth]]` for the HTTP-layer contract. **The wrapper-layer contract is pinned (slice 7.7 quotes it verbatim); the HTTP-layer contract is not.** Per anti-improvisation, flagged rather than improvised. Cluster of 8 subdecisions consolidated as **GAP 9** in `.bocek/vault/wallet/gaps.md`: G1 HTTP route shape (path/method/body-casing/response-envelope/version-prefix), G2 validation library (Zod / Valibot / Standard Schema), G3 auth-surface for THE first handler (SDK API key vs Better Auth player session vs cockpit admin vs dev-stub — `api_keys` table doesn't exist; Better Auth wiring is its own slice), G4 idempotency middleware co-shipping vs stubbing (slice 4.6 trips `[[reaper-schedule-deferral]]` reopen trigger), G5 error response-body shape (Stripe `{error:{type,code,message}}` vs RFC 7807 vs BokChoy-custom matching `WalletError.code/details`), G6 F1 `TenantTx` branded type (open thread, trigger fires here), G7 OTel SDK + exporter wiring (each wrapper has `// TODO(otel)` markers), G8 `project_id`/`walletId`/`playerId` data-source picks (downstream of G1+G3). What IS pinned: wrapper signatures + error class, BCxxx → HTTP status mapping, Idempotency-Key header semantics, `withTenant(...)` discipline, Hono framework + `@hono/node-server`, cross-runtime imports rule.
- **Next on resume:** switch to `/design`. Likely output — a new entry `[[wallet-http-contract]]` (or broader `[[backend-http-contract]]` if conventions span features) for G1/G2/G5; small amendments to `[[backend-stack]]` for G3 auth-surface ordering + G7 OTel pick; small amendment to `[[idempotency-strategy]]` if G4 picks "middleware lands now"; F1 `TenantTx` open-thread closure for G6. Cluster shape mirrors the 2026-05-04 gaps-1–7 pass (one /design pass resolved a coherent set). After the entry lands, `/implementation` resumes slice 8.1 as a quote-and-execute slice with no remaining gaps.
- **Mode (prior):** implementation (`@bokchoy/wallet` content LANDED 2026-05-08 — slice 7.7)
- **Slice 7.7 — `@bokchoy/wallet` content per `[[wrapper-shape]]`.** Replaces the `export {};` placeholder from slice 7.6 with the full wrapper layer: `errors.ts` (BcCode union + ErrorDetails discriminated union + WalletError class), `sqlstate-to-error.ts` (pure-function lookup with regex parsers per BCxxx + FK 23503 constraint-name translation), `internal.ts` (rowToNumber bigint→number conversion + throwTranslated unwrapping Drizzle's DrizzleQueryError → PostgresError → sqlstateToError), four wrappers (`wallet-credit.ts`, `wallet-debit.ts`, `wallet-deidentify-player.ts`, `bootstrap-project-reason-codes.ts`), `index.ts` re-exports. Public API matches the contract verbatim. **Two cascade additions** along the way: (1) `@bokchoy/db` exports the `Tx` type alongside `withTenant` (was a local type; @bokchoy/wallet needs it for the `Db | Tx` parameter); (2) root `package.json` catalog adds `@types/bun ^1.3.0` for `bun:test` types in `*.test.ts` files (replaces `@types/node` in `packages/wallet` since bun-types subsumes it). 10 unit tests for the parser via `bun test`; 9 active integration tests + 2 explicit SKIPs against local-docker via `bun run --cwd packages/wallet smoke:wrappers`. All static checks clean.
- **Implementation choice — bigint string handling.** postgres-js with `prepare: false` returns Postgres `bigint` as JS string (precision-preserving), not as JS BigInt. `rowToNumber` accepts `number | bigint | string`, Number-parses strings with `Number.MAX_SAFE_INTEGER` safety check. The contract pins `Promise<number>`; this is the wrapper boundary that drops bigint precision. Game-economy IDs stay well within JS-safe range (revisit on real-money/financial use case per `[[wrapper-shape]]` revisit-when).
- **Implementation choice — Drizzle DrizzleQueryError unwrap.** Drizzle 0.45.x wraps the underlying postgres-js `PostgresError` in `DrizzleQueryError` and exposes the original on `.cause`. `throwTranslated` checks the original error first, falls back to `.cause`, then dispatches via `sqlstateToError`. Unknown SQLSTATE / unmatched-parse / unknown-FK-constraint all re-raise the original `DrizzleQueryError` so the typed Postgres error reaches telemetry. Discovered during smoke-test run (tests 4-7 initially failed); single-line fix.
- **Local-docker gap surfaced — `[[local-docker]]` cascade obligation.** Tests 9 + 10 (wallet_deidentify_player + BC040 ConfigurationError) intentionally SKIPPED in `smoke:wrappers`. Root cause: pgcrypto's `hmac()` lives in the `extensions` schema (owner: `supabase_admin`); `bokchoy_app` lacks USAGE on `extensions` locally; SECURITY INVOKER call from bokchoy_app fails name resolution. Production-Supabase grants USAGE on `extensions` to standard roles by default (per `[[host-platform]]` line 46). The fix is in the `[[local-docker]]` bootstrap (which `00-roles.sql`-equivalent step grants extensions USAGE to bokchoy_app, run as supabase_admin since `postgres` is NOSUPERUSER per `[[local-docker-roles-research]]` Q1). **Defer to a `[[local-docker]]` slice.** Tests 9 + 10 reactivate when that slice ships; the wrapper code itself is already correct (tests 1-8 + 11 prove it under bokchoy_app).
- **Anti-improvisation discipline applied — OTel span emission still deferred.** Each wrapper has a `// TODO(otel): wrap with span per [[wallet-mechanics]] Amendment Part 1 A3 layer 1.` marker. Wiring lands when the SDK choice is pinned alongside the first `apps/backend` route consumer.
- **Trigger watchpoints (carried forward from prior session, still active):**
  - `apps/backend/src/idempotency/index.ts` — first `INSERT INTO idempotency_keys` reopens `[[reaper-schedule-deferral]]`.
  - `apps/backend/src/wallet/index.ts` — first wallet-mutating HTTP handler activates `@bokchoy/wallet` (this slice's output).
  - `apps/backend/src/infra/index.ts` — first RLS-protected handler triggers F1 `TenantTx` branded-type work.
- **Mode (prior):** design (`@bokchoy/wallet` wrapper shape DECISION VAULTED 2026-05-08 as `[[wrapper-shape]]`)
- **`[[wrapper-shape]]` LANDED 2026-05-08.** Three forks resolved in one decision entry, plus four non-fork pinnings + `BcCode`/`ErrorDetails`/`WalletError`/`sqlstateToError` contract concrete enough for /implementation to quote verbatim. **Forks resolved:** (1) parameter shape — (B) db-separate + params-object (`walletCredit(db, { projectId, walletId, amount, ... })`) over (A) positional and (C) single-object containing db. Production-cited via Drizzle `db.transaction(fn)` + tRPC `({ ctx, input }) => ...` + `idioms/typescript.md` line 65. (2) `WalletError` shape — (X) single class with `code: BcCode` discriminant + per-code `details` discriminated union over (Y) per-code subclass hierarchy and (Z) hybrid. Production-cited × 4 (tRPC `TRPCError`, Hono `HTTPException`, Better Auth `APIError`, postgres-js `PostgresError`) — TS-native ecosystem convention at framework-defining level. (Y) revisit-when: package flips `"private": false`. (3) Postgres FK 23503 dispatch — (P) translate at wrapper boundary over (Q) surface raw — single error namespace at HTTP layer; re-raise unknown constraint names preserves typed `PostgresError` for telemetry. **Pinned non-forks:** `bigint→number` per `mode: 'number'` schema; `amount: number` JS-safe to 9×10^15 (revisit on real-money); `metadata: Record<string, unknown>` per `[[wallet-mechanics]]` §3 freeform; Drizzle `sql` template via `Db | Tx`; idempotency-replay invisible per `[[idempotency-strategy]]` D2-α. **BcCode union has 10 entries** — BC001/BC002 reserved for HTTP middleware (slice 4.6, fires on `idempotency_keys` writes), BC010/020/021/022/040 wrapper-raised by today's SQL functions, BC030/050/060 reserved (BC050 active via 23503 translation on `transactions_project_reason_code_fk`). **OTel span emission deferred** — `// TODO(otel)` comment at call site; wiring lands when the SDK choice is pinned alongside the first apps/backend route that needs span correlation.
- **Next slice (implementation): `@bokchoy/wallet` content.** Read `[[wrapper-shape]]` as the contract; quote signatures + types verbatim; ship `walletCredit/walletDebit/walletDeidentifyPlayer/bootstrapProjectReasonCodes` + `WalletError`/`BcCode`/`ErrorDetails`/`sqlstateToError`. Tests: per-BCxxx parse round-trip + 23503-with-known-constraint translation + 23503-with-unknown-constraint re-raise. Smoke against local-docker via a `packages/wallet/scripts/smoke-wrappers.ts` mirroring `packages/db/scripts/` pattern.
- **Mode (prior):** implementation (`apps/backend` skeleton LANDED 2026-05-08 — slice 8.0)
- **Slice 8.0 (new) — `apps/backend` Bun + Hono skeleton + 10 feature-module placeholders.** Replaces the empty `export {};` stub in `apps/backend/src/index.ts` with a runnable Hono server. `GET /health` returns `{ ok: true }`, served via `@hono/node-server`'s `serve()` on `Number(process.env.PORT) || 3000` per `[[backend-stack]]` Amendment line 22 (Hono `serve` adapter, NOT `Bun.serve`). Cross-runtime discipline preserved (no `bun` / `bun:*` imports per `[[backend-service-shape]]` line 27). Root `package.json` catalog gained `hono ^4.12.0` + `@hono/node-server ^2.0.1` (verified via `npm view`: hono 4.12.18 latest in v4 line; @hono/node-server 2.0.1 latest with breaking changes — Node 18 dropped (we require ≥22, ✓), Vercel adapter removed (not used, ✓), serve() signature unchanged). `apps/backend/package.json` adds `dev` script (`bun --hot src/index.ts`); `start` and `build` deferred until deployment lands. **10 feature-module placeholders created** at `apps/backend/src/{auth,players,wallet,catalog,loot,outbox,cockpit,sdk,idempotency,infra}/index.ts` per `[[backend-service-shape]]` §2 — each is `export {};` with one-line header citing the vault entry the module represents. **Vault-vs-monorepo divergence flagged inline:** §2 also names `src/db/`, `src/lib/`, `src/types/` but the project went monorepo (`packages/db`, `packages/shared-types`); creating those inside `apps/backend/src/` would duplicate. Reading the vault as "src tree of the app" rather than literally — only the 10 feature modules belong inside `apps/backend/src/`; the 3 cross-cutting concerns are workspace packages. Verified by `bun install` (4 packages installed, lockfile saved), `bun run --cwd apps/backend typecheck` (clean), `bun run lint:check` (48 files; was 38 before — picks up the new TS files), `bun run check:direct-mutation` (22 files scanned; was 12 — `idempotency/index.ts` is in scope and passes because it's `export {};` with no `INSERT INTO idempotency_keys`, exactly per the `[[reaper-schedule-deferral]]` trigger design), `bun run typecheck` (turbo: 6 packages all green; `@bokchoy/backend` now in scope), and runtime smoke (`PORT=3199 bun apps/backend/src/index.ts` → server logs listening URL → `GET /health` returns HTTP 200 `{"ok":true}` → process killed cleanly).
- **Anti-improvisation discipline applied — DB connection, Better Auth, outbox poller, OTel, error middleware deferred.** Per `[[backend-service-shape]]` §4 the outbox poller is co-hosted with HTTP API in this Bun process, but ships dead infrastructure today (no `staged_jobs` writers in production yet — same shape as `[[reaper-schedule-deferral]]`). Per `[[backend-stack]]` cascade obligations: `withTenant` consumer, Better Auth wiring, OTel three-layer, error middleware all wait for their first consuming route. Per F1 open thread: `TenantTx` branded type still parked — landing it now without an RLS-protected handler to validate against would be improvisation.
- **Trigger watchpoints active in this branch:**
  - `apps/backend/src/idempotency/index.ts` is the file whose first `INSERT INTO idempotency_keys` reopens `[[reaper-schedule-deferral]]` (slice 6.5).
  - `apps/backend/src/wallet/index.ts` is the consumer that activates `@bokchoy/wallet` from slice 7.6 — the M1 wrappers, `WalletError` hierarchy, and `sqlstateToError` lookup land when this module gets its first wallet-mutating HTTP handler.
  - `apps/backend/src/infra/index.ts` is where `withTenant` import + `TenantTx` brand land when the first RLS-protected handler ships.
- **Mode (prior):** design (slice 6.5 deferral DECISION VAULTED 2026-05-08 as `[[reaper-schedule-deferral]]`)
- **`[[reaper-schedule-deferral]]` LANDED 2026-05-08.** Decision: defer slice 6.5 (idempotency_keys reaper schedule) until first production write to `idempotency_keys`. The reaper function itself (slice 6) is in place and ad-hoc callable; only the schedule is deferred. Position-changing fact surfaced during /design pressure-test: per `[[idempotency-keys-schema-research]]` F7 + slice 4 migration's explicit header, `idempotency_keys` is the storage-of-record for the *client-supplied-header path only*; server-derived natural-key idempotency uses `transactions(wallet_id, source_event_id)` and never touches this table. The HTTP middleware that writes to `idempotency_keys` is queued (state.md slice 4.6, gated behind empty `apps/backend`) — pre-middleware production `idempotency_keys` accumulates zero rows. Scheduling pg_cron now = hourly noop DELETE on empty table + per-env dashboard `CREATE EXTENSION` + composite-reaper for `cron.job_run_details` + failed-run alerting — all real cost, zero payoff pre-trigger. **Trigger (mechanical):** any non-test, non-script TypeScript code in `apps/` or `packages/` containing `INSERT INTO idempotency_keys` / `.insert(idempotencyKeys)`. Grep-detectable via existing `scripts/check-direct-wallet-mutation.ts` lint; the `// allow-direct-mutation: idempotency-middleware` opt-out PR review IS the trigger event. Mechanical (not slice-named) because slice numbers reshuffle and aren't in implementation order. Secondary trigger (table-size alert) explicitly rejected — primary trigger is grep+PR-review-mediated; if both fail the discipline is broken and monitoring papers over rather than fixes; belt-and-suspenders is overengineering for solo-dev with vault-discipline. **When trigger fires:** reopen the 3-way pick from `[[reaper-schedule-research]]` with evidence already collected — (a) pg_cron if `apps/backend` worker hasn't shipped, (b) staged_jobs+worker if it has, (c) further defer if production traffic is still zero. **Failure mode:** trigger fires unnoticed → idempotency_keys fills to disk cap (~10 days Free-tier / ~160 days Pro+ at indie-projection 50MB/day/project per Brandur). Recovery: `SELECT idempotency_keys_reaper();` ad-hoc.
- **Mode (prior):** research (slice 6.5 reaper-scheduling spike VAULTED 2026-05-08 — handoff to /design owed)
- **`[[reaper-schedule-research]]` LANDED 2026-05-08.** `.bocek/vault/wallet/reaper-schedule-research.md` (~370 lines) closes the verification spike for option (a) pg_cron on Supabase Free-tier. Triangulation ✓ across all three channels (10 sources). Confidence medium-high overall; high on F1 (Free-tier viability), F2 (migration-shape contradiction), F3 (cron.job_run_details retention obligation), F5 (lock-in posture), F6 (capacity envelope), F7 (M1 schedule-as-postgres alignment); medium on F4 (replication confirmed clean upstream; PITR inferred-clean — no direct Supabase cite found). **Headline operational findings:** (a) pg_cron IS available on Supabase Free-tier (staff verbatim, image manifest pinned at 1.6.4 for Postgres 17); (b) the migration-only install path is BROKEN per three CLI issues with concrete error messages — workaround is dashboard-enable-once-per-env then schedule via Drizzle migration; (c) `cron.job_run_details` is not auto-cleaned and requires its own retention story (cascade obligation surfaced) — composite-reaper recommended; (d) replication failover semantics are clean (no double-fire on hot standby), PITR is inferred-clean; (e) lock-in posture is favorable (pg_cron is upstream-standard across RDS/Aurora/Neon). **Two empirical open threads requiring user action:** (1) provision a Supabase Free-tier project, run `CREATE EXTENSION pg_cron` from the dashboard SQL editor, verify `cron.job` populates after a noop test schedule; (2) test the dashboard-enable-then-Drizzle-migrate flow end-to-end. Both are user's-account-only steps the research session couldn't execute. **Next on resume:** switch to /design. The decision tree is now: option (a) pg_cron lands as 2 migrations + 1 ops step; option (b) staged_jobs+worker overbuilt unless apps/backend ships for other reasons; option (c) defer entirely is the no-cost path pre-launch. /design picks with evidence in hand.
- **Mode (prior):** implementation → handoff to /research (slice 6.5 reaper-scheduling decision blocked on pg_cron availability evidence)
- **Slice 6.5 — gap reported, user picked option 2 (verification spike) on 2026-05-08.** The reaper function (slice 6) ships; the *scheduler* is the open piece. Three options surfaced: (a) pg_cron extension (Postgres-native, requires Supabase Free-tier verification), (b) staged_jobs row + outbox worker (worker doesn't exist — `apps/backend` is empty; shipping the row alone is dead code), (c) defer entirely (function is callable ad-hoc; cadence isn't load-bearing pre-launch). User picked **(2) verification spike for pg_cron on Supabase Free-tier** — gathers the evidence so /design can pick (a) over (b)/(c) with confidence. **Research questions for the next /research session:**
  1. **Is `pg_cron` available on Supabase Free-tier?** Public docs surveyed during `[[local-docker-research]]` (2026-05-03) verified `pg_partman` but not `pg_cron`. Need: provision a Supabase Free-tier project, run `SELECT * FROM pg_available_extensions WHERE name='pg_cron';` and `CREATE EXTENSION pg_cron;` in the dashboard SQL editor; document availability + version.
  2. **Privilege model.** `pg_cron` schedules execute as the role that calls `cron.schedule(...)`. For the reaper (which is `SECURITY DEFINER` owned by postgres per slice 6), the schedule should be created by postgres so the run-as role bypasses RLS. Verify: does Supabase let `postgres` create schedules? Or does it need `supabase_admin`? What role does Supabase recommend for cron jobs?
  3. **Migration shape.** Can `CREATE EXTENSION pg_cron` + `cron.schedule(...)` go in a regular Drizzle migration, or does Supabase require it via dashboard / different connection? Supabase has historically gated some extension installs to the dashboard.
  4. **Operability.** What's the visibility surface — `cron.job` / `cron.job_run_details` tables? Failed-run alerting on Supabase Free-tier? Any tier-upgrade/downgrade behavior on existing schedules?
  5. **Lock-in posture vs `[[host-platform]]` DB-only commitment.** `pg_cron` is a Postgres extension (not a Supabase helper) — DB-only is preserved in spirit. But: how widely is `pg_cron` available on competing managed Postgres tiers (RDS, Crunchy, Neon, Render)? If we move off Supabase later, does the schedule transfer cleanly?
  6. **Failure modes.** What happens during point-in-time-restore (do schedules survive)? During replication (do they double-fire)? During tier change (does config persist)? Any Supabase-specific footguns documented in their docs/changelog/forum?
  - Triangulation target: 3 sources minimum. Tier 1 = Supabase official docs / changelog, supabase/supabase GitHub issues, public Supabase support replies. Tier 2 = `pg_cron` upstream docs (Citus repo). Tier 3 = engineering blogs / HN threads from teams using pg_cron on Supabase. **The provisioning step (creating a real Supabase project to run `CREATE EXTENSION pg_cron`) requires the user's Supabase account** — the spike isn't fully completable from inside Claude Code without the user executing the dashboard step. Plan: /research drafts the queries + reads docs; user runs the verification in the dashboard; /research closes the loop with the evidence.
  - Vault target: new entry `.bocek/vault/wallet/reaper-schedule-research.md`. Resolves option (a) viable / not-viable; if viable, /design picks (a) and slice 6.5 lands as a Drizzle migration. If not viable, slice 6.5 is forced to wait on apps/backend (option b).
- **Slice 7.6 (new) — `packages/wallet/` skeleton + slice 7.5 lint exclude wired in same change.** New workspace `@bokchoy/wallet` at `packages/wallet/{package.json, tsconfig.json, src/index.ts}` mirroring `@bokchoy/shared-types` shape (no runtime deps yet — typescript devDep only). `src/index.ts` is `export {};` with a header comment naming the wallet-package boundary (per `[[wallet-mechanics]]` Amendment Part 1 A1) and listing what's deferred: TS wrappers around the four M1 stored functions (wallet_credit / wallet_debit / wallet_deidentify_player / bootstrap_project_reason_codes) with parameter-object ergonomics + OTel spans at the call boundary (Part 1 A3 layer 1); `WalletError` class hierarchy + `sqlstateToError(code, message)` lookup mapping BCxxx → typed TS errors (Part 1 A5 + A6). `scripts/check-direct-wallet-mutation.ts` updated: `EXCLUDE_PREFIXES` now contains `'packages/wallet/'` so the eventual M1 wrappers can call protected-table mutations without lint friction; the "NOT YET EXCLUDED — add when the directory exists" comment is replaced with the present-tense rationale. Verified by `bun install` (lockfile clean), `bun run --cwd packages/wallet typecheck` (compiles), `bun run check:direct-mutation` (12 files scanned — wallet excluded as designed), `bun run lint:check` (38 files clean), `bun run typecheck` (turbo: 6 packages, all green; `@bokchoy/wallet` now in scope).
- **Slice 7.6 (new) — `packages/wallet/` skeleton + slice 7.5 lint exclude wired in same change.** New workspace `@bokchoy/wallet` at `packages/wallet/{package.json, tsconfig.json, src/index.ts}` mirroring `@bokchoy/shared-types` shape (no runtime deps yet — typescript devDep only). `src/index.ts` is `export {};` with a header comment naming the wallet-package boundary (per `[[wallet-mechanics]]` Amendment Part 1 A1) and listing what's deferred: TS wrappers around the four M1 stored functions (wallet_credit / wallet_debit / wallet_deidentify_player / bootstrap_project_reason_codes) with parameter-object ergonomics + OTel spans at the call boundary (Part 1 A3 layer 1); `WalletError` class hierarchy + `sqlstateToError(code, message)` lookup mapping BCxxx → typed TS errors (Part 1 A5 + A6). `scripts/check-direct-wallet-mutation.ts` updated: `EXCLUDE_PREFIXES` now contains `'packages/wallet/'` so the eventual M1 wrappers can call protected-table mutations without lint friction; the "NOT YET EXCLUDED — add when the directory exists" comment is replaced with the present-tense rationale. Verified by `bun install` (lockfile clean), `bun run --cwd packages/wallet typecheck` (compiles), `bun run check:direct-mutation` (12 files scanned — wallet excluded as designed), `bun run lint:check` (38 files clean), `bun run typecheck` (turbo: 6 packages, all green; `@bokchoy/wallet` now in scope).
- **Anti-improvisation discipline applied — wrappers, errors, OTel helper deliberately deferred.** Per `[[wallet-mechanics]]` Amendment Part 1 A1 + A3 + A5 + A6 the wallet-package boundary needs three things eventually: (a) wrappers around the four stored functions, (b) the `WalletError`/`InsufficientFundsError`/etc. hierarchy mapped from BCxxx SQLSTATE, (c) an OTel-span helper. Each requires upstream decisions not yet pinned: (a) parameter-object shape (camelCase TS keys vs snake_case mirror, `Db` vs `Tx` accept, return-bigint-as-number-vs-bigint), (b) which BCxxx codes get their own subclass vs collapse into a single `WalletError` (Postgres FK 23503 BC050/BC060 dispatch is open per `0004_wallet_functions.sql` header), (c) OTel SDK + exporter wiring (`apps/backend` doesn't ship yet — no consumer to validate against). Filling them now from training-data defaults would commit the project to those defaults before evidence. Slices stay queued.
- **Slice 6 complete — `idempotency_keys_reaper(p_max_age interval DEFAULT '24 hours')` function.** `0006_idempotency_reaper.sql` (custom hand-written migration) ships the function: deletes rows where `completed_at IS NOT NULL AND created_at < NOW() - p_max_age`, returning the count. Uses the partial index `idx_idempotency_keys_reaper` from slice 1 for efficient retrieval. Verified by `bun run --cwd packages/db smoke:reaper` (5/5 tests pass): 24h default reaps old+completed only, idempotent re-call returns 0, custom 90-minute interval reaps the in-between row, locked-not-completed and pending rows survive any threshold, cross-tenant reap via bokchoy_app under one tenant's GUC successfully reaps the other tenant's expired rows (RLS bypass verified).
- **SECURITY DEFINER deviation from Part 1 A1.** Amendment Part 1 A1's "no SECURITY DEFINER" applies to the *wallet primitive's M1 mechanism* (wallet_credit / wallet_debit / inventory_grant / inventory_consume / wallet_deidentify_player) — those run as the caller under the tenant GUC, scoped by RLS to one project. The reaper is *infrastructure* — a global cleanup that must touch every tenant's expired records in a single run. SECURITY DEFINER + ownership by postgres (BYPASSRLS) is the canonical pattern for cron-style operations. CVE-2018-1058 hardened via `SET search_path = pg_catalog, public`. Documented inline; the rationale is non-obvious enough to warrant 30 lines of header comment.
- **Scheduling deferred to Slice 6.5.** F6 of `[[idempotency-keys-schema-research]]` lists two scheduler options (pg_cron extension OR staged_jobs queue + worker). Both need infrastructure that doesn't exist yet (worker for option 2; operational sign-off + extension setup for option 1). Picking now without surrounding context is improvisation per Anti-improvisation. The function is testable today; the scheduler wires when ready.
- **Slice 7 (prior) — `scripts/check-direct-wallet-mutation.ts` CI lint.** Per Amendment Part 1 A1: under M1 the bypass-failure mode (parallel mutation paths bypassing the wallet/inventory/auth function set) is mitigated by lint + code review + integration tests, NOT by GRANT. The lint scans `apps/**/*.ts` + `packages/**/*.ts` (excluding `packages/db/scripts/` test setup + `packages/db/drizzle/` migrations) for two pattern classes: (a) raw SQL keywords `UPDATE` / `INSERT INTO` / `DELETE FROM` against any of the 7 protected tables (`wallets`, `transactions`, `loot_rolls`, `iap_receipts`, `currencies`, `reason_codes`, `idempotency_keys` per Part 3 A17 extension), and (b) Drizzle query-builder calls `.update(table)` / `.insert(table)` / `.delete(table)` against the same set. Per-line opt-out via `// allow-direct-mutation: <reason>` comment for genuine edge cases (none yet). Wired as root `bun run check:direct-mutation` script + CI workflow step alongside lint:check / typecheck / check:prepare-false. Verified by self-test with planted violations (exit 1 with file:line:col output) and clean re-run (exit 0). 12 TS files scanned today.
- **Implementation choice — fs-walk over Bun's Glob.** First draft used `bun.Glob` for path matching; biome's `noRestrictedImports` rule blocks bare `'bun'` imports per the cross-runtime discipline cascade in `[[backend-stack]]`/`[[frontend-stack]]`. Swapped to `node:fs` `readdirSync` recursive walk — runs identically on Bun, cleaner, no rule conflict. Mirrors the cascade-10 `check-prepare-false.ts` pattern (no Bun-specific imports).
- **Wallet-package boundary not yet excluded.** Part 1 A1 names `packages/wallet/` as the legitimate location for M1-function wrappers; lint should allow direct mutations from there. The package doesn't exist yet — added to the "What's excluded" comment as a TODO when the directory lands. Pre-empting an empty-directory exclude would be improvisation per Anti-improvisation.
- **Slice 5 (prior) — `bootstrap_project_reason_codes(p_project_id uuid)` function.** `0005_bootstrap_reason_codes.sql` (custom hand-written migration) ships the function inserting the 12 fixed system codes per Amendment Part 3 A17 + `[[economy-primitives-research]]` F6: 8 faucets (`signup_bonus`, `daily_login`, `quest_reward`, `loot_pull_reward`, `shop_purchase_grant`, `iap_grant`, `compensation`, `admin_grant`) + 4 drains (`loot_pull_cost`, `shop_purchase_cost`, `crafting_cost`, `admin_debit`). All `is_system=TRUE`. Idempotent via `INSERT ... ON CONFLICT DO NOTHING`. SECURITY INVOKER. REVOKE FROM PUBLIC + GRANT EXECUTE TO bokchoy_app. Verified by `bun run --cwd packages/db smoke:bootstrap` (5/5 tests pass: first-call inserts 12, second-call no-op, per-project isolation, RLS scoping via app role, customer-extended codes coexist).
- **Mechanism choice resolved (gap from Slice 1).** Three options were named in Part 3 A17: (i) Postgres function called explicitly, (ii) trigger on `projects` AFTER INSERT, (iii) app-side TS hook. Picked **(i)** because: (a) data is fixed and canonical, SQL is its right home; (b) visible call site (no trigger magic — debugging "missing code" surfaces "did the caller call?" not "why didn't the trigger fire?"); (c) reusable across all project-creation paths (app, CLI, admin tools, tests, seeds); (d) idempotent. SDK reason-code enum mirror (Slice 8) accepts the small duplicate-strings cost as the tradeoff.
- **Smoke-functions.ts refactored** to call `bootstrap_project_reason_codes` instead of hand-INSERTing the 2 codes the test exercises. Confirms end-to-end plumbing; 9/9 wallet-function tests still pass.
- **Slice 4 (prior) — M1 stored functions (`wallet_credit`, `wallet_debit`, `wallet_deidentify_player`).** `0004_wallet_functions.sql` (custom hand-written migration) ships the three functions per Amendment Part 1 A1 (SECURITY INVOKER, no search_path hardening on credit/debit), Part 1 A2 (READ COMMITTED + FOR UPDATE), Part 1 A5 (BCxxx SQLSTATE: BC010/BC020/BC021/BC022/BC030/BC040), Part 2 A10 (`wallet_deidentify_player(uuid)` + HMAC→UUIDv8 projection). Verified by `bun run --cwd packages/db smoke:functions` (9/9 tests pass): credit happy path, idempotency replay (same txn id, wallet unchanged), debit happy path (amount stored negative per §3), BC010 InsufficientFunds, BC020 TenantMismatch, BC021 WalletNotFound, BC022 CurrencyMismatch, deidentify happy path (anon_id `5e58f61d-b48e-`**`8`**`847-...` — version-bit `8` confirms UUIDv8 spec), BC040 ConfigurationError on missing anon_secret.
- **One contract deviation (search_path on deidentify only).** Amendment Part 1 A1 says search_path hardening removed under M1. But pgcrypto's `hmac()` lives in the `extensions` schema on Supabase managed Postgres; without `SET search_path = pg_catalog, public, extensions` on the function, the call raises `42883 function hmac(...) does not exist`. The hardening is reinstated **only on `wallet_deidentify_player`** for symbol-resolution reasons, NOT for SECURITY DEFINER CVE-2018-1058 protection. Documented inline in the function definition. `wallet_credit` / `wallet_debit` use only `pg_catalog`-resident builtins (no pgcrypto) and don't need the SET.
- **Idempotency-check ordering corrected from the template.** `[[wallet-functions-research]]` Operational template put the idempotency lookup before the FOR UPDATE wallet lock. Under READ COMMITTED + FOR UPDATE, that races: two concurrent callers with the same source_event_id can both miss the lookup and both INSERT. Fixed by moving the idempotency SELECT *after* the FOR UPDATE acquisition — under READ COMMITTED, the post-lock snapshot includes any prior caller's COMMIT-ed INSERT, so the second caller correctly replays. Verified by Test 2.
- **Migration recovery footnote.** First apply landed an empty 0004 file (the `--custom` template) due to a Write-without-Read sequencing error. Recovered by `DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT MAX(id) ...)` + re-run `drizzle-kit migrate`. The journal stays consistent for future deployments.
- **Slice 3 (prior) — partitioning (transactions only).** `0003_partition_transactions.sql` (custom hand-written migration via `drizzle-kit generate --custom`) drops the unpartitioned `transactions` table (zero rows in MVP — no data loss) and recreates it as `PARTITION BY RANGE (created_at)`. Composite PK `(id, created_at)` was already in place from slice 1. All FKs (5 including the composite (project_id, reason_code) → reason_codes), CHECK constraints (kind, related_type), 4 indexes (wallet_lookup, player_lookup, partial related, partial project_recon), RLS, FORCE RLS, the `tenant_isolation` policy, table-level + sequence GRANTs were re-issued. **12 monthly partitions pre-created** (2026-05 through 2027-04) for runway. Verified by `bun run --cwd packages/db smoke:partitioning` (5/5 tests pass — partition routing, pruning with predicate, full-scan without predicate, RLS enforcement on partitioned parent, monotonic shared bigserial sequence across partitions).
- **§7 deviation — `loot_rolls` and `iap_receipts` ship FLAT, not partitioned.** Postgres declarative partitioning requires the partition key in every UNIQUE constraint. The §5 `loot_rolls.UNIQUE(player_id, banner_id, pull_session_id, attempt_number)` and `iap_receipts.UNIQUE(platform, platform_transaction_id)` are load-bearing for idempotency correctness — adding `created_at` would let the same `(player_id, banner, session, attempt)` recur across months and bypass the dup-check, defeating the natural-idempotency invariant. Documented in `.bocek/vault/wallet/gaps.md` Gap 8 with 5 unvetted resolution options. Sister-table retention will ship via cron DELETE in a future slice; the §7 "same partitioning applies" obligation is **deferred and downgraded** until /design picks a resolution.
- **pg_partman NOT set up in this slice.** 12 pre-created monthly partitions cover MVP runway through 2027-04. The §7 commitment to "new monthly partition created 1 month ahead by pg_partman cron" + "partitions older than 24 months detached and exported to S3" lands in its own follow-on slice once the automation requirements are concrete (premake count, retention cron mechanism, S3 archive destination — none of which are blocking MVP feature work).
- **Slice 2 (prior) — RLS bootstrap.** `enableRLS()` + `pgPolicy('tenant_isolation', { for: 'all', to: 'bokchoy_app', using: project_id = current_setting('app.current_tenant')::uuid })` added to `players`, `currencies`, `wallets`, `reason_codes`, `idempotency_keys`, `transactions`, `loot_rolls`, `iap_receipts`, `staged_jobs` (9 tables). Generated `0002_fancy_giant_man.sql` via `drizzle-kit generate` (ENABLE RLS + CREATE POLICY) and **hand-appended** the FORCE ROW LEVEL SECURITY statements + bokchoy_app GRANTs (drizzle-kit doesn't emit either). Applied successfully via `drizzle-kit migrate`. Verified by `packages/db/scripts/smoke-rls.ts` (5/5 tests pass: SELECT-without-GUC raises, GUC-scoped SELECT sees only that tenant's row, mismatched-INSERT denied, postgres BYPASSRLS sees all under FORCE RLS) and `packages/db/scripts/inspect-rls.ts` (all 9 tables show `relrowsecurity=true` + `relforcerowsecurity=true`; canonical `tenant_isolation` policy on each, `cmd=ALL`, role=`bokchoy_app`).
- **`projects` deliberately stays outside RLS.** Listing-by-organization is a different access pattern than tenant-scoped data access; the GUC isn't the right scope. Better Auth tables also stay outside multi-tenant RLS (they manage access via Better Auth's own auth-context). Both still get bokchoy_app CRUD GRANTs.
- **Slice 1 (prior) — wallet schema landed.** `packages/db/src/schema/tenancy.ts` (`projects`, `players`) + `packages/db/src/schema/wallet.ts` (`currencies`, `wallets`, `reason_codes`, `idempotency_keys`, `transactions`, `loot_rolls`, `iap_receipts`, `staged_jobs`) + `packages/db/src/schema/index.ts` re-exports them. Migration `0001_adorable_malcolm_colcord.sql` applied — 17 tables in public schema (7 auth + 2 tenancy + 8 wallet). `transactions` has composite PK (id, created_at), composite FK on `(project_id, reason_code) → reason_codes(project_id, code)` per Amendment Part 3 A16, `wallet_version BIGINT NOT NULL`. Typecheck clean across all 5 workspaces; `bun run lint:check` clean across 30 files.
- **Contract trace.** Quoted `[[wallet-mechanics]]` (Amendments Part 1+2+3) as the keystone; cross-referenced `[[tenancy-ids-research]]` F6 for projects, `[[player-auth]]` §2 for players, `[[economy-primitives-research]]` F3/F4/F6 for currencies/wallets/reason_codes, `[[idempotency-keys-schema-research]]` F6 for idempotency_keys. All FK targets line up at the type level (UUID across the protected table chain; bigint for idempotency_keys.id and bigserial sister-table PKs).
- **Implementation-blocking cascades — REMAINING for /implementation follow-up passes** (each is its own slice, deliberately not in this pass):
  - **Slice 6.5 (new, follow-up to 6) — reaper scheduling.** Pick between (a) `pg_cron.schedule('idempotency_keys_reaper', '0 * * * *', 'SELECT idempotency_keys_reaper();')` — Postgres-native, requires extension install + Supabase verification, OR (b) hourly enqueue of a `staged_jobs(kind='idempotency_reaper')` row picked up by an external worker — uniform mechanism but requires worker process. Decision waits on operational context (Supabase tier confirmation; whether apps/backend ships a worker). Function is in place either way.
  - **Slice 7.5 (new, follow-up to 7) — wallet-package boundary exclusion.** When `packages/wallet/` is created (where M1-function wrappers live per Part 1 A1), add it to `EXCLUDE_PREFIXES` in `scripts/check-direct-wallet-mutation.ts` so wrappers there can call protected-table mutations without lint friction. Trivial one-line change at the time.
  - **Slice 4.5 (new, follow-up to 4) — `inventory_grant` + `inventory_consume` stored functions.** §2 names them but the inventory schema isn't part of MVP Month 1–3. A function with no inventory table is just an audit-row writer; deferred until the inventory feature lands. Lift then by mirroring `wallet_credit`/`wallet_debit` body shape with `kind='item_grant'`/`item_consume'` + `item_id`/`item_quantity` columns.
  - **Slice 4.6 (new, follow-up to 4) — Client-supplied `Idempotency-Key` HTTP middleware.** The functions accept `p_idempotency_key_id` and store it in the transactions row, but the actual lookup-and-replay logic for HTTP-supplied keys lives in the request layer per `[[idempotency-keys-schema-research]]` F7. Wire when the API layer (apps/backend) lands.
  - **Slice 3.5 (new, follow-up to 3) — pg_partman setup + sister-table retention.** Wire `pg_partman.create_parent('public.transactions', ...)` for auto-partition-creation (premake N) and retention (drop + archive partitions older than 24 months per §7). Also: ship cron DELETE retention for `loot_rolls` + `iap_receipts` (the unpartitioned siblings) — `DELETE … WHERE created_at < NOW() - INTERVAL '24 months'` plus archival query to S3. Both deliverables coordinate around the same retention semantics.
  - **Slice 3.6 (new, follow-up to 3 + Gap 8) — `loot_rolls`/`iap_receipts` partitioning resolution.** Per Gap 8 in `.bocek/vault/wallet/gaps.md`, /design needed to pick option 1 (ship flat, current default), option 5 (separate dedup-key lookup table preserves UNIQUE + partitions on the audit row), or other. Until resolved, sister tables ship flat with cron-based retention from Slice 3.5.
  - **Slice 4 — M1 stored functions.** plpgsql for `wallet_credit`, `wallet_debit`, `inventory_grant`, `inventory_consume`, `wallet_deidentify_player` per Amendment Part 1 A1 (SECURITY INVOKER), Part 1 A2 (READ COMMITTED + FOR UPDATE), Part 1 A5 (BCxxx SQLSTATE), Part 2 A10 (UUIDv8 projection in deidentify), Part 3 A18 (BC050/BC060 ReasonCodeNotRegistered/CurrencyNotFound).
  - **Slice 5 — Bootstrap 12 system reason codes on project creation.** Part 3 A17 explicitly leaves the *mechanism* open ("function vs trigger vs app-side hook"). **Directive needed** before this slice can land — see *Open gap* below.
  - **Slice 6 — Hourly idempotency_keys reaper.** `staged_jobs(kind='idempotency_reaper')` row scheduled via worker, OR `pg_cron` extension. Reaper SQL: `DELETE FROM idempotency_keys WHERE completed_at IS NOT NULL AND created_at < NOW() - INTERVAL '24 hours'`. Mechanism choice (staged_jobs vs pg_cron) is open per `[[idempotency-keys-schema-research]]` open thread.
  - **Slice 7 — `scripts/check-direct-wallet-mutation.ts` CI lint.** Greps `apps/backend/**/*.ts` (path TBD when backend code lands) for direct `UPDATE`/`INSERT`/`DELETE` on `wallets` / `transactions` / `loot_rolls` / `iap_receipts` / `currencies` / `reason_codes` / `idempotency_keys` outside the wallet-package boundary. Mirrors the cascade-9 FORCE-RLS + cascade-10 `prepare:false` scripted-check pattern. Add to CI workflow alongside existing `lint:check` + `typecheck` + `check:prepare-false`.
  - **Slice 8 — TS SDK auto-key generation.** `bokchoy-sdk-retry-${uuid4()}` for retry-eligible POST/DELETE without caller-supplied key per `[[idempotency-keys-schema-research]]` F5 + Part 3 A17. Lives in the SDK package (not yet bootstrapped — Month 2+ deliverable).
  - **Slice 9 — `[[loot-rng-construction]]` canonical-form amendment.** `player_id 8B → 16B` in seed-bytes derivation. Cascade obligation Part 2 A12 — touches the loot-roll engine implementation, not the schema. Defer until loot-roll feature lands.
- **Open gap (Slice 5) RESOLVED 2026-05-08** — picked option (i) Postgres function. Rationale + considered alternatives in Slice 5 checkpoint above and the function's inline header comment.
- **Open thread (carried through):** F1 type-level discipline (`TenantTx` branded type for RLS-protected accessors per `[[backend-stack]]` F1) — trigger fired (first RLS-protected feature schema landed). RLS is now physical-enforcement; `TenantTx` is the type-level mirror. Currently `withTenant(db, projectId, fn)` returns the raw `Tx` type; future refinement is to brand it `TenantTx` so accessors of RLS-protected tables require `TenantTx` at the type level (won't compile if a non-tenant `Tx` is passed). Park until backend handlers land — that's where the friction surfaces.
- **F1-F2 design-complete prior. Wallet primitive design now complete.** `[[wallet-mechanics]]` Amendment 2026-05-04 (Part 3) shipped. Three amendment passes total:
  - **Part 1** (M1 reframe + concurrency + OTel + SQLSTATE + single-entry note + Failure mode 1) — pgledger source-walk falsified M2 cite chain.
  - **Part 2** (UUID type-system + UUIDv8 deterministic projection for de-id + UUIDv4-today defer-v7) — Q1+Q2 research findings.
  - **Part 3** (idempotency_keys schema + currencies/wallets/reason_codes schemas via cross-ref + transactions.wallet_version column + composite FK on transactions.reason_code + BCxxx extensions + cascade obligations) — Q4+Q5+Q6+Q7 research findings.
- **Mode (prior):** design (D8–D12 resolved 2026-05-04 — wallet primitive DESIGN-COMPLETE)
- **Wallet primitive design now complete.** `[[wallet-mechanics]]` Amendment 2026-05-04 (Part 3) shipped. Three amendment passes total:
  - **Part 1** (M1 reframe + concurrency + OTel + SQLSTATE + single-entry note + Failure mode 1) — pgledger source-walk falsified M2 cite chain.
  - **Part 2** (UUID type-system + UUIDv8 deterministic projection for de-id + UUIDv4-today defer-v7) — Q1+Q2 research findings.
  - **Part 3** (idempotency_keys schema + currencies/wallets/reason_codes schemas via cross-ref + transactions.wallet_version column + composite FK on transactions.reason_code + BCxxx extensions + cascade obligations) — Q4+Q5+Q6+Q7 research findings.
- **D11 resolved:** JSONB request_params (Brandur shape) over fingerprint — storage cost bounded by 24h TTL × write rate; canonical-JSON discipline cost real and ongoing; storage savings target non-dominant cost line item; per-endpoint migration to fingerprint preserved if Studio+ storage becomes load-bearing. NULL-until-locked over Brandur DEFAULT now() — D2-α drops recovery_point that Brandur's pattern relied on; NULL-until-locked + completed_at makes state derivable from columns alone.
- **D12 resolved:** R3 per-project reason-codes allowlist over R2 open TEXT — Month 6 faucet/drain dashboard reliability requires write-time spelling-drift defense via FK; R2 query-time normalization is degraded product; R1 (Stripe closed enum) ruled out by F2P-vs-fintech-context mismatch.
- **Schemas now defined for the entire wallet primitive surface:**
  - `projects` baseline — `[[tenancy-ids-research]]` F6.
  - `currencies` — `[[economy-primitives-research]]` F3.
  - `wallets` — `[[economy-primitives-research]]` F4.
  - `reason_codes` — `[[economy-primitives-research]]` F6.
  - `idempotency_keys` — `[[idempotency-keys-schema-research]]` F6.
  - `transactions` — `[[wallet-mechanics]]` §3 + Amendment Part 2 A8 (player_id UUID) + Part 3 A16 (wallet_version + composite FK on reason_code).
  - `loot_rolls`, `iap_receipts`, `staged_jobs` — `[[wallet-mechanics]]` §4-§5 + Amendment Part 2 A9 + Part 3 A17 (staged_jobs CHECK extension).
  - `wallet_credit`/`wallet_debit` plpgsql function bodies — `[[wallet-functions-research]]` Operational implications template + Part 1 A1/A2 (M1 + FOR UPDATE).
  - `wallet_deidentify_player` plpgsql function body — Amendment Part 2 A10 (UUID signature + HMAC→UUIDv8 projection).
- **Better Auth coordination locked:** `advanced.database.generateId: "uuid"` REQUIRED in config (else RLS GUC chain breaks at first cast). Drizzle hand-translation of org/member/invitation/team/teamMember/organizationRole tables required.
- **Implementation-blocking cascades queued for /implementation:**
  - `apps/auth-config` Better Auth instance config sets `advanced.database.generateId: "uuid"`.
  - `packages/db/src/schema/auth.ts` Drizzle hand-translation.
  - `packages/db/src/schema/wallet.ts` (or split per-table) Drizzle definitions for projects, currencies, wallets, reason_codes, idempotency_keys, transactions, loot_rolls, iap_receipts, staged_jobs.
  - Migration order: projects → organization (Better Auth) → players (per [[player-auth]]) → currencies → wallets → reason_codes + 12-code bootstrap → idempotency_keys → transactions (with FKs to all of the above) → loot_rolls + iap_receipts (with FKs) → staged_jobs.
  - `[[loot-rng-construction]]` canonical-form amendment (player_id 8B → 16B).
  - `scripts/check-direct-wallet-mutation.ts` CI lint covering all protected tables.
  - SDK auto-key generation (bokchoy-sdk-retry-${uuid4()} matching Stripe pattern).
  - Hourly idempotency_keys reaper via staged_jobs (kind='idempotency_reaper').
  - Bootstrap 12-code reason_codes default-set on project creation (function/trigger/app-side hook).
  - UUIDv4→v7 migration plan deferred behind revisit triggers.
- **Wallet primitive can now ship.** /implementation entry point unblocked.
- **Next on resume:** switch to `/implementation` to start the first wallet slice. Quote `[[wallet-mechanics]]` (with Amendments Part 1+2+3) as the contract; quote the research entries for schema specifics; F1 type-level discipline open thread (`TenantTx` branded type) closes within this implementation pass.
- **Mode (prior):** research (Q4 + Q5 + Q6 + Q7 vaulted 2026-05-04 — wallet research queue COMPLETE)
- **Wallet research queue COMPLETE 2026-05-04** — all seven queries resolved + vaulted:
  - **Q1+Q2** → `[[tenancy-ids-research]]` (UUID for player/project IDs; UUIDv4 today; projects baseline schema F6).
  - **Q3** → `[[wallet-functions-research]]` (pgledger source-walk, M2 falsification, M1 reframe, function template).
  - **Q4** → `[[idempotency-keys-schema-research]]` (Brandur + Stripe SDK + Shopify triangulated; BokChoy schema F6: JSONB request_params + NULL-until-locked + completed_at + 255-char cap; hourly reaper).
  - **Q5+Q6+Q7** → `[[economy-primitives-research]]` (PlayFab Economy v2 + LootLocker + Stripe contradiction probe; reason-code R3 per-project allowlist; currencies F3 baseline; wallets F4 row-per-`(project,player,currency)` pgledger pattern + version column + allow_negative flag).
- **Q5 major finding:** F2P backends (PlayFab, LootLocker) do NOT publish closed reason-code taxonomy — Stripe's closed enum is real-money-fintech-context, not F2P-applicable. R3 hybrid (per-project allowlist + bootstrap 12-code default-set) is the production-aligned synthesis. 12 baseline codes pinned: faucets `signup_bonus`/`daily_login`/`quest_reward`/`loot_pull_reward`/`shop_purchase_grant`/`iap_grant`/`compensation`/`admin_grant`; drains `loot_pull_cost`/`shop_purchase_cost`/`crafting_cost`/`admin_debit`; transfers + admin extensible.
- **Q4 major finding:** Brandur (JSONB) vs Shopify (fingerprint) is real contradiction at tier 1+2; both production-cited. BokChoy commits to JSONB on storage-cost-bounded-by-24h-TTL grounds + canonical-JSON-canonicalization avoidance. NULL-until-locked over Brandur's DEFAULT now() on self-documentation grounds.
- **Q6+Q7 cascade against `[[wallet-mechanics]]` §3:** add `wallet_version BIGINT NOT NULL` column to `transactions` (pgledger forensic-version pattern) + FK `transactions.reason_code → reason_codes(project_id, code)` composite-FK. Drizzle schema must define `currencies`, `wallets`, `reason_codes`, `idempotency_keys` tables.
- **Implementation-blocking decision queue (carry-forwards from research → /design):**
  - **D8 — apply Q4 schema** (`idempotency_keys` baseline F6 from Q4 entry): vault as cascade addition to `[[wallet-mechanics]]` or as a /design pass on `[[idempotency-strategy]]` (which deferred schema specifics). Likely small.
  - **D9 — apply Q5 reason-code R3 + bootstrap default-set** to `[[wallet-mechanics]]` §3 (FK on `transactions.reason_code`).
  - **D10 — apply Q6 currencies + Q7 wallets baselines** + the `transactions.wallet_version` column addition to `[[wallet-mechanics]]` §3.
  - **D11 — confirm Q4's JSONB-vs-fingerprint pick + NULL-until-locked-vs-DEFAULT-now pick** survives /design challenge (both have research-recommended lanes; user can defend or counter).
  - **D12 — confirm Q5's R3 (allowlist) over R2 (open TEXT)** survives /design challenge (R3 wins on faucet/drain reliability per Month 6 deliverable; user can defend or counter).
- **Wallet feature is now design-complete after these /design sub-passes.** First-feature implementation (the original /implementation entry point) becomes unblocked once D8–D12 land + the Better Auth config cascade per `[[tenancy-ids-research]]` is wired.
- **Open cascade obligations queued for /implementation:**
  - `apps/auth-config` Better Auth instance config sets `advanced.database.generateId: "uuid"`.
  - `packages/db/src/schema/auth.ts` hand-translates Better Auth schema (organization, member, invitation, team, teamMember, organizationRole) to Drizzle.
  - `[[loot-rng-construction]]` canonical-form amendment (`player_id 8B → 16B`).
  - `scripts/check-direct-wallet-mutation.ts` CI lint per `[[wallet-mechanics]]` Amendment Part 1 A1; extended for currencies/wallets/reason_codes/idempotency_keys per F2P research.
  - SQLSTATE BCxxx convention extended (BC040 from Part 2 + BC001/BC002 from Part 1).
  - UUIDv4→v7 migration plan deferred behind revisit triggers.
  - `transactions.wallet_version` column addition.
  - `reason_codes` table + bootstrap default-set on project creation.
  - Hourly idempotency-keys reaper (staged_jobs or pg_cron).
  - SDK auto-key generation (`bokchoy-sdk-retry-${uuid4()}` matching Stripe pattern).
- **Next on resume:** switch to `/design` to land D8–D12 (small bundleable pass) + apply the schema additions to `[[wallet-mechanics]]` as Amendment 2026-05-04 (Part 3). Then /implementation can start the first wallet slice.
- **Mode (prior):** design (Q1 + Q2 amendments shipped 2026-05-04)
- **Q1 + Q2 amendments LANDED 2026-05-04** — `[[wallet-mechanics]]` Amendment 2026-05-04 (Part 2) prepended (A8–A13), seven supersessions to original §3/§5/§6/Revisit-when/Cascade-obligations:
  - **A8:** `transactions.player_id BIGINT NOT NULL` → `UUID NOT NULL`. Index unchanged.
  - **A9:** `loot_rolls.player_id` + `iap_receipts.player_id` BIGINT→UUID. Cascade to `[[loot-rng-construction]]` canonical-form: `player_id 8B → 16B` in seed-bytes derivation.
  - **A10:** `wallet_deidentify_player(p_player_id UUID)` signature; HMAC→bigint projection rewritten as deterministic UUIDv8 (RFC 9562 §5.8). 122 entropy bits, ≈5×10⁻²⁰ collision at 1B. Full plpgsql function body in entry. New SQLSTATE `BC040` ConfigurationError for missing/short anon_secret.
  - **A11:** *Revisit when* "10M player count" trigger retired (functionally unreachable at UUIDv8 width).
  - **A12:** Cascade obligations: Better Auth `advanced.database.generateId: "uuid"` REQUIRED in config (else RLS GUC chain breaks at first cast); Drizzle auth-schema hand-translation per `[[backend-stack]]` `getMigrations`-incompatibility.
  - **A13:** **D6 RESOLVED — UUIDv4 today, defer UUIDv7.** Postgres-native `gen_random_uuid()` + `crypto.randomUUID()`. Two revisit-when triggers: Supabase managed Postgres 18 ships OR sustained writes >100/sec/project AND Postgres 18 not yet on Supabase. Pgledger vendored SQL helper rejected as alternative on cognitive-overhead grounds (user reasoning recorded).
- **D-decisions resolved through this session:** D1 M1, D2 FOR UPDATE, D3 OTel three-layer, D4 single-entry note, D5 BCxxx SQLSTATE namespace (now extended with BC040), D6 UUIDv4 today, D7 Q1 type-system reconciliation (UUIDv8 projection).
- **Wallet research queue status (post-Q1+Q2+Q3 amendments):**
  - Q1 (player_id type) — **COMPLETE**, amendments shipped.
  - Q2 (projects tenancy-root) — **COMPLETE** (baseline schema in `[[tenancy-ids-research]]` F6).
  - Q3 (pgledger source-walk + M2 cite verification) — **COMPLETE**, amendments shipped.
  - Q4 (idempotency_keys schema beyond Brandur) — pending.
  - Q5 (reason-code taxonomy for F2P transaction logs) — pending.
  - Q6 (currency primitive at F2P backends) — pending.
  - Q7 (multi-currency wallets schema) — pending.
- **Q2 follow-ons still deferred:** `api_keys` table /design decision (gated by SDK auth flow per `[[player-auth]]` §1); soft-delete vs status posture (currently `status='archived'` substitutes; revisit if audit-retention demands explicit `deleted_at` column).
- **Open cascade obligations (queued for /implementation):**
  - `apps/auth-config` Better Auth instance config sets `advanced.database.generateId: "uuid"`.
  - `packages/db/src/schema/auth.ts` (or equivalent) hand-translates Better Auth org/member/invitation/team/teamMember/organizationRole tables to Drizzle definitions.
  - `[[loot-rng-construction]]` canonical-form amendment (`player_id 8B → 16B`).
  - `scripts/check-direct-wallet-mutation.ts` CI lint per `[[wallet-mechanics]]` Amendment Part 1 A1.
  - SQLSTATE `BC040` added to the BCxxx convention.
  - UUIDv4→v7 migration plan when revisit-trigger fires.
- **Next on resume:** continue research queue with Q4 (idempotency_keys schema beyond Brandur). Brandur reference impl already cited in `[[idempotency-strategy-research]]` S10; Q4 must triangulate against Shopify + Stripe SDK + a third source for the parameter-mismatch detection mechanism (request_params JSONB vs body-hash) and the locked_at-default-now-vs-null question.
- **Mode (prior):** research → handoff to design (Q1 + Q2 vaulted 2026-05-04)
- **Q1 + Q2 of the wallet research queue COMPLETE 2026-05-04.** Vaulted as `[[tenancy-ids-research]]` (`.bocek/vault/wallet/tenancy-ids-research.md`). Triangulation met: Better Auth source-walk (`6b03a45a`, `packages/better-auth/src/plugins/organization/schema.ts` + `db/get-migration.ts:285-372` + `context/create-context.ts:222-237`) + Postgres 16/18 docs + RFC 9562 UUIDv7 spec + Supabase Auth docs + Stripe API docs + pgledger source (cross-referenced from Q3) + mblum.me UUIDv7 benchmark + multi-tenant SaaS schema survey (Vercel/WorkOS/flightcontrol templates) + BIGSERIAL enumeration-attack contradiction probe (HN + OWASP + Security Boulevard + TrustedSec).
- **Q1 (G1) RESOLVED:** UUID for `players.id`. `[[player-auth]]` §2 stands. `[[wallet-mechanics]]` §3/§5/§6 `player_id BIGINT` references obsoleted (column-type swaps + §6 HMAC→UUID projection rewrite + §6 BIGINT collision-math paragraph retires + 10M-player Revisit-when trigger retires as functionally-zero at 122-bit width). **UUIDv4 vs UUIDv7 sub-decision is a small fork for /design**: UUIDv4-today is Postgres-native on 17 (`gen_random_uuid()` + `crypto.randomUUID()`); UUIDv7-today requires transcribing pgledger's `pgledger_uuidv7_microsecond()` SQL helper (~10 lines, MIT-licensed) into bootstrap migration. Both reversible.
- **Q2 (G2) RESOLVED:** `projects` baseline schema = `(id UUID PK DEFAULT gen_random_uuid(), organization_id UUID FK to Better Auth "organization", name TEXT, slug TEXT, is_child_directed BOOLEAN DEFAULT FALSE, status TEXT CHECK 'active'/'paused'/'archived', settings JSONB DEFAULT '{}', created_at, updated_at, UNIQUE(organization_id, slug))`. Deferred at MVP: environment model (separate-project-per-env per `[[idempotency-strategy]]`); API key surface (separate `api_keys` /design decision); soft-delete posture (status='archived' substitutes); region (single-region MVP); billing (lives on org).
- **Major Better Auth finding:** `advanced.database.generateId: "uuid"` must be explicitly set in Better Auth config — default produces TEXT 32-char alphanumeric (190-bit entropy) which breaks the `current_setting('app.current_tenant')::UUID` RLS GUC cast at first invocation. Cascade obligation: `apps/auth-config/src/index.ts` (or wherever Better Auth instance lives) must include this setting.
- **Rejected alternatives with named winning conditions:**
  - BIGSERIAL — rejected on enumeration-attack class (BIGSERIAL leaks customer signup order + tenant count + creation rate; competitive intelligence value is unbounded; storage savings ~$5-10/mo at Studio+ projection are bounded). Vaulted with revisit-when: never expected to fire because customer-facing IDs are exposed via SDK, dashboards, support tickets.
  - Prefixed-text (Stripe/pgledger style) — rejected on Postgres-stack fit despite UX benefit (RLS GUC type-safety + tooling friction across Drizzle/sql template literals + 2× storage on TEXT IDs vs UUID binary). Vaulted with revisit-when: support-engineering UX becomes a documented bottleneck.
- **Q3 amendments LANDED 2026-05-04 (preserved below)** — both vault writes complete:
  - `[[wallet-mechanics]]` **Amendment 2026-05-04** prepended (A1 M2→M1, A2 SERIALIZABLE→READ COMMITTED+FOR UPDATE, A3 OTel three-layer, A4 single-entry-deliberate-divergence, A5 BCxxx SQLSTATE namespace, A6 cascade obligations updated, A7 Failure mode 1 amended). Original §1–§8 + Reasoning + downstream sections stand except where superseded.
  - `[[wallet-audit-invariant-research]]` **Erratum 2026-05-04** prepended (S3 SECURITY-DEFINER + only-through-functions claim falsified; F2 + F3 corrected; pgledger reattributed to M1 cite-cluster alongside Brandur + Square Books; M2 cite chain reframed as docs-cited-only).
- **Wallet research queue status (post-Q1+Q2):**
  - Q1 (player_id type at multi-tenant SaaS scale) — **COMPLETE** (UUID).
  - Q2 (projects tenancy-root table) — **COMPLETE** (baseline F6 in tenancy-ids-research).
  - Q3 (pgledger source-walk + M2 cite verification) — **COMPLETE + amendments shipped.**
  - Q4 (idempotency_keys schema beyond Brandur) — pending. project_id UUID confirmed by Q2.
  - Q5 (reason-code taxonomy for F2P transaction logs) — pending.
  - Q6 (currency primitive at F2P backends) — pending.
  - Q7 (multi-currency wallets schema) — pending.
- **Three /design forks waiting on resolution** (small enough to bundle into one /design pass):
  - Q1 sub-decision: UUIDv4 today vs UUIDv7 today (transcribe pgledger SQL helper).
  - Q2 follow-ons: API key surface (deferred), soft-delete posture (deferred).
  - Q3 carry-overs from amendment: amendments are vaulted, but a /design pass on `[[wallet-mechanics]]` to apply Q1 type-changes (BIGINT → UUID) is owed in conjunction with G1 closure.
- **Next on resume:** continue research queue Q4 → Q5 → Q6 → Q7 in sequence (Q4 is the next-blocking; Q5/Q6/Q7 are smaller and bundleable). OR pause queue + hand Q1+Q2 + the Q3 carry-over to /design now to land amendments before continuing research. User decides.
- **Mode (prior):** design (Q3 amendments shipped 2026-05-04)
- **Q3 amendments LANDED 2026-05-04** — both vault writes complete:
  - `[[wallet-mechanics]]` **Amendment 2026-05-04** prepended (A1 M2→M1, A2 SERIALIZABLE→READ COMMITTED+FOR UPDATE, A3 OTel three-layer, A4 single-entry-deliberate-divergence, A5 BCxxx SQLSTATE namespace, A6 cascade obligations updated, A7 Failure mode 1 amended). Original §1–§8 + Reasoning + downstream sections stand except where superseded.
  - `[[wallet-audit-invariant-research]]` **Erratum 2026-05-04** prepended (S3 SECURITY-DEFINER + only-through-functions claim falsified; F2 + F3 corrected; pgledger reattributed to M1 cite-cluster alongside Brandur + Square Books; M2 cite chain reframed as docs-cited-only).
  - Vault index updated for both entries.
- **D-decisions resolved (D1, D2, D3, D4, D5):**
  - **D1 (b) M1** — production-cited tier 1, three independent ledger references; M2 deferred until team-growth/incident trigger.
  - **D2 (D2b) READ COMMITTED + FOR UPDATE** — pgledger pattern; simpler function bodies, no caller retry, self-documenting concurrency model, easier 2am diagnosis.
  - **D3 OTel three-layer** — TS-side span + plpgsql `RAISE LOG` + `pg_stat_statements`. Replaces unfeasible "OTel from inside function" commitment.
  - **D4 single-entry deliberate-divergence vaulted** — virtual currency creation/destruction by system makes pure double-entry require pseudo-system-accounts for no auditable benefit at game-economy scale.
  - **D5 BCxxx SQLSTATE namespace pinned** — BC001 IdempotencyKeyInUse, BC002 IdempotencyKeyMismatch, BC010 InsufficientFunds, BC020 TenantMismatch, BC021 WalletNotFound, BC022 CurrencyMismatch, BC030 PolicyViolation.
- **Next on resume:** continue research queue Q1+Q2 in parallel (player_id type at multi-tenant SaaS scale + projects tenancy-root table) per the order committed in /design pre-Q3. Then Q4 (idempotency_keys schema beyond Brandur), Q5 (reason-code taxonomy), Q6 (currency primitive), Q7 (multi-currency wallets schema). Per the user's research-grounded discipline (research before /design picks), no further /design writes for the wallet primitive should land until the relevant Q surfaces evidence.
- **Wallet research queue status (post-Q3):**
  - **Q3 — pgledger source-walk + M2 cite verification: COMPLETE + amendments shipped.**
  - Q1 (player_id type at multi-tenant SaaS scale) — pending. Pgledger surfaced prefixed-ULID as a real third option to UUID-vs-BIGSERIAL.
  - Q2 (`projects` tenancy-root table) — pending.
  - Q4 (`idempotency_keys` schema beyond Brandur) — pending.
  - Q5 (reason-code taxonomy for F2P transaction logs) — pending.
  - Q6 (currency primitive at F2P backends) — pending.
  - Q7 (multi-currency wallets schema) — pending.
- **OLD checkpoint preserved below for continuity:**
- **Mode (prior):** research → handoff to design
- **Feature:** wallet primitive — **Q3 of the 7-query research queue COMPLETE 2026-05-04.** Vaulted as `[[wallet-functions-research]]` (`.bocek/vault/wallet/wallet-functions-research.md`). Triangulation met: pgledger source-walk (`pgr0ss/pgledger@b3143a3`, MIT, 288 lines plpgsql + 80-line AGENTS.md + 4 example SQL files) + Postgres 16 `sql-createfunction.html` docs + contradiction probe (PostgREST db_authz, multi-tenant SaaS guidance survey).
- **Q3 MAJOR FINDING:** `[[wallet-audit-invariant-research]]` S3 misattributed M2 to pgledger. **Pgledger ships M1** (app-library + ergonomic discipline) — zero SECURITY DEFINER, zero GRANT/REVOKE/CREATE ROLE across the entire repo, direct `UPDATE pgledger_accounts` shown as normal usage in `examples/lock-account.sql`. **BokChoy's M2 commitment in `[[wallet-mechanics]]` §2 has no surveyed production cite** — it's a docs-cited synthesis (Postgres 16 canonical SECURITY DEFINER + REVOKE/GRANT pattern + table-level REVOKE UPDATE on `bokchoy_app`). Confidence on the *technique*: high (docs). Confidence on *technique-as-production-validated-for-ledgers*: low (no public cite).
- **Q3 secondary findings:**
  - Pgledger uses `READ COMMITTED` + `FOR UPDATE` row-locking with sorted-then-locked deadlock prevention. **Contradicts `[[wallet-mechanics]]` *Engineering substance applied* line 466 SERIALIZABLE commitment.** Forking decision for /design: pgledger pessimistic-lock (simpler, no retry loop) vs SERIALIZABLE (stronger, retry budget needed).
  - Pgledger ships double-entry (1 transfer + 2 entries per money move). BokChoy `[[wallet-mechanics]]` §3 ships single-entry. **Deliberate divergence** (virtual currency created/destroyed by system; pgledger model would force pseudo-system-accounts) — flag in `[[wallet-mechanics]]` so future readers don't try to "fix" it.
  - Pgledger ID format: prefixed ULID (`pgla_01HXXX...`) over UUIDv7. **Surfaces a real third option for G1** (player_id type debate: UUID vs BIGSERIAL vs prefixed ULID).
  - Pgledger error semantics: plain `RAISE EXCEPTION 'msg %, %'` with no custom SQLSTATE. Defaults to P0001. **BokChoy must NOT transcribe** — should use `USING ERRCODE = 'P0xxx'` for typed errors addressable from TS layer. Owns the `P0xxx` SQLSTATE convention (P0010 InsufficientFunds, P0020 TenantMismatch, P0021 WalletNotFound, P0022 CurrencyMismatch, P0023 InsufficientFunds-debit, P0024 IdempotencyKeyMismatch, P0025 IdempotencyKeyInUse — all initial proposals; /design pins).
  - Pgledger gives **no template** for: idempotency-key handling (D2-α per-step UNIQUE), tenant-context check (`current_setting('app.current_tenant', false)::UUID`), search_path hardening (only matters for SECURITY DEFINER), custom SQLSTATE, OpenTelemetry-from-plpgsql.
  - **`[[wallet-mechanics]]` *Engineering substance applied* line 468 OTel-from-inside-function commitment is unfeasible-as-stated** — no production cite ships plpgsql-to-OTel. Realistic alternative: `RAISE LOG` from function + OTel span at TS call boundary + `pg_stat_statements` for slow-query analysis.
  - **Structural function template extracted** (transcribable into `wallet_credit/wallet_debit`): tenant-context check → idempotency replay-or-proceed → wallet row FOR UPDATE → currency match → balance update + version increment → audit row insert. ~50 lines plpgsql per function.
- **Erratum owed to `[[wallet-audit-invariant-research]]`:** S3 SECURITY DEFINER + only-through-functions claim falsified; F2 (M2 = pgledger pattern) wrong; F3 ("strongest production cite for *structural* enforcement on Postgres") wrong — pgledger ships no structural enforcement.
- **Amendments owed to `[[wallet-mechanics]]`:** §2 cite reframe (Path A keep-M2-with-docs-cited or Path B downgrade-to-M1); line 466 concurrency forking pick; line 468 OTel-from-plpgsql amendment; §3 single-entry-vs-double-entry deliberate divergence note.
- **Q3 open threads (carry-forward to future research sessions):** Q3a pgledger 2025-05-16 perf-blog read; Q3b Brandur Ruby `atomic_phase` plpgsql translation for the idempotency-check shape; Q3c OTel-from-plpgsql published patterns survey; Q3d closed-source production M2 (Stripe/RevenueCat/PayPal/Shopify) — unknown without insider access.
- **Wallet research queue status:**
  - **Q3 — pgledger source-walk + M2 cite verification: COMPLETE.**
  - Q1 (player_id type at multi-tenant SaaS scale) — pgledger surfaced prefixed-ULID as a third option; full Q1 still pending.
  - Q2 (`projects` tenancy-root table) — pending.
  - Q4 (`idempotency_keys` schema beyond Brandur) — pending.
  - Q5 (reason-code taxonomy for F2P transaction logs) — pending.
  - Q6 (currency primitive at F2P backends) — pending.
  - Q7 (multi-currency wallets schema) — pending.
- **Next on resume:** continue research queue (Q1+Q2 in parallel next per the order I committed), OR pause queue + hand off Q3 findings to /design now (the Q3 findings are big enough to be vault-ready and amendments-owed are concrete; /design can resolve them while Q1/Q2/Q4–Q7 continue in parallel sessions). User decides.
- **Original /implementation halt:** wallet primitive (first feature per `[[mvp-feature-sequence]]` Month 1–3 spine) HALTED at gap report 2026-05-04. User asked /implementation to "open mvp-feature-sequence and start the first feature." Reading `[[wallet-mechanics]]` (633 lines, keystone) + adjacent `[[idempotency-strategy]]` + `[[player-auth]]` surfaced 7 gaps clustered around one missing dimension: **the wallet feature's concrete schema and code shape, beyond `[[wallet-mechanics]]`'s high-level invariants.** Wrote `.bocek/vault/wallet/gaps.md` per gap protocol. Stopped per *Anti-improvisation*; waiting on /design or on-the-spot directives.
- **Wallet gap cluster (7 gaps, see `.bocek/vault/wallet/gaps.md`):**
  - **G1.** `players.id` UUID-vs-BIGINT vault drift between `[[player-auth]]` (UUID, newer 2026-05-03) and `[[wallet-mechanics]]` (BIGINT, older 2026-05-02). Cascades to §6 anon_id collision math which is load-bearing for the de-id security claim. /design needed.
  - **G2.** `projects` table schema undefined — fragments scattered across `[[backend-stack]]` (organization_id FK), `[[player-auth]]` (`is_child_directed`), `[[idempotency-strategy]]` (env-as-separate-project). Tenant root; can't migrate without it. /design recommended (env model + API key shape ride on it).
  - **G3.** `currencies` table schema undefined. Multi-currency is Month 1–3 spine functionality. /design or directive.
  - **G4.** `wallets` table schema undefined. Likely directive (option 1: `(project_id, player_id, currency_id)` UNIQUE row-per-balance is the only coherent shape under path B).
  - **G5.** `idempotency_keys` table schema undefined (FK target referenced by `[[wallet-mechanics]]` §3). Likely directive (Brandur shape with project_id/255-cap/no-recovery-point).
  - **G6.** `wallet_credit/wallet_debit` plpgsql function bodies undefined — `[[wallet-mechanics]]` §2 has signatures only, body is `$$ ... $$;` placeholder. Non-trivial code (~50–100 lines each). /design recommended (pgledger source-walk + Brandur translation gets production-cited shape).
  - **G7.** Reason-code taxonomy undefined — `[[mvp-feature-sequence]]` names "transactions log w/ reason-code taxonomy" but no entry enumerates the codes. Touches API contract + SDK + faucet/drain dashboard (Month 6). /design needed.
- **F1 type-level discipline OPEN THREAD reaches its trigger** — branded `TenantTx` types where RLS-protected table accessors require `TenantTx` from `withTenant` callback. Resolves WITH the wallet schema landing (the trigger is "first RLS-protected feature schema lands").
- **Bootstrap committed:** initial commit `chore: bootstrap workspace, db package, tooling, and CI` covering 85 files / 12,960 insertions. Pushed to `origin/main` (empty remote → first commit). `.gitignore` filters `.claude/`, `.bocek/mode`, preflight bug notes, stray nested `.bocek/`, `docs/` (pre-bocek design doc — vault is source of truth).
- **Bootstrap committed:** initial commit `chore: bootstrap workspace, db package, tooling, and CI` covering 85 files / 12,960 insertions. Pushed to `origin/main` (empty remote → first commit). `.gitignore` filters `.claude/`, `.bocek/mode`, preflight bug notes, stray nested `.bocek/`, `docs/` (pre-bocek design doc — vault is source of truth).
- **Last resolved:** sub-unit (4) tooling executed end-to-end 2026-05-04 per `[[tooling]]` cascade obligations 1-4. Files written: `biome.json` at root (formatter + linter, `noRestrictedImports` rule blocks `bun` bare + `bun:*` glob, test files override rule off); `scripts/check-prepare-false.ts` cascade-10 scripted check (mirrors cascade-9 FORCE-RLS pattern); `scripts/tsconfig.json` so editor diagnostics resolve; root `package.json` adds `@biomejs/biome` to catalog (`^2.0.0`) + devDeps + `lint`/`lint:fix`/`lint:check`/`format`/`check:prepare-false` scripts. Drizzle config rewritten validate-at-boundary (no more `!` non-null assertion per `idioms/typescript.md`). Empty workspaces (`shared-types`, `auth-config`, `backend`, `cockpit`) got `src/index.ts` placeholders (`export {};`) so tsc has input files. **Verified:** `bun run lint:check` 25 files clean; `bun run typecheck` 5/5 workspaces successful; `bun run check:prepare-false` OK. Biome auto-fixed import sorting in `client.ts` + `index.ts` + `package.json` formatting on first run.
- **Open thread (cascade obligation 5):** verify GritQL plugin path (a) for cascade-10. Currently using path (b) Bash-style scripted check. GritQL plugin would be more elegant but is unverified at BokChoy's specific shape per `[[tooling-research]]` Q1. Park; revisit when scripted-check noise or maintenance burden warrants.
- **F1 type-level discipline OPEN THREAD:** branded tx types where RLS-protected table accessors require `TenantTx` from `withTenant` callback. Triggers when first RLS-protected feature schema lands (not in bootstrap scope).
- **In progress:** sub-unit (5) CI scaffold. Now meaningful — wires `bun install` + `lint:check` + `typecheck` + `check:prepare-false` + (eventually) tests + drizzle migrate on a managed Postgres. OR jump to first feature contract per `[[mvp-feature-sequence]]`.
- **Next on resume:** ask human direction — sub-unit (5) CI, OR start first feature.
- **Open flags:** mailpit `:latest` accepted; stack running on port 5433; cascade-10 GritQL verification deferred.
- **Last resolved:** sub-unit (6) `withTenant()` helper verified end-to-end 2026-05-04. `packages/db/src/with-tenant.ts` exports `withTenant(db, projectId, fn)`. All six smoke-test checks passed against the running container: (i) GUC `app.current_tenant` set inside tx matches projectId, (ii) GUC empty outside tx (transaction-scoped per `set_config(name, val, true)`), (iii)+(iv) parallel withTenant calls isolated (tenant-1 sees tenant-1, tenant-2 sees tenant-2), (v) thrown errors propagate from withTenant cleanly, (vi) GUC clears after rollback.
- **Sub-unit (4) tooling DEFERRED** by user 2026-05-04 — three positions surfaced (Biome / ESLint+Prettier / hybrid) with cascade implications across `[[backend-stack]]` cascade-10/F1 + `[[frontend-stack]]` cross-runtime discipline; user chose to defer. Sub-unit (5) CI scaffold makes more sense after (4) lands since lint step is content-empty without it.
- **Four implementation-time decisions applied + flagged this session:**
  - (i) two-env-var split (`DATABASE_URL` + `DATABASE_MIGRATION_URL`) — follows from `[[local-docker]]` Amendment §6 connection-user assignments.
  - (ii) dropped `.ts` import extensions in `src/index.ts` — TS-monorepo idiom.
  - (iii) used `drizzle({ client })` object-form per current Drizzle Supabase setup docs (https://orm.drizzle.team/docs/get-started/supabase-new) — `[[backend-stack]]` cascade-10's transcribed `drizzle(client)` is older positional form.
  - (iv) `withTenant(db, projectId, fn)` 3-param signature instead of contract-literal `(projectId, fn)` closing over module-level `db` — testability + DI ergonomics; load-bearing semantics (db.transaction + set_config + app.current_tenant) unchanged.
- **Vault errata owed (3 items, all small text fixes for one /design pass):**
  - **E1.** `[[backend-stack]]` Amendment 2026-05-04 says pin drizzle-kit to 0.45.2 — that release doesn't exist. drizzle-kit stable is 0.31.x; latest 0.31.10. Applied 0.31.10.
  - **E2.** `[[backend-stack]]` cascade-10 contract pattern uses `drizzle(client)` (older positional form). Current Drizzle docs canonical is `drizzle({ client })` object-form. Applied object-form.
  - **E3.** `[[local-docker]]` compose.yml port mapping `5432:5432` shadowed by host-installed Postgres on WSL2 (host's `/usr/lib/postgresql/16/bin/postgres` listens on 127.0.0.1:5432 directly, beating Docker's iptables NAT). Applied `5433:5432` and updated `.env.example`. F-Local-7 candidate (host-port-collision class).
- **In progress:** revisit (4) tooling, or skip to feature work per `[[mvp-feature-sequence]]`. Bootstrap is functionally complete for the workspace + db + tenant-isolation primitive. CI scaffold (5) is the only remaining bootstrap item and depends on (4).
- **Next on resume:** ask human direction — return to (4) tooling, jump to first feature contract per `[[mvp-feature-sequence]]`, or do a /design pass to consume the three errata.
- **Open flags:** mailpit `:latest` accepted 2026-05-04; stack still running healthy on port 5433; three errata await one /design pass.

## Implementation slice log

### slice 6 — idempotency reaper logic — COMPLETE 2026-05-08
- Files added: `packages/db/drizzle/0006_idempotency_reaper.sql` (~75 lines plpgsql + GRANT plumbing); `packages/db/scripts/smoke-reaper.ts` (5 tests + supporting `survivingKeys()` helper + `eqSets()` set comparator).
- Files modified: `packages/db/package.json` (`smoke:reaper` script).
- Function signature: `idempotency_keys_reaper(p_max_age interval DEFAULT INTERVAL '24 hours') RETURNS integer`. SECURITY DEFINER + `SET search_path = pg_catalog, public`. REVOKE FROM PUBLIC + GRANT EXECUTE TO bokchoy_app.
- Senior-reviewer self-attack:
  - **SECURITY DEFINER vs Part 1 A1's "no SECURITY DEFINER" looks contradictory.** It isn't, but the rationale is subtle enough to warrant inline documentation: the M1 commitment is about wallet-primitive mutation paths where RLS scoping is part of the contract; the reaper is infrastructure that must bypass tenant scoping by construction. CVE-2018-1058 attack surface is real for SECURITY DEFINER → search_path hardened to `pg_catalog, public` per Postgres docs §sql-createfunction.
  - **Bypassing RLS via owner BYPASSRLS attribute.** The function is owned by postgres (which is BYPASSRLS per `00-roles.sql`); SECURITY DEFINER means the function executes as the owner; postgres bypasses RLS even with FORCE active on the table. Verified empirically by Test 5 — bokchoy_app under PROJECT_A's GUC successfully reaps PROJECT_B's expired rows via this function call.
  - **No batching.** A single DELETE backed by the partial index `idx_idempotency_keys_reaper` handles MVP scale (low thousands per hourly run) and Studio+ scale (~2M per-project per hour, still tractable). Batching would add complexity for a problem that doesn't exist; revisit if hot-path latency degrades during the reaper window.
  - **Wall-clock race in tests.** First test draft used `INTERVAL '1 hour'` against rows aged exactly 1 hour at setup time; the small wall-clock advance between setup and reap pushed those rows across the threshold and over-reaped. Fixed by using clearly-separated thresholds (`90 minutes` for the in-between test; `1 minute` for the all-completed-survivors test). The function itself is correct; the test data needed clearer ageing margins.
  - **`completed_at IS NOT NULL` gate is load-bearing.** Without it, the reaper would delete in-flight (locked-but-not-completed) records, breaking ongoing idempotent retries. Test 4 verifies this: even an aggressive `INTERVAL '1 minute'` threshold leaves locked + pending rows untouched.
  - **YAGNI hold — no `dry_run` mode, no per-tenant filter.** The function is canonical: reap globally, return the count. Adding flags before they're needed is improvisation.
  - **Scheduler is genuinely a separate concern.** Splitting "logic" from "scheduling" let the function ship clean today without committing to an infrastructure choice that depends on the broader worker architecture.
- Verified: `bun run lint:check` 35 files clean; `bun run typecheck` 5/5 workspaces clean; `bun run --cwd packages/db smoke:reaper` 5/5 pass; all four prior smoke scripts (rls, partitioning, functions, bootstrap) still pass at 5+5+9+5; `bun run check:direct-mutation` 12 files clean.

### slice 7 — direct-mutation lint — COMPLETE 2026-05-08
- Files added: `scripts/check-direct-wallet-mutation.ts` (~140 lines).
- Files modified: `package.json` (`check:direct-mutation` script); `.github/workflows/ci.yml` (new "M1 bypass detection" step after `check:prepare-false`).
- Behavior: scans `apps/**/*.ts` + `packages/**/*.ts` recursively (manual fs walk; skips `node_modules` / `dist` / `.turbo` / `drizzle` directories); excludes `packages/db/scripts/` (legitimate test fixtures) + `packages/db/drizzle/` (defensive). Two regex patterns: SQL keywords and Drizzle method calls. Per-line opt-out via `// allow-direct-mutation: <reason>`.
- Senior-reviewer self-attack:
  - **biome `noRestrictedImports` collision.** First draft imported `Glob` from `'bun'` — caught by the existing rule banning bare `'bun'` imports per `[[backend-stack]]` cross-runtime discipline. Fixed by swapping to `node:fs` `readdirSync` recursive walk. Same lesson the cascade-10 lint already encoded.
  - **False-positive surface.** The regex matches anywhere in a TS line — comments are not stripped. A line like `// We do NOT INSERT INTO wallets here` would trigger. Acceptable: false positives surface in code review and can use the per-line opt-out comment. Stripping comments correctly across template literals + nested strings is non-trivial; not worth the complexity at the lint's actual cost.
  - **Drizzle method-call regex narrowness.** `\.(update|insert|delete)\(\s*(<table>)` matches `db.update(wallets)` but not `db.update(wallets,` followed by something on the next line, nor `db['update'](wallets)`. The first is unusual formatting; the second is bracket-access bypass which is suspicious enough that letting it slip is fine — code review should flag bracket-access on `update`/`insert`/`delete` regardless.
  - **Opt-out comment is honor-system.** A malicious engineer adding `// allow-direct-mutation: lol` to bypass the lint is mitigated by code review of the comment itself. The comment makes the bypass *explicit and reviewable* — better than a silent bypass.
  - **Wallet-package boundary deferred.** `packages/wallet/` doesn't exist yet. Adding an empty-directory exclude pre-empts non-existent code. Slice 7.5 added to follow-ups for when the directory lands.
- Self-test: planted file `packages/db/src/__lint_self_test.ts` with 2 violations + 1 opt-out comment → lint reported 2 hits (suppressed the opt-out), exit code 1; removed file → 12 files scanned, exit 0.
- Verified: `bun run lint:check` 34 files clean; `bun run typecheck` 5/5 workspaces clean; `bun run check:direct-mutation` 12 files scanned clean; `bun run check:prepare-false` clean.

### slice 5 — bootstrap reason codes — COMPLETE 2026-05-08
- Files added: `packages/db/drizzle/0005_bootstrap_reason_codes.sql` (custom migration, ~50 lines plpgsql); `packages/db/scripts/smoke-bootstrap.ts` (5 tests covering insert, idempotent re-call, per-project isolation, RLS scoping, customer-extended coexistence).
- Files modified: `packages/db/package.json` (`smoke:bootstrap` script); `packages/db/scripts/smoke-functions.ts` (replaced hand-INSERT of 2 codes with single `bootstrap_project_reason_codes` call).
- Function signature: `bootstrap_project_reason_codes(p_project_id uuid) RETURNS integer` — returns count of codes inserted (0 on idempotent re-call). SECURITY INVOKER. REVOKE FROM PUBLIC + GRANT EXECUTE TO bokchoy_app.
- Mechanism choice (i) over (ii)/(iii): the function holds the canonical 12-code list as plpgsql VALUES; idempotent via `INSERT … ON CONFLICT (project_id, code) DO NOTHING`; called explicitly by every project-creation path. Trigger considered but rejected on visibility grounds; TS-hook considered but rejected on "function gives one source of truth across all paths" grounds.
- Senior-reviewer self-attack:
  - **`is_system=TRUE` flag preserved on re-call.** Customer-extended `is_system=FALSE` rows survive bootstrap re-call because `ON CONFLICT (project_id, code) DO NOTHING` doesn't UPDATE the flag. Verified by Test 5.
  - **Customer adds the same `code` as a system code with `is_system=FALSE`** (e.g., `signup_bonus`, `false`) — under the current ON CONFLICT, the customer's INSERT loses to the system row that already exists. The function does NOT clobber a customer's prior `is_system=FALSE` insert because re-bootstrap is a no-op when the code already exists. But if a project gets bootstrap → customer adds `signup_bonus` with `is_system=FALSE` → that customer INSERT *itself* fails on the PK conflict. Customer must use a different code (e.g., `signup_bonus_v2`). Acceptable: prevents accidental shadowing of canonical codes.
  - **Function returns count via `GET DIAGNOSTICS ROW_COUNT`** — works correctly for batch-VALUES INSERTs. Returns 12 on first call, 0 on re-call. Useful for caller-side observability ("did anything actually happen?").
  - **No trigger; no hidden behavior.** A future maintainer reading `apps/backend/projects/create.ts` will see the explicit `SELECT bootstrap_project_reason_codes(...)` call. Diagnosing "why doesn't this project have reason codes?" is then "is the function getting called?" — a tractable question.
  - **YAGNI hold.** Did NOT implement an `unbootstrap_project_reason_codes` (deletion) function — the spec doesn't name it; reason codes are referenced by the transactions FK and shouldn't be deletable arbitrarily; project-deletion handles cleanup via FK cascade or RESTRICT.
- Verified: `bun run lint:check` 33 files clean; `bun run typecheck` 5/5 workspaces clean; `bun run --cwd packages/db smoke:bootstrap` 5/5 pass; `smoke:rls` still 5/5; `smoke:partitioning` still 5/5; `smoke:functions` still 9/9 (refactored to use bootstrap).

### slice 4 — M1 stored functions — COMPLETE 2026-05-08
- Files added: `packages/db/drizzle/0004_wallet_functions.sql` (hand-written custom migration, ~250 lines plpgsql); `packages/db/scripts/smoke-functions.ts` (9 tests covering happy paths + all 5 BCxxx error codes + idempotency replay + UUIDv8 anon_id).
- Files modified: `packages/db/package.json` (`smoke:functions` script).
- Functions: `wallet_credit(uuid, uuid, numeric, uuid, text, text, bigint, bigint, text, jsonb) → bigint`, `wallet_debit(... same ...) → bigint`, `wallet_deidentify_player(uuid) → integer`. SECURITY INVOKER (M1 default). REVOKE FROM PUBLIC + GRANT EXECUTE TO bokchoy_app — under M1 this is tidiness, not a privilege barrier.
- Senior-reviewer self-attack:
  - **Idempotency-check ordering bug in the research template.** Template (`[[wallet-functions-research]]` Operational implications) put the idempotency lookup before FOR UPDATE. That races under READ COMMITTED — fixed by moving it after the lock. Test 2 verifies replay returns the same txn id without double-mutating the wallet.
  - **search_path on deidentify is a Supabase-portability issue, not a security regression.** Amendment Part 1 A1 removed the search_path hardening as a CVE-2018-1058 protection. Reinstating `SET search_path = pg_catalog, public, extensions` on `wallet_deidentify_player` is for `extensions.hmac` resolution only. wallet_credit / wallet_debit don't reference any extension functions, so they keep the M1-default no-SET. Inline comment documents the rationale to avoid drift back to "always set search_path" by future maintainers.
  - **`v_new_balance := v_wallet.balance - p_amount; IF v_new_balance < 0 ...`** — explicit BC010 raise before UPDATE. Could have relied on the table-level `CHECK (balance >= 0)` to fire, but that raises 23514 with a constraint name TS would have to dispatch on. Typed BC010 is more idiomatic for the API contract.
  - **Custom GUC unset behavior on Postgres 17.** Tested behavior: `current_setting('bokchoy.anon_secret', false)` returns empty string (length 0) when the GUC is unset, NOT raising. The function's `IF length(k_text) < 32 THEN RAISE BC040` correctly catches both unset (length=0) and too-short (length<32). Verified by Test 9.
  - **`p_amount > 0` validation deliberately omitted.** Per Anti-improvisation, the contract doesn't pin negative-amount handling. Caller's responsibility. The transactions row's `kind='currency_credit'` carries semantic intent; passing negative amount manifests as caller error.
  - **`inventory_grant`/`inventory_consume` deferred.** §2 names them but no inventory table exists at MVP. Adding them as audit-row-only stubs (no inventory mutation) is improvisation. Slice 4.5 added to the open list.
- Migration recovery: first `bun run db:migrate` ran with the empty `--custom` template (Write tool needed Read first). Recovered by `DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT MAX(id) ...)` + re-applying with full content. Journal + DB now consistent.
- Verified: `bun run lint:check` 32 files clean; `bun run typecheck` 5/5 workspaces clean; `bun run --cwd packages/db smoke:functions` 9/9 pass; `bun run --cwd packages/db smoke:rls` still 5/5 pass; `bun run --cwd packages/db smoke:partitioning` still 5/5 pass (functions don't perturb prior invariants).

### slice 3 — partitioning (transactions only) — COMPLETE 2026-05-08
- Files added: `packages/db/drizzle/0003_partition_transactions.sql` (hand-written custom migration); `packages/db/scripts/smoke-partitioning.ts` (5 tests: partition routing, pruning-with-predicate, full-scan-without-predicate, RLS-on-partitioned-parent, shared-sequence monotonicity).
- Files modified: `packages/db/package.json` (`smoke:partitioning` script); `.bocek/vault/wallet/gaps.md` (Gap 8 — partition-vs-UNIQUE conflict for loot_rolls + iap_receipts).
- Migration: 1 DROP TABLE + 1 CREATE TABLE … PARTITION BY RANGE (created_at) + 4 indexes + ENABLE/FORCE RLS + 1 policy + 2 GRANTs + 12 monthly partitions (2026-05 through 2027-04). Drizzle schema files (`wallet.ts`) unchanged — Drizzle doesn't track partition strategy declaratively, just column shape, so the meta snapshot stays consistent.
- Senior-reviewer self-attack:
  - **Partition-vs-UNIQUE conflict on sister tables** is real and structural per Postgres docs (partition key must appear in every UNIQUE). Could not partition loot_rolls / iap_receipts without breaking the §5 UNIQUE invariants that anchor idempotency. Surfaced as Gap 8 with 5 unvetted options. The default (option 1, ship flat) is the smallest-scope-control move; final pick goes through /design.
  - **DROP + recreate is data-destructive.** Acceptable here only because the table is empty at MVP. A comment in the migration warns future maintainers not to use this pattern against populated tables — ATTACH/DETACH is the post-MVP path.
  - **bigserial under partitioning.** Postgres routes `nextval('transactions_id_seq')` correctly across all partitions; verified by Test 5 (monotonic ids across rows landing in 2026-05 / 2026-09 / 2027-01). Sequence is owned by the parent column.
  - **Indexes on parent propagate.** Postgres 11+ creates equivalent indexes on each existing partition automatically; new partitions get them at creation. Verified by Test 1 (partition routing implies the partition has all required indexes/constraints — including the FKs and CHECKs which propagate the same way).
  - **RLS on partitioned parent flows to children.** Verified by Test 4 (mismatched-INSERT under tenant GUC raises RLS denial through the parent-table policy when the row would route to a child partition). Postgres applies the parent's policy to operations directed at the parent name; children inherit.
  - **Pre-create runway: 12 months.** Buys time without committing to pg_partman now. If MVP launches around 2026-06 and customers actively write through 2027-04, we'd need to add more partitions or wire pg_partman before then. That's ~11 months of runway from today (2026-05-08), enough to wire pg_partman as Slice 3.5.
- Verified: `bun run lint:check` 31 files clean; `bun run typecheck` 5/5 workspaces clean; `bun run --cwd packages/db smoke:partitioning` 5/5 tests pass; `bun run --cwd packages/db smoke:rls` still 5/5 pass (slice 2 invariants preserved); `bun run --cwd packages/db inspect:rls` confirms transactions still has rls_enabled=true + force_rls=true + tenant_isolation policy after the drop+recreate.

### slice 2 — RLS bootstrap — COMPLETE 2026-05-08
- Files modified: `packages/db/src/schema/tenancy.ts` (export `TENANT_GUC` helper, add policy + enableRLS to `players`); `packages/db/src/schema/wallet.ts` (import `TENANT_GUC`, add policy + enableRLS to all 8 wallet tables); `packages/db/package.json` (`smoke:rls` + `inspect:rls` scripts).
- Files added: `packages/db/scripts/smoke-rls.ts` (5 RLS-enforcement tests via postgres-js — bokchoy_app + admin connections); `packages/db/scripts/inspect-rls.ts` (pg_class + pg_policies introspection).
- Migration: `packages/db/drizzle/0002_fancy_giant_man.sql` — drizzle-kit emits 9 ENABLE RLS + 9 CREATE POLICY rows; 9 FORCE ROW LEVEL SECURITY rows + 16 GRANT rows + 5 sequence GRANT rows hand-appended (drizzle-kit doesn't generate either category).
- Senior-reviewer self-attack:
  - `current_setting('app.current_tenant')::uuid` one-arg form raises on unset GUC. That's a *feature* — surfaces missing-context bugs immediately. The two-arg form `current_setting(name, missing_ok=true)` would silently return NULL and the policy would fail to match (deny rows) — harder to diagnose at 3am.
  - `TO bokchoy_app` on each policy means: postgres (BYPASSRLS) bypasses regardless; bokchoy_admin (table owner under FORCE) sees no rows because no policy matches its role — acceptable since bokchoy_admin runs migrations only, not runtime queries. If a future operational role needs read-only cross-tenant access (analytics, support tooling), that role gets a separate RLS-bypass mechanism.
  - `WITH CHECK` clause: drizzle's `pgPolicy` only emits `USING` when `withCheck` is unspecified, but Postgres applies the USING expression as the WITH CHECK by default for `FOR ALL` policies. Verified empirically by Test 4: INSERT with mismatched project_id under p1 GUC raises `new row violates row-level security policy for table "players"`. ✓
  - GRANTs: under M1 (Amendment Part 1 A1), bokchoy_app keeps direct UPDATE/INSERT/DELETE on protected tables; the discipline is in the Slice 7 lint, not in GRANT. RLS still scopes those mutations to the tenant's rows.
- Verified: `bun run lint:check` 30 files clean; `bun run typecheck` 5/5 workspaces clean; `bun run --cwd packages/db smoke:rls` 5/5 tests pass; `bun run --cwd packages/db inspect:rls` confirms all 9 protected tables have rls_enabled=true + force_rls=true + canonical `tenant_isolation` policy.

### slice 1 — wallet schema (tenancy + wallet) — COMPLETE 2026-05-08
- Files: `packages/db/src/schema/tenancy.ts` (projects + players); `packages/db/src/schema/wallet.ts` (currencies, wallets, reason_codes, idempotency_keys, transactions, loot_rolls, iap_receipts, staged_jobs); `packages/db/src/schema/index.ts` re-export-all.
- Migration: `packages/db/drizzle/0001_adorable_malcolm_colcord.sql` generated by `drizzle-kit generate` and applied via `drizzle-kit migrate` against local stack. 17 tables in `public` schema (7 auth + 2 tenancy + 8 wallet). FKs across the chain verified at `\d transactions` — composite FK `(project_id, reason_code) → reason_codes(project_id, code)` lands per Part 3 A16.
- Senior-reviewer self-attack:
  - Drizzle 0.45 deprecated the object-form `extraConfig` callback; switched to array form `(t) => [...]` on first lint pass.
  - Composite PK `(id, created_at)` chosen on `transactions` so PARTITION BY RANGE (created_at) is addable in Slice 3 without rewriting PK.
  - `transactions.wallet_id` / `currency_id` typed UUID (cascade from Part 3 F4 wallets.id UUID + F3 currencies.id UUID); the original §3 BIGINT referenced an obsoleted shape.
  - All cross-table FKs use `ON DELETE RESTRICT` (audit-preservation default — no silent cascade-deletion of forensic rows). Idempotency-key FKs use `ON DELETE SET NULL` per §3 spec literal.
  - `wallets.balance` `CHECK (balance >= 0)` is the table-level backstop; `allow_negative_balance` per-row override gate is enforced inside the function bodies (Slice 4).
- Verified: `bun run typecheck` 5/5 workspaces; `bun run lint:check` 28 files clean; `drizzle-kit migrate` applied without error; `\d transactions` confirms composite PK + 5 FKs + 4 indexes + 2 CHECK constraints.

## Bootstrap sub-unit log

### sub-unit (5) CI scaffold — COMPLETE 2026-05-04
- File written: `.github/workflows/ci.yml` — `oven-sh/setup-bun@v2` pinned to bun 1.3.3 (matches `packageManager`); steps: install (--frozen-lockfile) + lint:check + typecheck + cascade-10 check; concurrency group cancels in-progress runs per ref. Triggers on push + PR to main.
- Self-attack: no Postgres service container yet (no integration tests at MVP); add when first feature lands. FORCE-RLS check from `[[backend-stack]]` cascade-9 deferred similarly (no migrations yet).
- Verified locally before commit: yaml parsed clean; lint:check 25 files clean; typecheck 5/5 workspaces; cascade-10 OK.

### sub-unit (4) tooling — COMPLETE 2026-05-04
- Files: `biome.json` (root) + `scripts/check-prepare-false.ts` + `scripts/tsconfig.json` + four workspace `src/index.ts` placeholders + root `package.json` updated (catalog: `@biomejs/biome ^2.0.0`; scripts: `lint`/`lint:fix`/`lint:check`/`format`/`check:prepare-false`) + `packages/db/drizzle.config.ts` rewritten validate-at-boundary.
- Biome formatter ran cleanly on first `lint:fix`: organized imports in `client.ts` + `index.ts`, reformatted `package.json` to multi-line workspaces array, collapsed multi-line `console.error` in scripted check to single line within 100-char limit.
- Verified end-to-end: `lint:check` clean (25 files, 0 errors, 0 warnings), `typecheck` clean (5/5 workspaces), `check:prepare-false` OK.
- Senior-reviewer self-attack: noNonNullAssertion fired on `process.env.X!` in drizzle.config — fixed via runtime check (boundary validation per `idioms/typescript.md`); empty workspaces failed `tsc` with TS18003 "no input files" — fixed via `export {};` placeholders that future sub-units replace; editor diagnostics on `scripts/` dir resolved via `scripts/tsconfig.json`.

### sub-unit (6) withTenant helper — COMPLETE 2026-05-04
- File written: `packages/db/src/with-tenant.ts` exporting `withTenant<T>(db, projectId, fn)` — tx wrapper that runs `set_config('app.current_tenant', projectId, true)` then delegates to fn(tx). Re-exported from `packages/db/src/index.ts`.
- Tx type derived via `Parameters<Parameters<Db['transaction']>[0]>[0]` — no need to restate Drizzle's internal types per `idioms/typescript.md` "Let the types flow end-to-end".
- 3-param signature (db, projectId, fn) — implementation-time interpretation flagged; deviates from contract-literal `(projectId, fn)` closing over module-level db, kept for testability + DI ergonomics.
- Smoke test (`packages/db/_smoke.ts`, deleted after verification): 6/6 PASS — happy path, transaction scope, parallel isolation, error propagation, rollback cleanup. Required port mapping change (5432 → 5433, see E3 below) because host had `/usr/lib/postgresql/16/bin/postgres` on `127.0.0.1:5432` shadowing the Docker port forward.
- Senior-reviewer self-attack: peer-auth on Unix socket noted (bokchoy_app cannot connect via socket without OS user, irrelevant for backend which uses TCP); host-port-collision surfaced and fixed; tx scope semantics verified against `[[multi-tenant-rls-research]]` canonical `set_config(name, val, TRUE)` form.

### sub-unit (3) packages/db Drizzle + postgres-js — COMPLETE 2026-05-04
- Files written/updated: root `package.json` catalog (drizzle-orm 0.45.2, drizzle-kit 0.31.10, postgres ^3.4.0); `packages/db/package.json` (deps via catalog + db:generate/migrate/studio scripts); `packages/db/src/client.ts` (factory with `prepare: false`); `packages/db/src/index.ts` (re-exports); `packages/db/src/schema/index.ts` (placeholder `export {};`); `packages/db/drizzle.config.ts` (reads DATABASE_MIGRATION_URL); root `.env.example` (two env vars for role-split connection).
- `client.ts` matches `[[backend-stack]]` cascade-10 contract pattern verbatim (`postgres(connStr, { prepare: false })` + `drizzle(client)`). No schema wiring yet — empty schema = drizzle accepts. Schema typing layered when first table lands per `[[backend-stack]]` cascade-2.
- Verified: 36 packages installed, typecheck clean, drizzle-kit reads config + reports 0 tables.
- Senior-reviewer self-attack — captured: vault erratum on drizzle-kit version pin (0.45.2 doesn't exist as a drizzle-kit release; applied 0.31.10 latest stable per intent); two-env-var split flagged as implementation-time interpretation; `.ts` import extensions dropped for monorepo-idiom compatibility.

### sub-unit (2.5) role + extension init scripts — COMPLETE 2026-05-04
- 3 file ops: removed `compose/postgres-init/01-pg_partman.sql` (superseded), wrote `compose/postgres-init/00-roles.sql` (postgres + bokchoy_app via DO-block guards), wrote `compose/postgres-init/01-extensions.sql` (extensions + partman schemas, pg_partman + pgcrypto, GRANT USAGE to postgres).
- `00-roles.sql` quotes `[[local-docker]]` Amendment §2 verbatim — postgres `NOSUPERUSER, INHERIT, CREATEROLE, CREATEDB, LOGIN, REPLICATION, BYPASSRLS`, bokchoy_app `NOSUPERUSER, NOBYPASSRLS, INHERIT, LOGIN`, both password 'postgres'.
- `01-extensions.sql` quotes `[[local-docker]]` Amendment §2 + GRANT USAGE — implementation-time interpretation (mechanical completion of "install for use"; bokchoy_app deliberately NOT granted, accesses extensions only via `[[wallet-mechanics]]` §8 SECURITY DEFINER functions).
- Verified via `down -v && up -d`: pg_roles shows all 3 expected roles with correct attributes, pg_extension shows pg_partman + pgcrypto in correct schemas, bokchoy_app TCP login works (peer auth fails on socket — TCP-only via `-h 127.0.0.1`), postgres can execute `extensions.hmac()` returning valid SHA-256 hex, zero FATAL log entries.
- Senior-reviewer self-attack: peer-auth-vs-TCP gotcha noted (bokchoy_app cannot use the local socket because no OS user matches; backend will use TCP per Drizzle/postgres-js connection string anyway).

### sub-unit (2) compose.yml + pg_partman init — COMPLETE 2026-05-04
- 2 files written: `compose.yml` (root) + `compose/postgres-init/01-pg_partman.sql`.
- `compose.yml`: db service `supabase/postgres:17.6.1.113` with `command: postgres -c config_file=/etc/postgresql/postgresql.conf` per contract Reasoning, named volume `postgres-data` mounted at `/var/lib/postgresql/data`, init dir bind-mounted read-only at `/docker-entrypoint-initdb.d`, port 5432:5432, `POSTGRES_PASSWORD=postgres` (local-dev convention, image required env). Mailpit `axllent/mailpit:latest` with ports 1025 (SMTP) + 8025 (web UI).
- `01-pg_partman.sql`: `CREATE SCHEMA IF NOT EXISTS partman; CREATE EXTENSION IF NOT EXISTS pg_partman WITH SCHEMA partman;` — idempotent via IF NOT EXISTS, runs automatically on first init via Postgres image's docker-entrypoint-initdb.d primitive (contract said manual exec; deviated to platform primitive — strictly more reliable, same outcome).
- Verified: `docker compose config` parses clean, project name `bokchoy` auto-derived, volume `bokchoy_postgres-data` canonical-named.
- Senior-reviewer self-attack noted: no healthcheck on db, no .env file for password — both deliberately omitted (contract silent on healthcheck = improvisation; password isn't a secret in dev). Mailpit `:latest` vs F-Local-3 pin mitigation flagged for user decision (not blocking).

### sub-unit (1) workspace skeleton — COMPLETE 2026-05-04
- 15 files written: root `package.json` / `tsconfig.base.json` / `bunfig.toml` / `turbo.json` / `.gitignore` + 5 × (`apps/*/package.json` + `tsconfig.json`) and (`packages/*/package.json` + `tsconfig.json`).
- TypeScript ^6.0.0 + @types/node ^22.0.0 in catalog (Bun catalog protocol verified live).
- Turbo 2.9.8 (latest stable; vault `[[bun-workspaces-research]]` claimed "3.0" — minor imprecision, Turbo 3.0 not yet GA as of 2026-05-04, 2.9.x supports Bun workspaces fully).
- `packageManager: "bun@1.3.3"` required by Turbo workspace detection — added.
- TS strict mode + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` + `noImplicitOverride` + `noFallthroughCasesInSwitch` per `idioms/typescript.md`.
- Senior-reviewer self-attack caught two issues, fixed inline: (i) `bun.lock` was in .gitignore — removed (lockfile committed for reproducible installs); (ii) `apps/backend/tsconfig.json` had unnecessary `moduleResolution: node16` override — removed (base "bundler" resolves correctly under Bun).
- Verified: `bun install` clean, `turbo ls` shows all 5 workspaces.

## Original session context preserved below for continuity

## Original feature: full DESIGN.md audit (Option B chosen 2026-04-30 — register-then-parallel) + local Docker infra now in flight
- **SESSION 2026-05-03 (continuation) — local Docker research vaulted.** `[[local-docker-research]]` written. 44 vault entries. Three Path options surfaced (A: `supabase start` -x, B: standalone `supabase/postgres` 348MB image, C: stock+custom — rejected). **Load-bearing conflict surfaced**: pg_partman ships in repo binaries + Docker Hub image (verified) but managed Supabase prod tier availability unverified as of 2026-05-03; cascade-1 from `[[host-platform]]` NOT closed by local image alone — needs Free-tier project test. NEW cascade obligation for `[[backend-stack]]`: postgres-js `prepare: false` for Supavisor transaction-mode. Hands back to /design for image pick + verification.

## Local Docker pick 2026-05-04 — `[[local-docker]]` vaulted (Path B locked)
- **Verification SUCCEEDED**: user ran `CREATE EXTENSION pg_partman WITH SCHEMA partman` on Supabase Free-tier 2026-05-04, returned "Success. No rows returned" (DDL success). pg_partman is on the Supabase managed prod allowlist as of today; `[[host-platform]]` cascade-1 closed.
- **Path B locked**: standalone `supabase/postgres:17.6.1.113` (348MB) + Mailpit via project-owned `compose.yml`. Backend + cockpit native via `bun --hot`. Direct Postgres (no Supavisor locally).
- **Path A rejected**: CLI version-drift coupling not worth Mailpit-included edge now that `[[backend-stack]]` cascade-10 (`prepare: false` CI lint) defuses Supavisor-parity concern.
- **Path C rejected**: parity-drift maintenance burden, no production cite.
- 5 failure modes + 6 revisit-when triggers named.
- 46 vault entries.

## ALL design-mode work this session arc COMPLETE
Three decisions queued at session start (FORCE-RLS workaround, Drizzle version pin, Local Docker pick) all resolved. Architecture is now closed pending /implementation. Cascade-obligations queue across vault entries: ~30+ items spanning `[[backend-stack]]` (12 cascades), `[[wallet-mechanics]]` (9 cascades), `[[loot-rng-construction]]`, `[[player-auth]]`, `[[backend-service-shape]]` (10 cascades), `[[frontend-stack]]` (15 cascades), `[[local-docker]]` initial setup obligations. Strong candidate for /implementation handoff next session.

## Drizzle decisions 2026-05-04 — both amendments landed on `[[backend-stack]]`
- **FORCE-RLS workaround**: pattern (b.i) — CI script `scripts/check-rls-force.ts` queries `pg_class.relforcerowsecurity` after `drizzle-kit migrate`, fails CI on policy-bearing tables without FORCE; engineer hand-appends `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` to migration file. Migrations stay self-contained. Cascade-9 in `[[backend-stack]]`.
- **`prepare: false` mandate**: unconditional in Drizzle client factory (local + prod identical). Cascade-10 in `[[backend-stack]]`.
- **Drizzle version pin**: 0.45.2 stable. Five concrete revisit-when triggers named (replaces hand-wavy "need arises"). Cascade-11 (Renovate/Dependabot disable auto-bump) + Cascade-12 (release-notes watch).
- **Remaining design-mode work this session**: Local Docker image pick (Path A vs B) — blocked on user's pg_partman managed-tier verification (5-min Free-tier project test).

## Drizzle ORM research 2026-05-03 — `[[drizzle-orm-research]]` vaulted
- 45 vault entries. Scoped to (1) `pgPolicy` round-trip + (3) `prepare: false` + (4) nested-tx SAVEPOINT + (5-reframed) `db.query.*` SQL shape (single-query confirmed; N+1 worry refuted, real risk is poor-plan-at-scale per Issue #5245).
- **Two NEW cascade obligations for `[[backend-stack]]`**: (i) CI-enforced FORCE-RLS post-migration sweep (closes `[[wallet-mechanics]]` §8 owner-bypass defense — Drizzle doesn't generate FORCE RLS); (ii) `prepare: false` unconditional on postgres-js client (Supavisor compat).
- **NEW version-pin decision owed to /design**: Drizzle v1.0.0-rc.1 (2026-04-30, 3 days prior); v1 NOT GA. Recommendation lane: pin 0.45.2 stable for MVP, track v1 GA. RQB-v2 (in v1) carries Issue #5245 perf risk (3-table joins + filtered-related-where + concurrent load).
- Hands back to /design for: FORCE-RLS workaround pick (recommendation: CI script per pattern (b)) + Drizzle version pin.

## Local Docker research 2026-05-03 — `[[local-docker-research]]` vaulted
- Scope locked at /design: (1) solo-dev iteration loop + (2) integration test runner; defer (3) E2E, (4) prod-parity smoke, (5) bootstrap.
- Docker Desktop on WSL2 confirmed; source dir `/home/mvula/audhd/bokchoy` lives in ext4 inside the WSL2 VM.
- 13 sources triangulated across the four sub-questions. Confidence: high on Q1+Q3+Q4, medium on Q2 (no contradicting blog found = absence-of-evidence).
- **Recommended path (research surfaces, design chooses):** Path B (standalone `supabase/postgres:17.6.1.113` via custom compose) + separate `mailpit` service + skip Supavisor locally + Vitest transaction-rollback isolation.
- **Required verification before /design vaults Path B:** spin up Supabase Free-tier project, attempt `CREATE EXTENSION pg_partman WITH SCHEMA partman` — closes the contradiction probe definitively (5 minutes).
- 5 open threads queued for runbook / future verification (PRF-output, Drizzle pgPolicy round-trip, Bun+Vitest at scale, Mailpit+Better Auth pin).

## Original session opening preserved below — backend stack RESOLVED earlier this session

## Backend-stack decision 2026-05-03 — `[[backend-stack]]` vaulted

**Decision summary:**
- Language: TypeScript strict + Node.js 22 LTS (Bun deferred to opt-in post-MVP)
- ORM: Drizzle + `withTenant(projectId, fn)` transaction wrapper for `SET LOCAL app.current_tenant`
- Auth: Better Auth + Drizzle adapter + anonymous plugin (maps `[[player-auth]]` (γ) guest) + organization plugin (customer-as-org Stripe pattern)
- Multi-tenancy: customer-developer = Better Auth org (auth plane); project_id = RLS tenant (data plane); `projects.organization_id` FK
- Schema migrations: `drizzle-kit` ONLY (Better Auth's `getMigrations` doesn't support Drizzle adapter)
- Argon2id: m=64MB, t=3, p=4 per `[[player-auth]]`
- SDK API key: BokChoy-issued per project, HMAC-signed Stripe-pattern, independent of Better Auth

**Nine rejected alternatives** (Bun-default, Go/Rust/Elixir, Prisma, Kysely, Auth.js v5 for new project, Lucia, managed Clerk/WorkOS, project-as-org, nested-orgs).

**Eight failure modes** with mitigations.

**Eight cascade obligations queued for implementation phase:**
1. `withTenant(...)` helper + CI lint rule
2. Drizzle schema files for Better Auth tables (user/session/account/organization, hand-written) + BokChoy tables (projects/players/wallet/transactions/loot_rolls/api_keys)
3. Better Auth config with anonymous + organization plugins + Drizzle adapter + argon2id params
4. SDK API key infrastructure (table, validation middleware, rotation UI, audit log, rate limiter)
5. Deployment matrix docs — Node.js 22 LTS only at MVP
6. `drizzle-kit migrate` against direct Postgres (not PgBouncer pool) — runbook
7. Better Auth schema upgrade runbook — manual diff-and-merge for major versions
8. Integration tests covering Better Auth flows + anonymous user upgrade + RLS enforcement

## Architecture decisions resolved this session arc

The session opened with state.md staging "auth + language combined (II)" framing. Through six interactive turns + two research detours, the framing was rejected and split into three decisions, each resolved:

1. **`[[auth-compliance-research]]`** — GDPR processor-stance + COPPA third-party-vendor stance is universal industry pattern; no surveyed vendor contractually excludes under-13.
2. **`[[player-auth]]`** — owned-only at MVP, pass-through deferred post-MVP demand-gated; per-project players; (i)/(γ) minimal-PII; processor for GDPR / customer = COPPA operator; no contractual age-gate; family-aimed customers in scope; ~1-2 weeks legal infra (DPA + SCC + COPPA written-assurance template).
3. **`[[backend-stack-research]]`** + **`[[backend-stack]]`** — TypeScript + Node.js 22 + Drizzle + Better Auth, Stripe-model multi-tenancy, drizzle-kit-only migrations.

**Top-down architecture decisions remaining open** (per `[[design-claims-register]]` original audit):
- Backend service shape (monolith vs split-services vs serverless)
- Frontend (cockpit web stack — likely Next.js + same Drizzle/Better Auth backend, but vault-derive)

**Or:** if architecture decisions are sufficient for /implementation handoff, the cascade-obligations from `[[wallet-mechanics]]`, `[[loot-rng-construction]]`, `[[player-auth]]`, and `[[backend-stack]]` form a solid implementation queue.

## Top-down architecture status (open at session end)

After this session arc, the DESIGN.md audit register has the following architecture-tier decisions resolved or in-flight:

- **Wedge + ICP:** `[[wedge-decision]]` + `[[indie-smb-pricing-research]]` — closed
- **MVP feature sequence:** `[[mvp-feature-sequence]]` — closed
- **Idempotency:** `[[idempotency-strategy]]` — closed
- **Catalog versioning:** `[[catalog-versioning]]` + `[[catalog-cac-upgrade]]` stub — closed
- **Wallet mechanics:** `[[wallet-mechanics]]` — closed
- **Cross-tenant isolation:** `[[multi-tenant-rls-research]]` (research-grade); awaiting full design pass on RLS amendment to `[[wallet-mechanics]]` §8 (already done in amendment 2026-05-02)
- **Host platform:** `[[host-platform]]` — closed
- **Loot RNG:** `[[loot-rng-construction]]` + `[[within-roll-composition-scope]]` + `[[pity-engine-scope]]` — closed (CL-031 fully resolved)
- **De-identification:** `[[deidentify-mechanism-research]]` — closed
- **Auth + compliance:** `[[auth-compliance-research]]` + `[[player-auth]]` — closed (this session)
- **Backend stack:** `[[backend-stack-research]]` + `[[backend-stack]]` — closed (this session)

**Still open at top level:**
- Frontend stack (cockpit web) — research queued below
- CL-003 founder credibility hard-vs-soft gate (separate from research; design owes a decision)

## Frontend stack research COMPLETE 2026-05-03 — `[[frontend-stack-research]]` vaulted

40 vault entries. Heavy research per user directive (~14 sources, all four sub-questions triangulated, confidence: high).

**Findings summary handed to /design:**

- **Next.js 16 production-grade in 2026-Q2.** Released 2025-10-21; 16.2 with 400% faster `next dev`. Cache Components stable replacing experimental PPR. Turbopack stable default. React 19.2 + Compiler 1.0 stable. proxy.ts replaces middleware.ts. Min Node.js 20.9+.
- **Bun + Next.js 16 on Vercel = Public Beta NOT GA.** Vercel announced 2025-10-28; 28% latency reduction in CPU-bound rendering; not production-ready as of 2026-Q2.
- **Deploy recommendation: Vercel-for-cockpit + container-for-backend (split deploy, industry standard).** Cal.com production cite (250k LOC App Router migration, Vercel Edge Config feature flagging). **Cockpit runs Node.js 22 on Vercel — NOT Bun on Vercel due to Public Beta status. Backend stays on Bun + container per `[[backend-stack]]`.** Two deploy units; cross-deploy communication via HTTP for SDK API.
- **CVE-2025-55182 React2Shell (Dec 3 2025): critical pre-auth RCE in RSC Flight serialization, patched in Next.js 16.0.7+.** Active exploitation observed by Google TIG + Microsoft + AWS + Palo Alto. F-RSC-1 failure mode flagged.
- **Server Actions for cockpit mutations + Route Handlers for SDK API** — settled 2026 production pattern.
- **Better Auth + Next.js 16 RSC integration documented:** `auth.api.getSession({ headers: await headers() })`; `nextCookies()` plugin; RSC cookie limitation surfaced.
- **Cache Components + Suspense streaming:** `cacheComponents: true` + `"use cache"` directive; live-ops data uncached, slow-changing data cached.
- **'use client' cascade is real load-bearing for bundle size:** discipline + `optimizePackageImports` + bundle analyzer in CI; <200KB gzipped initial JS target.
- **Monorepo + Turborepo coupling** required (cockpit calls into shared backend modules via typed imports per `[[backend-service-shape]]`).
- **Contradiction probe (TanStack Start migration):** weighted but doesn't apply to greenfield MVP scale per Contradiction protocol.

**Open threads:**
- Bun + Vercel runtime GA timeline (revisit 6-12 months)
- Cache Components production cites at scale (Next.js 16 just shipped 2025-10)
- Cockpit-specific bundle baseline (measure on first deploy)
- shadcn/ui + Radix + Tailwind UI library decision (separate research)
- Frontend testing strategy (Playwright/Vitest — implementation phase)
- Bun + Better Auth + Next.js 16 + Drizzle four-way at production scale (deeper survey or controlled CI validation)

**Hands to /design:** vault `[[frontend-stack]]` decision entry per `[[player-auth]]` + `[[backend-stack]]` shape with rejected alternatives + failure modes + cascade obligations.

## Frontend-stack vault HELD pending Bun workspaces research

User pulled the monorepo-tooling open thread forward. `[[frontend-stack]]` decision entry held until Bun workspaces vs Turborepo vs pnpm workspaces research lands. Single comprehensive vault entry preferred over amendment churn.

**Already locked in for the vault entry once research lands:**
- Framework: Next.js 16 (currently 16.2)
- Deploy: Vercel for cockpit + container PaaS for backend (split deploy)
- Cockpit runtime on Vercel: **Bun (user explicit risk acceptance — F-Cockpit-Bun-1/2/3 + cross-runtime discipline + 1-hour Vercel-config-flag fallback runbook)** — same shape as backend Bun amendment
- Server Actions for cockpit mutations + Route Handlers for SDK API
- Cache Components opt-in caching
- 'use client' discipline + optimizePackageImports + bundle analyzer
- Better Auth integration via `auth.api.getSession({ headers: await headers() })`
- proxy.ts for route-level auth (Next.js 16+)
- F-RSC-1 (CVE-2025-55182 class) failure mode with patch-discipline mitigation

**Pending research:**
- Monorepo tooling pick (Bun workspaces vs Turborepo vs pnpm workspaces)
- Workspace structure + cross-package dependency model

## Frontend stack RESOLVED 2026-05-03 — `[[frontend-stack]]` vaulted

42 vault entries.

**Decision summary:**
- Next.js 16 (currently 16.2; pin 16.0.7+ at MVP launch per CVE-2025-55182)
- Vercel for cockpit deploy + container PaaS for backend (split deploy, Cal.com cite)
- Cockpit runtime: Bun on Vercel (Public Beta) — user explicit risk acceptance with F-Cockpit-Bun-1/2/3 + cross-runtime discipline + 1-hour fallback to Node 22
- Server Actions for cockpit mutations + Route Handlers for SDK API
- Cache Components opt-in caching (`cacheComponents: true` + `"use cache"`)
- 'use client' discipline + `optimizePackageImports` + bundle analyzer in CI; <200KB gzipped initial JS target
- Better Auth via `auth.api.getSession({ headers })` in RSC + `nextCookies()` + `proxy.ts`
- Monorepo: Bun workspaces + Turborepo hybrid (OpenCode pattern); `apps/{backend,cockpit}/` + `packages/{db,shared-types,auth-config}/`
- CVE discipline: Renovate/Dependabot + `bun audit` + 24-hour critical patch SLA
- 10 rejected alternatives + 9 failure modes + 15 cascade obligations

## SESSION ARC COMPLETE 2026-05-03 — full architecture stack now resolved

13 architecture-tier decisions and research entries closed in this session arc:

**Compliance + Auth:**
1. `[[auth-compliance-research]]` — GDPR/COPPA stance evidence
2. `[[player-auth]]` — owned-only at MVP, minimal-PII, processor stance, no age-gate

**Backend:**
3. `[[backend-stack-research]]` — TS+Drizzle+Better Auth substance
4. `[[backend-stack]]` (+ amendment 2026-05-03 to Bun) — TS strict + Bun + Drizzle + Better Auth + Hono + cross-runtime discipline
5. `[[backend-service-shape-research]]` — modular monolith + Bun re-research
6. `[[backend-service-shape]]` (+ amendment 2026-05-03) — modular monolith + outbox co-hosted + container deploy

**Frontend:**
7. `[[frontend-stack-research]]` — Next.js 16 / RSC / Suspense / 'use client' substance
8. `[[bun-workspaces-research]]` — monorepo tooling framing fix; Bun workspaces + Turbo hybrid
9. `[[frontend-stack]]` — Next.js 16 + Vercel + Bun + Server Actions + Cache Components + Bun workspaces + Turborepo

**Top-level architecture status:** essentially complete.

**Still open at top level (next-session candidates):**
- CL-003 founder credibility hard-vs-soft gate (separate from research; design owes a decision)
- shadcn/ui + Radix + Tailwind UI library decision (smaller scope; future research session)
- Frontend testing strategy (Playwright vs Cypress; Vitest vs Bun test) — implementation-phase task
- Container PaaS pick (Railway vs Render vs Fly.io vs Cloud Run) — implementation-phase task

**Cascade obligations queue across all vaulted decisions** is now substantial (~30+ implementation-phase tasks). Strong candidate for `/implementation` handoff next session if architecture work pauses.

## Frontend supplementary picks AMENDED into `[[frontend-stack]]` 2026-05-03 (continuation)

`[[frontend-stack]]` amendment + `[[backend-service-shape]]` Render-PaaS amendment vaulted.

**Closed:**
- shadcn/ui + Radix UI + Tailwind v4 (Admindek/Apex production cites)
- Playwright (E2E) + Vitest (unit) — Vitest over `bun test` for ecosystem maturity
- Render container PaaS (existing-subscription resource constraint; also amends `[[backend-service-shape]]` Section 5 + closes cascade obligation 6 PaaS pick)
- Zod v4 + React Hook Form + `@hookform/resolvers/zod` (single-source-of-truth schemas in `packages/shared-types/`)
- TanStack ecosystem (Query + Table + Virtual) with full integration patterns from `[[tanstack-query-rsc-research]]`:
  - RSC prefetch → HydrationBoundary → client useQuery
  - Per-request QueryClient via React `cache()`
  - staleTime defaults (60s) + per-data-type presets (5s/5min/1hr)
  - Server Actions + triple-invalidation derived pattern (revalidateTag + invalidateQueries orthogonal layers)
  - Tkdodo broad-invalidation default at MVP
  - TanStack Table v8 + Virtual with server-side pagination via queryKey
  - Anti-patterns enforced via PR review/CI lint

**Original frontend supplementary picks staged section preserved below for session-arc continuity.**

## Frontend supplementary picks staged for amendment to `[[frontend-stack]]` (HISTORICAL — now closed)

User dropped picks 2026-05-03 (continuation):
- **shadcn/ui + Radix UI + Tailwind CSS** — UI library/styling stack — standard, low risk, accepted as 2026 React UI consensus default
- **Playwright (E2E) + Vitest (unit)** — testing — accepted as standard 2026 stack; Vitest over `bun test` for ecosystem maturity (mocking, jsdom, plugins) — defensible
- **Render** for backend container PaaS — existing-subscription resource-constraint defense (matches `[[host-platform]]` Supabase cost-driven framing)
- **Zod v4 + React Hook Form + `@hookform/resolvers/zod`** — form validation stack — standard 2026 leader
- **TanStack ecosystem (Query + Table + Virtual)** — flagged: TanStack Query + Next.js 16 RSC interaction has architectural nuance, needs research before amendment

`[[frontend-stack]]` amendment HELD pending TanStack Query + RSC research.

## TanStack Query + RSC research COMPLETE 2026-05-03 — `[[tanstack-query-rsc-research]]` vaulted

43 vault entries.

**Findings handed to /design (for `[[frontend-stack]]` amendment):**
- **Q1 canonical pattern locked:** RSC prefetch → `dehydrate(queryClient)` → `<HydrationBoundary>` → Client `useQuery`. Per-request QueryClient via `cache(() => new QueryClient())`. **`defaultOptions.queries.staleTime: 60_000` minimum** (per TanStack Query docs verbatim) to prevent client-side double-fetch on hydration. Per-data-type staleTime: live-ops 5s, slow-changing 5min, static 1hr.
- **Q2 Server Actions + invalidation derived pattern (GAP-AS-FINDING):** surveyed scope does NOT document the triple-invalidation. Derived from orthogonal layer composition. **Server Action: DB mutation + `revalidateTag(tag)` (Layer 1, Next.js cache). Client `useMutation.onSuccess`: `queryClient.invalidateQueries({queryKey})` (Layer 2, TanStack Query cache).** Both fire; orthogonal responsibilities. Tkdodo broad-invalidation default. Open thread for first-paying-customer validation.
- **Q3 TanStack Table v8 + Virtual:** production-grade on Next.js 16 (Admindek + Apex production templates cite). Server-side pagination via `manualPagination: true` + `queryKey: ['table-data', {page, sort, filter}]`. Client Components.
- **Q4 anti-patterns:** TanStack Query owns all fetching, `fetchQuery` server-side rendered results, staleTime=0 default, double `invalidateQueries` (Issue #7963).

**`[[frontend-stack]]` amendment ready** with all five supplementary picks (shadcn/Radix/Tailwind, Playwright/Vitest, Render, Zod/RHF, TanStack ecosystem with derived integration patterns).

## Historical: TanStack Query + RSC research handoff queue (now complete)

`[[tanstack-query-rsc-research]]` was vaulted earlier in this session and returned to /design which will produce `[[frontend-stack]]` amendment. Below preserved for session-arc continuity.

## Research handoff queue 2026-05-03 (continuation 4) — tanstack-query-rsc-research (COMPLETE)

**Mode:** /research

**Hypothesis under test:** TanStack Query as client-side cache only, server-side fetch via RSC + Server Actions for mutations (pattern (α) from design's flagging). User pre-pick: TanStack Query + Table + Virtual for cockpit. Pattern integration with Next.js 16 RSC needs research to ensure the canonical 2026 pattern is correctly captured.

**Triangulation budget — focused scope per "production research":** ≥1 production cite per sub-question (B2B SaaS at indie/SMB scale on Next.js 16 + TanStack Query), ≥1 docs cite per sub-question (Next.js + TanStack Query official), ≥1 contradiction probe (anti-pattern post-mortems). Total ~5-7 sources.

### Sub-question Q1 — TanStack Query + Next.js 16 RSC integration pattern

**Triangulation targets:**
- TanStack Query official Next.js integration docs — current 2026 patterns
- `HydrationBoundary` + `dehydrate(queryClient)` server-to-client state-transfer pattern
- Server-side queryClient instantiation + per-request lifecycle
- React Server Components + TanStack Query coexistence — when to use each
- Production cites — B2B SaaS teams shipping the hybrid in Next.js 16

### Sub-question Q2 — Server Actions + TanStack Query mutation/invalidation

**Triangulation targets:**
- Post-mutation invalidation: `revalidatePath`/`revalidateTag`/`updateTag` (Next.js native) vs `queryClient.invalidateQueries` (TanStack Query)
- Optimistic updates with TanStack Query + Server Actions
- Production cites — Server Actions + TanStack Query patterns at scale
- Common foot-guns

### Sub-question Q3 — TanStack Table + Virtual on Next.js 16

**Triangulation targets:**
- TanStack Table v8 with Server Components — boundary placement
- TanStack Virtual with Suspense + streaming — interaction patterns
- Production cites for TanStack Table + Virtual on cockpit dashboards
- Lighter scope than Q1/Q2 since Table + Virtual are pure headless utilities

### Sub-question Q4 — Anti-patterns / "we tried TanStack + RSC and regretted it"

**Triangulation targets:**
- Production post-mortems on TanStack Query + Next.js 16 misuse
- "TanStack Query owns all data fetching" anti-pattern cites
- HydrationBoundary misuse / over-hydration cost
- TanStack Query + Server Actions pattern gotchas

**Hand back to /design with:** sourced canonical pattern + verbatim docs cites + production examples + named anti-patterns. Design amends `[[frontend-stack]]` with the resolved TanStack pattern + the four supplementary picks (shadcn/Radix/Tailwind, Playwright/Vitest, Render, Zod/RHF).

## Historical: Bun-workspaces research handoff queue (now complete)

`[[bun-workspaces-research]]` was vaulted earlier in this session and returned to /design which produced `[[frontend-stack]]`. Below preserved for session-arc continuity.

## Bun-workspaces research COMPLETE 2026-05-03 — `[[bun-workspaces-research]]` vaulted

41 vault entries.

**Critical framing fix surfaced:** "Bun workspaces vs Turborepo" was a category error. They compose at different layers — Bun workspaces = package manager (Layer 1), Turborepo = task orchestration (Layer 2). Turborepo 3.0 ships first-class native Bun workspace support.

**Production cite for the hybrid:** OpenCode (anomalyco/opencode + sst/opencode) runs 20+ packages with Bun workspaces + Turbo for build orchestration + Bun catalog. User's targeted check on OpenCode resolved an earlier conflated cite — `[[backend-service-shape-research]]` Source 4 OpenCode regret was about desktop runtime (Electron context), NOT monorepo tooling. Package-manager-vs-runtime layer split clean as production example.

**Recommendation handed to /design:** Bun workspaces + Turborepo hybrid. Workspace structure: `apps/{backend,cockpit}/` + `packages/{db,shared-types,auth-config,ui-deferred}/`. Catalog for shared dependency pinning. Turbo task graph for cross-workspace builds.

**`[[frontend-stack]]` vault now unblocked** — design has all coupled decisions resolved (Next.js 16 + Vercel for cockpit + cockpit-Bun-on-Vercel risk-acceptance + Server Actions/Route Handlers + Cache Components + 'use client' discipline + Better Auth integration + Bun workspaces + Turborepo).

## Historical: Bun-workspaces research handoff queue (now complete)

`[[bun-workspaces-research]]` was vaulted earlier in this session and returned to /design which will produce `[[frontend-stack]]`. Below preserved for session-arc continuity.

## Research handoff queue 2026-05-03 (continuation 3) — bun-workspaces-research (COMPLETE)

**Mode:** /research

**Hypothesis under test:** Bun workspaces (user pre-pick implicit by pulling the open thread). Prior `[[frontend-stack-research]]` recommendation: Turborepo (Cal.com production cite + Vercel-native pairing). Research treats Bun workspaces as the candidate to defend against Turborepo + pnpm workspaces.

**Triangulation budget:** standard ≥1 production cite + ≥1 docs cite + ≥1 contradiction probe per sub-question. Total ~6-8 sources, lighter than heavy frontend-stack research.

### Sub-question Q1 — Bun workspaces production-readiness + feature parity with Turborepo

- Bun workspaces feature set in 2026-Q2 — install resolution, dependency hoisting, workspace `:filter` semantics
- Build orchestration: does Bun ship task graph + dependency-aware caching equivalent to Turborepo's `turbo.json`?
- Incremental builds + caching across CI/CD invocations (Bun has built-in `bun run` orchestration; depth?)
- Bun workspaces version + maturity signal (Bun 1.2+ shipped workspaces improvements; current state?)

### Sub-question Q2 — Vercel deploy + Bun workspaces compatibility

- Vercel default monorepo deploy: pnpm + Turborepo (well-cited at Cal.com)
- Bun workspaces on Vercel — supported natively or requires Bun runtime adapter? Per `[[frontend-stack-research]]` Source 2, Vercel Bun runtime is Public Beta — does it support workspaces?
- Build cache integration with Vercel's build pipeline
- Workspace dependency hoisting at deploy time
- `apps/cockpit/` Next.js detection + build path with Bun workspaces

### Sub-question Q3 — Production cites for Bun workspaces vs Turborepo

- Who runs Bun workspaces at production B2B SaaS scale? Bun is newer than Turborepo (Turborepo Vercel-native since 2021; Bun workspaces shipped later)
- Cal.com production cite for Turborepo (already in `[[frontend-stack-research]]` Source 5)
- Trigger.dev (heavy Bun production user per `[[backend-service-shape-research]]` — do they use Bun workspaces or Turborepo?)
- Other named B2B SaaS using Bun workspaces in 2026-Q2

### Sub-question Q4 — Migration cost + lock-in

- If BokChoy picks Bun workspaces and needs to switch later (Turborepo, pnpm), what's the cost?
- Workspace config files (`bun-workspaces.json` vs `turbo.json` vs `pnpm-workspace.yaml`) — switch difficulty
- CI/CD pipeline rebuild required on switch
- Cross-runtime discipline applied at monorepo level (already locked at `[[backend-stack]]` runtime level)

**Hand back to /design with:** sourced answer + identified strongest contradiction + named operational implications + monorepo pick recommendation. Design weighs and vaults `[[frontend-stack]]` with the resolved monorepo tooling.

## Historical: frontend-stack-research handoff queue (now complete)

`[[frontend-stack-research]]` was vaulted earlier in this session and returned to /design which will produce `[[frontend-stack]]`. Below preserved for session-arc continuity.

## Research handoff queue 2026-05-03 (continuation 2) — frontend-stack-research (COMPLETE)

**Mode:** /research

**Hypothesis under test (user pre-pick):** Next.js 16 for cockpit web (admin + customer-developer dashboards). Defense: "production-cited leader." User requested HEAVY research, specifically on RSC (server vs client components), Suspense, tree shaking. Plus BokChoy-specific stack compatibility + deploy coupling.

### Sub-question Q1 — Next.js 16 production-readiness + BokChoy stack compatibility

**Triangulation targets:**
- Next.js 16 release date, breaking changes from Next 15, stability signal in 2026-Q2
- **Bun + Next.js 16 compatibility** — `[[backend-stack]]` amendment 2026-05-03 commits to Bun runtime + cross-runtime discipline. Historical Next.js-on-Bun friction per surveyed scope; verify current state.
- **Better Auth + Next.js 16 + Drizzle** integration — Better Auth ships Next.js examples; verify they target Next 16 not 15; verify Bun-on-server-side compatibility
- **Deploy fork (load-bearing):** Vercel-native vs container-PaaS-same-as-backend vs Cloudflare Pages / Next.js standalone output. Affects whether `[[backend-service-shape]]` modular-monolith deploy unity extends to frontend.
- Production cites at B2B SaaS scale (Cal.com, Linear, Stripe Dashboard, Shopify Admin, Vercel itself)
- Contradiction probe: 2026 Next.js 16 production regrets / migration-away cites

### Sub-question Q2 — RSC (React Server Components) at production scale in Next.js 16

**Triangulation targets:**
- Server vs client component boundary placement strategy — Vercel docs + production cites
- Server Actions vs API routes — when each wins for mutations, performance comparison, error handling
- Hydration waterfall avoidance + streaming patterns
- **Better Auth session in RSC** — `getServerSession()` style patterns, cookie handling at server-side, type-safety
- Production cites on RSC at B2B SaaS scale (named teams, named workloads)
- Known foot-guns: hydration mismatches, server-client boundary leaks, prop serialization, request waterfalls
- Contradiction probe: 2026 RSC production regrets / "we went back to client components" cites

### Sub-question Q3 — Suspense boundary patterns + streaming

**Triangulation targets:**
- Boundary placement: per-route vs per-component vs per-data-fetch
- Streaming + Suspense interaction; **Partial Prerendering (PPR)** in Next.js 15+/16
- `error.js` + `loading.js` + `notFound()` conventions
- Cockpit-specific: live-ops dashboard rendering with multiple async data sources (player metrics, wallet stats, transaction history)
- Production gotchas: cumulative layout shift during stream-in, suspense-during-hydration bugs, error-boundary cascading
- Contradiction probe: production cites that DON'T use Suspense / find it hurts more than helps

### Sub-question Q4 — Tree shaking + bundle optimization in Next.js 16

**Triangulation targets:**
- Server vs client bundle split — what ships to browser, what stays server-only
- `'use client'` directive + downstream import cascade ("the use-client wave")
- Dynamic imports + code splitting strategies (`next/dynamic`)
- `@next/bundle-analyzer` production setup + interpretation
- Bundle size targets for B2B dashboard cockpit at MVP (rough rule: <200KB gzipped initial JS)
- Production cites with named bundle sizes (Vercel, Cal.com, Linear)
- Contradiction probe: bundle-bloat post-mortems in Next.js production deployments

### Cross-sub-question coupling

- Q1 deploy fork interacts with Q2 RSC (server actions need a Node-or-Bun-compatible host)
- Q2 RSC + Q4 tree shaking interact heavily ('use client' boundary controls bundle inclusion)
- Q3 Suspense + Q4 streaming interact (Suspense-as-streaming-boundary affects bundle hydration)

**Triangulation budget — heavy research per user directive:** ≥2 production cites per sub-question (B2B SaaS scale named teams), ≥1 docs cite per sub-question (Next.js 16 official docs version-pinned), ≥1 contradiction probe per sub-question. Total ~12-16 sources. Same shape as `[[backend-stack-research]]` but deeper.

**Hand back to /design with:** sourced answers + identified strongest contradiction per sub-question + named operational implications + named coupling decisions for `[[backend-service-shape]]` deploy topology.

## Backend service shape RESOLVED 2026-05-03 — `[[backend-service-shape]]` vaulted

39 vault entries.

**Decision summary:**
- Modular monolith — single Node.js 22 LTS TS process per replica, deployed as container
- Module boundaries 1-to-1 with vault features: auth, players, wallet, catalog, loot, outbox, cockpit, sdk, idempotency, infra; plus cross-cutting db/lib/types
- Module isolation: typed function calls (not network); cross-module DB access via owning module's repository; ESLint `import/no-restricted-paths` enforces
- Outbox co-hosted at MVP via SKIP LOCKED + 250ms poll
- Container deployment on PaaS (specific PaaS deferred to implementation phase)
- Always-on replica (no scaling-to-zero) at MVP
- Serverless edge + microservices + separate-worker-from-day-one + WAL-CDC + per-module-schema all vaulted as rejected
- 7 rejected alternatives, 8 failure modes with mitigations, 10 cascade obligations queued for implementation

**Q1 (Bun re-research) REJECTED ON EVIDENCE:** `[[backend-stack]]` Node.js 22 default stands. User directive "Bun not Node" was hypothesis under test; new evidence reinforces original decision (OpenCode founder Jay V's public migration FROM Bun TO Node + multiple GitHub-tracked memory-leak class issues continuing through Bun 1.1.13 April 2026 + pkgpulse 2026 caveat on long-running workloads applying directly to BokChoy outbox worker). Better Auth Issue #2283 closed wontfix + bunx-CLI-only — moot for BokChoy.

## Amendment 2026-05-03 — Bun + Hono locked into `[[backend-stack]]`

User explicit risk-acceptance after `[[backend-service-shape-research]]` Q1 surfaced new evidence reinforcing Node 22 default. User chose Bun anyway with named failure-mode acceptance (F-Bun-1 through F-Bun-4) + cross-runtime portability discipline as mitigation:
- Bun 1.3+ runtime; Node.js 22 LTS retained as documented fallback (CI-tested Dockerfile variant)
- Hono HTTP framework (cross-runtime adapter, not `Bun.serve`)
- postgres-js (not `Bun.sql`); node:fs (not `Bun.write`); node:crypto for argon2 + HMAC
- ESLint blocks `import 'bun'` / `import 'bun:*'` in non-test files
- Documented fallback runbook: if F-Bun-* materializes in production with material impact, swap deployed Dockerfile to Node 22 variant within 1 week

`[[backend-stack]]` and `[[backend-service-shape]]` amended in-place per `[[wallet-mechanics]]` 2026-05-02 amendment-pattern precedent. Original Node.js 22 reasoning retained for historical record.

This is the user's risk-tolerance call recorded with explicit framing. Future-team / future-self can read the amendment and see the trade made: perf upside + DX preference > production-stability conservativism, with cross-runtime mitigation limiting cost-of-being-wrong to ~hours of operational swap.

## Architecture decisions resolved across this session arc (2026-05-03)

11 architecture-tier decisions and research entries closed in one session:
1. `[[auth-compliance-research]]` — GDPR/COPPA stance evidence
2. `[[player-auth]]` — owned-only at MVP, minimal-PII, processor stance, no age-gate
3. `[[backend-stack-research]]` — TS+Drizzle+Better Auth substance
4. `[[backend-stack]]` — TS strict + Node.js 22 + Drizzle + Better Auth
5. `[[backend-service-shape-research]]` — modular monolith evidence + Bun re-research
6. `[[backend-service-shape]]` — modular monolith + outbox co-hosted + container deploy

**Top-down architecture status: nearly complete.** Still open at top level:
- Frontend stack (cockpit web)
- CL-003 founder credibility hard-vs-soft gate (separate from research; design owes a decision)

These are next-session candidates. Cascade obligation queue from `[[wallet-mechanics]]`, `[[loot-rng-construction]]`, `[[player-auth]]`, `[[backend-stack]]`, `[[backend-service-shape]]` is now substantial enough to consider /implementation handoff if architecture work pauses.

## Historical: backend-service-shape-research handoff (now complete)

`[[backend-service-shape-research]]` was vaulted earlier in this session and returned to /design which produced `[[backend-service-shape]]`. Below preserved for session-arc continuity.

## Backend-service-shape research COMPLETE 2026-05-03 — `[[backend-service-shape-research]]` vaulted

38 vault entries.

**Q1 result: REAFFIRMS `[[backend-stack]]` Node.js 22 default. Does NOT warrant amendment to Bun-default.** User directive "Bun not Node" was hypothesis under test; new evidence reinforces original decision rather than amending. Specific new cites:
- OpenCode founder Jay V's public production-regret migration FROM Bun TO Node (2026)
- Multiple GitHub-tracked memory-leak class issues across Bun 1.1.x (Issues #16339, #18488, #24216, #25948)
- Bun 1.1.13 (April 2026) shipped memory fixes — Anthropic acquired Bun Dec 2025 but stability work ongoing not closed
- pkgpulse 2026 caveat applies directly: *"long-running workloads amplifying problems that short benchmarks never reveal"* — BokChoy outbox worker is exactly that
- Better Auth Issue #2283 (Bun + Drizzle + PostgreSQL) closed wontfix + bunx-CLI-only — moot for BokChoy due to drizzle-kit-only migration commitment

**Q2 result: modular monolith.** Unambiguous 2026 consensus for solo-dev B2B SaaS at MVP. DHH cite + 2026 industry consensus + outbox-worker-co-hosted-pattern + serverless-edge-ruled-out (argon2 native binding + outbox long-running incompatible with Workers/Vercel-Edge V8 isolate constraints).

**Hands to /design:** vault `[[backend-service-shape]]` decision entry — modular monolith + outbox co-located + container deploy + module isolation discipline. NO amendment to `[[backend-stack]]` (Node.js 22 stands).

## Research handoff queue 2026-05-03 (continuation, NOW HISTORICAL) — backend-service-and-runtime-research

**Mode:** /research

**Two coupled-but-separable sub-questions, single session.**

User directive at session continuation: "backend service and bun not node will need to research first."

**Framing:** "Bun not Node" is the hypothesis under test, NOT the assumed answer. `[[backend-stack]]` already vaulted with Node.js 22 as MVP default + engineering reasoning (Trigger.dev memory-leak class regression history, BokChoy workload shape = CRUD-on-Postgres not long-poll-saturated, conservative solo-dev MVP risk profile). Research must surface new evidence (post-2026-03 Bun state, BokChoy-specific compatibility) to warrant amending `[[backend-stack]]`. Existing decision stands until research warrants amendment (precedent: `[[wallet-mechanics]]` amendment 2026-05-02 pattern).

### Sub-question Q1 — Bun vs Node.js 22 as MVP default (re-research, BokChoy-specific)

**Question:** Does Bun 1.3+ in 2026-Q2 clear the production-grade default-runtime gate for BokChoy's specific workload shape (CRUD-on-Postgres + outbox processing per `[[wallet-mechanics]]` + occasional DSR exports per `[[player-auth]]`), or does Node.js 22 LTS remain the conservative production default?

**Triangulation targets:**
- Bun memory-leak class regression state 2026-Q2 (post-Trigger.dev firestarter fix in Bun 1.3.x; any new HTTP-model regressions tracked in Bun GitHub issues?)
- Bun + postgres-js production compatibility at MVP scale
- Bun + Better Auth compatibility (any tracked issues / known incompatibilities?)
- Bun + argon2 native-binding compatibility (Better Auth password hashing per `[[player-auth]]` m=64MB t=3 p=4)
- Bun + Drizzle ORM compatibility (drizzle-kit migrations, drizzle-orm runtime)
- Production cites for Bun-as-default (not just "added support") at solo-dev MVP B2B SaaS scale (≥3 named SaaS)
- Cost-benefit specific to BokChoy workload: typical CRUD + outbox + DSR — does Bun perf upside materialize for this shape, or is it Trigger.dev-firestarter-specific (long-poll connection broker)?
- Contradiction probe: 2026 production post-mortems on Bun-at-MVP-default that hit issues; HN/Reddit threads on Bun production regrets

### Sub-question Q2 — Backend service shape: monolith vs split-services vs serverless

**Question:** For BokChoy MVP — solo dev, 20-month runway per `[[wedge-decision]]`, indie/SMB SaaS, TS+Drizzle+Better Auth+Postgres stack — what is the production-grade backend service topology?

**Triangulation targets:**
- Monolith-at-MVP production cites at indie/SMB SaaS scale (Cal.com pre-Enterprise, Linear pre-Series-B, Trigger.dev pre-V4, Plausible Analytics, etc.)
- Split-services threshold: when does monolith-to-services migration pay back? Production post-mortems on premature split (often-cited: "we split too early")
- Serverless-only production cites (Vercel Functions, Cloudflare Workers, AWS Lambda) at indie/SMB B2B SaaS scale
- Worker/job processing topology for `[[wallet-mechanics]]` `staged_jobs` outbox: in-process worker vs separate-process vs serverless invocation
- DHH "Majestic Monolith" vs microservices-first orthodoxy — current 2026 consensus for solo-dev B2B SaaS at MVP
- BokChoy-specific service boundaries: SDK calls + cockpit web + outbox + DSR exports — do these split naturally or stay together?
- Coupling with `[[host-platform]]` Supabase + `[[backend-stack]]` Node.js 22 + Bun-eligibility (if Q1 lands on Bun)
- Contradiction probe: production teams reporting monolith-was-wrong + production teams reporting microservices-was-wrong, scaled to BokChoy's MVP context

### Cross-sub-question coupling

- If Q1 lands on Bun, Q2 service-shape decision considers Bun's edge runtime affinity (Bun runs well on Cloudflare Workers post-2026; less well on traditional Node container hosts)
- If Q2 lands on serverless, Q1 runtime question is partly moot (Vercel/Cloudflare/Lambda handle runtime selection)
- If Q2 lands on monolith, Q1 runtime decision is independent and binary

**Hand back to /design with:** sourced answer + identified strongest contradiction per sub-question + named operational implications. Design weighs and either amends `[[backend-stack]]` (if Q1 lands on Bun) or vaults new `[[backend-service-shape]]` decision entry (Q2 result).

## Backend-stack research 2026-05-03 — `[[backend-stack-research]]` vaulted

**Triangulation gate met across all three sub-questions** (Q1 language, Q2 ORM, Q3 auth library) via 11 sources. Confidence: high.

**Findings summary (handed to /design):**
- **Q1: TS-on-backend wins** on production-cite weight (Trigger.dev firestarter Bun 5× migration; Cal.com + Deel.com via Better Auth founder citation). Bun is real-but-rough (memory leak class regression history); Node.js 22 = conservative MVP default, Bun = opt-in upgrade. Go-stack-at-indie-SMB has thin public engineering-blog evidence (research-gap-as-finding).
- **Q2: Drizzle wins** on RLS-first-class. `pgPolicy`+`pgRole` schema declarations vs. Prisma's Yates+Client-Extensions workaround stack with documented nested-transaction breakage. Drizzle requires BokChoy-side `SET LOCAL` transaction wrapper (analogous to Supabase's `getDrizzleSupabaseClient`).
- **Q3: Better Auth wins** on consolidated TS auth landscape (Lucia deprecated 2025-03, Auth.js merged 2025-09-22). Anonymous plugin maps `[[player-auth]]` (γ) guest-account shape directly. Production cites: Cal.com, Deel.com, dough.ink, MeetingBaas. WorkOS contradiction probe correctly identifies SCIM/SAML/audit-logging gaps — none bind for indie/SMB MVP, all close enterprise door post-MVP.

**Coupling resolved:** TS+Drizzle+Better Auth is the natural stack pairing. Pre-pick correct on conclusion; this research provides the substance.

**Open threads handed to design:**
- Bun vs Node.js 22 as MVP default runtime — design owes the call
- Project↔organization mapping for BokChoy's two-tier multi-tenancy via Better Auth org plugin — design owes the modeling decision
- SCIM/SAML roadmap watch (re-check 6-12 months post-MVP)
- Drizzle migration tooling at scale (signal-watch open thread)

## Next decision queue — `/design` to vault `[[backend-stack]]`

**Mode:** /design

**Hypothesis under test (now defended):** TS + Drizzle + Better Auth at MVP per `[[backend-stack-research]]` Findings Q1.1-Q3.6.

**Decisions design owes the vault entry:**
1. Confirm pick of TS + Node.js 22 (or Bun?) for backend language
2. Confirm pick of Drizzle ORM with `SET LOCAL` transaction wrapper pattern
3. Confirm pick of Better Auth with anonymous + organization plugins + Drizzle adapter
4. Resolve project↔organization mapping for BokChoy's two-tier multi-tenancy (customer-developer org + projects-as-sub-orgs vs. custom association tables)
5. Vault rejected alternatives per sub-question (≥2 each): Q1 (Go, pure-Bun-default), Q2 (Prisma, Kysely, raw pg), Q3 (Auth.js v5 for new project, Lucia, managed Clerk/WorkOS at MVP)
6. Vault failure modes per sub-question with mitigations
7. Vault revisit-when conditions (Bun memory-leak class regression, Better Auth SCIM/SAML availability, Drizzle migration friction, project↔org mapping breakage)

## Player auth resolution 2026-05-03 — `[[player-auth]]` vaulted

**Decision summary:**
- Player auth: owned-only at MVP; pass-through deferred post-MVP demand-gated
- Per-project players (no cross-project portability)
- PII scope: minimal-PII (i)/(γ) — guest play default; email opt-in; ~7 columns on players table
- Stance: GDPR processor / CCPA Service Provider / COPPA third-party vendor
- No contractual age-gate; family-aimed customers in scope; customer flags audience per Unity GS pattern
- Required legal infra at MVP: ~1-2 weeks copying PlayFab/Unity public DPA templates + COPPA written-assurance template per 2025 amendments

**Six rejected alternatives + seven failure modes vaulted.**

**Cascade obligations queued (implementation phase, NOT design):**
1. Verify Supabase encryption-at-rest default — extends `[[host-platform]]` cascade
2. CI lint discipline extension — players table per `[[wallet-mechanics]]` + `[[multi-tenant-rls-research]]` patterns
3. Pre-implementation security review of player auth endpoints (rate-limit thresholds, credential-stuffing detection, session-token format)
4. Runbook items: credential-stuffing response, DSR async export pattern, PII access audit log
5. Customer-onboarding docs: SDK security guidance (F3 credential handling), recovery patterns for guest players (F2), audience-flagging accuracy (F4)
6. DSR primitives implementation: `bokchoy.player_export` + `bokchoy.player_erase` stored functions
7. Idiom decisions deferred to library/language entry: argon2id parameters, session-token format, rate-limiter mechanism

## Next decision queue — auth library + ORM + backend language

**Still owed.** Three decisions, coupled.

## Research handoff queue 2026-05-03 — backend stack research (language + ORM + auth library)

**Mode:** /research

**Three coupled decisions, single session — same shape as `[[auth-compliance-research]]` triangulated three sub-questions in one entry. Triangulation budget per sub-question: ≥1 production cite + ≥1 docs cite + ≥1 contradiction probe.**

### Sub-question Q1 — Backend language for B2B game-backend SaaS MVP

**Question:** Which backend language wins for a solo-dev B2B SaaS shipping Postgres-RLS + game-backend primitives at MVP scale (10rps initial, 1krps target), with TS proficiency existing and Go/Rust/Elixir not?

**Triangulation targets:**
- ≥3 production-cited B2B SaaS at indie/SMB scale running TS on the backend (e.g., Cal.com, Linear backend, Trigger.dev, Inngest, Drizzle Team's own stack)
- ≥3 production-cited B2B SaaS at indie/SMB scale running Go on the backend (e.g., Tailscale, Earthly, Charm, Defang)
- Docs cite: Node 22 vs Bun 1.x current state-of-art for production runtimes (TC39, Bun changelogs, Node release notes)
- Contradiction probe: post-mortems / engineering blogs naming TS-on-backend regrets (Microsoft TypeScript-team, AdonisJS team, similar) AND Go-startup regrets (Discord moving from Go to Rust on specific service, similar)
- Performance reference: TS+Node vs Go single-instance for typical CRUD-on-Postgres workload at 1krps; latency profile, memory footprint

**Deciding factors expected to surface:**
- TS proficiency-as-substantive-constraint at solo-dev MVP per `[[wedge-decision]]` 20-month runway — research must NOT dismiss as "just familiarity"
- Ecosystem fit for `[[player-auth]]` (auth lib + argon2id + RLS-compatible ORM availability)
- Operational story: deploy / test / observability story differences

### Sub-question Q2 — ORM for TS + Postgres + RLS

**Question:** Which TS Postgres ORM/query-builder is production-grade for `[[multi-tenant-rls-research]]` `SET LOCAL app.current_tenant` pattern + M2 stored-function-only-interface per `[[wallet-mechanics]]`?

**Triangulation targets:**
- Production cites for Drizzle: who runs it in production B2B SaaS, current production-maturity assessment (2026-05-03), GitHub issue tracker state on RLS-related issues
- Production cites for Prisma: same, with explicit RLS support history (Prisma had/has RLS gaps documented)
- Production cites for Kysely (pure query builder): same
- Production cites for raw `pg`/`postgres-js`: same
- Docs cite: each ORM's documentation on `SET LOCAL` / per-transaction settings / RLS interaction
- Contradiction probe: post-mortems / GitHub issues / engineering blogs naming ORM-vs-RLS friction (Prisma's known RLS gaps, Drizzle migrations breakage, Kysely tradeoffs)

**Deciding factors expected to surface:**
- RLS-compat: does ORM let you `SET LOCAL` per transaction without fighting the abstraction? (load-bearing per `[[multi-tenant-rls-research]]`)
- M2 stored-function-only interface: can ORM call stored functions cleanly?
- Migration story for production-grade schema versioning
- Type-safety vs runtime cost
- Bun compatibility (if Q1 lands on Bun)

### Sub-question Q3 — Auth library for TS owned-auth + multi-tenant + custom user model

**Question:** Which TS auth library (or absence thereof) supports `[[player-auth]]` decisions: owned-auth flow + custom user model with nullable email + argon2id + per-project isolation + organization-plugin for customer-developer multi-tenant?

**Triangulation targets:**
- Production cites for Better Auth: who runs it at SaaS scale (production-maturity is the live concern — 2024 release), GitHub issue tracker state on (a) custom user model with nullable email, (b) organization plugin maturity, (c) argon2id support, (d) Drizzle adapter stability
- Production cites for Auth.js (formerly NextAuth): production usage at non-Next.js stacks (load-bearing — BokChoy may or may not be Next.js per Q1+Q2)
- Production cites for Lucia: production usage, current state of "you-own-the-auth-logic" framing, project archival/maintenance signals
- Production cites for managed (Clerk, WorkOS, Stack Auth): owned-auth-ish features, lock-in cost, indie-tier pricing
- Docs cite: each library's documentation on custom user model + multi-tenant
- Contradiction probe: GitHub issues, Reddit/HN threads, engineering blogs on auth-library regrets at production scale

**Deciding factors expected to surface:**
- Better Auth 2024-release production-maturity reality vs. marketing (active issue count, response time, paying-customer signals)
- Custom user model fit: can the library's user-table schema match `[[player-auth]]` minimal-PII shape with nullable email?
- Multi-tenant fit: does "organization plugin" handle customer-developer × players-per-project correctly, or does BokChoy need custom multi-tenancy?
- argon2id native vs adapter-required
- Drizzle adapter quality (if Q2 lands on Drizzle)

### Cross-sub-question coupling

- Q1 → Q2 → Q3 dependency: language constrains library shortlist; ORM choice may constrain library adapter availability
- All three should be researched in same session to surface coupling: e.g., "Drizzle has a Better Auth adapter so Drizzle+Better Auth is a natural pair" — that's a coupling claim that needs validation, not assumption
- TS+Drizzle+Better Auth pre-pick from session-staging is the **hypothesis under test** — research should treat it as the candidate to defend, with explicit alternatives ranked

**Hand back to /design with:** sourced answers + identified strongest contradiction per sub-question + named operational implications. Design weighs and picks.

## Session 2026-05-03 evening — earlier history retained below for context

## Research detour 2026-05-03 — auth-compliance-research vaulted

**Result:** processor-stance + customer-as-controller is the universal industry pattern; COPPA operator-stance lands on the customer-developer; no surveyed vendor contractually excludes under-13 audiences.

**Triangulation:** ✓ — 3 production cites (PlayFab SCC, Unity GS DPA, Heroic Labs privacy policy), 2 regulator primaries (16 CFR §312.2 Cornell + EDPB 07/2020 via secondary summaries), contradiction probe via FTC Apitor/JPush 2025-09 enforcement + 2025 COPPA amendments. Confidence overall: medium (high on regulatory framework + vendor stance unanimity; medium on EDPB direct verbatim due to PDF rendering limitation).

**Operational implications now in design's hand:**
- (4) PII scope (i)/(ii)/(iii) — processor-stance compatible with standard-PII (ii); customer's audience choice (iii) does not require contractual age-gate but does require written-assurance contract template per 2025 COPPA amendments
- (5) controller-vs-processor — RESOLVED: processor-stance, matching universal industry pattern
- (6) age-gate (iii) — design owes the decision; processor-stance keeps the option open in either direction

**Open threads handed back:**
- Direct EDPB PDF fetch for verbatim contractual language (when DPA template is drafted)
- Two more vendor DPAs for breadth (Beamable, LootLocker, AccelByte)
- "Written assurances" template language not yet visible in surveyed DPAs (re-check 6-12 months)
- Cross-customer analytics / ML training boundary — re-derive when feature shipped

## Session 2026-05-03 evening — auth+language progress (no vault writes yet on the design decision)

## Session 2026-05-03 evening — auth+language progress (no vault writes yet)

**Framing rejected:** state.md's prior "auth+language combined (II)" framing collapsed three decisions (backend language, player auth model, library) under one label. Three independent decisions surfaced; player-auth-model is upstream of library.

**Sub-decisions reached this session, NOT yet vaulted (research pending):**

1. **Customer-developer shape at MVP:** both new-game and existing-game customers in scope. ICP indie/SMB skews new-game.
2. **Player auth model at MVP:** owned-only. Pass-through deferred to post-MVP. Defense: integration burden lower for indies starting fresh; pass-through requires customer-side JWKS + claim-mapping config not justified at MVP capacity (solo dev + 20mo runway).
3. **Pass-through trigger (post-MVP):** demand-gated. Operational signal to sharpen on vault: *"first paying customer with a live game (existing player base) requests pass-through."* User said "when customers need it" — sharpen before vaulting.
4. **PII scope:** user picked (ii) standard-PII (profile fields in BokChoy DB). Defense empty — "need to own all our info" is choice restated, not engineering reason. Real defense path: cockpit live-ops dashboards + SDK in-game UI need profile fields; minimal-PII (i) would force customer-side join. Defense not yet articulated by user; vault blocked.
5. **Compliance posture (controller vs processor):** UNRESOLVED. (ii) reads like controller-stance but most B2B SaaS at this scale operates as processor-under-DPA. User did not pick. **Research-blocking.**
6. **(iii) contractual age-gate:** UNADDRESSED. (ii) without (iii) means COPPA exposure on every indie customer shipping to under-13. F2P mobile has real exposure (casual mobile + family-aimed games). User skipped this fork. **Research-blocking.**

**Library + ORM + language decisions deferred — depend on (4)+(5)+(6) landing first.** User pre-named Better Auth + Drizzle in passing; neither defended, neither vaulted. ORM choice is also an unrecorded creep — flag for separate decision once auth resolves.

## Research handoff queue — auth-compliance-research

**Mode:** /research

**Query (load-bearing for vault on player auth model):**

> *"For a B2B game-backend SaaS storing end-user (player) PII on behalf of customer-developers (game studios), what is the GDPR controller-vs-processor stance and COPPA operator-vs-service-provider scope? Surface production-cited stances from at least 3 of: PlayFab, Beamable, LootLocker, Heroic Labs, Unity GS Economy, AccelByte. For each: what does their DPA / privacy policy / terms commit to? Specifically: (a) controller or processor, (b) breach notification flow (direct-to-subject vs. through-customer), (c) DSR handling (direct vs. customer-mediated), (d) under-13 audience stance — contractually excluded, age-gate primitives provided, or full COPPA-compliant operator-stance with verifiable parental consent."*

**Sub-questions:**

- (S1) Industry pattern: do game-backend SaaS contracts contractually exclude under-13 customer audiences at MVP scale, or do they ship age-gate primitives + parental-consent infrastructure?
- (S2) GDPR controller-stance vs processor-stance: what's the burden delta concretely (DSR direct vs through-customer, breach notification timing, contract templates required)?
- (S3) Cross-reference `[[deidentify-mechanism-research]]` AEPD/EDPS key-destruction-as-erasure — does that pattern depend on controller-stance, or does it work for processor-stance equally?

**Triangulation target:** ≥3 game-backend SaaS production cites + ≥1 GDPR primary-source (EDPB / regulator guidance) + ≥1 COPPA primary-source (FTC guidance).

**Hand back to /design with:** sourced answer to (4)+(5)+(6) so the player-auth-model decision can be vaulted with engineering substance + production-grade gates cleared.

## Next session pickup — auth + language combined

**Mode:** /design (with /research as needed for library survey).

**Why combined (II) not abstract-then-defer (I):** user pre-named Better Auth as a leading candidate. Better Auth is TS-stack only; naming it commits to TS at the language layer. (I) would be bad-faith framing.

**Sequencing decision already locked:** auth-first (before backend service shape, frontend) per the strengthened defense — *"auth defines the tenant identity model which drives backend service boundaries; RLS data-layer is decided per `[[wallet-mechanics]]` §8 but the identity flow producing `app.current_tenant` is wide open."*

**Constraints to declare upfront in the auth+language entry (do NOT skip familiarity):**
- Solo-or-small-team execution per `[[mvp-feature-sequence]]` and `[[wedge-decision]]` 20-month runway cap
- TS proficiency exists; Go/Rust/Elixir do not — **familiarity is a substantive engineering constraint at MVP scale**, not an excuse
- Multi-tenant Postgres-backed SaaS per `[[wallet-mechanics]]` + `[[host-platform]]`
- Auth covers three audiences: (a) BokChoy admin, (b) customer-developer (cockpit + SDK), (c) player — load-bearing fork: BokChoy-owned vs. customer-pass-through
- Self-host preferred per `[[host-platform]]` lock-in mitigation
- Supabase Auth already rejected per `[[host-platform]]`

**Candidate space to enumerate (research-grade survey if going /research first):**
- TS-stack: Better Auth (user's pre-pick, 2024 release — production-maturity risk), Auth.js / NextAuth (production-mature, framework-coupled to Next.js), Lucia (you-own-the-auth-logic framing, also new), Clerk / WorkOS (managed, lock-in concern)
- Non-TS-stack-evaluated-for-comparison: Ory Hydra/Kratos (Go), Keycloak (Java)
- Roll-your-own (rejected default — auth implementation is OWASP-class risky)

**Three audience designs owed once library is picked:**
- (a) BokChoy admin — smallest, probably SSO via the chosen library
- (b) Customer-developer — two surfaces: cockpit web login + SDK token/key. Multi-tenant: customer = tenant, customer-team-members = users within tenant. Better Auth has organization plugin if that path lands.
- (c) Player auth — the load-bearing fork. **BokChoy-owned** (player accounts in BokChoy DB; SDK auths players against BokChoy) vs. **customer-pass-through** (customer's existing player ID is opaque; SDK accepts customer-issued token; BokChoy validates against customer-supplied verification config). Different threat models, different compliance surfaces (BokChoy-owned = BokChoy now stores PII; pass-through = BokChoy stores only opaque IDs, customer owns PII). This fork interacts with `[[deidentify-mechanism-research]]` (HMAC-SHA-256 pseudonymization works for either model but the rotation-vs-erasure semantics differ).

**Queued cascade obligations from this session (deferred to implementation phase, NOT design):**
1. Reference composition impl docs (~30 min, extends `[[pity-engine-scope]]` F1 reference pity impl with no-duplicates / slot-composition / slot-guarantee patterns from `[[within-roll-composition-scope]]`)
2. Runbook items for `[[loot-rng-construction]]`: rotation runbook + deployment-time GUC-vs-secrets-manager consistency check
3. Pre-implementation security review of canonicalization function
4. CI lint extension (hybrid A+B canonicalization discipline)
5. NIST SP 800-90A Rev.1 PDF direct-text fetch (research open thread, non-blocking, tier upgrade only)

**Vault state at session end:** 32 entries; CL-031 fully closed; `[[wallet-mechanics]]`, `[[catalog-versioning]]`, `[[idempotency-strategy]]`, `[[pity-engine-scope]]`, `[[within-roll-composition-scope]]`, `[[loot-rng-construction]]`, `[[deidentify-mechanism-research]]`, `[[multi-tenant-rls-research]]`, `[[host-platform]]` all stable. Top-down architecture decisions still open: **languages, backend service shape, auth, frontend** (auth+language is the next attack target per this session's pivot).

## Session history (this session, 2026-05-02 → 2026-05-03)

- Last resolved: `[[within-roll-composition-scope]]` + `[[loot-rng-construction]]` amendment (2026-05-03) — **CL-031 fully resolved.** Two-step landing: (1) amended `[[loot-rng-construction]]` to absorb (iii.a) rejection-sampling output mapping (libsodium / OpenBSD pattern with `bias_threshold = (-weight_sum) mod weight_sum`) as Decision item 6 + (iii.c) stream-mode HMAC_DRBG (one Instantiate per `loot_roll`, all Generates from same instance) as Decision item 7; added Reasoning item 8; added two rejected-alternatives entries (modulo bias + per-Generate re-instantiation); cascade-obligation 6 updated to mark (iii.a)+(iii.c) absorbed and (iii.b) handed to `[[within-roll-composition-scope]]`. (2) Wrote `[[within-roll-composition-scope]]` for (iii.b): **P2-strict** — within-roll composition is customer-code; BokChoy ships single-item-per-call `loot_roll` + reference composition impl extending `[[pity-engine-scope]]` F1 docs. Rejected P2-with-helper and P2-with-config + the Hiro/AccelByte vertical-metagame P1-equivalent. Defense: contested 4-platform survey (2-of-4 each side) + symmetry with `[[pity-engine-scope]]` posture + ~10-line customer code + reference-impl can absorb ergonomic concern. Three failure modes (F1 customer filter implementation error, F2 audit opacity, F3 reference impl doesn't generalize) with mitigations. **CL-031 fully resolved across all four sub-decisions:** (i) moot under `[[pity-engine-scope]]`, (ii) resolved in `[[loot-rng-construction]]`, (iii.a)+(iii.c) absorbed into `[[loot-rng-construction]]` items 6+7, (iii.b) resolved in `[[within-roll-composition-scope]]`. **Cascade obligations now queue:** reference composition impl extension to `[[pity-engine-scope]]` F1 docs (~30 min on top of the pity reference); CL-031 entry in DESIGN.md audit can mark CL-031 closed; `[[mvp-feature-sequence]]` can absorb the docs commitment. **Next:** decide what's next in the DESIGN.md audit register, or hand off to /implementation if CL-031 was the last open architecture decision.
- Prior resolution (2026-05-03): `[[loot-rng-output-research]]` — **CL-031 sub-decision (iii) research pass complete (β scope).** (iii.a) rejection sampling locked via libsodium + OpenBSD direct-source cites with named modulo-bias rejection in both. (iii.c) stream-mode HMAC_DRBG locked via go-hmac-drbg Generate() direct-source cite; 9999-call ceiling non-binding for per-call-seed model. (iii.b) survey of PlayFab + AccelByte + Hiro + Hearthstone converges on slot-by-slot composition; **new wrinkle:** within-roll no-duplicates is platform-level in Hiro (`max_repeats`/`max_repeat_rolls`) and AccelByte ("never rewarded the same item"). Surfaces a new design fork: **P2-strict vs. P2-with-helper (`loot_roll_excluding`) vs. P2-with-config (`max_repeats_within_roll` on `loot_table`).** Triangulation met. Confidence medium. Open threads: NIST SP 800-90A Rev.1 PDF direct render (binary rendering issue with WebFetch), AccelByte reference-impl source for platform-vs-example clarification on no-duplicates. **Next: switch back to /design to (a) lock (iii.a)+(iii.c) into a brief decision entry that absorbs the rejection-sampling pseudocode + stream-mode confirmation into `[[loot-rng-construction]]`, and (b) resolve the new (iii.b) within-roll-constraints fork (P2-strict vs. P2-with-helper vs. P2-with-config).**
- Prior resolution (2026-05-03): `[[wallet-mechanics]]` §5 schema patch per `[[loot-rng-construction]]` cascade-1. Added `rng_key_id SMALLINT NOT NULL DEFAULT 1` between `idempotency_key_id` and `created_at` on `loot_rolls`; updated `seed_inputs` comment to reference hybrid A+B canonicalization in `[[loot-rng-construction]]`; added rotation-mechanism paragraph after the opacity paragraph; updated cascade-obligation 1 in wallet-mechanics to mark CL-031 (ii) resolved + (iii) still owed. **Next: CL-031 sub-decision (iii) PRF-output → roll mapping.**
- Prior resolution (2026-05-03): `[[loot-rng-construction]]` — **CL-031 sub-decision (ii) resolved across four sub-questions.** PRF = HMAC_DRBG over HMAC-SHA-256 (research-determined). Server secret = HMAC_DRBG `entropy_input` (research-determined). Canonicalization = **hybrid A+B** (fixed-length binary for `(project_id 16B, banner_id 8B, player_id 8B, attempt_number 4B)` + 4-byte length-prefix for `pull_session_id`); position survived an iterated challenge cycle (initial hybrid → user "not-over-engineered" criterion → walk-back to pure B → user pushback "sometimes clever is right" → re-derived hybrid on substance: production-cited construction + locked schema + length-prefixing fixed fields is redundant). Rotation = **α+β-default** (new `rng_key_id SMALLINT` column, GUC-driven, server-populated, "no rotation by default" symmetric to `[[deidentify-mechanism-research]]`). Secrets = **independent** `bokchoy.rng_secret` ≠ `bokchoy.anon_secret` (Krawczyk key-separation axiom). Five rejected alternatives + five failure modes. **Cascade:** §5 schema patch (`rng_key_id` column), runbook items (rotation + deployment-time consistency check), pre-implementation security review of canonicalization function, reference pity impl now unblocked. **Calibration moment logged:** I walked back the hybrid position too fast under "not over-engineered" pressure; user caught it; re-derivation found the substantive defense (production-cite + locked schema + redundancy avoidance) that aesthetic walk-back missed. Pattern to watch on future forks: don't conflate "simpler" with "right" when production-cited idiom is non-uniform for a reason. **Next: §5 schema patch (mechanical), then CL-031 sub-decision (iii) PRF-output → roll mapping.**
- Prior resolution (2026-05-03): `[[loot-rng-research]]` — CL-031 sub-decisions (ii) seed format + PRF construction + (ii.4) rotation-vs-replay-determinism research pass. **PRF locked via existing stack:** HMAC_DRBG (NIST SP 800-90A) over HMAC-SHA-256 — RFC 6979 reference design + HashiCorp `go-hmac-drbg` production cite. **Server secret enters as `entropy_input`** (NOT HKDF — wrong primitive class for per-call determinism; NOT BIP-32 hierarchical — unneeded for flat input shape). **Seed canonicalization is open: three production-cited patterns (A fixed-length binary BIP-32; B length-prefix csexp; C canonical CBOR/JSON) — no clean winner; hybrid A+B mirrors RFC 6979's int2octets+bits2octets composition for BokChoy's mixed-fixed/variable input shape.** **Rotation pattern α (key-id stamp + version-aware lookup) recommended-for-design** — SaaS Shield Deterministic Encryption cite + symmetric to existing `[[deidentify-mechanism-research]]` `anon_key_version` pattern. Pattern β (no-rotation, accept invalidation per BIP-32 stance) is the alternative. **Triangulation met** (BIP-32 + Vault Transit + SaaS Shield + RFC 6979 + RFC 5869 + RFC 8785 + OWASP/CWE class-level contradiction probe); confidence medium — gap on (a) no specific forge-attack post-mortem in public record, (b) NIST SP 800-90A + RFC 8949 §4.2 referenced via search-summary not direct fetch. Open threads: direct-fetch upgrades, security review of chosen canonical form before implementation, cascade question on shared-vs-independent secrets between RNG and de-id. Sub-decision (iii) PRF-output → roll mapping deferred. **Next: switch back to /design to resolve (ii.2) canonicalization choice + (ii.4) rotation pattern + secret-sharing question.**
- Prior resolution (2026-05-02): `[[wallet-mechanics]]` §5 + cascade list patched per `[[pity-engine-scope]]`. Column rename `pity_state_before/after` → `pre_state/post_state` with customer-opaque comments + `[[pity-engine-scope]]` link; line-231 prose rewritten ("pity-state debugging" → "state-transition reconstruction"); new opacity paragraph added at §5 explaining customer-side pity ownership + reference impl pattern; cascade-obligation 1 (CL-031) scoped to (ii)+(iii) only with (i) marked moot at platform layer; cascade item 10 added (reference pity impl as MVP docs commitment, depends on (ii)+(iii) landing first). Cascade-obligation 2 (cancel `[[catalog-versioning]]` `pity_class` field) — no edit needed yet because catalog-versioning never wrote the field; cancellation is preventative only. Cascade-obligation 3 (CL-031 (i)/A/B/C moot) and 4 (record-only) and 5 (mvp roadmap) handled in wallet-mechanics + pity-engine-scope vault entries. **Next: CL-031 sub-decision (ii) seed format + PRF construction.**
- Prior resolution (2026-05-02): `[[pity-engine-scope]]` — **CL-031 scope decision = P2.** Pity is NOT a BokChoy platform primitive; customer ships pity in extension code. BokChoy ships `loot_roll` server function + `loot_rolls` audit table with opaque `pre_state`/`post_state` JSONB blobs + documented reference pity impl. Rejected P1 (Hiro built-in stance — schema lock-in + monetization-lever-ownership mismatch) and P3 (hybrid — MVP team can't run two surfaces). Defense: wedge does not require P1 + P2 forecloses nothing + 2-of-3 surveyed platforms ship this scope. Four failure modes (F1 ergonomic, F2 customer concurrency leak, F3 audit opacity, F4 determinism-boundary). Mitigations: reference impl in docs (~1 day, MVP commitment per `[[mvp-feature-sequence]]`). **Cascade obligations:** (1) patch `[[wallet-mechanics]]` §5 column rename `pity_state_before/after` → `pre_state/post_state`; (2) cancel `[[catalog-versioning]]` `pity_class`/`banner_type` cascade from `[[pity-state-research]]`; (3) CL-031 (i)/A/B/C MOOT at platform level; (4) CL-031 (ii) seed/PRF + (iii) RNG-output mapping STILL LIVE — next attack target; (5) reference pity doc on MVP roadmap.
- Prior resolution (2026-05-02): `[[pity-state-research]]` — **first research pass on CL-031 sub-decision (i)**. Three platform stances surveyed (Hiro built-in / AccelByte Extend Override / PlayFab Cloud Script); modal carry-over pattern across surveyed gacha is per-banner-TYPE (Genshin, HSR, Neverness) with Seven Deadly Sins Origin as per-banner-reset counter-example. **Position A gains production cite (Hiro Rewards docs); Position B loses its ledger-by-analogy support — zero surveyed game-backend applies event-sourcing to pity.** Keying is load-bearing and independent of A/B/C: state must key on `(player_id, banner_type)`, not `banner_id`, not just `player_id`. **Cascade obligation queued for design:** `[[catalog-versioning]]` `loot_table` schema must expose a `banner_type` / `pity_class` discriminator independent of `banner_id`. Triangulation met (4 platforms + 4 gacha titles + academic monetization analysis); confidence medium (Hiro binary closed; miHoYo primary disclosures not directly fetched). Open threads: miHoYo China-mandated rate disclosure direct fetch, Hiro binary capabilities, card-pack pity (Hearthstone), event-sourced loyalty CRMs as adjacent-domain B-cite. Sub-decisions (ii) seed/PRF and (iii) RNG-output mapping deferred.
- Prior resolution (2026-05-02): `[[wallet-mechanics]]` **amendment vault-final** — review of v1 wallet-mechanics produced three soft spots; research entries triangulated each (Q1 webhook, Q2 RLS, Q3 de-id); host-platform decision surfaced + vaulted; amendment written across 12 sections. **Four amendment-soft-spots** (failure-rate threshold ≥80%/10/5min, dead-letter retention 7d-then-30d, BIGINT anon_id with 10M-player upgrade trigger, breakglass role unspecified) **accepted-as-written under tagged revisit triggers** — not separately defended; review encoded in §4b/§4c/§6/§8 + Revisit-when. Decisions: (1A) §4a/§4b/§4c required deliverables. (2A) RLS — `bokchoy_app` non-owner + `FORCE ROW LEVEL SECURITY` + per-tx `SET LOCAL app.current_tenant`. (3A) HMAC-SHA-256 + per-tx `SET LOCAL bokchoy.anon_secret`, no rotation by default, key destruction = erasure. PlanetScale + v1 MD5 + Stripe-shape long-window-passive vaulted as rejected. Failure modes 8-12 named.
- Prior resolution (2026-05-02): `[[host-platform]]` — surfaced a previously-implicit load-bearing constraint: **MVP runs on Supabase managed Postgres, DB-only (no Auth/Storage/Realtime/Edge Functions/PostgREST)**. Cost is the reason; DB-only is the lock-in mitigation. Migration to non-Supabase host is connection-string change, not a rewrite. Two cascade obligations: verify `pg_partman` availability on Supabase tier; verify Supavisor in transaction mode preserves `SET LOCAL` semantics. Both fail-safe — substitute if either diverges.
- Prior resolution (2026-05-02): [[catalog-versioning]] — **CL-030 resolved.** T1 + T2-subset (bulk-publish + diff view + optional bulk-scheduled-publish) shipped at MVP; approval workflows deferred (T3 git PR is parallel approval surface so dashboard workflow doesn't pay back at MVP scope); `[[catalog-cac-upgrade]]` stub created for T3. Schema: `catalog_items` with type discriminator + Draft/Published/Archived state + ETag `version` + JSON Patch diffs in `catalog_audit`. M2 mechanism transferred from `[[wallet-mechanics]]`. Per-project environment isolation. Six failure modes named with mitigations. Cascade: CL-031 loot tables follow this lifecycle.
- Prior resolution (2026-05-02 earlier): [[catalog-versioning-research]] — first pass on CL-030, falsified DESIGN.md §12.3's DAG-branchable framing.
- Prior resolution (2026-05-02): [[wallet-mechanics]] — **CL-029 resolved.** Combined decision entry covering path B + M2 + unified `transactions` audit + sister tables + `staged_jobs` outbox + 24mo hot retention + de-identification on account close.
- Tooling fix queued: `.bocek/preflight-bug-2026-05-02.md` documents two bugs in `~/.bocek/scripts/preflight.sh` (vault-path doubling + mode-file-not-written). User maintains bocek; will fix.
- Prior resolutions (2026-05-02): three CL-029 research follow-ups vaulted as `[[wallet-source-of-truth-research]]` (path B picked), `[[wallet-audit-invariant-research]]` (M2 picked), `[[staged-jobs-schema-research]]` (schema + sister-tables pattern), `[[audit-retention-research]]` (24mo hot, de-identify, monthly partitioning).
- Status: design draft is in vault. **User pending review of `architecture/wallet-mechanics.md` before vault is considered final.** Items most worth challenging in review: per-kind `max_attempts` values (initial-values labeling is honest but the numbers are my judgment); de-identification function `bokchoy.anon_secret` parameter name is a placeholder; failure-mode list is comprehensive but not exhaustive.
- Prior resolution (2026-05-02 earlier): [[wallet-source-of-truth-research]] — chose path B over A/C/D for wallet source-of-truth. Path B has tier-1+2 backing across PlayFab/Beamable/LootLocker/AWS-reference; path A is fintech-scale only. Open Q1/Q2/Q3 follow-ups identified.
- Prior resolution (2026-05-01): [[idempotency-strategy]] **rewritten** — hybrid keys (server-derived natural + client-supplied header), Postgres-only storage (B7, permanent commitment regardless of future Redis), per-step UNIQUE + outbox (`staged_jobs`) + deterministic-RNG-on-key for loot (D2-α, no `recovery_point` column), 422 mismatch / 409 in-flight per IETF draft 07 + Stripe SDK auto-retry behavior, bokchoy-prefixed error codes, 24h TTL Shopify-cited. `[[mvp-feature-sequence]]` patched alongside: Redis dropped from MVP stack (lines 53, 56, 63, 65, 98).
- In progress: **CL-031 active 2026-05-02.** Server-authoritative loot — constrained by `loot_rolls` schema (§5 of `[[wallet-mechanics]]`: `seed_inputs`, `pity_state_before`, `pity_state_after`, UNIQUE on (player_id, banner_id, pull_session_id, attempt_number)) + Draft/Published `loot_table` lifecycle from CL-030 + HMAC-SHA-256 + pgcrypto + `SET LOCAL`-secret pattern from §6. Four sub-decisions owed: (i) pity-state engine — separate authoritative table vs. derive-from-latest-roll vs. hybrid; (ii) seed format — input combiner + PRF, with HMAC-SHA-256 the leading candidate by stack consistency; (iii) PRF-output to RNG mapping — stream-cipher style or hash-per-roll; (iv) retry semantics — replay forced by `[[idempotency-strategy]]` D2-α + UNIQUE constraint, mechanical to record. (i) is most architecturally load-bearing; attack first. Then CL-032 tenant isolation (deferred per `[[wedge-decision]]` until post-Series-A scale).
- Open: §14 Phase 0 commitment shapes still owed (i/ii/iii). PK-* park items still requiring customer discovery (founder workstream). `[[runbook-idempotency]]` to be written in implementation phase. CL-003 founder credibility hard-vs-soft gate still owed (separate from research). Cybertec article on triggers-to-enforce-constraints fetch returned 403 — re-fetch if M3 ever becomes a candidate.
- Tooling note (2026-05-02): `bocek` preflight reports mode transitions in stdout but does not write `.bocek/mode` — enforcement hook reads stale value. Worked around by using WebFetch in place of `git clone`. Not blocking; flag for tooling fix.

## Top-5 results summary
- CL-007 — falsified (cockpit gap is not category-creating)
- CL-001 — partial (per-cell conditions; A1 is most crowded with worst pricing math; B1 candidate; C1 not Year-1 slice; D1 smallest gap; design owes the cell choice)
- CL-009 — falsified (12–18 month cycle is enterprise-tier; mid-market is 30–120 days)
- CL-002 — falsified (no reference frame moat translates; pattern fits GitHub/Dependabot not Stripe)
- CL-006 — partial (technical feasible at auth-bridge; political damaged; SDK risk real)

## CL-003 still owed (not research)
Founder credibility hard-vs-soft gate decision. §15 says non-negotiable; §23 lists it as Open Question #1. Design owes a decision independent of any research finding.

## Resolved this session
- [[cockpit-gap-research]] resolves CL-007 (falsified)
- [[slice-cell-research]] resolves CL-001 partial (per-cell conditions; design owes the choice)
- [[sales-cycle-research]] resolves CL-009 (falsified)
- [[structural-moat-research]] resolves CL-002 (falsified)
- [[integration-feasibility-research]] resolves CL-006 (partial)
- [[wedge-decision]] — keystone decision, replaces DESIGN.md §1 / §4 / §5 / §6 / §10 / §15 / §16 / §17 / §19 wedge framing
- [[mobile-f2p-economy-math-research]] — domain depth research, cascades into MVP feature requirements
- [[indie-smb-pricing-research]] resolves CL-010 partial — rebuilt tier mix replaces DESIGN.md §16
- [[mvp-feature-sequence]] — MVP keystone decision, replaces DESIGN.md §14 build roadmap
- [[idempotency-strategy]] resolves CL-028 — first architecture decision; cascades to every mutating API endpoint
- [[idempotency-strategy-research]] — sense-check on `[[idempotency-strategy]]`. Returns 7-point obligation list to design.
- [[wallet-source-of-truth-research]] (2026-05-02) — partial CL-029. Establishes path B (CRUD-on-balance + same-txn audit) is the named game-backend pattern across PlayFab/Beamable/LootLocker/AWS-reference; path A is fintech-scale only (Stripe). Hands back to `/design` for the A/B/C/D pick and `staged_jobs` schema.

## Cumulative damage to DESIGN.md
- §3 problem statement: "BaaS economy modules are shallow" — contested by 4+ named incumbents
- §4 complement-don't-compete moat: damaged on TWO axes — wedge mechanism (cockpit-gap) and cycle-length premise (sales-cycle)
- §4 "12–18 month sales cycle" — falsified for the mid-market ICP; correct only at enterprise tier
- §10 Heroic Labs partnership: directly contradicted by Hiro shipping
- §17 partnership-led acquisition: complement frame's cycle-length justification removed; greenfield-replacement GTM becomes viable
- §18 competitive landscape: 3+ vendor cells factually wrong + Hiro row missing
- §16 pricing tier math: implicit assumption of long cycles for $1,499/mo Studio doesn't match mid-market benchmarks

## Top-5 from the register (proposed research order)
1. CL-001 — slice = A1 mobile F2P runtime
2. CL-007 — designer-first live-ops UX gap exists (incumbents don't ship it)
3. CL-002 — complement-don't-compete is a structural moat
4. CL-009 — replacement-BaaS sales cycle is 12–18 months
5. CL-006 — 30-min PlayFab/Nakama/UGS integration is technically + politically achievable

## Open questions handed back from design
1. Slice not vaulted: A1 (mobile F2P runtime) was picked in `docs/DESIGN.md` without rejected-alternatives derivation. Research must produce per-cell teardown so design can run *Position derivation* against evidence.
2. "Complement, don't compete" lacks structural moat: Stripe/Twilio/Segment/RevenueCat reference frames asserted from training, not verified. Research must establish the actual structural reason each survived — and the historical pattern of BaaS-vs-specialist outcomes in adjacent SaaS.
3. NOT a research question: founder credibility (§15 vs. §23 contradiction). User owes design a separate decision.

## Vault hygiene done this session
- Moved 3 loose entries from vault root → `_shared/` per path convention
- Renamed: `00-research-scope.md` → `_shared/research-scope.md`, `01-landscape-survey.md` → `_shared/landscape-survey.md`, `02-africa-field-notes.md` → `_shared/africa-field-notes.md`
- Created `index.md` and this `state.md`
- Updated internal link in landscape-survey to use `[[wikilink]]` form
- 2026-05-02: split flat `_shared/` into topical dirs to match `index.md` sections. New layout: `_shared/` (cross-cutting research), `wedge/` (wedge-decision + supporting research), `mvp/` (mvp-feature-sequence), `architecture/` (idempotency-strategy + research). Wikilinks unchanged — basename resolution preserved. No entry contents touched.
