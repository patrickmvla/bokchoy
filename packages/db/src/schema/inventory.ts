/** Inventory primitive schemas. Per [[inventory/inventory-contract]] M-A item model. */

import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { players, projects, TENANT_GUC } from './tenancy';

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    stackable: boolean('stackable').notNull().default(true),
    maxCount: integer('max_count'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('items_code_check', sql`${t.code} ~ '^[A-Za-z0-9_]{1,64}$'`),
    check('items_max_count_check', sql`${t.maxCount} IS NULL OR ${t.maxCount} > 0`),
    check('items_max_count_consistency_check', sql`${t.stackable} OR ${t.maxCount} IS NULL`),
    uniqueIndex('items_project_id_code_unique').on(t.projectId, t.code),
    index('idx_items_project').on(t.projectId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

/** Single table with conditional uniqueness: stackable rows have instance_id NULL + UNIQUE on (project, player, item); non-stackable rows carry instance_id UUID + UNIQUE on (project, player, instance_id). Partition-ready via composite PK matching transactions. */
export const inventory = pgTable(
  'inventory',
  {
    id: bigserial('id', { mode: 'number' }).notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    instanceId: uuid('instance_id'),
    count: integer('count').notNull().default(1),
    properties: jsonb('properties').notNull().default(sql`'{}'::jsonb`),
    version: bigint('version', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.createdAt] }),
    check('inventory_count_check', sql`${t.count} >= 0`),
    uniqueIndex('inventory_stackable_unique')
      .on(t.projectId, t.playerId, t.itemId)
      .where(sql`${t.instanceId} IS NULL`),
    uniqueIndex('inventory_instance_unique')
      .on(t.projectId, t.playerId, t.instanceId)
      .where(sql`${t.instanceId} IS NOT NULL`),
    index('idx_inventory_player').on(t.projectId, t.playerId),
    index('idx_inventory_item').on(t.projectId, t.itemId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();
