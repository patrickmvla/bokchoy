import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import { rowToNumber, throwTranslated } from './internal';

export interface BootstrapProjectReasonCodesParams {
  projectId: string;
}

/** Idempotent via ON CONFLICT DO NOTHING. Returns newly-inserted row count (12 on first call, 0 on replays). */
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
