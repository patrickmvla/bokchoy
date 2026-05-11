---
type: decision
features: [_shared, wallet, architecture]
related: ["[[direct-mutation-lint-opt-out-research]]", "[[wallet-mechanics]]", "[[reaper-schedule-deferral]]", "[[wallet-http-contract]]", "[[gaps]]"]
created: 2026-05-10
confidence: high
---

# Direct-mutation lint opt-out shape: N=1 lookback + dual `//`/`--` recognition (β)

## Decision

`scripts/check-direct-wallet-mutation.ts` recognizes the `// allow-direct-mutation: <reason>` opt-out comment on the SAME line as the SQL hit OR on the line IMMEDIATELY PRECEDING it. The opt-out marker pattern is widened to also accept Postgres `--` comment style: `OPT_OUT_RE = /(?:\/\/|--)\s*allow-direct-mutation\b/`. This lets the opt-out comment live INSIDE a multi-line `sql\`...\`` template literal (where TS `//` comments cannot live) as a Postgres `--` comment on the line directly above the SQL keyword.

The script change is mechanical:

1. **Update `OPT_OUT_RE`** to accept either `//` or `--` opt-out marker prefix:
   ```ts
   const OPT_OUT_RE = /(?:\/\/|--)\s*allow-direct-mutation\b/;
   ```
2. **Replace the same-line-only check** at the per-line scan loop:
   ```ts
   function isOptedOut(lines: string[], i: number): boolean {
     return OPT_OUT_RE.test(lines[i]) || (i > 0 && OPT_OUT_RE.test(lines[i - 1]));
   }
   if (isOptedOut(lines, i)) continue;
   ```
3. **Update the failure-message tail** at the script's end-of-scan branch to name both placement options explicitly (TS `//` same-line OR line-above; SQL `--` line-above-keyword inside template).
4. **Update the script's header comment** with one worked example showing the multi-line `sql\`...\`` template with `--` opt-out inside the template.

The on-disk `apps/backend/src/idempotency/middleware.ts` opt-out comments are repositioned from outside the template (current shape: TS `// allow-direct-mutation: ...` 2 lines above the SQL keyword on a separate TS line) to inside the template as Postgres `--` comments on the line immediately above each SQL keyword:

```ts
const inserted = await tx.execute<{ id: number }>(sql`
  -- allow-direct-mutation: idempotency-middleware (slice 8.1b — IS the trigger event for [[reaper-schedule-deferral]] per Part 3 A17)
  INSERT INTO idempotency_keys
    (project_id, idempotency_key, request_method, request_path, request_params, locked_at)
  VALUES
    (${projectId}::uuid, ${idempotencyKey}, ${c.req.method}, ${c.req.path}, ${JSON.stringify(requestParams)}::jsonb, NOW())
  RETURNING id
`);
```

Same shape for the two UPDATEs at slice 8.1b's recovery and completion paths.

The discipline cascade unchanged: every protected-table mutation outside `packages/wallet/` (the M1-trigger boundary per `[[wallet-mechanics]]` Amendment Part 1 A1) needs an opt-out comment with a documented reason; absent the comment, CI fails red. Per-statement granularity preserved — one comment, one mutation it covers.

## Reasoning

**Per-statement granularity is the right scope for this codebase.** `[[reaper-schedule-deferral]]` line 57 names the per-statement opt-out PR review as the *trigger event* for slice 6.5 reaper scheduling: *"the implementer adds `// allow-direct-mutation: idempotency-middleware` (or equivalent) to silence the lint — that opt-out PR is the trigger event."* Region markers (rejected alternative α) would dilute that signal — one start marker, one reason, multiple covered statements. The vault contract requires the trigger to fire on a *specific opt-out comment review*, not on a region-bounded "trust the markers" review. (vault-aligned via `[[reaper-schedule-deferral]]`; confidence: high)

**(β)'s failure mode is loud; (α)'s is silent.** Concrete attack on (α) — engineer adds `DELETE FROM idempotency_keys WHERE ...` inside an existing `start`/`end` region six months from now. Lint passes (range covers the addition). The reason on the start marker said "INSERT trigger event," not "DELETE." Reviewer skims the file diff, sees the addition is inside the markers, infers "already justified," merges. Granularity loss → audit signal degraded → trigger event silently absorbed. Concrete attack on (β) — same engineer adds `DELETE FROM idempotency_keys` without a `--` opt-out on the line above. Lint fails CI; engineer must add their own justification or bring it to PR review. Discipline preserved at the gate, not at the reviewer. **Loud-fail-on-omission preferred over silent-cover-by-region** for a discipline tool whose explicit purpose is reviewer-mediated trigger detection. (production-cited × 3 N=1 next-line per `[[direct-mutation-lint-opt-out-research]]` F1; confidence: high)

