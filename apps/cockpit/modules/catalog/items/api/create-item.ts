import { catalogFetch } from '../../lib/catalog-api';
import type { CreateItemInput } from '../lib/item-schema';
import type { Item } from '../types';

export function createItem(
  projectId: string,
  input: CreateItemInput,
): Promise<Item> {
  return catalogFetch<Item>(`/v1/projects/${projectId}/items`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
