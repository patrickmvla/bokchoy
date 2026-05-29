/** Shared fetch + error type for the catalog admin API. Per [[cockpit/admin-catalog-endpoints-contract]]. */

/** Stripe-wrapped error envelope: `{ error: { code, message, ...detailFields } }` (R2). */
type ApiErrorEnvelope = {
  error: { code: string; message: string } & Record<string, unknown>;
};

export class CatalogApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    /** Spread detail fields from the envelope (e.g. resourceCode, removableReferences, blockingReferences). */
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CatalogApiError';
  }
}

export async function catalogFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as ApiErrorEnvelope | null;
    const err = payload?.error;
    const { code: _code, message: _message, ...detail } = err ?? {};
    throw new CatalogApiError(
      err?.code ?? 'UNKNOWN',
      err?.message ?? response.statusText,
      response.status,
      detail,
    );
  }

  // 204 No Content (deletes) — nothing to parse.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
