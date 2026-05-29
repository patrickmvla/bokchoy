/** Mirrors the OfferAdmin wire shape from [[cockpit/admin-catalog-endpoints-contract]]. */
export interface OfferPrice {
  id: string;
  currencyId: string;
  currencyCode: string;
  amount: string; // NUMERIC string
}

export interface OfferItem {
  id: string;
  itemId: string;
  itemCode: string;
  quantity: number;
}

export interface Offer {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  prices: OfferPrice[];
  items: OfferItem[];
}
