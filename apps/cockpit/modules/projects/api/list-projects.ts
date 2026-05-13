// GET /v1/projects fetch wrapper.
//
// Routes through the cockpit's relative-path /v1/* per (P1) reverse-proxy —
// Vercel rewrite in apps/cockpit/next.config.ts proxies to BOKCHOY_BACKEND_URL.
// Cookies stay first-party so Better Auth session validates server-side per
// [[admin-auth-surface]] D1 step 1.
//
// Bare-array response shape per [[cockpit/admin-list-endpoints-contract]] (R2)
// + (Pa-none) at MVP scope. When (Pa-none) revisits (cursor pagination via
// Stripe envelope), this wrapper's return type changes to the envelope.

import type { ApiError, Project } from '../types';
import { ProjectApiError } from './create-project';

export async function listProjects(): Promise<Project[]> {
  const response = await fetch('/v1/projects', {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as ApiError | null;
    const code = payload?.error?.code ?? 'UNKNOWN';
    const message = payload?.error?.message ?? response.statusText;
    throw new ProjectApiError(code, message, response.status);
  }

  return (await response.json()) as Project[];
}
