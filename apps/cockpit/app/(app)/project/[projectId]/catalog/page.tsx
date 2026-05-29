import { redirect } from 'next/navigation';

/** Catalog landing → currencies (the first catalog sub-section). */
export default async function CatalogPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/project/${projectId}/catalog/currencies`);
}
