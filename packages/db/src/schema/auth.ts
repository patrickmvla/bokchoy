// Better Auth schema, hand-translated for Drizzle.
// Per [[backend-stack]] cascade: drizzle-kit migrate ONLY; Better Auth's
// getMigrations doesn't support the Drizzle adapter.
// Per [[tenancy-ids-research]] F1: advanced.database.generateId: "uuid"
// MUST be set in the Better Auth config; otherwise the runtime UUIDs that
// Better Auth generates will not match the uuid column type below and the
// RLS GUC chain (current_setting('app.current_tenant')::UUID) breaks at the
// first cast.
//
// Source-walked from better-auth/better-auth@6b03a45a:
//   packages/core/src/db/get-tables.ts (user, session, account, verification)
//   packages/better-auth/src/plugins/organization/schema.ts (organization, member, invitation)
//   packages/better-auth/src/plugins/anonymous/schema.ts (user.isAnonymous)
//
// Column names are camelCase to match Better Auth's runtime field-name
// convention. Better Auth's drizzleAdapter issues queries by JS property
// name; Drizzle uses the same name as the Postgres column unless overridden.

import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// ---------- core auth ----------

export const user = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  // anonymous plugin field
  isAnonymous: boolean('isAnonymous').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // organization plugin field — non-FK because it can outlive the org row;
  // application code resolves on read.
  activeOrganizationId: uuid('activeOrganizationId'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', {
    withTimezone: true,
    mode: 'date',
  }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', {
    withTimezone: true,
    mode: 'date',
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

// ---------- organization plugin (minimum viable: org + member + invitation) ----------

export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }),
});

export const member = pgTable('member', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organizationId')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const invitation = pgTable('invitation', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organizationId')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }),
  inviterId: uuid('inviterId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
