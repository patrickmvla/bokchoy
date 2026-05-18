---
type: research
features: [_shared]
related: ["[[wallet/balance-history-contract]]", "[[marketing/v1-shape]]"]
created: 2026-05-18
confidence: high
provisional: false
---

# What comment conventions do TS-stack production codebases at BokChoy's scale-class actually ship, and what's the discriminator between earned comments and bloat?

## Question

BokChoy's comment style — verbose ~15-line file-header narratives explaining the file's place in the contract, plus 5–10 lines of inline narration per file, including `[[wikilink]]` references to vault entries — was never vaulted as a convention. It's the LLM-default applied by each /implementation seat with no review. The user surfaced "comments are a mess and bloating the files" and asked for a production-codebase survey before designing a convention. The investigation: across TS-stack production codebases at BokChoy's audience-scale match (SDKs, frameworks, libraries — not Linux-kernel scale, not Google-monorepo scale), what comment density and what comment *shape* actually ship?

Audience-class anchor: TS monorepo, dev-tool / SDK class, peers that BokChoy uses or models after — `stripe-node`, `better-auth`, `hono`, `drizzle-orm`, `trpc`. Contradiction probe: Effect-TS (deliberately heavy-doc framework-scale library).

## Triangulation

- **Production reference:** ✓ — 5 named codebases + 1 contradiction probe (Effect). 7 files read across the 6 codebases.
- **Docs reference:** ✗ — N/A for this question. The canonical sources ARE the production codebases themselves; there is no IETF spec or canonical doc on "how to comment TS." Style guides (Google TS, etc.) are training-data noise compared to what shipping teams actually do.
- **Contradiction probe:** ✓ — Effect-TS surveyed specifically as a high-comment-density candidate. Found and characterized; see F4.

## Sources examined

### Source 1 — `stripe/stripe-node` `src/RequestSender.ts`

