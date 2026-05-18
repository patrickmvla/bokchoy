'use client';

import { useQuery } from '@tanstack/react-query';
import { listProjects } from '../api/list-projects';
import type { Project } from '../types';

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
  });
}
