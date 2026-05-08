#!/usr/bin/env bun
//
// Smoke-test transactions partitioning behavior.
// Run after slice 3 migration (0003_partition_transactions).
//
// Verifies:
//   1. INSERTs with different created_at land in their correct monthly partition.
//   2. SELECT with created_at predicate prunes to one partition (EXPLAIN).
//   3. SELECT without created_at predicate scans all partitions (EXPLAIN).
//   4. RLS still enforces tenant_isolation on the partitioned parent (insert
//      with mismatched project_id under a tenant GUC raises RLS denial).
//   5. Bigserial sequence is shared across partitions (sequential ids regardless
//      of which partition the row lands in).

import postgres from 'postgres';

const APP_URL = process.env.DATABASE_URL;
const MIG_URL = process.env.DATABASE_MIGRATION_URL;
if (!APP_URL || !MIG_URL) {
  throw new Error('DATABASE_URL and DATABASE_MIGRATION_URL must be set');
}

const ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const P1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const P2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PLAYER_1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

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
             VALUES (${ORG_ID}, 'partition-smoke-org', 'partition-smoke-org')`;
    await tx`INSERT INTO projects (id, organization_id, name, slug)
             VALUES (${P1}, ${ORG_ID}, 'p1', 'partition-smoke-p1'),
                    (${P2}, ${ORG_ID}, 'p2', 'partition-smoke-p2')`;
    await tx`INSERT INTO players (id, project_id) VALUES (${PLAYER_1}, ${P1})`;
    await tx`INSERT INTO reason_codes (project_id, code, display_name, category, is_system)
             VALUES (${P1}, 'signup_bonus', 'Signup Bonus', 'faucet', true)`;
  });
}

async function teardown() {
  // Force-clean all partitions where smoke data may have landed.
  await admin`DELETE FROM transactions WHERE project_id IN (${P1}, ${P2})`;
  await admin`DELETE FROM reason_codes WHERE project_id IN (${P1}, ${P2})`;
  await admin`DELETE FROM players WHERE id = ${PLAYER_1}`;
  await admin`DELETE FROM projects WHERE id IN (${P1}, ${P2})`;
  await admin`DELETE FROM "organization" WHERE id = ${ORG_ID}`;
}

// Helper: insert a transactions row at a given timestamp via admin (BYPASSRLS)
// and report which child partition the row landed in.
async function insertAt(createdAt: string): Promise<{ id: number; partition: string }> {
  const rows = await admin<{ id: number; partition: string }[]>`
    WITH inserted AS (
      INSERT INTO transactions
        (project_id, player_id, kind, wallet_version, reason_code, created_at)
      VALUES
        (${P1}, ${PLAYER_1}, 'currency_credit', 0, 'signup_bonus', ${createdAt}::timestamptz)
      RETURNING id, created_at, tableoid
    )
    SELECT id::int AS id, tableoid::regclass::text AS partition FROM inserted
  `;
  return rows[0];
}

async function test1_partition_routing() {
  const cases: { ts: string; expected: string }[] = [
    { ts: '2026-05-15 12:00:00+00', expected: 'transactions_y2026m05' },
    { ts: '2026-08-01 00:00:00+00', expected: 'transactions_y2026m08' },
    { ts: '2027-04-30 23:59:59+00', expected: 'transactions_y2027m04' },
    { ts: '2026-12-31 23:59:59+00', expected: 'transactions_y2026m12' },
  ];
  for (const c of cases) {
    const r = await insertAt(c.ts);
    if (r.partition === c.expected) {
      ok(`Test 1: ${c.ts} → ${c.expected}`);
    } else {
      fail(`Test 1: ${c.ts} → expected ${c.expected}, got ${r.partition}`);
    }
  }
}

async function test2_partition_pruning_with_predicate() {
  const plan = await admin<{ 'QUERY PLAN': string }[]>`
    EXPLAIN SELECT id FROM transactions
    WHERE project_id = ${P1}
      AND created_at >= '2026-05-01'::timestamptz
      AND created_at <  '2026-06-01'::timestamptz
  `;
  const planText = plan.map((r) => r['QUERY PLAN']).join('\n');
  const partitionsScanned = (planText.match(/transactions_y\d{4}m\d{2}/g) ?? []).length;
  if (partitionsScanned === 1 && planText.includes('transactions_y2026m05')) {
    ok(`Test 2: predicate-scoped query prunes to 1 partition (transactions_y2026m05)`);
  } else {
    fail(
      `Test 2: expected pruning to 1 partition (m05); got ${partitionsScanned} partitions: ${planText}`,
    );
  }
}

async function test3_no_pruning_without_predicate() {
  const plan = await admin<{ 'QUERY PLAN': string }[]>`
    EXPLAIN SELECT id FROM transactions WHERE project_id = ${P1}
  `;
  const planText = plan.map((r) => r['QUERY PLAN']).join('\n');
  const partitionsScanned = (planText.match(/transactions_y\d{4}m\d{2}/g) ?? []).length;
  if (partitionsScanned === 12) {
    ok(`Test 3: query without created_at predicate scans all 12 partitions`);
  } else {
    fail(`Test 3: expected 12 partitions scanned; got ${partitionsScanned}`);
  }
}

async function test4_rls_on_partitioned_parent() {
  try {
    await app.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant', ${P1}, true)`;
      // Insert with project_id mismatching the GUC — must be denied by RLS on parent.
      await tx`INSERT INTO transactions
               (project_id, player_id, kind, wallet_version, reason_code, created_at)
               VALUES (${P2}, ${PLAYER_1}, 'currency_credit', 0, 'signup_bonus',
                       '2026-05-15'::timestamptz)`;
    });
    fail('Test 4: RLS-mismatched insert on partitioned parent should have been denied');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('row-level security') || msg.includes('violates row-level')) {
      ok(`Test 4: partitioned-parent RLS enforces — INSERT denied: ${msg}`);
    } else {
      fail(`Test 4: unexpected error on RLS-denied insert: ${msg}`);
    }
  }
}

async function test5_shared_sequence() {
  const r1 = await insertAt('2026-05-10 00:00:00+00');
  const r2 = await insertAt('2026-09-10 00:00:00+00');
  const r3 = await insertAt('2027-01-10 00:00:00+00');
  // Sequence allocated across all partitions should be strictly increasing.
  if (r1.id < r2.id && r2.id < r3.id) {
    ok(`Test 5: shared bigserial sequence — ids ${r1.id} < ${r2.id} < ${r3.id} across partitions`);
  } else {
    fail(`Test 5: ids not monotonic across partitions: ${r1.id}, ${r2.id}, ${r3.id}`);
  }
}

try {
  await setup();
  await test1_partition_routing();
  await test2_partition_pruning_with_predicate();
  await test3_no_pruning_without_predicate();
  await test4_rls_on_partitioned_parent();
  await test5_shared_sequence();
} finally {
  await teardown();
  await admin.end();
  await app.end();
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll partitioning smoke tests passed.');
