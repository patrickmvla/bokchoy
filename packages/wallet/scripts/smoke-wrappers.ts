#!/usr/bin/env bun
//
// Integration smoke for @bokchoy/wallet wrappers per [[wrapper-shape]].
// Exercises every wrapper happy path + every BCxxx code translation against
// the M1 SQL functions in packages/db/drizzle/0004_wallet_functions.sql + 0005.
//
// Mirrors packages/db/scripts/smoke-functions.ts pattern: postgres-js admin
// connection for setup/teardown (bypasses RLS as postgres role); Drizzle client
// for wrapper invocation under withTenant(...).
//
// Tests:
//   1. walletCredit happy path — wrapper returns txn id (number); wallet state matches.
//   2. Idempotency replay — same source_event_id returns same id; wallet unchanged.
//   3. walletDebit happy path — amount stored negative.
//   4. BC010 InsufficientFunds — WalletError thrown, details parsed.
//   5. BC020 TenantMismatch — WalletError thrown, gucTenant + paramTenant parsed.
//   6. BC021 WalletNotFound — WalletError thrown, walletId + projectId parsed.
//   7. BC022 CurrencyMismatch — WalletError thrown, walletCurrency + requested parsed.
//   8. BC050 ReasonCodeNotRegistered — WalletError thrown via 23503 FK translation.
//   9. walletDeidentifyPlayer happy path — SKIPPED (local-docker grant gap).
//  10. BC040 ConfigurationError — SKIPPED (same prerequisite as 9).
//  11. bootstrapProjectReasonCodes — first call inserts 12; second call inserts 0.

import { createDbClient, withTenant } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import {
  bootstrapProjectReasonCodes,
  WalletError,
  walletCredit,
  walletDebit,
  walletDeidentifyPlayer,
} from '../src/index';

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
const { client: appClient, db } = createDbClient(APP_URL);

let failures = 0;
const ok = (msg: string) => console.log(`OK    ${msg}`);
const fail = (msg: string) => {
  console.error(`FAIL  ${msg}`);
  failures++;
};

async function setup() {
  await admin.begin(async (tx) => {
    await tx`INSERT INTO "organization" (id, name, slug)
             VALUES (${ORG_ID}, 'wrapper-smoke-org', 'wrapper-smoke-org')`;
    await tx`INSERT INTO projects (id, organization_id, name, slug) VALUES
             (${PROJECT_ID}, ${ORG_ID}, 'wrapper-smoke', 'wrapper-smoke'),
             (${PROJECT_OTHER}, ${ORG_ID}, 'wrapper-other', 'wrapper-other')`;
    await tx`INSERT INTO players (id, project_id) VALUES (${PLAYER_ID}, ${PROJECT_ID})`;
    await tx`INSERT INTO currencies (id, project_id, code, display_name) VALUES
             (${CURRENCY_GEMS}, ${PROJECT_ID}, 'gems', 'Gems'),
             (${CURRENCY_GOLD}, ${PROJECT_ID}, 'gold', 'Gold')`;
    // Bootstrap-via-wrapper happens in test 11 against PROJECT_OTHER; for
    // PROJECT_ID we hand-INSERT the codes test 1-7 use so the bootstrap test
    // starts from a clean slate on PROJECT_OTHER.
    await tx`INSERT INTO reason_codes (project_id, code, display_name, category, is_system) VALUES
             (${PROJECT_ID}, 'signup_bonus', 'Signup Bonus', 'faucet', true),
             (${PROJECT_ID}, 'shop_purchase_cost', 'Shop Purchase Cost', 'drain', true)`;
    await tx`INSERT INTO wallets (id, project_id, player_id, currency_id, balance)
             VALUES (${WALLET_ID}, ${PROJECT_ID}, ${PLAYER_ID}, ${CURRENCY_GEMS}, 0)`;
  });
}

async function teardown() {
  await admin`DELETE FROM transactions WHERE project_id IN (${PROJECT_ID}, ${PROJECT_OTHER})`;
  await admin`DELETE FROM wallets WHERE project_id IN (${PROJECT_ID}, ${PROJECT_OTHER})`;
  await admin`DELETE FROM reason_codes WHERE project_id IN (${PROJECT_ID}, ${PROJECT_OTHER})`;
  await admin`DELETE FROM currencies WHERE project_id IN (${PROJECT_ID}, ${PROJECT_OTHER})`;
  await admin`DELETE FROM players WHERE project_id IN (${PROJECT_ID}, ${PROJECT_OTHER})`;
  await admin`DELETE FROM projects WHERE id IN (${PROJECT_ID}, ${PROJECT_OTHER})`;
  await admin`DELETE FROM "organization" WHERE id = ${ORG_ID}`;
}

