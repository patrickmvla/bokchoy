import { describe, expect, test } from 'bun:test';
import { BokChoy, UnknownCurrencyError } from './index';

function mockOk(payload: unknown) {
  return async () =>
    new Response(JSON.stringify(payload), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
}

describe('BokChoy wallets.credit / wallets.debit', () => {
  test('credit composes the player-centric URL + friendly→wire body mapping', async () => {
    const captured: { url?: string; body?: string } = {};
    const fetchImpl = async (url: string, init?: RequestInit) => {
      captured.url = url;
      captured.body = init?.body as string;
      return new Response(
        JSON.stringify({
          transactionId: 42,
          walletId: 'wallet-uuid',
          playerId: 'player-uuid',
          balanceAfter: '100.0000',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    };
    const bokchoy = new BokChoy({
      apiKey: 'bk_test_abc',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    const result = await bokchoy.wallets.credit({
      player: 'player_123',
      amount: 100,
      currency: 'gems',
      reason: 'level_up_reward',
      metadata: { source: 'unit-test' },
    });

    expect(captured.url).toBe('https://api.example.com/v1/players/player_123/wallets/gems/credit');
    const body = JSON.parse(captured.body ?? '{}');
    // Friendly-name renames: `reason` → wire `reasonCode`; `player`/`currency`
    // sit in URL not body; `metadata` passthrough.
    expect(body).toEqual({
      amount: 100,
      reasonCode: 'level_up_reward',
      metadata: { source: 'unit-test' },
    });
    expect(result).toEqual({
      transactionId: 42,
      walletId: 'wallet-uuid',
      playerId: 'player-uuid',
      balanceAfter: '100.0000',
    });
  });

  test('debit hits the /debit route under the same path shape', async () => {
    let capturedUrl = '';
    const bokchoy = new BokChoy({
      apiKey: 'bk_test',
      baseUrl: 'https://api.example.com',
      fetch: async (url: string) => {
        capturedUrl = url;
        return new Response(
          JSON.stringify({
            transactionId: 1,
            walletId: 'w',
            playerId: 'p',
            balanceAfter: '0.0000',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    await bokchoy.wallets.debit({
      player: 'p_1',
      amount: 5,
      currency: 'gems',
      reason: 'shop_purchase',
    });
    expect(capturedUrl).toBe('https://api.example.com/v1/players/p_1/wallets/gems/debit');
  });

  test('UNKNOWN_CURRENCY 404 surfaces as typed exception with availableCodes', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'UNKNOWN_CURRENCY',
            message: "Currency 'gem' is not registered for this project",
            currencyCode: 'gem',
            availableCodes: ['coins', 'gems'],
          },
        }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    const bokchoy = new BokChoy({
      apiKey: 'bk_test',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    let caught: unknown = null;
    try {
      await bokchoy.wallets.credit({
        player: 'p_1',
        amount: 10,
        currency: 'gem',
        reason: 'level_up_reward',
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnknownCurrencyError);
    if (caught instanceof UnknownCurrencyError) {
      expect(caught.currencyCode).toBe('gem');
      expect(caught.availableCodes).toEqual(['coins', 'gems']);
      expect(caught.message).toContain('gem');
    }
  });

  test('BokChoy constructor rejects empty apiKey', () => {
    expect(() => new BokChoy({ apiKey: '', fetch: mockOk({}) })).toThrow();
  });

  test('optional body fields are omitted when undefined (minimal wire body)', async () => {
    let capturedBody = '';
    const bokchoy = new BokChoy({
      apiKey: 'bk_test',
      baseUrl: 'https://api.example.com',
      fetch: async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            transactionId: 1,
            walletId: 'w',
            playerId: 'p',
            balanceAfter: '0',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    await bokchoy.wallets.credit({
      player: 'p_1',
      amount: 1,
      currency: 'gems',
      reason: 'r',
    });
    const body = JSON.parse(capturedBody);
    expect(Object.keys(body).sort()).toEqual(['amount', 'reasonCode']);
  });
});

describe('BokChoy wallets.balance / wallets.history', () => {
  test('balance composes the player-centric GET URL with no body and no Idempotency-Key', async () => {
    const captured: { url?: string; method?: string; headers?: Record<string, string> } = {};
    const bokchoy = new BokChoy({
      apiKey: 'bk_test',
      baseUrl: 'https://api.example.com',
      fetch: async (url: string, init?: RequestInit) => {
        captured.url = url;
        captured.method = init?.method;
        captured.headers = init?.headers as Record<string, string>;
        return new Response(
          JSON.stringify({
            balance: '250.0000',
            currencyCode: 'gems',
            walletId: 'wallet-uuid',
            playerId: 'player-uuid',
            updatedAt: '2026-05-18T15:30:00.000Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const result = await bokchoy.wallets.balance({
      player: 'player_123',
      currency: 'gems',
    });

    expect(captured.url).toBe('https://api.example.com/v1/players/player_123/wallets/gems');
    expect(captured.method).toBe('GET');
    // No Idempotency-Key header on GET (only POST emits it).
    expect(captured.headers?.['Idempotency-Key']).toBeUndefined();
    expect(captured.headers?.Authorization).toBe('Bearer bk_test');
    expect(result).toEqual({
      balance: '250.0000',
      currencyCode: 'gems',
      walletId: 'wallet-uuid',
      playerId: 'player-uuid',
      updatedAt: '2026-05-18T15:30:00.000Z',
    });
  });

  test('balance parses synthesized-zero response (optional fields absent)', async () => {
    const bokchoy = new BokChoy({
      apiKey: 'bk_test',
      baseUrl: 'https://api.example.com',
      fetch: async () =>
        new Response(JSON.stringify({ balance: '0', currencyCode: 'gems' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const result = await bokchoy.wallets.balance({ player: 'new_player', currency: 'gems' });
    expect(result.balance).toBe('0');
    expect(result.currencyCode).toBe('gems');
    expect(result.walletId).toBeUndefined();
    expect(result.playerId).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
  });

  test('history composes /transactions URL with query string and surfaces nextCursor', async () => {
    let capturedUrl = '';
    const bokchoy = new BokChoy({
      apiKey: 'bk_test',
      baseUrl: 'https://api.example.com',
      fetch: async (url: string) => {
        capturedUrl = url;
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 102,
                createdAt: '2026-05-18T15:30:02.000Z',
                kind: 'currency_credit',
                amount: '50.0000',
                reasonCode: 'quest_complete',
                metadata: {},
              },
              {
                id: 101,
                createdAt: '2026-05-18T15:30:01.000Z',
                kind: 'currency_debit',
                amount: '10.0000',
                reasonCode: 'shop_purchase_cost',
                metadata: {},
              },
            ],
            hasMore: true,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const result = await bokchoy.wallets.history({
      player: 'player_123',
      currency: 'gems',
      limit: 2,
    });
    expect(capturedUrl).toBe(
      'https://api.example.com/v1/players/player_123/wallets/gems/transactions?limit=2',
    );
    expect(result.data.length).toBe(2);
    expect(result.hasMore).toBe(true);
    // nextCursor is the last row's id when hasMore=true.
    expect(result.nextCursor).toBe(101);
  });

  test('history forwards startingAfter as `starting_after` snake-case query param', async () => {
    let capturedUrl = '';
    const bokchoy = new BokChoy({
      apiKey: 'bk_test',
      baseUrl: 'https://api.example.com',
      fetch: async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ data: [], hasMore: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await bokchoy.wallets.history({
      player: 'player_123',
      currency: 'gems',
      limit: 10,
      startingAfter: 99,
    });
    expect(capturedUrl).toBe(
      'https://api.example.com/v1/players/player_123/wallets/gems/transactions?limit=10&starting_after=99',
    );
  });

  test('history empty list omits nextCursor', async () => {
    const bokchoy = new BokChoy({
      apiKey: 'bk_test',
      baseUrl: 'https://api.example.com',
      fetch: async () =>
        new Response(JSON.stringify({ data: [], hasMore: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const result = await bokchoy.wallets.history({ player: 'p', currency: 'gems' });
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
  });

  test('URL-encodes path segments for special characters', async () => {
    let capturedUrl = '';
    const bokchoy = new BokChoy({
      apiKey: 'bk_test',
      baseUrl: 'https://api.example.com',
      fetch: async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ balance: '0', currencyCode: 'gems' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await bokchoy.wallets.balance({ player: 'a.b_c-d', currency: 'gems' });
    // Per the contract regex `^[A-Za-z0-9._-]{1,128}$`, these chars are
    // URL-safe; encodeURIComponent leaves them intact.
    expect(capturedUrl).toBe('https://api.example.com/v1/players/a.b_c-d/wallets/gems');
  });
});
