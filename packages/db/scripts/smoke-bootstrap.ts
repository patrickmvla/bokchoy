#!/usr/bin/env bun
//
// Smoke-test bootstrap_project_reason_codes function per Slice 5.
//
// Verifies:
//   1. First call inserts 12 codes — 8 faucets + 4 drains, all is_system=TRUE,
//      with the canonical names per Amendment Part 3 A17.
//   2. Second call is a no-op (returns 0; ON CONFLICT DO NOTHING).
//   3. Two distinct project_ids each get their own 12-row set (no cross-tenant bleed).
//   4. bokchoy_app under tenant GUC sees only its project's codes through RLS.
//   5. Customer-extended (is_system=FALSE) codes coexist with bootstrap codes;
//      bootstrap doesn't clobber them.

import postgres from 'postgres';

const APP_URL = process.env.DATABASE_URL;
const MIG_URL = process.env.DATABASE_MIGRATION_URL;
if (!APP_URL || !MIG_URL) {
  throw new Error('DATABASE_URL and DATABASE_MIGRATION_URL must be set');
}

const ORG_ID = '01010101-0101-0101-0101-010101010101';
const PROJECT_A = '02020202-0202-0202-0202-020202020202';
const PROJECT_B = '03030303-0303-0303-0303-030303030303';

const admin = postgres(MIG_URL, { prepare: false, onnotice: () => {} });
const app = postgres(APP_URL, { prepare: false, onnotice: () => {} });

let failures = 0;
const ok = (msg: string) => console.log(`OK    ${msg}`);
const fail = (msg: string) => {
  console.error(`FAIL  ${msg}`);
  failures++;
};

const EXPECTED_FAUCETS = [
  'signup_bonus',
  'daily_login',
  'quest_reward',
  'loot_pull_reward',
  'shop_purchase_grant',
  'iap_grant',
  'compensation',
  'admin_grant',
] as const;
const EXPECTED_DRAINS = [
  'loot_pull_cost',
  'shop_purchase_cost',
  'crafting_cost',
  'admin_debit',
] as const;

async function setup() {
  await admin.begin(async (tx) => {
    await tx`INSERT INTO "organization" (id, name, slug)
             VALUES (${ORG_ID}, 'bootstrap-smoke-org', 'bootstrap-smoke-org')`;
    await tx`INSERT INTO projects (id, organization_id, name, slug) VALUES
             (${PROJECT_A}, ${ORG_ID}, 'A', 'bootstrap-smoke-a'),
             (${PROJECT_B}, ${ORG_ID}, 'B', 'bootstrap-smoke-b')`;
  });
}

async function teardown() {
  await admin`DELETE FROM reason_codes WHERE project_id IN (${PROJECT_A}, ${PROJECT_B})`;
  await admin`DELETE FROM projects WHERE id IN (${PROJECT_A}, ${PROJECT_B})`;
  await admin`DELETE FROM "organization" WHERE id = ${ORG_ID}`;
}

async function test1_first_call_inserts_12_codes() {
  const r = await admin<{ inserted: string }[]>`
    SELECT bootstrap_project_reason_codes(${PROJECT_A}::uuid)::text AS inserted
  `;
  const inserted = Number(r[0].inserted);

  const rows = await admin<{ code: string; category: string; is_system: boolean }[]>`
    SELECT code, category, is_system FROM reason_codes
    WHERE project_id = ${PROJECT_A} ORDER BY category, code
  `;
  const faucets = rows
    .filter((r) => r.category === 'faucet')
    .map((r) => r.code)
    .sort();
  const drains = rows
    .filter((r) => r.category === 'drain')
    .map((r) => r.code)
    .sort();
  const allSystem = rows.every((r) => r.is_system === true);

  const expectedFaucets = [...EXPECTED_FAUCETS].sort();
  const expectedDrains = [...EXPECTED_DRAINS].sort();

  if (
    inserted === 12 &&
    rows.length === 12 &&
    faucets.length === 8 &&
    drains.length === 4 &&
    JSON.stringify(faucets) === JSON.stringify(expectedFaucets) &&
    JSON.stringify(drains) === JSON.stringify(expectedDrains) &&
    allSystem
  ) {
    ok(`Test 1: first call inserted 12 codes (8 faucets + 4 drains, all is_system=TRUE)`);
  } else {
    fail(
      `Test 1: inserted=${inserted} total=${rows.length} faucets=${faucets.join(',')} drains=${drains.join(',')} allSystem=${allSystem}`,
    );
  }
}

