// BokChoy SDK error hierarchy per [[wallet/credit-route-contract]] cascade #11 +
// [[marketing/v1-shape]] Mitigation #1.
//
// Two contract-mandated classes:
//   • UnknownCurrencyError — backend 404 UNKNOWN_CURRENCY; the typed
//     `availableCodes: string[]` property lets callers programmatically present
//     the named alternatives, and the human-readable message lists them too.
//   • UnknownPlayerError  — reserved class for the symmetric future case (the
//     current backend lazy-creates players on first credit so this is not
//     currently raised; the class is part of the SDK surface so a future
//     reject-with-error flow can switch on it).
//
// Plus three thin Stripe-pattern wrappers for high-frequency dispatch
// targets — Authentication (401), Validation (400), and a generic
// BokchoyApiError catch-all for everything else (BC010 InsufficientFunds,
// BC050 UNKNOWN_REASON_CODE, etc.). Customers dispatch by `instanceof` for
// the named classes and by `.code` for the BCxxx variants. Per Stripe's
// shape — production-cited × 1 (Stripe SDK class hierarchy verbatim).
//
// BokchoyConnectionError covers fetch-threw / JSON-parse-failure / non-Error
// rejections — the network or parse layer, not a structured server response.

/**
 * Base class for all BokChoy SDK errors. `instanceof BokchoyError` catches
 * every error this SDK throws (API errors, connection errors).
 */
export abstract class BokchoyError extends Error {
  override readonly name: string;

  constructor(name: string, message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined);
    this.name = name;
  }
}

/**
 * Network-layer or response-parse failure. The HTTP request did not produce
 * a structured server response. Includes: fetch threw (DNS failure, TCP
 * reset, timeout), or the response body wasn't JSON / had unexpected shape.
 * Customers should retry these (with backoff) at their own discretion.
 */
export class BokchoyConnectionError extends BokchoyError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('BokchoyConnectionError', message, options);
  }
}

/**
 * Base class for any 4xx/5xx response that carries a structured error body.
 * `code` is the backend error code (e.g. 'UNKNOWN_CURRENCY', 'BC010',
 * 'VALIDATION_ERROR'); `status` is the HTTP status; `requestId` (when
 * present) is the X-Request-Id header echo for support tickets.
 */
export class BokchoyApiError extends BokchoyError {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string | undefined;

  constructor(args: {
    name?: string;
    message: string;
    status: number;
    code: string;
    requestId?: string | undefined;
  }) {
    super(args.name ?? 'BokchoyApiError', args.message);
    this.status = args.status;
    this.code = args.code;
    this.requestId = args.requestId;
  }
}

/** 401 — API key invalid or missing. */
export class BokchoyAuthenticationError extends BokchoyApiError {
  constructor(args: { message: string; status: number; code: string; requestId?: string }) {
    super({ ...args, name: 'BokchoyAuthenticationError' });
  }
}

/** 400 — request validation failed (Zod / URL-param / body). */
export class BokchoyValidationError extends BokchoyApiError {
  /** Standard Schema issue list when available, otherwise undefined. */
  readonly issues?: ReadonlyArray<{ message: string; path: ReadonlyArray<string | number> }>;

  constructor(args: {
    message: string;
    status: number;
    code: string;
    requestId?: string;
    issues?: ReadonlyArray<{ message: string; path: ReadonlyArray<string | number> }>;
  }) {
    super({ ...args, name: 'BokchoyValidationError' });
    this.issues = args.issues;
  }
}

/**
 * 404 UNKNOWN_CURRENCY — the currency slug passed to wallets.credit/debit is
 * not registered for this project. `availableCodes` lists every currency
 * code registered for the project, so the caller can present alternatives
 * (typo correction in a CLI tool, dropdown population, retry-with-different-
 * currency logic). `currencyCode` echoes the offending value.
 */
export class UnknownCurrencyError extends BokchoyApiError {
  readonly currencyCode: string;
  readonly availableCodes: ReadonlyArray<string>;

  constructor(args: {
    message: string;
    requestId?: string;
    currencyCode: string;
    availableCodes: ReadonlyArray<string>;
  }) {
    super({
      name: 'UnknownCurrencyError',
      message: args.message,
      status: 404,
      code: 'UNKNOWN_CURRENCY',
      requestId: args.requestId,
    });
    this.currencyCode = args.currencyCode;
    this.availableCodes = args.availableCodes;
  }
}

/**
 * 404 UNKNOWN_PLAYER — reserved for the future explicit-create flow. The
 * current backend lazy-creates players on first credit per
 * [[wallet/credit-route-contract]] (iii), so this is NOT raised today.
 * The class is exported so a future `wallets.create({ player })` flow that
 * rejects unknown players can switch on it.
 */
export class UnknownPlayerError extends BokchoyApiError {
  readonly playerExternalId: string;

  constructor(args: { message: string; requestId?: string; playerExternalId: string }) {
    super({
      name: 'UnknownPlayerError',
      message: args.message,
      status: 404,
      code: 'UNKNOWN_PLAYER',
      requestId: args.requestId,
    });
    this.playerExternalId = args.playerExternalId;
  }
}
