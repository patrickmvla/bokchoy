'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type RevokeApiKeyInput,
  type RevokeApiKeyResponse,
  revokeApiKey,
} from '../api/revoke-api-key';

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation<RevokeApiKeyResponse, Error, RevokeApiKeyInput>({
    mutationFn: (input) => revokeApiKey(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['project', variables.projectId],
      });
    },
  });
}
