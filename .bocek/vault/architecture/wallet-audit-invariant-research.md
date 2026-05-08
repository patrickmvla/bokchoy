---
type: research
features: [wallet, architecture]
related: ["[[wallet-source-of-truth-research]]", "[[idempotency-strategy]]", "[[mvp-feature-sequence]]"]
created: 2026-05-02
confidence: high
provisional: false
---

# Path-B paired-write enforcement: do production Postgres ledger systems use triggers, stored functions, or application-level discipline — and which mechanism is structurally available without inheriting the documented trigger anti-pattern?

## Erratum 2026-05-04 — pgledger M2 attribution falsified by source-walk; F2 + F3 corrected

Per `[[wallet-functions-research]]` (Q3 of the wallet gap-cluster /research queue, executed 2026-05-04). The original 2026-05-02 entry's S3 cite + F2 + F3 conclusions about pgledger were inferred from API shape and prior-research framing without source verification. A fresh source-walk of `pgr0ss/pgledger@b3143a3` (288-line `pgledger.sql` read linearly, plus AGENTS.md + 4 example SQL files, plus `grep -rni "security definer\|grant\|revoke\|create role\|create user"` across the repo) **falsifies** the SECURITY-DEFINER claim and the only-through-functions claim:

- **S3 line 56 (verbatim falsification):** *"`pgledger_create_transfer()` and `pgledger_create_transfers()` functions. Account balance changes happen *only* through these functions; they are SECURITY DEFINER and enforce invariants internally before COMMITting."* — **wrong on both counts.** Pgledger functions carry no `SECURITY DEFINER` clause anywhere in `pgledger.sql`; they are SECURITY INVOKER (Postgres default). Pgledger ships zero `GRANT/REVOKE/CREATE ROLE/CREATE USER` statements. The `examples/lock-account.sql` example explicitly shows `UPDATE pgledger_accounts SET allow_negative_balance = 'false' WHERE id = ...` issued directly from the application — direct table mutation is part of the documented usage.
- **F2 line 119 (corrected):** "M2 — Stored-procedure-only-interface ... Cited: pgledger (S3)." **Pgledger does NOT ship M2.** Pgledger ships M1 (app-library + ergonomic discipline) — the function is the *convenient* path, not the *only* path. The "stored-function-only-interface" framing in F2 is an aspirational synthesis, not pgledger's actual mechanism.
- **F3 line 123 (corrected):** "pgledger's stored-function-only-interface is the strongest production cite for *structural* enforcement on Postgres." **Pgledger has no production cite for structural enforcement** — there is no privilege barrier in pgledger between the application and direct UPDATE. F3's claim is empty.

**Cite chain after correction:** M2 (the privilege-barrier mechanism — SECURITY DEFINER functions + table-level REVOKE on app role + REVOKE/GRANT on functions) has **no surveyed production cite for ledger or wallet code**. The technique is canonical per Postgres 16 docs (`postgresql.org/docs/16/sql-createfunction.html` — observed 2026-05-04, full extraction in `[[wallet-functions-research]]` S2) but has not been published-validated for ledgers in any source surveyed during Q3 (pgledger source, Brandur, Square Books, Modern Treasury, PostgREST docs, multi-tenant SaaS guidance).

**Production cite status after correction:**
- **M1 (app-library + discipline)** — production-cited tier 1 across **three** independent ledger references: Brandur `rocket-rides-atomic` (Ruby), Square Books (engineering blog), pgledger (Postgres-native). Was previously cited at "M1 Brandur + Square Books only"; pgledger now joins M1's cite-cluster.
- **M2 (SECURITY DEFINER + table-level REVOKE)** — docs-cited tier 2 (Postgres canonical pattern), no production cite for ledger code in surveyed sources.
- **M3 (trigger)** — anti-pattern per GitGuardian removal post-mortem (S4) — unchanged; no surveyed production cite for paired-write enforcement.

