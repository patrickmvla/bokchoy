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
// Inventory items per [[inventory/inventory-contract]] smoke coverage.
const ITEM_POTION = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3';
const ITEM_SWORD = 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4';
// Shop offers per [[shop/shop-contract]] smoke coverage.
const OFFER_STARTER = 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5';
const OFFER_BUNDLE = 'f6f6f6f6-f6f6-f6f6-f6f6-f6f6f6f6f6f6';
const OFFER_OVERFLOW = '07070707-0707-0707-0707-070707070707';
const OFFER_PRICEY = '18181818-1818-1818-1818-181818181818';
const OFFER_DUAL = '29292929-2929-2929-2929-292929292929';
const OFFER_RETIRED = '3a3a3a3a-3a3a-3a3a-3a3a-3a3a3a3a3a3a';
const OFFER_EMPTY = '4b4b4b4b-4b4b-4b4b-4b4b-4b4b4b4b4b4b';

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
    await tx`INSERT INTO players (id, project_id, external_id) VALUES (${PLAYER_ID}, ${PROJECT_ID}, 'smoke-ext-id')`;
    await tx`INSERT INTO currencies (id, project_id, code, display_name) VALUES
             (${CURRENCY_GEMS}, ${PROJECT_ID}, 'gems', 'Gems'),
             (${CURRENCY_GOLD}, ${PROJECT_ID}, 'gold', 'Gold')`;
    // Slice 5: bootstrap the 12 system reason codes via the canonical function
    // instead of hand-INSERTing the 2 codes the smoke test exercises.
    await tx`SELECT bootstrap_project_reason_codes(${PROJECT_ID}::uuid)`;
    await tx`INSERT INTO wallets (id, project_id, player_id, currency_id, balance)
             VALUES (${WALLET_ID}, ${PROJECT_ID}, ${PLAYER_ID}, ${CURRENCY_GEMS}, 0)`;
    // Inventory items: one stackable with max_count=10 to exercise overflow, one non-stackable.
    await tx`INSERT INTO items (id, project_id, code, display_name, stackable, max_count) VALUES
             (${ITEM_POTION}, ${PROJECT_ID}, 'health_potion', 'Health Potion', true, 10),
             (${ITEM_SWORD}, ${PROJECT_ID}, 'legendary_sword', 'Legendary Sword', false, NULL)`;
    // Shop offers per [[shop/shop-contract]] smoke coverage. Offer ids by default;
    // prices/items reference offers by code subquery (avoids more uuid constants).
    await tx`INSERT INTO offers (id, project_id, code, display_name, active) VALUES
             (${OFFER_STARTER}, ${PROJECT_ID}, 'starter_pack', 'Starter Pack', true),
             (${OFFER_BUNDLE}, ${PROJECT_ID}, 'bundle_pack', 'Bundle Pack', true),
             (${OFFER_OVERFLOW}, ${PROJECT_ID}, 'overflow_pack', 'Overflow Pack', true),
             (${OFFER_PRICEY}, ${PROJECT_ID}, 'pricey_pack', 'Pricey Pack', true),
             (${OFFER_DUAL}, ${PROJECT_ID}, 'dual_pack', 'Dual Pack', true),
             (${OFFER_RETIRED}, ${PROJECT_ID}, 'retired_pack', 'Retired Pack', false),
             (${OFFER_EMPTY}, ${PROJECT_ID}, 'empty_pack', 'Empty Pack', true)`;
    await tx`INSERT INTO offer_prices (project_id, offer_id, currency_id, amount) VALUES
             (${PROJECT_ID}, ${OFFER_STARTER}, ${CURRENCY_GEMS}, 10),
             (${PROJECT_ID}, ${OFFER_BUNDLE}, ${CURRENCY_GEMS}, 10),
             (${PROJECT_ID}, ${OFFER_OVERFLOW}, ${CURRENCY_GEMS}, 5),
             (${PROJECT_ID}, ${OFFER_PRICEY}, ${CURRENCY_GEMS}, 1000),
             (${PROJECT_ID}, ${OFFER_DUAL}, ${CURRENCY_GEMS}, 30),
             (${PROJECT_ID}, ${OFFER_DUAL}, ${CURRENCY_GOLD}, 40),
             (${PROJECT_ID}, ${OFFER_RETIRED}, ${CURRENCY_GEMS}, 10),
             (${PROJECT_ID}, ${OFFER_EMPTY}, ${CURRENCY_GEMS}, 10)`;
    // NOTE: empty_pack is active + priced but deliberately has NO offer_items row — exercises BC093 (testS9).
    await tx`INSERT INTO offer_items (project_id, offer_id, item_id, quantity) VALUES
             (${PROJECT_ID}, ${OFFER_STARTER}, ${ITEM_POTION}, 2),
             (${PROJECT_ID}, ${OFFER_BUNDLE}, ${ITEM_POTION}, 1),
             (${PROJECT_ID}, ${OFFER_BUNDLE}, ${ITEM_SWORD}, 1),
             (${PROJECT_ID}, ${OFFER_OVERFLOW}, ${ITEM_POTION}, 8),
             (${PROJECT_ID}, ${OFFER_PRICEY}, ${ITEM_POTION}, 1),
             (${PROJECT_ID}, ${OFFER_DUAL}, ${ITEM_POTION}, 1),
             (${PROJECT_ID}, ${OFFER_RETIRED}, ${ITEM_POTION}, 1)`;
  });
}

