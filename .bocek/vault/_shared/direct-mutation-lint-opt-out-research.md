---
type: research
features: [_shared, wallet, architecture]
related: ["[[wallet-mechanics]]", "[[reaper-schedule-deferral]]", "[[wallet-http-contract]]", "[[gaps]]"]
created: 2026-05-10
confidence: high
provisional: false
---

# How do production TS lint tools and Drizzle codebases express per-statement opt-out for protected-table mutations inside multi-line `sql\`...\`` templates?

## Question

GAP 10 (`[[gaps]]`) blocked slice 8.1b on a lint-script gap: `scripts/check-direct-wallet-mutation.ts` requires the `// allow-direct-mutation:` opt-out comment on the **same line** as the SQL keyword, but the on-disk middleware code at `apps/backend/src/idempotency/middleware.ts:139,175,230` puts the SQL keyword inside a multi-line `sql\`...\`` template literal where TS `//` comments cannot live (string-content, not TS-context).

The /design seat picked **(a) K=2 lookback** (widen the lint to honor opt-outs on the SQL line OR either of the 2 immediately preceding lines), citing "TS-ecosystem convention via `// biome-ignore-next-line` / `// eslint-disable-next-line` / `// @ts-expect-error`." Those labels were inferred from training data, not verified against current docs. This research session investigates:

- **Q1** — What ARE the actual production conventions for per-statement and region suppression in current TS lint tools (Biome 2.x, ESLint, TypeScript)? Specifically: how many lines back do they look? Do any ship K>1 lookback as a primary directive?
- **Q2** — Is multi-line `sql\`INSERT/UPDATE/DELETE\`` actually the Drizzle production norm? Or do Drizzle codebases reach for the query builder (`db.insert(table).values({...})`) by default?
- **Q3** — Is there off-the-shelf prior art for "protected-table direct-mutation lint" with multi-line opt-out semantics (RLS + stored-function-only discipline)? If yes, what shape does it use?

## Triangulation

- **Production reference:** ✓ — `better-auth/better-auth` (current main branch via GitHub code search, observed 2026-05-10) for Drizzle/Kysely `sql\`...\`` usage patterns. Q1 contradiction probe via GitHub `gh search code 'sql\`\\nINSERT INTO'` returned 0 results across all public TS code — **negative result is itself a finding**.
- **Docs reference:** ✓ — Biome 2.x suppressions docs (`https://biomejs.dev/analyzer/suppressions/`, current 2026-Q2). ESLint configure-rules docs (`https://eslint.org/docs/latest/use/configure/rules`, current 2026-Q2). TypeScript handbook on `@ts-expect-error` (release notes / handbook current 2026-Q2). Drizzle ORM official docs on `sql` template (`https://orm.drizzle.team/docs/sql`, current 2026-Q2).
- **Contradiction probe:** ✓ — actively searched for production lints using K>1 lookback (`"eslint custom rule lookback multiple lines preceding comment"`). None surfaced as a *primary directive* in stock lint tools. ESLint custom-rule API (`sourceCode.getCommentsBefore` / `sourceCode.lines[]`) supports building K>1 lookback, but no production lint ships it as a built-in directive. Searched for off-the-shelf protected-table-mutation lint plugins — none surfaced; only generic mutation-prevention plugins (`eslint-plugin-immutable`, `eslint-plugin-functional`, `eslint-plugin-better-mutation`) which target JS variable mutation, not DB tables. *No credible disagreement found.*

## Sources examined

### Source 1 — Biome 2.x suppressions docs

- **Tier:** 2 (official docs, current)
- **Provenance:** `https://biomejs.dev/analyzer/suppressions/`, observed 2026-05-10. Page references Biome v2 syntax (post-v1→v2 breaking change explicitly noted: `// biome-ignore lint/<GROUP>/<RULE>: <reason>` format).
- **Author context:** Biome official documentation, maintained by the Biome core team.
- **What it tells us:** Biome v2 ships **THREE** suppression shapes:
  1. **Next-line:** `// biome-ignore lint/<GROUP>/<RULE>: <reason>` — *"They disable a lint rule for the next line of code."* (N=1 lookback semantics, encoded as "comment on line N covers code on line N+1").
  2. **File-wide:** `// biome-ignore-all lint/<GROUP>/<RULE>: <reason>` — *"They must be placed at the top of the file."* Outside-the-top placement → emits `suppression/unused` diagnostic.
  3. **Range:** `// biome-ignore-start lint/<GROUP>/<RULE>: <reason>` ... `// biome-ignore-end lint/<GROUP>/<RULE>: <reason>` — *"Range suppressions must have a matching `biome-ignore-end` suppression."* Ranges may overlap with multiple nested ranges functioning simultaneously.

