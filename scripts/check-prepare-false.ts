#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';

// Cascade-10 enforcement per [[backend-stack]] §10:
// every postgres-js client construction must pass `prepare: false`
// (Supavisor transaction-mode incompatibility with prepared statements).
// Mirrors the cascade-9 FORCE-RLS scripted-check pattern; lint-rule alternative
// is a Biome GritQL plugin (open thread per [[tooling-research]] Q1).
//
// Add new paths here if additional postgres-js client factories emerge.
const TARGET_FILES = ['packages/db/src/client.ts'];

let failed = false;

for (const path of TARGET_FILES) {
  if (!existsSync(path)) {
    console.error(`MISSING: ${path}`);
    failed = true;
    continue;
  }

  const src = readFileSync(path, 'utf8');

  if (!src.includes('postgres(')) {
    console.log(`SKIP:    ${path} — does not call postgres()`);
    continue;
  }

  if (!src.includes('prepare: false')) {
    console.error(`FAIL:    ${path} — calls postgres() but lacks 'prepare: false' (cascade-10)`);
    failed = true;
    continue;
  }

  console.log(`OK:      ${path}`);
}

if (failed) {
  console.error('\ncascade-10 check FAILED — see [[backend-stack]] §10');
  process.exit(1);
}

console.log('\ncascade-10 check passed');
