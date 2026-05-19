/** pg-row field readers + driver-error helpers. Postgres-js + Drizzle returns rows as `{column: unknown}[]`-shape; these helpers narrow safely. */

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

export function readUuid(rows: unknown, alias: string): string {
  const value = rowField(rows, alias);
  if (typeof value !== 'string') {
    throw new Error(`unexpected ${alias} type: ${typeof value}`);
  }
  return value;
}

/** UUID column whose driver-returned value may be null (e.g. discriminated returns). */
export function readUuidOrNull(rows: unknown, alias: string): string | null {
  const value = rowField(rows, alias);
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`unexpected ${alias} type: ${typeof value}`);
  }
  return value;
}

/** Postgres-js returns text and uuid alike as string; this helper accepts both shapes. */
export function readUuidOrText(rows: unknown, alias: string): string {
  return readUuid(rows, alias);
}

export function readBoolean(rows: unknown, alias: string): boolean {
  const value = rowField(rows, alias);
  if (typeof value !== 'boolean') {
    throw new Error(`unexpected ${alias} type: ${typeof value}`);
  }
  return value;
}

/** Postgres-js returns NUMERIC + bigint as string by default (precision past 2^53). Accepts number form too. */
export function readNumericAsString(rows: unknown, alias: string): string {
  const value = rowField(rows, alias);
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  throw new Error(`unexpected ${alias} type: ${typeof value}`);
}

export function readIntOrNull(rows: unknown, alias: string): number | null {
  const value = rowField(rows, alias);
  if (value === null) return null;
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
    return parsed;
  }
  throw new Error(`unexpected ${alias} type: ${typeof value}`);
}

export function readUuidArrayOrNull(rows: unknown, alias: string): readonly string[] | null {
  const value = rowField(rows, alias);
  if (value === null) return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v !== 'string') {
        throw new Error(`unexpected ${alias} element type: ${typeof v}`);
      }
    }
    return value as readonly string[];
  }
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

export interface PostgresLikeError {
  code: string;
  message: string;
  constraint_name?: string;
}

export function isPostgresError(err: unknown): err is PostgresLikeError {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  return typeof e.code === 'string' && typeof e.message === 'string';
}

/** Drizzle wraps PostgresError in DrizzleQueryError; unwrap one level to reach the BCxxx SQLSTATE. */
export function unwrapPostgresError(err: unknown): PostgresLikeError | null {
  if (isPostgresError(err)) return err;
  if (typeof err === 'object' && err !== null && 'cause' in err) {
    const cause = (err as Record<string, unknown>).cause;
    if (isPostgresError(cause)) return cause;
  }
  return null;
}
