'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createOffer } from '../api/create-offer';
import type { CreateOfferInput } from '../lib/offer-schema';

export function useCreateOffer(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOfferInput) => createOffer(projectId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['offers', projectId] }),
  });
}
