'use client';

import { useQuery } from '@tanstack/react-query';
import { listCurrencies } from '../api/list-currencies';
import type { Currency } from '../types';

export function useCurrencies(projectId: string) {
  return useQuery<Currency[]>({
    queryKey: ['currencies', projectId],
    queryFn: () => listCurrencies(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });
}
