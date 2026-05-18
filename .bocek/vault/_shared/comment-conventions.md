---
type: decision
features: [_shared]
related: ["[[_shared/.research/comment-conventions-research]]", "[[wallet/balance-history-contract]]", "[[wallet/credit-route-contract]]", "[[wallet/wallet-http-contract]]", "[[marketing/v1-shape]]"]
created: 2026-05-18
confidence: high
---

# Comment conventions: <5% standalone density, JSDoc-on-exports earned, narrative file headers forbidden, `[[wikilink]]` capped at 1 per file in function JSDoc, advisory density script

## Decision

Per `[[_shared/.research/comment-conventions-research]]` audience-class survey of 5 TS-stack production codebases at BokChoy's scale (stripe-node, better-auth, hono, drizzle-orm, trpc) + 1 contradiction probe (Effect-TS). Cluster median is ~4–5% standalone comment density outside JSDoc-on-exported-APIs. BokChoy's current files run 19–39% — 4–10× the cluster norm. This entry pins the convention going forward and names the cleanup-pass scope.

### (i) Density target

**Standalone comment lines / total LOC < 5% per file**, outside JSDoc on exported declarations. Pin matches cluster median (stripe-node 1.95–4.8%, hono-base 4.5%, trpc 1.7%, better-auth <1% standalone). JSDoc on exported APIs has no density cap — its presence is encouraged per F2 of the research.

Standalone comments = `//` lines + `/* */` block comments that are NOT JSDoc on an exported declaration. JSDoc on internal helpers counts as standalone. JSDoc on `export` declarations does not.

### (ii) File-header policy

Two acceptable forms; everything else is forbidden:

- **Form A — `@module` JSDoc, ≤3 lines.** Matches hono `hono-base.ts` precedent:
  ```ts
  /**
   * @module
   * This module is the base module for the Hono object.
   */
  ```
  One sentence purpose. No multi-paragraph narrative. No vault content restated.

- **Form B — Single-line class-level JSDoc.** Matches stripe-node `StripeResource.ts` precedent:
  ```ts
  /** Encapsulates request logic for a Stripe Resource. */
  ```
  Goes immediately above the exported class/function.

**Forbidden:** multi-paragraph narrative headers explaining where the file sits in the contract. The current BokChoy pattern (`balance-by-external-id.ts` 14-line header, `wallet/index.ts` 20-line preamble, etc.) matches **nothing** in the surveyed cluster. Strip them.

### (iii) What lives in comments — KEEP

1. **JSDoc on exported declarations** (functions, classes, types, exported constants). 1–3 line purpose statements + `@param` / `@returns` / `@template` where the type alone doesn't carry the meaning. Drizzle-shape `@example` blocks are allowed for SDK public-API methods (deferred to the SDK publish slice; not in the cleanup-pass scope).

2. **Non-obvious invariant inline comments** (the "(b) archetype"). 1–3 lines max. Must name a constraint a reader CANNOT recover from the code alone. Earned examples:
   - `// postgres-js returns NUMERIC as string to preserve precision past 2^53`
   - `// FOR UPDATE inside SERIALIZABLE — see wallet-mechanics §8`
   - `// Hash password to prevent timing attacks (consistent response times)`
   - `// transactions.id BIGSERIAL is monotonic with created_at across partitions`
   - `// 'then' is a reserved property name — Proxy must not promise-resolve` (trpc-shape)

3. **External spec / RFC / docs URL citations** (the "(d) archetype"). Inline at the decision point where behavior pins to the external standard. Examples:
   - `// Per RFC 7230 §3.3.2 — Content-Length on POST...`
   - `// PG11+ ADD COLUMN NULL is metadata-only — postgresql.org/docs/16/ddl-alter.html`

4. **Workaround citations.** Issue URL + 1-line reason. Example: `// Workaround for honojs/hono#1234 — strip after fix lands.`

5. **`[[wikilink]]` vault references** — see (iv) for the strict syntax.

### (iv) `[[wikilink]]` syntax — pinned

Vault wikilinks are defensible by analogy to stripe-node's inline RFC URL citations (they're project-internal design-doc URLs), but the BokChoy bloat pattern is wikilink-restatement — citing AND re-explaining the vault entry. Strict syntax:

