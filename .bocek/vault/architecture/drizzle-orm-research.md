---
type: research
features: [backend, drizzle, rls]
related: ["[[backend-stack]]", "[[wallet-mechanics]]", "[[multi-tenant-rls-research]]", "[[local-docker-research]]"]
created: 2026-05-03
confidence: high
provisional: false
---

# Drizzle ORM behavior characterization for BokChoy MVP — RLS round-trip, nested transactions, prepared-statement disablement, relational query SQL shape

## Question

Four sub-questions blocking BokChoy implementation per `[[backend-stack]]` commitment to Drizzle + postgres-js + Better Auth + `withTenant(projectId, fn)`:

- **(1)** Does `pgPolicy` / `pgRole` declarative RLS round-trip correctly through `drizzle-kit migrate` against a real Postgres? Specifically: does the generated SQL match what `[[wallet-mechanics]]` §8 commits to (`ENABLE ROW LEVEL SECURITY`, per-table policies with `USING` / `WITH CHECK`, and **`FORCE ROW LEVEL SECURITY`** for owner-bypass defense)?
- **(3)** Does the `postgres-js` `prepare: false` config flag flow correctly when wrapped by Drizzle? Required by `[[local-docker-research]]` cascade obligation for Supavisor transaction-mode (port 6543).
- **(4)** Do nested `db.transaction()` calls correctly use Postgres `SAVEPOINT` semantics? Required for `withTenant(projectId, fn)` running inside test transaction-rollback wrapper AND for stored-function-only-interface invocations from inside an outer transaction (per `[[wallet-mechanics]]` M2).
- **(5-reframed)** When does Drizzle's relational query API (`db.query.*` with `with: {}`) issue a single SQL query vs. N+1 sub-queries, and what are the documented patterns + workarounds? Originally framed as "N+1 risk"; reframed because the human can't pick the load-bearing BokChoy access pattern, and the question is reducible to a Drizzle behavior characterization.

## Triangulation

- **Production reference:** ✓ — `drizzle-team/drizzle-orm` repo (Sources 1, 2, 3, 6, 7), `drizzle-kit/tests/rls/pg-policy.test.ts` (Source 3), `porsager/postgres` README (Source 8).
- **Docs reference:** ✓ — Drizzle `changelogs/drizzle-orm/0.36.0.md` (Source 4), Drizzle docs `orm.drizzle.team/docs/rqb-v2` (Source 9), `porsager/postgres` README (Source 8).
- **Contradiction probe:** ✓ — `drizzle-team/drizzle-orm` issue tracker searched for `pgPolicy`, `RLS`, `findMany slow`, `relational query performance`, `N+1`. Surfaced Issue #5245 (open, 2026-01-10) — actual RQB-v2 perf issue at scale. Surfaced closed Issues #3504, #3495, #4078, #4198 (push vs migrate gap, introspect formatting, supabase USING rule, permission string change) — fixed in 2025/2026, informational. The original "Drizzle has N+1" worry is **directly contradicted by Drizzle's documented design** (Source 9 verbatim).

## Sources examined

### Source 1 — `drizzle-orm/src/pg-core/policies.ts` (production code)
- **Tier:** 1.
- **Provenance:** `github.com/drizzle-team/drizzle-orm` default branch, observed 2026-05-03 via `gh api`.
- **Author context:** Drizzle Team official source; class `PgPolicy` is the schema-side declarative RLS API.
- **What it tells us:** `pgPolicy(name, config)` factory accepts `as: 'permissive' | 'restrictive'`, `for: 'all' | 'select' | 'insert' | 'update' | 'delete'`, `to: PgPolicyToOption | PgRole | string[]` (supports `'public' | 'current_role' | 'current_user' | 'session_user'`), `using: SQL`, `withCheck: SQL`. Maps 1:1 to Postgres `CREATE POLICY` syntax. Note: no `force` option — owner-bypass control is not in the schema-side API.

