// TanStack Query mutation chaining POST /v1/projects → POST /v1/projects/{id}/api-keys.
//
// (E2) split-POST per [[cockpit/admin-list-endpoints-contract]] — one mutation
// from the form's perspective, two sequential network calls under the hood.
// The hook surfaces a single loading state + a unified success payload
// `{ project, apiKey, apiKeyRecord }` so the form can transition cleanly to
// the visible-once modal per [[cockpit/first-run-journey]] step 7 once both
// succeed.
//
// Failure modes:
//   - Step 1 fails (POST /v1/projects) — error surfaces directly via normal
//     mutation error path; no project created, no api_key created. Form
//     re-enables for retry with the same name+slug.
//   - Step 2 fails (POST /v1/projects/{id}/api-keys) — project exists but no
//     key. Mutation throws `ProjectCreatedButKeyFailedError` carrying the
//     orphaned `projectId` so the form can transition to a retry-key state
//     (calling step 2 alone with the same Idempotency-Key
//     `cockpit-first-key-${projectId}` — idempotencyMiddleware will replay
//     the cached response if step 2 actually committed but the cockpit
//     missed the response; otherwise the handler runs fresh).
//
// Without this carve-out, a step-2 failure → form's onError toasts the error
// → user retries the form with same name+slug → step 1 returns 409
// PROJECT_SLUG_EXISTS → user is stuck. The retry-key path closes that loop.

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
 * Thrown when POST /v1/projects succeeded but POST /v1/projects/{id}/api-keys
 * failed. Carries the orphaned `projectId` + the just-created `project` row so
 * the form can offer a retry-key UI without losing the project context.
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
