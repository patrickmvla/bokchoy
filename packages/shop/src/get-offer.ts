/** Catalog read: a single offer by code (any active state). Per [[shop/shop-contract]] (132) — null when absent, caller maps to 404 BC090. */

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import { type OfferView, parseOfferRow } from './offer-view';

export interface GetOfferParams {
  projectId: string;
  offerCode: string;
}

export type GetOfferResult = OfferView | null;

export async function getOffer(db: Db | Tx, params: GetOfferParams): Promise<GetOfferResult> {
  const rows = await db.execute(sql`
    SELECT
      o.code,
      o.display_name,
      o.description,
      o.active,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('currencyCode', c.code, 'amount', op.amount::text) ORDER BY c.code)
        FROM offer_prices op
        JOIN currencies c ON c.id = op.currency_id
        WHERE op.project_id = o.project_id AND op.offer_id = o.id
      ), '[]'::jsonb) AS prices,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('itemCode', i.code, 'quantity', oi.quantity) ORDER BY i.code)
        FROM offer_items oi
        JOIN items i ON i.id = oi.item_id
        WHERE oi.project_id = o.project_id AND oi.offer_id = o.id
      ), '[]'::jsonb) AS items
    FROM offers o
    WHERE o.project_id = ${params.projectId}::uuid
      AND o.code = ${params.offerCode}::text
    LIMIT 1
  `);

  const arr = rows as ArrayLike<Record<string, unknown>>;
  if (arr.length === 0) return null;
  return parseOfferRow(arr[0] as Record<string, unknown>);
}
