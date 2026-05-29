'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteOffer } from '../api/delete-offer';

export function useDeleteOffer(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => deleteOffer(projectId, offerId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['offers', projectId] }),
  });
}
