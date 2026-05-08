// walletCredit wrapper per [[wrapper-shape]]. Calls the SQL function defined
// in packages/db/drizzle/0004_wallet_functions.sql; the function handles the
// FOR UPDATE row lock + idempotency-replay shape internally.

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import { rowToNumber, throwTranslated } from './internal';

export interface WalletCreditParams {
  projectId: string;
  walletId: string;
  amount: number;
  currencyId: string;
  reasonCode: string;
  sourceEventId?: string;
  idempotencyKeyId?: number;
  relatedId?: number;
  relatedType?: 'loot_roll' | 'iap_receipt' | 'compensation_grant';
  metadata?: Record<string, unknown>;
}

export async function walletCredit(db: Db | Tx, params: WalletCreditParams): Promise<number> {
  // TODO(otel): wrap with span per [[wallet-mechanics]] Amendment Part 1 A3 layer 1.
  try {
    const rows = await db.execute(sql`
      SELECT wallet_credit(
        ${params.projectId}::uuid,
        ${params.walletId}::uuid,
        ${params.amount}::numeric,
        ${params.currencyId}::uuid,
        ${params.reasonCode}::text,
        ${params.sourceEventId ?? null}::text,
        ${params.idempotencyKeyId ?? null}::bigint,
        ${params.relatedId ?? null}::bigint,
        ${params.relatedType ?? null}::text,
        ${JSON.stringify(params.metadata ?? {})}::jsonb
      ) AS id
    `);
    return rowToNumber(rows, 'id');
  } catch (err) {
    throwTranslated(err);
  }
}