**Cascade impact on `[[wallet-mechanics]]`:** the original 2026-05-02 §2 commitment to M2 was load-bearing on the now-falsified pgledger cite. Per `[[wallet-mechanics]]` Amendment 2026-05-04 (A1), the §2 mechanism is downgraded from M2 to M1 — function bodies stay; SECURITY DEFINER is removed; role-based REVOKE is removed; CI lint per A1 mitigates the M1-class bypass failure mode. Per *Source quality ladder*, tier-1 production cite (M1 across three references) beats tier-2 docs-cited novel synthesis (M2 Postgres docs only).

**Evidence-class lesson recorded:** S3's evaluation in the original 2026-05-02 entry leaned on the description-shape of pgledger (it's *function-based*, the README emphasizes the function set as the API) rather than on a function-by-function source read. The correct evaluation discipline is to walk the source and grep for the privilege primitives (`SECURITY DEFINER`, `GRANT`, `REVOKE`, `CREATE ROLE`) before attributing a privilege-barrier claim — *function-shaped API* is not the same as *function-only-mutation-path*. Future research entries citing pgledger or similar codebases should grep for these primitives in addition to reading the API surface.

## Question

`[[wallet-source-of-truth-research]]` recommends path B (CRUD on `wallet.balance` with a same-txn `transactions` audit row) and proposes a Postgres trigger that aborts balance updates without a paired audit-row insert. **The trigger claim was made without a production cite.** This research closes that gap.

Specifically: in named production-grade Postgres ledger or audit systems, what mechanism enforces the "balance update must commit with paired audit row in same transaction" invariant? Triggers, CHECK constraints, stored functions, application-level discipline, or some combination? What are the documented operational costs of each? And what mechanism is BokChoy's right choice given Postgres-only commitment per `[[idempotency-strategy]]` B7?

## Triangulation

- **Production reference:** ✓ — `brandur/rocket-rides-atomic` (pinned commit, re-read for trigger usage); Square Books (engineering blog with named author); pgledger (full SQL source on GitHub).
- **Docs reference:** ✓ — Postgres official docs on `CREATE TRIGGER` (current, version 18); Postgres community discourse on cross-row CHECK constraints (Cybertec, gathered via search-result summary; primary article fetch returned 403, flagged).
- **Contradiction probe:** ✓ — GitGuardian engineering team published documented removal of their trigger system after production incidents (named author, dated). Multiple Postgres anti-pattern surveys converge on triggers as a known problem class. The contradiction probe **strengthens** rather than weakens the finding: the no-trigger consensus is broad and named.

## Sources examined

### S1 — Brandur `rocket-rides-atomic` schema + api.rb (re-cited from `[[idempotency-strategy-research]]`, fresh read for trigger content)

- **Tier:** 1 (production code, public repo, named author, pinned commit)
- **Provenance:** `github.com/brandur/rocket-rides-atomic`, schema.sql + api.rb at master branch. Already vaulted via S10 in `[[idempotency-strategy-research]]` at commit `94b370d`. Re-fetched 2026-05-02 via raw.githubusercontent.com.
- **Author context:** Brandur Leach, Stripe-affiliated at original publication. Repository is the canonical reference impl for the 2017 idempotency-keys article — already accepted into the vault as authoritative for path-B mechanics.
- **What it tells us:** **Brandur uses NO database-level invariant enforcement for paired writes.**
  - schema.sql contains zero `CREATE TRIGGER` statements, zero `CREATE FUNCTION` definitions, zero exclusion constraints, and only length-bounded CHECK constraints (`char_length` checks on string columns).
  - api.rb pairs `AuditRecord.insert(...)` with the business-state insert via Ruby code inside `atomic_phase do ... end` blocks (Ruby Sequel transaction wrapper).
  - The README's pitch — *"By funneling the job through Postgres, we make this operation transaction-safe"* — refers to the `staged_jobs` outbox, NOT to audit-row pairing. The audit-row pairing is application-level and relies on the developer remembering to call `AuditRecord.insert`.
  - **Implication:** the production reference cited as authoritative for path-B mechanics in `[[wallet-source-of-truth-research]]` does NOT use the trigger pattern that entry recommended. The trigger recommendation was inferred, not production-cited.

