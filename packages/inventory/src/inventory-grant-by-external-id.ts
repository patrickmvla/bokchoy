/** SQL function: lazy-creates player, branches on items.stackable. Per [[inventory/inventory-contract]] (ii). */

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import {
  readBoolean,
  readIntOrNull,
  readUuid,
  readUuidArrayOrNull,
  rowToNumber,
  throwTranslated,
} from './internal';

export interface InventoryGrantByExternalIdParams {
  projectId: string;
  playerExternalId: string;
  itemCode: string;
  amount: number;
  reasonCode: string;
  sourceEventId?: string;
  idempotencyKeyId?: number;
  metadata?: Record<string, unknown>;
}

export type InventoryGrantByExternalIdResult =
  | {
      stackable: true;
      transactionId: number;
      playerId: string;
      itemId: string;
      newCount: number;
    }
  | {
      stackable: false;
      transactionId: number;
      playerId: string;
      itemId: string;
      instanceIds: readonly string[];
    };

export async function inventoryGrantByExternalId(
  db: Db | Tx,
  params: InventoryGrantByExternalIdParams,
): Promise<InventoryGrantByExternalIdResult> {
  try {
    const rows = await db.execute(sql`
      SELECT
        transaction_id,
        player_id,
        item_id,
        stackable,
        new_count,
        instance_ids
      FROM item_grant_by_external_id(
        ${params.projectId}::uuid,
        ${params.playerExternalId}::text,
        ${params.itemCode}::text,
        ${params.amount}::integer,
        ${params.reasonCode}::text,
        ${params.sourceEventId ?? null}::text,
        ${params.idempotencyKeyId ?? null}::bigint,
        ${JSON.stringify(params.metadata ?? {})}::jsonb
      )
    `);
    const transactionId = rowToNumber(rows, 'transaction_id');
    const playerId = readUuid(rows, 'player_id');
    const itemId = readUuid(rows, 'item_id');
    const stackable = readBoolean(rows, 'stackable');
    if (stackable) {
      const newCount = readIntOrNull(rows, 'new_count');
      if (newCount === null) {
        throw new Error('stackable grant returned null new_count');
      }
      return { stackable: true, transactionId, playerId, itemId, newCount };
    }
    const instanceIds = readUuidArrayOrNull(rows, 'instance_ids');
    if (instanceIds === null) {
      throw new Error('non-stackable grant returned null instance_ids');
    }
    return { stackable: false, transactionId, playerId, itemId, instanceIds };
  } catch (err) {
    throwTranslated(err);
  }
}
