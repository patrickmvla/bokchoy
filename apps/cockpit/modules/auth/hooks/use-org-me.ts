// TanStack Query hook for GET /v1/orgs/me.
//
// Used by the cockpit chrome to display the active org's name + the
// signed-in user's role. staleTime is long (5 min) since org info changes
// rarely — the chrome doesn't need real-time refresh. Manual invalidation
// owed when org rename / leave-org flows land.

'use client';

import { useQuery } from '@tanstack/react-query';
import { getOrgMe } from '../api/get-org-me';
import type { OrgMe } from '../types';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function useOrgMe() {
  return useQuery<OrgMe>({
    queryKey: ['org-me'],
    queryFn: getOrgMe,
    staleTime: FIVE_MINUTES_MS,
    refetchOnWindowFocus: false,
  });
}
