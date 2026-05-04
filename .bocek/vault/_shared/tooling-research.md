---
type: research
features: [tooling, engineering-standards]
related: ["[[backend-stack]]", "[[frontend-stack]]", "[[bun-workspaces-research]]", "[[wallet-mechanics]]", "[[multi-tenant-rls-research]]"]
created: 2026-05-04
confidence: high
provisional: false
---

# Biome vs ESLint+Prettier for BokChoy: production maturity, rule capability for vault cascades, and contradiction probe

## Question

Sub-unit (4) of the bootstrap surfaced a tooling pick (linter + formatter) that has cascade impact on three vault entries (`[[backend-stack]]` cascade-10, `[[backend-stack]]` F1, `[[frontend-stack]]` cross-runtime discipline). Three positions surfaced — Biome only, ESLint+Prettier, hybrid Biome+scripts. The Biome position was leaning on a single tier-4 industry-consensus quote in `[[bun-workspaces-research]]` plus inferred rule capabilities. Six questions ahead of a defensible vault entry:

- **Q1.** Can Biome's lint rules / plugin system match the AST pattern needed for `[[backend-stack]]` cascade-10 — *"a call to `postgres()` where the second argument's object literal does NOT contain `prepare: false`"*?
- **Q2.** Does Biome's `noRestrictedImports` support glob/bare-import patterns matching `bun` and `bun:*` per `[[frontend-stack]]` cross-runtime discipline?
- **Q3.** What do production teams using Drizzle + multi-tenant RLS + tx-wrapper-enforcement actually do for the `[[backend-stack]]` F1 lint rule? Is it ESLint custom plugin, type-level only, integration tests, or code review?
- **Q4.** Biome production maturity 2026-Q2 — active-maintenance signals, breaking changes, plugin ecosystem state, comparison to ESLint v9 flat-config breakage class.
- **Q5.** Tier-1 production cites for Biome at SaaS scale. The `[[bun-workspaces-research]]` industry-consensus quote needs production-cited backing.
- **Q6.** Contradiction probe — documented teams migrating FROM Biome TO ESLint, with named reasons.

## Triangulation

- **Production reference:** ✓ — `biomejs.dev` homepage primary source lists 15 named production orgs; Drizzle docs + Discussion #1539 + Nile pattern + pgvpd cite production patterns for tenant-isolation enforcement; Vercel's stress-test of `noFloatingPromises` rule.
- **Docs reference:** ✓ — Biome official docs on plugin system, rules, migration; Drizzle official docs on RLS + ESLint plugin scope; ESLint official migration guides for v9.
- **Contradiction probe:** ✓ — actively searched "migrated from biome" / "switched from biome back to ESLint" across web; no documented migrations from Biome back to ESLint found in surveyed scope. Per *Contradiction protocol*: "no credible disagreement found" is a finding, not silence.

## Sources examined

### Source 1 — `biomejs.dev` homepage (production-users list)
- **Tier:** 1 — primary self-published production-users list
- **Provenance:** `https://biomejs.dev` fetched 2026-05-04
- **Author context:** Biome project itself; the list is curated/approved (not user-submitted). Self-attestation, but at this scale of named orgs (15) the reputational cost of a misclaim is high enough that the claim is credible.
- **What it tells us:** "Trusted by leading organizations" — Astro, AWS, Canonical, Cloudflare, Coinbase, Comcast, Discord, Google, Microsoft, n8n, Node.js, Slack, Socket, Uniswap, Vercel. Verbatim: *"Join thousands of developers and companies using Biome in production."*

### Source 2 — Biome v2 announcement blog
- **Tier:** 1 — official project blog announcing v2 plugin system
- **Provenance:** `https://biomejs.dev/blog/biome-v2/` fetched 2026-05-04
- **Author context:** Biome maintainers; March 2025 release announcement
- **What it tells us:** v2 plugin system uses **GritQL** (Grit pattern-matching language), is **diagnostic-only** (no auto-fix), and is acknowledged as first-iteration. Verbatim: *"They only allow you to match code snippets and report diagnostics on them."* Example shown matches function calls: `` `$fn($args)` where { $fn <: `Object.assign`, register_diagnostic(...) } ``. Capability is "intentionally limited; we have plenty of ideas for making them more powerful." Distribution method for plugins explicitly out of scope at v2.0.

