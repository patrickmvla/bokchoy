/** Player-centric balance read. Per [[wallet/balance-history-contract]] (v) — stateless, no row materialization. */

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';

export interface WalletBalanceByExternalIdParams {
  projectId: string;
  playerExternalId: string;
  currencyCode: string;
}

export type WalletBalanceByExternalIdResult =
  | { exists: false }
  | {
      exists: true;
      walletId: string;
      playerId: string;
      balance: string;
      updatedAt: Date;
    };

export async function walletBalanceByExternalId(
  db: Db | Tx,
  params: WalletBalanceByExternalIdParams,
): Promise<WalletBalanceByExternalIdResult> {
  const rows = await db.execute(sql`
    SELECT
      w.id          AS wallet_id,
      w.player_id   AS player_id,
      w.balance     AS balance,
      w.updated_at  AS updated_at
    FROM wallets w
    JOIN players    p ON p.id = w.player_id
    JOIN currencies c ON c.id = w.currency_id
    WHERE w.project_id = ${params.projectId}::uuid
      AND p.external_id = ${params.playerExternalId}::text
      AND c.code = ${params.currencyCode}::text
    LIMIT 1
  `);

  const arr = rows as ArrayLike<Record<string, unknown>>;
  if (arr.length === 0) return { exists: false };

  const row = arr[0] as Record<string, unknown>;
  const walletId = row.wallet_id;
  const playerId = row.player_id;
  const balanceRaw = row.balance;
  const updatedAtRaw = row.updated_at;

  if (typeof walletId !== 'string') {
    throw new Error(`unexpected wallet_id type: ${typeof walletId}`);
  }
  if (typeof playerId !== 'string') {
    throw new Error(`unexpected player_id type: ${typeof playerId}`);
  }
  let balance: string;
  if (typeof balanceRaw === 'string') balance = balanceRaw;
  else if (typeof balanceRaw === 'number') balance = balanceRaw.toString();
  else throw new Error(`unexpected balance type: ${typeof balanceRaw}`);

  let updatedAt: Date;
  if (updatedAtRaw instanceof Date) updatedAt = updatedAtRaw;
  else if (typeof updatedAtRaw === 'string') updatedAt = new Date(updatedAtRaw);
  else throw new Error(`unexpected updated_at type: ${typeof updatedAtRaw}`);

  return { exists: true, walletId, playerId, balance, updatedAt };
}
