// Authoritative auth-gate layout for the (app)/ route group per
// [[cockpit-stack-integration-research]] F5.6 + cascade obligation #6.
//
// Defense-in-depth: `apps/cockpit/proxy.ts` (slice 8.3.6, per
// [[cockpit/nextjs-16-proxy-research]] F7) handles the optimistic
// cookie-presence redirect at the network boundary. THIS layout handles
// the authoritative `auth.api.getSession()` validation — catches cookies
// that exist but are expired, invalidated server-side, or forged without
// a backing session row.
//
// Every route under app/(app)/ flows through this Server Component. If
// the session is null (cookie present but invalid per the disclaimer
// above, OR backend unreachable, OR malformed payload — see lib/session.ts),
// the layout redirects to /sign-in BEFORE any child RSC renders.
// Same-request `React.cache` memoization in getSession means downstream
// layouts/pages reusing getSession() share the lookup — no double fetch.
//
// Per F6.11: no 'use client' on this layout. Server-only by design;
// session-read happens server-side via auth.api.getSession on the backend.

import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession } from '@/lib/session';
import { AppHeader } from '@/modules/auth/components/app-header';

// TRADE-OFF (Cache Components warning on the cookie-present-but-invalid path):
// Next.js 16 emits "Uncached data or connection() was accessed outside of
// <Suspense>" in dev because lib/session.ts's `cache: 'no-store'` fetch
// is dynamic. The Suspense investigation in slice 8.3.5 verified that
// wrapping silences the warning BUT regresses redirect HTTP semantics
// (307 collapses to 200 with embedded RSC redirect markers; static UI
// strings leak in the response body via RSC streaming). With proxy.ts
// now filtering the no-cookie path at the network boundary, this layout
// only renders on the cookie-PRESENT path — meaning the warning only
// fires on the validated-success path (no leak) and on the rare
// cookie-present-but-invalid path (where the trade-off is acceptable
// because the request was already authenticated enough to reach this
// tier). Keeping the 307 + dev warning.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  return (
    <>
      <AppHeader userEmail={session.user.email} />
      <div>{children}</div>
    </>
  );
}
