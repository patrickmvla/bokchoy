import { catalogFetch } from '../../lib/catalog-api';
import type { Offer } from '../types';

export function listOffers(projectId: string): Promise<Offer[]> {
  return catalogFetch<Offer[]>(`/v1/projects/${projectId}/offers`);
}
