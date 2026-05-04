---
type: research
features: [wallet, architecture, multi-tenant, security]
related: ["[[wallet-mechanics]]", "[[deidentify-mechanism-research]]", "[[idempotency-strategy]]"]
created: 2026-05-02
confidence: high
provisional: false
---

# Multi-tenant Postgres RLS as the cross-tenant isolation boundary in non-Supabase deployments — pattern, PgBouncer interaction, partition-pruning behavior, and the named counter-position

## Question

The `[[wallet-mechanics]]` entry is silent on cross-tenant isolation enforcement. Every query on `transactions`, `loot_rolls`, `iap_receipts`, `staged_jobs`, `wallets` must filter on `project_id`; a single missed filter exposes another customer's data. The amendment owes a structural mechanism (or a vaulted rejection of the standard mechanism). Five load-bearing questions:

1. Is Postgres RLS the production-cited mechanism for multi-tenant TypeScript backends on standalone Postgres (non-Supabase), or is app-layer enforcement the cited pattern?
2. What is the canonical pattern for setting the per-request tenant context that RLS policies read from?
3. How does this interact with PgBouncer in transaction-pool mode (`pool_mode = transaction`) — specifically, does `SET LOCAL` reliably persist for one transaction without leaking?
4. Does RLS break partition pruning when the partition key is `created_at` and the policy filters on `project_id`?
5. Is there a production post-mortem at ≥1k tenants, ≥10k req/sec describing RLS-as-multi-tenant-boundary at scale?

## Triangulation

- **Production reference:** ✓ — AWS Prescriptive Guidance (S10, prescriptive), AWS Database Blog (S9, Michael Beardsley 2020), Crunchy Data (S11, Craig Kerstiens 2024), Heroku Dev Center (S7, last updated 2024-12-03), Nile (S19, post-mortem-ish), JP Camara (S8, independent named author), pganalyze (S15)
- **Docs reference:** ✓ — Postgres 16 docs on RLS, SET, set_config, customized options, partitioning. PgBouncer features.html + config.html. Drizzle ORM docs (S13). Prisma client extensions repo (S14).
- **Contradiction probe:** ✓ — PlanetScale's Simeon Griggs (S12, 2026-04-21) is the strongest named counter-position: "We generally don't recommend relying on RLS." Permit.io / Uma Victor (S20, 2025) softer critique. Pierre Ducroquet pgsql-hackers (S18, 2019) on leakproof-ness performance. Nile / Miki Pokryvailo (S19) production-pain enumeration.

## Sources examined

### Source 1 — Postgres 16 RLS docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.postgresql.org/docs/16/ddl-rowsecurity.html` (accessed 2026-05-02)
- **Author context:** PostgreSQL Global Development Group
- **What it tells us:** Verbatim on policy performance: "This is the simplest and best-performing case; when possible, it's best to design row security applications to work this way." The page does **not** discuss partition pruning interaction. Not found in primary docs — that's itself a useful finding.

### Source 2 — Postgres 16 SET docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.postgresql.org/docs/16/sql-set.html` (accessed 2026-05-02)
- **What it tells us:** Verbatim: "Specifies that the command takes effect for only the current transaction. After `COMMIT` or `ROLLBACK`, the session-level setting takes effect again. Issuing this outside of a transaction block emits a warning and otherwise has no effect."

### Source 3 — Postgres 16 customized options
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.postgresql.org/docs/16/runtime-config-custom.html` (accessed 2026-05-02)
- **What it tells us:** Custom GUC namespacing is documented: "Custom options have two-part names: an extension name, then a dot, then the parameter name proper, much like qualified names in SQL." `app.current_tenant` is syntactically supported.

### Source 4 — Postgres 16 partitioning + pruning
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.postgresql.org/docs/16/ddl-partitioning.html` (accessed 2026-05-02)
- **What it tells us:** Verbatim: "Partition pruning can be performed not only during the planning of a given query, but also during its execution… Partition pruning may also be performed here to remove partitions using values which are only known during actual query execution." Verbatim on what defeats pruning: "comparison against a non-immutable function such as `CURRENT_TIMESTAMP` cannot be optimized." The page contains no text on RLS interaction with pruning.

