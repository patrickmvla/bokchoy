/** Smoke tests for type-shape only — exports compile + discriminate. Wrapper runtime behavior covered by smoke-functions per Slice 5. */

import { expect, test } from 'bun:test';
import type { OfferView, PurchaseGrantedItem } from './index';
import { getOffer, listOffers, purchaseOfferByExternalId } from './index';

test('all 3 wrappers exported as functions', () => {
  expect(typeof purchaseOfferByExternalId).toBe('function');
  expect(typeof listOffers).toBe('function');
  expect(typeof getOffer).toBe('function');
});

test('granted item discriminates by stackable', () => {
  const stack: PurchaseGrantedItem = {
    itemCode: 'health_potion',
    quantity: 3,
    stackable: true,
    newCount: 8,
  };
  const inst: PurchaseGrantedItem = {
    itemCode: 'legendary_sword',
    quantity: 1,
    stackable: false,
    instanceIds: ['u1'],
  };
  if (stack.stackable) expect(stack.newCount).toBe(8);
  if (!inst.stackable) expect(inst.instanceIds.length).toBe(1);
});

test('OfferView carries prices + items as arrays and a nullable description', () => {
  const view: OfferView = {
    code: 'starter_pack',
    displayName: 'Starter Pack',
    description: null,
    active: true,
    prices: [{ currencyCode: 'gems', amount: '100.0000' }],
    items: [{ itemCode: 'health_potion', quantity: 5 }],
  };
  expect(view.prices[0]?.amount).toBe('100.0000');
  expect(view.items[0]?.quantity).toBe(5);
  expect(view.description).toBeNull();
});
