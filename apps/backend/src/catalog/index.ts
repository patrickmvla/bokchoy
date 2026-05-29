/** @module Admin catalog CRUD — currencies + items + offers. Per [[cockpit/admin-catalog-endpoints-contract]]. */

import {
  currencies,
  inventory,
  items,
  offerItems,
  offerPrices,
  offers,
  type Tx,
  wallets,
  withTenant,
} from '@bokchoy/db';
import { type Hook, sValidator } from '@hono/standard-validator';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Context, Env, Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, adminGate } from '../admin';
import type { ApiKeyContext } from '../auth';
import type { IdempotencyContext } from '../idempotency';
import { db } from '../infra';

const tracer = trace.getTracer('@bokchoy/catalog');

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

/** Carries an HTTP status + wire body from inside a transaction out to the handler boundary. */
class CatalogError extends Error {
  constructor(
    readonly status: 404 | 409 | 422,
    readonly body: { code: string; message: string } & Record<string, unknown>,
  ) {
    super(body.message);
  }
}

/**
 * postgres.js attaches SQLSTATE on `code` and the violated constraint on `constraint_name`.
 * Drizzle wraps the driver error in `DrizzleQueryError`, so the PostgresError is at `.cause` —
 * check both levels.
 */
function isPgConstraint(err: unknown, sqlstate: string, constraintName?: string): boolean {
  const candidates = [err, (err as { cause?: unknown })?.cause];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const e = candidate as { code?: string; constraint_name?: string };
    if (
      e.code === sqlstate &&
      (constraintName === undefined || e.constraint_name === constraintName)
    ) {
      return true;
    }
  }
  return false;
}

/** Maps CatalogError to its wire response; rethrows everything else for the 500 path. */
function mapCatalogError(c: Context, err: unknown): Response {
  if (err instanceof CatalogError) return c.json({ error: err.body }, err.status);
  throw err;
}

const CURRENCY_CODE = /^[A-Za-z0-9_]{1,16}$/;
const ITEM_CODE = /^[A-Za-z0-9_]{1,64}$/;
const OFFER_CODE = /^[A-Za-z0-9_]{1,64}$/;
const AMOUNT = /^\d{1,16}(\.\d{1,4})?$/; // NUMERIC(20,4); >0 enforced by refine + DB CHECK

const createCurrencyBody = z.object({
  code: z.string().regex(CURRENCY_CODE),
  displayName: z.string().trim().min(1).max(128),
  description: z.string().nullish(),
  decimals: z.number().int().min(0).max(8).optional(),
  isPremium: z.boolean().optional(),
  isTradable: z.boolean().optional(),
});
const patchCurrencyBody = z.object({
  displayName: z.string().trim().min(1).max(128).optional(),
  description: z.string().nullish(),
  decimals: z.number().int().min(0).max(8).optional(),
  isPremium: z.boolean().optional(),
  isTradable: z.boolean().optional(),
});

const createItemBody = z
  .object({
    code: z.string().regex(ITEM_CODE),
    displayName: z.string().trim().min(1).max(128),
    description: z.string().nullish(),
    stackable: z.boolean().optional(),
    maxCount: z.number().int().positive().nullish(),
    active: z.boolean().optional(),
  })
  .refine((v) => v.stackable !== false || v.maxCount == null, {
    message: 'maxCount must be null for non-stackable items',
    path: ['maxCount'],
  });
const patchItemBody = z.object({
  displayName: z.string().trim().min(1).max(128).optional(),
  description: z.string().nullish(),
  maxCount: z.number().int().positive().nullish(),
  active: z.boolean().optional(),
});

const offerPriceInput = z.object({
  currencyCode: z.string().regex(CURRENCY_CODE),
  amount: z
    .string()
    .regex(AMOUNT)
    .refine((v) => Number(v) > 0, { message: 'amount must be > 0' }),
});
const offerItemInput = z.object({
  itemCode: z.string().regex(ITEM_CODE),
  quantity: z.number().int().positive(),
});
const createOfferBody = z.object({
  code: z.string().regex(OFFER_CODE),
  displayName: z.string().trim().min(1).max(128),
  description: z.string().nullish(),
  active: z.boolean().optional(),
  prices: z.array(offerPriceInput),
  items: z.array(offerItemInput),
});
const patchOfferBody = z.object({
  displayName: z.string().trim().min(1).max(128).optional(),
  description: z.string().nullish(),
  active: z.boolean().optional(),
  prices: z.array(offerPriceInput).optional(),
  items: z.array(offerItemInput).optional(),
});

