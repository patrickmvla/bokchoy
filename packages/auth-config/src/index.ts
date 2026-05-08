// Better Auth instance factory.
//
// Per [[tenancy-ids-research]] F1: `advanced.database.generateId: "uuid"` is
// REQUIRED. Without it Better Auth generates 32-char alphanumeric TEXT IDs
// that don't match the `uuid` Postgres column type from
// packages/db/src/schema/auth.ts and the RLS GUC chain
// (current_setting('app.current_tenant')::UUID) breaks at the first cast.
//
// Per [[backend-stack]]: anonymous plugin maps [[player-auth]] (γ) guest;
// organization plugin implements customer-as-org per Stripe pattern.
//
// Per [[backend-service-shape]]: this package exports a factory; the runtime
// app (apps/backend) instantiates with its own Db.

import type { Db } from '@bokchoy/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous, organization } from 'better-auth/plugins';

export interface CreateAuthOptions {
  /** Drizzle DB instance from @bokchoy/db. */
  db: Db;
  /** Base URL of the backend. e.g. http://localhost:3000 */
  baseURL: string;
  /** Trusted origins for CSRF. */
  trustedOrigins?: string[];
}

export function createAuth(opts: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(opts.db, {
      provider: 'pg',
      // Drizzle adapter autodiscovers tables from the Db typeparam.
    }),
    baseURL: opts.baseURL,
    trustedOrigins: opts.trustedOrigins,
    advanced: {
      database: {
        // Load-bearing per [[tenancy-ids-research]] F1.
        generateId: 'uuid',
      },
    },
    emailAndPassword: {
      enabled: true,
      // Customer-developer accounts; Better Auth uses scrypt by default.
      // [[player-auth]] §2's argon2id mandate applies to the player-side
      // flow in a different module, not this customer-developer flow.
    },
    plugins: [anonymous(), organization()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
