import type { ApiError, CreateApiKeyResponse } from '../types';
import { ProjectApiError } from './create-project';

export interface CreateApiKeyInput {
  projectId: string;
  name: string;
  /** Defaults to `cockpit-first-key-${projectId}`. Override for additional keys on the same project. */
  idempotencyKey?: string;
}

export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResponse> {
  const idempotencyKey =
    input.idempotencyKey ?? `cockpit-first-key-${input.projectId}`;

  const response = await fetch(`/v1/projects/${input.projectId}/api-keys`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({ name: input.name }),
  });

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as ApiError | null;
    const code = payload?.error?.code ?? 'UNKNOWN';
    const message = payload?.error?.message ?? response.statusText;
    throw new ProjectApiError(code, message, response.status);
  }

  return (await response.json()) as CreateApiKeyResponse;
}
