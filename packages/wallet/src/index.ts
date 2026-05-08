// M1 wallet-package boundary per [[wallet-mechanics]] Amendment Part 1 A1.
//
// This package is the legitimate location for TS wrappers around the M1
// stored functions (wallet_credit, wallet_debit, wallet_deidentify_player,
// bootstrap_project_reason_codes). The rest of the codebase calls these
// wrappers instead of writing direct SQL against the protected tables
// (wallets, transactions, currencies, reason_codes, idempotency_keys,
// loot_rolls, iap_receipts).
//
// scripts/check-direct-wallet-mutation.ts excludes this directory; mutations
// here are the M1 path, not bypasses of it.
//
// EXPLICITLY OUT OF THIS SLICE (each is its own follow-up):
//   • TS wrappers around wallet_credit / wallet_debit /
//     wallet_deidentify_player / bootstrap_project_reason_codes (parameter-
//     object ergonomics + OTel-span at the call boundary per Part 1 A3
//     layer 1).
//   • WalletError class hierarchy + sqlstateToError(code, message) lookup
//     mapping BCxxx → typed TS errors per Part 1 A5 + A6.

export {};