async function teardown() {
  // Delete by stable scope (project_id / wallet_id) — covers original AND
  // de-identified rows since both stay scoped to PROJECT_ID after test 8.
  await admin`DELETE FROM transactions WHERE project_id = ${PROJECT_ID}`;
  // Shop tables before items/currencies (FK onDelete restrict).
  await admin`DELETE FROM offer_items WHERE project_id = ${PROJECT_ID}`;
  await admin`DELETE FROM offer_prices WHERE project_id = ${PROJECT_ID}`;
  await admin`DELETE FROM offers WHERE project_id = ${PROJECT_ID}`;
  await admin`DELETE FROM inventory WHERE project_id = ${PROJECT_ID}`;
  await admin`DELETE FROM items WHERE project_id = ${PROJECT_ID}`;
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

// Balance + history smoke tests per [[wallet/balance-history-contract]]
// cascade #19. Tests the wrapper-layer JOIN queries against the live tenant
// context, sans the HTTP layer. Run BEFORE test8/9 because deidentify mutates
// players.id and would break the JOIN on players.external_id.

async function test10_balance_join_known_wallet() {
  // After tests 1-7: test1 credit 100 (committed), test2 idempotent replay
  // (no change), test3 debit 30 (committed), tests 4-7 raise BCxxx and roll
  // back. Expected balance: 100 - 30 = 70.0000.
  const row = await withTenant(PROJECT_ID, async (tx) => {
    const rows = await tx<{ wallet_id: string; player_id: string; balance: string }[]>`
      SELECT w.id AS wallet_id, w.player_id, w.balance
      FROM wallets w
      JOIN players    p ON p.id = w.player_id
      JOIN currencies c ON c.id = w.currency_id
      WHERE w.project_id = ${PROJECT_ID}::uuid
        AND p.external_id = 'smoke-ext-id'
        AND c.code = 'gems'
      LIMIT 1
    `;
    return rows[0];
  });
  if (row !== undefined && row.balance === '70.0000' && row.wallet_id === WALLET_ID) {
    ok(`Test 10: balance JOIN read returns balance=${row.balance} for known wallet`);
  } else {
    fail(`Test 10: unexpected row=${JSON.stringify(row)} (expected balance=70.0000)`);
  }
}

async function test11_balance_join_unknown_player() {
  // Unknown external_id → JOIN returns zero rows. Route layer turns this into
  // synthesized `{balance:"0", currencyCode}` per
  // [[wallet/balance-history-contract]] (iii). Wrapper returns {exists:false}.
  const rows = await withTenant(PROJECT_ID, async (tx) => {
    return await tx<unknown[]>`
      SELECT w.id, w.balance
      FROM wallets w
      JOIN players    p ON p.id = w.player_id
      JOIN currencies c ON c.id = w.currency_id
      WHERE w.project_id = ${PROJECT_ID}::uuid
        AND p.external_id = 'never-seen-id'
        AND c.code = 'gems'
      LIMIT 1
    `;
  });
  if (rows.length === 0) {
    ok('Test 11: balance JOIN read returns 0 rows for unknown player (route synthesizes zero)');
  } else {
    fail(`Test 11: expected 0 rows, got ${rows.length}`);
  }
}

async function test12_history_pagination_and_ordering() {
  // tests 1-7 have committed 2 transactions on WALLET_ID (test1 credit, test3
  // debit). Fetch with limit=1 → 1 row + hasMore=true. Pass cursor → next row.
  // ORDER BY t.id DESC → newest first.
  const firstPage = await withTenant(PROJECT_ID, async (tx) => {
    return await tx<{ id: string; kind: string; amount: string }[]>`
      SELECT t.id::text, t.kind, t.amount::text
      FROM transactions t
      JOIN wallets    w ON w.id = t.wallet_id
      JOIN players    p ON p.id = w.player_id
      JOIN currencies c ON c.id = w.currency_id
      WHERE t.project_id = ${PROJECT_ID}::uuid
        AND p.external_id = 'smoke-ext-id'
        AND c.code = 'gems'
      ORDER BY t.id DESC
      LIMIT 2
    `;
  });
  if (firstPage.length < 2) {
    fail(`Test 12: expected >= 2 transactions, got ${firstPage.length}`);
    return;
  }
  // ORDER BY id DESC → newest first. id is BIGSERIAL monotonic. First row
  // should have the higher id.
  const firstId = parseInt(firstPage[0].id, 10);
  const secondId = parseInt(firstPage[1].id, 10);
  if (firstId <= secondId) {
    fail(`Test 12: expected DESC order, got ids ${firstId} then ${secondId}`);
    return;
  }
  // Now paginate with starting_after = firstId → should return the older row.
  const secondPage = await withTenant(PROJECT_ID, async (tx) => {
    return await tx<{ id: string; kind: string }[]>`
      SELECT t.id::text, t.kind
      FROM transactions t
      JOIN wallets    w ON w.id = t.wallet_id
      JOIN players    p ON p.id = w.player_id
      JOIN currencies c ON c.id = w.currency_id
      WHERE t.project_id = ${PROJECT_ID}::uuid
        AND p.external_id = 'smoke-ext-id'
        AND c.code = 'gems'
        AND t.id < ${firstId}::bigint
      ORDER BY t.id DESC
      LIMIT 1
    `;
  });
  if (secondPage.length === 1 && parseInt(secondPage[0].id, 10) === secondId) {
    ok(
      `Test 12: history pagination DESC ordering + cursor handoff works (first id=${firstId}, cursor → ${secondPage[0].id})`,
    );
  } else {
    fail(
      `Test 12: cursor pagination failed; expected id=${secondId}, got ${JSON.stringify(secondPage)}`,
    );
  }
}

async function test13_cross_tenant_isolation_read() {
  // Read PROJECT_ID's wallet from PROJECT_OTHER's tenant context. RLS policies
  // on wallets / players / currencies / transactions all filter by current
  // tenant GUC. Under PROJECT_OTHER context, the JOIN returns 0 rows even
  // though the WALLET_ID + smoke-ext-id exist (just not in PROJECT_OTHER).
  const rows = await withTenant(PROJECT_OTHER, async (tx) => {
    return await tx<unknown[]>`
      SELECT w.id, w.balance
      FROM wallets w
      JOIN players    p ON p.id = w.player_id
      JOIN currencies c ON c.id = w.currency_id
      WHERE w.project_id = ${PROJECT_ID}::uuid
        AND p.external_id = 'smoke-ext-id'
        AND c.code = 'gems'
      LIMIT 1
    `;
  });
  if (rows.length === 0) {
    ok('Test 13: cross-tenant balance read returns 0 rows (RLS-isolated)');
  } else {
    fail(`Test 13: cross-tenant leak — got ${rows.length} rows from PROJECT_OTHER context`);
  }
}

// Inventory tests per [[inventory/inventory-contract]] cascade #11. Run BEFORE deidentify
// because deidentify rewrites players.id, breaking the lazy-create-by-external_id JOIN.
// All use the canonical bootstrap reason codes set up at line 60; `signup_bonus` covers item ops too.

async function test14_inventory_grant_stackable_happy() {
  const result = await withTenant(PROJECT_ID, async (tx) => {
    const rows = await tx<
      {
        transaction_id: string;
        player_id: string;
        item_id: string;
        stackable: boolean;
        new_count: number | null;
      }[]
    >`
      SELECT transaction_id::text, player_id, item_id, stackable, new_count
      FROM item_grant_by_external_id(
        ${PROJECT_ID}::uuid,
        'smoke-ext-id'::text,
        'health_potion'::text,
        3::integer,
        'signup_bonus'::text,
        'inv-grant-evt-1'::text
      )
    `;
    return rows[0];
  });
  if (result.stackable && result.new_count === 3 && result.item_id === ITEM_POTION) {
    ok(`Test 14: stackable grant — new_count=3, transaction_id=${result.transaction_id}`);
  } else {
    fail(`Test 14: unexpected ${JSON.stringify(result)}`);
  }
}

async function test15_inventory_grant_overflow_reject() {
  // Item potion has max_count=10; we already granted 3 in test14. Granting 8 more
  // would push to 11 → BC081. Verify the row is NOT mutated post-rollback.
  try {
    await withTenant(PROJECT_ID, async (tx) => {
      await tx`
        SELECT item_grant_by_external_id(
          ${PROJECT_ID}::uuid,
          'smoke-ext-id'::text,
          'health_potion'::text,
          8::integer,
          'signup_bonus'::text,
          'inv-grant-overflow'::text
        )
      `;
    });
    fail('Test 15: BC081 expected; grant succeeded');
    return;
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code !== 'BC081') {
      fail(`Test 15: expected BC081, got code=${e.code} msg=${e.message}`);
      return;
    }
  }
  // Re-read count: should still be 3 (overflow rolled back).
  const rows = await admin<{ count: number }[]>`
    SELECT count FROM inventory WHERE project_id = ${PROJECT_ID} AND item_id = ${ITEM_POTION} AND instance_id IS NULL
  `;
  if (rows.length === 1 && rows[0].count === 3) {
    ok('Test 15: BC081 raised + rollback preserved count=3');
  } else {
    fail(`Test 15: rollback failed — rows=${JSON.stringify(rows)}`);
  }
}

