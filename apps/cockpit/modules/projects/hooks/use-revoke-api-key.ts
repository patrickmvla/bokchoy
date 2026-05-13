// TanStack Query mutation for DELETE /v1/projects/{id}/api-keys/{keyId}.
//
// On success: invalidate the project's detail query so the detail view
// refetches and the revoke flips the row's UI immediately. The invalidation
// is scoped — `['project', projectId]` only — to avoid bouncing the projects
// list (which doesn't surface revoke state). use-projects shows project rows
// without per-key information.
//
// Error branching is the caller's responsibility — the underlying
// ProjectApiError carries `.code` and `.status`. Caller decides how to
// surface 404 vs 422 vs 5xx via toast / banner.

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
