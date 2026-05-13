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
import { anonymous, bearer, organization } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements as bauthStatements } from 'better-auth/plugins/organization/access';

// ---- Static access control per [[admin-auth-surface]] D3 + D5 ----
//
// Statements + roles declared at module load; immutable per deploy. Dynamic AC
// + organizationRole table deferred to RBAC-plugin slice post-MVP per
// [[backend-stack]] §7 line 117.
//
// Statement schema = Better Auth's default org-plugin statements (organization
// / member / invitation / team / ac) MERGED with BokChoy custom resources:
//   - reasonCode:bootstrap → bootstrapProjectReasonCodes (slice 8.2.1)
//   - player:deidentify    → walletDeidentifyPlayer (slice 8.2 / DSR flow)
//   - project:create+read  → POST /v1/projects + GET /v1/projects per
//                            [[admin-list-endpoints-contract]] slice 8.3+8.4
//   - apiKey:create+revoke → POST /v1/projects/{id}/api-keys + DELETE same
//                            per [[admin-list-endpoints-contract]] slice 8.4
//   - org:read             → GET /v1/orgs/me per [[admin-list-endpoints-contract]]
//                            slice 8.3
//
// Hand-roll all three roles (admin / owner / member) ground-up rather than
// spreading Better Auth's defaultRoles + overriding admin/owner — the default
// role objects are keyed against `defaultAc` (only Better Auth statements);
// our extended `ac` has BokChoy statements too, and hand-rolling keeps each
// role's permission set fully under BokChoy's control + visible in one place.
//
// Owner-inherits-admin per [[admin-auth-surface]] *Mitigations* row 4 (a)
// resolution 2026-05-11: org owner = customer-developer's primary account =
// holds all admin permissions PLUS Better Auth's org-delete privilege.

export const statements = {
  ...bauthStatements,
  reasonCode: ['bootstrap'],
  player: ['deidentify'],
  project: ['create', 'read'],
  apiKey: ['create', 'revoke'],
  org: ['read'],
} as const;

export const ac = createAccessControl(statements);

// admin = Better Auth admin defaults + BokChoy custom permissions. Per Better
// Auth `access/statement.ts:13-19`, default admin gets organization update
// (NOT delete), invitation create+cancel, member CRUD, team CRUD, ac CRUD.
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
});

// owner = admin permissions + organization delete. Per Better Auth
// `access/statement.ts:21-27` owner default; extended with BokChoy customs per
// [[admin-auth-surface]] *Mitigations* row 4 (a).
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
});

// member = Better Auth member default. Read-only on AC config (so members can
// view roles their org has) per `access/statement.ts:29-35`. No BokChoy
// custom permissions; bootstrap and deidentify fail BC405 for plain members.
const memberRole = ac.newRole({
  ac: ['read'],
});

/**
 * Role registry exported for CI lint at `scripts/check-auth-roles.ts` —
 * post-migration smoke asserts every `member.role` value in production is a
 * key here. Per [[admin-auth-surface]] *Mitigations* primary failure mode.
 */
export const roles = {
  admin: adminRole,
  owner: ownerRole,
  member: memberRole,
} as const;

export type RoleName = keyof typeof roles;

// ---- Trusted origins per [[auth-surface-mount]] (T-multi) ----
//
// Hardcoded module-level constant per inline /design decision 2026-05-11 —
// matches the D3 static-AC pattern (statements + roles + trustedOrigins all
// declared at module load; immutable per deploy). createAuth() callers may
// still pass `opts.trustedOrigins` to override for tests / preview-deploy
// scenarios; default is this list.
//
// Wildcard subdomain support per Better Auth Source 4 demo
// (`https://*.better-auth.com`). Vercel preview deploys follow
// `{project}-git-{branch}-{team}.vercel.app` naming → `*-bokchoy.vercel.app`
// covers them. Local dev includes the default Next.js port.

export const trustedOrigins = [
  'https://bokchoy.com',
  'https://www.bokchoy.com',
  'http://localhost:3000',
  'https://*-bokchoy.vercel.app',
] as const;

// ---- Auth instance factory ----

export interface CreateAuthOptions {
  /** Drizzle DB instance from @bokchoy/db. */
  db: Db;
  /** Base URL of the backend. e.g. http://localhost:3000 */
  baseURL: string;
  /** Trusted origins for CSRF. */
  trustedOrigins?: string[];
}

// Build socialProviders config conditionally — register google/github only
// when their credentials are set in env per [[cockpit/auth-surface-mount]] (P).
// Local dev without OAuth keys still boots cleanly; production with full env
// gets both providers. Strict literal "always register both" from the (P)
// code snippet would crash dev when env vars are unset; the contract's intent
// is env-driven configuration, so this conditional shape preserves the
// contract while making local dev workable. Operator sees a clear empty
// socialProviders block (or a partial one) reflecting current env state.
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
      // Drizzle adapter autodiscovers tables from the Db typeparam.
    }),
    baseURL: opts.baseURL,
    trustedOrigins: opts.trustedOrigins ?? [...trustedOrigins],
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
    socialProviders: buildSocialProviders(),
    plugins: [
      anonymous(),
      // Static AC wiring per [[admin-auth-surface]] D3 + D5.
      organization({ ac, roles }),
      // Bearer transport for scripted/non-browser admin tools (CLI, smoke tests,
      // server-to-server). Cookie transport remains the default for cockpit
      // browser flow. Per [[admin-auth-surface]] D1 — the gate doesn't pin a
      // transport, just "validate session"; bearer extends the accepted
      // session sources without changing gate logic.
      bearer(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