const projectParam = z.object({ projectId: z.uuid() });
const currencyParam = z.object({ projectId: z.uuid(), currencyId: z.uuid() });
const itemParam = z.object({ projectId: z.uuid(), itemId: z.uuid() });
const offerParam = z.object({ projectId: z.uuid(), offerId: z.uuid() });

// Hono generic invariance forces the parent app's exact context union on `mount`.
type CatalogAppContext = ApiKeyContext & IdempotencyContext & AdminContext;

/** F2: code (and item.stackable, F3) are immutable. Reject a PATCH that tries to set them. */
async function rejectImmutable(c: Context, fields: readonly string[]): Promise<Response | null> {
  let raw: Record<string, unknown>;
  try {
    raw = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
  const offending = fields.find((f) => Object.hasOwn(raw, f));
  if (offending) {
    return c.json(
      {
        error: {
          code: 'IMMUTABLE_FIELD',
          message: `Field '${offending}' is immutable; create a new resource and deactivate the old one instead.`,
          field: offending,
        },
      },
      422,
    );
  }
  return null;
}

function withSpan<T>(
  name: string,
  projectId: string,
  c: Context,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    {
      attributes: {
        'db.system': 'postgresql',
        'bokchoy.project_id': projectId,
        'bokchoy.user_id': c.var['admin.member'].userId,
      },
    },
    async (s) => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof Error) {
          s.recordException(err);
          s.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        }
        throw err;
      } finally {
        s.end();
      }
    },
  );
}

// ---- currencies -----------------------------------------------------------

async function listCurrenciesHandler(
  c: Context<AdminContext, '/v1/projects/:projectId/currencies'>,
) {
  const projectId = c.req.param('projectId') as string;
  const rows = await withSpan('catalog.currencies.list', projectId, c, () =>
    withTenant(db, projectId, async (tx) =>
      tx
        .select()
        .from(currencies)
        .where(eq(currencies.projectId, projectId))
        .orderBy(desc(currencies.createdAt)),
    ),
  );
  return c.json(rows, 200);
}

async function createCurrencyHandler(
  c: Context<AdminContext, '/v1/projects/:projectId/currencies'>,
) {
  const projectId = c.req.param('projectId') as string;
  const body = c.req.valid('json' as never) as z.infer<typeof createCurrencyBody>;
  try {
    const row = await withSpan('catalog.currencies.create', projectId, c, () =>
      withTenant(db, projectId, async (tx) => {
        const [inserted] = await tx
          .insert(currencies)
          .values({
            projectId,
            code: body.code,
            displayName: body.displayName,
            description: body.description ?? null,
            decimals: body.decimals,
            isPremium: body.isPremium,
            isTradable: body.isTradable,
          })
          .returning();
        if (!inserted) throw new Error('currencies.insert returned no row');
        return inserted;
      }),
    );
    return c.json(row, 201);
  } catch (err) {
    if (isPgConstraint(err, '23505', 'currencies_project_id_code_unique')) {
      return c.json(
        {
          error: {
            code: 'CODE_TAKEN',
            message: `A currency with code '${body.code}' already exists.`,
            resourceCode: body.code,
          },
        },
        409,
      );
    }
    return mapCatalogError(c, err);
  }
}

