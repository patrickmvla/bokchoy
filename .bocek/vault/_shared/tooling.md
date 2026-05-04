---
type: decision
features: [tooling, engineering-standards]
related: ["[[tooling-research]]", "[[bun-workspaces-research]]", "[[backend-stack]]", "[[frontend-stack]]", "[[wallet-mechanics]]", "[[multi-tenant-rls-research]]"]
created: 2026-05-04
confidence: high
---

# Tooling: Biome only for lint + format (no ESLint, no Prettier)

## Decision

Single tool — **Biome** — covers both linting and formatting for all TypeScript / JavaScript / JSON / CSS source in the monorepo. No ESLint, no Prettier, no separate Stylelint at MVP.

- **Binary:** Biome v2.x (currently v2.4 as of 2026-Q2 per `[[tooling-research]]` Source 8). Pin major version in `package.json`; let minor/patch float with Renovate review per `[[backend-stack]]` cascade-12 pattern.
- **Config:** single `biome.json` at monorepo root. Per-package overrides if needed via Biome's `overrides[]` array.
- **CI:** `bun biome ci` (or equivalent) gates merges; fails on any lint error or formatting drift.
- **IDE:** Biome's official VSCode extension is the canonical integration. Other editors via LSP.

### Cascade enforcement (vault rules made operational)

Three vault entries reference linter specifics. Each maps to a concrete enforcement strategy under Biome:

1. **`[[frontend-stack]]` cross-runtime discipline** (block `import 'bun'` and `import 'bun:*'` in non-test files): Biome built-in `noRestrictedImports` rule with gitignore-style glob patterns. Built-in, no plugin needed.
2. **`[[backend-stack]]` cascade-10** (`prepare: false` mandatory in `postgres()` client construction): pick one of two equivalent enforcement paths at implementation time —
   - (a) Biome **GritQL plugin** matching `postgres($url, $opts)` calls and reporting when `$opts` lacks `prepare: false`. Diagnostic-only per `[[tooling-research]]` Source 2 — adequate (CI fails on diagnostic).
   - (b) **Bash/TS scripted check** mirroring `[[backend-stack]]` cascade-9 FORCE-RLS pattern — `grep` for `postgres(` in any `**/db/client.ts` and assert `prepare: false` appears within the call.
   Path (b) is the safer initial pick because GritQL ergonomics are unverified at BokChoy's specific shape per `[[tooling-research]]` Q1 open thread; (a) replaces (b) once verified.
3. **`[[backend-stack]]` F1** (withTenant tx-wrapper bypass): NOT a lint rule. Per `[[tooling-research]]` Q3 / F4, production teams enforce tenant isolation at the **connection layer + RLS + tests**, not at lint. F1 mitigation is amended in this design pass to two-layer defense (RLS-fail-closed + type-level discipline + integration tests). The "custom ESLint rule" framing was over-promised regardless of linter choice.

## Reasoning