**Industry-cite breadth.** N=1 next-line is production-cited × 3 (Biome `// biome-ignore` per Source 1 of `[[direct-mutation-lint-opt-out-research]]`; ESLint `eslint-disable-next-line` per Source 2; TS `// @ts-expect-error` per Source 3). All three current TS lint/typecheck tools converge on N=1 next-line as the canonical per-statement suppression directive. (production-cited × 3; confidence: high)

**`--` SQL comment recognition is structurally necessary.** Per `[[direct-mutation-lint-opt-out-research]]` F2, multi-line `sql\`...\`` is the production form for non-trivial protected-table mutations in this codebase. TS `//` comments cannot live inside a template literal — string-content, not TS-context. The `--` form lives where the comment is needed (proximate to the SQL keyword inside the template) and is canonical Postgres SQL syntax — Postgres parses it as comment-to-end-of-line, harmless to execution. (docs-cited × 1 Postgres SQL comment grammar; production-cited × 1 sample SQL fragments inside `sql\`...\`` per Better Auth survey; confidence: high)

**Lint-script complexity.** (β): regex alternation + N=1 lookback ≈ 3-line script change. (α): start/end pairing detection + nesting (Biome supports nested ranges per Source 1 of research) + unmatched-end-marker diagnostic ≈ 30+ line change with new edge cases. (β) is the smaller blast radius. (inferred from script reading; confidence: high)

## Engineering substance applied

- **Failure semantics:** loud failure on missing opt-out (CI red on lint hit, no opt-out anywhere within N=1 lookback) over silent granularity drift. The lint mechanism's explicit purpose is detecting M1-bypass at PR review per `[[wallet-mechanics]]` Amendment Part 1 A1; loud-fail-on-omission preserves the contract.
- **Concurrency:** N/A — lint is static analysis at CI time.
- **Operability:** error message names both placement options explicitly so the engineer who hits the lint knows the canonical fix without reading the script source. Failure message: *"add `// allow-direct-mutation: <reason>` to the line or the line above (TS context), OR `-- allow-direct-mutation: <reason>` immediately preceding the SQL keyword inside the template literal."*
- **Reversibility:** lint script change is reversible at any time. Existing inline `// allow-direct-mutation:` opt-outs (in test setup or future single-line `sql\`\`` calls) continue to work unchanged. Backing out (β) requires rewriting any `--` opt-outs back to `//`, which is a grep-and-edit pass.
- **Lock-in tax:** zero. The script is internal; no external API contract depends on the opt-out shape. Future migration to a Biome plugin (when GritQL plugin maturity per `[[tooling-research]]` Q1 supports it) re-asks the question with Biome's rule-suppression model as the new substrate.
- **Security:** the lint preserves the 1:1 mapping between "protected mutation" and "documented justification." Per-statement opt-out maintains the audit signal of "this specific write is M1-authorized for this specific reason." Region markers break the 1:1 — wrong granularity for the security property.
- **Storage / Networking:** N/A.

## Production-grade gates

- **Idiomatic** — N=1 next-line is the production-cited × 3 convention TS engineers reach for instinctively (Biome, ESLint, TS handbook all converge per `[[direct-mutation-lint-opt-out-research]]` F1). The `--` extension is an acknowledgment that opt-outs need to live where TS `//` comments structurally cannot — inside template-literal SQL bodies — and `--` is canonical Postgres SQL comment syntax. The hybrid honors the *spirit* of the N=1 next-line convention (per-statement, line-immediately-preceding) while accommodating the Drizzle multi-line `sql\`...\`` template idiom. (production-cited × 3 + docs-cited; confidence: high)
- **Industry-standard** — Biome 2.x ships `// biome-ignore lint/<rule>: <reason>` next-line; ESLint ships `// eslint-disable-next-line <rule>`; TypeScript ships `// @ts-expect-error`. Three named systems, all current docs-pinned 2026-Q2. The `--` SQL-comment alternative is widely deployed across every Postgres-using codebase as inline SQL annotation. (production-cited × 3; confidence: high)
- **First-class** — uses regex pattern matching, the existing script's mechanism. Does not introduce AST parsing or Biome plugin authoring. Stays inside the existing tool's scope. The N=1 lookback is a 1-line addition; the regex alternation is a 1-line edit. (first-class; confidence: high)