async function patchCurrencyHandler(
  c: Context<AdminContext, '/v1/projects/:projectId/currencies/:currencyId'>,
) {
  const projectId = c.req.param('projectId') as string;
  const currencyId = c.req.param('currencyId') as string;
  const blocked = await rejectImmutable(c, ['code']);
  if (blocked) return blocked;
  const body = c.req.valid('json' as never) as z.infer<typeof patchCurrencyBody>;
  try {
    const row = await withSpan('catalog.currencies.update', projectId, c, () =>
      withTenant(db, projectId, async (tx) => {
        const set: Partial<typeof currencies.$inferInsert> = { updatedAt: new Date() };
        if (body.displayName !== undefined) set.displayName = body.displayName;
        if (body.description !== undefined) set.description = body.description;
        if (body.decimals !== undefined) set.decimals = body.decimals;
        if (body.isPremium !== undefined) set.isPremium = body.isPremium;
        if (body.isTradable !== undefined) set.isTradable = body.isTradable;
        const [updated] = await tx
          .update(currencies)
          .set(set)
          .where(and(eq(currencies.projectId, projectId), eq(currencies.id, currencyId)))
          .returning();
        if (!updated)
          throw new CatalogError(404, {
            code: 'CURRENCY_NOT_FOUND',
            message: 'Currency not found in this project.',
          });
        return updated;
      }),
    );
    return c.json(row, 200);
  } catch (err) {
    return mapCatalogError(c, err);
  }
}

async function deleteCurrencyHandler(
  c: Context<AdminContext, '/v1/projects/:projectId/currencies/:currencyId'>,
) {
  const projectId = c.req.param('projectId') as string;
  const currencyId = c.req.param('currencyId') as string;
  try {
    await withSpan('catalog.currencies.delete', projectId, c, () =>
      withTenant(db, projectId, async (tx) => {
        const [existing] = await tx
          .select({ id: currencies.id, code: currencies.code })
          .from(currencies)
          .where(and(eq(currencies.projectId, projectId), eq(currencies.id, currencyId)))
          .limit(1);
        if (!existing)
          throw new CatalogError(404, {
            code: 'CURRENCY_NOT_FOUND',
            message: 'Currency not found in this project.',
          });

        const offerRefs = await tx
          .selectDistinct({ code: offers.code })
          .from(offerPrices)
          .innerJoin(offers, eq(offers.id, offerPrices.offerId))
          .where(and(eq(offerPrices.projectId, projectId), eq(offerPrices.currencyId, currencyId)));
        const [walletAgg] = await tx
          .select({ value: count() })
          .from(wallets)
          .where(and(eq(wallets.projectId, projectId), eq(wallets.currencyId, currencyId)));
        const walletCount = walletAgg?.value ?? 0;

        if (offerRefs.length > 0 || walletCount > 0) {
          throw inUseError('currency', existing.code, offerRefs, walletCount, 'player_wallet');
        }
        await tx
          .delete(currencies)
          .where(and(eq(currencies.projectId, projectId), eq(currencies.id, currencyId)));
      }),
    );
    return c.body(null, 204);
  } catch (err) {
    if (isPgConstraint(err, '23503')) {
      return c.json(
        {
          error: {
            code: 'RESOURCE_IN_USE',
            message: 'Currency is referenced and cannot be deleted.',
            resource: 'currency',
          },
        },
        409,
      );
    }
    return mapCatalogError(c, err);
  }
}

// ---- items ----------------------------------------------------------------

async function listItemsHandler(c: Context<AdminContext, '/v1/projects/:projectId/items'>) {
  const projectId = c.req.param('projectId') as string;
  const rows = await withSpan('catalog.items.list', projectId, c, () =>
    withTenant(db, projectId, async (tx) =>
      tx.select().from(items).where(eq(items.projectId, projectId)).orderBy(desc(items.createdAt)),
    ),
  );
  return c.json(rows, 200);
}

async function createItemHandler(c: Context<AdminContext, '/v1/projects/:projectId/items'>) {
  const projectId = c.req.param('projectId') as string;
  const body = c.req.valid('json' as never) as z.infer<typeof createItemBody>;
  try {
    const row = await withSpan('catalog.items.create', projectId, c, () =>
      withTenant(db, projectId, async (tx) => {
        const [inserted] = await tx
          .insert(items)
          .values({
            projectId,
            code: body.code,
            displayName: body.displayName,
            description: body.description ?? null,
            stackable: body.stackable,
            maxCount: body.maxCount ?? null,
            active: body.active,
          })
          .returning();
        if (!inserted) throw new Error('items.insert returned no row');
        return inserted;
      }),
    );
    return c.json(row, 201);
  } catch (err) {
    if (isPgConstraint(err, '23505', 'items_project_id_code_unique')) {
      return c.json(
        {
          error: {
            code: 'CODE_TAKEN',
            message: `An item with code '${body.code}' already exists.`,
            resourceCode: body.code,
          },
        },
        409,
      );
    }
    return mapCatalogError(c, err);
  }
}

