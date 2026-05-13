// Client Component wrapper for TanStack QueryClient provider.
//
// Mounted at root layout (`app/layout.tsx`) per [[cockpit/file-structure]] +
// [[cockpit-stack-integration-research]] F5.6.
//
// 'use client' here is per F6.11 leaf-placement discipline — the root layout
// stays a Server Component; only this thin wrapper opts into client rendering.
// Children rendered inside the provider include both Server and Client
// Components; the QueryClient is available to any client child that calls
// useQuery / useMutation.

'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getQueryClient } from './query-client';

export function ReactQueryProviders({ children }: { children: ReactNode }) {
  // getQueryClient is React.cache-wrapped: returns the same instance for the
  // current request scope on the server; on the client, called once.
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
