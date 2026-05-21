/** Shop primitive schemas. Per [[shop/shop-contract]] B1b — the offer is the priced purchasable unit; price never lives on items. */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { items } from './inventory';
import { projects, TENANT_GUC } from './tenancy';
import { currencies } from './wallet';

export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('offers_code_check', sql`${t.code} ~ '^[A-Za-z0-9_]{1,64}$'`),
    uniqueIndex('offers_project_id_code_unique').on(t.projectId, t.code),
    index('idx_offers_project').on(t.projectId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

/** Price-set rows: ≥1 per offer, OR-semantics (buyer pays one listed currency). Multi-currency = multiple rows. */
export const offerPrices = pgTable(
  'offer_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'restrict' }),
    currencyId: uuid('currency_id')
      .notNull()
      .references(() => currencies.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 20, scale: 4 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('offer_prices_amount_check', sql`${t.amount} > 0`),
    uniqueIndex('offer_prices_offer_currency_unique').on(t.projectId, t.offerId, t.currencyId),
    index('idx_offer_prices_offer').on(t.projectId, t.offerId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

/** Offer contents: one row = single-item offer; N rows = bundle. */
export const offerItems = pgTable(
  'offer_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('offer_items_quantity_check', sql`${t.quantity} > 0`),
    uniqueIndex('offer_items_offer_item_unique').on(t.projectId, t.offerId, t.itemId),
    index('idx_offer_items_offer').on(t.projectId, t.offerId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();
