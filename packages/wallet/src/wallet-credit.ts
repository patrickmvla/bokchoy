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
