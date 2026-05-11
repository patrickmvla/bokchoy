#!/usr/bin/env bun
// Auth roles consistency check per [[admin-auth-surface]] *Mitigations* primary
// failure mode + cascade obligation #3.
//
// Post-migration smoke that queries `SELECT DISTINCT role FROM member` and
// asserts every value is in the allowed-role registry. Catches the "member.role
// references a role string that doesn't exist in createAuth's roles config"
// failure mode — silent 403 lockout when role string drifts from config.
//
// Allowed roles at MVP =
//   Better Auth defaults: ['member', 'owner']
//   BokChoy-defined:      Object.keys(roles) from @bokchoy/auth-config
//                         (currently ['admin'] per [[admin-auth-surface]] D5)
//
// Run in deploy pipeline AFTER migrations apply (not before — the table must
// exist). Failure aborts deploy.
//
// Cross-runtime: postgres-js client per cross-runtime discipline; no Bun-specific
// imports.

import { roles } from '@bokchoy/auth-config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

// Per [[backend-stack]] cascade-10: prepare: false for Supavisor.
const sql = postgres(url, { prepare: false });

const BETTER_AUTH_DEFAULTS = ['member', 'owner'] as const;
const ALLOWED_ROLES = new Set<string>([...BETTER_AUTH_DEFAULTS, ...Object.keys(roles)]);

try {
  type Row = { role: string };
  const rows = await sql<Row[]>`SELECT DISTINCT role FROM "member"`;
  const distinctRoles = rows.map((r) => r.role);

  console.log(`Distinct member.role values in DB: ${JSON.stringify(distinctRoles)}`);
  console.log(`Allowed roles                   : ${JSON.stringify([...ALLOWED_ROLES])}`);

  const unknown = distinctRoles.filter((r) => !ALLOWED_ROLES.has(r));
  if (unknown.length > 0) {
    console.error(
      `\nFAIL: member rows reference role(s) not in createAuth roles config: ${JSON.stringify(unknown)}`,
    );
    console.error(
      'Fix: either add the role to packages/auth-config/src/index.ts roles export, or update the member rows.',
    );
    console.error('Ref: [[admin-auth-surface]] *Mitigations* primary failure mode.');
    process.exit(1);
  }

  console.log('\nOK: all member.role values are registered.');
} finally {
  await sql.end();
}
