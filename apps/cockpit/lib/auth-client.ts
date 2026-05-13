// Better Auth React client per [[cockpit/auth-surface-mount]] (CL).
//
// AMENDMENT TO (CL) 2026-05-13: the contract's `baseURL: '/'` value rejects
// at module-eval time with `BetterAuthError: Invalid base URL: /` — Better
// Auth's client parses baseURL with `new URL()` which requires an absolute
// URL. The contract's intent (same-origin requests through Vercel rewrites)
// is achieved by providing the cockpit's own origin: in the browser via
// `window.location.origin`, during SSR via a fallback. The cockpit hosts
// /api/auth/* via next.config.ts rewrites → backend, so the client's
// fetches stay first-party on cockpit's origin and the browser rewrites
// take over. Amendment to [[cockpit/auth-surface-mount]] (CL) owed in
// next /design pass.
//
// SSR fallback only needs to be a parseable URL — Better Auth doesn't
// actually fetch during SSR for our usage (no useSession() in RSC trees;
// the RSC session-read path uses lib/session.ts directly against the
// backend). The fallback value is irrelevant beyond satisfying the URL
// parser at module-eval.
//
// organizationClient plugin per (CL) — exposes authClient.organization.*
// for org-aware client flows (switch active org, invitations, etc.).
//
// Re-exported helpers are the standard Better Auth React surface — keeps
// import sites short (`import { signIn } from '@/lib/auth-client'` instead
// of `import { authClient } from '@/lib/auth-client'; authClient.signIn`).

'use client';

import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

function resolveBaseURL(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3001';
}

export const authClient = createAuthClient({
  baseURL: resolveBaseURL(),
  plugins: [organizationClient()],
});

export const { signIn, signOut, useSession, organization } = authClient;
