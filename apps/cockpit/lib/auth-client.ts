/** Better Auth React client. Per [[cockpit/auth-surface-mount]] (CL) (amended 2026-05-13 — baseURL absolute, not '/'). */

'use client';

import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Better Auth parses baseURL via `new URL()` — '/' rejects at module-eval. Use the cockpit's own origin
// (Vercel rewrites in next.config.ts proxy /api/auth/* to backend). SSR fallback only needs to be parseable.
function resolveBaseURL(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3001';
}

export const authClient = createAuthClient({
  baseURL: resolveBaseURL(),
  plugins: [organizationClient()],
});

export const { signIn, signOut, useSession, organization } = authClient;
