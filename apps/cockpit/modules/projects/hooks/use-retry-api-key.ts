'use client';

import { useMutation } from '@tanstack/react-query';
import { createApiKey } from '../api/create-api-key';
import type { CreateApiKeyResponse } from '../types';

interface RetryApiKeyInput {
  projectId: string;
  projectName: string;
}

/** Retry-only for step 2 of project-creation when step 1 succeeded. Same Idempotency-Key replays the original. */
export function useRetryApiKey() {
  return useMutation<CreateApiKeyResponse, Error, RetryApiKeyInput>({
    mutationFn: async ({ projectId, projectName }) =>
      createApiKey({
        projectId,
        name: `${projectName} default key`,
      }),
  });
}