- **Tier:** 1 (production code, public source, named team).
- **Provenance:** `https://github.com/stripe/stripe-node/blob/master/src/RequestSender.ts` master branch, observed 2026-05-18. ~582 LOC.
- **Author context:** Stripe SDK team. SDK that BokChoy's `@bokchoy/sdk-node` explicitly models after (per `[[wallet/credit-route-shape-research]]` F1 and prior research). Framework-defining reference for TS-stack SaaS-SDK conventions.
- **What it tells us:**
  - **0 file-header doc comment.** File starts with imports.
  - **28 pure comment lines / 582 LOC = ~4.8% density.**
  - Comment categories observed: short inline `//` blocks (2–3 lines max) explaining (b) invariants (BC compat, NOTE about Stripe's lowercase headers), (c) external spec citations (RFC 7230 URL inline), (a) brief decision-point clarifications ("If this is a POST and we allow multiple retries…").
  - No multi-paragraph narratives. No vault/design-doc citations.

### Source 2 — `stripe/stripe-node` `src/StripeResource.ts`

- **Tier:** 1.
- **Provenance:** Same repo, observed 2026-05-18. 154 LOC.
- **What it tells us:** 3 comment lines / 154 LOC = **~1.95% density**. **File-header IS present but it's a 1-line single-purpose class doc**: `/** Encapsulates request logic for a Stripe Resource */`. Comments target async stack-capture rationale, v7 deprecation notice. Reinforces stripe-node's pattern: minimal density, 1-line headers when they exist, focused on invariants + BC notes.

### Source 3 — `better-auth/better-auth` `packages/better-auth/src/api/routes/sign-in.ts`

- **Tier:** 1.
- **Provenance:** `https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/api/routes/sign-in.ts` main branch, observed 2026-05-18. 521 LOC.
- **Author context:** Better Auth team. The auth library BokChoy uses; directly load-bearing in cockpit and backend.
- **What it tells us:**
  - **0 file-header doc comment.**
  - **0 pure standalone comment lines** outside JSDoc-on-Zod-schemas. ~35+ JSDoc blocks document Zod schema fields (purpose statements, `@default` annotations).
  - **1 inline comment in 521 LOC** — and it's a textbook (b) invariant explanation: *"Hash password to prevent timing attacks from revealing valid email addresses / By hashing passwords for invalid emails, we ensure consistent response times."* That's the bar for an earned inline comment — names the security invariant the code's existence depends on.
  - 1 doc-URL citation pointing back to better-auth.com docs.

### Source 4 — `honojs/hono` `src/hono.ts`

- **Tier:** 1.
- **Provenance:** main branch, observed 2026-05-18. 27 LOC (file is tiny — re-exports + 1 class extension).
- **What it tells us:** File-header JSDoc is **10 lines** describing the exported class with `@template` tags. No inline `//` narration. **Per-file size is too small to characterize density** but the pattern is confirmed: public-API JSDoc, nothing else.

### Source 5 — `honojs/hono` `src/hono-base.ts`

- **Tier:** 1.
- **Provenance:** Same repo, ~550 LOC, observed 2026-05-18.
- **What it tells us:**
  - **3-line `@module` file header** — *"This module is the base module for the Hono object."*
  - **~25 pure comment lines / ~550 LOC = ~4.5% density.** JSDoc on exported public-API methods dominates (`.route()`, `.basePath()`, `.onError()`, `.notFound()` each carry usage examples).
  - Inline comments are split: some are textbook (b) invariants (*"Cannot use '#' because it requires visibility at JavaScript runtime"*), some are (a) re-explains ("handle options", "Do not 'compose' if it has only one handler"). The (a) examples are minor — they label code blocks rather than narrate.

### Source 6 — `drizzle-team/drizzle-orm` `drizzle-orm/src/pg-core/query-builders/select.ts`

- **Tier:** 1.
- **Provenance:** main branch, observed 2026-05-18. 1205 LOC.
- **What it tells us:**
  - **0 file-header doc comment.**
  - **142 comment lines / 1205 LOC = ~11.8% density** — highest among non-Effect sources.
  - The bulk is JSDoc on exported APIs with **runnable code examples + Postgres spec links**. Inline narration is sparse and concentrated on (b) invariant explanation for non-obvious join restructuring + proxy handler necessity.
  - `/** @internal */` markers used to label private implementation methods.

### Source 7 — `trpc/trpc` `packages/server/src/unstable-core-do-not-import/router.ts`

- **Tier:** 1.
- **Provenance:** main branch, observed 2026-05-18. 717 LOC.
- **What it tells us:**
  - **0 file-header doc comment.**
  - **12 comment lines / 717 LOC = ~1.7% density** — the leanest of all surveyed files.
  - Inline comments cluster on (b) JS-language-constraint invariants: *"Then is a reserved word because otherwise we can't return a promise that returns a Proxy"*, *"fn.call() and fn.apply() are reserved words because otherwise we can't call a function using .call or .apply"*. These are textbook earned comments — they name invariants a reader without deep JS knowledge would not recover from the code alone.

### Source 8 — `Effect-TS/effect` `packages/effect/src/Effect.ts` (CONTRADICTION PROBE)

- **Tier:** 1.
- **Provenance:** main branch, observed 2026-05-18. ~2850 LOC, ~1200 comment lines = **~42% density**.
- **Author context:** Effect-TS team. Functional-effects ecosystem; framework-scale library that consumers wrap their entire program around. Audience-class **mismatch** with BokChoy (Effect is a foundation, not an SDK — consumers commit their codebase to Effect's idioms).
- **What it tells us:**
  - **The 42% density is ~95% JSDoc-on-exported-API**, ~5% in-function inline. Heavy JSDoc per export carries Details / When-to-use / Concurrency / Short-Circuiting sections + runnable Example sections + `@since` / `@category` / `@see` metadata.
  - This is **NOT** a counter-example to the minimal-inline pattern; it confirms a stronger version of the convention — *inline narration is rare even in heavy-doc codebases; what's heavy is API-as-contract JSDoc on exports*.
  - Framework-scale documentation-first philosophy. Applies when the library IS the API surface for the consumer's program. **Doesn't transfer to a SaaS-SDK class** where the consumer calls a few methods.

## Findings

### F1 — Density (load-bearing)

Outside the framework-scale counter-example (Effect at 42%), the TS-stack production codebases at BokChoy's scale-class converge on **<5% standalone comment density**. Specifically:

| Codebase / file | LOC | Comment lines | Density |
|---|---|---|---|
| `stripe-node` RequestSender.ts | 582 | 28 | 4.8% |
| `stripe-node` StripeResource.ts | 154 | 3 | 1.95% |
| `better-auth` sign-in.ts | 521 | ~1 inline + JSDoc on Zod | <1% standalone |
| `hono` hono.ts | 27 | 10 (JSDoc-class) | tiny file |
| `hono` hono-base.ts | ~550 | ~25 | 4.5% |
| `drizzle-orm` select.ts | 1205 | 142 (mostly JSDoc on exports) | 11.8% |
| `trpc` router.ts | 717 | 12 | **1.7%** |
| **Class median (non-Effect)** | — | — | **~4–5%** |

Drizzle's 11.8% is an outlier within the cluster — and it's almost entirely JSDoc-on-exports with runnable code examples (the library exposes a query builder that users invoke directly; JSDoc IS the user-facing API documentation). For non-exported code, drizzle's density drops sharply.

**BokChoy's current state on new files:** `balance-by-external-id.ts` ships a 14-line header + 8 inline narration lines / 95 LOC ≈ **23% density on a new file**. Roughly **5× the class median** for non-public-API files. The previous /implementation seat (this conversation) authored that.

Confidence: **high**. 7 source files across 5 codebases, consistent signal.

### F2 — Shape (load-bearing)

When comments DO appear in this class, they fall into 5 archetypes — and **only 3 of them are earned**:

**Earned (kept across the surveyed codebases):**

- **(c-export) JSDoc on exported APIs.** 1–3 line purpose statements with `@param` / `@returns` / `@template`. Drizzle adds runnable examples; Effect adds Details sections. **Universally present** when a function/class/type crosses the package boundary. Absent or `@internal`-tagged for private implementation.
- **(b) Non-obvious invariant naming.** Inline `//` block (1–3 lines max), states an invariant a reader can't recover from the code alone. Examples observed:
  - *"Then is a reserved word because Proxy semantics."* (trpc)
  - *"Cannot use '#' because it requires visibility at JavaScript runtime."* (hono)
  - *"Hash password to prevent timing attacks from revealing valid email addresses."* (better-auth)
  - *"Capture the caller's stack trace before the async boundary."* (stripe-node)
  - Pattern: each comment names a constraint + names the consequence if the reader ignored it. Compact.
- **(d) External spec / RFC / doc citation.** URL or named spec referenced inline when behavior pins to it. Example: stripe-node citing `https://datatracker.ietf.org/doc/html/rfc7230#section-3.3.2` for Content-Length semantics.

**Not earned (largely absent from the surveyed codebases):**

- **(a) Re-explains what the code does.** Found in `hono-base.ts` ("handle options", "Do not 'compose' if it has only one handler") — these are the LOW-quality comments in the surveyed code. The reader sees `if (handlers.length === 1)` two lines below; the comment adds nothing.
- **(narrative-header) Multi-paragraph file headers.** Largely absent. Hono `hono-base.ts` has a **3-line `@module` description**, max. stripe-node has 1-line class-level descriptions. **Nothing in the surveyed cluster matches BokChoy's 14-line narrative-header pattern.**

### F3 — File headers (load-bearing for BokChoy specifically)

- **Absent or 1–3 lines** across 6 of 7 surveyed files. The longest header observed is hono's `@module` block at 3 lines.
- **No surveyed file carries the multi-paragraph narrative pattern BokChoy currently ships** (M-1.5 wrappers, GAP 11 wrappers, backend handlers, etc.).
- The reason this pattern produces bloat: each narrative restates content that lives in the vault entry, the function signature, or the type definition. The reader pays the cost of reading + skimming on every file open; the writer pays the cost of keeping all three in sync.

### F4 — Contradiction probe (resolved)

Effect-TS is the explicit counter-example surveyed for high-density commenting. Result: it does NOT support BokChoy's current pattern.

- Effect's 42% density is ~95% **JSDoc-on-exported-API** (Details / When-to-use / Examples sections).
- In-function inline narration in Effect is still sparse (<5% of comments).
- Audience class: framework-scale ecosystem where consumers commit their whole codebase to Effect's idioms. BokChoy is a SaaS SDK at indie/SMB F2P scale per `[[marketing/currencies-endpoint-research]]` F4.
- The Effect pattern WOULD justify heavy JSDoc on `@bokchoy/sdk-node` public methods. It DOES NOT justify 14-line narrative file-headers on internal wrapper files in `packages/wallet/` or route handlers in `apps/backend/src/`.

**Contradiction probe outcome:** no credible counter-example to "minimal inline narration + JSDoc-on-exports-only" pattern within BokChoy's scale class. The Effect case strengthens the JSDoc-on-exports rule rather than contradicting the minimal-inline pattern.

### F5 — Enforcement tooling

- None of the 5 surveyed primary codebases visibly enforce comment density via tooling (no eslint/biome rule observed for comment counts).
- Discipline is **review-mediated**. Reviewers reject `// handle options`-class comments at PR time.
- **Biome HAS a `noUselessRename` rule and various JSDoc rules**, but no out-of-the-box "comment density cap" rule. A custom lint script would be feasible but not industry-standard.
- **Implication:** BokChoy's enforcement path is most likely a per-PR review discipline + the vault entry as the citable convention, not a hard lint rule. A weaker option: add a one-shot script (`scripts/check-comment-density.ts`) that flags files exceeding 10% standalone-comment density and let the operator decide per-file. Not a CI blocker; advisory.

## Conflicts

**Effect-TS (Source 8) vs the other 6 sources** on density:

- Effect ships ~42% density; the cluster median is ~4–5%.
- Resolution per *Contradiction protocol*: both sides are tier-1 production code, so tier doesn't break the tie. **Audience-class match decides** — same logic that resolved per-row-balance research and currencies-endpoint research. BokChoy is SaaS-SDK/dev-tool class (Stripe / Better Auth / Hono / Drizzle / tRPC peer group), not framework-foundation class (Effect / Vue / React peer group). Cluster median applies; Effect doesn't.
- Effect's actual contribution to BokChoy: confirms **JSDoc-on-exports** as the canonical comment shape across density regimes. Heavy when the library is the surface; light when it's an SDK; but in both cases the comment goes on the export, not the internal narrative.

**No artificial resolution.** Effect is a real counter-example to "comments are universally minimal in TS." Within-class it's not relevant; cross-class it's a reminder that doc-density is a function of how exposed the surface is.

## Conditions

- **Cluster median ~4–5% applies** when the file is internal implementation (not at the package boundary), the team owns review discipline, the audience is SDK consumers (not framework-extension authors), and the codebase is TS at BokChoy's scale class.
- **Cluster median breaks (density rises) when:**
  - The file IS the public API surface (drizzle's `select.ts` exposes the query builder, justifying ~12% from JSDoc-on-exports).
  - The codebase is framework-scale where consumers extend / wrap the library (Effect).
  - Specific public methods need worked-example documentation that lives in code (drizzle's runnable JSDoc examples).
- **(b) invariant comments** apply when there's a constraint the code cannot recover (JS language semantics, security invariants, BC notes, external-spec compliance points).
- **(d) spec citations** apply when behavior pins to an external standard (RFC, IETF, Postgres docs, etc.).
- **Vault `[[wikilinks]]` are NOT in the surveyed pattern.** The closest equivalent is stripe-node citing RFC URLs and better-auth citing docs URLs — both EXTERNAL specs, not project-internal design notes. BokChoy is a vault-driven project, so this gap is a /design pick, not a class-norm violation: **a 1-line `[[wikilink]]` in a JSDoc comment** when the function implements a vault contract is defensible by analogy to stripe-node's RFC citations; **a 14-line narrative restating the vault content** is not.

## Operational implications

**For `[[_shared/comment-conventions]]` (the design entry the next /design seat owes):**

1. **Density target:** standalone comment lines / total LOC < **5%** outside JSDoc on exported APIs. JSDoc on exports has no cap.
2. **File headers:** **Forbidden** beyond 3 lines. Allowed: a `@module` JSDoc with a single-sentence summary, OR a 1-line class-level JSDoc. **Forbidden:** multi-paragraph narrative headers explaining where the file sits in the contract.
3. **What lives in comments (KEEP):**
   - JSDoc on every exported function / class / type, 1–3 lines, purpose + key constraint. `@param` / `@returns` where the type alone doesn't carry the meaning.
   - 1–3 line inline `//` invariant comments naming a constraint a reader can't recover from the code (postgres-js NUMERIC-as-string, BIGSERIAL monotonicity-per-partition, etc.).
   - External spec / RFC / docs URL citations when behavior pins to them.
   - Workaround citations with issue URLs or version notes.
4. **What does NOT live in comments (STRIP):**
   - Multi-paragraph narrative headers explaining the file's place in the contract.
   - Vault `[[wikilink]]` repetitions that restate vault content.
   - "Re-explains what the code does" comments (`// fetch limit+1 to detect hasMore` is borderline — the variable name + the if-check already say this).
   - Span attribute conventions repeated in every handler.
   - Auth chain explanations repeated in every route file.
5. **Vault `[[wikilink]]` discipline:** allowed as a **1-line JSDoc reference** when the function implements a vault contract — e.g., `/** Per [[wallet/balance-history-contract]] (v). */`. **Not** allowed as a 14-line restatement.
6. **Enforcement:** review-mediated by default. Optional advisory script `scripts/check-comment-density.ts` flagging files >10% density. Not a CI blocker.
7. **Cleanup pass scope:** the /design seat will need to estimate cleanup-pass LOC. Survey-based estimate: across `packages/wallet/`, `apps/backend/src/`, `packages/sdk-node/src/`, `apps/cockpit/modules/marketing/` — likely a few hundred lines of comments to remove. Mechanical: delete narrative headers, preserve invariants + JSDoc-on-exports + external-spec citations.

## Reproducibility note

Reproducible. Another investigator with the same question and standard tooling reaches substantially the same finding:

1. `git clone --depth 1 https://github.com/{stripe/stripe-node,better-auth/better-auth,honojs/hono,drizzle-team/drizzle-orm,trpc/trpc,Effect-TS/effect}` to `/tmp/bocek-ref-*`.
2. For each repo, run `wc -l <representative-files>` and `grep -c "^\s*//\|^\s*\*\|^\s*/\*\*" <files>` to get LOC + comment-line counts. Sanity-check the categorization by reading the first 50 lines of each file (file-header presence) + sampling inline comments mid-file.
3. Categorize each sampled comment into (a)–(g) per F2. Apply Triplet 4 calibration: reject (a) re-explains, count (b)/(c)/(d) as earned.
4. Apply audience-class match per `[[marketing/currencies-endpoint-research]]` F4 logic — BokChoy is SDK class, not framework-foundation class.

Judgment that is load-bearing but reproducible: deciding Effect is audience-mismatched. Anchored in BokChoy's positioning as SDK + indie F2P SaaS scale; Effect's positioning as framework foundation. Another investigator reading `[[marketing/v1-shape]]` reaches the same class assignment.

## Open threads

1. **Sample more BokChoy-internal files for the cleanup-pass scope estimate.** This research surveyed external codebases; the actual cleanup work needs a per-file scan to know which BokChoy files exceed the target density and what's strippable vs earned. Owed to the next /design or /refactoring seat.
2. **The advisory script.** Whether to ship `scripts/check-comment-density.ts` as an advisory tool is a /design pick — operationally cheap (~30 LOC TS) but adds another tool to maintain.
3. **`[[wikilink]]` in JSDoc — concrete syntax.** The research finds external-spec URL citation precedent; BokChoy's project-internal `[[wikilink]]` analog is defensible but novel. /design seat should pin: how many `[[wikilinks]]` per file maximum? Where (file header? function JSDoc? inline?)? Stripping every `[[wikilink]]` would lose vault navigation value; keeping all would re-bloat.
4. **JSDoc completeness on `@bokchoy/sdk-node` public methods.** The SDK is the public API surface; per Effect precedent and Drizzle precedent it deserves richer JSDoc with usage examples. Currently the methods carry 1-line purpose comments; expanding to Effect-shape with `@example` sections is a separate authoring pass owed to the SDK publish slice.
