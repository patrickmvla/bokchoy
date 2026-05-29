import { catalogFetch } from '../../lib/catalog-api';
import type { CreateOfferInput } from '../lib/offer-schema';
import type { Offer } from '../types';

export function createOffer(
  projectId: string,
  input: CreateOfferInput,
): Promise<Offer> {
  return catalogFetch<Offer>(`/v1/projects/${projectId}/offers`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
