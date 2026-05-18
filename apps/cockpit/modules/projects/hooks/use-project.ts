'use client';

import { useQuery } from '@tanstack/react-query';
import { getProject } from '../api/get-project';
import type { ProjectDetail } from '../types';

const VERIFY_POLL_INTERVAL_MS = 3000;

/** Polls every 3s until any api_key.lastUsedAt is observed. Per [[cockpit/first-run-journey]] step 11. */
export function useProject(projectId: string) {
  return useQuery<ProjectDetail>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
    enabled: Boolean(projectId),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return VERIFY_POLL_INTERVAL_MS;
      const verified = data.apiKeys.some((k) => k.lastUsedAt !== null);
      return verified ? false : VERIFY_POLL_INTERVAL_MS;
    },
  });
}
