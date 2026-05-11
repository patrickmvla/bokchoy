#!/usr/bin/env bun

//
// Create a new SDK API key for a BokChoy project per [[wallet-http-contract]]
// G3 + slice 8.1a.
//
// Admin-only CLI: connects as `postgres` via DATABASE_MIGRATION_URL because
// api_keys is FORCE RLS-protected and INSERT from bokchoy_app would require a
// SECURITY DEFINER function (deferred — cockpit-driven key creation will need
// it; CLI uses the privileged path).
//
// Key format: bk_<env>_<32-hex-chars> (40 chars total).
//   - First 12 chars (bk_<env>_<4-hex>) form key_prefix (UNIQUE indexed).
//   - HMAC-SHA-256(full_key, BOKCHOY_API_KEY_HMAC_SECRET) is stored as key_hash;
//     full key is NEVER persisted. DB leak alone doesn't validate keys.
//
// Usage:
//   BOKCHOY_API_KEY_HMAC_SECRET=... DATABASE_MIGRATION_URL=... \
//     bun packages/db/scripts/create-api-key.ts \
//     --project-id <uuid> [--name "Server key"] [--env live|test]

import { createHmac, randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import postgres from 'postgres';

const MIG_URL = process.env.DATABASE_MIGRATION_URL;
const HMAC_SECRET = process.env.BOKCHOY_API_KEY_HMAC_SECRET;
if (!MIG_URL) {
  console.error('DATABASE_MIGRATION_URL is not set');
  process.exit(2);
}
if (!HMAC_SECRET) {
  console.error('BOKCHOY_API_KEY_HMAC_SECRET is not set');
  process.exit(2);
}

const { values } = parseArgs({
  options: {
    'project-id': { type: 'string' },
    name: { type: 'string' },
    env: { type: 'string', default: 'live' },
  },
});

const projectId = values['project-id'];
const name = values.name ?? `API Key ${new Date().toISOString().slice(0, 10)}`;
const env = values.env;

if (!projectId) {
  console.error('--project-id <uuid> is required');
  process.exit(2);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
  console.error(`--project-id must be a UUID; got: ${projectId}`);
  process.exit(2);
}
if (env !== 'live' && env !== 'test') {
  console.error(`--env must be 'live' or 'test'; got: ${env}`);
  process.exit(2);
}
if (name.length > 100) {
  console.error('--name must be 100 chars or fewer');
  process.exit(2);
}

// 32 hex chars = 16 bytes random. ~128 bits entropy after the prefix's 4 hex
// chars are factored out → still 96+ bits of secret-half entropy, comfortably
// above brute-force threshold.
const randomHex = randomBytes(16).toString('hex');
const fullKey = `bk_${env}_${randomHex}`;
const keyPrefix = fullKey.slice(0, 12);
const keyHash = createHmac('sha256', HMAC_SECRET).update(fullKey).digest();

const sql = postgres(MIG_URL, { prepare: false, onnotice: () => {} });

try {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO api_keys (project_id, key_prefix, key_hash, name)
    VALUES (${projectId}, ${keyPrefix}, ${keyHash}, ${name})
    RETURNING id
  `;

  console.log('');
  console.log('  Key created.');
  console.log('  ----------------------------------------');
  console.log(`  id:         ${row?.id}`);
  console.log(`  project_id: ${projectId}`);
  console.log(`  name:       ${name}`);
  console.log(`  prefix:     ${keyPrefix}`);
  console.log('');
  console.log(`  KEY (shown once — store securely): ${fullKey}`);
  console.log('');
} catch (err) {
  console.error('Failed to create API key:', err);
  process.exit(1);
} finally {
  await sql.end();
}
