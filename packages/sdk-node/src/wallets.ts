// wallets namespace per [[marketing/v1-shape]] (iii). Friendly-name API
// — `player`, `currency`, `reason` — translated to the wire-shape that the
// backend's `/v1/players/:playerExternalId/wallets/:currencyCode/{credit,debit}`
// route expects per [[wallet/credit-route-contract]] (i).
//
// Translation table (SDK arg → wire location):
//   player        → URL path segment :playerExternalId (URL-encoded by http.ts)
//   currency      → URL path segment :currencyCode      (URL-encoded by http.ts)
//   reason        → body.reasonCode                     (camelCase wire rename)
//   amount        → body.amount
//   sourceEventId → body.sourceEventId
//   relatedId     → body.relatedId
//   relatedType   → body.relatedType
//   metadata      → body.metadata
//   idempotencyKey → Idempotency-Key header             (auto-generated if absent)
//
// Result shape is the backend's flat four-field response per (i) verbatim:
// { transactionId, walletId, playerId, balanceAfter }. balanceAfter is a
// NUMERIC(20,4)-precision string per the contract's float-precision note.

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
  // Build defensively — only emit keys the customer actually provided so the
  // request body is minimal and the server's Zod schema sees `undefined` as
  // absent rather than as a value to validate.
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
}
