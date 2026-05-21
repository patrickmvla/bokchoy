/** Internal HTTP client. globalThis.fetch by default; replaceable via SDK constructor for tests/middleware. */

import {
  BokchoyApiError,
  BokchoyAuthenticationError,
  BokchoyConnectionError,
  BokchoyValidationError,
  InsufficientFundsError,
  InsufficientInventoryError,
  InvalidPaymentCurrencyError,
  InventoryOverflowError,
  OfferInactiveError,
  OfferMisconfiguredError,
  UnknownCurrencyError,
  UnknownItemError,
  UnknownOfferError,
  UnknownPlayerError,
} from './errors';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  userAgent: string;
  fetchImpl: FetchLike;
}

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

  /**
   * GET a path under the configured baseUrl. No body, no Idempotency-Key —
   * GETs are HTTP-spec-idempotent and Stripe convention scopes the header to mutations.
   * `query` map: string/number values URL-encoded; undefined values omitted.
   */
  async get<TResponse>(args: {
    pathSegments: ReadonlyArray<string>;
    query?: Readonly<Record<string, string | number | undefined>>;
  }): Promise<TResponse> {
    const url = this.buildUrl(args.pathSegments) + buildQueryString(args.query);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': this.userAgent,
        },
      });
    } catch (err) {
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

function buildQueryString(
  query: Readonly<Record<string, string | number | undefined>> | undefined,
): string {
  if (query === undefined) return '';
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/** Non-2xx → typed error. Dispatch by status then `error.code`; unknown shapes fall through to BokchoyApiError. */
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

  if (response.status === 404 && code === 'UNKNOWN_CURRENCY') {
    const currencyCode = readString(payload.error.currencyCode) ?? '';
    const availableCodes = readStringArray(payload.error.availableCodes) ?? [];
    return new UnknownCurrencyError({ message, requestId, currencyCode, availableCodes });
  }

  // Reserved class — backend doesn't raise this yet but the parse path activates without an SDK release.
  if (response.status === 404 && code === 'UNKNOWN_PLAYER') {
    const playerExternalId = readString(payload.error.playerExternalId) ?? '';
    return new UnknownPlayerError({ message, requestId, playerExternalId });
  }

  if (response.status === 404 && code === 'UNKNOWN_ITEM') {
    const itemCode = readString(payload.error.itemCode) ?? '';
    const availableItems = readStringArray(payload.error.availableItems) ?? [];
    return new UnknownItemError({ message, requestId, itemCode, availableItems });
  }

  if (response.status === 422 && code === 'INVENTORY_OVERFLOW') {
    return new InventoryOverflowError({
      message,
      requestId,
      currentCount: readNumber(payload.error.currentCount) ?? 0,
      requestedAmount: readNumber(payload.error.requestedAmount) ?? 0,
      maxCount: readNumber(payload.error.maxCount) ?? 0,
      availableCapacity: readNumber(payload.error.availableCapacity) ?? 0,
    });
  }

  if (response.status === 422 && code === 'INSUFFICIENT_FUNDS') {
    const walletId = readString(payload.error.walletId);
    const requested = readString(payload.error.requested);
    const available = readString(payload.error.available);
    return new InsufficientFundsError({
      message,
      requestId,
      ...(walletId !== undefined ? { walletId } : {}),
      ...(requested !== undefined ? { requested } : {}),
      ...(available !== undefined ? { available } : {}),
    });
  }

  if (response.status === 422 && code === 'INSUFFICIENT_INVENTORY') {
    const currentCount = readNumber(payload.error.currentCount);
    const requestedAmount = readNumber(payload.error.requestedAmount);
    const instanceId = readString(payload.error.instanceId);
    return new InsufficientInventoryError({
      message,
      requestId,
      ...(currentCount !== undefined ? { currentCount } : {}),
      ...(requestedAmount !== undefined ? { requestedAmount } : {}),
      ...(instanceId !== undefined ? { instanceId } : {}),
    });
  }

  if (response.status === 404 && code === 'UNKNOWN_OFFER') {
    const offerCode = readString(payload.error.offerCode) ?? '';
    return new UnknownOfferError({ message, requestId, offerCode });
  }

  if (response.status === 422 && code === 'OFFER_INACTIVE') {
    const offerCode = readString(payload.error.offerCode) ?? '';
    return new OfferInactiveError({ message, requestId, offerCode });
  }

  if (response.status === 422 && code === 'INVALID_PAYMENT_CURRENCY') {
    const acceptedCurrencies = readStringArray(payload.error.acceptedCurrencies) ?? [];
    return new InvalidPaymentCurrencyError({ message, requestId, acceptedCurrencies });
  }

  if (response.status === 422 && code === 'OFFER_MISCONFIGURED') {
    const offerCode = readString(payload.error.offerCode) ?? '';
    return new OfferMisconfiguredError({ message, requestId, offerCode });
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

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
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
