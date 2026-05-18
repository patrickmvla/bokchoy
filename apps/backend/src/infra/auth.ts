/** Better Auth singleton. `auth.api.*` (getSession, hasPermission) works without mounting /api/auth/* routes. */

import { createAuth } from '@bokchoy/auth-config';
import { db } from './db';

const baseURL = process.env.BOKCHOY_BASE_URL;
if (!baseURL) {
  throw new Error('BOKCHOY_BASE_URL is not set');
}

const trustedOriginsEnv = process.env.BOKCHOY_TRUSTED_ORIGINS;
const trustedOrigins = trustedOriginsEnv
  ? trustedOriginsEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : undefined;

export const auth = createAuth({ db, baseURL, trustedOrigins });
