/** BCxxx error classification. Per [[wallet-mechanics]] Part 1 A5 + Part 3 A18. */

export type BcCode =
  | 'BC001' // IdempotencyKeyInUse
  | 'BC002' // IdempotencyKeyMismatch
  | 'BC010' // InsufficientFunds
  | 'BC020' // TenantMismatch
  | 'BC021' // WalletNotFound
  | 'BC022' // CurrencyMismatch
  | 'BC030' // PolicyViolation (reserved)
  | 'BC040' // ConfigurationError
  | 'BC050' // ReasonCodeNotRegistered (PG 23503 translation)
  | 'BC060'; // CurrencyNotFound

export type ErrorDetails =
  | { code: 'BC001' }
  | { code: 'BC002' }
  | { code: 'BC010'; walletId: string; requested: string; available: string }
  | { code: 'BC020'; gucTenant: string; paramTenant: string }
  | { code: 'BC021'; walletId: string; projectId: string }
  | { code: 'BC022'; walletCurrency: string; requested: string }
  | { code: 'BC030' }
  | { code: 'BC040' }
  | { code: 'BC050'; constraintName: string }
  | { code: 'BC060'; currencyCode: string; projectId: string };

export class WalletError extends Error {
  readonly code: BcCode;
  readonly details: ErrorDetails;

  constructor(details: ErrorDetails, message: string) {
    super(message);
    this.name = 'WalletError';
    this.code = details.code;
    this.details = details;
  }
}
