// Projects module per [[backend-service-shape]] §2 + [[cockpit/admin-list-endpoints-contract]]
// slice 8.4 cascade. Five cockpit-admin endpoints:
//
//   POST   /v1/projects                                      — create project (cockpit form submit)
//   POST   /v1/projects/{projectId}/api-keys                 — issue first/additional SDK api_key
//   GET    /v1/projects                                      — list projects for current org
//   GET    /v1/projects/{projectId}                          — project detail + nested apiKeys[] (A1)
//   DELETE /v1/projects/{projectId}/api-keys/{keyId}         — soft-revoke (revoked_at)
//
// Auth chain: adminGate({ resource: 'project'|'apiKey', actions, projectIdParam? })
//   1. Better Auth session resolution + org resolution + BokChoy tenancy check
//   2. Member lookup + Better Auth hasPermission against the static AC
//   3. Sets c.var['admin.member'] + c.var['admin.org']
//
// (E2) split-POST per [[cockpit/admin-list-endpoints-contract]] — project
// creation does NOT auto-issue an api_key. Cockpit makes two sequential
// requests: POST /v1/projects, then POST /v1/projects/{id}/api-keys with
// Idempotency-Key header for retry-safety on the second per
// [[idempotency-strategy]] D2-α. Walks back the (E1) bundling pick per
// [[cockpit/admin-list-endpoints-research]] F5 (production-cited × 0/3 —
// Stripe / Vercel / Resend all split parent + child creation).
//
// Idempotency-Key middleware is on the api-key creation route (where the
// race window exists), NOT on project creation (the (organization_id, slug)
// unique index provides natural dedup — retries with same slug get 409
// instead of orphan projects).
//
// RLS notes:
//   - projects table: no RLS — INSERT via plain db client. organization_id
//     bound from c.var['admin.org'].id (adminGate verified).
//   - api_keys table: FORCE RLS with policy USING (project_id = TENANT_GUC).
//     INSERT must happen inside withTenant(db, projectId, ...) so the GUC
//     matches. project_id is the just-created project's id (adminGate's
//     projectIdParam tenancy check confirmed it belongs to the org).

import { createHmac, randomBytes } from 'node:crypto';
import { apiKeys, currencies, projects, withTenant } from '@bokchoy/db';
import { type Hook, sValidator } from '@hono/standard-validator';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Context, Env, Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, adminGate } from '../admin';
import type { ApiKeyContext } from '../auth';
import { type IdempotencyContext, idempotencyMiddleware } from '../idempotency';
import { db } from '../infra';

const tracer = trace.getTracer('@bokchoy/projects');

// Translate validator failure → Stripe-wrapped error per [[wallet-http-contract]]
// G5 (X). Same shape as wallet module's hook — kept module-local to avoid a
// cross-module helper import that would couple two unrelated features.
const validationFailureHook: Hook<unknown, Env, string> = (result, c) => {
  if (!result.success) {
    const issues = result.error as readonly StandardSchemaV1.Issue[];
    const first = issues[0];
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: first?.message ?? 'Request validation failed',
          issues: issues.map((i) => ({ message: i.message, path: i.path ?? [] })),
        },
      },
      400,
    );
  }
};

// ---- Schemas ----
// Match cockpit's apps/cockpit/modules/projects/lib/create-project-schema.ts
// constraints. Diverge → cockpit validates good input that backend rejects (or
// vice versa). If this duplication bites, promote to @bokchoy/shared-types.

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createProjectBody = z.object({
  name: z.string().trim().min(1).max(64),
  slug: z.string().trim().min(1).max(64).regex(KEBAB_CASE),
});

const createApiKeyBody = z.object({
  name: z.string().trim().min(1).max(100),
});

const projectIdUrlParam = z.object({ projectId: z.uuid() });

const revokeApiKeyUrlParams = z.object({
  projectId: z.uuid(),
  keyId: z.uuid(),
});

