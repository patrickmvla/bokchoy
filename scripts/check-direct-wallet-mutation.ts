#!/usr/bin/env bun

//
// CI lint: catch direct mutations to wallet-primitive-protected tables in
// app/package TS code outside the wallet-package boundary.
//
// Per [[wallet-mechanics]] Amendment Part 1 A1: under M1 (app-library +
// discipline), the function set (wallet_credit / wallet_debit /
// wallet_deidentify_player / bootstrap_project_reason_codes) is the
// convenient/blessed mutation path; direct table mutation is not blocked at
// the privilege level, so the bypass-failure mode (an engineer adds a parallel
// path) is mitigated by THIS lint + code review + integration tests.
//
// Per [[wallet-mechanics]] Amendment Part 3 A17: the protected-table list
// extends to currencies, reason_codes, idempotency_keys alongside the original
// wallets / transactions / loot_rolls / iap_receipts.
//
// What's caught:
//   • Raw SQL keywords inside any TS context — `UPDATE wallets`,
//     `INSERT INTO transactions`, `DELETE FROM idempotency_keys`. Optional
//     double-quoting around the table name is allowed (Postgres convention).
//   • Drizzle query-builder calls — `db.update(wallets)`, `tx.insert(transactions)`,
//     `db.delete(currencies)`. Bypasses M1 just as much as raw SQL.
//
// What's excluded:
//   • packages/db/scripts/  — smoke-test setup uses legitimate raw INSERT for
//     fixtures; tests write the rows the M1 functions then mutate.
//   • packages/db/drizzle/  — migration SQL files; not TS, but defensive.
//   • node_modules/, dist/, .turbo/  — never scanned.
//   • packages/wallet/      — the wallet-package boundary that legitimately
//                              wraps the M1 functions (per Part 1 A1).
//                              Mutations there ARE the M1 path.
//
// Per-statement opt-out comment for genuine edge cases (e.g., a future migration
// helper, or cross-cutting middleware that mutates one specific protected table
// for one specific reason). Placement per [[direct-mutation-lint-opt-out-shape]]:
//
//   (a) Single-line SQL — TS `//` comment on the SAME line as the SQL keyword:
//
//       await tx`UPDATE wallets SET … WHERE …`;  // allow-direct-mutation: <reason>
//
//   (b) Single-line SQL — TS `//` comment on the line IMMEDIATELY PRECEDING:
//
//       // allow-direct-mutation: <reason>
//       await tx`UPDATE wallets SET … WHERE …`;
//
//   (c) Multi-line `sql`...`` template — Postgres `--` comment INSIDE the template,
//       on the line IMMEDIATELY PRECEDING the SQL keyword (// can't live inside a
//       template literal — it's string content, not TS):
//
//       const inserted = await tx.execute(sql`
//         -- allow-direct-mutation: <reason>
//         INSERT INTO idempotency_keys (...) VALUES (...) RETURNING id
//       `);
//
// N=1 lookback only — opt-out covers the SAME line OR the line IMMEDIATELY
// PRECEDING. Mirrors // biome-ignore-next-line / // eslint-disable-next-line /
// // @ts-expect-error semantics. Production-cited × 3 (Biome / ESLint / TS).
//
// Run: `bun run check:direct-mutation`. Wired into CI alongside lint:check,
// typecheck, and check:prepare-false.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const PROTECTED_TABLES = [
  'wallets',
  'transactions',
  'loot_rolls',
  'iap_receipts',
  'currencies',
  'reason_codes',
  'idempotency_keys',
] as const;

const TABLE_ALT = PROTECTED_TABLES.join('|');

// Raw-SQL pattern: UPDATE / INSERT INTO / DELETE FROM + (optionally quoted) table.
// Word boundary on left avoids matching within identifiers.
const SQL_RE = new RegExp(
  `\\b(UPDATE|INSERT\\s+INTO|DELETE\\s+FROM)\\s+"?(${TABLE_ALT})"?\\b`,
  'gi',
);

// Drizzle pattern: .update(table) / .insert(table) / .delete(table).
const DRIZZLE_RE = new RegExp(`\\.(update|insert|delete)\\(\\s*(${TABLE_ALT})\\b`, 'g');

const SCAN_ROOTS = ['apps', 'packages'];
const EXCLUDE_PREFIXES = ['packages/db/scripts/', 'packages/db/drizzle/', 'packages/wallet/'];
// Skip directories that never contain hand-written source.
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'drizzle']);

function* walkTsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (st.isFile() && full.endsWith('.ts')) {
      // Normalize to forward slashes for consistent prefix matching.
      yield relative('.', full).split(sep).join('/');
    }
  }
}

// Accepts TS `//` (outside templates) OR Postgres `--` (inside `sql`...`` templates,
// where `//` is string content not a TS comment). Per [[direct-mutation-lint-opt-out-shape]].
const OPT_OUT_RE = /(?:\/\/|--)\s*allow-direct-mutation\b/;

function isOptedOut(lines: string[], i: number): boolean {
  return OPT_OUT_RE.test(lines[i]) || (i > 0 && OPT_OUT_RE.test(lines[i - 1]));
}

interface Hit {
  path: string;
  line: number;
  col: number;
  match: string;
  text: string;
}

const hits: Hit[] = [];
const scanned: string[] = [];

for (const root of SCAN_ROOTS) {
  for (const path of walkTsFiles(root)) {
    if (EXCLUDE_PREFIXES.some((p) => path.startsWith(p))) continue;
    scanned.push(path);

    const src = readFileSync(path, 'utf8');
    const lines = src.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isOptedOut(lines, i)) continue;

      // Reset lastIndex per line for global regexes.
      SQL_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic exec loop
      while ((m = SQL_RE.exec(line)) !== null) {
        hits.push({ path, line: i + 1, col: m.index + 1, match: m[0], text: line.trim() });
      }

      DRIZZLE_RE.lastIndex = 0;
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic exec loop
      while ((m = DRIZZLE_RE.exec(line)) !== null) {
        hits.push({ path, line: i + 1, col: m.index + 1, match: m[0], text: line.trim() });
      }
    }
  }
}

if (hits.length > 0) {
  console.error(`direct-mutation check FAILED — ${hits.length} hit(s):\n`);
  for (const h of hits) {
    console.error(`  ${h.path}:${h.line}:${h.col}  ${h.match}`);
    console.error(`    ${h.text}`);
  }
  console.error(`\nProtected tables (${PROTECTED_TABLES.join(', ')}) must be mutated only`);
  console.error('through the M1 stored functions (wallet_credit, wallet_debit,');
  console.error('wallet_deidentify_player, bootstrap_project_reason_codes). See');
  console.error('[[wallet-mechanics]] Amendment Part 1 A1 + Part 3 A17.');
  console.error(
    '\nIf intentional, add `// allow-direct-mutation: <reason>` to the line or the line above',
  );
  console.error(
    '(TS context), OR `-- allow-direct-mutation: <reason>` immediately preceding the SQL keyword',
  );
  console.error('inside the template literal.');
  process.exit(1);
}

console.log(`direct-mutation check passed (${scanned.length} files scanned)`);
