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

/** 404 UNKNOWN_CURRENCY — currency slug not registered. `availableCodes` lists registered alternatives. */
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

/** 404 UNKNOWN_PLAYER — reserved for a future explicit-create flow; not raised by today's backend. */
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

/** 404 UNKNOWN_ITEM — item slug not registered in the project. `availableItems` lists registered alternatives. */
export class UnknownItemError extends BokchoyApiError {
  readonly itemCode: string;
  readonly availableItems: ReadonlyArray<string>;

  constructor(args: {
    message: string;
    requestId?: string;
    itemCode: string;
    availableItems: ReadonlyArray<string>;
  }) {
    super({
      name: 'UnknownItemError',
      message: args.message,
      status: 404,
      code: 'UNKNOWN_ITEM',
      requestId: args.requestId,
    });
    this.itemCode = args.itemCode;
    this.availableItems = args.availableItems;
  }
}

/** 422 INVENTORY_OVERFLOW — stackable grant would push count above the item's `max_count` cap. */
export class InventoryOverflowError extends BokchoyApiError {
  readonly currentCount: number;
  readonly requestedAmount: number;
  readonly maxCount: number;
  readonly availableCapacity: number;

  constructor(args: {
    message: string;
    requestId?: string;
    currentCount: number;
    requestedAmount: number;
    maxCount: number;
    availableCapacity: number;
  }) {
    super({
      name: 'InventoryOverflowError',
      message: args.message,
      status: 422,
      code: 'INVENTORY_OVERFLOW',
      requestId: args.requestId,
    });
    this.currentCount = args.currentCount;
    this.requestedAmount = args.requestedAmount;
    this.maxCount = args.maxCount;
    this.availableCapacity = args.availableCapacity;
  }
}

/**
 * 422 INSUFFICIENT_INVENTORY — consume failure. Three variants:
 *   1. Stackable count shortage — `currentCount` + `requestedAmount` populated.
 *   2. Non-stackable instance not owned — `instanceId` populated, counts undefined.
 *   3. Non-stackable consume missing instanceId — all fields undefined; message carries detail.
 */
export class InsufficientInventoryError extends BokchoyApiError {
  readonly currentCount?: number;
  readonly requestedAmount?: number;
  readonly instanceId?: string;

  constructor(args: {
    message: string;
    requestId?: string;
    currentCount?: number;
    requestedAmount?: number;
    instanceId?: string;
  }) {
    super({
      name: 'InsufficientInventoryError',
      message: args.message,
      status: 422,
      code: 'INSUFFICIENT_INVENTORY',
      requestId: args.requestId,
    });
    this.currentCount = args.currentCount;
    this.requestedAmount = args.requestedAmount;
    this.instanceId = args.instanceId;
  }
}
