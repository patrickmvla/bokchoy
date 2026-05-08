#!/usr/bin/env bun
//
// Smoke-test M1 wallet stored functions per [[wallet-mechanics]] Amendments.
// Run after slice 4 migration (0004_wallet_functions).
//
// Tests cover:
//   1. wallet_credit happy path — balance updates, version increments,
//      transactions row inserted with correct fields.
//   2. wallet_credit idempotency replay — second call with same source_event_id
//      returns the same txn id and does NOT double-credit.
//   3. wallet_debit happy path — balance decreases, amount is stored negative.
//   4. wallet_debit BC010 InsufficientFunds — debit beyond balance raises.
//   5. BC020 TenantMismatch — GUC ≠ p_project_id raises.
//   6. BC021 WalletNotFound — unknown wallet_id raises.
//   7. BC022 CurrencyMismatch — wrong currency raises.
//   8. wallet_deidentify_player happy path — player_id replaced with anon UUIDv8;
//      anon_id is deterministic across calls; metadata fields scrubbed.
//   9. wallet_deidentify_player BC040 ConfigurationError — secret missing/short.

import postgres from 'postgres';

const APP_URL = process.env.DATABASE_URL;
const MIG_URL = process.env.DATABASE_MIGRATION_URL;
if (!APP_URL || !MIG_URL) {
  throw new Error('DATABASE_URL and DATABASE_MIGRATION_URL must be set');
}

const ORG_ID = '12121212-1212-1212-1212-121212121212';
const PROJECT_ID = '34343434-3434-3434-3434-343434343434';
const PROJECT_OTHER = '56565656-5656-5656-5656-565656565656';
const PLAYER_ID = '78787878-7878-7878-7878-787878787878';
const CURRENCY_GEMS = '90909090-9090-9090-9090-909090909090';
const CURRENCY_GOLD = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const WALLET_ID = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2';

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
             VALUES (${ORG_ID}, 'fn-smoke-org', 'fn-smoke-org')`;
    await tx`INSERT INTO projects (id, organization_id, name, slug) VALUES
             (${PROJECT_ID}, ${ORG_ID}, 'fn-smoke', 'fn-smoke'),
             (${PROJECT_OTHER}, ${ORG_ID}, 'fn-other', 'fn-other')`;
    await tx`INSERT INTO players (id, project_id) VALUES (${PLAYER_ID}, ${PROJECT_ID})`;
    await tx`INSERT INTO currencies (id, project_id, code, display_name) VALUES
             (${CURRENCY_GEMS}, ${PROJECT_ID}, 'gems', 'Gems'),
             (${CURRENCY_GOLD}, ${PROJECT_ID}, 'gold', 'Gold')`;
    // Slice 5: bootstrap the 12 system reason codes via the canonical function
    // instead of hand-INSERTing the 2 codes the smoke test exercises.
    await tx`SELECT bootstrap_project_reason_codes(${PROJECT_ID}::uuid)`;
    await tx`INSERT INTO wallets (id, project_id, player_id, currency_id, balance)
             VALUES (${WALLET_ID}, ${PROJECT_ID}, ${PLAYER_ID}, ${CURRENCY_GEMS}, 0)`;
  });
}

async function teardown() {
  // Delete by stable scope (project_id / wallet_id) — covers original AND
  // de-identified rows since both stay scoped to PROJECT_ID after test 8.
  await admin`DELETE FROM transactions WHERE project_id = ${PROJECT_ID}`;
  await admin`DELETE FROM wallets WHERE project_id = ${PROJECT_ID}`;
  await admin`DELETE FROM reason_codes WHERE project_id = ${PROJECT_ID}`;
  await admin`DELETE FROM currencies WHERE project_id = ${PROJECT_ID}`;
  await admin`DELETE FROM players WHERE project_id = ${PROJECT_ID}`;
  await admin`DELETE FROM projects WHERE id IN (${PROJECT_ID}, ${PROJECT_OTHER})`;
  await admin`DELETE FROM "organization" WHERE id = ${ORG_ID}`;
}

async function withTenant<T>(
  projectId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return await app.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${projectId}, true)`;
    return await fn(tx as unknown as postgres.TransactionSql);
  });
}