### Source 3 — Biome `noRestrictedImports` docs
- **Tier:** 2 — official rule documentation
- **Provenance:** `https://biomejs.dev/linter/rules/no-restricted-imports/` fetched 2026-05-04
- **Author context:** Biome maintainers
- **What it tells us:** Rule supports gitignore-style glob patterns via `patterns` option. Verbatim: *"This option allows you to specify multiple modules to restrict using gitignore-style patterns."* Configuration example uses `import-foo/*` glob. "Side effect / Bare import" is recognized as an empty-string import name specifier. The docs don't show a `bun:*` example specifically, but the gitignore-style pattern engine supports the class of match needed.

### Source 4 — Drizzle ORM ESLint plugin docs
- **Tier:** 2 — official Drizzle docs on its own ESLint plugin
- **Provenance:** `https://orm.drizzle.team/docs/eslint-plugin` (referenced in search results)
- **Author context:** Drizzle maintainers
- **What it tells us:** Drizzle's official ESLint plugin scope is *"cases where it's impossible to perform type checks for specific scenarios."* The recommended rule it ships is enforcing `.where()` on `.delete()`/`.update()` calls. There is **no shipped rule for tx-wrapper enforcement** (no withTenant-equivalent rule). If Drizzle's own plugin doesn't ship it, custom plugins authored by individual teams are the only path — and none surfaced in the search.

### Source 5 — Drizzle GitHub Discussion #1539 (tenant-id enforcement)
- **Tier:** 1 — production code/community Q&A on the actual Drizzle repo
- **Provenance:** `https://github.com/drizzle-team/drizzle-orm/discussions/1539` (referenced in search results — title: *"Is there a way to enforce that all queries include a where clause on `tenantId`?"*)
- **Author context:** Drizzle community discussion
- **What it tells us:** Production teams asking explicitly for tenant-id enforcement at the query layer. The fact that this is asked as an *open question* on the official repo — not answered with a built-in solution — confirms there is no canonical lint-level enforcement pattern. Production answer is at the connection layer (RLS + SET LOCAL) per Sources 6 + 7 below, not the lint layer.

### Source 6 — Drizzle + Nile multi-tenancy pattern docs
- **Tier:** 2 — official Drizzle docs on Nile (multi-tenant Postgres) integration
- **Provenance:** `https://orm.drizzle.team/docs/connect-nile` (referenced in search results)
- **Author context:** Drizzle + Nile collaboration
- **What it tells us:** Production multi-tenant pattern documented: `tenantDB` wrapper using AsyncLocalStorage to set tenant context, then queries execute "against this tenant's virtual database" via the connection. **Enforcement is at the connection layer**, not via lint. The same pattern shape as BokChoy's `withTenant(...)` helper from `[[backend-stack]]` Section 3.

### Source 7 — pgvpd (transparent multi-tenancy proxy) — Drizzle Discussion #5411
- **Tier:** 1 — production tooling reference
- **Provenance:** `https://github.com/drizzle-team/drizzle-orm/discussions/5411` (referenced in search results)
- **Author context:** Drizzle community
- **What it tells us:** *"pgvpd is a lightweight Postgres protocol-level proxy that injects tenant identity at connection time. Row-level security handles the rest — no middleware, no query rewriting, no .where(eq(tenantId, ctx.tenant)) on every query."* Yet another production approach that handles tenant isolation at connection/RLS layer, NOT at lint layer. Triangulates Source 6.

### Source 8 — Biome v2 upgrade guide
- **Tier:** 2 — official migration guide
- **Provenance:** `https://biomejs.dev/guides/upgrade-to-biome-v2/` fetched 2026-05-04
- **Author context:** Biome maintainers
- **What it tells us:** v2 introduced breaking changes including: suppression comment format change (*"// biome-ignore lint(<GROUP>/<RULE>): <explanation>"* no longer supported), style-group rules switched from emit-error-by-default to emit-warning-by-default. `biome migrate` command automates most updates. v2.4 (2026-Q1) overhauled HTML formatter producing large diffs for HTML/Vue/Svelte/Astro. Pattern: real breaking changes with automated migration tooling — same class as ESLint v9 flat-config breakage but with explicit migration command.

