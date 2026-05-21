/** Catalog read: active offers with prices + items. Per [[shop/shop-contract]] (v) GET /v1/offers. */

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import { type OfferView, parseOfferRow } from './offer-view';

export interface ListOffersParams {
  projectId: string;
}

export type ListOffersResult = OfferView[];

export async function listOffers(db: Db | Tx, params: ListOffersParams): Promise<ListOffersResult> {
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
      AND o.active = true
    ORDER BY o.code
  `);

  const arr = rows as ArrayLike<Record<string, unknown>>;
  const out: OfferView[] = [];
  for (let i = 0; i < arr.length; i++) {
    out.push(parseOfferRow(arr[i] as Record<string, unknown>));
  }
  return out;
}