### Source 2 — ESLint configure-rules docs

- **Tier:** 2 (official docs, current)
- **Provenance:** `https://eslint.org/docs/latest/use/configure/rules`, observed 2026-05-10.
- **Author context:** ESLint official documentation, maintained by the ESLint core team and OpenJS Foundation.
- **What it tells us:** ESLint ships parallel suppression shapes:
  1. **Next-line:** `// eslint-disable-next-line <rule>` — disables the **following line**.
  2. **Same-line:** `// eslint-disable-line <rule>` — disables the **current line**.
  3. **Block range:** `/* eslint-disable <rule> */` ... `/* eslint-enable <rule> */` — well-documented as the canonical way to suppress a region across multiple statements.
  ESLint also accepts a description suffix via `--`: `// eslint-disable-next-line no-console -- Here's why this is necessary.`

### Source 3 — TypeScript handbook on `@ts-expect-error`

- **Tier:** 2 (official docs, current)
- **Provenance:** TypeScript 3.9 release notes (`https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html`) + handbook references on error-suppression directives.
- **Author context:** TypeScript core team / Microsoft.
- **What it tells us:** TypeScript ships ONE suppression shape relevant to lint-style ignore comments:
  1. **Next-line:** `// @ts-expect-error` (or `// @ts-ignore`) on the **immediately preceding line** of the suppressed code. *"if there's no error, TypeScript will report that // @ts-expect-error wasn't necessary"* — N=1 lookback semantics, with an unused-suppression diagnostic.
  TypeScript does NOT ship a stock range/region directive for ignoring multi-line code; only file-level via `// @ts-nocheck`.

### Source 4 — Better Auth (`better-auth/better-auth`) `sql\`` usage patterns

- **Tier:** 1 (production code, current)
- **Provenance:** `gh search code --repo better-auth/better-auth 'sql\`'` against public main branch, observed 2026-05-10. 9 file matches surveyed across `packages/cli/`, `packages/kysely-adapter/`, `packages/drizzle-adapter/`, `packages/better-auth/src/db/`, `e2e/integration/vanilla-node/`.
- **Author context:** Better Auth core team. TS-native auth library; cited as a primary reference impl in `[[backend-stack]]`.
- **What it tells us:** `sql\`` usage in production Better Auth is **dominated by inline single-line expressions** — `sql\`LAST_INSERT_ID()\``, `sql\`datetime2(3)\``, `sql\`integer GENERATED BY DEFAULT AS IDENTITY\``, `sql\`${sql.ref(...)} ILIKE ${pattern}\``. The single multi-line `sql\`SELECT ...\`` instance lives in **e2e test code** (`e2e/integration/vanilla-node/e2e/postgres-js.spec.ts` introspecting `information_schema.tables`), NOT in production middleware.
  Production INSERT/UPDATE/DELETE in Better Auth go through Drizzle's query builder (`db.insert(table).values({...})`) or Kysely's equivalent — NOT through raw multi-line `sql\`INSERT INTO ...\``.

### Source 5 — Drizzle ORM official `sql` docs

- **Tier:** 2 (official docs, current)
- **Provenance:** `https://orm.drizzle.team/docs/sql`, observed 2026-05-10.
- **Author context:** Drizzle Team official documentation.
- **What it tells us:** The canonical Drizzle pattern is the query builder — `db.insert(table).values({...})`, `db.update(table).set({...})`, `db.delete(table).where(...)`. The `sql` template tag is documented as Drizzle's **escape hatch for complex queries** ("provides escape hatches for complex queries while maintaining protection against SQL injection") — not the primary path for INSERT/UPDATE/DELETE. Common multi-line `sql\`` usage is for partial SELECT statements, WHERE clauses, ORDER BY clauses, and `sql.join()` chunk composition.

### Source 6 — GitHub code-search for `sql\`\nINSERT INTO` across public TS

- **Tier:** 1 (negative production result)
- **Provenance:** `gh search code 'sql\`\\nINSERT INTO' --extension ts --limit 8`, observed 2026-05-10.
- **Author context:** Aggregated GitHub TS public code, no single author.
- **What it tells us:** **Zero results.** No public TS file surfaced via this query has a `sql\`` followed immediately by a newline + `INSERT INTO`. The pattern that BokChoy's middleware uses (multi-line `sql\`...\`` wrapping an INSERT keyword on the next line) does not appear at scale in public code. This is consistent with Source 5 (Drizzle docs) and Source 4 (Better Auth) — production Drizzle INSERT goes through the query builder, not multi-line raw SQL.

