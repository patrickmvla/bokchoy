// RSC session-read primitive per [[cockpit-stack-integration-research]] F5.5
// + canonical pattern in the entry's cascade obligation #5.
//
// Wrapped in `React.cache` so multiple RSCs in the same request (layout +
// page + nested layouts) all read from one network call. Server-side fetch
// must use an absolute URL (RSC fetches don't resolve relative paths), so
// we call the backend's `/api/auth/get-session` directly via
// BOKCHOY_BACKEND_URL — skipping the Vercel rewrite that browser-side calls
// go through. Per F6.5: getSessionCookie is NOT used; this is the
// server-side validated path. `cache: 'no-store'` overrides Next.js 16's
// fetch default and keeps each request's session check fresh.
//
// The research entry names a separate `BOKCHOY_INTERNAL_URL` env var; we
// reuse the existing BOKCHOY_BACKEND_URL since the cockpit already wires
// it through next.config.ts rewrites. Production can split internal vs
// external URLs later if traffic warrants the latency optimization (the
// internal name skips the public load balancer).
//
// Session shape: minimal inline type — only `user` and `session` presence
// matters to the auth gate. Promote to the full Better Auth Session type
// once the cockpit adds `better-auth` as a dep (slice owed for the
// sign-in UI per [[cockpit-stack-integration-research]] cascade #5).
//
// Error handling: backend unreachable, malformed response, or session
// rejected → return null. Callers redirect to /sign-in on null, so any
// failure mode degrades gracefully into the same outcome — "log in again".
// This is deliberately conservative; a backend-down operator should NOT see
// /projects render (RSC would crash silently mid-stream); they should bounce
// to sign-in where the error is visible.

import { headers } from 'next/headers';
import { cache } from 'react';

export interface Session {
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
  };
  session: {
    id: string;
    activeOrganizationId?: string | null;
  };
}

export const getSession = cache(async (): Promise<Session | null> => {
  const cookieHeader = (await headers()).get('cookie') ?? '';
  const backendUrl = process.env.BOKCHOY_BACKEND_URL ?? 'http://localhost:3000';

  try {
    const res = await fetch(new URL('/api/auth/get-session', backendUrl), {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Session | null;
    return json?.user && json.session ? json : null;
  } catch {
    return null;
  }
});
