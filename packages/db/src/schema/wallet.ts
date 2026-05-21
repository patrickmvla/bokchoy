/** Wallet primitive schemas. Per [[wallet-mechanics]]. RLS policies + partitioning ship in follow-on migrations. */

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

/** `decimals` is display/SDK-side only — on-chain storage is unconditionally NUMERIC(20,4). */
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

/** Row-per-(project, player, currency) per pgledger pattern. */
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

/** Per-project reason-code allowlist. Composite PK (project_id, code) is the FK target on transactions. */
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

/** Brandur-shape: NULL-until-locked + completed_at terminal. 255-char cap (Stripe-match). 24h reaper TTL. */
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

/** Audit log. Composite PK (id, created_at) so PARTITION BY RANGE(created_at) is addable without PK rewrite. */
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
    itemId: uuid('item_id'),
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

// banner_id has no FK target — banners table is a Month 2 deliverable.
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

/** raw_receipt is NULL'd by wallet_deidentify_player on account close. */
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

/** Outbox. Worker claim (SELECT…FOR UPDATE SKIP LOCKED) lives in the worker, not the schema. */
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
