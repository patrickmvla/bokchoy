import { OffersList } from '@/modules/catalog/offers/components/offers-list';

export default async function OffersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <OffersList projectId={projectId} />;
}
