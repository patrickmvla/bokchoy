// bootstrapProjectReasonCodes wrapper per [[wrapper-shape]]. Calls the SQL
// function from 0005_bootstrap_reason_codes.sql which inserts the 12 system
// reason codes (8 faucets + 4 drains, all is_system=TRUE) per
// [[economy-primitives-research]] F6 + [[wallet-mechanics]] Amendment Part 3 A17.
//
// Idempotent via INSERT … ON CONFLICT DO NOTHING. Returns the count of newly-
// inserted rows (12 on first call, 0 on subsequent calls, partial on partial
// pre-existing state). The function never raises BCxxx codes by design —
// throwTranslated re-raises any unexpected PostgresError with its original
// SQLSTATE.

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import { rowToNumber, throwTranslated } from './internal';

export interface BootstrapProjectReasonCodesParams {
  projectId: string;
}

export async function bootstrapProjectReasonCodes(
  db: Db | Tx,
  params: BootstrapProjectReasonCodesParams,
): Promise<number> {
  try {
    const rows = await db.execute(sql`
      SELECT bootstrap_project_reason_codes(${params.projectId}::uuid) AS inserted
    `);
    return rowToNumber(rows, 'inserted');
  } catch (err) {
    throwTranslated(err);
  }
}