// ---- API-key generation ----
// Mirror packages/db/scripts/create-api-key.ts canonical pattern:
//   - 16 random bytes = 32 hex chars → bk_<env>_<32hex> (40 chars total)
//   - First 12 chars (bk_<env>_<4hex>) = keyPrefix (UNIQUE indexed)
//   - HMAC-SHA256(fullKey, BOKCHOY_API_KEY_HMAC_SECRET) = keyHash (bytea)
//
// Returns the plaintext fullKey + the row's bytea/keyPrefix for INSERT. Caller
// is responsible for showing fullKey ONCE in the response and never persisting
// it. The cockpit's visible-once modal per [[cockpit/first-run-journey]] step 7
// is the only place the operator sees it.

function getHmacSecret(): string {
  const secret = process.env.BOKCHOY_API_KEY_HMAC_SECRET;
  if (!secret) {
    throw new Error('BOKCHOY_API_KEY_HMAC_SECRET is not set');
  }
  return secret;
}

function generateApiKeyMaterial(env: 'live' | 'test') {
  const randomHex = randomBytes(16).toString('hex');
  const fullKey = `bk_${env}_${randomHex}`;
  const keyPrefix = fullKey.slice(0, 12);
  const keyHash = createHmac('sha256', getHmacSecret()).update(fullKey).digest();
  return { fullKey, keyPrefix, keyHash };
}

// ---- Handlers ----

// Match apps/backend/src/index.ts AppContext shape (superset of what the
// projects routes need). Hono generic invariance — mount function signature
// must accept the parent app's exact union, not a subset. ApiKeyContext is
// unused by these handlers but included for the type match.
type ProjectsAppContext = ApiKeyContext & IdempotencyContext & AdminContext;

async function createProjectHandler(c: Context<AdminContext, '/v1/projects'>) {
  const body = c.req.valid('json' as never) as z.infer<typeof createProjectBody>;
  const organizationId = c.var['admin.org'].id;

  const project = await tracer.startActiveSpan(
    'projects.create',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'project_create',
        'bokchoy.organization_id': organizationId,
        'bokchoy.user_id': c.var['admin.member'].userId,
        'bokchoy.project_name': body.name,
        'bokchoy.project_slug': body.slug,
      },
    },
    async (span) => {
      try {
        // Slice M-2 — single transaction wraps project INSERT + seeded
        // currencies INSERT per [[marketing/v1-shape]] Mitigation #3 +
        // [[cockpit/first-run-journey]] step 6 (amendment owed). Atomicity:
        // if the currencies seed fails for any reason, the project insert
        // rolls back too — preventing the half-state (project exists, day-1
        // marketing snippet `currency: 'gems'` fails with UnknownCurrencyError).
        //
        // We DON'T compose `withTenant(db, ...)` here because that opens its
        // own transaction; nesting would create a savepoint and split the
        // atomicity guarantee. Instead the GUC SET is inlined via the same
        // `set_config(..., is_local=true)` pattern that withTenant uses at
        // packages/db/src/with-tenant.ts:26 — transaction-scoped, applies to
        // the currencies INSERT below, automatically released on commit/rollback.
        const row = await db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(projects)
            .values({
              organizationId,
              name: body.name,
              slug: body.slug,
            })
            .returning();
          if (!inserted) {
            throw new Error('projects.insert returned no row');
          }

          await tx.execute(sql`SELECT set_config('app.current_tenant', ${inserted.id}, true)`);

          // Default currency set per [[marketing/v1-shape]] hero snippet:
          // `currency: 'gems'`. Display-name title-case follows the
          // game-economy SDK convention surveyed in
          // [[marketing/currencies-endpoint-research]]. decimals + isPremium
          // + isTradable fall to schema defaults (0, false, false) —
          // customer can update via cockpit later.
          await tx.insert(currencies).values([
            { projectId: inserted.id, code: 'gems', displayName: 'Gems' },
            { projectId: inserted.id, code: 'coins', displayName: 'Coins' },
          ]);

          return inserted;
        });

        span.setAttribute('bokchoy.project_id', row.id);
        span.setAttribute('bokchoy.seeded_currency_count', 2);
        return row;
      } catch (err) {
        if (err instanceof Error) {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          // Postgres unique_violation on (organization_id, slug)
          if (
            err.message.includes('projects_organization_id_slug_unique') ||
            err.message.includes('unique constraint')
          ) {
            // 409 with Stripe-wrapped error per [[wallet-http-contract]] G5
            return null;
          }
        }
        throw err;
      } finally {
        span.end();
      }
    },
  );

  if (!project) {
    return c.json(
      {
        error: {
          code: 'PROJECT_SLUG_EXISTS',
          message: 'A project with this slug already exists in your organization.',
        },
      },
      409,
    );
  }

  return c.json({ project }, 201);
}

