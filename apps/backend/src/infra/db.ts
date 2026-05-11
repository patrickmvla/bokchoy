// DB client singleton for apps/backend per [[backend-stack]] cascade obligation
// #1 + [[wallet-http-contract]] slice 8.1a prerequisite. Wired here when the
// first RLS-protected handler arrives (per slice 8.0's deferred-until-consumer
// discipline).
//
// Single client per process — Hono request handlers import `db` directly.
// Test isolation via dependency-injection refactor is deferred until a slice
// requires it; current pattern matches Cal.com + Better Auth ecosystem.
//
// Cross-runtime discipline per [[backend-stack]] line 24-27: postgres-js (not
// `Bun.sql`); `prepare: false` mandate per cascade-10 (Supavisor transaction
// mode incompat).

import { createDbClient } from '@bokchoy/db';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set');
}

const { client, db } = createDbClient(url);

export { client, db };