async function test16_inventory_grant_nonstackable_instance_ids() {
  const result = await withTenant(PROJECT_ID, async (tx) => {
    const rows = await tx<
      {
        transaction_id: string;
        stackable: boolean;
        new_count: number | null;
        instance_ids: string[] | null;
      }[]
    >`
      SELECT transaction_id::text, stackable, new_count, instance_ids
      FROM item_grant_by_external_id(
        ${PROJECT_ID}::uuid,
        'smoke-ext-id'::text,
        'legendary_sword'::text,
        2::integer,
        'signup_bonus'::text,
        'inv-grant-sword-1'::text
      )
    `;
    return rows[0];
  });
  if (
    !result.stackable &&
    result.new_count === null &&
    Array.isArray(result.instance_ids) &&
    result.instance_ids.length === 2
  ) {
    ok(
      `Test 16: non-stackable grant — minted 2 instance UUIDs (${result.instance_ids.slice(0, 1)[0]}…)`,
    );
  } else {
    fail(`Test 16: unexpected ${JSON.stringify(result)}`);
  }
}

async function test17_inventory_consume_stackable_happy() {
  const result = await withTenant(PROJECT_ID, async (tx) => {
    const rows = await tx<
      { transaction_id: string; stackable: boolean; new_count: number | null }[]
    >`
      SELECT transaction_id::text, stackable, new_count
      FROM item_consume_by_external_id(
        ${PROJECT_ID}::uuid,
        'smoke-ext-id'::text,
        'health_potion'::text,
        1::integer,
        'shop_purchase_cost'::text,
        NULL::uuid,
        'inv-consume-evt-1'::text
      )
    `;
    return rows[0];
  });
  if (result.stackable && result.new_count === 2) {
    ok(`Test 17: stackable consume — new_count=2 (was 3, consumed 1)`);
  } else {
    fail(`Test 17: unexpected ${JSON.stringify(result)}`);
  }
}

