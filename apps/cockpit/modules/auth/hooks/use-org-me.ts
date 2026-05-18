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
