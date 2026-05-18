/** Cockpit-side types mirroring apps/backend/src/projects/index.ts. Promote to @bokchoy/shared-types if divergence appears. */

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  isChildDirected: boolean;
  status: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyRecord {
  id: string;
  projectId: string;
  keyPrefix: string;
  name: string;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  projectId: string;
  keyPrefix: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ProjectDetail extends Project {
  apiKeys: ApiKey[];
}

export interface CreateProjectResponse {
  project: Project;
}

export interface CreateApiKeyResponse {
  /** Plaintext API key — visible ONCE. */
  apiKey: string;
  apiKeyRecord: ApiKeyRecord;
}

/** Stripe-wrapped error envelope per [[wallet-http-contract]] G5. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    issues?: Array<{ message: string; path: ReadonlyArray<string | number> }>;
  };
}