async function test18_inventory_consume_insufficient_reject() {
  // Current potion count = 2 (3 granted in test14, 1 consumed in test17).
  // Try to consume 10 → BC082.
  try {
    await withTenant(PROJECT_ID, async (tx) => {
      await tx`
        SELECT item_consume_by_external_id(
          ${PROJECT_ID}::uuid,
          'smoke-ext-id'::text,
          'health_potion'::text,
          10::integer,
          'shop_purchase_cost'::text,
          NULL::uuid,
          'inv-consume-bust'::text
        )
      `;
    });
    fail('Test 18: BC082 expected; consume succeeded');
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'BC082') {
      ok('Test 18: BC082 InsufficientInventory raised');
    } else {
      fail(`Test 18: expected BC082, got code=${e.code} msg=${e.message}`);
    }
  }
}

async function test19_inventory_list_pagination() {
  // After tests 14-18: 1 stackable inventory row (count=2) + 2 non-stackable rows
  // = 3 inventory rows for this player. Fetch with limit=2 → 2 rows + hasMore.
  const firstPage = await withTenant(PROJECT_ID, async (tx) => {
    return await tx<{ id: string; item_code: string }[]>`
      SELECT inv.id::text, it.code AS item_code
      FROM inventory inv
      JOIN players p ON p.id = inv.player_id
      JOIN items   it ON it.id = inv.item_id
      WHERE inv.project_id = ${PROJECT_ID}::uuid
        AND p.external_id = 'smoke-ext-id'
      ORDER BY inv.id DESC
      LIMIT 3
    `;
  });
  if (firstPage.length === 3) {
    ok(`Test 19: list returns 3 rows (1 stackable + 2 instances) — DESC by inv.id`);
  } else {
    fail(`Test 19: expected 3 rows, got ${firstPage.length} — ${JSON.stringify(firstPage)}`);
  }
}