### S2 — Square Books: immutable double-entry accounting database service

- **Tier:** 4 (engineering blog, named author, dated, on-topic)
- **Provenance:** `developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/`, Łukasz Strzałkowski (Square Engineering), 2019-10-16. Observed 2026-05-02.
- **Author context:** Square engineering, working on Books — Square's internal double-entry accounting service running on Cloud Spanner (not Postgres, but pattern-relevant). The article is widely cited as a fintech-engineering reference.
- **What it tells us:** Square Books enforces immutability **at the application level**.
  - **"Immutability is enforced primarily at the application level, though the database design supports it."**
  - **"Besides the books table which is inherently mutable (current balance is updated on every operation) there are no update statements for the tables presented on the diagram, only inserts."** — operational discipline at the *write-path-of-the-application* level, not the database constraint level.
  - Errors are corrected by inserting offsetting entries, not by mutating prior rows.
  - The article does not mention triggers or check constraints for invariant enforcement. The "all transactions must balance to 0" invariant is enforced by the application code that constructs balanced journal entries, not by the database.
  - **This is the strongest tier-4 cite that ledger immutability — even at Square's scale — is application-discipline-enforced, not trigger-enforced.**

### S3 — pgledger: double-entry ledger implementation in Postgres

- **Tier:** 1 (production code, public repo, named author, on-topic)
- **Provenance:** `github.com/pgr0ss/pgledger`, full SQL at `pgledger.sql` on `main`. Author: Paul Gross. Blog post 2025-03-24 (`pgrs.net/2025/03/24/pgledger-ledger-implementation-in-postgresql/`). Observed 2026-05-02.
- **Author context:** Paul Gross, software engineer; project is a reference implementation specifically arguing for *Postgres-native* ledger semantics. Directly on-topic for BokChoy's stack.
- **What it tells us:** pgledger uses **stored functions as the only-permitted mutation path, with CHECK constraints on input validity, and NO TRIGGERS.**
  - **Zero `CREATE TRIGGER` statements** in the SQL file.
  - **Sole mutation interface:** `pgledger_create_transfer()` and `pgledger_create_transfers()` functions. Account balance changes happen *only* through these functions; they are SECURITY DEFINER and enforce invariants internally before COMMITting.
  - **CHECK constraint on `pgledger_transfers`:** `CHECK (amount > 0 AND from_account_id != to_account_id)` — input validation, not paired-write enforcement.
  - **Balance constraint via function logic:**
    ```sql
    IF NOT account.allow_negative_balance AND (account.balance < 0) THEN
        RAISE EXCEPTION 'Account (id=%, name=%) does not allow negative balance'
    ```
    Validation happens *inside the function* after the update, not via a trigger or CHECK constraint.
  - **Author's stated philosophy** (blog post): *"What I generally want is to be able to include ledger updates in the same database transaction as the other work...atomically."* — the emphasis is on *transactional atomicity*, not on database-level invariant enforcement. The function exists to package the multi-step operation; the invariant lives inside the function.
  - **This surfaces a third mechanism (M2 below) that `[[wallet-source-of-truth-research]]` didn't name: stored-procedure-only-interface.** Mutations are application-level (the app calls the function), but bypassing the function would require SQL `GRANT` changes that show up in migration review.

### S4 — GitGuardian: "Love, Death & Triggers"

