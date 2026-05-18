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
