import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import { rowToNumber, throwTranslated } from './internal';

export interface WalletDeidentifyPlayerParams {
  playerId: string;
}

/** Caller MUST wrap in withTenant — function reads `app.current_tenant` GUC and scopes the UPDATE via RLS. */
export async function walletDeidentifyPlayer(
  db: Db | Tx,
  params: WalletDeidentifyPlayerParams,
): Promise<number> {
  try {
    const rows = await db.execute(sql`
      SELECT wallet_deidentify_player(${params.playerId}::uuid) AS rows_touched
    `);
    return rowToNumber(rows, 'rows_touched');
  } catch (err) {
    throwTranslated(err);
  }
}
