// SDK API key primitive per [[wallet-http-contract]] G3 (auth-surface) + slice 8.1a.
//
// Bearer-token machine-to-machine auth surface for the SDK customers (game
// servers calling /v1/wallets/.../credit and similar). Distinct from Better Auth
// (which handles human cockpit + player auth per [[backend-stack]] §6/§7). Lives
// in its own schema file because Better Auth's `auth.ts` is the auto-generated
// mirror of Better Auth's expected shape per [[backend-stack]] §6.5; api_keys is
// BokChoy-original and independent of Better Auth's lifecycle.
//
// Key format: `bk_<env>_<32-hex-chars>` — `bk_live_...` for production, `bk_test_...`
// for development (Stripe-pattern env-prefix). The first 12 chars (`bk_<env>_<8-hex>`)
// form `key_prefix` (UNIQUE, indexed for O(log n) lookup); the remaining hex is the
// secret half, HMAC-SHA-256'd into `key_hash` (never plaintext). Bearer middleware
// looks up by prefix, constant-time compares HMAC of the supplied secret.
//
// Globally-UNIQUE key_prefix (not scoped to project_id) — defense in depth: prevents
// the failure mode where a colliding prefix between projects resolves to the wrong
// tenant's key row.
//
// RLS + FORCE RLS land via the migration hand-append per [[multi-tenant-rls-research]]
// canonical pattern (drizzle-kit doesn't emit FORCE per [[drizzle-orm-research]] (1)).
// bokchoy_app GRANT SELECT/INSERT/UPDATE — DELETE intentionally omitted: revocation
// is via revoked_at column, never via row-delete (preserves audit trail).

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

// Drizzle's pg-core lacks a built-in BYTEA type. customType is the canonical
// Drizzle pattern for Postgres types not in the core surface.
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
