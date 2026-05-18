/** GET /v1/orgs/me. Thin response shaper — adminGate populated c.var['admin.org'] + ['admin.member']. */

import { trace } from '@opentelemetry/api';
import type { Context, Hono } from 'hono';
import { type AdminContext, adminGate } from '../admin';
import type { ApiKeyContext } from '../auth';
import type { IdempotencyContext } from '../idempotency';

const tracer = trace.getTracer('@bokchoy/orgs');

// Superset of AppContext — Hono generic invariance forces the parent app's exact union on `mount`.
type OrgsAppContext = ApiKeyContext & IdempotencyContext & AdminContext;

async function getOrgMeHandler(c: Context<AdminContext, '/v1/orgs/me'>) {
  const org = c.var['admin.org'];
  const member = c.var['admin.member'];

  return tracer.startActiveSpan(
    'orgs.get_me',
    {
      attributes: {
        'bokchoy.organization_id': org.id,
        'bokchoy.user_id': member.userId,
        'bokchoy.role': member.role,
      },
    },
    (span) => {
      try {
        return c.json(
          {
            id: org.id,
            name: org.name,
            slug: org.slug,
            createdAt: org.createdAt,
            member: {
              id: member.id,
              userId: member.userId,
              role: member.role,
              createdAt: member.createdAt,
            },
          },
          200,
        );
      } finally {
        span.end();
      }
    },
  );
}

export function mountOrgsRoutes(app: Hono<OrgsAppContext>): void {
  app.get('/v1/orgs/me', adminGate({ resource: 'org', actions: ['read'] }), getOrgMeHandler);
}
