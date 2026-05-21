/** @module @bokchoy/shop boundary. Per [[shop/shop-contract]] B1b — offer is the priced unit; purchase is atomic debit + N grants. */

export { type GetOfferParams, type GetOfferResult, getOffer } from './get-offer';
export { type ListOffersParams, type ListOffersResult, listOffers } from './list-offers';
export type {
  OfferItemRef,
  OfferPrice,
  OfferView,
} from './offer-view';
export {
  type PurchaseGrantedItem,
  type PurchaseOfferByExternalIdParams,
  type PurchaseOfferByExternalIdResult,
  purchaseOfferByExternalId,
} from './purchase-offer-by-external-id';
