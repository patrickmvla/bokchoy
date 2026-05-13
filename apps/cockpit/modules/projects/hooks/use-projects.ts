// TanStack Query hook for GET /v1/projects.
//
// Client-side fetching at slice 8.4 first cut — when slice 8.3.2 lands the
// auth gate + lib/session.ts RSC session-read, migrate to the RSC pattern
// per [[cockpit/first-run-journey]] step 4 + [[cockpit-stack-integration-research]]
// F5.6 (React.cache wrapping a server-side fetch with forwarded cookies).
// Behavior is identical; only the rendering strategy differs.

'use client';

import { useQuery } from '@tanstack/react-query';
import { listProjects } from '../api/list-projects';
import type { Project } from '../types';

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: listProjects,
    // Cockpit list view is fairly static; staleTime 30s prevents refetch on
    // tab refocus / route remount for short-lived navigation. Background
    // refetch on window focus stays disabled until a real reactivity need
    // surfaces (e.g., real-time project status updates).
    staleTime: 30_000,
  });
}
