/** DB singleton. postgres-js + prepare:false (Supavisor txn mode) per [[backend-stack]]. */

import { createDbClient } from '@bokchoy/db';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set');
}

const { client, db } = createDbClient(url);

export { client, db };
