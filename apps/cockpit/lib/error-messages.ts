// Centralized error → user-readable string mapping.
//
// Three layers, in order of precedence:
//   1. Known backend code → curated friendly message (KNOWN_CODES table).
//   2. Network-class TypeError ("Failed to fetch") → connectivity hint.
//   3. Fall through to err.message or a generic last-resort string.
//
// Duck-types on `.code` rather than importing concrete error classes
// (ProjectApiError lives in modules/projects/api; Better Auth client errors
// have their own shape). Keeping this helper in lib/ as a leaf module means
// any module can import without creating cross-module dependencies.
//
// Adding a new code: append to KNOWN_CODES with a human-readable line. The
// code key matches the wire-protocol `error.code` from the Stripe-wrapped
// error envelope per [[wallet-http-contract]] G5.

const KNOWN_CODES: Record<string, string> = {
  // Projects module (apps/backend/src/projects/index.ts).
  PROJECT_SLUG_EXISTS:
    'A project with this slug already exists. If you just submitted this form, your project may have been created — check the Projects list before retrying.',
  API_KEY_NOT_FOUND:
    "This API key doesn't exist anymore. Refresh the page and try again.",
  ALREADY_REVOKED: 'This key has already been revoked.',

  // Validator hook (shared across handlers via sValidator).
  VALIDATION_ERROR: 'Please check the form fields and try again.',

  // Admin gate (apps/backend/src/admin/admin-gate.ts).
  BC401: 'Your session has expired. Please sign in again.',
  BC400: 'Missing organization context. Try signing out and back in.',
  BC402: 'Request rejected — invalid identifier in the URL.',
  BC403: "You don't have access to this resource.",
  BC404: "You're not a member of this organization.",
  BC405: "You don't have permission to perform this action.",

  // Better Auth client (common codes from better-auth/api/error-codes).
  INVALID_EMAIL_OR_PASSWORD: 'Invalid email or password.',
  USER_NOT_FOUND: 'No account found with that email.',
  EMAIL_NOT_VERIFIED: 'Please verify your email before signing in.',
  CREDENTIAL_ACCOUNT_NOT_FOUND:
    'No password-based account exists for this email. Try signing in with Google or GitHub.',
};

function hasCode(err: unknown): err is { code: string; message?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

function isNetworkError(err: unknown): boolean {
  // fetch() throws a TypeError with "Failed to fetch" on network-class
  // failures (DNS, connection refused, CORS pre-flight reject without our
  // handler). Same shape across Chrome / Firefox / Safari.
  if (!(err instanceof TypeError)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('network');
}

export function userMessage(err: unknown): string {
  if (hasCode(err)) {
    const friendly = KNOWN_CODES[err.code];
    if (friendly) return friendly;
    if (err.message) return err.message;
  }
  if (isNetworkError(err)) {
    return 'Network error. Check your connection and try again.';
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}