### Source 5 — PgBouncer features compatibility table
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.pgbouncer.org/features.html` (accessed 2026-05-02)
- **What it tells us:** Verbatim intro: "transaction pooling breaks client expectations of the server _by design_ and can be used only if the application cooperates by not using non-working features." Transaction-pool row: `SET/RESET` → "Never". The table does **not** distinguish `SET LOCAL` from `SET`/`SET SESSION`.

### Source 6 — PgBouncer config docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.pgbouncer.org/config.html` (accessed 2026-05-02)
- **What it tells us:** Verbatim on `pool_mode = transaction`: "Server is released back to pool after transaction finishes." Verbatim: "When transaction pooling is used, the `server_reset_query` is not used, because in that mode, clients must not use any session-based features, since each transaction ends up in a different connection and thus gets a different session state."

### Source 7 — Heroku PgBouncer best-practices guide
- **Tier:** 2 (vendor official guide; last updated 2024-12-03)
- **Provenance:** `https://devcenter.heroku.com/articles/best-practices-pgbouncer-configuration` (accessed 2026-05-02)
- **What it tells us:** Verbatim prescriptive: "Any changes to session state via `SET` must only be made with `SET LOCAL` so that the changes are scoped only to the currently executing transaction. Never use `SET SESSION` or `SET` alone, which defaults to `SET SESSION` with transaction pooling."

### Source 8 — JP Camara, "PgBouncer is useful, important, and fraught with peril"
- **Tier:** 4 (engineering blog, named author, recent — published 2023-04-12, updated 2024-09-17)
- **Provenance:** `https://jpcamara.com/2023/04/12/pgbouncer-is-useful.html` (accessed 2026-05-02)
- **What it tells us:** Independent named demonstration: `BEGIN; SET LOCAL lock_timeout TO '2s'; ALTER TABLE my_table…` "Our transaction local setting will stick with us until the transaction commits or rollback."

### Source 9 — AWS Database Blog: Multi-tenant data isolation with PostgreSQL RLS
- **Tier:** 4 (engineering blog, vendor) — Michael Beardsley, 2020-05-18
- **Provenance:** `https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/` (accessed 2026-05-02)
- **What it tells us:** Verbatim canonical policy: `CREATE POLICY tenant_isolation_policy ON tenant USING (tenant_id = current_setting('app.current_tenant')::UUID)`. Verbatim PgBouncer caveat: "Using session variables may be incompatible with server-side connection pooling such as pgBouncer. Be sure to review all implications of your connection pooling strategy and test if it shares session state."

### Source 10 — AWS Prescriptive Guidance on RLS
- **Tier:** 2 (vendor prescriptive guidance)
- **Provenance:** `https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html` (accessed 2026-05-02)
- **What it tells us:** Verbatim: "Row-level security (RLS) is required to maintain tenant data isolation in a pooled model with PostgreSQL. RLS centralizes the enforcement of isolation policies at the database level and removes the burden of maintaining this isolation from software developers." Same canonical pattern: `current_setting('app.current_tenant')::UUID`.

### Source 11 — Crunchy Data: Row Level Security for Tenants in Postgres
- **Tier:** 4 (engineering blog, named author) — Craig Kerstiens, 2024-04-03
- **Provenance:** `https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres` (accessed 2026-05-02)
- **What it tells us:** Same canonical pattern using `SET rls.org_id = …` + `current_setting('rls.org_id', TRUE)`. Does not discuss PgBouncer or scale.

### Source 12 — PlanetScale: Approaches to tenancy in Postgres (CONTRADICTION PROBE)
- **Tier:** 4 (engineering blog, named author, very recent) — Simeon Griggs, 2026-04-21
- **Provenance:** `https://planetscale.com/blog/approaches-to-tenancy-in-postgres` (accessed 2026-05-02)
- **What it tells us:** Strongest named counter-position. Verbatim: "We generally don't recommend relying on RLS. It shifts security logic into the database, where policy misconfiguration, silent failures, and connection pooling interactions are difficult to debug. Keep tenant isolation enforced in your application code." Acknowledges `SET LOCAL` works: "SET LOCAL ensures the setting is scoped to this transaction which is important when using connection pooling."

### Source 13 — Drizzle ORM RLS docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://orm.drizzle.team/docs/rls` (accessed 2026-05-02)
- **What it tells us:** Verbatim: "Drizzle supports a raw representation of Postgres policies and roles that can be used in any way you want." All worked examples use Supabase/Neon helpers; standalone-Postgres examples documented only at primitives level (`pgPolicy`, `pgRole`, `pgTable.withRLS()`). No PgBouncer guidance.

