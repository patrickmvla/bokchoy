// TanStack Query hook for GET /v1/projects/{id} with verify-key polling.
//
// Per [[cockpit/first-run-journey]] step 11 (T2): poll every ~3s while no
// api_key.lastUsedAt is observed; stop once any key shows lastUsedAt !== null.
// The polling closes the onboarding-trust loop within ~5s of the user's first
// SDK call hitting /v1/health-authed.
//
// The 5-minute polling timeout in the contract's Mitigations section
// (failsafe for users whose first SDK call never lands) is deferred — the
// page-level UI can surface a "Still waiting?" hint via separate useState
// without coupling the timeout into the query layer.
//
// staleTime: 0 — every render path re-evaluates whether to poll. queryKey is
// project-scoped so two detail pages don't share cache.

'use client';

import { useQuery } from '@tanstack/react-query';
import { getProject } from '../api/get-project';
import type { ProjectDetail } from '../types';

const VERIFY_POLL_INTERVAL_MS = 3000;

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
