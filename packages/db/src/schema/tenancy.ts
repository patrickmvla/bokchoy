// Tenancy primitives.
//
// Per [[tenancy-ids-research]] F6 (projects baseline) and [[player-auth]] §2 (players).
// projects is the FK target referenced by current_setting('app.current_tenant')::UUID
// in every multi-tenant RLS policy per [[wallet-mechanics]] §8 +
// [[multi-tenant-rls-research]].
//
// Column names are snake_case in Postgres / camelCase in JS (Drizzle convention).
//
// RLS policies + FORCE ROW LEVEL SECURITY land in a separate migration per
// [[wallet-mechanics]] §8.

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

// Canonical tenant-isolation predicate per [[wallet-mechanics]] §8 +
// [[multi-tenant-rls-research]]. The GUC is set per-transaction by withTenant().
// Unset GUC raises (one-arg form of current_setting) — surfaces missing-context
// bugs immediately instead of silently denying or allowing.
const TENANT_GUC = sql`current_setting('app.current_tenant')::uuid`;

// Tenancy root. Better Auth's `advanced.database.generateId: "uuid"` is REQUIRED
// in the auth-config (set per [[tenancy-ids-research]] F1) so organization.id is
// uuid-typed; this FK lines up at the type level.
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

// Per-project, RLS-protected. Minimal-PII per [[player-auth]] §2: email/password
// are nullable because guest play is the default flow.
export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    email: text('email'),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    locale: text('locale'),
    under13: boolean('under_13'),
  },
  (t) => [
    uniqueIndex('players_project_id_email_unique')
      .on(t.projectId, t.email)
      .where(sql`${t.email} IS NOT NULL`),
    index('idx_players_project').on(t.projectId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();

// Re-export the GUC SQL helper so wallet.ts (and future protected schemas)
// share one definition rather than restating the cast.
export { TENANT_GUC };