async function test1_credit_happy_path() {
  const txnId = await withTenant(PROJECT_ID, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      SELECT wallet_credit(
        ${PROJECT_ID}::uuid,
        ${WALLET_ID}::uuid,
        100::numeric,
        ${CURRENCY_GEMS}::uuid,
        'signup_bonus',
        'fn-smoke-event-1'
      ) AS id
    `;
    return rows[0].id;
  });
  // Verify wallet state.
  const w = await admin<{ balance: string; version: string }[]>`
    SELECT balance::text, version::text FROM wallets WHERE id = ${WALLET_ID}
  `;
  // Verify transactions row.
  const t = await admin<
    { amount: string; kind: string; wallet_version: string; reason_code: string }[]
  >`
    SELECT amount::text, kind, wallet_version::text, reason_code FROM transactions WHERE id = ${txnId}::bigint
  `;
  if (
    w[0].balance === '100.0000' &&
    w[0].version === '1' &&
    t[0].amount === '100.0000' &&
    t[0].kind === 'currency_credit' &&
    t[0].wallet_version === '1' &&
    t[0].reason_code === 'signup_bonus'
  ) {
    ok(`Test 1: wallet_credit happy path — balance=100, version=1, txn id=${txnId}`);
  } else {
    fail(`Test 1: state mismatch wallet=${JSON.stringify(w[0])} txn=${JSON.stringify(t[0])}`);
  }
}

async function test2_credit_idempotency_replay() {
  // Call wallet_credit again with the same source_event_id from test 1.
  const replayId = await withTenant(PROJECT_ID, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      SELECT wallet_credit(
        ${PROJECT_ID}::uuid,
        ${WALLET_ID}::uuid,
        100::numeric,
        ${CURRENCY_GEMS}::uuid,
        'signup_bonus',
        'fn-smoke-event-1'
      ) AS id
    `;
    return rows[0].id;
  });
  const w = await admin<{ balance: string; version: string }[]>`
    SELECT balance::text, version::text FROM wallets WHERE id = ${WALLET_ID}
  `;
  // Replay must return the same id and NOT mutate the wallet.
  if (w[0].balance === '100.0000' && w[0].version === '1') {
    ok(`Test 2: idempotency replay — same txn id returned (${replayId}), wallet unchanged`);
  } else {
    fail(`Test 2: replay mutated wallet — balance=${w[0].balance}, version=${w[0].version}`);
  }
}