## Rejected alternatives

### (α) Range markers `// allow-direct-mutation-start: <reason>` ... `// allow-direct-mutation-end`

**What:** wrap a region of TS code in start/end markers. The lint script tracks marker pairing, suppresses any protected-table mutation found between matching markers.

**Wins when:** the team values reviewable region boundaries over per-statement granularity, AND the M1-trigger boundary is genuinely *file-wide* or *block-wide* (every mutation in the wrapped region is authorized by definition). Production-cited × 2 (Biome `biome-ignore-start`/`-end`, ESLint `/* eslint-disable */` ... `/* eslint-enable */` per `[[direct-mutation-lint-opt-out-research]]` Sources 1+2).

**Why not here:** `apps/backend/src/idempotency/middleware.ts` is single-purpose middleware, not an M1-boundary file analogous to `packages/wallet/`. The 3 SQL statements in it (INSERT new, UPDATE re-lock, UPDATE complete) have *distinct* justifications — INSERT is the trigger event for `[[reaper-schedule-deferral]]`; UPDATEs are recovery and completion paths per `[[idempotency-strategy]]`. Each warrants its own annotation. Region markers conflate them. **The granularity-loss attack** (silent additions inside an existing range, six months later, bypass the per-statement audit signal that `[[reaper-schedule-deferral]]` line 57 contractually requires) is the load-bearing failure mode that rejects (α) here.

### (γ) Rewrite middleware to Drizzle query builder + accept mid-chain `// allow-direct-mutation:` placement

**What:** replace `await tx.execute(sql\`INSERT INTO ...\`)` with `await tx.insert(idempotencyKeys).values({...})`. Place the opt-out comment between `.insert(idempotencyKeys)` and `.values({...})` so the existing same-line rule fires.

**Wins when:** Drizzle query-builder idiom alignment (per `[[direct-mutation-lint-opt-out-research]]` F2) dominates lint-mechanism simplicity, AND mid-chain fluent-API comments are an accepted code style on the team.

**Why not here:** the lint problem is broader than this middleware's `sql\`` choice — it's about *cross-cutting middleware that mutates protected tables in multi-line statements*. Future audit-log, outbox-dispatcher, DSR-queue middlewares may use raw SQL or query builder; each may have multi-line constructs in production. (γ) forces coding style on every future cross-cutting middleware. The lint mechanism should be agnostic to SQL idiom, not a code-style enforcer. Mid-chain fluent-API comments also read as stranded comments — TS engineers expect comments above statements, not between method calls in a fluent chain.

F2's secondary question (should the on-disk middleware rewrite to Drizzle query builder for ecosystem-norm alignment) stays separable. /design or a future code-review pass may pick that up; the answer is orthogonal to the lint-mechanism shape pinned here.

### (a) K=2 lookback — FALSIFIED

The original /design pre-research pick. Per `[[direct-mutation-lint-opt-out-research]]` F1: no production lint tool ships K>1 lookback as a primary directive. The "TS-ecosystem convention" label attached to K=2 was inferred from training data, not verified against current Biome/ESLint/TS docs. Per *Contradiction protocol*: F1 (current docs × 3) wins over training-data inference. Dropped from candidate set; fails *Production-grade default* industry-standard gate (≥2 named systems requirement).

### (d) Per-file EXCLUDE_PREFIXES — REJECTED EARLIER

Add `apps/backend/src/idempotency/` to `EXCLUDE_PREFIXES` alongside `packages/wallet/`. Treat the file as a known M1-trigger boundary.

**Why not here:** `[[reaper-schedule-deferral]]` line 57 explicitly relies on per-statement opt-out PR as the trigger event for reopening slice 6.5. Per-file exclusion silently covers all writes in the file — INSERT lands without a comment, no opt-out PR review fires, no trigger event detected, reaper schedule reminder lost. **Contradicts already-vaulted decision.**

## Failure mode

