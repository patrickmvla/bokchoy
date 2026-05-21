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
  | 'BC060' // CurrencyNotFound
  | 'BC080' // UnknownItem (inventory)
  | 'BC081' // InventoryOverflow
  | 'BC082' // InsufficientInventory
  | 'BC090' // UnknownOffer (shop)
  | 'BC091' // OfferInactive
  | 'BC092' // InvalidPaymentCurrency
  | 'BC093'; // EmptyOffer (active offer with zero items)

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
  | { code: 'BC060'; currencyCode: string; projectId: string }
  | { code: 'BC080'; itemCode: string; projectId: string }
  | {
      code: 'BC081';
      currentCount: number;
      requestedAmount: number;
      maxCount: number;
      availableCapacity: number;
    }
  | {
      code: 'BC082';
      variant: 'insufficient_count';
      currentCount: number;
      requestedAmount: number;
    }
  | {
      code: 'BC082';
      variant: 'instance_not_owned';
      instanceId: string;
      playerExternalId: string;
      itemCode: string;
    }
  | { code: 'BC082'; variant: 'instance_id_required' }
  | { code: 'BC090'; offerCode: string; projectId: string }
  | { code: 'BC091'; offerCode: string; projectId: string }
  | { code: 'BC092'; variant: 'pay_with_required'; priceOptionCount: number }
  | { code: 'BC092'; variant: 'currency_not_accepted'; currencyCode: string; offerCode: string }
  | { code: 'BC093'; offerCode: string; projectId: string };

export class BcError extends Error {
  readonly code: BcCode;
  readonly details: ErrorDetails;

  constructor(details: ErrorDetails, message: string) {
    super(message);
    this.name = 'BcError';
    this.code = details.code;
    this.details = details;
  }
}
