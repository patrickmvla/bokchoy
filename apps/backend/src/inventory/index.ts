/** Inventory HTTP routes. Per [[inventory/inventory-contract]] (iii). */

import { withTenant } from '@bokchoy/db';
import {
  inventoryConsumeByExternalId,
  inventoryGrantByExternalId,
  inventoryItemByExternalId,
  inventoryListByExternalId,
} from '@bokchoy/inventory';
import { BcError } from '@bokchoy/wallet';
import { type Hook, sValidator } from '@hono/standard-validator';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { sql } from 'drizzle-orm';
import type { Context, Env, Hono } from 'hono';
import { z } from 'zod';
import type { AdminContext } from '../admin';
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

const PLAYER_EXTERNAL_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const ITEM_CODE_RE = /^[A-Za-z0-9_]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const playerItemParam = z.object({
  playerExternalId: z.string().regex(PLAYER_EXTERNAL_ID_RE),
  itemCode: z.string().regex(ITEM_CODE_RE),
});

const playerOnlyParam = z.object({
  playerExternalId: z.string().regex(PLAYER_EXTERNAL_ID_RE),
});

const grantBody = z.object({
  amount: z.number().int().positive().max(10_000),
  reasonCode: z.string().min(1).max(64),
  sourceEventId: z.string().min(1).max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const consumeBody = z.object({
  amount: z.number().int().positive().max(10_000),
  reasonCode: z.string().min(1).max(64),
  instanceId: z.string().regex(UUID_RE).optional(),
  sourceEventId: z.string().min(1).max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQueryParam = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  starting_after: z.coerce.number().int().positive().optional(),
});

type InventoryAppContext = ApiKeyContext & IdempotencyContext;

const tracer = trace.getTracer('@bokchoy/inventory');

async function fetchAvailableItemCodes(projectId: string): Promise<readonly string[]> {
  const rows = await withTenant(db, projectId, async (tx) =>
    tx.execute(sql`SELECT code FROM items WHERE project_id = ${projectId}::uuid ORDER BY code ASC`),
  );
  return Array.from(rows as ArrayLike<Record<string, unknown>>)
    .map((r) => r.code)
    .filter((c): c is string => typeof c === 'string');
}

async function grantHandler(
  c: Context<InventoryAppContext, '/v1/players/:playerExternalId/inventory/:itemCode/grant'>,
) {
  const projectId = c.get('projectId');
  const { playerExternalId, itemCode } = c.req.valid('param' as never) as {
    playerExternalId: string;
    itemCode: string;
  };
  const body = c.req.valid('json' as never) as z.infer<typeof grantBody>;
  const idempotencyKeyId = c.get('idempotencyKeyId');

  return tracer.startActiveSpan(
    'inventory.grant',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'item_grant_by_external_id',
        'bokchoy.project_id': projectId,
        'bokchoy.player_external_id_hash': hashPlayerExternalIdForOtel(playerExternalId),
        'bokchoy.item_code': itemCode,
        'bokchoy.amount': body.amount,
        'bokchoy.reason_code': body.reasonCode,
      },
    },
    async (span) => {
      try {
        const result = await withTenant(db, projectId, async (tx) =>
          inventoryGrantByExternalId(tx, {
            projectId,
            playerExternalId,
            itemCode,
            amount: body.amount,
            reasonCode: body.reasonCode,
            sourceEventId: body.sourceEventId,
            idempotencyKeyId,
            metadata: body.metadata,
          }),
        );
        span.setAttribute('inventory.stackable', result.stackable);
        if (result.stackable) {
          span.setAttribute('inventory.new_count', result.newCount);
          return c.json(
            {
              transactionId: result.transactionId,
              playerId: result.playerId,
              itemId: result.itemId,
              stackable: true as const,
              newCount: result.newCount,
            },
            201,
          );
        }
        span.setAttribute('inventory.instance_count', result.instanceIds.length);
        return c.json(
          {
            transactionId: result.transactionId,
            playerId: result.playerId,
            itemId: result.itemId,
            stackable: false as const,
            instanceIds: result.instanceIds,
          },
          201,
        );
      } catch (err) {
        if (err instanceof BcError && err.details.code === 'BC080') {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          const availableItems = await fetchAvailableItemCodes(projectId);
          return c.json(
            {
              error: {
                code: 'UNKNOWN_ITEM',
                message: `Item '${err.details.itemCode}' is not registered for this project`,
                itemCode: err.details.itemCode,
                availableItems,
              },
            },
            404,
          );
        }
        if (err instanceof BcError && err.details.code === 'BC081') {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          return c.json(
            {
              error: {
                code: 'INVENTORY_OVERFLOW',
                message: `Grant would exceed item max_count (current=${err.details.currentCount}, requested=${err.details.requestedAmount}, max=${err.details.maxCount})`,
                currentCount: err.details.currentCount,
                requestedAmount: err.details.requestedAmount,
                maxCount: err.details.maxCount,
                availableCapacity: err.details.availableCapacity,
              },
            },
            422,
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
}

async function consumeHandler(
  c: Context<InventoryAppContext, '/v1/players/:playerExternalId/inventory/:itemCode/consume'>,
) {
  const projectId = c.get('projectId');
  const { playerExternalId, itemCode } = c.req.valid('param' as never) as {
    playerExternalId: string;
    itemCode: string;
  };
  const body = c.req.valid('json' as never) as z.infer<typeof consumeBody>;
  const idempotencyKeyId = c.get('idempotencyKeyId');

  return tracer.startActiveSpan(
    'inventory.consume',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'item_consume_by_external_id',
        'bokchoy.project_id': projectId,
        'bokchoy.player_external_id_hash': hashPlayerExternalIdForOtel(playerExternalId),
        'bokchoy.item_code': itemCode,
        'bokchoy.amount': body.amount,
        'bokchoy.reason_code': body.reasonCode,
      },
    },
    async (span) => {
      try {
        const result = await withTenant(db, projectId, async (tx) =>
          inventoryConsumeByExternalId(tx, {
            projectId,
            playerExternalId,
            itemCode,
            amount: body.amount,
            reasonCode: body.reasonCode,
            instanceId: body.instanceId,
            sourceEventId: body.sourceEventId,
            idempotencyKeyId,
            metadata: body.metadata,
          }),
        );
        span.setAttribute('inventory.stackable', result.stackable);
        if (result.stackable) {
          span.setAttribute('inventory.new_count', result.newCount);
          return c.json(
            {
              transactionId: result.transactionId,
              playerId: result.playerId,
              itemId: result.itemId,
              stackable: true as const,
              newCount: result.newCount,
            },
            201,
          );
        }
        return c.json(
          {
            transactionId: result.transactionId,
            playerId: result.playerId,
            itemId: result.itemId,
            stackable: false as const,
            consumedInstanceId: result.consumedInstanceId,
          },
          201,
        );
      } catch (err) {
        if (err instanceof BcError && err.details.code === 'BC080') {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          const availableItems = await fetchAvailableItemCodes(projectId);
          return c.json(
            {
              error: {
                code: 'UNKNOWN_ITEM',
                message: `Item '${err.details.itemCode}' is not registered for this project`,
                itemCode: err.details.itemCode,
                availableItems,
              },
            },
            404,
          );
        }
        if (err instanceof BcError && err.details.code === 'BC082') {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          const d = err.details;
          if (d.variant === 'instance_not_owned') {
            return c.json(
              {
                error: {
                  code: 'INSUFFICIENT_INVENTORY',
                  message: `Instance '${d.instanceId}' is not owned by player '${d.playerExternalId}' for item '${d.itemCode}'`,
                  instanceId: d.instanceId,
                },
              },
              422,
            );
          }
          if (d.variant === 'instance_id_required') {
            return c.json(
              {
                error: {
                  code: 'INSUFFICIENT_INVENTORY',
                  message: 'Non-stackable consume requires instanceId in the request body',
                },
              },
              422,
            );
          }
          return c.json(
            {
              error: {
                code: 'INSUFFICIENT_INVENTORY',
                message: `Consume would push count below zero (current=${d.currentCount}, requested=${d.requestedAmount})`,
                currentCount: d.currentCount,
                requestedAmount: d.requestedAmount,
              },
            },
            422,
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
}

async function listHandler(
  c: Context<InventoryAppContext, '/v1/players/:playerExternalId/inventory'>,
) {
  const projectId = c.get('projectId');
  const { playerExternalId } = c.req.valid('param' as never) as { playerExternalId: string };
  const query = c.req.valid('query' as never) as z.infer<typeof listQueryParam>;
  const limit = query.limit;
  const startingAfter = query.starting_after;

  return tracer.startActiveSpan(
    'inventory.list',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'inventory_list_by_external_id',
        'bokchoy.project_id': projectId,
        'bokchoy.player_external_id_hash': hashPlayerExternalIdForOtel(playerExternalId),
        'bokchoy.limit': limit,
        'bokchoy.cursor': startingAfter === undefined ? 'first_page' : 'paginated',
      },
    },
    async (span) => {
      try {
        const result = await withTenant(db, projectId, async (tx) =>
          inventoryListByExternalId(tx, { projectId, playerExternalId, limit, startingAfter }),
        );
        span.setAttribute('inventory.row_count', result.data.length);
        span.setAttribute('inventory.has_more', result.hasMore);
        const data = result.data.map((row) => {
          const wire: Record<string, unknown> = {
            id: row.id,
            itemCode: row.itemCode,
            displayName: row.displayName,
            stackable: row.stackable,
            count: row.count,
            properties: row.properties,
            updatedAt: row.updatedAt.toISOString(),
          };
          if (row.instanceId !== null) wire.instanceId = row.instanceId;
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

async function itemHandler(
  c: Context<InventoryAppContext, '/v1/players/:playerExternalId/inventory/:itemCode'>,
) {
  const projectId = c.get('projectId');
  const { playerExternalId, itemCode } = c.req.valid('param' as never) as {
    playerExternalId: string;
    itemCode: string;
  };

  return tracer.startActiveSpan(
    'inventory.item',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'inventory_item_by_external_id',
        'bokchoy.project_id': projectId,
        'bokchoy.player_external_id_hash': hashPlayerExternalIdForOtel(playerExternalId),
        'bokchoy.item_code': itemCode,
      },
    },
    async (span) => {
      try {
        const result = await withTenant(db, projectId, async (tx) =>
          inventoryItemByExternalId(tx, { projectId, playerExternalId, itemCode }),
        );
        span.setAttribute('inventory.exists', result.exists);
        if (!result.exists) {
          return c.json({ itemCode, count: 0 }, 200);
        }
        span.setAttribute('inventory.stackable', result.stackable);
        if (result.stackable) {
          return c.json(
            {
              itemCode,
              displayName: result.displayName,
              stackable: true as const,
              count: result.count,
              version: result.version,
              updatedAt: result.updatedAt.toISOString(),
            },
            200,
          );
        }
        return c.json(
          {
            itemCode,
            displayName: result.displayName,
            stackable: false as const,
            instances: result.instances.map((i) => ({
              instanceId: i.instanceId,
              properties: i.properties,
              updatedAt: i.updatedAt.toISOString(),
            })),
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

export function mountInventoryRoutes(app: Hono<InventoryAppContext & AdminContext>): void {
  app.post(
    '/v1/players/:playerExternalId/inventory/:itemCode/grant',
    apiKeyMiddleware,
    idempotencyMiddleware,
    sValidator('param', playerItemParam, validationFailureHook),
    sValidator('json', grantBody, validationFailureHook),
    grantHandler,
  );
  app.post(
    '/v1/players/:playerExternalId/inventory/:itemCode/consume',
    apiKeyMiddleware,
    idempotencyMiddleware,
    sValidator('param', playerItemParam, validationFailureHook),
    sValidator('json', consumeBody, validationFailureHook),
    consumeHandler,
  );
  app.get(
    '/v1/players/:playerExternalId/inventory',
    apiKeyMiddleware,
    sValidator('param', playerOnlyParam, validationFailureHook),
    sValidator('query', listQueryParam, validationFailureHook),
    listHandler,
  );
  app.get(
    '/v1/players/:playerExternalId/inventory/:itemCode',
    apiKeyMiddleware,
    sValidator('param', playerItemParam, validationFailureHook),
    itemHandler,
  );
}
