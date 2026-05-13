// DELETE /v1/projects/{projectId}/api-keys/{keyId} fetch wrapper.
//
// Routes through the cockpit's relative-path /v1/* per (P1) reverse-proxy —
// Vercel rewrite in apps/cockpit/next.config.ts proxies to BOKCHOY_BACKEND_URL.
// Cookies stay first-party so Better Auth session validates server-side per
// [[admin-auth-surface]] D1 step 1.
//
// Backend handler returns bare data `{ id, revokedAt }` on success per
// [[cockpit/admin-list-endpoints-contract]] (R2). Two distinct error codes:
//   - 404 API_KEY_NOT_FOUND  (key doesn't belong to this project)
//   - 422 ALREADY_REVOKED    (key exists but revoked_at was already set)
// Both surface as ProjectApiError with the typed code field; caller branches
// on code.

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
