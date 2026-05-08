// walletDebit wrapper per [[wrapper-shape]]. The SQL function stores
// transactions.amount as -amount per [[wallet-mechanics]] §3 ("positive for
// credit, negative for debit"); callers pass amount positive.

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import { rowToNumber, throwTranslated } from './internal';

export interface WalletDebitParams {
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

export async function walletDebit(db: Db | Tx, params: WalletDebitParams): Promise<number> {
  // TODO(otel): wrap with span per [[wallet-mechanics]] Amendment Part 1 A3 layer 1.
  try {
    const rows = await db.execute(sql`
      SELECT wallet_debit(
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
