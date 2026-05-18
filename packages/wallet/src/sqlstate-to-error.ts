/** SQLSTATE → typed WalletError. Returns null for unmatched cases (caller re-raises PostgresError). */

import { type BcCode, type ErrorDetails, WalletError } from './errors';

// Unknown FK constraints return null so a future schema-add surfaces as PostgresError, not a misleading BC.
const FK_TRANSLATION: Record<string, BcCode> = {
  transactions_project_reason_code_fk: 'BC050',
};

// RAISE EXCEPTION format strings from packages/db/drizzle/0004_wallet_functions.sql; format-change → test fail.
const BC010_RE = /^InsufficientFunds: wallet=(\S+) requested=(\S+) available=(\S+)$/;
const BC020_RE = /^TenantMismatch: GUC=(\S+) p_project_id=(\S+)$/;
const BC021_RE = /^WalletNotFound: wallet_id=(\S+) project_id=(\S+)$/;
const BC022_RE = /^CurrencyMismatch: wallet_currency=(\S+) requested=(\S+)$/;
const BC060_RE = /^CurrencyNotFound: code=(\S+) project_id=(\S+)$/;

export function sqlstateToError(
  code: string,
  message: string,
  constraintName: string | undefined,
): WalletError | null {
  if (code === '23503') {
    if (constraintName === undefined) return null;
    const bc = FK_TRANSLATION[constraintName];
    if (bc === 'BC050') {
      return new WalletError({ code: bc, constraintName }, message);
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
    default:
      return null;
  }

  if (details === null) return null;
  return new WalletError(details, message);
}
