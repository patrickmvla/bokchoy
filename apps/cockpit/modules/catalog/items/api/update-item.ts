import { catalogFetch } from '../../lib/catalog-api';
import type { UpdateItemInput } from '../lib/item-schema';
import type { Item } from '../types';

export function updateItem(
  projectId: string,
  itemId: string,
  input: UpdateItemInput,
): Promise<Item> {
  return catalogFetch<Item>(`/v1/projects/${projectId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
