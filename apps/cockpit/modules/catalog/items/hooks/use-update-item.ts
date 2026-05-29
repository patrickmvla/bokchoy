'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateItem } from '../api/update-item';
import type { UpdateItemInput } from '../lib/item-schema';

export function useUpdateItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      input,
    }: {
      itemId: string;
      input: UpdateItemInput;
    }) => updateItem(projectId, itemId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['items', projectId] }),
  });
}