### Source 9 — Web search "migrated from biome back to ESLint" (contradiction probe)
- **Tier:** N/A — null-result search
- **Provenance:** WebSearch executed 2026-05-04 with multiple query variants
- **Author context:** survey across dev.to, Medium, GitHub, kittygiraudel.com, codemod.com
- **What it tells us:** Zero documented teams migrating FROM Biome TO ESLint. Multiple posts in the FROM-ESLint-TO-Biome direction (xergioalex.com, dev.to/amiceli, kittygiraudel.com 2024-06-01, dev.to/yoriiis, codemod.com). Survey scope: web blogs + GitHub issues. Per *Contradiction protocol*: "no credible disagreement found in [scope] surveyed" — stronger than silence as a research finding.

### Source 10 — pkgpulse 2026 Biome vs ESLint+Prettier review
- **Tier:** 4 — engineering blog (named author, recent, but blog-tier source)
- **Provenance:** `https://www.pkgpulse.com/blog/biome-vs-eslint-prettier-linting-2026` (referenced in search results, not fully fetched)
- **Author context:** pkgpulse — same source already cited for Bun-runtime caveat in `[[backend-service-shape-research]]` Source 8 (treats long-running workloads honestly). Treated as moderately credible engineering blog.
- **What it tells us:** Names two specific Biome pain points worth knowing: *"the import sorting feature is amazing… when it works. Sometimes Biome on VSC just absolutely mangles a file when rewriting imports"* and *"they lost the ability to auto-format GraphQL files which is a shame because they have a lot of them and Prettier was doing a good job at this."* Surfaces real-world friction — neither blocks BokChoy MVP scope (no GraphQL files; import sorting can be disabled if it bites).

## Findings

### F1 — Biome production maturity at 2026-Q2 is sufficient for BokChoy MVP scope
Source 1 (15 named tier-1 orgs including AWS, Google, Microsoft, Cloudflare, Coinbase, Vercel) + Source 8 (v2 ~14 months old, automated migration command, regular minor releases) + Source 9 (no contradiction-probe hits for Biome→ESLint migrations). The "first iteration plugin system" caveat (Source 2) is real but bounded — current built-in rules cover BokChoy's load-bearing cascade items.

### F2 — `[[frontend-stack]]` cross-runtime discipline (block `import 'bun'` / `bun:*`) is covered by Biome's built-in `noRestrictedImports`
Source 3 confirms: gitignore-style glob patterns supported, bare imports recognized as empty-string specifier. `bun` and `bun:*` patterns express cleanly. No custom plugin needed.

### F3 — `[[backend-stack]]` cascade-10 (`prepare: false` enforcement) is a GritQL-plugin or scripted-check, NOT a built-in
Source 2 confirms Biome's plugin system is GritQL-based, diagnostic-only, "first iteration." A plugin can match `postgres($args)` patterns and report when a specific property is missing — but the plugin distribution mechanism is "intentionally left out" at v2.0. Practical implications:
- Plugin file lives in repo (`biome.json` references local `.grit` file).
- Diagnostic-only is fine — fail CI on the diagnostic, no auto-fix needed.
- Less ergonomic than ESLint's mature `eslint-plugin-no-restricted-syntax` but adequate for a single-rule case.
- A Bash/TS check (`grep -r "postgres(" --include="**/db/client.ts" | grep -v "prepare: false"`) is a working alternative for this single rule.

