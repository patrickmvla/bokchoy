/** SDK Bearer-token table. Key format `bk_<env>_<32hex>`; key_prefix UNIQUE globally (defense vs cross-tenant collision). */

import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { projects, TENANT_GUC } from './tenancy';

// pg-core lacks bytea — customType is Drizzle's canonical fill-in.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: bytea('key_hash').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('api_keys_key_prefix_unique').on(t.keyPrefix),
    index('idx_api_keys_project').on(t.projectId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'bokchoy_app',
      using: sql`${t.projectId} = ${TENANT_GUC}`,
    }),
  ],
).enableRLS();