### Source 7 — `pgrls` Python tool

- **Tier:** 4 (engineering tool, named maintainer, recent)
- **Provenance:** `https://pypi.org/project/pgrls/0.3.0/`, observed 2026-05-10. Framework-agnostic Postgres RLS linter; classifies RLS changes as SAFE / BREAKING / REQUIRES_REVIEW / DANGEROUS.
- **Author context:** Single-author Python tool, focuses on Postgres RLS policy correctness (lints the SQL migrations, not TS source).
- **What it tells us:** **Adjacent prior art**, not a direct fit. `pgrls` lints RLS policies at the Postgres layer — checks for `FORCE ROW LEVEL SECURITY`, policy USING/CHECK shape, escalation paths. Does NOT check TS source code for direct-mutation patterns. BokChoy's `check-direct-wallet-mutation.ts` operates at a different layer (TS source patterns) and remains bespoke.

### Source 8 — ESLint `sourceCode.getCommentsBefore()` API

- **Tier:** 2 (official docs, current)
- **Provenance:** ESLint custom-rules docs (`https://eslint.org/docs/latest/extend/custom-rules`) + `sourceCode` Node API references, observed 2026-05-10.
- **Author context:** ESLint core team.
- **What it tells us:** ESLint custom rules CAN access `sourceCode.getCommentsBefore(node)` and `sourceCode.lines[]` to look back arbitrary distances from a node. So K>1 lookback is *implementable* in a custom rule. But — **no production lint plugin or stock directive surfaces this as a primary suppression mechanism**. It's a capability, not a published convention.

### Source 9 — npm registry survey for protected-table-mutation lints

- **Tier:** 1 (production code negative result) + 4 (related plugins)
- **Provenance:** WebSearch `"custom eslint rule prevent direct database mutation table allowlist typescript"`, observed 2026-05-10. Surfaced: `eslint-plugin-immutable` (target: JS variable mutation), `eslint-plugin-functional`, `eslint-plugin-better-mutation`, `eslint-plugin-fp/no-mutation`, Convex ESLint plugin.
- **Author context:** Various OSS maintainers. None operate on database-table mutation patterns specifically.
- **What it tells us:** **No off-the-shelf "RLS-protected-table + stored-function-only discipline" lint plugin exists.** Generic mutation-prevention plugins target JavaScript variable / array / object mutation (functional-programming concerns), not database access patterns. The Convex ESLint plugin is closest in spirit — gates database access — but Convex has its own runtime, not raw Drizzle/Postgres. **BokChoy's `check-direct-wallet-mutation.ts` is bespoke; no convention to inherit from.**

## Findings

### F1 — TS-ecosystem suppression conventions are N=1 next-line OR explicit range markers

**Production-cited × 3 (Biome v2.x, ESLint, TS handbook):** All three current TS lint/typecheck tools converge on two suppression shapes:
- **N=1 next-line:** comment on line N applies to the immediately following statement on line N+1. Biome `// biome-ignore`, ESLint `// eslint-disable-next-line`, TS `// @ts-expect-error`.
- **Range markers:** Biome `// biome-ignore-start` ... `// biome-ignore-end`, ESLint `/* eslint-disable */` ... `/* eslint-enable */`. Wraps a region; rule-specific.

**No tool ships K>1 lookback as a built-in directive.** ESLint's custom-rule API (Source 8) makes K>1 lookback *implementable*, but no published plugin or stock directive surfaces it as a primary suppression mechanism.

(Confidence: **high**. Three tier-2 official docs, all current, all consistent.)

### F2 — Drizzle production norm for INSERT/UPDATE/DELETE is the query builder, not multi-line `sql\`...\``

**Production-cited × 1 (Better Auth) + docs-cited × 1 (Drizzle official) + negative-result × 1 (GitHub code search):** Drizzle's canonical INSERT/UPDATE/DELETE path is the query builder (`db.insert(table).values({...})` etc.). The `sql\`` template tag is documented as an *escape hatch for complex queries*; production usage of `sql\`` is overwhelmingly inline single-line for SELECT fragments, type casts, default expressions, and ILIKE/LOWER comparisons.

Multi-line `sql\`INSERT INTO ...\`` for production middleware mutations does not surface in the codebases surveyed. The pattern BokChoy's middleware uses is unusual relative to Drizzle ecosystem norms.

