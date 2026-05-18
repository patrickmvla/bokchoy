/** Module-private helpers for the wrapper layer. */

import { sqlstateToError } from './sqlstate-to-error';

// postgres-js returns NUMERIC + bigint as string by default (precision past 2^53). Accept number form too.
export function rowField(rows: unknown, alias: string): unknown {
  if (typeof rows !== 'object' || rows === null) {
    throw new Error(`expected rows object, got ${typeof rows}`);
  }
  const arr = rows as ArrayLike<Record<string, unknown>>;
  if (arr.length < 1) {
    throw new Error('SQL function returned no rows');
  }
  return arr[0]?.[alias];
}

export function readUuidOrText(rows: unknown, alias: string): string {
  const value = rowField(rows, alias);
  if (typeof value !== 'string') {
    throw new Error(`unexpected ${alias} type: ${typeof value}`);
  }
  return value;
}

export function readNumericAsString(rows: unknown, alias: string): string {
  const value = rowField(rows, alias);
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  throw new Error(`unexpected ${alias} type: ${typeof value}`);
}

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

// Drizzle wraps PostgresError in DrizzleQueryError; unwrap one level to reach BCxxx SQLSTATE.
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
