/** 5-step admin gate. Per [[admin-auth-surface]] D1+D2. */

import type { statements as authStatements } from '@bokchoy/auth-config';
import {
  member as memberTable,
  organization as orgTable,
  projects as projectsTable,
} from '@bokchoy/db';
import { trace } from '@opentelemetry/api';
import { and, eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { auth as authSingleton } from '../infra/auth';
import { db as dbSingleton } from '../infra/db';

type Member = typeof memberTable.$inferSelect;
type Organization = typeof orgTable.$inferSelect;

export type AdminContext = {
  Variables: {
    'admin.member': Member;
    'admin.org': Organization;
  };
};

type StatementResource = keyof typeof authStatements;
type StatementActions<R extends StatementResource> = (typeof authStatements)[R][number];

export interface AdminGateOptions<R extends StatementResource> {
  /** Resource the protected route gates on — e.g. 'reasonCode', 'player'. */
  resource: R;
  /** Actions required on the resource — must be a subset of statements[R]. */
  actions: readonly StatementActions<R>[];
  /** URL param name carrying projectId; when set, gate performs the BokChoy-side tenancy check (step 3). */
  projectIdParam?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function err(code: string, message: string) {
  return { error: { code, message } } as const;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Read organizationId from body → query → session. Body parse is defensive against non-JSON / empty bodies. */
async function resolveOrgId(
  method: string,
  readBody: () => Promise<unknown>,
  queryParam: string | undefined,
  activeOrgId: string | null | undefined,
): Promise<string | null> {
  if (MUTATING_METHODS.has(method)) {
    try {
      const body = (await readBody()) as { organizationId?: unknown } | null;
      if (body && typeof body.organizationId === 'string' && body.organizationId.length > 0) {
        return body.organizationId;
      }
    } catch {
      // idempotencyMiddleware caches body bytes; this fallthrough is safe.
    }
  }
  if (queryParam && queryParam.length > 0) return queryParam;
  return activeOrgId ?? null;
}

export function adminGate<R extends StatementResource>(opts: AdminGateOptions<R>) {
  return createMiddleware<AdminContext>(async (c, next) => {
    const tracer = trace.getTracer('bokchoy-backend');
    return tracer.startActiveSpan(
      'admin.gate',
      {
        attributes: {
          'auth.resource': opts.resource as string,
          'auth.actions': [...opts.actions] as string[],
          'auth.has_project_scope': opts.projectIdParam !== undefined,
        },
      },
      async (span): Promise<Response | undefined> => {
        try {
          const session = await authSingleton.api.getSession({ headers: c.req.raw.headers });
          if (!session) {
            span.setAttribute('auth.outcome', 'fail.401');
            return c.json(err('BC401', 'Authentication required'), 401);
          }
          span.setAttribute('auth.user_id', session.user.id);

          const resolvedOrgId = await resolveOrgId(
            c.req.method,
            () => c.req.json(),
            c.req.query('organizationId'),
            session.session.activeOrganizationId,
          );
          if (!resolvedOrgId) {
            span.setAttribute('auth.outcome', 'fail.400');
            return c.json(
              err(
                'BC400',
                'Organization context missing — provide organizationId in body, query, or set active organization',
              ),
              400,
            );
          }
          if (!UUID_REGEX.test(resolvedOrgId)) {
            span.setAttribute('auth.outcome', 'fail.400');
            return c.json(err('BC402', 'organizationId is not a valid UUID'), 400);
          }
          span.setAttribute('auth.organization_id', resolvedOrgId);

          if (opts.projectIdParam) {
            const projectIdRaw = c.req.param(opts.projectIdParam);
            if (!projectIdRaw) {
              span.setAttribute('auth.outcome', 'fail.400');
              return c.json(err('BC402', `URL param :${opts.projectIdParam} is missing`), 400);
            }
            if (!UUID_REGEX.test(projectIdRaw)) {
              span.setAttribute('auth.outcome', 'fail.400');
              return c.json(err('BC402', `${opts.projectIdParam} is not a valid UUID`), 400);
            }
            const [project] = await dbSingleton
              .select({ organizationId: projectsTable.organizationId })
              .from(projectsTable)
              .where(eq(projectsTable.id, projectIdRaw))
              .limit(1);
            if (!project) {
              span.setAttribute('auth.outcome', 'fail.403_cross_org');
              return c.json(err('BC403', 'cross_org_forbidden'), 403);
            }
            if (project.organizationId !== resolvedOrgId) {
              span.setAttribute('auth.outcome', 'fail.403_cross_org');
              return c.json(err('BC403', 'cross_org_forbidden'), 403);
            }
          }

          const [memberRow] = await dbSingleton
            .select()
            .from(memberTable)
            .where(
              and(
                eq(memberTable.userId, session.user.id),
                eq(memberTable.organizationId, resolvedOrgId),
              ),
            )
            .limit(1);
          if (!memberRow) {
            span.setAttribute('auth.outcome', 'fail.403_not_member');
            return c.json(err('BC404', 'not_a_member'), 403);
          }
          span.setAttribute('auth.role', memberRow.role);

          const [orgRow] = await dbSingleton
            .select()
            .from(orgTable)
            .where(eq(orgTable.id, resolvedOrgId))
            .limit(1);
          if (!orgRow) {
            // member.organizationId is ON DELETE CASCADE — this branch is the concurrent-delete race window.
            span.setAttribute('auth.outcome', 'fail.403_not_member');
            return c.json(err('BC404', 'not_a_member'), 403);
          }

          type HasPermInput = Parameters<typeof authSingleton.api.hasPermission>[0];
          const permissionsBody = {
            [opts.resource as string]: [...opts.actions],
          } satisfies Record<string, readonly string[]>;
          const result = await authSingleton.api.hasPermission({
            headers: c.req.raw.headers,
            body: { permissions: permissionsBody },
          } as HasPermInput);
          // hasPermission shape varies across Better Auth versions — `boolean` OR `{ success }`.
          const passed =
            typeof result === 'boolean'
              ? result
              : Boolean((result as { success?: boolean } | null | undefined)?.success);
          if (!passed) {
            span.setAttribute('auth.outcome', 'fail.403_perm');
            return c.json(err('BC405', 'insufficient_permissions'), 403);
          }

          c.set('admin.member', memberRow);
          c.set('admin.org', orgRow);
          span.setAttribute('auth.outcome', 'pass');
          await next();
        } finally {
          span.end();
        }
      },
    );
  });
}
