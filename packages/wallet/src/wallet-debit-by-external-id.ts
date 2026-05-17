// walletDebitByExternalId wrapper per [[wallet/credit-route-contract]] (iii) +
// [[wrapper-shape]] D2-α. Sister to walletCreditByExternalId — same lazy-create
// + delegate shape. Calls wallet_debit_by_external_id from 0010 migration,
// which raises BC010 (InsufficientFunds) when the post-debit balance would
// breach the wallet's allow_negative_balance flag.

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import { readNumericAsString, readUuidOrText, rowToNumber, throwTranslated } from './internal';

export interface WalletDebitByExternalIdParams {
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

export interface WalletDebitByExternalIdResult {
  transactionId: number;
  walletId: string;
  playerId: string;
  balanceAfter: string;
}

export async function walletDebitByExternalId(
  db: Db | Tx,
  params: WalletDebitByExternalIdParams,
): Promise<WalletDebitByExternalIdResult> {
  try {
    const rows = await db.execute(sql`
      SELECT
        transaction_id,
        wallet_id,
        player_id,
        balance_after
      FROM wallet_debit_by_external_id(
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
