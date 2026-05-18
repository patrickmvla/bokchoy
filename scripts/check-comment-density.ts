#!/usr/bin/env bun
/** @module — Advisory: flag files with >10% standalone comment density per [[_shared/comment-conventions]] (vi). */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SCAN_ROOTS = ['apps', 'packages'];
const EXCLUDE_PREFIXES = ['packages/db/scripts/', 'packages/db/drizzle/', 'scripts/'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'drizzle', '.next']);
const THRESHOLD = 10;

function* walkSourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walkSourceFiles(full);
    } else if (st.isFile()) {
      const rel = relative('.', full).split(sep).join('/');
      if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue;
      if (rel.endsWith('.ts') || rel.endsWith('.tsx')) yield rel;
    }
  }
}

interface FileStats {
  path: string;
  loc: number;
  standalone: number;
  density: number;
}

/**
 * Count standalone comment lines outside JSDoc-on-export blocks. A JSDoc block
 * `/** ... *\/` is "on-export" iff the next non-blank line starts with `export`.
 * Approximation: ignores TS string-literal `//` (acceptable at advisory tier).
 */
function analyze(src: string): { loc: number; standalone: number } {
  const lines = src.split('\n');
  const loc = lines.length;
  const onExportJsdocLines = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const open = lines[i] ?? '';
    if (!/^\s*\/\*\*/.test(open)) continue;
    let j = i;
    while (j < lines.length && !/\*\//.test(lines[j] ?? '')) j++;
    if (j >= lines.length) break;
    let k = j + 1;
    while (k < lines.length && (lines[k] ?? '').trim() === '') k++;
    if (k < lines.length && /^\s*export\b/.test(lines[k] ?? '')) {
      for (let n = i; n <= j; n++) onExportJsdocLines.add(n);
    }
    i = j;
  }

  let standalone = 0;
  for (let i = 0; i < lines.length; i++) {
    if (onExportJsdocLines.has(i)) continue;
    if (/^\s*(\/\/|\/\*|\*\/|\*\s|\*$)/.test(lines[i] ?? '')) standalone++;
  }
  return { loc, standalone };
}

const flagged: FileStats[] = [];
let scanned = 0;
for (const root of SCAN_ROOTS) {
  for (const path of walkSourceFiles(root)) {
    if (EXCLUDE_PREFIXES.some((p) => path.startsWith(p))) continue;
    scanned++;
    const { loc, standalone } = analyze(readFileSync(path, 'utf8'));
    if (loc === 0) continue;
    const density = (standalone / loc) * 100;
    if (density > THRESHOLD) flagged.push({ path, loc, standalone, density });
  }
}

flagged.sort((a, b) => b.density - a.density);

if (flagged.length === 0) {
  console.log(
    `comment density advisory: ${scanned} files scanned, 0 above ${THRESHOLD}% threshold.`,
  );
} else {
  console.log(
    `comment density advisory: ${flagged.length}/${scanned} files above ${THRESHOLD}% threshold (per [[_shared/comment-conventions]] target <5%).`,
  );
  console.log('');
  console.log('  density  loc  cmt  file');
  console.log('  ───────  ───  ───  ─────────────────────────────────────────────────────────');
  for (const f of flagged) {
    const pct = f.density.toFixed(1).padStart(5);
    const loc = String(f.loc).padStart(4);
    const cmt = String(f.standalone).padStart(3);
    console.log(`  ${pct}%   ${loc} ${cmt}  ${f.path}`);
  }
  console.log('');
  console.log('Advisory only — not a CI gate. Strip narrative headers + re-explains;');
  console.log('keep JSDoc-on-exports + 1-3 line invariant comments + external spec URLs.');
  console.log('SDK public-API files (packages/sdk-node/src/) are exempt — see (vii.a).');
}
