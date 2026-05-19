/** Single-item player inventory read. Per [[inventory/inventory-contract]] (iii) #4 — stateless, branched on items.stackable. */

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';

export interface InventoryItemByExternalIdParams {
  projectId: string;
  playerExternalId: string;
  itemCode: string;
}

export interface InventoryItemInstance {
  instanceId: string;
  properties: Record<string, unknown>;
  updatedAt: Date;
}

export type InventoryItemByExternalIdResult =
  | { exists: false; itemCode: string }
  | {
      exists: true;
      stackable: true;
      itemCode: string;
      displayName: string;
      count: number;
      version: number;
      updatedAt: Date;
    }
  | {
      exists: true;
      stackable: false;
      itemCode: string;
      displayName: string;
      instances: InventoryItemInstance[];
    };

export async function inventoryItemByExternalId(
  db: Db | Tx,
  params: InventoryItemByExternalIdParams,
): Promise<InventoryItemByExternalIdResult> {
  // (1) Resolve item by code first — drives the response shape via stackable flag.
  const itemRows = await db.execute(sql`
    SELECT id, display_name, stackable
    FROM items
    WHERE project_id = ${params.projectId}::uuid AND code = ${params.itemCode}::text
    LIMIT 1
  `);

  const itemArr = itemRows as ArrayLike<Record<string, unknown>>;
  if (itemArr.length === 0) {
    return { exists: false, itemCode: params.itemCode };
  }
  const itemRow = itemArr[0] as Record<string, unknown>;
  const displayName = itemRow.display_name;
  const stackable = itemRow.stackable;
  if (typeof displayName !== 'string' || typeof stackable !== 'boolean') {
    throw new Error('unexpected items row shape');
  }

  if (stackable) {
    const invRows = await db.execute(sql`
      SELECT inv.count, inv.version, inv.updated_at
      FROM inventory inv
      JOIN players p ON p.id = inv.player_id
      WHERE inv.project_id = ${params.projectId}::uuid
        AND p.external_id = ${params.playerExternalId}::text
        AND inv.item_id = ${itemRow.id as string}::uuid
        AND inv.instance_id IS NULL
      LIMIT 1
    `);
    const invArr = invRows as ArrayLike<Record<string, unknown>>;
    if (invArr.length === 0) {
      return {
        exists: true,
        stackable: true,
        itemCode: params.itemCode,
        displayName,
        count: 0,
        version: 0,
        updatedAt: new Date(0),
      };
    }
    const invRow = invArr[0] as Record<string, unknown>;
    return {
      exists: true,
      stackable: true,
      itemCode: params.itemCode,
      displayName,
      count: parseIntField(invRow.count, 'count'),
      version: parseIntField(invRow.version, 'version'),
      updatedAt: parseDateField(invRow.updated_at, 'updated_at'),
    };
  }

  // Non-stackable: return all instances.
  const instRows = await db.execute(sql`
    SELECT inv.instance_id, inv.properties, inv.updated_at
    FROM inventory inv
    JOIN players p ON p.id = inv.player_id
    WHERE inv.project_id = ${params.projectId}::uuid
      AND p.external_id = ${params.playerExternalId}::text
      AND inv.item_id = ${itemRow.id as string}::uuid
      AND inv.instance_id IS NOT NULL
    ORDER BY inv.id DESC
  `);
  const instArr = instRows as ArrayLike<Record<string, unknown>>;
  const instances: InventoryItemInstance[] = [];
  for (let i = 0; i < instArr.length; i++) {
    const r = instArr[i] as Record<string, unknown>;
    const instanceIdRaw = r.instance_id;
    if (typeof instanceIdRaw !== 'string') {
      throw new Error(`unexpected instance_id type: ${typeof instanceIdRaw}`);
    }
    const propsRaw = r.properties;
    const properties: Record<string, unknown> =
      propsRaw === null || propsRaw === undefined
        ? {}
        : typeof propsRaw === 'object'
          ? (propsRaw as Record<string, unknown>)
          : {};
    instances.push({
      instanceId: instanceIdRaw,
      properties,
      updatedAt: parseDateField(r.updated_at, 'updated_at'),
    });
  }
  return {
    exists: true,
    stackable: false,
    itemCode: params.itemCode,
    displayName,
    instances,
  };
}

function parseIntField(value: unknown, label: string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`${label}=${value} is not finite`);
    return n;
  }
  throw new Error(`unexpected ${label} type: ${typeof value}`);
}

function parseDateField(value: unknown, label: string): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  throw new Error(`unexpected ${label} type: ${typeof value}`);
}