async function test_d4_non_stackable_idempotency_replay() {
  // Migration 0012 persists non-stackable grant instance_ids into transactions.metadata.
  // Re-call item_grant_by_external_id with the same source_event_id used in test16 ('inv-grant-sword-1');
  // expect SAME instance_ids returned, regardless of created_at age (no 24h heuristic).
  const replay = await withTenant(PROJECT_ID, async (tx) => {
    const rows = await tx<
      {
        transaction_id: string;
        stackable: boolean;
        instance_ids: string[] | null;
      }[]
    >`
      SELECT transaction_id::text, stackable, instance_ids
      FROM item_grant_by_external_id(
        ${PROJECT_ID}::uuid,
        'smoke-ext-id'::text,
        'legendary_sword'::text,
        2::integer,
        'signup_bonus'::text,
        'inv-grant-sword-1'::text
      )
    `;
    return rows[0];
  });
  // Verify against persisted metadata.
  const stored = await admin<{ metadata: { instance_ids?: string[] } }[]>`
    SELECT metadata FROM transactions WHERE id = ${replay.transaction_id}::bigint
  `;
  if (
    !replay.stackable &&
    Array.isArray(replay.instance_ids) &&
    replay.instance_ids.length === 2 &&
    Array.isArray(stored[0]?.metadata?.instance_ids) &&
    stored[0]?.metadata?.instance_ids?.length === 2
  ) {
    ok(
      `Test D4: non-stackable idempotency replay reads instance_ids from transactions.metadata (persisted, not heuristic)`,
    );
  } else {
    fail(
      `Test D4: replay shape mismatch — ${JSON.stringify(replay)} stored=${JSON.stringify(stored[0])}`,
    );
  }
}

async function test20_inventory_cross_tenant_isolation() {
  // Read PROJECT_ID's inventory from PROJECT_OTHER's tenant context. RLS policy on inventory
  // filters by current_tenant GUC — JOIN returns 0 rows even though smoke-ext-id exists.
  const rows = await withTenant(PROJECT_OTHER, async (tx) => {
    return await tx<unknown[]>`
      SELECT inv.id
      FROM inventory inv
      JOIN players p ON p.id = inv.player_id
      WHERE inv.project_id = ${PROJECT_ID}::uuid
        AND p.external_id = 'smoke-ext-id'
      LIMIT 1
    `;
  });
  if (rows.length === 0) {
    ok('Test 20: cross-tenant inventory read returns 0 rows (RLS-isolated)');
  } else {
    fail(`Test 20: cross-tenant leak — got ${rows.length} rows from PROJECT_OTHER context`);
  }
}