- **Allowed location: JSDoc on the exported declaration** that implements the vault contract. NOT in a file-header narrative.
- **Cap: 1 wikilink per file.** Implementing one vault contract per file = 1 wikilink. Implementing multiple contracts per file is a code-structure smell, not a wikilink density problem.
- **Form:** terse, no restatement.
  ```ts
  /** Player-centric balance read. Per [[wallet/balance-history-contract]] (v). */
  export async function walletBalanceByExternalId(...) { ... }
  ```
- **Forbidden:** wikilinks inline at decision points unless the citation explains an invariant the reader cannot recover (per (iii) archetype 2). The default is the function-level JSDoc citation only.

This preserves vault navigation value (a future reader can grep `[[wallet/balance-history-contract]]` and find the implementing file) without re-bloating files with narrative restatement.

### (v) What does NOT live in comments — STRIP

1. **Multi-paragraph file headers** explaining the file's place in the contract. Strip entirely or replace with Form A / Form B from (ii).
2. **Re-explains** — comments restating what the code already says (`// fetch limit+1 to detect hasMore` where the variable name + the if-check carry the meaning).
3. **Span attribute / auth chain / OTel boilerplate** repeated in every handler file. Document once in the vault contract; don't restate per-handler.
4. **Wikilink restatements** — `[[wallet/credit-route-contract]] (iii) says X about Y...` where the actual contract is one click away. Cite the wikilink; do not restate the content.
5. **Inline interpretation flags** documenting design seat decisions — those belong in state.md or the vault entry, not in code.

### (vi) Advisory enforcement — `scripts/check-comment-density.ts`

Ship a simple regex-based density advisory script. Specification:

- **Input:** scans `packages/*/src/**/*.ts`, `apps/*/src/**/*.ts`, `apps/cockpit/modules/**/*.tsx`. Excludes test files (`*.test.ts`, `*.test.tsx`) and scripts (`packages/*/scripts/**`, `scripts/**`).
- **Counts:** total LOC + standalone comment lines. Standalone = lines matching `^\s*(//|/\*|\*/|\*\s)` minus lines inside a `/** */` block immediately preceding an `^export ` line (approximation; AST-grade accuracy not required at advisory tier).
- **Threshold:** flags files with `standalone_density > 10%` (2× cluster median; generous tolerance).
- **Output:** advisory list — `file path | LOC | standalone comment lines | density% | suggested action (strip / review)`. Sorted by density descending.
- **NOT a CI gate.** Run via `bun run lint:comments` or similar. Operator reviews and either strips bloat or justifies why the density is earned (e.g., file IS the public API surface like `sdk-node/wallets.ts`).
- **False-positive tolerance:** the regex won't perfectly distinguish JSDoc-on-exports from internal JSDoc. Acceptable at advisory tier — false positives cost a quick review, not a code change.

### (vii) Cleanup-pass scope

Per the file-level density scan (this seat, 2026-05-18). Files needing /refactoring seat attention, sorted by total standalone comment lines:

