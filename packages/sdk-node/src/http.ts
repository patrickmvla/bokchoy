// HTTP client for @bokchoy/sdk-node. Internal module — not part of the
// public API surface. Owns:
//   • URL construction with encodeURIComponent on every customer-supplied
//     path segment (defense-in-depth against path injection — backend also
//     validates via Zod regex, but the SDK is the first line).
//   • Header composition: Bearer auth, Idempotency-Key (auto-generated as
//     `bokchoy-sdk-retry-${uuid4()}` per [[wallet-mechanics]] Part 3 A17 if
//     the caller didn't supply one), Content-Type, User-Agent for backend-
//     side SDK-version observability per [[oss-sdk-only]] engineering note.
//   • Response translation: 2xx → typed parse; non-2xx → typed error class
//     dispatched by `error.code` per [[wallet-http-contract]] G5 Stripe-
//     wrapped envelope. Network/parse failures wrap into BokchoyConnectionError.
//
// Cross-runtime fetch: uses globalThis.fetch (Node 20+, Bun, Cloudflare
// Workers, browsers, Deno — every modern JS runtime has it). The fetch can
// be overridden via the SDK constructor for testing or custom HTTP clients
// (proxy, retry middleware, etc.).

import {
  BokchoyApiError,
  BokchoyAuthenticationError,
  BokchoyConnectionError,
  BokchoyValidationError,
  UnknownCurrencyError,
  UnknownPlayerError,
} from './errors';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  userAgent: string;
  fetchImpl: FetchLike;
}

// Shape of the Stripe-wrapped error body from the backend per
// [[wallet-http-contract]] G5: { error: { code, message, ...flattened-details } }.
// `code` and `message` are always present; everything else is variant-specific
// and read defensively (the SDK doesn't trust the server to ship a known
// shape forever — future backend versions may add fields, drop optional
// ones, etc.).
interface WireErrorEnvelope {
  error: {
    code: string;
    message: string;
    [field: string]: unknown;
  };
}

function isWireErrorEnvelope(value: unknown): value is WireErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.error !== 'object' || v.error === null) return false;
  const e = v.error as Record<string, unknown>;
  return typeof e.code === 'string' && typeof e.message === 'string';
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly userAgent: string;
  private readonly fetchImpl: FetchLike;

  constructor(config: HttpClientConfig) {
    // Strip trailing slash so `${baseUrl}${path}` concatenation works for
    // both 'https://api.bokchoy.com' and 'https://api.bokchoy.com/'.
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.userAgent = config.userAgent;
    this.fetchImpl = config.fetchImpl;
  }

  /**
   * POST a JSON body to a path under the configured baseUrl. `pathSegments`
   * is an array of decoded segments; each is URL-encoded before being joined
   * into the path. Returns the parsed JSON body on 2xx; throws the typed
   * error class on non-2xx or network/parse failure.
   */
  async post<TResponse>(args: {
    pathSegments: ReadonlyArray<string>;
    body: unknown;
    idempotencyKey?: string;
  }): Promise<TResponse> {
    const url = this.buildUrl(args.pathSegments);
    const idempotencyKey =
      args.idempotencyKey ?? `bokchoy-sdk-retry-${globalThis.crypto.randomUUID()}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'User-Agent': this.userAgent,
        },
        body: JSON.stringify(args.body),
      });
    } catch (err) {
      // Fetch threw — DNS / TCP / TLS / timeout / aborted. No structured
      // response to translate.
      throw new BokchoyConnectionError(
        `Network request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      throw new BokchoyConnectionError(
        `Failed to parse JSON response from ${url} (status ${response.status})`,
        { cause: err },
      );
    }

    if (response.ok) return payload as TResponse;

    throw translateErrorResponse(response, payload);
  }

  private buildUrl(pathSegments: ReadonlyArray<string>): string {
    return `${this.baseUrl}/${pathSegments.map((s) => encodeURIComponent(s)).join('/')}`;
  }
}

/**
 * Convert a non-2xx Response + parsed body into the most specific error
 * class available. Dispatch is by HTTP status first, then by error.code
 * within that status — this matches the contract's Stripe-wrapped envelope
 * shape, which is HTTP-status-first / code-second. Unknown shapes fall
 * through to the generic BokchoyApiError catch-all so the caller still gets
 * status + code on `instanceof BokchoyApiError`.
 *
 * Exported for the test surface.
 */
export function translateErrorResponse(response: Response, payload: unknown): BokchoyApiError {
  const requestId = response.headers.get('x-request-id') ?? undefined;

  if (!isWireErrorEnvelope(payload)) {
    return new BokchoyApiError({
      message: `Unexpected error response shape from BokChoy API (status ${response.status})`,
      status: response.status,
      code: 'UNKNOWN_ERROR',
      requestId,
    });
  }

  const { code, message } = payload.error;

  // 404 UNKNOWN_CURRENCY — pull currencyCode + availableCodes per the
  // backend's Stripe-wrapped envelope from
  // apps/backend/src/wallet/index.ts UNKNOWN_CURRENCY branch.
  if (response.status === 404 && code === 'UNKNOWN_CURRENCY') {
    const currencyCode = readString(payload.error.currencyCode) ?? '';
    const availableCodes = readStringArray(payload.error.availableCodes) ?? [];
    return new UnknownCurrencyError({ message, requestId, currencyCode, availableCodes });
  }

  // 404 UNKNOWN_PLAYER — reserved per contract Mitigation #1; not raised
  // by current backend but the parse path is here so a future server-side
  // change activates the SDK class without an SDK release.
  if (response.status === 404 && code === 'UNKNOWN_PLAYER') {
    const playerExternalId = readString(payload.error.playerExternalId) ?? '';
    return new UnknownPlayerError({ message, requestId, playerExternalId });
  }

  if (response.status === 401) {
    return new BokchoyAuthenticationError({
      message,
      status: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 400) {
    const issues = readIssues(payload.error.issues);
    return new BokchoyValidationError({
      message,
      status: response.status,
      code,
      requestId,
      ...(issues !== undefined ? { issues } : {}),
    });
  }

  return new BokchoyApiError({
    message,
    status: response.status,
    code,
    requestId,
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readStringArray(value: unknown): ReadonlyArray<string> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === 'string');
}

type Issue = { message: string; path: ReadonlyArray<string | number> };

function readIssues(value: unknown): ReadonlyArray<Issue> | undefined {
  if (!Array.isArray(value)) return undefined;
  const issues: Issue[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const message = readString(r.message);
    if (message === undefined) continue;
    const path: ReadonlyArray<string | number> = Array.isArray(r.path)
      ? r.path.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number')
      : [];
    issues.push({ message, path });
  }
  return issues;
}