### Source 2 — `drizzle-kit/src/sqlgenerator.ts` (production code)
- **Tier:** 1.
- **Provenance:** Same repo, observed 2026-05-03. Searched for `CREATE POLICY`, `ENABLE ROW LEVEL`, `FORCE ROW LEVEL`.
- **What it tells us:** `PgCreatePolicyConvertor.convert()` emits verbatim: `CREATE POLICY "name" ON "schema"."table" AS PERMISSIVE FOR SELECT TO "role" USING (...) WITH CHECK (...);`. Also generates `ALTER TABLE "..." ENABLE ROW LEVEL SECURITY;` automatically when a policy is added to a table. **`FORCE ROW LEVEL SECURITY` is not generated** (zero matches in `sqlgenerator.ts` for `FORCE ROW LEVEL` or `forceRls`/`forceRLS`).

### Source 3 — `drizzle-kit/tests/rls/pg-policy.test.ts` (production code)
- **Tier:** 1.
- **Provenance:** Same repo, observed 2026-05-03.
- **What it tells us:** Round-trip test confirms: defining `pgPolicy('test', { as: 'permissive' })` on a `pgTable` produces SQL statements `ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;` then `CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;`. Reverse direction (removing the policy from schema) generates `ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;` then `DROP POLICY "test" ON "users" CASCADE;`. Round-trip works correctly for the basic shape.

### Source 4 — `changelogs/drizzle-orm/0.36.0.md` (vendor docs)
- **Tier:** 2.
- **Provenance:** Same repo. v0.36.0 was the release that introduced RLS support.
- **What it tells us:** Verbatim: *"With Drizzle, you can enable Row-Level Security (RLS) for any Postgres table, create policies with various options, and define and manage the roles those policies apply to."* Also: *"If you add a policy to a table, RLS will be enabled automatically. So, there's no need to explicitly enable RLS when adding policies to a table."* Provides specific predefined RLS roles for Neon and Supabase via separate exports. Notes a `.enableRLS()` table-builder method for tables that should have RLS without policies (default-deny). **No mention of `FORCE ROW LEVEL SECURITY` in the changelog.**

### Source 5 — Drizzle Issue #3504 (closed, contradiction probe)
- **Tier:** 6 (forum/issue) — informational.
- **Provenance:** `github.com/drizzle-team/drizzle-orm/issues/3504`, opened 2024-11-06, **closed 2026-01-03**.
- **What it tells us:** Reporter found that `drizzle-kit push` did NOT apply RLS policies; `drizzle-kit generate` + `drizzle-kit migrate` DID. Was a real defect. Closed 2026-01 — likely fixed. **Non-issue for BokChoy** because `[[backend-stack]]` already commits to `drizzle-kit migrate` only (`getMigrations` workflow), not `push`.

