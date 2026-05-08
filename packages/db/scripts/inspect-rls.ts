#!/usr/bin/env bun
//
// Introspect RLS state on the protected tables. Lists ENABLE/FORCE flags +
// policy expressions per table. Useful to verify a fresh migration applied.

import postgres from 'postgres';

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) throw new Error('DATABASE_MIGRATION_URL must be set');

const sql = postgres(url, { prepare: false, onnotice: () => {} });

const tables = await sql<{ tablename: string; rowsecurity: boolean; forcerowsecurity: boolean }[]>`
  SELECT relname AS tablename,
         relrowsecurity AS rowsecurity,
         relforcerowsecurity AS forcerowsecurity
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relkind = 'r'
    AND relname IN ('players', 'currencies', 'wallets', 'reason_codes',
                    'idempotency_keys', 'transactions', 'loot_rolls',
                    'iap_receipts', 'staged_jobs')
  ORDER BY relname
`;

console.log('table              | rls_enabled | force_rls');
console.log('-------------------|-------------|----------');
for (const t of tables) {
  console.log(
    `${t.tablename.padEnd(18)} | ${String(t.rowsecurity).padEnd(11)} | ${t.forcerowsecurity}`,
  );
}

const policies = await sql<
  { tablename: string; policyname: string; roles: string[]; cmd: string; qual: string }[]
>`
  SELECT tablename, policyname, roles::text[] AS roles, cmd, qual
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename
`;

console.log('\npolicies:');
for (const p of policies) {
  console.log(
    `  ${p.tablename}.${p.policyname}: cmd=${p.cmd} roles=${p.roles.join(',')} using=${p.qual}`,
  );
}

await sql.end();
