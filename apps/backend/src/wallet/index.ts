// Wallet feature module per [[backend-service-shape]] §2 + [[wallet-mechanics]]
// + [[wallet-http-contract]] slice 8.1c + slice 8.2.1.
//
// Routes (slash-suffix-verb on resource id per [[url-pattern-research]] F1):
//   POST /v1/wallets/{walletId}/credit                       — slice 8.1c: SDK-auth, idempotency-key
//   POST /v1/wallets/{walletId}/debit                        — slice 8.1c: SDK-auth, idempotency-key
//   POST /v1/projects/{projectId}/bootstrap-reason-codes     — slice 8.2.1: cockpit-admin, naturally-idempotent
//
// SDK auth chain (credit/debit) per [[wallet-http-contract]] handler shape:
//   apiKeyMiddleware  → Bearer auth, sets c.var.projectId + apiKeyId
//   idempotencyMiddleware → optional Idempotency-Key 4-state machine
//   sValidator('param') → walletId UUID
//   sValidator('json')  → camelCase body schema
//   handler           → withTenant → tracer.startActiveSpan → walletCredit/Debit
//
// Admin auth chain (bootstrap-reason-codes) per [[admin-auth-surface]] contract:
//   adminGate({ resource: 'reasonCode', actions: ['bootstrap'], projectIdParam: 'projectId' })
//     → validates session, body/query/session-resolves org, BokChoy-side
//       tenancy check (project.organization_id === resolvedOrgId), member
//       lookup, hasPermission. Sets c.var['admin.member'] + c.var['admin.org'].
//   handler         → withTenant → tracer.startActiveSpan → bootstrapProjectReasonCodes
//
// No Idempotency-Key middleware on bootstrap — the underlying SQL function uses
// INSERT … ON CONFLICT DO NOTHING (per packages/wallet/src/bootstrap-project-reason-codes.ts
// line 6), so re-runs naturally return inserted=0 instead of erroring. The
// HTTP-layer Idempotency-Key state machine is for non-idempotent operations
// (credit/debit) where the contract requires replay-safety.
//
// Errors propagate to the app-level onError (apps/backend/src/infra/error-middleware.ts):
// WalletError → Stripe-wrapped `{error:{code,message,...details}}` with BCxxx→HTTP map.

import { withTenant } from '@bokchoy/db';
import {
  bootstrapProjectReasonCodes,
  WalletError,
  walletCredit,
  walletCreditByExternalId,
  walletDebit,
  walletDebitByExternalId,
} from '@bokchoy/wallet';
import { type Hook, sValidator } from '@hono/standard-validator';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { sql } from 'drizzle-orm';
import type { Context, Env, Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, adminGate } from '../admin';
import { type ApiKeyContext, apiKeyMiddleware } from '../auth';
import { type IdempotencyContext, idempotencyMiddleware } from '../idempotency';
import { db } from '../infra';
import { hashPlayerExternalIdForOtel } from '../telemetry';

// Translate @hono/standard-validator's default `{success:false, error:Issues, data}`
// shape into [[wallet-http-contract]] G5 (X) Stripe-wrapped:
//   400 { "error": { "code": "VALIDATION_ERROR", "message": "...", "issues": [...] } }
// where `issues` carries StandardSchemaV1.Issue[] (`message`, `path`).
//
// `Hook` is the validator's hook callback type — runs ONCE on validation failure;
// returns a Response which @hono/standard-validator sends instead of its default.
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

