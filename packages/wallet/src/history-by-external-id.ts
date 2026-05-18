/** Player-centric history. Per [[wallet/balance-history-contract]] (v) — cursor on transactions.id, limit+1 hasMore. */

import type { Db, Tx } from '@bokchoy/db';
import { sql } from 'drizzle-orm';

export interface WalletHistoryByExternalIdParams {
  projectId: string;
  playerExternalId: string;
  currencyCode: string;
  /** Caller pre-clamps to [1, 100]. */
  limit: number;
  startingAfter?: number;
}

export interface WalletHistoryRow {
  id: number;
  createdAt: Date;
  kind: string;
  amount: string;
  reasonCode: string;
  sourceEventId: string | null;
  relatedId: number | null;
  relatedType: 'loot_roll' | 'iap_receipt' | 'compensation_grant' | null;
  metadata: Record<string, unknown>;
}

export interface WalletHistoryByExternalIdResult {
  data: WalletHistoryRow[];
  hasMore: boolean;
}

export async function walletHistoryByExternalId(
  db: Db | Tx,
  params: WalletHistoryByExternalIdParams,
): Promise<WalletHistoryByExternalIdResult> {
  const rows = await db.execute(sql`
    SELECT
      t.id              AS id,
      t.created_at      AS created_at,
      t.kind            AS kind,
      t.amount          AS amount,
      t.reason_code     AS reason_code,
      t.source_event_id AS source_event_id,
      t.related_id      AS related_id,
      t.related_type    AS related_type,
      t.metadata        AS metadata
    FROM transactions t
    JOIN wallets    w ON w.id = t.wallet_id
    JOIN players    p ON p.id = w.player_id
    JOIN currencies c ON c.id = w.currency_id
    WHERE t.project_id = ${params.projectId}::uuid
      AND p.external_id = ${params.playerExternalId}::text
      AND c.code = ${params.currencyCode}::text
      AND (${params.startingAfter ?? null}::bigint IS NULL OR t.id < ${params.startingAfter ?? null}::bigint)
    ORDER BY t.id DESC
    LIMIT ${params.limit + 1}
  `);

  const arr = rows as ArrayLike<Record<string, unknown>>;
  const fetched: WalletHistoryRow[] = [];
  for (let i = 0; i < arr.length; i++) {
    fetched.push(parseRow(arr[i] as Record<string, unknown>));
  }
  const hasMore = fetched.length > params.limit;
  const data = hasMore ? fetched.slice(0, params.limit) : fetched;
  return { data, hasMore };
}

function parseRow(row: Record<string, unknown>): WalletHistoryRow {
  const id = parseBigintSafe(row.id, 'id');

  const createdAtRaw = row.created_at;
  let createdAt: Date;
  if (createdAtRaw instanceof Date) createdAt = createdAtRaw;
  else if (typeof createdAtRaw === 'string') createdAt = new Date(createdAtRaw);
  else throw new Error(`unexpected created_at type: ${typeof createdAtRaw}`);

  const kind = row.kind;
  if (typeof kind !== 'string') throw new Error(`unexpected kind type: ${typeof kind}`);

  // amount nullable for item-only transactions; currency rows always carry it.
  const amountRaw = row.amount;
  let amount: string;
  if (typeof amountRaw === 'string') amount = amountRaw;
  else if (typeof amountRaw === 'number') amount = amountRaw.toString();
  else if (amountRaw === null) amount = '0';
  else throw new Error(`unexpected amount type: ${typeof amountRaw}`);

  const reasonCode = row.reason_code;
  if (typeof reasonCode !== 'string') {
    throw new Error(`unexpected reason_code type: ${typeof reasonCode}`);
  }

  const sourceEventIdRaw = row.source_event_id;
  const sourceEventId =
    typeof sourceEventIdRaw === 'string'
      ? sourceEventIdRaw
      : sourceEventIdRaw === null
        ? null
        : null;

  const relatedIdRaw = row.related_id;
  let relatedId: number | null;
  if (relatedIdRaw === null || relatedIdRaw === undefined) relatedId = null;
  else relatedId = parseBigintSafe(relatedIdRaw, 'related_id');

  const relatedTypeRaw = row.related_type;
  let relatedType: WalletHistoryRow['relatedType'];
  if (relatedTypeRaw === null || relatedTypeRaw === undefined) relatedType = null;
  else if (
    relatedTypeRaw === 'loot_roll' ||
    relatedTypeRaw === 'iap_receipt' ||
    relatedTypeRaw === 'compensation_grant'
  ) {
    relatedType = relatedTypeRaw;
  } else throw new Error(`unexpected related_type value: ${String(relatedTypeRaw)}`);

  const metadataRaw = row.metadata;
  let metadata: Record<string, unknown>;
  if (metadataRaw === null || metadataRaw === undefined) metadata = {};
  else if (typeof metadataRaw === 'object') metadata = metadataRaw as Record<string, unknown>;
  else throw new Error(`unexpected metadata type: ${typeof metadataRaw}`);

  return {
    id,
    createdAt,
    kind,
    amount,
    reasonCode,
    sourceEventId,
    relatedId,
    relatedType,
    metadata,
  };
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
