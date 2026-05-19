/** Player inventory list. Per [[inventory/inventory-contract]] (iii) #3 — cursor on inventory.id, limit+1 hasMore, stateless reads. */

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';

export interface InventoryListByExternalIdParams {
  projectId: string;
  playerExternalId: string;
  /** Caller pre-clamps to [1, 100]. */
  limit: number;
  startingAfter?: number;
}

export interface InventoryListRow {
  id: number;
  itemCode: string;
  displayName: string;
  stackable: boolean;
  count: number;
  instanceId: string | null;
  properties: Record<string, unknown>;
  updatedAt: Date;
}

export interface InventoryListByExternalIdResult {
  data: InventoryListRow[];
  hasMore: boolean;
}

export async function inventoryListByExternalId(
  db: Db | Tx,
  params: InventoryListByExternalIdParams,
): Promise<InventoryListByExternalIdResult> {
  const rows = await db.execute(sql`
    SELECT
      inv.id          AS id,
      it.code         AS item_code,
      it.display_name AS display_name,
      it.stackable    AS stackable,
      inv.count       AS count,
      inv.instance_id AS instance_id,
      inv.properties  AS properties,
      inv.updated_at  AS updated_at
    FROM inventory inv
    JOIN players p ON p.id = inv.player_id
    JOIN items   it ON it.id = inv.item_id
    WHERE inv.project_id = ${params.projectId}::uuid
      AND p.external_id  = ${params.playerExternalId}::text
      AND (${params.startingAfter ?? null}::bigint IS NULL OR inv.id < ${params.startingAfter ?? null}::bigint)
    ORDER BY inv.id DESC
    LIMIT ${params.limit + 1}
  `);

  const arr = rows as ArrayLike<Record<string, unknown>>;
  const fetched: InventoryListRow[] = [];
  for (let i = 0; i < arr.length; i++) {
    fetched.push(parseRow(arr[i] as Record<string, unknown>));
  }
  const hasMore = fetched.length > params.limit;
  const data = hasMore ? fetched.slice(0, params.limit) : fetched;
  return { data, hasMore };
}

function parseRow(row: Record<string, unknown>): InventoryListRow {
  const id = parseBigintSafe(row.id, 'id');

  const itemCode = row.item_code;
  if (typeof itemCode !== 'string')
    throw new Error(`unexpected item_code type: ${typeof itemCode}`);

  const displayName = row.display_name;
  if (typeof displayName !== 'string')
    throw new Error(`unexpected display_name type: ${typeof displayName}`);

  const stackable = row.stackable;
  if (typeof stackable !== 'boolean')
    throw new Error(`unexpected stackable type: ${typeof stackable}`);

  const countRaw = row.count;
  let count: number;
  if (typeof countRaw === 'number') count = countRaw;
  else if (typeof countRaw === 'string') count = Number(countRaw);
  else throw new Error(`unexpected count type: ${typeof countRaw}`);

  const instanceIdRaw = row.instance_id;
  const instanceId =
    instanceIdRaw === null ? null : typeof instanceIdRaw === 'string' ? instanceIdRaw : null;

  const propertiesRaw = row.properties;
  let properties: Record<string, unknown>;
  if (propertiesRaw === null || propertiesRaw === undefined) properties = {};
  else if (typeof propertiesRaw === 'object') properties = propertiesRaw as Record<string, unknown>;
  else throw new Error(`unexpected properties type: ${typeof propertiesRaw}`);

  const updatedAtRaw = row.updated_at;
  let updatedAt: Date;
  if (updatedAtRaw instanceof Date) updatedAt = updatedAtRaw;
  else if (typeof updatedAtRaw === 'string') updatedAt = new Date(updatedAtRaw);
  else throw new Error(`unexpected updated_at type: ${typeof updatedAtRaw}`);

  return { id, itemCode, displayName, stackable, count, instanceId, properties, updatedAt };
}

function parseBigintSafe(value: unknown, label: string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${label}=${value} exceeds Number.MAX_SAFE_INTEGER`);
    }
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${label}=${value} is not finite`);
    if (parsed > Number.MAX_SAFE_INTEGER) {
      throw new Error(`${label}=${value} exceeds Number.MAX_SAFE_INTEGER`);
    }
    return parsed;
  }
  throw new Error(`unexpected ${label} type: ${typeof value}`);
}
