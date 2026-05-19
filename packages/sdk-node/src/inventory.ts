/** inventory namespace — player-centric item grant/consume/list/get. Per [[inventory/inventory-contract]] (iii). */

import type { HttpClient } from './http';

/** Parameters for inventory.grant. */
export interface InventoryGrantParams {
  /** Customer-controlled player identifier; URL-safe per backend regex `[A-Za-z0-9._-]{1,128}`. */
  player: string;
  /** Item slug registered in this project (e.g. `'health_potion'`). */
  item: string;
  /** Positive integer count; clamped to 10,000 server-side. */
  amount: number;
  /** Reason code registered for this project — see /docs/reason-codes. */
  reason: string;
  /** Optional dedup hint propagated to the audit log; 1-255 chars. */
  sourceEventId?: string;
  /** Optional Idempotency-Key; auto-generated as `bokchoy-sdk-retry-${uuid4()}` if omitted. */
  idempotencyKey?: string;
  /** Customer-defined opaque payload stored on the transaction row. */
  metadata?: Record<string, unknown>;
}

/** Discriminated grant result — stackable consolidates count, non-stackable mints UUID instances. */
export type InventoryGrantResult =
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
      instanceIds: ReadonlyArray<string>;
    };

/** Parameters for inventory.consume. */
export interface InventoryConsumeParams {
  player: string;
  item: string;
  amount: number;
  reason: string;
  /** Required when consuming a non-stackable item; ignored for stackable. UUID format. */
  instanceId?: string;
  sourceEventId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

/** Discriminated consume result. */
export type InventoryConsumeResult =
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

/** Parameters for inventory.list. */
export interface InventoryListParams {
  player: string;
  /** Page size, default 10, max 100 enforced server-side. */
  limit?: number;
  /** Cursor — pass `nextCursor` from a previous response. Opaque to callers. */
  startingAfter?: number;
}

/** One row in an inventory.list response. */
export interface InventoryListItem {
  id: number;
  itemCode: string;
  displayName: string;
  stackable: boolean;
  count: number;
  /** Present for non-stackable rows, absent for stackable. */
  instanceId?: string;
  properties: Record<string, unknown>;
  updatedAt: string;
}

export interface InventoryListResult {
  data: InventoryListItem[];
  hasMore: boolean;
  /** Opaque cursor — pass to the next call's `startingAfter`. Only present when `hasMore` is true. */
  nextCursor?: number;
}

/** Parameters for inventory.get — single-item player state. */
export interface InventoryGetParams {
  player: string;
  item: string;
}

export interface InventoryInstance {
  instanceId: string;
  properties: Record<string, unknown>;
  updatedAt: string;
}

/**
 * Discriminated single-item result.
 * - `{count: 0}` shape: unknown item OR unknown player OR no rows yet (stackable default).
 * - `{stackable: true, count, version, updatedAt}`: stackable item with state.
 * - `{stackable: false, instances: [...]}`: non-stackable item with N owned instances.
 */
export type InventoryGetResult =
  | { itemCode: string; count: 0 }
  | {
      itemCode: string;
      displayName: string;
      stackable: true;
      count: number;
      version: number;
      updatedAt: string;
    }
  | {
      itemCode: string;
      displayName: string;
      stackable: false;
      instances: InventoryInstance[];
    };

interface GrantWireBody {
  amount: number;
  reasonCode: string;
  sourceEventId?: string;
  metadata?: Record<string, unknown>;
}

interface ConsumeWireBody extends GrantWireBody {
  instanceId?: string;
}

function toGrantWireBody(params: InventoryGrantParams): GrantWireBody {
  const body: GrantWireBody = { amount: params.amount, reasonCode: params.reason };
  if (params.sourceEventId !== undefined) body.sourceEventId = params.sourceEventId;
  if (params.metadata !== undefined) body.metadata = params.metadata;
  return body;
}

function toConsumeWireBody(params: InventoryConsumeParams): ConsumeWireBody {
  const body: ConsumeWireBody = { amount: params.amount, reasonCode: params.reason };
  if (params.instanceId !== undefined) body.instanceId = params.instanceId;
  if (params.sourceEventId !== undefined) body.sourceEventId = params.sourceEventId;
  if (params.metadata !== undefined) body.metadata = params.metadata;
  return body;
}

export class InventoryApi {
  constructor(private readonly http: HttpClient) {}

  /** Grant N copies of an item to a player. Lazy-creates the player. Raises UnknownItemError (404) or InventoryOverflowError (422) on failure. */
  grant(params: InventoryGrantParams): Promise<InventoryGrantResult> {
    return this.http.post<InventoryGrantResult>({
      pathSegments: ['v1', 'players', params.player, 'inventory', params.item, 'grant'],
      body: toGrantWireBody(params),
      ...(params.idempotencyKey !== undefined ? { idempotencyKey: params.idempotencyKey } : {}),
    });
  }

  /** Consume N copies of an item from a player. Stackable: amount-based. Non-stackable: pass `instanceId`. Raises InsufficientInventoryError on shortage. */
  consume(params: InventoryConsumeParams): Promise<InventoryConsumeResult> {
    return this.http.post<InventoryConsumeResult>({
      pathSegments: ['v1', 'players', params.player, 'inventory', params.item, 'consume'],
      body: toConsumeWireBody(params),
      ...(params.idempotencyKey !== undefined ? { idempotencyKey: params.idempotencyKey } : {}),
    });
  }

  /** List a player's inventory across all items. Cursor-paginated, newest first. Unknown player → empty list. */
  async list(params: InventoryListParams): Promise<InventoryListResult> {
    const result = await this.http.get<{ data: InventoryListItem[]; hasMore: boolean }>({
      pathSegments: ['v1', 'players', params.player, 'inventory'],
      query: {
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...(params.startingAfter !== undefined ? { starting_after: params.startingAfter } : {}),
      },
    });
    if (result.hasMore && result.data.length > 0) {
      const lastRow = result.data[result.data.length - 1];
      if (lastRow !== undefined) {
        return { data: result.data, hasMore: true, nextCursor: lastRow.id };
      }
    }
    return { data: result.data, hasMore: result.hasMore };
  }

  /** Read a single (player, item) state. Discriminated by stackable; synthesized-zero on absent item/player. */
  get(params: InventoryGetParams): Promise<InventoryGetResult> {
    return this.http.get<InventoryGetResult>({
      pathSegments: ['v1', 'players', params.player, 'inventory', params.item],
    });
  }
}
