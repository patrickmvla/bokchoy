/** Shop HTTP routes. Per [[shop/shop-contract]] (v)+(vi)+(viii) + Contract section. */

import { withTenant } from '@bokchoy/db';
import { getOffer, listOffers, type OfferView, purchaseOfferByExternalId } from '@bokchoy/shop';
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
const OFFER_CODE_RE = /^[A-Za-z0-9_]{1,64}$/;
const CURRENCY_CODE_RE = /^[A-Za-z0-9_]{1,16}$/;

const playerOnlyParam = z.object({
  playerExternalId: z.string().regex(PLAYER_EXTERNAL_ID_RE),
});

const offerCodeParam = z.object({
  offerCode: z.string().regex(OFFER_CODE_RE),
});

// Body is exactly {offer, payWith?} per [[shop/shop-contract]] (127) — no caller metadata at MVP.
const purchaseBody = z.object({
  offer: z.string().regex(OFFER_CODE_RE),
  payWith: z.string().regex(CURRENCY_CODE_RE).optional(),
});

type ShopAppContext = ApiKeyContext & IdempotencyContext;

const tracer = trace.getTracer('@bokchoy/shop');

async function fetchAcceptedCurrencies(
  projectId: string,
  offerCode: string,
): Promise<readonly string[]> {
  const rows = await withTenant(db, projectId, async (tx) =>
    tx.execute(sql`
      SELECT c.code
      FROM offer_prices op
      JOIN offers o     ON o.id = op.offer_id
      JOIN currencies c ON c.id = op.currency_id
      WHERE op.project_id = ${projectId}::uuid AND o.code = ${offerCode}::text
      ORDER BY c.code ASC
    `),
  );
  return Array.from(rows as ArrayLike<Record<string, unknown>>)
    .map((r) => r.code)
    .filter((code): code is string => typeof code === 'string');
}

