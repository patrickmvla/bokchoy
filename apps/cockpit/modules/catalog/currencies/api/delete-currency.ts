import { catalogFetch } from '../../lib/catalog-api';

export function deleteCurrency(
  projectId: string,
  currencyId: string,
): Promise<void> {
  return catalogFetch<void>(
    `/v1/projects/${projectId}/currencies/${currencyId}`,
    {
      method: 'DELETE',
    },
  );
}
