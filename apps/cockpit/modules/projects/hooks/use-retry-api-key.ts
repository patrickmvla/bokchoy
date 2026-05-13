// Retry-only mutation for POST /v1/projects/{id}/api-keys.
//
// Used by the create-project form when the main mutation throws
// `ProjectCreatedButKeyFailedError` (step 1 succeeded, step 2 failed). The
// retry calls step 2 alone against the orphaned projectId. Idempotency-Key
// stays `cockpit-first-key-${projectId}` (same value as the first attempt),
// so if step 2 actually committed on the backend but the cockpit lost the
// response, idempotencyMiddleware replays the cached payload; otherwise the
// handler runs fresh.

'use client';

import { useMutation } from '@tanstack/react-query';
import { createApiKey } from '../api/create-api-key';
import type { CreateApiKeyResponse } from '../types';

interface RetryApiKeyInput {
  projectId: string;
  /** Project name — used to derive the human-readable api_key name. Passed
   * separately so the hook doesn't have to re-fetch the project row. */
  projectName: string;
}

export function useRetryApiKey() {
  return useMutation<CreateApiKeyResponse, Error, RetryApiKeyInput>({
    mutationFn: async ({ projectId, projectName }) =>
      createApiKey({
        projectId,
        name: `${projectName} default key`,
      }),
  });
}
