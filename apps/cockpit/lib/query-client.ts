/** TanStack QueryClient factory. Per-request scope via React.cache — module-level would leak across users. */

import { QueryClient } from '@tanstack/react-query';
import { cache } from 'react';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          // Next.js 16 default staleTime is 0 → double-fetch on hydration. 60s floor suppresses.
          staleTime: 60_000,
        },
      },
    }),
);
