/** @module @bokchoy/inventory boundary. Per [[inventory/inventory-contract]] M-A item model. */

export {
  type InventoryConsumeByExternalIdParams,
  type InventoryConsumeByExternalIdResult,
  inventoryConsumeByExternalId,
} from './inventory-consume-by-external-id';
export {
  type InventoryGrantByExternalIdParams,
  type InventoryGrantByExternalIdResult,
  inventoryGrantByExternalId,
} from './inventory-grant-by-external-id';
export {
  type InventoryItemByExternalIdParams,
  type InventoryItemByExternalIdResult,
  type InventoryItemInstance,
  inventoryItemByExternalId,
} from './inventory-item-by-external-id';
export {
  type InventoryListByExternalIdParams,
  type InventoryListByExternalIdResult,
  type InventoryListRow,
  inventoryListByExternalId,
} from './inventory-list-by-external-id';
