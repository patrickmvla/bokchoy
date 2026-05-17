// Wallet primitive schemas.
//
// Per [[wallet-mechanics]] (Amendments 2026-05-04 Part 1+2+3):
//   • currencies / wallets / reason_codes — [[economy-primitives-research]] F3 / F4 / F6
//     (R3 per-project allowlist for reason codes per Part 3 A15).
//   • idempotency_keys — [[idempotency-keys-schema-research]] F6
//     (D11.1 JSONB request_params + D11.2 NULL-until-locked per Part 3 A14).
//   • transactions — [[wallet-mechanics]] §3 + Part 2 A8 (player_id UUID) +
//     Part 3 A16 (wallet_version BIGINT NOT NULL + composite FK on
//     (project_id, reason_code) → reason_codes).
//   • loot_rolls / iap_receipts — [[wallet-mechanics]] §5 + Part 2 A9
//     (player_id UUID).
//   • staged_jobs — [[wallet-mechanics]] §4 + Part 3 A17
//     ('idempotency_reaper' kind added to CHECK).
//
// Column names follow the Postgres-side spec (snake_case); JS properties are
// camelCase per Drizzle convention.
//
// EXPLICITLY OUT OF THIS SLICE (each is its own follow-up cascade obligation):
//   • PARTITION BY RANGE (created_at) on transactions / loot_rolls / iap_receipts
//     per [[wallet-mechanics]] §3 + §7 — drizzle-kit doesn't emit declarative
//     partitions; lands in a hand-edited follow-on migration with pg_partman.
//   • RLS policies + FORCE ROW LEVEL SECURITY per [[wallet-mechanics]] §8 —
//     separate migration once tables exist.
//   • M1 stored functions (wallet_credit / wallet_debit / inventory_grant /
//     inventory_consume / wallet_deidentify_player) per Part 1 A1 SECURITY
//     INVOKER + Part 1 A2 FOR UPDATE + Part 1 A5 BCxxx SQLSTATE.
//   • Bootstrap 12 system reason_codes on project creation (Part 3 A17 mechanism
//     pick deferred — function vs trigger vs app-side hook).
//   • Hourly idempotency_keys reaper via staged_jobs (kind='idempotency_reaper').
//   • CI lint scripts/check-direct-wallet-mutation.ts per Part 1 A1.
//   • SDK auto-key `bokchoy-sdk-retry-${uuid4()}` per Part 3 A17.

import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { players, projects, TENANT_GUC } from './tenancy';

