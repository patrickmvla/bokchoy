// M1 wallet-package boundary per [[wallet-mechanics]] Amendment Part 1 A1.
//
// Public API:
//   • Four wrappers around the M1 stored functions (wallet_credit, wallet_debit,
//     wallet_deidentify_player, bootstrap_project_reason_codes) per [[wrapper-shape]].
//   • WalletError class hierarchy mapped from BCxxx SQLSTATE per [[wrapper-shape]]
//     Fork 2 (X) — single class, code discriminant, per-code details discriminated
//     union.
//   • sqlstateToError pure function — translation lookup, exposed for testing
//     and for downstream callers that catch their own SQL errors (rare).
//
// Mutations of the protected tables (wallets / transactions / currencies /
// reason_codes / idempotency_keys / loot_rolls / iap_receipts) inside this
// package are the M1 path, not bypasses. scripts/check-direct-wallet-mutation.ts
// excludes packages/wallet/.
//
// OTel-span helper at the call boundary per [[wallet-mechanics]] Amendment
// Part 1 A3 layer 1 — DEFERRED. Wrapper bodies have a TODO(otel) marker;
// wiring lands when the SDK choice is pinned alongside the first apps/backend
// route that needs span correlation.

export {
  type BootstrapProjectReasonCodesParams,
  bootstrapProjectReasonCodes,
} from './bootstrap-project-reason-codes';
export { type BcCode, type ErrorDetails, WalletError } from './errors';
export { sqlstateToError } from './sqlstate-to-error';
export { type WalletCreditParams, walletCredit } from './wallet-credit';
export {
  type WalletCreditByExternalIdParams,
  type WalletCreditByExternalIdResult,
  walletCreditByExternalId,
} from './wallet-credit-by-external-id';
export { type WalletDebitParams, walletDebit } from './wallet-debit';
export {
  type WalletDebitByExternalIdParams,
  type WalletDebitByExternalIdResult,
  walletDebitByExternalId,
} from './wallet-debit-by-external-id';
export {
  type WalletDeidentifyPlayerParams,
  walletDeidentifyPlayer,
} from './wallet-deidentify-player';
