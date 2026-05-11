---
type: discovery
features: [architecture]
related: ["[[admin-auth-surface]]"]
created: 2026-05-11
---

# Implementation gaps flagged during slice 8.2.0 (admin-auth-surface primitive)

## Gap 1 — Integration test path vs project convention (2026-05-11)

**Missing decision:** the contract names `apps/backend/src/admin/admin-gate.test.ts` for "3 positive + 4 negative" integration tests per `[[admin-auth-surface]]` *Mitigations* row 4. The project's actual HTTP-middleware end-to-end test convention is shell smoke scripts at `/tmp/smoke-8-*.sh` exercising the running backend (per slice 8.1a/b/c/.6 implementation history; `bun:test` is used for pure-logic units only — single example at `packages/wallet/src/sqlstate-to-error.test.ts`).

**Why it's needed:** the 5-step `adminGate` gate is nearly 100% external-state-dependent — Better Auth session validation + 3-4 DB reads + Better Auth `hasPermission` cache. Writing a `bun:test` against this surface requires either (a) mocking Better Auth (regression vs `idioms/typescript.md` *Tests as real as possible*), or (b) seeded test-DB lifecycle infrastructure that BokChoy's backend doesn't have yet.

**Unvetted options (training-data; clearly labeled):**
- (a) Defer integration testing to slice 8.2.1 first-consumer smoke script `/tmp/smoke-8-2-admin-gate.sh` — matches the project's actual convention; coverage arrives one slice later than the contract path implied.
- (b) Write a synthetic `apps/backend/src/admin/admin-gate.test.ts` using `bun:test` + Hono test client + a seeded test DB connected to a per-test schema namespace — introduces test-DB lifecycle infrastructure (new for backend); doable but ~150-200 LOC of test fixture for one middleware.
- (c) Mock Better Auth via dependency-injection refactor of `apps/backend/src/infra/auth.ts` (swap `auth.api.getSession` + `auth.api.hasPermission` at test boundary) — violates `idioms/typescript.md` *Tests as real as possible* + invalidates production code path coverage.

**Recommendation:** resolve in `/design` with one of:
- Accept (a): amend `[[admin-auth-surface]]` *Mitigations* row 4 to read "integration smoke at `/tmp/smoke-8-2.0-admin-gate.sh` shipped alongside slice 8.2.1 first consumer." Slice 8.2.0 implementation passes typecheck + lint + manual code review without an in-tree test file. CI lint `scripts/check-auth-roles.ts` provides a deploy-time defense in lieu of pre-merge integration coverage.
- Pick (b) if integration coverage MUST land in this slice — but that's a substantial scope addition (test DB lifecycle, fixture seeding, schema-namespace-per-test infrastructure).
- Reject (c) outright per idiom.

**Block status:** slice 8.2.0 implementation can ship with (a) accepted as the resolution; deferring slice 8.2.1 smoke is a continuation of the BokChoy slice-8.1 cluster pattern (middleware slices ship without their own integration smoke; the first consumer slice carries the end-to-end test).

## Gap 2 — BC4xx wire-code namespace not vaulted in `[[wallet-mechanics]]` A18 (2026-05-11)

**Missing decision:** `[[admin-auth-surface]]` introduces BC400/BC401/BC403 error codes for the admin gate; the formal namespace allocation lives in `[[wallet-mechanics]]` Part 3 A18 (existing convention covers BC001-BC099 for wallet/inventory/idempotency primitives + BC050 ReasonCodeNotRegistered + BC060 CurrencyNotFound). The `[[admin-auth-surface]]` *Open threads* row 3 names this as a queued amendment.

**Why it's needed:** the codes are already in production code at `apps/backend/src/admin/admin-gate.ts` (BC400/BC401/BC403 emitted via `c.json(err('BCxxx', '...'), status)`). Without the vault amendment, the BCxxx → HTTP-status map at `apps/backend/src/infra/error-middleware.ts:27` doesn't cover BC400/BC401/BC403 — which is currently fine because `adminGate` returns directly (matches `apiKeyMiddleware` / `idempotencyMiddleware` pattern), but future code reading the BC table for documentation will miss the codes.

**Unvetted options:** none — this is a mechanical amendment, not a design fork.

**Recommendation:** queue for next `/design` or `/refactoring` pass per state.md cascade obligation #5 — extend `[[wallet-mechanics]]` Part 3 A18 with BC400-BC499 namespace reserved for auth/authorization, list BC400 (`organization_context_missing` or `param_invalid`), BC401 (`unauthenticated`), BC403 (variants: `cross_org_forbidden`, `not_a_member`, `insufficient_permissions`). Update `apps/backend/src/infra/error-middleware.ts` BC_TO_HTTP map for documentation completeness (the map isn't load-bearing for adminGate flow; it's a convention completeness fix).

**Block status:** NOT blocking slice 8.2.0 implementation. Mechanical amendment.

## Gap 3 — Path discrepancy still uncorrected in three vault entries (2026-05-11)

**Cascade obligation #1 from state.md:** `[[tenancy-ids-research]]:256`, `[[wallet-mechanics]]` A12 cascade, and prior state.md entries reference `apps/auth-config/` for the auth-config package. Reality is `packages/auth-config/` (verified during slice 8.2.0 implementation; the package + factory already existed).

**Why it's needed:** future readers of those vault entries will look for the auth-config in the wrong workspace location.

**Recommendation:** queue for next `/refactoring` pass (mechanical search-and-replace in the three named vault entries).

**Block status:** NOT blocking slice 8.2.0 implementation.
