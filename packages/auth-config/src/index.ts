/** Better Auth factory. Static AC + role registry + trusted origins. Per [[admin-auth-surface]] D3+D5. */

import type { Db } from '@bokchoy/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous, bearer, organization } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements as bauthStatements } from 'better-auth/plugins/organization/access';

export const statements = {
  ...bauthStatements,
  reasonCode: ['bootstrap'],
  player: ['deidentify'],
  project: ['create', 'read'],
  apiKey: ['create', 'revoke'],
  org: ['read'],
  currency: ['read', 'create', 'update', 'delete'],
  item: ['read', 'create', 'update', 'delete'],
  offer: ['read', 'create', 'update', 'delete'],
} as const;

export const ac = createAccessControl(statements);

const adminRole = ac.newRole({
  organization: ['update'],
  invitation: ['create', 'cancel'],
  member: ['create', 'update', 'delete'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
  reasonCode: ['bootstrap'],
  player: ['deidentify'],
  project: ['create', 'read'],
  apiKey: ['create', 'revoke'],
  org: ['read'],
  currency: ['read', 'create', 'update', 'delete'],
  item: ['read', 'create', 'update', 'delete'],
  offer: ['read', 'create', 'update', 'delete'],
});

const ownerRole = ac.newRole({
  organization: ['update', 'delete'],
  invitation: ['create', 'cancel'],
  member: ['create', 'update', 'delete'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
  reasonCode: ['bootstrap'],
  player: ['deidentify'],
  project: ['create', 'read'],
  apiKey: ['create', 'revoke'],
  org: ['read'],
  currency: ['read', 'create', 'update', 'delete'],
  item: ['read', 'create', 'update', 'delete'],
  offer: ['read', 'create', 'update', 'delete'],
});

const memberRole = ac.newRole({
  ac: ['read'],
});

/** Role registry — scripts/check-auth-roles.ts asserts every production `member.role` is a key here. */
export const roles = {
  admin: adminRole,
  owner: ownerRole,
  member: memberRole,
} as const;

export type RoleName = keyof typeof roles;

export const trustedOrigins = [
  'https://bokchoy.com',
  'https://www.bokchoy.com',
  'http://localhost:3000',
  'https://*-bokchoy.vercel.app',
] as const;

export interface CreateAuthOptions {
  /** Drizzle DB instance from @bokchoy/db. */
  db: Db;
  /** Base URL of the backend. */
  baseURL: string;
  /** Trusted origins for CSRF. */
  trustedOrigins?: string[];
}

// Conditional providers: local dev without OAuth env vars must still boot cleanly.
function buildSocialProviders() {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } =
    process.env;
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    providers.google = { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET };
  }
  if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
    providers.github = { clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET };
  }
  return providers;
}

export function createAuth(opts: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(opts.db, {
      provider: 'pg',
    }),
    baseURL: opts.baseURL,
    trustedOrigins: opts.trustedOrigins ?? [...trustedOrigins],
    advanced: {
      database: {
        // Load-bearing per [[tenancy-ids-research]] F1 — must match `uuid` Postgres column type for the RLS GUC chain.
        generateId: 'uuid',
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: buildSocialProviders(),
    plugins: [anonymous(), organization({ ac, roles }), bearer()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
