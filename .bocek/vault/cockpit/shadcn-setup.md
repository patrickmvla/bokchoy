---
type: decision
features: [cockpit]
related: ["[[cockpit/shadcn-setup-research]]", "[[cockpit/file-structure]]", "[[cockpit/nextjs-scaffold-research]]", "[[cockpit/cockpit-shape]]", "[[frontend-stack]]"]
created: 2026-05-12
confidence: high
---

# Cockpit shadcn bootstrap: `--base radix` + `--preset radix-nova` + `next-themes` class-based dark mode + cockpit-local primitives

## Amendment 2026-05-12 (implementation seat, post-init empirical findings)

Empirical run of `shadcn init` 2026-05-12 surfaced two factual corrections to this entry's pre-init claims:

1. **CLI `--preset` flag accepts the BARE preset name (`nova`), NOT the combined `radix-nova`.** Per `packages/shadcn/src/preset/defaults.ts` keys, the accepted enum is `nova | vega | maia | lyra | mira | luma | sera`. The string `radix-nova` is the COMBINED identifier the CLI builds internally from `--base radix --preset nova`; it's not a valid `--preset` flag value. First-attempt invocation failed with `Invalid preset: radix-nova. Available presets: nova, vega, maia, lyra, mira, luma, sera`. **Correct invocation:** `cd apps/cockpit && bunx shadcn@latest init --base radix --preset nova --yes`. *Decision* section below is amended.

2. **`components.json.style` was generated as `"radix-nova"`, NOT `"new-york"` as this entry's pre-init claim said.** I sourced `"new-york"` from `shadcn-ui/ui` `apps/v4/components.json` (the canonical-cite at HEAD), but `apps/v4` predates the combined-identifier convention used by current init runs. New init outputs write `style: "radix-nova"` directly. Both values are valid per the schema (`rawConfigSchema.style` is unconstrained `z.string()`); semantically equivalent for primitive resolution at HEAD 2026-05-12. The cockpit's `components.json` ships `"style": "radix-nova"`.

**Additional contract corrections (first `shadcn add` pass, 2026-05-12):**

- **`bunx` invocation MUST use `--bun` flag.** Correct form: `bunx --bun shadcn@latest <cmd>` (forces Bun runtime for executing the package). Without `--bun`, bunx defaults to Node — works but inconsistent with the cockpit's Bun-managed tooling. User directive 2026-05-12. Saved as user memory [[feedback-bunx-bun-flag-for-shadcn]].

- **The `form` primitive is GONE; current pattern is `<Field>` + react-hook-form `<Controller>`.** 2.x's `<Form>` / `<FormField>` / `<FormItem>` / `<FormLabel>` / `<FormControl>` / `<FormDescription>` / `<FormMessage>` family has been replaced. The `form` registry entry exists but resolves to 0 files (it's a meta entry). The actual primitive is `field` → `components/ui/field.tsx` containing the family `<Field>`, `<FieldLabel>`, `<FieldDescription>`, `<FieldError>`, `<FieldContent>`, `<FieldGroup>`, `<FieldSet>`, `<FieldLegend>`, `<FieldTitle>`. RHF integration is direct via `<Controller>` from `react-hook-form`. **`[[cockpit/first-run-journey]]` step 5 amendment OWED** — currently references "shadcn `<Form>` + `<Input>`"; should be "shadcn `<Field>` + `<Input>` wrapped in react-hook-form `<Controller>`." Saved as user memory [[feedback-shadcn-form-field-pattern]] with the canonical Controller-renders-Field pattern.

- **Required deps for forms (NOT auto-installed by `shadcn add field`):** `react-hook-form`, `@hookform/resolvers` (provides `zodResolver()`), `zod`. These install when slice 8.4 writes its first form .tsx file; not bootstrap-time. Slice 8.4 obligation.

**Additional implementation findings (recorded; not contract corrections):**

