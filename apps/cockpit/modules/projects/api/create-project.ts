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