// Body schema per [[wallet-http-contract]] slice 8.1c (camelCase; JS-safe int range
// per [[wrapper-shape]] amount: number revisit-when on real-money use case).
// Number.MAX_SAFE_INTEGER = 2^53 - 1 = 9_007_199_254_740_991 — contract's literal
// 9_007_199_254_740_992 is 2^53 (the unsafe boundary), MAX_SAFE_INTEGER is the
// last value losslessly representable.
const creditDebitBody = z.object({
  amount: z.number().positive().max(Number.MAX_SAFE_INTEGER),
  currencyId: z.uuid(),
  reasonCode: z.string().min(1).max(64),
  sourceEventId: z.string().min(1).max(255).optional(),
  relatedId: z.number().int().positive().optional(),
  relatedType: z.enum(['loot_roll', 'iap_receipt', 'compensation_grant']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const walletIdParam = z.object({ walletId: z.uuid() });

// URL-param + body schemas for the player-centric routes per
// [[wallet/credit-route-contract]] (ii) + (i).
//   • playerExternalId — same regex as the DB CHECK constraint on
//     players.external_id (RFC 3986 unreserved minus '~'; 1-128 chars).
//     Defense-in-depth: rejected at the route boundary before the DB sees
//     it, surfaces as Stripe-wrapped VALIDATION_ERROR.
//   • currencyCode — matches currencies.code regex from
//     packages/db/src/schema/wallet.ts (1-16 alphanum/underscore chars).
//   • creditDebitByExternalIdBody — same as creditDebitBody minus currencyId
//     (currency now in the URL).
const PLAYER_EXTERNAL_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const CURRENCY_CODE_RE = /^[A-Za-z0-9_]{1,16}$/;

const playerCurrencyParam = z.object({
  playerExternalId: z.string().regex(PLAYER_EXTERNAL_ID_RE),
  currencyCode: z.string().regex(CURRENCY_CODE_RE),
});

const creditDebitByExternalIdBody = z.object({
  amount: z.number().positive().max(Number.MAX_SAFE_INTEGER),
  reasonCode: z.string().min(1).max(64),
  sourceEventId: z.string().min(1).max(255).optional(),
  relatedId: z.number().int().positive().optional(),
  relatedType: z.enum(['loot_roll', 'iap_receipt', 'compensation_grant']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type WalletAppContext = ApiKeyContext & IdempotencyContext;

const tracer = trace.getTracer('@bokchoy/wallet');

// Shared handler logic — the wrapper to invoke is the only difference between
// credit and debit; auth chain, span attributes, error path, response shape are
// identical. Per [[wallet-http-contract]] slice 8.1c handler shape verbatim.
function makeMutationHandler(
  operation: 'wallet.credit' | 'wallet.debit',
  wrapper: typeof walletCredit | typeof walletDebit,
) {
  // Hono's typed Context narrows generic param to the specific path; we pin to a
  // shared body type. The c.req.valid('json'/'param') typings are derived from the
  // sValidator chain at the route definition site.
  return async (
    c: Context<WalletAppContext, '/v1/wallets/:walletId/credit' | '/v1/wallets/:walletId/debit'>,
  ) => {
    const projectId = c.get('projectId');
    const { walletId } = c.req.valid('param' as never) as { walletId: string };
    const body = c.req.valid('json' as never) as z.infer<typeof creditDebitBody>;
    const idempotencyKeyId = c.get('idempotencyKeyId');

    const txnId = await tracer.startActiveSpan(
      operation,
      {
        attributes: {
          'db.system': 'postgresql',
          'db.operation': operation === 'wallet.credit' ? 'wallet_credit' : 'wallet_debit',
          'bokchoy.project_id': projectId,
          'bokchoy.wallet_id': walletId,
          'bokchoy.amount': body.amount,
          'bokchoy.currency_id': body.currencyId,
          'bokchoy.reason_code': body.reasonCode,
        },
      },
      async (span) => {
        try {
          return await withTenant(db, projectId, async (tx) =>
            wrapper(tx, {
              projectId,
              walletId,
              amount: body.amount,
              currencyId: body.currencyId,
              reasonCode: body.reasonCode,
              sourceEventId: body.sourceEventId,
              idempotencyKeyId,
              relatedId: body.relatedId,
              relatedType: body.relatedType,
              metadata: body.metadata,
            }),
          );
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

    return c.json({ id: txnId, walletId, status: 'completed' as const }, 200);
  };
}

// Player-centric credit/debit handler factory per [[wallet/credit-route-contract]]
// (i). Same auth chain as the wallet-id-keyed routes (apiKeyMiddleware +
// idempotencyMiddleware) but takes (playerExternalId, currencyCode) in the URL
// and lazy-creates player + wallet on first credit per (iii). Currency code
// is the customer-facing `currencies.code` slug; backend resolves to currencyId
// inside the SQL function.
//
// OTel attributes per (i) verbatim: bokchoy.project_id, bokchoy.player_external_id_hash
// (HMAC-truncated per (iv)), bokchoy.currency_code, bokchoy.amount, bokchoy.reason_code.
// bokchoy.wallet_id is NOT in the attribute list — the operation is identified
// by player_external_id_hash + currency_code, not by wallet_id (which is
// lazy-created and not visible to the caller until response time).
function makeByExternalIdMutationHandler(
  operation: 'wallet.credit_by_external_id' | 'wallet.debit_by_external_id',
  wrapper: typeof walletCreditByExternalId | typeof walletDebitByExternalId,
) {
  return async (
    c: Context<
      WalletAppContext,
      | '/v1/players/:playerExternalId/wallets/:currencyCode/credit'
      | '/v1/players/:playerExternalId/wallets/:currencyCode/debit'
    >,
  ) => {
    const projectId = c.get('projectId');
    const { playerExternalId, currencyCode } = c.req.valid('param' as never) as {
      playerExternalId: string;
      currencyCode: string;
    };
    const body = c.req.valid('json' as never) as z.infer<typeof creditDebitByExternalIdBody>;
    const idempotencyKeyId = c.get('idempotencyKeyId');

    return tracer.startActiveSpan(
      operation,
      {
        attributes: {
          'db.system': 'postgresql',
          'db.operation':
            operation === 'wallet.credit_by_external_id'
              ? 'wallet_credit_by_external_id'
              : 'wallet_debit_by_external_id',
          'bokchoy.project_id': projectId,
          'bokchoy.player_external_id_hash': hashPlayerExternalIdForOtel(playerExternalId),
          'bokchoy.currency_code': currencyCode,
          'bokchoy.amount': body.amount,
          'bokchoy.reason_code': body.reasonCode,
        },
      },
      async (span) => {
        try {
          const result = await withTenant(db, projectId, async (tx) =>
            wrapper(tx, {
              projectId,
              playerExternalId,
              currencyCode,
              amount: body.amount,
              reasonCode: body.reasonCode,
              sourceEventId: body.sourceEventId,
              idempotencyKeyId,
              relatedId: body.relatedId,
              relatedType: body.relatedType,
              metadata: body.metadata,
            }),
          );
          // 201 per [[wallet/credit-route-contract]] (i) — new transaction
          // record (and, on first credit, new player + wallet rows). Bare-data
          // shape per [[wallet-http-contract]] G5.
          return c.json(result, 201);
        } catch (err) {
          // UNKNOWN_CURRENCY is the only WalletError class the global
          // errorMiddleware would mis-map (BC060 → 422 in the table; the
          // M-1.5 contract specifies 404 with availableCodes). Catch locally,
          // form the response, let everything else propagate.
          if (err instanceof WalletError && err.details.code === 'BC060') {
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            // Re-query inside the same tenant to enumerate available codes.
            // Cheap on the error path; the happy path never runs it.
            const rows = await withTenant(db, projectId, async (tx) =>
              tx.execute(
                sql`SELECT code FROM currencies WHERE project_id = ${projectId}::uuid ORDER BY code ASC`,
              ),
            );
            const codes = Array.from(rows as ArrayLike<Record<string, unknown>>)
              .map((r) => r.code)
              .filter((c2): c2 is string => typeof c2 === 'string');
            return c.json(
              {
                error: {
                  code: 'UNKNOWN_CURRENCY',
                  message: `Currency '${err.details.currencyCode}' is not registered for this project`,
                  currencyCode: err.details.currencyCode,
                  availableCodes: codes,
                },
              },
              404,
            );
          }
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
  };
}

// Bootstrap-reason-codes handler — slice 8.2.1 first admin-auth consumer per
// [[admin-auth-surface]]. adminGate has already validated session + org context
// + BokChoy-side tenancy check (project.organization_id === resolvedOrgId) +
// member + permission by the time this runs. c.req.param('projectId') is
// guaranteed UUID-shape. c.var['admin.org'].id === project.organization_id by
// invariant. withTenant scopes the RLS GUC to the project for the wrapper call.
type BootstrapAppContext = AdminContext;

async function bootstrapReasonCodesHandler(
  c: Context<BootstrapAppContext, '/v1/projects/:projectId/bootstrap-reason-codes'>,
) {
  const projectId = c.req.param('projectId') as string;

  const inserted = await tracer.startActiveSpan(
    'wallet.bootstrap_reason_codes',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'bootstrap_project_reason_codes',
        'bokchoy.project_id': projectId,
        'bokchoy.organization_id': c.var['admin.org'].id,
        'bokchoy.user_id': c.var['admin.member'].userId,
      },
    },
    async (span) => {
      try {
        const count = await withTenant(db, projectId, async (tx) =>
          bootstrapProjectReasonCodes(tx, { projectId }),
        );
        span.setAttribute('bokchoy.inserted_count', count);
        return count;
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

  return c.json({ inserted }, 200);
}

// Mounted onto the parent Hono app rather than chained-export to avoid the
// `Issue` type leak from @standard-schema/spec into the inferred export type
// (TS 2883 — Hono's chained `.post(...).post(...)` builder builds a generic
// type that references Issue, which isn't transitively re-exportable from
// outside @hono/standard-validator's package boundary).
export function mountWalletRoutes(app: Hono<WalletAppContext & BootstrapAppContext>): void {
  app.post(
    '/v1/wallets/:walletId/credit',
    apiKeyMiddleware,
    idempotencyMiddleware,
    sValidator('param', walletIdParam, validationFailureHook),
    sValidator('json', creditDebitBody, validationFailureHook),
    makeMutationHandler('wallet.credit', walletCredit),
  );
  app.post(
    '/v1/wallets/:walletId/debit',
    apiKeyMiddleware,
    idempotencyMiddleware,
    sValidator('param', walletIdParam, validationFailureHook),
    sValidator('json', creditDebitBody, validationFailureHook),
    makeMutationHandler('wallet.debit', walletDebit),
  );
  // Slice M-1.5 player-centric routes per [[wallet/credit-route-contract]].
  // Existing wallet-id-keyed routes above stay — different audience (internal/admin
  // callers who already hold a walletId). These two are SDK-facing for the
  // currency-code + player-external-id ergonomics per [[marketing/v1-shape]] (iii).
  app.post(
    '/v1/players/:playerExternalId/wallets/:currencyCode/credit',
    apiKeyMiddleware,
    idempotencyMiddleware,
    sValidator('param', playerCurrencyParam, validationFailureHook),
    sValidator('json', creditDebitByExternalIdBody, validationFailureHook),
    makeByExternalIdMutationHandler('wallet.credit_by_external_id', walletCreditByExternalId),
  );
  app.post(
    '/v1/players/:playerExternalId/wallets/:currencyCode/debit',
    apiKeyMiddleware,
    idempotencyMiddleware,
    sValidator('param', playerCurrencyParam, validationFailureHook),
    sValidator('json', creditDebitByExternalIdBody, validationFailureHook),
    makeByExternalIdMutationHandler('wallet.debit_by_external_id', walletDebitByExternalId),
  );
  app.post(
    '/v1/projects/:projectId/bootstrap-reason-codes',
    adminGate({
      resource: 'reasonCode',
      actions: ['bootstrap'],
      projectIdParam: 'projectId',
    }),
    bootstrapReasonCodesHandler,
  );
}