- **Init's `app/globals.css` output had broken font cascade.** Two lines as written by init: `--font-sans: var(--font-sans);` (self-reference) and `--font-heading: var(--font-sans);` (cascade off the self-reference). For the cockpit which exposes `--font-geist-sans` / `--font-geist-mono` on `<html>` via `next/font/google` per slice 8.3.1 `app/layout.tsx`, these were rewritten to `var(--font-geist-sans)` / `var(--font-geist-mono)` — without that fix, the `font-sans` Tailwind utility would resolve to nothing and shadcn primitives would render in browser default font. Cause: init's template uses generic `--font-sans` placeholder; doesn't detect the cockpit's slice-8.3.1 Geist variable names. **Operational implication for future scaffolds:** verify `--font-{sans,mono,heading}` in `@theme inline` reference the actual CSS variables the layout exposes; init does NOT detect them.

- **Init bumped `tailwind-merge` from `^2.5.5` to `^3.6.0`** (major version). Cockpit's `cn()` helper in `lib/utils.ts` still works as-is (the `twMerge(clsx(...))` API is unchanged at v3). No code changes required.

- **Init installed `radix-ui ^1.4.3` (single meta-package), NOT individual `@radix-ui/react-*` packages** as I'd expected from training data + research on 2.x-era patterns. The current shadcn @ 4.7.0 + Radix dependency surface is a single `radix-ui` meta-package that re-exports all primitives. Shape change worth noting for future `shadcn add` calls — primitive imports come from `radix-ui` (e.g., `import * as Dialog from 'radix-ui/Dialog'`), not `@radix-ui/react-dialog`.

- **Init also added `shadcn ^4.7.0`** as a production dependency. Required for `@import "shadcn/tailwind.css"` to resolve at build time (the package exports `./tailwind.css` per its `package.json` exports map). Operators don't directly import shadcn runtime code; this dep exists purely for the CSS import path.

- **Other deps added by init:** `class-variance-authority ^0.7.1`, `lucide-react ^1.14.0`.

