/** SQLSTATE → typed BcError. Returns null for unmatched cases (caller re-raises PostgresError). */

import { type BcCode, BcError, type ErrorDetails } from './errors';

// Unknown FK constraints return null so a future schema-add surfaces as PostgresError, not a misleading BC.
const FK_TRANSLATION: Record<string, BcCode> = {
  transactions_project_reason_code_fk: 'BC050',
};

// RAISE EXCEPTION format strings from packages/db/drizzle/0004_wallet_functions.sql + 0011_inventory_primitive.sql; format-change → test fail.
const BC010_RE = /^InsufficientFunds: wallet=(\S+) requested=(\S+) available=(\S+)$/;
const BC020_RE = /^TenantMismatch: GUC=(\S+) p_project_id=(\S+)$/;
const BC021_RE = /^WalletNotFound: wallet_id=(\S+) project_id=(\S+)$/;
const BC022_RE = /^CurrencyMismatch: wallet_currency=(\S+) requested=(\S+)$/;
const BC060_RE = /^CurrencyNotFound: code=(\S+) project_id=(\S+)$/;
const BC080_RE = /^UnknownItem: code=(\S+) project_id=(\S+)$/;
const BC081_RE =
  /^InventoryOverflow: current=(\S+) requested=(\S+) max=(\S+) available_capacity=(\S+)$/;
const BC082_INSUFFICIENT_RE = /^InsufficientInventory: current=(\S+) requested=(\S+)$/;
const BC082_INSTANCE_NOT_OWNED_RE =
  /^InsufficientInventory: instance=(\S+) not owned by player=(\S+) for item=(\S+)$/;
const BC082_INSTANCE_ID_REQUIRED_RE =
  /^InsufficientInventory: non-stackable consume requires instance_id$/;
// Player-has-no-inventory variant — raised when consume targets a player with no rows for the item at all.
const BC082_NO_INVENTORY_RE =
  /^InsufficientInventory: player=(\S+) has no inventory of item=(\S+)$/;

export function sqlstateToError(
  code: string,
  message: string,
  constraintName: string | undefined,
): BcError | null {
  if (code === '23503') {
    if (constraintName === undefined) return null;
    const bc = FK_TRANSLATION[constraintName];
    if (bc === 'BC050') {
      return new BcError({ code: bc, constraintName }, message);
    }
    return null;
  }

  let details: ErrorDetails | null = null;
  switch (code) {
    case 'BC010': {
      const m = BC010_RE.exec(message);
      if (m && m[1] !== undefined && m[2] !== undefined && m[3] !== undefined) {
        details = { code: 'BC010', walletId: m[1], requested: m[2], available: m[3] };
      }
      break;
    }
    case 'BC020': {
      const m = BC020_RE.exec(message);
      if (m && m[1] !== undefined && m[2] !== undefined) {
        details = { code: 'BC020', gucTenant: m[1], paramTenant: m[2] };
      }
      break;
    }
    case 'BC021': {
      const m = BC021_RE.exec(message);
      if (m && m[1] !== undefined && m[2] !== undefined) {
        details = { code: 'BC021', walletId: m[1], projectId: m[2] };
      }
      break;
    }
    case 'BC022': {
      const m = BC022_RE.exec(message);
      if (m && m[1] !== undefined && m[2] !== undefined) {
        details = { code: 'BC022', walletCurrency: m[1], requested: m[2] };
      }
      break;
    }
    case 'BC040':
      details = { code: 'BC040' };
      break;
    case 'BC060': {
      const m = BC060_RE.exec(message);
      if (m && m[1] !== undefined && m[2] !== undefined) {
        details = { code: 'BC060', currencyCode: m[1], projectId: m[2] };
      }
      break;
    }
    case 'BC080': {
      const m = BC080_RE.exec(message);
      if (m && m[1] !== undefined && m[2] !== undefined) {
        details = { code: 'BC080', itemCode: m[1], projectId: m[2] };
      }
      break;
    }
    case 'BC081': {
      const m = BC081_RE.exec(message);
      if (
        m &&
        m[1] !== undefined &&
        m[2] !== undefined &&
        m[3] !== undefined &&
        m[4] !== undefined
      ) {
        details = {
          code: 'BC081',
          currentCount: Number(m[1]),
          requestedAmount: Number(m[2]),
          maxCount: Number(m[3]),
          availableCapacity: Number(m[4]),
        };
      }
      break;
    }
    case 'BC082': {
      const insufficient = BC082_INSUFFICIENT_RE.exec(message);
      if (insufficient && insufficient[1] !== undefined && insufficient[2] !== undefined) {
        details = {
          code: 'BC082',
          variant: 'insufficient_count',
          currentCount: Number(insufficient[1]),
          requestedAmount: Number(insufficient[2]),
        };
        break;
      }
      const notOwned = BC082_INSTANCE_NOT_OWNED_RE.exec(message);
      if (
        notOwned &&
        notOwned[1] !== undefined &&
        notOwned[2] !== undefined &&
        notOwned[3] !== undefined
      ) {
        details = {
          code: 'BC082',
          variant: 'instance_not_owned',
          instanceId: notOwned[1],
          playerExternalId: notOwned[2],
          itemCode: notOwned[3],
        };
        break;
      }
      if (BC082_INSTANCE_ID_REQUIRED_RE.test(message)) {
        details = { code: 'BC082', variant: 'instance_id_required' };
        break;
      }
      const noInventory = BC082_NO_INVENTORY_RE.exec(message);
      if (noInventory && noInventory[1] !== undefined && noInventory[2] !== undefined) {
        // Synthesize the insufficient_count shape with currentCount=0 so the handler
        // dispatch path collapses cleanly into the existing INSUFFICIENT_INVENTORY response.
        details = {
          code: 'BC082',
          variant: 'insufficient_count',
          currentCount: 0,
          requestedAmount: 0,
        };
      }
      break;
    }
    default:
      return null;
  }

  if (details === null) return null;
  return new BcError(details, message);
}
