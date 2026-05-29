'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateCurrency } from '../api/update-currency';
import type { UpdateCurrencyInput } from '../lib/currency-schema';

export function useUpdateCurrency(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      currencyId,
      input,
    }: {
      currencyId: string;
      input: UpdateCurrencyInput;
    }) => updateCurrency(projectId, currencyId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['currencies', projectId] }),
  });
}