### Source 14 — Prisma client extensions: row-level-security example
- **Tier:** 2 (official extensions repo)
- **Provenance:** `https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security` (accessed 2026-05-02)
- **What it tells us:** Verbatim pattern: ``await prisma.$executeRaw`SELECT set_config('app.current_company_id', ${companyId}, TRUE)`;`` Verbatim sequence: "1. Start a transaction. 2. Set the runtime parameter as a `LOCAL` setting… 3. Run all queries for the duration of the request inside this transaction." Verbatim production warning: "This extension is provided as an example only. It is not intended to be used in production environments." (Warning concerns the extension scaffold, not the SQL pattern.)

### Source 15 — pganalyze: RLS in Ruby on Rails
- **Tier:** 4 (engineering blog, named author) — Eze Sunday Eze, 2021-05-25
- **Provenance:** `https://pganalyze.com/blog/postgres-row-level-security-ruby-rails` (accessed 2026-05-02)
- **What it tells us:** Verbatim PgBouncer caveat: "third-party connection poolers, such as pgbouncer in transaction pooling mode, have a risk that the security context gets mixed up." Independent named-author corroboration of the SET-vs-SET-LOCAL distinction.

### Source 16 — Postgres commit: "Apply RLS policies to partitioned tables"
- **Tier:** 1 (production code, commit message authoritative)
- **Provenance:** `https://www.postgresql.org/message-id/E1dK59q-0005XI-2U@gemulon.postgresql.org` Joe Conway, 2017-06-11 (accessed 2026-05-02)
- **What it tells us:** Verbatim: "The new partitioned table capability added a new relkind, namely RELKIND_PARTITIONED_TABLE. Update fireRIRrules() to apply RLS policies on RELKIND_PARTITIONED_TABLE as it does RELKIND_RELATION." Confirms RLS works on partitioned parents. Says nothing about pruning.

### Source 17 — pgsql-hackers: Partition pruning with current_setting
- **Tier:** 6→3 (mailing list — community report with strong empirical content) — Marcelo Zabani, 2024-08-07
- **Provenance:** `https://www.postgresql.org/message-id/CACgY3QaK9xTvaWR5rYJtYuZmKwb3tM-66NAVc2w8zkhe4cSOCA@mail.gmail.com` (accessed 2026-05-02)
- **What it tells us:** Empirical, load-bearing for Q4. Verbatim: "Works: `WHERE tenant_id=current_setting('my.tenant_id')::integer` (scalar setting). Fails: `WHERE tenant_id=ANY(current_setting('my.tenant_id')::integer[])` (array from setting)." Author's own surprise: "I actually expected that when in a setting, none of the previous queries would've done partition pruning because I thought `current_setting` is not a stable function. But some of them did, which surprised me." **No core-committer reply on the page** — community report, not authoritative resolution. But the empirical observation is reproducible.

### Source 18 — pgsql-hackers: RLS leakproof-ness and performance
- **Tier:** 6→3 (mailing list, named author) — Pierre Ducroquet, 2019-02-19
- **Provenance:** `https://www.postgresql.org/message-id/2811772.0XtDgEdalL@peanuts2` (accessed 2026-05-02)
- **What it tells us:** Verbatim: "a lot of the PostgreSQL functions are not marked as leakproof, especially the ones used for operators." "In current git master, the following query returns 258 functions that are used by operators returning booleans and not marked leakproof." Canonical performance warning: when policy quals are present, planner cannot push non-leakproof expressions past them, causing index-usage regressions on inner predicates.

### Source 19 — Nile: Shipping multi-tenant SaaS using RLS
- **Tier:** 3 (engineering post-mortem-style write-up, named author) — Miki Pokryvailo, 2022-07-26
- **Provenance:** `https://www.thenile.dev/blog/multi-tenant-rls` (accessed 2026-05-02)
- **What it tells us:** Verbatim production pain points: "RLS doesn't apply to superusers and table owners"; "some requests were being authorized with a previous request's user id" (thread-local context bleed); "logging the execution of the actual policies isn't directly possible." No tenant or QPS numbers.

