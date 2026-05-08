// walletDeidentifyPlayer wrapper per [[wrapper-shape]]. Calls the SQL function
// from 0004_wallet_functions.sql which projects player_id → UUIDv8 via
// HMAC-SHA-256(player_id, app.bokchoy.anon_secret) per
// [[wallet-mechanics]] Amendment Part 2 A10. Returns the count of transactions
// rows touched (also used as the de-id confirmation by ops).
//
// The function expects `app.current_tenant` to be set; calling outside
// withTenant(...) raises (unset GUC) or returns 0 (wrong-tenant GUC, since
// RLS scopes the UPDATE to that project's rows). Callers MUST wrap in
// withTenant for the player's project.

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import { rowToNumber, throwTranslated } from './internal';

export interface WalletDeidentifyPlayerParams {
  playerId: string;
}

export async function walletDeidentifyPlayer(
  db: Db | Tx,
  params: WalletDeidentifyPlayerParams,
): Promise<number> {
  // TODO(otel): wrap with span per [[wallet-mechanics]] Amendment Part 1 A3 layer 1.
  try {
    const rows = await db.execute(sql`
      SELECT wallet_deidentify_player(${params.playerId}::uuid) AS rows_touched
    `);
    return rowToNumber(rows, 'rows_touched');
  } catch (err) {
    throwTranslated(err);
  }
}