async function patchItemHandler(c: Context<AdminContext, '/v1/projects/:projectId/items/:itemId'>) {
  const projectId = c.req.param('projectId') as string;
  const itemId = c.req.param('itemId') as string;
  const blocked = await rejectImmutable(c, ['code', 'stackable']);
  if (blocked) return blocked;
  const body = c.req.valid('json' as never) as z.infer<typeof patchItemBody>;
  try {
    const row = await withSpan('catalog.items.update', projectId, c, () =>
      withTenant(db, projectId, async (tx) => {
        const set: Partial<typeof items.$inferInsert> = { updatedAt: new Date() };
        if (body.displayName !== undefined) set.displayName = body.displayName;
        if (body.description !== undefined) set.description = body.description;
        if (body.maxCount !== undefined) set.maxCount = body.maxCount;
        if (body.active !== undefined) set.active = body.active;
        const [updated] = await tx
          .update(items)
          .set(set)
          .where(and(eq(items.projectId, projectId), eq(items.id, itemId)))
          .returning();
        if (!updated)
          throw new CatalogError(404, {
            code: 'ITEM_NOT_FOUND',
            message: 'Item not found in this project.',
          });
        return updated;
      }),
    );
    return c.json(row, 200);
  } catch (err) {
    if (isPgConstraint(err, '23514', 'items_max_count_consistency_check')) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'maxCount must be null for non-stackable items.',
          },
        },
        400,
      );
    }
    return mapCatalogError(c, err);
  }
}

async function deleteItemHandler(
  c: Context<AdminContext, '/v1/projects/:projectId/items/:itemId'>,
) {
  const projectId = c.req.param('projectId') as string;
  const itemId = c.req.param('itemId') as string;
  try {
    await withSpan('catalog.items.delete', projectId, c, () =>
      withTenant(db, projectId, async (tx) => {
        const [existing] = await tx
          .select({ id: items.id, code: items.code })
          .from(items)
          .where(and(eq(items.projectId, projectId), eq(items.id, itemId)))
          .limit(1);
        if (!existing)
          throw new CatalogError(404, {
            code: 'ITEM_NOT_FOUND',
            message: 'Item not found in this project.',
          });

        const offerRefs = await tx
          .selectDistinct({ code: offers.code })
          .from(offerItems)
          .innerJoin(offers, eq(offers.id, offerItems.offerId))
          .where(and(eq(offerItems.projectId, projectId), eq(offerItems.itemId, itemId)));
        const [invAgg] = await tx
          .select({ value: count() })
          .from(inventory)
          .where(and(eq(inventory.projectId, projectId), eq(inventory.itemId, itemId)));
        const invCount = invAgg?.value ?? 0;

        if (offerRefs.length > 0 || invCount > 0) {
          throw inUseError('item', existing.code, offerRefs, invCount, 'player_inventory');
        }
        await tx.delete(items).where(and(eq(items.projectId, projectId), eq(items.id, itemId)));
      }),
    );
    return c.body(null, 204);
  } catch (err) {
    if (isPgConstraint(err, '23503')) {
      return c.json(
        {
          error: {
            code: 'RESOURCE_IN_USE',
            message: 'Item is referenced and cannot be deleted.',
            resource: 'item',
          },
        },
        409,
      );
    }
    return mapCatalogError(c, err);
  }
}

// ---- offers (nested-aggregate, F1) ----------------------------------------

type OfferAdmin = {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  prices: Array<{ id: string; currencyId: string; currencyCode: string; amount: string }>;
  items: Array<{ id: string; itemId: string; itemCode: string; quantity: number }>;
};