async function createApiKeyHandler(
  c: Context<ProjectsAppContext, '/v1/projects/:projectId/api-keys'>,
) {
  const projectId = c.req.param('projectId') as string;
  const body = c.req.valid('json' as never) as z.infer<typeof createApiKeyBody>;
  const idempotencyKeyId = c.get('idempotencyKeyId');

  const result = await tracer.startActiveSpan(
    'projects.create_api_key',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'api_key_create',
        'bokchoy.project_id': projectId,
        'bokchoy.organization_id': c.var['admin.org'].id,
        'bokchoy.user_id': c.var['admin.member'].userId,
        'bokchoy.api_key_name': body.name,
      },
    },
    async (span) => {
      try {
        // BOKCHOY_API_KEY_ENV picks 'live' vs 'test' — defaults to 'live' so
        // production never accidentally ships test-prefix keys. Local dev /
        // staging set the env var explicitly to 'test'.
        const env = process.env.BOKCHOY_API_KEY_ENV === 'test' ? 'test' : 'live';
        const { fullKey, keyPrefix, keyHash } = generateApiKeyMaterial(env);

        const record = await withTenant(db, projectId, async (tx) => {
          const [row] = await tx
            .insert(apiKeys)
            .values({
              projectId,
              keyPrefix,
              keyHash,
              name: body.name,
            })
            .returning({
              id: apiKeys.id,
              projectId: apiKeys.projectId,
              keyPrefix: apiKeys.keyPrefix,
              name: apiKeys.name,
              createdAt: apiKeys.createdAt,
            });
          if (!row) {
            throw new Error('api_keys.insert returned no row');
          }
          return row;
        });

        if (idempotencyKeyId) {
          span.setAttribute('bokchoy.idempotency_key_id', idempotencyKeyId);
        }
        span.setAttribute('bokchoy.api_key_id', record.id);

        return { apiKey: fullKey, apiKeyRecord: record };
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

  return c.json(result, 201);
}

// (A1) project detail with nested apiKeys[] per
// [[cockpit/admin-list-endpoints-contract]]. Powers [[cockpit/first-run-journey]]
// step 11 (T2) verify-key polling — cockpit refetches every ~3s while no
// api_key.lastUsedAt is observed. Single round-trip (project + keys) rather
// than two queries because production cite × 2 (Vercel + Stripe nested-array
// pattern) and round-trip cost dominates payload size at this volume.
//
// adminGate already verified: session valid, org resolved, projectId is a UUID,
// project belongs to org, user is a member, user has 'project:read'. Handler
// trusts the gate. A null `projects` row post-gate would be a TOCTOU race
// against a DELETE — projects.organization_id FK is ON DELETE RESTRICT and
// api_keys.project_id FK is ON DELETE CASCADE; the only delete path goes
// through admin tooling that doesn't exist yet at slice 8.4.
//
// RLS chain:
//   - projects select: plain `db` (no RLS on projects table per tenancy.ts).
//   - api_keys select: must run inside withTenant(db, projectId, ...) since
//     api_keys.enableRLS() + policy USING (project_id = TENANT_GUC) for the
//     bokchoy_app role. Unset GUC raises; wrong-tenant GUC filters to zero
//     rows.
//
// Response wire-shape: bare data per (R2) + matches listProjectsHandler. Field
// name `keyPrefix` matches Drizzle schema (api-keys.ts) + matches the existing
// createApiKeyHandler response. Contract spec says `prefix`; codebase shipped
// `keyPrefix` first. Amendment to [[cockpit/admin-list-endpoints-contract]]
// owed on the next /design pass.
async function getProjectHandler(c: Context<AdminContext, '/v1/projects/:projectId'>) {
  const projectId = c.req.param('projectId') as string;
  const organizationId = c.var['admin.org'].id;

  const result = await tracer.startActiveSpan(
    'projects.get',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'project_get',
        'bokchoy.project_id': projectId,
        'bokchoy.organization_id': organizationId,
        'bokchoy.user_id': c.var['admin.member'].userId,
      },
    },
    async (span) => {
      try {
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        if (!project) {
          throw new Error(`projects.get: row missing post-gate for id ${projectId}`);
        }

        const apiKeyRows = await withTenant(db, projectId, async (tx) => {
          return await tx
            .select({
              id: apiKeys.id,
              projectId: apiKeys.projectId,
              keyPrefix: apiKeys.keyPrefix,
              name: apiKeys.name,
              createdAt: apiKeys.createdAt,
              lastUsedAt: apiKeys.lastUsedAt,
              revokedAt: apiKeys.revokedAt,
            })
            .from(apiKeys)
            .where(eq(apiKeys.projectId, projectId))
            .orderBy(desc(apiKeys.createdAt));
        });

        span.setAttribute('bokchoy.api_key_count', apiKeyRows.length);
        return { ...project, apiKeys: apiKeyRows };
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

  return c.json(result, 200);
}

async function listProjectsHandler(c: Context<AdminContext, '/v1/projects'>) {
  const organizationId = c.var['admin.org'].id;

  const rows = await tracer.startActiveSpan(
    'projects.list',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'projects_list',
        'bokchoy.organization_id': organizationId,
        'bokchoy.user_id': c.var['admin.member'].userId,
      },
    },
    async (span) => {
      try {
        const result = await db
          .select()
          .from(projects)
          .where(eq(projects.organizationId, organizationId))
          .orderBy(desc(projects.createdAt));
        span.setAttribute('bokchoy.project_count', result.length);
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
  // bare-success-Stripe-wrapped-errors at MVP scope. Cursor-pagination via
  // Stripe envelope adopted when (Pa-none) revisit-when fires.
  return c.json(rows, 200);
}

// Soft-revoke per [[cockpit/admin-list-endpoints-contract]] DELETE
// /v1/projects/{projectId}/api-keys/{keyId}. revoked_at column on api_keys is
// the canonical sentinel — slice 8.1a's apiKeyMiddleware already filters
// `revoked_at IS NOT NULL` at lookup, so a successful revoke immediately
// invalidates the key for SDK calls (no cache to bust).
//
// Disambiguation: a single UPDATE WHERE revoked_at IS NULL fails ambiguously
// when 0 rows return — could be (a) keyId doesn't belong to this project, or
// (b) the key exists but is already revoked. Contract maps these to 404 and
// 422 respectively, so we follow up with a tenant-scoped SELECT to decide.
// Cost: one extra SELECT only on the error path; happy path is single-query.
//
// Both queries run inside withTenant(db, projectId, ...) since api_keys is
// FORCE-RLS — without the GUC, the policy `project_id = TENANT_GUC` evaluates
// against unset and returns zero rows / rejects the UPDATE.
//
// Error code casing: `API_KEY_NOT_FOUND` + `ALREADY_REVOKED` UPPER_CASE
// matches `createProjectHandler`'s `PROJECT_SLUG_EXISTS`. The vault contract
// spells `already_revoked` lowercase — same divergence as the `keyPrefix` vs
// `prefix` discrepancy on GET /v1/projects/{id}; amendment owed to the vault.
async function revokeApiKeyHandler(
  c: Context<AdminContext, '/v1/projects/:projectId/api-keys/:keyId'>,
) {
  const projectId = c.req.param('projectId') as string;
  const keyId = c.req.param('keyId') as string;

  const result = await tracer.startActiveSpan(
    'api_keys.revoke',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'api_key_revoke',
        'bokchoy.project_id': projectId,
        'bokchoy.api_key_id': keyId,
        'bokchoy.organization_id': c.var['admin.org'].id,
        'bokchoy.user_id': c.var['admin.member'].userId,
      },
    },
    async (span) => {
      try {
        return await withTenant(db, projectId, async (tx) => {
          const [updated] = await tx
            .update(apiKeys)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(apiKeys.id, keyId),
                eq(apiKeys.projectId, projectId),
                isNull(apiKeys.revokedAt),
              ),
            )
            .returning({
              id: apiKeys.id,
              revokedAt: apiKeys.revokedAt,
            });

          if (updated) {
            span.setAttribute('bokchoy.revoke_outcome', 'revoked');
            return { kind: 'revoked' as const, data: updated };
          }

          const [existing] = await tx
            .select({
              id: apiKeys.id,
              revokedAt: apiKeys.revokedAt,
            })
            .from(apiKeys)
            .where(and(eq(apiKeys.id, keyId), eq(apiKeys.projectId, projectId)))
            .limit(1);

          if (!existing) {
            span.setAttribute('bokchoy.revoke_outcome', 'not_found');
            return { kind: 'not_found' as const };
          }
          span.setAttribute('bokchoy.revoke_outcome', 'already_revoked');
          return { kind: 'already_revoked' as const };
        });
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

  if (result.kind === 'not_found') {
    return c.json(
      {
        error: {
          code: 'API_KEY_NOT_FOUND',
          message: 'API key not found under this project.',
        },
      },
      404,
    );
  }

  if (result.kind === 'already_revoked') {
    return c.json(
      {
        error: {
          code: 'ALREADY_REVOKED',
          message: 'This API key has already been revoked.',
        },
      },
      422,
    );
  }

  return c.json(result.data, 200);
}

// ---- Mount ----
// Same pattern as mountWalletRoutes — registered onto the parent Hono app
// rather than chained-export, avoiding the StandardSchema `Issue` type leak
// from sValidator's inferred export type.

export function mountProjectsRoutes(app: Hono<ProjectsAppContext>): void {
  app.post(
    '/v1/projects',
    adminGate({ resource: 'project', actions: ['create'] }),
    sValidator('json', createProjectBody, validationFailureHook),
    createProjectHandler,
  );

  app.post(
    '/v1/projects/:projectId/api-keys',
    adminGate({
      resource: 'apiKey',
      actions: ['create'],
      projectIdParam: 'projectId',
    }),
    idempotencyMiddleware,
    sValidator('param', projectIdUrlParam, validationFailureHook),
    sValidator('json', createApiKeyBody, validationFailureHook),
    createApiKeyHandler,
  );

  app.get(
    '/v1/projects',
    adminGate({ resource: 'project', actions: ['read'] }),
    listProjectsHandler,
  );

  app.get(
    '/v1/projects/:projectId',
    adminGate({
      resource: 'project',
      actions: ['read'],
      projectIdParam: 'projectId',
    }),
    getProjectHandler,
  );

  app.delete(
    '/v1/projects/:projectId/api-keys/:keyId',
    adminGate({
      resource: 'apiKey',
      actions: ['revoke'],
      projectIdParam: 'projectId',
    }),
    sValidator('param', revokeApiKeyUrlParams, validationFailureHook),
    revokeApiKeyHandler,
  );
}

// Unused-imports placeholder — `and` is currently not needed but kept for
// future filtering composition (e.g., status filter). Drop if it becomes
// noise in lint.
void and;
