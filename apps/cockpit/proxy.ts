// Network-boundary auth gate for the (app)/ route group per
// [[cockpit/nextjs-16-proxy-research]] F7. Slice 8.3.6 — the migration
// owed since slice 8.3.5's Suspense investigation.
//
// File convention: Next.js 16 deprecated `middleware.ts` in v16.0.0;
// canonical name is now `proxy.ts` (research entry F1). The named export
// MUST be `proxy`, not `middleware`. Backward-compat `middleware.ts` exists
// in 16.x with a deprecation warning, slated for removal in a future major.
//
// Runtime: `proxy.ts` runs on Node.js exclusively (research entry F2).
// The `runtime` config field is unavailable here — setting it throws at
// build time. `getSessionCookie` is pure cookie parsing (no DB, no native
// modules) so the runtime change is API-shape-neutral.
//
// Role: OPTIMISTIC presence check only. `getSessionCookie` returns the
// cookie value or null WITHOUT server-side validation
// ([[cockpit-stack-integration-research]] F6 row 5; Better Auth
// `integrations/next` docs verbatim: "THIS IS NOT SECURE! This is the
// recommended approach to optimistically redirect users."). Authoritative
// validation lives in `app/(app)/layout.tsx` via `lib/session.ts`'s
// `auth.api.getSession()` — defense-in-depth for cookies that exist but
// are expired, invalidated server-side, or forged without a backing
// session row.
//
// Matcher: two-entry form for the (app)/projects/ URL tree. Bare
// `/projects` covered explicitly so a future refactor flipping the
// path-to-regexp `*` quantifier to `+` doesn't silently lose bare-path
// coverage. Extend the array when new (app)/ routes land (settings,
// billing, etc.).
//
// Execution order (research entry Source 1): proxy runs at chain step 3,
// BEFORE next.config.ts `rewrites()` (step 4-6) and filesystem routes
// (step 5). The matcher does NOT match `/api/auth/*` or `/v1/*`, so the
// cockpit's rewrite proxy to the backend is unaffected.
//
// Server Function caveat (research entry F5): if a future slice adds
// Server Actions on /projects/*, they POST to the owning route and DO
// flow through this gate. If they're added at paths the matcher excludes,
// they bypass it — server-side auth verification inside the action is
// mandatory regardless. No current Server Actions in the cockpit.

import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest): NextResponse {
  const cookie = getSessionCookie(request);
  if (cookie === null) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/projects', '/projects/:path*'],
};
