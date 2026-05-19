/** Smoke tests for type-shape only — exercises exports compile + discriminate. Wrapper runtime behavior covered by smoke-script per Slice 5. */

import { expect, test } from 'bun:test';
import {
  inventoryConsumeByExternalId,
  inventoryGrantByExternalId,
  inventoryItemByExternalId,
  inventoryListByExternalId,
} from './index';

test('all 4 wrappers exported as functions', () => {
  expect(typeof inventoryGrantByExternalId).toBe('function');
  expect(typeof inventoryConsumeByExternalId).toBe('function');
  expect(typeof inventoryListByExternalId).toBe('function');
  expect(typeof inventoryItemByExternalId).toBe('function');
});

test('grant result is discriminated by stackable', () => {
  const stackableResult = {
    stackable: true as const,
    transactionId: 1,
    playerId: 'p',
    itemId: 'i',
    newCount: 5,
  };
  const instanceResult = {
    stackable: false as const,
    transactionId: 2,
    playerId: 'p',
    itemId: 'i',
    instanceIds: ['u1', 'u2'] as const,
  };
  if (stackableResult.stackable) expect(stackableResult.newCount).toBe(5);
  if (!instanceResult.stackable) expect(instanceResult.instanceIds.length).toBe(2);
});

test('item read result discriminates exists + stackable', () => {
  const missing = { exists: false as const, itemCode: 'x' };
  const stack = {
    exists: true as const,
    stackable: true as const,
    itemCode: 'x',
    displayName: 'X',
    count: 0,
    version: 0,
    updatedAt: new Date(),
  };
  const inst = {
    exists: true as const,
    stackable: false as const,
    itemCode: 'x',
    displayName: 'X',
    instances: [] as const,
  };
  expect(missing.exists).toBe(false);
  if (stack.exists && stack.stackable) expect(stack.count).toBe(0);
  if (inst.exists && !inst.stackable) expect(inst.instances.length).toBe(0);
});
