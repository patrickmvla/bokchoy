import type { OrgMe } from '../types';

export class OrgApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'OrgApiError';
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export async function getOrgMe(): Promise<OrgMe> {
  const response = await fetch('/v1/orgs/me', {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    throw new OrgApiError(
      payload?.error?.code ?? 'UNKNOWN',
      payload?.error?.message ?? response.statusText,
      response.status,
    );
  }

  return (await response.json()) as OrgMe;
}
