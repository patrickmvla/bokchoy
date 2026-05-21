/** shop namespace — atomic offer purchase + catalog reads. Per [[shop/shop-contract]] SDK surface. */

import type { HttpClient } from './http';

/** Parameters for shop.purchase. */
export interface PurchaseParams {
  /** Customer-controlled player identifier; URL-safe per backend regex `[A-Za-z0-9._-]{1,128}`. */
  player: string;
  /** Offer slug to buy (e.g. `'starter_pack'`). */
  offer: string;
  /** Currency code to pay with. Required only when the offer has more than one price; inferred otherwise. */
  payWith?: string;
  /** Optional Idempotency-Key; auto-generated if omitted. The load-bearing double-charge guard for purchases. */
  idempotencyKey?: string;
}

/** One granted item in a purchase result. `instanceIds` present for non-stackable items, absent for stackable. */
export interface PurchaseGrantedItem {
  itemCode: string;
  quantity: number;
  instanceIds?: ReadonlyArray<string>;
}

export interface PurchaseResult {
  purchaseId: string;
  offer: string;
  /** Server-authoritative amount charged, as a NUMERIC string (e.g. "100.0000") — matches wallet balances; preserves NUMERIC(20,4) precision. */
  paid: { currencyCode: string; amount: string };
  granted: PurchaseGrantedItem[];
}

/** One price in an offer's OR-set — the buyer pays exactly one of the listed currencies. */
export interface ShopOfferPrice {
  currencyCode: string;
  /** NUMERIC string (e.g. "100.0000") — matches wallet balances; preserves NUMERIC(20,4) precision. */
  amount: string;
}

/** One item an offer grants on purchase. */
export interface ShopOfferItem {
  itemCode: string;
  quantity: number;
}

export interface ShopOffer {
  code: string;
  displayName: string;
  description: string | null;
  active: boolean;
  prices: ShopOfferPrice[];
  items: ShopOfferItem[];
}

interface PurchaseWireBody {
  offer: string;
  payWith?: string;
}

export class ShopApi {
  constructor(private readonly http: HttpClient) {}

  /**
   * Atomically buy an offer for a player: debits the pay-with currency and grants every item in one transaction.
   * Raises UnknownOfferError (404), OfferInactiveError (422), InvalidPaymentCurrencyError (422),
   * InsufficientFundsError (422), or InventoryOverflowError (422) — partial fulfillment is impossible.
   */
  purchase(params: PurchaseParams): Promise<PurchaseResult> {
    const body: PurchaseWireBody = { offer: params.offer };
    if (params.payWith !== undefined) body.payWith = params.payWith;
    return this.http.post<PurchaseResult>({
      pathSegments: ['v1', 'players', params.player, 'purchases'],
      body,
      ...(params.idempotencyKey !== undefined ? { idempotencyKey: params.idempotencyKey } : {}),
    });
  }

  /** List the project's active offers with their prices and items. */
  async listOffers(): Promise<ShopOffer[]> {
    const result = await this.http.get<{ data: ShopOffer[] }>({
      pathSegments: ['v1', 'offers'],
    });
    return result.data;
  }

  /** Read a single offer by code. Raises UnknownOfferError (404) when no such offer exists. */
  getOffer(code: string): Promise<ShopOffer> {
    return this.http.get<ShopOffer>({
      pathSegments: ['v1', 'offers', code],
    });
  }
}