### Source 6 — `drizzle-orm/src/postgres-js/session.ts` (production code)
- **Tier:** 1.
- **Provenance:** Same repo, observed 2026-05-03.
- **What it tells us:** `PostgresJsSession.transaction()` calls `client.begin(async (client) => { ... })` (postgres-js's BEGIN/COMMIT/ROLLBACK wrapper). `PostgresJsTransaction.transaction()` (the nested case) calls `this.session.client.savepoint((client) => { ... })`. **postgres-js's `savepoint` issues `SAVEPOINT sp_N` / `RELEASE SAVEPOINT sp_N` / `ROLLBACK TO SAVEPOINT sp_N`** under the hood — that's the canonical Postgres nested-transaction primitive. Confirms BokChoy's `withTenant(projectId, fn)` opening an inner `db.transaction(...)` *inside* an outer test transaction does the right thing automatically.

### Source 7 — `drizzle-orm/src/postgres-js/driver.ts` (production code)
- **Tier:** 1.
- **Provenance:** Same repo, observed 2026-05-03.
- **What it tells us:** Drizzle's `drizzle()` factory takes a `postgres` `Sql` client (from `import postgres from 'postgres'`) as input and wraps it. The Drizzle layer does NOT redefine connection options; whatever you pass to `postgres(connStr, { prepare: false, ... })` flows through unchanged. The `Drizzle ↔ postgres-js` boundary is a thin wrap, not a reimplementation.

### Source 8 — `porsager/postgres` README (vendor docs)
- **Tier:** 2.
- **Provenance:** `github.com/porsager/postgres/blob/master/README.md`, observed 2026-05-03 via WebFetch.
- **What it tells us:** Verbatim: *"Prepared statements will automatically be created for any queries where it can be inferred that the query is static. This can be disabled by using the `prepare: false` option."* Notes that PgBouncer 1.21.0+ added protocol-level named prepared-statement support, making `prepare: false` "less necessary" for PgBouncer specifically — **but this does not transfer to Supavisor** (Supavisor is a separate Elixir-based pooler with its own constraints per `[[local-docker-research]]` Source 9).

### Source 9 — Drizzle docs: RQB v2 (vendor docs)
- **Tier:** 2.
- **Provenance:** `orm.drizzle.team/docs/rqb-v2`, observed 2026-05-03.
- **What it tells us:** Verbatim: *"a single SQL statement is outputted by Drizzle"* when using `db.query.*` with `with: {}`. **The N+1 worry is directly refuted by Drizzle's documented design** — relational queries always emit ONE query, never N round-trips. Documented limitation: *"As of now aggregations are not supported in `extras`, please use core queries for that."* No documented warning about deep / many-to-many / filtered relations producing pathological query plans (the actual risk shape — see Source 10).

### Source 10 — Drizzle Issue #5245 (open, RQB-v2 perf at scale)
- **Tier:** 4 (engineering blog / named-author thread).
- **Provenance:** `github.com/drizzle-team/drizzle-orm/issues/5245`, opened 2026-01-10, **state: open** as of 2026-05-03. Drizzle maintainer `AlexBlokh` engaged in comments.
- **Author context:** Named external reporter `dragonautdev` running a real production workload (649,818 orders × 1,138,887 order items, 10–20 concurrent users, 3-table joins).
- **What it tells us:** RQB-v2 (the v1.0.0-beta line of Drizzle, RQB rewrite) generates a single query using `LEFT JOIN LATERAL` + `json_arrayagg` (or `json_agg` for Postgres). At synthetic single-user bench (1k orders × 50k items) the generated query is "even faster for lateral joins on local machine" per maintainer. At real production scale (3-table joins, where-clause filters on related tables, concurrent load) the generated SQL "literally kills our database after a few hours" per reporter. The reporter proposed a CTE rewrite as the canonical workaround — manually expressing the where-clause filter as a CTE that produces a small candidate-key set, then joining the related rows. Issue is open and triage-in-progress; maintainer acknowledged "we'll fix this." **Provisional risk shape**: 3+ table joins + where-clause filter on related table + concurrent load = pathological plan. Single-table or 2-table simple joins benchmark fine.

### Source 11 — `drizzle-team/drizzle-orm` releases page (production artifact)
- **Tier:** 1.
- **Provenance:** `github.com/drizzle-team/drizzle-orm/releases`, observed 2026-05-03 via `gh api`.
- **What it tells us:** Latest releases as of 2026-05-03: `v1.0.0-rc.1` (2026-04-30, three days prior), `v1.0.0-beta.22` (2026-04-16), `0.45.2` (last stable, 2026-03-27). **Drizzle v1 is in release-candidate phase, not GA.** v1 ships RQB-v2 and includes the perf issue from Source 10. Stable v0.45.x ships RQB-v1 (the older relational API).

## Findings

### (1) `pgPolicy` round-trip — works, but FORCE RLS gap
- **Schema → SQL:** Sources 1–4 confirm the schema-side `pgPolicy({ as, for, to, using, withCheck })` declaration generates correct `CREATE POLICY "name" ON "table" AS ... FOR ... TO ... USING (...) WITH CHECK (...);` SQL through `drizzle-kit generate` + `drizzle-kit migrate`. Adding any policy to a table auto-emits `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` — no manual enable needed. Removal generates `DISABLE ROW LEVEL SECURITY` + `DROP POLICY ... CASCADE`.
- **Gap (load-bearing for BokChoy):** Drizzle does **NOT** generate `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` (verified by `grep -c "FORCE ROW LEVEL\|forceRls\|forceRLS"` returning 0 across `drizzle-kit/src/sqlgenerator.ts`). `[[wallet-mechanics]]` §8 commits to FORCE on every protected table specifically because the table-owner role bypasses RLS by default in Postgres semantics; FORCE removes that bypass for the owner. With ENABLE-only, BokChoy's owner-bypass defense doesn't hold.
- **Workaround patterns:**
  - **(a) Append raw SQL via `sql\`\`` + custom migration**: After `drizzle-kit generate` produces the `*.sql` migration file, append `ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;` manually for each protected table. Brittle — easy to forget on new tables.
  - **(b) Post-migration script in CI**: Run a script after `drizzle-kit migrate` that introspects which tables have policies and ensures FORCE RLS is applied. Programmatic; survives forgetfulness.
  - **(c) Wrap `pgTable` in a project helper `bokchoyTable(...)` that records the table for FORCE-RLS sweep**: Custom DSL that the migration runner consults. More indirection, more maintenance.
- **Recommendation lane** (research surfaces, design chooses): pattern (b) — CI-enforced post-migration script that asserts FORCE RLS on every table with at least one policy. Survives forgetfulness via failure-on-CI; doesn't require schema-helper indirection.

### (3) `prepare: false` — flows through, simple pattern
- Sources 7–8 confirm: Drizzle's `drizzle(client)` takes a pre-constructed postgres-js `Sql` client. The `prepare: false` flag is set on the postgres-js client construction, not on Drizzle's side. Pattern:
  ```ts
  import postgres from 'postgres';
  import { drizzle } from 'drizzle-orm/postgres-js';
  const client = postgres(connStr, { prepare: false });  // ← here
  const db = drizzle(client);
  ```
- **Required for production** per `[[local-docker-research]]` Source 9 (Supabase docs verbatim) — Supavisor transaction-mode (port 6543) does not support prepared statements, regardless of PgBouncer's 1.21+ improvements (Supavisor ≠ PgBouncer).
- **Local without Supavisor**: `prepare: false` not strictly required when connecting direct to Postgres — but committing to `prepare: false` from day one keeps local and prod identical and avoids surprise prepared-statement bugs.
- **Recommendation lane**: set `prepare: false` unconditionally in the Drizzle client factory; document the reason in code comments.

### (4) Nested transactions / SAVEPOINT — works correctly
- Source 6 directly confirms: `tx.transaction(innerFn)` calls `client.savepoint(...)` from postgres-js. postgres-js's `savepoint` is documented to issue `SAVEPOINT sp_N` / `RELEASE SAVEPOINT sp_N` / `ROLLBACK TO SAVEPOINT sp_N`.
- **Implication for `withTenant(projectId, fn)`**: when `withTenant` is invoked inside an outer test transaction (e.g., Vitest `BEGIN; ... ROLLBACK;` wrapper per `[[local-docker-research]]` Q4 finding), Drizzle does the right thing — the inner `db.transaction(async tx => { ... SET LOCAL ... })` becomes a SAVEPOINT inside the outer test tx. Outer ROLLBACK cleans both writes and GUC.
- **Implication for stored-function-only-interface (`[[wallet-mechanics]]` M2)**: `wallet_credit(...)`, `wallet_debit(...)` etc. are stored functions called via `db.execute(sql\`SELECT wallet_credit(...)\`)`. If the caller is already inside a transaction, the stored function inherits that transaction context — which is what you want for atomicity.
- **No additional cascade obligation needed** beyond what `[[backend-stack]]` already commits to.

### (5-reframed) Single-query relational queries; risk shape is "complex query at scale"
- Source 9 (vendor docs verbatim): *"a single SQL statement is outputted by Drizzle"* when using `db.query.*` with `with: {}`. **N+1 is not a Drizzle failure mode by design.**
- Source 10 (open Issue #5245, 2026-01-10, RQB-v2 in v1:beta8): the actual perf risk shape surfaced under real-world load — `LEFT JOIN LATERAL` + `json_arrayagg` produces correct results but suboptimal plans when:
  - There's a where-clause *filter* on a related table (the WHERE branches into the lateral subquery's planning context).
  - 3+ tables are joined (lateral nesting deepens).
  - Concurrent load is sustained (10–20 concurrent users in reporter's case).
  - At reporter's scale (~650k orders × ~1.1M items), "literally kills our database after a few hours."
- **Synthetic single-user benches don't reproduce** (Drizzle maintainer ran 1k × 50k synthetic, lateral joins were faster). The risk is scale + concurrency + filtered-related-where-clause.
- **Mitigation patterns:**
  - **(a) CTE rewrite** (reporter's proposed fix): manually express the filtered-orders subquery as a CTE that produces a small candidate-key set; then JOIN the related rows. The maintainer acknowledged the framing.
  - **(b) Drop to Drizzle's lower-level core query builder** (`db.select().leftJoin(...)`) for hot paths — gives full control over JOIN order and indexes.
  - **(c) Wait for upstream fix** in #5245 — open issue, triage-in-progress, no ETA.
- **For BokChoy:** Risk surfaces only on cockpit reads with relations expanded, at scale (10k+ rows) under concurrent customer-developer browsing. Indie/SMB MVP volumes (single customer, dozens-to-hundreds of concurrent users *across all customer-developers*) likely do not trigger. **Profile-then-mitigate is the correct posture, not pre-emptive raw-SQL** — write `db.query.*` for clarity, drop to core builder only if/when profiling shows a hot path.

### Drizzle version pin (newly surfaced finding)
- Source 11: Drizzle is at **v1.0.0-rc.1 (2026-04-30, 3 days prior to today)**. v1 ships RQB-v2 (the relational query rewrite where Issue #5245 lives, not yet fixed). Last stable is **0.45.2 (2026-03-27)** with RQB-v1 (older relational query API; different perf shape, reportedly less optimized but without the #5245 lateral-join-at-scale issue).
- **Tradeoff:**
  - **Pin to 0.45.x stable**: avoids #5245's specific perf shape; uses older RQB-v1 (less feature-complete; documented gaps closed in v2). RLS support is in 0.45.x (introduced 0.36.0 per Source 4). Conservative.
  - **Pin to v1.0.0-rc.x or v1.0.0 GA when shipped**: gets RQB-v2 + the v1 RC's bug fixes (363-commit "Alternation Engine" PR per release notes). Carries #5245 risk. Aggressive.
- **For BokChoy MVP**: solo dev, indie/SMB scale, RLS-heavy. Either pin works at MVP volumes. Recommendation lane: pin to **last 0.45.x stable** for MVP launch; track v1 GA for post-launch upgrade. Avoids being on the bleeding edge during initial customer pain debugging. Aligns with `[[backend-stack]]` rejected-alternative posture (conservative dependency choices).

## Conflicts

**Original "N+1 in Drizzle" worry vs documented design:**
- The human surfaced "cause of N+1" as the rationale for investigating (5).
- Drizzle docs (Source 9) verbatim refute the framing — relational queries are single-query by design.
- Per *Contradiction protocol* (current docs > training-data inference): docs win. The N+1 framing is *factually incorrect* about Drizzle.
- Resolution: not a conflict between sources; it's a conflict between human's prior + Drizzle's actual behavior. Documented in *Findings* (5-reframed) so the corrected risk shape (single-query-with-poor-plan, not N+1) carries forward.

**FORCE RLS — schema-API gap vs `[[wallet-mechanics]]` requirement:**
- Source 1 + Source 4 (`pgPolicy` API + 0.36.0 changelog) do not expose a `force` option. Source 2 (`sqlgenerator.ts`) does not generate `FORCE ROW LEVEL SECURITY`.
- `[[wallet-mechanics]]` §8 explicitly commits to FORCE on every protected table. The owner-bypass defense is the named reason.
- Per *Contradiction protocol*: not really a conflict — Drizzle simply doesn't ship the feature. BokChoy must work around it. Documented in *Findings* (1) with three workaround patterns and a recommendation lane.

## Conditions

- **(1) findings hold on:** Drizzle 0.36.0+ for the RLS API, observed against 1.0.0-rc.1 source. The `pgPolicy` API surface is documented stable across 0.36.x → 1.0.x transition.
- **(3) finding holds on:** postgres-js as the driver. Other Drizzle drivers (node-postgres, neon-serverless, bun-sql) have different connection-option shapes; this finding does NOT transfer to those without re-verification.
- **(4) finding holds on:** postgres-js driver session. Other drivers' nested-transaction implementations were not inspected at this depth — claim is specific to `drizzle-orm/src/postgres-js/session.ts`. Per `[[backend-stack]]` BokChoy commits to postgres-js, so transferable.
- **(5-reframed) findings hold on:** RQB-v2 (Drizzle v1.x). RQB-v1 (Drizzle ≤ 0.45.x) has different SQL generation shape — the #5245 specifics may not apply to v1 of Drizzle. If BokChoy pins to 0.45.x stable per the version-pin recommendation, the #5245 risk does not directly apply. **The single-query-by-design property holds for both v1 and v2.**
- **All findings hold on:** Postgres ≥ 12 (RLS, SAVEPOINT, JSON aggregation features all stable). BokChoy commits to Postgres 17 per `[[host-platform]]`.

## Operational implications

For `[[backend-stack]]` (NEW cascade obligations queued):

1. **FORCE RLS post-migration sweep**: CI script that asserts every table with `pgPolicy` declarations also has `FORCE ROW LEVEL SECURITY` applied. Suggested implementation: SQL query against `pg_policies` joined to `pg_class` to find tables with policies, cross-check `pg_class.relforcerowsecurity = true`, fail CI if mismatch. Alternative: append-FORCE statements to the migration file via a generator script that runs after `drizzle-kit generate`.
2. **`prepare: false` unconditional**: Drizzle client factory in `apps/backend/src/db/client.ts` (or equivalent path per `[[backend-service-shape]]`) constructs `postgres(connStr, { prepare: false })` always — local AND prod. Comment cites `[[local-docker-research]]` Source 9 + this entry as the reason.
3. **Drizzle version pin**: pin `drizzle-orm` to `0.45.2` (last stable 2026-03-27) and `drizzle-kit` to matching `0.45.x`. Track v1 GA release; revisit pin post-MVP launch when v1 is GA + #5245 is closed. Renovate / Dependabot config should NOT auto-bump Drizzle minor versions until version-pin commitment is revisited.
4. **`withTenant(projectId, fn)` test pattern**: implementations may rely on outer-test-tx-rollback cleaning inner-`SET LOCAL`-GUC via SAVEPOINT semantics. Document this in the testing-patterns runbook so contributors don't break it by adding their own commit-on-success logic inside `withTenant`.

For `[[wallet-mechanics]]` (no amendment needed, validation only):

5. **§8 FORCE RLS commitment is achievable** — workaround pattern (b) (CI-enforced post-migration script) closes the Drizzle gap.
6. **M2 stored-function-only-interface compatibility verified** — `db.execute(sql\`SELECT wallet_credit(...)\`)` inside an outer transaction inherits the transaction context correctly via Drizzle's `client.begin` wrapper; stored function executes inside the caller's transaction, atomic with surrounding writes.

For cockpit perf (deferred to /design):

7. **Profile-then-mitigate posture for `db.query.*` hot paths**: do not pre-emptively drop to raw SQL. Write `db.query.*` for clarity. When MVP profiling surfaces a slow cockpit page, *that's* when to evaluate (a) CTE rewrite, (b) drop to core builder, (c) check whether Issue #5245 has been closed upstream.

For `[[multi-tenant-rls-research]]` (validation only):
8. **`withTenant` per-transaction `SET LOCAL` pattern is implementable** as commitment-loaded — Drizzle's nested-tx + SAVEPOINT semantics make it round-trip safely through tests, withTenant wrappers, and stored functions.

## Reproducibility note

Reproducible. Another investigator would:

1. `gh api repos/drizzle-team/drizzle-orm/contents/drizzle-orm/src/pg-core/policies.ts` — verify pgPolicy schema API.
2. `gh api repos/drizzle-team/drizzle-orm/contents/drizzle-kit/src/sqlgenerator.ts | grep -E "CREATE POLICY|ENABLE ROW LEVEL|FORCE ROW LEVEL"` — verify SQL generation includes ENABLE but not FORCE.
3. `gh api repos/drizzle-team/drizzle-orm/contents/drizzle-kit/tests/rls/pg-policy.test.ts` — verify round-trip test.
4. `gh api repos/drizzle-team/drizzle-orm/contents/drizzle-orm/src/postgres-js/session.ts | grep savepoint` — verify nested-tx SAVEPOINT.
5. `gh api repos/drizzle-team/drizzle-orm/contents/drizzle-orm/src/postgres-js/driver.ts` — verify Drizzle thin-wrap of postgres-js client.
6. WebFetch `github.com/porsager/postgres/blob/master/README.md` for `prepare: false` docs.
7. WebFetch `orm.drizzle.team/docs/rqb-v2` for single-SQL-statement claim.
8. `gh api search/issues?q=repo:drizzle-team/drizzle-orm+findMany+slow+with` to find Issue #5245.
9. `gh api repos/drizzle-team/drizzle-orm/releases?per_page=5` for current version state.

The recommendation lanes (FORCE RLS workaround pick, version pin pick) are judgment calls; another investigator with the same evidence might reasonably choose differently (e.g., pin to v1-rc to avoid the post-launch upgrade churn). The judgment is labeled in *Findings* + *Operational implications* as recommendation lanes for /design to weigh.

## Open threads

1. **FORCE RLS as Drizzle feature request.** Worth checking `drizzle-team/drizzle-orm` issue tracker for an existing FR; if absent, file one. Independent of BokChoy's MVP path (workaround (b) suffices), but a 5-minute search.
2. **Issue #5245 status watch.** Open as of 2026-05-03; maintainer engaged but no ETA. Subscribe to issue updates; revisit version-pin recommendation if closed.
3. **RQB-v1 (0.45.x) perf shape vs RQB-v2.** RQB-v1's relational query SQL generation was not inspected at code-reading depth in this session. If BokChoy pins to 0.45.x per recommendation 3, the implicit assumption is that v1 doesn't have a different equally-bad perf failure mode. 30-minute follow-up: read `drizzle-orm@0.45.2` `pg-core/relational-query-builder.ts` (or equivalent) for the v1 SQL shape.
4. **Drizzle + Better Auth schema interaction.** `[[backend-stack]]` commits to hand-writing Better Auth tables in Drizzle schema files (Better Auth `getMigrations` doesn't support Drizzle adapter). When v2 migration tooling lands changes, Better Auth's hand-written tables must stay aligned. Track Better Auth releases for breaking schema changes; runbook obligation in `[[backend-stack]]`.
5. **`db.execute(sql\`...\`)` stored-function pattern under SAVEPOINT.** Source 6 confirms session-level SAVEPOINT for `tx.transaction(...)`. Direct invocation of `db.execute(sql\`SELECT my_stored_func(...)\`)` *inside* an outer transaction inherits the outer tx — but if the stored function itself contains BEGIN/COMMIT (it shouldn't, but legacy pgPL patterns sometimes do), the savepoint semantics may differ. BokChoy stored functions per `[[wallet-mechanics]]` M2 do not contain explicit BEGIN/COMMIT, so this is theoretical, but a code-review checklist obligation.
