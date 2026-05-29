'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createItem } from '../api/create-item';
import type { CreateItemInput } from '../lib/item-schema';

export function useCreateItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateItemInput) => createItem(projectId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['items', projectId] }),
  });
}
