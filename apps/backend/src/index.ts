// HTTP server entry point per [[backend-stack]] (Bun + Hono locked) and
// [[backend-service-shape]] §2 (modular monolith — module folders below).
//
// Cross-runtime discipline per [[backend-service-shape]] line 27: import from
// @hono/* not bun:*. @hono/node-server runs on both Bun (Node-compat) and Node
// 22+. Per [[backend-stack]] Amendment 2026-05-03 line 22: Hono's serve adapter,
// NOT Bun.serve.
//
// Slice 8.1a — wires Bearer auth middleware + /v1/health-authed smoke route per
// [[wallet-http-contract]]. DB connection lives in src/infra/db.ts (consumes
// @bokchoy/db's createDbClient with prepare:false per cascade-10).
//
// EXPLICITLY OUT OF THIS SLICE (each lands when its consumer arrives):
//   • Better Auth wiring via @bokchoy/auth-config — no auth routes yet.
//   • Outbox poller co-hosted loop per [[backend-service-shape]] §4 — no jobs
//     to process; would be dead infrastructure today.
//   • Idempotency middleware (slice 8.1b).
//   • Wallet handlers + error middleware + OTel span emission (slices 8.1b/c).
//   • SIGTERM graceful-shutdown handler — no in-flight requests to drain pre-
//     deployment.

import { withTenant } from '@bokchoy/db';
import { serve } from '@hono/node-server';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { type ApiKeyContext, apiKeyMiddleware } from './auth';
import { db } from './infra';

const app = new Hono<ApiKeyContext>();

app.get('/health', (c) => c.json({ ok: true }));

// Slice 8.1a smoke: verifies Bearer middleware + RLS GUC chain end-to-end.
// Bearer → c.get('projectId') → withTenant sets app.current_tenant → SELECT 1
// inside the tenant context → response.
app.get('/v1/health-authed', apiKeyMiddleware, async (c) => {
  const projectId = c.get('projectId');
  const apiKeyId = c.get('apiKeyId');
  await withTenant(db, projectId, async (tx) => {
    await tx.execute(sql`SELECT 1`);
  });
  return c.json({ ok: true, projectId, apiKeyId });
});

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@bokchoy/backend listening on http://localhost:${info.port}`);
});
