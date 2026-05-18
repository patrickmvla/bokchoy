import type { ApiError } from '../types';
import { ProjectApiError } from './create-project';

export interface RevokeApiKeyInput {
  projectId: string;
  keyId: string;
}

export interface RevokeApiKeyResponse {
  id: string;
  revokedAt: string;
}

// Backend returns 404 API_KEY_NOT_FOUND vs 422 ALREADY_REVOKED — callers branch on the error code.
export async function revokeApiKey(
  input: RevokeApiKeyInput,
): Promise<RevokeApiKeyResponse> {
  const response = await fetch(
    `/v1/projects/${input.projectId}/api-keys/${input.keyId}`,
    {
      method: 'DELETE',
      credentials: 'include',
      headers: { accept: 'application/json' },
    },
  );

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as ApiError | null;
    const code = payload?.error?.code ?? 'UNKNOWN';
    const message = payload?.error?.message ?? response.statusText;
    throw new ProjectApiError(code, message, response.status);
  }

  return (await response.json()) as RevokeApiKeyResponse;
}
