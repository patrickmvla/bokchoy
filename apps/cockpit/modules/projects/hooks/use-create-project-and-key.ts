'use client';

import { useMutation } from '@tanstack/react-query';
import { createApiKey } from '../api/create-api-key';
import { createProject } from '../api/create-project';
import type { CreateProjectInput } from '../lib/create-project-schema';
import type { ApiKeyRecord, Project } from '../types';

interface CreateProjectAndKeyResult {
  project: Project;
  apiKey: string;
  apiKeyRecord: ApiKeyRecord;
}

/**
 * Step 1 succeeded, step 2 failed. Form transitions to retry-key UI using `projectId` + same
 * Idempotency-Key (`cockpit-first-key-${projectId}`) so the backend replays if step 2 actually committed.
 */
export class ProjectCreatedButKeyFailedError extends Error {
  public readonly projectId: string;
  public readonly project: Project;
  public override readonly cause: Error;

  constructor(projectId: string, project: Project, cause: Error) {
    super(cause.message || 'Project created but API-key issuance failed.');
    this.name = 'ProjectCreatedButKeyFailedError';
    this.projectId = projectId;
    this.project = project;
    this.cause = cause;
  }
}

/** (E2) split-POST: POST /v1/projects → POST /v1/projects/{id}/api-keys, surfaced as one mutation. */
export function useCreateProjectAndKey() {
  return useMutation<CreateProjectAndKeyResult, Error, CreateProjectInput>({
    mutationFn: async (input) => {
      const { project } = await createProject(input);
      try {
        const { apiKey, apiKeyRecord } = await createApiKey({
          projectId: project.id,
          name: `${project.name} default key`,
        });
        return { project, apiKey, apiKeyRecord };
      } catch (keyError) {
        throw new ProjectCreatedButKeyFailedError(
          project.id,
          project,
          keyError instanceof Error ? keyError : new Error(String(keyError)),
        );
      }
    },
  });
}
