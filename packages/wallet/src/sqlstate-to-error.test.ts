import { expect, test } from 'bun:test';
import { BcError } from './errors';
import { sqlstateToError } from './sqlstate-to-error';

test('BC010 InsufficientFunds parses walletId, requested, available', () => {
  const err = sqlstateToError(
    'BC010',
    'InsufficientFunds: wallet=b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2 requested=100.0000 available=50.0000',
    undefined,
  );
  expect(err).toBeInstanceOf(BcError);
  expect(err?.code).toBe('BC010');
  if (err?.details.code === 'BC010') {
    expect(err.details.walletId).toBe('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2');
    expect(err.details.requested).toBe('100.0000');
    expect(err.details.available).toBe('50.0000');
  }
});

test('BC020 TenantMismatch parses GUC and param tenant', () => {
  const err = sqlstateToError(
    'BC020',
    'TenantMismatch: GUC=11111111-1111-1111-1111-111111111111 p_project_id=22222222-2222-2222-2222-222222222222',
    undefined,
  );
  expect(err?.code).toBe('BC020');
  if (err?.details.code === 'BC020') {
    expect(err.details.gucTenant).toBe('11111111-1111-1111-1111-111111111111');
    expect(err.details.paramTenant).toBe('22222222-2222-2222-2222-222222222222');
  }
});

test('BC021 WalletNotFound parses walletId and projectId', () => {
  const err = sqlstateToError(
    'BC021',
    'WalletNotFound: wallet_id=ffffffff-ffff-ffff-ffff-ffffffffffff project_id=33333333-3333-3333-3333-333333333333',
    undefined,
  );
  expect(err?.code).toBe('BC021');
  if (err?.details.code === 'BC021') {
    expect(err.details.walletId).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(err.details.projectId).toBe('33333333-3333-3333-3333-333333333333');
  }
});

test('BC022 CurrencyMismatch parses wallet currency and requested', () => {
  const err = sqlstateToError(
    'BC022',
    'CurrencyMismatch: wallet_currency=90909090-9090-9090-9090-909090909090 requested=a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
    undefined,
  );
  expect(err?.code).toBe('BC022');
  if (err?.details.code === 'BC022') {
    expect(err.details.walletCurrency).toBe('90909090-9090-9090-9090-909090909090');
    expect(err.details.requested).toBe('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1');
  }
});

test('BC040 ConfigurationError needs no message capture', () => {
  const err = sqlstateToError(
    'BC040',
    'bokchoy.anon_secret missing or too short (need >= 32 chars)',
    undefined,
  );
  expect(err?.code).toBe('BC040');
  expect(err?.details.code).toBe('BC040');
});

test('BC010 with malformed message returns null (parse failure → re-raise)', () => {
  const err = sqlstateToError('BC010', 'something else entirely', undefined);
  expect(err).toBeNull();
});

test('BC060 CurrencyNotFound parses currencyCode and projectId', () => {
  const err = sqlstateToError(
    'BC060',
    'CurrencyNotFound: code=gems project_id=44444444-4444-4444-4444-444444444444',
    undefined,
  );
  expect(err?.code).toBe('BC060');
  if (err?.details.code === 'BC060') {
    expect(err.details.currencyCode).toBe('gems');
    expect(err.details.projectId).toBe('44444444-4444-4444-4444-444444444444');
  }
});

test('23503 with transactions_project_reason_code_fk → BC050', () => {
  const err = sqlstateToError(
    '23503',
    'insert or update on table "transactions" violates foreign key constraint "transactions_project_reason_code_fk"',
    'transactions_project_reason_code_fk',
  );
  expect(err?.code).toBe('BC050');
  if (err?.details.code === 'BC050') {
    expect(err.details.constraintName).toBe('transactions_project_reason_code_fk');
  }
});

test('23503 with unknown constraint name → null (re-raise)', () => {
  const err = sqlstateToError(
    '23503',
    'insert or update on table "x" violates foreign key constraint "some_other_fk"',
    'some_other_fk',
  );
  expect(err).toBeNull();
});

test('23503 with no constraint name → null', () => {
  const err = sqlstateToError('23503', 'fk violation', undefined);
  expect(err).toBeNull();
});

test('Unknown SQLSTATE → null', () => {
  const err = sqlstateToError('42P01', 'relation "x" does not exist', undefined);
  expect(err).toBeNull();
});

test('BC080 UnknownItem parses itemCode and projectId', () => {
  const err = sqlstateToError(
    'BC080',
    'UnknownItem: code=health_potion project_id=55555555-5555-5555-5555-555555555555',
    undefined,
  );
  expect(err?.code).toBe('BC080');
  if (err?.details.code === 'BC080') {
    expect(err.details.itemCode).toBe('health_potion');
    expect(err.details.projectId).toBe('55555555-5555-5555-5555-555555555555');
  }
});

test('BC081 InventoryOverflow parses current, requested, max, capacity', () => {
  const err = sqlstateToError(
    'BC081',
    'InventoryOverflow: current=80 requested=50 max=100 available_capacity=20',
    undefined,
  );
  expect(err?.code).toBe('BC081');
  if (err?.details.code === 'BC081') {
    expect(err.details.currentCount).toBe(80);
    expect(err.details.requestedAmount).toBe(50);
    expect(err.details.maxCount).toBe(100);
    expect(err.details.availableCapacity).toBe(20);
  }
});

test('BC082 InsufficientInventory (insufficient_count variant) parses current and requested', () => {
  const err = sqlstateToError('BC082', 'InsufficientInventory: current=3 requested=5', undefined);
  expect(err?.code).toBe('BC082');
  if (err?.details.code === 'BC082' && err.details.variant === 'insufficient_count') {
    expect(err.details.currentCount).toBe(3);
    expect(err.details.requestedAmount).toBe(5);
  } else {
    throw new Error('expected insufficient_count variant');
  }
});

test('BC082 instance_not_owned variant parses instanceId, playerExternalId, itemCode', () => {
  const err = sqlstateToError(
    'BC082',
    'InsufficientInventory: instance=abc-uuid not owned by player=p1 for item=sword',
    undefined,
  );
  expect(err?.code).toBe('BC082');
  if (err?.details.code === 'BC082' && err.details.variant === 'instance_not_owned') {
    expect(err.details.instanceId).toBe('abc-uuid');
    expect(err.details.playerExternalId).toBe('p1');
    expect(err.details.itemCode).toBe('sword');
  } else {
    throw new Error('expected instance_not_owned variant');
  }
});

test('BC082 instance_id_required variant matches with no captures', () => {
  const err = sqlstateToError(
    'BC082',
    'InsufficientInventory: non-stackable consume requires instance_id',
    undefined,
  );
  expect(err?.code).toBe('BC082');
  if (err?.details.code === 'BC082') {
    expect(err.details.variant).toBe('instance_id_required');
  } else {
    throw new Error('expected instance_id_required variant');
  }
});

test('BC082 player-has-no-inventory variant collapses to insufficient_count with zeros', () => {
  const err = sqlstateToError(
    'BC082',
    'InsufficientInventory: player=p1 has no inventory of item=potion',
    undefined,
  );
  expect(err?.code).toBe('BC082');
  if (err?.details.code === 'BC082' && err.details.variant === 'insufficient_count') {
    expect(err.details.currentCount).toBe(0);
    expect(err.details.requestedAmount).toBe(0);
  } else {
    throw new Error('expected insufficient_count variant');
  }
});
