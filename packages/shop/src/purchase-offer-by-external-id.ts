/** SQL function: atomic offer purchase (debit + N grants) in one txn. Per [[shop/shop-contract]] (iii)+(iv). */

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import {
  readNumericAsString,
  readUuid,
  readUuidOrText,
  rowField,
  throwTranslated,
} from './internal';

export interface PurchaseOfferByExternalIdParams {
  projectId: string;
  playerExternalId: string;
  offerCode: string;
  /** Required only when the offer's price-set has >1 currency; inferred when exactly 1. */
  payWithCurrencyCode?: string;
  idempotencyKeyId?: number;
  metadata?: Record<string, unknown>;
}

/** One ledger grant per offer item, discriminated by the item's stackable flag (mirrors @bokchoy/inventory grant). */
export type PurchaseGrantedItem =
  | { itemCode: string; quantity: number; stackable: true; newCount: number }
  | { itemCode: string; quantity: number; stackable: false; instanceIds: readonly string[] };

export interface PurchaseOfferByExternalIdResult {
  purchaseId: string;
  paidCurrencyCode: string;
  /** Server-authoritative charged amount, NUMERIC(20,4) kept as string to preserve precision past 2^53. */
  paidAmount: string;
  granted: PurchaseGrantedItem[];
}

export async function purchaseOfferByExternalId(
  db: Db | Tx,
  params: PurchaseOfferByExternalIdParams,
): Promise<PurchaseOfferByExternalIdResult> {
  try {
    const rows = await db.execute(sql`
      SELECT
        purchase_id,
        paid_currency_code,
        paid_amount,
        granted
      FROM purchase_offer_by_external_id(
        ${params.projectId}::uuid,
        ${params.playerExternalId}::text,
        ${params.offerCode}::text,
        ${params.payWithCurrencyCode ?? null}::text,
        ${params.idempotencyKeyId ?? null}::bigint,
        ${JSON.stringify(params.metadata ?? {})}::jsonb
      )
    `);
    return {
      purchaseId: readUuid(rows, 'purchase_id'),
      paidCurrencyCode: readUuidOrText(rows, 'paid_currency_code'),
      paidAmount: readNumericAsString(rows, 'paid_amount'),
      granted: parseGranted(rowField(rows, 'granted')),
    };
  } catch (err) {
    throwTranslated(err);
  }
}

function parseGranted(value: unknown): PurchaseGrantedItem[] {
  const arr = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(arr)) {
    throw new Error(`unexpected granted type: ${typeof value}`);
  }
  return arr.map(parseGrantedItem);
}

function parseGrantedItem(raw: unknown): PurchaseGrantedItem {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`unexpected granted item type: ${typeof raw}`);
  }
  const o = raw as Record<string, unknown>;

  const itemCode = o.itemCode;
  if (typeof itemCode !== 'string') throw new Error(`unexpected itemCode type: ${typeof itemCode}`);

  const quantity = toFiniteNumber(o.quantity, 'quantity');

  const stackable = o.stackable;
  if (typeof stackable !== 'boolean')
    throw new Error(`unexpected stackable type: ${typeof stackable}`);

  if (stackable) {
    return {
      itemCode,
      quantity,
      stackable: true,
      newCount: toFiniteNumber(o.newCount, 'newCount'),
    };
  }

  const instanceIdsRaw = o.instanceIds;
  if (!Array.isArray(instanceIdsRaw))
    throw new Error(`unexpected instanceIds type: ${typeof instanceIdsRaw}`);
  for (const id of instanceIdsRaw) {
    if (typeof id !== 'string')
      throw new Error(`unexpected instanceIds element type: ${typeof id}`);
  }
  return { itemCode, quantity, stackable: false, instanceIds: instanceIdsRaw as readonly string[] };
}

function toFiniteNumber(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`unexpected ${label} value: ${String(value)}`);
}
