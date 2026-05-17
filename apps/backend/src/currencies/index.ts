// Currencies module per [[backend-service-shape]] §2 + [[marketing/v1-shape]]
// Cascade obligation #2 (M-1 contract, amended 2026-05-14). One SDK-facing
// endpoint:
//
//   GET /v1/currencies — list currencies for the API key's project
//
// Behind apiKeyMiddleware (NOT adminGate — SDK consumer, not cockpit-admin
// session). c.var.projectId is set by the middleware from the validated
// Bearer token. Powers the @bokchoy/sdk-node slug-resolution layer per
// [[marketing/v1-shape]] (iii) + [[marketing/currencies-endpoint-research]].
//
// Wire shape per [[cockpit/admin-list-endpoints-contract]] (R2): bare-data
// success + Stripe-wrapped errors. Field naming per
// [[marketing/currencies-endpoint-research]] F1 — game-economy SDK class
// converges on `code` (LootLocker / PlayFab "FriendlyId" / RevenueCat /
// AccelByte; 4 production cites, 0 cites for `slug`). Field set per F4
// audience-scale-matched minimal pattern (RevenueCat + LootLocker SMB scale);
// decimals / isPremium / isTradable / description / updatedAt deferred to
// backward-compat field-additive amendments when justified.
//
// RLS: the currencies table is FORCE-RLS with policy
//   USING (project_id = TENANT_GUC)
// per packages/db/src/schema/wallet.ts:82. SELECT MUST run inside
// withTenant(db, projectId, ...). The explicit WHERE matches the api_keys
// read pattern in projects/getProjectHandler — defense-in-depth: if the
// GUC fails to bind for any reason, the WHERE clause still scopes the
// query to this project instead of falling back to whatever the policy
// evaluates against.

import { currencies, withTenant } from '@bokchoy/db';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { desc, eq } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import type { AdminContext } from '../admin';
import { type ApiKeyContext, apiKeyMiddleware } from '../auth';
import type { IdempotencyContext } from '../idempotency';
import { db } from '../infra';

const tracer = trace.getTracer('@bokchoy/currencies');

// Match the parent app's AppContext union per apps/backend/src/index.ts:53.
// Hono generic invariance — mount function signature must accept the parent
// app's exact union, not a subset. Same pattern as ProjectsAppContext in
// apps/backend/src/projects/index.ts:127.
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

  // Bare array per [[cockpit/admin-list-endpoints-contract]] (R2)
  // bare-success-Stripe-wrapped-errors. Empty project returns [] per
  // [[marketing/v1-shape]] Cascade obligation #2 (empty-list semantics) —
  // first-run-journey step 6 seeds `'gems'` + `'coins'` on project creation,
  // so empty list should only occur if the customer explicitly deletes the
  // seeded defaults.
  return c.json(rows, 200);
}

export function mountCurrenciesRoutes(app: Hono<CurrenciesAppContext>): void {
  app.get('/v1/currencies', apiKeyMiddleware, listCurrenciesHandler);
}
