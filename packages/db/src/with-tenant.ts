import { sql } from 'drizzle-orm';
import type { Db } from './client';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function withTenant<T>(
  db: Db,
  projectId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${projectId}, true)`);
    return await fn(tx);
  });
}