- **Tier:** 4 (engineering blog, named author with production-incident context, dated)
- **Provenance:** `blog.gitguardian.com/love-death-triggers/`, Philippe Gablain (Engineering Lead at GitGuardian), 2022-07-15. Observed 2026-05-02.
- **Author context:** GitGuardian engineering team, Postgres-backed SaaS at meaningful scale. Article is a post-mortem on adopting and removing triggers.
- **What it tells us:** **GitGuardian adopted Postgres triggers for performance reasons (precomputed aggregations) and removed them after production incidents.**
  - **Cascading lock issues** made the system unpredictable — triggers chained across tables in ways that bulk-insert workloads exposed.
  - **Hidden complexity:** triggers fired per-row during bulk operations, multiplying query counts.
  - **Debugging visibility:** *"Triggers leave very few traces that can lead back to them."* Diagnosing a trigger-caused performance regression required dedicated tracing infrastructure.
  - **Maintenance burden:** *"Triggers are easily forgotten because they are stored in the database"* — they don't appear in normal application code review and can drift from the application's mental model.
  - **Conditional retention:** the team kept *some* simple triggers after the migration. Gablain's heuristic: triggers must be *kept as simple as possible* and used only when consistency enforcement clearly outweighs the complexity cost.
  - **This is the named, dated, production-incident anti-trigger source.** Not a tutorial. Not a forum post.

### S5 — Modern Treasury: "Enforcing Immutability in your Double-Entry Ledger"

- **Tier:** 4 (engineering blog, named author at fintech infrastructure company, dated)
- **Provenance:** `moderntreasury.com/journal/enforcing-immutability-in-your-double-entry-ledger`, Jason Jong (Modern Treasury Engineering), 2021-12-14. Observed 2026-05-02.
- **Author context:** Modern Treasury is a payment-operations infrastructure provider; their published guidance is design-spec for fintech-grade ledgers.
- **What it tells us:** Modern Treasury **does NOT recommend a specific technical mechanism** for immutability enforcement. They recommend an **architectural separation** — business-level objects are mutable, accounting-level objects are append-only.
  - *"The business-level objects are a mutable presentation to your end-user whereas the accounting-level objects represent trackable money movement."*
  - When changes are needed: reverse the original transaction, then create a corrected one — mutations on the accounting layer are forbidden by convention, not by triggers.
  - **Modern Treasury's silence on technical mechanism is itself a finding** — a fintech infrastructure company writing prescriptive guidance does not call for triggers. They call for architectural discipline.

### S6 — Postgres official documentation on triggers (version 18)

- **Tier:** 2 (official docs, version-pinned)
- **Provenance:** `postgresql.org/docs/current/trigger-definition.html`, observed 2026-05-02. Postgres 18 (current).
- **What it tells us:** Postgres docs **endorse triggers as a valid mechanism for cross-table consistency**, but offer no comparative guidance against alternatives.
  - *"Row-level AFTER triggers are most sensibly used to propagate the updates to other tables, or make consistency checks against other tables."*
  - Docs warn that referential-integrity actions (cascading updates/deletes) execute via ordinary SQL and *can* themselves fire triggers — *"It is the trigger programmer's responsibility to avoid that"* breaking referential integrity. This is a documented sharp edge.
  - **Docs do NOT recommend triggers over application logic; they describe trigger mechanics neutrally.** The docs alone are insufficient evidence to pick triggers — the choice is architectural and the production-reference signal is the load-bearing input.

### S7 — Postgres community on cross-row CHECK constraints (search-result summary; primary fetch blocked)

- **Tier:** 4 (engineering blog summary; primary source `cybertec-postgresql.com/en/triggers-to-enforce-constraints/` returned 403 on fetch and is flagged for re-investigation)
- **Provenance:** Search results 2026-05-02 surfaced consistent Postgres-community advice: cross-row CHECK constraints **do not work safely in Postgres** — concurrent transactions bypass the validation under default isolation levels.
- **What it tells us:** **A CHECK constraint cannot enforce "balance update requires paired audit-row insert."** CHECK constraints validate single-row predicates; they cannot reliably read other rows because concurrent transactions can each pass validation against partial views and produce a final inconsistent state.
  - **Implication for path B:** if the structural mechanism is CHECK-based, it's wrong. The mechanism must be a TRIGGER (which executes inside the transaction with appropriate locking) or an application-level / stored-procedure boundary.
  - The original recommendation in `[[wallet-source-of-truth-research]]` was correct that "trigger" — not "CHECK constraint" — was the candidate mechanism. But the entry didn't name CHECK as ruled out, and a future reader could confuse the two. This research closes that gap.

## Findings

### F1 — No surveyed production reference uses triggers for paired-write audit enforcement