- **Production-cited industry-consensus.** `[[tooling-research]]` Source 1 (biomejs.dev primary): 15 named tier-1 orgs use Biome in production — Astro, AWS, Canonical, Cloudflare, Coinbase, Comcast, Discord, Google, Microsoft, n8n, Node.js, Slack, Socket, Uniswap, Vercel. **(production-cited × 15; confidence: high.)** Updates `[[bun-workspaces-research]]`'s tier-4 industry-consensus quote with tier-1 backing.
- **Single tool replaces two.** Biome covers linter + formatter scope that historically required ESLint + Prettier + their plugins (typically 127+ npm packages per `[[tooling-research]]` search-summary cite, tier-4). One Rust binary, one config. Reduces dependency surface, supply-chain risk, version-skew between linter rules and formatter rules. **(industry-standard pattern; confidence: medium-high.)**
- **Performance.** Biome lints/formats 10–25× faster than ESLint+Prettier on equivalent file counts per multiple 2026 engineering posts (`[[tooling-research]]` Sources from search). At BokChoy's MVP scale (low thousands of LoC) this isn't load-bearing — but at scale it shapes CI duration. **(blog-cited; confidence: medium — verify in our CI when scaffold lands.)**
- **Cascade items covered or amended.** `[[frontend-stack]]` cross-runtime discipline trivially implementable via built-in `noRestrictedImports`; cascade-10 implementable via GritQL OR scripted-check; F1 was over-promised regardless of linter (production-cited via Drizzle+Nile, pgvpd, Drizzle Discussion #1539). **(production-cited; confidence: high.)**
- **Contradiction probe dry.** `[[tooling-research]]` Q6 — zero documented Biome→ESLint migrations found in surveyed scope (dev.to, Medium, GitHub, codemod.com, kittygiraudel.com). All migration content flows ESLint→Biome direction. Per *Contradiction protocol*, "no credible disagreement found" is a research finding. **(survey-cited; confidence: medium — single-search-engine scope.)**
- **ESLint v9 flat-config breakage shows no linter is breakage-free.** ESLint's "everyone had to move whether they wanted to or not" v9 transition is the same class of breaking-change as Biome v2's. The "ESLint stability" intuition is anchored in pre-v9 history, not 2026 reality. **(blog-cited via `[[tooling-research]]` searches; confidence: high — public history.)**

## Engineering substance applied

- **Operability:** single binary, single config, single command (`biome ci`). Linter version drift is one-tool-version. CI failure surface is one tool's diagnostic output. Operational simplicity over multi-tool depth.
- **Failure semantics:** linter is build-time, deterministic per input + version. No runtime effect. CI fails closed (any diagnostic = exit non-zero). No ambiguity about which tool produced a finding.
- **Storage / config:** `biome.json` at monorepo root; if cascade-10 picks GritQL plugin path (2a above), `.biome/plugins/no-postgres-without-prepare.grit` lives in repo and is referenced via `plugins[]` in `biome.json`.
- **Observability:** Biome's diagnostic output uses standard severity levels (error/warn/info). CI parses for failure. IDE LSP surfaces diagnostics inline.
- **Security boundary:** linter has no runtime privilege. Threat model is supply-chain (single Rust binary distributed via npm) — same shape as ESLint and equivalent in risk class. `bun audit` continues to cover the dependency.
- **Concurrency / scaling:** Biome runs file-parallel. CI scaling matches file-count linearly; Rust performance keeps the constant low. Not load-bearing at MVP but doesn't punish growth.

## Production-grade gates

- **Idiomatic** — Biome is the production-cited industry default for new TypeScript projects in 2026 per `[[tooling-research]]` Source 1 (15 tier-1 orgs) + multiple 2026 dev-blog signals. `idioms/typescript.md` doesn't pin a specific linter, but the *"first-class, not workaround"* gate applies — Biome is a ground-up Rust toolchain, not a polyfill over an older runtime.
- **Industry-standard** — ≥2 named production teams: Vercel, Cloudflare, Discord, Slack, AWS, Google, Microsoft, Astro, Node.js, Coinbase. Far exceeds the floor.
- **First-class** — Biome implements its own AST + diagnostic engine + formatter, not a wrapper over ESLint or Prettier. GritQL plugin system is purpose-built. Uses Bun-native invocation cleanly via `bun biome`. No fight against the platform.

## Rejected alternatives

### ESLint + Prettier
**What:** ESLint v9 (flat config) for linting, Prettier for formatting, eslint-config-prettier to disable conflicting rules, multiple `eslint-plugin-*` for TS / React / Drizzle / etc.

**Wins when:** team already runs the stack, has accumulated custom plugins, or needs ESLint-specific custom-plugin breadth that GritQL can't yet express.

**Why not here:** (i) `[[tooling-research]]` Source 1 shows the industry-consensus migration is in the opposite direction; (ii) the cascade items either don't need ESLint's plugin breadth (`noRestrictedImports` is built-in everywhere; F1 isn't really lintable anywhere) or have a working scripted-check fallback (cascade-10); (iii) two-tool config + 127+ npm packages + plugin version-skew is real ongoing tax; (iv) ESLint v9's flat-config breakage shows ESLint isn't the stability-anchor it was in 2018-2022. The bespoke-vs-standard advantage is illusory at BokChoy's scope.

### Hybrid: Biome for format/style + Bash/TS scripts for cascade rules
**What:** Biome owns formatting + general lint; specific cascade rules (cascade-10) go to scripted checks per the `[[backend-stack]]` cascade-9 FORCE-RLS pattern.

**Wins when:** GritQL plugin system underperforms or has stability issues that mean Biome plugins can't be relied on for load-bearing rules.

**Why not here:** This isn't really a separate alternative — it's the *fallback path* selected within Position A above (cascade-10 path b). Listing as "alternative" overstates the difference. Adopted as part of Biome shape, not as a competing toolchain.

### OXC (Oxlint + Oxformat)
**What:** Vercel-affiliated alternative Rust-based linter+formatter. Faster benchmarks than Biome per public claims.

**Wins when:** OXC reaches production-adoption scale comparable to Biome's tier-1 user list.

**Why not here:** OXC is not yet at Biome's production-cite scale. Vercel itself is on Biome's production-users list per `[[tooling-research]]` Source 1, weakening any "Vercel uses OXC" implication. Revisit when OXC ships v1 GA with named-tier-1 production cites of comparable count.

## Failure modes

### F-Tooling-1: GritQL plugin underperforms for cascade-10
**Trigger:** Implementation of cascade-10 path (a) — GritQL plugin matching `postgres($url, $opts)` without `prepare: false` — fails to express the rule, has high false-positive rate, or has stability issues.

**Mitigation:** fall back to path (b) Bash/TS scripted check (already specified as the safer initial pick above). Scripted check is linter-agnostic; mature; runs anywhere. Document the fall-back as the as-built choice; revisit GritQL when Biome's plugin system stabilizes.

### F-Tooling-2: Biome breaking change in major release that `biome migrate` can't handle
**Trigger:** Biome v3 (or later major) ships breaking changes outside the scope of the automated migration command. `[[tooling-research]]` Source 8 documents v2's breaking changes were within `biome migrate`'s scope; future majors may not be.

**Mitigation:** pin major version in `package.json`; review release notes pre-upgrade per `[[backend-stack]]` cascade-12 pattern (Renovate auto-PR + manual review); run `biome migrate` first in a branch and verify diff scope before merge.

### F-Tooling-3: VSCode import-sorting mangles files
**Trigger:** `[[tooling-research]]` Source 10 documents this as an observed friction point. Sometimes Biome's auto-sort produces incorrect output for specific import shapes.

**Mitigation:** PR review surfaces unexpected import diffs (humans skim diffs). If it bites repeatedly, disable Biome's import-sorting via `biome.json` and revisit when fixed upstream. Solo-dev MVP scope makes the cost contained.

### F-Tooling-4: GraphQL formatting absent
**Trigger:** BokChoy adopts GraphQL (e.g., for SDK API surface or internal tooling) post-MVP. Biome doesn't ship a GraphQL formatter per `[[tooling-research]]` Source 10.

**Mitigation:** add a GraphQL-specific formatter (gql-format / graphql-config-prettier) for `*.graphql` files only when GraphQL lands; keep Biome for everything else. Not blocking — `[[backend-stack]]` Hono+REST scope has no GraphQL at MVP.

### F-Tooling-5: Plugin distribution mechanism out of scope at v2.0
**Trigger:** `[[tooling-research]]` Source 2 — "the distribution method of plugin for different reasons [is intentionally left out]." If BokChoy ever wants to share a lint rule across multiple repos, the GritQL plugin lives only in this repo.

**Mitigation:** at MVP scope, single-repo plugins are fine. Revisit if BokChoy splits into multiple repos AND has shared lint rules to enforce. Not blocking.

## Idiom citations

- `idioms/typescript.md` does not pin a specific linter. The "first-class, not workaround" gate applies — Biome's ground-up Rust toolchain qualifies. The "industry-standard for the problem class" gate applies — Biome is now the 2026 production-cited default per the 15 tier-1 orgs in `[[tooling-research]]` Source 1.

## Cascade obligations (queued for implementation)

1. Write `biome.json` at monorepo root with sensible defaults (TypeScript strict, React JSX, organize imports, formatter on).
2. Add `biome` to root `devDependencies`; add `lint` / `format` / `lint:check` scripts to root `package.json` mapping to `biome` invocations.
3. Implement cascade-10 enforcement: pick path (b) scripted-check by default; commit `scripts/check-prepare-false.ts` (or `.sh`) per `[[backend-stack]]` cascade-9 idiom; CI invocation `bun run check:prepare-false`.
4. Implement `[[frontend-stack]]` cross-runtime discipline: configure Biome `noRestrictedImports` to block `bun` (bare) and `bun:*` (glob) in non-test sources via `overrides[]` excluding test patterns.
5. Verify GritQL plugin path (a) for cascade-10 in a follow-up — write the plugin, test it against fixture files, swap from scripted-check if it works cleanly. Open thread.
6. Update `[[backend-stack]]` F1 mitigation per the amendment in this design pass.
7. CI scaffold (sub-unit 5 of bootstrap) wires `biome ci` + the cascade-10 scripted-check + drizzle-kit FORCE-RLS check into one pipeline.

## Revisit when

1. **Biome v3 announcement with breaking-change scope outside `biome migrate`.** Trigger: review release notes; if the breakage class is comparable to ESLint v9 flat-config (everyone-must-move), evaluate whether to upgrade or stay on v2 LTS line.
2. **First documented credible Biome→ESLint migration with named reasons.** Trigger: surfaces during periodic review or by community signal. Re-run the contradiction probe and weight per *Contradiction protocol*.
3. **GritQL plugin system stays underpowered for 12+ months OR a custom rule we need is genuinely impossible to express.** Trigger: 3+ scripted-check fallbacks accumulate AND each represents a real "wanted as Biome plugin but can't" rule. At that volume, ESLint custom-plugin tax becomes worth paying.
4. **Team grows past solo with ESLint-fluent hires AND Biome's IDE integration is materially worse than ESLint's at that point.** Trigger: 2+ team members report Biome friction in onboarding.
5. **OXC reaches Biome's production-adoption scale (currently behind).** Trigger: OXC publishes a "trusted by" list of comparable count to Biome's 15. Re-evaluate; may pick OXC if it dominates on speed AND production-adoption gates.
6. **BokChoy adopts GraphQL** (per F-Tooling-4). Add a GraphQL formatter as a secondary tool; doesn't displace Biome.
