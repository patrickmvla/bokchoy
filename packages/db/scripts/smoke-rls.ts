#!/usr/bin/env bun
//
// Smoke-test RLS enforcement on RLS-protected tables.
// Run after `drizzle-kit migrate` against the local stack.
//
// Verifies, against the live local stack:
//   1. bokchoy_app SELECT without GUC → ERROR (current_setting one-arg form raises).
//   2. bokchoy_app SELECT with GUC = p1 → sees only p1's player.
//   3. bokchoy_app SELECT with GUC = p2 → sees only p2's player.
//   4. bokchoy_app INSERT under p1 GUC with project_id=p2 → RLS denial.
//   5. postgres (BYPASSRLS) sees both rows even with FORCE RLS.

import postgres from 'postgres';

const APP_URL = process.env.DATABASE_URL;
const MIG_URL = process.env.DATABASE_MIGRATION_URL;
if (!APP_URL || !MIG_URL) {
  throw new Error('DATABASE_URL and DATABASE_MIGRATION_URL must be set');
}

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const P1 = '22222222-2222-2222-2222-222222222222';
const P2 = '33333333-3333-3333-3333-333333333333';
const PLAYER_1 = '44444444-4444-4444-4444-444444444444';
const PLAYER_2 = '55555555-5555-5555-5555-555555555555';

const admin = postgres(MIG_URL, { prepare: false, onnotice: () => {} });
const app = postgres(APP_URL, { prepare: false, onnotice: () => {} });

let failures = 0;
const ok = (msg: string) => console.log(`OK    ${msg}`);
const fail = (msg: string) => {
  console.error(`FAIL  ${msg}`);
  failures++;
};

async function setup() {
  await admin.begin(async (tx) => {
    await tx`INSERT INTO "organization" (id, name, slug)
             VALUES (${ORG_ID}, 'rls-smoke-org', 'rls-smoke-org')`;
    await tx`INSERT INTO projects (id, organization_id, name, slug) VALUES
             (${P1}, ${ORG_ID}, 'p1', 'rls-smoke-p1'),
             (${P2}, ${ORG_ID}, 'p2', 'rls-smoke-p2')`;
    await tx`INSERT INTO players (id, project_id) VALUES
             (${PLAYER_1}, ${P1}),
             (${PLAYER_2}, ${P2})`;
  });
}

async function teardown() {
  await admin`DELETE FROM players WHERE id IN (${PLAYER_1}, ${PLAYER_2})`;
  await admin`DELETE FROM projects WHERE id IN (${P1}, ${P2})`;
  await admin`DELETE FROM "organization" WHERE id = ${ORG_ID}`;
}

async function test1_select_without_guc() {
  try {
    await app`SELECT count(*) FROM players`;
    fail('Test 1: SELECT without GUC should have raised');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('app.current_tenant') || msg.includes('unrecognized configuration')) {
      ok(`Test 1: SELECT without GUC → expected error: ${msg}`);
    } else {
      fail(`Test 1: SELECT without GUC raised unexpected error: ${msg}`);
    }
  }
}

async function test2_select_p1_guc() {
  await app.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${P1}, true)`;
    const rows = await tx<{ id: string; project_id: string }[]>`SELECT id, project_id FROM players`;
    if (rows.length === 1 && rows[0].project_id === P1) {
      ok(`Test 2: GUC=p1 → 1 row with project_id=p1`);
    } else {
      fail(`Test 2: GUC=p1 → expected 1 row from p1, got ${JSON.stringify(rows)}`);
    }
  });
}

async function test3_select_p2_guc() {
  await app.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${P2}, true)`;
    const rows = await tx<{ id: string; project_id: string }[]>`SELECT id, project_id FROM players`;
    if (rows.length === 1 && rows[0].project_id === P2) {
      ok(`Test 3: GUC=p2 → 1 row with project_id=p2`);
    } else {
      fail(`Test 3: GUC=p2 → expected 1 row from p2, got ${JSON.stringify(rows)}`);
    }
  });
}

async function test4_insert_mismatched_project() {
  try {
    await app.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant', ${P1}, true)`;
      await tx`INSERT INTO players (project_id) VALUES (${P2})`;
    });
    fail('Test 4: INSERT with mismatched project_id should have been denied');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('row-level security') || msg.includes('violates row-level')) {
      ok(`Test 4: INSERT mismatched project_id → expected RLS denial: ${msg}`);
    } else {
      fail(`Test 4: INSERT mismatched project_id raised unexpected error: ${msg}`);
    }
  }
}

async function test5_postgres_sees_all_with_force_rls() {
  const rows = await admin<{ count: string }[]>`
    SELECT count(*)::text AS count FROM players
    WHERE project_id IN (${P1}, ${P2})
  `;
  const count = Number(rows[0].count);
  if (count === 2) {
    ok(`Test 5: postgres (BYPASSRLS) sees ${count} rows under FORCE RLS`);
  } else {
    fail(`Test 5: expected 2 rows visible to postgres, got ${count}`);
  }
}

try {
  await setup();
  await test1_select_without_guc();
  await test2_select_p1_guc();
  await test3_select_p2_guc();
  await test4_insert_mismatched_project();
  await test5_postgres_sees_all_with_force_rls();
} finally {
  await teardown();
  await admin.end();
  await app.end();
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll RLS smoke tests passed.');
