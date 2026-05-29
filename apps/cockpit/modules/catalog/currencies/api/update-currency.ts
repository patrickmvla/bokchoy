import { catalogFetch } from '../../lib/catalog-api';
import type { UpdateCurrencyInput } from '../lib/currency-schema';
import type { Currency } from '../types';

export function updateCurrency(
  projectId: string,
  currencyId: string,
  input: UpdateCurrencyInput,
): Promise<Currency> {
  return catalogFetch<Currency>(
    `/v1/projects/${projectId}/currencies/${currencyId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}