| File | LOC | Comment lines | Density | Notes |
|---|---|---|---|---|
| `apps/backend/src/projects/index.ts` | 595 | 136 | 22.9% | Backend routes — many inline narrative blocks |
| `apps/backend/src/wallet/index.ts` | 560 | 121 | 21.6% | GAP 11 + M-1.5 handler narratives |
| `packages/sdk-node/src/wallets.ts` | 203 | 80 | 39.4% | SDK public API — heavy JSDoc may be earned per Effect/Drizzle precedent (see (vii.a) below) |
| `packages/sdk-node/src/http.ts` | 282 | 58 | 20.6% | Internal client narratives |
| `packages/sdk-node/src/errors.ts` | 146 | 54 | 37.0% | Error class hierarchy — JSDoc on exported classes may be earned |
| `apps/backend/src/currencies/index.ts` | 98 | 38 | 38.8% | M-1 handler narratives |
| `packages/wallet/src/internal.ts` | 111 | 22 | 19.8% | Internal helpers — strip narratives, keep invariant explanations |
| `packages/wallet/src/index.ts` | 54 | 20 | 37.0% | Re-export file — strip 20-line preamble entirely |
| `apps/cockpit/modules/marketing/components/code-walkthrough.tsx` | 114 | 22 | 19.3% | M-5 narrative |
| `apps/cockpit/modules/marketing/components/features-grid.tsx` | 110 | 23 | 20.9% | M-5 narrative |
| `apps/cockpit/modules/marketing/components/footer.tsx` | 60 | 13 | 21.7% | M-3 narrative |
| `apps/cockpit/modules/marketing/components/hero.tsx` | 74 | 19 | 25.7% | M-5 narrative |
| `apps/cockpit/modules/marketing/components/top-nav.tsx` | 59 | 19 | 32.2% | M-3 narrative |
| `apps/cockpit/modules/marketing/components/cta-strip.tsx` | 37 | 10 | 27.0% | M-5 narrative |
| `apps/cockpit/modules/marketing/components/code-block.tsx` | 54 | 21 | 38.9% | M-5 shiki wrapper narrative |
| `packages/wallet/src/balance-by-external-id.ts` | 83 | 17 | 20.5% | GAP 11 (this conversation) |
| `packages/wallet/src/history-by-external-id.ts` | 171 | 20 | 11.7% | GAP 11 (this conversation) |
| `packages/wallet/src/wallet-credit-by-external-id.ts` | 73 | 14 | 19.2% | M-1.5 narrative header |
| `packages/wallet/src/wallet-deidentify-player.ts` | 33 | 11 | 33.3% | Tiny file, header-dominant |
| `packages/wallet/src/bootstrap-project-reason-codes.ts` | 32 | 10 | 31.2% | Tiny file, header-dominant |
| `packages/wallet/src/errors.ts` | 48 | 12 | 25.0% | JSDoc on exported error classes — likely all earned |
| `packages/wallet/src/sqlstate-to-error.ts` | 88 | 14 | 15.9% | JSDoc on exported function — likely earned |

**Aggregate:** ~770 standalone comment lines across these 22 files. Cleanup target after preserving (iii) keep-rules: estimated **400–550 lines removed** (~50–70% of current standalone comments). Specific lines need per-file scan; the /refactoring seat owns the per-file pass.

**Out of scope for cleanup:**
- Test files (`*.test.ts`) — already at 0%.
- `packages/wallet/src/wallet-credit.ts` (9.3%) + `wallet-debit.ts` (9.3%) — borderline above target but contain JSDoc on the exported wrapper functions. Likely earned; flag for review, don't blanket-strip.

**(vii.a) — Exemption candidate: `packages/sdk-node/src/wallets.ts` and `errors.ts`.**

These files ARE the public SDK surface. Per Effect + Drizzle precedent, public-API JSDoc with usage examples is earned at higher density (Drizzle `select.ts` ships 11.8%, Effect `Effect.ts` ships 42%). The cleanup pass should distinguish:
- Standalone narrative headers (strip).
- Per-method JSDoc (keep, possibly expand per the SDK publish slice future obligation).

A future SDK publish slice may RAISE the density of these files via `@example` blocks per Drizzle pattern. The 5% target does NOT apply to JSDoc-on-public-API. These files' raw density numbers are not directly comparable to internal files.

## Reasoning

**Density target 5% (per (i)):** Class median is 4–5% across 6 non-Effect surveyed files (`[[_shared/.research/comment-conventions-research]]` F1; production-cited × 5). BokChoy's audience-class match places it in this cluster (per `[[marketing/v1-shape]]` positioning + `[[marketing/currencies-endpoint-research]]` F4). Pinning at 5% targets the median, not the leanest (trpc 1.7%) — leaves room for invariant naming + spec citations without falsely flagging earned content. Confidence: high.

**File-header policy (ii):** 6 of 7 surveyed files have file headers absent or ≤3 lines (research F3). hono `@module` (3 lines) and stripe-node 1-line class doc are the two patterns in the cluster. **No surveyed file has BokChoy's narrative-header pattern.** Strip is the production-cited move. Confidence: high.

**Keep rules (iii):** Direct extraction from research F2 archetypes (c)/(b)/(d). Each archetype produces concrete examples observable in the surveyed codebases — these are not invented, they are catalogued. Confidence: high.

**`[[wikilink]]` discipline (iv):** This is a /design pick, not a research finding. The research observed external-URL citations (stripe-node RFC, better-auth docs.better-auth.com) but NO project-internal design-doc citations in the surveyed cluster. The wikilink slot is novel-to-BokChoy. Three positions weighed: (W-a) file-header position, (W-b) function-JSDoc, (W-c) inline at decision points. Pick is (W-b): function-JSDoc matches the surveyed external-citation pattern most closely (in JSDoc, on the function it pins behavior for) while preserving vault navigation. Cap at 1/file because more = a code-structure smell, not a wikilink-density problem. Inferred / medium-high confidence — no production cite for project-internal wikilinks in TS code, decision is by analogy + structure.

