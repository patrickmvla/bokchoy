// POST /v1/projects fetch wrapper.
//
// Routes through the cockpit's relative-path /v1/* — Vercel rewrite in
// apps/cockpit/next.config.ts proxies to BOKCHOY_BACKEND_URL per (P1)
// reverse-proxy + [[cockpit/auth-surface-mount]] V3. Cookies stay first-party
// (same-origin browser perception); session validates via Better Auth on the
// backend per [[admin-auth-surface]] D1 step 1.
//
// `credentials: 'include'` is required for cookies to flow through the rewrite
// in some browsers (matters for Safari + Firefox strict modes; Chrome forgives
// the omission). Per [[cockpit-stack-integration-research]] F4: same-origin
// fetch ships cookies by default — `include` is belt-and-suspenders.

import type { CreateProjectInput } from '../lib/create-project-schema';
import type { ApiError, CreateProjectResponse } from '../types';

export async function createProject(
  input: CreateProjectInput,
): Promise<CreateProjectResponse> {
  const response = await fetch('/v1/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as ApiError | null;
    const code = payload?.error?.code ?? 'UNKNOWN';
    const message = payload?.error?.message ?? response.statusText;
    throw new ProjectApiError(code, message, response.status);
  }

  return (await response.json()) as CreateProjectResponse;
}

export class ProjectApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ProjectApiError';
  }
}
