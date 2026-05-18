/** Optimistic cookie-presence redirect for (app)/ routes. Authoritative validation in app/(app)/layout.tsx. */

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
