/** SDK-facing currencies list. Per [[marketing/v1-shape]] Cascade #2. */

import { currencies, withTenant } from '@bokchoy/db';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { desc, eq } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import type { AdminContext } from '../admin';
import { type ApiKeyContext, apiKeyMiddleware } from '../auth';
import type { IdempotencyContext } from '../idempotency';
import { db } from '../infra';

const tracer = trace.getTracer('@bokchoy/currencies');

// Superset of AppContext — Hono generic invariance forces the parent app's exact union on `mount`.
type CurrenciesAppContext = ApiKeyContext & IdempotencyContext & AdminContext;

async function listCurrenciesHandler(c: Context<ApiKeyContext, '/v1/currencies'>) {
  const projectId = c.get('projectId');

  const rows = await tracer.startActiveSpan(
    'currencies.list',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'currencies_list',
        'bokchoy.project_id': projectId,
      },
    },
    async (span) => {
      try {
        const result = await withTenant(db, projectId, async (tx) => {
          return await tx
            .select({
              id: currencies.id,
              code: currencies.code,
              displayName: currencies.displayName,
              createdAt: currencies.createdAt,
            })
            .from(currencies)
            .where(eq(currencies.projectId, projectId))
            .orderBy(desc(currencies.createdAt));
        });
        span.setAttribute('bokchoy.currency_count', result.length);
        return result;
      } catch (err) {
        if (err instanceof Error) {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        }
        throw err;
      } finally {
        span.end();
      }
    },
  );

  return c.json(rows, 200);
}

export function mountCurrenciesRoutes(app: Hono<CurrenciesAppContext>): void {
  app.get('/v1/currencies', apiKeyMiddleware, listCurrenciesHandler);
}
