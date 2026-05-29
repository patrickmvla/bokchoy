import { catalogFetch } from '../../lib/catalog-api';
import type { Item } from '../types';

export function listItems(projectId: string): Promise<Item[]> {
  return catalogFetch<Item[]>(`/v1/projects/${projectId}/items`);
}
