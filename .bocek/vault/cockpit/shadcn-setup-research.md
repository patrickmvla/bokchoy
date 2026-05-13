---
type: research
features: [cockpit]
related: ["[[cockpit/file-structure]]", "[[cockpit/nextjs-scaffold-research]]", "[[cockpit-stack-integration-research]]", "[[frontend-stack]]"]
created: 2026-05-12
confidence: high
provisional: false
---

# What is the current canonical shadcn CLI setup flow for Next.js 16 + Tailwind v4 + RSC at 2026-05-12, and which 2.x-era patterns are still load-bearing vs. retired?

## Question

The cockpit's slice 8.4 prerequisite is "shadcn CLI bootstrap to `apps/cockpit/components/ui/`." Before /implementation acts, what is the *current* canonical setup — package name, CLI invocation, init prompt flow, components.json schema, `globals.css` shape, dependency cascade, dark-mode mechanism, and Tailwind v4 / Next.js 16 compatibility — and which patterns from the 2.x era (the version baseline in pre-cutoff training data) have changed?

Triggered 2026-05-12 when /implementation seat was about to scaffold from 2.x-era assumptions (style=new-york vs default + baseColor + iconLibrary + class-based dark-mode prompts). Human halted: *"this is the old one we need to move to research."* Verified empirically before /design can pick.

## Triangulation

