// Wallet feature module per [[backend-service-shape]] §2 + [[wallet-mechanics]]
// + [[wallet-http-contract]] slice 8.1c.
//
// Routes (slash-suffix-verb on resource id per [[url-pattern-research]] F1):
//   POST /v1/wallets/{walletId}/credit   — increment wallet balance
//   POST /v1/wallets/{walletId}/debit    — decrement wallet balance (BC010 if insufficient)
//
// Chain per [[wallet-http-contract]] handler shape:
//   apiKeyMiddleware  → Bearer auth, sets c.var.projectId + apiKeyId
//   idempotencyMiddleware → optional Idempotency-Key 4-state machine
//   sValidator('param') → walletId UUID
//   sValidator('json')  → camelCase body schema
//   handler           → withTenant → tracer.startActiveSpan → walletCredit/Debit
//
// Errors propagate to the app-level onError (apps/backend/src/infra/error-middleware.ts):
// WalletError → Stripe-wrapped `{error:{code,message,...details}}` with BCxxx→HTTP map.

import { withTenant } from '@bokchoy/db';
import { walletCredit, walletDebit } from '@bokchoy/wallet';
import { type Hook, sValidator } from '@hono/standard-validator';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Context, Env, Hono } from 'hono';
import { z } from 'zod';
import { type ApiKeyContext, apiKeyMiddleware } from '../auth';
import { type IdempotencyContext, idempotencyMiddleware } from '../idempotency';
import { db } from '../infra';

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

// Mounted onto the parent Hono app rather than chained-export to avoid the
// `Issue` type leak from @standard-schema/spec into the inferred export type
// (TS 2883 — Hono's chained `.post(...).post(...)` builder builds a generic
// type that references Issue, which isn't transitively re-exportable from
// outside @hono/standard-validator's package boundary).
export function mountWalletRoutes(app: Hono<WalletAppContext>): void {
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
}
