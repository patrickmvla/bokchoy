/** Wallet HTTP routes. Per [[wallet-http-contract]] + [[wallet/credit-route-contract]] + [[wallet/balance-history-contract]]. */

import { withTenant } from '@bokchoy/db';
import {
  BcError,
  bootstrapProjectReasonCodes,
  walletBalanceByExternalId,
  walletCredit,
  walletCreditByExternalId,
  walletDebit,
  walletDebitByExternalId,
  walletHistoryByExternalId,
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

// playerExternalId regex matches `players.external_id` CHECK in packages/db schema (defense-in-depth at route boundary).
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

const historyQueryParam = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  starting_after: z.coerce.number().int().positive().optional(),
});

type WalletAppContext = ApiKeyContext & IdempotencyContext;

const tracer = trace.getTracer('@bokchoy/wallet');

function makeMutationHandler(
  operation: 'wallet.credit' | 'wallet.debit',
  wrapper: typeof walletCredit | typeof walletDebit,
) {
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
          return c.json(result, 201);
        } catch (err) {
          // BC060 needs handler-local 404 with availableCodes — global errorMiddleware would map it to 422.
          if (err instanceof BcError && err.details.code === 'BC060') {
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
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

async function balanceByExternalIdHandler(
  c: Context<WalletAppContext, '/v1/players/:playerExternalId/wallets/:currencyCode'>,
) {
  const projectId = c.get('projectId');
  const { playerExternalId, currencyCode } = c.req.valid('param' as never) as {
    playerExternalId: string;
    currencyCode: string;
  };

  return tracer.startActiveSpan(
    'wallet.balance',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'wallet_balance_by_external_id',
        'bokchoy.project_id': projectId,
        'bokchoy.player_external_id_hash': hashPlayerExternalIdForOtel(playerExternalId),
        'bokchoy.currency_code': currencyCode,
      },
    },
    async (span) => {
      try {
        const result = await withTenant(db, projectId, async (tx) =>
          walletBalanceByExternalId(tx, { projectId, playerExternalId, currencyCode }),
        );
        span.setAttribute('bokchoy.wallet_exists', result.exists);
        if (!result.exists) {
          return c.json({ balance: '0', currencyCode }, 200);
        }
        return c.json(
          {
            balance: result.balance,
            currencyCode,
            walletId: result.walletId,
            playerId: result.playerId,
            updatedAt: result.updatedAt.toISOString(),
          },
          200,
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
}

async function historyByExternalIdHandler(
  c: Context<WalletAppContext, '/v1/players/:playerExternalId/wallets/:currencyCode/transactions'>,
) {
  const projectId = c.get('projectId');
  const { playerExternalId, currencyCode } = c.req.valid('param' as never) as {
    playerExternalId: string;
    currencyCode: string;
  };
  const query = c.req.valid('query' as never) as z.infer<typeof historyQueryParam>;
  const limit = query.limit;
  const startingAfter = query.starting_after;

  return tracer.startActiveSpan(
    'wallet.history',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'wallet_history_by_external_id',
        'bokchoy.project_id': projectId,
        'bokchoy.player_external_id_hash': hashPlayerExternalIdForOtel(playerExternalId),
        'bokchoy.currency_code': currencyCode,
        'bokchoy.limit': limit,
        'bokchoy.cursor': startingAfter === undefined ? 'first_page' : 'paginated',
      },
    },
    async (span) => {
      try {
        const result = await withTenant(db, projectId, async (tx) =>
          walletHistoryByExternalId(tx, {
            projectId,
            playerExternalId,
            currencyCode,
            limit,
            startingAfter,
          }),
        );
        span.setAttribute('bokchoy.transaction_count', result.data.length);
        span.setAttribute('bokchoy.has_more', result.hasMore);
        const data = result.data.map((row) => {
          const wire: Record<string, unknown> = {
            id: row.id,
            createdAt: row.createdAt.toISOString(),
            kind: row.kind,
            amount: row.amount,
            reasonCode: row.reasonCode,
            metadata: row.metadata,
          };
          if (row.sourceEventId !== null) wire.sourceEventId = row.sourceEventId;
          if (row.relatedId !== null) wire.relatedId = row.relatedId;
          if (row.relatedType !== null) wire.relatedType = row.relatedType;
          return wire;
        });
        return c.json({ data, hasMore: result.hasMore }, 200);
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
}

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

// Mounted (not chained-export) to avoid the @standard-schema/spec Issue type leak through Hono's chained-builder generic.
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
  // Player-centric read routes per [[wallet/balance-history-contract]] (i) + (ii).
  // No idempotencyMiddleware on GETs — GETs are naturally idempotent per HTTP
  // spec and Stripe production convention scopes Idempotency-Key to mutating
  // operations only. Auth chain: apiKeyMiddleware + sValidator('param') for both,
  // plus sValidator('query') for history.
  app.get(
    '/v1/players/:playerExternalId/wallets/:currencyCode',
    apiKeyMiddleware,
    sValidator('param', playerCurrencyParam, validationFailureHook),
    balanceByExternalIdHandler,
  );
  app.get(
    '/v1/players/:playerExternalId/wallets/:currencyCode/transactions',
    apiKeyMiddleware,
    sValidator('param', playerCurrencyParam, validationFailureHook),
    sValidator('query', historyQueryParam, validationFailureHook),
    historyByExternalIdHandler,
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
