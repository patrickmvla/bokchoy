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
import { createAccessControl } from 'better-auth/plugins/access';

// ---- Static access control per [[admin-auth-surface]] D3 + D5 ----
//
// Statements + roles declared at module load; immutable per deploy. Dynamic AC
// + organizationRole table deferred to RBAC-plugin slice post-MVP per
// [[backend-stack]] §7 line 117.
//
// Statement schema covers MVP admin endpoints named in [[wallet-http-contract]]
// G6 + line 207:
//   - reasonCode:bootstrap → bootstrapProjectReasonCodes (slice 8.2)
//   - player:deidentify    → walletDeidentifyPlayer (slice 8.2 / DSR flow)
//
// Each new admin endpoint extends this object + the adminRole permission map.
// Per [[admin-auth-surface]] D5, the extension shape is two `as const` literal
// edits per endpoint — no schema migration, no role rename.

export const statements = {
  reasonCode: ['bootstrap'],
  player: ['deidentify'],
} as const;

export const ac = createAccessControl(statements);

// MVP role set per [[admin-auth-surface]] D5: single "admin" role grants every
// MVP admin permission. `owner` and `member` inherit Better Auth defaults
// (owner = full org control; member = no BokChoy-admin permissions, only the
// default ac:read per Better Auth access/statement.ts:34).
//
// Revisit per [[admin-auth-surface]] *Revisit when* row 2: multi-role split
// triggers if ≥3 admin endpoints emerge with disjoint scopes AND customer
// signal arrives that the same human shouldn't hold all three. No current
// trigger.
const adminRole = ac.newRole({
  reasonCode: ['bootstrap'],
  player: ['deidentify'],
});

/**
 * Role registry exported for CI lint at `scripts/check-auth-roles.ts` —
 * post-migration smoke asserts every `member.role` value in production is a
 * key here. Per [[admin-auth-surface]] *Mitigations* primary failure mode.
 */
export const roles = {
  admin: adminRole,
} as const;

export type RoleName = keyof typeof roles;

// ---- Auth instance factory ----

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
    plugins: [
      anonymous(),
      // Static AC wiring per [[admin-auth-surface]] D3 + D5.
      organization({ ac, roles }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