(Confidence: **medium**. Sample size limited to Better Auth full-survey + Drizzle docs + GitHub code-search negative; would benefit from 1-2 additional production codebases for higher confidence.)

### F3 — No off-the-shelf prior art for protected-table direct-mutation lint with stored-function-only discipline

**Production-cited via negative result × 2 (npm registry survey + GitHub code search):** No published ESLint plugin, Biome rule, or custom-CI script targets the "RLS-protected table + mutation-via-stored-function-only" discipline. Adjacent tools exist (`pgrls` for Postgres RLS policy linting, `eslint-plugin-immutable` for JS variable mutation, Convex ESLint plugin for Convex-runtime DB access) but none cover BokChoy's exact shape.

BokChoy's `scripts/check-direct-wallet-mutation.ts` is bespoke. Conventions for opt-out shape have to be picked from analogous lint-comment ecosystems (F1), not inherited from a domain-specific plugin.

(Confidence: **high** for the negative result. Two independent search channels both returned no matches.)

## Conflicts

### Conflict 1 — F1 evidence vs. /design's K=2 pick

`[[gaps]]` GAP 10's /design seat picked **(a) K=2 lookback** ("comment on line N covers code within N+1 to N+K"), citing "TS-ecosystem convention." Per F1, this convention does not exist in stock lint tools — Biome / ESLint / TS all use N=1 next-line OR explicit range markers, not K>1 lookback.

Per *Contradiction protocol* (current docs > training-data inference): F1 wins. **The /design pick was inferred, not cited.**

### Conflict 2 — On-disk middleware uses raw `sql\`INSERT INTO\`` vs. Drizzle ecosystem norm

Per F2, Drizzle production code routes INSERT/UPDATE/DELETE through the query builder. The on-disk `apps/backend/src/idempotency/middleware.ts` uses raw multi-line `sql\`INSERT INTO idempotency_keys ...\`` (lines 138-144, 174-182, 229-235). This is not falsified by the lint mechanism question — both raw `sql\`` and `tx.insert(table).values()` would trigger the lint per the regex (`SQL_RE` matches both forms; `DRIZZLE_RE` also matches `.insert(table)`). But it surfaces a *secondary design question* the /design seat may want to consider: should the middleware use the Drizzle query builder for code-level idiom alignment?

Per *Contradiction protocol*: **not artificially resolved.** This is a separable design question downstream of the lint-mechanism pick. F2 informs design but doesn't force a choice.

## Conditions

- **F1 holds while** the project's lint/typecheck stack is Biome (currently catalog-pinned `@biomejs/biome ^2.0.0`) + TypeScript (`^6.0.0`). If the project switches to ESLint as the primary lint tool (currently Biome is the lint), the same conventions apply — N=1 + ranges. If the project adopts a non-mainstream lint tool, F1 may not generalize.
- **F2 holds while** the project uses Drizzle (currently catalog-pinned `drizzle-orm 0.45.2`). If the project migrates to a different ORM (Prisma, Kysely standalone), the multi-line vs. query-builder analysis would need re-doing for that ORM's conventions. Kysely also has a query builder + raw SQL pattern, so the analysis likely transfers; Prisma's API is different and would need its own probe.
- **F3 holds while** there's no published TS-ecosystem plugin specifically for "RLS-protected-table direct-mutation prevention." If such a plugin appears (none on the horizon per Q3 search), the BokChoy lint script could potentially migrate; for now it stays bespoke.

## Operational implications

For the /design pushback in `[[gaps]]` GAP 10, two viable shapes survive Q1's evidence:

### (α) Range markers — `// allow-direct-mutation-start: <reason>` ... `// allow-direct-mutation-end`

**Production-cited × 2** (Biome v2.x, ESLint). Industry-standard convention for region suppression. Wraps the entire `await tx.execute(sql\`...\`)` call (or any contiguous block of protected mutations) between explicit start/end markers.

**Pros:**
- Strongest production-cited evidence (matches Biome + ESLint published directives).
- Reviewer signal is unambiguous — start and end markers are visually unmistakable.
- Handles multi-statement blocks naturally (one marker pair covers any number of mutations within).

