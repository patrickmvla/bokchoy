// HTTP server entry point per [[backend-stack]] (Bun + Hono locked) and
// [[backend-service-shape]] §2 (modular monolith — module folders below).
//
// Cross-runtime discipline per [[backend-service-shape]] line 27: import from
// @hono/* not bun:*. @hono/node-server runs on both Bun (Node-compat) and Node
// 22+. Per [[backend-stack]] Amendment 2026-05-03 line 22: Hono's serve adapter,
// NOT Bun.serve.
//
// EXPLICITLY OUT OF THIS SLICE (each lands when its consumer arrives):
//   • Drizzle DB connection + withTenant wiring (src/infra/) — no RLS-protected
//     handlers yet.
//   • Better Auth wiring via @bokchoy/auth-config — no auth routes yet.
//   • Outbox poller co-hosted loop per [[backend-service-shape]] §4 — no jobs
//     to process; would be dead infrastructure today.
//   • Error middleware, structured logging, OTel spans per [[wallet-mechanics]]
//     Amendment Part 1 A3 — no traffic yet.
//   • SIGTERM graceful-shutdown handler — no in-flight requests to drain pre-
//     deployment.

import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@bokchoy/backend listening on http://localhost:${info.port}`);
});
