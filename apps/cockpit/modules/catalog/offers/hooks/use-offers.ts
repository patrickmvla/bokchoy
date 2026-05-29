'use client';

import { useQuery } from '@tanstack/react-query';
import { listOffers } from '../api/list-offers';
import type { Offer } from '../types';

export function useOffers(projectId: string) {
  return useQuery<Offer[]>({
    queryKey: ['offers', projectId],
    queryFn: () => listOffers(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });
}