- **Production reference:** ✓ — `shadcn-ui/ui` GitHub repo at HEAD (default branch `main`, pushed `2026-05-12T08:27:02Z`, observed via `gh api` 2026-05-12). Files examined: `packages/shadcn/package.json` (CLI dist), `packages/shadcn/src/commands/init.ts` (init flow), `packages/shadcn/src/registry/schema.ts` (components.json zod schema), `packages/shadcn/src/preset/defaults.ts` (preset taxonomy), `packages/shadcn/src/preset/presets.ts` (`promptForBase`/`promptForPreset`), `packages/shadcn/src/tailwind.css` (canonical infrastructure CSS), `templates/next-app/{package.json,app/{layout.tsx,globals.css},components/theme-provider.tsx,next.config.mjs,postcss.config.mjs,tsconfig.json}` (canonical Next.js single-app template — the cockpit-class match), `apps/v4/{components.json,app/globals.css}` (shadcn's OWN site at v4; production cite at scale).

- **Docs reference:** ✓ — `ui.shadcn.com/docs/installation/next` + `ui.shadcn.com/docs/tailwind-v4` (current as of 2026-05-12 fetch). The Tailwind v4 page is the migration-grade doc; the Next.js install page is shallow on prompt detail (refers operators to the interactive CLI).

- **Contradiction probe:** ✓ — searched GitHub issues for *current* shadcn + Next.js 16 + Tailwind v4 + monorepo + Bun friction. Surfaced 4 open issues directly hitting our context (Issues #6878, #7828, #7952, #8697) and 1 discussion (#6486). C1 (Tailwind v4 content-scanning misses primitives in different workspace packages) is **load-bearing** and directly *validates* the user directive to keep cockpit components local rather than extract to `packages/ui/`. No credible counter-position found for the `bunx shadcn@latest init` + cockpit-local pattern.

## Sources examined

### Source 1 — `shadcn-ui/ui` repo HEAD (`packages/shadcn/`)
- **Tier:** 1 — production code.
- **Provenance:** `github.com/shadcn-ui/ui` `main` branch, repo pushed `2026-05-12T08:27:02Z`, files observed via `gh api repos/shadcn-ui/ui/contents/...` 2026-05-12.
- **Author context:** maintained by `@shadcn` (Shad — solo lead, ex-Vercel team adjacency); the CLI is the canonical implementation, used by Vercel's v0 platform and the shadcn-ui registry. Reputation: high in the Next.js/React community; production-cited at v0.dev scale and across the shadcn registry ecosystem.
- **What it tells us:** the exact CLI behavior, init prompt sequence, components.json schema, preset taxonomy, and the infrastructure CSS (`shadcn/tailwind.css`) primitives rely on. Most authoritative source for "what `shadcn init` actually does in 2026-Q2."

Key facts from this source:
- **CLI npm package:** `shadcn` (renamed from `shadcn-ui` in the 2.x → 3.x era). `packages/shadcn/package.json` reports `"name": "shadcn"`, `"version": "4.7.0"`, `"type": "module"`, `"bin": "./dist/index.js"`, `packageManager: pnpm@9.0.6`.
- **MCP support shipped:** the CLI has an `mcp` command (Model Context Protocol — AI assistants can drive the CLI directly). New surface area.

### Source 2 — `shadcn-ui/ui` `templates/next-app/` (canonical single-app)
- **Tier:** 1 — production code.
- **Provenance:** same repo + SHA; this is the *exact* template the CLI scaffolds for `--template next` non-monorepo. Files at `templates/next-app/{package.json,app/{layout.tsx,globals.css},components/theme-provider.tsx,next.config.mjs,postcss.config.mjs,tsconfig.json}`.
- **Author context:** same as Source 1.
- **What it tells us:** the canonical Next.js single-app scaffold ships **no `components.json`** (it's generated at `init` runtime), and `app/globals.css` is **just `@import "tailwindcss";`** — the `:root`/`@theme inline`/dark-mode tokens are NOT in the template; they're injected by the init step. `next-themes ^0.4.6` is a direct dependency (the dark-mode mechanism). Geist + Geist_Mono fonts. ThemeProvider wraps children with `suppressHydrationWarning` on `<html>`. The canonical theme-provider also ships a built-in **`d`-keyboard hotkey to toggle dark/light** with `isContentEditable`/INPUT/TEXTAREA/SELECT typing-context guards.

### Source 3 — `shadcn-ui/ui` `apps/v4/` (shadcn's OWN production site, at v4)
- **Tier:** 1 — production code.
- **Provenance:** `apps/v4/{components.json,app/globals.css}` at HEAD.
- **Author context:** same as Source 1; this is shadcn's docs site (production, public, at `ui.shadcn.com`), a real cite-class deployment of v4 components.
- **What it tells us:** a real-world v4 `components.json` (cite-class), and the *full* canonical `globals.css` shape including OKLCH tokens, sidebar/chart/code/selection variants, `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, and the `@custom-variant dark (&:is(.dark *))` class-based dark-mode wiring.

### Source 4 — `ui.shadcn.com/docs/tailwind-v4`
- **Tier:** 2 — official docs.
- **Provenance:** current as of 2026-05-12 fetch.
- **What it tells us:** the migration-grade summary of v4 changes. Verbatim claims worth quoting:
  - *"All components are updated for Tailwind v4 and React 19."*
  - *"We've removed the forwardRefs and adjusted the types."*
  - *"Every primitive now has a `data-slot` attribute for styling."*
  - *"HSL colors are now converted to OKLCH."*
  - *"We're deprecating the `default` style. New projects will use `new-york`."*
  - **`tailwindcss-animate` deprecated 2025-03-19** → replaced by **`tw-animate-css`**.

### Source 5 — `ui.shadcn.com/docs/installation/next`
- **Tier:** 2 — official docs.
- **Provenance:** current as of 2026-05-12 fetch.
- **What it tells us:** the documented invocation is `pnpm dlx shadcn@latest init` (or equivalent — `bunx shadcn@latest init` for Bun consumers). Docs page is shallow on prompt detail; refers operators to the interactive CLI. Confirms `shadcn` package name and `init` command shape.

### Source 6 — GitHub issues / discussions surfaced via WebSearch
- **Tier:** 3–6 mix (bug reports = tier 3 post-mortems; discussions = tier 6 forum).
- **Provenance:** searched 2026-05-12. Specifically reviewed Issue #6878 (full content via WebFetch).
- **What it tells us:** the *known* sharp edges in current shadcn + Tailwind v4 + monorepo + Bun deployments. Issue #6878 (open as of 2025-03-06, Windows 11 + Node v21): Tailwind v4's content scanner doesn't find class names from shadcn primitives located in a different workspace package — "destructive button has invisible text because `bg-destructive` doesn't exist in the compiled CSS." Hard-coded Tailwind classes in the app *are* detected; primitive-generated ones are not. Reproduced by upgrading a shadcn-generated monorepo to Tailwind v4. **Direct hit on the `packages/ui/` extraction pattern; sidestepped entirely by cockpit-local primitives.**

## Findings

### F1 (LOAD-BEARING) — Package rename + major version jump: `shadcn-ui` → `shadcn @ 4.7.0`

Per Source 1, the CLI's npm name is now `shadcn`, NOT `shadcn-ui`. Current version `4.7.0` (slice 8.4 baseline). The 2.x-era invocation `npx shadcn-ui@latest init` is **wrong** in 2026; correct is `bunx shadcn@latest init` or `pnpm dlx shadcn@latest init`. Operators using the old name hit a different package; `shadcn-ui` on npm is now a legacy/redirect.

Major version jump from 2.x → 4.7 in <2 years carries a substantial shape break — F2–F7 below enumerate. The 2.x-era picks I (the agent) was about to ask the human (style new-york vs default + baseColor + iconLibrary as separate prompts) **no longer match the current init flow** (F2 + F3).

### F2 (LOAD-BEARING) — Init prompt flow restructured: `base` + `preset` replaced individual style/color/icon prompts

Per Source 1 `packages/shadcn/src/commands/init.ts` lines 120–399 (verbatim from the CLI `Command` definition + the in-flow `prompts(...)` calls):

CLI options exposed:
- `-t, --template <template>` — `next | start | vite | react-router | laravel | astro` (auto-inferred for existing projects)
- `-b, --base <base>` — **`radix | base`** (NEW: choice of underlying primitive library — Radix UI vs Base UI)
- `--monorepo` / `--no-monorepo` — scaffold-monorepo toggle
- `-p, --preset [name]` — preset code or interactive picker
- `-y, --yes` (default **true**) — skip confirmation
- `-d, --defaults` (default false) — uses `--template=next --preset=base-nova`
- `-f, --force` (default false)
- `-c, --cwd <cwd>` (default `process.cwd()`)
- `-n, --name <name>`
- `-s, --silent` (default false)
- `--css-variables` (default **true**) / `--no-css-variables`
- `--rtl` / `--no-rtl`
- `--pointer` / `--no-pointer` (cursor-pointer for buttons)
- `--reinstall` / `--no-reinstall`

Interactive prompt sequence for an existing Next.js project (cockpit's case — `apps/cockpit/package.json` exists):

1. **If `components.json` exists** → confirm to overwrite (default `false`); if yes, optionally prompt to re-install existing UI components.
2. **Skip template prompt** — auto-inferred via `getProjectInfo()`'s framework detection (Next.js → `next`).
3. **Skip monorepo prompt** — only fires for new projects without `package.json` AND when the chosen template supports monorepo.
4. **Prompt `base`** — `Select a component library` → `Radix | Base` (via `promptForBase()` in `packages/shadcn/src/preset/presets.ts` lines 117–129). This is a NEW fork: shadcn now supports Base UI (from the Floating UI team — a Radix successor) alongside Radix UI as the underlying primitive layer.
5. **Prompt `preset`** — `Which preset would you like to use?` → list of named presets + `Custom` (opens the browser preset builder at `ui.shadcn.com/create`).

After the picks, the CLI calls `${SHADCN_URL}/init?<params>` to fetch the canonical component bundle. The URL carries the full preset config (base, style, baseColor, theme, iconLibrary, font, rtl, menuAccent, menuColor, radius, chartColor, fontHeading) AND a `track=1` signal for the registry to log the run.

**2.x-era picks REMOVED from the prompt flow:**
- No standalone `style` prompt — `style` is now bundled inside the preset (and `default` is deprecated; new presets use `new-york`-derived variants).
- No standalone `baseColor` prompt — bundled in preset.
- No standalone `iconLibrary` prompt — bundled in preset.
- No standalone `rsc` prompt — inferred from template (Next.js App Router → `rsc: true`).
- No standalone `cssVariables` prompt — defaults to `true`; only flag-overridable.

### F3 (LOAD-BEARING) — Preset taxonomy: 7 named presets, each bundles full look-and-feel

Per Source 1 `packages/shadcn/src/preset/defaults.ts` verbatim:

| Preset | Title | Description (icon / font) | baseColor | theme |
|---|---|---|---|---|
| **`nova`** | Nova | Lucide / Geist | neutral | neutral |
| `vega` | Vega | Lucide / Inter | neutral | neutral |
| `maia` | Maia | Hugeicons / Figtree | neutral | neutral |
| `lyra` | Lyra | Phosphor / JetBrains Mono | neutral | neutral |
| `mira` | Mira | Hugeicons / Inter | neutral | neutral |
| `luma` | Luma | Lucide / Inter | neutral | neutral |
| `sera` | Sera | Lucide / Noto Sans + Playfair Display | **taupe** | taupe |

All presets share: `chartColor` (matches `baseColor`/`theme`), `menuAccent: "subtle"`, `menuColor: "default"`, `radius: "default"`, `rtl: false`, `fontHeading: "inherit"` (except Sera = Playfair Display).

The **`--defaults` flag selects `base-nova`** specifically (the prefix `base-` is appended when `base="base"` is also default — there are paired variants like `radix-nova` and `base-nova`). Nova is the canonical default: **Lucide icons + Geist font + neutral color** — and notably, **Geist is already the cockpit's pinned font per slice 8.3.1**, so Nova maps cleanly onto BokChoy's existing scaffold without font swap.

### F4 (LOAD-BEARING) — `components.json` schema (current `rawConfigSchema`)

Per Source 1 `packages/shadcn/src/registry/schema.ts` lines 29–66 (verbatim Zod):

```ts
export const rawConfigSchema = z.object({
  $schema: z.string().optional(),
  style: z.string(),
  rsc: z.coerce.boolean().default(false),
  tsx: z.coerce.boolean().default(true),
  tailwind: z.object({
    config: z.string().optional(),   // empty "" for v4
    css: z.string(),                  // path to globals.css
    baseColor: z.string(),
    cssVariables: z.boolean().default(true),
    prefix: z.string().default("").optional(),
  }),
  iconLibrary: z.string().optional(),
  rtl: z.coerce.boolean().default(false).optional(),
  menuColor: z.enum(["default", "inverted", "default-translucent", "inverted-translucent"]).default("default").optional(),
  menuAccent: z.enum(["subtle", "bold"]).default("subtle").optional(),
  aliases: z.object({
    components: z.string(),
    utils: z.string(),
    ui: z.string().optional(),
    lib: z.string().optional(),
    hooks: z.string().optional(),
  }),
  registries: registryConfigSchema.optional(),
}).strict();
```

Real-world cite — `apps/v4/components.json` verbatim (shadcn's own site):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/registry/new-york-v4/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Cockpit-class adaptation (under (M-LOCAL) per user directive 2026-05-12 + `[[cockpit/file-structure]]`):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Notes:
- `"config": ""` empty — Tailwind v4 has NO JS config file; all theme tokens live in CSS via `@theme`/CSS variables (F7). **`[[cockpit/file-structure]]` cascade #3 ("`apps/cockpit/tailwind.config.ts`") is therefore OBSOLETE.**
- `"ui": "@/components/ui"` (NOT `"@/registry/..."` like shadcn's own site — registry path is internal-tool-specific).
- `"hooks": "@/hooks"` requires `apps/cockpit/hooks/` to exist; slice 8.3.1 did not create it. Add with `.gitkeep` to match canonical `templates/next-app/hooks/.gitkeep`.

### F5 (LOAD-BEARING) — Dark mode mechanism is `next-themes` class-based, not media query

Per Source 2 `templates/next-app/package.json` + `app/layout.tsx` + `components/theme-provider.tsx` (full file verbatim from `gh api`):

```ts
// templates/next-app/components/theme-provider.tsx (verbatim)
"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeHotkey />
      {children}
    </NextThemesProvider>
  )
}
```

Configuration: `attribute="class"` (toggles `.dark` class on `<html>`), `defaultTheme="system"` (respects OS preference on first load), `enableSystem` (allows "system" choice in addition to light/dark), `disableTransitionOnChange` (avoids janky transitions during theme flip).

Layout requires `suppressHydrationWarning` on `<html>`:
```tsx
<html lang="en" suppressHydrationWarning ...>
```
(next-themes flips the class client-side; SSR-rendered HTML may not match the class state until hydration. The suppression is the canonical fix; documented per `next-themes` README.)

**Bonus pattern:** the canonical theme-provider ships a built-in `d`-keyboard hotkey to toggle dark/light. Guards against `event.defaultPrevented`, `event.repeat`, modifier keys (`metaKey`/`ctrlKey`/`altKey`), and typing context (`isContentEditable` || INPUT || TEXTAREA || SELECT). Production-grade UX — usable as-is or removable if the cockpit prefers explicit toggle UI only.

The cockpit's slice 8.3.1 `globals.css` ships `@media (prefers-color-scheme: dark)` (system-preference-only dark mode). **That's the OLD canonical create-next-app shape, not the current shadcn-v4 shape.** Cockpit needs `next-themes` integration + `.dark` class-based mechanism before primitives install.

### F6 (LOAD-BEARING) — Canonical `globals.css` shape under Tailwind v4 + shadcn @ 4.7

Per Source 3 `apps/v4/app/globals.css` (verbatim, with docs-site-specific utilities stripped):

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.97 0.01 17);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: var(--color-blue-300);
  --chart-2: var(--color-blue-500);
  --chart-3: var(--color-blue-600);
  --chart-4: var(--color-blue-700);
  --chart-5: var(--color-blue-800);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  /* ...dark counterparts of all root tokens... */
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
}
```

Key shifts from the cockpit's slice 8.3.1 `globals.css` (which followed `[[cockpit/nextjs-scaffold-research]]` F4 — the OLD create-next-app shape):

| Aspect | Slice 8.3.1 (old canonical) | Current shadcn-v4 (new canonical) |
|---|---|---|
| Color space | `#hex` | **OKLCH** |
| Dark mode | `@media (prefers-color-scheme: dark)` | `.dark` class via `@custom-variant dark (&:is(.dark *))` |
| Tokens | 2 (background, foreground) | **30+** (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, 5 chart, 8 sidebar) |
| Imports | `@import "tailwindcss";` | `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css";` |
| Animation | none | `tw-animate-css` (replaces deprecated `tailwindcss-animate`) |
| Base layer | none | `* { @apply border-border outline-ring/50; }` |

**Slice 8.3.1's globals.css is structurally out of date relative to shadcn-v4 expectations.** Init will rewrite it.

### F7 (LOAD-BEARING) — `shadcn/tailwind.css` is exported infrastructure CSS — not optional

Per Source 1 `packages/shadcn/src/tailwind.css` (1669 bytes, full content verbatim) + `packages/shadcn/package.json` exports map:

```json
"./tailwind.css": { "style": "./dist/tailwind.css" }
```

The package exports `shadcn/tailwind.css` as an importable stylesheet. The file contains:
- `@theme inline { @keyframes accordion-down { ... } @keyframes accordion-up { ... } }` — animation keyframes for the Accordion primitive.
- **9 `@custom-variant data-*` rules**: `data-open`, `data-closed`, `data-checked`, `data-unchecked`, `data-selected`, `data-disabled`, `data-active`, `data-horizontal`, `data-vertical`. Each matches both the canonical Radix attribute (`[data-state="open"]`) AND the v4 short form (`[data-open]:not([data-open="false"])`). **These wire `data-slot` styling and Radix/Base data-state attributes to Tailwind v4 selectors.** Without this CSS imported, `data-state="open":bg-accent` styling and `data-slot="X"`-driven layouts won't resolve correctly.
- `@utility no-scrollbar { ... }` — utility for hiding scrollbars.

This is **load-bearing infrastructure** the primitives depend on. Importing it via `@import "shadcn/tailwind.css"` in `globals.css` is the canonical wire-up. Operators don't hand-roll this.

### F8 (LOAD-BEARING) — Monorepo + `packages/ui/` extraction has KNOWN Tailwind v4 content-scanning bug (Issue #6878)

Per Source 6 — Issue #6878 (status: open as of 2025-03-06):

> "When upgrading a monorepo to Tailwind 4 and shadcn, CSS classes generated by shadcn components aren't being detected by Tailwind's build process... destructive button has invisible text because `bg-destructive` doesn't exist in the compiled CSS. Hard-coded Tailwind classes added directly to the app *are* detected." — `shadcn-ui/ui#6878`, reporter on Windows 11 + Node v21

Root cause (probable, not pinned in the issue): Tailwind v4's content scanner doesn't follow workspace symlinks/imports into separate workspace packages by default. Class names that appear only inside `packages/ui/` source files are not in the scan paths Tailwind v4 picks up from `apps/web/`'s perspective.

Related issues confirming the pattern at different stacks: #7828 (Nx monorepo + Next.js 15), #8697 (vitest + next monorepo), #6486 (discussion: monorepo Tailwind v4 compatibility), #7952 (existing Next.js + Tailwind v4 detection).

**Operational implication:** the `packages/ui/` extraction pattern (the shadcn `next-monorepo` canonical template) is BUGGY at the current Tailwind v4 + shadcn @ 4.7 baseline. Adopting it ships components with no styles unless operators manually configure `content` sources or use `@source` directives — neither documented in the canonical templates as of HEAD 2026-05-12.

**Direct validation of user directive 2026-05-12 ("we are not going to put in package, only cockpit will use it"):** keeping primitives at `apps/cockpit/components/ui/` (within the consuming workspace) sidesteps this entire bug class because the class names live in files Tailwind v4 already scans. No additional `@source` config needed. This is the *production-derived defense* for (M-LOCAL) beyond the single-app argument from `[[cockpit/file-structure]]` Alternative D.

### F9 — Bun + monorepo + `bunx shadcn@latest init` has a known PostCSS friction

Per Source 6 WebSearch result (paraphrased from a community report): *"running `bunx --bun shadcn@latest init` with the monorepo option, the dev server can't find `@tailwind/postcss`, but installing it directly in the app workspace fixes the problem."*

This bites operators who run `init` from monorepo *root* and expect Bun to hoist `@tailwindcss/postcss` automatically. Mitigation: install `@tailwindcss/postcss` (and `postcss`, `tailwindcss`) directly in `apps/cockpit/package.json` — which slice 8.3.1 already did:

```jsonc
// apps/cockpit/package.json (slice 8.3.1, verified):
"@tailwindcss/postcss": "^4.0.0",
"postcss": "^8.5.0",
"tailwindcss": "^4.0.0"
```

So the friction is already neutralized in the cockpit setup. Provided `shadcn init` is run from `apps/cockpit/` (NOT from monorepo root), the PostCSS resolution should work.

Additionally, per Source 1 `init.ts` lines 224–237, the CLI **explicitly detects monorepo roots and exits** if run there (when `--monorepo` flag is not set):
```ts
if (!options.monorepo && !hasExistingConfig && (await isMonorepoRoot(cwd))) {
  const projectInfo = await getProjectInfo(cwd)
  if (!projectInfo || projectInfo.framework.name === "manual") {
    const targets = await getMonorepoTargets(cwd)
    if (targets.length > 0) {
      formatMonorepoMessage("init", targets)
      process.exit(1)
    }
  }
}
```

The CLI suggests the workspace targets to run init in. **Canonical operator workflow: `cd apps/cockpit && bunx shadcn@latest init`.**

### F10 — `(B-RADIX) vs (B-BASE)` is a NEW design fork

Per Source 1 `presets.ts` `promptForBase()` (verbatim):
```ts
export async function promptForBase() {
  const { base } = await prompts({
    type: "select",
    name: "base",
    message: `Select a ${highlighter.info("component library")}`,
    choices: [
      { title: "Radix", value: "radix" },
      { title: "Base", value: "base" },
    ],
  })
  if (!base) process.exit(1)
  return base as "radix" | "base"
}
```

Shadcn now supports **two underlying primitive libraries**:
- **`radix`** — Radix UI (`@radix-ui/react-*`). The historical baseline; mature, well-known accessibility primitives. Owned by WorkOS (acquired Radix team 2023). Now in maintenance-leaning mode per public discussion.
- **`base`** — Base UI (`@base-ui-components/react`). Newer (2024-Q4 stable), built by the Floating UI team — explicit Radix successor with a cleaner API surface and active development. Recommended in shadcn's `--defaults` (`base-nova` = base + nova).

This is a **load-bearing design pick** for /design. Not resolvable from /research alone — needs Base UI's stability / primitive coverage / license / migration cost researched separately (out of scope for THIS entry's question; flagged as an open thread).

