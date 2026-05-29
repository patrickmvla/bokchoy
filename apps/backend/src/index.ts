/** @module Backend HTTP entry point. */

// Side-effect import — must stay first so the OTel SDK registers before any other module emits a span.
import './telemetry';

import { withTenant } from '@bokchoy/db';
import { serve } from '@hono/node-server';
import { httpInstrumentationMiddleware } from '@hono/otel';
import { trace } from '@opentelemetry/api';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AdminContext } from './admin';
import { type ApiKeyContext, apiKeyMiddleware } from './auth';
import { mountCatalogRoutes } from './catalog';
import { mountCurrenciesRoutes } from './currencies';
import { type IdempotencyContext, idempotencyMiddleware } from './idempotency';
import { auth, db, errorMiddleware } from './infra';
import { mountInventoryRoutes } from './inventory';
import { mountOrgsRoutes } from './orgs';
import { mountProjectsRoutes } from './projects';
import { mountShopRoutes } from './shop';
import { SERVICE_NAME, SERVICE_VERSION } from './telemetry';
import { mountWalletRoutes } from './wallet';

type AppContext = ApiKeyContext & IdempotencyContext & AdminContext;

const app = new Hono<AppContext>();

app.use(
  httpInstrumentationMiddleware({
    serviceName: SERVICE_NAME,
    serviceVersion: SERVICE_VERSION,
    captureRequestHeaders: ['user-agent', 'idempotency-key'],
  }),
);

app.get('/health', (c) => c.json({ ok: true }));

app.get('/v1/health-authed', apiKeyMiddleware, async (c) => {
  const projectId = c.get('projectId');
  const apiKeyId = c.get('apiKeyId');
  await withTenant(db, projectId, async (tx) => {
    await tx.execute(sql`SELECT 1`);
  });
  return c.json({ ok: true, projectId, apiKeyId });
});

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

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

mountOrgsRoutes(app);
mountProjectsRoutes(app);
mountCurrenciesRoutes(app);
mountWalletRoutes(app);
mountInventoryRoutes(app);
mountShopRoutes(app);
mountCatalogRoutes(app);

app.onError(errorMiddleware);

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`@bokchoy/backend listening on http://localhost:${info.port}`);
});
