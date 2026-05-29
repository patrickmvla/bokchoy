import { catalogFetch } from '../../lib/catalog-api';

export function deleteOffer(projectId: string, offerId: string): Promise<void> {
  return catalogFetch<void>(`/v1/projects/${projectId}/offers/${offerId}`, {
    method: 'DELETE',
  });
}
