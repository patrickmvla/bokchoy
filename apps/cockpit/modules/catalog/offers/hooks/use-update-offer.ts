'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateOffer } from '../api/update-offer';
import type { UpdateOfferInput } from '../lib/offer-schema';

export function useUpdateOffer(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      offerId,
      input,
    }: {
      offerId: string;
      input: UpdateOfferInput;
    }) => updateOffer(projectId, offerId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['offers', projectId] }),
  });
}
