import { catalogFetch } from '../../lib/catalog-api';

export function deleteItem(projectId: string, itemId: string): Promise<void> {
  return catalogFetch<void>(`/v1/projects/${projectId}/items/${itemId}`, {
    method: 'DELETE',
  });
}
