// TanStack QueryClient factory per [[cockpit-stack-integration-research]] F5.6
// + Vercel `server-no-shared-module-state` rule (F8.13).
//
// CRITICAL: per-request scope via React.cache(). Never cache the QueryClient
// in module-level mutable state — server renders run concurrently in the same
// process; module-level QueryClient would leak cross-request and cross-user.
//
// Default `staleTime: 60_000` per [[cockpit-stack-integration-research]] F6.7
// — Next.js 16 default staleTime is 0 which causes double-fetch on hydration.
// Override globally; per-query staleTime tightens via useQuery options.

import { QueryClient } from '@tanstack/react-query';
import { cache } from 'react';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          // 60-second floor per TanStack Query docs caveat about hydration
          // double-fetch when staleTime defaults to 0.
          staleTime: 60_000,
        },
      },
    }),
);
