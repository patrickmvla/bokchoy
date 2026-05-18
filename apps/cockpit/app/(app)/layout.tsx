/** Authoritative auth gate for (app)/ routes. Defense-in-depth above proxy.ts's optimistic cookie check. */

import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession } from '@/lib/session';
import { AppHeader } from '@/modules/auth/components/app-header';

// Keeping 307 redirect + dev Cache Components warning on the rare cookie-present-but-invalid path:
// Suspense-wrapping silences the warning but collapses 307 → 200 with embedded RSC redirect markers.
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
