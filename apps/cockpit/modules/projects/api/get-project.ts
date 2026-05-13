// GET /v1/projects/{id} fetch wrapper.
//
// Routes through the cockpit's relative-path /v1/* per (P1) reverse-proxy —
// Vercel rewrite in apps/cockpit/next.config.ts proxies to BOKCHOY_BACKEND_URL.
// Cookies stay first-party so Better Auth session validates server-side per
// [[admin-auth-surface]] D1 step 1.
//
// Response shape: bare project fields + nested `apiKeys[]` per
// [[cockpit/admin-list-endpoints-contract]] (A1). Single round-trip rather
// than two queries because the polling pattern in step 11 needs to read both
// the project + key state in lockstep.

import type { ApiError, ProjectDetail } from '../types';
import { ProjectApiError } from './create-project';

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const response = await fetch(`/v1/projects/${projectId}`, {
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

  return (await response.json()) as ProjectDetail;
}
