/** SQL function: resolves currency → BC060 if absent, lazy-creates player+wallet, delegates to wallet_credit. */

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import { readNumericAsString, readUuidOrText, rowToNumber, throwTranslated } from './internal';

export interface WalletCreditByExternalIdParams {
  projectId: string;
  playerExternalId: string;
  currencyCode: string;
  amount: number;
  reasonCode: string;
  sourceEventId?: string;
  idempotencyKeyId?: number;
  relatedId?: number;
  relatedType?: 'loot_roll' | 'iap_receipt' | 'compensation_grant';
  metadata?: Record<string, unknown>;
}

export interface WalletCreditByExternalIdResult {
  transactionId: number;
  walletId: string;
  playerId: string;
  balanceAfter: string;
}

export async function walletCreditByExternalId(
  db: Db | Tx,
  params: WalletCreditByExternalIdParams,
): Promise<WalletCreditByExternalIdResult> {
  try {
    const rows = await db.execute(sql`
      SELECT
        transaction_id,
        wallet_id,
        player_id,
        balance_after
      FROM wallet_credit_by_external_id(
        ${params.projectId}::uuid,
        ${params.playerExternalId}::text,
        ${params.currencyCode}::text,
        ${params.amount}::numeric,
        ${params.reasonCode}::text,
        ${params.sourceEventId ?? null}::text,
        ${params.idempotencyKeyId ?? null}::bigint,
        ${params.relatedId ?? null}::bigint,
        ${params.relatedType ?? null}::text,
        ${JSON.stringify(params.metadata ?? {})}::jsonb
      )
    `);
    return {
      transactionId: rowToNumber(rows, 'transaction_id'),
      walletId: readUuidOrText(rows, 'wallet_id'),
      playerId: readUuidOrText(rows, 'player_id'),
      balanceAfter: readNumericAsString(rows, 'balance_after'),
    };
  } catch (err) {
    throwTranslated(err);
  }
}
