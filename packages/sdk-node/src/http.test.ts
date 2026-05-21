import { describe, expect, test } from 'bun:test';
import {
  BokchoyApiError,
  BokchoyAuthenticationError,
  BokchoyConnectionError,
  BokchoyValidationError,
  InsufficientFundsError,
  UnknownCurrencyError,
  UnknownPlayerError,
} from './errors';
import { HttpClient, translateErrorResponse } from './http';

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('HttpClient URL + header construction', () => {
  test('encodes path segments and Bearer auth + Idempotency-Key header', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const fetchImpl = async (url: string, init?: RequestInit) => {
      captured.url = url;
      captured.init = init;
      return jsonResponse(201, {
        transactionId: 1,
        walletId: 'w',
        playerId: 'p',
        balanceAfter: '0',
      });
    };
    const client = new HttpClient({
      baseUrl: 'https://api.example.com/',
      apiKey: 'bk_test_abc',
      userAgent: 'bokchoy-sdk-node/0.0.0-test',
      fetchImpl,
    });

    await client.post({
      pathSegments: ['v1', 'players', 'player/with slash', 'wallets', 'gems', 'credit'],
      body: { amount: 100, reasonCode: 'level_up' },
    });

    // Trailing slash on baseUrl stripped; each segment URL-encoded.
    expect(captured.url).toBe(
      'https://api.example.com/v1/players/player%2Fwith%20slash/wallets/gems/credit',
    );
    const headers = new Headers(captured.init?.headers as Record<string, string>);
    expect(headers.get('authorization')).toBe('Bearer bk_test_abc');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('user-agent')).toBe('bokchoy-sdk-node/0.0.0-test');
    const idempotencyKey = headers.get('idempotency-key');
    expect(idempotencyKey).toMatch(
      /^bokchoy-sdk-retry-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(captured.init?.method).toBe('POST');
    expect(captured.init?.body).toBe(JSON.stringify({ amount: 100, reasonCode: 'level_up' }));
  });

  test('honors caller-supplied idempotencyKey when present', async () => {
    let capturedKey = '';
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      capturedKey =
        new Headers(init?.headers as Record<string, string>).get('idempotency-key') ?? '';
      return jsonResponse(201, {});
    };
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'bk_test',
      userAgent: 'test',
      fetchImpl,
    });
    await client.post({
      pathSegments: ['v1', 'noop'],
      body: {},
      idempotencyKey: 'customer-supplied-key-42',
    });
    expect(capturedKey).toBe('customer-supplied-key-42');
  });

  test('fetch throw wraps into BokchoyConnectionError preserving cause', async () => {
    const originalError = new TypeError('fetch failed');
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'bk_test',
      userAgent: 'test',
      fetchImpl: async () => {
        throw originalError;
      },
    });
    let thrown: unknown = null;
    try {
      await client.post({ pathSegments: ['v1', 'noop'], body: {} });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(BokchoyConnectionError);
    expect((thrown as BokchoyConnectionError).cause).toBe(originalError);
  });

  test('non-JSON 2xx response wraps into BokchoyConnectionError', async () => {
    const client = new HttpClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'bk_test',
      userAgent: 'test',
      fetchImpl: async () =>
        new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } }),
    });
    let thrown: unknown = null;
    try {
      await client.post({ pathSegments: ['v1', 'noop'], body: {} });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(BokchoyConnectionError);
  });
});

