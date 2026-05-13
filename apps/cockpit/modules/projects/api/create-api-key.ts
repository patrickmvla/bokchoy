// POST /v1/projects/{projectId}/api-keys fetch wrapper.
//
// Idempotency-Key per [[cockpit/admin-list-endpoints-contract]] (E2) + the
// idempotencyMiddleware on the backend route (slice 8.1b). Key derivation per
// the contract: `cockpit-first-key-${projectId}` — projectId-scoped so the
// retry on a transient failure returns the SAME api_key row from the
// idempotency-keys store rather than minting a second key.
//
// The plaintext apiKey returned here is shown ONCE in the visible-once modal
// per [[cockpit/first-run-journey]] step 7 + K1 (HMAC stored backend-side per
// slice 8.1a). Cockpit MUST NOT persist the plaintext anywhere except in
// React state for the modal's lifetime.

import type { ApiError, CreateApiKeyResponse } from '../types';
import { ProjectApiError } from './create-project';

export interface CreateApiKeyInput {
  projectId: string;
  name: string;
  /** Optional idempotency key — defaults to `cockpit-first-key-${projectId}`
   * per [[cockpit/admin-list-endpoints-contract]]. Override for subsequent
   * keys on the same project. */
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