**Cons:**
- Verbose for single-statement cases (3 lines: start, statement, end vs. 2 lines: comment, statement).
- Loses per-statement granularity within a range — multiple SQL statements within markers all get suppressed. (Mitigation: code review is the granularity check; reviewer reads what's between the markers and decides if all of it is justified.)

### (β) N=1 lookback + accept `--` SQL comments alongside `//`

**Industry-cited × 3 (N=1 convention) + script extension (regex addition for `--`):** N=1 next-line is the most-familiar convention (Biome, ESLint, TS all converge here). The `--` recognition is a small script extension allowing the opt-out comment to live INSIDE the `sql\`...\`` template literal as a Postgres `--` comment, on the line immediately preceding the SQL keyword.

**Pros:**
- N=1 is the most-instinctive convention TS engineers reach for.
- Per-statement granularity preserved.
- Comment lives proximate to the SQL keyword (1 line above), maximizing reviewer signal.
- Postgres `--` is a valid SQL comment, so the SQL still executes correctly.

**Cons:**
- Mixes TS comment style (`//`) and SQL comment style (`--`) in one lint asset; introduces dual-format awareness.
- The `--` opt-out comment lives inside the template literal, which may be aesthetically jarring — the script reads it as TS source-text but its semantic role is opt-out for the lint, not SQL behavior.

### Falsified — (a) K=2 lookback (the original /design pick)

No production lint tool surveyed ships K>1 lookback as a primary directive. Adopting K=2 would invent a convention BokChoy holds alone. Per *Production-grade default* (industry-standard, ≥2 named systems), K=2 fails the gate. **Drop from candidate set.**

### Secondary design question (F2)

Should the on-disk middleware's `await tx.execute(sql\`INSERT INTO ...\`)` be rewritten to `await tx.insert(idempotencyKeys).values({...})`? F2 evidence says the query builder is the Drizzle production norm. The lint-mechanism question is independent (the lint regex catches both forms), but the idiom question is a separable item /design may want to flag as a follow-on.

### Recommendation for /design

The two viable shapes (α range markers, β N=1 + `--`) are both production-cited. The /design seat should pick between them on:
- **Per-statement vs. per-region granularity preference** (β preserves; α loses).
- **Verbosity tolerance** (α adds 2 lines per single-statement; β adds 1).
- **Comment-style purity** (β mixes `//` and `--`; α stays TS-only).

Both are vault-ready. Both pass *Production-grade default* (industry-standard via Biome/ESLint convention).

## Reproducibility note

**Reproducible.** Another investigator with the same question and similar tools (WebFetch, gh search code, web search) would reach substantially the same finding:

1. WebFetch `https://biomejs.dev/analyzer/suppressions/` for Biome's three suppression shapes.
2. WebSearch `eslint-disable-next-line` on `eslint.org` for the next-line vs. block-range docs.
3. WebSearch `@ts-expect-error placement` on `typescriptlang.org` for TS handbook on N=1 lookback.
4. `gh search code --repo better-auth/better-auth 'sql\`'` for Drizzle ecosystem `sql\`` usage patterns.
5. `gh search code 'sql\`\\nINSERT INTO' --extension ts --limit 8` for the multi-line INSERT pattern's frequency in public TS code.
6. WebSearch `"custom eslint rule prevent direct database mutation"` for prior-art probe.

The judgment that's **not fully reproducible** is the F2 confidence level — sample size was Better Auth + Drizzle docs + a GitHub code-search negative. A second investigator with budget for 2-3 more Drizzle codebases (e.g., drizzle-team/drizzle-orm internal usage, public Drizzle apps surfaced via gh search) might raise F2 from medium to high. The findings *direction* would not change; the *confidence* might.

## Open threads

- **Drizzle multi-line `sql\`` survey at higher sample size.** F2 sample is medium-confidence. A future research session could clone `drizzle-team/drizzle-orm` (the ORM repo itself) + 2-3 public Drizzle apps surfaced via gh search to either ratify F2 at high confidence or find counter-examples.
- **Should the on-disk middleware be rewritten to use the Drizzle query builder?** F2 conflict surfaces this as a secondary design question; the lint-mechanism research doesn't resolve it. /design or a future code-review pass may pick this up.
- **Postgres `--` comments inside Drizzle `sql\`` template literals — any production cite?** F2 didn't surface examples of the `-- comment INSIDE sql\`...\`` pattern that (β) would adopt. Worth confirming the pattern executes cleanly under postgres-js + Drizzle (very likely yes, since `--` is standard SQL comment syntax, but a verification spike would confirm before /implementation lands).
- **`pgrls` adjacent integration.** Source 7 hints at a Postgres-layer RLS linter that could complement `check-direct-wallet-mutation.ts` (TS-source lint) — they operate at different layers. Not blocking; future ops-tooling slice could evaluate.
- **Bun #28968 / native OTel auto-instrumentation status** (carried from `[[otel-stack-research]]` open thread, noted here only because the research-session pattern is shared). Not in this entry's scope.