describe('translateErrorResponse', () => {
  test('404 UNKNOWN_CURRENCY → UnknownCurrencyError with availableCodes', () => {
    const response = new Response(null, { status: 404, headers: { 'x-request-id': 'req_123' } });
    const err = translateErrorResponse(response, {
      error: {
        code: 'UNKNOWN_CURRENCY',
        message: "Currency 'gem' is not registered for this project",
        currencyCode: 'gem',
        availableCodes: ['coins', 'gems'],
      },
    });
    expect(err).toBeInstanceOf(UnknownCurrencyError);
    if (err instanceof UnknownCurrencyError) {
      expect(err.currencyCode).toBe('gem');
      expect(err.availableCodes).toEqual(['coins', 'gems']);
      expect(err.code).toBe('UNKNOWN_CURRENCY');
      expect(err.status).toBe(404);
      expect(err.requestId).toBe('req_123');
    }
  });

  test('404 UNKNOWN_CURRENCY with missing optional fields falls back to empty', () => {
    const response = new Response(null, { status: 404 });
    const err = translateErrorResponse(response, {
      error: { code: 'UNKNOWN_CURRENCY', message: 'currency missing' },
    });
    expect(err).toBeInstanceOf(UnknownCurrencyError);
    if (err instanceof UnknownCurrencyError) {
      expect(err.currencyCode).toBe('');
      expect(err.availableCodes).toEqual([]);
    }
  });

  test('404 UNKNOWN_PLAYER → UnknownPlayerError', () => {
    const response = new Response(null, { status: 404 });
    const err = translateErrorResponse(response, {
      error: {
        code: 'UNKNOWN_PLAYER',
        message: "Player 'p_42' is not registered",
        playerExternalId: 'p_42',
      },
    });
    expect(err).toBeInstanceOf(UnknownPlayerError);
    if (err instanceof UnknownPlayerError) {
      expect(err.playerExternalId).toBe('p_42');
    }
  });

  test('401 → BokchoyAuthenticationError', () => {
    const response = new Response(null, { status: 401 });
    const err = translateErrorResponse(response, {
      error: { code: 'UNAUTHENTICATED', message: 'API key invalid' },
    });
    expect(err).toBeInstanceOf(BokchoyAuthenticationError);
    expect(err.code).toBe('UNAUTHENTICATED');
    expect(err.status).toBe(401);
  });

  test('400 VALIDATION_ERROR → BokchoyValidationError with issues', () => {
    const response = new Response(null, { status: 400 });
    const err = translateErrorResponse(response, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        issues: [
          { message: 'amount must be positive', path: ['amount'] },
          { message: 'invalid', path: [] },
        ],
      },
    });
    expect(err).toBeInstanceOf(BokchoyValidationError);
    if (err instanceof BokchoyValidationError) {
      expect(err.issues?.length).toBe(2);
      expect(err.issues?.[0]?.message).toBe('amount must be positive');
      expect(err.issues?.[0]?.path).toEqual(['amount']);
    }
  });

  test('422 INSUFFICIENT_FUNDS → InsufficientFundsError with walletId/requested/available', () => {
    const response = new Response(null, { status: 422 });
    const err = translateErrorResponse(response, {
      error: {
        code: 'INSUFFICIENT_FUNDS',
        message: 'InsufficientFunds',
        walletId: 'wallet-uuid',
        requested: '100.0000',
        available: '50.0000',
      },
    });
    expect(err).toBeInstanceOf(InsufficientFundsError);
    expect(err.code).toBe('INSUFFICIENT_FUNDS');
    expect(err.status).toBe(422);
    if (err instanceof InsufficientFundsError) {
      expect(err.walletId).toBe('wallet-uuid');
      expect(err.requested).toBe('100.0000');
      expect(err.available).toBe('50.0000');
    }
  });

  test('422 with unmapped BC code → generic BokchoyApiError (dispatch by .code)', () => {
    const response = new Response(null, { status: 422 });
    const err = translateErrorResponse(response, {
      error: { code: 'BC050', message: 'ReasonCodeNotRegistered' },
    });
    expect(err).toBeInstanceOf(BokchoyApiError);
    expect(err).not.toBeInstanceOf(UnknownCurrencyError);
    expect(err.code).toBe('BC050');
    expect(err.status).toBe(422);
  });

  test('malformed error body falls through to BokchoyApiError with UNKNOWN_ERROR', () => {
    const response = new Response(null, { status: 500 });
    const err = translateErrorResponse(response, { something: 'else' });
    expect(err).toBeInstanceOf(BokchoyApiError);
    expect(err.code).toBe('UNKNOWN_ERROR');
    expect(err.status).toBe(500);
  });
});