### Source 20 — Permit.io: Postgres RLS implementation guide
- **Tier:** 4 (engineering blog, named author, recent) — Uma Victor, 2025-05-05
- **Provenance:** `https://www.permit.io/blog/postgres-rls-implementation-guide` (accessed 2026-05-02)
- **What it tells us:** Verbatim downsides: "RLS can create security gaps if functions, like `current_organization_id()`, rely on user-supplied input, making SQL injection possible." "Complex RLS policies can significantly impact query performance." "Debugging becomes difficult when queries don't return expected results due to RLS policies."

### Source 21 — django-tenants issue #545
- **Tier:** 6 (community report, no maintainer reply visible)
- **Provenance:** `https://github.com/django-tenants/django-tenants/issues/545` (reported 2021-03-08, accessed 2026-05-02)
- **What it tells us:** Reporter directly observed `SET search_path` failing under PgBouncer transaction mode, proposed `SET LOCAL` as fix. Community report, not authoritative.

## Findings

### Pattern verdict (Q1)
**RLS is the dominant published pattern in non-Supabase guidance, with a credible named counter-position.** AWS Prescriptive Guidance (S10) is verbatim "required to maintain tenant data isolation in a pooled model with PostgreSQL." AWS Database Blog (S9), Crunchy Data (S11), Drizzle (S13), Prisma extensions (S14), Heroku (S7), pganalyze (S15), Nile (S19) all teach RLS as the path. **PlanetScale (S12) is the strongest named counter-position**: "We generally don't recommend relying on RLS… Keep tenant isolation enforced in your application code." PlanetScale's argument is debuggability, silent misconfiguration, and pooling interactions — all real, named issues that other sources also surface as caveats.

### Canonical pattern (Q2)
**`SET LOCAL app.current_tenant = '<uuid>'`** (or equivalently `SELECT set_config('app.current_tenant', $uuid, TRUE)`) inside an explicit transaction. The policy reads the GUC via `current_setting('app.current_tenant')::UUID`. This pattern is consistent across AWS (S9, S10), Prisma extensions (S14), Crunchy Data (S11), and Heroku (S7).

### PgBouncer transaction-pool interaction (Q3)
**`SET LOCAL` is documented-safe in transaction-pool mode.** Plain `SET`/`SET SESSION` is unsafe and explicitly listed "Never" by PgBouncer. Evidence chain:

- Postgres SET docs (S2): `SET LOCAL` "takes effect for only the current transaction. After `COMMIT` or `ROLLBACK`, the session-level setting takes effect again."
- PgBouncer config (S6): "Server is released back to pool after transaction finishes."
- Conclusion: GUC dies before connection returns to pool — no cross-transaction leak.
- Heroku official prescriptive guidance (S7): "Any changes to session state via `SET` must only be made with `SET LOCAL`."
- Independent named-author confirmation: JP Camara (S8), pganalyze/Eze (S15), django-tenants community report (S21).

**Honest gap:** No primary PgBouncer document contains a verbatim sentence "SET LOCAL is permitted in transaction mode." The conclusion follows from Postgres + PgBouncer semantics combined, plus Heroku's prescriptive guidance.

### Partition pruning interaction (Q4)
**RLS will NOT break partition pruning under BokChoy's specific shape (created_at partition key + project_id RLS column).** Two reasons:

1. **The `created_at` predicate from the application drives pruning**, not the RLS-injected `project_id =` qualifier. They're orthogonal columns. Per S4 (Postgres docs), pruning works on the partition key when the WHERE clause contains constants or externally-supplied parameters; the application's `WHERE created_at >= …` is exactly that.
2. **Empirical evidence from S17 (Marcelo Zabani, 2024-08-07):** scalar `current_setting('my.tenant_id')::integer` against a partition column DOES participate in pruning. BokChoy's pattern matches this scalar case, not the broken array-via-`ANY()` case.

**Real performance risk is leakproof-ness regression (S18), not pruning loss.** When RLS is enabled, the planner cannot push non-leakproof operators past the policy; many operators are not LEAKPROOF, which can cost index-usage on inner predicates. This is a planning concern, not a partition-pruning concern.

**Verification path:** `EXPLAIN (ANALYZE, BUFFERS)` showing the "Subplans Removed" line is the primary-source-documented signal of pruning (S4).

