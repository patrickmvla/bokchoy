/** RSC session-read primitive. React.cache-wrapped so layouts + pages share one network call per request. */

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
    // Absolute URL required: RSC fetch doesn't resolve relative paths. Skips the next.config rewrite browsers use.
    const res = await fetch(new URL('/api/auth/get-session', backendUrl), {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Session | null;
    return json?.user && json.session ? json : null;
  } catch {
    // Backend unreachable / malformed → null. Callers redirect to /sign-in; degrades gracefully to "log in again".
    return null;
  }
});
