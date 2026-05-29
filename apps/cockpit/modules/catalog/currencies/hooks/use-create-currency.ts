'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCurrency } from '../api/create-currency';
import type { CreateCurrencyInput } from '../lib/currency-schema';

export function useCreateCurrency(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCurrencyInput) =>
      createCurrency(projectId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['currencies', projectId] }),
  });
}
