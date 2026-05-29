/** Mirrors the CurrencyAdmin wire shape from [[cockpit/admin-catalog-endpoints-contract]]. */
export interface Currency {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  decimals: number;
  isPremium: boolean;
  isTradable: boolean;
  createdAt: string;
  updatedAt: string;
}
