/** Cockpit-admin endpoints for projects + api_keys. Per [[cockpit/admin-list-endpoints-contract]]. */

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

// Schemas duplicated from cockpit's `create-project-schema.ts` — keep in sync or promote to @bokchoy/shared-types.

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

// Mirror `packages/db/scripts/create-api-key.ts`. fullKey is shown once, never persisted.

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

// Superset of AppContext — Hono generic invariance forces the parent app's exact union on `mount`.
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
        // Inline GUC instead of withTenant: nested transactions would split the project+currencies atomicity.
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
          if (
            err.message.includes('projects_organization_id_slug_unique') ||
            err.message.includes('unique constraint')
          ) {
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
        // Default 'live' so production never accidentally ships test-prefix keys.
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

  return c.json(rows, 200);
}

// 0-row UPDATE is ambiguous (not_found vs already_revoked) — follow-up SELECT only on the error path.
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

void and; // kept for future status filter
