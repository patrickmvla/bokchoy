import { describe, expect, test } from 'bun:test';
import {
  BokChoy,
  InsufficientFundsError,
  InvalidPaymentCurrencyError,
  OfferInactiveError,
  OfferMisconfiguredError,
  UnknownOfferError,
} from './index';

describe('BokChoy shop.purchase', () => {
  test('composes URL + {offer,payWith} body + idempotency-key, returns paid + granted', async () => {
    const captured: { url?: string; body?: string; headers?: Headers } = {};
    const fetchImpl = async (url: string, init?: RequestInit) => {
      captured.url = url;
      captured.body = init?.body as string;
      captured.headers = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          purchaseId: 'purchase-uuid',
          offer: 'starter_pack',
          paid: { currencyCode: 'gems', amount: '100.0000' },
          granted: [
            { itemCode: 'health_potion', quantity: 5 },
            { itemCode: 'legendary_sword', quantity: 1, instanceIds: ['sword-uuid'] },
          ],
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    };
    const bokchoy = new BokChoy({
      apiKey: 'bk_test',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    const result = await bokchoy.shop.purchase({
      player: 'player_123',
      offer: 'starter_pack',
      payWith: 'gems',
    });

    expect(captured.url).toBe('https://api.example.com/v1/players/player_123/purchases');
    expect(JSON.parse(captured.body ?? '{}')).toEqual({ offer: 'starter_pack', payWith: 'gems' });
    expect(captured.headers?.get('idempotency-key')).toMatch(/^bokchoy-sdk-retry-/);
    expect(result.purchaseId).toBe('purchase-uuid');
    expect(result.paid).toEqual({ currencyCode: 'gems', amount: '100.0000' });
    expect(result.granted[0]?.instanceIds).toBeUndefined();
    expect(result.granted[1]?.instanceIds).toEqual(['sword-uuid']);
  });

  test('omits payWith from the body when not provided (single-price offer)', async () => {
    let capturedBody = '';
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify({
          purchaseId: 'p',
          offer: 'one_price',
          paid: { currencyCode: 'coins', amount: '50.0000' },
          granted: [],
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    };
    const bokchoy = new BokChoy({
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    await bokchoy.shop.purchase({ player: 'p1', offer: 'one_price' });
    expect(JSON.parse(capturedBody)).toEqual({ offer: 'one_price' });
  });

  test('UNKNOWN_OFFER 404 dispatches to UnknownOfferError', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'UNKNOWN_OFFER',
            message: "Offer 'startr_pack' is not registered for this project",
            offerCode: 'startr_pack',
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
      await bokchoy.shop.purchase({ player: 'p', offer: 'startr_pack' });
      throw new Error('expected UnknownOfferError');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownOfferError);
      if (err instanceof UnknownOfferError) {
        expect(err.offerCode).toBe('startr_pack');
        expect(err.status).toBe(404);
        expect(err.code).toBe('UNKNOWN_OFFER');
      }
    }
  });

  test('OFFER_INACTIVE 422 dispatches to OfferInactiveError', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'OFFER_INACTIVE',
            message: "Offer 'old_pack' is not active",
            offerCode: 'old_pack',
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
      await bokchoy.shop.purchase({ player: 'p', offer: 'old_pack' });
      throw new Error('expected OfferInactiveError');
    } catch (err) {
      expect(err).toBeInstanceOf(OfferInactiveError);
      if (err instanceof OfferInactiveError) expect(err.offerCode).toBe('old_pack');
    }
  });

  test('INVALID_PAYMENT_CURRENCY 422 dispatches with acceptedCurrencies', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'INVALID_PAYMENT_CURRENCY',
            message: "Offer 'dual' has 2 price options — payWith is required",
            acceptedCurrencies: ['coins', 'gems'],
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
      await bokchoy.shop.purchase({ player: 'p', offer: 'dual' });
      throw new Error('expected InvalidPaymentCurrencyError');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidPaymentCurrencyError);
      if (err instanceof InvalidPaymentCurrencyError) {
        expect(err.acceptedCurrencies).toEqual(['coins', 'gems']);
      }
    }
  });

  test('INSUFFICIENT_FUNDS 422 dispatches to InsufficientFundsError', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'INSUFFICIENT_FUNDS',
            message: 'InsufficientFunds',
            walletId: 'wallet-uuid',
            requested: '100.0000',
            available: '40.0000',
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
      await bokchoy.shop.purchase({ player: 'p', offer: 'pack', payWith: 'gems' });
      throw new Error('expected InsufficientFundsError');
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientFundsError);
      if (err instanceof InsufficientFundsError) {
        expect(err.requested).toBe('100.0000');
        expect(err.available).toBe('40.0000');
      }
    }
  });

  test('OFFER_MISCONFIGURED 422 dispatches to OfferMisconfiguredError', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'OFFER_MISCONFIGURED',
            message: "Offer 'empty_pack' has no items and cannot be purchased",
            offerCode: 'empty_pack',
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
      await bokchoy.shop.purchase({ player: 'p', offer: 'empty_pack' });
      throw new Error('expected OfferMisconfiguredError');
    } catch (err) {
      expect(err).toBeInstanceOf(OfferMisconfiguredError);
      if (err instanceof OfferMisconfiguredError) {
        expect(err.offerCode).toBe('empty_pack');
        expect(err.status).toBe(422);
      }
    }
  });
});

describe('BokChoy shop catalog reads', () => {
  test('listOffers unwraps the data array', async () => {
    let capturedUrl = '';
    const fetchImpl = async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify({
          data: [
            {
              code: 'starter_pack',
              displayName: 'Starter Pack',
              description: null,
              active: true,
              prices: [{ currencyCode: 'gems', amount: '100.0000' }],
              items: [{ itemCode: 'health_potion', quantity: 5 }],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const bokchoy = new BokChoy({
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    const offers = await bokchoy.shop.listOffers();
    expect(capturedUrl).toBe('https://api.example.com/v1/offers');
    expect(offers.length).toBe(1);
    expect(offers[0]?.code).toBe('starter_pack');
    expect(offers[0]?.prices[0]?.amount).toBe('100.0000');
  });

  test('getOffer encodes the code into the path and returns the offer', async () => {
    let capturedUrl = '';
    const fetchImpl = async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify({
          code: 'starter_pack',
          displayName: 'Starter Pack',
          description: 'Welcome bundle',
          active: true,
          prices: [{ currencyCode: 'gems', amount: '100.0000' }],
          items: [{ itemCode: 'health_potion', quantity: 5 }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const bokchoy = new BokChoy({
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    const offer = await bokchoy.shop.getOffer('starter_pack');
    expect(capturedUrl).toBe('https://api.example.com/v1/offers/starter_pack');
    expect(offer.displayName).toBe('Starter Pack');
    expect(offer.items[0]?.quantity).toBe(5);
  });

  test('getOffer raises UnknownOfferError on 404', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: { code: 'UNKNOWN_OFFER', message: 'not found', offerCode: 'nope' },
        }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    const bokchoy = new BokChoy({
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    try {
      await bokchoy.shop.getOffer('nope');
      throw new Error('expected UnknownOfferError');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownOfferError);
    }
  });
});