async function test2_idempotent_replay() {
  const r = await admin<{ inserted: string }[]>`
    SELECT bootstrap_project_reason_codes(${PROJECT_A}::uuid)::text AS inserted
  `;
  const inserted = Number(r[0].inserted);
  const count = await admin<{ count: string }[]>`
    SELECT count(*)::text AS count FROM reason_codes WHERE project_id = ${PROJECT_A}
  `;
  if (inserted === 0 && Number(count[0].count) === 12) {
    ok(`Test 2: second call is no-op (returned 0; row count still 12)`);
  } else {
    fail(`Test 2: re-call inserted=${inserted}, total rows=${count[0].count}`);
  }
}

async function test3_per_project_isolation() {
  const r = await admin<{ inserted: string }[]>`
    SELECT bootstrap_project_reason_codes(${PROJECT_B}::uuid)::text AS inserted
  `;
  const inserted = Number(r[0].inserted);
  const aCount = await admin<{ count: string }[]>`
    SELECT count(*)::text AS count FROM reason_codes WHERE project_id = ${PROJECT_A}
  `;
  const bCount = await admin<{ count: string }[]>`
    SELECT count(*)::text AS count FROM reason_codes WHERE project_id = ${PROJECT_B}
  `;
  if (inserted === 12 && Number(aCount[0].count) === 12 && Number(bCount[0].count) === 12) {
    ok(`Test 3: project B got its own 12-row set; project A unchanged`);
  } else {
    fail(`Test 3: B inserted=${inserted}, A=${aCount[0].count}, B=${bCount[0].count}`);
  }
}

async function test4_rls_scoping_via_app_role() {
  const aCodesViaApp = await app.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${PROJECT_A}, true)`;
    return await tx<{ code: string }[]>`SELECT code FROM reason_codes ORDER BY code`;
  });
  const bCodesViaApp = await app.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${PROJECT_B}, true)`;
    return await tx<{ code: string }[]>`SELECT code FROM reason_codes ORDER BY code`;
  });
  if (aCodesViaApp.length === 12 && bCodesViaApp.length === 12) {
    ok(`Test 4: bokchoy_app under tenant GUC sees its project's 12 codes (RLS scoped)`);
  } else {
    fail(`Test 4: A via app=${aCodesViaApp.length}, B via app=${bCodesViaApp.length}`);
  }
}

async function test5_customer_extended_codes_coexist() {
  // Customer adds is_system=FALSE code.
  await admin`
    INSERT INTO reason_codes (project_id, code, display_name, category, is_system)
    VALUES (${PROJECT_A}, 'battle_pass_reward', 'Battle Pass Reward', 'faucet', false)
  `;
  // Re-bootstrap should be a no-op for system codes AND must not clobber the
  // customer-extended row.
  const r = await admin<{ inserted: string }[]>`
    SELECT bootstrap_project_reason_codes(${PROJECT_A}::uuid)::text AS inserted
  `;
  const inserted = Number(r[0].inserted);
  const rows = await admin<{ code: string; is_system: boolean }[]>`
    SELECT code, is_system FROM reason_codes WHERE project_id = ${PROJECT_A} ORDER BY code
  `;
  const customerCode = rows.find((r) => r.code === 'battle_pass_reward');
  if (
    inserted === 0 &&
    rows.length === 13 &&
    customerCode !== undefined &&
    customerCode.is_system === false
  ) {
    ok(
      `Test 5: customer-extended code preserved across re-bootstrap (13 rows; system flag intact)`,
    );
  } else {
    fail(
      `Test 5: inserted=${inserted} total=${rows.length} customer=${JSON.stringify(customerCode)}`,
    );
  }
}

try {
  await setup();
  await test1_first_call_inserts_12_codes();
  await test2_idempotent_replay();
  await test3_per_project_isolation();
  await test4_rls_scoping_via_app_role();
  await test5_customer_extended_codes_coexist();
} finally {
  await teardown();
  await admin.end();
  await app.end();
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll bootstrap smoke tests passed.');
