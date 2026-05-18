/** Tenancy primitives — projects (tenant root) + players. Per [[wallet-mechanics]] §8 RLS chain. */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organization } from './auth';

// Unset GUC raises via one-arg current_setting — surfaces missing-context bugs loud, not silent.
const TENANT_GUC = sql`current_setting('app.current_tenant')::uuid`;

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    isChildDirected: boolean('is_child_directed').notNull().default(false),
    status: text('status').notNull().default('active'),
    settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('projects_status_check', sql`${t.status} IN ('active', 'paused', 'archived')`),
    uniqueIndex('projects_organization_id_slug_unique').on(t.organizationId, t.slug),
    index('idx_projects_organization').on(t.organizationId),
  ],
);

/** Minimal-PII per [[player-auth]] §2: email/password nullable (guest play default). external_id regex matches DB CHECK. */
export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    externalId: text('external_id'),
    email: text('email'),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    locale: text('locale'),
    under13: boolean('under_13'),
  },
  (t) => [
    check(
      'players_external_id_check',
      sql`${t.externalId} IS NULL OR ${t.externalId} ~ '^[A-Za-z0-9._-]{1,128}$'`,
    ),
    uniqueIndex('players_project_id_email_unique')
      .on(t.projectId, t.email)
      .where(sql`${t.email} IS NOT NULL`),
    uniqueIndex('players_project_id_external_id_unique')
      .on(t.projectId, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    index('idx_players_project').on(t.projectId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

export { TENANT_GUC };
