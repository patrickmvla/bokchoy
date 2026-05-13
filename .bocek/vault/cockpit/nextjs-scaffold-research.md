---
type: research
features: [cockpit]
related: ["[[cockpit/file-structure]]", "[[cockpit-stack-integration-research]]", "[[frontend-stack]]", "[[cockpit/auth-surface-mount]]"]
created: 2026-05-12
confidence: high
provisional: false
---

# How does a first-class Next.js 16 + Tailwind v4 + TS cockpit scaffold differ from the hand-rolled `apps/cockpit/` at 2026-05-12, and which deviations are wrong vs. defensible?

## Question

The cockpit scaffold under `apps/cockpit/` was built by hand without `create-next-app`. Slice 8.3.1 ships `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `next-env.d.ts`, `app/{layout.tsx,page.tsx,globals.css}`, `lib/{query-client.ts,react-query-providers.tsx,utils.ts}` — pre-shadcn, pre-auth. Question: what would `create-next-app@canary --typescript --tailwind --eslint --react-compiler` have produced, what's in the canonical docs as first-class, and where is the current scaffold deviating in ways that will break implementation downstream?

## Triangulation

- **Production reference:** ✓ — `vercel/next.js@9a48c22c17ed834ec83c2412acf392972280243b` (canary HEAD 2026-05-11), `packages/create-next-app/templates/app-tw/ts/*` + `packages/create-next-app/templates/index.ts` (generator). Observed via GitHub API 2026-05-12.
- **Docs reference:** ✓ — `nextjs.org/docs/app/api-reference/config/next-config-js/{cacheComponents,reactCompiler,turbopack}` + `.../api-reference/config/typescript`, all version 16.2.6 (lastUpdated 2026-05-07).
- **Contradiction probe:** ✓ — searched for Tailwind v3 patterns (`tailwind.config.ts` + `@tailwind base/components/utilities` directives) vs. v4 path (`@tailwindcss/postcss` plugin + `@import "tailwindcss"` + optional `@theme` block in CSS). Current canonical is v4 unanimously across template + generator + docs. No live contradiction found in surveyed material. Older blog tutorials still showing v3 are outdated for Next.js 16 stack.

## Sources examined

### Source 1 — `vercel/next.js` `packages/create-next-app/templates/app-tw/ts/`
- **Tier:** 1 — production code.
- **Provenance:** `github.com/vercel/next.js` at commit `9a48c22c17ed834ec83c2412acf392972280243b` (canary HEAD), observed 2026-05-12. Files: `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `biome.json`, `gitignore`, `app/{layout.tsx,page.tsx,globals.css}`.
- **Author context:** Vercel core team — this is the *generated output* of `create-next-app --tailwind --typescript`. Maintained by the Next.js engineers who own the framework. As production-cite-strength as it gets.
- **What it tells us:** The exact file-by-file shape of a first-class Next.js 16 + Tailwind v4 + TS app at canary, including the ESLint flat config, the Tailwind v4 PostCSS-only path, the `next-env.d.ts` content, and the `app/` shell.

### Source 2 — `vercel/next.js` `packages/create-next-app/templates/index.ts` (generator)
- **Tier:** 1 — production code.
- **Provenance:** Same repo + SHA, `packages/create-next-app/templates/index.ts`. Observed 2026-05-12.
- **Author context:** Vercel core team.
- **What it tells us:** Generated `package.json` shape — dependency versions, devDependency mapping, script names, conditional injections for `--react-compiler` / `--tailwind` / `--eslint` / `--biome`. Critically, **`reactCompiler: true` is injected at top level of `nextConfig`** (line 122), confirming the doc claim. `react`/`react-dom` peer version is pinned to `19.2.6` (line 21). `@tailwindcss/postcss` + `tailwindcss` at `^4`, `eslint` at `^9`, `@biomejs/biome` at `2.4.2`.

### Source 3 — `nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents`
- **Tier:** 2 — official docs.
- **Provenance:** version 16.2.6, lastUpdated 2026-05-07. Observed 2026-05-12.
- **What it tells us:** `cacheComponents: true` is a top-level `NextConfig` option (NOT under `experimental`). Introduced in Next.js 16.0.0. Subsumes `ppr`, `useCache`, `dynamicIO`. Cockpit's current placement in `next.config.ts` is correct.

### Source 4 — `nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler`
- **Tier:** 2 — official docs.
- **Provenance:** version 16.2.6, lastUpdated 2026-05-07. Observed 2026-05-12.
- **What it tells us:** `reactCompiler: true` is a top-level `NextConfig` option. Requires `babel-plugin-react-compiler` as devDep. Cockpit gets the key shape right and the dep is listed at `^1.0.0`.

### Source 5 — `nextjs.org/docs/app/api-reference/config/next-config-js/turbopack`
- **Tier:** 2 — official docs.
- **Provenance:** version 16.2.6, lastUpdated 2026-05-07. Observed 2026-05-12.
- **What it tells us:** **`experimental.turbo` was removed in Next.js 16**; the canonical key is `turbopack` at top level. Next.js *auto-detects* the workspace root by looking for `pnpm-lock.yaml` / `package-lock.json` / `yarn.lock` / `bun.lock` / `bun.lockb`. Manual `turbopack.root` is only required "if you have a different project structure, for example if you don't use workspaces" or for linked deps outside the project root.

### Source 6 — `nextjs.org/docs/app/api-reference/config/typescript`
- **Tier:** 2 — official docs.
- **Provenance:** version 16.2.6, lastUpdated 2026-05-07. Observed 2026-05-12.
- **What it tells us:** `next-env.d.ts` is auto-generated by `next dev` / `next build` / `next typegen` and should NOT be hand-edited (file comment: "This file should not be edited"). The docs explicitly say: "We recommend adding `next-env.d.ts` to your `.gitignore` file." Per-route types are emitted to `.next/types/**/*.ts`; the docs recommend adding that path to `tsconfig.json` `include`. For `typedRoutes`, both `.next/types/**/*.ts` (build) and `.next/dev/types/**/*.ts` (dev) entries appear in the canonical template's `include`.

### Source 7 — `apps/cockpit/` current scaffold on-disk
- **Tier:** 1 — production code (this repo).
- **Provenance:** working tree at HEAD `4771c50` + untracked additions, observed 2026-05-12. Files audited: `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `postcss.config.mjs`, `app/{layout.tsx,page.tsx,globals.css}`, `lib/{query-client.ts,react-query-providers.tsx,utils.ts}`.
- **What it tells us:** The baseline against which deviations are measured.