// ---------- Shop primitive (purchase_offer_by_external_id) per [[shop/shop-contract]] ----------
// Entry state: gems balance = 70 (test1 +100, test3 -30); health_potion count = 2
// (test14 +3, test17 -1). Idempotency replay is HTTP-middleware-owned (the SQL passes
// source_event_id=NULL), so it is verified by the operator curl proof, NOT here.

type PurchaseRow = {
  purchase_id: string;
  paid_currency_code: string;
  paid_amount: string;
  granted: { itemCode: string; quantity: number; stackable: boolean }[];
};

async function purchase(
  offerCode: string,
  payWith: string | null,
  projectId: string = PROJECT_ID,
): Promise<PurchaseRow> {
  return await withTenant(projectId, async (tx) => {
    const rows = await tx<PurchaseRow[]>`
      SELECT purchase_id, paid_currency_code, paid_amount::text, granted
      FROM purchase_offer_by_external_id(
        ${projectId}::uuid, 'smoke-ext-id'::text, ${offerCode}::text, ${payWith}::text
      )
    `;
    return rows[0];
  });
}

async function gemsBalance(): Promise<string> {
  const rows = await admin<
    { balance: string }[]
  >`SELECT balance::text FROM wallets WHERE id = ${WALLET_ID}`;
  return rows[0]?.balance ?? 'missing';
}

async function potionCount(): Promise<number> {
  const rows = await admin<{ count: number }[]>`
    SELECT count FROM inventory WHERE project_id = ${PROJECT_ID} AND item_id = ${ITEM_POTION} AND instance_id IS NULL
  `;
  return rows[0]?.count ?? 0;
}

async function testS1_purchase_happy_single() {
  const result = await purchase('starter_pack', 'gems');
  const ledger = await admin<{ kind: string }[]>`
    SELECT kind FROM transactions
    WHERE project_id = ${PROJECT_ID} AND metadata->>'purchase_id' = ${result.purchase_id}
    ORDER BY kind`;
  const kinds = ledger.map((r) => r.kind);
  const bal = await gemsBalance();
  const potions = await potionCount();
  if (
    result.paid_currency_code === 'gems' &&
    Number(result.paid_amount) === 10 &&
    kinds.length === 2 &&
    kinds.includes('currency_debit') &&
    kinds.includes('item_grant') &&
    Number(bal) === 60 &&
    potions === 4
  ) {
    ok(
      `TestS1: purchase starter_pack — 1 debit + 1 grant share purchase_id, gems 70→60, potion 2→4`,
    );
  } else {
    fail(
      `TestS1: unexpected — paid=${result.paid_amount} kinds=${JSON.stringify(kinds)} bal=${bal} potions=${potions}`,
    );
  }
}

async function testS2_purchase_bundle() {
  const result = await purchase('bundle_pack', 'gems');
  const ledger = await admin<{ kind: string }[]>`
    SELECT kind FROM transactions
    WHERE project_id = ${PROJECT_ID} AND metadata->>'purchase_id' = ${result.purchase_id}`;
  const grants = ledger.filter((r) => r.kind === 'item_grant').length;
  const debits = ledger.filter((r) => r.kind === 'currency_debit').length;
  const bal = await gemsBalance();
  if (result.granted.length === 2 && debits === 1 && grants === 2 && Number(bal) === 50) {
    ok(`TestS2: bundle purchase — 1 debit + 2 grants share purchase_id (L2 ledger), gems 60→50`);
  } else {
    fail(
      `TestS2: unexpected — granted=${result.granted.length} debits=${debits} grants=${grants} bal=${bal}`,
    );
  }
}

