import { sql } from 'drizzle-orm';
import type { Db } from './client';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// Type-level mirror of RLS physical enforcement per [[backend-stack]] F1
// mitigation #2 + [[wallet-http-contract]] G6. The brand is a `unique symbol`
// (not a string) so the only way to obtain a TenantTx is to be inside a
// withTenant() callback — code that requires TenantTx at the type level cannot
// be passed a raw Tx without an explicit `as` cast.
//
// Future RLS-protected accessors (cockpit reads, reaper queries, etc.) can
// require TenantTx in their signatures and reject raw Tx at compile time. The
// pattern is opt-in: @bokchoy/wallet wrappers still accept `Db | Tx` per
// [[wrapper-shape]] Fork 1 because the SQL-side current_setting() check is
// the runtime defense; the brand is the type-level mirror, not the substitute.
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
