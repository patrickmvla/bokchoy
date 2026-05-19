/** SQL function: branch on items.stackable; stackable subtracts count, non-stackable deletes instance. Per [[inventory/inventory-contract]] (ii). */

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';
import {
  readBoolean,
  readIntOrNull,
  readUuid,
  readUuidOrNull,
  rowToNumber,
  throwTranslated,
} from './internal';

export interface InventoryConsumeByExternalIdParams {
  projectId: string;
  playerExternalId: string;
  itemCode: string;
  amount: number;
  reasonCode: string;
  /** Required when consuming a non-stackable item; ignored for stackable. */
  instanceId?: string;
  sourceEventId?: string;
  idempotencyKeyId?: number;
  metadata?: Record<string, unknown>;
}

export type InventoryConsumeByExternalIdResult =
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
      consumedInstanceId: string;
    };

export async function inventoryConsumeByExternalId(
  db: Db | Tx,
  params: InventoryConsumeByExternalIdParams,
): Promise<InventoryConsumeByExternalIdResult> {
  try {
    const rows = await db.execute(sql`
      SELECT
        transaction_id,
        player_id,
        item_id,
        stackable,
        new_count,
        consumed_instance_id
      FROM item_consume_by_external_id(
        ${params.projectId}::uuid,
        ${params.playerExternalId}::text,
        ${params.itemCode}::text,
        ${params.amount}::integer,
        ${params.reasonCode}::text,
        ${params.instanceId ?? null}::uuid,
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
        throw new Error('stackable consume returned null new_count');
      }
      return { stackable: true, transactionId, playerId, itemId, newCount };
    }
    const consumedInstanceId = readUuidOrNull(rows, 'consumed_instance_id');
    if (consumedInstanceId === null) {
      throw new Error('non-stackable consume returned null consumed_instance_id');
    }
    return { stackable: false, transactionId, playerId, itemId, consumedInstanceId };
  } catch (err) {
    throwTranslated(err);
  }
}
