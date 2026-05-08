import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = PostgresJsDatabase<Schema>;

export function createDbClient(connectionUrl: string): {
  client: postgres.Sql;
  db: Db;
} {
  const client = postgres(connectionUrl, { prepare: false });
  const db = drizzle({ client, schema });
  return { client, db };
}