- **`bun run lint` post-init flagged one import-order issue** in `lib/utils.ts` (init wrote `clsx, type ClassValue`; Biome's organize-imports rule wants `type ClassValue, clsx`). Fixed via Edit; `bun run format` does NOT auto-fix import order (only quote/whitespace).

- **Biome override required for `components/ui/**` after first `shadcn add` pass.** shadcn-vendored primitives use upstream conventions that conflict with cockpit's Biome rules: `import * as React` (Biome wants `import type`), double quotes (cockpit prefers single), `==` over `===` (field.tsx line 197), array index as React key (field.tsx line 205), `role="..."` instead of semantic HTML (field.tsx line 79). Per `[[cockpit/file-structure]]` *Mitigations* on shadcn primitive discipline — customizations go IN modules via composition, NOT by forking primitives in `components/ui/`. So `components/ui/**` is vendored-third-party; disabled linter + formatter + assist in `apps/cockpit/biome.json` via `overrides`:

  ```jsonc
  "overrides": [
    {
      "includes": ["components/ui/**"],
      "linter": { "enabled": false },
      "formatter": { "enabled": false },
      "assist": { "enabled": false }
    }
  ]
  ```

  Preserves clean `shadcn diff` / `shadcn add --overwrite` workflow against upstream registry; primitives stay verbatim. Lint coverage on cockpit's own code (`app/`, `modules/`, `components/{layouts,theme-provider.tsx}`, `lib/`, `hooks/`) is unaffected.

- **`shadcn add field` pulled in transitive `separator` primitive** (`components/ui/separator.tsx`). Useful primitive for horizontal/vertical dividers; bonus add, not budget-relevant.

- **Three verification gates all passed post-fix:** `bun run typecheck` ✓, `bun run lint` ✓ (13 files), `bun run dev` ✓ (Ready in 2.6s, Cache Components enabled, no `turbopack.root` warning, no Turbopack rejection).

---

## Decision

Three picks resolved 2026-05-12 + one forced move ratified + (M-LOCAL) re-stated:

1. **`--base radix`** — Radix UI (`@radix-ui/react-*`) is the underlying primitive library, NOT Base UI.
2. **`--preset radix-nova`** — Lucide / Geist / neutral / radius=default / chart=neutral / menuAccent=subtle / menuColor=default.
3. **Dark mode: `next-themes` class-based** — `.dark` class on `<html>` via `<NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>`. Forced move per `[[cockpit/shadcn-setup-research]]` F6 + F7 (shadcn's `@custom-variant dark (&:is(.dark *))` requires class selector). NOT a fork.
4. **(M-LOCAL) cockpit-local primitives** — `apps/cockpit/components/ui/`, NOT extracted to `packages/ui/`. Ratified by user on-the-spot 2026-05-12 in /implementation seat.

**Init invocation:** `cd apps/cockpit && bunx shadcn@latest init --base radix --preset nova --yes` (CORRECTED 2026-05-12 — see Amendment block above; `--preset` takes the bare name, not the combined `radix-nova`)

Must run from `apps/cockpit/` (NOT monorepo root) per `[[cockpit/shadcn-setup-research]]` F9 — CLI exits at monorepo root via `isMonorepoRoot()` check.

**components.json** that init will write (operator can verify post-init against this shape):

```jsonc
// As written by `shadcn init --base radix --preset nova` 2026-05-12 (verified):
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",          // combined base+preset identifier; not "new-york"
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",                  // empty — Tailwind v4 has no JS config
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,                    // added by init from preset defaults
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",          // added by init from preset defaults
  "menuAccent": "subtle",          // added by init from preset defaults
  "registries": {}                  // empty placeholder for custom registries
}
```

`tailwind.config: ""` — Tailwind v4 has NO JS config (`[[cockpit/shadcn-setup-research]]` C2; F4 schema verbatim).

## Reasoning

Each pick survived a specific attack on the failure mode named for it.

**(B-RADIX) over (B-BASE)** — user defense: *"ecosystem maturity matters more than upstream signal."* (production-cited × many: shadcn baseline since 2022, Vercel v0 production, thousands of OSS deploys per `[[cockpit/shadcn-setup-research]]` F1; confidence high). The principle inverts the lock-in-tax-on-deprecation-event attack: Radix exists independently of shadcn-as-CLI, so if shadcn drops the `radix-` paired presets in 2027, cockpit's primitives keep working — only the registry layer detaches. (B-BASE)'s primitive coverage at 2026-Q2 was unresearched per `[[cockpit/shadcn-setup-research]]` F10 (open thread); user declined to gate slice 8.4 on that research pass.

**(P-NOVA) over (P-LYRA) / (P-SERA) / (P-CUSTOM)** — user defense: *"it's an admin tool plus Lucide has more icons and more mature."* Two prongs, both engaging named failure modes:
- *Admin-tool register* defangs P-NOVA's visual-undifferentiation attack — for B2B cockpits inspecting transactions / API keys / catalog versions, blandness = familiarity, not blandness = boring. (production-cited via Stripe Dashboard / Vercel / Linear / Resend / Cal.com all shipping neutral palettes for operator UI; confidence high.)
- *Lucide ~1500-icon catalog + ecosystem maturity* defeats P-LYRA's Phosphor-coverage-gap concern at slice 8.5-8.6 (catalog editor / transaction inspector glyph needs). (production-cited via Lucide ~7M weekly downloads, MIT, used by canonical `templates/next-app/`; confidence high.)
- **Cross-cutting benefit:** P-NOVA's Geist font matches slice 8.3.1's existing `next/font/google` Geist + Geist_Mono setup verbatim — zero font swap, no layout.tsx churn.

**Dark mode `next-themes` class-based** is not a fork — shadcn primitives target `@custom-variant dark (&:is(.dark *))` which only activates on `.dark` class selector. (docs-cited: `apps/v4/app/globals.css` HEAD 2026-05-12; production-cited: `templates/next-app/components/theme-provider.tsx` HEAD 2026-05-12.) Slice 8.3.1's `@media (prefers-color-scheme: dark)` does not activate the selector — primitives would render light-mode tokens regardless of system preference. Forced move; vaulted as ratification.

**(M-LOCAL)** previously settled per `[[cockpit/file-structure]]` Alternative D rejection + user on-the-spot directive 2026-05-12 + `[[cockpit/shadcn-setup-research]]` F8 (Issue #6878 OPEN — Tailwind v4 content scanner misses class names from primitives in different workspace package). Re-stated here as a load-bearing component of the init invocation (cockpit-local `aliases.ui: "@/components/ui"`, not `"@/registry/..."` or `"@bokchoy/ui"`).

## Engineering substance applied

- **First-class:** uses shadcn's intended CLI flow (`bunx shadcn@latest init --base --preset`), Next.js App Router conventions (`rsc: true`), Tailwind v4 native `@theme inline` + `@custom-variant` directives, `next-themes` standard lib for class-based dark mode. Zero workarounds.
- **Failure semantics on init:** `shadcn init` is destructive on `app/globals.css` (rewrites with OKLCH tokens + dark-class wiring + `@import "tw-animate-css"` + `@import "shadcn/tailwind.css"` per `[[cockpit/shadcn-setup-research]]` F6). The CLI also writes `components.json.bak.<timestamp>` automatically per `packages/shadcn/src/utils/file-helper.ts` (FILE_BACKUP_SUFFIX). Stage git tree before init so `app/globals.css` is recoverable.
- **Concurrency:** N/A at scaffold level (one-shot init, not a runtime concurrent path).
- **Operability:** primitives vendored to `apps/cockpit/components/ui/` are fully readable, fully forkable, no runtime registry dependency at production. Owner-of-record after init is the cockpit team. Updates via `shadcn diff` / `shadcn add --overwrite` per primitive.
- **Security:** `iconLibrary: "lucide"` pulls `lucide-react` (MIT, ISC-class maintenance, ~7M weekly downloads). `next-themes` (MIT, Vercel-team-maintained). `tw-animate-css` (MIT). No exotic supply-chain trust ask.
- **Observability:** N/A at scaffold level.

## Production-grade gates

- **Idiomatic** — `--base radix` + `--preset radix-nova` is the shadcn-canonical baseline-adjacent shape at HEAD 2026-05-12 (`packages/shadcn/src/preset/defaults.ts` Nova preset verbatim; `--defaults` selects `base-nova`, flipping `base` keeps the preset class). `next-themes` class-based dark mode is the canonical pattern shipped in `templates/next-app/components/theme-provider.tsx` HEAD. Both production-cited via the canonical template.

- **Industry-standard** — production cites for the chosen shape: (a) `vercel/v0` platform (production B2B SaaS at Vercel scale, shadcn-driven UI); (b) shadcn's own site `apps/v4/components.json` (neutral + lucide + new-york verbatim). ≥2 named production deployments at the chosen shape. Confidence high.

- **First-class** — Tailwind v4 has no JS config (`tailwind.config: ""`) — first-class consequence of v4's design, not a workaround. `@custom-variant dark` + `@theme inline` are v4-native primitives. `next-themes` is the upstream-recommended dark-mode lib for Next.js App Router. Radix UI is the underlying accessibility primitive lib shadcn is designed against.

## Rejected alternatives

### (B-BASE) — `@base-ui-components/react`
**What:** Base UI (Floating UI team) as primitive library; pick `base-{preset}` instead of `radix-{preset}`. shadcn's `--defaults` baseline.
**Wins when:** shadcn upstream-signal weight > Radix-ecosystem-maturity weight, AND Base UI's primitive coverage at decision-time is verified-complete for slices 8.4-8.6.
**Why not here:** user defense — ecosystem maturity dominates upstream signal at solo-dev MVP scope. (B-BASE) primitive coverage at 2026-Q2 unresearched (`[[cockpit/shadcn-setup-research]]` F10 open thread); user declined to gate slice 8.4 on additional /research. Revisit-when fires if Base UI ships verified parity AND shadcn deprecates Radix.

### (B-OPT-OUT) — vendor primitives without shadcn registry
**What:** copy primitives directly from Radix or Base UI's docs, skip shadcn CLI / components.json / paired-preset baking.
**Wins when:** planned primitive count is small enough that `shadcn add` ergonomics don't pay for shadcn-convention lock-in (data-slot, OKLCH baking, 11-axis presets).
**Why not here:** solo-dev velocity at slice 8.4-8.6 (3-5 features, ~10-15 primitives expected). Hand-rolling primitives + accessibility audits + animation polish = days; `shadcn add` per primitive = minutes. Lock-in tax paid in time saved. (production-cited counter-position: Linear, Vercel internal tools, Notion's web cockpit reportedly hand-roll — but at team scales ≥10 engineers, not solo-dev MVP.)

### (P-LYRA) — Phosphor / JetBrains Mono / neutral
**What:** developer-tool aesthetic preset — monospace primary font, tighter Phosphor icons (~1200 catalog).
**Wins when:** cockpit brand wants explicit developer-tool register (Linear / Railway / Fly.io aesthetic) AND Phosphor catalog covers all needed glyphs across slices 8.4-8.6.
**Why not here:** Phosphor's smaller catalog raises mid-slice icon-coverage risk; slice 8.3.1's Geist would need swapping (small cost but unforced); user ranked Lucide-catalog-maturity above register-fit.

### (P-SERA) — Lucide / Noto Sans + Playfair Display / **taupe**
**What:** editorial / branded aesthetic — warm taupe palette, serif heading font.
**Wins when:** cockpit serves an editorial / publishing / content-creation register.
**Why not here:** BokChoy is a wallet / live-ops platform for games. Editorial register is wrong-genre. Rejected without specific brand argument.

### (P-CUSTOM) — open `ui.shadcn.com/create`, define BokChoy brand at scaffold time
**What:** `--preset custom`, define brand tokens (colors / typography / radius) before init runs.
**Wins when:** brand identity is a known constraint and retrofitting after slices 8.4-8.6 ship is more expensive than picking now.
**Why not here:** no BokChoy brand pick is vaulted anywhere. (P-CUSTOM) requires a fresh /design pass on brand FIRST, which defers slice 8.4. P-NOVA defers the brand decision to when BokChoy actually has one — and the preset can be flipped later via `shadcn init --force --preset <new>` from a clean git tree.

### (DM-MEDIA-QUERY) — keep slice 8.3.1's `@media (prefers-color-scheme: dark)`
**What:** retain system-preference-only dark mode via media query.
**Wins when:** never under shadcn-v4 primitive adoption. Shadcn primitives select via `@custom-variant dark (&:is(.dark *))` — a class selector that does NOT activate from a media query.
**Why not here:** primitives would render light-mode regardless of system preference. Not a viable position; rejected as forced.

### (M-SHARED) — extract primitives to `packages/ui/` workspace
**What:** shadcn canonical `templates/next-monorepo/packages/ui/` shape — cross-app shared primitive package.
**Wins when:** ≥2 Next.js apps share the primitive surface (Cal.com, Documenso ship multiple apps; warrants extraction).
**Why not here:** BokChoy MVP has one cockpit Next.js app (`[[cockpit/file-structure]]` Alternative D rejection on single-app constraint). Production-derived defense from `[[cockpit/shadcn-setup-research]]` F8: Issue #6878 OPEN — Tailwind v4 content scanner misses class names from primitives in a different workspace package. (M-SHARED) ships broken styling at the current shadcn @ 4.7.0 + Tailwind v4 baseline; not viable until that bug resolves.

## Failure mode

**Init-time globals.css overwrite.** `shadcn init` rewrites `app/globals.css` with OKLCH tokens, sidebar/chart variants, `@custom-variant dark`, `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`. The slice 8.3.1 shape (hex colors + minimal `@theme inline` + media-query dark mode) is destroyed. Acceptable — slice 8.3.1's shape is structurally out of date per `[[cockpit/shadcn-setup-research]]` F6 — but the destruction is *expected* not surprising. Failure mode bites if the operator forgets to stage git BEFORE init: rollback requires `git checkout -- apps/cockpit/app/globals.css`.

**Preset → token cascade is effectively one-way at init time.** Once init bakes `--chart-1: var(--color-blue-300)` and the 30+ OKLCH tokens, swapping presets later requires `shadcn init --force --preset <new>` (overwrites all customizations operator added to globals.css between init runs) or hand-editing globals.css. Likelihood of regret: low for P-NOVA on B2B-admin cockpit; medium if BokChoy lands a brand pick that requires non-neutral baseColor.

**Lucide icon-not-found mid-slice.** Slice 8.5+ (catalog editor / transaction inspector) may need a glyph Lucide doesn't ship. Likelihood: low — Lucide's ~1500 catalog is the largest in shadcn's preset enum. Probability scales with glyph specificity: generic operator UI glyphs (`save`, `trash`, `play`, `arrow-right`, `more-horizontal`) all covered; niche domain glyphs (e.g., `loot-box-rarity-tier`) won't be in Lucide regardless of icon library — those need bespoke SVGs anyway.

**Monorepo-root init exit (CLI guard).** If operator runs `bunx shadcn@latest init` from `/home/mvula/audhd/bokchoy/` (the monorepo root) instead of `apps/cockpit/`, the CLI's `isMonorepoRoot()` preflight exits with `formatMonorepoMessage("init", targets)` (per `packages/shadcn/src/commands/init.ts:224-237`). The error message names the workspace targets; operator must re-run from `apps/cockpit/`. Documented; not a real failure, but an operator UX bite if missed.

## Mitigations

- **Pre-init git staging:** before running init, `cd /home/mvula/audhd/bokchoy && git add -A apps/cockpit/` so `app/globals.css` (and any other init-touched file) is recoverable via `git restore --staged --worktree apps/cockpit/app/globals.css`. Mandatory pre-init step in slice 8.4 implementation runbook.
- **Init backup:** `components.json.bak.<timestamp>` is created automatically; let the CLI handle it. No additional manual backup needed for components.json.
- **Icon-coverage gap:** if Lucide misses a glyph mid-slice, vendor a custom SVG to `apps/cockpit/components/ui/icons/{name}.tsx`. **DO NOT** add a second icon library (`@phosphor-icons/react`, etc.) — preserves visual consistency.
- **Preset-change protocol:** if later /design picks a brand requiring non-neutral baseColor, re-run `cd apps/cockpit && bunx shadcn@latest init --force --base radix --preset <new>` from a clean git tree, review the globals.css diff before commit, re-`shadcn add` every primitive already vendored to pick up new token references.
- **Run-from-app-workspace discipline:** slice 8.4 runbook MUST name `cd apps/cockpit && bunx shadcn@latest init ...` as the invocation. Running from monorepo root will error; this is documented but operator-error-prone.

## Idiom citations

- `~/.bocek/idioms/typescript.md` — not directly applicable at scaffold level (no branded types / discriminated unions in components.json). Applies later when slice 8.4 hooks + form components consume the primitives.
- The `templates/next-app/components/theme-provider.tsx` pattern (NextThemesProvider + suppressHydrationWarning + `d`-key hotkey with typing-context guards) IS the production-grade idiom for class-based dark mode in Next.js App Router; cockpit will copy verbatim per `[[cockpit/shadcn-setup-research]]` F5.

## Cascade obligations for slice 8.4 implementation

Ordered for the implementation seat:

1. **Pre-init deps** (`apps/cockpit/package.json`):
   - Add `next-themes` `^0.4.6` (production dep) per `[[cockpit/shadcn-setup-research]]` F11.
   - Add `tw-animate-css` (production dep) — replaces deprecated `tailwindcss-animate`.
   - Optional: `prettier-plugin-tailwindcss` `^0.7.2` (devDep) for class-ordering on save.
   - `bun install`.

2. **Pre-init scaffold:**
   - Create `apps/cockpit/hooks/.gitkeep` (components.json `aliases.hooks: "@/hooks"` requires it exist).
   - Create `apps/cockpit/components/theme-provider.tsx` from `[[cockpit/shadcn-setup-research]]` F5 verbatim canonical (NextThemesProvider wrapper + `d`-key hotkey + typing guards).

3. **Wire ThemeProvider** in `apps/cockpit/app/layout.tsx`:
   - Add `suppressHydrationWarning` to `<html>`.
   - Wrap children: `<ThemeProvider><ReactQueryProviders>{children}</ReactQueryProviders></ThemeProvider>`.
   - Order: ThemeProvider outermost (class flip affects all descendants), ReactQueryProviders inner.

4. **Stage git tree:** `cd /home/mvula/audhd/bokchoy && git add -A apps/cockpit/` BEFORE init.

5. **Run init:** `cd apps/cockpit && bunx shadcn@latest init --base radix --preset radix-nova --yes`.

6. **Post-init verification:**
   - `apps/cockpit/components.json` matches the schema in *Decision* above (manual diff).
   - `apps/cockpit/app/globals.css` has 30+ OKLCH tokens, `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, `@custom-variant dark (&:is(.dark *))`, `@layer base { * { @apply border-border outline-ring/50; } }`.
   - NO `tailwind.config.ts` was created (Tailwind v4 has no JS config).
   - `bun run dev` ✓ (no warnings, primitives ready to add).
   - `bun run typecheck` ✓.
   - `bun run lint` ✓.

7. **Cascade amendments owed (vault writes, in same slice or next /design seat):**
   - **`[[cockpit/file-structure]]` cascade #3** — drop `apps/cockpit/tailwind.config.ts` obligation. Tailwind v4 has no JS config. (Done in this /design seat — see amendment block in that entry.)
   - **`[[cockpit/nextjs-scaffold-research]]` F4** — for cockpit (shadcn-adopting), shadcn-v4 globals.css canonical supersedes create-next-app's. Amendment note added pointing at `[[cockpit/shadcn-setup-research]]` F6 / C1. (Done in this /design seat — see amendment.)

## Revisit when

- **shadcn deprecates `radix-` paired presets.** Track shadcn-ui/ui releases + CHANGELOG. → flip to `--base base` if Base UI primitive coverage has been verified at that point.
- **Issue #6878 (Tailwind v4 monorepo content-scanning bug) RESOLVED.** → (M-SHARED) becomes viable if/when a second Next.js app emerges in the BokChoy workspace.
- **BokChoy brand pick lands.** Vault as `[[cockpit/brand]]` or similar. → re-evaluate (P-NOVA) vs (P-CUSTOM); preset axes (baseColor, fontHeading, radius) may need to flip to match.
- **Slice 8.5+ catalog editor needs a glyph Lucide doesn't ship.** → vendor custom SVG to `apps/cockpit/components/ui/icons/`. DO NOT add a second icon library.
- **Next.js 17 or shadcn @ 5.x release.** → re-verify canonical init flow + globals.css shape + preset names; major releases historically break the schema.
- **Base UI ships verified primitive-coverage parity with Radix** for the cockpit's needed primitive set across slices 8.4-8.6. → re-open (B-BASE) consideration.