async function loadOffers(tx: Tx, projectId: string, offerId?: string): Promise<OfferAdmin[]> {
  const offerRows = await tx
    .select()
    .from(offers)
    .where(
      offerId
        ? and(eq(offers.projectId, projectId), eq(offers.id, offerId))
        : eq(offers.projectId, projectId),
    )
    .orderBy(desc(offers.createdAt));
  if (offerRows.length === 0) return [];
  const ids = offerRows.map((o) => o.id);

  const priceRows = await tx
    .select({
      offerId: offerPrices.offerId,
      id: offerPrices.id,
      currencyId: offerPrices.currencyId,
      currencyCode: currencies.code,
      amount: offerPrices.amount,
    })
    .from(offerPrices)
    .innerJoin(currencies, eq(currencies.id, offerPrices.currencyId))
    .where(and(eq(offerPrices.projectId, projectId), inArray(offerPrices.offerId, ids)));
  const itemRows = await tx
    .select({
      offerId: offerItems.offerId,
      id: offerItems.id,
      itemId: offerItems.itemId,
      itemCode: items.code,
      quantity: offerItems.quantity,
    })
    .from(offerItems)
    .innerJoin(items, eq(items.id, offerItems.itemId))
    .where(and(eq(offerItems.projectId, projectId), inArray(offerItems.offerId, ids)));

  return offerRows.map((o) => ({
    id: o.id,
    code: o.code,
    displayName: o.displayName,
    description: o.description,
    active: o.active,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    prices: priceRows
      .filter((p) => p.offerId === o.id)
      .map((p) => ({
        id: p.id,
        currencyId: p.currencyId,
        currencyCode: p.currencyCode,
        amount: p.amount,
      })),
    items: itemRows
      .filter((i) => i.offerId === o.id)
      .map((i) => ({ id: i.id, itemId: i.itemId, itemCode: i.itemCode, quantity: i.quantity })),
  }));
}

async function resolveCodes(
  tx: Tx,
  projectId: string,
  table: typeof currencies | typeof items,
  codes: readonly string[],
): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  const rows = await tx
    .select({ id: table.id, code: table.code })
    .from(table)
    .where(and(eq(table.projectId, projectId), inArray(table.code, [...new Set(codes)])));
  return new Map(rows.map((r) => [r.code, r.id]));
}

function mustGet(map: Map<string, string>, key: string): string {
  const v = map.get(key);
  if (v === undefined) throw new Error(`unreachable: code '${key}' was not resolved`);
  return v;
}

function inUseError(
  resource: 'currency' | 'item',
  resourceCode: string,
  offerRefs: ReadonlyArray<{ code: string }>,
  blockingCount: number,
  blockingType: 'player_wallet' | 'player_inventory',
): CatalogError {
  const removableReferences = offerRefs.map((o) => ({ type: 'offer' as const, code: o.code }));
  const blockingReferences =
    blockingCount > 0 ? [{ type: blockingType, count: blockingCount }] : [];
  const parts: string[] = [];
  if (removableReferences.length > 0) {
    parts.push(
      `referenced by offers ${removableReferences.map((r) => r.code).join(', ')} — remove from those first`,
    );
  }
  if (blockingCount > 0) {
    parts.push(
      blockingType === 'player_wallet'
        ? `held by ${blockingCount} player wallet(s) — currency retirement is not supported at this tier`
        : `held by ${blockingCount} player(s) — deactivate (active=false) instead`,
    );
  }
  return new CatalogError(409, {
    code: 'RESOURCE_IN_USE',
    message: `${resourceCode} is ${parts.join('; ')}.`,
    resource,
    resourceCode,
    removableReferences,
    blockingReferences,
  });
}

function offerMisconfigured(code: string): CatalogError {
  return new CatalogError(422, {
    code: 'OFFER_MISCONFIGURED',
    message: 'An active offer requires at least one price and at least one item.',
    offerCode: code,
  });
}

function unknownCodeError(
  kind: 'CURRENCY' | 'ITEM',
  unknown: string[],
  available: string[],
): CatalogError {
  return new CatalogError(422, {
    code: `UNKNOWN_${kind}`,
    message: `Unknown ${kind.toLowerCase()} code(s): ${unknown.join(', ')}.`,
    unknown,
    available,
  });
}

async function listOffersHandler(c: Context<AdminContext, '/v1/projects/:projectId/offers'>) {
  const projectId = c.req.param('projectId') as string;
  const rows = await withSpan('catalog.offers.list', projectId, c, () =>
    withTenant(db, projectId, (tx) => loadOffers(tx, projectId)),
  );
  return c.json(rows, 200);
}

