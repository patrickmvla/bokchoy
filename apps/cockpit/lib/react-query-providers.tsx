/** Client-component wrapper for TanStack QueryClient. Keeps root layout a Server Component (F6.11 leaf-placement). */

'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getQueryClient } from './query-client';

export function ReactQueryProviders({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