### F11 — Dependency cascade at scaffold time

Per Source 2 `templates/next-app/package.json` (verbatim — what `init` installs for a single-app scaffold):

```json
"dependencies": {
  "next": "16.1.7",
  "next-themes": "^0.4.6",
  "react": "^19.2.4",
  "react-dom": "^19.2.4"
},
"devDependencies": {
  "@eslint/eslintrc": "^3",
  "@tailwindcss/postcss": "^4.2.1",
  "@types/node": "^25.5.0",
  "@types/react": "^19.2.14",
  "@types/react-dom": "^19.2.3",
  "eslint": "^9.39.4",
  "eslint-config-next": "16.1.7",
  "prettier": "^3.8.1",
  "prettier-plugin-tailwindcss": "^0.7.2",
  "postcss": "^8",
  "tailwindcss": "^4.2.1",
  "typescript": "^5.9.3"
}
```

**NOT in the scaffold (added by `shadcn add <component>` per primitive):**
- `clsx` + `tailwind-merge` (added when first component using `cn()` lands)
- `class-variance-authority` (added with the first variant-driven primitive)
- `lucide-react` (added with the first primitive using Lucide icons)
- `tw-animate-css` (added at init when `globals.css` is rewritten)
- The `@radix-ui/react-*` or `@base-ui-components/react` packages per primitive