### Production scale post-mortem (Q5)
**Not found.** No primary engineering source surveyed describes RLS-as-multi-tenant-boundary at ≥1k tenants and ≥10k req/sec. Nile (S19) is post-mortem-style but has no scale numbers. AWS (S9, S10) and Crunchy (S11) are prescriptive without metrics. **At BokChoy's potential scale (Studio+ ≥10k req/sec across all tenants), there are no published case studies to draw from.** This is itself the finding.

## Conflicts

1. **AWS / Crunchy / Heroku / Nile / pganalyze (consensus)** vs. **PlanetScale / Permit.io (named critics).** Per *Contradiction protocol*, multiple independent vendor + named-author production sources beat one. AWS Prescriptive Guidance + the second-tier corpus is the stronger position for the consensus path. PlanetScale's counter is **not dismissed** — it surfaces real issues (debuggability, observability, silent misconfiguration) that the consensus also acknowledges, but it concludes the issues outweigh the structural-protection benefit. The disagreement is a values-and-priorities disagreement, not a factual disagreement.

2. **PgBouncer features table (S5) vs. operational reality.** The features table marks `SET/RESET` "Never" without distinguishing `SET LOCAL`. Operational reality (S2 + S6 + S7 + S8) shows `SET LOCAL` is the supported escape hatch. Per *Contradiction protocol*, current docs win — but the PgBouncer table is silent on `SET LOCAL`, so there's no direct contradiction; just an underspecified table corrected by Heroku's prescriptive guidance and the Postgres semantic chain.

3. **Joe Conway commit (S16) vs. partition-policy best-practice claim.** S16 only authorizes RLS-on-partitioned-parent; "policies on each partition" guidance circulates in secondary sources but is not in primary Postgres 16 docs. Treat as community recommendation pending primary-source verification.

## Conditions

The findings hold under:

- **Standalone Postgres ≥ 16** with PgBouncer in `pool_mode = transaction`.
- **Application accesses Postgres via a non-owner role.** RLS does NOT apply to table owners or superusers (S19). The application role must be created without ownership of the protected tables.
- **`FORCE ROW LEVEL SECURITY` enabled** on each protected table (the published pattern). Without `FORCE`, RLS is bypassed for the table owner; with `FORCE`, even the owner is subject to policies.
- **Per-request transactional pattern.** `BEGIN` → `SET LOCAL app.current_tenant = …` → queries → `COMMIT`. Outside an explicit transaction, `SET LOCAL` warns and has no effect (S2). For TypeScript this means wrapping every request handler in `db.transaction(async (tx) => { … })`.
- **The partition key is separate from the RLS-discriminator column.** BokChoy's case: `created_at` partition key, `project_id` RLS column. If they were the same column, the analysis differs.
- **Single-UUID tenant context.** Array-valued tenant lists via `ANY(current_setting(…))` break pruning per S17.

## Operational implications

For the amendment to `[[wallet-mechanics]]`:

1. **Add RLS as the structural cross-tenant isolation mechanism, with named caveats from the counter-position.** This is a defense-in-depth layer beneath M2's stored-function-only-interface — M2 protects writes from bypass, RLS protects reads (and writes) from missed-filter leakage.

2. **Specific implementation pattern (production-cited):**
   - Create a non-owner application role: `CREATE ROLE bokchoy_app NOLOGIN; GRANT bokchoy_app TO bokchoy_user;`
   - Tables remain owned by `bokchoy_admin` (or equivalent migration role); `bokchoy_app` gets `SELECT`/`EXECUTE` per existing M2 grants.
   - For each protected table: `ALTER TABLE x ENABLE ROW LEVEL SECURITY; ALTER TABLE x FORCE ROW LEVEL SECURITY; CREATE POLICY tenant_isolation ON x USING (project_id = current_setting('app.current_tenant')::UUID);`
   - Per-request: `BEGIN; SET LOCAL app.current_tenant = '<uuid>'; … COMMIT;` (Drizzle: inside `db.transaction(...)`. Prisma: per S14 pattern.)

3. **Document the PlanetScale counter-position as the rejected-alternative.** Add to `Rejected alternatives` in `[[wallet-mechanics]]`:
   - **App-layer enforcement (PlanetScale pattern).**
     - **What:** every query goes through a tenant-scoped query helper; rely on TypeScript types + code review for enforcement; no RLS.
     - **Wins when:** team prioritizes debuggability and DB-layer observability over structural protection; team has strong type-discipline and code-review culture.
     - **Why not here:** BokChoy already commits to M2 (structural protection at the write layer); the symmetric mechanism on the read layer is RLS. Going hybrid (M2 writes + app-layer reads) is internally inconsistent. PlanetScale's debuggability concern is real and surfaces as a failure mode (below).