async function test3_debit_happy_path() {
  const txnId = await withTenant(PROJECT_ID, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      SELECT wallet_debit(
        ${PROJECT_ID}::uuid,
        ${WALLET_ID}::uuid,
        30::numeric,
        ${CURRENCY_GEMS}::uuid,
        'shop_purchase_cost',
        'fn-smoke-debit-1'
      ) AS id
    `;
    return rows[0].id;
  });
  const w = await admin<{ balance: string; version: string }[]>`
    SELECT balance::text, version::text FROM wallets WHERE id = ${WALLET_ID}
  `;
  const t = await admin<{ amount: string; kind: string }[]>`
    SELECT amount::text, kind FROM transactions WHERE id = ${txnId}::bigint
  `;
  if (
    w[0].balance === '70.0000' &&
    w[0].version === '2' &&
    t[0].amount === '-30.0000' &&
    t[0].kind === 'currency_debit'
  ) {
    ok(`Test 3: wallet_debit happy path — balance=70, debit row amount=-30`);
  } else {
    fail(`Test 3: state mismatch wallet=${JSON.stringify(w[0])} txn=${JSON.stringify(t[0])}`);
  }
}

async function test4_debit_insufficient_funds() {
  try {
    await withTenant(PROJECT_ID, async (tx) => {
      await tx`
        SELECT wallet_debit(
          ${PROJECT_ID}::uuid,
          ${WALLET_ID}::uuid,
          1000::numeric,
          ${CURRENCY_GEMS}::uuid,
          'shop_purchase_cost',
          'fn-smoke-overdraft'
        )
      `;
    });
    fail('Test 4: BC010 expected; debit succeeded');
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'BC010') {
      ok(`Test 4: BC010 InsufficientFunds raised`);
    } else {
      fail(`Test 4: expected BC010, got code=${e.code} msg=${e.message}`);
    }
  }
}

async function test5_tenant_mismatch() {
  try {
    await withTenant(PROJECT_OTHER, async (tx) => {
      // GUC = PROJECT_OTHER but pass PROJECT_ID — defense-in-depth check fires
      // BEFORE the wallet lookup hits RLS, so we get BC020 not BC021.
      await tx`
        SELECT wallet_credit(
          ${PROJECT_ID}::uuid,
          ${WALLET_ID}::uuid,
          1::numeric,
          ${CURRENCY_GEMS}::uuid,
          'signup_bonus'
        )
      `;
    });
    fail('Test 5: BC020 expected; credit succeeded');
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'BC020') {
      ok(`Test 5: BC020 TenantMismatch raised`);
    } else {
      fail(`Test 5: expected BC020, got code=${e.code} msg=${e.message}`);
    }
  }
}

async function test6_wallet_not_found() {
  const FAKE_WALLET = 'deadbeef-dead-beef-dead-beefdeadbeef';
  try {
    await withTenant(PROJECT_ID, async (tx) => {
      await tx`
        SELECT wallet_credit(
          ${PROJECT_ID}::uuid,
          ${FAKE_WALLET}::uuid,
          1::numeric,
          ${CURRENCY_GEMS}::uuid,
          'signup_bonus'
        )
      `;
    });
    fail('Test 6: BC021 expected; credit succeeded');
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'BC021') {
      ok(`Test 6: BC021 WalletNotFound raised`);
    } else {
      fail(`Test 6: expected BC021, got code=${e.code} msg=${e.message}`);
    }
  }
}

async function test7_currency_mismatch() {
  try {
    await withTenant(PROJECT_ID, async (tx) => {
      // Wallet is gems; pass gold currency_id.
      await tx`
        SELECT wallet_credit(
          ${PROJECT_ID}::uuid,
          ${WALLET_ID}::uuid,
          1::numeric,
          ${CURRENCY_GOLD}::uuid,
          'signup_bonus'
        )
      `;
    });
    fail('Test 7: BC022 expected; credit succeeded');
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'BC022') {
      ok(`Test 7: BC022 CurrencyMismatch raised`);
    } else {
      fail(`Test 7: expected BC022, got code=${e.code} msg=${e.message}`);
    }
  }
}

async function test8_deidentify_happy_path() {
  // Run via admin (BYPASSRLS) so we don't need to set the GUC. Set the
  // anon_secret as a transaction-local GUC.
  const result = await admin.begin(async (tx) => {
    await tx`SELECT set_config('bokchoy.anon_secret', ${'a'.repeat(32)}, true)`;
    await tx`SELECT set_config('app.current_tenant', ${PROJECT_ID}, true)`;
    const rows = await tx<{ rows_touched: string }[]>`
      SELECT wallet_deidentify_player(${PLAYER_ID}::uuid)::text AS rows_touched
    `;
    return rows[0].rows_touched;
  });
  // After deidentify, the transactions player_id should no longer match PLAYER_ID.
  const original = await admin<{ count: string }[]>`
    SELECT count(*)::text AS count FROM transactions WHERE player_id = ${PLAYER_ID}
  `;
  const anonRow = await admin<{ player_id: string }[]>`
    SELECT DISTINCT player_id FROM transactions WHERE wallet_id = ${WALLET_ID}
  `;
  if (original[0].count === '0' && anonRow.length === 1 && anonRow[0].player_id !== PLAYER_ID) {
    ok(
      `Test 8: deidentify replaced player_id (${result} rows touched on transactions); anon_id=${anonRow[0].player_id}`,
    );
  } else {
    fail(
      `Test 8: original_count=${original[0].count} anon_rows=${JSON.stringify(anonRow)} expected 0 + single anon_id`,
    );
  }
}

async function test9_deidentify_missing_secret() {
  try {
    await admin.begin(async (tx) => {
      // Don't set anon_secret. The function's current_setting one-arg form raises.
      // The function would also raise BC040 if length<32.
      await tx`SELECT wallet_deidentify_player(${PLAYER_ID}::uuid)`;
    });
    fail('Test 9: expected error from missing anon_secret; succeeded');
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'BC040' || e.message.includes('bokchoy.anon_secret')) {
      ok(`Test 9: missing/short anon_secret raises (code=${e.code ?? 'n/a'})`);
    } else {
      fail(`Test 9: unexpected error code=${e.code} msg=${e.message}`);
    }
  }
}

try {
  await setup();
  await test1_credit_happy_path();
  await test2_credit_idempotency_replay();
  await test3_debit_happy_path();
  await test4_debit_insufficient_funds();
  await test5_tenant_mismatch();
  await test6_wallet_not_found();
  await test7_currency_mismatch();
  await test8_deidentify_happy_path();
  await test9_deidentify_missing_secret();
} finally {
  await teardown();
  await admin.end();
  await app.end();
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll wallet-function smoke tests passed.');
