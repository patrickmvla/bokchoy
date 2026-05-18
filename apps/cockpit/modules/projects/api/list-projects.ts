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