// ---------- currencies ----------
// Per-project virtual currency definitions per [[economy-primitives-research]] F3.
// `decimals` is for display/SDK serialization; on-chain storage is unconditionally
// NUMERIC(20,4) on transactions.amount + wallets.balance.
export const currencies = pgTable(
  'currencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    decimals: smallint('decimals').notNull().default(0),
    isPremium: boolean('is_premium').notNull().default(false),
    isTradable: boolean('is_tradable').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('currencies_code_check', sql`${t.code} ~ '^[A-Za-z0-9_]{1,16}$'`),
    check('currencies_decimals_check', sql`${t.decimals} BETWEEN 0 AND 8`),
    uniqueIndex('currencies_project_id_code_unique').on(t.projectId, t.code),
    index('idx_currencies_project').on(t.projectId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

// ---------- wallets ----------
// Pgledger row-per-(project, player, currency) pattern per
// [[economy-primitives-research]] F4.
export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    currencyId: uuid('currency_id')
      .notNull()
      .references(() => currencies.id, { onDelete: 'restrict' }),
    balance: numeric('balance', { precision: 20, scale: 4 }).notNull().default('0'),
    version: bigint('version', { mode: 'number' }).notNull().default(0),
    allowNegativeBalance: boolean('allow_negative_balance').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('wallets_balance_check', sql`${t.balance} >= 0`),
    uniqueIndex('wallets_project_player_currency_unique').on(t.projectId, t.playerId, t.currencyId),
    index('idx_wallets_player').on(t.projectId, t.playerId),
    index('idx_wallets_currency').on(t.projectId, t.currencyId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

// ---------- reason_codes ----------
// Per-project allowlist (R3 — Part 3 A15) per [[economy-primitives-research]] F6.
// Composite PK (project_id, code) is the FK target referenced by transactions.
// Bootstrap default-set (8 faucets + 4 drains, all is_system=TRUE) lands via the
// project-creation hook — explicitly NOT in this schema slice.
export const reasonCodes = pgTable(
  'reason_codes',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    displayName: text('display_name').notNull(),
    category: text('category').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.code] }),
    check('reason_codes_code_check', sql`${t.code} ~ '^[a-z][a-z0-9_]{0,63}$'`),
    check(
      'reason_codes_category_check',
      sql`${t.category} IN ('faucet', 'drain', 'transfer', 'admin')`,
    ),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

// ---------- idempotency_keys ----------
// Brandur-shape with BokChoy adaptations per [[idempotency-keys-schema-research]] F6:
//   • UNIQUE(project_id, idempotency_key) — replaces Brandur's user_id.
//   • 255-char cap — Stripe-match per [[idempotency-strategy]].
//   • request_params JSONB (D11.1 — JSONB over body-hash, Part 3 A14).
//   • locked_at NULL-until-locked + completed_at NOT NULL when terminal
//     (D11.2 — Part 3 A14). State derivable from columns alone (D2-α drops
//     Brandur's recovery_point).
//   • Reaper runs hourly on (created_at) WHERE completed_at IS NOT NULL — 24h TTL.
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    requestMethod: text('request_method').notNull(),
    requestPath: text('request_path').notNull(),
    requestParams: jsonb('request_params').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('idempotency_keys_key_length_check', sql`char_length(${t.idempotencyKey}) <= 255`),
    uniqueIndex('idempotency_keys_project_key_unique').on(t.projectId, t.idempotencyKey),
    index('idx_idempotency_keys_reaper').on(t.createdAt).where(sql`${t.completedAt} IS NOT NULL`),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

// ---------- transactions ----------
// Unified audit log per [[wallet-mechanics]] §3 with cascades:
//   • player_id UUID per Part 2 A8.
//   • wallet_id / currency_id UUID (FK to UUID-keyed wallets / currencies).
//   • wallet_version BIGINT NOT NULL per Part 3 A16 — server-populated from
//     wallets.version inside wallet_credit/wallet_debit; pgledger forensic-version
//     pattern.
//   • Composite FK (project_id, reason_code) → reason_codes(project_id, code)
//     per Part 3 A16 — write-time spelling-drift defense.
//
// PK is (id, created_at) — composite so PARTITION BY RANGE (created_at) is
// addable without a PK rewrite. The PARTITION BY clause itself lands in the
// follow-on migration; this table ships unpartitioned in 0001.
export const transactions = pgTable(
  'transactions',
  {
    id: bigserial('id', { mode: 'number' }).notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    walletId: uuid('wallet_id').references(() => wallets.id, {
      onDelete: 'restrict',
    }),
    playerId: uuid('player_id').notNull(),
    kind: text('kind').notNull(),
    amount: numeric('amount', { precision: 20, scale: 4 }),
    currencyId: uuid('currency_id').references(() => currencies.id, {
      onDelete: 'restrict',
    }),
    walletVersion: bigint('wallet_version', { mode: 'number' }).notNull(),
    itemId: bigint('item_id', { mode: 'number' }),
    itemQuantity: integer('item_quantity'),
    reasonCode: text('reason_code').notNull(),
    sourceEventId: text('source_event_id'),
    idempotencyKeyId: bigint('idempotency_key_id', { mode: 'number' }).references(
      () => idempotencyKeys.id,
      { onDelete: 'set null' },
    ),
    relatedId: bigint('related_id', { mode: 'number' }),
    relatedType: text('related_type'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.createdAt] }),
    check(
      'transactions_kind_check',
      sql`${t.kind} IN ('currency_credit','currency_debit','item_grant','item_consume','compensation_grant')`,
    ),
    check(
      'transactions_related_type_check',
      sql`${t.relatedType} IS NULL OR ${t.relatedType} IN ('loot_roll','iap_receipt','compensation_grant')`,
    ),
    foreignKey({
      columns: [t.projectId, t.reasonCode],
      foreignColumns: [reasonCodes.projectId, reasonCodes.code],
      name: 'transactions_project_reason_code_fk',
    }).onDelete('restrict'),
    index('idx_transactions_wallet_lookup').on(t.walletId, t.createdAt),
    index('idx_transactions_player_lookup').on(t.playerId, t.createdAt),
    index('idx_transactions_related')
      .on(t.relatedType, t.relatedId)
      .where(sql`${t.relatedId} IS NOT NULL`),
    index('idx_transactions_project_recon')
      .on(t.projectId, t.currencyId, t.createdAt)
      .where(sql`${t.walletId} IS NOT NULL`),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

// ---------- loot_rolls ----------
// Sister table per [[wallet-mechanics]] §5 + Part 2 A9 (player_id UUID).
// pre_state / post_state are customer-opaque per [[pity-engine-scope]].
// seed_inputs carries player_id at 16-byte UUID width per [[loot-rng-construction]]
// canonical-form amendment (cascade obligation Part 2 A12 — applies when the
// loot-roll engine itself ships; the schema column shape is fixed here).
//
// banner_id has no FK target in this slice (banners table is a Month 2 deliverable).
export const lootRolls = pgTable(
  'loot_rolls',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    bannerId: bigint('banner_id', { mode: 'number' }).notNull(),
    pullSessionId: text('pull_session_id').notNull(),
    attemptNumber: integer('attempt_number').notNull().default(0),
    preState: jsonb('pre_state').notNull(),
    postState: jsonb('post_state').notNull(),
    seedInputs: jsonb('seed_inputs').notNull(),
    rngOutput: jsonb('rng_output').notNull(),
    itemsGranted: jsonb('items_granted').notNull(),
    idempotencyKeyId: bigint('idempotency_key_id', { mode: 'number' }).references(
      () => idempotencyKeys.id,
      { onDelete: 'set null' },
    ),
    rngKeyId: smallint('rng_key_id').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('loot_rolls_player_banner_session_attempt_unique').on(
      t.playerId,
      t.bannerId,
      t.pullSessionId,
      t.attemptNumber,
    ),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

// ---------- iap_receipts ----------
// Sister table per [[wallet-mechanics]] §5 + Part 2 A9 (player_id UUID).
// raw_receipt is NULL'd by wallet_deidentify_player on account close.
export const iapReceipts = pgTable(
  'iap_receipts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    platform: text('platform').notNull(),
    rawReceipt: text('raw_receipt'),
    platformTransactionId: text('platform_transaction_id').notNull(),
    validatedAt: timestamp('validated_at', { withTimezone: true, mode: 'date' }),
    validationResponse: jsonb('validation_response'),
    idempotencyKeyId: bigint('idempotency_key_id', { mode: 'number' }).references(
      () => idempotencyKeys.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('iap_receipts_platform_check', sql`${t.platform} IN ('apple','google','steam')`),
    uniqueIndex('iap_receipts_platform_txn_unique').on(t.platform, t.platformTransactionId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

// ---------- staged_jobs ----------
// Outbox per [[wallet-mechanics]] §4 + Part 3 A17 (kind 'idempotency_reaper').
// Worker claim pattern (SELECT … FOR UPDATE SKIP LOCKED) lives in the worker
// implementation, not in the schema.
export const stagedJobs = pgTable(
  'staged_jobs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    idempotencyKeyId: bigint('idempotency_key_id', { mode: 'number' }).references(
      () => idempotencyKeys.id,
      { onDelete: 'set null' },
    ),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'),
    attempt: smallint('attempt').notNull().default(0),
    maxAttempts: smallint('max_attempts').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    failedAt: timestamp('failed_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'staged_jobs_kind_check',
      sql`${t.kind} IN ('webhook_fire','mailbox_push','iap_receipt_validate','analytics_event','idempotency_reaper')`,
    ),
    check(
      'staged_jobs_status_check',
      sql`${t.status} IN ('pending','running','completed','failed','dead')`,
    ),
    index('idx_staged_jobs_dequeue')
      .on(t.scheduledAt, t.createdAt)
      .where(sql`${t.status} = 'pending'`),
    index('idx_staged_jobs_project_status').on(t.projectId, t.status),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();
