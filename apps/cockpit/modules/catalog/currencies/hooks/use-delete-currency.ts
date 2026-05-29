'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCurrency } from '../api/delete-currency';

export function useDeleteCurrency(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (currencyId: string) => deleteCurrency(projectId, currencyId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['currencies', projectId] }),
  });
}
