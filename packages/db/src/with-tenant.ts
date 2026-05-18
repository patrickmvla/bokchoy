import { sql } from 'drizzle-orm';
import type { Db } from './client';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// Branded type — only obtainable inside withTenant(); type-level mirror of RLS. Per [[backend-stack]] F1.
declare const tenantBrand: unique symbol;
export type TenantTx = Tx & { readonly [tenantBrand]: never };

export async function withTenant<T>(
  db: Db,
  projectId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${projectId}, true)`);
    return await fn(tx as TenantTx);
  });
}
