#!/usr/bin/env bun
//
// Smoke-test idempotency_keys_reaper function per Slice 6.
//
// Verifies:
//   1. Old completed rows are deleted.
//   2. Recent completed rows survive (within max_age).
//   3. Old rows that are locked-but-not-completed survive (in-flight).
//   4. Old rows that are never locked (no completed_at + no locked_at) survive.
//   5. Cross-tenant — rows from multiple projects all get reaped in one call
//      (function bypasses RLS via SECURITY DEFINER + BYPASSRLS owner).
//   6. Custom interval — a 1-hour threshold reaps the in-between rows.
//   7. Idempotent re-call — second call with same threshold returns 0.

import postgres from 'postgres';

const APP_URL = process.env.DATABASE_URL;
const MIG_URL = process.env.DATABASE_MIGRATION_URL;
if (!APP_URL || !MIG_URL) {
  throw new Error('DATABASE_URL and DATABASE_MIGRATION_URL must be set');
}

const ORG_ID = 'fafafafa-fafa-fafa-fafa-fafafafafafa';
const PROJECT_A = 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd';
const PROJECT_B = 'efefefef-efef-efef-efef-efefefefefef';

const admin = postgres(MIG_URL, { prepare: false, onnotice: () => {} });
const app = postgres(APP_URL, { prepare: false, onnotice: () => {} });

let failures = 0;
const ok = (msg: string) => console.log(`OK    ${msg}`);
const fail = (msg: string) => {
  console.error(`FAIL  ${msg}`);
  failures++;
};

interface Row {
  id?: number;
  project_id: string;
  key: string;
  ageHours: number;
  state: 'completed' | 'locked' | 'pending';
}

const ROWS: Row[] = [
  // Project A.
  { project_id: PROJECT_A, key: 'a-recent-completed', ageHours: 1, state: 'completed' },
  { project_id: PROJECT_A, key: 'a-old-completed', ageHours: 26, state: 'completed' },
  { project_id: PROJECT_A, key: 'a-old-locked', ageHours: 26, state: 'locked' },
  { project_id: PROJECT_A, key: 'a-old-pending', ageHours: 26, state: 'pending' },
  { project_id: PROJECT_A, key: 'a-mid-completed-2h', ageHours: 2, state: 'completed' },
  // Project B (verifies cross-tenant reaping).
  { project_id: PROJECT_B, key: 'b-old-completed', ageHours: 30, state: 'completed' },
  { project_id: PROJECT_B, key: 'b-recent-completed', ageHours: 1, state: 'completed' },
];

async function setup() {
  await admin.begin(async (tx) => {
    await tx`INSERT INTO "organization" (id, name, slug)
             VALUES (${ORG_ID}, 'reaper-smoke-org', 'reaper-smoke-org')`;
    await tx`INSERT INTO projects (id, organization_id, name, slug) VALUES
             (${PROJECT_A}, ${ORG_ID}, 'A', 'reaper-smoke-a'),
             (${PROJECT_B}, ${ORG_ID}, 'B', 'reaper-smoke-b')`;
  });
  // Insert rows with manipulated timestamps. Run as admin (BYPASSRLS) since the
  // setup writes across two projects.
  for (const r of ROWS) {
    const completedAtSql =
      r.state === 'completed' ? `NOW() - INTERVAL '${r.ageHours} hours'` : 'NULL';
    const lockedAtSql =
      r.state === 'completed' || r.state === 'locked'
        ? `NOW() - INTERVAL '${r.ageHours} hours'`
        : 'NULL';
    // Drop into raw SQL to control created_at directly.
    const result = await admin.unsafe(
      `INSERT INTO idempotency_keys
        (project_id, idempotency_key, request_method, request_path, request_params,
         locked_at, completed_at, created_at)
       VALUES ($1, $2, 'POST', '/v1/test', '{}'::jsonb,
               ${lockedAtSql}, ${completedAtSql},
               NOW() - INTERVAL '${r.ageHours} hours')
       RETURNING id`,
      [r.project_id, r.key],
    );
    r.id = (result[0] as { id: number }).id;
  }
}

async function teardown() {
  // Belt-and-suspenders: delete by both inserted-id (in case some survived
  // the reaper) and by project (in case anything else got dropped here).
  await admin`DELETE FROM idempotency_keys WHERE project_id IN (${PROJECT_A}, ${PROJECT_B})`;
  await admin`DELETE FROM projects WHERE id IN (${PROJECT_A}, ${PROJECT_B})`;
  await admin`DELETE FROM "organization" WHERE id = ${ORG_ID}`;
}

async function survivingKeys(): Promise<Set<string>> {
  const rows = await admin<{ key: string }[]>`
    SELECT idempotency_key AS key FROM idempotency_keys
    WHERE project_id IN (${PROJECT_A}, ${PROJECT_B})
  `;
  return new Set(rows.map((r) => r.key));
}

