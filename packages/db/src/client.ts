import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type Db = PostgresJsDatabase;

export function createDbClient(connectionUrl: string): {
  client: postgres.Sql;
  db: Db;
} {
  const client = postgres(connectionUrl, { prepare: false });
  const db = drizzle({ client });
  return { client, db };
}