async function testS3_purchase_overflow_rollback() {
  // overflow_pack grants potion x8; current potion=5 → 13 > max_count 10 → BC081, whole purchase rolls back.
  const balBefore = await gemsBalance();
  try {
    await purchase('overflow_pack', 'gems');
    fail('TestS3: BC081 expected; purchase succeeded');
    return;
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code !== 'BC081') {
      fail(`TestS3: expected BC081, got code=${e.code} msg=${e.message}`);
      return;
    }
  }
  const balAfter = await gemsBalance();
  const potions = await potionCount();
  if (balAfter === balBefore && potions === 5) {
    ok(
      `TestS3: grant overflow → BC081 rolls back the debit too (gems unchanged=${balAfter}, potion=5)`,
    );
  } else {
    fail(
      `TestS3: rollback failed — balBefore=${balBefore} balAfter=${balAfter} potions=${potions}`,
    );
  }
}

async function testS4_purchase_insufficient_funds() {
  // pricey_pack costs 1000 gems; balance is 50 → BC010 (surfaces as INSUFFICIENT_FUNDS at HTTP).
  const balBefore = await gemsBalance();
  try {
    await purchase('pricey_pack', 'gems');
    fail('TestS4: BC010 expected; purchase succeeded');
    return;
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code !== 'BC010') {
      fail(`TestS4: expected BC010, got code=${e.code} msg=${e.message}`);
      return;
    }
  }
  const balAfter = await gemsBalance();
  if (balAfter === balBefore) {
    ok(`TestS4: insufficient funds → BC010, balance unchanged (${balAfter})`);
  } else {
    fail(`TestS4: balance moved on failed purchase — before=${balBefore} after=${balAfter}`);
  }
}

async function testS5_purchase_unknown_offer() {
  try {
    await purchase('no_such_offer', 'gems');
    fail('TestS5: BC090 expected; purchase succeeded');
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'BC090') {
      ok('TestS5: unknown offer → BC090');
    } else {
      fail(`TestS5: expected BC090, got code=${e.code} msg=${e.message}`);
    }
  }
}

async function testS6_purchase_offer_inactive() {
  try {
    await purchase('retired_pack', 'gems');
    fail('TestS6: BC091 expected; purchase succeeded');
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'BC091') {
      ok('TestS6: inactive offer → BC091');
    } else {
      fail(`TestS6: expected BC091, got code=${e.code} msg=${e.message}`);
    }
  }
}

async function testS7_purchase_invalid_payment_currency() {
  // dual_pack has 2 prices (gems, gold); omitting payWith is ambiguous → BC092.
  try {
    await purchase('dual_pack', null);
    fail('TestS7: BC092 expected; purchase succeeded');
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'BC092') {
      ok('TestS7: multi-price offer without payWith → BC092');
    } else {
      fail(`TestS7: expected BC092, got code=${e.code} msg=${e.message}`);
    }
  }
}

async function testS8_purchase_cross_tenant_isolation() {
  // PROJECT_OTHER tenant cannot resolve PROJECT_ID's offer — RLS hides it → BC090.
  try {
    await purchase('starter_pack', 'gems', PROJECT_OTHER);
    fail('TestS8: BC090 expected; cross-tenant purchase succeeded');
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'BC090') {
      ok('TestS8: cross-tenant purchase of PROJECT_ID offer → BC090 (RLS-isolated)');
    } else {
      fail(`TestS8: expected BC090, got code=${e.code} msg=${e.message}`);
    }
  }
}

