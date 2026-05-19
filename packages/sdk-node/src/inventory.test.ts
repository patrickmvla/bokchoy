import { describe, expect, test } from 'bun:test';
import {
  BokChoy,
  InsufficientInventoryError,
  InventoryOverflowError,
  UnknownItemError,
} from './index';

describe('BokChoy inventory.grant', () => {
  test('stackable grant composes URL + friendly→wire mapping', async () => {
    const captured: { url?: string; body?: string; headers?: Headers } = {};
    const fetchImpl = async (url: string, init?: RequestInit) => {
      captured.url = url;
      captured.body = init?.body as string;
      captured.headers = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          transactionId: 7,
          playerId: 'player-uuid',
          itemId: 'item-uuid',
          stackable: true,
          newCount: 12,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    };
    const bokchoy = new BokChoy({
      apiKey: 'bk_test',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    const result = await bokchoy.inventory.grant({
      player: 'player_123',
      item: 'health_potion',
      amount: 5,
      reason: 'quest_reward',
      metadata: { quest: 'tutorial' },
    });

    expect(captured.url).toBe(
      'https://api.example.com/v1/players/player_123/inventory/health_potion/grant',
    );
    expect(JSON.parse(captured.body ?? '{}')).toEqual({
      amount: 5,
      reasonCode: 'quest_reward',
      metadata: { quest: 'tutorial' },
    });
    expect(captured.headers?.get('idempotency-key')).toMatch(/^bokchoy-sdk-retry-/);
    if (result.stackable) {
      expect(result.newCount).toBe(12);
      expect(result.transactionId).toBe(7);
    } else {
      throw new Error('expected stackable result');
    }
  });

  test('non-stackable grant returns instanceIds array', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          transactionId: 8,
          playerId: 'player-uuid',
          itemId: 'sword-uuid',
          stackable: false,
          instanceIds: ['u1-uuid', 'u2-uuid'],
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    const bokchoy = new BokChoy({
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    const result = await bokchoy.inventory.grant({
      player: 'p1',
      item: 'legendary_sword',
      amount: 2,
      reason: 'crafting',
    });

    if (!result.stackable) {
      expect(result.instanceIds).toEqual(['u1-uuid', 'u2-uuid']);
    } else {
      throw new Error('expected non-stackable result');
    }
  });

  test('UNKNOWN_ITEM 404 dispatches to UnknownItemError with availableItems', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'UNKNOWN_ITEM',
            message: "Item 'helt_potion' is not registered for this project",
            itemCode: 'helt_potion',
            availableItems: ['health_potion', 'mana_potion'],
          },
        }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    const bokchoy = new BokChoy({
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    try {
      await bokchoy.inventory.grant({ player: 'p1', item: 'helt_potion', amount: 1, reason: 'r' });
      throw new Error('expected UnknownItemError');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownItemError);
      if (err instanceof UnknownItemError) {
        expect(err.itemCode).toBe('helt_potion');
        expect(err.availableItems).toEqual(['health_potion', 'mana_potion']);
        expect(err.status).toBe(404);
        expect(err.code).toBe('UNKNOWN_ITEM');
      }
    }
  });

  test('INVENTORY_OVERFLOW 422 dispatches to InventoryOverflowError with capacity fields', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'INVENTORY_OVERFLOW',
            message: 'Grant would exceed item max_count',
            currentCount: 95,
            requestedAmount: 10,
            maxCount: 100,
            availableCapacity: 5,
          },
        }),
        { status: 422, headers: { 'content-type': 'application/json' } },
      );
    const bokchoy = new BokChoy({
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    try {
      await bokchoy.inventory.grant({ player: 'p', item: 'gem', amount: 10, reason: 'r' });
      throw new Error('expected InventoryOverflowError');
    } catch (err) {
      expect(err).toBeInstanceOf(InventoryOverflowError);
      if (err instanceof InventoryOverflowError) {
        expect(err.currentCount).toBe(95);
        expect(err.requestedAmount).toBe(10);
        expect(err.maxCount).toBe(100);
        expect(err.availableCapacity).toBe(5);
      }
    }
  });
});

describe('BokChoy inventory.consume', () => {
  test('consume passes instanceId for non-stackable items', async () => {
    let capturedBody = '';
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify({
          transactionId: 9,
          playerId: 'p',
          itemId: 'i',
          stackable: false,
          consumedInstanceId: 'instance-uuid',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    };
    const bokchoy = new BokChoy({
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    const result = await bokchoy.inventory.consume({
      player: 'p1',
      item: 'sword',
      amount: 1,
      reason: 'broke',
      instanceId: 'instance-uuid',
    });

    expect(JSON.parse(capturedBody)).toEqual({
      amount: 1,
      reasonCode: 'broke',
      instanceId: 'instance-uuid',
    });
    if (!result.stackable) {
      expect(result.consumedInstanceId).toBe('instance-uuid');
    } else {
      throw new Error('expected non-stackable result');
    }
  });

  test('INSUFFICIENT_INVENTORY 422 dispatches to InsufficientInventoryError', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'INSUFFICIENT_INVENTORY',
            message: 'Consume would push count below zero',
            currentCount: 2,
            requestedAmount: 5,
          },
        }),
        { status: 422, headers: { 'content-type': 'application/json' } },
      );
    const bokchoy = new BokChoy({
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    try {
      await bokchoy.inventory.consume({ player: 'p', item: 'gem', amount: 5, reason: 'r' });
      throw new Error('expected InsufficientInventoryError');
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientInventoryError);
      if (err instanceof InsufficientInventoryError) {
        expect(err.currentCount).toBe(2);
        expect(err.requestedAmount).toBe(5);
      }
    }
  });
});

describe('BokChoy inventory.list', () => {
  test('list builds query string + populates nextCursor when hasMore', async () => {
    let capturedUrl = '';
    const fetchImpl = async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 5,
              itemCode: 'gem',
              displayName: 'Gem',
              stackable: true,
              count: 10,
              properties: {},
              updatedAt: '2026-05-19T00:00:00.000Z',
            },
            {
              id: 3,
              itemCode: 'sword',
              displayName: 'Sword',
              stackable: false,
              instanceId: 'u1',
              count: 1,
              properties: { rarity: 'epic' },
              updatedAt: '2026-05-18T00:00:00.000Z',
            },
          ],
          hasMore: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const bokchoy = new BokChoy({
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    const result = await bokchoy.inventory.list({ player: 'p', limit: 2, startingAfter: 100 });
    expect(capturedUrl).toBe(
      'https://api.example.com/v1/players/p/inventory?limit=2&starting_after=100',
    );
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(3);
    expect(result.data.length).toBe(2);
  });
});

describe('BokChoy inventory.get', () => {
  test('get returns synthesized-zero shape on absent', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ itemCode: 'gem', count: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const bokchoy = new BokChoy({
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    const result = await bokchoy.inventory.get({ player: 'p', item: 'gem' });
    expect(result.itemCode).toBe('gem');
    if ('count' in result && !('displayName' in result)) {
      expect(result.count).toBe(0);
    } else {
      throw new Error('expected synthesized-zero shape');
    }
  });
});
