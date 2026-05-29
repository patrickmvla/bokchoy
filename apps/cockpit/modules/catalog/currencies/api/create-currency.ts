import { catalogFetch } from '../../lib/catalog-api';
import type { CreateCurrencyInput } from '../lib/currency-schema';
import type { Currency } from '../types';

export function createCurrency(
  projectId: string,
  input: CreateCurrencyInput,
): Promise<Currency> {
  return catalogFetch<Currency>(`/v1/projects/${projectId}/currencies`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
