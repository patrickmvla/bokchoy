/** Bearer middleware. SECURITY DEFINER lookup bypasses RLS at the bootstrap (no tenant GUC set yet). */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { db } from '../infra';

const HMAC_SECRET = process.env.BOKCHOY_API_KEY_HMAC_SECRET;
if (!HMAC_SECRET) {
  throw new Error('BOKCHOY_API_KEY_HMAC_SECRET is not set');
}

const KEY_PREFIX_LENGTH = 12;
const FULL_KEY_LENGTH = 40;
const KEY_PREFIXES = ['bk_live_', 'bk_test_'] as const;

type ApiKeyRow = {
  id: string;
  project_id: string;
  key_prefix: string;
  key_hash: Uint8Array;
  name: string;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
};

type ApiKeyContext = {
  Variables: {
    projectId: string;
    apiKeyId: string;
  };
};

function unauthorized(message: string) {
  return { error: { code: 'UNAUTHENTICATED', message } } as const;
}

function hmacKey(fullKey: string): Buffer {
  return createHmac('sha256', HMAC_SECRET as string)
    .update(fullKey)
    .digest();
}

export const apiKeyMiddleware = createMiddleware<ApiKeyContext>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(unauthorized('Missing Bearer token'), 401);
  }

  const fullKey = authHeader.slice('Bearer '.length).trim();
  if (fullKey.length !== FULL_KEY_LENGTH) {
    return c.json(unauthorized('Invalid key format'), 401);
  }
  if (!KEY_PREFIXES.some((p) => fullKey.startsWith(p))) {
    return c.json(unauthorized('Invalid key format'), 401);
  }

  const keyPrefix = fullKey.slice(0, KEY_PREFIX_LENGTH);

  const rows = await db.execute<ApiKeyRow>(sql`SELECT * FROM api_key_lookup(${keyPrefix})`);
  const row = rows[0];
  if (!row) {
    return c.json(unauthorized('Invalid key'), 401);
  }

  const expected = Buffer.from(row.key_hash);
  const supplied = hmacKey(fullKey);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return c.json(unauthorized('Invalid key'), 401);
  }

  c.set('projectId', row.project_id);
  c.set('apiKeyId', row.id);

  // Fire-and-forget — last_used_at means last *successful* use, not last attempt.
  void db
    .execute(sql`SELECT api_key_record_use(${row.id}::uuid)`)
    .catch((err: unknown) => console.error('api_key_record_use failed', err));

  await next();
});

export type { ApiKeyContext };
