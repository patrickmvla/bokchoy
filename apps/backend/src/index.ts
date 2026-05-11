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
// Slice 8.1b — adds OTel SDK bootstrap (./telemetry import is FIRST so the SDK
// initializes before any other module loads spans), @hono/otel HTTP middleware
// (Hono request-lifecycle spans), and Idempotency-Key middleware (per
// [[idempotency-strategy]] D2-α; first non-test/non-script INSERT INTO
// idempotency_keys reopens [[reaper-schedule-deferral]] trigger).
//
// EXPLICITLY OUT OF THIS SLICE (each lands when its consumer arrives):
//   • Better Auth wiring via @bokchoy/auth-config — no auth routes yet.
//   • Outbox poller co-hosted loop per [[backend-service-shape]] §4 — no jobs
//     to process; would be dead infrastructure today.
//   • Wallet handlers + error middleware (slice 8.1c).
//   • SIGTERM graceful-shutdown handler beyond OTel SDK shutdown (telemetry.ts).

// Side-effect import: starts the OTel SDK before any other module loads. Must
// stay first so tracer providers are registered before any span emission.
import './telemetry';

import { withTenant } from '@bokchoy/db';
import { serve } from '@hono/node-server';
import { httpInstrumentationMiddleware } from '@hono/otel';
import { trace } from '@opentelemetry/api';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { type ApiKeyContext, apiKeyMiddleware } from './auth';
import { type IdempotencyContext, idempotencyMiddleware } from './idempotency';
import { db } from './infra';
import { SERVICE_NAME, SERVICE_VERSION } from './telemetry';

type AppContext = ApiKeyContext & IdempotencyContext;

const app = new Hono<AppContext>();

// Per [[wallet-http-contract]] G7: @hono/otel httpInstrumentationMiddleware
// captures HTTP method/URL/route/status as the outermost middleware. Bun
// shimmer-patching is broken (per [[otel-stack-research]] F1) so this middleware
// is the only HTTP-level instrumentation; manual tracer.startActiveSpan inside
// wrappers handles SQL-level spans.
app.use(
  httpInstrumentationMiddleware({
    serviceName: SERVICE_NAME,
    serviceVersion: SERVICE_VERSION,
    captureRequestHeaders: ['user-agent', 'idempotency-key'],
  }),
);

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

// Slice 8.1b smoke: POST variant exercises idempotency middleware + a manual
// span composed inside the Hono span. Same end-to-end RLS chain as the GET.
app.post('/v1/health-authed', apiKeyMiddleware, idempotencyMiddleware, async (c) => {
  const projectId = c.get('projectId');
  const apiKeyId = c.get('apiKeyId');
  const idempotencyKeyId = c.get('idempotencyKeyId');

  const tracer = trace.getTracer('bokchoy-backend');
  const result = await tracer.startActiveSpan(
    'health.echo',
    {
      attributes: {
        'bokchoy.project_id': projectId,
        'bokchoy.api_key_id': apiKeyId,
      },
    },
    async (span) => {
      try {
        await withTenant(db, projectId, async (tx) => {
          await tx.execute(sql`SELECT 1`);
        });
        return { ok: true, projectId, apiKeyId, idempotencyKeyId } as const;
      } finally {
        span.end();
      }
    },
  );

  return c.json(result);
});

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@bokchoy/backend listening on http://localhost:${info.port}`);
});