async function test1_default_24h_reaper() {
  const r = await admin<{ deleted: string }[]>`
    SELECT idempotency_keys_reaper()::text AS deleted
  `;
  const deleted = Number(r[0].deleted);
  const surviving = await survivingKeys();
  // Expected to delete: a-old-completed, b-old-completed (the only two that are
  // both completed AND > 24h). Everything else survives.
  const expectedSurvivors = new Set([
    'a-recent-completed',
    'a-old-locked',
    'a-old-pending',
    'a-mid-completed-2h',
    'b-recent-completed',
  ]);
  if (deleted === 2 && eqSets(surviving, expectedSurvivors)) {
    ok(`Test 1: default 24h reaper deleted 2 rows; ${surviving.size} survivors match expected set`);
  } else {
    fail(
      `Test 1: deleted=${deleted}, surviving=${[...surviving].join(',')}, expected=${[...expectedSurvivors].join(',')}`,
    );
  }
}

async function test2_idempotent_replay() {
  const r = await admin<{ deleted: string }[]>`
    SELECT idempotency_keys_reaper()::text AS deleted
  `;
  if (Number(r[0].deleted) === 0) {
    ok(`Test 2: re-call with same threshold returns 0 (idempotent)`);
  } else {
    fail(`Test 2: re-call deleted ${r[0].deleted} rows; expected 0`);
  }
}

async function test3_custom_short_interval() {
  // 90-minute threshold sweeps `a-mid-completed-2h` (120 min old, completed)
  // and leaves the recent ones (60 min old). 90 min is chosen to be clearly
  // between the two ages — a 60-minute threshold against 60-min-old rows
  // races the wall clock since DB-side NOW() advances between setup and reap.
  const r = await admin<{ deleted: string }[]>`
    SELECT idempotency_keys_reaper(INTERVAL '90 minutes')::text AS deleted
  `;
  const deleted = Number(r[0].deleted);
  const surviving = await survivingKeys();
  const expectedSurvivors = new Set([
    'a-recent-completed',
    'a-old-locked',
    'a-old-pending',
    'b-recent-completed',
  ]);
  if (deleted === 1 && eqSets(surviving, expectedSurvivors)) {
    ok(`Test 3: 90-minute interval reaped a-mid-completed-2h; recent rows survive`);
  } else {
    fail(
      `Test 3: deleted=${deleted}, surviving=${[...surviving].join(',')}, expected=${[...expectedSurvivors].join(',')}`,
    );
  }
}

async function test4_locked_and_pending_never_reaped() {
  // Even with an aggressive 1-minute threshold (sweeps all surviving completed
  // rows), locked-but-not-completed and pending (never-locked) rows must
  // survive — they're not in the eligible set (completed_at IS NOT NULL gate).
  const r = await admin<{ deleted: string }[]>`
    SELECT idempotency_keys_reaper(INTERVAL '1 minute')::text AS deleted
  `;
  const deleted = Number(r[0].deleted);
  const surviving = await survivingKeys();
  // Should reap: a-recent-completed (1h, completed). b-recent-completed (1h, completed).
  // Should keep: a-old-locked (locked, not completed), a-old-pending (never locked).
  const expectedSurvivors = new Set(['a-old-locked', 'a-old-pending']);
  if (deleted === 2 && eqSets(surviving, expectedSurvivors)) {
    ok(`Test 4: locked-not-completed + pending rows survive any threshold`);
  } else {
    fail(
      `Test 4: deleted=${deleted}, surviving=${[...surviving].join(',')}, expected=${[...expectedSurvivors].join(',')}`,
    );
  }
}

async function test5_bypass_rls_via_app_role() {
  // bokchoy_app calls the function under one tenant GUC; the function (SECURITY
  // DEFINER + postgres BYPASSRLS owner) should still reap across all tenants.
  // Re-seed first.
  await teardown();
  await setup();
  const surviving0 = await survivingKeys();
  if (surviving0.size !== ROWS.length) {
    fail(`Test 5 setup: expected ${ROWS.length} rows, got ${surviving0.size}`);
    return;
  }
  // Call from bokchoy_app under PROJECT_A's GUC; verify project B's old row
  // also got reaped (proving bypass).
  const deleted = await app.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${PROJECT_A}, true)`;
    const r = await tx<{ deleted: string }[]>`
      SELECT idempotency_keys_reaper()::text AS deleted
    `;
    return Number(r[0].deleted);
  });
  const surviving = await survivingKeys();
  // Should reap: a-old-completed AND b-old-completed (both > 24h, completed)
  // even though caller's tenant GUC is project A.
  if (deleted === 2 && !surviving.has('b-old-completed')) {
    ok(
      `Test 5: bokchoy_app under PROJECT_A GUC reaped 2 rows including b-old-completed (RLS bypassed)`,
    );
  } else {
    fail(
      `Test 5: deleted=${deleted}; survivors=${[...surviving].join(',')}; b-old-completed survived=${surviving.has('b-old-completed')}`,
    );
  }
}

function eqSets<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

try {
  await setup();
  await test1_default_24h_reaper();
  await test2_idempotent_replay();
  await test3_custom_short_interval();
  await test4_locked_and_pending_never_reaped();
  await test5_bypass_rls_via_app_role();
} finally {
  await teardown();
  await admin.end();
  await app.end();
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll reaper smoke tests passed.');
