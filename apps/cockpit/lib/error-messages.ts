/** Error → user-readable string. Duck-types on `.code` per Stripe-wrapped envelope ([[wallet-http-contract]] G5). */

const KNOWN_CODES: Record<string, string> = {
  PROJECT_SLUG_EXISTS:
    'A project with this slug already exists. If you just submitted this form, your project may have been created — check the Projects list before retrying.',
  API_KEY_NOT_FOUND:
    "This API key doesn't exist anymore. Refresh the page and try again.",
  ALREADY_REVOKED: 'This key has already been revoked.',

  VALIDATION_ERROR: 'Please check the form fields and try again.',

  // Catalog admin per [[cockpit/admin-catalog-endpoints-contract]]. RESOURCE_IN_USE is rendered
  // with its structured detail by the delete dialogs; this is the fallback line.
  CODE_TAKEN:
    'That code is already used in this project. Pick a different one.',
  IMMUTABLE_FIELD:
    'That field cannot be changed after creation. Create a new entry instead.',
  RESOURCE_IN_USE:
    'This is referenced by other catalog entries and cannot be deleted yet.',
  OFFER_MISCONFIGURED:
    'An active offer needs at least one price and at least one item. Add them or keep the offer inactive.',
  UNKNOWN_CURRENCY:
    'One of the selected currencies no longer exists. Refresh and try again.',
  UNKNOWN_ITEM:
    'One of the selected items no longer exists. Refresh and try again.',

  BC401: 'Your session has expired. Please sign in again.',
  BC400: 'Missing organization context. Try signing out and back in.',
  BC402: 'Request rejected — invalid identifier in the URL.',
  BC403: "You don't have access to this resource.",
  BC404: "You're not a member of this organization.",
  BC405: "You don't have permission to perform this action.",

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
  // fetch() throws TypeError("Failed to fetch") on DNS/connection-refused/CORS-reject. Same shape across browsers.
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
