/** Module-private helpers — row readers re-exported from @bokchoy/db; throwTranslated wires the wallet sqlstateToError. */

import { unwrapPostgresError } from '@bokchoy/db';
import { sqlstateToError } from '@bokchoy/wallet';

export {
  readBoolean,
  readIntOrNull,
  readUuid,
  readUuidArrayOrNull,
  readUuidOrNull,
  rowField,
  rowToNumber,
} from '@bokchoy/db';

export function throwTranslated(err: unknown): never {
  const pg = unwrapPostgresError(err);
  if (pg !== null) {
    const constraintName = typeof pg.constraint_name === 'string' ? pg.constraint_name : undefined;
    const translated = sqlstateToError(pg.code, pg.message, constraintName);
    if (translated !== null) throw translated;
  }
  throw err;
}
