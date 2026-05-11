// Better Auth instance singleton for apps/backend per [[admin-auth-surface]]
// cascade obligation #1 + [[backend-stack]] cascade obligation (Better Auth
// config). Wired here now that [[admin-auth-surface]] names admin-handler
// consumers (slice 8.2); prior comment at apps/backend/src/index.ts:25 listed
// "Better Auth wiring via @bokchoy/auth-config" as explicitly out and is now
// closed by this slice.
//
// Single instance per process — adminGate middleware + future auth routes
// import `auth` directly. Test isolation via dependency-injection deferred to
// slice 8.2.1 first-consumer integration smoke.
//
// Better Auth's `auth.api.*` server functions (getSession, hasPermission) work
// WITHOUT mounting Better Auth's HTTP routes — they read cookie/header off the
// passed Request headers and validate against the DB. That's why this slice
// can ship the singleton without /api/auth/* route mount (cockpit slice owns
// the route mount).

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