**Primary failure mode (β): placement precision tax.** A developer writes a protected-table mutation in multi-line `sql\`...\`` template form but puts the `-- allow-direct-mutation:` comment 2 lines above the SQL keyword (e.g., above the `await tx.execute(sql\`` opener as TS `//`, expecting it to cover the multi-line template). N=1 lookback misses it; lint fails CI. The lint failure message names both placement options; engineer reads, repositions the comment one line down (or moves it inside the template as `--`).

**Frequency at scale:** ~1 PR cycle per first-time author of a multi-line `sql\`...\`` mutation. Self-correcting after the first encounter (engineers retain placement convention after one feedback loop). At BokChoy's solo-dev scale, manageable.

**Secondary failure mode: misplacement inside template.** Developer puts `-- allow-direct-mutation:` AFTER the SQL keyword inside the template (rather than above it). Postgres still parses as comment, harmless to SQL. Lint regex doesn't see it on the line preceding the keyword; CI fails. Same fix.

**Tertiary failure mode (rare): template-literal-content collision.** A developer writes a SQL statement whose content happens to include the bare string `// allow-direct-mutation` or `-- allow-direct-mutation` as actual SQL text (e.g., a string literal value: `INSERT INTO logs VALUES ('-- allow-direct-mutation:test')`). The lint regex would false-match this as an opt-out. **Probability extremely low** — protected-table content rarely embeds opt-out marker strings as data. Mitigation: code review catches it; if it ever happens, fix the regex to require the marker at start-of-line or after non-significant whitespace only (current regex already requires word-boundary `\b` after the marker, which limits but doesn't eliminate the collision class).

## Mitigations

- **Failure-message tail** updated to name both placement options explicitly: *"add `// allow-direct-mutation: <reason>` to the line or the line above it (TS context), OR `-- allow-direct-mutation: <reason>` immediately preceding the SQL keyword inside the template literal."*
- **Script header comment** updated with a worked example showing the multi-line `sql\`...\`` template with `--` opt-out inside the template, and the existing single-line `tx\`UPDATE wallets ...\`; // allow-direct-mutation: ...` example retained for the inline case.
- **Vault wikilink** to this entry from `[[wallet-mechanics]]` Amendment Part 1 A1 (the place that introduces the lint mechanism). Future cross-cutting middleware authors find the canonical opt-out shape via that path.
- **PR review discipline** retained as the granularity check (per-statement annotation prevents accidental coverage of unrelated mutations).

## Idiom citations

- `idioms/typescript.md` doesn't directly cover custom-lint comment conventions. The broader principle *"Make impossible states unrepresentable"* applies — make "undocumented protected-table mutations" unrepresentable at the CI gate. (β) achieves this with per-statement granularity preserved.
- The N=1 next-line convention is itself a TS-ecosystem idiom evidenced by Biome/ESLint/TS convergence per `[[direct-mutation-lint-opt-out-research]]` F1, even though it's not encoded as a principle in the BokChoy-side `idioms/typescript.md` file.

## Revisit when

- **Future cross-cutting middleware mutates protected tables in a *region* of multiple coordinated statements** (e.g., a transactional outbox dispatcher that INSERTs to `staged_jobs` then UPDATEs `transactions` then DELETEs from a queue, all sharing one M1-trigger justification). The per-statement annotation cost may compound; a hybrid rule could allow ranges OR per-statement. Re-evaluate (α) range markers as a complementary mode at that point — not a replacement.
- **Custom Biome plugin maturity** — Biome v2.x GritQL plugin system is "first iteration" per `[[tooling-research]]` Q1. When plugin maturity supports first-class rule suppression with proper AST awareness, the BokChoy lint could migrate from Bash/TS scripted check to a real Biome rule. The per-statement-vs-region question would be re-asked at that point with Biome's rule-suppression model as the new substrate.
- **`[[reaper-schedule-deferral]]` reopen trigger fires** (slice 8.1b ships per-statement opt-out, slice 6.5 schedules the reaper). After the trigger fires and the reaper schedules, the trigger-detection contract is satisfied; the per-statement-vs-region tradeoff weakens for *new* cross-cutting middleware. Future protected-table writers may not need the same per-statement-trigger semantics. Re-evaluate the granularity choice as new use cases land.
- **Regex collision class observed in the wild** — if a SQL statement's content ever embeds an opt-out marker string as data, tighten the regex to require the marker at start-of-line or after non-significant whitespace only. (Pre-emptive: probability extremely low. Reactive: easy fix.)
