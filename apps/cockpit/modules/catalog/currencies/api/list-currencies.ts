import { catalogFetch } from '../../lib/catalog-api';
import type { Currency } from '../types';

export function listCurrencies(projectId: string): Promise<Currency[]> {
  return catalogFetch<Currency[]>(`/v1/projects/${projectId}/currencies`);
}
