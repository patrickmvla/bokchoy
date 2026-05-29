'use client';

import { useQuery } from '@tanstack/react-query';
import { listItems } from '../api/list-items';
import type { Item } from '../types';

export function useItems(projectId: string) {
  return useQuery<Item[]>({
    queryKey: ['items', projectId],
    queryFn: () => listItems(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });
}
