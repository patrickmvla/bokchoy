import { catalogFetch } from '../../lib/catalog-api';
import type { UpdateOfferInput } from '../lib/offer-schema';
import type { Offer } from '../types';

export function updateOffer(
  projectId: string,
  offerId: string,
  input: UpdateOfferInput,
): Promise<Offer> {
  return catalogFetch<Offer>(`/v1/projects/${projectId}/offers/${offerId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