async function getOfferHandler(
  c: Context<AdminContext, '/v1/projects/:projectId/offers/:offerId'>,
) {
  const projectId = c.req.param('projectId') as string;
  const offerId = c.req.param('offerId') as string;
  try {
    const offer = await withSpan('catalog.offers.get', projectId, c, () =>
      withTenant(db, projectId, async (tx) => {
        const [row] = await loadOffers(tx, projectId, offerId);
        if (!row)
          throw new CatalogError(404, {
            code: 'OFFER_NOT_FOUND',
            message: 'Offer not found in this project.',
          });
        return row;
      }),
    );
    return c.json(offer, 200);
  } catch (err) {
    return mapCatalogError(c, err);
  }
}

async function createOfferHandler(c: Context<AdminContext, '/v1/projects/:projectId/offers'>) {
  const projectId = c.req.param('projectId') as string;
  const body = c.req.valid('json' as never) as z.infer<typeof createOfferBody>;
  try {
    const offer = await withSpan('catalog.offers.create', projectId, c, () =>
      withTenant(db, projectId, async (tx) => {
        const currencyMap = await resolveCodes(
          tx,
          projectId,
          currencies,
          body.prices.map((p) => p.currencyCode),
        );
        const unknownCur = body.prices
          .map((p) => p.currencyCode)
          .filter((code) => !currencyMap.has(code));
        if (unknownCur.length > 0)
          throw unknownCodeError('CURRENCY', [...new Set(unknownCur)], [...currencyMap.keys()]);

        const itemMap = await resolveCodes(
          tx,
          projectId,
          items,
          body.items.map((i) => i.itemCode),
        );
        const unknownItem = body.items.map((i) => i.itemCode).filter((code) => !itemMap.has(code));
        if (unknownItem.length > 0)
          throw unknownCodeError('ITEM', [...new Set(unknownItem)], [...itemMap.keys()]);

        const active = body.active ?? true;
        if (active && (body.prices.length === 0 || body.items.length === 0))
          throw offerMisconfigured(body.code);

        const [offerRow] = await tx
          .insert(offers)
          .values({
            projectId,
            code: body.code,
            displayName: body.displayName,
            description: body.description ?? null,
            active,
          })
          .returning();
        if (!offerRow) throw new Error('offers.insert returned no row');

        if (body.prices.length > 0) {
          await tx.insert(offerPrices).values(
            body.prices.map((p) => ({
              projectId,
              offerId: offerRow.id,
              currencyId: mustGet(currencyMap, p.currencyCode),
              amount: p.amount,
            })),
          );
        }
        if (body.items.length > 0) {
          await tx.insert(offerItems).values(
            body.items.map((i) => ({
              projectId,
              offerId: offerRow.id,
              itemId: mustGet(itemMap, i.itemCode),
              quantity: i.quantity,
            })),
          );
        }

        const [assembled] = await loadOffers(tx, projectId, offerRow.id);
        if (!assembled) throw new Error('offer assembly returned no row');
        return assembled;
      }),
    );
    return c.json(offer, 201);
  } catch (err) {
    if (isPgConstraint(err, '23505', 'offers_project_id_code_unique')) {
      return c.json(
        {
          error: {
            code: 'CODE_TAKEN',
            message: `An offer with code '${body.code}' already exists.`,
            resourceCode: body.code,
          },
        },
        409,
      );
    }
    return mapCatalogError(c, err);
  }
}

