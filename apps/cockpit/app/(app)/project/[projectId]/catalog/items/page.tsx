import { ItemsList } from '@/modules/catalog/items/components/items-list';

export default async function ItemsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ItemsList projectId={projectId} />;
}