### F4 — `[[backend-stack]]` F1 lint rule (withTenant tx-wrapper enforcement) is OVER-PROMISED in the original vault entry
Multiple production patterns surveyed (Sources 4–7): no production team enforces tenant tx-wrapper via lint. The actual production pattern is **connection-layer enforcement**:
- AsyncLocalStorage + tenantDB wrapper (Drizzle+Nile, Source 6).
- Connection-time tenant identity injection via Postgres protocol proxy (pgvpd, Source 7).
- RLS policies that fail closed when `app.current_tenant` GUC is unset (matches `[[wallet-mechanics]]` §8).
- Drizzle's own ESLint plugin (Source 4) doesn't ship a tx-wrapper enforcement rule — only `delete WHERE` enforcement. The maintainers haven't shipped the rule because the type system + connection-layer approach is the actual production answer.
- GitHub Discussion #1539 (Source 5) is an open-question signal: production teams asking for tenant-id-where-clause enforcement, no canonical lint answer offered.

`[[backend-stack]]` F1's mitigation — *"Drizzle's typed query builder integrates with the lint via custom ESLint rule"* — is over-promised. The vault should be amended to reflect production reality: type-level discipline + integration tests + RLS-fail-closed semantics, with lint as best-effort approximation only.

### F5 — Contradiction probe came up dry
Source 9: surveyed scope (dev.to, Medium, GitHub, codemod.com, kittygiraudel.com) returned zero documented Biome→ESLint migrations. All migration content flows the other direction. Possible explanations:
- Genuine consensus migration in 2025–2026 (consistent with Source 1's tier-1 production-users list).
- Teams who migrated back didn't write up the experience publicly (selection bias).

Either way, the contradiction probe is dry — there is no surfaced credible counter-position. This is a real finding, not silence.

### F6 — Real Biome friction points exist but don't bite BokChoy's MVP scope
Source 10: import sorting occasionally mangles files in VSCode; GraphQL formatting lost. BokChoy MVP has no GraphQL; import sorting can be disabled or constrained. Both are operational papercuts, not blockers.

## Conflicts

- **Source 4 (Drizzle ships an ESLint plugin) vs F4 (lint rule for tx-wrapper is over-promised).** No real conflict — Drizzle's plugin scope is narrow (`.delete().where()` enforcement), explicitly designed for "scenarios type checks can't cover." It does NOT include tx-wrapper enforcement. Confirms F4 rather than contradicts.
- **Source 2 (plugin system is "first iteration limited") vs F2 (built-in rules cover cascade items).** No conflict — F2 relies on built-in `noRestrictedImports`, NOT the plugin system. Plugin system is needed only for cascade-10 GritQL plugin or alternative script.

## Conditions

- **F1 finding (production maturity sufficient) holds for 2026-Q2 specifically.** Biome v2.x active-maintenance state. Revisit if v3 ships with breaking changes worse than v2's, OR if a notable team publishes a Biome→ESLint migration with named reasons.
- **F2 finding (`noRestrictedImports` covers cross-runtime) verified at the configuration-syntax level only.** Empirical verification (write the rule, observe it blocks `import 'bun:test'` in non-test source) is owed at implementation time. Cheap to verify when the rule is written.
- **F3 finding (GritQL adequate for cascade-10) is plausible but not empirically tested.** GritQL plugin file matching `postgres()` calls without `prepare: false` is cited as supported but I have not written + run such a plugin against BokChoy's actual `client.ts`. Empirical verification owed at implementation time. If GritQL falls short, the Bash/TS scripted-check fallback is unblocking.
- **F4 finding (production patterns use connection-layer not lint) holds at MVP scale.** Different patterns may emerge at IPO scale (Stripe-class teams may build custom plugins). Not load-bearing for BokChoy.
- **F5 finding (no Biome→ESLint migration found) holds for surveyed scope.** Single-search-engine survey; absence is bounded by what was indexed. A team migrating back today wouldn't appear until they publish.

## Operational implications

For `/design`'s tooling decision and the four-item amendment scope:

1. **Position A (Biome only) is now defendable on tier-1 evidence:**
   - Industry production-users at tier-1 scale (Source 1: AWS, Google, Microsoft, Cloudflare, Coinbase, Vercel, Discord, Slack, etc.).
   - All cascade items either covered by built-ins (`noRestrictedImports` for cross-runtime) or doable via GritQL plugin / Bash script (`prepare: false` check for cascade-10).
   - F1's "custom ESLint rule for withTenant" mitigation should be amended to type-level + integration tests regardless of linter — production teams don't lint this.
   - Contradiction probe dry.

2. **Cascade amendments to fold into the tooling decision:**
   - `[[backend-stack]]` cascade-10: replace *"ESLint rule (custom or pattern-based)... Suggested implementation: `eslint-plugin-no-restricted-syntax`"* with *"Biome GritQL plugin matching `postgres($args)` without `prepare: false`, OR Bash/TS scripted check (cf. cascade-9 FORCE-RLS pattern)"*. Either is operationally fine; pick one at implementation time.
   - `[[backend-stack]]` F1 mitigation: replace *"CI lint rule extends [...] discipline; Drizzle's typed query builder integrates with the lint via custom ESLint rule"* with *"Type-level discipline (RLS-protected tables typed such that they only accept tx from `withTenant` wrapper) + integration tests verifying RLS-fail-closed behavior + RLS policy fail-closed semantics per `[[wallet-mechanics]]` §8. Lint can flag obvious bypasses but is not load-bearing — production teams (Drizzle+Nile, pgvpd) enforce at the connection layer, not lint layer."*
   - `[[frontend-stack]]` cross-runtime discipline: replace *"ESLint blocks `import 'bun'` and `import 'bun:*'`"* with *"Biome `noRestrictedImports` blocks `import 'bun'` and `import 'bun:*'` patterns in non-test source files."*

3. **Empirical verifications owed at implementation time** (not blocking the design decision; cheap to do when sub-unit (4) lands):
   - Write the cascade-10 lint rule, verify it fires on `postgres(url, {})` and passes on `postgres(url, { prepare: false })`.
   - Write the cross-runtime rule, verify it blocks `import 'bun:test'` in `apps/backend/**` non-test files.
   - Run `biome migrate` if any existing config exists; expect clean as we have none.

4. **Friction known going in** (Source 10): import-sorting in VSCode can occasionally mangle; GraphQL formatting absent (BokChoy has no GraphQL at MVP).

5. **Revisit triggers:**
   - Biome v3 announcement with breakage class worse than v2's automated-migration scope.
   - First documented credible Biome→ESLint migration with named reasons.
   - BokChoy needs a custom rule that GritQL can't express AND scripted-check is too noisy.
   - Team grows past solo dev with hires expecting ESLint.

## Reproducibility note

Reproducible. Steps:

1. Fetch `biomejs.dev` homepage and the v2 announcement blog and the `noRestrictedImports` docs page.
2. Search for "migrated from biome" / "switched from biome back to ESLint" in standard web search; expect null-result for the BACK direction in the surveyed scope.
3. Search Drizzle docs/repo for tenant-id-enforcement patterns; expect connection-layer answer (Drizzle+Nile, pgvpd) and an open Discussion #1539 that lacks a canonical lint-layer answer.
4. Review Biome v2.x changelog for breaking-change scope; expect automated migration command + style-rule-default-warning shift + suppression-comment format change.

The judgment call that doesn't trivially reproduce: weighting Source 10's friction points (import-sorting, GraphQL) against BokChoy's specific MVP scope (no GraphQL; import-sorting opt-out available). Same conclusion if same vault context is read.

## Open threads

1. **Empirical verification of the cascade-10 GritQL plugin** at implementation time. If GritQL underperforms, fall back to Bash/TS scripted check.
2. **Biome plugin distribution mechanism** is "intentionally left out" at v2.0 (Source 2). If BokChoy ever wants to share a lint rule across multiple repos, this lock-in needs revisiting.
3. **Biome → ESLint contradiction probe is single-channel.** A future search via different surfaces (HN comments, Reddit, conference-talk indexes) could surface a credible counter that web-blogs missed. Not load-bearing for the current decision but worth noting if the decision is revisited.
4. **F1's "type-level discipline" replacement for the over-promised lint rule** needs a concrete pattern decision — branded types? Typed `withTenant` callback parameter that's the only way to access RLS-protected tables? That's a `/design` follow-up after the tooling pick, not in scope here.
