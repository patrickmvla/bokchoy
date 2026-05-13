// Orgs module per [[backend-service-shape]] §2 + [[cockpit/admin-list-endpoints-contract]].
// Single endpoint at slice 8.3:
//
//   GET /v1/orgs/me — active organization + member context for the
//                     authenticated user
//
// adminGate already resolved + set c.var['admin.org'] and c.var['admin.member']
// during the 5-step gate chain (Step 4b for org, Step 4 for member). The
// handler is a thin response shaper — no extra DB hit needed, the rows are
// in request-local context.
//
// Future org endpoints (settings update, invitation list, member CRUD UI,
// etc.) land in this module as siblings to getOrgMeHandler.

import { trace } from '@opentelemetry/api';
import type { Context, Hono } from 'hono';
import { type AdminContext, adminGate } from '../admin';
import type { ApiKeyContext } from '../auth';
import type { IdempotencyContext } from '../idempotency';

const tracer = trace.getTracer('@bokchoy/orgs');

// Match apps/backend/src/index.ts AppContext shape (superset of what the
// orgs routes actually need). Hono generic invariance — mount function
// signature must accept the parent app's exact union, not a subset.
// ApiKeyContext + IdempotencyContext are unused by this handler but
// included for the type match. Same pattern as mountProjectsRoutes +
// mountWalletRoutes.
type OrgsAppContext = ApiKeyContext & IdempotencyContext & AdminContext;

// Response shape per [[cockpit/admin-list-endpoints-contract]] GET /v1/orgs/me.
// Bare data per (R2). Excludes the org's `logo` / `metadata` / `updatedAt`
// fields — the contract names only id/name/slug/createdAt + nested member.
// Cockpit chrome consumes name + slug + role; logo + metadata are out of
// MVP scope (no settings UI yet).
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
  app.get(
    '/v1/orgs/me',
    adminGate({ resource: 'org', actions: ['read'] }),
    getOrgMeHandler,
  );
}