async function purchaseHandler(
  c: Context<ShopAppContext, '/v1/players/:playerExternalId/purchases'>,
) {
  const projectId = c.get('projectId');
  const { playerExternalId } = c.req.valid('param' as never) as { playerExternalId: string };
  const body = c.req.valid('json' as never) as z.infer<typeof purchaseBody>;
  const idempotencyKeyId = c.get('idempotencyKeyId');

  return tracer.startActiveSpan(
    'shop.purchase',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'purchase_offer_by_external_id',
        'bokchoy.project_id': projectId,
        'bokchoy.player_external_id_hash': hashPlayerExternalIdForOtel(playerExternalId),
        'bokchoy.offer_code': body.offer,
        'bokchoy.pay_with': body.payWith ?? 'inferred',
      },
    },
    async (span) => {
      try {
        const result = await withTenant(db, projectId, async (tx) =>
          purchaseOfferByExternalId(tx, {
            projectId,
            playerExternalId,
            offerCode: body.offer,
            payWithCurrencyCode: body.payWith,
            idempotencyKeyId,
          }),
        );
        span.setAttribute('bokchoy.purchase_id', result.purchaseId);
        span.setAttribute('shop.granted_count', result.granted.length);
        const granted = result.granted.map((g) => {
          const wire: { itemCode: string; quantity: number; instanceIds?: readonly string[] } = {
            itemCode: g.itemCode,
            quantity: g.quantity,
          };
          if (!g.stackable) wire.instanceIds = g.instanceIds;
          return wire;
        });
        return c.json(
          {
            purchaseId: result.purchaseId,
            offer: body.offer,
            paid: { currencyCode: result.paidCurrencyCode, amount: result.paidAmount },
            granted,
          },
          201,
        );
      } catch (err) {
        if (err instanceof BcError && err.details.code === 'BC090') {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          return c.json(
            {
              error: {
                code: 'UNKNOWN_OFFER',
                message: `Offer '${err.details.offerCode}' is not registered for this project`,
                offerCode: err.details.offerCode,
              },
            },
            404,
          );
        }
        if (err instanceof BcError && err.details.code === 'BC091') {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          return c.json(
            {
              error: {
                code: 'OFFER_INACTIVE',
                message: `Offer '${err.details.offerCode}' is not active`,
                offerCode: err.details.offerCode,
              },
            },
            422,
          );
        }
        if (err instanceof BcError && err.details.code === 'BC093') {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          return c.json(
            {
              error: {
                code: 'OFFER_MISCONFIGURED',
                message: `Offer '${err.details.offerCode}' has no items and cannot be purchased`,
                offerCode: err.details.offerCode,
              },
            },
            422,
          );
        }
        if (err instanceof BcError && err.details.code === 'BC092') {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          const acceptedCurrencies = await fetchAcceptedCurrencies(projectId, body.offer);
          const message =
            err.details.variant === 'pay_with_required'
              ? `Offer '${body.offer}' has ${err.details.priceOptionCount} price options — payWith is required`
              : `Currency '${err.details.currencyCode}' is not accepted for offer '${err.details.offerCode}'`;
          return c.json(
            { error: { code: 'INVALID_PAYMENT_CURRENCY', message, acceptedCurrencies } },
            422,
          );
        }
        if (err instanceof BcError && err.details.code === 'BC081') {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          return c.json(
            {
              error: {
                code: 'INVENTORY_OVERFLOW',
                message: `Purchase grant would exceed item max_count (current=${err.details.currentCount}, requested=${err.details.requestedAmount}, max=${err.details.maxCount})`,
                currentCount: err.details.currentCount,
                requestedAmount: err.details.requestedAmount,
                maxCount: err.details.maxCount,
                availableCapacity: err.details.availableCapacity,
              },
            },
            422,
          );
        }
        // BC010 (InsufficientFunds) + BC020 (TenantMismatch) fall through to the global
        // errorMiddleware (422 INSUFFICIENT_FUNDS / 500 BC020) — consistent with the wallet /debit route.
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

async function listOffersHandler(c: Context<ShopAppContext, '/v1/offers'>) {
  const projectId = c.get('projectId');

  return tracer.startActiveSpan(
    'shop.list_offers',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'list_offers',
        'bokchoy.project_id': projectId,
      },
    },
    async (span) => {
      try {
        const offers = await withTenant(db, projectId, async (tx) => listOffers(tx, { projectId }));
        span.setAttribute('shop.offer_count', offers.length);
        return c.json({ data: offers.map(toOfferWire) }, 200);
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

async function getOfferHandler(c: Context<ShopAppContext, '/v1/offers/:offerCode'>) {
  const projectId = c.get('projectId');
  const { offerCode } = c.req.valid('param' as never) as { offerCode: string };

  return tracer.startActiveSpan(
    'shop.get_offer',
    {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': 'get_offer',
        'bokchoy.project_id': projectId,
        'bokchoy.offer_code': offerCode,
      },
    },
    async (span) => {
      try {
        const offer = await withTenant(db, projectId, async (tx) =>
          getOffer(tx, { projectId, offerCode }),
        );
        span.setAttribute('shop.offer_found', offer !== null);
        if (offer === null) {
          return c.json(
            {
              error: {
                code: 'UNKNOWN_OFFER',
                message: `Offer '${offerCode}' is not registered for this project`,
                offerCode,
              },
            },
            404,
          );
        }
        return c.json(toOfferWire(offer), 200);
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

// amount is a NUMERIC string per [[shop/contract-reconciliation-2026-05-21]] D2: offer_prices.amount is
// NUMERIC(20,4) (>2^53-capable), so string preserves precision and matches the wallet wire.
function toOfferWire(offer: OfferView) {
  return {
    code: offer.code,
    displayName: offer.displayName,
    description: offer.description,
    active: offer.active,
    prices: offer.prices.map((p) => ({ currencyCode: p.currencyCode, amount: p.amount })),
    items: offer.items.map((i) => ({ itemCode: i.itemCode, quantity: i.quantity })),
  };
}

export function mountShopRoutes(app: Hono<ShopAppContext & AdminContext>): void {
  app.post(
    '/v1/players/:playerExternalId/purchases',
    apiKeyMiddleware,
    idempotencyMiddleware,
    sValidator('param', playerOnlyParam, validationFailureHook),
    sValidator('json', purchaseBody, validationFailureHook),
    purchaseHandler,
  );
  // Project-scoped catalog reads — no idempotency on GETs (Stripe convention).
  app.get('/v1/offers', apiKeyMiddleware, listOffersHandler);
  app.get(
    '/v1/offers/:offerCode',
    apiKeyMiddleware,
    sValidator('param', offerCodeParam, validationFailureHook),
    getOfferHandler,
  );
}
