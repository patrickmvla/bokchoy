// Cockpit-side type shape for backend Project + ApiKeyRecord responses.
//
// Mirrors apps/backend/src/projects/index.ts handler responses. If/when types
// diverge, promote to @bokchoy/shared-types and consume on both sides. For
// slice 8.4 first cut the duplication risk is contained — both the backend
// handler and this file are committed in the same slice.

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

// Full api_keys row shape as returned by GET /v1/projects/{id} nested apiKeys[]
// per (A1). Superset of ApiKeyRecord — adds lastUsedAt + revokedAt. keyPrefix
// matches the Drizzle schema field name (the vault contract says `prefix`;
// codebase shipped `keyPrefix` first via createApiKeyHandler — amendment to
// [[cockpit/admin-list-endpoints-contract]] owed).
export interface ApiKey {
  id: string;
  projectId: string;
  keyPrefix: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

// GET /v1/projects/{id} response shape: project + nested apiKeys[] per (A1).
// Powers [[cockpit/first-run-journey]] step 11 verify-key polling.
export interface ProjectDetail extends Project {
  apiKeys: ApiKey[];
}

// POST /v1/projects success response shape per backend handler.
export interface CreateProjectResponse {
  project: Project;
}

// POST /v1/projects/{id}/api-keys success response shape per backend handler.
export interface CreateApiKeyResponse {
  /** Plaintext API key — visible ONCE per K1 + [[wallet-http-contract]] slice 8.1a. */
  apiKey: string;
  apiKeyRecord: ApiKeyRecord;
}

// Stripe-wrapped error envelope per [[wallet-http-contract]] G5 + (R2) — used
// for non-2xx responses across all admin endpoints.
export interface ApiError {
  error: {
    code: string;
    message: string;
    issues?: Array<{ message: string; path: ReadonlyArray<string | number> }>;
  };
}