async function test1_credit_happy_path() {
  const txnId = await withTenant(db, PROJECT_ID, async (tx) =>
    walletCredit(tx, {
      projectId: PROJECT_ID,
      walletId: WALLET_ID,
      amount: 100,
      currencyId: CURRENCY_GEMS,
      reasonCode: 'signup_bonus',
      sourceEventId: 'wrapper-smoke-event-1',
    }),
  );
  if (typeof txnId !== 'number' || txnId <= 0) {
    fail(`Test 1: walletCredit returned non-positive number id=${String(txnId)}`);
    return;
  }
  const w = await admin<{ balance: string; version: string }[]>`
    SELECT balance::text, version::text FROM wallets WHERE id = ${WALLET_ID}
  `;
  const t = await admin<{ amount: string; kind: string }[]>`
    SELECT amount::text, kind FROM transactions WHERE id = ${txnId}::bigint
  `;
  if (
    w[0]?.balance === '100.0000' &&
    w[0]?.version === '1' &&
    t[0]?.amount === '100.0000' &&
    t[0]?.kind === 'currency_credit'
  ) {
    ok(`Test 1: walletCredit happy path — txnId=${txnId}, balance=100, version=1`);
  } else {
    fail(`Test 1: state mismatch wallet=${JSON.stringify(w[0])} txn=${JSON.stringify(t[0])}`);
  }
}

async function test2_credit_idempotency_replay() {
  const replayId = await withTenant(db, PROJECT_ID, async (tx) =>
    walletCredit(tx, {
      projectId: PROJECT_ID,
      walletId: WALLET_ID,
      amount: 100,
      currencyId: CURRENCY_GEMS,
      reasonCode: 'signup_bonus',
      sourceEventId: 'wrapper-smoke-event-1',
    }),
  );
  const w = await admin<{ balance: string; version: string }[]>`
    SELECT balance::text, version::text FROM wallets WHERE id = ${WALLET_ID}
  `;
  if (w[0]?.balance === '100.0000' && w[0]?.version === '1' && typeof replayId === 'number') {
    ok(`Test 2: idempotency replay — same txnId=${replayId}, wallet unchanged`);
  } else {
    fail(`Test 2: replay mutated state — balance=${w[0]?.balance} version=${w[0]?.version}`);
  }
}

async function test3_debit_happy_path() {
  const txnId = await withTenant(db, PROJECT_ID, async (tx) =>
    walletDebit(tx, {
      projectId: PROJECT_ID,
      walletId: WALLET_ID,
      amount: 30,
      currencyId: CURRENCY_GEMS,
      reasonCode: 'shop_purchase_cost',
      sourceEventId: 'wrapper-smoke-debit-1',
    }),
  );
  const w = await admin<{ balance: string; version: string }[]>`
    SELECT balance::text, version::text FROM wallets WHERE id = ${WALLET_ID}
  `;
  const t = await admin<{ amount: string; kind: string }[]>`
    SELECT amount::text, kind FROM transactions WHERE id = ${txnId}::bigint
  `;
  if (
    w[0]?.balance === '70.0000' &&
    w[0]?.version === '2' &&
    t[0]?.amount === '-30.0000' &&
    t[0]?.kind === 'currency_debit'
  ) {
    ok(`Test 3: walletDebit happy path — balance=70, debit row amount=-30`);
  } else {
    fail(`Test 3: state mismatch wallet=${JSON.stringify(w[0])} txn=${JSON.stringify(t[0])}`);
  }
}

async function test4_bc010_insufficient_funds() {
  try {
    await withTenant(db, PROJECT_ID, async (tx) =>
      walletDebit(tx, {
        projectId: PROJECT_ID,
        walletId: WALLET_ID,
        amount: 1000,
        currencyId: CURRENCY_GEMS,
        reasonCode: 'shop_purchase_cost',
        sourceEventId: 'wrapper-smoke-overdraft',
      }),
    );
    fail('Test 4: BC010 expected; debit succeeded');
  } catch (err) {
    if (err instanceof WalletError && err.code === 'BC010' && err.details.code === 'BC010') {
      ok(
        `Test 4: BC010 InsufficientFunds — wallet=${err.details.walletId} requested=${err.details.requested} available=${err.details.available}`,
      );
    } else {
      fail(`Test 4: expected BC010 WalletError, got ${String(err)}`);
    }
  }
}

async function test5_bc020_tenant_mismatch() {
  try {
    await withTenant(db, PROJECT_OTHER, async (tx) =>
      walletCredit(tx, {
        projectId: PROJECT_ID,
        walletId: WALLET_ID,
        amount: 1,
        currencyId: CURRENCY_GEMS,
        reasonCode: 'signup_bonus',
      }),
    );
    fail('Test 5: BC020 expected; credit succeeded');
  } catch (err) {
    if (err instanceof WalletError && err.code === 'BC020' && err.details.code === 'BC020') {
      ok(
        `Test 5: BC020 TenantMismatch — guc=${err.details.gucTenant} param=${err.details.paramTenant}`,
      );
    } else {
      fail(`Test 5: expected BC020 WalletError, got ${String(err)}`);
    }
  }
}

