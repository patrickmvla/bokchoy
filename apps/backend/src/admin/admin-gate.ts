// Hono middleware factory implementing the 5-step admin gate per
// [[admin-auth-surface]] D1+D2 (body → query → session org resolution +
// `hasPermission` server-side check). Sets typed c.var['admin.member'] +
// c.var['admin.org'] so downstream handlers consume verified-admin context
// without re-checking. Per [[admin-auth-surface]] *Idiom citations* — Hono
// Variables generic carries the discriminated context shape per
// idioms/typescript.md *Make impossible states unrepresentable*.
//
// CONTRACT (verbatim from [[admin-auth-surface]] amended 2026-05-11):
//   1. auth.api.getSession → null → 401 BC401 AdminUnauthenticated
//   2. resolve org body ?? query ?? session.activeOrganizationId
//      null                 → 400 BC400 AdminContextMissing
//      present non-UUID     → 400 BC402 AdminInvalidInput
//   3. if projectIdParam set:
//      URL param missing    → 400 BC402 AdminInvalidInput
//      URL param non-UUID   → 400 BC402 AdminInvalidInput
//      project not found OR project.organization_id mismatch
//                           → 403 BC403 AdminCrossOrgForbidden
//   4. findMemberByOrgId → null (or org row gone via race)
//                           → 403 BC404 AdminNotAMember
//   5. auth.api.hasPermission → false
//                           → 403 BC405 AdminInsufficientPermissions
//   6. c.set('admin.member', member) + c.set('admin.org', org) + next()
//
// Error wire-shape matches existing middleware convention (apiKeyMiddleware +
// idempotencyMiddleware) — direct c.json return with { error: { code, message } }
// instead of throw → errorMiddleware. BC400-BC405 allocated in
// [[wallet-mechanics]] Part 3 A18 Amendment 2026-05-11 (BC400-BC499 reserved
// for auth/authorization, one code per semantic outcome).
//
// OTel span emission per [[admin-auth-surface]] *Engineering substance applied*
// → *Observability*: span name `admin.gate`, attributes capture every gate
// outcome for the page-on-5%-failure-rate alerting rule.

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

// ---- Types ----
// Member + Organization derived from Drizzle schema per idioms/typescript.md
// *Let the types flow end-to-end*. Schema change cascades automatically.

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
  /**
   * Hono URL path param name carrying the projectId. When set, middleware
   * performs the BokChoy-side tenancy check per [[admin-auth-surface]] step 3:
   * JOIN projects + verify project.organization_id === resolvedOrgId. When
   * undefined, the tenancy check is skipped — use for org-level admin routes
   * with no project scope.
   */
  projectIdParam?: string;
}

// ---- Helpers ----

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function err(code: string, message: string) {
  return { error: { code, message } } as const;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Read organizationId from body → query → session (precedence per
 * [[admin-auth-surface]] D1 + Better Auth's own routes × 10 call sites at
 * commit e21d744). Body parse is defensive: non-JSON / missing-field bodies
 * fall through to query/session without throwing.
 */
async function resolveOrgId(
  method: string,
  readBody: () => Promise<unknown>,
  queryParam: string | undefined,
  activeOrgId: string | null | undefined,
): Promise<string | null> {
  // Body precedence (mutating methods only — GET/HEAD/OPTIONS skip body parse).
  if (MUTATING_METHODS.has(method)) {
    try {
      const body = (await readBody()) as { organizationId?: unknown } | null;
      if (body && typeof body.organizationId === 'string' && body.organizationId.length > 0) {
        return body.organizationId;
      }
    } catch {
      // Non-JSON body, empty body, or already-consumed body. Fall through to
      // query/session. Idempotency middleware caches body bytes via c.req.text;
      // subsequent c.req.json() in this middleware works against the cache.
    }
  }
  if (queryParam && queryParam.length > 0) return queryParam;
  return activeOrgId ?? null;
}

// ---- Middleware factory ----

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
          // Step 1: Validate session.
          const session = await authSingleton.api.getSession({ headers: c.req.raw.headers });
          if (!session) {
            span.setAttribute('auth.outcome', 'fail.401');
            return c.json(err('BC401', 'Authentication required'), 401);
          }
          span.setAttribute('auth.user_id', session.user.id);

          // Step 2: Resolve org.
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

          // Step 3: Tenancy check — only when route operates on a project.
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

          // Step 4: Member lookup.
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

          // Step 4b: Resolve org row for c.var['admin.org'].
          const [orgRow] = await dbSingleton
            .select()
            .from(orgTable)
            .where(eq(orgTable.id, resolvedOrgId))
            .limit(1);
          if (!orgRow) {
            // Race: member row exists referencing an org that's been deleted.
            // member.organizationId is ON DELETE CASCADE per schema; concurrent
            // delete + this read is the only window. Treat as not-a-member.
            span.setAttribute('auth.outcome', 'fail.403_not_member');
            return c.json(err('BC404', 'not_a_member'), 403);
          }

          // Step 5: Permission check. Better Auth's hasPermission input is
          // strongly typed via the org plugin's Zod schema for permissions;
          // we build the runtime shape per docs example at
          // better-auth.com/docs/plugins/organization v1.6 and erase to
          // Parameters via the satisfies-then-Parameters pattern so the
          // call site stays typed at the boundary.
          type HasPermInput = Parameters<typeof authSingleton.api.hasPermission>[0];
          const permissionsBody = {
            [opts.resource as string]: [...opts.actions],
          } satisfies Record<string, readonly string[]>;
          const result = await authSingleton.api.hasPermission({
            headers: c.req.raw.headers,
            body: { permissions: permissionsBody },
          } as HasPermInput);
          // hasPermission returns either boolean or { success: boolean } shape
          // depending on Better Auth version — both are truthy-pass via the
          // success field per packages/better-auth/src/plugins/access/access.ts
          // AuthorizeResponse. Defensive read.
          const passed =
            typeof result === 'boolean'
              ? result
              : Boolean((result as { success?: boolean } | null | undefined)?.success);
          if (!passed) {
            span.setAttribute('auth.outcome', 'fail.403_perm');
            return c.json(err('BC405', 'insufficient_permissions'), 403);
          }

          // Step 6: Set context + proceed.
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