## Findings

### F1 (LOAD-BEARING) — Cockpit ships NO linter. Canonical ships one (ESLint default, Biome optional)

Source 1 ships **`eslint.config.mjs`** (ESLint 9 flat config using `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`) AND **`biome.json`** (Biome 2.4.2 with `tailwindDirectives` + `organizeImports`). Source 2 generator conditionally injects either when the user picks `--eslint` or `--biome`; the default flow prompts and one always wins. The canonical `package.json` ships `lint: "eslint"` (or `lint: "biome check"` + `format: "biome format --write"`).

Cockpit `apps/cockpit/package.json`: **no `lint` script. No `eslint` / `eslint-config-next` / `@biomejs/biome` dep. No `eslint.config.mjs` or `biome.json` on disk.** No static analysis at all.

Per `[[cockpit-stack-integration-research]]` F8.15 (barrel-import anti-pattern is *CRITICAL* — tree-shaking blocker) and F6 12-row anti-pattern table, the cockpit's PR enforcement relies on ESLint rules being live (e.g., `@next/next/no-img-element`, `import/no-cycle`, Tailwind class-order plugin). With no linter, every F6/F8 rule degrades to manual PR review. **Cannot ship.**

### F2 (LOAD-BEARING) — `tsconfig.json` deviations

Cockpit `apps/cockpit/tsconfig.json` extends `../../tsconfig.base.json` (which sets `target: ES2022`, `strict: true`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, `declaration: true`, `types: []`). The per-app override block deviates from Source 1 canonical on five axes:

1. **`jsx: "preserve"`** vs canonical **`jsx: "react-jsx"`**. With `preserve`, TS leaves JSX as-is for the downstream bundler (SWC in Next.js) to transform. With `react-jsx`, TS transforms to `_jsx`/`_jsxs` calls. Both work end-to-end (Next.js SWC accepts both); `react-jsx` lets TS verify the JSX runtime types directly. **Deviation; defensible but unjustified — canonical is `react-jsx`, no documented BokChoy-side reason to prefer `preserve`.**

2. **`types: ["node"]`** vs canonical (no `types` field set). With `types: ["node"]`, *only* `@types/node` is auto-included as a global. `@types/react` and `@types/react-dom` types are still available via import chains in `.tsx`, but any package that augments globals (e.g., `@types/react-dom/server` for `createRoot` typings, Next.js's own global type augmentation) requires it to be in the `types` list or auto-discovered. Canonical does NOT restrict. **Deviation; risk of silent type-resolution gaps.** Drop the restriction or expand to `["node", "react", "react-dom"]`.

3. **`include` missing `.next/dev/types/**/*.ts`** and missing `**/*.mts`. Canonical Source 1: `["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts", "**/*.mts", "**/*.mts"]`. Cockpit has only `["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`. **Deviation; `tsc --noEmit` will not pick up dev-mode typed routes** generated by `next dev` (the live `Route` literal validation per the typescript docs page §"Statically Typed Links"). Add both.

4. **Explicit `declaration: false`, `declarationMap: false`, `incremental: true`, `noEmit: true`** — overrides on top of base. `declaration:false`/`declarationMap:false` defensible (app, not library). `incremental:true` matches canonical (Source 1). `noEmit:true` matches canonical. No deviation of consequence here beyond verbosity.

5. **`paths: { "@/*": ["./*"] }`** — matches canonical when `--src-dir` flag is OFF (which is what cockpit's `[[cockpit/file-structure]]` decided — flat `app/` not `src/app/`). No deviation.

### F3 (LOAD-BEARING) — `next-env.d.ts` should be gitignored, not committed

Source 1 `gitignore` (last line): `next-env.d.ts`. Source 6 docs: "We recommend adding `next-env.d.ts` to your `.gitignore` file." File comment in the file itself: "This file should not be edited" — it's regenerated by `next dev` / `next build` / `next typegen` on every run.

Cockpit `apps/cockpit/next-env.d.ts` is currently **untracked**, so the cockpit hasn't committed it yet. Good. The risk: the cockpit's untracked content has `import "./.next/dev/types/routes.d.ts";` (the dev-mode path) while Source 1 canonical has `import "./.next/types/routes.d.ts";` (the build-mode path). Both are valid; the file regenerates with whichever command was last run. **Don't add it to git. Add `apps/cockpit/next-env.d.ts` to monorepo `.gitignore`** (or rely on the existing root-level `next-env.d.ts` line if present).

Verified 2026-05-12: monorepo root `.gitignore` (`/home/mvula/audhd/bokchoy/.gitignore`, 936 bytes) does NOT contain `next-env.d.ts`. **Must add before any cockpit commit that includes the file.** Either `next-env.d.ts` or `**/next-env.d.ts` works; the wildcard form is safer for future Next.js apps under `apps/`.

### F4 (LOAD-BEARING — SUPERSEDED 2026-05-12 for shadcn-adopting cockpit) — `globals.css` is bare; missing CSS variables and `@theme` block required for shadcn

**Amendment 2026-05-12 — F4 SUPERSEDED for the cockpit by `[[cockpit/shadcn-setup-research]]` F6 / C1.**

F4 below quotes `vercel/next.js@9a48c22c` `create-next-app@canary` `app-tw/ts/app/globals.css` as the canonical shape (hex colors, 2-token `@theme inline`, `@media (prefers-color-scheme: dark)`). That shape IS the canonical for **pre-shadcn** Next.js + Tailwind v4 scaffolds. **For cockpit, which IS adopting shadcn (per `[[cockpit/shadcn-setup]]` decision 2026-05-12), the shadcn-v4 globals.css canonical supersedes** — OKLCH (not hex), 30+ tokens (sidebar/chart variants), `@custom-variant dark (&:is(.dark *))` class-based (not media query), `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, `@layer base { * { @apply border-border outline-ring/50; } }`. Both shapes are production-cited (Source 1 here vs `shadcn-ui/ui` `apps/v4/app/globals.css` there); precedence per *Contradiction protocol* — for the consumer adopting shadcn, the shadcn canonical wins.

Operational consequence: slice 8.3.1 implemented F4's `create-next-app` shape; slice 8.4 init (`shadcn init`) will overwrite it with the shadcn-v4 shape. Acceptable destruction; sequencing was correct (pre-shadcn shape was needed for slice 8.3.1's standalone correctness; shadcn shape is needed for slice 8.4's primitive adoption).

---



Source 1 `app/globals.css`:

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
```

Cockpit `app/globals.css`: just `@import "tailwindcss";`.

The `@theme inline` block is Tailwind v4's mechanism for mapping CSS custom properties into Tailwind utility classes — `--color-background` → `bg-background`, `--color-foreground` → `text-foreground`, etc. Without it, the utility class names that shadcn primitives generate (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, `text-primary-foreground`, `ring-ring`, etc. — the full shadcn token system) **resolve to nothing**.

Per `[[cockpit/file-structure]]` cascade #4 (slice 8.3 ships shadcn CLI bootstrap to `components/ui/`) and `[[cockpit-shape]]` I1 (sidebar nav + shadcn primitives are the cockpit shape), shadcn primitives are queued for slice 8.4. **The bare globals.css will break shadcn at copy-in time.** Expand before shadcn ships. Use canonical's `@theme inline` block as the baseline; shadcn CLI will add its own token registrations on top.

### F5 — `app/layout.tsx` has no font loading via `next/font`

Source 1 `app/layout.tsx` loads `Geist` + `Geist_Mono` via `next/font/google` and applies CSS variables `--font-geist-sans` / `--font-geist-mono` to `<html className>` — Geist is Vercel's font, free-tier, no FOIT/FOUT issues via Next.js's font-self-hosting. Cockpit `app/layout.tsx` has no font setup; browser falls back to whatever the `body` `font-family` resolves to (currently nothing → user-agent default).

Not load-bearing. Defensible deferral — but if cockpit ships to production without a pinned font, dev-vs-prod render will differ across browsers. Either pick a font via `next/font` (Geist matches canonical + Vercel-platform-native) or document the deferral with a slice-target date.

### F6 — `turbopack: { root: ... }` is likely redundant in Next.js 16

Source 5 docs (turbopack page): "Next.js automatically detects the root directory of your project. It does so by looking for one of these files: `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock`, `bun.lockb`." The cockpit's monorepo root has `bun.lock` (confirmed via git status). **Next.js 16 should auto-detect via `bun.lock` without the manual pin.**

The cockpit's `next.config.ts` comment says "without this, Next.js may detect a different lockfile (e.g., `~/package-lock.json`) as the workspace root" — that risk was real in earlier Turbopack versions; per the current docs it's now auto-detected via the lockfile presence. **Defensive but probably unnecessary.** Test by removing and observing `next dev` output; if Next.js logs "workspace root detected at /home/mvula/audhd/bokchoy", drop the manual pin.

**Amendment 2026-05-12 — F6 "redundant pin" claim FALSIFIED by empirical verification.**

Per operational implication #10, the pin was removed from `apps/cockpit/next.config.ts` and `bun run dev` was run. Next.js 16.2.6's lockfile auto-detect picked a stray `/home/mvula/package-lock.json` (in operator's `$HOME`, OUTSIDE the monorepo) as the workspace root and demoted `apps/../bun.lock` to an "additional lockfile" with the warning:

```
⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
  We detected multiple lockfiles and selected the directory of
  /home/mvula/package-lock.json as the root directory.
  ...
  Detected additional lockfiles:
    * /home/mvula/audhd/bokchoy/bun.lock
```

The pin was restored. F6 implicitly assumed `bun.lock` would be the first or only lockfile found walking up from cwd; in practice, **any stray lockfile in `$HOME`** (left over from a global `npm install`, an unrelated personal project, or a tutorial repo cloned into home) wins because it's higher in the walk than the monorepo. The Source 5 docs text ("Next.js auto-detects") is technically correct — auto-detection runs — but auto-detection picks WHATEVER lockfile is highest, not specifically the project's. The failure mode is implicit, not surfaced in the docs.

**Verdict: pin is load-bearing on any operator machine with stray lockfiles above the repo. NOT cleanup-pass-removable.** Pin restored in `apps/cockpit/next.config.ts` slice 8.3.x item #10. See F9 (new finding) for the related `next.config.ts` ESM-mode-import bug surfaced + fixed in the same verification pass.

### F7 — Missing canonical files

Cockpit lacks these files that canonical ships:
- `eslint.config.mjs` (covered by F1).
- `biome.json` (optional alternative to ESLint, covered by F1).
- `public/` directory with at minimum `favicon.ico` — without it, `/favicon.ico` 404s in dev. Add an empty `public/favicon.ico` (or BokChoy-branded one when available).
- `.env.example` — canonical template ships one for env-var documentation. Cockpit will need `BOKCHOY_BACKEND_URL` + `BETTER_AUTH_URL` + OAuth client IDs documented per `[[cockpit/auth-surface-mount]]`. Add at slice 8.3.2 or 8.3.3.
- `README-template.md` rename → `README.md`. Cosmetic.

### F8 — Configurations cockpit got CORRECT (do not change)

- `cacheComponents: true` at top level of `NextConfig` — matches Source 3 verbatim.
- `reactCompiler: true` at top level — matches Source 4 + Source 2 generator injection.
- `babel-plugin-react-compiler@^1.0.0` devDep — matches Source 2 generator.
- `tailwindcss@^4` + `@tailwindcss/postcss@^4` devDeps — matches Source 2 generator (cockpit pins `^4.0.0`, Source 2 pins `^4`, equivalent semver).
- `postcss.config.mjs` plugin shape — matches Source 1.
- `app/globals.css` first line `@import "tailwindcss";` — matches Source 1 (the rest is missing per F4).
- `tsconfig.json plugins: [{ name: "next" }]` — matches Source 1.
- `tsconfig.json paths: { "@/*": ["./*"] }` — matches Source 1 (no `--src-dir`).
- `next.config.ts` async `rewrites()` block — design-specific (per `[[cockpit/auth-surface-mount]]` V3), not in canonical. Defensible BokChoy addition.
- `lib/query-client.ts` `React.cache(...)` wrap of `QueryClient` factory — per `[[cockpit-stack-integration-research]]` F5.6 + Vercel `server-no-shared-module-state` rule. Not canonical create-next-app output (it ships no TanStack Query); design-specific, correctly implemented.
- `lib/utils.ts` `cn()` helper — shadcn canonical helper. Correct placement (slice 8.4 dep).

### F9 (LOAD-BEARING, NEW 2026-05-12) — `next.config.ts` ESM-mode loader is incompatible with runtime `node:*` imports

Surfaced empirically while resolving F6's verification protocol. When the cockpit `next.config.ts` contains any runtime `import` statement (e.g., `import { dirname, resolve } from 'node:path'`, `import { fileURLToPath } from 'node:url'`), `next dev` crashes config load with:

```
⨯ Failed to load next.config.ts
ReferenceError: exports is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension
and '/home/mvula/audhd/bokchoy/apps/cockpit/package.json' contains "type": "module".
To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at <unknown> (next.config.compiled.js:13:23)
```

**Root cause:** Next.js's `next.config.ts` loader compiles TS to `.next/next.config.compiled.js` and emits CJS-style `exports.X = ...` to that file. The cockpit `package.json` has `"type": "module"`, which makes any `.js` file in the package ESM-mode by Node's resolution rules. Node refuses to evaluate CJS `exports.X` in an ESM context.

**Trigger:** the loader emits CJS specifically when the source has runtime `import` statements. A config with only `import type` (erased at compile time) compiles to ESM-compatible output and loads fine. Adding even one runtime `import` flips the emit mode and breaks load.

**Why it stayed invisible through slices 8.3.0 + 8.3.1:** the slice-8.3 verification gate was `bun run typecheck` + `bun run lint`. Both pass on a config with runtime imports (the TS is valid; Biome accepts it). The failure only surfaces at config-load runtime, which happens during `bun run dev` / `bun run build`. Neither was exercised in those slices.

**Workaround / canonical pattern:** use only language built-ins to compute runtime values in `next.config.ts`:

| Pattern | Status | Notes |
|---|---|---|
| `import type { NextConfig } from 'next'` | ✓ | Erased at compile time. |
| `process.env.X` | ✓ | `process` is a global. |
| `import.meta.url` | ✓ | Language built-in. |
| `import.meta.dirname` | ✓ | Language built-in (Node 20.11+/Bun). Produces unnormalized paths if concatenated — see below. |
| `new URL(rel, import.meta.url)` | ✓ | `URL` is a global; the URL parser normalizes `..` segments (required by Turbopack's outside-project check; bare `${import.meta.dirname}/../..` fails the check). |
| `globalThis.X`, `URL`, `URLSearchParams`, `TextEncoder` | ✓ | All globals. |
| `import { ... } from 'node:path' \| 'node:url' \| 'node:fs' \| ...` | ✗ | Triggers CJS emit → crash on load. |
| `import x from 'some-pkg'` (any runtime import) | ✗ | Same trigger. |

The cockpit `next.config.ts` was rewritten 2026-05-12 to follow this pattern:

```ts
import type { NextConfig } from 'next';

const backendUrl = process.env.BOKCHOY_BACKEND_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  turbopack: {
    root: new URL('../..', import.meta.url).pathname,
  },
  async rewrites() { ... },
};
```

Verified — `bun run dev` ✓ (Ready in 1206ms, no warnings, Cache Components enabled), `bun run typecheck` ✓, `bun run lint` ✓.

**Severity: LOAD-BEARING.** Any future scaffold edit that reintroduces a `node:*` import to `next.config.ts` will silently break `next dev` AND `next build` while typecheck + lint stay green. Future PRs editing `apps/cockpit/next.config.ts` MUST include `bun run dev` (or `bun run build`) in the verification gate, not just typecheck + lint.

**Conditions:** finding holds for Next.js 16.2.6 + Bun 1.x + `apps/cockpit/package.json` `"type": "module"`. May change in Next.js 17+ if the loader migrates to ESM emit. Re-verify if Next.js docs publish a config-loader migration note. The constraint does NOT apply to packages without `"type": "module"` (e.g., `apps/backend/`) — those can use CJS-style imports in their configs freely.

**Provenance:** empirical reproduction 2026-05-12 in this repo at slice 8.3.x item #10 verification. Not surfaced in surveyed docs/Source 1 material — Source 1's `app-tw/ts/next.config.ts` does not use runtime imports (its configurations are simple object literals), so this constraint never appears in the canonical template. Adding `node:*` imports to compute `turbopack.root` was a BokChoy-side scaffold decision in slice 8.3.0, never exercised end-to-end.

## Conflicts

No conflicts between Sources 1–6 in surveyed material. Source 7 (cockpit on-disk) conflicts with Sources 1+2 on F1–F4 per the findings above. Per *Contradiction protocol*, production code (Source 1 = `create-next-app` canary template) + official docs (Sources 3–6) agree; cockpit deviates; canonical wins for the items called out in F1–F4.

The cockpit's `package.json` comment-block (`// per [[frontend-stack]]`) attributes deviations to design decisions, but none of F1–F4 deviations are traced to a /design entry — they appear to be incidental hand-rolling. The base `tsconfig.base.json` deviations (target `ES2022`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`) are intentional monorepo-wide picks per `[[bun-workspaces-research]]`-era setup; not in scope here.

## Conditions

- Findings hold for Next.js 16.2.6 + React 19.2 + Tailwind v4.x + canary HEAD at `9a48c22c` (2026-05-11). Re-verify at Next.js 17 release.
- The ESLint-vs-Biome pick (F1) is a separable sub-decision. Both are first-class in the canary template. Recommend ESLint to match the Next.js core-web-vitals + TypeScript ruleset that's been maintained longest; Biome is newer but faster.
- `jsx: "preserve"` (F2) interacts with Next.js's SWC pipeline. Both `preserve` and `react-jsx` are accepted end-to-end; the only difference is whether TS or SWC owns the JSX transform. Switching to `react-jsx` shifts the transform earlier and tightens TS-side type-checking of the JSX runtime. No documented case where one breaks the other in Next.js 16.
- F6 (`turbopack.root` redundancy) depends on Next.js's lockfile-detection finding `bun.lock` at the monorepo root. Verified `bun.lock` exists at `/home/mvula/audhd/bokchoy/bun.lock` via git status. If a future restructure removes the root `bun.lock` (e.g., Turborepo migration with per-app lockfiles), F6's redundancy claim breaks.

## Operational implications

For slice 8.3.1 (cockpit scaffold polish) — punch list, ordered by severity:

1. **F1 — Add ESLint to cockpit.** Install `eslint@^9` + `eslint-config-next@<resolved>`. Add `apps/cockpit/eslint.config.mjs` copying Source 1's flat config verbatim (defineConfig + `nextVitals` + `nextTs` + globalIgnores). Add `lint: "eslint"` script to `package.json`. Wire into CI per existing `apps/backend/` lint convention (verify backend's lint script — if `tsc --noEmit` only, expand cockpit lint into the same CI step). **Blocker for slice 8.3.2 merge.**

2. **F2.2 — Drop `types: ["node"]` from `tsconfig.json`.** Either remove the field entirely or expand to `["node", "react", "react-dom"]`. Either matches canonical.

3. **F2.3 — Add `.next/dev/types/**/*.ts` and `**/*.mts` to `tsconfig.json` `include`.** Required for `typedRoutes` dev-mode type-checking. Cockpit's `[[cockpit/auth-surface-mount]]` rewrites + `[[admin-list-endpoints-contract]]` 6 endpoints will rely on this when `typedRoutes` flips on.

4. **F4 — Expand `app/globals.css` to canonical template shape (CSS variables + `@theme inline` block + dark-mode media query + `body` defaults).** Must land before slice 8.4 shadcn CLI bootstrap (per `[[cockpit/file-structure]]` cascade #4). Use Source 1's template verbatim as the starting point; shadcn CLI will register its own tokens on top.

5. **F3 — Add `**/next-env.d.ts` to monorepo root `.gitignore`.** Verified 2026-05-12: current `.gitignore` (936 bytes) does NOT include this entry. Per Source 6 docs — file is auto-regenerated and must not be committed. The file's current dev-emit content is fine; do not commit.

6. **F2.1 — Switch `jsx: "preserve"` to `"react-jsx"`.** Match canonical. Verify `next dev` + `tsc --noEmit` both still pass.

7. **F7 — Add empty `apps/cockpit/public/favicon.ico`** (or BokChoy-branded). Prevents `/favicon.ico` 404 in dev.

8. **F7 — Add `apps/cockpit/.env.example`** documenting `BOKCHOY_BACKEND_URL` (per `[[cockpit/auth-surface-mount]]` V3) + future OAuth/Better Auth env vars. Slice 8.3.2 dep.

9. **F5 — Pick font.** Either `next/font/google` Geist (canonical) or document deferral in `[[cockpit/cockpit-shape]]`. Not blocking 8.3.1.

10. **F6 — Verify `turbopack.root` necessity.** Run `next dev` with the pin removed; if Next.js detects workspace root via `bun.lock` (logged in startup), drop the manual pin. If it falls back to a wrong root, keep. Not blocking; cleanup pass. **RESOLVED 2026-05-12 (slice 8.3.x): KEEP THE PIN.** Removing it caused Next.js to detect `/home/mvula/package-lock.json` (stray, in operator's `$HOME`) as the workspace root, demoting `bokchoy/bun.lock` to "additional." F6's redundancy claim falsified — see F6 Amendment 2026-05-12. Same verification pass surfaced + fixed a separate latent bug in the prior `next.config.ts` shape (runtime `node:*` imports broke config load) — see F9 (new finding).

11. **F8 — Confirmations.** All `cacheComponents` / `reactCompiler` / `babel-plugin-react-compiler` / Tailwind v4 PostCSS / `lib/query-client.ts` React.cache patterns are CORRECT. Do not regress them.

12. **F9 — Future `next.config.ts` edits MUST include `bun run dev` (or `bun run build`) in the verification gate.** Typecheck + lint are NOT sufficient — the ESM-mode-import bug surfaces only at config-load runtime. Any future PR adding a runtime `import` to `apps/cockpit/next.config.ts` will silently break dev while keeping CI green. Block scaffold edits that don't follow the language-built-in-only pattern documented in F9.

## Reproducibility note

Reproducible end-to-end:

```bash
# Canonical template:
gh api repos/vercel/next.js/contents/packages/create-next-app/templates/app-tw/ts \
  --jq '.[].name' --ref=9a48c22c17ed834ec83c2412acf392972280243b

# Or run create-next-app:
bunx create-next-app@canary --typescript --tailwind --eslint --react-compiler \
  --app --no-src-dir --use-bun cockpit-canonical
```

Then diff `cockpit-canonical/` against `apps/cockpit/`. Cross-reference key shapes against `nextjs.org/docs/app/api-reference/config/{cacheComponents,reactCompiler,turbopack,typescript}` at version 16.2.6 / lastUpdated 2026-05-07.

Generator source for `package.json` shape: `vercel/next.js@9a48c22c` `packages/create-next-app/templates/index.ts` lines 240–306.

No load-bearing judgments in this finding — every claim has direct source backing.

## Open threads

- **ESLint vs Biome pick** — both first-class in canary template; not researched which fits BokChoy's monorepo CI better. Carry to a /design call (separate from this entry's punch list). Recommend ESLint default until pressure to switch.
- **`jsx: "preserve"` vs `"react-jsx"` — has a SWC-vs-TS-transform real performance/correctness delta been measured at Next.js 16?** Both pass type-check + build. Empirical end-to-end perf comparison not in scope here.
- **`next-env.d.ts` import path** — canonical Source 1 imports `.next/types/routes.d.ts` (build path); cockpit's dev-emit imports `.next/dev/types/routes.d.ts`. The file auto-regenerates on every `next dev`/`next build`/`next typegen` run — what determines which path gets written? Likely whichever command last ran. Not load-bearing since the file is auto-managed and should be gitignored.
- **Bun + Next.js 16 + Tailwind v4 specific gotchas** — not surveyed. The canonical template assumes npm/pnpm; Bun's `bun install` resolution differences with PostCSS plugin discovery have hit other projects. If slice 8.3.1 build fails on `bun run dev`, dig here first.
- **Cockpit testing strategy** — `[[cockpit/file-structure]]` line 170 defers; `[[frontend-stack]]` line 9 names Playwright + Vitest. No vault entry yet. Carry to a future /design.