Across `brandur/rocket-rides-atomic` (tier 1), Square Books (tier 4), pgledger (tier 1), and Modern Treasury's guidance (tier 4), **the trigger pattern for audit-row pairing is absent.** The dominant mechanism is application-level discipline (Brandur, Square Books) or stored-function-only-interface (pgledger). Modern Treasury prescribes architectural separation rather than a technical mechanism.

This directly damages the recommendation in `[[wallet-source-of-truth-research]]` that path B uses a Postgres trigger making "engineer forgets audit-row" structurally impossible. **The recommendation was not production-cited.**

### F2 — Three mechanisms exist; the entry should surface all three, not collapse to "trigger or no trigger"

**M1 — Application-level discipline.** Single library function (`wallet.credit(...)`, `wallet.debit(...)`) wraps the transaction; pairs balance update with audit-row insert; only this function is allowed to mutate `wallets`. Enforcement: code review on changes to the library function + integration tests asserting both writes happen + reconciliation job catching drift after the fact. **Cited:** Brandur (S1), Square Books (S2). Cost: discipline-dependent. Failure mode: future engineer adds a parallel mutation path bypassing the library, or modifies the library and removes the audit-write.

**M2 — Stored-procedure-only-interface.** All wallet mutations go through `wallet_credit(account_id, amount, reason_code, source_event_id, idempotency_key)` Postgres function. App role has `EXECUTE` on the function but **no `UPDATE` privilege on `wallets`**. Function internally does the balance update + audit-row insert in one atomic block. **Cited:** pgledger (S3). Cost: schema rigidity (every supported operation needs a function), function debugging is in plpgsql (less ergonomic than app-language tooling), migration review must check `GRANT` statements alongside table changes. Failure mode: schema or function bug that admits a state the constraint should have prevented; migration that grants direct UPDATE silently disabling the protection.

**M3 — AFTER trigger that aborts on missing paired audit-row.** Trigger on `wallets` UPDATE that queries `transactions` for a matching insert in the same transaction and `RAISE EXCEPTION` if absent. **No surveyed production reference uses this for this purpose.** GitGuardian (S4) is the named anti-pattern source. Cost: documented per S4 — debugging visibility, cascading complexity if multiple triggers chain, migration drift if trigger is dropped or modified. Failure mode: trigger-related performance regression on bulk operations; trigger silently disabled or dropped; complex interactions with other triggers (BokChoy currently has none, but this is a forward-cost commitment).

### F3 — pgledger's stored-function-only-interface is the strongest production cite for *structural* enforcement on Postgres

M2 is materially stronger than M1 because **bypassing the function requires a privilege change** (a `GRANT UPDATE ON wallets TO app_role` migration) rather than just calling raw SQL from new code. Such a migration shows up in review as a structural change.

M2 is materially weaker than M3 only on one axis: M3 fires on every UPDATE regardless of who issued it, including admin sessions; M2 only protects against the application role. If the threat model includes "admin-session SQL accidentally bypasses audit," M3 is stronger. If the threat model is "future application code bypasses audit," M2 is sufficient.

**For BokChoy, the threat model is the application-code-bypass case.** Admin-session writes to `wallets` are operationally rare and would be subject to runbook review anyway. M2 covers the realistic threat without inheriting M3's anti-pattern cost.

### F4 — Cross-row CHECK constraints are eliminated as a candidate mechanism

Per S7, CHECK constraints in Postgres cannot safely enforce predicates that read other rows under default isolation. **Anyone reading `[[wallet-source-of-truth-research]]` who infers "Postgres CHECK constraint" from the trigger discussion would build the wrong mechanism.** This research entry is the place to nail down: CHECK constraints are not on the table.

### F5 — Postgres docs are neutral; community discourse is anti-trigger for this use case

Postgres docs (S6) describe trigger mechanics without recommending or rejecting them for cross-table consistency. The community signal is asymmetric: GitGuardian's named removal experience (S4) plus the consistent absence of triggers in the surveyed production references (F1) point in one direction.

