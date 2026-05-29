/** Mirrors the ItemAdmin wire shape from [[cockpit/admin-catalog-endpoints-contract]]. */
export interface Item {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  stackable: boolean;
  maxCount: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
