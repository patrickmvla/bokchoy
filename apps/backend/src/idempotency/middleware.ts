/** Idempotency-Key middleware. Per [[wallet-http-contract]] G4 + [[idempotency-strategy]] D2-α. */

import { createHash } from 'node:crypto';
import { withTenant } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { db } from '../infra';

const HEADER_NAME = 'Idempotency-Key';
const KEY_MAX_LENGTH = 255;
const KEY_PATTERN = /^[\x21-\x7E]{1,255}$/;
const LOCK_TIMEOUT_MS = 30_000;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type IdempotencyContext = {
  Variables: {
    projectId: string;
    idempotencyKeyId?: number;
  };
};

type LookupRow = {
  id: number;
  locked_at: string | null;
  completed_at: string | null;
  response_status: number | null;
  response_body: unknown;
  body_hash: string | null;
};

type Decision =
  | { kind: 'proceed'; rowId: number }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'in_use' }
  | { kind: 'mismatch' };

export const idempotencyMiddleware = createMiddleware<IdempotencyContext>(async (c, next) => {
  if (!MUTATING_METHODS.has(c.req.method)) {
    return next();
  }

  // Header absent → handler-side natural-key dedup is primary; middleware no-ops.
  const idempotencyKey = c.req.header(HEADER_NAME);
  if (!idempotencyKey) {
    return next();
  }

  if (idempotencyKey.length > KEY_MAX_LENGTH || !KEY_PATTERN.test(idempotencyKey)) {
    return c.json(
      {
        error: {
          code: 'IDEMPOTENCY_KEY_INVALID',
          message: 'Invalid Idempotency-Key header (≤255 printable ASCII chars)',
        },
      },
      400,
    );
  }

  const rawBody = await c.req.text();
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const requestParams = { bodyHash, contentType: c.req.header('content-type') ?? '' };

  const projectId = c.get('projectId');
  if (!projectId) {
    // Defense-in-depth: surface auth-middleware misuse loudly, not silently.
    return c.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'projectId missing — auth middleware not run',
        },
      },
      500,
    );
  }

  const decision = await withTenant(db, projectId, async (tx): Promise<Decision> => {
    const rows = await tx.execute<LookupRow>(sql`
      SELECT
        id,
        locked_at,
        completed_at,
        response_status,
        response_body,
        request_params->>'bodyHash' AS body_hash
      FROM idempotency_keys
      WHERE project_id = ${projectId}::uuid
        AND idempotency_key = ${idempotencyKey}
    `);

    const row = rows[0];

    if (!row) {
      // ON CONFLICT DO NOTHING closes the SELECT-then-INSERT race: race-loser sees empty RETURNING, re-SELECTs winner.
      const inserted = await tx.execute<{ id: number }>(sql`
        -- allow-direct-mutation: idempotency-middleware (slice 8.1b INSERT path; ON CONFLICT DO NOTHING added slice 8.1.6 hardening per [[wallet-http-contract]] G4 case 4)
        INSERT INTO idempotency_keys
          (project_id, idempotency_key, request_method, request_path, request_params, locked_at)
        VALUES
          (${projectId}::uuid, ${idempotencyKey}, ${c.req.method}, ${c.req.path}, ${JSON.stringify(requestParams)}::jsonb, NOW())
        ON CONFLICT (project_id, idempotency_key) DO NOTHING
        RETURNING id
      `);
      const newId = inserted[0]?.id;
      if (newId !== undefined) {
        return { kind: 'proceed', rowId: newId };
      }

      // Race-loser: trimmed state machine (mismatch/replay/in_use). Re-lock skipped — winner is fresh by construction.
      const raced = await tx.execute<LookupRow>(sql`
        SELECT
          id,
          locked_at,
          completed_at,
          response_status,
          response_body,
          request_params->>'bodyHash' AS body_hash
        FROM idempotency_keys
        WHERE project_id = ${projectId}::uuid
          AND idempotency_key = ${idempotencyKey}
      `);
      const racedRow = raced[0];
      if (!racedRow) {
        // Reaper filters on `completed_at IS NOT NULL`, so a fresh in-flight row cannot vanish between the two statements.
        throw new Error(
          'idempotency_keys race: ON CONFLICT returned no id but re-SELECT returned no row',
        );
      }
      if (racedRow.body_hash && racedRow.body_hash !== bodyHash) {
        return { kind: 'mismatch' };
      }
      if (racedRow.completed_at && racedRow.response_status !== null) {
        return { kind: 'replay', status: racedRow.response_status, body: racedRow.response_body };
      }
      return { kind: 'in_use' };
    }

    if (row.body_hash && row.body_hash !== bodyHash) {
      return { kind: 'mismatch' };
    }

    if (row.completed_at && row.response_status !== null) {
      return { kind: 'replay', status: row.response_status, body: row.response_body };
    }

    if (row.locked_at) {
      const lockedAtMs = Date.parse(row.locked_at);
      const lockExpired = !Number.isNaN(lockedAtMs) && Date.now() - lockedAtMs > LOCK_TIMEOUT_MS;
      if (!lockExpired) {
        return { kind: 'in_use' };
      }
    }

    await tx.execute(sql`
      -- allow-direct-mutation: idempotency-middleware (slice 8.1b — re-lock recovery path per [[idempotency-strategy]])
      UPDATE idempotency_keys
      SET locked_at = NOW(),
          request_params = ${JSON.stringify(requestParams)}::jsonb,
          response_status = NULL,
          response_body = NULL,
          completed_at = NULL
      WHERE id = ${row.id}
    `);
    return { kind: 'proceed', rowId: row.id };
  });

  if (decision.kind === 'mismatch') {
    return c.json(
      {
        error: {
          code: 'BC002',
          message: 'Idempotency-Key reused with a different request body',
        },
      },
      422,
    );
  }
  if (decision.kind === 'in_use') {
    return c.json(
      {
        error: {
          code: 'BC001',
          message: 'A request with this Idempotency-Key is already in flight',
        },
      },
      409,
    );
  }
  if (decision.kind === 'replay') {
    return c.json(decision.body, decision.status as ContentfulStatusCode);
  }

  c.set('idempotencyKeyId', decision.rowId);
  await next();

  const cloned = c.res.clone();
  const responseStatus = cloned.status;
  let responseBody: unknown = null;
  try {
    responseBody = await cloned.json();
  } catch {
    // Non-JSON response — store status only; replay's null body is structurally fine.
  }

  await withTenant(db, projectId, async (tx) => {
    await tx.execute(sql`
      -- allow-direct-mutation: idempotency-middleware (slice 8.1b — completion path per [[idempotency-strategy]])
      UPDATE idempotency_keys
      SET response_status = ${responseStatus},
          response_body = ${responseBody === null ? null : JSON.stringify(responseBody)}::jsonb,
          completed_at = NOW()
      WHERE id = ${decision.rowId}
    `);
  });
});

export type { IdempotencyContext };