async function patchOfferHandler(
  c: Context<AdminContext, '/v1/projects/:projectId/offers/:offerId'>,
) {
  const projectId = c.req.param('projectId') as string;
  const offerId = c.req.param('offerId') as string;
  const blocked = await rejectImmutable(c, ['code']);
  if (blocked) return blocked;
  const body = c.req.valid('json' as never) as z.infer<typeof patchOfferBody>;
  try {
    const offer = await withSpan('catalog.offers.update', projectId, c, () =>
      withTenant(db, projectId, async (tx) => {
        const [existing] = await tx
          .select()
          .from(offers)
          .where(and(eq(offers.projectId, projectId), eq(offers.id, offerId)))
          .limit(1);
        if (!existing)
          throw new CatalogError(404, {
            code: 'OFFER_NOT_FOUND',
            message: 'Offer not found in this project.',
          });

        let currencyMap: Map<string, string> | undefined;
        if (body.prices) {
          currencyMap = await resolveCodes(
            tx,
            projectId,
            currencies,
            body.prices.map((p) => p.currencyCode),
          );
          const resolved = currencyMap;
          const unknown = body.prices
            .map((p) => p.currencyCode)
            .filter((code) => !resolved.has(code));
          if (unknown.length > 0)
            throw unknownCodeError('CURRENCY', [...new Set(unknown)], [...resolved.keys()]);
        }
        let itemMap: Map<string, string> | undefined;
        if (body.items) {
          itemMap = await resolveCodes(
            tx,
            projectId,
            items,
            body.items.map((i) => i.itemCode),
          );
          const resolved = itemMap;
          const unknown = body.items.map((i) => i.itemCode).filter((code) => !resolved.has(code));
          if (unknown.length > 0)
            throw unknownCodeError('ITEM', [...new Set(unknown)], [...resolved.keys()]);
        }

        const nextActive = body.active ?? existing.active;
        const nextPriceCount = body.prices
          ? body.prices.length
          : ((
              await tx
                .select({ value: count() })
                .from(offerPrices)
                .where(and(eq(offerPrices.projectId, projectId), eq(offerPrices.offerId, offerId)))
            )[0]?.value ?? 0);
        const nextItemCount = body.items
          ? body.items.length
          : ((
              await tx
                .select({ value: count() })
                .from(offerItems)
                .where(and(eq(offerItems.projectId, projectId), eq(offerItems.offerId, offerId)))
            )[0]?.value ?? 0);
        if (nextActive && (nextPriceCount === 0 || nextItemCount === 0))
          throw offerMisconfigured(existing.code);

        const set: Partial<typeof offers.$inferInsert> = { updatedAt: new Date() };
        if (body.displayName !== undefined) set.displayName = body.displayName;
        if (body.description !== undefined) set.description = body.description;
        if (body.active !== undefined) set.active = body.active;
        await tx
          .update(offers)
          .set(set)
          .where(and(eq(offers.projectId, projectId), eq(offers.id, offerId)));

        if (body.prices && currencyMap) {
          const resolved = currencyMap;
          await tx
            .delete(offerPrices)
            .where(and(eq(offerPrices.projectId, projectId), eq(offerPrices.offerId, offerId)));
          if (body.prices.length > 0) {
            await tx.insert(offerPrices).values(
              body.prices.map((p) => ({
                projectId,
                offerId,
                currencyId: mustGet(resolved, p.currencyCode),
                amount: p.amount,
              })),
            );
          }
        }
        if (body.items && itemMap) {
          const resolved = itemMap;
          await tx
            .delete(offerItems)
            .where(and(eq(offerItems.projectId, projectId), eq(offerItems.offerId, offerId)));
          if (body.items.length > 0) {
            await tx.insert(offerItems).values(
              body.items.map((i) => ({
                projectId,
                offerId,
                itemId: mustGet(resolved, i.itemCode),
                quantity: i.quantity,
              })),
            );
          }
        }

        const [assembled] = await loadOffers(tx, projectId, offerId);
        if (!assembled) throw new Error('offer assembly returned no row');
        return assembled;
      }),
    );
    return c.json(offer, 200);
  } catch (err) {
    return mapCatalogError(c, err);
  }
}

async function deleteOfferHandler(
  c: Context<AdminContext, '/v1/projects/:projectId/offers/:offerId'>,
) {
  const projectId = c.req.param('projectId') as string;
  const offerId = c.req.param('offerId') as string;
  try {
    await withSpan('catalog.offers.delete', projectId, c, () =>
      withTenant(db, projectId, async (tx) => {
        // Offers own their children — delete them first (restrict-FK order), then the offer row.
        await tx
          .delete(offerItems)
          .where(and(eq(offerItems.projectId, projectId), eq(offerItems.offerId, offerId)));
        await tx
          .delete(offerPrices)
          .where(and(eq(offerPrices.projectId, projectId), eq(offerPrices.offerId, offerId)));
        const deleted = await tx
          .delete(offers)
          .where(and(eq(offers.projectId, projectId), eq(offers.id, offerId)))
          .returning({ id: offers.id });
        if (deleted.length === 0)
          throw new CatalogError(404, {
            code: 'OFFER_NOT_FOUND',
            message: 'Offer not found in this project.',
          });
      }),
    );
    return c.body(null, 204);
  } catch (err) {
    return mapCatalogError(c, err);
  }
}

