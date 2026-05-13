// Auth-gate layout for the (app)/ route group per
// [[cockpit-stack-integration-research]] F5.6 + cascade obligation #6.
//
// Every route under app/(app)/ flows through this Server Component. If the
// session is null (no cookie, expired token, backend unreachable, or
// malformed payload — see lib/session.ts), the layout redirects to
// /sign-in BEFORE any child RSC renders. Same-request `React.cache`
// memoization in getSession means downstream layouts/pages that also call
// getSession() reuse this lookup — no double fetch.
//
// Per F6.11: no 'use client' on this layout. Server-only by design;
// session-read happens server-side via auth.api.getSession on the backend.
//
// Follow-on owed (this slice does NOT add it):
//   - apps/cockpit/app/sign-in/page.tsx — OAuth-primary form per F7. Until
//     this lands, the redirect target 404s. Closing the data-leak hole on
//     /projects, /projects/new, /projects/{id} is still strictly better
//     than leaving them publicly readable — a 404 at /sign-in is a worse
//     UX than a working sign-in page, but a much better UX than exposing
//     an org's project list to anyone.

import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession } from '@/lib/session';
import { AppHeader } from '@/modules/auth/components/app-header';

// Auth-gate layout for the (app)/ route group. Server Component (no
// 'use client' per [[cockpit-stack-integration-research]] F6.11). Awaits
// getSession; redirect('/sign-in') on null. Children passthrough.
//
// TRADE-OFF (Cache Components warning vs auth-gate semantics):
// Next.js 16 emits "Uncached data or connection() was accessed outside of
// <Suspense>" in dev because lib/session.ts's `cache: 'no-store'` fetch
// is dynamic. Wrapping this in <Suspense> silences the warning but breaks
// the auth-gate's HTTP semantics — `redirect()` inside a Suspense boundary
// returns HTTP 200 with an embedded RSC redirect signal instead of a clean
// 307, and the page content streams into the body before the redirect
// fires (UI strings leak; backend data does NOT because all fetches are
// client-side and require the cookie). For security + monitoring + crawler
// hygiene we keep the 307 and live with the dev warning. Owed migration:
// move the gate to middleware.ts for an edge-level optimistic cookie check
// (zero leak, no warning); keep this layout's getSession as authoritative
// defense-in-depth for expired/invalid cookies.
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
