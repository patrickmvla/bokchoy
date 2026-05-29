import { CurrenciesList } from '@/modules/catalog/currencies/components/currencies-list';

export default async function CurrenciesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <CurrenciesList projectId={projectId} />;
}