**Advisory script (vi):** None of the 5 surveyed codebases use a density lint (research F5). They use review discipline. **BokChoy is solo-dev at MVP — there is no second reviewer.** The script substitutes for that. Cost ~30 LOC regex; benefit is regression-prevention against the LLM-default that produced the current state. Advisory tier accepts false positives. Confidence: medium-high; the design hedge is "advisory not CI gate" — gating on it would over-constrain JSDoc-on-public-API files.

**Cleanup-pass scope quantified (vii):** Per the file scan this seat — 22 files, ~770 comment lines, estimated 400–550 removable. Confidence: high on the scan numbers (raw counts); medium on the removable estimate (depends on per-file judgment about which JSDoc is earned).

## Engineering substance applied

- **Operability:** review-mediated convention in a solo-dev project regresses without enforcement. The advisory script is the cheapest enforcement tier that doesn't gate CI.
- **Failure semantics:** if the convention is forgotten by a future /implementation seat, files regress to the LLM-default narrative-heavy pattern (this seat's GAP 11 work demonstrated it). The advisory script catches the regression; the vault entry is the citable reason.
- **Lock-in:** the convention is reversible — stripping comments doesn't lose information that lives in the vault. The vault entry IS the durable record of the why. If a future seat decides the cluster median is wrong for BokChoy and ratchets density up, the cleanup pass is non-destructive (commits are reversible).
- **PII / safety:** no privacy or safety concern in comment density.

## Production-grade gates

- **Idiomatic:** matches the surveyed cluster median across 5 named codebases at BokChoy's scale class. Production-cited × 5.
- **Industry-standard:** stripe-node, hono, trpc, better-auth all ship this density target by construction (no enforcement, no aspiration — just what their teams actually wrote). The convention IS the industry standard at BokChoy's class.
- **First-class:** review-mediated discipline + advisory regex script. No bespoke layer (no custom Biome rule, no AST parser, no comment-quality LLM). The simple-regex script matches the operational tier (advisory).

## Rejected alternatives

### (D-narrative) Keep narrative file headers as a BokChoy idiom

**What:** Defend the current 14–20-line file headers as a BokChoy-specific exception because the project is vault-driven and headers provide vault-navigation entry points.

**Wins when:** the team is large enough that the narrative header pays back in onboarding-grade reading time, AND the vault entries themselves don't carry sufficient context for a cold reader.

**Why not here:** Solo dev. Vault entries DO carry the context (e.g., `[[wallet/balance-history-contract]]` (i)–(vii) is the contract; the wrapper file's job is to implement it, not to restate it). The current header pattern matches zero codebases in the surveyed cluster. Effect-TS (the highest-density counter-example) doesn't have narrative headers either — its density lives entirely in JSDoc-on-exports. The narrative-header pattern is mode-collapse to LLM-default, not a defensible BokChoy idiom.

### (E-loose) Cluster median is wrong for BokChoy — pin at 10%

**What:** BokChoy is a regulated-ledger-adjacent product; per-row invariants matter more than for stripe-node. Allow 10% standalone density to accommodate richer invariant naming.

**Wins when:** BokChoy pivots to financial-ledger class per `[[wallet/.research/per-row-running-balance-research]]` F2 (Modern Treasury / Oracle Fusion shape). At that class, audit-rationale density rises.

**Why not here:** Per the per-row-balance research, BokChoy is positioned as game-economy SDK, NOT financial-ledger. Cluster median for game-economy class is 4–5%. Doubling it doesn't match the class; it accommodates LLM bloat under the "regulatory" framing without engineering justification.

### (S-no) Skip the advisory script — review discipline only

**What:** Don't ship `scripts/check-comment-density.ts`. Rely on per-PR review to catch density regressions.

**Wins when:** Multi-person team with review discipline + style-conscious reviewers. Hono, stripe-node, etc. work this way.

**Why not here:** Solo dev, no second reviewer at MVP. PRs in this repo are not reviewed by humans before merge; the convention will regress on the first /implementation seat that forgets it. Cost of script is ~30 LOC; cost of regression is another cleanup pass. Asymmetric.

### (W-c-only) Allow `[[wikilinks]]` inline at decision points, not in JSDoc

**What:** Pin wikilink location to inline `//` comments at the code point that implements the contract decision, not in function JSDoc.

**Wins when:** the contract has multiple decision points within one function and each needs an inline citation.

**Why not here:** Surveyed pattern (stripe-node RFC URLs) IS inline at decision points — so this isn't wrong on shape. But cap=1/file in the picked (W-b) accommodates the common case (one function implements one contract); the rare case where the cap is binding is a code-structure signal. The function-JSDoc slot is also more grep-friendly (`/\[\[wallet\/.*\]\]/` finds the implementing file via the function declaration line).

## Failure mode

**Regression to LLM-default narrative pattern.** A future /implementation seat invoked under load (long context, pressure to ship) defaults to verbose comments. The advisory script's flag-only output is ignored. Cleanup pass cost compounds.

**Probability:** medium. The current state demonstrates this exact pattern across 22 files in 3 weeks of development.

**Detection:** advisory script run as part of three-gates pre-merge convention. Sample interval: every /implementation seat at end-of-slice.

## Mitigations

1. **Vault citation in implementation primitive.** Add `[[_shared/comment-conventions]]` to `~/.bocek/primitives/implementation.md` eager_refs OR Production-grade default section, so /implementation seats load the convention by default before writing files. Owed.

2. **Three-gates extension.** Add `bun run lint:comments` to the per-slice gate list alongside `typecheck`, `lint`, `test`. Advisory output reviewed per slice. Owed once the script lands.

3. **Tracker in state.md.** When a /implementation seat ships a file exceeding the density target, note it as an inline interpretation flag in state.md (same shape as M-1.5's SQL TABLE return interpretation). Creates audit trail for future cleanup passes.

4. **CLAUDE.md global instruction restated locally.** The global instruction already says "Default to writing no comments. Only add one when the WHY is non-obvious." This is the same rule. Cite it inline in PR commits when the convention is invoked. Reinforcement, not new mechanism.

## Idiom citations

- `idioms/typescript.md` doesn't have a comment section; this entry extends it informally. Future amendment to the idiom file may pull the (iii) keep / (v) strip rules upstream.
- Production-cite cluster from `[[_shared/.research/comment-conventions-research]]`: stripe-node + hono + drizzle-orm + trpc + better-auth define the class median. Effect defines the framework-foundation outlier (irrelevant here).

## Revisit when

- **Class pivot to financial-ledger.** If `[[marketing/v1-shape]]` is amended to position BokChoy as financial-ledger / reconciliation-grade product (per `[[wallet/.research/per-row-running-balance-research]]` F2 trigger), revisit (E-loose) — the 10% target may apply.
- **Team grows to 2+.** Once a second engineer joins, review discipline replaces the advisory script's role; the script may be retired or kept as a backstop.
- **SDK publish slice lands.** When `@bokchoy/sdk-node` ships to npm, the public-API methods deserve Effect/Drizzle-shape JSDoc with `@example` blocks. The 5% density target on `wallets.ts`/`errors.ts` is RAISED at that slice (no cap on JSDoc-on-public-API).
- **Advisory script ignored for 3+ slices.** If the script flag-output is overridden 3+ times without per-file justification, the discipline has broken — either tighten to a CI gate, or accept the looser convention and update this entry.

## Cascade obligations

For /implementation and /refactoring seats:

1. **Ship `scripts/check-comment-density.ts`** per (vi). Simple regex; ~30–50 LOC TS; `bun run` shebang.
2. **Add `lint:comments` to root `package.json`** invoking the script.
3. **Cleanup pass** per (vii). New /refactoring seat — per-file scan stripping narrative headers, restating wikilink content, re-explains; preserving JSDoc-on-exports + invariants + spec citations. Sequence files largest-first (`projects/index.ts` + `wallet/index.ts` + `wallets.ts` first) so the highest-impact strips land early.
4. **Update `~/.bocek/primitives/implementation.md`** to cite `[[_shared/comment-conventions]]` as a default-load convention. Bocek-tool repo edit, separate from the BokChoy repo.
5. **SDK JSDoc completeness pass** — deferred to the SDK publish slice. Adds Effect/Drizzle-shape `@example` blocks to `wallets.credit/debit/balance/history`.
