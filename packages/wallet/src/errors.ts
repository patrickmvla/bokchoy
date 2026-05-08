// BCxxx error classification per [[wallet-mechanics]] Amendment Part 1 A5 +
// Part 3 A18, mapped from Postgres SQLSTATE raised by the M1 stored functions
// per [[wrapper-shape]].
//
// BC001/BC002 are HTTP-middleware-raised (slice 4.6); listed here so the
// HTTP layer's switch on `code` is exhaustive across the BC namespace.
// BC030/BC050/BC060 are reserved; BC050 is active via 23503 translation in
// sqlstate-to-error.ts (constraint `transactions_project_reason_code_fk`).
// BC060 has no active FK constraint that fires it today.

export type BcCode =
  | 'BC001' // IdempotencyKeyInUse        — middleware (slice 4.6)
  | 'BC002' // IdempotencyKeyMismatch     — middleware
  | 'BC010' // InsufficientFunds           — wallet_debit
  | 'BC020' // TenantMismatch              — all wallet wrappers
  | 'BC021' // WalletNotFound              — wallet_credit / wallet_debit
  | 'BC022' // CurrencyMismatch            — wallet_credit / wallet_debit
  | 'BC030' // PolicyViolation             — reserved
  | 'BC040' // ConfigurationError          — wallet_deidentify_player
  | 'BC050' // ReasonCodeNotRegistered     — translated from PG 23503
  | 'BC060'; // CurrencyNotFound           — reserved (translated from PG 23503)

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
  | { code: 'BC060'; constraintName: string };

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