4. **Add a failure mode for RLS-specific operational pain:**
   - **Mode 8a (RLS leakproof regression):** RLS policy on `transactions` causes planner to be conservative about pushing non-leakproof predicates past it, costing index usage on inner WHERE predicates (S18). Probability: medium during query authoring. Cost: medium (slow queries, not lost data). Mitigation: profile queries with `EXPLAIN (ANALYZE, BUFFERS)`; mark project-internal functions LEAKPROOF where safe; document the tradeoff so query authors know to test perf with RLS enabled.
   - **Mode 8b (RLS owner bypass):** application accidentally connects as table owner, RLS is silently bypassed (S19). Probability: low (mitigated by role separation). Cost: critical (cross-tenant exposure). Mitigation: `FORCE ROW LEVEL SECURITY` on every protected table; CI test asserts `bokchoy_app` cannot read another project's rows.
   - **Mode 8c (silent context-bleed):** transaction reuses an old `app.current_tenant` value from a prior request because a code path didn't re-set it (S19, the "thread-local context bleed" Nile experienced). Probability: medium during refactors. Cost: critical. Mitigation: middleware sets `SET LOCAL` as the first statement of every request transaction; never read without setting; integration test verifies fresh `current_setting` on each request.

5. **Customer privacy policy + SDK contract:** RLS is BokChoy's structural commitment to cross-tenant isolation. Customer-facing docs should reference this — "BokChoy enforces cross-project isolation at the database layer via Postgres row-level security; no application code path can read across project boundaries."

6. **Verification:**
   - Integration test: open transaction as `bokchoy_app`, set `app.current_tenant` to project A, attempt to SELECT from `transactions` filtered on project B's IDs — expect zero rows.
   - Performance test: `EXPLAIN (ANALYZE, BUFFERS)` on a representative query against partitioned `transactions` with RLS enabled; assert "Subplans Removed" line is present, confirming partition pruning still works.

## Reproducibility note

**Reproducible.** Re-run by:
1. Reading AWS Prescriptive Guidance + Database Blog post (S9, S10) for the consensus pattern.
2. Reading Postgres 16 docs on RLS, SET, customized options, partitioning (S1–S4) for primitives.
3. Reading PgBouncer features + config (S5, S6) and Heroku PgBouncer guide (S7) for pool-mode interaction.
4. Reading Marcelo Zabani's pgsql-hackers post (S17) for empirical pruning behavior with `current_setting`.
5. Reading PlanetScale (S12) for the strongest named counter-position.

Honest gaps:
- No primary PgBouncer doc says "SET LOCAL is supported in transaction mode" verbatim. Conclusion follows from semantic chain + Heroku prescriptive guidance.
- No production post-mortem at ≥1k tenants / ≥10k rps was found. At BokChoy's potential scale, public RLS case studies don't exist.
- "Policies on each partition" guidance is widely repeated in secondary sources but not in Postgres 16 primary docs.
- The Joe Conway 2017 commit (S16) only authorizes parent-table RLS; whether per-partition policies are strictly required for pruning is not primary-source-verified.

## Open threads

1. **Primary-source verification of per-partition RLS policy requirement.** S16 only covers parent-table case. Need a Postgres 16-era doc or commit confirming that policies on the parent suffice for partition pruning, OR a confirmed requirement to declare policies on each partition. Implementation-phase: test both shapes against `EXPLAIN ANALYZE`.

2. **Performance benchmark of RLS on partitioned `transactions` at projected Studio+ load.** Implementation-phase. Specifically: confirm pruning works AND inner-predicate index usage is preserved (S18 leakproof concern).

3. **CI / integration test for cross-tenant isolation.** Implementation-phase deliverable. Pattern: open transaction with `app.current_tenant` set to project A, attempt cross-project read, assert empty result.

4. **Migration-review CI: GRANT on protected tables + RLS policy presence.** Extends the existing M2 GRANT-migration-review CI lint to also verify RLS is enabled and policies exist on every multi-tenant table.

5. **Connection-pool layer choice.** PgBouncer in transaction-pool mode is the assumed deployment. If a future move to PgCat or pgpool-II changes pooling semantics, this entire analysis must be re-verified.