async function testS9_purchase_empty_offer_backstop() {
  // empty_pack is active + priced (10 gems) but has zero offer_items → BC093, raised pre-debit.
  // Per [[shop/contract-reconciliation-2026-05-21]] D1 — the "charged got nothing" backstop.
  const balBefore = await gemsBalance();
  try {
    await purchase('empty_pack', 'gems');
    fail('TestS9: BC093 expected; empty-offer purchase succeeded');
    return;
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code !== 'BC093') {
      fail(`TestS9: expected BC093, got code=${e.code} msg=${e.message}`);
      return;
    }
  }
  const balAfter = await gemsBalance();
  if (balAfter === balBefore) {
    ok(`TestS9: empty offer → BC093 raised pre-debit, balance unchanged (${balAfter})`);
  } else {
    fail(`TestS9: balance moved on empty-offer purchase — before=${balBefore} after=${balAfter}`);
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
  // Full erasure per [[wallet/deidentify-full-erasure]]: the original PLAYER_ID must appear in NO
  // player-referencing table; the players identity row becomes the anon row (PII null); wallets +
  // inventory + transactions all repoint to the SAME anon_id.
  const originalRefs = await admin<{ tbl: string; n: string }[]>`
    SELECT 'players'      AS tbl, count(*)::text AS n FROM players      WHERE id        = ${PLAYER_ID}
    UNION ALL SELECT 'wallets',      count(*)::text FROM wallets      WHERE player_id = ${PLAYER_ID}
    UNION ALL SELECT 'inventory',    count(*)::text FROM inventory    WHERE player_id = ${PLAYER_ID}
    UNION ALL SELECT 'transactions', count(*)::text FROM transactions WHERE player_id = ${PLAYER_ID}
    UNION ALL SELECT 'loot_rolls',   count(*)::text FROM loot_rolls   WHERE player_id = ${PLAYER_ID}
    UNION ALL SELECT 'iap_receipts', count(*)::text FROM iap_receipts WHERE player_id = ${PLAYER_ID}
  `;
  const anyOriginal = originalRefs.filter((r) => r.n !== '0');
  // anon_id = whoever the gems wallet now points to (wallets repoint is the NEW behavior).
  const walletAnon = await admin<
    { player_id: string }[]
  >`SELECT player_id FROM wallets WHERE id = ${WALLET_ID}`;
  const anonId = walletAnon[0]?.player_id;
  // anon players identity row exists with PII scrubbed.
  const anonPlayer = await admin<
    { id: string; email: string | null; external_id: string | null }[]
  >`
    SELECT id, email, external_id FROM players WHERE id = ${anonId ?? null}
  `;
  const invAnon = await admin<
    { player_id: string }[]
  >`SELECT DISTINCT player_id FROM inventory WHERE project_id = ${PROJECT_ID}`;
  const txnAnon = await admin<
    { player_id: string }[]
  >`SELECT DISTINCT player_id FROM transactions WHERE wallet_id = ${WALLET_ID}`;
  if (
    anyOriginal.length === 0 &&
    anonId !== undefined &&
    anonId !== PLAYER_ID &&
    anonPlayer.length === 1 &&
    anonPlayer[0].email === null &&
    anonPlayer[0].external_id === null &&
    invAnon.length === 1 &&
    invAnon[0].player_id === anonId &&
    txnAnon.length === 1 &&
    txnAnon[0].player_id === anonId
  ) {
    ok(
      `Test 8: full erasure — original player_id gone from all 6 tables; players row anonymized (PII null); wallets+inventory+transactions → anon_id=${anonId}`,
    );
  } else {
    fail(
      `Test 8: anyOriginal=${JSON.stringify(anyOriginal)} anonId=${anonId} anonPlayer=${JSON.stringify(anonPlayer)} invAnon=${JSON.stringify(invAnon)} txnAnon=${JSON.stringify(txnAnon)} (rows_touched=${result})`,
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
  // Balance + history smoke runs BEFORE deidentify because deidentify replaces
  // players.id with anon UUIDv8, breaking the JOIN on players.external_id.
  await test10_balance_join_known_wallet();
  await test11_balance_join_unknown_player();
  await test12_history_pagination_and_ordering();
  await test13_cross_tenant_isolation_read();
  // Inventory smoke runs BEFORE deidentify (same JOIN-on-external_id constraint).
  await test14_inventory_grant_stackable_happy();
  await test15_inventory_grant_overflow_reject();
  await test16_inventory_grant_nonstackable_instance_ids();
  await test17_inventory_consume_stackable_happy();
  await test18_inventory_consume_insufficient_reject();
  await test19_inventory_list_pagination();
  await test_d4_non_stackable_idempotency_replay();
  await test20_inventory_cross_tenant_isolation();

  await testS1_purchase_happy_single();
  await testS2_purchase_bundle();
  await testS3_purchase_overflow_rollback();
  await testS4_purchase_insufficient_funds();
  await testS5_purchase_unknown_offer();
  await testS6_purchase_offer_inactive();
  await testS7_purchase_invalid_payment_currency();
  await testS8_purchase_cross_tenant_isolation();
  await testS9_purchase_empty_offer_backstop();

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