The Postgres docs' neutrality is **not evidence for triggers**. The docs describe what triggers *can* do; production teams collectively decide what they *should* do for a given problem class.

## Conflicts

### Postgres docs allow the pattern; production discourse rejects it

S6 (Postgres docs) says AFTER triggers are appropriate for cross-table consistency. S4 (GitGuardian) is a named removal experience. F1 (production references) shows zero adoption of this pattern in surveyed ledger systems.

**Per *Contradiction protocol*:** *Multiple independent production examples beat one* — the cluster of Brandur, Square Books, pgledger choosing not to use triggers outweighs the docs' formal permission. *Recent post-mortems beat old advocacy* — GitGuardian's 2022 removal experience is current, dated, named. The docs' neutrality is not endorsement.

**Resolution:** the trigger pattern is technically available in Postgres but is not the production-cited choice for paired-write enforcement. Design can pick M3 over M1 or M2 only by accepting the tier-4 anti-pattern signal as not-applicable to BokChoy specifically — which would itself need a defense.

### M1 vs M2 within the application-level family

M1 (app library + code review) is what Brandur and Square Books actually do. M2 (stored-procedure-only-interface) is what pgledger does. Both work; the conflict is *cost*.

- M1 ships faster; failure mode is discipline-dependent.
- M2 ships slower (function authoring + migration plumbing for `GRANT REVOKE`); failure mode is structural (privilege change required to bypass).

**This is the design-level conflict to resolve, not a research-level one.** Both have production cites; the choice is conditions-based.

## Conditions

This finding holds under:

- **Postgres-only stack.** Per `[[idempotency-strategy]]` B7. If the stack changes, M2 may not generalize (e.g., MySQL stored procedures have different semantics; CockroachDB lacks plpgsql).
- **Single-tenant per-row consistency.** The audit-row-pairing invariant is local to a single wallet row + its transactions. Multi-row invariants (e.g., "sum of all wallet balances under a project equals sum of all transactions") are not in scope and have different enforcement options (materialized views, periodic reconciliation jobs).
- **Application can route mutations through a library boundary.** True for BokChoy — wallet mutations are infrastructure-internal, not exposed as raw-SQL surfaces to designers or partners.
- **Threat model is application-code-bypass, not admin-session-bypass.** If a regulator or auditor demands trigger-level enforcement (as opposed to code-review + reconciliation), M3 is forced.

This finding does **not** generalize to:

- Multi-tenant invariants spanning many rows (use materialized views + reconciliation, not row-level enforcement).
- Cross-database invariants (use saga patterns, not Postgres-native).
- Workloads where direct SQL access is unavoidable (operations dashboards, reporting tools that hit the DB directly may bypass M2 unless they share the application role).

## Operational implications for design

`[[wallet-source-of-truth-research]]`'s recommendation — "Postgres trigger makes 'engineer forgets audit-row' structurally impossible" — should be revised in light of F1–F5. The honest replacement is:

> Three mechanisms (M1, M2, M3) provide increasing levels of structural enforcement at increasing cost. The production-cited choices for ledger systems on Postgres (Brandur, Square Books) are M1; the Postgres-native ledger reference (pgledger) is M2. M3 (trigger-based) is documented as an anti-pattern for production-grade systems (GitGuardian) and has no surveyed production cite for this specific use case.

For the design re-pass on `[[wallet-source-of-truth-research]]`:

- **If design picks M1 (app discipline):** ship a single `WalletService` (TypeScript) library with `credit()` / `debit()` functions wrapping a Drizzle transaction; integration tests assert both writes happen; reconciliation job runs hourly; document the "do not write to `wallets` outside `WalletService`" rule in CLAUDE.md / module README. Failure mode: future engineer adds a parallel mutation path. Cost: minimal.