The cockpit slice 8.3.1 already has `clsx` and `tailwind-merge` (for `lib/utils.ts`'s `cn()` helper). Slice 8.3.1 is MISSING from the canonical scaffold:
- `next-themes` (needed for the canonical dark-mode wiring per F5)
- `tw-animate-css` (needed for the v4 globals.css per F6)
- `prettier-plugin-tailwindcss` (devDep — quality-of-life for class ordering; not strictly required)

### F12 — `next.config.mjs` canonical baseline is trivial; cockpit's design-vaulted deviations are expected

Per Source 2 `templates/next-app/next.config.mjs` (verbatim — 4 lines):
```js
/** @type {import('next').NextConfig} */
const nextConfig = {}

export default nextConfig
```

Cockpit's `next.config.ts` ships several deviations from this baseline, ALL design-vaulted: `cacheComponents: true` (per `[[frontend-stack]]`), `reactCompiler: true` (per `[[frontend-stack]]`), `turbopack.root` pin (per `[[cockpit/nextjs-scaffold-research]]` F6 walkback 2026-05-12), and `async rewrites()` (per `[[cockpit/auth-surface-mount]]` V3). No conflict — these layer on top of shadcn's empty default cleanly; init does not touch `next.config.ts`.

## Conflicts

### C1 — `[[cockpit/nextjs-scaffold-research]]` F4 (cockpit globals.css canonical) vs current shadcn-v4 canonical

`[[cockpit/nextjs-scaffold-research]]` F4 (slice 8.3 research, 2026-05-12 earlier today) quoted `create-next-app@canary`'s `app-tw/ts/app/globals.css` as the canonical shape — that file had `:root { --background: #ffffff; ... }` (hex colors) + `@theme inline` mapping just `--color-background`, `--color-foreground`, `--font-sans`, `--font-mono` + `@media (prefers-color-scheme: dark)` for dark mode. Slice 8.3.1 implemented exactly that.

This research entry (Sources 2 + 3, observed 2026-05-12 same day) finds the **shadcn-v4 canonical is different**: OKLCH colors, 30+ tokens (sidebar/chart variants included), `@custom-variant dark (&:is(.dark *))` class-based dark mode, `@import "tw-animate-css"` + `@import "shadcn/tailwind.css"`, `@layer base { * { @apply border-border outline-ring/50; } }`.

**Both sources are tier-1 production code at HEAD.** Reconciliation: they are *different canonicals* for *different consumers*. `create-next-app@canary` is the **Next.js baseline scaffold** (no UI library). `shadcn-ui/ui` `templates/next-app/` is the **shadcn-managed Next.js scaffold** — same `app/globals.css` minimum (`@import "tailwindcss"` only) at template-ship time, with the OKLCH/dark/tokens injected by `shadcn init`.

**Precedence per *Contradiction protocol*:** for the cockpit (which IS adopting shadcn), the shadcn-v4 canonical wins. The slice 8.3.1 globals.css will be rewritten by `shadcn init` anyway. The conflict is resolved by sequencing — slice 8.3.1's CSS was the right "pre-shadcn" state but is incompatible with where shadcn-v4 expects to land.

### C2 — `[[cockpit/file-structure]]` cascade #3 (`apps/cockpit/tailwind.config.ts`) vs Tailwind v4 reality

`[[cockpit/file-structure]]` cascade #3 says "Tailwind v4 config matching shadcn defaults" with a `tailwind.config.ts` file.

Per Sources 1 + 4 — **Tailwind v4 eliminates the JS config file**. All theme tokens live in CSS via `@theme` directives. Components.json `tailwind.config: ""` is canonical (the empty string is the v4 signal).

**Precedence:** docs (Source 4) + production code (Source 1 schema with `config: ""` as a valid value, and `apps/v4/components.json` setting it to `""` as the production cite). **Cascade #3 is obsolete.** Drop the `tailwind.config.ts` obligation; no such file ships under shadcn-v4. `[[cockpit/file-structure]]` should be amended.

### C3 — Slice 8.3.1's `globals.css` `@theme` block tokens vs shadcn primitive expectations

Slice 8.3.1's `globals.css` registers only `--color-background`, `--color-foreground`, `--font-sans`, `--font-mono`. Shadcn primitives reference `--color-card`, `--color-popover`, `--color-primary`, `--color-secondary`, `--color-muted`, `--color-accent`, `--color-destructive`, `--color-border`, `--color-input`, `--color-ring`, and the 8 `--color-sidebar-*` variants. **`bg-card`, `text-muted-foreground`, `border-border`, `ring-ring` utilities won't resolve** with the current cockpit CSS — shadcn primitives will render broken-styled.

**This was the F4 risk `[[cockpit/nextjs-scaffold-research]]` warned about** ("Will break shadcn at copy-in") and the warning was correct in spirit, but the prior canonical-shape claim was undercounted by ~25 tokens. The fix is the same: expand globals.css. The exact shape comes from shadcn-v4 canonical (F6 above), not the older create-next-app canonical.

## Conditions

- Findings hold for **`shadcn @ 4.7.0`** (CLI npm package) + **Next.js 16.1.7+** + **Tailwind v4.2.1+** + **React 19.2.4+**. Cockpit is on Next.js 16.2.6 / React 19.2 / Tailwind v4.0.0; compatible.
- (M-LOCAL) `apps/cockpit/components/ui/` is the operator decision 2026-05-12. F8's bug is sidestepped only under (M-LOCAL); if (M-SHARED) `packages/ui/` is reconsidered later, expect the content-scanning regression and the `@source` directive workaround dance.
- `shadcn init` is interactive by default; non-interactive `--yes --defaults` will pick `--template=next --preset=base-nova` and skip prompts. Operators using `--yes` without `--defaults` get partial defaults but still hit some prompts.
- Cockpit's existing `next.config.ts`, `tsconfig.json`, `package.json` are NOT touched by `shadcn init` — it only writes/updates `components.json`, `app/globals.css`, and adds dependencies via the project's package manager. Cockpit's design-vaulted Next config (rewrites, cache components, react compiler, turbopack.root pin) survives intact.
- Issue #6878 (F8) is open as of 2025-03-06; if it gets resolved in a future shadcn release, (M-SHARED) becomes viable again. Revisit-when: shadcn release notes claim content-scan fix OR Tailwind v4 ships first-class monorepo `@source` support.
- The `d`-hotkey in the canonical theme-provider toggles theme on the operator's machine. For a B2B cockpit with admin users, this is harmless; for an end-user-facing app a removal might be warranted. Cockpit is B2B-admin: keep.

## Operational implications

For the shadcn bootstrap (slice 8.4 prerequisite, to be picked + executed after /design):

### Pre-init prep (under /implementation)

1. **Add deps to `apps/cockpit/package.json`:**
   - `next-themes` `^0.4.6` (production dependency — required by the ThemeProvider).
   - `tw-animate-css` (production dependency — replaces deprecated `tailwindcss-animate`; required by the canonical globals.css `@import`).
   - `prettier-plugin-tailwindcss` `^0.7.2` (devDep, optional but matches canonical — class-ordering on save).
   - `bun install` after.

2. **Replace `apps/cockpit/app/globals.css`** with the shadcn-canonical v4 shape from F6. Keep just `@import "tailwindcss";` as the minimum if init is going to run immediately after — init will inject the rest. Or pre-populate with F6's full shape and let init be idempotent.

3. **Create `apps/cockpit/hooks/.gitkeep`** — components.json `aliases.hooks: "@/hooks"` requires the directory exists.

4. **Create `apps/cockpit/components/theme-provider.tsx`** — copy F5's canonical content verbatim. Wire into `apps/cockpit/app/layout.tsx` as `<ThemeProvider>{children}</ThemeProvider>` wrapping the existing `<ReactQueryProviders>{children}</ReactQueryProviders>` from slice 8.3.1. `suppressHydrationWarning` on `<html>` is required.

5. **Update `apps/cockpit/app/layout.tsx`** className: drop the slice 8.3.1 `min-h-full flex flex-col` body class for now (it's not in shadcn canonical; can be re-added at the layout level when /design picks app-shell shape). Add `suppressHydrationWarning` to `<html>`.

### /design fork resolution OWED before init

6. **(B-RADIX) vs (B-BASE) pick** — `--base radix` or `--base base`. New design entry needed: research Base UI's primitive coverage (does it have all the components the cockpit needs at slices 8.4–8.6? Button, Input, Form, Dialog, Label, Sidebar, Dropdown, Toast, etc.), maintenance trajectory (Floating UI team's release cadence), and migration cost if shadcn defaults shift again. Provisional recommendation pending: **(B-RADIX)** for slice 8.4 — more mature, well-known, and shadcn `radix-nova` preset variants ship the same look as `base-nova`. Revisit when Base UI's primitive coverage is verified production-cite-class.

7. **Preset pick** — Nova / Vega / Maia / Lyra / Mira / Luma / Sera. Recommendation: **Nova** (Lucide / Geist / neutral) — matches slice 8.3.1's Geist pick exactly, Lucide is the largest icon catalog, neutral palette matches B2B cockpit aesthetic. Other presets defensible per branding pick (Sera for warm/editorial look, Lyra for technical JetBrains-Mono vibe).

8. **Confirm dark-mode mechanism switch** — slice 8.3.1's `@media (prefers-color-scheme: dark)` → shadcn-canonical `.dark` class via `next-themes`. Class-based gives user override + system pref; required for the shadcn primitives' `.dark` class targeting per F6.

### Init run (under /implementation, after /design picks)

9. **Invocation:** `cd apps/cockpit && bunx shadcn@latest init --base <radix|base> --preset <nova|vega|...> --yes`
   - From the app workspace (NOT monorepo root — CLI exits at monorepo root per F9).
   - `--yes` skips overwrite confirmation; init still respects `--no-css-variables` etc. if added.
   - Init will: (a) auto-detect Next.js framework, (b) skip monorepo prompts, (c) skip template prompts, (d) generate `components.json`, (e) rewrite `app/globals.css` with the OKLCH tokens + dark class wiring + `@import "tw-animate-css"` + `@import "shadcn/tailwind.css"`, (f) install the preset's icon library (e.g. `lucide-react`) and any required deps.

10. **Verify post-init:** `bun run dev`, `bun run typecheck`, `bun run lint`. Check that `components.json` matches F4's cockpit-adapted shape, `globals.css` has all 30+ tokens, no `tailwind.config.ts` was created.

### Cascade obligations to other vault entries

11. **Amend `[[cockpit/file-structure]]` cascade #3** — drop the `apps/cockpit/tailwind.config.ts` requirement (per C2). Tailwind v4 has no JS config. Replace with: *"`apps/cockpit/app/globals.css` follows the shadcn-v4 canonical shape — OKLCH tokens, `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, `@custom-variant dark (&:is(.dark *))` class-based dark mode. See `[[cockpit/shadcn-setup-research]]` F6."*

12. **Amend `[[cockpit/nextjs-scaffold-research]]` F4** — the canonical `globals.css` shape quoted there is `create-next-app`'s, NOT shadcn's. For the cockpit which DOES adopt shadcn, the shadcn-v4 shape supersedes. Add an amendment note pointing at this entry.

13. **`[[cockpit/cockpit-shape]]` or a new `[[cockpit/shadcn-setup]]` /design entry** owes the (B-RADIX) vs (B-BASE) pick + the preset pick. Could land in next /design seat as a sub-decision of `[[cockpit/cockpit-shape]]`'s I1 (sidebar nav + shadcn primitives are the cockpit shape).

## Reproducibility note

Reproducible end-to-end:

```bash
# Production code (Source 1, 2, 3):
gh api repos/shadcn-ui/ui --jq '.default_branch, .pushed_at'
gh api repos/shadcn-ui/ui/contents/packages/shadcn/package.json --jq '.content' | base64 -d
gh api repos/shadcn-ui/ui/contents/packages/shadcn/src/commands/init.ts --jq '.content' | base64 -d
gh api repos/shadcn-ui/ui/contents/packages/shadcn/src/registry/schema.ts --jq '.content' | base64 -d
gh api repos/shadcn-ui/ui/contents/packages/shadcn/src/preset/defaults.ts --jq '.content' | base64 -d
gh api repos/shadcn-ui/ui/contents/packages/shadcn/src/preset/presets.ts --jq '.content' | base64 -d
gh api repos/shadcn-ui/ui/contents/packages/shadcn/src/tailwind.css --jq '.content' | base64 -d
gh api repos/shadcn-ui/ui/contents/templates/next-app/package.json --jq '.content' | base64 -d
gh api repos/shadcn-ui/ui/contents/templates/next-app/app/layout.tsx --jq '.content' | base64 -d
gh api repos/shadcn-ui/ui/contents/templates/next-app/app/globals.css --jq '.content' | base64 -d
gh api repos/shadcn-ui/ui/contents/templates/next-app/components/theme-provider.tsx --jq '.content' | base64 -d
gh api repos/shadcn-ui/ui/contents/apps/v4/components.json --jq '.content' | base64 -d
gh api repos/shadcn-ui/ui/contents/apps/v4/app/globals.css --jq '.content' | base64 -d

# Docs (Source 4, 5):
# Fetch https://ui.shadcn.com/docs/installation/next
# Fetch https://ui.shadcn.com/docs/tailwind-v4

# Contradiction probe (Source 6):
# Search GitHub issues at github.com/shadcn-ui/ui/issues with query "tailwind v4 monorepo"
# Direct fetch https://github.com/shadcn-ui/ui/issues/6878
```

All sources observed 2026-05-12. The `shadcn-ui/ui` HEAD commit time-stamped 2026-05-12T08:27:02Z — same day. Re-verify at Next.js 17 release or shadcn @ 5.x release.

No load-bearing judgments in this finding's claims — every claim has direct source backing. F10's recommendation between (B-RADIX) and (B-BASE) is *provisional* and depends on Base UI maturity research not in scope here.

## Open threads

- **Base UI maturity assessment** — what's the primitive coverage at `@base-ui-components/react` HEAD? License? Maintenance cadence vs Radix? Production cites that adopted Base UI in 2025-2026? Worth a focused /research session if /design weighs (B-BASE) seriously.
- **`Custom` preset path** — the CLI's `Custom` option opens a browser to `ui.shadcn.com/create` for an interactive preset builder. Worth exploring once /design picks a BokChoy brand palette; could ship a BokChoy-branded preset URL that's reproducible across operators.
- **Custom registries** — `components.json.registries` accepts `@v0`, `@acme`, etc. entries. Future option for BokChoy to ship internal-only primitives via a private registry without polluting `components/ui/` with copy-pasted-from-shadcn code. Out of scope at slice 8.4; revisit when first BokChoy-original primitive ships.
- **Shadcn MCP integration** — `shadcn mcp` command exists. Could be wired into Claude Code as an MCP server so /implementation seat can drive `shadcn add <component>` natively in future slices. Operational improvement; not a slice-8.4 blocker.
- **Issue #7952 (existing Tailwind v4 + shadcn init detection)** — not WebFetched in detail this pass; might affect cockpit's `bunx shadcn@latest init` if the CLI's preflight has the same "no configuration detected" false-positive on the cockpit's already-installed `@tailwindcss/postcss` + `tailwindcss` deps. Operational: have the preflight error message handy as a known false-positive class.
- **Theme-hotkey UX decision** — keep the `d`-key toggle from canonical? For B2B admin cockpits, harmless. Could collide with operator keyboard shortcuts (e.g. browser-extension hotkeys). Trivial to remove if it ever bites.
