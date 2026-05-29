'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteItem } from '../api/delete-item';

export function useDeleteItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteItem(projectId, itemId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['items', projectId] }),
  });
}