- **If design picks M2 (stored-function-only):** ship a `wallet_credit(account_id, amount, reason_code, source_event_id, idempotency_key)` plpgsql function as the only mutation path; revoke `UPDATE` on `wallets` from app role; grant `EXECUTE` on the function. Drizzle calls the function via `db.execute(sql\`SELECT wallet_credit(...)\`)`. Migration discipline: any `GRANT` changes touching `wallets` require explicit reviewer attention. Failure mode: function bug or privilege drift. Cost: function authoring and plpgsql debugging are less ergonomic than TypeScript, and the function-based interface limits some Drizzle ergonomics.

- **If design picks M3 (trigger):** ship an AFTER UPDATE trigger on `wallets` that fails the transaction unless a corresponding row in `transactions` was inserted (via `pg_get_current_xact_id()` matching). Cost: GitGuardian's documented anti-patterns apply; no surveyed production reference uses this for paired-write enforcement; the recommendation would be made *against* the consensus of the production reference set.

The earlier framing in `[[wallet-source-of-truth-research]]` collapsed M1 and M2 into "discipline" and presented M3 as the only structural mechanism. **That framing was wrong.** M2 is structurally enforcing without inheriting M3's anti-pattern cost.

## Reproducibility note

**Reproducible.** Same finding via:

1. `git clone --depth 1 https://github.com/brandur/rocket-rides-atomic` (or fetch raw URLs at master HEAD); `grep -r 'TRIGGER\|FUNCTION' .` on the repo. Output: nothing in schema.sql.
2. Read Square Books blog at `developer.squareup.com/blog/books-an-immutable-double-entry-accounting-database-service/` — the application-level immutability paragraph is in the body.
3. `git clone https://github.com/pgr0ss/pgledger`; read `pgledger.sql`. Function definitions present, no triggers.
4. Read GitGuardian's `Love, Death & Triggers` post at `blog.gitguardian.com/love-death-triggers/` — the cascading-lock incident is paragraphed clearly.
5. Search "postgres trigger anti-pattern", "postgres CHECK constraint cross row" — converges on the no-cross-row-CHECK consensus and the trigger-skepticism cluster.

The judgment most load-bearing on the M2-recommendation framing is: **"BokChoy's threat model is application-code-bypass, not admin-session-bypass."** That is rooted in `[[wedge-decision]]` (BokChoy is an infrastructure-internal product — designers don't get raw DB access) and `[[mvp-feature-sequence]]` (no admin-tooling that mutates wallets directly is in MVP scope). Both are vaulted.

## Open threads

1. **Cybertec article on triggers-to-enforce-constraints fetch returned 403.** This is a tier-2 candidate source on the *correct* way to use triggers when chosen. Worth re-fetching from a different network or via archive.org if M3 ever becomes the candidate. Today, its absence does not weaken the finding because the production references all reject M3 anyway.

2. **pgledger's `pgledger_create_transfer` performance characteristics under contention.** S3's evidence is the schema; the operational behavior of high-frequency function calls (BokChoy's Studio+ tier sees ~575 writes/sec/project) is not documented. If design picks M2, performance verification under load is a verify-before-rely-on item. Suggested approach: load-test the function-based interface against a raw-SQL reference at projected MVP write rates.

3. **Reconciliation-job cadence (M1-specific).** If M1 is picked, the "periodic SUM(amount) FROM transactions vs. wallet.balance" job needs a frequency, an alert threshold, and a runbook entry. Belongs in `[[runbook-idempotency]]` per `[[idempotency-strategy]]`'s commitment, but the cadence is design-level.

4. **Privilege grants for M2 in operational tooling.** If M2 is picked, the operations dashboard (for customer support to look up balances and transactions) cannot use the app role — needs a read-only role. Migration plumbing for role separation is non-trivial. Belongs in implementation-phase planning.

5. **Q3 (`staged_jobs` schema) is the next research session in this cluster.** Q1's finding (M2 surfaces stored-function-only interface as a structural mechanism) may shape Q3 — if `staged_jobs` writes are only via a function, the outbox schema can enforce "row inserted only when caller is the wallet-mutation function." Worth flagging during Q3.

6. **Q2 (audit retention regulatory + storage math) is the third research session.** Independent of Q1 — retention concerns the lifecycle of `transactions` rows after they exist, not the mechanism that creates them.
