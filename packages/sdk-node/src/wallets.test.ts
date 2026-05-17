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
