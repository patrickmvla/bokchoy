// GET /v1/orgs/me fetch wrapper.
//
// Routes through the cockpit's relative-path /v1/* per (P1) reverse-proxy.
// Cookies stay first-party; Better Auth session validates server-side via
// adminGate per [[admin-auth-surface]] D1.
//
// Bare response per [[cockpit/admin-list-endpoints-contract]] (R2). On
// non-2xx the cockpit gets a Stripe-wrapped error envelope — surfaced via
// OrgApiError so the caller can branch on .code if needed (BC401 expired
// session, BC404 not-a-member, etc.).

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
