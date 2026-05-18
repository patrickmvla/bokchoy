/** wallets namespace — friendly-name API per [[marketing/v1-shape]] (iii). */

import type { HttpClient } from './http';

/** Parameters for wallets.credit / wallets.debit. */
export interface WalletMutationParams {
  /** Customer-controlled player identifier; URL-safe per backend regex `[A-Za-z0-9._-]{1,128}`. */
  player: string;
  /** Currency slug registered in this project (e.g. `'gems'`). */
  currency: string;
  /** Positive amount; max Number.MAX_SAFE_INTEGER. */
  amount: number;
  /** Reason code registered for this project — see /docs/reason-codes. */
  reason: string;
  /** Optional dedup hint propagated to the audit log; 1-255 chars. */
  sourceEventId?: string;
  /** Optional Idempotency-Key; auto-generated as `bokchoy-sdk-retry-${uuid4()}` if omitted. */
  idempotencyKey?: string;
  /** Optional polymorphic FK to a sibling audit row. */
  relatedId?: number;
  relatedType?: 'loot_roll' | 'iap_receipt' | 'compensation_grant';
  /** Customer-defined opaque payload stored on the transaction row. */
  metadata?: Record<string, unknown>;
}

/** Response from wallets.credit / wallets.debit. */
export interface WalletMutationResult {
  /** Audit-log transaction id (server-assigned bigserial, JS-safe int range). */
  transactionId: number;
  /** Wallet UUID — created on first credit/debit for a (player, currency) pair. */
  walletId: string;
  /** Player UUID — created on first credit/debit for an unknown player external id. */
  playerId: string;
  /** Post-mutation balance as a NUMERIC(20,4) string (precision-preserving past 2^53). */
  balanceAfter: string;
}

interface WireBody {
  amount: number;
  reasonCode: string;
  sourceEventId?: string;
  relatedId?: number;
  relatedType?: 'loot_roll' | 'iap_receipt' | 'compensation_grant';
  metadata?: Record<string, unknown>;
}

function toWireBody(params: WalletMutationParams): WireBody {
  // Only emit keys the customer provided — server Zod schema treats absent vs undefined-valued differently.
  const body: WireBody = {
    amount: params.amount,
    reasonCode: params.reason,
  };
  if (params.sourceEventId !== undefined) body.sourceEventId = params.sourceEventId;
  if (params.relatedId !== undefined) body.relatedId = params.relatedId;
  if (params.relatedType !== undefined) body.relatedType = params.relatedType;
  if (params.metadata !== undefined) body.metadata = params.metadata;
  return body;
}

/** Parameters for wallets.balance — player-centric balance read. */
export interface WalletBalanceParams {
  /** Customer-controlled player identifier; URL-safe per backend regex `[A-Za-z0-9._-]{1,128}`. */
  player: string;
  /** Currency slug registered in this project. */
  currency: string;
}

/** Response from wallets.balance. Optional fields absent when the wallet row hasn't been materialized yet. */
export interface WalletBalanceResult {
  balance: string;
  currencyCode: string;
  walletId?: string;
  playerId?: string;
  updatedAt?: string;
}

/** Parameters for wallets.history — player-centric activity feed. */
export interface WalletHistoryParams {
  /** Customer-controlled player identifier. */
  player: string;
  /** Currency slug registered in this project. */
  currency: string;
  /** Page size, default 10, max 100 enforced server-side. */
  limit?: number;
  /** Cursor — pass `nextCursor` from a previous response to fetch the next page. Opaque to callers. */
  startingAfter?: number;
}

/** One transaction row in a wallets.history response. */
export interface WalletHistoryItem {
  /** Audit-log transaction id (server-issued, monotonic). */
  id: number;
  /** ISO timestamp of the transaction. */
  createdAt: string;
  /** Operation kind — e.g. 'currency_credit', 'currency_debit'. Other kinds appear for non-wallet rows. */
  kind: string;
  /** NUMERIC(20,4)-precision amount as a string. Sign is implicit in `kind`. */
  amount: string;
  /** Reason code registered for this project. */
  reasonCode: string;
  /** Optional dedup hint propagated to the audit log; omitted when absent. */
  sourceEventId?: string;
  /** Optional polymorphic FK to a sibling audit row. */
  relatedId?: number;
  relatedType?: 'loot_roll' | 'iap_receipt' | 'compensation_grant';
  /** Customer-defined opaque payload. Always present (defaults to `{}`). */
  metadata: Record<string, unknown>;
}

/** Response from wallets.history. */
export interface WalletHistoryResult {
  data: WalletHistoryItem[];
  hasMore: boolean;
  /** Opaque cursor — pass to the next call's `startingAfter` to paginate. Only present when `hasMore` is true. */
  nextCursor?: number;
}

export class WalletsApi {
  constructor(private readonly http: HttpClient) {}

  /** Credit an amount of a currency to a player. Lazy-creates the player and wallet on first call. */
  credit(params: WalletMutationParams): Promise<WalletMutationResult> {
    return this.http.post<WalletMutationResult>({
      pathSegments: ['v1', 'players', params.player, 'wallets', params.currency, 'credit'],
      body: toWireBody(params),
      ...(params.idempotencyKey !== undefined ? { idempotencyKey: params.idempotencyKey } : {}),
    });
  }

  /** Debit an amount of a currency from a player. Raises InsufficientFunds (BC010) on underflow. */
  debit(params: WalletMutationParams): Promise<WalletMutationResult> {
    return this.http.post<WalletMutationResult>({
      pathSegments: ['v1', 'players', params.player, 'wallets', params.currency, 'debit'],
      body: toWireBody(params),
      ...(params.idempotencyKey !== undefined ? { idempotencyKey: params.idempotencyKey } : {}),
    });
  }

  /**
   * Read a player's balance for a currency. Returns `{ balance: "0", currencyCode }` for
   * unknown players or never-credited (player, currency) pairs — no error path for the
   * common "new player render wallet UI" case per
   * [[wallet/balance-history-contract]] (iii).
   */
  balance(params: WalletBalanceParams): Promise<WalletBalanceResult> {
    return this.http.get<WalletBalanceResult>({
      pathSegments: ['v1', 'players', params.player, 'wallets', params.currency],
    });
  }

  /**
   * Read a player's transaction history for a currency. Newest first, cursor-paginated.
   * Returns `{ data: [], hasMore: false }` for unknown wallets or empty history. Compute
   * running balance client-side from `kind` + `amount` (signed delta) if needed.
   */
  async history(params: WalletHistoryParams): Promise<WalletHistoryResult> {
    const result = await this.http.get<{ data: WalletHistoryItem[]; hasMore: boolean }>({
      pathSegments: ['v1', 'players', params.player, 'wallets', params.currency, 'transactions'],
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
}
