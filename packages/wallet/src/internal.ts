// Module-private helpers for the wrapper layer.
//
// rowToNumber extracts a single named column from the first row of a Drizzle
// db.execute() result. Handles postgres-js's default bigint-as-JS-bigint return
// (converted to number with a safety check; per [[wrapper-shape]] the contract
// is `Promise<number>` so this conversion is the wrapper boundary).
//
// throwTranslated reads PostgresError-shaped fields and dispatches via
// sqlstateToError. On unknown SQLSTATE / unmatched parse / unknown FK
// constraint, re-raises the original error so callers see the typed
// PostgresError for telemetry instead of a misleading silent.

import { sqlstateToError } from './sqlstate-to-error';

export function rowToNumber(rows: unknown, alias: string): number {
  if (typeof rows !== 'object' || rows === null) {
    throw new Error(`expected rows object, got ${typeof rows}`);
  }
  const arr = rows as ArrayLike<Record<string, unknown>>;
  if (arr.length < 1) {
    throw new Error('SQL function returned no rows');
  }
  const value = arr[0]?.[alias];
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${alias}=${value} exceeds Number.MAX_SAFE_INTEGER`);
    }
    return Number(value);
  }
  // postgres-js returns Postgres `bigint` as JS string by default (preserves
  // precision past 2^53). Parse + safety-check; per [[wrapper-shape]] the
  // wrapper boundary commits to JS-safe range for game-economy IDs.
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${alias}=${value} is not a finite numeric string`);
    }
    if (parsed > Number.MAX_SAFE_INTEGER) {
      throw new Error(`${alias}=${value} exceeds Number.MAX_SAFE_INTEGER`);
    }
    return parsed;
  }
  throw new Error(`unexpected ${alias} type: ${typeof value}`);
}

interface PostgresLikeError {
  code: string;
  message: string;
  constraint_name?: string;
}

function isPostgresError(err: unknown): err is PostgresLikeError {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  return typeof e.code === 'string' && typeof e.message === 'string';
}

// Drizzle-postgres-js wraps the underlying PostgresError in DrizzleQueryError
// and exposes the original on `.cause`. Unwrap one level so the BCxxx
// SQLSTATE + RAISE EXCEPTION text are reachable.
function unwrapPostgresError(err: unknown): PostgresLikeError | null {
  if (isPostgresError(err)) return err;
  if (typeof err === 'object' && err !== null && 'cause' in err) {
    const cause = (err as Record<string, unknown>).cause;
    if (isPostgresError(cause)) return cause;
  }
  return null;
}

export function throwTranslated(err: unknown): never {
  const pg = unwrapPostgresError(err);
  if (pg !== null) {
    const constraintName = typeof pg.constraint_name === 'string' ? pg.constraint_name : undefined;
    const translated = sqlstateToError(pg.code, pg.message, constraintName);
    if (translated !== null) throw translated;
  }
  throw err;
}