export function mountCatalogRoutes(app: Hono<CatalogAppContext>): void {
  app.get(
    '/v1/projects/:projectId/currencies',
    adminGate({ resource: 'currency', actions: ['read'], projectIdParam: 'projectId' }),
    sValidator('param', projectParam, validationFailureHook),
    listCurrenciesHandler,
  );
  app.post(
    '/v1/projects/:projectId/currencies',
    adminGate({ resource: 'currency', actions: ['create'], projectIdParam: 'projectId' }),
    sValidator('param', projectParam, validationFailureHook),
    sValidator('json', createCurrencyBody, validationFailureHook),
    createCurrencyHandler,
  );
  app.patch(
    '/v1/projects/:projectId/currencies/:currencyId',
    adminGate({ resource: 'currency', actions: ['update'], projectIdParam: 'projectId' }),
    sValidator('param', currencyParam, validationFailureHook),
    sValidator('json', patchCurrencyBody, validationFailureHook),
    patchCurrencyHandler,
  );
  app.delete(
    '/v1/projects/:projectId/currencies/:currencyId',
    adminGate({ resource: 'currency', actions: ['delete'], projectIdParam: 'projectId' }),
    sValidator('param', currencyParam, validationFailureHook),
    deleteCurrencyHandler,
  );

  app.get(
    '/v1/projects/:projectId/items',
    adminGate({ resource: 'item', actions: ['read'], projectIdParam: 'projectId' }),
    sValidator('param', projectParam, validationFailureHook),
    listItemsHandler,
  );
  app.post(
    '/v1/projects/:projectId/items',
    adminGate({ resource: 'item', actions: ['create'], projectIdParam: 'projectId' }),
    sValidator('param', projectParam, validationFailureHook),
    sValidator('json', createItemBody, validationFailureHook),
    createItemHandler,
  );
  app.patch(
    '/v1/projects/:projectId/items/:itemId',
    adminGate({ resource: 'item', actions: ['update'], projectIdParam: 'projectId' }),
    sValidator('param', itemParam, validationFailureHook),
    sValidator('json', patchItemBody, validationFailureHook),
    patchItemHandler,
  );
  app.delete(
    '/v1/projects/:projectId/items/:itemId',
    adminGate({ resource: 'item', actions: ['delete'], projectIdParam: 'projectId' }),
    sValidator('param', itemParam, validationFailureHook),
    deleteItemHandler,
  );

  app.get(
    '/v1/projects/:projectId/offers',
    adminGate({ resource: 'offer', actions: ['read'], projectIdParam: 'projectId' }),
    sValidator('param', projectParam, validationFailureHook),
    listOffersHandler,
  );
  app.get(
    '/v1/projects/:projectId/offers/:offerId',
    adminGate({ resource: 'offer', actions: ['read'], projectIdParam: 'projectId' }),
    sValidator('param', offerParam, validationFailureHook),
    getOfferHandler,
  );
  app.post(
    '/v1/projects/:projectId/offers',
    adminGate({ resource: 'offer', actions: ['create'], projectIdParam: 'projectId' }),
    sValidator('param', projectParam, validationFailureHook),
    sValidator('json', createOfferBody, validationFailureHook),
    createOfferHandler,
  );
  app.patch(
    '/v1/projects/:projectId/offers/:offerId',
    adminGate({ resource: 'offer', actions: ['update'], projectIdParam: 'projectId' }),
    sValidator('param', offerParam, validationFailureHook),
    sValidator('json', patchOfferBody, validationFailureHook),
    patchOfferHandler,
  );
  app.delete(
    '/v1/projects/:projectId/offers/:offerId',
    adminGate({ resource: 'offer', actions: ['delete'], projectIdParam: 'projectId' }),
    sValidator('param', offerParam, validationFailureHook),
    deleteOfferHandler,
  );
}
