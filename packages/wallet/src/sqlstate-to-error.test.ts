import { expect, test } from 'bun:test';
import { WalletError } from './errors';
import { sqlstateToError } from './sqlstate-to-error';

test('BC010 InsufficientFunds parses walletId, requested, available', () => {
  const err = sqlstateToError(
    'BC010',
    'InsufficientFunds: wallet=b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2 requested=100.0000 available=50.0000',
    undefined,
  );
  expect(err).toBeInstanceOf(WalletError);
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