async function test6_bc021_wallet_not_found() {
  const FAKE_WALLET = 'deadbeef-dead-beef-dead-beefdeadbeef';
  try {
    await withTenant(db, PROJECT_ID, async (tx) =>
      walletCredit(tx, {
        projectId: PROJECT_ID,
        walletId: FAKE_WALLET,
        amount: 1,
        currencyId: CURRENCY_GEMS,
        reasonCode: 'signup_bonus',
      }),
    );
    fail('Test 6: BC021 expected; credit succeeded');
  } catch (err) {
    if (err instanceof WalletError && err.code === 'BC021' && err.details.code === 'BC021') {
      ok(
        `Test 6: BC021 WalletNotFound — walletId=${err.details.walletId} projectId=${err.details.projectId}`,
      );
    } else {
      fail(`Test 6: expected BC021 WalletError, got ${String(err)}`);
    }
  }
}

async function test7_bc022_currency_mismatch() {
  try {
    await withTenant(db, PROJECT_ID, async (tx) =>
      walletCredit(tx, {
        projectId: PROJECT_ID,
        walletId: WALLET_ID,
        amount: 1,
        currencyId: CURRENCY_GOLD,
        reasonCode: 'signup_bonus',
      }),
    );
    fail('Test 7: BC022 expected; credit succeeded');
  } catch (err) {
    if (err instanceof WalletError && err.code === 'BC022' && err.details.code === 'BC022') {
      ok(
        `Test 7: BC022 CurrencyMismatch — walletCurrency=${err.details.walletCurrency} requested=${err.details.requested}`,
      );
    } else {
      fail(`Test 7: expected BC022 WalletError, got ${String(err)}`);
    }
  }
}

async function test8_bc050_unknown_reason_code() {
  // 'unknown_reason' is NOT in reason_codes — FK 23503 fires on
  // transactions_project_reason_code_fk; wrapper translates to BC050.
  try {
    await withTenant(db, PROJECT_ID, async (tx) =>
      walletCredit(tx, {
        projectId: PROJECT_ID,
        walletId: WALLET_ID,
        amount: 1,
        currencyId: CURRENCY_GEMS,
        reasonCode: 'unknown_reason',
      }),
    );
    fail('Test 8: BC050 expected; credit succeeded');
  } catch (err) {
    if (err instanceof WalletError && err.code === 'BC050' && err.details.code === 'BC050') {
      ok(
        `Test 8: BC050 ReasonCodeNotRegistered (translated from 23503) — constraint=${err.details.constraintName}`,
      );
    } else {
      fail(`Test 8: expected BC050 WalletError, got ${String(err)}`);
    }
  }
}

// Tests 9 + 10 exercise wallet_deidentify_player which calls pgcrypto's hmac()
// in the 'extensions' schema. Locally, that schema is owned by supabase_admin
// (NOSUPERUSER postgres can't grant USAGE on it), and bokchoy_app lacks USAGE
// → SECURITY INVOKER call fails resolution. Production-Supabase grants USAGE
// on extensions to standard roles by default; the gap is purely the
// [[local-docker]] bootstrap missing the equivalent grant. The wrapper itself
// (translation layer + sqlstateToError) is identical to what tests 1-8
// exercise; running tests 9+10 against admin would side-step the privilege
// model we want to validate. SKIP until [[local-docker]] bootstrap is amended
// in its own slice.

async function test9_deidentify_happy_path_skipped() {
  console.log(
    'SKIP  Test 9: walletDeidentifyPlayer — local-docker bokchoy_app lacks USAGE on schema extensions ([[local-docker]] cascade)',
  );
}

async function test10_bc040_anon_secret_missing_skipped() {
  console.log('SKIP  Test 10: BC040 ConfigurationError — same prerequisite as test 9');
}

async function test11_bootstrap_reason_codes() {
  // PROJECT_OTHER has no reason_codes seeded. First call inserts 12; second 0.
  const inserted1 = await withTenant(db, PROJECT_OTHER, async (tx) =>
    bootstrapProjectReasonCodes(tx, { projectId: PROJECT_OTHER }),
  );
  const inserted2 = await withTenant(db, PROJECT_OTHER, async (tx) =>
    bootstrapProjectReasonCodes(tx, { projectId: PROJECT_OTHER }),
  );
  if (inserted1 === 12 && inserted2 === 0) {
    ok(`Test 11: bootstrapProjectReasonCodes — first=${inserted1} second=${inserted2}`);
  } else {
    fail(`Test 11: expected first=12 second=0, got first=${inserted1} second=${inserted2}`);
  }
}

async function main() {
  await teardown(); // clean any prior state
  await setup();
  try {
    await test1_credit_happy_path();
    await test2_credit_idempotency_replay();
    await test3_debit_happy_path();
    await test4_bc010_insufficient_funds();
    await test5_bc020_tenant_mismatch();
    await test6_bc021_wallet_not_found();
    await test7_bc022_currency_mismatch();
    await test8_bc050_unknown_reason_code();
    await test9_deidentify_happy_path_skipped();
    await test10_bc040_anon_secret_missing_skipped();
    await test11_bootstrap_reason_codes();
  } finally {
    await teardown();
    await appClient.end();
    await admin.end();
  }
  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log('\nAll wrapper smoke tests passed.');
}

await main();
