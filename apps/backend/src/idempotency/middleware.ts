// Idempotency-Key middleware per [[wallet-http-contract]] G4 +
// [[idempotency-strategy]] D2-α.
//
// CONTRACT (verbatim from [[wallet-http-contract]] 8.1b item 3):
//   • Header `Idempotency-Key`, ≤255 chars ASCII (RFC 8941 Structured Header
//     String — printable ASCII 0x21-0x7E).
//   • Server-derived natural-key path stays primary. Middleware writes to
//     idempotency_keys ONLY when the header is supplied.
//   • Lookup by (project_id, idempotency_key) UNIQUE.
//   • State machine:
//     - row absent → INSERT with locked_at = now(); call next; UPDATE
//       response_status + response_body + completed_at on completion.
//     - row found + completed_at set + body_hash matches → REPLAY (return
//       cached response_status + response_body, handler not invoked).
//     - row found + locked_at recent + completed_at NULL + body_hash matches
//       → 409 BC001 IdempotencyKeyInUse (concurrent in-flight).
//     - row found + body_hash mismatches → 422 BC002 IdempotencyKeyMismatch.
//   • Lock timeout: 30s. Older lock = recoverable; re-lock + proceed.
//
// Body fingerprint: SHA-256 of raw body bytes (NOT canonical JSON — defers per
// contract "defer canonicalization-algorithm pick to slice 8.1b
// implementation"). Trade: clients must produce byte-identical bodies on retry
// (matches Stripe documented behavior).
//
// All idempotency_keys reads/writes wrapped in withTenant — RLS scopes by
// project_id. Bearer middleware MUST run before this middleware so projectId
// is available via c.get('projectId').

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
    // projectId is set by apiKeyMiddleware upstream; declared here so
    // c.get('projectId') typechecks inside the middleware body.
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
  // GET / HEAD / OPTIONS bypass — they're idempotent by HTTP semantics.
  if (!MUTATING_METHODS.has(c.req.method)) {
    return next();
  }

  const idempotencyKey = c.req.header(HEADER_NAME);

  // Header absent — server-derived natural-key path is primary; middleware
  // is a no-op. The handler / wrapper is responsible for natural-key dedup
  // (e.g., transactions.source_event_id UNIQUE).
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

  // Read raw body once; Hono caches it for subsequent c.req.json() / .text().
  const rawBody = await c.req.text();
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const requestParams = { bodyHash, contentType: c.req.header('content-type') ?? '' };

  // ---- Caller's project resolved by Bearer middleware (apiKeyMiddleware). ----
  const projectId = c.get('projectId');
  if (!projectId) {
    // Defense-in-depth: idempotency middleware composed without auth upstream.
    // Should not happen in slice 8.1b routes; surface explicitly so misuse is
    // loud, not silent.
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

  // Lookup + lock-or-replay decision. Wrapped in withTenant for RLS GUC.
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
      // ON CONFLICT (project_id, idempotency_key) DO NOTHING closes the
      // SELECT-then-INSERT race per [[wallet-http-contract]] G4 case 4. Two
      // callers with the same key both see "no row" in the SELECT above; the
      // second INSERT blocks on the unique index until the winner commits,
      // then resolves to "no row inserted" (empty RETURNING) instead of
      // raising 23505. We then re-SELECT the winner's row and dispatch the
      // state machine — typically returning 409 BC001 because the winner is
      // by construction in-flight (just committed milliseconds ago).
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

      // Race lost. Re-SELECT the winner's row and dispatch a trimmed state
      // machine: mismatch / replay / in_use only. Lock-expired re-lock is
      // intentionally skipped — the winner just INSERTed milliseconds ago, so
      // locked_at is fresh by construction; re-locking would race the winner
      // and could cause double-execution of the handler when both transactions
      // write their completion UPDATEs. Race-loser is canonically "in_use" per
      // [[idempotency-strategy]] line 122; client retries on 409 per Stripe
      // SDK pattern (RequestSender.ts:329) and resolves cleanly on retry.
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
        // ON CONFLICT returned no id (row exists) but re-SELECT returned no
        // row. Reaper would have to fire between the two statements AND
        // delete a row with completed_at NULL — but the reaper's DELETE
        // WHERE clause filters on `completed_at IS NOT NULL` (per
        // packages/db/drizzle/0006), so a fresh in-flight row cannot be
        // reaped. Fail loud rather than swallow.
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

    // Body-mismatch trumps everything: same key reused with different request.
    if (row.body_hash && row.body_hash !== bodyHash) {
      return { kind: 'mismatch' };
    }

    // Completed → replay.
    if (row.completed_at && row.response_status !== null) {
      return { kind: 'replay', status: row.response_status, body: row.response_body };
    }

    // In-flight: locked + incomplete. Check timeout.
    if (row.locked_at) {
      const lockedAtMs = Date.parse(row.locked_at);
      const lockExpired = !Number.isNaN(lockedAtMs) && Date.now() - lockedAtMs > LOCK_TIMEOUT_MS;
      if (!lockExpired) {
        return { kind: 'in_use' };
      }
    }

    // Lock expired (or absent on a row that somehow has neither lock nor
    // completion — defensive). Re-lock and proceed.
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

  // Proceed: run the handler, then capture + persist the response.
  c.set('idempotencyKeyId', decision.rowId);
  await next();

  const cloned = c.res.clone();
  const responseStatus = cloned.status;
  let responseBody: unknown = null;
  try {
    responseBody = await cloned.json();
  } catch {
    // Non-JSON response (e.g., text/html error page). Store status; body stays
    // null. Replay returns null body which is structurally OK; observability
    // surfaces the gap.
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
